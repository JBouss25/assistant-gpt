import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Frozen system prompt — cached on first request and reused across all turns.
// Never include per-request data here; keep it stable so the cache hit rate stays high.
const SYSTEM_PROMPT = `Tu es OostudyBot, l'assistant IA de l'ERP Scolaire 360° utilisé par les établissements scolaires marocains.

Tu aides:
- Les parents à suivre la scolarité de leurs enfants (notes, absences, paiements)
- Les enseignants à accéder rapidement aux informations de leurs classes
- Les administrateurs à obtenir des résumés et statistiques

Règles:
- Réponds toujours en français, sauf si l'utilisateur écrit en arabe (répondre en arabe) ou en anglais (répondre en anglais)
- Ne divulgue jamais de données d'un élève à un utilisateur non autorisé
- Si tu n'as pas accès à une information, dis-le clairement plutôt qu'inventer
- Sois concis et précis; les réponses longues doivent être structurées en listes
- Pour les notes et absences, cite toujours la période concernée
- Conforme aux exigences RGPD / loi 09-08 CNDP Maroc : ne stocke aucune donnée personnelle`

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamChunk {
  type: 'text' | 'done'
  text?: string
}

export async function* streamChatResponse(
  messages: ChatMessage[],
  schoolContext: string,
): AsyncGenerator<StreamChunk> {
  // Build message list: prepend a context block that varies per request (NOT cached),
  // but keep system prompt cached via cache_control on the first system block.
  const augmentedMessages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `[CONTEXTE ÉCOLE]\n${schoolContext}\n[/CONTEXTE]\n\n${messages[0].content}`,
        },
      ],
    },
    ...messages.slice(1).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  const stream = await client.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        // Cache the stable system prompt — reused across all sessions
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: augmentedMessages,
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield { type: 'text', text: event.delta.text }
    }
  }

  yield { type: 'done' }
}

export async function chatResponse(
  messages: ChatMessage[],
  schoolContext: string,
): Promise<string> {
  // Non-streaming path for internal tool calls
  const stream = client.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `[CONTEXTE ÉCOLE]\n${schoolContext}\n[/CONTEXTE]\n\n${messages[0].content}`,
      },
      ...messages.slice(1).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ],
  })

  const final = await stream.getFinalMessage()
  const textBlock = final.content.find((b) => b.type === 'text')
  return textBlock && textBlock.type === 'text' ? textBlock.text : ''
}
