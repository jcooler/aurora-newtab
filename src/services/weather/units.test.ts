import { describe, expect, it } from 'vitest'
import { compactHour, displayTemp } from './units'

describe('displayTemp', () => {
  it('rounds and formats metric', () => {
    expect(displayTemp(21.4, 'metric')).toBe('21°')
  })
  it('converts to fahrenheit', () => {
    expect(displayTemp(21.4, 'imperial')).toBe('71°') // 70.52 rounds to 71
    expect(displayTemp(0, 'imperial')).toBe('32°')
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
