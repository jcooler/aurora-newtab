import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  PRODUCTION_ACCOUNT_INTERACTIONS,
  PRODUCTION_ACCOUNT_SCREENSHOTS,
  PRODUCTION_BROWSER_CHANNEL,
  assertNoProductionSecrets,
  assertProductionEvidence,
  assertProductionManifest,
  requireProductionExact,
} from './qa-account-auth-production.mjs'

test('uses the Playwright channel that can load unpacked extensions', () => {
  assert.equal(PRODUCTION_BROWSER_CHANNEL, 'chromium')
})

test('distinguishes rejection markers from secret-shaped values', () => {
  assert.doesNotThrow(() => assertNoProductionSecrets("candidate.startsWith('sb_secret_')"))
  assert.throws(
    () => assertNoProductionSecrets('sb_secret_abcdefghijklmnopqrstuvwxyz0123456789'),
    /secret-shaped Supabase key/u,
  )
})

test('requires exact production execution', () => {
  assert.throws(() => requireProductionExact([]), /requires --exact/u)
  assert.doesNotThrow(() => requireProductionExact(['--exact']))
})

test('requires the existing extension identity and exact production authority', () => {
  assert.doesNotThrow(() => assertProductionManifest({
    permissions: ['storage', 'identity'],
    host_permissions: ['https://ovlobmvxtryitupxwylg.supabase.co/*'],
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtAbH6UoDbP1vwkX+cbad/VDVAkzbHYKFo8ARCahpdc8IP664lIJCCZZk8r/lrgcgOb9hlcqECOIXp/35YpwpE/kyMo5xcihDa+RXFk3QP8IgTip6QjQq/Ag/IDmBWmqWcCiHQjr8EOHk4zX8Ex+0kVjKYQzdlLJUfo+zIu9qqCkkTqdXPqq2dt/OWjV4tmCNaxMIez4etT60KqQjqmLFSEjcg9yC/aHyKNzB6zMsjTE2RTino4g5oVkoHOBXwTJB3BW5A60jlD0xofHWqQhA1aUjT0T+O19Wcg0QwvkTLWMolXapPvrmfFTxI3PHj0Gvxam5Qj089dPKnOqsqpCLaQIDAQAB',
  }))
  assert.throws(() => assertProductionManifest({ permissions: ['storage'], host_permissions: [] }), /identity/u)
})

test('requires the complete hosted interaction, storage, and visual ledger', () => {
  const viewports = [
    { width: 1600, height: 900, touch: false },
    { width: 768, height: 812, touch: true },
  ]
  const evidence = {
    result: 'PASS',
    extensionId: 'akjalbmacojpmebkgohhcaaiacicpgkh',
    callback: 'https://akjalbmacojpmebkgohhcaaiacicpgkh.chromiumapp.org/account-auth',
    interactions: Object.fromEntries(PRODUCTION_ACCOUNT_INTERACTIONS.map((name) => [name, true])),
    storage: {
      signInChangedKeys: ['tab-two:account-session:v1'],
      signOutChangedKeys: ['tab-two:account-session:v1'],
      accountSessionPresentAfterSignOut: false,
    },
    account: {
      accountId: '10000000-0000-4000-8000-000000000001',
      provider: 'google',
      leaseKeyId: 'production-2026-09-01',
      grantSources: ['complimentary_owner'],
    },
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    screenshots: PRODUCTION_ACCOUNT_SCREENSHOTS.map((id, index) => ({
      id,
      viewport: viewports[index],
      pixelSize: { width: viewports[index].width, height: viewports[index].height },
      judgment: 'PASS: original inspected',
      geometry: { horizontalOverflow: false, viewportEscapes: [], overlapPairs: [], scrollOwners: 1 },
    })),
  }
  assert.doesNotThrow(() => assertProductionEvidence(evidence))
  assert.throws(() => assertProductionEvidence({
    ...evidence,
    storage: { ...evidence.storage, signInChangedKeys: ['AuroraData', 'tab-two:account-session:v1'] },
  }), /tab-two:account-session/u)
})

test('the production entry point refuses non-exact invocation', () => {
  const result = spawnSync(process.execPath, ['scripts/qa-account-auth-production.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /requires --exact/u)
})
