import { describe, it, expect } from 'vitest'

// ── Pure helper functions extracted from kpi-aggregator ───────────────────────

function tauxPresence(total: number, absents: number): number {
  if (total === 0) return 100
  return Math.round(((total - absents) / total) * 100)
}

function tauxRecouvrement(attendu: number, encaisse: number): number {
  if (attendu === 0) return 0
  return Math.round((encaisse / attendu) * 100)
}

function tauxSoumissionsATemps(total: number, aTemps: number): number {
  if (total === 0) return 0
  return Math.round((aTemps / total) * 100)
}

function distributeNotes(notes: number[]): Record<string, number> {
  const buckets: Record<string, number> = {
    '0-5': 0, '5-10': 0, '10-14': 0, '14-16': 0, '16-20': 0,
  }
  for (const n of notes) {
    if (n < 5) buckets['0-5']++
    else if (n < 10) buckets['5-10']++
    else if (n < 14) buckets['10-14']++
    else if (n < 16) buckets['14-16']++
    else buckets['16-20']++
  }
  return buckets
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('tauxPresence', () => {
  it('returns 100 when no absences', () => {
    expect(tauxPresence(100, 0)).toBe(100)
  })

  it('returns 90 when 10% absent', () => {
    expect(tauxPresence(100, 10)).toBe(90)
  })

  it('returns 100 when total is 0', () => {
    expect(tauxPresence(0, 0)).toBe(100)
  })

  it('rounds correctly', () => {
    expect(tauxPresence(3, 1)).toBe(67)
  })
})

describe('tauxRecouvrement', () => {
  it('returns 0 when nothing expected', () => {
    expect(tauxRecouvrement(0, 0)).toBe(0)
  })

  it('calculates correct percentage', () => {
    expect(tauxRecouvrement(50000, 42000)).toBe(84)
  })

  it('returns 100 when fully collected', () => {
    expect(tauxRecouvrement(10000, 10000)).toBe(100)
  })
})

describe('tauxSoumissionsATemps', () => {
  it('returns 0 when no submissions', () => {
    expect(tauxSoumissionsATemps(0, 0)).toBe(0)
  })

  it('calculates on-time percentage', () => {
    expect(tauxSoumissionsATemps(20, 15)).toBe(75)
  })
})

describe('distributeNotes', () => {
  it('buckets notes correctly', () => {
    const result = distributeNotes([3, 7, 12, 15, 18])
    expect(result['0-5']).toBe(1)
    expect(result['5-10']).toBe(1)
    expect(result['10-14']).toBe(1)
    expect(result['14-16']).toBe(1)
    expect(result['16-20']).toBe(1)
  })

  it('handles boundary values', () => {
    const result = distributeNotes([5, 10, 14, 16, 20])
    expect(result['5-10']).toBe(1)   // 5 → 5-10
    expect(result['10-14']).toBe(1)  // 10 → 10-14
    expect(result['14-16']).toBe(1)  // 14 → 14-16
    expect(result['16-20']).toBe(2)  // 16, 20 → 16-20
  })

  it('returns zeroed buckets for empty input', () => {
    const result = distributeNotes([])
    expect(Object.values(result).every((v) => v === 0)).toBe(true)
  })
})
