/**
 * Service QR Code pour le pointage d'assiduité.
 *
 * Modèle de sécurité :
 *   1. L'enseignant génère un token pour sa session (emploi_du_temps_id + date)
 *   2. Le token est signé HMAC-SHA256 avec le secret de l'établissement
 *   3. TTL configurable (défaut 90 min = durée d'un cours + marge)
 *   4. Le QR Code encode une URL deep-link : erp://scan?t=<token>
 *   5. À la validation : vérification signature + TTL + unicité du scan par élève
 */
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'crypto'
import QRCode from 'qrcode'

const HMAC_SECRET = process.env['QR_HMAC_SECRET'] ?? process.env['ENCRYPTION_KEY'] ?? 'fallback-dev-secret'
const DEFAULT_TTL_MINUTES = 90

export type QRTokenPayload = {
  eid: string   // emploi_du_temps_id
  cid: string   // classe_id
  d:   string   // date (YYYY-MM-DD)
  exp: number   // expiration unix timestamp (seconds)
  sid: string   // school_id
}

/**
 * Génère un token signé encodé en base64url.
 * Format: base64url(JSON payload) + '.' + base64url(HMAC signature)
 */
export function generateToken(payload: Omit<QRTokenPayload, 'exp'>, ttlMinutes = DEFAULT_TTL_MINUTES): string {
  const exp = Math.floor(Date.now() / 1000) + ttlMinutes * 60
  const fullPayload: QRTokenPayload = { ...payload, exp }

  const nonce = randomBytes(8).toString('hex') // anti-prédiction
  const data = Buffer.from(JSON.stringify({ ...fullPayload, nonce })).toString('base64url')
  const sig  = createHmac('sha256', HMAC_SECRET).update(data).digest('base64url')

  return `${data}.${sig}`
}

/**
 * Vérifie un token. Retourne le payload si valide, null sinon.
 */
export function verifyToken(token: string): QRTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  const [data, sig] = parts

  // Vérification de la signature (timing-safe)
  const expectedSig = createHmac('sha256', HMAC_SECRET).update(data).digest('base64url')
  const sigBuf = Buffer.from(sig, 'base64url')
  const expBuf = Buffer.from(expectedSig, 'base64url')

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null

  let payload: QRTokenPayload
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as QRTokenPayload
  } catch {
    return null
  }

  // Vérification TTL
  if (payload.exp < Math.floor(Date.now() / 1000)) return null

  return payload
}

/**
 * Hash un token pour stockage en BDD (ne jamais stocker le token brut).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Génère le QR Code en Data URL PNG (pour affichage navigateur/app).
 */
export async function generateQRCodeImage(token: string, schoolId: string): Promise<string> {
  const deepLink = `erpscolaire://scan?school=${schoolId}&t=${encodeURIComponent(token)}`
  return QRCode.toDataURL(deepLink, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
    color: { dark: '#1a1a2e', light: '#ffffff' },
  })
}

/**
 * Génère le QR Code en SVG (léger, vectoriel — pour affichage projecteur).
 */
export async function generateQRCodeSVG(token: string, schoolId: string): Promise<string> {
  const deepLink = `erpscolaire://scan?school=${schoolId}&t=${encodeURIComponent(token)}`
  return QRCode.toString(deepLink, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })
}
