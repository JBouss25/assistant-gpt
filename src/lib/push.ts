import "server-only";
import { createSign } from "node:crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./supabase/env";

/**
 * Notifications push via Firebase Cloud Messaging (API HTTP v1), pour Android et iOS.
 *
 * Variables (serveur uniquement) :
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY  (compte de service Firebase)
 *   SUPABASE_SECRET_KEY  (lecture des jetons des destinataires)
 * Sans ces variables, les notifications sont simplement désactivées.
 */

export type PushPayload = { title: string; body: string; url: string };

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function config() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!projectId || !clientEmail || !privateKey || !secretKey || !SUPABASE_URL) return null;
  return { projectId, clientEmail, privateKey, secretKey };
}

export const isPushConfigured = () => config() !== null;

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** JWT signé (RS256) échangé contre un jeton d'accès Google. */
export function buildServiceAccountJwt(clientEmail: string, privateKey: string, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: clientEmail, scope: FCM_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(privateKey, "base64url");
  return `${header}.${claims}.${signature}`;
}

/** Corps d'un message FCM : notification visible + URL ouverte au toucher. */
export function buildFcmMessage(token: string, payload: PushPayload) {
  const body = payload.body.length > 180 ? `${payload.body.slice(0, 177)}…` : payload.body;
  return {
    message: {
      token,
      notification: { title: payload.title, body },
      data: { url: payload.url },
      android: { priority: "high", notification: { sound: "default" } },
      apns: { payload: { aps: { sound: "default" } } },
    },
  };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(clientEmail: string, privateKey: string) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildServiceAccountJwt(clientEmail, privateKey),
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/** Envoie une notification à tous les appareils d'un utilisateur. N'échoue jamais. */
export async function notifyUser(userId: string, payload: PushPayload) {
  const cfg = config();
  if (!cfg) return;
  try {
    const admin = createAdminClient(SUPABASE_URL, cfg.secretKey, { auth: { persistSession: false } });
    const { data: devices } = await admin.from("device_tokens").select("token").eq("user_id", userId);
    if (!devices?.length) return;

    const bearer = await accessToken(cfg.clientEmail, cfg.privateKey);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`;
    const stale: string[] = [];

    await Promise.all(
      devices.map(async ({ token }) => {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
          body: JSON.stringify(buildFcmMessage(token, payload)),
        });
        // 404 UNREGISTERED : appli désinstallée ou jeton expiré, on oublie le jeton.
        if (res.status === 404) stale.push(token);
      }),
    );
    if (stale.length) await admin.from("device_tokens").delete().in("token", stale);
  } catch (error) {
    console.error("[push] envoi impossible", error);
  }
}

/** Notifie les parents reliés à un élève. */
export async function notifyParentsOf(studentId: string, payload: PushPayload) {
  const cfg = config();
  if (!cfg) return;
  try {
    const admin = createAdminClient(SUPABASE_URL, cfg.secretKey, { auth: { persistSession: false } });
    const { data } = await admin.from("parent_links").select("parent_id").eq("student_id", studentId);
    await Promise.all((data ?? []).map((l) => notifyUser(l.parent_id as string, payload)));
  } catch (error) {
    console.error("[push] parents", error);
  }
}
