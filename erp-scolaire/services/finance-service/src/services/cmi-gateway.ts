/**
 * CMI Maroc Payment Gateway
 *
 * CMI (Centre Monétique Interbancaire) est le principal acquéreur bancaire marocain.
 * Protocole : redirect 3DS vers la page de paiement CMI, puis webhook de retour.
 *
 * Flux :
 *   1. POST /payments/initiate → buildPaymentForm() → redirection vers CMI
 *   2. CMI redirige vers callbackUrl avec les paramètres de résultat
 *   3. POST /payments/webhook/cmi → verifyCallback() → mise à jour statut
 *
 * Référence : CMI Web Service Integration Guide v3.x
 */
import { createHash, createHmac } from 'crypto'

const CMI_BASE_URL  = process.env['CMI_BASE_URL']  ?? 'https://testpayment.cmi.co.ma/fim/est3Dgate'
const CMI_CLIENT_ID = process.env['CMI_CLIENT_ID'] ?? 'TEST_CLIENT'
const CMI_STORE_KEY = process.env['CMI_STORE_KEY'] ?? 'test_store_key'

export type CMIPaymentParams = {
  amount:       string     // Montant en MAD (ex: "1500.00")
  orderId:      string     // Référence facture unique
  description:  string
  callbackUrl:  string     // URL de retour après paiement
  okUrl:        string     // Redirection succès
  failUrl:      string     // Redirection échec
  lang:         'fr' | 'ar' | 'en'
  email:        string     // Email du payeur
}

export type CMIPaymentForm = {
  actionUrl: string
  fields:    Record<string, string>
}

export type CMICallbackResult = {
  success:       boolean
  orderId:       string
  transactionId: string
  amount:        string
  responseCode:  string  // '00' = succès
  errorMessage?: string
}

/**
 * Construit les paramètres du formulaire de paiement CMI.
 * Le navigateur soumet ce formulaire en POST vers la page CMI.
 */
export function buildCMIPaymentForm(params: CMIPaymentParams): CMIPaymentForm {
  const fields: Record<string, string> = {
    clientid:    CMI_CLIENT_ID,
    amount:      params.amount,
    oid:         params.orderId,
    okUrl:       params.okUrl,
    failUrl:     params.failUrl,
    callbackUrl: params.callbackUrl,
    lang:        params.lang,
    email:       params.email,
    currency:    '504',           // Code ISO MAD
    rnd:         Date.now().toString(),
    storetype:   '3D_PAY_HOSTING',
    trantype:    'PreAuth',
    hashAlgorithm: 'ver3',
  }

  // Calcul du hash de sécurité CMI (ver3 = HMAC-SHA512 sur les champs triés)
  fields['hash'] = computeCMIHash(fields)

  return { actionUrl: CMI_BASE_URL, fields }
}

/**
 * Vérifie l'authenticité du callback CMI via HMAC-SHA512.
 * À appeler sur le webhook avant toute mise à jour de BDD.
 */
export function verifyCMICallback(body: Record<string, string>): CMICallbackResult {
  const receivedHash = body['HASH'] ?? body['hash'] ?? ''

  // Recalculer le hash sans le champ HASH lui-même
  const { HASH: _, hash: __, ...fieldsToHash } = body
  const computed = computeCMIHash(fieldsToHash)

  if (computed !== receivedHash) {
    return {
      success: false,
      orderId: body['oid'] ?? '',
      transactionId: body['AuthCode'] ?? '',
      amount: body['amount'] ?? '0',
      responseCode: 'INVALID_HASH',
      errorMessage: 'Signature CMI invalide — callback rejeté',
    }
  }

  const responseCode = body['ProcReturnCode'] ?? ''
  const success = responseCode === '00'

  return {
    success,
    orderId:       body['oid'] ?? '',
    transactionId: body['AuthCode'] ?? body['TransId'] ?? '',
    amount:        body['amount'] ?? '0',
    responseCode,
    errorMessage:  success ? undefined : (body['ErrMsg'] ?? `Code erreur CMI: ${responseCode}`),
  }
}

function computeCMIHash(fields: Record<string, string>): string {
  // CMI ver3 : concaténation des valeurs triées par clé + store_key, puis HMAC-SHA512
  const sortedKeys = Object.keys(fields).sort()
  const hashStr    = sortedKeys.map((k) => fields[k] ?? '').join('|') + '|' + CMI_STORE_KEY
  return createHmac('sha512', CMI_STORE_KEY).update(hashStr).digest('base64')
}

// ─────────────────────────────────────────────────────────
// Stripe (paiements internationaux)
// ─────────────────────────────────────────────────────────

const STRIPE_SECRET_KEY     = process.env['STRIPE_SECRET_KEY']     ?? ''
const STRIPE_WEBHOOK_SECRET = process.env['STRIPE_WEBHOOK_SECRET'] ?? ''

export type StripeCheckoutParams = {
  amount:     number   // Centimes (ex: 150000 = 1500 MAD)
  currency:   string   // 'mad' ou 'eur'
  orderId:    string
  successUrl: string
  cancelUrl:  string
  metadata:   Record<string, string>
}

export async function createStripeCheckout(params: StripeCheckoutParams): Promise<{ url: string; sessionId: string }> {
  // Appel à l'API Stripe REST (évite la dépendance au SDK pour la légèreté)
  const body = new URLSearchParams({
    'payment_method_types[]':         'card',
    'line_items[0][price_data][currency]':                   params.currency,
    'line_items[0][price_data][unit_amount]':                String(params.amount),
    'line_items[0][price_data][product_data][name]':         `Facture ${params.orderId}`,
    'line_items[0][quantity]':                               '1',
    mode:           'payment',
    success_url:    params.successUrl,
    cancel_url:     params.cancelUrl,
    client_reference_id': params.orderId,
    ...Object.fromEntries(Object.entries(params.metadata).map(([k, v]) => [`metadata[${k}]`, v])),
  })

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.json() as { error: { message: string } }
    throw new Error(`Stripe error: ${err.error.message}`)
  }

  const session = await res.json() as { id: string; url: string }
  return { url: session.url, sessionId: session.id }
}

export function verifyStripeWebhook(payload: string, sigHeader: string): Record<string, unknown> {
  // Vérification HMAC-SHA256 du webhook Stripe
  const timestamp = sigHeader.split(',').find((p) => p.startsWith('t='))?.split('=')[1] ?? ''
  const signature = sigHeader.split(',').find((p) => p.startsWith('v1='))?.split('=')[1] ?? ''

  const signed   = `${timestamp}.${payload}`
  const expected = createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signed).digest('hex')

  if (expected !== signature) throw new Error('Webhook Stripe signature invalide')

  return JSON.parse(payload) as Record<string, unknown>
}
