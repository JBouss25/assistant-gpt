import type { FastifyInstance } from 'fastify'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', { logLevel: 'silent' }, async (_req, reply) => {
    const checks: Record<string, 'ok' | 'error'> = {}

    try {
      await app.db`SELECT 1`
      checks['database'] = 'ok'
    } catch {
      checks['database'] = 'error'
    }

    try {
      await app.redis.ping()
      checks['redis'] = 'ok'
    } catch {
      checks['redis'] = 'error'
    }

    const allOk = Object.values(checks).every((v) => v === 'ok')
    reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'healthy' : 'degraded',
      service: 'core-admin-service',
      version: '1.0.0',
      checks,
      timestamp: new Date().toISOString(),
    })
  })

  app.get('/health/ready', { logLevel: 'silent' }, async (_req, reply) => {
    reply.send({ ready: true })
  })
}
