import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { successResponse, paginationSchema, buildMeta, buildOffset } from '../utils/pagination.js'

const createInvoiceSchema = z.object({
  eleve_id:          z.string().uuid(),
  annee_scolaire_id: z.string().uuid(),
  date_echeance:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lignes:            z.array(z.object({
    libelle:    z.string().min(2).max(200),
    type:       z.enum(['SCOLARITE','INSCRIPTION','CANTINE','TRANSPORT','ACTIVITE','AUTRE']),
    montant_ht: z.number().positive(),
    tva_taux:   z.number().min(0).max(100).default(0),
    poste_id:   z.string().uuid().optional(),
  })).min(1),
  notes_internes: z.string().max(500).optional(),
})

const querySchema = paginationSchema.extend({
  statut:            z.enum(['EN_ATTENTE','PARTIELLE','REGLEE','EN_RETARD','ANNULEE']).optional(),
  eleve_id:          z.string().uuid().optional(),
  annee_scolaire_id: z.string().uuid().optional(),
  date_debut:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_fin:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function invoiceRoutes(app: FastifyInstance) {
  // ── GET /finance/schools/:schoolId/invoices ───────────
  app.get<{ Params: { schoolId: string }; Querystring: Record<string, string> }>(
    '/finance/schools/:schoolId/invoices',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'FINANCE_OFFICER', 'PRINCIPAL') },
    async (req, reply) => {
      const query = querySchema.parse(req.query)
      const { limit, offset } = buildOffset(query)

      const where = app.db`
        WHERE school_id = ${req.params.schoolId}
        ${query.statut            ? app.db`AND statut = ${query.statut}`                           : app.db``}
        ${query.eleve_id          ? app.db`AND eleve_id = ${query.eleve_id}`                       : app.db``}
        ${query.annee_scolaire_id ? app.db`AND annee_scolaire_id = ${query.annee_scolaire_id}`     : app.db``}
        ${query.date_debut        ? app.db`AND date_echeance >= ${query.date_debut}`               : app.db``}
        ${query.date_fin          ? app.db`AND date_echeance <= ${query.date_fin}`                 : app.db``}
      `

      const [{ count }] = await app.db<[{count:string}]>`SELECT COUNT(*) as count FROM factures ${where}`
      const rows = await app.db`
        SELECT id, numero_facture, eleve_id, date_emission, date_echeance,
               montant_total, montant_regle, montant_restant, statut, pdf_url, created_at
        FROM factures ${where}
        ORDER BY date_echeance ASC, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
      return reply.send(successResponse(rows, buildMeta(Number(count), query)))
    },
  )

  // ── GET /finance/schools/:schoolId/invoices/:id ───────
  app.get<{ Params: { schoolId: string; invoiceId: string } }>(
    '/finance/schools/:schoolId/invoices/:invoiceId',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'FINANCE_OFFICER', 'PRINCIPAL', 'PARENT') },
    async (req, reply) => {
      const [facture] = await app.db`
        SELECT * FROM factures
        WHERE id = ${req.params.invoiceId} AND school_id = ${req.params.schoolId}
      `
      if (!facture) return reply.status(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Facture introuvable', details: null } })

      const [lignes, paiements, relances] = await Promise.all([
        app.db`SELECT * FROM lignes_facture WHERE facture_id = ${req.params.invoiceId} ORDER BY ordre`,
        app.db`SELECT id, montant, date_paiement, mode, reference_externe, statut, recu_url FROM paiements WHERE facture_id = ${req.params.invoiceId} ORDER BY date_paiement DESC`,
        app.db`SELECT numero_relance, planifiee_le, envoyee_le, statut FROM relances WHERE facture_id = ${req.params.invoiceId} ORDER BY numero_relance`,
      ])

      return reply.send(successResponse({ ...facture, lignes, paiements, relances }))
    },
  )

  // ── POST /finance/schools/:schoolId/invoices ──────────
  app.post<{ Params: { schoolId: string }; Body: unknown }>(
    '/finance/schools/:schoolId/invoices',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'FINANCE_OFFICER') },
    async (req, reply) => {
      const body = createInvoiceSchema.parse(req.body)
      const schoolId = req.params.schoolId

      // Calculer le montant total
      const montantTotal = body.lignes.reduce((sum, l) => {
        const ttc = parseFloat((l.montant_ht * (1 + l.tva_taux / 100)).toFixed(2))
        return sum + ttc
      }, 0)

      const facture = await app.db.begin(async (trx) => {
        // Générer le numéro de facture de façon atomique
        const anneeLabel = new Date().getFullYear()
        const prefix = `F-${anneeLabel}`
        const [{ numero }] = await trx<[{numero: string}]>`
          SELECT next_invoice_number(${schoolId}, ${body.annee_scolaire_id}, ${prefix}) AS numero
        `

        const [f] = await trx`
          INSERT INTO factures
            (school_id, numero_facture, eleve_id, annee_scolaire_id, date_echeance, montant_total, notes_internes, created_by)
          VALUES
            (${schoolId}, ${numero}, ${body.eleve_id}, ${body.annee_scolaire_id},
             ${body.date_echeance}, ${montantTotal}, ${body.notes_internes ?? null}, ${req.jwtPayload.sub})
          RETURNING id, numero_facture, montant_total, statut, date_echeance
        `

        // Insérer les lignes
        const lignesData = body.lignes.map((l, i) => ({
          facture_id: f.id,
          libelle:    l.libelle,
          type:       l.type,
          montant_ht: l.montant_ht,
          tva_taux:   l.tva_taux,
          montant_ttc: parseFloat((l.montant_ht * (1 + l.tva_taux / 100)).toFixed(2)),
          poste_id:   l.poste_id ?? null,
          ordre:      i,
        }))
        await trx`INSERT INTO lignes_facture ${trx(lignesData)}`

        return f
      })

      // Émettre événement Kafka → notification de création facture
      await app.kafkaProducer.send({
        topic: 'finance.facture.creee',
        messages: [{
          key: body.eleve_id,
          value: JSON.stringify({ facture_id: facture.id, school_id: schoolId, eleve_id: body.eleve_id, montant: montantTotal, echeance: body.date_echeance }),
        }],
      })

      return reply.status(201).send(successResponse(facture))
    },
  )

  // ── POST /finance/schools/:schoolId/invoices/bulk-generate ──
  // Génération en masse depuis une famille de tarifs (ex: début d'année)
  app.post<{ Params: { schoolId: string }; Body: unknown }>(
    '/finance/schools/:schoolId/invoices/bulk-generate',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'FINANCE_OFFICER') },
    async (req, reply) => {
      const { famille_tarif_id, classe_ids } = z.object({
        famille_tarif_id: z.string().uuid(),
        classe_ids:       z.array(z.string().uuid()).min(1),
      }).parse(req.body)

      // Déléguer au worker Kafka pour éviter timeout HTTP
      await app.kafkaProducer.send({
        topic: 'finance.generation.bulk.demandee',
        messages: [{
          key: req.params.schoolId,
          value: JSON.stringify({ school_id: req.params.schoolId, famille_tarif_id, classe_ids, declanche_par: req.jwtPayload.sub }),
        }],
      })

      return reply.status(202).send(successResponse({ message: 'Génération en masse déclenchée', famille_tarif_id }))
    },
  )

  // ── GET /finance/schools/:schoolId/dashboard ──────────
  app.get<{ Params: { schoolId: string }; Querystring: Record<string, string> }>(
    '/finance/schools/:schoolId/dashboard',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'FINANCE_OFFICER', 'PRINCIPAL') },
    async (req, reply) => {
      const { annee_scolaire_id } = z.object({ annee_scolaire_id: z.string().uuid() }).parse(req.query)
      const cacheKey = `finance:dashboard:${req.params.schoolId}:${annee_scolaire_id}`
      const cached = await app.redis.get(cacheKey)
      if (cached) return reply.send(JSON.parse(cached))

      const [kpis] = await app.db`
        SELECT
          COUNT(*)                                                                AS total_factures,
          COUNT(*) FILTER (WHERE statut = 'REGLEE')                              AS factures_reglees,
          COUNT(*) FILTER (WHERE statut IN ('EN_ATTENTE','PARTIELLE'))           AS factures_en_attente,
          COUNT(*) FILTER (WHERE statut = 'EN_RETARD')                          AS factures_en_retard,
          COALESCE(SUM(montant_total),  0)                                       AS ca_total,
          COALESCE(SUM(montant_regle),  0)                                       AS ca_regle,
          COALESCE(SUM(montant_restant) FILTER (WHERE statut != 'ANNULEE'), 0)   AS ca_restant,
          ROUND(
            COALESCE(SUM(montant_regle), 0) /
            NULLIF(SUM(montant_total) FILTER (WHERE statut != 'ANNULEE'), 0) * 100,
            1
          )                                                                       AS taux_recouvrement
        FROM factures
        WHERE school_id = ${req.params.schoolId}
          AND annee_scolaire_id = ${annee_scolaire_id}
      `

      const evolutionMensuelle = await app.db`
        SELECT
          DATE_TRUNC('month', date_paiement) AS mois,
          SUM(montant)                       AS montant_encaisse,
          COUNT(*)                           AS nb_paiements
        FROM paiements p
        JOIN factures f ON f.id = p.facture_id
        WHERE f.school_id = ${req.params.schoolId}
          AND f.annee_scolaire_id = ${annee_scolaire_id}
          AND p.statut = 'CONFIRME'
        GROUP BY DATE_TRUNC('month', date_paiement)
        ORDER BY mois
      `

      const result = successResponse({ kpis, evolution_mensuelle: evolutionMensuelle })
      await app.redis.setEx(cacheKey, 3600, JSON.stringify(result)) // TTL 1h
      return reply.send(result)
    },
  )
}
