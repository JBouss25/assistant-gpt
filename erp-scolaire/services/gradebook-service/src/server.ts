import Fastify from 'fastify'
import { buildApp } from './app.js'

const server = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
    transport: process.env['NODE_ENV'] === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  },
  trustProxy: true,
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID(),
})

async function main() {
  try {
    await buildApp(server)
    await server.listen({ port: Number(process.env['PORT'] ?? 3005), host: '0.0.0.0' })
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

process.on('SIGINT',  async () => { await server.close(); process.exit(0) })
process.on('SIGTERM', async () => { await server.close(); process.exit(0) })

main()
