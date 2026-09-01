import { describe, expect, it, vi } from 'vitest'
import authSource from './googlePkceAuth.ts?raw'
import { createGooglePkceAuth } from './googlePkceAuth'
import type { GooglePkceAuthClient, IdentityWebAuth } from './googlePkceAuth'

const baseRedirect = 'https://abcdefghijklmnop.chromiumapp.org/account-auth'
const session = {
  access_token: 'access-token-secret',
  refresh_token: 'refresh-token-secret',
  expires_at: 1_788_274_800,
  token_type: 'bearer',
}

function fixture() {
  let redirectTo = ''
  const auth: GooglePkceAuthClient = {
    signInWithOAuth: vi.fn(async (request) => {
      const callback = new URL(request.options.redirectTo)
      callback.searchParams.set('sb_flow_id', '0123456789abcdef0123456789abcdef')
      redirectTo = callback.toString()
      return {
        data: {
          url: 'https://accounts.google.test/o/oauth2/auth?opaque=secret-provider-value',
          flowId: '0123456789abcdef0123456789abcdef',
        },
        error: null,
      }
    }),
    exchangeCodeForSession: vi.fn(async () => ({ data: { session }, error: null })),
  }
  const identity: IdentityWebAuth = {
    getRedirectURL: vi.fn(() => baseRedirect),
    launchWebAuthFlow: vi.fn(async () => {
      const callback = new URL(redirectTo)
      callback.searchParams.set('code', 'authorization-code-secret')
      return callback.toString()
    }),
  }
  const randomUUID = vi.fn(() => '10000000-0000-4000-8000-000000000001')
  return { auth, identity, randomUUID, redirectTo: () => redirectTo }
}

describe('GooglePkceAuth', () => {
  it('pins the Supabase client to memory-only PKCE with callback flow ids', () => {
    expect(authSource).toMatch(/flowType:\s*'pkce'/u)
    expect(authSource).toMatch(/persistSession:\s*false/u)
    expect(authSource).toMatch(/autoRefreshToken:\s*false/u)
    expect(authSource).toMatch(/detectSessionInUrl:\s*false/u)
    expect(authSource).toMatch(/appendPkceFlowIdToRedirects:\s*true/u)
    expect(authSource).toMatch(/randomUUID\s*=\s*dependencies\.randomUUID\s*\?\?\s*\(\(\)\s*=>\s*crypto\.randomUUID\(\)\)/u)
    expect(authSource).not.toMatch(/(?:window|globalThis)\.(?:localStorage|sessionStorage)/u)
  })

  it('starts only Google PKCE from one call with an exact extension callback and per-attempt correlation', async () => {
    const { auth, identity, randomUUID, redirectTo } = fixture()
    const result = await createGooglePkceAuth({ auth, identity, randomUUID }).begin()

    expect(result).toEqual({
      ok: true,
      session: {
        version: 1,
        accessToken: 'access-token-secret',
        refreshToken: 'refresh-token-secret',
        expiresAt: 1_788_274_800_000,
        tokenType: 'bearer',
      },
    })
    expect(randomUUID).toHaveBeenCalledTimes(1)
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: expect.stringMatching(/^https:\/\/abcdefghijklmnop\.chromiumapp\.org\/account-auth\?tab_two_attempt=/u),
        skipBrowserRedirect: true,
      },
    })
    expect(new URL(redirectTo()).searchParams.get('tab_two_attempt')).toBe(
      '10000000-0000-4000-8000-000000000001',
    )
    expect(identity.launchWebAuthFlow).toHaveBeenCalledWith({
      url: 'https://accounts.google.test/o/oauth2/auth?opaque=secret-provider-value',
      interactive: true,
    })
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith(
      'authorization-code-secret',
      { flowId: '0123456789abcdef0123456789abcdef' },
    )
  })

  it('requests fresh Google authentication for reauthentication', async () => {
    const { auth, identity, randomUUID } = fixture()
    await createGooglePkceAuth({ auth, identity, randomUUID }).reauthenticate()

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        skipBrowserRedirect: true,
        queryParams: { prompt: 'login', max_age: '0' },
      }),
    })
  })

  it('reports cancellation without exchanging a code', async () => {
    const value = fixture()
    value.identity.launchWebAuthFlow = vi.fn(async () => undefined)

    await expect(createGooglePkceAuth(value).begin()).resolves.toEqual({ ok: false, code: 'cancelled' })
    expect(value.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('bounds provider initiation errors without reflecting their payload', async () => {
    const value = fixture()
    value.auth.signInWithOAuth = vi.fn(async () => ({
      data: { url: null, flowId: null },
      error: new Error('provider failed with secret-provider-value'),
    }))

    const result = await createGooglePkceAuth(value).begin()
    expect(result).toEqual({ ok: false, code: 'failed' })
    expect(JSON.stringify(result)).not.toContain('secret-provider-value')
  })

  it.each([
    ['redirect origin substitution', (callback: URL) => { callback.hostname = 'attacker.example' }],
    ['redirect path substitution', (callback: URL) => { callback.pathname = '/other' }],
    ['missing code', (callback: URL) => { callback.searchParams.delete('code') }],
    ['duplicate code', (callback: URL) => { callback.searchParams.append('code', 'second') }],
    ['missing flow id', (callback: URL) => { callback.searchParams.delete('sb_flow_id') }],
    ['duplicate flow id', (callback: URL) => { callback.searchParams.append('sb_flow_id', 'second') }],
    ['wrong flow id', (callback: URL) => { callback.searchParams.set('sb_flow_id', 'fedcba9876543210fedcba9876543210') }],
    ['missing attempt id', (callback: URL) => { callback.searchParams.delete('tab_two_attempt') }],
    ['wrong attempt id', (callback: URL) => { callback.searchParams.set('tab_two_attempt', 'other-attempt') }],
    ['provider error', (callback: URL) => { callback.searchParams.set('error', 'access_denied') }],
  ])('rejects %s before code exchange', async (_name, mutate) => {
    const value = fixture()
    value.identity.launchWebAuthFlow = vi.fn(async () => {
      const callback = new URL(value.redirectTo())
      callback.searchParams.set('code', 'authorization-code-secret')
      mutate(callback)
      return callback.toString()
    })

    await expect(createGooglePkceAuth(value).begin()).resolves.toEqual({ ok: false, code: 'failed' })
    expect(value.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('rejects callback replay against a later attempt', async () => {
    const value = fixture()
    let firstCallback = ''
    value.identity.launchWebAuthFlow = vi
      .fn()
      .mockImplementationOnce(async () => {
        const callback = new URL(value.redirectTo())
        callback.searchParams.set('code', 'first-code')
        firstCallback = callback.toString()
        return firstCallback
      })
      .mockImplementationOnce(async () => firstCallback)
    value.randomUUID = vi
      .fn()
      .mockReturnValueOnce('10000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('10000000-0000-4000-8000-000000000002')

    const google = createGooglePkceAuth(value)
    await expect(google.begin()).resolves.toEqual(expect.objectContaining({ ok: true }))
    await expect(google.begin()).resolves.toEqual({ ok: false, code: 'failed' })
    expect(value.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
  })

  it('isolates overlapping flows and exchanges each callback with its own flow id', async () => {
    const redirects = new Map<string, string>()
    const auth = fixture().auth
    auth.signInWithOAuth = vi.fn(async (request) => {
      const attempt = new URL(request.options.redirectTo).searchParams.get('tab_two_attempt') ?? ''
      const flowId = attempt.endsWith('1')
        ? '11111111111111111111111111111111'
        : '22222222222222222222222222222222'
      const callback = new URL(request.options.redirectTo)
      callback.searchParams.set('sb_flow_id', flowId)
      redirects.set(attempt, callback.toString())
      return { data: { url: `https://accounts.google.test/${attempt}`, flowId }, error: null }
    })
    const identity: IdentityWebAuth = {
      getRedirectURL: () => baseRedirect,
      launchWebAuthFlow: vi.fn(async ({ url }) => {
        const attempt = new URL(url).pathname.slice(1)
        const callback = new URL(redirects.get(attempt) ?? '')
        callback.searchParams.set('code', `code-${attempt}`)
        return callback.toString()
      }),
    }
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce('attempt-1')
      .mockReturnValueOnce('attempt-2')
    const google = createGooglePkceAuth({ auth, identity, randomUUID })

    const [first, second] = await Promise.all([google.begin(), google.begin()])
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('code-attempt-1', {
      flowId: '11111111111111111111111111111111',
    })
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('code-attempt-2', {
      flowId: '22222222222222222222222222222222',
    })
  })

  it('returns a bounded failure for exchange errors and malformed sessions', async () => {
    const exchangeError = fixture()
    exchangeError.auth.exchangeCodeForSession = vi.fn(async () => ({
      data: { session: null },
      error: new Error('exchange leaked authorization-code-secret'),
    }))
    await expect(createGooglePkceAuth(exchangeError).begin()).resolves.toEqual({ ok: false, code: 'failed' })

    const malformed = fixture()
    malformed.auth.exchangeCodeForSession = vi.fn(async () => ({
      data: { session: { ...session, expires_at: 0 } },
      error: null,
    }))
    await expect(createGooglePkceAuth(malformed).begin()).resolves.toEqual({ ok: false, code: 'failed' })
  })
})
