/**
 * Canal SMS — Twilio REST API
 *
 * Variables d'environnement : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 * Documentation : https://www.twilio.com/docs/sms/api
 *
 * Numéros marocains : format international +212XXXXXXXXX
 */

import type { ChannelResult } from './whatsapp.js'

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01/Accounts'

export type SMSParams = {
  to:   string  // Format international +212XXXXXXXXX
  body: string
}

export async function sendSMS(params: SMSParams): Promise<ChannelResult> {
  const sid   = process.env['TWILIO_ACCOUNT_SID']
  const token = process.env['TWILIO_AUTH_TOKEN']
  const from  = process.env['TWILIO_FROM']

  if (!sid || !token || !from) {
    console.warn('[sms] Twilio not configured — SMS channel disabled')
    return { success: false, error: 'SMS non configuré' }
  }

  const to = params.to.startsWith('+') ? params.to : `+${params.to}`

  const body = new URLSearchParams({ To: to, From: from, Body: params.body })
  const credentials = Buffer.from(`${sid}:${token}`).toString('base64')

  try {
    const res = await fetch(`${TWILIO_BASE}/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization:  `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    const data = await res.json() as {
      sid?: string
      status?: string
      error_code?: number
      error_message?: string
    }

    if (!res.ok || data.error_code) {
      const msg = data.error_message ?? `HTTP ${res.status}`
      console.error('[sms] Twilio error:', msg)
      return { success: false, error: msg }
    }

    return { success: true, provider_ref: data.sid }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
