import { describe, expect, it } from 'vitest'

import type { ProgressGoal } from './storage/schema'
import {
  MAX_PROGRESS_GOALS,
  applyProgressIntent,
  progressValueForDay,
  validProgressGoals,
  validateProgressDraft,
} from './progress'

const TODAY = '2026-08-29'

function goal(overrides: Partial<ProgressGoal> = {}): ProgressGoal {
  return {
    id: 'water',
    name: 'Water',
    unit: 'glasses',
    target: 8,
    createdAt: 100,
    today: { date: TODAY, value: 3 },
    ...overrides,
  }
}

describe('validateProgressDraft', () => {
  it('trims a valid manual-goal draft without changing its numeric target', () => {
    expect(validateProgressDraft({ name: '  Read  ', unit: '  pages ', target: 12 })).toEqual({
      ok: true,
      value: { name: 'Read', unit: 'pages', target: 12 },
    })
  })

  it.each([
    [{ name: ' ', unit: 'pages', target: 1 }, 'Enter a goal name.'],
    [{ name: 'Read', unit: ' ', target: 1 }, 'Enter a unit such as glasses, pages, or minutes.'],
    [{ name: 'Read', unit: 'pages', target: 0 }, 'Choose a daily target from 1 to 999999.'],
    [{ name: 'Read', unit: 'pages', target: 1.5 }, 'Choose a daily target from 1 to 999999.'],
  ])('rejects an invalid draft with its user-facing message', (input, message) => {
    expect(validateProgressDraft(input)).toEqual({ ok: false, message })
  })
})

describe('progressValueForDay', () => {
  it('projects a stale stored day as zero without mutating the goal', () => {
    const stale = goal({ today: { date: '2026-08-28', value: 7 } })

    expect(progressValueForDay(stale, '2026-08-30')).toBe(0)
    expect(stale).toEqual(goal({ today: { date: '2026-08-28', value: 7 } }))
  })

  it('clamps corrupted same-day values into the goal target range for display', () => {
    expect(progressValueForDay(goal({ today: { date: TODAY, value: 99 } }), TODAY)).toBe(8)
    expect(progressValueForDay(goal({ today: { date: TODAY, value: -2 } }), TODAY)).toBe(0)
  })
})

describe('applyProgressIntent', () => {
  it('adds a normalized goal at the end with a zero value for the current day', () => {
    const out = applyProgressIntent([], {
      kind: 'add', id: 'read', name: '  Read  ', unit: ' pages ', target: 10, createdAt: 200,
    }, TODAY)

    expect(out).toEqual([{
      id: 'read', name: 'Read', unit: 'pages', target: 10, createdAt: 200, today: { date: TODAY, value: 0 },
    }])
  })

  it('starts an increment on a stale day from one and leaves the previous row untouched', () => {
    const stale = goal({ today: { date: '2026-08-28', value: 7 } })

    expect(applyProgressIntent([stale], { kind: 'increment', id: 'water' }, TODAY)).toEqual([
      goal({ today: { date: TODAY, value: 1 } }),
    ])
    expect(stale.today).toEqual({ date: '2026-08-28', value: 7 })
  })

  it('increments only to the target and completes or resets the current day atomically', () => {
    const nearComplete = goal({ today: { date: TODAY, value: 7 } })
    const completed = applyProgressIntent([nearComplete], { kind: 'increment', id: 'water' }, TODAY)

    expect(completed[0]!.today).toEqual({ date: TODAY, value: 8 })
    expect(applyProgressIntent(completed, { kind: 'complete', id: 'water' }, TODAY)[0]!.today).toEqual({ date: TODAY, value: 8 })
    expect(applyProgressIntent(completed, { kind: 'reset', id: 'water' }, TODAY)[0]!.today).toEqual({ date: TODAY, value: 0 })
  })

  it('edits the freshest row while preserving its order and clamping a lowered target', () => {
    const fresh = [
      goal({ id: 'move', name: 'Move', unit: 'minutes', target: 30, today: { date: TODAY, value: 22 } }),
      goal({ id: 'water', today: { date: TODAY, value: 7 } }),
    ]

    expect(applyProgressIntent(fresh, {
      kind: 'edit', id: 'water', name: ' Hydrate ', unit: ' glasses ', target: 5,
    }, TODAY)).toEqual([
      fresh[0],
      goal({ name: 'Hydrate', unit: 'glasses', target: 5, today: { date: TODAY, value: 5 } }),
    ])
  })

  it('moves a goal one position in the requested direction without crossing an edge', () => {
    const rows = [goal({ id: 'a' }), goal({ id: 'b' }), goal({ id: 'c' })]

    expect(applyProgressIntent(rows, { kind: 'move', id: 'b', direction: -1 }, TODAY).map((row) => row.id)).toEqual(['b', 'a', 'c'])
    expect(applyProgressIntent(rows, { kind: 'move', id: 'c', direction: 1 }, TODAY).map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })

  it('removes a goal and does not recreate a row deleted before a delayed action', () => {
    const removed = applyProgressIntent([goal()], { kind: 'remove', id: 'water' }, TODAY)

    expect(removed).toEqual([])
    expect(applyProgressIntent(removed, { kind: 'increment', id: 'water' }, TODAY)).toEqual([])
  })

  it.each([
    { kind: 'increment', id: 'missing' } as const,
    { kind: 'complete', id: 'missing' } as const,
    { kind: 'reset', id: 'missing' } as const,
    { kind: 'remove', id: 'missing' } as const,
    { kind: 'move', id: 'missing', direction: 1 } as const,
    { kind: 'edit', id: 'missing', name: 'Read', unit: 'pages', target: 2 } as const,
  ])('leaves rows unchanged when a row-targeted %s intent no longer has its id', (intent) => {
    const rows = [goal()]
    expect(applyProgressIntent(rows, intent, TODAY)).toEqual(rows)
  })

  it('enforces the six-goal cap inside the add updater', () => {
    const rows = Array.from({ length: MAX_PROGRESS_GOALS }, (_, index) => goal({ id: `g${index}` }))

    expect(applyProgressIntent(rows, {
      kind: 'add', id: 'extra', name: 'Extra', unit: 'things', target: 1, createdAt: 300,
    }, TODAY)).toEqual(rows)
  })
})

describe('validProgressGoals', () => {
  it('filters corrupted rows while retaining complete, over-cap persisted data in order', () => {
    const valid = Array.from({ length: MAX_PROGRESS_GOALS + 1 }, (_, index) => goal({ id: `g${index}` }))
    const rows = validProgressGoals([
      ...valid,
      { ...goal({ id: 'bad-date' }), today: { date: '2026-02-30', value: 1 } },
      { ...goal({ id: 'bad-value' }), today: { date: TODAY, value: 1.5 } },
      { ...goal({ id: 'bad-target' }), target: 0 },
      { ...goal({ id: 'bad-name' }), name: 'x'.repeat(41) },
      { ...goal({ id: 'bad-unit' }), unit: 'x'.repeat(17) },
    ])

    expect(rows).toEqual(valid)
  })
})
