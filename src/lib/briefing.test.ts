import { describe, expect, it } from 'vitest'
import { collectBriefingSignals, formatBriefing, type BriefingInputs } from './briefing'

const NOW = Date.UTC(2026, 7, 16, 16, 0)

function inputs(overrides: Partial<BriefingInputs> = {}): BriefingInputs {
  return {
    now: NOW,
    use24Hour: false,
    events: [],
    todoLists: [],
    hourly: [],
    ...overrides,
  }
}

describe('Aurora Briefing signal collection', () => {
  it('orders the next calendar item, incomplete task count, then likely rain', () => {
    const signals = collectBriefingSignals(inputs({
      events: [
        { summary: 'Later review', start: NOW + 3_600_000, end: NOW + 5_400_000, allDay: false },
        { summary: 'Design review', start: NOW + 48 * 60_000, end: NOW + 78 * 60_000, allDay: false },
      ],
      todoLists: [{ items: [{ done: false }, { done: true }, { done: false }, { done: false }] }],
      hourly: [
        { time: '2026-08-16T18:00', precipProb: 25 },
        { time: '2026-08-16T19:00', precipProb: 70 },
      ],
    }))

    expect(signals).toEqual([
      { kind: 'calendar', text: 'Design review in 48m' },
      { kind: 'tasks', text: '3 tasks need attention' },
      { kind: 'rain', text: 'Rain 7 PM' },
    ])
  })

  it('uses deterministic event tie-breaking and omits expired or more-than-a-day-away events', () => {
    const signals = collectBriefingSignals(inputs({
      events: [
        { summary: 'Expired', start: NOW - 3_600_000, end: NOW, allDay: false },
        { summary: 'Zulu', start: NOW + 30 * 60_000, end: NOW + 60 * 60_000, allDay: false },
        { summary: 'Alpha', start: NOW + 30 * 60_000, end: NOW + 60 * 60_000, allDay: false },
        { summary: 'Next week', start: NOW + 8 * 86_400_000, end: NOW + 8 * 86_400_000 + 3_600_000, allDay: false },
      ],
    }))
    expect(signals).toEqual([{ kind: 'calendar', text: 'Alpha in 30m' }])
  })

  it('describes an active all-day item without exposing unrelated event fields', () => {
    const signals = collectBriefingSignals(inputs({
      events: [{
        summary: 'Company retreat',
        start: NOW - 8 * 3_600_000,
        end: NOW + 8 * 3_600_000,
        allDay: true,
      }],
    }))
    expect(signals).toEqual([{ kind: 'calendar', text: 'Company retreat today' }])
  })

  it('omits completed tasks, sub-threshold rain, malformed hours, and malformed events', () => {
    expect(collectBriefingSignals(inputs({
      events: [
        { summary: '', start: NOW + 1_000, end: NOW + 2_000, allDay: false },
        { summary: 'Broken', start: Number.NaN, end: NOW + 2_000, allDay: false },
      ],
      todoLists: [{ items: [{ done: true }] }],
      hourly: [
        { time: 'not-an-hour', precipProb: 90 },
        { time: '2026-08-16T19:00', precipProb: 49 },
      ],
    }))).toEqual([])
  })

  it('honors 24-hour time for the rain signal', () => {
    expect(collectBriefingSignals(inputs({
      use24Hour: true,
      hourly: [{ time: '2026-08-16T19:00', precipProb: 50 }],
    }))).toContainEqual({ kind: 'rain', text: 'Rain 19:00' })
  })
})

describe('Aurora Briefing responsive formatting', () => {
  const signals = [
    { kind: 'calendar' as const, text: 'Design review in 48m' },
    { kind: 'tasks' as const, text: '3 tasks need attention' },
    { kind: 'rain' as const, text: 'Rain 7 PM' },
  ]

  it('admits exactly one, two, and three signals by profile', () => {
    expect(formatBriefing(signals, 'compact')).toBe('Design review in 48m')
    expect(formatBriefing(signals, 'standard')).toBe('Design review in 48m · 3 tasks need attention')
    expect(formatBriefing(signals, 'display')).toBe('Design review in 48m · 3 tasks need attention · Rain 7 PM')
  })

  it('uses a fixed fallback when no useful local signal exists', () => {
    expect(formatBriefing([], 'compact')).toBe('Nothing urgent.')
    expect(formatBriefing([], 'display')).toBe('Nothing urgent.')
  })

  it('truncates deterministically inside the profile character ceiling', () => {
    const text = formatBriefing([
      { kind: 'calendar', text: 'A'.repeat(90) },
      { kind: 'tasks', text: '4 tasks need attention' },
    ], 'compact')
    expect(text).toHaveLength(56)
    expect(text.endsWith('…')).toBe(true)
  })
})
