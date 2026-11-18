/**
 * Producteur Kafka — LMS events
 *
 * Topics produits :
 *   - lms.devoir.assigne   → Déclenche notification NOUVEAU_DEVOIR_LMS
 *   - lms.devoir.corrige   → Déclenche notification DEVOIR_CORRIGE
 *   - lms.cours.publie     → Déclenche notification (cours disponible)
 */

import { Kafka, type Producer, Partitioners } from 'kafkajs'

let producer: Producer | null = null

async function getProducer(): Promise<Producer> {
  if (producer) return producer

  const kafka = new Kafka({
    clientId: 'lms-service',
    brokers:  (process.env['KAFKA_BROKERS'] ?? 'kafka:9092').split(','),
  })

  producer = kafka.producer({
    createPartitioner: Partitioners.LegacyPartitioner,
    retry: { retries: 3 },
  })

  await producer.connect()
  return producer
}

export async function publishLMSEvent(topic: string, payload: object): Promise<void> {
  const p = await getProducer()
  await p.send({
    topic,
    messages: [{ value: JSON.stringify(payload) }],
  })
}

export async function closeProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect()
    producer = null
  }
}
