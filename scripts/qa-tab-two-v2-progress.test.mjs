import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { resolve } from 'node:path'

import {
  PROGRESS_INTERACTIONS,
  PROGRESS_VIEWPORTS,
  analyzeCanvasGeometry,
  assertBuildCommit,
  assertEvidenceContract,
  assertNoUnexpectedRequests,
  assertProgressControlMetrics,
  assertSettingsGeometry,
  isSettingsDrawerOpen,
  requireExact,
} from './qa-tab-two-v2-progress.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('requires exact production provenance and rejects missing or stale build metadata', () => {
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
  assert.throws(() => assertBuildCommit(undefined, 'head'), /missing/i)
  assert.throws(() => assertBuildCommit({ commit: 'stale' }, 'head'), /does not match HEAD/)
  assert.equal(assertBuildCommit({ commit: 'head' }, 'head'), 'head')
})

test('pins the complete approved viewport matrix including touch-enabled mobile', () => {
  assert.deepEqual(PROGRESS_VIEWPORTS, [
    { id: 'desktop', width: 1600, height: 900, touch: false },
    { id: 'short', width: 1408, height: 600, touch: false },
    { id: 'ultrawide', width: 3440, height: 1440, touch: false },
    { id: 'mobile', width: 375, height: 812, touch: true },
  ])
})

test('rejects every unexpected external request instead of maintaining a network allowlist', () => {
  assert.doesNotThrow(() => assertNoUnexpectedRequests([]))
  assert.throws(
    () => assertNoUnexpectedRequests([{ method: 'GET', url: 'https://example.invalid/progress' }]),
    /unexpected external request/i,
  )
})

test('detects pairwise widget collisions, viewport escape, and horizontal overflow', () => {
  const clean = analyzeCanvasGeometry({
    viewport: { width: 375, height: 812 },
    document: { clientWidth: 375, scrollWidth: 375, bodyScrollWidth: 375 },
    frames: [
      { id: 'progress', left: 8, top: 8, right: 264, bottom: 254, width: 256, height: 246 },
      { id: 'notes', left: 8, top: 270, right: 224, bottom: 402, width: 216, height: 132 },
    ],
  })
  assert.deepEqual(clean.collisionPairs, [])
  assert.deepEqual(clean.viewportEscapes, [])
  assert.equal(clean.horizontalOverflow, false)

  const broken = analyzeCanvasGeometry({
    viewport: { width: 375, height: 812 },
    document: { clientWidth: 375, scrollWidth: 390, bodyScrollWidth: 390 },
    frames: [
      { id: 'progress', left: -1, top: 8, right: 255, bottom: 254, width: 256, height: 246 },
      { id: 'notes', left: 200, top: 100, right: 416, bottom: 232, width: 216, height: 132 },
    ],
  })
  assert.deepEqual(broken.collisionPairs, [['progress', 'notes']])
  assert.deepEqual(broken.viewportEscapes.sort(), ['notes', 'progress'])
  assert.equal(broken.horizontalOverflow, true)
})

test('rejects nested Settings scroll ownership and a hittable closed Settings surface', () => {
  const clean = {
    viewport: { width: 1600, height: 900 },
    rect: { left: 640, top: 0, right: 1600, bottom: 900 },
    documentWidth: 1600,
    drawerClientWidth: 960,
    drawerScrollWidth: 960,
    scrollOwners: ['settings'],
    closed: { ariaHidden: 'true', inert: true, pointerEvents: 'none', hitInside: false },
  }
  assert.doesNotThrow(() => assertSettingsGeometry(clean, { closed: true }))
  assert.throws(
    () => assertSettingsGeometry({ ...clean, scrollOwners: ['settings', 'nested'] }),
    /nested a vertical scroll owner/i,
  )
  assert.throws(
    () => assertSettingsGeometry({ ...clean, closed: { ...clean.closed, hitInside: true } }, { closed: true }),
    /closed Settings surface received a hit/i,
  )
})

test('treats absent or false aria-hidden as an open Settings drawer', () => {
  assert.equal(isSettingsDrawerOpen(null), true)
  assert.equal(isSettingsDrawerOpen('false'), true)
  assert.equal(isSettingsDrawerOpen('true'), false)
})

test('declares every approved Progress interaction as an executable acceptance step', () => {
  assert.deepEqual(PROGRESS_INTERACTIONS, [
    'settings-navigation',
    'empty-state',
    'add',
    'edit',
    'validation',
    'increment',
    'complete',
    'reset',
    'reorder',
    'delete',
    'habit-management',
    'reload-persistence',
    'cross-tab-freshness',
    'stale-control-safety',
    'stack-face',
    'overflow-route',
    'mobile-overflow-route',
    'retry-recovery',
    'local-midnight-rollover',
    'keyboard-access',
    'reduced-motion',
  ])
})

test('requires machine-readable provenance, per-viewport ledgers, bounds, focus, storage, collisions, and screenshots', () => {
  const evidence = {
    commit: 'abc123',
    result: 'PASS',
    interactions: Object.fromEntries(PROGRESS_INTERACTIONS.map((name) => [name, true])),
    storageAssertions: [
      { label: 'retry-storage-recovery', passed: true },
      { label: 'retry-authority-isolation', passed: true },
    ],
    retryControlMetric: {
      name: 'Retry', width: 48, height: 36, opacity: 1,
      painted: true, operable: true, disabled: false,
    },
    mobileOpenProgressMetric: {
      name: 'Open Progress', width: 86, height: 36, opacity: 1,
      painted: true, operable: true, disabled: false,
    },
    viewports: PROGRESS_VIEWPORTS.map((viewport) => ({
      viewport,
      storageAssertions: [{ label: 'fixture', passed: true }],
      controlAssertions: [{ label: 'painted-operable-controls', passed: true }],
      focusTarget: 'button',
      bounds: [
        { id: 'progress', left: 0, top: 0, right: 100, bottom: 100 },
        { id: 'notes', left: 120, top: 0, right: 220, bottom: 100 },
      ],
      collisionPairs: [],
      requestLedger: [],
      consoleLedger: [],
      pageErrors: [],
      screenshotPath: `artifacts/${viewport.id}.png`,
    })),
  }
  assert.doesNotThrow(() => assertEvidenceContract(evidence))
  assert.throws(
    () => assertEvidenceContract({ ...evidence, viewports: evidence.viewports.slice(1) }),
    /viewport evidence/i,
  )
  assert.throws(
    () => assertEvidenceContract({ ...evidence, interactions: { ...evidence.interactions, delete: false } }),
    /interaction delete/i,
  )
  assert.throws(
    () => assertEvidenceContract({ ...evidence, storageAssertions: evidence.storageAssertions.slice(0, 1) }),
    /retry-authority-isolation/i,
  )
  assert.throws(
    () => assertEvidenceContract({ ...evidence, viewports: evidence.viewports.map((entry, index) => (
      index === 3 ? { ...entry, controlAssertions: [] } : entry
    )) }),
    /mobile control assertions/i,
  )
})

test('rejects undersized, transparent, unpainted, disabled, or unhittable Progress controls', () => {
  const valid = [{
    name: 'Open Progress', width: 86, height: 36, opacity: 1,
    painted: true, operable: true, disabled: false,
  }]
  assert.doesNotThrow(() => assertProgressControlMetrics(valid, { minimum: 36, requiredName: 'Open Progress' }))
  for (const broken of [
    { ...valid[0], height: 35 },
    { ...valid[0], opacity: 0 },
    { ...valid[0], painted: false },
    { ...valid[0], operable: false },
    { ...valid[0], disabled: true },
  ]) {
    assert.throws(
      () => assertProgressControlMetrics([broken], { minimum: 36, requiredName: 'Open Progress' }),
      /Open Progress/i,
    )
  }
})

test('the real QA entry point refuses a non-exact invocation', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-tab-two-v2-progress.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /requires --exact/)
})
