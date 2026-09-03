import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { resolve } from 'node:path'

import {
  GOOGLE_CALENDAR_INTERACTIONS,
  GOOGLE_CALENDAR_VIEWPORTS,
  assertArtifactIsolation,
  assertEvidenceContract,
  inspectGeometry,
  requireExact,
} from './qa-google-calendar.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('pins the four approved Google Calendar viewports', () => {
  assert.deepEqual(GOOGLE_CALENDAR_VIEWPORTS, [
    { id: 'desktop', width: 1600, height: 900, touch: false },
    { id: 'short', width: 1408, height: 600, touch: false },
    { id: 'ultrawide', width: 3440, height: 1440, touch: false },
    { id: 'touch', width: 390, height: 844, touch: true },
  ])
})

test('requires exact invocation and detects build-fixture leakage', () => {
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
  const previewArtifact = 'preview_fixture preview-google-calendar-access-token'
  assert.doesNotThrow(() => assertArtifactIsolation('production code', 'account local code', previewArtifact))
  assert.throws(() => assertArtifactIsolation('preview_fixture', 'account local code', previewArtifact), /production artifact/)
  assert.throws(() => assertArtifactIsolation('production code', 'preview_fixture', previewArtifact), /account-local artifact/)
})

test('reports horizontal escapes without treating tall scrollable content as viewport escape', () => {
  assert.deepEqual(inspectGeometry({
    viewportWidth: 390,
    documentWidth: 390,
    bodyWidth: 390,
    rects: [{ id: 'dialog', left: 0, right: 390 }, { id: 'tall-content', left: 12, right: 378 }],
  }), { horizontalOverflow: false, escaped: [] })
  assert.deepEqual(inspectGeometry({
    viewportWidth: 390,
    documentWidth: 410,
    bodyWidth: 390,
    rects: [{ id: 'dialog', left: -2, right: 388 }, { id: 'card', left: 12, right: 400 }],
  }), { horizontalOverflow: true, escaped: ['dialog', 'card'] })
})

test('accepts only complete, clean, exact installed-extension evidence', () => {
  const commit = 'abc123'
  const evidence = {
    result: 'PASS',
    commit,
    builds: {
      production: { commit, mode: 'production', previewFixture: false },
      accountLocal: { commit, mode: 'account-local', previewFixture: false },
      preview: { commit, mode: 'preview', previewFixture: true },
    },
    execution: {
      production: 'installed-extension',
      accountLocal: 'installed-extension',
      preview: 'installed-extension',
    },
    interactions: Object.fromEntries(GOOGLE_CALENDAR_INTERACTIONS.map((name) => [name, true])),
    viewports: GOOGLE_CALENDAR_VIEWPORTS.map((viewport) => ({ viewport, horizontalOverflow: false, escaped: [], screenshotPath: `${viewport.id}.png` })),
    unexpectedRequests: [], consoleErrors: [], pageErrors: [], failedRequests: [],
  }
  assert.equal(assertEvidenceContract(evidence), evidence)
  evidence.interactions['calendar-composed'] = false
  assert.throws(() => assertEvidenceContract(evidence), /calendar-composed/)
})

test('the real QA entry point refuses a non-exact invocation', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-google-calendar.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /requires --exact/)
})
