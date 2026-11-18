/**
 * Canal Email — Nodemailer avec transport SMTP (SendGrid ou SMTP custom)
 *
 * Variables d'environnement :
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 *   ou SENDGRID_API_KEY (priorité si défini)
 *
 * Documentation SendGrid : https://docs.sendgrid.com/for-developers/sending-email/smtp-api
 */

import nodemailer, { type Transporter } from 'nodemailer'
import type { ChannelResult } from './whatsapp.js'

let transporter: Transporter | null = null

function getTransporter(): Transporter | null {
  if (transporter) return transporter

  // SendGrid via SMTP
  if (process.env['SENDGRID_API_KEY']) {
    transporter = nodemailer.createTransport({
      host:   'smtp.sendgrid.net',
      port:   587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env['SENDGRID_API_KEY'],
      },
    })
    return transporter
  }

  // SMTP générique
  const host = process.env['SMTP_HOST']
  const user = process.env['SMTP_USER']
  const pass = process.env['SMTP_PASS']

  if (!host || !user || !pass) {
    console.warn('[email] SMTP not configured — email channel disabled')
    return null
  }

  transporter = nodemailer.createTransport({
    host,
    port:   parseInt(process.env['SMTP_PORT'] ?? '587', 10),
    secure: process.env['SMTP_PORT'] === '465',
    auth:   { user, pass },
    pool:   true,
    maxConnections: 5,
  })

  return transporter
}

export type EmailParams = {
  to:      string
  subject: string
  html:    string
  text?:   string  // fallback plain text
}

export async function sendEmail(params: EmailParams): Promise<ChannelResult> {
  const t = getTransporter()
  if (!t) return { success: false, error: 'Email non configuré' }

  const from = process.env['EMAIL_FROM'] ?? 'noreply@erp-scolaire.ma'

  try {
    const info = await t.sendMail({
      from,
      to:      params.to,
      subject: params.subject,
      html:    params.html,
      text:    params.text ?? params.html.replace(/<[^>]+>/g, ''),
    })

    return { success: true, provider_ref: info.messageId as string }
  } catch (err: unknown) {
    const error = err as { message?: string }
    return { success: false, error: error.message ?? String(err) }
  }
}
