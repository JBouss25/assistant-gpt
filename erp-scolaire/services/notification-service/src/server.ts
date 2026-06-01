import { buildApp } from './app.js'
import { createDispatcher } from './services/dispatcher.js'

const PORT = parseInt(process.env['PORT'] ?? '3007', 10)

async function main(): Promise<void> {
  const { app, db, redis } = await buildApp()

  // Démarrer le dispatcher Kafka + BullMQ
  const { shutdown } = await createDispatcher(db, redis)

  await app.listen({ port: PORT, host: '0.0.0.0' })
  app.log.info(`[notification-service] listening on :${PORT}`)

  const stop = async (): Promise<void> => {
    app.log.info('Shutting down notification-service…')
    await shutdown()
    await app.close()
    process.exit(0)
  }

  process.on('SIGTERM', stop)
  process.on('SIGINT',  stop)
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
