import { describe, expect, it } from 'vitest'
import { clockTime, compactHour, compassPoint, displayTemp, displayTempWithUnit, displayWind, hourLabel, unitLetter } from './units'

describe('displayTemp', () => {
  it('rounds and formats metric', () => {
    expect(displayTemp(21.4, 'metric')).toBe('21°')
  })
  it('converts to fahrenheit', () => {
    expect(displayTemp(21.4, 'imperial')).toBe('71°') // 70.52 rounds to 71
    expect(displayTemp(0, 'imperial')).toBe('32°')
  })
})

describe('unitLetter', () => {
  it('is F for imperial and C for metric', () => {
    expect(unitLetter('imperial')).toBe('F')
    expect(unitLetter('metric')).toBe('C')
  })
})

describe('displayTempWithUnit', () => {
  it('appends the scale letter to the formatted temperature', () => {
    expect(displayTempWithUnit(21.4, 'imperial')).toBe('71°F')
    expect(displayTempWithUnit(21.4, 'metric')).toBe('21°C')
    expect(displayTempWithUnit(0, 'imperial')).toBe('32°F')
  })
})

describe('compactHour', () => {
  const at = (h: number) => `2026-07-26T${String(h).padStart(2, '0')}:00`
  it('formats 12-hour compactly with meridiem letter', () => {
    expect(compactHour(at(0), false)).toBe('12a')
    expect(compactHour(at(9), false)).toBe('9a')
    expect(compactHour(at(12), false)).toBe('12p')
    expect(compactHour(at(13), false)).toBe('1p')
  })
  it('zero-pads 24-hour form', () => {
    expect(compactHour(at(9), true)).toBe('09')
    expect(compactHour(at(15), true)).toBe('15')
  })
})

describe('displayWind', () => {
  it('formats metric km/h, rounded', () => {
    expect(displayWind(14.2, 'metric')).toBe('14 km/h')
  })
  it('converts to mph, rounded', () => {
    expect(displayWind(14.2, 'imperial')).toBe('9 mph') // 14.2 * 0.621371 = 8.82... -> 9
  })
})

describe('clockTime', () => {
  it('formats 12-hour with meridiem, minutes always padded', () => {
    expect(clockTime('2026-07-26T05:42', false)).toBe('5:42 AM')
    expect(clockTime('2026-07-26T20:31', false)).toBe('8:31 PM')
  })
  it('handles midnight and noon in 12-hour form', () => {
    expect(clockTime('2026-07-26T00:00', false)).toBe('12:00 AM')
    expect(clockTime('2026-07-26T12:00', false)).toBe('12:00 PM')
  })
  it('formats zero-padded 24-hour form', () => {
    expect(clockTime('2026-07-26T05:42', true)).toBe('05:42')
    expect(clockTime('2026-07-26T20:31', true)).toBe('20:31')
  })
  it('handles midnight and noon in 24-hour form', () => {
    expect(clockTime('2026-07-26T00:00', true)).toBe('00:00')
    expect(clockTime('2026-07-26T12:00', true)).toBe('12:00')
  })
})

// Owner-reported 2026-08-19: "02 isn't great for the 24hr option" — a bare
// hour is ambiguous the moment it leaves a column header. hourLabel is the
// ROOMY form for the details panel; compactHour stays the dense form for
// the collapsed chip's own six-column strip.
describe('hourLabel', () => {
  it('renders an unambiguous clock hour in 24-hour mode', () => {
    expect(hourLabel('2026-08-19T02:00', true)).toBe('02:00')
    expect(hourLabel('2026-08-19T18:00', true)).toBe('18:00')
    expect(hourLabel('2026-08-19T00:00', true)).toBe('00:00')
  })

  it('renders a spaced meridiem in 12-hour mode, never a bare letter', () => {
    expect(hourLabel('2026-08-19T02:00', false)).toBe('2 AM')
    expect(hourLabel('2026-08-19T13:00', false)).toBe('1 PM')
    expect(hourLabel('2026-08-19T00:00', false)).toBe('12 AM')
    expect(hourLabel('2026-08-19T12:00', false)).toBe('12 PM')
  })
})

describe('compassPoint', () => {
  it('names the 16-point compass direction a bearing came FROM', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(90)).toBe('E')
    expect(compassPoint(180)).toBe('S')
    expect(compassPoint(270)).toBe('W')
    expect(compassPoint(315)).toBe('NW')
    expect(compassPoint(22.5)).toBe('NNE')
  })

  it('wraps at the ends and rounds to the nearest sector', () => {
    expect(compassPoint(360)).toBe('N')
    expect(compassPoint(359)).toBe('N')
    expect(compassPoint(11)).toBe('N')
    expect(compassPoint(12)).toBe('NNE')
  })
})
