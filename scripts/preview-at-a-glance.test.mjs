import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  assertAllowedStorageChange,
  assertBuildProvenance,
} from './work-connector-harness-contracts.mjs'
import { inspectAtAGlanceRequest } from './at-a-glance-harness-contracts.mjs'

function request(url, overrides = {}) {
  return {
    method: 'GET',
    url,
    accept: null,
    ...overrides,
  }
}

test('accepts only the exact at-a-glance provider contracts', () => {
  assert.equal(
    inspectAtAGlanceRequest(request('https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/08/22', { accept: 'application/json' })).operation,
    'on-this-day',
  )
  assert.equal(
    inspectAtAGlanceRequest(request('https://date.nager.at/api/v3/AvailableCountries')).operation,
    'holiday-countries',
  )
  assert.deepEqual(
    inspectAtAGlanceRequest(request('https://date.nager.at/api/v3/PublicHolidays/2026/US')),
    { provider: 'nager', operation: 'public-holidays', year: 2026, countryCode: 'US' },
  )
  assert.equal(
    inspectAtAGlanceRequest(request('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', { accept: 'application/json' })).operation,
    'aurora-kp',
  )
  assert.deepEqual(
    inspectAtAGlanceRequest(request('https://api.weather.gov/alerts/active?point=39.7400,-104.9900', { accept: 'application/geo+json' })),
    { provider: 'nws', operation: 'weather-alerts', point: '39.7400,-104.9900' },
  )
})

test('rejects broad-route false positives and malformed requests', () => {
  assert.throws(() => inspectAtAGlanceRequest(request('https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/8/22')), /Wikipedia/)
  assert.throws(() => inspectAtAGlanceRequest(request('https://date.nager.at/api/v3/PublicHolidays/2026/USA')), /Nager/)
  assert.throws(() => inspectAtAGlanceRequest(request('https://services.swpc.noaa.gov/products/other.json')), /SWPC/)
  assert.throws(() => inspectAtAGlanceRequest(request('https://api.weather.gov/alerts/active?area=CO')), /NWS/)
  assert.throws(() => inspectAtAGlanceRequest(request('https://example.com/alerts')), /Unexpected provider/)
  assert.throws(() => inspectAtAGlanceRequest(request('https://api.weather.gov/alerts/active?point=39.7400,-104.9900', { method: 'POST' })), /method/)
})

test('pins storage and build attribution boundaries', () => {
  const before = { connectors: {}, connectorSnapshots: {}, weatherAlertCache: null, layout: { frozen: true } }
  const after = { ...before, weatherAlertCache: { status: 'unsupported' } }
  assert.deepEqual(assertAllowedStorageChange(before, after, ['weatherAlertCache']), ['weatherAlertCache'])
  assert.throws(
    () => assertAllowedStorageChange(before, { ...after, layout: { frozen: false } }, ['weatherAlertCache']),
    /layout/,
  )
  assert.doesNotThrow(() => assertBuildProvenance(JSON.stringify({ commit: 'abc123' }), 'abc123'))
  assert.throws(() => assertBuildProvenance(JSON.stringify({ commit: 'stale' }), 'abc123'), /stale/)
})

test('declares every tier, viewport, degradation, and dock-detail witness', async () => {
  const source = await readFile(new URL('./preview-at-a-glance.mjs', import.meta.url), 'utf8')
  for (const id of ['onThisDay', 'publicHolidays', 'auroraKp', 'weather']) {
    assert.match(source, new RegExp(`id: '${id}'`))
  }
  for (const tier of ['compact', 'standard', 'full', 'docked']) {
    assert.match(source, new RegExp(`tier: '${tier}'`))
  }
  for (const kind of ['max-data', 'empty', 'stale', 'error', 'year-boundary', 'unsupported', 'active', 'dock-detail']) {
    assert.match(source, new RegExp(`kind: '${kind}'`))
  }
  assert.match(source, /width: 1408, height: 445/)
  assert.match(source, /width: 1600, height: 900/)
  assert.match(source, /build-provenance\.json/)
  assert.match(source, /assertCleanTrackedStatus/)
  assert.match(source, /assertAllowedStorageChange/)
})
