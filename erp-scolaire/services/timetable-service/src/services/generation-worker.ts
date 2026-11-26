/**
 * Worker Kafka : consomme les événements `timetable.generation.demandee`
 * et exécute l'algorithme de génération de manière asynchrone.
 */
import { Kafka, type Consumer } from 'kafkajs'
import type postgres from 'postgres'
import type { RedisClientType } from 'redis'
import { generateTimetable } from './scheduler.js'
import type { MatiereClasse, Creneau, Salle } from './scheduler.js'

type Deps = {
  db: postgres.Sql
  redis: RedisClientType
  log: { info: (msg: string, obj?: unknown) => void; error: (msg: string, obj?: unknown) => void }
}

type GenerationEvent = {
  job_id: string
  school_id: string
  annee_scolaire_id: string
  ecrase_existant: boolean
}

export async function startGenerationWorker(deps: Deps): Promise<Consumer> {
  const kafka = new Kafka({
    clientId: 'timetable-generation-worker',
    brokers: (process.env['KAFKA_BROKERS'] ?? 'kafka:9092').split(','),
  })

  const consumer = kafka.consumer({ groupId: 'timetable-generation-group' })
  await consumer.connect()
  await consumer.subscribe({ topic: 'timetable.generation.demandee', fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return

      let event: GenerationEvent
      try {
        event = JSON.parse(message.value.toString()) as GenerationEvent
      } catch {
        deps.log.error('Invalid generation event payload')
        return
      }

      deps.log.info(`Starting generation job ${event.job_id}`)

      // Marquer comme EN_COURS
      await deps.db`
        UPDATE generation_jobs
        SET statut = 'EN_COURS', updated_at = NOW()
        WHERE id = ${event.job_id}
      `

      try {
        await runGeneration(event, deps)
      } catch (err) {
        deps.log.error('Generation job failed', { err, job_id: event.job_id })
        await deps.db`
          UPDATE generation_jobs
          SET statut = 'ECHEC',
              log_messages = ARRAY[${String(err)}],
              updated_at = NOW()
          WHERE id = ${event.job_id}
        `
      }
    },
  })

  return consumer
}

async function runGeneration(event: GenerationEvent, deps: Deps): Promise<void> {
  const { db, log } = deps
  const { job_id, school_id, annee_scolaire_id, ecrase_existant } = event

  // 1. Charger les données nécessaires
  const [creneauxRaw, sallesRaw, matieresRaw, indispoRaw] = await Promise.all([
    db`
      SELECT id, jour, heure_debut::text AS heure_debut, heure_fin::text AS heure_fin, ordre
      FROM creneaux
      WHERE school_id = ${school_id} AND type = 'COURS'
      ORDER BY
        CASE jour WHEN 'LUNDI' THEN 1 WHEN 'MARDI' THEN 2 WHEN 'MERCREDI' THEN 3
                  WHEN 'JEUDI' THEN 4 WHEN 'VENDREDI' THEN 5 WHEN 'SAMEDI' THEN 6 END,
        ordre
    `,
    db`
      SELECT id, nom, capacite, type, equipements
      FROM salles
      WHERE school_id = ${school_id} AND actif = true
    `,
    db`
      SELECT mc.id, mc.classe_id, c.nom AS classe_nom, c.effectif_max AS classe_effectif,
             mc.matiere_id, m.libelle AS matiere_nom,
             mc.enseignant_id, mc.heures_semaine,
             mc.type_salle_requis, mc.salle_preferee_id
      FROM matieres_classes mc
      JOIN classes c ON c.id = mc.classe_id
      LEFT JOIN matieres m ON m.id = mc.matiere_id
      WHERE mc.school_id = ${school_id}
        AND mc.annee_scolaire_id = ${annee_scolaire_id}
    `,
    db`
      SELECT enseignant_id, creneau_id
      FROM contraintes_enseignant
      WHERE school_id = ${school_id}
        AND annee_scolaire_id = ${annee_scolaire_id}
        AND disponible = false
    `,
  ])

  const creneaux = creneauxRaw as Creneau[]
  const salles = sallesRaw as Salle[]
  const matieresClasses = matieresRaw as MatiereClasse[]
  const indisponibilites = new Set(indispoRaw.map((r) => `${r.enseignant_id}::${r.creneau_id}`))

  log.info(`Generating timetable: ${matieresClasses.length} matière×classe, ${creneaux.length} créneaux, ${salles.length} salles`, { job_id })

  // 2. Exécuter l'algorithme
  const result = generateTimetable(matieresClasses, creneaux, salles, indisponibilites)

  // 3. Persister les sessions dans une transaction
  await db.begin(async (trx) => {
    if (ecrase_existant) {
      await trx`
        DELETE FROM emplois_du_temps
        WHERE school_id = ${school_id} AND annee_scolaire_id = ${annee_scolaire_id}
      `
    }

    if (result.sessions.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      await trx`
        INSERT INTO emplois_du_temps
          (school_id, annee_scolaire_id, classe_id, matiere_id, enseignant_id, salle_id, creneau_id, date_debut_validite)
        SELECT
          ${school_id},
          ${annee_scolaire_id},
          s.classe_id,
          s.matiere_id,
          s.enseignant_id,
          s.salle_id,
          s.creneau_id,
          ${today}
        FROM json_to_recordset(${JSON.stringify(result.sessions)})
          AS s(classe_id uuid, matiere_id uuid, enseignant_id uuid, salle_id uuid, creneau_id uuid)
        ON CONFLICT DO NOTHING
      `
    }

    await trx`
      UPDATE generation_jobs SET
        statut = 'TERMINE',
        nb_sessions_totales = ${result.nbSessionsTotales},
        nb_sessions_placees = ${result.nbSessionsPlacees},
        conflits = ${JSON.stringify(result.conflits)},
        duree_ms = ${result.dureeMs},
        log_messages = ARRAY[
          ${`Taux de couverture : ${result.tauxCouverture}%`},
          ${`Durée : ${result.dureeMs}ms`},
          ${`Conflits : ${result.conflits.length}`}
        ],
        updated_at = NOW()
      WHERE id = ${job_id}
    `
  })

  // 4. Invalider le cache EDT de l'école
  const keys = await deps.redis.keys(`timetable:${school_id}:*`)
  if (keys.length > 0) await deps.redis.del(keys)

  log.info(`Generation complete: ${result.nbSessionsPlacees}/${result.nbSessionsTotales} sessions (${result.tauxCouverture}%) in ${result.dureeMs}ms`, { job_id })
}
