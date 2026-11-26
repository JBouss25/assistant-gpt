/**
 * Moteur de calcul des moyennes pondérées.
 *
 * Règles appliquées :
 *   - Les notes absentes (absent=true) sont exclues du calcul
 *   - Les notes dispensées (dispense=true) sont exclues
 *   - La moyenne = Σ(note × coeff) / Σ(coeff) des devoirs non-exclus
 *   - Si tous les devoirs d'une matière sont exclus → moyenne = null
 *   - La mention est calculée selon le barème national marocain (sur 20)
 *   - Le rang est calculé sur l'ensemble des élèves de la classe
 */

export type NoteInput = {
  noteId:      string
  note:        number | null
  absent:      boolean
  dispense:    boolean
  coefficient: number
  bareme:      number     // note maximale (ex: 20, 40, 100)
}

export type MatiereResult = {
  matiereId:    string
  matiereLbl:   string
  coefficient:  number    // coefficient de la matière dans la moyenne générale
  moyenne:      number | null
  nbDevoirs:    number
  nbNotes:      number    // devoirs avec note valide
}

export type ClassResult = {
  eleveId:          string
  matiereResults:   MatiereResult[]
  moyenneGenerale:  number | null
  mention:          string | null
}

export type ClassStats = {
  moyenneClasse:  number
  noteMax:        number
  noteMin:        number
  ecartType:      number
}

/**
 * Calcule la moyenne d'un élève pour une matière donnée.
 * Ramène toutes les notes sur /20 avant le calcul pondéré.
 */
export function calculerMoyenneMatiere(notes: NoteInput[]): number | null {
  const notesValides = notes.filter((n) => !n.absent && !n.dispense && n.note !== null)
  if (notesValides.length === 0) return null

  const sommeCoeff = notesValides.reduce((s, n) => s + n.coefficient, 0)
  if (sommeCoeff === 0) return null

  const sommePonderee = notesValides.reduce((s, n) => {
    const noteSur20 = (n.note! / n.bareme) * 20
    return s + noteSur20 * n.coefficient
  }, 0)

  return Math.round((sommePonderee / sommeCoeff) * 100) / 100
}

/**
 * Calcule la moyenne générale d'un élève à partir de ses moyennes par matière.
 * Exclut les matières sans moyenne (absent à tous les devoirs).
 */
export function calculerMoyenneGenerale(matiereResults: MatiereResult[]): number | null {
  const valides = matiereResults.filter((m) => m.moyenne !== null)
  if (valides.length === 0) return null

  const sommeCoeff = valides.reduce((s, m) => s + m.coefficient, 0)
  if (sommeCoeff === 0) return null

  const sommePonderee = valides.reduce((s, m) => s + m.moyenne! * m.coefficient, 0)
  return Math.round((sommePonderee / sommeCoeff) * 100) / 100
}

/**
 * Attribue la mention selon le barème national marocain (sur 20).
 */
export function getMention(moyenne: number | null): string | null {
  if (moyenne === null) return null
  if (moyenne >= 16) return 'EXCELLENT'
  if (moyenne >= 14) return 'TRES_BIEN'
  if (moyenne >= 12) return 'BIEN'
  if (moyenne >= 10) return 'ASSEZ_BIEN'
  if (moyenne >= 8)  return 'PASSABLE'
  return null // En dessous de 8 : pas de mention
}

/**
 * Calcule les rangs de tous les élèves d'une classe.
 * Gestion des ex-aequo : même rang, puis saut de rang.
 * Ex: 1er, 2ème, 2ème, 4ème (pas de 3ème)
 */
export function calculerRangs(resultats: { eleveId: string; moyenne: number | null }[]): Map<string, number> {
  const avecMoyenne = resultats
    .filter((r) => r.moyenne !== null)
    .sort((a, b) => b.moyenne! - a.moyenne!)

  const rangs = new Map<string, number>()
  let rang = 1

  for (let i = 0; i < avecMoyenne.length; i++) {
    const r = avecMoyenne[i]!
    if (i > 0 && r.moyenne !== avecMoyenne[i - 1]!.moyenne) {
      rang = i + 1
    }
    rangs.set(r.eleveId, rang)
  }

  return rangs
}

/**
 * Calcule les statistiques de classe pour une matière.
 */
export function calculerStatsClasse(moyennes: (number | null)[]): ClassStats | null {
  const valides = moyennes.filter((m): m is number => m !== null)
  if (valides.length === 0) return null

  const moy = valides.reduce((s, m) => s + m, 0) / valides.length
  const variance = valides.reduce((s, m) => s + Math.pow(m - moy, 2), 0) / valides.length

  return {
    moyenneClasse: Math.round(moy * 100) / 100,
    noteMax:       Math.max(...valides),
    noteMin:       Math.min(...valides),
    ecartType:     Math.round(Math.sqrt(variance) * 100) / 100,
  }
}
