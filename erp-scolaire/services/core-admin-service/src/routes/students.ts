import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { paginationSchema, buildMeta, buildOffset, successResponse } from '../utils/pagination.js'
import { encrypt, encryptNullable, decrypt, decryptNullable } from '../utils/crypto.js'
import { writeAuditLog } from '../utils/audit.js'

// ─── Schémas de validation ────────────────────────────────

const createStudentSchema = z.object({
  numero_massar:    z.string().max(20).optional(),
  numero_interne:   z.string().max(20),
  nom:              z.string().min(2).max(100),
  prenom:           z.string().min(2).max(100),
  date_naissance:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD requis'),
  lieu_naissance:   z.string().max(100).optional(),
  sexe:             z.enum(['M', 'F']),
  nationalite:      z.string().max(50).default('Marocaine'),
  adresse:          z.string().optional(),
  telephone_urgence: z.string().max(20).optional(),
  bourse_type:      z.enum(['AUCUNE', 'NATIONALE', 'ETRANGERE', 'ETABLISSEMENT']).default('AUCUNE'),
  bourse_montant:   z.number().positive().optional(),
  date_inscription: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const updateStudentSchema = createStudentSchema.partial().omit({ numero_interne: true })

const studentQuerySchema = paginationSchema.extend({
  statut:   z.enum(['ACTIF', 'TRANSFERE', 'DIPLOME', 'EXCLU', 'DECEDE']).optional(),
  search:   z.string().max(100).optional(),
  niveau_id: z.string().uuid().optional(),
})

// ─── Routes ──────────────────────────────────────────────

export async function studentRoutes(app: FastifyInstance) {
  const CACHE_TTL = 300 // 5 minutes

  // GET /schools/:schoolId/students
  app.get<{ Params: { schoolId: string }; Querystring: Record<string, string> }>(
    '/schools/:schoolId/students',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const schoolId = req.params.schoolId
      const query = studentQuerySchema.parse(req.query)
      const { limit, offset } = buildOffset(query)

      const cacheKey = `students:${schoolId}:${JSON.stringify(query)}`
      const cached = await app.redis.get(cacheKey)
      if (cached) {
        return reply.send(JSON.parse(cached))
      }

      const whereConditions = app.db`
        WHERE e.school_id = ${schoolId}
        ${query.statut ? app.db`AND e.statut = ${query.statut}` : app.db``}
        ${query.search ? app.db`AND (e.nom ILIKE ${'%' + query.search + '%'} OR e.prenom ILIKE ${'%' + query.search + '%'} OR e.numero_massar ILIKE ${'%' + query.search + '%'})` : app.db``}
      `

      const [{ count }] = await app.db<[{ count: string }]>`
        SELECT COUNT(*) as count FROM eleves e ${whereConditions}
      `
      const total = Number(count)

      const rows = await app.db`
        SELECT
          e.id, e.numero_massar, e.numero_interne, e.nom, e.prenom,
          e.sexe, e.nationalite, e.bourse_type, e.statut, e.date_inscription,
          i.classe_id,
          c.nom AS classe_nom
        FROM eleves e
        LEFT JOIN inscriptions i ON i.eleve_id = e.id
        LEFT JOIN classes c ON c.id = i.classe_id
        ${whereConditions}
        ORDER BY e.nom, e.prenom
        LIMIT ${limit} OFFSET ${offset}
      `

      const response = successResponse(rows, buildMeta(total, query))
      await app.redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response))
      return reply.send(response)
    },
  )

  // GET /schools/:schoolId/students/:studentId
  app.get<{ Params: { schoolId: string; studentId: string } }>(
    '/schools/:schoolId/students/:studentId',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { schoolId, studentId } = req.params

      const [student] = await app.db`
        SELECT * FROM eleves
        WHERE id = ${studentId} AND school_id = ${schoolId}
      `

      if (!student) {
        return reply.status(404).send({
          success: false, data: null,
          error: { code: 'NOT_FOUND', message: 'Élève introuvable', details: null },
        })
      }

      // Déchiffrer les champs PII
      const decrypted = {
        ...student,
        date_naissance:    decrypt(student.date_naissance.toString('hex')),
        lieu_naissance:    decryptNullable(student.lieu_naissance?.toString('hex')),
        adresse:           decryptNullable(student.adresse?.toString('hex')),
        telephone_urgence: decryptNullable(student.telephone_urgence?.toString('hex')),
        // Ne jamais exposer : numero_cnie, groupe_sanguin, antecedents_medicaux, mutuelle
      }

      // Charger les responsables légaux
      const responsables = await app.db`
        SELECT id, lien, nom_complet, est_contact_urgence, est_autorise_retrait, user_id
        FROM responsables_legaux
        WHERE eleve_id = ${studentId}
        ORDER BY est_contact_urgence DESC
      `

      return reply.send(successResponse({ ...decrypted, responsables }))
    },
  )

  // POST /schools/:schoolId/students
  app.post<{ Params: { schoolId: string }; Body: unknown }>(
    '/schools/:schoolId/students',
    {
      preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'HR_OFFICER'),
    },
    async (req, reply) => {
      const schoolId = req.params.schoolId
      const body = createStudentSchema.parse(req.body)

      // Chiffrer les champs PII avant insertion
      const encryptedData = {
        date_naissance:    encrypt(body.date_naissance),
        lieu_naissance:    encryptNullable(body.lieu_naissance ?? null),
        adresse:           encryptNullable(body.adresse ?? null),
        telephone_urgence: encryptNullable(body.telephone_urgence ?? null),
      }

      const [student] = await app.db`
        INSERT INTO eleves (
          school_id, numero_massar, numero_interne, nom, prenom,
          date_naissance, lieu_naissance, sexe, nationalite,
          adresse, telephone_urgence, bourse_type, bourse_montant, date_inscription
        ) VALUES (
          ${schoolId},
          ${body.numero_massar ?? null},
          ${body.numero_interne},
          ${body.nom},
          ${body.prenom},
          ${Buffer.from(encryptedData.date_naissance)},
          ${encryptedData.lieu_naissance ? Buffer.from(encryptedData.lieu_naissance) : null},
          ${body.sexe},
          ${body.nationalite},
          ${encryptedData.adresse ? Buffer.from(encryptedData.adresse) : null},
          ${encryptedData.telephone_urgence ? Buffer.from(encryptedData.telephone_urgence) : null},
          ${body.bourse_type},
          ${body.bourse_montant ?? null},
          ${body.date_inscription}
        )
        RETURNING id, nom, prenom, numero_interne, statut, created_at
      `

      // Invalider le cache de la liste
      await app.redis.del(`students:${schoolId}:*`)

      // Émettre l'événement Kafka
      await app.kafkaProducer.send({
        topic: 'core-admin.eleve.cree',
        messages: [{ key: student.id, value: JSON.stringify({ eleve_id: student.id, school_id: schoolId }) }],
      })

      await writeAuditLog(app, req, {
        action: 'ELEVE_CREE',
        entiteType: 'eleves',
        entiteId: student.id,
        valeurApres: { nom: body.nom, prenom: body.prenom, numero_interne: body.numero_interne },
      })

      return reply.status(201).send(successResponse(student))
    },
  )

  // PATCH /schools/:schoolId/students/:studentId
  app.patch<{ Params: { schoolId: string; studentId: string }; Body: unknown }>(
    '/schools/:schoolId/students/:studentId',
    {
      preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'HR_OFFICER'),
    },
    async (req, reply) => {
      const { schoolId, studentId } = req.params
      const body = updateStudentSchema.parse(req.body)

      if (Object.keys(body).length === 0) {
        return reply.status(400).send({
          success: false, data: null,
          error: { code: 'VALIDATION_ERROR', message: 'Aucune modification fournie', details: null },
        })
      }

      const updates: Record<string, unknown> = { ...body }

      // Chiffrer les champs PII modifiés
      if (body.date_naissance)    updates['date_naissance'] = Buffer.from(encrypt(body.date_naissance))
      if (body.lieu_naissance)    updates['lieu_naissance'] = Buffer.from(encrypt(body.lieu_naissance))
      if (body.adresse)           updates['adresse'] = Buffer.from(encrypt(body.adresse))
      if (body.telephone_urgence) updates['telephone_urgence'] = Buffer.from(encrypt(body.telephone_urgence))

      const [updated] = await app.db`
        UPDATE eleves SET ${app.db(updates)}, updated_at = NOW()
        WHERE id = ${studentId} AND school_id = ${schoolId}
        RETURNING id, nom, prenom, statut, updated_at
      `

      if (!updated) {
        return reply.status(404).send({
          success: false, data: null,
          error: { code: 'NOT_FOUND', message: 'Élève introuvable', details: null },
        })
      }

      await app.redis.del(`students:${schoolId}:*`)

      await writeAuditLog(app, req, {
        action: 'ELEVE_MODIFIE',
        entiteType: 'eleves',
        entiteId: studentId,
        valeurApres: Object.fromEntries(
          Object.entries(body).filter(([k]) => !['date_naissance', 'adresse', 'telephone_urgence'].includes(k))
        ),
      })

      return reply.send(successResponse(updated))
    },
  )
}
