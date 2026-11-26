/**
 * Dispatcher central de notifications.
 *
 * Consomme le topic Kafka `notifications.send` et délègue à BullMQ
 * pour l'envoi asynchrone avec rate-limiting, retry et fallback.
 *
 * Cascade de fallback :
 *   WhatsApp (primary) → Push → SMS → Email (backup)
 *
 * Déduplication : clé Redis TTL 10 min pour éviter les doublons
 *   lors de retrys Kafka.
 */
import { Queue, Worker, type Job } from 'bullmq'
import { Kafka, type Consumer } from 'kafkajs'
import { createHash } from 'crypto'
import type { RedisClientType } from 'redis'
import type postgres from 'postgres'
import { sendWhatsApp } from '../channels/whatsapp.js'
import { sendPush } from '../channels/push.js'
import { sendEmail } from '../channels/email.js'
import { sendSMS } from '../channels/sms.js'

export type NotifJob = {
  school_id:      string
  recipient_type: 'PARENT' | 'STUDENT' | 'TEACHER'
  eleve_id?:      string
  template:       string
  variables:      Record<string, string>
  channels:       Array<'WHATSAPP' | 'PUSH' | 'EMAIL' | 'SMS'>
  priority:       'HIGH' | 'NORMAL' | 'LOW'
  // Enrichi par le dispatcher avant mise en queue
  recipient_id?:  string
  recipient_phone?: string
  recipient_email?: string
  fcm_token?:     string
  log_id?:        string
}

type ChannelResult = { success: boolean; provider_ref?: string; error?: string }

const PRIORITY_MAP = { HIGH: 1, NORMAL: 5, LOW: 10 }

export async function createDispatcher(
  db: postgres.Sql,
  redis: RedisClientType,
): Promise<{ consumer: Consumer; shutdown: () => Promise<void> }> {
  const redisConnection = { host: process.env['REDIS_HOST'] ?? 'redis', port: 6379, password: process.env['REDIS_PASSWORD'] }

  // ── Queue BullMQ ──────────────────────────────────────
  const queue = new Queue<NotifJob>('notifications', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  })

  // ── Worker BullMQ ─────────────────────────────────────
  const worker = new Worker<NotifJob>('notifications', async (job) => {
    await processNotification(job, db)
  }, {
    connection: redisConnection,
    concurrency: 10,
    limiter: { max: 80, duration: 1000 }, // 80 messages/sec (limite WhatsApp)
  })

  worker.on('failed', (job, err) => {
    console.error(`[notification-worker] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message)
  })

  // ── Consommateur Kafka ─────────────────────────────────
  const kafka = new Kafka({
    clientId: 'notification-dispatcher',
    brokers: (process.env['KAFKA_BROKERS'] ?? 'kafka:9092').split(','),
  })

  const consumer = kafka.consumer({ groupId: 'notification-dispatcher-group' })
  await consumer.connect()
  await consumer.subscribe({ topics: ['notifications.send'], fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return

      let job: NotifJob
      try {
        job = JSON.parse(message.value.toString()) as NotifJob
      } catch {
        console.error('[dispatcher] Invalid notification payload')
        return
      }

      // Déduplication Redis : évite les doublons lors des retrys Kafka
      const dedupKey = `notif:dedup:${createHash('md5').update(JSON.stringify(job)).digest('hex')}`
      const alreadySent = await redis.set(dedupKey, '1', { NX: true, EX: 600 })
      if (!alreadySent) return

      // Enrichir le job avec les coordonnées du destinataire
      const enriched = await enrichJob(job, db)
      if (!enriched) return

      // Créer le log de notification
      const [log] = await db`
        INSERT INTO notification_logs
          (school_id, recipient_id, eleve_id, template_code, canal, priorite, payload)
        VALUES (
          ${enriched.school_id},
          ${enriched.recipient_id ?? enriched.eleve_id ?? null},
          ${enriched.eleve_id ?? null},
          ${enriched.template},
          ${enriched.channels[0] ?? 'WHATSAPP'},
          ${enriched.priority},
          ${JSON.stringify(enriched.variables)}
        )
        RETURNING id
      `

      enriched.log_id = log.id

      await queue.add('send', enriched, {
        priority: PRIORITY_MAP[enriched.priority],
        jobId:    dedupKey,
      })
    },
  })

  const shutdown = async () => {
    await consumer.disconnect()
    await worker.close()
    await queue.close()
  }

  return { consumer, shutdown }
}

// ─── Envoi effectif avec cascade de fallback ──────────────

async function processNotification(job: Job<NotifJob>, db: postgres.Sql): Promise<void> {
  const data = job.data
  let sent = false
  let lastError = ''

  for (const canal of data.channels) {
    if (sent) break

    // Vérifier les préférences de l'utilisateur
    if (data.recipient_id) {
      const [pref] = await db`
        SELECT actif, whatsapp_optin FROM user_notification_prefs
        WHERE user_id = ${data.recipient_id} AND canal = ${canal}
      `
      if (pref && !pref.actif) continue
      if (canal === 'WHATSAPP' && pref && !pref.whatsapp_optin) continue
    }

    // Charger le template
    const [template] = await db`
      SELECT corps, sujet, waba_template_name FROM notification_templates
      WHERE code = ${data.template} AND canal = ${canal} AND langue = 'fr' AND actif = true
    `
    if (!template) continue

    const body = renderTemplate(template.corps, data.variables)
    let result: ChannelResult

    try {
      switch (canal) {
        case 'WHATSAPP':
          result = await sendWhatsApp({
            to:           data.recipient_phone!,
            templateName: template.waba_template_name ?? data.template,
            variables:    data.variables,
            body,
          })
          break
        case 'PUSH':
          result = await sendPush({ token: data.fcm_token!, title: template.sujet ?? '', body })
          break
        case 'EMAIL':
          result = await sendEmail({ to: data.recipient_email!, subject: template.sujet ?? data.template, html: body })
          break
        case 'SMS':
          result = await sendSMS({ to: data.recipient_phone!, body })
          break
        default:
          continue
      }

      if (result.success) {
        sent = true
        await db`
          UPDATE notification_logs
          SET statut = 'ENVOYE', provider_ref = ${result.provider_ref ?? null},
              sent_at = NOW(), tentatives = ${job.attemptsMade + 1}
          WHERE id = ${data.log_id}
        `
      } else {
        lastError = result.error ?? 'Unknown error'
      }
    } catch (err) {
      lastError = String(err)
      console.error(`[notification-worker] Channel ${canal} failed:`, lastError)
    }
  }

  if (!sent) {
    await db`
      UPDATE notification_logs
      SET statut = 'ECHEC', erreur = ${lastError}, tentatives = ${job.attemptsMade + 1}
      WHERE id = ${data.log_id}
    `
    throw new Error(`All channels failed. Last error: ${lastError}`)
  }
}

// ─── Enrichissement du job avec les coordonnées ───────────

async function enrichJob(job: NotifJob, db: postgres.Sql): Promise<NotifJob | null> {
  if (!job.eleve_id) return job

  // Charger phone/email du responsable légal principal
  const [contact] = await db`
    SELECT
      r.user_id,
      p.fcm_token,
      p.whatsapp_optin
    FROM responsables_legaux r
    LEFT JOIN user_notification_prefs p ON p.user_id = r.user_id AND p.canal = 'PUSH'
    WHERE r.eleve_id = ${job.eleve_id}
      AND r.est_contact_urgence = true
    LIMIT 1
  `.catch(() => []) as unknown as { user_id: string; fcm_token: string | null; whatsapp_optin: boolean }[]

  // Note: telephone_principal est chiffré (BYTEA) — déchiffrement géré en app layer
  // Dans une implémentation réelle, appel à l'API core-admin-service pour les contacts déchiffrés
  // Ici on simule l'enrichissement pour l'architecture

  return {
    ...job,
    recipient_id: contact?.user_id,
    fcm_token:    contact?.fcm_token ?? undefined,
    // recipient_phone et recipient_email seraient déchiffrés ici
  }
}

// ─── Moteur de templates ──────────────────────────────────

export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`)
}
