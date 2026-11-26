/**
 * Webhooks WhatsApp Meta — vérification et réception des statuts de livraison
 */

import type { FastifyInstance } from 'fastify'
import { verifyWebhookChallenge } from '../channels/whatsapp.js'

export default async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  // GET /webhooks/whatsapp — challenge de vérification Meta
  app.get('/whatsapp', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          'hub.mode':         { type: 'string' },
          'hub.verify_token': { type: 'string' },
          'hub.challenge':    { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const query = req.query as Record<string, string>
    const challenge = verifyWebhookChallenge(query)

    if (challenge === null) {
      return reply.code(403).send({ error: 'Invalid verify token' })
    }

    return reply.send(challenge)
  })

  // POST /webhooks/whatsapp — statuts de livraison et messages entrants
  app.post('/whatsapp', {
    config: { rawBody: true },
    schema: {
      body: { type: 'object', additionalProperties: true },
    },
  }, async (req, reply) => {
    const payload = req.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<{ id: string; status: string; timestamp: string }>
            messages?: Array<{ id: string; type: string; from: string }>
          }
        }>
      }>
    }

    // Traitement des statuts de livraison (delivered, read, failed)
    const statuses = payload.entry?.flatMap(e =>
      e.changes?.flatMap(c => c.value?.statuses ?? []) ?? []
    ) ?? []

    for (const status of statuses) {
      app.log.info({ provider_ref: status.id, status: status.status }, '[whatsapp-webhook] delivery status')
      // TODO: UPDATE notification_logs SET statut='ENVOYE' WHERE provider_ref=status.id
    }

    return reply.send({ status: 'ok' })
  })
}
