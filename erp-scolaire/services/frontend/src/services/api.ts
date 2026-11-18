const BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const KC_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080'
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID ?? 'erp-frontend'
const REALM = 'erp-scolaire'
const REDIRECT_URI = `${window.location.origin}/login`

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function randomBase64Url(length: number): string {
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function sha256Base64Url(plain: string): Promise<string> {
  const enc = new TextEncoder().encode(plain)
  const digest = await crypto.subtle.digest('SHA-256', enc)
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Auth functions ────────────────────────────────────────────────────────────

export async function login(): Promise<void> {
  const verifier = randomBase64Url(64)
  const challenge = await sha256Base64Url(verifier)
  const state = randomBase64Url(16)
  localStorage.setItem('pkce_verifier', verifier)
  localStorage.setItem('pkce_state', state)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })
  window.location.href = `${KC_URL}/realms/${REALM}/protocol/openid-connect/auth?${params}`
}

export async function handleCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  if (!code) return false

  const storedState = localStorage.getItem('pkce_state')
  if (storedState && storedState !== state) return false

  const verifier = localStorage.getItem('pkce_verifier') ?? ''
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
    code_verifier: verifier,
  })

  const res = await fetch(`${KC_URL}/realms/${REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) return false

  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  localStorage.setItem('erp_token', data.access_token)
  localStorage.setItem('erp_refresh_token', data.refresh_token)
  localStorage.setItem('erp_token_exp', String(Date.now() + data.expires_in * 1000))
  localStorage.removeItem('pkce_verifier')
  localStorage.removeItem('pkce_state')
  return true
}

export async function refreshToken(): Promise<boolean> {
  const rt = localStorage.getItem('erp_refresh_token')
  if (!rt) return false

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: rt,
  })
  const res = await fetch(`${KC_URL}/realms/${REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    localStorage.removeItem('erp_token')
    return false
  }
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  localStorage.setItem('erp_token', data.access_token)
  localStorage.setItem('erp_refresh_token', data.refresh_token)
  localStorage.setItem('erp_token_exp', String(Date.now() + data.expires_in * 1000))
  return true
}

export function logout(): void {
  const token = localStorage.getItem('erp_token')
  localStorage.removeItem('erp_token')
  localStorage.removeItem('erp_refresh_token')
  localStorage.removeItem('erp_token_exp')
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: `${window.location.origin}/login`,
    id_token_hint: token ?? '',
  })
  window.location.href = `${KC_URL}/realms/${REALM}/protocol/openid-connect/logout?${params}`
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem('erp_token')
  if (!token) return false
  const exp = Number(localStorage.getItem('erp_token_exp') ?? 0)
  return exp > Date.now() + 30_000
}

function authHeader(): HeadersInit {
  const token = localStorage.getItem('erp_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { ...authHeader() } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface DashboardData {
  schoolId: string
  attendance: {
    total_eleves: number
    absents_aujourd_hui: number
    taux_presence_jour: number
    absences_semaine: number
    top_absentees: { eleve_id: string; nom: string; count: number }[]
  }
  grades: {
    moyenne_ecole: number
    distribution: { tranche: string; count: number }[]
    matieres_faibles: { matiere: string; moyenne: number }[]
  }
  finance: {
    total_attendu_mois: number
    total_encaisse_mois: number
    taux_recouvrement: number
    impayees_montant: number
  }
  lms: {
    taux_completion_moyen: number
    cours_publies: number
    devoirs_en_attente: number
    soumissions_a_temps: number
  }
}

export const getDashboard = (schoolId: string) =>
  get<DashboardData>(`/api/v1/dashboard/${schoolId}`)

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function* streamChat(
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const res = await fetch(`${BASE}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ messages, stream: true }),
  })
  if (!res.ok || !res.body) throw new Error(`${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data) as { text: string }
        yield parsed.text
      } catch { /* skip malformed */ }
    }
  }
}

// ── AI Predictions ───────────────────────────────────────────────────────────

export interface RiskResult {
  eleve_id: string
  risk_score: number
  risk_level: 'FAIBLE' | 'MOYEN' | 'ELEVE'
  top_factors: string[]
}

export const getRisk = (eleveId: string) =>
  get<RiskResult>(`/api/v1/predictions/${eleveId}`)

export const batchRisk = (eleveIds: string[]) =>
  post<{ results: RiskResult[]; total: number }>('/api/v1/predictions/batch', { eleve_ids: eleveIds })
