import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { successResponse } from '../utils/pagination.js'
import { writeAuditLog } from '../utils/audit.js'

const createEnrollmentSchema = z.object({
  eleve_id:          z.string().uuid(),
  classe_id:         z.string().uuid(),
  annee_scolaire_id: z.string().uuid(),
  date_inscription:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commentaire:       z.string().max(500).optional(),
  documents_fournis: z.record(z.boolean()).default({}),
})

export async function enrollmentRoutes(app: FastifyInstance) {
  // POST /enrollments
  app.post<{ Body: unknown }>(
    '/enrollments',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const body = createEnrollmentSchema.parse(req.body)

      // Vérifier la capacité de la classe
      const [{ nb_inscrits, effectif_max }] = await app.db<[{ nb_inscrits: string; effectif_max: number }]>`
        SELECT COUNT(i.id) AS nb_inscrits, c.effectif_max
        FROM classes c
        LEFT JOIN inscriptions i ON i.classe_id = c.id AND i.statut = 'CONFIRMEE'
        WHERE c.id = ${body.classe_id}
        GROUP BY c.effectif_max
      `

      if (Number(nb_inscrits) >= effectif_max) {
        return reply.status(422).send({
          success: false, data: null,
          error: {
            code: 'CLASS_FULL',
            message: `La classe est complète (${nb_inscrits}/${effectif_max} élèves)`,
            details: null,
          },
        })
      }

      const [enrollment] = await app.db`
        INSERT INTO inscriptions ${app.db(body)}
        ON CONFLICT (eleve_id, annee_scolaire_id)
        DO UPDATE SET
          classe_id = EXCLUDED.classe_id,
          statut = 'CONFIRMEE',
          updated_at = NOW()
        RETURNING *
      `

      await app.kafkaProducer.send({
        topic: 'core-admin.inscription.creee',
        messages: [{
          key: enrollment.eleve_id,
          value: JSON.stringify({
            eleve_id: enrollment.eleve_id,
            classe_id: enrollment.classe_id,
            annee_scolaire_id: enrollment.annee_scolaire_id,
          }),
        }],
      })

      await writeAuditLog(app, req, {
        action: 'INSCRIPTION_CREEE',
        entiteType: 'inscriptions',
        entiteId: enrollment.id,
        valeurApres: body,
      })

      return reply.status(201).send(successResponse(enrollment))
    },
  )

  // PATCH /enrollments/:enrollmentId/cancel
  app.patch<{ Params: { enrollmentId: string }; Body: unknown }>(
    '/enrollments/:enrollmentId/cancel',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const { motif } = z.object({ motif: z.string().min(5).max(500) }).parse(req.body)

      const [updated] = await app.db`
        UPDATE inscriptions
        SET statut = 'ANNULEE', commentaire = ${motif}, updated_at = NOW()
        WHERE id = ${req.params.enrollmentId} AND statut != 'ANNULEE'
        RETURNING id, eleve_id, classe_id, statut
      `

      if (!updated) {
        return reply.status(404).send({
          success: false, data: null,
          error: { code: 'NOT_FOUND', message: 'Inscription introuvable ou déjà annulée', details: null },
        })
      }

      await writeAuditLog(app, req, {
        action: 'INSCRIPTION_ANNULEE',
        entiteType: 'inscriptions',
        entiteId: req.params.enrollmentId,
        valeurApres: { statut: 'ANNULEE', motif },
      })

      return reply.send(successResponse(updated))
    },
  )
}
