import { describe, expect, it } from 'vitest'
import { countdownPhrase, daysUntil, zoneTime, zoneContext } from './worldTime'

describe('world clock relative context', () => {
  it.each([
    ['Asia/Tokyo', '2026-09-05T14:42:00Z', 'Sat · 13 hours ahead'],
    ['Australia/Adelaide', '2026-09-05T14:42:00Z', 'Sun · 13.5 hours ahead'],
    ['Europe/London', '2026-03-15T12:00:00Z', 'Sun · 4 hours ahead'],
    ['Europe/London', '2026-04-01T12:00:00Z', 'Wed · 5 hours ahead'],
    ['America/Los_Angeles', '2026-09-05T14:42:00Z', 'Sat · 3 hours behind'],
    ['America/New_York', '2026-09-05T14:42:00Z', 'Sat · Same time'],
  ])('uses the current offsets and local weekday for %s at %s', (zone, instant, expected) => {
    expect(zoneContext(zone, new Date(instant), 'America/New_York', 'en-US')).toBe(expected)
  })
  it('handles an invalid zone without crashing the clock list', () => {
    expect(zoneContext('Invalid/Zone', new Date('2026-09-05T14:42:00Z'), 'America/New_York')).toBe('Timezone unavailable')
  })
})

describe('zoneTime', () => {
  // Fixed instant: 2026-07-26T15:00:00Z. UTC has no offset; Tokyo (UTC+9, no
  // DST) rolls this past midnight into the next day, which also exercises
  // the day-boundary case for free.
  const now = new Date('2026-07-26T15:00:00Z')

  it('formats 24-hour time in UTC', () => {
    expect(zoneTime('UTC', true, now)).toBe('15:00')
  })

  it('formats 12-hour time in UTC', () => {
    expect(zoneTime('UTC', false, now)).toBe('3:00 PM')
  })

  it('formats 24-hour time in a zone ahead of UTC, across midnight', () => {
    expect(zoneTime('Asia/Tokyo', true, now)).toBe('00:00')
  })

  it('formats 12-hour time in a zone ahead of UTC, across midnight', () => {
    expect(zoneTime('Asia/Tokyo', false, now)).toBe('12:00 AM')
  })

  it('returns an em dash for an invalid zone instead of throwing', () => {
    expect(zoneTime('Not/AZone', false, now)).toBe('—')
    expect(zoneTime('', true, now)).toBe('—')
  })
})

describe('daysUntil', () => {
  it('is 0 for today', () => {
    expect(daysUntil('2026-07-26', '2026-07-26')).toBe(0)
  })

  it('is 1 for tomorrow', () => {
    expect(daysUntil('2026-07-27', '2026-07-26')).toBe(1)
  })

  it('is negative for a past date', () => {
    expect(daysUntil('2026-07-25', '2026-07-26')).toBe(-1)
  })

  it('counts across a leap day correctly (2028 is a leap year)', () => {
    expect(daysUntil('2028-03-01', '2028-02-28')).toBe(2)
  })

  it('counts across the same span in a non-leap year as one day fewer', () => {
    expect(daysUntil('2027-03-01', '2027-02-28')).toBe(1)
  })
})

describe('countdownPhrase', () => {
  it('is null for a past date (negative days)', () => {
    expect(countdownPhrase('Launch', -1)).toBeNull()
  })

  it('reads "is today" at zero days', () => {
    expect(countdownPhrase('Launch', 0)).toBe('Launch is today.')
  })

  it('uses singular "day" at exactly one day out', () => {
    expect(countdownPhrase('Launch', 1)).toBe('1 day to Launch.')
  })

  it('uses plural "days" for more than one day out', () => {
    expect(countdownPhrase('Launch', 14)).toBe('14 days to Launch.')
  })
})
