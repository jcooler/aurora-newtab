import { describe, expect, it } from 'vitest'

import {
  effectiveRefreshMs,
  refreshPolicyFor,
  refreshValueFor,
  type RefreshPreferences,
} from './refreshPolicy'
import { CONNECTORS } from './connectors/registry'

describe('refresh policy', () => {
  it('offers source-specific safe presets instead of one global interval', () => {
    expect(refreshPolicyFor('crypto')).toMatchObject({ defaultMinutes: 5, options: [1, 5, 15, 30] })
    expect(refreshPolicyFor('weather')).toMatchObject({ defaultMinutes: 30, options: [15, 30, 60] })
    expect(refreshPolicyFor('jira')).toMatchObject({ defaultMinutes: 10, options: [5, 10, 30] })
    expect(refreshPolicyFor('homeassistant')).toMatchObject({ defaultMinutes: 1, options: [1, 5, 15] })
  })

  it('keeps predictable daily sources fixed and out of the preference UI', () => {
    expect(refreshPolicyFor('publicHolidays')).toMatchObject({ configurable: false, defaultMinutes: 1_440 })
    expect(refreshPolicyFor('onThisDay')).toMatchObject({ configurable: false, defaultMinutes: 1_440 })
  })

  it('keeps every balanced connector default aligned with its registry cache contract', () => {
    for (const connector of CONNECTORS) {
      expect(refreshPolicyFor(connector.id).defaultMinutes * 60_000).toBe(connector.ttlMs)
    }
  })

  it('accepts only a source preset or manual and falls back safely for malformed storage', () => {
    const preferences = {
      crypto: 1,
      jira: 'manual',
      weather: 2,
      publicHolidays: 1,
    } as unknown as RefreshPreferences
    expect(refreshValueFor('crypto', preferences)).toBe(1)
    expect(refreshValueFor('jira', preferences)).toBe('manual')
    expect(refreshValueFor('weather', preferences)).toBe(30)
    expect(refreshValueFor('publicHolidays', preferences)).toBe(1_440)
    expect(effectiveRefreshMs('crypto', preferences)).toBe(60_000)
    expect(effectiveRefreshMs('jira', preferences)).toBeNull()
  })
})
