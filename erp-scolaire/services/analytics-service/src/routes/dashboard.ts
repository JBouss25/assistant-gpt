import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  getAttendanceKPIs,
  getGradesKPIs,
  getFinanceKPIs,
  getLmsKPIs,
} from '../services/kpi-aggregator.js'

const SchoolParamSchema = z.object({ schoolId: z.string().uuid() })

export async function dashboardRoutes(app: FastifyInstance) {
  const authenticate = async (request: any) => {
    await request.jwtVerify()
    const user = request.user as { school_id: string; roles: string[] }
    if (!['directeur', 'admin', 'super_admin'].some((r) => user.roles?.includes(r))) {
      throw { statusCode: 403, message: 'Accès réservé aux administrateurs' }
    }
    return user
  }

  // ── Full dashboard (all KPIs) ──────────────────────────────────────────────
  app.get('/dashboard/:schoolId', async (request, reply) => {
    const user = await authenticate(request)
    const { schoolId } = SchoolParamSchema.parse((request as any).params)

    const [attendance, grades, finance, lms] = await Promise.all([
      getAttendanceKPIs(schoolId, (app as any).db, (app as any).redis),
      getGradesKPIs(schoolId, (app as any).db, (app as any).redis),
      getFinanceKPIs(schoolId, (app as any).db, (app as any).redis),
      getLmsKPIs(schoolId, (app as any).db, (app as any).redis),
    ])

    return reply.send({ schoolId, attendance, grades, finance, lms })
  })

  // ── Individual KPI panels ──────────────────────────────────────────────────
  app.get('/dashboard/:schoolId/attendance', async (request, reply) => {
    await authenticate(request)
    const { schoolId } = SchoolParamSchema.parse((request as any).params)
    return reply.send(await getAttendanceKPIs(schoolId, (app as any).db, (app as any).redis))
  })

  app.get('/dashboard/:schoolId/grades', async (request, reply) => {
    await authenticate(request)
    const { schoolId } = SchoolParamSchema.parse((request as any).params)
    return reply.send(await getGradesKPIs(schoolId, (app as any).db, (app as any).redis))
  })

  app.get('/dashboard/:schoolId/finance', async (request, reply) => {
    await authenticate(request)
    const { schoolId } = SchoolParamSchema.parse((request as any).params)
    return reply.send(await getFinanceKPIs(schoolId, (app as any).db, (app as any).redis))
  })

  app.get('/dashboard/:schoolId/lms', async (request, reply) => {
    await authenticate(request)
    const { schoolId } = SchoolParamSchema.parse((request as any).params)
    return reply.send(await getLmsKPIs(schoolId, (app as any).db, (app as any).redis))
  })

  // ── Cache invalidation (admin) ─────────────────────────────────────────────
  app.delete('/dashboard/:schoolId/cache', { schema: { response: { 204: {} } } }, async (request, reply) => {
    await authenticate(request)
    const { schoolId } = SchoolParamSchema.parse((request as any).params)
    const pattern = `analytics:*:${schoolId}*`
    const keys = await (app as any).redis.keys(pattern)
    if (keys.length > 0) await (app as any).redis.del(keys)
    return reply.status(204).send()
  })
}
