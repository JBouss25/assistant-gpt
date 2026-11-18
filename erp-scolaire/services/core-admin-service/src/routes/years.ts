import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { successResponse } from '../utils/pagination.js'

const createYearSchema = z.object({
  nom:         z.string().regex(/^\d{4}-\d{4}$/, 'Format attendu: 2024-2025'),
  date_debut:  z.string().datetime(),
  date_fin:    z.string().datetime(),
})

export async function yearRoutes(app: FastifyInstance) {
  // GET /years — list all
  app.get(
    '/years',
    { preHandler: app.authenticate },
    async (_req, reply) => {
      const rows = await app.db`
        SELECT * FROM annees_scolaires ORDER BY date_debut DESC
      `
      return reply.send(successResponse(rows))
    },
  )

  // GET /years/current — active year
  app.get(
    '/years/current',
    { preHandler: app.authenticate },
    async (_req, reply) => {
      const [year] = await app.db`
        SELECT * FROM annees_scolaires WHERE actif = true LIMIT 1
      `
      if (!year) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Aucune année scolaire active' } })
      return reply.send(successResponse(year))
    },
  )

  // POST /years — create
  app.post<{ Body: unknown }>(
    '/years',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const body = createYearSchema.parse(req.body)
      const [year] = await app.db`
        INSERT INTO annees_scolaires ${app.db({ ...body, actif: false, created_at: new Date() })}
        RETURNING *
      `
      return reply.status(201).send(successResponse(year))
    },
  )

  // PUT /years/:id — update dates/name
  app.put<{ Params: { id: string }; Body: unknown }>(
    '/years/:id',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const body = createYearSchema.partial().parse(req.body)
      const [year] = await app.db`
        UPDATE annees_scolaires SET ${app.db({ ...body, updated_at: new Date() })}
        WHERE id = ${req.params.id}
        RETURNING *
      `
      if (!year) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Année scolaire introuvable' } })
      return reply.send(successResponse(year))
    },
  )

  // PUT /years/:id/activate — set as current (deactivates others)
  app.put<{ Params: { id: string } }>(
    '/years/:id/activate',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      await app.db`BEGIN`
      try {
        await app.db`UPDATE annees_scolaires SET actif = false, updated_at = NOW()`
        const [year] = await app.db`
          UPDATE annees_scolaires SET actif = true, updated_at = NOW()
          WHERE id = ${req.params.id}
          RETURNING *
        `
        if (!year) {
          await app.db`ROLLBACK`
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Année scolaire introuvable' } })
        }
        await app.db`COMMIT`
        return reply.send(successResponse(year))
      } catch (err) {
        await app.db`ROLLBACK`
        throw err
      }
    },
  )
}
