import { describe, it, expect } from 'vitest'
import { addDays, daysBefore, toDateString } from '../dates.js'

describe('addDays', () => {
  it('adds positive days', () => {
    const d = new Date('2026-01-01T00:00:00Z')
    expect(toDateString(addDays(d, 7))).toBe('2026-01-08')
  })

  it('handles month boundary', () => {
    const d = new Date('2026-01-28T00:00:00Z')
    expect(toDateString(addDays(d, 5))).toBe('2026-02-02')
  })
})

describe('daysBefore', () => {
  it('subtracts days', () => {
    const d = new Date('2026-06-14T00:00:00Z')
    expect(toDateString(daysBefore(d, 7))).toBe('2026-06-07')
  })
})

describe('toDateString', () => {
  it('returns YYYY-MM-DD', () => {
    expect(toDateString(new Date('2026-06-29T15:30:00Z'))).toBe('2026-06-29')
  })
})
