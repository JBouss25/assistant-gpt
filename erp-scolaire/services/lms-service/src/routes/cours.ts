/**
 * Routes — Cours et sections
 *
 * Un cours contient des sections ordonnées.
 * Chaque section contient des ressources (PDF, vidéo, lien externe).
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type postgres from 'postgres'
import type { RedisClientType } from 'redis'
import { publishLMSEvent } from '../services/kafka-producer.js'
import { generatePresignedUpload, generateDownloadUrl } from '../services/storage.js'

const CoursSchema = z.object({
  school_id:   z.string().uuid(),
  matiere_id:  z.string().uuid(),
  titre:       z.string().min(2).max(200),
  description: z.string().optional(),
  classe_ids:  z.array(z.string().uuid()).min(1),
})

const SectionSchema = z.object({
  titre:   z.string().min(1).max(150),
  ordre:   z.number().int().min(0),
  contenu: z.string().optional(), // Texte riche (HTML sanitisé côté frontend)
})

const RessourceSchema = z.object({
  titre:        z.string().min(1).max(200),
  type:         z.enum(['PDF', 'VIDEO', 'LIEN', 'FICHIER']),
  url_externe:  z.string().url().optional(),
  object_key:   z.string().optional(), // S3 object key après upload
  taille_bytes: z.number().int().optional(),
  duree_sec:    z.number().int().optional(), // Vidéo uniquement
})

export default async function coursRoutes(
  app: FastifyInstance,
  { db, redis }: { db: postgres.Sql; redis: RedisClientType },
): Promise<void> {
  const CACHE_TTL = 300 // 5 min

  // ── LIST — GET /cours?school_id=&classe_id=&matiere_id= ──────────────
  app.get('/', {
    preHandler: [app.authenticate],
    schema: {
      querystring: {
        type: 'object',
        required: ['school_id'],
        properties: {
          school_id:  { type: 'string' },
          classe_id:  { type: 'string' },
          matiere_id: { type: 'string' },
          publie:     { type: 'boolean' },
        },
      },
    },
  }, async (req, reply) => {
    const { school_id, classe_id, matiere_id, publie } =
      req.query as { school_id: string; classe_id?: string; matiere_id?: string; publie?: boolean }

    const cacheKey = `lms:cours:${school_id}:${classe_id ?? 'all'}:${matiere_id ?? 'all'}`
    const cached = await redis.get(cacheKey)
    if (cached) return reply.send({ success: true, data: JSON.parse(cached) })

    const rows = await db`
      SELECT
        c.id, c.titre, c.description, c.matiere_id, c.enseignant_id,
        c.publie, c.created_at, c.updated_at,
        m.nom AS matiere_nom,
        COUNT(DISTINCT s.id)::int AS nb_sections,
        COUNT(DISTINCT cc.classe_id)::int AS nb_classes
      FROM cours c
      JOIN matieres m ON m.id = c.matiere_id
      LEFT JOIN sections s ON s.cours_id = c.id
      LEFT JOIN cours_classes cc ON cc.cours_id = c.id
      WHERE c.school_id = ${school_id}
        ${classe_id  ? db`AND cc.classe_id = ${classe_id}`  : db``}
        ${matiere_id ? db`AND c.matiere_id = ${matiere_id}` : db``}
        ${publie !== undefined ? db`AND c.publie = ${publie}` : db``}
      GROUP BY c.id, m.nom
      ORDER BY c.updated_at DESC
    `

    await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(rows))
    return reply.send({ success: true, data: rows })
  })

  // ── CREATE — POST /cours ─────────────────────────────────────────────
  app.post('/', {
    preHandler: [app.authenticate, app.requireRole('ENSEIGNANT', 'ADMIN', 'SUPER_ADMIN')],
    schema: {
      body: { type: 'object', additionalProperties: true },
    },
  }, async (req, reply) => {
    const parsed = CoursSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ success: false, error: parsed.error.flatten() })

    const { school_id, matiere_id, titre, description, classe_ids } = parsed.data
    const enseignant_id = (req.user as { sub: string }).sub

    const [cours] = await db`
      INSERT INTO cours (school_id, matiere_id, enseignant_id, titre, description)
      VALUES (${school_id}, ${matiere_id}, ${enseignant_id}, ${titre}, ${description ?? null})
      RETURNING *
    `

    // Associer aux classes
    if (classe_ids.length > 0) {
      await db`
        INSERT INTO cours_classes (cours_id, classe_id)
        SELECT ${cours.id}, UNNEST(${classe_ids}::uuid[])
        ON CONFLICT DO NOTHING
      `
    }

    await redis.del(`lms:cours:${school_id}:all:all`)
    return reply.code(201).send({ success: true, data: cours })
  })

  // ── GET SINGLE — GET /cours/:id ──────────────────────────────────────
  app.get('/:id', {
    preHandler: [app.authenticate],
    schema: { params: { type: 'object', properties: { id: { type: 'string' } } } },
  }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const [cours] = await db`
      SELECT c.*, m.nom AS matiere_nom
      FROM cours c
      JOIN matieres m ON m.id = c.matiere_id
      WHERE c.id = ${id}
    `
    if (!cours) return reply.code(404).send({ success: false, error: 'Cours introuvable' })

    const sections = await db`
      SELECT s.id, s.titre, s.ordre, s.contenu,
        json_agg(
          json_build_object(
            'id', r.id, 'titre', r.titre, 'type', r.type,
            'taille_bytes', r.taille_bytes, 'duree_sec', r.duree_sec
          ) ORDER BY r.ordre
        ) FILTER (WHERE r.id IS NOT NULL) AS ressources
      FROM sections s
      LEFT JOIN ressources r ON r.section_id = s.id
      WHERE s.cours_id = ${id}
      GROUP BY s.id
      ORDER BY s.ordre
    `

    return reply.send({ success: true, data: { ...cours, sections } })
  })

  // ── PUBLISH — PATCH /cours/:id/publier ──────────────────────────────
  app.patch('/:id/publier', {
    preHandler: [app.authenticate, app.requireRole('ENSEIGNANT', 'ADMIN', 'SUPER_ADMIN')],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const [cours] = await db`
      UPDATE cours SET publie = true, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    if (!cours) return reply.code(404).send({ success: false, error: 'Cours introuvable' })

    // Notifier les élèves des classes associées
    const classes = await db`SELECT classe_id FROM cours_classes WHERE cours_id = ${id}`
    for (const { classe_id } of classes) {
      await publishLMSEvent('lms.cours.publie', {
        school_id:  cours.school_id,
        cours_id:   id,
        classe_id,
        titre:      cours.titre,
      })
    }

    await redis.del(`lms:cours:${cours.school_id}:all:all`)
    return reply.send({ success: true, data: cours })
  })

  // ── SECTIONS — POST /cours/:id/sections ─────────────────────────────
  app.post('/:id/sections', {
    preHandler: [app.authenticate, app.requireRole('ENSEIGNANT', 'ADMIN', 'SUPER_ADMIN')],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body:   { type: 'object', additionalProperties: true },
    },
  }, async (req, reply) => {
    const { id: cours_id } = req.params as { id: string }
    const parsed = SectionSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ success: false, error: parsed.error.flatten() })

    const [section] = await db`
      INSERT INTO sections (cours_id, titre, ordre, contenu)
      VALUES (${cours_id}, ${parsed.data.titre}, ${parsed.data.ordre}, ${parsed.data.contenu ?? null})
      RETURNING *
    `
    return reply.code(201).send({ success: true, data: section })
  })

  // ── RESSOURCES — POST /cours/:id/sections/:sectionId/ressources ─────
  app.post('/:id/sections/:sectionId/ressources', {
    preHandler: [app.authenticate, app.requireRole('ENSEIGNANT', 'ADMIN', 'SUPER_ADMIN')],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' }, sectionId: { type: 'string' } },
      },
      body: { type: 'object', additionalProperties: true },
    },
  }, async (req, reply) => {
    const { id: cours_id, sectionId: section_id } = req.params as { id: string; sectionId: string }
    const parsed = RessourceSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ success: false, error: parsed.error.flatten() })

    // Calcul ordre auto (dernière position + 1)
    const [{ max_ordre }] = await db`
      SELECT COALESCE(MAX(ordre), -1) AS max_ordre FROM ressources WHERE section_id = ${section_id}
    `

    const [ressource] = await db`
      INSERT INTO ressources (section_id, cours_id, titre, type, url_externe, object_key, taille_bytes, duree_sec, ordre)
      VALUES (
        ${section_id}, ${cours_id}, ${parsed.data.titre}, ${parsed.data.type},
        ${parsed.data.url_externe ?? null}, ${parsed.data.object_key ?? null},
        ${parsed.data.taille_bytes ?? null}, ${parsed.data.duree_sec ?? null},
        ${(max_ordre as number) + 1}
      )
      RETURNING *
    `
    return reply.code(201).send({ success: true, data: ressource })
  })

  // ── PRESIGNED UPLOAD — POST /cours/:id/upload ───────────────────────
  app.post('/:id/upload', {
    preHandler: [app.authenticate, app.requireRole('ENSEIGNANT', 'ADMIN', 'SUPER_ADMIN')],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['filename', 'content_type', 'school_id'],
        properties: {
          filename:     { type: 'string' },
          content_type: { type: 'string' },
          school_id:    { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { id: cours_id } = req.params as { id: string }
    const { filename, content_type, school_id } = req.body as {
      filename: string; content_type: string; school_id: string
    }

    const result = await generatePresignedUpload({ school_id, cours_id, filename, content_type })
    return reply.send({ success: true, data: result })
  })

  // ── DOWNLOAD — GET /cours/:id/ressources/:ressourceId/download ───────
  app.get('/:id/ressources/:ressourceId/download', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { ressourceId } = req.params as { id: string; ressourceId: string }

    const [ressource] = await db`
      SELECT object_key, url_externe FROM ressources WHERE id = ${ressourceId}
    `
    if (!ressource) return reply.code(404).send({ success: false, error: 'Ressource introuvable' })

    if (ressource.url_externe) {
      return reply.redirect(ressource.url_externe as string)
    }

    const url = await generateDownloadUrl(ressource.object_key as string)
    return reply.redirect(url)
  })

  // ── PROGRESSION — POST /cours/:id/progression ───────────────────────
  app.post('/:id/progression', {
    preHandler: [app.authenticate],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['eleve_id', 'section_id', 'pourcentage'],
        properties: {
          eleve_id:     { type: 'string' },
          section_id:   { type: 'string' },
          pourcentage:  { type: 'integer', minimum: 0, maximum: 100 },
          temps_sec:    { type: 'integer' },
        },
      },
    },
  }, async (req, reply) => {
    const { id: cours_id } = req.params as { id: string }
    const { eleve_id, section_id, pourcentage, temps_sec } = req.body as {
      eleve_id: string; section_id: string; pourcentage: number; temps_sec?: number
    }

    await db`
      INSERT INTO progressions (eleve_id, cours_id, section_id, pourcentage, temps_sec)
      VALUES (${eleve_id}, ${cours_id}, ${section_id}, ${pourcentage}, ${temps_sec ?? 0})
      ON CONFLICT (eleve_id, section_id) DO UPDATE
        SET pourcentage = GREATEST(progressions.pourcentage, EXCLUDED.pourcentage),
            temps_sec   = progressions.temps_sec + EXCLUDED.temps_sec,
            updated_at  = NOW()
    `

    return reply.send({ success: true })
  })
}
