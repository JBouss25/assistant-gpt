import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyWebhookChallenge } from '../channels/whatsapp.js'

describe('verifyWebhookChallenge', () => {
  beforeEach(() => {
    process.env['WHATSAPP_VERIFY_TOKEN'] = 'secret-token-123'
  })

  it('returns challenge when mode and token are correct', () => {
    const result = verifyWebhookChallenge({
      'hub.mode':         'subscribe',
      'hub.verify_token': 'secret-token-123',
      'hub.challenge':    'abc123challenge',
    })
    expect(result).toBe('abc123challenge')
  })

  it('returns null when token is wrong', () => {
    const result = verifyWebhookChallenge({
      'hub.mode':         'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge':    'abc123challenge',
    })
    expect(result).toBeNull()
  })

  it('returns null when mode is not subscribe', () => {
    const result = verifyWebhookChallenge({
      'hub.mode':         'unsubscribe',
      'hub.verify_token': 'secret-token-123',
      'hub.challenge':    'abc123challenge',
    })
    expect(result).toBeNull()
  })

  it('returns null when challenge is missing', () => {
    const result = verifyWebhookChallenge({
      'hub.mode':         'subscribe',
      'hub.verify_token': 'secret-token-123',
    })
    expect(result).toBeNull()
  })

  it('returns null when all params missing', () => {
    expect(verifyWebhookChallenge({})).toBeNull()
  })
})
