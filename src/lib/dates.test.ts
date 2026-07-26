import { describe, expect, it } from 'vitest'
import { todayKey } from './dates'

describe('todayKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 6, 26))).toBe('2026-07-26')
  })
  it('zero-pads month and day', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
