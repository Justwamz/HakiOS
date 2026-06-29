import { describe, it, expect } from 'vitest'
import { generateClientId, generateMatterNumber } from '../caseNumber.js'
import type { CaseNumberSettings } from '@hakios/types'

const defaults: CaseNumberSettings = {
  firmPrefix: 'LF',
  includeTypeCode: true,
  includeYear: true,
  sequenceDigits: 5,
  separator: '/',
}

describe('generateClientId', () => {
  it('zero-pads sequence to 5 digits', () => {
    expect(generateClientId(2026, 1)).toBe('CLT-2026-00001')
  })

  it('handles large sequence numbers', () => {
    expect(generateClientId(2026, 142)).toBe('CLT-2026-00142')
  })
})

describe('generateMatterNumber', () => {
  it('generates default LF/LIT/2026/00142 format', () => {
    expect(generateMatterNumber(defaults, 'LIT', 2026, 142)).toBe('LF/LIT/2026/00142')
  })

  it('omits type code when toggled off', () => {
    const s: CaseNumberSettings = { ...defaults, includeTypeCode: false }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF/2026/00001')
  })

  it('omits year when toggled off', () => {
    const s: CaseNumberSettings = { ...defaults, includeYear: false }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF/LIT/00001')
  })

  it('omits both type and year', () => {
    const s: CaseNumberSettings = { ...defaults, includeTypeCode: false, includeYear: false }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF/00001')
  })

  it('uses dash separator', () => {
    const s: CaseNumberSettings = { ...defaults, separator: '-' }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF-LIT-2026-00001')
  })

  it('uses dot separator', () => {
    const s: CaseNumberSettings = { ...defaults, separator: '.' }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF.LIT.2026.00001')
  })

  it('respects 4-digit sequence setting', () => {
    const s: CaseNumberSettings = { ...defaults, sequenceDigits: 4 }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF/LIT/2026/0001')
  })

  it('respects 6-digit sequence setting', () => {
    const s: CaseNumberSettings = { ...defaults, sequenceDigits: 6 }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF/LIT/2026/000001')
  })
})
