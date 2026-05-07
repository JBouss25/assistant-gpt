import type { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

import { dbPlugin } from './plugins/db.js'
import { redisPlugin } from './plugins/redis.js'
import { kafkaPlugin } from './plugins/kafka.js'
import { authPlugin } from './plugins/auth.js'

import { healthRoutes } from './routes/health.js'
import { schoolRoutes } from './routes/schools.js'
import { studentRoutes } from './routes/students.js'
import { teacherRoutes } from './routes/teachers.js'
import { classRoutes } from './routes/classes.js'
import { enrollmentRoutes } from './routes/enrollments.js'

export async function buildApp(app: FastifyInstance): Promise<FastifyInstance> {
  // ── Security headers ───────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  })

  await app.register(cors, {
    origin: (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3000').split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-School-ID', 'X-Request-ID'],
    credentials: true,
  })

  // ── Rate limiting ──────────────────────────────────────
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.headers['x-forwarded-for']?.toString() ?? req.ip,
  })

  // ── OpenAPI docs (dev only) ────────────────────────────
  if (process.env['NODE_ENV'] !== 'production') {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'Core Admin Service API',
          description: 'Gestion administrative — ERP Scolaire 360°',
          version: '1.0.0',
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
        security: [{ bearerAuth: [] }],
      },
    })

    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
    })
  }

  // ── Infrastructure plugins ─────────────────────────────
  await app.register(dbPlugin)
  await app.register(redisPlugin)
  await app.register(kafkaPlugin)
  await app.register(authPlugin)

  // ── Routes ─────────────────────────────────────────────
  await app.register(healthRoutes)
  await app.register(schoolRoutes,    { prefix: '/api/v1' })
  await app.register(studentRoutes,   { prefix: '/api/v1' })
  await app.register(teacherRoutes,   { prefix: '/api/v1' })
  await app.register(classRoutes,     { prefix: '/api/v1' })
  await app.register(enrollmentRoutes, { prefix: '/api/v1' })

  // ── Global error handler ───────────────────────────────
  app.setErrorHandler((error, _req, reply) => {
    const statusCode = error.statusCode ?? 500

    if (statusCode >= 500) {
      app.log.error({ err: error }, 'Unhandled error')
    }

    reply.status(statusCode).send({
      success: false,
      data: null,
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: statusCode < 500 ? error.message : 'Une erreur interne est survenue',
        details: (error as { validation?: unknown }).validation ?? null,
      },
    })
  })

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Route introuvable', details: null },
    })
  })

  return app
}
