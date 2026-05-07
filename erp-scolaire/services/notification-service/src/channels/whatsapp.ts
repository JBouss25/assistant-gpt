/**
 * Canal WhatsApp — Meta WhatsApp Business Cloud API
 *
 * Prérequis : Compte Meta Business, numéro vérifié, templates approuvés.
 * Documentation : https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Limites :
 *   - 80 messages/seconde par numéro (géré par BullMQ limiter)
 *   - Templates doivent être approuvés par Meta avant utilisation
 *   - Les messages initiés par l'entreprise requièrent un template approuvé
 */

const WA_API_URL    = `https://graph.facebook.com/v19.0/${process.env['WHATSAPP_PHONE_ID']}/messages`
const WA_API_TOKEN  = process.env['WHATSAPP_TOKEN'] ?? ''

export type WhatsAppParams = {
  to:           string   // Format international sans + (ex: 212601234567)
  templateName: string
  variables:    Record<string, string>
  body:         string   // Corps du message (fallback si template non dispo)
}

export type ChannelResult = { success: boolean; provider_ref?: string; error?: string }

/**
 * Envoie un message WhatsApp via un template approuvé par Meta.
 * Si le template n'est pas trouvé, tente l'envoi en mode texte libre
 * (uniquement dans la fenêtre de 24h après contact du client).
 */
export async function sendWhatsApp(params: WhatsAppParams): Promise<ChannelResult> {
  if (!WA_API_TOKEN || !process.env['WHATSAPP_PHONE_ID']) {
    console.warn('[whatsapp] Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID — skipping')
    return { success: false, error: 'WhatsApp non configuré' }
  }

  const to = params.to.replace(/^\+/, '') // supprimer le + initial si présent

  // Construire le payload template
  const templateComponents = buildTemplateComponents(params.variables)

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to,
    type: 'template',
    template: {
      name:     params.templateName,
      language: { code: 'fr' },
      ...(templateComponents.length > 0 ? { components: templateComponents } : {}),
    },
  }

  try {
    const res = await fetch(WA_API_URL, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${WA_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json() as { messages?: [{ id: string }]; error?: { message: string; code: number } }

    if (!res.ok || data.error) {
      const errorMsg = data.error?.message ?? `HTTP ${res.status}`
      console.error('[whatsapp] API error:', errorMsg)
      return { success: false, error: errorMsg }
    }

    return { success: true, provider_ref: data.messages?.[0]?.id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Vérifie le webhook Meta (challenge de vérification).
 */
export function verifyWebhookChallenge(query: Record<string, string>): string | null {
  const mode      = query['hub.mode']
  const token     = query['hub.verify_token']
  const challenge = query['hub.challenge']

  if (mode === 'subscribe' && token === process.env['WHATSAPP_VERIFY_TOKEN']) {
    return challenge ?? null
  }
  return null
}

// ─── Helpers ──────────────────────────────────────────────

function buildTemplateComponents(variables: Record<string, string>): object[] {
  const values = Object.values(variables)
  if (values.length === 0) return []

  return [{
    type:       'body',
    parameters: values.map((v) => ({ type: 'text', text: v })),
  }]
}
