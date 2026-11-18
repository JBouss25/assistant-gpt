import { describe, it, expect } from 'vitest'

// ── Unit-testable pure helpers extracted from claude-client ───────────────────

function truncateHistory(
  messages: { role: string; content: string }[],
  maxTurns: number,
): { role: string; content: string }[] {
  if (messages.length <= maxTurns) return messages
  // Always keep the last maxTurns messages, ensuring user starts first
  const sliced = messages.slice(-maxTurns)
  return sliced[0].role === 'assistant' ? sliced.slice(1) : sliced
}

function buildContextHeader(schoolContext: string, userMessage: string): string {
  return `[CONTEXTE ÉCOLE]\n${schoolContext}\n[/CONTEXTE]\n\n${userMessage}`
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('truncateHistory', () => {
  const msgs = [
    { role: 'user', content: 'msg1' },
    { role: 'assistant', content: 'resp1' },
    { role: 'user', content: 'msg2' },
    { role: 'assistant', content: 'resp2' },
    { role: 'user', content: 'msg3' },
  ]

  it('returns all messages when under limit', () => {
    expect(truncateHistory(msgs, 10)).toHaveLength(5)
  })

  it('truncates to maxTurns', () => {
    const result = truncateHistory(msgs, 3)
    expect(result).toHaveLength(3)
  })

  it('never starts with assistant turn', () => {
    const result = truncateHistory(msgs, 4)
    expect(result[0].role).toBe('user')
  })
})

describe('buildContextHeader', () => {
  it('wraps school context and appends user message', () => {
    const result = buildContextHeader('École: test', 'Quelle est ma moyenne?')
    expect(result).toContain('[CONTEXTE ÉCOLE]')
    expect(result).toContain('École: test')
    expect(result).toContain('[/CONTEXTE]')
    expect(result).toContain('Quelle est ma moyenne?')
  })

  it('places context before user message', () => {
    const result = buildContextHeader('ctx', 'question')
    expect(result.indexOf('[CONTEXTE ÉCOLE]')).toBeLessThan(result.indexOf('question'))
  })
})

describe('estimateTokens', () => {
  it('estimates roughly 4 chars per token', () => {
    expect(estimateTokens('1234')).toBe(1)
    expect(estimateTokens('12345678')).toBe(2)
  })

  it('rounds up partial tokens', () => {
    expect(estimateTokens('123')).toBe(1)
    expect(estimateTokens('12345')).toBe(2)
  })
})
