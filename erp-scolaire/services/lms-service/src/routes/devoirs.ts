/**
 * Routes — Devoirs LMS et rendus d'élèves
 *
 * Cycle complet : Enseignant crée un devoir → Élève rend son travail
 * → Enseignant corrige et note → Notification DEVOIR_CORRIGE envoyée.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type postgres from 'postgres'
import { publishLMSEvent } from '../services/kafka-producer.js'
import { generatePresignedUpload } from '../services/storage.js'

const DevoirSchema = z.object({
  school_id:        z.string().uuid(),
  cours_id:         z.string().uuid(),
  titre:            z.string().min(2).max(200),
  consignes:        z.string().optional(),
  date_limite:      z.string().datetime(),
  bareme:           z.number().min(1).max(100).default(20),
  type_rendu:       z.enum(['FICHIER', 'TEXTE', 'URL', 'MIXTE']).default('FICHIER'),
  classe_ids:       z.array(z.string().uuid()).min(1),
})

const RenduSchema = z.object({
  eleve_id:   z.string().uuid(),
  contenu:    z.string().optional(),
  url_rendu:  z.string().url().optional(),
  object_key: z.string().optional(), // fichier S3 uploadé
  commentaire: z.string().optional(),
})

const CorrectionSchema = z.object({
  note:        z.number().min(0),
  commentaire: z.string().optional(),
})

export default async function devoirsRoutes(
  app: FastifyInstance,
  { db }: { db: postgres.Sql },
): Promise<void> {

  // ── LIST — GET /devoirs?school_id=&classe_id=&cours_id= ──────────────
  app.get('/', {
    preHandler: [app.authenticate],
    schema: {
      querystring: {
        type: 'object',
        required: ['school_id'],
        properties: {
          school_id: { type: 'string' },
          classe_id: { type: 'string' },
          cours_id:  { type: 'string' },
          eleve_id:  { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { school_id, classe_id, cours_id, eleve_id } =
      req.query as { school_id: string; classe_id?: string; cours_id?: string; eleve_id?: string }

    const devoirs = await db`
      SELECT
        d.id, d.titre, d.consignes, d.date_limite, d.bareme, d.type_rendu,
        d.created_at, c.titre AS cours_titre,
        ${eleve_id ? db`r.statut AS rendu_statut, r.note AS rendu_note` : db`NULL AS rendu_statut, NULL AS rendu_note`}
      FROM devoirs_lms d
      JOIN cours c ON c.id = d.cours_id
      ${eleve_id ? db`LEFT JOIN rendus r ON r.devoir_id = d.id AND r.eleve_id = ${eleve_id}` : db``}
      WHERE d.school_id = ${school_id}
        ${cours_id  ? db`AND d.cours_id = ${cours_id}`   : db``}
        ${classe_id ? db`AND d.classe_id = ${classe_id}` : db``}
      ORDER BY d.date_limite ASC
    `

    return reply.send({ success: true, data: devoirs })
  })

  // ── CREATE — POST /devoirs ────────────────────────────────────────────
  app.post('/', {
    preHandler: [app.authenticate, app.requireRole('ENSEIGNANT', 'ADMIN', 'SUPER_ADMIN')],
    schema: { body: { type: 'object', additionalProperties: true } },
  }, async (req, reply) => {
    const parsed = DevoirSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ success: false, error: parsed.error.flatten() })

    const { school_id, cours_id, titre, consignes, date_limite, bareme, type_rendu, classe_ids } = parsed.data

    // Créer un devoir par classe
    const devoirs: unknown[] = []
    for (const classe_id of classe_ids) {
      const [d] = await db`
        INSERT INTO devoirs_lms
          (school_id, cours_id, classe_id, titre, consignes, date_limite, bareme, type_rendu)
        VALUES
          (${school_id}, ${cours_id}, ${classe_id}, ${titre}, ${consignes ?? null},
           ${date_limite}, ${bareme}, ${type_rendu})
        RETURNING *
      `
      devoirs.push(d)

      // Notifier les élèves
      await publishLMSEvent('lms.devoir.assigne', {
        school_id,
        devoir_id:   d.id,
        cours_id,
        classe_id,
        titre,
        date_limite,
        bareme,
      })
    }

    return reply.code(201).send({ success: true, data: devoirs })
  })

  // ── UPLOAD ATTACHMENT — POST /devoirs/:id/upload ─────────────────────
  app.post('/:id/upload', {
    preHandler: [app.authenticate],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['filename', 'content_type', 'school_id', 'eleve_id'],
        properties: {
          filename:     { type: 'string' },
          content_type: { type: 'string' },
          school_id:    { type: 'string' },
          eleve_id:     { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { id: devoir_id } = req.params as { id: string }
    const { filename, content_type, school_id, eleve_id } = req.body as {
      filename: string; content_type: string; school_id: string; eleve_id: string
    }

    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const { S3Client } = await import('@aws-sdk/client-s3')
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')

    const s3 = new S3Client({
      region:   process.env['S3_REGION'] ?? 'eu-west-3',
      endpoint: process.env['S3_ENDPOINT'],
      credentials: {
        accessKeyId:     process.env['S3_ACCESS_KEY'] ?? '',
        secretAccessKey: process.env['S3_SECRET_KEY'] ?? '',
      },
      forcePathStyle: !!process.env['S3_ENDPOINT'],
    })

    const bucket = process.env['S3_BUCKET'] ?? 'erp-scolaire-lms'
    const ext = filename.split('.').pop() ?? ''
    const object_key = `schools/${school_id}/rendus/${devoir_id}/${eleve_id}.${ext}`

    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: bucket, Key: object_key, ContentType: content_type }),
      { expiresIn: 900 },
    )

    return reply.send({ success: true, data: { upload_url: url, object_key } })
  })

  // ── SUBMIT RENDU — POST /devoirs/:id/rendus ──────────────────────────
  app.post('/:id/rendus', {
    preHandler: [app.authenticate],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body:   { type: 'object', additionalProperties: true },
    },
  }, async (req, reply) => {
    const { id: devoir_id } = req.params as { id: string }
    const parsed = RenduSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ success: false, error: parsed.error.flatten() })

    // Vérifier date limite
    const [devoir] = await db`SELECT date_limite, school_id, cours_id FROM devoirs_lms WHERE id = ${devoir_id}`
    if (!devoir) return reply.code(404).send({ success: false, error: 'Devoir introuvable' })

    const enRetard = new Date() > new Date(devoir.date_limite as string)

    const [rendu] = await db`
      INSERT INTO rendus
        (devoir_id, eleve_id, contenu, url_rendu, object_key, commentaire, rendu_en_retard, statut)
      VALUES (
        ${devoir_id}, ${parsed.data.eleve_id},
        ${parsed.data.contenu ?? null}, ${parsed.data.url_rendu ?? null},
        ${parsed.data.object_key ?? null}, ${parsed.data.commentaire ?? null},
        ${enRetard}, 'SOUMIS'
      )
      ON CONFLICT (devoir_id, eleve_id) DO UPDATE
        SET contenu          = EXCLUDED.contenu,
            url_rendu        = EXCLUDED.url_rendu,
            object_key       = EXCLUDED.object_key,
            commentaire      = EXCLUDED.commentaire,
            rendu_en_retard  = EXCLUDED.rendu_en_retard,
            statut           = 'SOUMIS',
            updated_at       = NOW()
      RETURNING *
    `

    return reply.code(201).send({ success: true, data: rendu })
  })

  // ── LIST RENDUS (enseignant) — GET /devoirs/:id/rendus ───────────────
  app.get('/:id/rendus', {
    preHandler: [app.authenticate, app.requireRole('ENSEIGNANT', 'ADMIN', 'SUPER_ADMIN')],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (req, reply) => {
    const { id: devoir_id } = req.params as { id: string }

    const rendus = await db`
      SELECT r.*, e.nom AS eleve_nom, e.prenom AS eleve_prenom
      FROM rendus r
      JOIN eleves e ON e.id = r.eleve_id
      WHERE r.devoir_id = ${devoir_id}
      ORDER BY r.created_at
    `

    return reply.send({ success: true, data: rendus })
  })

  // ── CORRECT — PATCH /devoirs/:id/rendus/:renduId/corriger ───────────
  app.patch('/:id/rendus/:renduId/corriger', {
    preHandler: [app.authenticate, app.requireRole('ENSEIGNANT', 'ADMIN', 'SUPER_ADMIN')],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' }, renduId: { type: 'string' } },
      },
      body: { type: 'object', additionalProperties: true },
    },
  }, async (req, reply) => {
    const { id: devoir_id, renduId: rendu_id } = req.params as { id: string; renduId: string }
    const parsed = CorrectionSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ success: false, error: parsed.error.flatten() })

    // Vérifier le barème
    const [devoir] = await db`SELECT bareme, titre, cours_id, school_id FROM devoirs_lms WHERE id = ${devoir_id}`
    if (!devoir) return reply.code(404).send({ success: false, error: 'Devoir introuvable' })

    if (parsed.data.note > (devoir.bareme as number)) {
      return reply.code(400).send({
        success: false,
        error: `Note ${parsed.data.note} dépasse le barème ${devoir.bareme}`,
      })
    }

    const [rendu] = await db`
      UPDATE rendus
      SET note        = ${parsed.data.note},
          commentaire = COALESCE(${parsed.data.commentaire ?? null}, commentaire),
          statut      = 'CORRIGE',
          corrige_at  = NOW()
      WHERE id = ${rendu_id}
      RETURNING eleve_id
    `
    if (!rendu) return reply.code(404).send({ success: false, error: 'Rendu introuvable' })

    // Déclencher notification DEVOIR_CORRIGE
    await publishLMSEvent('lms.devoir.corrige', {
      school_id:     devoir.school_id,
      eleve_id:      rendu.eleve_id,
      devoir_id,
      titre_devoir:  devoir.titre,
      note:          parsed.data.note,
      bareme:        devoir.bareme,
    })

    return reply.send({ success: true, data: { rendu_id, note: parsed.data.note } })
  })
}
