import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import fp from 'fastify-plugin'
import postgres from 'postgres'
import { createClient, type RedisClientType } from 'redis'
import webhooksRoutes from './routes/webhooks.js'
import notificationsRoutes from './routes/notifications.js'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate:  (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole:   (...roles: string[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    user: { sub: string; school_id: string; roles: string[] }
  }
}

import type { FastifyRequest, FastifyReply } from 'fastify'

export async function buildApp(): Promise<{
  app: FastifyInstance
  db: postgres.Sql
  redis: RedisClientType
}> {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      transport: process.env['NODE_ENV'] === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
    },
  })

  await app.register(helmet, { global: true })
  await app.register(cors, {
    origin: (process.env['ALLOWED_ORIGINS'] ?? '').split(',').filter(Boolean),
    credentials: true,
  })
  await app.register(jwt, {
    secret: { public: process.env['JWT_PUBLIC_KEY'] ?? '' },
    verify: { algorithms: ['RS256'] },
  })

  // ── Auth decorators ──
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      reply.code(401).send({ success: false, error: 'Token invalide ou expiré' })
    }
  })

  app.decorate('requireRole', (...roles: string[]) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userRoles = (req.user as { roles?: string[] }).roles ?? []
      if (!roles.some(r => userRoles.includes(r))) {
        reply.code(403).send({ success: false, error: 'Permission insuffisante' })
      }
    }
  )

  // ── PostgreSQL ──
  const db = postgres({
    host:     process.env['NOTIF_DB_HOST']     ?? 'postgres',
    port:     parseInt(process.env['NOTIF_DB_PORT'] ?? '5432', 10),
    database: process.env['NOTIF_DB_NAME']     ?? 'erp_notifications',
    username: process.env['NOTIF_DB_USER']     ?? 'erp_notif',
    password: process.env['NOTIF_DB_PASSWORD'] ?? '',
    max:      10,
    idle_timeout: 30,
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: true } : false,
  })

  // ── Redis ──
  const redis = createClient({
    socket: {
      host:     process.env['REDIS_HOST']     ?? 'redis',
      port:     parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    },
    password: process.env['REDIS_PASSWORD'],
  }) as RedisClientType

  await redis.connect()

  // ── Routes ──
  await app.register(fp(async (f) => {
    await f.register(async (sub) => {
      await sub.register(webhooksRoutes)
    }, { prefix: '/webhooks' })

    await f.register(async (sub) => {
      await sub.register(notificationsRoutes, { db })
    }, { prefix: '/notifications' })
  }), { prefix: '/api/v1' })

  // ── Healthcheck ──
  app.get('/health', async () => {
    await db`SELECT 1`
    return { status: 'ok', service: 'notification-service', ts: new Date().toISOString() }
  })

  app.addHook('onClose', async () => {
    await redis.quit()
    await db.end()
  })

  return { app, db, redis }
}
