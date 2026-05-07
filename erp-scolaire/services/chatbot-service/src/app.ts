import Fastify from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import postgres from 'postgres'
import { createClient } from 'redis'
import { chatRoutes } from './routes/chat.js'

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

  await app.register(helmet)
  await app.register(cors, {
    origin: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    methods: ['GET', 'POST', 'OPTIONS'],
  })
  await app.register(jwt, {
    secret: {
      public: (process.env.JWT_PUBLIC_KEY ?? '').replace(/\\n/g, '\n'),
    },
    verify: { algorithms: ['RS256'] },
  })

  const db = postgres({
    host: process.env.CHATBOT_DB_HOST ?? 'postgres-chatbot',
    port: Number(process.env.CHATBOT_DB_PORT ?? 5432),
    database: process.env.CHATBOT_DB_NAME ?? 'erp_chatbot',
    username: process.env.CHATBOT_DB_USER ?? 'erpchat',
    password: process.env.CHATBOT_DB_PASSWORD ?? '',
    max: 5,
  })

  const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://redis:6379' })
  await redis.connect()

  app.decorate('db', db)
  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    await db.end()
    await redis.disconnect()
  })

  await app.register(chatRoutes, { prefix: '/api/v1' })

  app.get('/health', async () => ({ status: 'ok', service: 'chatbot-service' }))

  return app
}
