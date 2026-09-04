import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { resolve } from 'node:path'

import {
  DATA_PORTABILITY_STATES,
  DATA_PORTABILITY_VIEWPORTS,
  assertArtifactIsolation,
  assertEvidenceContract,
  inspectGeometry,
  requireExact,
} from './qa-data-portability.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('pins the approved portability states and original-resolution viewports', () => {
  assert.deepEqual(DATA_PORTABILITY_STATES, [
    'desktop-idle',
    'desktop-verification',
    'desktop-preparing',
    'desktop-safe-failure',
    'touch-recovery',
  ])
  assert.deepEqual(DATA_PORTABILITY_VIEWPORTS, [
    { id: 'desktop', width: 1600, height: 900, touch: false },
    { id: 'touch', width: 390, height: 844, touch: true },
  ])
})

test('requires exact invocation and keeps preview markers out of production', () => {
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
  const preview = 'preview_fixture account export enabled'
  assert.doesNotThrow(() => assertArtifactIsolation('production account export disabled', preview))
  assert.throws(() => assertArtifactIsolation('preview_fixture leaked', preview), /production artifact/)
})

test('reports horizontal overflow and escaped controls', () => {
  assert.deepEqual(inspectGeometry({
    viewportWidth: 390,
    documentWidth: 390,
    bodyWidth: 390,
    rects: [{ id: 'Download copy', left: 112, right: 264 }],
  }), { horizontalOverflow: false, escaped: [] })
  assert.deepEqual(inspectGeometry({
    viewportWidth: 390,
    documentWidth: 410,
    bodyWidth: 390,
    rects: [{ id: 'Discard', left: 330, right: 402 }],
  }), { horizontalOverflow: true, escaped: ['Discard'] })
})

function cleanEvidence() {
  const sourceSha = 'abc123def456'
  return {
    result: 'PASS',
    sourceSha,
    exact: true,
    dataClassification: 'synthetic-only',
    ownerDataPresent: false,
    builds: {
      production: { sourceSha, mode: 'production', exact: true, previewFixture: false },
      preview: { sourceSha, mode: 'preview', exact: true, previewFixture: true },
    },
    execution: { production: 'installed-extension', preview: 'installed-extension' },
    states: Object.fromEntries(DATA_PORTABILITY_STATES.map((state) => [state, {
      passed: true,
      screenshotPath: `artifacts/qa-data-portability/${sourceSha}/${state}.png`,
      viewportId: state === 'touch-recovery' ? 'touch' : 'desktop',
      pixelSize: state === 'touch-recovery' ? { width: 390, height: 844 } : { width: 1600, height: 900 },
      geometry: { horizontalOverflow: false, escaped: [] },
    }])),
    interactions: {
      confirmationBeforeRequest: true,
      cancelFocusRestored: true,
      accountDownload: true,
      recoveryDownload: true,
      recoveryActionOrder: true,
    },
    idle: { requests: 0, storageWrites: 0, consoleErrors: 0, pageErrors: 0 },
    requests: [{ intent: 'account-export', disposition: 'fixture-fulfilled' }],
    wireRequests: [],
    storageWrites: [],
    downloads: {
      account: { filename: 'tab-two-account-data-2026-09-04.json', app: 'tab-two', kind: 'account-data', version: 1 },
      recovery: { filename: 'tab-two-recovery-notes-2026-09-04T120000Z.json', app: 'tab-two', kind: 'sync-conflict-recovery', version: 1 },
    },
    reducedMotion: { passed: true, animationName: 'none' },
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
  }
}

test('accepts only complete exact installed-extension portability evidence', () => {
  const evidence = cleanEvidence()
  assert.equal(assertEvidenceContract(evidence), evidence)

  const missing = cleanEvidence()
  delete missing.states['desktop-preparing']
  assert.throws(() => assertEvidenceContract(missing), /desktop-preparing/)

  const duplicate = cleanEvidence()
  duplicate.requests.push({ intent: 'account-export', disposition: 'fixture-fulfilled' })
  assert.throws(() => assertEvidenceContract(duplicate), /exactly one fixture-fulfilled/)

  const write = cleanEvidence()
  write.storageWrites.push('tab-two:sync-conflict-backups:v1')
  assert.throws(() => assertEvidenceContract(write), /storage write/)

  const ownerData = cleanEvidence()
  ownerData.notes = 'jonathan.r.cooler@gmail.com'
  assert.throws(() => assertEvidenceContract(ownerData), /owner data/)
})

test('the real QA entry point refuses a non-exact invocation', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-data-portability.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /requires --exact/)
})
