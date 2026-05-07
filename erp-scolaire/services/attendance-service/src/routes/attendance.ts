import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const recordAbsenceSchema = z.object({
  eleve_id:           z.string().uuid(),
  emploi_du_temps_id: z.string().uuid(),
  classe_id:          z.string().uuid(),
  matiere_id:         z.string().uuid(),
  enseignant_id:      z.string().uuid(),
  date:               z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type:               z.enum(['ABSENCE', 'RETARD', 'EXCLUSION_COURS']).default('ABSENCE'),
  minutes_retard:     z.number().int().positive().optional(),
  methode_pointage:   z.enum(['MANUEL', 'QR_CODE', 'BIOMETRIQUE', 'IMPORTATION']).default('MANUEL'),
})

const bulkAbsenceSchema = z.object({
  emploi_du_temps_id: z.string().uuid(),
  classe_id:          z.string().uuid(),
  matiere_id:         z.string().uuid(),
  enseignant_id:      z.string().uuid(),
  date:               z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  absents:            z.array(z.object({
    eleve_id:       z.string().uuid(),
    type:           z.enum(['ABSENCE', 'RETARD', 'EXCLUSION_COURS']).default('ABSENCE'),
    minutes_retard: z.number().int().positive().optional(),
  })),
})

const justifySchema = z.object({
  motif:        z.string().min(5).max(500),
  document_url: z.string().url().optional(),
})

export async function attendanceRoutes(app: FastifyInstance) {
  // ── POST /attendance ──────────────────────────────────
  // Saisie manuelle d'une absence unique
  app.post<{ Body: unknown }>(
    '/attendance',
    { preHandler: app.requireRole('TEACHER', 'SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const body = recordAbsenceSchema.parse(req.body)
      const schoolId = req.headers['x-school-id'] as string

      const [absence] = await app.db`
        INSERT INTO absences
          (school_id, eleve_id, emploi_du_temps_id, classe_id, matiere_id, enseignant_id,
           date, type, minutes_retard, saisi_par, methode_pointage, notif_parent_statut)
        VALUES (
          ${schoolId}, ${body.eleve_id}, ${body.emploi_du_temps_id}, ${body.classe_id},
          ${body.matiere_id}, ${body.enseignant_id}, ${body.date}, ${body.type},
          ${body.minutes_retard ?? null}, ${req.jwtPayload.sub}, ${body.methode_pointage},
          'EN_ATTENTE'
        )
        ON CONFLICT DO NOTHING
        RETURNING id, eleve_id, type, date, created_at
      `

      if (absence) {
        // Émettre l'événement Kafka → notification-service enverra WhatsApp
        await app.kafkaProducer.send({
          topic: 'attendance.absence.enregistree',
          messages: [{
            key: body.eleve_id,
            value: JSON.stringify({
              absence_id:         absence.id,
              school_id:          schoolId,
              eleve_id:           body.eleve_id,
              type:               body.type,
              date:               body.date,
              emploi_du_temps_id: body.emploi_du_temps_id,
              minutes_retard:     body.minutes_retard ?? null,
            }),
          }],
        })
      }

      return reply.status(201).send({ success: true, data: absence ?? { message: 'Déjà enregistré' }, meta: null, error: null })
    },
  )

  // ── POST /attendance/bulk ─────────────────────────────
  // Appel en masse : l'enseignant saisit tous les absents d'un cours
  app.post<{ Body: unknown }>(
    '/attendance/bulk',
    { preHandler: app.requireRole('TEACHER', 'SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const body = bulkAbsenceSchema.parse(req.body)
      const schoolId = req.headers['x-school-id'] as string

      if (body.absents.length === 0) {
        return reply.send({ success: true, data: { inserted: 0 }, meta: null, error: null })
      }

      const rows = body.absents.map((a) => ({
        school_id:          schoolId,
        eleve_id:           a.eleve_id,
        emploi_du_temps_id: body.emploi_du_temps_id,
        classe_id:          body.classe_id,
        matiere_id:         body.matiere_id,
        enseignant_id:      body.enseignant_id,
        date:               body.date,
        type:               a.type,
        minutes_retard:     a.minutes_retard ?? null,
        saisi_par:          req.jwtPayload.sub,
        methode_pointage:   'MANUEL',
        notif_parent_statut: 'EN_ATTENTE',
      }))

      const inserted = await app.db`
        INSERT INTO absences ${app.db(rows)}
        ON CONFLICT DO NOTHING
        RETURNING id, eleve_id, type
      `

      // Batch Kafka events
      if (inserted.length > 0) {
        await app.kafkaProducer.send({
          topic: 'attendance.absences.bulk',
          messages: [{
            key: body.classe_id,
            value: JSON.stringify({
              school_id:          schoolId,
              emploi_du_temps_id: body.emploi_du_temps_id,
              date:               body.date,
              absences:           inserted.map((r) => ({ id: r.id, eleve_id: r.eleve_id, type: r.type })),
            }),
          }],
        })
      }

      return reply.status(201).send({ success: true, data: { inserted: inserted.length }, meta: null, error: null })
    },
  )

  // ── GET /attendance/student/:eleveId ──────────────────
  app.get<{ Params: { eleveId: string }; Querystring: Record<string, string> }>(
    '/attendance/student/:eleveId',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { debut, fin } = z.object({
        debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        fin:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }).parse(req.query)

      const cacheKey = `attendance:student:${req.params.eleveId}:${debut}:${fin}`
      const cached = await app.redis.get(cacheKey)
      if (cached) return reply.send(JSON.parse(cached))

      const rows = await app.db`
        SELECT id, emploi_du_temps_id, classe_id, matiere_id, date,
               type, minutes_retard, justifie, motif, methode_pointage, created_at
        FROM absences
        WHERE eleve_id = ${req.params.eleveId}
          AND date BETWEEN ${debut} AND ${fin}
        ORDER BY date DESC, created_at DESC
      `

      // Stats agrégées
      const [stats] = await app.db`
        SELECT
          COUNT(*) FILTER (WHERE type = 'ABSENCE' AND NOT justifie)  AS absences_injustifiees,
          COUNT(*) FILTER (WHERE type = 'ABSENCE' AND justifie)      AS absences_justifiees,
          COUNT(*) FILTER (WHERE type = 'RETARD')                    AS retards,
          COALESCE(SUM(minutes_retard) FILTER (WHERE type = 'RETARD'), 0) AS total_minutes_retard
        FROM absences
        WHERE eleve_id = ${req.params.eleveId}
          AND date BETWEEN ${debut} AND ${fin}
      `

      const result = { success: true, data: { absences: rows, stats }, meta: null, error: null }
      await app.redis.setEx(cacheKey, 300, JSON.stringify(result))
      return reply.send(result)
    },
  )

  // ── GET /attendance/class/:classeId/today ─────────────
  app.get<{ Params: { classeId: string } }>(
    '/attendance/class/:classeId/today',
    { preHandler: app.requireRole('TEACHER', 'SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const today = new Date().toISOString().split('T')[0]

      const rows = await app.db`
        SELECT a.id, a.eleve_id, a.type, a.minutes_retard, a.justifie,
               a.methode_pointage, a.emploi_du_temps_id, a.created_at
        FROM absences a
        WHERE a.classe_id = ${req.params.classeId}
          AND a.date = ${today}
        ORDER BY a.created_at DESC
      `
      return reply.send({ success: true, data: rows, meta: null, error: null })
    },
  )

  // ── PATCH /attendance/:absenceId/justify ──────────────
  app.patch<{ Params: { absenceId: string }; Body: unknown }>(
    '/attendance/:absenceId/justify',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER') },
    async (req, reply) => {
      const { motif, document_url } = justifySchema.parse(req.body)

      const [updated] = await app.db`
        UPDATE absences
        SET justifie = true, motif = ${motif}, document_url = ${document_url ?? null}
        WHERE id = ${req.params.absenceId}
        RETURNING id, eleve_id, justifie, date
      `

      if (!updated) return reply.status(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Absence introuvable', details: null } })

      // Invalider le cache
      await app.redis.del(`attendance:student:${updated.eleve_id}:*`)

      // Émettre un événement pour mettre à jour le score de décrochage
      await app.kafkaProducer.send({
        topic: 'attendance.absence.justifiee',
        messages: [{ key: updated.eleve_id, value: JSON.stringify({ absence_id: req.params.absenceId, eleve_id: updated.eleve_id }) }],
      })

      return reply.send({ success: true, data: updated, meta: null, error: null })
    },
  )

  // ── GET /attendance/stats/school/:schoolId ────────────
  // Dashboard assiduité pour la direction
  app.get<{ Params: { schoolId: string }; Querystring: Record<string, string> }>(
    '/attendance/stats/school/:schoolId',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const { annee_scolaire_id } = z.object({ annee_scolaire_id: z.string().uuid() }).parse(req.query)

      const stats = await app.db`
        SELECT
          a.classe_id,
          COUNT(*) FILTER (WHERE a.type = 'ABSENCE' AND NOT a.justifie)   AS total_absences_injustifiees,
          COUNT(*) FILTER (WHERE a.type = 'RETARD')                       AS total_retards,
          COUNT(DISTINCT a.eleve_id) FILTER (
            WHERE a.type = 'ABSENCE' AND NOT a.justifie
          )                                                                AS nb_eleves_absents_recurrents,
          DATE_TRUNC('week', a.date)                                       AS semaine
        FROM absences a
        WHERE a.school_id = ${req.params.schoolId}
          AND a.date >= (
            SELECT date_debut FROM annees_scolaires WHERE id = ${annee_scolaire_id}
          )
        GROUP BY a.classe_id, DATE_TRUNC('week', a.date)
        ORDER BY semaine DESC, total_absences_injustifiees DESC
      `

      return reply.send({ success: true, data: stats, meta: null, error: null })
    },
  )
}
