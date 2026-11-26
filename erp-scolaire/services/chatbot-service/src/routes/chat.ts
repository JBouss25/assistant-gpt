import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { streamChatResponse, chatResponse } from '../services/claude-client.js'
import { buildSchoolContext } from '../services/rag.js'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
})

const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50),
  stream: z.boolean().default(true),
})

export async function chatRoutes(app: FastifyInstance) {
  app.post('/chat', async (request, reply) => {
    await (request as any).jwtVerify()
    const user = (request as any).user as {
      sub: string
      school_id: string
      roles: string[]
      eleve_id?: string
      classe_id?: string
    }

    const body = ChatRequestSchema.parse(request.body)

    const role = user.roles?.find((r) =>
      ['eleve', 'parent', 'enseignant', 'directeur', 'admin'].includes(r),
    ) ?? 'parent'

    const ctx = {
      userId: user.sub,
      schoolId: user.school_id,
      role,
      eleveId: user.eleve_id,
      classeId: user.classe_id,
    }

    const schoolContext = await buildSchoolContext(ctx, (app as any).db)

    if (!body.stream) {
      const text = await chatResponse(body.messages, schoolContext)
      return reply.send({ role: 'assistant', content: text })
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    for await (const chunk of streamChatResponse(body.messages, schoolContext)) {
      if (chunk.type === 'text') {
        reply.raw.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`)
      } else {
        reply.raw.write('data: [DONE]\n\n')
        reply.raw.end()
      }
    }
  })
}
