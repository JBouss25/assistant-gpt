import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 16
const AUTH_TAG_LEN = 16

function deriveKey(): Buffer {
  const rawKey = process.env['ENCRYPTION_KEY']!
  // Si fourni en hex (64 chars), utiliser directement
  if (rawKey.length === 64) return Buffer.from(rawKey, 'hex')
  // Sinon dériver avec scrypt
  return scryptSync(rawKey, 'erp-scolaire-salt', KEY_LEN) as Buffer
}

const KEY = deriveKey()

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format : iv(hex):authTag(hex):ciphertext(hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, dataHex] = ciphertext.split(':')
  if (!ivHex || !authTagHex || !dataHex) throw new Error('Invalid ciphertext format')
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(Buffer.from(dataHex, 'hex')) + decipher.final('utf8')
}

export function encryptNullable(value: string | null | undefined): string | null {
  return value != null ? encrypt(value) : null
}

export function decryptNullable(value: string | null | undefined): string | null {
  return value != null ? decrypt(value) : null
}
