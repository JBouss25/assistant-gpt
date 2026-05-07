import fp from 'fastify-plugin'
import postgres from 'postgres'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    db: postgres.Sql
  }
}

export const dbPlugin = fp(async (app: FastifyInstance) => {
  const sql = postgres(process.env['DATABASE_URL']!, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
    transform: { undefined: null },
    onnotice: (notice) => app.log.debug({ notice }, 'pg notice'),
  })

  // Vérification de la connexion au démarrage
  await sql`SELECT 1`
  app.log.info('PostgreSQL connected')

  app.decorate('db', sql)

  app.addHook('onClose', async () => {
    await sql.end()
    app.log.info('PostgreSQL disconnected')
  })
})
