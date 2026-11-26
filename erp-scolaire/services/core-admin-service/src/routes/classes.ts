import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { successResponse } from '../utils/pagination.js'

const createClassSchema = z.object({
  annee_scolaire_id: z.string().uuid(),
  niveau_id:         z.string().uuid(),
  nom:               z.string().min(2).max(50),
  effectif_max:      z.number().int().min(1).max(100).default(35),
  titulaire_id:      z.string().uuid().optional(),
})

export async function classRoutes(app: FastifyInstance) {
  // GET /schools/:schoolId/classes
  app.get<{ Params: { schoolId: string }; Querystring: Record<string, string> }>(
    '/schools/:schoolId/classes',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { annee_scolaire_id } = z.object({ annee_scolaire_id: z.string().uuid().optional() }).parse(req.query)

      const rows = await app.db`
        SELECT
          c.*,
          n.code AS niveau_code,
          n.libelle AS niveau_libelle,
          n.cycle,
          COUNT(i.id) AS nb_inscrits,
          CONCAT(e.prenom, ' ', e.nom) AS titulaire_nom
        FROM classes c
        JOIN niveaux n ON n.id = c.niveau_id
        LEFT JOIN inscriptions i ON i.classe_id = c.id AND i.statut = 'CONFIRMEE'
        LEFT JOIN enseignants e ON e.id = c.titulaire_id
        WHERE c.school_id = ${req.params.schoolId}
        ${annee_scolaire_id ? app.db`AND c.annee_scolaire_id = ${annee_scolaire_id}` : app.db``}
        GROUP BY c.id, n.code, n.libelle, n.cycle, e.prenom, e.nom
        ORDER BY n.ordre, c.nom
      `
      return reply.send(successResponse(rows))
    },
  )

  // POST /schools/:schoolId/classes
  app.post<{ Params: { schoolId: string }; Body: unknown }>(
    '/schools/:schoolId/classes',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const body = createClassSchema.parse(req.body)
      const [cls] = await app.db`
        INSERT INTO classes ${app.db({ school_id: req.params.schoolId, ...body })}
        RETURNING *
      `
      return reply.status(201).send(successResponse(cls))
    },
  )

  // GET /schools/:schoolId/classes/:classId/students
  app.get<{ Params: { schoolId: string; classId: string } }>(
    '/schools/:schoolId/classes/:classId/students',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const rows = await app.db`
        SELECT e.id, e.nom, e.prenom, e.sexe, e.numero_massar, e.numero_interne, e.statut
        FROM eleves e
        JOIN inscriptions i ON i.eleve_id = e.id
        WHERE i.classe_id = ${req.params.classId}
          AND e.school_id = ${req.params.schoolId}
          AND i.statut = 'CONFIRMEE'
        ORDER BY e.nom, e.prenom
      `
      return reply.send(successResponse(rows))
    },
  )
}
