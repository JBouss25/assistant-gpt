/**
 * Canal Push — Firebase Cloud Messaging (FCM) via firebase-admin SDK
 *
 * Prérequis : Service account JSON Firebase dans FIREBASE_SERVICE_ACCOUNT_JSON
 * Documentation : https://firebase.google.com/docs/cloud-messaging
 */

import { getMessaging, type TokenMessage } from 'firebase-admin/messaging'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import type { ChannelResult } from './whatsapp.js'

let firebaseInitialized = false

function ensureFirebase(): void {
  if (firebaseInitialized || getApps().length > 0) return

  const serviceAccountJson = process.env['FIREBASE_SERVICE_ACCOUNT_JSON']
  if (!serviceAccountJson) {
    console.warn('[push] FIREBASE_SERVICE_ACCOUNT_JSON not set — FCM disabled')
    return
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson) as object
    initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]) })
    firebaseInitialized = true
  } catch (err) {
    console.error('[push] Failed to initialize Firebase:', err)
  }
}

export type PushParams = {
  token: string
  title: string
  body:  string
  data?: Record<string, string>
}

export async function sendPush(params: PushParams): Promise<ChannelResult> {
  ensureFirebase()

  if (!firebaseInitialized && getApps().length === 0) {
    return { success: false, error: 'Firebase non configuré' }
  }
  if (!params.token) {
    return { success: false, error: 'FCM token manquant' }
  }

  const message: TokenMessage = {
    token: params.token,
    notification: {
      title: params.title,
      body:  params.body,
    },
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'erp_alerts' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
    ...(params.data ? { data: params.data } : {}),
  }

  try {
    const messageId = await getMessaging().send(message)
    return { success: true, provider_ref: messageId }
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string }
    // Token invalide/expiré — ne pas reessayer
    if (error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token') {
      return { success: false, error: `Invalid FCM token: ${error.code}` }
    }
    return { success: false, error: error.message ?? String(err) }
  }
}
