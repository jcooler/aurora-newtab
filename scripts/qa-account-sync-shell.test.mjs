import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { resolve } from 'node:path'

import {
  ACCOUNT_SYNC_INTERACTIONS,
  ACCOUNT_SYNC_SCREENSHOTS,
  ACCOUNT_SYNC_VIEWPORTS,
  assertArtifactIsolation,
  assertEvidenceContract,
  requireExact,
} from './qa-account-sync-shell.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('requires exact execution', () => {
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
})

test('pins original-resolution desktop and touch installed-extension viewports', () => {
  assert.deepEqual(ACCOUNT_SYNC_VIEWPORTS, [
    { id: 'desktop', width: 1600, height: 900, touch: false },
    { id: 'touch', width: 768, height: 812, touch: true },
  ])
})

test('requires every account state and destructive confirmation', () => {
  assert.deepEqual(ACCOUNT_SYNC_INTERACTIONS, [
    'production-local',
    'six-tab-keyboard',
    'preview-signed-in',
    'preview-active',
    'preview-past-due',
    'preview-device-limit',
    'preview-syncing',
    'preview-offline',
    'preview-needs-attention',
    'vault-deletion-confirmation',
    'account-deletion-confirmation',
  ])
  assert.deepEqual(ACCOUNT_SYNC_SCREENSHOTS, [
    'production-local-desktop',
    'preview-signed-in-desktop',
    'preview-active-desktop',
    'preview-past-due-desktop',
    'preview-device-limit-desktop',
    'preview-syncing-desktop',
    'preview-offline-desktop',
    'preview-needs-attention-desktop',
    'preview-vault-delete-desktop',
    'preview-account-delete-desktop',
    'preview-active-touch',
  ])
})

test('requires preview fixtures only in preview artifacts', () => {
  assert.doesNotThrow(() => assertArtifactIsolation('ordinary production code', 'TAB_TWO_PREVIEW_ACCOUNT_FIXTURE preview_fixture'))
  assert.doesNotThrow(() => assertArtifactIsolation('ordinary production code', 'preview_fixture'))
  assert.throws(() => assertArtifactIsolation('preview_fixture', 'preview_fixture'), /production artifact/i)
  assert.throws(() => assertArtifactIsolation('ordinary production code', 'ordinary preview code'), /preview artifact/i)
})

test('requires exact provenance, installed execution, zero writes and requests, clean runtime, and judged screenshots', () => {
  const evidence = {
    commit: 'abc123',
    result: 'PASS',
    builds: {
      production: { commit: 'abc123', mode: 'production', fixtureMarkerPresent: false },
      preview: { commit: 'abc123', mode: 'preview', fixtureMarkerPresent: true },
    },
    execution: { production: 'installed-extension', preview: 'installed-extension' },
    interactions: Object.fromEntries(ACCOUNT_SYNC_INTERACTIONS.map((name) => [name, true])),
    storageWrites: [],
    requests: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    screenshots: ACCOUNT_SYNC_SCREENSHOTS.map((id) => ({
      id,
      path: `artifacts/${id}.png`,
      viewport: id.endsWith('touch') ? ACCOUNT_SYNC_VIEWPORTS[1] : ACCOUNT_SYNC_VIEWPORTS[0],
      pixelSize: id.endsWith('touch') ? { width: 768, height: 812 } : { width: 1600, height: 900 },
      judgment: 'PASS: original inspected; text and controls are contained and legible',
      geometry: { horizontalOverflow: false, viewportEscapes: [], overlapPairs: [], scrollOwners: 1 },
    })),
  }

  assert.doesNotThrow(() => assertEvidenceContract(evidence))
  assert.throws(() => assertEvidenceContract({ ...evidence, requests: [{ url: 'https://tabtwo.invalid' }] }), /unexpected request/i)
  assert.throws(() => assertEvidenceContract({ ...evidence, storageWrites: [['settings']] }), /storage write/i)
  assert.throws(() => assertEvidenceContract({
    ...evidence,
    screenshots: evidence.screenshots.map((capture, index) => index === 0 ? { ...capture, judgment: '_pending_' } : capture),
  }), /unjudged screenshot/i)
  assert.throws(() => assertEvidenceContract({
    ...evidence,
    interactions: { ...evidence.interactions, 'preview-offline': false },
  }), /preview-offline/i)
})

test('the real QA entry point refuses a non-exact invocation before build or browser work', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-account-sync-shell.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /requires --exact/)
})
