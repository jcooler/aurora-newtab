// src/lib/monthGrid.ts — PURE. Every date the caller means is passed in as
// explicit (year, month0) arguments; the only `new Date(...)` calls here
// carry explicit y/m/d parts (never `new Date()` with no arguments), so this
// module never reads the system clock — the widget's own `now` (via useNow)
// is the one impure boundary, same discipline as src/lib/habits.ts.

export interface MonthCell {
  /** local YYYY-MM-DD */
  key: string
  day: number
  inMonth: boolean
}

/** Local (not UTC) YYYY-MM-DD for explicit y/m0/d parts — `new Date(y, m0,
 *  d)` normalizes an out-of-range day/month itself (e.g. day 0 rolls back
 *  into the previous month), which is exactly the behavior this whole module
 *  leans on for both leading/trailing adjacent-month cells AND month0
 *  normalization below. */
function keyFromParts(y: number, m0: number, d: number): string {
  const date = new Date(y, m0, d)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Weeks matrix for the given month, weekday origin SUNDAY (spec-fixed: row
 *  index 0 of every week is always a Sunday). `month0` is 0-indexed
 *  (0=January) and normalizes rather than throws on out-of-range input —
 *  `monthGrid(2026, 13)` is January 2027, `monthGrid(2026, -1)` is December
 *  2025 — via the same `new Date(y, m0, 1)` rollover `keyFromParts` uses,
 *  which makes prev/next navigation in the widget trivial (it can just pass
 *  `m0 +/- 1` without its own bounds-checking).
 *
 *  Always exactly as many ROWS (4, 5, or 6) as the month demands — NEVER
 *  padded to a fixed 6, since the widget's rendered height (and therefore
 *  its placement floor against the widget below it) varies with this on
 *  purpose; the 6-row case is the documented worst case callers must budget
 *  for, not the only shape this returns. */
export function monthGrid(year: number, month0: number): MonthCell[][] {
  // Normalize month0 (and any year carry it implies) through Date's own
  // rollover, once, up front — every cell below is then built off the
  // normalized (y, m0), never the raw possibly-out-of-range input.
  const normalized = new Date(year, month0, 1)
  const y = normalized.getFullYear()
  const m0 = normalized.getMonth()

  const startWeekday = new Date(y, m0, 1).getDay() // Sunday=0..Saturday=6
  const daysInMonth = new Date(y, m0 + 1, 0).getDate() // day 0 of next month = last day of this one
  const rows = Math.ceil((startWeekday + daysInMonth) / 7)

  const weeks: MonthCell[][] = []
  for (let r = 0; r < rows; r++) {
    const week: MonthCell[] = []
    for (let c = 0; c < 7; c++) {
      // Offset from the 1st, in days: negative/large values roll into the
      // adjacent month via the same Date-rollover keyFromParts relies on.
      const offset = r * 7 + c - startWeekday
      const cellDate = new Date(y, m0, 1 + offset)
      week.push({
        key: keyFromParts(y, m0, 1 + offset),
        day: cellDate.getDate(),
        inMonth: cellDate.getFullYear() === y && cellDate.getMonth() === m0,
      })
    }
    weeks.push(week)
  }
  return weeks
}

/** The complete Sunday-through-Saturday row containing an in-month date. */
export function weekContainingDate(year: number, month0: number, day: number): MonthCell[] {
  const key = keyFromParts(year, month0, day)
  return monthGrid(year, month0).find((week) => week.some((cell) => cell.key === key)) ?? []
}
