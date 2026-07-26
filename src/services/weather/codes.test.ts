import { describe, expect, it } from 'vitest'
import { describeCode } from './codes'

describe('describeCode', () => {
  it('maps representative WMO codes', () => {
    expect(describeCode(0).label).toBe('Clear')
    expect(describeCode(2).label).toBe('Partly cloudy')
    expect(describeCode(45).label).toBe('Fog')
    expect(describeCode(63).label).toBe('Rain')
    expect(describeCode(75).label).toBe('Snow')
    expect(describeCode(95).label).toBe('Thunderstorm')
  })
  it('falls back for unknown codes', () => {
    expect(describeCode(42).label).toBe('Cloudy')
  })
  it('maps codes to the SVG icon set keys', () => {
    expect(describeCode(0).icon).toBe('sun')
    expect(describeCode(2).icon).toBe('sun-cloud')
    expect(describeCode(63).icon).toBe('rain')
    expect(describeCode(95).icon).toBe('storm')
    for (const code of [0, 1, 2, 3, 45, 51, 61, 71, 80, 85, 95]) {
      expect(describeCode(code).icon.length).toBeGreaterThan(0)
    }
  })
})
