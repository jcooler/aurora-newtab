import { expect, it } from 'vitest'

import { AURORA_DATA_KEYS, CURRENT_VERSION, defaults } from './schema'
import { EXCLUDED_AURORA_KEYS, SYNCED_AURORA_KEYS } from '../../sync/entityPolicy'

it('forces each new storage authority through an explicit sync classification decision', () => {
  expect(AURORA_DATA_KEYS).toEqual(Object.keys(defaults()))
  expect([...SYNCED_AURORA_KEYS, ...EXCLUDED_AURORA_KEYS].sort()).toEqual(Object.keys(defaults()).sort())
})

it('schema v23 keeps aggregate history nullable, Metrics off, and provider config absent by default', () => {
  expect(CURRENT_VERSION).toBe(23)
  expect(defaults().metricsHistory).toBeNull()
  expect(defaults().settings.widgets.metrics).toBe(false)
  expect(defaults().connectors).not.toHaveProperty('googleCalendar')
  expect(defaults().connectorSnapshots).not.toHaveProperty('googleCalendar')
})
