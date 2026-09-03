import { describe, expect, it } from 'vitest'
import {
  assertMetricBucket,
  emptyMetricsHistory,
  mergeMetricHistories,
  metricRangeStart,
  metricsRetentionStart,
  pruneMetricsHistory,
  summarizeMetrics,
  upsertLocalMetricBucket,
} from './history'
import type { MetricBucketV1, MetricsHistoryV1 } from './types'

const INSTALLATION_A = '11111111-1111-4111-8111-111111111111'
const INSTALLATION_B = '22222222-2222-4222-8222-222222222222'
const BUCKET_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BUCKET_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const BUCKET_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function bucket(patch: Partial<MetricBucketV1> = {}): MetricBucketV1 {
  return {
    schemaVersion: 1,
    id: BUCKET_A,
    date: '2026-09-02',
    source: 'tasks',
    sourceInstanceId: 'local-tasks',
    installationId: INSTALLATION_A,
    sequence: 1,
    values: { kind: 'tasks', completed: 2, carriedForward: 3 },
    ...patch,
  } as MetricBucketV1
}

function history(buckets: MetricBucketV1[], installationId = INSTALLATION_A): MetricsHistoryV1 {
  return { version: 1, installationId, buckets }
}

describe('metrics calendar windows', () => {
  it('retains the current local calendar month and the previous twelve months', () => {
    expect(metricsRetentionStart('2026-09-02')).toBe('2025-09-01')
    expect(metricsRetentionStart('2026-01-31')).toBe('2025-01-01')
  })

  it('uses inclusive trailing ranges without parsing local keys through the host timezone', () => {
    expect(metricRangeStart('7d', '2026-09-02')).toBe('2026-08-27')
    expect(metricRangeStart('30d', '2026-09-02')).toBe('2026-08-04')
    expect(metricRangeStart('90d', '2026-09-02')).toBe('2026-06-05')
    expect(metricRangeStart('365d', '2026-09-02')).toBe('2025-09-03')
    expect(metricRangeStart('7d', '2024-03-02')).toBe('2024-02-25')
  })
})

describe('metric bucket validation', () => {
  it('accepts only an exact aggregate task bucket', () => {
    expect(() => assertMetricBucket(bucket())).not.toThrow()
    expect(() => assertMetricBucket({
      ...bucket(),
      values: { kind: 'tasks', completed: 1, carriedForward: 2, taskText: 'private' },
    })).toThrow('metric_bucket_invalid')
  })

  it.each([
    ['non-uuid bucket id', { id: '2026-09-02:tasks' }],
    ['invalid day', { date: '2026-02-30' }],
    ['unknown source', { source: 'meetings' }],
    ['raw source label', { sourceInstanceId: 'github:private-repository' }],
    ['non-uuid installation', { installationId: 'Desktop' }],
    ['zero sequence', { sequence: 0 }],
    ['fractional count', { values: { kind: 'tasks', completed: 0.5, carriedForward: 2 } }],
    ['negative count', { values: { kind: 'tasks', completed: -1, carriedForward: 2 } }],
    ['non-finite count', { values: { kind: 'tasks', completed: Number.POSITIVE_INFINITY, carriedForward: 2 } }],
    ['mismatched value tag', { values: { kind: 'focus', sessions: 1, minutes: 25 } }],
  ])('rejects %s', (_label, patch) => {
    expect(() => assertMetricBucket({ ...bucket(), ...patch })).toThrow('metric_bucket_invalid')
  })

  it('accepts only the six restricted fitness activity classes', () => {
    const values = {
      kind: 'fitness' as const,
      activities: 2,
      durationMinutes: 65,
      distanceMeters: 12_000,
      elevationMeters: 320,
      types: { run: 1, ride: 0, walk: 0, hike: 1, swim: 0, other: 0 },
    }
    expect(() => assertMetricBucket(bucket({ source: 'fitness', sourceInstanceId: 'strava', values }))).not.toThrow()
    expect(() => assertMetricBucket(bucket({
      source: 'fitness',
      sourceInstanceId: 'strava',
      values: { ...values, types: { ...values.types, kayak: 1 } } as never,
    }))).toThrow('metric_bucket_invalid')
  })
})

describe('metric history updates and retention', () => {
  it('keeps a stable opaque id and increments the sequence for a local logical bucket', () => {
    const initial = emptyMetricsHistory(INSTALLATION_A)
    const first = upsertLocalMetricBucket(initial, {
      date: '2026-09-02',
      source: 'tasks',
      sourceInstanceId: 'local-tasks',
      values: { kind: 'tasks', completed: 1, carriedForward: 4 },
    }, () => BUCKET_A)
    const second = upsertLocalMetricBucket(first, {
      date: '2026-09-02',
      source: 'tasks',
      sourceInstanceId: 'local-tasks',
      values: { kind: 'tasks', completed: 2, carriedForward: 3 },
    }, () => BUCKET_B)

    expect(second.buckets).toEqual([bucket({ sequence: 2 })])
  })

  it('never overwrites another installation contribution with a local update', () => {
    const foreign = bucket({ installationId: INSTALLATION_B })
    const updated = upsertLocalMetricBucket(history([foreign]), {
      date: '2026-09-02',
      source: 'tasks',
      sourceInstanceId: 'local-tasks',
      values: { kind: 'tasks', completed: 5, carriedForward: 1 },
    }, () => BUCKET_B)

    expect(updated.buckets).toEqual([
      foreign,
      bucket({ id: BUCKET_B, values: { kind: 'tasks', completed: 5, carriedForward: 1 } }),
    ])
  })

  it('prunes only buckets before the thirteen-calendar-month cutoff', () => {
    const keptAtBoundary = bucket({ id: BUCKET_B, date: '2025-09-01' })
    const keptCurrent = bucket({ id: BUCKET_C, date: '2026-09-02' })
    const pruned = pruneMetricsHistory(history([
      bucket({ date: '2025-08-31' }),
      keptAtBoundary,
      keptCurrent,
    ]), '2026-09-02')

    expect(pruned.buckets).toEqual([keptAtBoundary, keptCurrent])
  })
})

describe('metric history merge', () => {
  it('unions opaque buckets and keeps the higher sequence for the same id', () => {
    const merged = mergeMetricHistories(
      history([bucket({ sequence: 1 })]),
      history([
        bucket({ sequence: 2, values: { kind: 'tasks', completed: 4, carriedForward: 1 } }),
        bucket({ id: BUCKET_B, installationId: INSTALLATION_B }),
      ], INSTALLATION_B),
      '2026-09-02',
    )

    expect(merged.installationId).toBe(INSTALLATION_A)
    expect(merged.buckets).toEqual([
      bucket({ sequence: 2, values: { kind: 'tasks', completed: 4, carriedForward: 1 } }),
      bucket({ id: BUCKET_B, installationId: INSTALLATION_B }),
    ])
  })

  it('rejects equal-sequence divergent content instead of trusting a device clock', () => {
    expect(() => mergeMetricHistories(
      history([bucket()]),
      history([bucket({ values: { kind: 'tasks', completed: 9, carriedForward: 0 } })], INSTALLATION_B),
      '2026-09-02',
    )).toThrow('metric_history_conflict')
  })
})

describe('metric summaries', () => {
  it('sums installation-owned focus while collapsing mirrored source duplicates by maximum', () => {
    const summary = summarizeMetrics(history([
      bucket({ id: BUCKET_A, source: 'focus', sourceInstanceId: INSTALLATION_A, values: { kind: 'focus', sessions: 2, minutes: 50 } }),
      bucket({ id: BUCKET_B, source: 'focus', sourceInstanceId: INSTALLATION_B, installationId: INSTALLATION_B, values: { kind: 'focus', sessions: 1, minutes: 25 } }),
      bucket({ id: BUCKET_C, source: 'tasks', sourceInstanceId: 'local-tasks', installationId: INSTALLATION_B, values: { kind: 'tasks', completed: 5, carriedForward: 2 } }),
      bucket({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', source: 'tasks', sourceInstanceId: 'local-tasks', values: { kind: 'tasks', completed: 3, carriedForward: 4 } }),
    ]), '7d', '2026-09-02')

    expect(summary.start).toBe('2026-08-27')
    expect(summary.end).toBe('2026-09-02')
    expect(summary.totals.focus).toEqual({ sessions: 3, minutes: 75 })
    expect(summary.totals.tasks).toEqual({ completed: 5, carriedForward: 4 })
    expect(summary.days).toHaveLength(7)
    expect(summary.days.at(-1)?.date).toBe('2026-09-02')
  })

  it('sums distinct mirrored source instances after de-duplicating each instance', () => {
    const summary = summarizeMetrics(history([
      bucket({ id: BUCKET_A, source: 'development', sourceInstanceId: 'github', values: { kind: 'development', commits: 3, reviews: 1, issues: 0, deployments: 0, failures: 0 } }),
      bucket({ id: BUCKET_B, source: 'development', sourceInstanceId: 'github', installationId: INSTALLATION_B, values: { kind: 'development', commits: 5, reviews: 0, issues: 2, deployments: 0, failures: 0 } }),
      bucket({ id: BUCKET_C, source: 'development', sourceInstanceId: 'gitlab', values: { kind: 'development', commits: 4, reviews: 2, issues: 1, deployments: 0, failures: 0 } }),
    ]), '30d', '2026-09-02')

    expect(summary.totals.development).toEqual({ commits: 9, reviews: 3, issues: 3, deployments: 0, failures: 0 })
  })
})
