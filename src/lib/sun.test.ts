// Ephemeris fixtures — retrieved 2026-08-11 for Task 92 (build-time
// verification, the SP2 curated-list discipline).
//
// Sunrise/sunset — USNO Astronomical Applications one-day API
// (https://aa.usno.navy.mil/api/rstt/oneday?date=YYYY-MM-DD&coords=LAT,LON&tz=TZ),
// cross-checked against suncalc.org (https://www.suncalc.org, an independent
// implementation of the same astronomical formulas) which agreed to within
// ~30s on every fixture below.
//   New York    40.7128,-74.0060  2026-06-21  rise 05:25  set 20:31  (tz -4, EDT)
//   New York    40.7128,-74.0060  2026-12-21  rise 07:17  set 16:32  (tz -5, EST)
//   Sydney     -33.8688,151.2093  2026-06-21  rise 07:00  set 16:54  (tz +10, AEST)
//   London      51.5074,-0.1278   2026-03-20  rise 06:03  set 18:13  (tz +0, GMT)
//   Tromso      69.6492,18.9553   2026-06-21  "Object continuously above the
//                                              Horizon" (polar day, no set)
//   Tromso      69.6492,18.9553   2026-12-21  "Object continuously below the
//                                              Horizon" (polar night, no rise)
//
// Golden hour (evening, +6° elevation) — suncalc.org's live sun-position
// query (https://www.suncalc.org/#/LAT,LON,15/YYYY.MM.DD/HH:MM/1/3), which
// reports Altitude at a chosen local time; bisected to the minute the
// reported Altitude crosses 6.00°. This is the SAME +6° golden-hour
// definition the task brief cites for timeanddate.com.
//   New York  2026-06-21  Altitude 6.05° at 19:50 EDT, 5.88° at 19:51 EDT
//                         -> crossing ~19:50 EDT
//   New York  2026-12-21  Altitude exactly 6.00° at 15:49 EST
//                         -> crossing 15:49 EST
//
// Moon-phase closestphase entries returned alongside the USNO sun queries
// above independently corroborate moon.test.ts's fixtures (e.g. the 2026-06-21
// NYC query reports "First Quarter" at 2026-06-21 17:55 local == 21:55 UTC,
// matching moon.test.ts's USNO moon-phase fixture exactly).

import { describe, expect, it } from 'vitest'
import { sunTimes } from './sun'

function expectCloseMinutes(actual: Date, expectedMs: number, toleranceMin = 2): void {
  const diffMin = Math.abs(actual.getTime() - expectedMs) / 60_000
  expect(diffMin).toBeLessThanOrEqual(toleranceMin)
}

describe('sunTimes — New York (local Date assertions; this machine runs America/New_York)', () => {
  it('2026-06-21 rise/set/golden hour match the NOAA fixture within ±2 minutes', () => {
    const result = sunTimes(new Date(2026, 5, 21), 40.7128, -74.006)
    expect(result).not.toBeNull()
    expectCloseMinutes(result!.sunrise, new Date(2026, 5, 21, 5, 25).getTime())
    expectCloseMinutes(result!.sunset, new Date(2026, 5, 21, 20, 31).getTime())
    expect(result!.goldenHour).not.toBeNull()
    expectCloseMinutes(result!.goldenHour!, new Date(2026, 5, 21, 19, 50).getTime())
  })

  it('2026-12-21 rise/set/golden hour match the NOAA fixture within ±2 minutes', () => {
    const result = sunTimes(new Date(2026, 11, 21), 40.7128, -74.006)
    expect(result).not.toBeNull()
    expectCloseMinutes(result!.sunrise, new Date(2026, 11, 21, 7, 17).getTime())
    expectCloseMinutes(result!.sunset, new Date(2026, 11, 21, 16, 32).getTime())
    expect(result!.goldenHour).not.toBeNull()
    expectCloseMinutes(result!.goldenHour!, new Date(2026, 11, 21, 15, 49).getTime())
  })

  it('golden hour precedes sunset by a plausible margin (30-80 minutes)', () => {
    for (const date of [new Date(2026, 5, 21), new Date(2026, 11, 21)]) {
      const result = sunTimes(date, 40.7128, -74.006)!
      const marginMin = (result.sunset.getTime() - result.goldenHour!.getTime()) / 60_000
      expect(marginMin).toBeGreaterThanOrEqual(30)
      expect(marginMin).toBeLessThanOrEqual(80)
    }
  })

  it('sunrise lands in the morning local hours (longitude sign sanity)', () => {
    const result = sunTimes(new Date(2026, 5, 21), 40.7128, -74.006)!
    expect(result.sunrise.getHours()).toBeGreaterThanOrEqual(4)
    expect(result.sunrise.getHours()).toBeLessThan(8)
  })
})

describe('sunTimes — Sydney/London (UTC epoch assertions; timezone-independent)', () => {
  it('Sydney 2026-06-21 rise/set match the fixture within ±2 minutes', () => {
    const result = sunTimes(new Date(2026, 5, 21), -33.8688, 151.2093)
    expect(result).not.toBeNull()
    // 07:00 AEST (UTC+10) on 2026-06-21 == 2026-06-20T21:00:00Z
    expectCloseMinutes(result!.sunrise, Date.UTC(2026, 5, 20, 21, 0, 0))
    // 16:54 AEST == 2026-06-21T06:54:00Z
    expectCloseMinutes(result!.sunset, Date.UTC(2026, 5, 21, 6, 54, 0))
  })

  it('London 2026-03-20 rise/set match the fixture within ±2 minutes', () => {
    const result = sunTimes(new Date(2026, 2, 20), 51.5074, -0.1278)
    expect(result).not.toBeNull()
    // GMT == UTC in March (BST hasn't started yet in 2026)
    expectCloseMinutes(result!.sunrise, Date.UTC(2026, 2, 20, 6, 3, 0))
    expectCloseMinutes(result!.sunset, Date.UTC(2026, 2, 20, 18, 13, 0))
  })

  it('golden hour precedes sunset by a plausible margin at Sydney and London too', () => {
    const sydney = sunTimes(new Date(2026, 5, 21), -33.8688, 151.2093)!
    const london = sunTimes(new Date(2026, 2, 20), 51.5074, -0.1278)!
    for (const result of [sydney, london]) {
      expect(result.goldenHour).not.toBeNull()
      const marginMin = (result.sunset.getTime() - result.goldenHour!.getTime()) / 60_000
      expect(marginMin).toBeGreaterThanOrEqual(30)
      expect(marginMin).toBeLessThanOrEqual(80)
    }
  })
})

describe('sunTimes — Tromso polar day/night', () => {
  it('returns null on 2026-06-21 (polar day — the sun never sets)', () => {
    expect(sunTimes(new Date(2026, 5, 21), 69.6492, 18.9553)).toBeNull()
  })

  it('returns null on 2026-12-21 (polar night — the sun never rises)', () => {
    expect(sunTimes(new Date(2026, 11, 21), 69.6492, 18.9553)).toBeNull()
  })
})

describe('sunTimes — purity', () => {
  it('is pure: identical inputs produce identical outputs on repeated calls', () => {
    const date = new Date(2026, 5, 21)
    const first = sunTimes(date, 40.7128, -74.006)
    const second = sunTimes(date, 40.7128, -74.006)
    expect(first).toEqual(second)
    expect(first!.sunrise.getTime()).toBe(second!.sunrise.getTime())
    expect(first!.sunset.getTime()).toBe(second!.sunset.getTime())
    expect(first!.goldenHour!.getTime()).toBe(second!.goldenHour!.getTime())
  })
})
