import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { successResponse } from '../utils/pagination.js'
import {
  calculerMoyenneMatiere,
  calculerMoyenneGenerale,
  getMention,
  calculerRangs,
  calculerStatsClasse,
} from '../services/grades-calculator.js'
import { generateBulletinPDF } from '../services/bulletin-generator.js'
import type { MatiereResult } from '../services/grades-calculator.js'

export async function bulletinRoutes(app: FastifyInstance) {
  // ── POST /bulletins/generate ──────────────────────────
  // Calcule les moyennes + génère les PDF pour toute une classe sur une période
  app.post<{ Body: unknown }>(
    '/bulletins/generate',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const { classe_id, periode_id } = z.object({
        classe_id:  z.string().uuid(),
        periode_id: z.string().uuid(),
      }).parse(req.body)

      const schoolId = req.headers['x-school-id'] as string

      // Déléguer la génération au worker Kafka (opération longue)
      await app.kafkaProducer.send({
        topic: 'gradebook.bulletins.generation.demandee',
        messages: [{
          key: classe_id,
          value: JSON.stringify({
            school_id: schoolId,
            classe_id,
            periode_id,
            declanche_par: req.jwtPayload.sub,
          }),
        }],
      })

      return reply.status(202).send(successResponse({ message: 'Génération des bulletins déclenchée', classe_id, periode_id }))
    },
  )

  // ── POST /bulletins/generate-single ──────────────────
  // Génère le bulletin PDF d'un seul élève (en temps réel)
  app.post<{ Body: unknown }>(
    '/bulletins/generate-single',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER') },
    async (req, reply) => {
      const { eleve_id, periode_id } = z.object({
        eleve_id:   z.string().uuid(),
        periode_id: z.string().uuid(),
      }).parse(req.body)

      const schoolId = req.headers['x-school-id'] as string
      const pdfBuffer = await computeAndGenerateBulletin(app, { eleve_id, periode_id, school_id: schoolId })

      reply.header('Content-Type', 'application/pdf')
           .header('Content-Disposition', `inline; filename="bulletin-${eleve_id}-${periode_id}.pdf"`)
      return reply.send(pdfBuffer)
    },
  )

  // ── GET /bulletins/students/:eleveId ─────────────────
  app.get<{ Params: { eleveId: string }; Querystring: Record<string, string> }>(
    '/bulletins/students/:eleveId',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const rows = await app.db`
        SELECT b.id, b.periode_id, p.libelle AS periode_libelle, b.moyenne_generale,
               b.rang_general, b.nb_eleves_classe, b.mention, b.decision, b.pdf_url, b.publie, b.publie_le
        FROM bulletins b
        JOIN periodes_evaluation p ON p.id = b.periode_id
        WHERE b.eleve_id = ${req.params.eleveId}
          ${req.jwtPayload.realm_access?.roles?.includes('PARENT') ? app.db`AND b.publie = true` : app.db``}
        ORDER BY p.date_debut DESC
      `
      return reply.send(successResponse(rows))
    },
  )

  // ── PATCH /bulletins/:bulletinId/appreciation ─────────
  // Enseignant valide/modifie l'appréciation générée par l'IA
  app.patch<{ Params: { bulletinId: string }; Body: unknown }>(
    '/bulletins/:bulletinId/appreciation',
    { preHandler: app.requireRole('TEACHER', 'SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const { matiere_id, appreciation } = z.object({
        matiere_id:   z.string().uuid(),
        appreciation: z.string().min(5).max(300),
      }).parse(req.body)

      const [updated] = await app.db`
        UPDATE moyennes_periodiques
        SET appreciation_texte = ${appreciation},
            appreciation_validee = true,
            appreciation_ia = false
        WHERE eleve_id = (SELECT eleve_id FROM bulletins WHERE id = ${req.params.bulletinId})
          AND matiere_id = ${matiere_id}
          AND periode_id = (SELECT periode_id FROM bulletins WHERE id = ${req.params.bulletinId})
        RETURNING eleve_id, matiere_id
      `

      if (!updated) return reply.status(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Moyenne introuvable', details: null } })
      return reply.send(successResponse(updated))
    },
  )

  // ── PATCH /bulletins/periods/:periodeId/publish ───────
  // Publie tous les bulletins d'une période (les rend visibles aux parents)
  app.patch<{ Params: { periodeId: string }; Body: unknown }>(
    '/bulletins/periods/:periodeId/publish',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const { classe_id } = z.object({ classe_id: z.string().uuid().optional() }).parse(req.body ?? {})

      // Vérifier que toutes les appréciations sont validées
      const [nonValides] = await app.db<[{count: string}]>`
        SELECT COUNT(*) as count FROM moyennes_periodiques
        WHERE periode_id = ${req.params.periodeId}
          ${classe_id ? app.db`AND classe_id = ${classe_id}` : app.db``}
          AND appreciation_texte IS NOT NULL
          AND appreciation_validee = false
      `

      if (Number(nonValides?.count ?? 0) > 0) {
        return reply.status(422).send({
          success: false, data: null,
          error: {
            code: 'APPRECIATIONS_NOT_VALIDATED',
            message: `${nonValides?.count} appréciation(s) non encore validée(s) par les enseignants`,
            details: null,
          },
        })
      }

      await app.db.begin(async (trx) => {
        await trx`
          UPDATE bulletins
          SET publie = true, publie_le = NOW()
          WHERE periode_id = ${req.params.periodeId}
            ${classe_id ? trx`AND classe_id = ${classe_id}` : trx``}
            AND publie = false
        `
        await trx`
          UPDATE periodes_evaluation SET bulletins_publies = true, publication_le = NOW()
          WHERE id = ${req.params.periodeId}
        `
      })

      // Notifier les parents
      await app.kafkaProducer.send({
        topic: 'gradebook.bulletins.publies',
        messages: [{
          key: req.params.periodeId,
          value: JSON.stringify({ periode_id: req.params.periodeId, classe_id: classe_id ?? null }),
        }],
      })

      return reply.send(successResponse({ message: 'Bulletins publiés avec succès', periode_id: req.params.periodeId }))
    },
  )
}

// ─── Fonction utilitaire interne ──────────────────────────

async function computeAndGenerateBulletin(
  app: FastifyInstance,
  params: { eleve_id: string; periode_id: string; school_id: string },
): Promise<Buffer> {
  const { eleve_id, periode_id, school_id } = params

  // 1. Charger les infos école + élève + classe
  const [periode] = await app.db`SELECT libelle, annee_scolaire_id FROM periodes_evaluation WHERE id = ${periode_id}`

  // 2. Charger toutes les notes par matière
  const notesRaw = await app.db`
    SELECT
      n.note, n.absent, n.dispense,
      d.matiere_id, d.coefficient, d.bareme,
      m_ap.appreciation_texte, m_ap.coefficient AS matiere_coeff,
      mat.libelle AS matiere_libelle
    FROM notes n
    JOIN devoirs d ON d.id = n.devoir_id
    LEFT JOIN moyennes_periodiques m_ap
      ON m_ap.eleve_id = ${eleve_id} AND m_ap.matiere_id = d.matiere_id AND m_ap.periode_id = ${periode_id}
    LEFT JOIN matieres mat ON mat.id = d.matiere_id
    WHERE n.eleve_id = ${eleve_id}
      AND d.periode_id = ${periode_id}
  `

  // 3. Grouper par matière et calculer
  const byMatiere = new Map<string, { notes: typeof notesRaw; libelle: string; coeff: number; appr: string | null }>()
  for (const n of notesRaw) {
    if (!byMatiere.has(n.matiere_id)) {
      byMatiere.set(n.matiere_id, { notes: [], libelle: n.matiere_libelle, coeff: Number(n.matiere_coeff ?? 1), appr: n.appreciation_texte })
    }
    byMatiere.get(n.matiere_id)!.notes.push(n)
  }

  const matiereResults: MatiereResult[] = Array.from(byMatiere.entries()).map(([matiereId, data]) => {
    const moyenne = calculerMoyenneMatiere(data.notes.map((n) => ({
      noteId: '', note: n.note, absent: n.absent, dispense: n.dispense,
      coefficient: n.coefficient, bareme: n.bareme,
    })))
    return { matiereId, matiereLbl: data.libelle, coefficient: data.coeff, moyenne, nbDevoirs: data.notes.length, nbNotes: data.notes.filter((n) => !n.absent && !n.dispense).length }
  })

  const moyenneGenerale = calculerMoyenneGenerale(matiereResults)
  const mention = getMention(moyenneGenerale)

  // 4. Récupérer ou calculer le bulletin existant pour les rangs
  const [bulletin] = await app.db`
    SELECT rang_general, nb_eleves_classe, moyenne_classe, decision, appreciation_conseil
    FROM bulletins WHERE eleve_id = ${eleve_id} AND periode_id = ${periode_id}
  `

  // 5. Construire les données PDF
  const pdfData = {
    schoolNom:     'École Lyautey',      // TODO: charger depuis core-admin-service
    schoolAdresse: 'Casablanca, Maroc',
    eleveNom:      'Nom',               // TODO: charger depuis core-admin-service
    elevePrenom:   'Prénom',
    classeNom:     'Classe',
    annee:         '2025-2026',
    periodeLibelle: periode?.libelle ?? 'Période',
    matieres: matiereResults.map((m) => ({
      libelle:       m.matiereLbl,
      coefficient:   m.coefficient,
      moyenne:       m.moyenne,
      moyenneClasse: null,
      rang:          null,
      appreciation:  byMatiere.get(m.matiereId)?.appr ?? null,
    })),
    moyenneGenerale,
    rangGeneral:     bulletin?.rang_general ?? null,
    nbElevesClasse:  bulletin?.nb_eleves_classe ?? 0,
    moyenneClasse:   bulletin?.moyenne_classe ?? null,
    mention,
    decision:        bulletin?.decision ?? null,
    appreciationConseil: bulletin?.appreciation_conseil ?? null,
  }

  return generateBulletinPDF(pdfData)
}
