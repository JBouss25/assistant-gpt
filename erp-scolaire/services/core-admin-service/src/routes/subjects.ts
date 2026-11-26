import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { successResponse } from '../utils/pagination.js'

const createSubjectSchema = z.object({
  nom:          z.string().min(2).max(100),
  code:         z.string().min(2).max(20).toUpperCase(),
  coefficient:  z.number().positive().max(10).default(1),
  niveau_code:  z.string().optional(),
  type:         z.enum(['OBLIGATOIRE', 'OPTIONNEL']).default('OBLIGATOIRE'),
})

const updateSubjectSchema = createSubjectSchema.partial()

export async function subjectRoutes(app: FastifyInstance) {
  // GET /subjects — list with optional filter
  app.get<{ Querystring: { niveau_code?: string; type?: string; page?: string; limit?: string } }>(
    '/subjects',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { niveau_code, type, page = '1', limit = '50' } = req.query
      const offset = (parseInt(page) - 1) * parseInt(limit)

      const rows = await app.db`
        SELECT s.*, COUNT(*) OVER() AS total_count
        FROM matieres s
        WHERE s.actif = true
        ${niveau_code ? app.db`AND s.niveau_code = ${niveau_code}` : app.db``}
        ${type ? app.db`AND s.type = ${type}` : app.db``}
        ORDER BY s.nom
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `

      const total = rows[0]?.total_count ?? 0
      return reply.send(successResponse(rows, { page: parseInt(page), limit: parseInt(limit), total: parseInt(total) }))
    },
  )

  // POST /subjects — create
  app.post<{ Body: unknown }>(
    '/subjects',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const body = createSubjectSchema.parse(req.body)
      const [subject] = await app.db`
        INSERT INTO matieres ${app.db({ ...body, actif: true, created_at: new Date() })}
        RETURNING *
      `
      return reply.status(201).send(successResponse(subject))
    },
  )

  // GET /subjects/:id — detail
  app.get<{ Params: { id: string } }>(
    '/subjects/:id',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const [subject] = await app.db`
        SELECT * FROM matieres WHERE id = ${req.params.id} AND actif = true
      `
      if (!subject) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Matière introuvable' } })
      return reply.send(successResponse(subject))
    },
  )

  // PUT /subjects/:id — update
  app.put<{ Params: { id: string }; Body: unknown }>(
    '/subjects/:id',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const body = updateSubjectSchema.parse(req.body)
      const [subject] = await app.db`
        UPDATE matieres SET ${app.db({ ...body, updated_at: new Date() })}
        WHERE id = ${req.params.id} AND actif = true
        RETURNING *
      `
      if (!subject) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Matière introuvable' } })
      return reply.send(successResponse(subject))
    },
  )

  // DELETE /subjects/:id — soft delete
  app.delete<{ Params: { id: string } }>(
    '/subjects/:id',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      await app.db`
        UPDATE matieres SET actif = false, updated_at = NOW()
        WHERE id = ${req.params.id}
      `
      return reply.status(204).send()
    },
  )
}
