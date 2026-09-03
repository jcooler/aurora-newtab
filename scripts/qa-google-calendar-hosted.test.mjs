import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertSafeHostedGoogleEvidence,
  readHostedGoogleAuthorizationState,
} from './qa-google-calendar-hosted.mjs'

const nonce = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const state = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

function authorizationUrl(overrides = {}) {
  const values = {
    client_id: 'sandbox-client-id.apps.googleusercontent.com',
    redirect_uri: 'https://ovlobmvxtryitupxwylg.supabase.co/functions/v1/google-calendar-oauth-callback',
    response_type: 'code',
    scope: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ].join(' '),
    state,
    nonce,
    code_challenge: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    ...overrides,
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(values)}`
}

test('accepts only the exact hosted Google authorization boundary and returns state in memory', () => {
  assert.equal(readHostedGoogleAuthorizationState(authorizationUrl(), nonce), state)
  assert.throws(
    () => readHostedGoogleAuthorizationState(authorizationUrl({ prompt: 'none' }), nonce),
    /hosted_google_authorization_invalid/u,
  )
  assert.throws(
    () => readHostedGoogleAuthorizationState(authorizationUrl({ scope: 'openid email' }), nonce),
    /hosted_google_authorization_invalid/u,
  )
})

test('permits only redacted metadata in hosted Google evidence', () => {
  const evidence = {
    result: 'PASS',
    project: 'ovlobmvxtryitupxwylg',
    accounts: ['sha256:123456789abc'],
    functions: [{ slug: 'google-calendar-session', verifyJwt: true }],
    interactions: { stateReplayRejected: true, gatewayJwtRequired: true },
    cleanup: { authUsers: true, residualSyntheticRows: 0 },
  }
  assert.doesNotThrow(() => assertSafeHostedGoogleEvidence(evidence))
  for (const unsafe of [
    { email: 'qa@example.invalid' },
    { accessToken: 'private' },
    { refresh_token_ciphertext: 'private' },
    { providerSubject: 'google-subject' },
    { authorizationUrl: authorizationUrl() },
    { jwt: 'eyJabc.eyJdef.signature' },
    { clientSecret: 'private' },
  ]) {
    assert.throws(
      () => assertSafeHostedGoogleEvidence({ ...evidence, ...unsafe }),
      /hosted_google_evidence_unsafe/u,
    )
  }
})
