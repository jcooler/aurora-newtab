import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { resolve } from 'node:path'

import {
  MICROSOFT_CALENDAR_STATES,
  MICROSOFT_CALENDAR_VIEWPORTS,
  assertArtifactIsolation,
  assertEvidenceContract,
  inspectGeometry,
  microsoftGraphFixtureStatus,
  requireExact,
} from './qa-microsoft-calendar.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('pins the approved Microsoft Calendar states and viewports', () => {
  assert.deepEqual(MICROSOFT_CALENDAR_STATES, [
    'production-locked',
    'read-only-consent',
    'connecting',
    'calendar-selection',
    'personal-and-work',
    'organization-approval',
    'partial-account',
    'reconnect-retained',
    'disconnect-history',
    'composed-calendar-full',
    'composed-calendar-stacked',
    'composed-calendar-docked',
    'touch-selection',
  ])
  assert.deepEqual(MICROSOFT_CALENDAR_VIEWPORTS, [
    { id: 'desktop', width: 1600, height: 900, touch: false },
    { id: 'short', width: 1408, height: 600, touch: false },
    { id: 'ultrawide', width: 3440, height: 1440, touch: false },
    { id: 'touch', width: 390, height: 844, touch: true },
  ])
})

test('requires exact invocation and rejects preview-fixture leakage', () => {
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
  const preview = 'preview_fixture preview-microsoft-calendar-authority'
  assert.doesNotThrow(() => assertArtifactIsolation('production', 'account local', preview))
  assert.throws(() => assertArtifactIsolation('preview_fixture', 'account local', preview), /production artifact/)
  assert.throws(() => assertArtifactIsolation('production', 'preview_fixture', preview), /account-local artifact/)
})

test('reports horizontal escapes without treating vertical scrolling as escape', () => {
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

test('keeps one synthetic account partial while the other account remains available', () => {
  assert.equal(microsoftGraphFixtureStatus(
    new URL('https://graph.microsoft.com/v1.0/me/calendars/default/calendarView/delta'),
    'forbidden',
  ), 200)
  assert.equal(microsoftGraphFixtureStatus(
    new URL('https://graph.microsoft.com/v1.0/me/calendars/project/calendarView/delta'),
    'forbidden',
  ), 403)
  assert.equal(microsoftGraphFixtureStatus(
    new URL('https://graph.microsoft.com/v1.0/me/calendars/project/calendarView/delta'),
    'unauthorized',
  ), 401)
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
      accountLocal: { sourceSha, mode: 'account-local', exact: true, previewFixture: false },
      preview: { sourceSha, mode: 'preview', exact: true, previewFixture: true },
    },
    extensionIds: {
      production: 'abcdefghijklmnopabcdefghijklmnop',
      accountLocal: 'bcdefghijklmnopabcdefghijklmnopa',
      preview: 'cdefghijklmnopabcdefghijklmnopab',
    },
    states: Object.fromEntries(MICROSOFT_CALENDAR_STATES.map((state, index) => [state, {
      passed: true,
      viewportId: MICROSOFT_CALENDAR_VIEWPORTS[index % MICROSOFT_CALENDAR_VIEWPORTS.length].id,
      screenshotPath: `docs/superpowers/qa/microsoft-calendar/${sourceSha}/${state}.png`,
    }])),
    viewports: MICROSOFT_CALENDAR_VIEWPORTS.map((viewport) => ({
      viewport,
      horizontalOverflow: false,
      escaped: [],
      screenshotPath: `docs/superpowers/qa/microsoft-calendar/${sourceSha}/${viewport.id}.png`,
    })),
    interactions: {
      keyboardFocus: true,
      focusRestored: true,
      permissionDisclosureVisible: true,
    },
    storage: {
      keys: ['connectors', 'connectorSnapshots', 'metricsHistory', 'refreshPreferences'],
      unexpectedKeys: [],
      secretValues: [],
    },
    requests: [{
      state: 'calendar-selection',
      host: 'graph.microsoft.com',
      path: '/v1.0/me/calendars',
      disposition: 'fixture-fulfilled',
    }],
    wireRequests: [],
    unexpectedOrigins: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    touchTargets: [
      { name: 'Continue with Microsoft', width: 180, height: 44 },
      { name: 'Calendar selection row', width: 320, height: 44 },
    ],
    reducedMotion: { passed: true, animationName: 'none' },
    screenshots: MICROSOFT_CALENDAR_STATES.map((state) => `docs/superpowers/qa/microsoft-calendar/${sourceSha}/${state}.png`),
  }
}

test('accepts only complete, synthetic, secret-free, exact installed-extension evidence', () => {
  const evidence = cleanEvidence()
  assert.equal(assertEvidenceContract(evidence), evidence)

  const missing = cleanEvidence()
  delete missing.states['organization-approval']
  assert.throws(() => assertEvidenceContract(missing), /organization-approval/)

  const ownerData = cleanEvidence()
  ownerData.notes = 'owner@gmail.com'
  assert.throws(() => assertEvidenceContract(ownerData), /owner data/)

  const secret = cleanEvidence()
  secret.notes = 'refresh_token=private'
  assert.throws(() => assertEvidenceContract(secret), /secret-looking/)

  const unexpected = cleanEvidence()
  unexpected.unexpectedOrigins.push('https://login.microsoftonline.com')
  assert.throws(() => assertEvidenceContract(unexpected), /unexpected origin/)

  const stale = cleanEvidence()
  stale.builds.preview.sourceSha = 'stale'
  assert.throws(() => assertEvidenceContract(stale), /provenance/)
})

test('the real QA entry point refuses a non-exact invocation', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-microsoft-calendar.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /requires --exact/)
})
