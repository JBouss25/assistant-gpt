import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { paginationSchema, buildMeta, buildOffset, successResponse } from '../utils/pagination.js'
import { encryptNullable } from '../utils/crypto.js'
import { writeAuditLog } from '../utils/audit.js'

const createTeacherSchema = z.object({
  matricule:              z.string().max(30),
  nom:                    z.string().min(2).max(100),
  prenom:                 z.string().min(2).max(100),
  email_pro:              z.string().email(),
  type_contrat:           z.enum(['TITULAIRE', 'VACATAIRE', 'CONTRACTUEL', 'REMPLACANT']),
  date_embauche:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  specialite_principale:  z.string().max(100),
  specialites_secondaires: z.array(z.string()).default([]),
  heures_service_hebdo:   z.number().int().positive().optional(),
  date_fin_contrat:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Champs PII (optionnels à la création, chiffrés)
  telephone:              z.string().max(20).optional(),
  email_perso:            z.string().email().optional(),
})

export async function teacherRoutes(app: FastifyInstance) {
  // GET /schools/:schoolId/teachers
  app.get<{ Params: { schoolId: string }; Querystring: Record<string, string> }>(
    '/schools/:schoolId/teachers',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const query = paginationSchema.extend({
        statut: z.enum(['ACTIF', 'CONGE', 'DETACHE', 'RETRAITE', 'QUITTE']).optional(),
        search: z.string().max(100).optional(),
      }).parse(req.query)
      const { limit, offset } = buildOffset(query)

      const where = app.db`
        WHERE school_id = ${req.params.schoolId}
        ${query.statut ? app.db`AND statut = ${query.statut}` : app.db``}
        ${query.search ? app.db`AND (nom ILIKE ${'%' + query.search + '%'} OR prenom ILIKE ${'%' + query.search + '%'} OR email_pro ILIKE ${'%' + query.search + '%'})` : app.db``}
      `

      const [{ count }] = await app.db<[{ count: string }]>`SELECT COUNT(*) as count FROM enseignants ${where}`
      const rows = await app.db`
        SELECT id, matricule, nom, prenom, email_pro, type_contrat,
               specialite_principale, specialites_secondaires, statut, date_embauche
        FROM enseignants ${where}
        ORDER BY nom, prenom
        LIMIT ${limit} OFFSET ${offset}
      `
      return reply.send(successResponse(rows, buildMeta(Number(count), query)))
    },
  )

  // POST /schools/:schoolId/teachers
  app.post<{ Params: { schoolId: string }; Body: unknown }>(
    '/schools/:schoolId/teachers',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'HR_OFFICER') },
    async (req, reply) => {
      const body = createTeacherSchema.parse(req.body)

      const insertData = {
        school_id: req.params.schoolId,
        matricule: body.matricule,
        nom: body.nom,
        prenom: body.prenom,
        email_pro: body.email_pro,
        type_contrat: body.type_contrat,
        date_embauche: body.date_embauche,
        specialite_principale: body.specialite_principale,
        specialites_secondaires: JSON.stringify(body.specialites_secondaires),
        heures_service_hebdo: body.heures_service_hebdo ?? null,
        date_fin_contrat: body.date_fin_contrat ?? null,
        telephone: body.telephone ? Buffer.from(encryptNullable(body.telephone)!) : null,
        email_perso: body.email_perso ? Buffer.from(encryptNullable(body.email_perso)!) : null,
      }

      const [teacher] = await app.db`
        INSERT INTO enseignants ${app.db(insertData)}
        RETURNING id, nom, prenom, email_pro, matricule, type_contrat, statut, created_at
      `

      await writeAuditLog(app, req, {
        action: 'ENSEIGNANT_CREE',
        entiteType: 'enseignants',
        entiteId: teacher.id,
        valeurApres: { nom: body.nom, prenom: body.prenom, email_pro: body.email_pro },
      })

      return reply.status(201).send(successResponse(teacher))
    },
  )
}
