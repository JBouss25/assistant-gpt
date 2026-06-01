import Fastify from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import postgres from 'postgres'
import { createClient } from 'redis'
import { dashboardRoutes } from './routes/dashboard.js'

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

  await app.register(helmet)
  await app.register(cors, {
    origin: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    methods: ['GET', 'DELETE', 'OPTIONS'],
  })
  await app.register(jwt, {
    secret: {
      public: (process.env.JWT_PUBLIC_KEY ?? '').replace(/\\n/g, '\n'),
    },
    verify: { algorithms: ['RS256'] },
  })

  const db = postgres({
    host: process.env.ANALYTICS_DB_HOST ?? 'postgres-analytics',
    port: Number(process.env.ANALYTICS_DB_PORT ?? 5432),
    database: process.env.ANALYTICS_DB_NAME ?? 'erp_analytics',
    username: process.env.ANALYTICS_DB_USER ?? 'erpanalytics',
    password: process.env.ANALYTICS_DB_PASSWORD ?? '',
    max: 10,
  })

  const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://redis:6379' })
  await redis.connect()

  app.decorate('db', db)
  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    await db.end()
    await redis.disconnect()
  })

  await app.register(dashboardRoutes, { prefix: '/api/v1' })

  app.get('/health', async () => ({ status: 'ok', service: 'analytics-service' }))

  return app
}
