// src/newtab/widgets/github/contributionGrid.ts — the PURE derivation behind the
// contribution graph: a chronological ContributionDay[] → a column-major cell
// grid, month ticks, and the trailing streak. No React, no wall clock: every
// output derives from the passed days (ported from the design board's seed.ts
// grid logic, PRNG stripped), so the same days always yield the same grid.
import type { ContributionDay } from '../../../services/connectors/github'

export interface GridCell {
  count: number
  level: 0 | 1 | 2 | 3 | 4
  date: string // yyyy-mm-dd, for the hover title
}

export interface MonthTick {
  col: number
  text: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Absolute contribution bands — the render Jon picked used THESE cutoffs, not a
// scale relative to the busiest day, so a 1-contribution day reads level 1 and
// never the brightest cell. Pinned as a constant boundary set: a change here is
// a deliberate, reviewed edit, not an accident of the data.
function levelFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 4) return 2
  if (count <= 7) return 3
  return 4
}

// Local weekday (0 Sun .. 6 Sat) of a yyyy-mm-dd string, built from the string's
// own components (never Date.parse/toISOString, both of which reinterpret the
// day through UTC) — so the front-pad is timezone-independent and the module
// stays pure.
function weekdayOf(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

export function buildContributionGrid(days: ContributionDay[]): {
  cells: (GridCell | null)[]
  columns: number
  monthTicks: MonthTick[]
  streak: number
} {
  if (days.length === 0) return { cells: [], columns: 0, monthTicks: [], streak: 0 }

  // Column-major grid: front-pad so column 0 aligns to the first day's real
  // weekday (row 0 = Sunday), then tail-pad up to whole 7-cell week columns.
  // Pad cells are null — rendered blank, exactly like GitHub's partial first and
  // last weeks.
  const frontPad = weekdayOf(days[0].date)
  const cells: (GridCell | null)[] = []
  for (let i = 0; i < frontPad; i++) cells.push(null)
  for (const day of days) cells.push({ count: day.count, level: levelFor(day.count), date: day.date })
  while (cells.length % 7 !== 0) cells.push(null)
  const columns = cells.length / 7

  // Month ticks: the month of each column's first real day, emitted wherever it
  // changes from the previously-labelled column.
  const monthTicks: MonthTick[] = []
  let last = -1
  for (let c = 0; c < columns; c++) {
    let m = -1
    for (let r = 0; r < 7; r++) {
      const cell = cells[c * 7 + r]
      if (cell) {
        m = Number(cell.date.slice(5, 7)) - 1
        break
      }
    }
    if (m !== -1 && m !== last) {
      monthTicks.push({ col: c, text: MONTHS[m] })
      last = m
    }
  }

  // Streak: the trailing run of count>0 ending at the last day — EXCEPT a zero
  // on ONLY the last day does not break it (no contribution *yet today* ≠ a
  // broken streak), so counting starts the day before when today is still zero.
  // A zero on both of the last two days then falls straight through to 0.
  let streak = 0
  const lastIdx = days.length - 1
  let i = days[lastIdx].count > 0 ? lastIdx : lastIdx - 1
  for (; i >= 0; i--) {
    if (days[i].count > 0) streak++
    else break
  }

  return { cells, columns, monthTicks, streak }
}
