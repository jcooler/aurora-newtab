import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CATALOG_BATCHES,
  CATALOG_CONTRACTS,
  CODED_DOCK_LINES,
  captureTiersFor,
} from './widget-catalog-manifest.mjs'

const EXPECTED_IDS = [
  'bookmarks', 'clock', 'countdown', 'crypto', 'downloads', 'focus', 'github', 'gitlab',
  'greeting', 'habits', 'homeassistant', 'ics', 'jira', 'linear', 'links', 'monthCal',
  'moon', 'notes', 'quote', 'readingList', 'recentlyClosed', 'rss', 'search',
  'sentry', 'status', 'sun', 'tabGroups', 'tasks', 'timer', 'todoist',
  'vercel', 'weather', 'worldClocks',
]

test('covers all 33 identities exactly once across disjoint catalog batches', () => {
  const batches = Object.entries(CATALOG_BATCHES)
  const ids = batches.flatMap(([, entries]) => entries.map(({ id }) => id))
  assert.deepEqual(ids.sort(), EXPECTED_IDS)
  assert.equal(new Set(ids).size, EXPECTED_IDS.length)
  for (const [batchId, entries] of batches) {
    assert.deepEqual(Object.keys(CATALOG_CONTRACTS[batchId]), entries.map(({ id }) => id))
  }
})

test('returns the declared capture tiers without deriving presentation', () => {
  assert.deepEqual(captureTiersFor('weather'), ['compact', 'standard', 'full', 'docked'])
  assert.deepEqual(captureTiersFor('monthCal'), ['standard'])
  assert.deepEqual(captureTiersFor('moon'), ['compact', 'docked'])
  assert.deepEqual(captureTiersFor('readingList'), ['compact', 'standard', 'full', 'docked'])
  assert.deepEqual(captureTiersFor('linear'), ['compact', 'standard', 'full', 'docked'])
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
