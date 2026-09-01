import { createClient } from '@supabase/supabase-js'
import type { StoredAccountSessionV1 } from './sessionStorage'

export interface IdentityWebAuth {
  getRedirectURL(path: string): string
  launchWebAuthFlow(details: { url: string; interactive: true }): Promise<string | undefined>
}

interface OAuthInitiation {
  provider: 'google'
  options: {
    redirectTo: string
    skipBrowserRedirect: true
    queryParams?: { prompt: 'login'; max_age: '0' }
  }
}

interface OAuthSession {
  access_token?: unknown
  refresh_token?: unknown
  expires_at?: unknown
  token_type?: unknown
}

export interface GooglePkceAuthClient {
  signInWithOAuth(request: OAuthInitiation): Promise<{
    data: { url: string | null; flowId?: string | null }
    error: unknown
  }>
  exchangeCodeForSession(code: string, options: { flowId: string }): Promise<{
    data: { session: OAuthSession | null }
    error: unknown
  }>
}

export type GooglePkceAuthResult =
  | { ok: true; session: StoredAccountSessionV1 }
  | { ok: false; code: 'cancelled' | 'failed' }

export interface GooglePkceAuth {
  begin(): Promise<GooglePkceAuthResult>
  reauthenticate(): Promise<GooglePkceAuthResult>
}

const flowIdPattern = /^[A-Za-z0-9_-]{8,64}$/u
const callbackKeys = new Set(['tab_two_attempt', 'sb_flow_id', 'code'])

function createInMemoryPkceStorage() {
  const values = new Map<string, string>()
  return {
    async getItem(key: string) { return values.get(key) ?? null },
    async setItem(key: string, value: string) { values.set(key, value) },
    async removeItem(key: string) { values.delete(key) },
  }
}

export function createGooglePkceSupabaseAuthClient(
  supabaseUrl: string,
  publishableKey: string,
): GooglePkceAuthClient {
  return createClient(supabaseUrl, publishableKey, {
    auth: {
      flowType: 'pkce',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: createInMemoryPkceStorage(),
      experimental: { appendPkceFlowIdToRedirects: true },
    },
  }).auth as unknown as GooglePkceAuthClient
}

function oneQueryValue(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name)
  return values.length === 1 && values[0] ? values[0] : null
}

function validCallback(
  value: string,
  expectedRedirect: URL,
  expectedAttempt: string,
  expectedFlowId: string,
): { code: string } | null {
  let callback: URL
  try {
    callback = new URL(value)
  } catch {
    return null
  }
  if (
    callback.origin !== expectedRedirect.origin
    || callback.pathname !== expectedRedirect.pathname
    || callback.username
    || callback.password
    || callback.hash
    || callback.searchParams.has('error')
    || callback.searchParams.has('error_description')
    || [...callback.searchParams.keys()].some((key) => !callbackKeys.has(key))
  ) {
    return null
  }
  const attempt = oneQueryValue(callback, 'tab_two_attempt')
  const flowId = oneQueryValue(callback, 'sb_flow_id')
  const code = oneQueryValue(callback, 'code')
  return attempt === expectedAttempt && flowId === expectedFlowId && code
    ? { code }
    : null
}

function cleanSession(value: OAuthSession | null): StoredAccountSessionV1 | null {
  if (
    !value
    || typeof value.access_token !== 'string'
    || !value.access_token
    || value.access_token.length > 16_384
    || typeof value.refresh_token !== 'string'
    || !value.refresh_token
    || value.refresh_token.length > 16_384
    || !Number.isSafeInteger(value.expires_at)
    || (value.expires_at as number) <= 0
    || value.token_type !== 'bearer'
  ) {
    return null
  }
  const expiresAt = (value.expires_at as number) * 1_000
  if (!Number.isSafeInteger(expiresAt)) return null
  return {
    version: 1,
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    expiresAt,
    tokenType: 'bearer',
  }
}

export function createGooglePkceAuth(dependencies: {
  auth: GooglePkceAuthClient
  identity: IdentityWebAuth
  randomUUID?: () => string
}): GooglePkceAuth {
  const randomUUID = dependencies.randomUUID ?? crypto.randomUUID
  const activeAttempts = new Map<string, string>()

  async function run(fresh: boolean): Promise<GooglePkceAuthResult> {
    const baseRedirect = new URL(dependencies.identity.getRedirectURL('account-auth'))
    if (baseRedirect.search || baseRedirect.hash || baseRedirect.username || baseRedirect.password) {
      return { ok: false, code: 'failed' }
    }
    const attempt = randomUUID()
    if (!attempt || attempt.length > 100 || activeAttempts.has(attempt)) {
      return { ok: false, code: 'failed' }
    }
    const redirectTo = new URL(baseRedirect)
    redirectTo.searchParams.set('tab_two_attempt', attempt)

    let initiation: Awaited<ReturnType<GooglePkceAuthClient['signInWithOAuth']>>
    try {
      initiation = await dependencies.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo.toString(),
          skipBrowserRedirect: true,
          ...(fresh ? { queryParams: { prompt: 'login' as const, max_age: '0' as const } } : {}),
        },
      })
    } catch {
      return { ok: false, code: 'failed' }
    }
    const flowId = initiation.data.flowId
    if (initiation.error || !initiation.data.url || !flowId || !flowIdPattern.test(flowId)) {
      return { ok: false, code: 'failed' }
    }
    activeAttempts.set(attempt, flowId)

    let callbackValue: string | undefined
    try {
      callbackValue = await dependencies.identity.launchWebAuthFlow({
        url: initiation.data.url,
        interactive: true,
      })
    } catch {
      activeAttempts.delete(attempt)
      return { ok: false, code: 'cancelled' }
    }
    if (!callbackValue) {
      activeAttempts.delete(attempt)
      return { ok: false, code: 'cancelled' }
    }

    const retainedFlowId = activeAttempts.get(attempt)
    if (!retainedFlowId) {
      activeAttempts.delete(attempt)
      return { ok: false, code: 'failed' }
    }
    const callback = validCallback(callbackValue, baseRedirect, attempt, retainedFlowId)
    activeAttempts.delete(attempt)
    if (!callback) return { ok: false, code: 'failed' }

    try {
      const exchanged = await dependencies.auth.exchangeCodeForSession(callback.code, {
        flowId: retainedFlowId,
      })
      if (exchanged.error) return { ok: false, code: 'failed' }
      const session = cleanSession(exchanged.data.session)
      return session ? { ok: true, session } : { ok: false, code: 'failed' }
    } catch {
      return { ok: false, code: 'failed' }
    }
  }

  return Object.freeze({
    begin: () => run(false),
    reauthenticate: () => run(true),
  })
}
