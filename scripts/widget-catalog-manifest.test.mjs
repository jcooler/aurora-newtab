import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CATALOG_BATCHES,
  CATALOG_CONTRACTS,
  CODED_DOCK_LINES,
  captureTiersFor,
} from './widget-catalog-manifest.mjs'

const EXPECTED_IDS = [
  'bookmarks', 'clock', 'countdown', 'crypto', 'focus', 'github', 'gitlab',
  'greeting', 'habits', 'homeassistant', 'ics', 'jira', 'links', 'monthCal',
  'moon', 'notes', 'quote', 'rss', 'search', 'status', 'sun', 'tasks', 'timer',
  'vercel', 'weather', 'worldClocks',
]

test('covers all 26 identities exactly once across disjoint catalog batches', () => {
  const first = CATALOG_BATCHES['1'].map(({ id }) => id)
  const second = CATALOG_BATCHES['2'].map(({ id }) => id)
  assert.deepEqual([...first, ...second].sort(), EXPECTED_IDS)
  assert.equal(new Set([...first, ...second]).size, EXPECTED_IDS.length)
  assert.deepEqual(Object.keys(CATALOG_CONTRACTS['1']), first)
  assert.deepEqual(Object.keys(CATALOG_CONTRACTS['2']), second)
})

test('returns the declared capture tiers without deriving presentation', () => {
  assert.deepEqual(captureTiersFor('weather'), ['compact', 'standard', 'full', 'docked'])
  assert.deepEqual(captureTiersFor('monthCal'), ['standard'])
  assert.deepEqual(captureTiersFor('moon'), ['compact', 'docked'])
  assert.equal(CODED_DOCK_LINES.has('weather'), true)
  assert.equal(CODED_DOCK_LINES.has('monthCal'), false)
})

test('rejects duplicate, undeclared, and requested unknown identities', () => {
  const duplicate = {
    '1': [{ id: 'weather', label: 'Weather', tiers: ['compact'] }],
    '2': [{ id: 'weather', label: 'Weather again', tiers: ['standard'] }],
  }
  assert.throws(() => captureTiersFor('weather', duplicate), /duplicate.*weather/i)

  const unknown = {
    '1': [{ id: 'weather', label: 'Weather', tiers: ['compact'] }],
    '2': [{ id: 'mystery', label: 'Mystery', tiers: ['compact'] }],
  }
  assert.throws(() => captureTiersFor('weather', unknown), /unknown.*mystery/i)
  assert.throws(() => captureTiersFor('mystery'), /unknown.*mystery/i)
})
