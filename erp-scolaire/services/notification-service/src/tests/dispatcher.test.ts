import { describe, it, expect } from 'vitest'
import { renderTemplate } from '../services/dispatcher.js'

describe('renderTemplate', () => {
  it('replaces single variable', () => {
    expect(renderTemplate('Bonjour {{prenom}}', { prenom: 'Youssef' }))
      .toBe('Bonjour Youssef')
  })

  it('replaces multiple variables', () => {
    const result = renderTemplate(
      'Élève {{prenom}} {{nom}} absent le {{date}}',
      { prenom: 'Sara', nom: 'Alami', date: '2025-09-15' },
    )
    expect(result).toBe('Élève Sara Alami absent le 2025-09-15')
  })

  it('leaves unreplaced variable as-is when key missing', () => {
    expect(renderTemplate('Matière : {{matiere}}', {}))
      .toBe('Matière : {{matiere}}')
  })

  it('handles empty template', () => {
    expect(renderTemplate('', { key: 'val' })).toBe('')
  })

  it('handles no variables in template', () => {
    expect(renderTemplate('Texte fixe.', {})).toBe('Texte fixe.')
  })

  it('replaces same variable used multiple times', () => {
    expect(renderTemplate('{{x}} et {{x}}', { x: 'A' }))
      .toBe('A et A')
  })

  it('handles special characters in variable value', () => {
    expect(renderTemplate('Note : {{note}}', { note: '18.5/20' }))
      .toBe('Note : 18.5/20')
  })
})
