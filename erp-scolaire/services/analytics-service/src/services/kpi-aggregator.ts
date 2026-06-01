/**
 * Cross-service KPI aggregator.
 * Each function queries the read-only analytics DB (fed by Debezium CDC from each service DB).
 * Results are cached in Redis with per-metric TTLs.
 */

import type postgres from 'postgres'
import type { RedisClientType } from 'redis'

const TTL = {
  attendance: 300,    // 5 min — near-realtime
  grades: 900,        // 15 min
  finance: 600,       // 10 min
  lms: 1800,          // 30 min
  overview: 120,      // 2 min — dashboard overview refreshes fast
}

function cacheKey(metric: string, schoolId: string, params = ''): string {
  return `analytics:${metric}:${schoolId}${params ? ':' + params : ''}`
}

async function cachedQuery<T>(
  key: string,
  ttl: number,
  redis: RedisClientType,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached) as T
  const result = await fn()
  await redis.setEx(key, ttl, JSON.stringify(result))
  return result
}

// ── Attendance KPIs ───────────────────────────────────────────────────────────

export interface AttendanceKPI {
  total_eleves: number
  absents_aujourd_hui: number
  taux_presence_jour: number   // %
  absences_semaine: number
  taux_presence_semaine: number
  top_absentees: { eleve_id: string; nom: string; count: number }[]
}

export async function getAttendanceKPIs(
  schoolId: string,
  db: postgres.Sql,
  redis: RedisClientType,
): Promise<AttendanceKPI> {
  return cachedQuery(cacheKey('attendance', schoolId), TTL.attendance, redis, async () => {
    const [totals] = await db`
      SELECT
        COUNT(DISTINCT e.id) AS total_eleves,
        COUNT(DISTINCT a.eleve_id) FILTER (WHERE a.date = CURRENT_DATE) AS absents_aujourd_hui,
        COUNT(a.id) FILTER (WHERE a.date >= CURRENT_DATE - 7) AS absences_semaine
      FROM eleves e
      LEFT JOIN absences a ON a.eleve_id = e.id AND a.school_id = ${schoolId}
      WHERE e.school_id = ${schoolId}`

    const topAbsentees = await db`
      SELECT a.eleve_id, e.nom, COUNT(*) AS count
      FROM absences a
      JOIN eleves e ON e.id = a.eleve_id
      WHERE a.school_id = ${schoolId}
        AND a.date >= CURRENT_DATE - 30
        AND a.justifiee = false
      GROUP BY a.eleve_id, e.nom
      ORDER BY count DESC
      LIMIT 5`

    const total = Number(totals.total_eleves ?? 0)
    const absentsToday = Number(totals.absents_aujourd_hui ?? 0)
    const absencesSemaine = Number(totals.absences_semaine ?? 0)

    return {
      total_eleves: total,
      absents_aujourd_hui: absentsToday,
      taux_presence_jour: total > 0 ? Math.round(((total - absentsToday) / total) * 100) : 100,
      absences_semaine: absencesSemaine,
      taux_presence_semaine: total > 0 ? Math.round(((total * 5 - absencesSemaine) / (total * 5)) * 100) : 100,
      top_absentees: topAbsentees.map((r) => ({
        eleve_id: String(r.eleve_id),
        nom: String(r.nom),
        count: Number(r.count),
      })),
    }
  })
}

// ── Grades KPIs ───────────────────────────────────────────────────────────────

export interface GradesKPI {
  moyenne_ecole: number
  distribution: { tranche: string; count: number }[]
  matieres_faibles: { matiere: string; moyenne: number }[]
  evolution_mensuelle: { mois: string; moyenne: number }[]
}

export async function getGradesKPIs(
  schoolId: string,
  db: postgres.Sql,
  redis: RedisClientType,
): Promise<GradesKPI> {
  return cachedQuery(cacheKey('grades', schoolId), TTL.grades, redis, async () => {
    const [avg] = await db`
      SELECT ROUND(AVG(note)::numeric, 2) AS moyenne
      FROM notes n
      JOIN eleves e ON e.id = n.eleve_id
      WHERE e.school_id = ${schoolId}
        AND n.created_at >= NOW() - INTERVAL '90 days'`

    const distribution = await db`
      SELECT
        CASE
          WHEN note < 5  THEN '0-5'
          WHEN note < 10 THEN '5-10'
          WHEN note < 14 THEN '10-14'
          WHEN note < 16 THEN '14-16'
          ELSE '16-20'
        END AS tranche,
        COUNT(*) AS count
      FROM notes n
      JOIN eleves e ON e.id = n.eleve_id
      WHERE e.school_id = ${schoolId}
        AND n.created_at >= NOW() - INTERVAL '90 days'
      GROUP BY tranche
      ORDER BY tranche`

    const matieresFaibles = await db`
      SELECT s.nom AS matiere, ROUND(AVG(n.note)::numeric, 2) AS moyenne
      FROM notes n
      JOIN sujets s ON s.id = n.sujet_id
      JOIN eleves e ON e.id = n.eleve_id
      WHERE e.school_id = ${schoolId}
        AND n.created_at >= NOW() - INTERVAL '90 days'
      GROUP BY s.nom
      HAVING AVG(n.note) < 10
      ORDER BY moyenne ASC
      LIMIT 5`

    const evolutionMensuelle = await db`
      SELECT
        TO_CHAR(DATE_TRUNC('month', n.created_at), 'YYYY-MM') AS mois,
        ROUND(AVG(n.note)::numeric, 2) AS moyenne
      FROM notes n
      JOIN eleves e ON e.id = n.eleve_id
      WHERE e.school_id = ${schoolId}
        AND n.created_at >= NOW() - INTERVAL '6 months'
      GROUP BY mois
      ORDER BY mois`

    return {
      moyenne_ecole: Number(avg?.moyenne ?? 0),
      distribution: distribution.map((r) => ({ tranche: String(r.tranche), count: Number(r.count) })),
      matieres_faibles: matieresFaibles.map((r) => ({ matiere: String(r.matiere), moyenne: Number(r.moyenne) })),
      evolution_mensuelle: evolutionMensuelle.map((r) => ({ mois: String(r.mois), moyenne: Number(r.moyenne) })),
    }
  })
}

// ── Finance KPIs ──────────────────────────────────────────────────────────────

export interface FinanceKPI {
  total_attendu_mois: number
  total_encaisse_mois: number
  taux_recouvrement: number     // %
  impayees_total: number
  impayees_montant: number
  evolution_mensuelle: { mois: string; encaisse: number; attendu: number }[]
}

export async function getFinanceKPIs(
  schoolId: string,
  db: postgres.Sql,
  redis: RedisClientType,
): Promise<FinanceKPI> {
  return cachedQuery(cacheKey('finance', schoolId), TTL.finance, redis, async () => {
    const [mois] = await db`
      SELECT
        COALESCE(SUM(montant), 0) AS attendu,
        COALESCE(SUM(CASE WHEN statut = 'PAYEE' THEN montant ELSE 0 END), 0) AS encaisse
      FROM factures
      WHERE school_id = ${schoolId}
        AND EXTRACT(MONTH FROM echeance) = EXTRACT(MONTH FROM NOW())
        AND EXTRACT(YEAR FROM echeance) = EXTRACT(YEAR FROM NOW())`

    const [impayees] = await db`
      SELECT COUNT(*) AS count, COALESCE(SUM(montant), 0) AS montant
      FROM factures
      WHERE school_id = ${schoolId} AND statut = 'IMPAYEE'`

    const evolution = await db`
      SELECT
        TO_CHAR(DATE_TRUNC('month', echeance), 'YYYY-MM') AS mois,
        COALESCE(SUM(montant), 0) AS attendu,
        COALESCE(SUM(CASE WHEN statut = 'PAYEE' THEN montant ELSE 0 END), 0) AS encaisse
      FROM factures
      WHERE school_id = ${schoolId}
        AND echeance >= NOW() - INTERVAL '6 months'
      GROUP BY mois
      ORDER BY mois`

    const attendu = Number(mois?.attendu ?? 0)
    const encaisse = Number(mois?.encaisse ?? 0)

    return {
      total_attendu_mois: attendu,
      total_encaisse_mois: encaisse,
      taux_recouvrement: attendu > 0 ? Math.round((encaisse / attendu) * 100) : 0,
      impayees_total: Number(impayees?.count ?? 0),
      impayees_montant: Number(impayees?.montant ?? 0),
      evolution_mensuelle: evolution.map((r) => ({
        mois: String(r.mois),
        encaisse: Number(r.encaisse),
        attendu: Number(r.attendu),
      })),
    }
  })
}

// ── LMS KPIs ──────────────────────────────────────────────────────────────────

export interface LmsKPI {
  taux_completion_moyen: number   // %
  cours_publies: number
  devoirs_en_attente: number
  soumissions_a_temps: number     // %
}

export async function getLmsKPIs(
  schoolId: string,
  db: postgres.Sql,
  redis: RedisClientType,
): Promise<LmsKPI> {
  return cachedQuery(cacheKey('lms', schoolId), TTL.lms, redis, async () => {
    const [completion] = await db`
      SELECT ROUND(AVG(p.pourcentage)::numeric, 1) AS avg_completion
      FROM progressions_lms p
      JOIN cours c ON c.id = p.cours_id
      WHERE c.school_id = ${schoolId}`

    const [counts] = await db`
      SELECT
        COUNT(*) FILTER (WHERE statut = 'PUBLIE') AS cours_publies,
        COUNT(*) FILTER (WHERE statut = 'BROUILLON') AS cours_brouillons
      FROM cours
      WHERE school_id = ${schoolId}`

    const [devoirs] = await db`
      SELECT COUNT(*) AS en_attente
      FROM devoirs d
      WHERE d.school_id = ${schoolId}
        AND d.date_limite >= NOW()
        AND EXISTS (
          SELECT 1 FROM classes c
          WHERE c.id = d.classe_id AND c.school_id = ${schoolId}
        )`

    const [soumissions] = await db`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE rendu_en_retard = false) AS a_temps
      FROM rendus_devoirs rd
      JOIN devoirs d ON d.id = rd.devoir_id
      WHERE d.school_id = ${schoolId}
        AND rd.created_at >= NOW() - INTERVAL '30 days'`

    const total = Number(soumissions?.total ?? 0)
    const aTemps = Number(soumissions?.a_temps ?? 0)

    return {
      taux_completion_moyen: Number(completion?.avg_completion ?? 0),
      cours_publies: Number(counts?.cours_publies ?? 0),
      devoirs_en_attente: Number(devoirs?.en_attente ?? 0),
      soumissions_a_temps: total > 0 ? Math.round((aTemps / total) * 100) : 0,
    }
  })
}
