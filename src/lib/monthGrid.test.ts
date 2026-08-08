import { describe, expect, it } from 'vitest'
import { monthGrid } from './monthGrid'

describe('monthGrid', () => {
  it('Feb 2026 (starts on a Sunday) renders exactly 4 rows, no leading cells', () => {
    const weeks = monthGrid(2026, 1) // month0=1 -> February
    expect(weeks).toHaveLength(4)
    expect(weeks[0]![0]).toEqual({ key: '2026-02-01', day: 1, inMonth: true })
    expect(weeks[0]!.every((c) => c.inMonth)).toBe(true) // no leading trim needed
    const last = weeks[3]![6]!
    expect(last).toEqual({ key: '2026-02-28', day: 28, inMonth: true })
  })

  it('every row is exactly 7 cells, weekday origin Sunday (index 0 of every row is a Sunday)', () => {
    const weeks = monthGrid(2026, 1)
    for (const week of weeks) {
      expect(week).toHaveLength(7)
      const sunday = new Date(`${week[0]!.key}T12:00:00Z`)
      // getUTCDay is fine here purely to sanity-check the FIXTURE key parses to
      // a Sunday — the grid itself is built from local Date parts, not UTC.
      expect(sunday.getUTCDay()).toBe(0)
    }
  })

  it('leap Feb 2028 has all 29 in-month days present across its rows', () => {
    const weeks = monthGrid(2028, 1)
    const inMonthDays = weeks.flat().filter((c) => c.inMonth)
    expect(inMonthDays).toHaveLength(29)
    expect(inMonthDays[0]).toEqual({ key: '2028-02-01', day: 1, inMonth: true })
    expect(inMonthDays[28]).toEqual({ key: '2028-02-29', day: 29, inMonth: true })
  })

  it('May 2026 (Friday start + 31 days) renders exactly 6 rows — the worst case', () => {
    const weeks = monthGrid(2026, 4) // month0=4 -> May
    expect(weeks).toHaveLength(6)
    const inMonthDays = weeks.flat().filter((c) => c.inMonth)
    expect(inMonthDays).toHaveLength(31)
    expect(weeks[0]![5]).toEqual({ key: '2026-05-01', day: 1, inMonth: true }) // Friday = index 5
    expect(weeks[0]![0]).toEqual({ key: '2026-04-26', day: 26, inMonth: false }) // leading trim from April
  })

  it('trailing cells roll into the next month, flagged inMonth:false with that month\'s own day numbers', () => {
    const weeks = monthGrid(2026, 1) // Feb 2026 ends on a Saturday (28th), no trailing trim needed
    const last = weeks[3]!
    expect(last.every((c) => c.inMonth)).toBe(true)

    // May 2026 (6 rows) DOES trail into June.
    const may = monthGrid(2026, 4)
    const lastRow = may[5]!
    const trailing = lastRow.filter((c) => !c.inMonth)
    expect(trailing.length).toBeGreaterThan(0)
    expect(trailing[0]!.key.startsWith('2026-06-')).toBe(true)
  })

  it('a December grid trails leading cells into the PREVIOUS year, and a January grid can lead into the previous December', () => {
    // December 2025: Dec 1 2025 is a Monday, so the grid leads back into
    // November 2025 (not a year-boundary case for LEADING cells) but its
    // trailing cells roll into January 2026 IF the last row overflows.
    const dec2025 = monthGrid(2025, 11)
    const flatDec = dec2025.flat()
    const trailingIntoJan = flatDec.filter((c) => !c.inMonth && c.key.startsWith('2026-01-'))
    expect(trailingIntoJan.length).toBeGreaterThan(0)

    // January 2026: Jan 1 2026 is a Thursday, so the grid leads back into
    // December 2025 — a real year-boundary case for LEADING cells.
    const jan2026 = monthGrid(2026, 0)
    const flatJan = jan2026.flat()
    const leadingIntoDec = flatJan.filter((c) => !c.inMonth && c.key.startsWith('2025-12-'))
    expect(leadingIntoDec.length).toBeGreaterThan(0)
  })

  // month0 is 0-indexed (0=January..11=December), the same convention
  // getMonth()/every other date helper in this codebase uses — so the ONE
  // past December is index 12, not 13 (the brief's own illustrative "13 ->
  // Jan next year" undercounts by one; the actual JS Date rollover this
  // relies on puts 13 one month further, at February — asserted by the
  // second case below). This rollover-without-modulo is exactly what makes
  // prev/next navigation trivial: the widget can call `setView(v => ({ y:
  // v.y, m0: v.m0 + 1 }))` from December (m0=11) unconditionally and never
  // needs its own `% 12` bounds-checking.
  it('month0 out-of-range normalizes rather than throwing: m0=12 (one past December) is January of the NEXT year', () => {
    expect(monthGrid(2026, 12)).toEqual(monthGrid(2027, 0))
  })

  it('m0=13 (two past December) normalizes one month further, into February of the next year', () => {
    expect(monthGrid(2026, 13)).toEqual(monthGrid(2027, 1))
  })

  it('month0 out-of-range normalizes negative months too: -1 is December of the PREVIOUS year', () => {
    expect(monthGrid(2026, -1)).toEqual(monthGrid(2025, 11))
  })

  it('every cell key is a well-formed local YYYY-MM-DD string, one per calendar day, in ascending order', () => {
    const weeks = monthGrid(2026, 4) // May 2026, 6 rows = 42 cells
    const keys = weeks.flat().map((c) => c.key)
    expect(keys).toHaveLength(42)
    for (const key of keys) expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const sorted = [...keys].sort()
    expect(keys).toEqual(sorted)
    expect(new Set(keys).size).toBe(42) // no duplicate dates
  })
})
