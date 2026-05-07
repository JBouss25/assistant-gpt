/**
 * Générateur de bulletins PDF — ERP Scolaire 360°
 *
 * Utilise PDFKit (pure Node.js, pas de navigateur headless nécessaire).
 * Le PDF est produit en mémoire puis uploadé sur S3-compatible via URL pré-signée.
 * Format A4 portrait, bilingue français/arabe (arabe dans les entêtes).
 */
import PDFDocument from 'pdfkit'

export type BulletinData = {
  // En-tête établissement
  schoolNom:      string
  schoolAdresse:  string
  schoolLogo?:    Buffer

  // Élève
  eleveNom:       string
  elevePrenom:    string
  classeNom:      string
  annee:          string
  periodeLibelle: string

  // Notes par matière
  matieres: {
    libelle:       string
    coefficient:   number
    moyenne:       number | null
    moyenneClasse: number | null
    rang:          number | null
    appreciation:  string | null
  }[]

  // Résultats globaux
  moyenneGenerale: number | null
  rangGeneral:     number | null
  nbElevesClasse:  number
  moyenneClasse:   number | null
  mention:         string | null
  decision:        string | null
  appreciationConseil: string | null
}

const MENTION_LABELS: Record<string, string> = {
  EXCELLENT:         'Excellent',
  TRES_BIEN:         'Très bien',
  BIEN:              'Bien',
  ASSEZ_BIEN:        'Assez bien',
  PASSABLE:          'Passable',
}

const DECISION_LABELS: Record<string, string> = {
  PASSAGE:                   'Admis(e) en classe supérieure',
  REDOUBLEMENT:              'Maintenu(e) dans la classe',
  FELICITATIONS:             'Félicitations du Conseil de Classe',
  ENCOURAGEMENTS:            'Encouragements du Conseil de Classe',
  AVERTISSEMENT_TRAVAIL:     'Avertissement pour le travail',
  AVERTISSEMENT_CONDUITE:    'Avertissement pour la conduite',
}

// Palette couleurs
const C = {
  primary:    '#1a3a5c',
  secondary:  '#2e7d9e',
  accent:     '#e8f4f8',
  text:       '#2d2d2d',
  lightGray:  '#f5f5f5',
  midGray:    '#cccccc',
  success:    '#2e7d32',
  warning:    '#f57f17',
  danger:     '#c62828',
}

function noteColor(note: number | null): string {
  if (note === null) return C.text
  if (note >= 14) return C.success
  if (note >= 10) return C.text
  return C.danger
}

/**
 * Génère le bulletin PDF et retourne un Buffer.
 */
export async function generateBulletinPDF(data: BulletinData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 30, info: { Title: `Bulletin — ${data.eleveNom} ${data.elevePrenom}`, Author: data.schoolNom } })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width - 60   // largeur utile
    const LEFT = 30

    // ── En-tête établissement ──────────────────────────
    doc.rect(LEFT, 30, W, 70).fill(C.primary)

    if (data.schoolLogo) {
      doc.image(data.schoolLogo, LEFT + 10, 35, { height: 60, fit: [60, 60] })
    }

    doc.fillColor('white')
       .font('Helvetica-Bold').fontSize(14)
       .text(data.schoolNom, LEFT + 80, 42, { width: W - 90 })
       .font('Helvetica').fontSize(9)
       .text(data.schoolAdresse, LEFT + 80, 60, { width: W - 90 })

    // Titre du bulletin
    doc.rect(LEFT, 108, W, 24).fill(C.secondary)
    doc.fillColor('white').font('Helvetica-Bold').fontSize(11)
       .text(`BULLETIN DE NOTES — ${data.periodeLibelle.toUpperCase()} — ${data.annee}`, LEFT, 114, { align: 'center', width: W })

    // ── Identité élève ─────────────────────────────────
    doc.rect(LEFT, 138, W, 40).fill(C.accent)
    doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(11)
       .text(`${data.elevePrenom} ${data.eleveNom.toUpperCase()}`, LEFT + 10, 145)
    doc.fillColor(C.text).font('Helvetica').fontSize(9)
       .text(`Classe : ${data.classeNom}`, LEFT + 10, 162)
       .text(`Effectif : ${data.nbElevesClasse} élèves`, LEFT + 200, 162)
       .text(`Rang : ${data.rangGeneral ?? '–'} / ${data.nbElevesClasse}`, LEFT + 350, 162)

    // ── Tableau des notes ──────────────────────────────
    const tableTop    = 188
    const colW        = { matiere: 160, coeff: 45, moy: 55, moyClasse: 55, appr: W - 160 - 45 - 55 - 55 - 10 }
    const rowH        = 20

    // En-tête tableau
    doc.rect(LEFT, tableTop, W, rowH).fill(C.primary)
    doc.fillColor('white').font('Helvetica-Bold').fontSize(8)

    let x = LEFT + 5
    doc.text('Matière',       x, tableTop + 6, { width: colW.matiere - 5 })
    x += colW.matiere
    doc.text('Coeff.',        x, tableTop + 6, { width: colW.coeff,     align: 'center' })
    x += colW.coeff
    doc.text('Moyenne',       x, tableTop + 6, { width: colW.moy,       align: 'center' })
    x += colW.moy
    doc.text('Moy. Classe',   x, tableTop + 6, { width: colW.moyClasse, align: 'center' })
    x += colW.moyClasse
    doc.text('Appréciation',  x, tableTop + 6, { width: colW.appr })

    // Lignes matières
    data.matieres.forEach((m, i) => {
      const y    = tableTop + rowH + i * rowH
      const bg   = i % 2 === 0 ? 'white' : C.lightGray
      doc.rect(LEFT, y, W, rowH).fill(bg)

      // Bordure légère
      doc.rect(LEFT, y, W, rowH).stroke(C.midGray)

      doc.fillColor(C.text).font('Helvetica').fontSize(8)
      let cx = LEFT + 5
      doc.text(m.libelle, cx, y + 6, { width: colW.matiere - 5, ellipsis: true })
      cx += colW.matiere
      doc.text(String(m.coefficient), cx, y + 6, { width: colW.coeff, align: 'center' })
      cx += colW.coeff

      // Moyenne avec couleur
      doc.fillColor(noteColor(m.moyenne)).font('Helvetica-Bold')
         .text(m.moyenne !== null ? m.moyenne.toFixed(2) : 'ABS', cx, y + 6, { width: colW.moy, align: 'center' })
      cx += colW.moy

      doc.fillColor(C.text).font('Helvetica')
         .text(m.moyenneClasse !== null ? m.moyenneClasse.toFixed(2) : '–', cx, y + 6, { width: colW.moyClasse, align: 'center' })
      cx += colW.moyClasse

      doc.text(m.appreciation ?? '', cx, y + 6, { width: colW.appr, ellipsis: true })
    })

    // ── Récapitulatif général ──────────────────────────
    const recapY = tableTop + rowH + data.matieres.length * rowH + 12

    doc.rect(LEFT, recapY, W, 28).fill(C.secondary)
    doc.fillColor('white').font('Helvetica-Bold').fontSize(10)
       .text('RÉCAPITULATIF', LEFT + 10, recapY + 8)

    doc.font('Helvetica').fontSize(9)
       .text(`Moyenne générale : `, LEFT + 130, recapY + 9)
    doc.fillColor(noteColor(data.moyenneGenerale)).font('Helvetica-Bold')
       .text(data.moyenneGenerale !== null ? `${data.moyenneGenerale.toFixed(2)} / 20` : '–', LEFT + 250, recapY + 9)

    doc.fillColor('white').font('Helvetica').fontSize(9)
    if (data.mention) {
      doc.text(`Mention : ${MENTION_LABELS[data.mention] ?? data.mention}`, LEFT + 340, recapY + 9)
    }

    // ── Décision du conseil ────────────────────────────
    if (data.decision || data.appreciationConseil) {
      const decY = recapY + 36
      doc.rect(LEFT, decY, W, data.appreciationConseil ? 52 : 28).fill(C.accent)
      doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(9)
         .text('DÉCISION DU CONSEIL DE CLASSE', LEFT + 10, decY + 8)

      if (data.decision) {
        doc.fillColor(C.text).font('Helvetica-Bold').fontSize(9)
           .text(DECISION_LABELS[data.decision] ?? data.decision, LEFT + 10, decY + 20)
      }
      if (data.appreciationConseil) {
        doc.fillColor(C.text).font('Helvetica').fontSize(8)
           .text(data.appreciationConseil, LEFT + 10, decY + 34, { width: W - 20 })
      }
    }

    // ── Signatures ─────────────────────────────────────
    const sigY = doc.page.height - 90
    doc.rect(LEFT, sigY, W / 3 - 5, 50).stroke(C.midGray)
    doc.rect(LEFT + W / 3 + 5, sigY, W / 3 - 10, 50).stroke(C.midGray)
    doc.rect(LEFT + 2 * (W / 3) + 5, sigY, W / 3 - 5, 50).stroke(C.midGray)

    doc.fillColor(C.text).font('Helvetica').fontSize(8)
       .text("Signature du Parent", LEFT + 5, sigY + 5)
       .text("Signature du Professeur Principal", LEFT + W / 3 + 10, sigY + 5)
       .text("Cachet de l'Établissement", LEFT + 2 * (W / 3) + 10, sigY + 5)

    // ── Pied de page ───────────────────────────────────
    doc.rect(LEFT, doc.page.height - 30, W, 20).fill(C.lightGray)
    doc.fillColor(C.text).font('Helvetica').fontSize(7)
       .text(`Document généré le ${new Date().toLocaleDateString('fr-FR')} — ${data.schoolNom}`, LEFT + 5, doc.page.height - 24, { align: 'center', width: W - 10 })

    doc.end()
  })
}
