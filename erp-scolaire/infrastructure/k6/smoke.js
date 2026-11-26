/**
 * k6 Smoke Test — ERP Scolaire 360°
 * Objectif: vérifier que tous les endpoints critiques répondent sans erreur.
 * Usage: k6 run infrastructure/k6/smoke.js
 *
 * Variables d'environnement:
 *   BASE_URL   URL de base du Kong gateway (défaut: http://localhost:8000)
 *   JWT_TOKEN  Token JWT valide pour les endpoints authentifiés
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000'
const JWT      = __ENV.JWT_TOKEN || ''

const errorRate   = new Rate('error_rate')
const latencyP95  = new Trend('latency_p95', true)

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    error_rate: ['rate<0.05'],
  },
}

function authHeaders() {
  return JWT ? { Authorization: `Bearer ${JWT}` } : {}
}

export default function () {
  const headers = authHeaders()

  // ── Health checks (unauthenticated) ─────────────────────────────────────
  const healthEndpoints = [
    '/api/v1/health',
  ]
  // Direct health checks via service ports
  const serviceHealth = [
    { name: 'core-admin',      url: 'http://localhost:3001/health' },
    { name: 'timetable',       url: 'http://localhost:3002/health' },
    { name: 'attendance',      url: 'http://localhost:3003/health' },
    { name: 'finance',         url: 'http://localhost:3004/health' },
    { name: 'gradebook',       url: 'http://localhost:3005/health' },
    { name: 'lms',             url: 'http://localhost:3006/health' },
    { name: 'notification',    url: 'http://localhost:3007/health' },
    { name: 'ai-prediction',   url: 'http://localhost:3008/health' },
    { name: 'chatbot',         url: 'http://localhost:3009/health' },
    { name: 'analytics',       url: 'http://localhost:3010/health' },
  ]

  for (const svc of serviceHealth) {
    const res = http.get(svc.url)
    const ok = check(res, {
      [`${svc.name} health 200`]: (r) => r.status === 200,
    })
    errorRate.add(!ok)
    latencyP95.add(res.timings.duration)
    sleep(0.1)
  }

  if (!JWT) {
    console.warn('JWT_TOKEN non défini — tests authentifiés ignorés')
    return
  }

  // ── Authenticated API smoke ──────────────────────────────────────────────
  const apiChecks = [
    { name: 'GET /api/v1/schools',       url: `${BASE_URL}/api/v1/schools` },
    { name: 'GET /api/v1/attendance',    url: `${BASE_URL}/api/v1/attendance` },
    { name: 'GET /api/v1/grades',        url: `${BASE_URL}/api/v1/grades` },
    { name: 'GET /api/v1/cours',         url: `${BASE_URL}/api/v1/cours` },
    { name: 'GET /api/v1/notifications', url: `${BASE_URL}/api/v1/notifications` },
  ]

  for (const endpoint of apiChecks) {
    const res = http.get(endpoint.url, { headers })
    const ok = check(res, {
      [`${endpoint.name} not 5xx`]: (r) => r.status < 500,
    })
    errorRate.add(!ok)
    latencyP95.add(res.timings.duration)
    sleep(0.2)
  }
}
