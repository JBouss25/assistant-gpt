import fp from 'fastify-plugin'
import fjwt from '@fastify/jwt'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export type JwtPayload = {
  sub: string
  email: string
  realm_access: { roles: string[] }
  school_id?: string
  exp: number
  iat: number
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (...roles: string[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    jwtPayload: JwtPayload
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  // En production : récupérer la clé publique depuis Keycloak JWKS
  // En dev : utiliser la clé symétrique pour simplifier
  await app.register(fjwt, {
    secret: { public: process.env['JWT_PUBLIC_KEY'] ?? process.env['JWT_SECRET']! },
    verify: { algorithms: ['RS256', 'HS256'] },
  })

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
      req.jwtPayload = req.user as JwtPayload
    } catch (err) {
      reply.status(401).send({
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Token invalide ou expiré', details: null },
      })
    }
  })

  app.decorate('requireRole', (...roles: string[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(req, reply)
      if (reply.sent) return

      const userRoles = req.jwtPayload.realm_access?.roles ?? []
      const hasRole = roles.some((r) => userRoles.includes(r))

      if (!hasRole) {
        reply.status(403).send({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Permissions insuffisantes', details: null },
        })
      }
    }
  })
})
