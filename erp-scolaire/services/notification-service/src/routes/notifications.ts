/**
 * Routes API notification — dashboard admin + envoi direct
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type postgres from 'postgres'

const SendDirectSchema = z.object({
  school_id:      z.string().uuid(),
  recipient_id:   z.string().uuid(),
  template:       z.string().min(1),
  variables:      z.record(z.string()),
  channels:       z.array(z.enum(['WHATSAPP', 'PUSH', 'EMAIL', 'SMS'])).min(1),
  priority:       z.enum(['HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
  recipient_phone: z.string().optional(),
  recipient_email: z.string().email().optional(),
  fcm_token:       z.string().optional(),
})

export default async function notificationsRoutes(
  app: FastifyInstance,
  { db }: { db: postgres.Sql },
): Promise<void> {

  // GET /notifications/logs?school_id=&recipient_id=&limit=&offset=
  app.get('/logs', {
    preHandler: [app.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          school_id:    { type: 'string' },
          recipient_id: { type: 'string' },
          statut:       { type: 'string' },
          limit:        { type: 'integer', default: 50, maximum: 200 },
          offset:       { type: 'integer', default: 0 },
        },
        required: ['school_id'],
      },
    },
  }, async (req, reply) => {
    const { school_id, recipient_id, statut, limit = 50, offset = 0 } =
      req.query as {
        school_id: string; recipient_id?: string
        statut?: string; limit?: number; offset?: number
      }

    const logs = await db`
      SELECT id, recipient_id, eleve_id, template_code, canal, priorite,
             statut, provider_ref, erreur, tentatives, created_at, sent_at
      FROM notification_logs
      WHERE school_id = ${school_id}
        ${recipient_id ? db`AND recipient_id = ${recipient_id}` : db``}
        ${statut       ? db`AND statut = ${statut}`             : db``}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    return reply.send({ success: true, data: logs })
  })

  // GET /notifications/templates?canal=
  app.get('/templates', {
    preHandler: [app.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          canal:  { type: 'string', enum: ['WHATSAPP', 'PUSH', 'EMAIL', 'SMS'] },
          langue: { type: 'string', default: 'fr' },
        },
      },
    },
  }, async (req, reply) => {
    const { canal, langue = 'fr' } = req.query as { canal?: string; langue?: string }

    const templates = await db`
      SELECT id, code, canal, langue, sujet, corps, waba_template_name, actif, created_at
      FROM notification_templates
      WHERE actif = true
        ${canal  ? db`AND canal = ${canal}`   : db``}
        AND langue = ${langue}
      ORDER BY code, canal
    `

    return reply.send({ success: true, data: templates })
  })

  // POST /notifications/send — envoi direct (admin / tests)
  app.post('/send', {
    preHandler: [app.authenticate, app.requireRole('ADMIN', 'SUPER_ADMIN')],
    schema: {
      body: {
        type: 'object',
        required: ['school_id', 'recipient_id', 'template', 'variables', 'channels'],
        additionalProperties: true,
      },
    },
  }, async (req, reply) => {
    const parsed = SendDirectSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.flatten() })
    }

    const job = parsed.data

    // Créer le log
    const [log] = await db`
      INSERT INTO notification_logs
        (school_id, recipient_id, template_code, canal, priorite, payload)
      VALUES (
        ${job.school_id},
        ${job.recipient_id},
        ${job.template},
        ${job.channels[0]!},
        ${job.priority},
        ${JSON.stringify(job.variables)}
      )
      RETURNING id
    `

    // Publier dans Kafka est géré par le dispatcher — ici on retourne immédiatement
    return reply.code(202).send({
      success: true,
      data:    { log_id: log.id, message: 'Notification mise en file' },
    })
  })

  // GET /notifications/stats?school_id=&days=
  app.get('/stats', {
    preHandler: [app.authenticate, app.requireRole('ADMIN', 'SUPER_ADMIN', 'DIRECTION')],
    schema: {
      querystring: {
        type: 'object',
        required: ['school_id'],
        properties: {
          school_id: { type: 'string' },
          days:      { type: 'integer', default: 30, maximum: 90 },
        },
      },
    },
  }, async (req, reply) => {
    const { school_id, days = 30 } = req.query as { school_id: string; days?: number }

    const stats = await db`
      SELECT
        canal,
        statut,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::int AS envoyes
      FROM notification_logs
      WHERE school_id = ${school_id}
        AND created_at >= NOW() - (${days} || ' days')::interval
      GROUP BY canal, statut
      ORDER BY canal, statut
    `

    return reply.send({ success: true, data: stats })
  })
}
