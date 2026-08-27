import { describe, expect, it } from 'vitest'
import { defaults, type AttentionLedger } from './storage/schema'
import {
  ATTENTION_WINDOW_MS,
  collectAttentionSignals,
  reconcileAssignmentSource,
  summarizeAttention,
  type AttentionAssignment,
  type AttentionInputs,
} from './attention'

const NOW = Date.UTC(2026, 7, 26, 16, 0, 0)

function emptyLedger(): AttentionLedger {
  return { version: 1, sources: {} }
}

function inputs(overrides: Partial<AttentionInputs> = {}): AttentionInputs {
  return {
    now: NOW,
    use24Hour: false,
    events: [],
    assignments: [],
    deployments: [],
    hourly: [],
    ...overrides,
  }
}

function assignment(overrides: Partial<AttentionAssignment> = {}): AttentionAssignment {
  return {
    id: '42',
    source: 'github',
    sourceLabel: 'GitHub',
    title: 'Review the authentication fix',
    context: 'acme/aurora',
    url: 'https://github.com/acme/aurora/issues/42',
    firstSeenAt: NOW - 2 * 60 * 60 * 1_000,
    ...overrides,
  }
}

describe('attention ledger reconciliation', () => {
  it('silently baselines every id on the first valid observation', () => {
    const result = reconcileAssignmentSource(emptyLedger(), 'github', ['old-2', 'old-1'], 1_000)

    expect(result.sources.github).toEqual({
      observedAt: 1_000,
      items: {
        'old-1': { firstSeenAt: null },
        'old-2': { firstSeenAt: null },
      },
    })
  })

  it('timestamps only ids that arrive after the baseline', () => {
    const baseline = reconcileAssignmentSource(emptyLedger(), 'github', ['old'], 1_000, 'account-a')
    const result = reconcileAssignmentSource(baseline, 'github', ['old', 'new'], 2_000, 'account-a')

    expect(result.sources.github?.items).toEqual({
      new: { firstSeenAt: 2_000 },
      old: { firstSeenAt: null },
    })
  })

  it('silently re-baselines when the connector generation changes', () => {
    const baseline = reconcileAssignmentSource(emptyLedger(), 'github', ['old'], 1_000, 'account-a')
    const changed = reconcileAssignmentSource(baseline, 'github', ['old', 'new'], 2_000, 'account-b')

    expect(changed.sources.github).toEqual({
      generation: 'account-b',
      observedAt: 2_000,
      items: { new: { firstSeenAt: null }, old: { firstSeenAt: null } },
    })
  })

  it('returns the authoritative ledger unchanged for equal or older observations', () => {
    const current = reconcileAssignmentSource(emptyLedger(), 'github', ['old'], 2_000)

    expect(reconcileAssignmentSource(current, 'github', ['replacement'], 2_000)).toBe(current)
    expect(reconcileAssignmentSource(current, 'github', ['replacement'], 1_999)).toBe(current)
  })

  it('drops absent ids and treats a later reappearance as newly observed', () => {
    const baseline = reconcileAssignmentSource(emptyLedger(), 'github', ['old', 'kept'], 1_000)
    const removed = reconcileAssignmentSource(baseline, 'github', ['kept'], 2_000)
    const reappeared = reconcileAssignmentSource(removed, 'github', ['old', 'kept'], 3_000)

    expect(reappeared.sources.github?.items.old).toEqual({ firstSeenAt: 3_000 })
    expect(reappeared.sources.github?.items.kept).toEqual({ firstSeenAt: null })
  })

  it('is idempotent and never stores remote titles or urls', () => {
    const once = reconcileAssignmentSource(emptyLedger(), 'gitlab', ['mr-8', 'mr-8', '  '], 1_000)
    const twice = reconcileAssignmentSource(once, 'gitlab', ['mr-8'], 2_000)
    const serialized = JSON.stringify(twice)

    expect(twice.sources.gitlab?.items).toEqual({ 'mr-8': { firstSeenAt: null } })
    expect(serialized).not.toContain('https://')
    expect(serialized).not.toContain('title')
  })
})

describe('attention signal collection', () => {
  it('excludes silent-baseline, future, and expired assignments at the exact six-hour boundary', () => {
    const signals = collectAttentionSignals(inputs({
      assignments: [
        assignment({ id: 'baseline', firstSeenAt: null }),
        assignment({ id: 'future', firstSeenAt: NOW + 1 }),
        assignment({ id: 'boundary', firstSeenAt: NOW - ATTENTION_WINDOW_MS }),
        assignment({ id: 'expired', firstSeenAt: NOW - ATTENTION_WINDOW_MS - 1 }),
      ],
    }))

    expect(signals.map((signal) => signal.key)).toEqual(['assignment:github:boundary'])
    expect(signals[0].detail).toBe('acme/aurora · First seen by Aurora 6h ago')
  })

  it('surfaces only recent Vercel ERROR deployments', () => {
    const signals = collectAttentionSignals(inputs({
      deployments: [
        { id: 'ready', project: 'ready', state: 'READY', createdAt: NOW - 1_000 },
        { id: 'future', project: 'future', state: 'ERROR', createdAt: NOW + 1 },
        { id: 'expired', project: 'old', state: 'ERROR', createdAt: NOW - ATTENTION_WINDOW_MS - 1 },
        { id: 'failed', project: 'aurora-newtab', state: 'error', createdAt: NOW - 18 * 60_000, url: 'https://vercel.com/acme/aurora/failed' },
      ],
    }))

    expect(signals).toEqual([expect.objectContaining({
      key: 'deployment:failed',
      kind: 'deployment',
      source: 'Vercel',
      title: 'aurora-newtab',
      detail: 'Failed 18m ago',
    })])
  })

  it('keeps the existing 24-hour Calendar selection and prefers a timed event', () => {
    const signals = collectAttentionSignals(inputs({
      events: [
        { summary: 'All day planning', start: NOW - 60_000, end: NOW + 8 * 60 * 60_000, allDay: true },
        { summary: '  Dentist   appointment  ', start: NOW + 2 * 60 * 60_000, end: NOW + 3 * 60 * 60_000, allDay: false },
        { summary: 'Tomorrow plus', start: NOW + 24 * 60 * 60_000 + 1, end: NOW + 25 * 60 * 60_000, allDay: false },
      ],
    }))

    expect(signals).toEqual([expect.objectContaining({
      kind: 'calendar',
      source: 'Calendar',
      title: 'Dentist appointment in 2h',
    })])
  })

  it('retains the rain threshold and 12/24-hour formatting', () => {
    const hourly = [
      { time: '2026-08-26T18:00', precipProb: 49 },
      { time: '2026-08-26T19:30', precipProb: 50 },
    ]

    expect(collectAttentionSignals(inputs({ hourly }))[0].title).toBe('Rain 7:30 PM')
    expect(collectAttentionSignals(inputs({ hourly, use24Hour: true }))[0].title).toBe('Rain 19:30')
  })

  it('orders Vercel, assignments, Calendar, then rain deterministically', () => {
    const signals = collectAttentionSignals(inputs({
      assignments: [assignment()],
      deployments: [{ id: 'failed', project: 'aurora', state: 'ERROR', createdAt: NOW - 1_000 }],
      events: [{ summary: 'Dentist', start: NOW + 60_000, end: NOW + 120_000, allDay: false }],
      hourly: [{ time: '2026-08-26T19:00', precipProb: 80 }],
    }))

    expect(signals.map((signal) => signal.kind)).toEqual(['deployment', 'assignment', 'calendar', 'rain'])
  })

  it('bounds and cleans remote titles before returning renderable text', () => {
    const long = `  ${'word '.repeat(40)}  `
    const [signal] = collectAttentionSignals(inputs({ assignments: [assignment({ title: long })] }))

    expect(signal.title.length).toBeLessThanOrEqual(96)
    expect(signal.title.endsWith('…')).toBe(true)
    expect(signal.title).not.toContain('  ')
  })

  it('does not derive any signal from ordinary unfinished Aurora tasks', () => {
    const stored = defaults()
    stored.todoLists = [{ id: 'list', name: 'Tasks', items: [{ id: 'task', text: 'Old undated task', done: false }] }]

    expect(collectAttentionSignals(inputs())).toEqual([])
  })
})

describe('attention summary copy', () => {
  it('uses task copy for assignments, Vercel copy for failures, and item copy for mixed work', () => {
    const [work] = collectAttentionSignals(inputs({ assignments: [assignment()] }))
    const [failure] = collectAttentionSignals(inputs({
      deployments: [{ id: 'failed', project: 'aurora', state: 'ERROR', createdAt: NOW - 1_000 }],
    }))

    expect(summarizeAttention([work])).toBe('1 task needs attention')
    expect(summarizeAttention([work, { ...work, key: 'assignment:jira:2' }])).toBe('2 tasks need attention')
    expect(summarizeAttention([failure])).toBe('Vercel build failed')
    expect(summarizeAttention([failure, { ...failure, key: 'deployment:2' }])).toBe('2 Vercel builds failed')
    expect(summarizeAttention([failure, work])).toBe('2 items need attention')
  })

  it('adds the next Calendar summary after higher-priority work and otherwise uses direct context', () => {
    const work = collectAttentionSignals(inputs({ assignments: [assignment()] }))[0]
    const calendar = collectAttentionSignals(inputs({
      events: [{ summary: 'Dentist', start: NOW + 2 * 60 * 60_000, end: NOW + 3 * 60 * 60_000, allDay: false }],
    }))[0]

    expect(summarizeAttention([work, calendar])).toBe('1 task needs attention · Dentist in 2h')
    expect(summarizeAttention([calendar])).toBe('Dentist in 2h')
    expect(summarizeAttention([])).toBe('')
  })
})
