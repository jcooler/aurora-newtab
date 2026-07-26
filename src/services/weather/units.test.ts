import { describe, expect, it } from 'vitest'
import { displayTemp } from './units'

describe('displayTemp', () => {
  it('rounds and formats metric', () => {
    expect(displayTemp(21.4, 'metric')).toBe('21°')
  })
  it('converts to fahrenheit', () => {
    expect(displayTemp(21.4, 'imperial')).toBe('71°') // 70.52 rounds to 71
    expect(displayTemp(0, 'imperial')).toBe('32°')
  })
})
