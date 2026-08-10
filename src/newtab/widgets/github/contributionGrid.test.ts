import { describe, expect, it } from 'vitest'
import type { ContributionDay } from '../../../services/connectors/github'
import { buildContributionGrid, type GridCell } from './contributionGrid'

// Consecutive-date fixture builder: yyyy-mm-dd from local components (handles
// month rollover via the Date constructor) so the derivations are exercised
// against real weekdays without a wall-clock read.
function makeDays(startISO: string, counts: number[]): ContributionDay[] {
  const [y, m, d] = startISO.split('-').map(Number)
  return counts.map((count, i) => {
    const date = new Date(y, m - 1, d + i)
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { date: iso, count }
  })
}

// The non-null cells, in day order (front-/tail-pad nulls drop out — filtering
// Boolean preserves chronological order since padding only brackets the days).
const realCells = (cells: (GridCell | null)[]): GridCell[] => cells.filter((c): c is GridCell => c !== null)

describe('buildContributionGrid — levels (absolute bands, pinned)', () => {
  it('maps counts to the board bands: 0→0, 1-2→1, 3-4→2, 5-7→3, 8+→4', () => {
    // 2026-01-04 is a Sunday, so front-pad is 0 and the cells line up 1:1.
    const days = makeDays('2026-01-04', [0, 1, 2, 3, 4, 5, 7, 8, 12, 100])
    const levels = realCells(buildContributionGrid(days).cells).map((c) => c.level)
    expect(levels).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 4])
  })

  it('a 1-contribution day reads level 1, never the max-bright level 4', () => {
    const { cells } = buildContributionGrid(makeDays('2026-01-04', [1]))
    expect(realCells(cells)[0].level).toBe(1)
  })
})

describe('buildContributionGrid — column-major layout', () => {
  it('front-pads by the first day weekday (Sunday-first), tail-pads to whole 7-cell columns', () => {
    // 2026-01-07 is a Wednesday → weekday 3 → three leading null pad cells.
    const days = makeDays('2026-01-07', [1, 2, 3, 4, 5])
    const { cells, columns } = buildContributionGrid(days)

    expect(cells.slice(0, 3)).toEqual([null, null, null]) // front pad = weekday(Wed)
    expect(cells[3]).toEqual({ count: 1, level: 1, date: '2026-01-07' }) // first real day at row 3
    expect(cells.length).toBe(14) // 3 + 5 = 8 → padded up to 2 whole columns
    expect(columns).toBe(2)
    expect(cells.slice(8)).toEqual([null, null, null, null, null, null]) // tail pad
  })

  it('columns = cells.length / 7', () => {
    const { cells, columns } = buildContributionGrid(makeDays('2026-01-04', Array(21).fill(1)))
    expect(columns).toBe(cells.length / 7)
    expect(columns).toBe(3)
  })
})

describe('buildContributionGrid — month ticks', () => {
  it('emits one tick per column whose first real day changes the labelled month', () => {
    // 2026-01-25 is a Sunday: column 0 opens in January, column 1 opens 02-01.
    const days = makeDays('2026-01-25', Array(14).fill(1))
    expect(buildContributionGrid(days).monthTicks).toEqual([
      { col: 0, text: 'Jan' },
      { col: 1, text: 'Feb' },
    ])
  })

  it('a run inside a single month yields exactly one tick', () => {
    const days = makeDays('2026-03-01', Array(7).fill(1)) // 2026-03-01 is a Sunday
    expect(buildContributionGrid(days).monthTicks).toEqual([{ col: 0, text: 'Mar' }])
  })
})

describe('buildContributionGrid — streak', () => {
  it('counts the trailing run of count>0 ending at the last day', () => {
    expect(buildContributionGrid(makeDays('2026-01-04', [0, 1, 2, 3])).streak).toBe(3)
  })

  it('a zero on ONLY the last day does not break the streak (starts from the day before)', () => {
    expect(buildContributionGrid(makeDays('2026-01-04', [1, 2, 3, 0])).streak).toBe(3)
  })

  it('a zero on both of the last two days reads as streak 0', () => {
    expect(buildContributionGrid(makeDays('2026-01-04', [1, 2, 0, 0])).streak).toBe(0)
  })

  it('an all-positive run counts every day', () => {
    expect(buildContributionGrid(makeDays('2026-01-04', [5, 5, 5])).streak).toBe(3)
  })

  it('a single positive day is a 1-day streak; a single zero day is 0', () => {
    expect(buildContributionGrid(makeDays('2026-01-04', [4])).streak).toBe(1)
    expect(buildContributionGrid(makeDays('2026-01-04', [0])).streak).toBe(0)
  })
})

describe('buildContributionGrid — empty input', () => {
  it('returns the empty shape', () => {
    expect(buildContributionGrid([])).toEqual({ cells: [], columns: 0, monthTicks: [], streak: 0 })
  })
})
