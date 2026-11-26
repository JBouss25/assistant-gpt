import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { successResponse } from '../utils/pagination.js'
import { calculerMoyenneMatiere } from '../services/grades-calculator.js'

const createDevoirSchema = z.object({
  classe_id:      z.string().uuid(),
  matiere_id:     z.string().uuid(),
  periode_id:     z.string().uuid(),
  libelle:        z.string().min(3).max(200),
  type:           z.enum(['DEVOIR_SURVEILLE','DEVOIR_MAISON','INTERROGATION','EXAMEN','PROJET','ORAL']),
  date_evaluation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bareme:         z.number().positive().default(20),
  coefficient:    z.number().positive().default(1),
})

const bulkNotesSchema = z.object({
  devoir_id: z.string().uuid(),
  notes: z.array(z.object({
    eleve_id: z.string().uuid(),
    note:     z.number().min(0).nullable(),
    absent:   z.boolean().default(false),
    dispense: z.boolean().default(false),
    mention:  z.string().max(200).optional(),
  })).min(1),
})

export async function gradesRoutes(app: FastifyInstance) {
  // ── GET /grades/classes/:classeId/devoirs ─────────────
  app.get<{ Params: { classeId: string }; Querystring: Record<string, string> }>(
    '/grades/classes/:classeId/devoirs',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { periode_id, matiere_id } = z.object({
        periode_id: z.string().uuid().optional(),
        matiere_id: z.string().uuid().optional(),
      }).parse(req.query)

      const rows = await app.db`
        SELECT d.*, COUNT(n.id) AS nb_notes_saisies
        FROM devoirs d
        LEFT JOIN notes n ON n.devoir_id = d.id
        WHERE d.classe_id = ${req.params.classeId}
          ${periode_id ? app.db`AND d.periode_id = ${periode_id}` : app.db``}
          ${matiere_id ? app.db`AND d.matiere_id = ${matiere_id}` : app.db``}
        GROUP BY d.id
        ORDER BY d.date_evaluation DESC
      `
      return reply.send(successResponse(rows))
    },
  )

  // ── POST /grades/devoirs ──────────────────────────────
  app.post<{ Body: unknown }>(
    '/grades/devoirs',
    { preHandler: app.requireRole('TEACHER', 'SCHOOL_ADMIN') },
    async (req, reply) => {
      const body = createDevoirSchema.parse(req.body)
      const schoolId = req.headers['x-school-id'] as string

      const [devoir] = await app.db`
        INSERT INTO devoirs ${app.db({ school_id: schoolId, enseignant_id: req.jwtPayload.sub, ...body })}
        RETURNING id, libelle, type, date_evaluation, bareme, coefficient
      `
      return reply.status(201).send(successResponse(devoir))
    },
  )

  // ── POST /grades/notes/bulk ───────────────────────────
  // Saisie en masse (toute la classe d'un coup)
  app.post<{ Body: unknown }>(
    '/grades/notes/bulk',
    { preHandler: app.requireRole('TEACHER', 'SCHOOL_ADMIN') },
    async (req, reply) => {
      const body = bulkNotesSchema.parse(req.body)

      // Vérifier que le devoir existe et appartient à l'enseignant
      const [devoir] = await app.db`
        SELECT id, bareme, coefficient FROM devoirs
        WHERE id = ${body.devoir_id}
          AND (enseignant_id = ${req.jwtPayload.sub}
            OR ${req.jwtPayload.realm_access?.roles?.includes('SCHOOL_ADMIN') ?? false})
      `
      if (!devoir) return reply.status(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Devoir introuvable ou accès refusé', details: null } })

      // Valider que les notes ne dépassent pas le barème
      const invalid = body.notes.filter((n) => n.note !== null && n.note > Number(devoir.bareme))
      if (invalid.length > 0) {
        return reply.status(400).send({
          success: false, data: null,
          error: { code: 'INVALID_NOTE', message: `${invalid.length} note(s) dépassent le barème de ${devoir.bareme}`, details: invalid.map((n) => n.eleve_id) },
        })
      }

      const rows = body.notes.map((n) => ({
        devoir_id:  body.devoir_id,
        eleve_id:   n.eleve_id,
        note:       n.absent || n.dispense ? null : n.note,
        absent:     n.absent,
        dispense:   n.dispense,
        mention:    n.mention ?? null,
        saisie_par: req.jwtPayload.sub,
      }))

      await app.db`
        INSERT INTO notes ${app.db(rows)}
        ON CONFLICT (devoir_id, eleve_id) DO UPDATE SET
          note        = EXCLUDED.note,
          absent      = EXCLUDED.absent,
          dispense    = EXCLUDED.dispense,
          mention     = EXCLUDED.mention,
          saisie_par  = EXCLUDED.saisie_par,
          updated_at  = NOW()
      `

      // Marquer le devoir comme renseigné
      await app.db`
        UPDATE devoirs SET est_renseigne = true, updated_at = NOW() WHERE id = ${body.devoir_id}
      `

      // Déclencher le recalcul des moyennes en async via Kafka
      await app.kafkaProducer.send({
        topic: 'gradebook.notes.saisies',
        messages: [{
          key: body.devoir_id,
          value: JSON.stringify({ devoir_id: body.devoir_id, nb_notes: body.notes.length }),
        }],
      })

      return reply.send(successResponse({ inserted: body.notes.length }))
    },
  )

  // ── GET /grades/students/:eleveId/summary ─────────────
  // Résumé notes d'un élève sur une période
  app.get<{ Params: { eleveId: string }; Querystring: Record<string, string> }>(
    '/grades/students/:eleveId/summary',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { periode_id } = z.object({ periode_id: z.string().uuid() }).parse(req.query)

      const cacheKey = `grades:student:${req.params.eleveId}:${periode_id}`
      const cached = await app.redis.get(cacheKey)
      if (cached) return reply.send(JSON.parse(cached))

      // Charger toutes les notes avec les infos du devoir
      const notesRaw = await app.db`
        SELECT
          n.note, n.absent, n.dispense, n.mention,
          d.matiere_id, d.libelle AS devoir_libelle, d.type, d.bareme, d.coefficient, d.date_evaluation
        FROM notes n
        JOIN devoirs d ON d.id = n.devoir_id
        WHERE n.eleve_id = ${req.params.eleveId}
          AND d.periode_id = ${periode_id}
        ORDER BY d.matiere_id, d.date_evaluation
      `

      // Grouper par matière et calculer la moyenne
      const byMatiere = new Map<string, typeof notesRaw>()
      for (const n of notesRaw) {
        if (!byMatiere.has(n.matiere_id)) byMatiere.set(n.matiere_id, [])
        byMatiere.get(n.matiere_id)!.push(n)
      }

      const summary = Array.from(byMatiere.entries()).map(([matiereId, notes]) => {
        const moyenne = calculerMoyenneMatiere(notes.map((n) => ({
          noteId: '', note: n.note, absent: n.absent, dispense: n.dispense,
          coefficient: n.coefficient, bareme: n.bareme,
        })))
        return { matiere_id: matiereId, moyenne, nb_devoirs: notes.length, notes }
      })

      const result = successResponse(summary)
      await app.redis.setEx(cacheKey, 300, JSON.stringify(result))
      return reply.send(result)
    },
  )
}
