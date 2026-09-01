import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { resolve } from 'node:path'

import {
  FREE_BASELINE_INTERACTIONS,
  FREE_BASELINE_VIEWPORTS,
  assertBuildCommit,
  assertEvidenceContract,
  assertStorageWrites,
  requireExact,
} from './qa-free-baseline.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('requires exact production provenance and rejects missing or stale build metadata', () => {
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
  assert.throws(() => assertBuildCommit(undefined, 'head'), /missing/i)
  assert.throws(() => assertBuildCommit({ commit: 'stale' }, 'head'), /does not match HEAD/)
  assert.equal(assertBuildCommit({ commit: 'head' }, 'head'), 'head')
})

test('pins desktop and supported touch-device evidence', () => {
  assert.deepEqual(FREE_BASELINE_VIEWPORTS, [
    { id: 'desktop', width: 1600, height: 900, touch: false },
    { id: 'touch', width: 768, height: 812, touch: true },
  ])
})

test('declares every approved free-baseline interaction', () => {
  assert.deepEqual(FREE_BASELINE_INTERACTIONS, [
    'settings-five-tabs',
    'settings-layout',
    'connector-gear-route',
    'keyboard-edit-entry',
    'long-press-edit-entry',
    'drag-cancel-no-write',
    'drag-save-reload',
    'stack-reorder',
    'dock-move',
  ])
})

test('accepts only layouts writes from user interactions and rejects the frozen layout key', () => {
  assert.doesNotThrow(() => assertStorageWrites([]))
  assert.doesNotThrow(() => assertStorageWrites([['layouts'], ['layouts']]))
  assert.throws(() => assertStorageWrites([['layout']]), /unexpected storage write/i)
  assert.throws(() => assertStorageWrites([['layouts', 'connectors']]), /unexpected storage write/i)
})

test('requires judged screenshots, exact provenance, interactions, storage, requests, and runtime ledgers', () => {
  const evidence = {
    commit: 'abc123',
    provenance: { commit: 'abc123', mode: 'production' },
    result: 'PASS',
    interactions: Object.fromEntries(FREE_BASELINE_INTERACTIONS.map((name) => [name, true])),
    storageWrites: [['layouts']],
    requests: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    screenshots: FREE_BASELINE_VIEWPORTS.map((viewport) => ({
      id: viewport.id,
      viewport,
      path: `artifacts/${viewport.id}.png`,
      judgment: 'PASS: contained, legible, and free of overlap',
      geometry: { horizontalOverflow: false, viewportEscapes: [], overlapPairs: [] },
    })),
  }
  assert.doesNotThrow(() => assertEvidenceContract(evidence))
  assert.throws(
    () => assertEvidenceContract({ ...evidence, screenshots: [{ ...evidence.screenshots[0], judgment: '_pending_' }, evidence.screenshots[1]] }),
    /unjudged screenshot/i,
  )
  assert.throws(
    () => assertEvidenceContract({ ...evidence, interactions: { ...evidence.interactions, 'dock-move': false } }),
    /dock-move/i,
  )
  assert.throws(
    () => assertEvidenceContract({ ...evidence, requests: [{ url: 'https://example.invalid' }] }),
    /unexpected request/i,
  )
})

test('the real QA entry point refuses a non-exact invocation before browser work', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-free-baseline.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /requires --exact/)
})
