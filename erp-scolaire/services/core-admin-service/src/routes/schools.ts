import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { paginationSchema, buildMeta, buildOffset, successResponse } from '../utils/pagination.js'
import { writeAuditLog } from '../utils/audit.js'

const createSchoolSchema = z.object({
  nom:               z.string().min(3).max(200),
  code_etablissement: z.string().min(3).max(20),
  type:              z.enum(['PRIMAIRE', 'COLLEGE', 'LYCEE', 'MULTI_CYCLE']),
  adresse:           z.string().min(5),
  ville:             z.string().min(2).max(100),
  telephone:         z.string().max(20).optional(),
  email_direction:   z.string().email(),
  timezone:          z.string().default('Africa/Casablanca'),
  config_pedagogique: z.record(z.unknown()).default({}),
})

const createAcademicYearSchema = z.object({
  libelle:    z.string().regex(/^\d{4}-\d{4}$/),
  date_debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_fin:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  calendrier_config: z.record(z.unknown()).default({}),
})

export async function schoolRoutes(app: FastifyInstance) {
  // GET /schools
  app.get<{ Querystring: Record<string, string> }>(
    '/schools',
    { preHandler: app.requireRole('SUPER_ADMIN') },
    async (req, reply) => {
      const query = paginationSchema.extend({ ville: z.string().optional() }).parse(req.query)
      const { limit, offset } = buildOffset(query)

      const where = query.ville
        ? app.db`WHERE ville ILIKE ${'%' + query.ville + '%'} AND actif = true`
        : app.db`WHERE actif = true`

      const [{ count }] = await app.db<[{ count: string }]>`SELECT COUNT(*) as count FROM schools ${where}`
      const rows = await app.db`SELECT id, nom, code_etablissement, type, ville, actif, created_at FROM schools ${where} ORDER BY nom LIMIT ${limit} OFFSET ${offset}`

      return reply.send(successResponse(rows, buildMeta(Number(count), query)))
    },
  )

  // GET /schools/:schoolId
  app.get<{ Params: { schoolId: string } }>(
    '/schools/:schoolId',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const [school] = await app.db`
        SELECT s.*, COUNT(DISTINCT e.id) AS nb_eleves, COUNT(DISTINCT en.id) AS nb_enseignants
        FROM schools s
        LEFT JOIN eleves e ON e.school_id = s.id AND e.statut = 'ACTIF'
        LEFT JOIN enseignants en ON en.school_id = s.id AND en.statut = 'ACTIF'
        WHERE s.id = ${req.params.schoolId}
        GROUP BY s.id
      `
      if (!school) return reply.status(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Établissement introuvable', details: null } })
      return reply.send(successResponse(school))
    },
  )

  // POST /schools
  app.post<{ Body: unknown }>(
    '/schools',
    { preHandler: app.requireRole('SUPER_ADMIN') },
    async (req, reply) => {
      const body = createSchoolSchema.parse(req.body)
      const [school] = await app.db`
        INSERT INTO schools ${app.db(body)}
        RETURNING id, nom, code_etablissement, type, ville, created_at
      `
      await writeAuditLog(app, req, { action: 'ECOLE_CREEE', entiteType: 'schools', entiteId: school.id, valeurApres: body })
      return reply.status(201).send(successResponse(school))
    },
  )

  // GET /schools/:schoolId/academic-years
  app.get<{ Params: { schoolId: string } }>(
    '/schools/:schoolId/academic-years',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const rows = await app.db`
        SELECT * FROM annees_scolaires
        WHERE school_id = ${req.params.schoolId}
        ORDER BY date_debut DESC
      `
      return reply.send(successResponse(rows))
    },
  )

  // POST /schools/:schoolId/academic-years
  app.post<{ Params: { schoolId: string }; Body: unknown }>(
    '/schools/:schoolId/academic-years',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const body = createAcademicYearSchema.parse(req.body)
      const [year] = await app.db`
        INSERT INTO annees_scolaires ${app.db({ school_id: req.params.schoolId, ...body })}
        RETURNING *
      `
      return reply.status(201).send(successResponse(year))
    },
  )
}
