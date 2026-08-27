import { describe, expect, it } from 'vitest'
import { freshnessAt, resourceStateOf } from './asyncState'

describe('freshnessAt', () => {
  it.each([
    ['unknown only when there is no timestamp', null, 5_000, 6_000, 'unknown'],
    ['fresh before the TTL boundary', 1_000, 5_000, 5_999, 'fresh'],
    ['stale at the exact TTL boundary', 1_000, 5_000, 6_000, 'stale'],
    ['stale after the TTL boundary', 1_000, 5_000, 6_001, 'stale'],
  ] as const)('%s', (_name, fetchedAt, ttlMs, now, expected) => {
    expect(freshnessAt(fetchedAt, ttlMs, now)).toBe(expected)
  })

  it.each([
    ['a non-finite fetchedAt', Number.NaN, 5_000, 6_000],
    ['an infinite fetchedAt', Number.POSITIVE_INFINITY, 5_000, 6_000],
    ['a non-finite ttlMs', 1_000, Number.NaN, 6_000],
    ['an infinite ttlMs', 1_000, Number.POSITIVE_INFINITY, 6_000],
    ['a negative ttlMs', 1_000, -1, 6_000],
    ['a non-finite now', 1_000, 5_000, Number.NaN],
    ['an infinite now', 1_000, 5_000, Number.NEGATIVE_INFINITY],
  ])('%s throws RangeError', (_name, fetchedAt, ttlMs, now) => {
    expect(() => freshnessAt(fetchedAt, ttlMs, now)).toThrow(RangeError)
  })
})

describe('resourceStateOf', () => {
  it.each([
    ['idle with no data and no outcome', false, null, false, null, 6_000, 'idle', 'unknown'],
    ['success with fresh data', true, 1_000, false, null, 5_999, 'success', 'fresh'],
    ['success retains stale freshness at the exact boundary', true, 1_000, false, null, 6_000, 'success', 'stale'],
    ['pending wins over an error while retaining stale data', true, 1_000, true, 'offline', 6_000, 'pending', 'stale'],
    ['pending without data remains unknown', false, null, true, null, 6_000, 'pending', 'unknown'],
    ['error with cached data retains fresh freshness', true, 1_000, false, 'offline', 5_999, 'error', 'fresh'],
    ['error without data is still an error', false, null, false, 'offline', 6_000, 'error', 'unknown'],
    ['an empty caught-error string remains an error outcome', false, 1_000, false, '', 6_000, 'error', 'stale'],
  ] as const)('%s', (_name, hasData, fetchedAt, pending, error, now, operation, freshness) => {
    expect(resourceStateOf({ hasData, fetchedAt, ttlMs: 5_000, pending, error, now })).toEqual({
      operation,
      freshness,
      hasData,
    })
  })

  it('uses only the caller supplied now value for deterministic derivation', () => {
    const input = { hasData: true, fetchedAt: 1_000, ttlMs: 5_000, pending: false, error: null }
    expect(resourceStateOf({ ...input, now: 5_999 })).toEqual({ operation: 'success', freshness: 'fresh', hasData: true })
    expect(resourceStateOf({ ...input, now: 6_000 })).toEqual({ operation: 'success', freshness: 'stale', hasData: true })
  })
})
