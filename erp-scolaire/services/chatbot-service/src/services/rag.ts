/**
 * RAG — Retrieval-Augmented Generation context builder.
 * Queries school-specific data from PostgreSQL and assembles a compact
 * context string that is injected as [CONTEXTE ÉCOLE] into each prompt.
 */

import type postgres from 'postgres'

export interface UserContext {
  userId: string
  schoolId: string
  role: string        // eleve | parent | enseignant | directeur | admin
  eleveId?: string    // for parent/eleve roles
  classeId?: string   // for enseignant role
}

export async function buildSchoolContext(
  ctx: UserContext,
  db: postgres.Sql,
): Promise<string> {
  const parts: string[] = [`École ID: ${ctx.schoolId}`, `Rôle: ${ctx.role}`]

  if ((ctx.role === 'eleve' || ctx.role === 'parent') && ctx.eleveId) {
    parts.push(...(await _eleveContext(ctx.eleveId, ctx.schoolId, db)))
  } else if (ctx.role === 'enseignant' && ctx.classeId) {
    parts.push(...(await _enseignantContext(ctx.classeId, ctx.schoolId, db)))
  } else if (ctx.role === 'directeur' || ctx.role === 'admin') {
    parts.push(...(await _schoolSummaryContext(ctx.schoolId, db)))
  }

  return parts.join('\n')
}

async function _eleveContext(eleveId: string, schoolId: string, db: postgres.Sql): Promise<string[]> {
  const [eleve] = await db`
    SELECT nom, prenom, classe_id
    FROM eleves
    WHERE id = ${eleveId} AND school_id = ${schoolId}
    LIMIT 1`

  if (!eleve) return ['Élève non trouvé']

  const [grades] = await db`
    SELECT ROUND(AVG(note)::numeric, 2) AS moyenne
    FROM notes
    WHERE eleve_id = ${eleveId}
      AND created_at >= NOW() - INTERVAL '30 days'`

  const [absences] = await db`
    SELECT COUNT(*) AS total
    FROM absences
    WHERE eleve_id = ${eleveId}
      AND date >= NOW() - INTERVAL '30 days'
      AND justifiee = false`

  const [unpaid] = await db`
    SELECT COUNT(*) AS total, SUM(montant) AS montant_total
    FROM factures
    WHERE eleve_id = ${eleveId} AND statut = 'IMPAYEE'`

  return [
    `Élève: ${eleve.prenom} ${eleve.nom}`,
    `Moyenne (30j): ${grades?.moyenne ?? 'N/A'}/20`,
    `Absences injustifiées (30j): ${absences?.total ?? 0}`,
    `Factures impayées: ${unpaid?.total ?? 0} (${unpaid?.montant_total ?? 0} MAD)`,
  ]
}

async function _enseignantContext(classeId: string, schoolId: string, db: postgres.Sql): Promise<string[]> {
  const [classe] = await db`
    SELECT nom, niveau
    FROM classes
    WHERE id = ${classeId} AND school_id = ${schoolId}
    LIMIT 1`

  if (!classe) return ['Classe non trouvée']

  const [stats] = await db`
    SELECT
      COUNT(DISTINCT e.id) AS nb_eleves,
      ROUND(AVG(n.note)::numeric, 2) AS moyenne_classe
    FROM eleves e
    LEFT JOIN notes n ON n.eleve_id = e.id
      AND n.created_at >= NOW() - INTERVAL '30 days'
    WHERE e.classe_id = ${classeId}`

  const absentToday = await db`
    SELECT COUNT(*) AS total
    FROM absences
    WHERE classe_id = ${classeId}
      AND date = CURRENT_DATE`

  return [
    `Classe: ${classe.nom} (${classe.niveau})`,
    `Effectif: ${stats?.nb_eleves ?? 0} élèves`,
    `Moyenne classe (30j): ${stats?.moyenne_classe ?? 'N/A'}/20`,
    `Absents aujourd'hui: ${absentToday[0]?.total ?? 0}`,
  ]
}

async function _schoolSummaryContext(schoolId: string, db: postgres.Sql): Promise<string[]> {
  const [counts] = await db`
    SELECT
      (SELECT COUNT(*) FROM eleves WHERE school_id = ${schoolId}) AS nb_eleves,
      (SELECT COUNT(*) FROM enseignants WHERE school_id = ${schoolId}) AS nb_enseignants,
      (SELECT COUNT(*) FROM classes WHERE school_id = ${schoolId}) AS nb_classes`

  const [finance] = await db`
    SELECT
      SUM(CASE WHEN statut = 'IMPAYEE' THEN montant ELSE 0 END) AS impayees,
      SUM(CASE WHEN statut = 'PAYEE' AND EXTRACT(MONTH FROM date_paiement) = EXTRACT(MONTH FROM NOW())
          THEN montant ELSE 0 END) AS encaisse_mois
    FROM factures
    WHERE school_id = ${schoolId}`

  return [
    `Établissement — ${counts?.nb_eleves ?? 0} élèves, ${counts?.nb_enseignants ?? 0} enseignants, ${counts?.nb_classes ?? 0} classes`,
    `Finance: ${finance?.impayees ?? 0} MAD impayés, ${finance?.encaisse_mois ?? 0} MAD encaissés ce mois`,
  ]
}
