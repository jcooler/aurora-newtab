import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolve } from 'node:path'

import {
  METRICS_INTERACTIONS,
  METRICS_VIEWPORTS,
  assertArtifactIsolation,
  assertEvidenceContract,
  assertNoSensitiveMetricKeys,
  createMetricsHistoryFixture,
  inspectGeometry,
  requireExact,
} from './qa-tab-two-metrics.mjs'

test('pins the approved viewport matrix and requires exact mode', () => {
  assert.deepEqual(METRICS_VIEWPORTS, [
    { id: 'desktop', width: 1600, height: 900, touch: false },
    { id: 'short', width: 1408, height: 600, touch: false },
    { id: 'ultrawide', width: 3440, height: 1440, touch: false },
    { id: 'touch', width: 390, height: 844, touch: true },
  ])
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
})

test('keeps Metrics controls touch-sized for coarse pointers and narrow windows', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../src/newtab/index.css'), 'utf8')
  assert.match(css, /@media \(pointer: coarse\), \(any-pointer: coarse\), \(max-width: 520px\)/)
  assert.match(css, /\.metrics-standard-header button \{ min-width: 82px; min-height: 44px; \}/)
  assert.match(css, /\.metrics-range-control button \{ min-height: 44px; \}/)
})

test('keeps preview fixtures out of production artifacts', () => {
  assert.doesNotThrow(() => assertArtifactIsolation('production', 'TAB_TWO_PREVIEW_METRICS_FIXTURE preview_fixture'))
  assert.throws(() => assertArtifactIsolation('TAB_TWO_PREVIEW_METRICS_FIXTURE', 'preview_fixture'), /production artifact/i)
  assert.throws(() => assertArtifactIsolation('production', 'preview without marker'), /preview artifact/i)
})

test('detects viewport escape and horizontal overflow', () => {
  assert.deepEqual(inspectGeometry({
    viewportWidth: 390,
    documentWidth: 390,
    bodyWidth: 390,
    rects: [{ id: 'metrics', left: 8, top: 8, right: 382, bottom: 300 }],
  }), { horizontalOverflow: false, escaped: [] })
  assert.deepEqual(inspectGeometry({
    viewportWidth: 390,
    documentWidth: 410,
    bodyWidth: 390,
    rects: [{ id: 'metrics', left: -1, top: 8, right: 400, bottom: 300 }],
  }), { horizontalOverflow: true, escaped: ['metrics'] })
})

test('rejects raw or secret-bearing keys from exported metric evidence', () => {
  assert.doesNotThrow(() => assertNoSensitiveMetricKeys({
    product: 'Tab Two',
    history: { buckets: [{ date: '2026-09-03', values: { kind: 'tasks', completed: 2, carriedForward: 1 } }] },
  }))
  for (const key of ['password', 'token', 'url', 'title', 'email', 'eventName']) {
    assert.throws(() => assertNoSensitiveMetricKeys({ history: { buckets: [{ values: { [key]: 'private' } }] } }), /sensitive metric key/i)
  }
})

test('builds a schema-shaped aggregate-only browser fixture', () => {
  const history = createMetricsHistoryFixture('2026-09-03')
  assert.equal(history.buckets.length, 7)
  assert.doesNotThrow(() => assertNoSensitiveMetricKeys({ history }))
  assert(history.buckets.every((bucket) => /^[0-9a-f-]{36}$/i.test(bucket.id)))
  assert(history.buckets.every((bucket) => bucket.sourceInstanceId === 'ics'
    || bucket.sourceInstanceId === 'github'
    || bucket.sourceInstanceId === 'strava'
    || /^[0-9a-f-]{36}$/i.test(bucket.sourceInstanceId)))
})

test('requires complete provenance, interactions, viewports, and clean browser ledgers', () => {
  const evidence = {
    commit: 'abc123',
    result: 'PASS',
    builds: {
      production: { commit: 'abc123', mode: 'production', fixtureMarkerPresent: false },
      preview: { commit: 'abc123', mode: 'preview', fixtureMarkerPresent: true },
    },
    execution: { production: 'installed-extension', preview: 'installed-extension' },
    interactions: Object.fromEntries(METRICS_INTERACTIONS.map((name) => [name, true])),
    viewports: METRICS_VIEWPORTS.map((viewport) => ({ viewport, screenshotPath: `${viewport.id}.png`, horizontalOverflow: false, escaped: [] })),
    requests: [], consoleErrors: [], pageErrors: [], failedRequests: [],
  }
  assert.doesNotThrow(() => assertEvidenceContract(evidence))
  assert.throws(() => assertEvidenceContract({ ...evidence, viewports: evidence.viewports.slice(1) }), /viewport evidence/i)
  assert.throws(() => assertEvidenceContract({ ...evidence, interactions: { ...evidence.interactions, export: false } }), /interaction export/i)
  assert.throws(() => assertEvidenceContract({ ...evidence, requests: [{ url: 'https://example.invalid' }] }), /unexpected request/i)
})

test('the real entry point refuses a non-exact invocation', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-tab-two-metrics.mjs'], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /requires --exact/)
})
