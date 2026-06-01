import { describe, it, expect } from 'vitest'

// ── Test helpers ──────────────────────────────────────

function renderConsignes(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`)
}

function isValidDateLimite(dateStr: string): boolean {
  const d = new Date(dateStr)
  return !isNaN(d.getTime())
}

function calculerStatutRendu(dateLimit: string, dateSoumis: string): 'A_TEMPS' | 'EN_RETARD' {
  return new Date(dateSoumis) <= new Date(dateLimit) ? 'A_TEMPS' : 'EN_RETARD'
}

function validNoteForBareme(note: number, bareme: number): boolean {
  return note >= 0 && note <= bareme
}

function normalizeObjectKey(schoolId: string, coursId: string, filename: string): string {
  const ext = filename.split('.').pop() ?? ''
  return `schools/${schoolId}/cours/${coursId}/file.${ext}`
}

// ── Tests ─────────────────────────────────────────────

describe('renderConsignes', () => {
  it('replaces template variables', () => {
    expect(renderConsignes('Exercice {{numero}} — {{matiere}}', { numero: '1', matiere: 'Maths' }))
      .toBe('Exercice 1 — Maths')
  })

  it('leaves missing variables as-is', () => {
    expect(renderConsignes('{{unknown}}', {})).toBe('{{unknown}}')
  })
})

describe('isValidDateLimite', () => {
  it('accepts ISO datetime', () => {
    expect(isValidDateLimite('2025-10-15T23:59:00.000Z')).toBe(true)
  })

  it('rejects invalid dates', () => {
    expect(isValidDateLimite('not-a-date')).toBe(false)
  })
})

describe('calculerStatutRendu', () => {
  it('marks on-time submission', () => {
    expect(calculerStatutRendu('2025-10-15T23:59:00Z', '2025-10-14T10:00:00Z'))
      .toBe('A_TEMPS')
  })

  it('marks late submission', () => {
    expect(calculerStatutRendu('2025-10-15T23:59:00Z', '2025-10-16T08:00:00Z'))
      .toBe('EN_RETARD')
  })

  it('marks exact deadline as on-time', () => {
    expect(calculerStatutRendu('2025-10-15T23:59:00Z', '2025-10-15T23:59:00Z'))
      .toBe('A_TEMPS')
  })
})

describe('validNoteForBareme', () => {
  it('accepts valid note', () => {
    expect(validNoteForBareme(15, 20)).toBe(true)
    expect(validNoteForBareme(0, 20)).toBe(true)
    expect(validNoteForBareme(20, 20)).toBe(true)
  })

  it('rejects note exceeding bareme', () => {
    expect(validNoteForBareme(21, 20)).toBe(false)
  })

  it('rejects negative note', () => {
    expect(validNoteForBareme(-1, 20)).toBe(false)
  })
})

describe('normalizeObjectKey', () => {
  it('builds correct S3 path', () => {
    const key = normalizeObjectKey('school-1', 'cours-2', 'document.pdf')
    expect(key).toMatch(/^schools\/school-1\/cours\/cours-2\//)
    expect(key).toMatch(/\.pdf$/)
  })
})
