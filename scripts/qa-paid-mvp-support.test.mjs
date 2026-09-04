import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  SUPPORT_INTERACTIONS,
  SUPPORT_SCREENSHOTS,
  SUPPORT_VIEWPORTS,
  assertSupportEvidence,
  requireExact,
} from './qa-paid-mvp-support.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('requires exact execution', () => {
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
})

test('pins every approved original-resolution support viewport', () => {
  assert.deepEqual(SUPPORT_VIEWPORTS, [
    { id: 'desktop', width: 1600, height: 900, deviceScaleFactor: 1, touch: false },
    { id: 'short', width: 1408, height: 600, deviceScaleFactor: 1, touch: false },
    { id: 'ultrawide', width: 3440, height: 1440, deviceScaleFactor: 1, touch: false },
    { id: 'high-density', width: 2560, height: 1440, deviceScaleFactor: 2, touch: false },
    { id: 'touch-narrow', width: 390, height: 844, deviceScaleFactor: 1, touch: true },
  ])
})

test('requires the complete recovery and local-diagnostic interaction matrix', () => {
  assert.deepEqual(SUPPORT_INTERACTIONS, [
    'seven-tab-keyboard',
    'all-disclosures',
    'diagnostic-review',
    'diagnostic-cancel',
    'diagnostic-download',
    'focus-restoration',
    'reduced-motion',
    'tab-overflow-containment',
    'single-scroll-owner',
  ])
  assert.deepEqual(SUPPORT_SCREENSHOTS, [
    'desktop-closed',
    'desktop-recovery-open',
    'desktop-report-review',
    'short-contained',
    'ultrawide-contained',
    'high-density-contained',
    'touch-narrow-contained',
  ])
})

test('requires exact production provenance, clean ledgers, and judged original captures', () => {
  const commit = 'abc123'
  const evidence = {
    commit,
    result: 'PASS',
    build: { commit, mode: 'production', fixtureMarkerPresent: false },
    execution: 'installed-extension',
    interactions: Object.fromEntries(SUPPORT_INTERACTIONS.map((name) => [name, true])),
    viewports: SUPPORT_VIEWPORTS.map(({ id }) => ({ id, result: 'PASS' })),
    requestLedger: [],
    storageWrites: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    diagnostic: {
      exactKeys: true,
      excludedFixtureMarkers: true,
      reviewedBeforeDownload: true,
      downloadedLocally: true,
    },
    screenshots: SUPPORT_SCREENSHOTS.map((id) => {
      const viewportId = id.split('-contained')[0].replace(/^desktop-.+$/, 'desktop')
      const viewport = SUPPORT_VIEWPORTS.find((entry) => entry.id === viewportId) ?? SUPPORT_VIEWPORTS[0]
      return {
        id,
        path: `artifacts/${id}.png`,
        viewport,
        pixelSize: {
          width: viewport.width * viewport.deviceScaleFactor,
          height: viewport.height * viewport.deviceScaleFactor,
        },
        judgment: 'PASS: original inspected; hierarchy, copy, controls, and containment are production-ready',
        geometry: {
          horizontalOverflow: false,
          tabOverflowContained: true,
          viewportEscapes: [],
          overlapPairs: [],
          scrollOwners: 1,
        },
      }
    }),
  }

  assert.doesNotThrow(() => assertSupportEvidence(evidence))
  assert.throws(() => assertSupportEvidence({ ...evidence, requestLedger: [{ url: 'https://example.test' }] }), /request/i)
  assert.throws(() => assertSupportEvidence({ ...evidence, storageWrites: [['settings']] }), /storage write/i)
  assert.throws(() => assertSupportEvidence({
    ...evidence,
    diagnostic: { ...evidence.diagnostic, reviewedBeforeDownload: false },
  }), /review/i)
  assert.throws(() => assertSupportEvidence({
    ...evidence,
    screenshots: evidence.screenshots.map((entry, index) => index === 0 ? { ...entry, judgment: '_pending_' } : entry),
  }), /unjudged/i)
})

test('registers the exact support QA entry point', () => {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts['qa:paid-mvp-support'], 'node scripts/qa-paid-mvp-support.mjs')
})

test('waits for the approved data portability Help copy', () => {
  const source = readFileSync(resolve(repoRoot, 'scripts/qa-paid-mvp-support.mjs'), 'utf8')
  assert.match(source, /Data creates the local backup/)
  assert.doesNotMatch(source, /Data creates a local backup/)
})
