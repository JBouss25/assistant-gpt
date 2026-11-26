import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { generateTimetable, checkConflicts } from '../services/scheduler.js'
import type { MatiereClasse, Creneau, Salle } from '../services/scheduler.js'

const generateSchema = z.object({
  annee_scolaire_id: z.string().uuid(),
  ecrase_existant:   z.boolean().default(false),
})

const addSessionSchema = z.object({
  classe_id:          z.string().uuid(),
  matiere_id:         z.string().uuid(),
  enseignant_id:      z.string().uuid(),
  salle_id:           z.string().uuid(),
  creneau_id:         z.string().uuid(),
  date_debut_validite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_fin_validite:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function timetableRoutes(app: FastifyInstance) {
  // ── GET /schools/:schoolId/timetable ──────────────────
  // Retourne l'emploi du temps complet (par classe ou enseignant)
  app.get<{ Params: { schoolId: string }; Querystring: Record<string, string> }>(
    '/schools/:schoolId/timetable',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { annee_scolaire_id, classe_id, enseignant_id } = z.object({
        annee_scolaire_id: z.string().uuid(),
        classe_id:         z.string().uuid().optional(),
        enseignant_id:     z.string().uuid().optional(),
      }).parse(req.query)

      const cacheKey = `timetable:${req.params.schoolId}:${annee_scolaire_id}:${classe_id ?? 'all'}:${enseignant_id ?? 'all'}`
      const cached = await app.redis.get(cacheKey)
      if (cached) return reply.send(JSON.parse(cached))

      const rows = await app.db`
        SELECT
          e.id, e.classe_id, e.matiere_id, e.enseignant_id, e.salle_id, e.creneau_id,
          e.date_debut_validite, e.date_fin_validite, e.est_remplacement,
          c.jour, c.heure_debut, c.heure_fin, c.ordre,
          s.nom AS salle_nom, s.type AS salle_type
        FROM emplois_du_temps e
        JOIN creneaux c ON c.id = e.creneau_id
        JOIN salles s   ON s.id = e.salle_id
        WHERE e.school_id = ${req.params.schoolId}
          AND e.annee_scolaire_id = ${annee_scolaire_id}
          ${classe_id    ? app.db`AND e.classe_id    = ${classe_id}`    : app.db``}
          ${enseignant_id ? app.db`AND e.enseignant_id = ${enseignant_id}` : app.db``}
        ORDER BY c.jour, c.ordre
      `

      const result = { success: true, data: rows, meta: null, error: null }
      await app.redis.setEx(cacheKey, 86400, JSON.stringify(result)) // TTL 24h
      return reply.send(result)
    },
  )

  // ── POST /schools/:schoolId/timetable/generate ────────
  // Lance l'algorithme de génération asynchrone
  app.post<{ Params: { schoolId: string }; Body: unknown }>(
    '/schools/:schoolId/timetable/generate',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const { annee_scolaire_id, ecrase_existant } = generateSchema.parse(req.body)
      const schoolId = req.params.schoolId
      const userId = req.jwtPayload.sub

      // Créer le job de génération
      const [job] = await app.db`
        INSERT INTO generation_jobs (school_id, annee_scolaire_id, declanche_par, config)
        VALUES (${schoolId}, ${annee_scolaire_id}, ${userId}, ${JSON.stringify({ ecrase_existant })})
        RETURNING id
      `

      // Lancer en asynchrone via Kafka (le worker consomme et exécute l'algo)
      await app.kafkaProducer.send({
        topic: 'timetable.generation.demandee',
        messages: [{
          key: job.id,
          value: JSON.stringify({ job_id: job.id, school_id: schoolId, annee_scolaire_id, ecrase_existant }),
        }],
      })

      return reply.status(202).send({
        success: true,
        data: { job_id: job.id, statut: 'EN_ATTENTE' },
        meta: null,
        error: null,
      })
    },
  )

  // ── GET /schools/:schoolId/timetable/jobs/:jobId ──────
  // Polling du statut de génération
  app.get<{ Params: { schoolId: string; jobId: string } }>(
    '/schools/:schoolId/timetable/jobs/:jobId',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const [job] = await app.db`
        SELECT * FROM generation_jobs
        WHERE id = ${req.params.jobId} AND school_id = ${req.params.schoolId}
      `
      if (!job) return reply.status(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Job introuvable', details: null } })
      return reply.send({ success: true, data: job, meta: null, error: null })
    },
  )

  // ── POST /schools/:schoolId/timetable/sessions ────────
  // Ajouter manuellement une session (avec vérification de conflit)
  app.post<{ Params: { schoolId: string }; Body: unknown }>(
    '/schools/:schoolId/timetable/sessions',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const body = addSessionSchema.parse(req.body)
      const schoolId = req.params.schoolId

      // Charger les sessions existantes sur ce créneau pour vérifier les conflits
      const existing = await app.db`
        SELECT classe_id, enseignant_id, salle_id, creneau_id
        FROM emplois_du_temps
        WHERE school_id = ${schoolId}
          AND creneau_id = ${body.creneau_id}
          AND date_debut_validite = ${body.date_debut_validite}
      `

      const conflicts = checkConflicts(
        { classeId: body.classe_id, enseignantId: body.enseignant_id, salleId: body.salle_id, creneauId: body.creneau_id, matiereId: body.matiere_id },
        existing.map((r) => ({ matiereClasseId: '', classeId: r.classe_id, matiereId: r.matiere_id ?? '', enseignantId: r.enseignant_id, salleId: r.salle_id, creneauId: r.creneau_id })),
      )

      if (conflicts.length > 0) {
        return reply.status(409).send({
          success: false, data: null,
          error: { code: 'SCHEDULE_CONFLICT', message: 'Conflit détecté', details: conflicts },
        })
      }

      const [session] = await app.db`
        INSERT INTO emplois_du_temps
          (school_id, annee_scolaire_id, classe_id, matiere_id, enseignant_id, salle_id, creneau_id, date_debut_validite, date_fin_validite)
        VALUES (
          ${schoolId},
          (SELECT annee_scolaire_id FROM matieres_classes WHERE classe_id = ${body.classe_id} LIMIT 1),
          ${body.classe_id}, ${body.matiere_id}, ${body.enseignant_id},
          ${body.salle_id}, ${body.creneau_id}, ${body.date_debut_validite},
          ${body.date_fin_validite ?? null}
        )
        RETURNING id, classe_id, creneau_id, created_at
      `

      // Invalider le cache EDT
      const keys = await app.redis.keys(`timetable:${schoolId}:*`)
      if (keys.length > 0) await app.redis.del(keys)

      return reply.status(201).send({ success: true, data: session, meta: null, error: null })
    },
  )

  // ── DELETE /schools/:schoolId/timetable/sessions/:id ─
  app.delete<{ Params: { schoolId: string; sessionId: string } }>(
    '/schools/:schoolId/timetable/sessions/:sessionId',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const [deleted] = await app.db`
        DELETE FROM emplois_du_temps
        WHERE id = ${req.params.sessionId} AND school_id = ${req.params.schoolId}
        RETURNING id
      `
      if (!deleted) return reply.status(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Session introuvable', details: null } })

      const keys = await app.redis.keys(`timetable:${req.params.schoolId}:*`)
      if (keys.length > 0) await app.redis.del(keys)

      return reply.status(204).send()
    },
  )
}
