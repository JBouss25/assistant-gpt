import { buildApp } from './app.js'
import { closeProducer } from './services/kafka-producer.js'

const PORT = parseInt(process.env['PORT'] ?? '3006', 10)

async function main(): Promise<void> {
  const { app } = await buildApp()
  await app.listen({ port: PORT, host: '0.0.0.0' })
  app.log.info(`[lms-service] listening on :${PORT}`)

  const stop = async (): Promise<void> => {
    app.log.info('Shutting down lms-service…')
    await closeProducer()
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
