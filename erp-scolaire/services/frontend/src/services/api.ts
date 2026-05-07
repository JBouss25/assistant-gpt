const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

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
