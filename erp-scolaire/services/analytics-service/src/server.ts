import { buildApp } from './app.js'

const PORT = Number(process.env.PORT ?? 3010)

async function start() {
  const app = await buildApp()
  await app.listen({ port: PORT, host: '0.0.0.0' })
  app.log.info(`analytics-service listening on port ${PORT}`)

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received — shutting down`)
    await app.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
