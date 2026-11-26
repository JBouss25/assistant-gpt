/**
 * Algorithme de génération d'emploi du temps — v1 (Greedy + Constraint Propagation)
 *
 * Approche :
 *   1. Constraint Propagation : éliminer les créneaux impossibles par domaine
 *   2. Greedy Assignment : placer les cours du plus contraint au moins contraint (MRV heuristic)
 *   3. Conflict reporting : retourner les sessions non placées avec la raison
 *
 * Complexité : O(C × M × S) où C=classes, M=matières/classe, S=créneaux
 * Temps cible : < 5 minutes pour 4000 élèves / 200 profs / 80 salles
 */

export type Creneau = {
  id: string
  jour: string
  heureDebut: string
  heureFin: string
  ordre: number
}

export type Salle = {
  id: string
  nom: string
  capacite: number
  type: string
  equipements: string[]
}

export type MatiereClasse = {
  id: string
  classeId: string
  classeNom: string
  classeEffectif: number
  matiereId: string
  matiereNom: string
  enseignantId: string
  heureSemaine: number      // ex: 3.0 → 3 créneaux d'1h à placer
  typeSalleRequis: string | null
  sallePrefereeId: string | null
}

export type Session = {
  matiereClasseId: string
  classeId: string
  matiereId: string
  enseignantId: string
  salleId: string
  creneauId: string
}

export type ConflitNonResolu = {
  matiereClasseId: string
  classeId: string
  classeNom: string
  matiereNom: string
  heuresTotales: number
  heuresPlacees: number
  raison: string
}

export type SchedulerResult = {
  sessions: Session[]
  conflits: ConflitNonResolu[]
  dureeMs: number
  nbSessionsTotales: number
  nbSessionsPlacees: number
  tauxCouverture: number
}

type OccupancyMap = Set<string>

function occupancyKey(entityId: string, creneauId: string): string {
  return `${entityId}::${creneauId}`
}

/**
 * Calcule le nombre de créneaux disponibles pour une matière (MRV — Minimum Remaining Values).
 * Utilisé pour trier les matières du plus contraint au moins contraint.
 */
function countAvailableSlots(
  mc: MatiereClasse,
  creneaux: Creneau[],
  salles: Salle[],
  occupied: OccupancyMap,
): number {
  let count = 0
  for (const creneau of creneaux) {
    const enseignantOccupe = occupied.has(occupancyKey(mc.enseignantId, creneau.id))
    const classeOccupee    = occupied.has(occupancyKey(mc.classeId, creneau.id))
    if (enseignantOccupe || classeOccupee) continue

    const salleDisponible = salles.some((s) => {
      if (occupied.has(occupancyKey(s.id, creneau.id))) return false
      if (mc.typeSalleRequis && s.type !== mc.typeSalleRequis) return false
      if (s.capacite < mc.classeEffectif) return false
      return true
    })

    if (salleDisponible) count++
  }
  return count
}

/**
 * Sélectionne la meilleure salle pour un créneau donné :
 *   - Salle préférée si disponible
 *   - Sinon, salle de type requis avec capacité la plus proche (éviter le gaspillage)
 */
function selectBestRoom(
  mc: MatiereClasse,
  creneauId: string,
  salles: Salle[],
  occupied: OccupancyMap,
): Salle | null {
  const candidates = salles.filter((s) => {
    if (occupied.has(occupancyKey(s.id, creneauId))) return false
    if (mc.typeSalleRequis && s.type !== mc.typeSalleRequis) return false
    if (s.capacite < mc.classeEffectif) return false
    return true
  })

  if (candidates.length === 0) return null

  // Priorité : salle préférée
  if (mc.sallePrefereeId) {
    const preferred = candidates.find((s) => s.id === mc.sallePrefereeId)
    if (preferred) return preferred
  }

  // Sinon : salle dont la capacité est la plus proche (minimise le gaspillage)
  return candidates.sort((a, b) => a.capacite - b.capacite)[0] ?? null
}

/**
 * Génère l'emploi du temps par algorithme greedy avec heuristique MRV.
 *
 * @param matieresClasses - Toutes les associations matière×classe×enseignant avec volume horaire
 * @param creneaux        - Tous les créneaux disponibles (filtrés : type=COURS uniquement)
 * @param salles          - Toutes les salles actives
 * @param indisponibilites - Set de clés `enseignantId::creneauId` bloquées a priori
 */
export function generateTimetable(
  matieresClasses: MatiereClasse[],
  creneaux: Creneau[],
  salles: Salle[],
  indisponibilites: Set<string> = new Set(),
): SchedulerResult {
  const start = Date.now()

  // OccupancyMap : clés occupées (enseignant, classe, salle) × créneau
  const occupied: OccupancyMap = new Set(indisponibilites)

  const sessions: Session[] = []
  const conflits: ConflitNonResolu[] = []

  // Construire la liste des "besoins" : (matiereClasse, séance n°i)
  // Ex: 3h/semaine → 3 entrées à placer
  const needs: { mc: MatiereClasse; sessionIndex: number }[] = []
  for (const mc of matieresClasses) {
    const nbSeances = Math.round(mc.heureSemaine) // arrondi au créneau entier
    for (let i = 0; i < nbSeances; i++) {
      needs.push({ mc, sessionIndex: i })
    }
  }

  // Trier par MRV (le plus contraint d'abord) — recalculé une fois au début
  // Pour un vrai v2 : recalcul dynamique après chaque placement (mais plus lent)
  const needsSorted = [...needs].sort(
    (a, b) =>
      countAvailableSlots(a.mc, creneaux, salles, occupied) -
      countAvailableSlots(b.mc, creneaux, salles, occupied),
  )

  // ── Placement greedy ───────────────────────────────────
  const placedByMC = new Map<string, number>()

  for (const { mc } of needsSorted) {
    let placed = false

    for (const creneau of creneaux) {
      // Contrainte : pas plus d'1 séance par jour pour la même matière+classe
      // (heuristique de distribution)
      const alreadyTodayKey = `day::${mc.classeId}::${mc.matiereId}::${creneau.jour}`
      if (occupied.has(alreadyTodayKey)) continue

      if (occupied.has(occupancyKey(mc.enseignantId, creneau.id))) continue
      if (occupied.has(occupancyKey(mc.classeId, creneau.id))) continue

      const salle = selectBestRoom(mc, creneau.id, salles, occupied)
      if (!salle) continue

      // Placement
      sessions.push({
        matiereClasseId: mc.id,
        classeId: mc.classeId,
        matiereId: mc.matiereId,
        enseignantId: mc.enseignantId,
        salleId: salle.id,
        creneauId: creneau.id,
      })

      occupied.add(occupancyKey(mc.enseignantId, creneau.id))
      occupied.add(occupancyKey(mc.classeId, creneau.id))
      occupied.add(occupancyKey(salle.id, creneau.id))
      occupied.add(alreadyTodayKey)

      placedByMC.set(mc.id, (placedByMC.get(mc.id) ?? 0) + 1)
      placed = true
      break
    }

    if (!placed) {
      // Enregistrer le conflit (sera agrégé ci-dessous)
      placedByMC.set(mc.id, placedByMC.get(mc.id) ?? 0)
    }
  }

  // ── Agréger les conflits par matiereClasse ─────────────
  for (const mc of matieresClasses) {
    const needed = Math.round(mc.heureSemaine)
    const placed2 = placedByMC.get(mc.id) ?? 0
    if (placed2 < needed) {
      conflits.push({
        matiereClasseId: mc.id,
        classeId: mc.classeId,
        classeNom: mc.classeNom,
        matiereNom: mc.matiereNom,
        heuresTotales: needed,
        heuresPlacees: placed2,
        raison:
          placed2 === 0
            ? 'Aucun créneau disponible (enseignant ou salle)'
            : `${needed - placed2} séance(s) non placée(s) — créneaux épuisés`,
      })
    }
  }

  const nbTotales = needs.length
  const nbPlacees = sessions.length

  return {
    sessions,
    conflits,
    dureeMs: Date.now() - start,
    nbSessionsTotales: nbTotales,
    nbSessionsPlacees: nbPlacees,
    tauxCouverture: nbTotales > 0 ? Math.round((nbPlacees / nbTotales) * 100) : 100,
  }
}

/**
 * Vérifie si l'ajout d'une session manuelle crée un conflit.
 * Retourne la liste des conflits détectés (vide = OK).
 */
export function checkConflicts(
  session: Omit<Session, 'matiereClasseId'>,
  existingSessions: Session[],
): string[] {
  const conflicts: string[] = []

  for (const s of existingSessions) {
    if (s.creneauId !== session.creneauId) continue
    if (s.enseignantId === session.enseignantId) conflicts.push('Enseignant déjà occupé sur ce créneau')
    if (s.classeId    === session.classeId)    conflicts.push('Classe déjà occupée sur ce créneau')
    if (s.salleId     === session.salleId)     conflicts.push('Salle déjà occupée sur ce créneau')
  }

  return [...new Set(conflicts)]
}
