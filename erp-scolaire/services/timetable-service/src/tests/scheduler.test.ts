import { describe, it, expect } from 'vitest'
import { generateTimetable, checkConflicts } from '../services/scheduler.js'
import type { Creneau, Salle, MatiereClasse } from '../services/scheduler.js'

// ── Fixtures ────────────────────────────────────────────

const creneaux: Creneau[] = [
  { id: 'c1', jour: 'LUNDI',  heureDebut: '08:00', heureFin: '09:00', ordre: 1 },
  { id: 'c2', jour: 'LUNDI',  heureDebut: '09:00', heureFin: '10:00', ordre: 2 },
  { id: 'c3', jour: 'MARDI',  heureDebut: '08:00', heureFin: '09:00', ordre: 1 },
  { id: 'c4', jour: 'MARDI',  heureDebut: '09:00', heureFin: '10:00', ordre: 2 },
  { id: 'c5', jour: 'MERCREDI', heureDebut: '08:00', heureFin: '09:00', ordre: 1 },
  { id: 'c6', jour: 'JEUDI', heureDebut: '08:00', heureFin: '09:00', ordre: 1 },
]

const salles: Salle[] = [
  { id: 's1', nom: 'Salle 101', capacite: 35, type: 'STANDARD',      equipements: [] },
  { id: 's2', nom: 'Labo Info', capacite: 30, type: 'INFORMATIQUE',   equipements: ['PC'] },
  { id: 's3', nom: 'Salle 102', capacite: 35, type: 'STANDARD',      equipements: [] },
]

const matieresClasses: MatiereClasse[] = [
  { id: 'mc1', classeId: 'cl1', classeNom: '6ème A', classeEffectif: 30, matiereId: 'm1', matiereNom: 'Mathématiques', enseignantId: 'e1', heureSemaine: 3, typeSalleRequis: null, sallePrefereeId: null },
  { id: 'mc2', classeId: 'cl1', classeNom: '6ème A', classeEffectif: 30, matiereId: 'm2', matiereNom: 'Français',       enseignantId: 'e2', heureSemaine: 2, typeSalleRequis: null, sallePrefereeId: null },
  { id: 'mc3', classeId: 'cl2', classeNom: '6ème B', classeEffectif: 28, matiereId: 'm1', matiereNom: 'Mathématiques', enseignantId: 'e1', heureSemaine: 3, typeSalleRequis: null, sallePrefereeId: null },
  { id: 'mc4', classeId: 'cl1', classeNom: '6ème A', classeEffectif: 30, matiereId: 'm3', matiereNom: 'Informatique',  enseignantId: 'e3', heureSemaine: 2, typeSalleRequis: 'INFORMATIQUE', sallePrefereeId: 's2' },
]

// ── Tests ───────────────────────────────────────────────

describe('Scheduler — generateTimetable', () => {
  it('places all sessions when enough slots are available', () => {
    const result = generateTimetable(matieresClasses, creneaux, salles)

    expect(result.sessions.length).toBe(result.nbSessionsPlacees)
    expect(result.tauxCouverture).toBe(100)
    expect(result.conflits).toHaveLength(0)
  })

  it('uses the correct room type for Informatique', () => {
    const result = generateTimetable(matieresClasses, creneaux, salles)

    const infoSessions = result.sessions.filter((s) => {
      const mc = matieresClasses.find((m) => m.id === s.matiereClasseId)
      return mc?.matiereNom === 'Informatique'
    })

    expect(infoSessions.length).toBeGreaterThan(0)
    infoSessions.forEach((s) => expect(s.salleId).toBe('s2'))
  })

  it('no double-booking: enseignant not in two places at same slot', () => {
    const result = generateTimetable(matieresClasses, creneaux, salles)

    const bySlot = new Map<string, string[]>()
    for (const s of result.sessions) {
      const key = `${s.enseignantId}::${s.creneauId}`
      if (!bySlot.has(key)) bySlot.set(key, [])
      bySlot.get(key)!.push(s.classeId)
    }

    for (const [, classes] of bySlot) {
      expect(classes.length).toBe(1)
    }
  })

  it('no double-booking: classe not assigned twice at same slot', () => {
    const result = generateTimetable(matieresClasses, creneaux, salles)

    const bySlot = new Map<string, number>()
    for (const s of result.sessions) {
      const key = `${s.classeId}::${s.creneauId}`
      bySlot.set(key, (bySlot.get(key) ?? 0) + 1)
    }

    for (const [, count] of bySlot) {
      expect(count).toBe(1)
    }
  })

  it('reports conflicts when slots are exhausted', () => {
    // Seulement 2 créneaux pour l'enseignant e1 qui a 6h à placer
    const fewSlots: Creneau[] = [
      { id: 'c1', jour: 'LUNDI', heureDebut: '08:00', heureFin: '09:00', ordre: 1 },
      { id: 'c2', jour: 'LUNDI', heureDebut: '09:00', heureFin: '10:00', ordre: 2 },
    ]
    const result = generateTimetable(matieresClasses, fewSlots, salles)

    expect(result.conflits.length).toBeGreaterThan(0)
    expect(result.tauxCouverture).toBeLessThan(100)
  })

  it('respects teacher unavailability constraints', () => {
    const indisponibilites = new Set(['e1::c1', 'e1::c2', 'e1::c3'])
    const result = generateTimetable(matieresClasses, creneaux, salles, indisponibilites)

    const e1Sessions = result.sessions.filter((s) => s.enseignantId === 'e1')
    for (const s of e1Sessions) {
      expect(indisponibilites.has(`e1::${s.creneauId}`)).toBe(false)
    }
  })
})

describe('Scheduler — checkConflicts', () => {
  it('detects teacher double-booking', () => {
    const existing = [{ matiereClasseId: 'mc1', classeId: 'cl2', matiereId: 'm1', enseignantId: 'e1', salleId: 's3', creneauId: 'c1' }]
    const conflicts = checkConflicts({ classeId: 'cl1', matiereId: 'm2', enseignantId: 'e1', salleId: 's1', creneauId: 'c1' }, existing)
    expect(conflicts).toContain('Enseignant déjà occupé sur ce créneau')
  })

  it('returns empty array when no conflict', () => {
    const existing = [{ matiereClasseId: 'mc1', classeId: 'cl2', matiereId: 'm1', enseignantId: 'e1', salleId: 's3', creneauId: 'c1' }]
    const conflicts = checkConflicts({ classeId: 'cl1', matiereId: 'm2', enseignantId: 'e2', salleId: 's1', creneauId: 'c2' }, existing)
    expect(conflicts).toHaveLength(0)
  })
})
