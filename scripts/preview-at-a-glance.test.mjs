import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  assertAllowedStorageChange,
  assertBuildProvenance,
} from './work-connector-harness-contracts.mjs'
import {
  AT_A_GLANCE_SCENARIOS,
  inspectAtAGlanceRequest,
  validateAtAGlanceEvidence,
} from './at-a-glance-harness-contracts.mjs'

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
  assert.match(source, /width: 1408, height: 445/)
  assert.match(source, /width: 1600, height: 900/)
  assert.match(source, /build-provenance\.json/)
  assert.match(source, /assertCleanTrackedStatus/)
  assert.match(source, /assertAllowedStorageChange/)
  assert.match(source, /for \(const scenario of AT_A_GLANCE_SCENARIOS\)/)
})

test('uses one executable scenario catalog and validates emitted evidence exactly', () => {
  const ids = new Set(AT_A_GLANCE_SCENARIOS.map((scenario) => scenario.id))
  assert.deepEqual([...ids].sort(), ['auroraKp', 'onThisDay', 'publicHolidays', 'weather'])
  for (const kind of ['setup', 'max-data', 'empty', 'stale', 'error', 'local-midnight', 'year-boundary', 'unsupported', 'active', 'dock-detail']) {
    assert.equal(AT_A_GLANCE_SCENARIOS.some((scenario) => scenario.kind === kind), true, kind)
  }
  const evidence = {
    captures: AT_A_GLANCE_SCENARIOS.map((scenario) => ({ scenario: scenario.key, usefulness: 'useful', localScroll: scenario.expectOverflow ? { clientHeight: 100, scrollHeight: 200 } : null })),
    storage: AT_A_GLANCE_SCENARIOS.map((scenario) => ({ scenario: scenario.key, writes: scenario.allowedWriteKeys.length ? [scenario.allowedWriteKeys] : [] })),
    requestLog: [
      { operation: 'on-this-day' },
      { operation: 'on-this-day' },
      { operation: 'holiday-countries' },
      { operation: 'public-holidays' },
      { operation: 'public-holidays' },
      { operation: 'public-holidays' },
      { operation: 'public-holidays' },
      { operation: 'aurora-kp' },
      { operation: 'aurora-kp' },
      { operation: 'weather-alerts' },
      { operation: 'weather-alerts' },
      { operation: 'weather-alerts' },
      { operation: 'weather-alerts' },
      { operation: 'weather-alerts' },
    ],
    runtimeErrors: [], failedRequests: [], failures: [],
  }
  assert.doesNotThrow(() => validateAtAGlanceEvidence(evidence))
  assert.throws(() => validateAtAGlanceEvidence({ ...evidence, captures: evidence.captures.slice(1) }), /scenario capture/i)
  assert.throws(() => validateAtAGlanceEvidence({ ...evidence, storage: evidence.storage.slice(1) }), /scenario storage/i)
  assert.throws(() => validateAtAGlanceEvidence({ ...evidence, requestLog: evidence.requestLog.slice(1) }), /on-this-day/i)
  assert.throws(() => validateAtAGlanceEvidence({ ...evidence, storage: [{ scenario: AT_A_GLANCE_SCENARIOS[0].key, writes: [['layout']] }, ...evidence.storage.slice(1)] }), /layout/i)
})
