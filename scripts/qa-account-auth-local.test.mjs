import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { resolve } from 'node:path'

import {
  ACCOUNT_AUTH_INTERACTIONS,
  ACCOUNT_AUTH_SCREENSHOTS,
  ACCOUNT_AUTH_VIEWPORTS,
  assertAccountAuthEvidence,
  assertManifestIsolation,
  localNodeEntry,
  requireExact,
} from './qa-account-auth-local.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('requires exact execution before build or browser work', () => {
  assert.throws(() => requireExact([]), /requires --exact/)
  assert.doesNotThrow(() => requireExact(['--exact']))
})

test('uses pinned local Node entry points without Windows command shims', () => {
  assert.match(localNodeEntry('supabase'), /node_modules[\\/]supabase[\\/]dist[\\/]supabase\.js$/u)
  assert.match(localNodeEntry('vitest'), /node_modules[\\/]vitest[\\/]vitest\.mjs$/u)
  assert.throws(() => localNodeEntry('npx'), /unknown pinned Node entry/u)
})

test('pins installed desktop and touch account-auth viewports', () => {
  assert.deepEqual(ACCOUNT_AUTH_VIEWPORTS, [
    { id: 'desktop', width: 1600, height: 900, touch: false },
    { id: 'touch', width: 768, height: 812, touch: true },
  ])
  assert.deepEqual(ACCOUNT_AUTH_SCREENSHOTS, [
    'account-local-signed-in-desktop',
    'account-local-signed-in-touch',
  ])
})

test('requires sign-in, account binding, replay rejection, and sign-out cleanup', () => {
  assert.deepEqual(ACCOUNT_AUTH_INTERACTIONS, [
    'explicit-google-sign-in',
    'account-bound-owner-lease',
    'replayed-callback-rejected',
    'sign-out-session-cleanup',
    'zero-aurora-data-writes',
  ])
})

test('permits exact production identity while keeping preview and account-local isolated', () => {
  const base = {
    permissions: ['storage', 'favicon', 'geolocation', 'search'],
    optional_permissions: ['bookmarks'],
    optional_host_permissions: ['https://*/*'],
  }
  const production = {
    ...base,
    permissions: [...base.permissions, 'identity'],
    host_permissions: ['https://ovlobmvxtryitupxwylg.supabase.co/*'],
  }
  assert.doesNotThrow(() => assertManifestIsolation(
    production,
    base,
    { ...base, permissions: [...base.permissions, 'identity'], host_permissions: ['http://127.0.0.1/*'] },
  ))
  assert.throws(() => assertManifestIsolation(
    { ...production, host_permissions: ['https://other-project.supabase.co/*'] },
    base,
    { ...base, permissions: [...base.permissions, 'identity'], host_permissions: ['http://127.0.0.1/*'] },
  ), /strictly deep-equal/u)
  assert.throws(() => assertManifestIsolation(
    production,
    { ...base, host_permissions: ['http://127.0.0.1/*'] },
    { ...base, permissions: [...base.permissions, 'identity'], host_permissions: ['http://127.0.0.1/*'] },
  ), /preview.*localhost/i)
})

test('requires exact provenance, bounded runtime ledgers, session isolation, and judged screenshots', () => {
  const evidence = {
    commit: 'abc123',
    result: 'PASS',
    builds: {
      production: { commit: 'abc123', mode: 'production' },
      preview: { commit: 'abc123', mode: 'preview' },
      accountLocal: { commit: 'abc123', mode: 'account-local' },
    },
    execution: { desktop: 'installed-extension', touch: 'installed-extension' },
    interactions: Object.fromEntries(ACCOUNT_AUTH_INTERACTIONS.map((name) => [name, true])),
    storage: {
      signInChangedKeys: ['tab-two:account-session:v1'],
      signOutChangedKeys: ['tab-two:account-session:v1'],
      accountSessionPresentAfterSignOut: false,
    },
    account: { accountId: '10000000-0000-4000-8000-000000000001', grantSources: ['complimentary_owner'] },
    requestIntents: ['oauth-authorize', 'oauth-token', 'auth-user', 'account-snapshot', 'entitlement-lease', 'auth-sign-out'],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    screenshots: ACCOUNT_AUTH_SCREENSHOTS.map((id, index) => ({
      id,
      path: `artifacts/${id}.png`,
      viewport: ACCOUNT_AUTH_VIEWPORTS[index],
      pixelSize: { width: ACCOUNT_AUTH_VIEWPORTS[index].width, height: ACCOUNT_AUTH_VIEWPORTS[index].height },
      judgment: 'PASS: original inspected; content and controls are legible and contained',
      geometry: { horizontalOverflow: false, viewportEscapes: [], overlapPairs: [], scrollOwners: 1 },
    })),
  }
  assert.doesNotThrow(() => assertAccountAuthEvidence(evidence))
  assert.throws(() => assertAccountAuthEvidence({
    ...evidence,
    storage: { ...evidence.storage, signInChangedKeys: ['settings', 'tab-two:account-session:v1'] },
  }), /sign-in storage/i)
  assert.throws(() => assertAccountAuthEvidence({
    ...evidence,
    screenshots: evidence.screenshots.map((capture, index) => index === 0
      ? { ...capture, judgment: '_pending_' }
      : capture),
  }), /unjudged/i)
})

test('the real entry point refuses non-exact invocation', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-account-auth-local.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /requires --exact/)
})
