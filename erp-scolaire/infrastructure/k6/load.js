/**
 * k6 Load Test — ERP Scolaire 360°
 * Simule la charge d'un établissement de 1500 élèves en heure de pointe.
 *
 * Profil:
 *   - Rampe de 0 → 50 VUs sur 2 min
 *   - Maintien à 50 VUs pendant 5 min
 *   - Descente de 50 → 0 VUs sur 2 min
 *
 * SLOs visés:
 *   - p(95) < 500ms pour les lectures
 *   - p(95) < 2000ms pour les écritures
 *   - Taux d'erreur < 1%
 *
 * Usage: k6 run --env BASE_URL=http://localhost:8000 --env JWT_TOKEN=<token> infrastructure/k6/load.js
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000'
const JWT      = __ENV.JWT_TOKEN || ''
const SCHOOL_ID = __ENV.SCHOOL_ID || '00000000-0000-0000-0000-000000000001'

const errorRate  = new Rate('custom_error_rate')
const readP95    = new Trend('read_duration_p95', true)
const writeP95   = new Trend('write_duration_p95', true)

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // montée en charge
    { duration: '5m', target: 50 },   // charge soutenue
    { duration: '2m', target: 0 },    // descente
  ],
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    custom_error_rate: ['rate<0.01'],
    read_duration_p95: ['p(95)<500'],
    write_duration_p95:['p(95)<2000'],
  },
}

const headers = () => ({
  Authorization: `Bearer ${JWT}`,
  'Content-Type': 'application/json',
  'X-School-ID': SCHOOL_ID,
})

export default function () {
  // Répartition réaliste : 70% lectures, 20% écritures, 10% dashboard
  const roll = Math.random()

  if (roll < 0.35) {
    group('lectures_attendances', () => {
      const res = http.get(`${BASE_URL}/api/v1/attendance`, { headers: headers() })
      const ok = check(res, { 'attendance 200': (r) => r.status === 200 })
      errorRate.add(!ok)
      readP95.add(res.timings.duration)
    })
  } else if (roll < 0.55) {
    group('lectures_notes', () => {
      const res = http.get(`${BASE_URL}/api/v1/grades`, { headers: headers() })
      const ok = check(res, { 'grades 200': (r) => r.status === 200 })
      errorRate.add(!ok)
      readP95.add(res.timings.duration)
    })
  } else if (roll < 0.70) {
    group('lectures_cours', () => {
      const res = http.get(`${BASE_URL}/api/v1/cours`, { headers: headers() })
      const ok = check(res, { 'cours 200': (r) => r.status === 200 })
      errorRate.add(!ok)
      readP95.add(res.timings.duration)
    })
  } else if (roll < 0.80) {
    group('ecriture_pointage', () => {
      const payload = JSON.stringify({
        eleve_id: `00000000-0000-0000-0000-${String(randomIntBetween(1, 1500)).padStart(12, '0')}`,
        classe_id: `00000000-0000-0000-0000-000000000001`,
        school_id: SCHOOL_ID,
        date: new Date().toISOString().split('T')[0],
        present: true,
      })
      const res = http.post(`${BASE_URL}/api/v1/attendance`, payload, { headers: headers() })
      const ok = check(res, { 'pointage 2xx': (r) => r.status < 300 })
      errorRate.add(!ok)
      writeP95.add(res.timings.duration)
    })
  } else if (roll < 0.90) {
    group('dashboard_kpi', () => {
      const res = http.get(`${BASE_URL}/api/v1/dashboard/${SCHOOL_ID}`, { headers: headers() })
      const ok = check(res, { 'dashboard 200': (r) => r.status === 200 })
      errorRate.add(!ok)
      readP95.add(res.timings.duration)
    })
  } else {
    group('chat_bot', () => {
      const payload = JSON.stringify({
        messages: [{ role: 'user', content: 'Quelle est la moyenne de ma classe ?' }],
        stream: false,
      })
      const res = http.post(`${BASE_URL}/api/v1/chat`, payload, {
        headers: headers(),
        timeout: '30s',
      })
      const ok = check(res, { 'chat 200': (r) => r.status === 200 })
      errorRate.add(!ok)
      writeP95.add(res.timings.duration)
    })
  }

  sleep(randomIntBetween(1, 3))
}
