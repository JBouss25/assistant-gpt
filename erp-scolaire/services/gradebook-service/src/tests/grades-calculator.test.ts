import { describe, it, expect } from 'vitest'
import {
  calculerMoyenneMatiere,
  calculerMoyenneGenerale,
  getMention,
  calculerRangs,
  calculerStatsClasse,
} from '../services/grades-calculator.js'
import type { NoteInput, MatiereResult } from '../services/grades-calculator.js'

// ─── Helpers ─────────────────────────────────────────────

const note = (n: number | null, coeff = 1, bareme = 20, absent = false, dispense = false): NoteInput =>
  ({ noteId: crypto.randomUUID(), note: n, coefficient: coeff, bareme, absent, dispense })

// ─── calculerMoyenneMatiere ───────────────────────────────

describe('calculerMoyenneMatiere', () => {
  it('calcule une moyenne simple égale (coeff identiques)', () => {
    const notes = [note(12), note(14), note(16)]
    expect(calculerMoyenneMatiere(notes)).toBe(14)
  })

  it('pondère correctement les coefficients', () => {
    // DS coeff 2 = 18, DM coeff 1 = 6 → (18×2 + 6×1)/(2+1) = 42/3 = 14
    const notes = [note(18, 2), note(6, 1)]
    expect(calculerMoyenneMatiere(notes)).toBe(14)
  })

  it('exclut les absences du calcul', () => {
    const notes = [note(16), note(null, 1, 20, true), note(14)]
    expect(calculerMoyenneMatiere(notes)).toBe(15)
  })

  it('exclut les dispenses du calcul', () => {
    const notes = [note(18), note(null, 1, 20, false, true), note(12)]
    expect(calculerMoyenneMatiere(notes)).toBe(15)
  })

  it('retourne null si toutes les notes sont absences/dispenses', () => {
    const notes = [note(null, 1, 20, true), note(null, 1, 20, false, true)]
    expect(calculerMoyenneMatiere(notes)).toBeNull()
  })

  it('retourne null pour un tableau vide', () => {
    expect(calculerMoyenneMatiere([])).toBeNull()
  })

  it('ramène les notes sur /20 (barème différent)', () => {
    // 40/40 = 20/20
    const notes = [note(40, 1, 40), note(20, 1, 40)]
    // (20 + 10) / 2 = 15
    expect(calculerMoyenneMatiere(notes)).toBe(15)
  })

  it('arrondit à 2 décimales', () => {
    const notes = [note(13), note(14), note(15)]
    // (13+14+15)/3 = 14.0
    expect(calculerMoyenneMatiere(notes)).toBe(14)
  })
})

// ─── calculerMoyenneGenerale ──────────────────────────────

describe('calculerMoyenneGenerale', () => {
  const matiere = (id: string, coeff: number, moy: number | null): MatiereResult =>
    ({ matiereId: id, matiereLbl: id, coefficient: coeff, moyenne: moy, nbDevoirs: 1, nbNotes: 1 })

  it('calcule la moyenne générale pondérée', () => {
    const matieres = [matiere('MATH', 7, 14), matiere('FR', 4, 12), matiere('HG', 2, 16)]
    // (14×7 + 12×4 + 16×2) / (7+4+2) = (98+48+32)/13 = 178/13 ≈ 13.69
    expect(calculerMoyenneGenerale(matieres)).toBe(13.69)
  })

  it('ignore les matières sans moyenne (absent)', () => {
    const matieres = [matiere('MATH', 5, 16), matiere('SPORT', 2, null)]
    expect(calculerMoyenneGenerale(matieres)).toBe(16)
  })

  it('retourne null si aucune matière n\'a de moyenne', () => {
    const matieres = [matiere('MATH', 5, null), matiere('FR', 3, null)]
    expect(calculerMoyenneGenerale(matieres)).toBeNull()
  })
})

// ─── getMention ───────────────────────────────────────────

describe('getMention', () => {
  it('attribue EXCELLENT pour >= 16', () => {
    expect(getMention(16)).toBe('EXCELLENT')
    expect(getMention(19.5)).toBe('EXCELLENT')
  })

  it('attribue TRES_BIEN pour 14 <= x < 16', () => {
    expect(getMention(14)).toBe('TRES_BIEN')
    expect(getMention(15.99)).toBe('TRES_BIEN')
  })

  it('attribue BIEN pour 12 <= x < 14', () => {
    expect(getMention(12)).toBe('BIEN')
    expect(getMention(13.5)).toBe('BIEN')
  })

  it('attribue ASSEZ_BIEN pour 10 <= x < 12', () => {
    expect(getMention(10)).toBe('ASSEZ_BIEN')
    expect(getMention(11.5)).toBe('ASSEZ_BIEN')
  })

  it('attribue PASSABLE pour 8 <= x < 10', () => {
    expect(getMention(8)).toBe('PASSABLE')
    expect(getMention(9.99)).toBe('PASSABLE')
  })

  it('retourne null pour < 8 ou null', () => {
    expect(getMention(7.99)).toBeNull()
    expect(getMention(0)).toBeNull()
    expect(getMention(null)).toBeNull()
  })
})

// ─── calculerRangs ────────────────────────────────────────

describe('calculerRangs', () => {
  it('attribue les rangs dans l\'ordre décroissant', () => {
    const eleves = [
      { eleveId: 'e1', moyenne: 16 },
      { eleveId: 'e2', moyenne: 14 },
      { eleveId: 'e3', moyenne: 12 },
    ]
    const rangs = calculerRangs(eleves)
    expect(rangs.get('e1')).toBe(1)
    expect(rangs.get('e2')).toBe(2)
    expect(rangs.get('e3')).toBe(3)
  })

  it('gère les ex-aequo (même rang, saut de rang)', () => {
    const eleves = [
      { eleveId: 'e1', moyenne: 16 },
      { eleveId: 'e2', moyenne: 14 },
      { eleveId: 'e3', moyenne: 14 },
      { eleveId: 'e4', moyenne: 12 },
    ]
    const rangs = calculerRangs(eleves)
    expect(rangs.get('e1')).toBe(1)
    expect(rangs.get('e2')).toBe(2)
    expect(rangs.get('e3')).toBe(2)
    expect(rangs.get('e4')).toBe(4) // saut : pas de 3ème
  })

  it('exclut les élèves sans moyenne', () => {
    const eleves = [
      { eleveId: 'e1', moyenne: 14 },
      { eleveId: 'e2', moyenne: null },
    ]
    const rangs = calculerRangs(eleves)
    expect(rangs.has('e2')).toBe(false)
    expect(rangs.get('e1')).toBe(1)
  })
})

// ─── calculerStatsClasse ──────────────────────────────────

describe('calculerStatsClasse', () => {
  it('calcule correctement les stats', () => {
    const moyennes = [10, 12, 14, 16]
    const stats = calculerStatsClasse(moyennes)!
    expect(stats.moyenneClasse).toBe(13)
    expect(stats.noteMax).toBe(16)
    expect(stats.noteMin).toBe(10)
    expect(stats.ecartType).toBe(2.24)
  })

  it('retourne null si aucune valeur valide', () => {
    expect(calculerStatsClasse([null, null])).toBeNull()
    expect(calculerStatsClasse([])).toBeNull()
  })
})
