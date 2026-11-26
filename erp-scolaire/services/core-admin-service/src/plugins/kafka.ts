import fp from 'fastify-plugin'
import { Kafka, type Producer } from 'kafkajs'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    kafkaProducer: Producer
  }
}

export const kafkaPlugin = fp(async (app: FastifyInstance) => {
  const kafka = new Kafka({
    clientId: 'core-admin-service',
    brokers: (process.env['KAFKA_BROKERS'] ?? 'kafka:9092').split(','),
    retry: { initialRetryTime: 300, retries: 8 },
  })

  const producer = kafka.producer({
    allowAutoTopicCreation: true,
    transactionTimeout: 30000,
  })

  await producer.connect()
  app.log.info('Kafka producer connected')

  app.decorate('kafkaProducer', producer)

  app.addHook('onClose', async () => {
    await producer.disconnect()
    app.log.info('Kafka producer disconnected')
  })
})
