import type { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'
import postgres from 'postgres'
import { createClient, type RedisClientType } from 'redis'
import { Kafka } from 'kafkajs'
import fjwt from '@fastify/jwt'
import type { FastifyRequest, FastifyReply } from 'fastify'

import { timetableRoutes } from './routes/timetable.js'
import { startGenerationWorker } from './services/generation-worker.js'

type JwtPayload = { sub: string; realm_access: { roles: string[] }; exp: number }

declare module 'fastify' {
  interface FastifyInstance {
    db: postgres.Sql
    redis: RedisClientType
    kafkaProducer: import('kafkajs').Producer
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (...roles: string[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest { jwtPayload: JwtPayload }
}

export async function buildApp(app: FastifyInstance): Promise<FastifyInstance> {
  await app.register(helmet)
  await app.register(cors, { origin: (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3000').split(','), credentials: true })
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' })

  // ── DB ─────────────────────────────────────────────────
  await app.register(fp(async (a) => {
    const sql = postgres(process.env['DATABASE_URL']!, { max: 15 })
    await sql`SELECT 1`
    a.decorate('db', sql)
    a.addHook('onClose', async () => sql.end())
  }))

  // ── Redis ──────────────────────────────────────────────
  await app.register(fp(async (a) => {
    const client = createClient({ url: process.env['REDIS_URL']! }) as RedisClientType
    await client.connect()
    a.decorate('redis', client)
    a.addHook('onClose', async () => client.quit())
  }))

  // ── Kafka Producer + Worker ────────────────────────────
  await app.register(fp(async (a) => {
    const kafka = new Kafka({ clientId: 'timetable-service', brokers: (process.env['KAFKA_BROKERS'] ?? 'kafka:9092').split(',') })
    const producer = kafka.producer()
    await producer.connect()
    a.decorate('kafkaProducer', producer)

    // Démarrer le worker de génération asynchrone
    const worker = await startGenerationWorker({ db: a.db, redis: a.redis, log: a.log })
    a.addHook('onClose', async () => { await producer.disconnect(); await worker.disconnect() })
  }))

  // ── Auth ───────────────────────────────────────────────
  await app.register(fjwt, { secret: { public: process.env['JWT_PUBLIC_KEY'] ?? process.env['JWT_SECRET']! }, verify: { algorithms: ['RS256', 'HS256'] } })

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try { await req.jwtVerify(); req.jwtPayload = req.user as JwtPayload }
    catch { reply.status(401).send({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'Token invalide', details: null } }) }
  })

  app.decorate('requireRole', (...roles: string[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply)
    if (reply.sent) return
    const userRoles = req.jwtPayload.realm_access?.roles ?? []
    if (!roles.some((r) => userRoles.includes(r))) {
      reply.status(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Permissions insuffisantes', details: null } })
    }
  })

  // ── Health ─────────────────────────────────────────────
  app.get('/health', { logLevel: 'silent' }, async (_req, reply) => {
    reply.send({ status: 'healthy', service: 'timetable-service', timestamp: new Date().toISOString() })
  })
  app.get('/health/ready', { logLevel: 'silent' }, async (_req, reply) => reply.send({ ready: true }))

  // ── Routes ─────────────────────────────────────────────
  await app.register(timetableRoutes, { prefix: '/api/v1' })

  app.setErrorHandler((error, _req, reply) => {
    const code = error.statusCode ?? 500
    if (code >= 500) app.log.error({ err: error })
    reply.status(code).send({ success: false, data: null, error: { code: error.code ?? 'INTERNAL_ERROR', message: code < 500 ? error.message : 'Erreur interne', details: null } })
  })

  return app
}
