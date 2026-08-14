import { describe, expect, it } from 'vitest'
import {
  calendarDayDifference,
  dayHash,
  todayKey,
  zonedDateKey,
  zonedLocalDayRange,
  zonedWallTimeToEpoch,
} from './dates'

describe('todayKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 6, 26))).toBe('2026-07-26')
  })
  it('zero-pads month and day', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('dayHash', () => {
  it('is deterministic and non-negative', () => {
    expect(dayHash('2026-07-26')).toBe(dayHash('2026-07-26'))
    expect(dayHash('2026-07-26')).toBeGreaterThanOrEqual(0)
  })
  it('differs across adjacent days', () => {
    expect(dayHash('2026-07-26')).not.toBe(dayHash('2026-07-27'))
  })
})

describe('zoned local calendar days', () => {
  it('uses compatible disambiguation for ordinary gaps and overlaps', () => {
    expect(
      zonedWallTimeToEpoch(
        { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 },
        'America/New_York',
      ),
    ).toBe(Date.UTC(2026, 2, 8, 7, 30))
    expect(
      zonedWallTimeToEpoch(
        { year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 },
        'America/New_York',
      ),
    ).toBe(Date.UTC(2026, 10, 1, 5, 30))
    expect(
      zonedWallTimeToEpoch(
        { year: 2011, month: 12, day: 30, hour: 0, minute: 0, second: 0 },
        'Pacific/Apia',
      ),
    ).toBe(Date.UTC(2011, 11, 30, 10))
  })

  it.each([
    {
      label: 'New York spring-forward',
      zone: 'America/New_York',
      inside: Date.UTC(2026, 2, 8, 12),
      key: '2026-03-08',
      start: Date.UTC(2026, 2, 8, 5),
      end: Date.UTC(2026, 2, 9, 4),
      hours: 23,
    },
    {
      label: 'New York fall-back',
      zone: 'America/New_York',
      inside: Date.UTC(2026, 10, 1, 12),
      key: '2026-11-01',
      start: Date.UTC(2026, 10, 1, 4),
      end: Date.UTC(2026, 10, 2, 5),
      hours: 25,
    },
    {
      label: 'Berlin spring-forward',
      zone: 'Europe/Berlin',
      inside: Date.UTC(2026, 2, 29, 12),
      key: '2026-03-29',
      start: Date.UTC(2026, 2, 28, 23),
      end: Date.UTC(2026, 2, 29, 22),
      hours: 23,
    },
    {
      label: 'Berlin fall-back',
      zone: 'Europe/Berlin',
      inside: Date.UTC(2026, 9, 25, 12),
      key: '2026-10-25',
      start: Date.UTC(2026, 9, 24, 22),
      end: Date.UTC(2026, 9, 25, 23),
      hours: 25,
    },
    {
      label: 'Havana midnight spring-forward',
      zone: 'America/Havana',
      inside: Date.UTC(2026, 2, 8, 12),
      key: '2026-03-08',
      start: Date.UTC(2026, 2, 8, 5),
      end: Date.UTC(2026, 2, 9, 4),
      hours: 23,
    },
    {
      label: 'Santiago midnight spring-forward',
      zone: 'America/Santiago',
      inside: Date.UTC(2026, 8, 6, 12),
      key: '2026-09-06',
      start: Date.UTC(2026, 8, 6, 4),
      end: Date.UTC(2026, 8, 7, 3),
      hours: 23,
    },
    {
      label: 'Azores midnight spring-forward',
      zone: 'Atlantic/Azores',
      inside: Date.UTC(2026, 2, 29, 12),
      key: '2026-03-29',
      start: Date.UTC(2026, 2, 29, 1),
      end: Date.UTC(2026, 2, 30, 0),
      hours: 23,
    },
  ])('constructs the literal $label boundaries', ({ zone, inside, key, start, end, hours }) => {
    expect(zonedLocalDayRange(inside, zone)).toEqual({ key, start, end })
    expect(end - start).toBe(hours * 3_600_000)
  })

  it.each([
    ['America/New_York', Date.UTC(2026, 11, 31, 18), '2026-12-31', Date.UTC(2027, 0, 1, 5)],
    ['Europe/Berlin', Date.UTC(2028, 1, 29, 12), '2028-02-29', Date.UTC(2028, 1, 29, 23)],
  ])('constructs month, year, and leap-day rollover in %s', (zone, inside, key, end) => {
    const range = zonedLocalDayRange(inside as number, zone as string)
    expect(range.key).toBe(key)
    expect(range.end).toBe(end)
  })

  it.each([
    ['America/New_York', Date.UTC(2026, 2, 8, 12), Date.UTC(2026, 2, 9, 12)],
    ['America/New_York', Date.UTC(2026, 10, 1, 12), Date.UTC(2026, 10, 2, 12)],
    ['Europe/Berlin', Date.UTC(2026, 2, 29, 12), Date.UTC(2026, 2, 30, 12)],
    ['Europe/Berlin', Date.UTC(2026, 9, 25, 12), Date.UTC(2026, 9, 26, 12)],
  ])('counts the adjacent DST calendar day in %s as one', (zone, from, to) => {
    expect(calendarDayDifference(from as number, to as number, zone as string)).toBe(1)
  })

  it('keeps the six/seven-day fence exact across New York spring-forward', () => {
    const from = Date.UTC(2026, 2, 6, 17)
    expect(calendarDayDifference(from, Date.UTC(2026, 2, 12, 16), 'America/New_York')).toBe(6)
    expect(calendarDayDifference(from, Date.UTC(2026, 2, 13, 16), 'America/New_York')).toBe(7)
  })

  it('formats a date key in the named zone and rejects an unknown zone', () => {
    expect(zonedDateKey(Date.UTC(2026, 0, 1, 1), 'America/New_York')).toBe('2025-12-31')
    expect(() => zonedLocalDayRange(Date.now(), 'Mars/Olympus_Mons')).toThrow('Invalid time zone')
  })
})
