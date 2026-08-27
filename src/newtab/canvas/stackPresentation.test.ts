import { describe, expect, it } from 'vitest'
import {
  canJoinStackAtTier,
  commonStackTiers,
  stackCompatibility,
} from './stackPresentation'

describe('stack presentation contracts', () => {
  it('returns the ordered intersection of member stack tiers', () => {
    expect(commonStackTiers(['weather', 'monthCal'])).toEqual(['standard'])
    expect(commonStackTiers(['weather', 'timer'])).toEqual(['compact'])
    expect(commonStackTiers(['monthCal', 'timer'])).toEqual([])
    expect(commonStackTiers(['weather', 'github'])).toEqual(['compact', 'standard', 'full'])
  })

  it('admits a source only when the stored target tier is shared', () => {
    expect(canJoinStackAtTier('github', ['weather'], 'full')).toBe(true)
    expect(canJoinStackAtTier('timer', ['weather'], 'standard')).toBe(false)
    expect(canJoinStackAtTier('monthCal', ['weather'], 'standard')).toBe(true)
  })

  it('names incompatible members and valid recovery tiers without changing the stored tier', () => {
    expect(stackCompatibility(['weather', 'timer'], 'full')).toEqual({
      compatible: false,
      storedTier: 'full',
      commonTiers: ['compact'],
      incompatibleMembers: ['timer'],
    })
    expect(stackCompatibility(['weather', 'github'], 'full')).toEqual({
      compatible: true,
      storedTier: 'full',
      commonTiers: ['compact', 'standard', 'full'],
      incompatibleMembers: [],
    })
  })
})
