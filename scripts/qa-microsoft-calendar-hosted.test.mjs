import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  assertSafeHostedMicrosoftEvidence,
  readHostedMicrosoftAuthorizationState,
} from './qa-microsoft-calendar-hosted.mjs'

const nonce = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const state = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

function authorizationUrl(overrides = {}) {
  const values = {
    client_id: '11111111-2222-4333-8444-555555555555',
    redirect_uri: 'https://ovlobmvxtryitupxwylg.supabase.co/functions/v1/microsoft-calendar-oauth-callback',
    response_type: 'code',
    response_mode: 'query',
    scope: [
      'openid',
      'offline_access',
      'https://graph.microsoft.com/User.Read',
      'https://graph.microsoft.com/Calendars.ReadBasic',
    ].join(' '),
    state,
    nonce,
    code_challenge: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    code_challenge_method: 'S256',
    prompt: 'select_account',
    ...overrides,
  }
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${new URLSearchParams(values)}`
}

function safeEvidence() {
  return {
    result: 'PASS',
    project: 'ovlobmvxtryitupxwylg',
    dataClassification: 'synthetic-metadata-only',
    ownerDataPresent: false,
    accounts: ['sha256:123456789abc'],
    functions: [{ slug: 'microsoft-calendar-session', verifyJwt: true }],
    interactions: {
      gatewayJwtRequired: true,
      redirectBindingRejected: true,
      entitlementDenied: true,
      exactAuthorizationBoundary: true,
      organizationApprovalMapped: true,
      stateReplayRejected: true,
      personalAndWorkMetadata: true,
      scopeMismatchRejected: true,
      crossAccountAccessRejected: true,
      hostedTokenRotationMetadata: true,
      rateLimitEnforced: true,
      revokeFailureStillDisconnects: true,
      perAccountProviderHistoryDeleted: true,
    },
    usage: { functionInvocations: 12, responseEgressBytes: 2_048 },
    cleanup: { authUsers: true, residualSyntheticRows: 0 },
  }
}

test('accepts only the exact hosted Microsoft authorization boundary and returns state in memory', () => {
  assert.equal(readHostedMicrosoftAuthorizationState(authorizationUrl(), nonce), state)
  assert.throws(
    () => readHostedMicrosoftAuthorizationState(authorizationUrl({ prompt: 'none' }), nonce),
    /hosted_microsoft_authorization_invalid/u,
  )
  assert.throws(
    () => readHostedMicrosoftAuthorizationState(authorizationUrl({
      scope: 'openid offline_access https://graph.microsoft.com/Calendars.Read',
    }), nonce),
    /hosted_microsoft_authorization_invalid/u,
  )
  assert.throws(
    () => readHostedMicrosoftAuthorizationState(
      authorizationUrl().replace('/common/', '/organizations/'), nonce,
    ),
    /hosted_microsoft_authorization_invalid/u,
  )
})

test('permits only capped redacted synthetic metadata in hosted Microsoft evidence', () => {
  const evidence = safeEvidence()
  assert.doesNotThrow(() => assertSafeHostedMicrosoftEvidence(evidence))
  for (const unsafe of [
    { ownerDataPresent: true },
    { dataClassification: 'owner-data' },
    { email: 'qa@example.invalid' },
    { accessToken: 'private' },
    { refresh_token_ciphertext: 'private' },
    { providerSubject: 'tenant-id:object-id' },
    { tenantId: '11111111-2222-4333-8444-555555555555' },
    { authorizationUrl: authorizationUrl() },
    { jwt: 'eyJabc.eyJdef.signature' },
    { clientSecret: 'private' },
    { usage: { functionInvocations: 15, responseEgressBytes: 2_048 } },
    { usage: { functionInvocations: 12, responseEgressBytes: 65_536 } },
  ]) {
    assert.throws(
      () => assertSafeHostedMicrosoftEvidence({ ...evidence, ...unsafe }),
      /hosted_microsoft_evidence_unsafe/u,
    )
  }
})

test('the hosted Microsoft entry point refuses execution without the exact gate', () => {
  const result = spawnSync(process.execPath, [resolve('scripts/qa-microsoft-calendar-hosted.mjs')], {
    cwd: resolve('.'),
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Run with --exact only after the approved PM-P7 hosted gate/u)
})
