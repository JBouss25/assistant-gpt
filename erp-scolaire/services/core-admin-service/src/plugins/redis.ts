import fp from 'fastify-plugin'
import { createClient, type RedisClientType } from 'redis'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisClientType
  }
}

export const redisPlugin = fp(async (app: FastifyInstance) => {
  const client = createClient({ url: process.env['REDIS_URL']! }) as RedisClientType

  client.on('error', (err) => app.log.error({ err }, 'Redis error'))

  await client.connect()
  app.log.info('Redis connected')

  app.decorate('redis', client)

  app.addHook('onClose', async () => {
    await client.quit()
    app.log.info('Redis disconnected')
  })
})
