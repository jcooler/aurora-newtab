import { expect, it } from 'vitest'

import { AURORA_DATA_KEYS, CURRENT_VERSION, defaults } from './schema'
import { EXCLUDED_AURORA_KEYS, SYNCED_AURORA_KEYS } from '../../sync/entityPolicy'

it('forces each new storage authority through an explicit sync classification decision', () => {
  expect(AURORA_DATA_KEYS).toEqual(Object.keys(defaults()))
  expect([...SYNCED_AURORA_KEYS, ...EXCLUDED_AURORA_KEYS].sort()).toEqual(Object.keys(defaults()).sort())
})

it('schema v22 keeps aggregate history nullable and adds Metrics off by default', () => {
  expect(CURRENT_VERSION).toBe(22)
  expect(defaults().metricsHistory).toBeNull()
  expect(defaults().settings.widgets.metrics).toBe(false)
})
