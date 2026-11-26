import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { buildCMIPaymentForm, verifyCMICallback, createStripeCheckout, verifyStripeWebhook } from '../services/cmi-gateway.js'
import { successResponse } from '../utils/pagination.js'

const initiateSchema = z.object({
  facture_id: z.string().uuid(),
  gateway:    z.enum(['CMI', 'STRIPE', 'ESPECES', 'CHEQUE', 'VIREMENT']),
  montant:    z.number().positive().optional(), // Si null → montant restant total
  ok_url:     z.string().url().optional(),
  fail_url:   z.string().url().optional(),
  email:      z.string().email().optional(),
})

const manualPaymentSchema = z.object({
  facture_id:         z.string().uuid(),
  montant:            z.number().positive(),
  mode:               z.enum(['ESPECES','CHEQUE','VIREMENT','AUTRE']),
  reference_externe:  z.string().max(200).optional(),
})

export async function paymentRoutes(app: FastifyInstance) {
  // ── POST /finance/payments/initiate ───────────────────
  // Lance le processus de paiement (redirect CMI ou Stripe checkout)
  app.post<{ Body: unknown }>(
    '/finance/payments/initiate',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = initiateSchema.parse(req.body)

      const [facture] = await app.db`
        SELECT id, numero_facture, montant_restant, statut, eleve_id, school_id
        FROM factures WHERE id = ${body.facture_id}
      `

      if (!facture) return reply.status(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Facture introuvable', details: null } })
      if (facture.statut === 'REGLEE') return reply.status(422).send({ success: false, data: null, error: { code: 'ALREADY_PAID', message: 'Facture déjà réglée', details: null } })
      if (facture.statut === 'ANNULEE') return reply.status(422).send({ success: false, data: null, error: { code: 'CANCELLED', message: 'Facture annulée', details: null } })

      const montant = body.montant ?? Number(facture.montant_restant)

      if (body.gateway === 'CMI') {
        const baseUrl = process.env['APP_BASE_URL'] ?? 'https://erp.ma'
        const form = buildCMIPaymentForm({
          amount:      montant.toFixed(2),
          orderId:     facture.numero_facture,
          description: `Paiement facture ${facture.numero_facture}`,
          callbackUrl: `${baseUrl}/api/v1/finance/payments/webhook/cmi`,
          okUrl:       body.ok_url   ?? `${baseUrl}/paiement/succes`,
          failUrl:     body.fail_url ?? `${baseUrl}/paiement/echec`,
          lang:        'fr',
          email:       body.email ?? '',
        })

        // Créer un paiement en statut EN_ATTENTE
        const [pending] = await app.db`
          INSERT INTO paiements (facture_id, montant, mode, statut, reference_externe)
          VALUES (${facture.id}, ${montant}, 'CMI_ONLINE', 'EN_ATTENTE', ${facture.numero_facture})
          RETURNING id
        `

        return reply.send(successResponse({ gateway: 'CMI', paiement_id: pending.id, form }))
      }

      if (body.gateway === 'STRIPE') {
        const session = await createStripeCheckout({
          amount:     Math.round(montant * 100), // centimes
          currency:   'mad',
          orderId:    facture.numero_facture,
          successUrl: body.ok_url   ?? `${process.env['APP_BASE_URL']}/paiement/succes?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl:  body.fail_url ?? `${process.env['APP_BASE_URL']}/paiement/echec`,
          metadata:   { facture_id: facture.id, school_id: facture.school_id },
        })

        const [pending] = await app.db`
          INSERT INTO paiements (facture_id, montant, mode, statut, reference_externe)
          VALUES (${facture.id}, ${montant}, 'STRIPE', 'EN_ATTENTE', ${session.sessionId})
          RETURNING id
        `

        return reply.send(successResponse({ gateway: 'STRIPE', paiement_id: pending.id, checkout_url: session.url }))
      }

      return reply.status(400).send({ success: false, data: null, error: { code: 'UNSUPPORTED_GATEWAY', message: `Gateway ${body.gateway} non supporté via cette route`, details: null } })
    },
  )

  // ── POST /finance/payments/manual ─────────────────────
  // Enregistrement manuel (espèces, chèque, virement)
  app.post<{ Body: unknown }>(
    '/finance/payments/manual',
    { preHandler: app.requireRole('SCHOOL_ADMIN', 'FINANCE_OFFICER') },
    async (req, reply) => {
      const body = manualPaymentSchema.parse(req.body)

      const paiement = await app.db.begin(async (trx) => {
        const [facture] = await trx`
          SELECT id, montant_total, montant_regle, montant_restant, statut
          FROM factures WHERE id = ${body.facture_id} FOR UPDATE
        `
        if (!facture) throw Object.assign(new Error('Facture introuvable'), { statusCode: 404 })
        if (['REGLEE', 'ANNULEE'].includes(facture.statut)) {
          throw Object.assign(new Error(`Facture ${facture.statut.toLowerCase()}`), { statusCode: 422 })
        }

        const [p] = await trx`
          INSERT INTO paiements (facture_id, montant, mode, reference_externe, encaisse_par)
          VALUES (${body.facture_id}, ${body.montant}, ${body.mode}, ${body.reference_externe ?? null}, ${req.jwtPayload.sub})
          RETURNING id, montant, mode, date_paiement
        `

        const newRegle = Number(facture.montant_regle) + body.montant
        const newStatut = newRegle >= Number(facture.montant_total) ? 'REGLEE'
          : newRegle > 0 ? 'PARTIELLE' : facture.statut

        await trx`
          UPDATE factures SET montant_regle = ${newRegle}, statut = ${newStatut}, updated_at = NOW()
          WHERE id = ${body.facture_id}
        `

        // Annuler les relances planifiées si facture réglée
        if (newStatut === 'REGLEE') {
          await trx`UPDATE relances SET statut = 'REGLEE' WHERE facture_id = ${body.facture_id} AND statut = 'PLANIFIEE'`
        }

        return p
      })

      await app.kafkaProducer.send({
        topic: 'finance.paiement.confirme',
        messages: [{ key: body.facture_id, value: JSON.stringify({ facture_id: body.facture_id, paiement_id: paiement.id, montant: body.montant }) }],
      })

      return reply.status(201).send(successResponse(paiement))
    },
  )

  // ── POST /finance/payments/webhook/cmi ───────────────
  // Webhook de retour CMI (non authentifié — sécurisé par signature HMAC)
  app.post<{ Body: unknown }>(
    '/finance/payments/webhook/cmi',
    async (req, reply) => {
      const rawBody = req.body as Record<string, string>

      const result = verifyCMICallback(rawBody)
      app.log.info({ cmi: result }, 'CMI webhook received')

      if (!result.success) {
        app.log.warn({ result }, 'CMI callback rejected')
        return reply.status(400).send('ACTION=FAILURE')
      }

      await app.db.begin(async (trx) => {
        // Récupérer le paiement en attente via la référence
        const [pending] = await trx`
          SELECT p.id, p.facture_id, p.montant
          FROM paiements p
          JOIN factures f ON f.id = p.facture_id
          WHERE f.numero_facture = ${result.orderId} AND p.statut = 'EN_ATTENTE'
          FOR UPDATE
        `
        if (!pending) return

        await trx`
          UPDATE paiements
          SET statut = 'CONFIRME', reference_externe = ${result.transactionId},
              metadata_gateway = ${JSON.stringify(rawBody)}
          WHERE id = ${pending.id}
        `

        const [facture] = await trx`
          SELECT montant_total, montant_regle FROM factures WHERE id = ${pending.facture_id} FOR UPDATE
        `
        const newRegle  = Number(facture.montant_regle) + Number(pending.montant)
        const newStatut = newRegle >= Number(facture.montant_total) ? 'REGLEE' : 'PARTIELLE'

        await trx`
          UPDATE factures SET montant_regle = ${newRegle}, statut = ${newStatut}, updated_at = NOW()
          WHERE id = ${pending.facture_id}
        `
      })

      await app.kafkaProducer.send({
        topic: 'finance.paiement.confirme',
        messages: [{ key: result.orderId, value: JSON.stringify({ order_id: result.orderId, transaction_id: result.transactionId, gateway: 'CMI' }) }],
      })

      // CMI attend "ACTION=POSTAUTH" pour confirmer la transaction
      return reply.header('Content-Type', 'text/plain').send('ACTION=POSTAUTH')
    },
  )

  // ── POST /finance/payments/webhook/stripe ─────────────
  app.post<{ Body: unknown }>(
    '/finance/payments/webhook/stripe',
    { config: { rawBody: true } },
    async (req, reply) => {
      const sigHeader = req.headers['stripe-signature'] as string
      let event: Record<string, unknown>

      try {
        event = verifyStripeWebhook(JSON.stringify(req.body), sigHeader)
      } catch {
        return reply.status(400).send({ error: 'Invalid signature' })
      }

      if (event['type'] === 'checkout.session.completed') {
        const session = event['data'] as { object: { id: string; client_reference_id: string; payment_status: string } }
        if (session.object.payment_status === 'paid') {
          await app.db`
            UPDATE paiements SET statut = 'CONFIRME', metadata_gateway = ${JSON.stringify(event)}
            WHERE reference_externe = ${session.object.id} AND statut = 'EN_ATTENTE'
          `
          await app.kafkaProducer.send({
            topic: 'finance.paiement.confirme',
            messages: [{ key: session.object.client_reference_id, value: JSON.stringify({ order_id: session.object.client_reference_id, gateway: 'STRIPE' }) }],
          })
        }
      }

      return reply.send({ received: true })
    },
  )
}
