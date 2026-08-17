import { describe, expect, it } from 'vitest'
import { calendarColorClass, calendarColorOf, isCalendarColor } from './calendarColors'

describe('calendar colors', () => {
  it('keeps the existing Auto sequence by calendar position', () => {
    expect([0, 1, 2, 3, 4, 5].map((index) => calendarColorOf(undefined, index))).toEqual([
      'accent', 'sky', 'emerald', 'amber', 'fuchsia', 'accent',
    ])
  })

  it('uses a valid saved color and treats malformed stored values as Auto', () => {
    expect(calendarColorOf('emerald', 0)).toBe('emerald')
    expect(calendarColorOf('not-a-color', 1)).toBe('sky')
    expect(isCalendarColor('fuchsia')).toBe(true)
    expect(isCalendarColor('not-a-color')).toBe(false)
  })

  it('maps every resolved color to a closed contrast-safe dot class', () => {
    expect(calendarColorClass('accent')).toBe('bg-accent')
    expect(calendarColorClass('sky')).toBe('bg-sky-400')
    expect(calendarColorClass('emerald')).toBe('bg-emerald-400')
    expect(calendarColorClass('amber')).toBe('bg-amber-400')
    expect(calendarColorClass('fuchsia')).toBe('bg-fuchsia-400')
  })

  it('falls back safely for a malformed calendar index', () => {
    expect(calendarColorOf(undefined, Number.NaN)).toBe('accent')
  })
})
