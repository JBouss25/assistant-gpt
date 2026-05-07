import { describe, it, expect, beforeAll } from 'vitest'
import { generateToken, verifyToken, hashToken } from '../services/qrcode.js'

beforeAll(() => {
  process.env['QR_HMAC_SECRET'] = 'test-secret-key-for-unit-tests-only'
})

const basePayload = {
  eid: 'edt-uuid-001',
  cid: 'classe-uuid-001',
  d:   '2026-09-01',
  sid: 'school-uuid-001',
}

describe('QR Token — generateToken / verifyToken', () => {
  it('generates a valid token and verifies it successfully', () => {
    const token = generateToken(basePayload, 60)
    const result = verifyToken(token)

    expect(result).not.toBeNull()
    expect(result?.eid).toBe(basePayload.eid)
    expect(result?.cid).toBe(basePayload.cid)
    expect(result?.sid).toBe(basePayload.sid)
    expect(result?.d).toBe(basePayload.d)
  })

  it('rejects a tampered token', () => {
    const token = generateToken(basePayload, 60)
    const tampered = token.slice(0, -5) + 'XXXXX'
    expect(verifyToken(tampered)).toBeNull()
  })

  it('rejects a token with invalid format', () => {
    expect(verifyToken('notavalidtoken')).toBeNull()
    expect(verifyToken('')).toBeNull()
    expect(verifyToken('a.b.c')).toBeNull()
  })

  it('rejects an expired token', async () => {
    // TTL de 0 minute → expire immédiatement
    const token = generateToken(basePayload, 0)
    // Attendre 1 seconde pour garantir l'expiration
    await new Promise((r) => setTimeout(r, 1100))
    expect(verifyToken(token)).toBeNull()
  })

  it('two tokens for the same payload are different (nonce)', () => {
    const t1 = generateToken(basePayload, 60)
    const t2 = generateToken(basePayload, 60)
    expect(t1).not.toBe(t2)
  })

  it('hashToken produces consistent SHA-256 hex output', () => {
    const token = generateToken(basePayload)
    const hash1 = hashToken(token)
    const hash2 = hashToken(token)

    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64)
    expect(hash1).toMatch(/^[0-9a-f]{64}$/)
  })
})
