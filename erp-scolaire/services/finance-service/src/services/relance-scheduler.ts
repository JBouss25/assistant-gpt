/**
 * Planificateur de relances automatiques pour les factures en retard.
 *
 * Politique de relance (configurable par établissement) :
 *   - Relance 1 : J+3 après l'échéance  → WhatsApp
 *   - Relance 2 : J+7                   → WhatsApp + Email
 *   - Relance 3 : J+14                  → WhatsApp + Email + SMS + courrier
 *
 * Exécution : Cron quotidien à 8h00 (heure de Casablanca)
 */
import cron from 'node-cron'
import type postgres from 'postgres'
import type { Producer } from 'kafkajs'

type RelancePolitique = { joursApresEcheance: number; canaux: string[]; numero: number }

const POLITIQUE_RELANCES: RelancePolitique[] = [
  { numero: 1, joursApresEcheance: 3,  canaux: ['WHATSAPP'] },
  { numero: 2, joursApresEcheance: 7,  canaux: ['WHATSAPP', 'EMAIL'] },
  { numero: 3, joursApresEcheance: 14, canaux: ['WHATSAPP', 'EMAIL', 'SMS'] },
]

export function startRelanceScheduler(db: postgres.Sql, producer: Producer): void {
  // Tous les jours à 8h00 heure de Casablanca (UTC+1)
  cron.schedule('0 7 * * *', async () => {
    console.log('[relance-scheduler] Starting daily relance check...')
    try {
      await processRelances(db, producer)
    } catch (err) {
      console.error('[relance-scheduler] Error during relance processing', err)
    }
  }, { timezone: 'Africa/Casablanca' })

  console.log('[relance-scheduler] Cron started (daily 08:00 Casablanca)')
}

async function processRelances(db: postgres.Sql, producer: Producer): Promise<void> {
  const today = new Date().toISOString().split('T')[0]!

  for (const politique of POLITIQUE_RELANCES) {
    // Trouver les factures éligibles à cette relance
    const eligibles = await db`
      SELECT
        f.id AS facture_id,
        f.school_id,
        f.eleve_id,
        f.numero_facture,
        f.montant_restant,
        f.date_echeance
      FROM factures f
      WHERE f.statut IN ('EN_RETARD', 'EN_ATTENTE', 'PARTIELLE')
        AND f.date_echeance + INTERVAL '${db.unsafe(String(politique.joursApresEcheance))} days' <= ${today}::DATE
        AND NOT EXISTS (
          SELECT 1 FROM relances r
          WHERE r.facture_id = f.id
            AND r.numero_relance = ${politique.numero}
        )
      LIMIT 500
    `

    if (eligibles.length === 0) continue

    console.log(`[relance-scheduler] Relance ${politique.numero}: ${eligibles.length} factures éligibles`)

    for (const facture of eligibles) {
      // Créer l'entrée de relance
      await db`
        INSERT INTO relances (facture_id, school_id, numero_relance, planifiee_le, canal)
        VALUES (${facture.facture_id}, ${facture.school_id}, ${politique.numero}, ${today}, ${politique.canaux[0] ?? 'WHATSAPP'})
        ON CONFLICT (facture_id, numero_relance) DO NOTHING
      `

      // Marquer la facture comme EN_RETARD si elle ne l'est pas encore
      await db`
        UPDATE factures SET statut = 'EN_RETARD', updated_at = NOW()
        WHERE id = ${facture.facture_id} AND statut IN ('EN_ATTENTE', 'PARTIELLE')
      `

      // Émettre l'événement de notification
      await producer.send({
        topic: 'notifications.send',
        messages: [{
          key: facture.eleve_id,
          value: JSON.stringify({
            school_id:      facture.school_id,
            recipient_type: 'PARENT',
            eleve_id:       facture.eleve_id,
            template:       `RELANCE_PAIEMENT_${politique.numero}`,
            variables: {
              numero_facture: facture.numero_facture,
              montant:        facture.montant_restant?.toString() ?? '0',
              echeance:       facture.date_echeance?.toString() ?? '',
              jours_retard:   String(politique.joursApresEcheance),
            },
            channels: politique.canaux,
            priority: politique.numero >= 3 ? 'HIGH' : 'NORMAL',
          }),
        }],
      })
    }

    // Marquer les relances comme envoyées
    await db`
      UPDATE relances SET statut = 'ENVOYEE', envoyee_le = NOW()
      WHERE statut = 'PLANIFIEE'
        AND numero_relance = ${politique.numero}
        AND planifiee_le = ${today}
    `
  }
}
