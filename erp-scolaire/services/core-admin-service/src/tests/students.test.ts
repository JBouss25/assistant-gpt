import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { buildApp } from '../app.js'

// ─── Mocks des plugins d'infrastructure ──────────────────

vi.mock('../plugins/db.js', () => ({
  dbPlugin: vi.fn(async (app) => {
    const mockQuery = vi.fn()
    app.decorate('db', Object.assign(mockQuery, {
      // Simuler le tag template literal de postgres.js
      ...new Proxy({}, {
        get: () => mockQuery,
      }),
    }))
  }),
}))

vi.mock('../plugins/redis.js', () => ({
  redisPlugin: vi.fn(async (app) => {
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), setEx: vi.fn(), del: vi.fn(), ping: vi.fn().mockResolvedValue('PONG') })
  }),
}))

vi.mock('../plugins/kafka.js', () => ({
  kafkaPlugin: vi.fn(async (app) => {
    app.decorate('kafkaProducer', { send: vi.fn() })
  }),
}))

vi.mock('../plugins/auth.js', () => ({
  authPlugin: vi.fn(async (app) => {
    app.decorate('authenticate', async (_req: unknown, _reply: unknown) => {})
    app.decorate('requireRole', (..._roles: string[]) => async (_req: unknown, _reply: unknown) => {})
  }),
}))

describe('Students API', () => {
  it('GET /health returns 200 with all checks', async () => {
    const server = Fastify({ logger: false })
    await buildApp(server)
    await server.ready()

    const res = await server.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('healthy')
    expect(body.service).toBe('core-admin-service')

    await server.close()
  })

  it('POST /api/v1/schools/:id/students returns 400 on invalid body', async () => {
    const server = Fastify({ logger: false })
    await buildApp(server)
    await server.ready()

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/schools/00000000-0000-0000-0000-000000000001/students',
      payload: { nom: 'A' }, // prenom et autres champs manquants
    })

    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(false)
    expect(body.error).toBeDefined()

    await server.close()
  })

  it('404 on unknown route', async () => {
    const server = Fastify({ logger: false })
    await buildApp(server)
    await server.ready()

    const res = await server.inject({ method: 'GET', url: '/api/v1/unknown-route' })
    expect(res.statusCode).toBe(404)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('NOT_FOUND')

    await server.close()
  })
})
