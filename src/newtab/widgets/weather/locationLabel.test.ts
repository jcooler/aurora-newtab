import { describe, expect, it } from 'vitest'
import { formatGeoMatchLabel } from './locationLabel'

describe('formatGeoMatchLabel', () => {
  it('uses United States postal abbreviations', () => {
    expect(formatGeoMatchLabel({ name: 'Dallas', admin1: 'Georgia', country: 'United States', lat: 34, lon: -84.8 })).toBe('Dallas, GA')
    expect(formatGeoMatchLabel({ name: 'Dallas', admin1: 'Texas', country: 'United States', lat: 32.78, lon: -96.8 })).toBe('Dallas, TX')
  })

  it('uses readable comma-separated fallbacks outside the United States', () => {
    expect(formatGeoMatchLabel({ name: 'London', admin1: 'England', country: 'United Kingdom', lat: 51.5, lon: -0.1 })).toBe('London, England')
    expect(formatGeoMatchLabel({ name: 'Singapore', admin1: '', country: 'Singapore', lat: 1.3, lon: 103.8 })).toBe('Singapore')
  })

  it('does not repeat a city when the region has the same name', () => {
    expect(formatGeoMatchLabel({ name: 'New York', admin1: 'New York', country: 'United States', lat: 40.7, lon: -74 })).toBe('New York, NY')
  })
})
