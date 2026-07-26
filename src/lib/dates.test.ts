import { describe, expect, it } from 'vitest'
import { todayKey, dayHash } from './dates'

describe('todayKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 6, 26))).toBe('2026-07-26')
  })
  it('zero-pads month and day', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('dayHash', () => {
  it('is deterministic and non-negative', () => {
    expect(dayHash('2026-07-26')).toBe(dayHash('2026-07-26'))
    expect(dayHash('2026-07-26')).toBeGreaterThanOrEqual(0)
  })
  it('differs across adjacent days', () => {
    expect(dayHash('2026-07-26')).not.toBe(dayHash('2026-07-27'))
  })
})
