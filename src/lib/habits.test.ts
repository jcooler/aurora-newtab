import { describe, expect, it } from 'vitest'
import { localDateKey, prevDayKey, streak, toggleDay } from './habits'

describe('localDateKey', () => {
  it('formats a local date as YYYY-MM-DD, zero-padded', () => {
    expect(localDateKey(new Date(2026, 6, 26))).toBe('2026-07-26')
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  // 2026-11-01 is the US fall-back DST day (clocks repeat 1am-2am). toISOString()
  // is UTC and would shift a late-night/early-morning local time onto the wrong
  // calendar day; getFullYear/getMonth/getDate read the local wall-clock date
  // regardless of the DST ambiguity at that hour.
  it('stays on the fall-back DST day for a 1:30am local time', () => {
    expect(localDateKey(new Date(2026, 10, 1, 1, 30))).toBe('2026-11-01')
  })
})

describe('prevDayKey', () => {
  // 2026-03-08 is the US spring-forward DST day (2am -> 3am skipped). Date-part
  // arithmetic (new Date(y, m, d-1)) must be a non-event here; ms subtraction
  // (-86400000) would be wrong because that day is only 23 hours long.
  it('walks back across the spring-forward DST week unaffected', () => {
    expect(prevDayKey('2026-03-09')).toBe('2026-03-08')
    expect(prevDayKey('2026-03-08')).toBe('2026-03-07')
    expect(prevDayKey('2026-03-10')).toBe('2026-03-09')
  })

  it('rolls back across a month boundary', () => {
    expect(prevDayKey('2026-03-01')).toBe('2026-02-28')
  })

  it('rolls back across a leap-year February', () => {
    expect(prevDayKey('2028-03-01')).toBe('2028-02-29')
    expect(prevDayKey('2028-02-29')).toBe('2028-02-28')
  })

  it('rolls back across a year boundary', () => {
    expect(prevDayKey('2026-01-01')).toBe('2025-12-31')
  })
})

describe('streak', () => {
  it('counts a run across the spring-forward DST week as a plain 5-day streak', () => {
    const log = ['2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09']
    expect(streak(log, '2026-03-09')).toBe(5)
  })

  it('gap = reset: counts only the tail run, ignoring an older disconnected run', () => {
    const log = ['2026-06-01', '2026-06-02', '2026-06-08', '2026-06-09', '2026-06-10']
    expect(streak(log, '2026-06-10')).toBe(3) // 06-08, 06-09, 06-10 only
  })

  it('yesterday keeps the streak alive when today is unmarked', () => {
    const log = ['2026-07-05', '2026-07-06', '2026-07-07']
    expect(streak(log, '2026-07-08')).toBe(3)
  })

  it('marking today on top of an alive streak extends it by one', () => {
    const log = ['2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08']
    expect(streak(log, '2026-07-08')).toBe(4)
  })

  it('unmark-today recompute: removing today falls back to the yesterday rule', () => {
    const withToday = ['2026-07-06', '2026-07-07', '2026-07-08']
    expect(streak(withToday, '2026-07-08')).toBe(3)
    const withoutToday = toggleDay(withToday, '2026-07-08')
    expect(streak(withoutToday, '2026-07-08')).toBe(2) // falls back to yesterday (07-07) rule
  })

  it('neither today nor yesterday marked -> 0', () => {
    expect(streak(['2026-07-01'], '2026-07-08')).toBe(0)
    expect(streak([], '2026-07-08')).toBe(0)
  })

  it('tolerates duplicate and unsorted entries', () => {
    const log = ['2026-07-08', '2026-07-06', '2026-07-08', '2026-07-07']
    expect(streak(log, '2026-07-08')).toBe(3)
  })
})

describe('toggleDay', () => {
  it('adds a key that is absent', () => {
    expect(toggleDay([], '2026-07-08')).toEqual(['2026-07-08'])
  })

  it('removes a key that is present', () => {
    const log = ['2026-07-06', '2026-07-07', '2026-07-08']
    expect(toggleDay(log, '2026-07-07')).toEqual(['2026-07-06', '2026-07-08'])
  })

  it('returns a sorted array regardless of insertion order', () => {
    const log = ['2026-07-08', '2026-07-06']
    expect(toggleDay(log, '2026-07-07')).toEqual(['2026-07-06', '2026-07-07', '2026-07-08'])
  })

  it('never mutates the input array', () => {
    const original = ['2026-07-06']
    const result = toggleDay(original, '2026-07-07')
    expect(original).toEqual(['2026-07-06'])
    expect(result).not.toBe(original)
  })
})
