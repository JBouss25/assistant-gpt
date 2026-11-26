/**
 * Producteur d'événements de notification.
 *
 * Le notification-service (Mois 3) consomme ces événements et dispatche
 * via WhatsApp Business API → Push → SMS → Email (cascade de fallback).
 *
 * Ce module est également un consumer Kafka : il réagit aux absences
 * enregistrées et enrichit les événements avec les données du parent
 * (récupérées depuis le core-admin-service via l'API interne).
 */
import { Kafka, type Consumer, type Producer } from 'kafkajs'
import type postgres from 'postgres'

type AbsenceEvent = {
  absence_id: string
  school_id: string
  eleve_id: string
  type: 'ABSENCE' | 'RETARD' | 'EXCLUSION_COURS'
  date: string
  emploi_du_temps_id: string
  minutes_retard: number | null
}

type NotificationPayload = {
  school_id: string
  recipient_type: 'PARENT'
  eleve_id: string
  template: string
  variables: Record<string, string>
  channels: Array<'WHATSAPP' | 'PUSH' | 'SMS' | 'EMAIL'>
  priority: 'HIGH' | 'NORMAL' | 'LOW'
}

export async function startNotificationProducer(db: postgres.Sql, producer: Producer): Promise<Consumer> {
  const kafka = new Kafka({
    clientId: 'attendance-notification-enricher',
    brokers: (process.env['KAFKA_BROKERS'] ?? 'kafka:9092').split(','),
  })

  const consumer = kafka.consumer({ groupId: 'attendance-notification-group' })
  await consumer.connect()
  await consumer.subscribe({ topic: 'attendance.absence.enregistree', fromBeginning: false })
  await consumer.subscribe({ topic: 'attendance.absences.bulk',       fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return

      try {
        if (topic === 'attendance.absence.enregistree') {
          await handleSingleAbsence(JSON.parse(message.value.toString()) as AbsenceEvent, db, producer)
        } else {
          const bulk = JSON.parse(message.value.toString()) as { absences: AbsenceEvent[]; school_id: string; date: string }
          for (const absence of bulk.absences) {
            await handleSingleAbsence({ ...absence, school_id: bulk.school_id, date: bulk.date, emploi_du_temps_id: '', minutes_retard: null }, db, producer)
          }
        }
      } catch (err) {
        console.error('Failed to process notification event', err)
      }
    },
  })

  return consumer
}

async function handleSingleAbsence(event: AbsenceEvent, db: postgres.Sql, producer: Producer): Promise<void> {
  // Charger les données nécessaires : nom élève + téléphone parent
  // (cross-service read via BDD partagée en dev, ou API interne en prod)
  const [data] = await db`
    SELECT
      a.id AS absence_id,
      a.notif_parent_statut,
      c.heure_debut::text  AS heure_debut,
      c.jour
    FROM absences a
    JOIN emplois_du_temps e ON e.id = a.emploi_du_temps_id
    JOIN creneaux c          ON c.id = e.creneau_id
    WHERE a.id = ${event.absence_id}
  ` as { absence_id: string; notif_parent_statut: string; heure_debut: string; jour: string }[] | []

  if (!data || data.notif_parent_statut !== 'EN_ATTENTE') return

  const template = event.type === 'ABSENCE'     ? 'PARENT_ABSENCE_ALERT'
                 : event.type === 'RETARD'       ? 'PARENT_RETARD_ALERT'
                 : 'PARENT_EXCLUSION_ALERT'

  const notif: NotificationPayload = {
    school_id:      event.school_id,
    recipient_type: 'PARENT',
    eleve_id:       event.eleve_id,
    template,
    variables: {
      date:          event.date,
      heure:         data?.heure_debut ?? '',
      jour:          data?.jour ?? '',
      minutes_retard: String(event.minutes_retard ?? 0),
    },
    channels:  ['WHATSAPP', 'PUSH', 'EMAIL'],
    priority:  event.type === 'ABSENCE' ? 'HIGH' : 'NORMAL',
  }

  await producer.send({
    topic: 'notifications.send',
    messages: [{ key: event.eleve_id, value: JSON.stringify(notif) }],
  })

  // Marquer la notification comme émise
  await db`
    UPDATE absences
    SET notif_parent_statut = 'ENVOYE', notif_parent_envoyee_le = NOW()
    WHERE id = ${event.absence_id}
  `
}
