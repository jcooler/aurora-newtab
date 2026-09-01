import type { AccountServiceConfig } from './accountServiceConfig'
import type { AccountClient } from './client'
import { verifyEntitlementLeaseV1 } from './entitlementLease'
import {
  createGooglePkceAuth,
  createGooglePkceSupabaseAuthClient,
} from './googlePkceAuth'
import type { GooglePkceAuth } from './googlePkceAuth'
import { localAccountSnapshot } from './localAccountClient'
import {
  createAccountSessionStore,
  createChromeAccountSessionStorageBoundary,
} from './sessionStorage'
import type { AccountSessionStore, StoredAccountSessionV1 } from './sessionStorage'
import type { AccountActions, AccountSnapshot, VerifiedEntitlementLease } from './types'

export interface AccountServiceSnapshot {
  accountId: string
  email: string
  displayName: string | null
  subscription: { state: 'none' | 'active' | 'complimentary' }
}

type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'unauthorized' | 'not_entitled' | 'unavailable' }

export interface SupabaseAccountClientDependencies {
  sessionStore: AccountSessionStore
  googleAuth: GooglePkceAuth
  sessionAuth: {
    getUser(accessToken: string): Promise<
      { status: 'valid'; authUserId: string }
      | { status: 'invalid' | 'unavailable' }
    >
    refresh(refreshToken: string): Promise<
      { ok: true; session: StoredAccountSessionV1 }
      | { ok: false; kind: 'invalid' | 'unavailable' }
    >
    signOut(): Promise<void>
  }
  api: {
    getAccountSnapshot(accessToken: string): Promise<ServiceResult<AccountServiceSnapshot>>
    getEntitlementLease(accessToken: string): Promise<ServiceResult<unknown>>
  }
  verifyLease(
    envelope: unknown,
    expectedAccountId: string,
    now: number,
  ): Promise<VerifiedEntitlementLease | null>
  refreshLock: {
    request<T>(name: string, callback: () => Promise<T>): Promise<T>
  }
  now(): number
}

const refreshLockName = 'tab-two:account-session-refresh:v1'
const refreshWindow = 60_000

function fixedSync(phase: AccountSnapshot['sync']['phase'] = 'disabled') {
  return Object.freeze({
    enabled: false,
    phase,
    lastSuccessAt: null,
    usedBytes: 0,
    quotaBytes: 2_097_152 as const,
  })
}

function validAccountSnapshot(value: AccountServiceSnapshot): boolean {
  return Boolean(
    value
    && typeof value.accountId === 'string'
    && value.accountId.length > 0
    && value.accountId.length <= 200
    && typeof value.email === 'string'
    && value.email.length > 0
    && value.email.length <= 320
    && (value.displayName === null
      || (typeof value.displayName === 'string' && value.displayName.length > 0 && value.displayName.length <= 200))
    && value.subscription
    && ['none', 'active', 'complimentary'].includes(value.subscription.state),
  )
}

function signedSnapshot(
  account: AccountServiceSnapshot,
  lease: VerifiedEntitlementLease | null,
  phase: AccountSnapshot['sync']['phase'] = 'disabled',
): AccountSnapshot {
  return Object.freeze({
    mode: 'signed_in' as const,
    accountId: account.accountId,
    email: account.email,
    displayName: account.displayName,
    subscription: lease?.grantSources.includes('complimentary_owner')
      ? 'complimentary' as const
      : 'none' as const,
    lease,
    sync: fixedSync(phase),
    devices: Object.freeze([]),
  })
}

export function createSupabaseAccountClient(
  dependencies: SupabaseAccountClientDependencies,
): AccountClient {
  let current: AccountSnapshot = localAccountSnapshot
  let hydration: Promise<AccountSnapshot> | null = null
  const listeners = new Set<(snapshot: AccountSnapshot) => void>()

  function publish(snapshot: AccountSnapshot): AccountSnapshot {
    current = snapshot
    for (const listener of listeners) listener(snapshot)
    return snapshot
  }

  async function clearAuthority(): Promise<AccountSnapshot> {
    try {
      await dependencies.sessionStore.clear()
    } catch {
      // The in-memory authority still fails closed even if local cleanup is unavailable.
    }
    return publish(localAccountSnapshot)
  }

  function offlineOrLocal(at: number): AccountSnapshot {
    if (
      current.mode === 'signed_in'
      && current.lease?.verification === 'verified'
      && current.lease.accountId === current.accountId
      && current.lease.issuedAt <= at
      && current.lease.expiresAt > at
    ) {
      return publish({ ...current, sync: fixedSync('offline') })
    }
    return publish(localAccountSnapshot)
  }

  async function usableSession(initial: StoredAccountSessionV1): Promise<StoredAccountSessionV1 | null> {
    const at = dependencies.now()
    if (initial.expiresAt > at + refreshWindow) return initial
    return dependencies.refreshLock.request(refreshLockName, async () => {
      let latest: StoredAccountSessionV1 | null
      try {
        latest = await dependencies.sessionStore.read()
      } catch {
        return null
      }
      if (!latest) return null
      if (latest.expiresAt > dependencies.now() + refreshWindow) return latest
      const refreshed = await dependencies.sessionAuth.refresh(latest.refreshToken)
      if (!refreshed.ok) {
        if (refreshed.kind === 'invalid') await clearAuthority()
        return null
      }
      try {
        await dependencies.sessionStore.write(refreshed.session)
      } catch {
        return null
      }
      return refreshed.session
    })
  }

  async function hydrate(): Promise<AccountSnapshot> {
    const at = dependencies.now()
    let stored: StoredAccountSessionV1 | null
    try {
      stored = await dependencies.sessionStore.read()
    } catch {
      return offlineOrLocal(at)
    }
    if (!stored) return publish(localAccountSnapshot)
    const prepared = await usableSession(stored)
    if (!prepared) return offlineOrLocal(at)

    const user = await dependencies.sessionAuth.getUser(prepared.accessToken)
    if (user.status === 'invalid') return clearAuthority()
    if (user.status === 'unavailable') return offlineOrLocal(at)

    const accountResult = await dependencies.api.getAccountSnapshot(prepared.accessToken)
    if (!accountResult.ok) {
      return accountResult.kind === 'unauthorized'
        ? clearAuthority()
        : offlineOrLocal(at)
    }
    if (!validAccountSnapshot(accountResult.value)) return clearAuthority()

    const leaseResult = await dependencies.api.getEntitlementLease(prepared.accessToken)
    if (!leaseResult.ok) {
      if (leaseResult.kind === 'unauthorized') return clearAuthority()
      if (leaseResult.kind === 'not_entitled') {
        return publish(signedSnapshot(accountResult.value, null))
      }
      return offlineOrLocal(at)
    }
    const verified = await dependencies.verifyLease(
      leaseResult.value,
      accountResult.value.accountId,
      dependencies.now(),
    )
    if (!verified) return clearAuthority()
    return publish(signedSnapshot(accountResult.value, verified))
  }

  async function getSnapshot(): Promise<AccountSnapshot> {
    if (hydration) return hydration
    hydration = hydrate().finally(() => { hydration = null })
    return hydration
  }

  async function beginSignIn(): Promise<Awaited<ReturnType<AccountActions['beginSignIn']>>> {
    const result = current.mode === 'signed_in'
      ? await dependencies.googleAuth.reauthenticate()
      : await dependencies.googleAuth.begin()
    if (!result.ok) return result
    try {
      await dependencies.sessionStore.write(result.session)
    } catch {
      return { ok: false, code: 'failed' }
    }
    const next = await getSnapshot()
    return next.mode === 'signed_in'
      ? { ok: true }
      : { ok: false, code: 'failed' }
  }

  async function signOut(): Promise<void> {
    try {
      await dependencies.sessionAuth.signOut()
    } catch {
      // Local authority is always cleared even if remote revocation is unavailable.
    }
    await clearAuthority()
  }

  async function unavailable(): Promise<void> {}
  const actions: AccountActions = Object.freeze({
    beginSignIn,
    signOut,
    enableSync: unavailable,
    disableSync: unavailable,
    syncNow: unavailable,
    revokeDevice: async (_deviceId: string) => {},
    openPlans: unavailable,
    openBilling: unavailable,
    deleteVault: unavailable,
    deleteAccount: unavailable,
  })

  return Object.freeze({
    getSnapshot,
    subscribe(listener: (snapshot: AccountSnapshot) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    actions,
  })
}

interface ConcreteSupabaseAuth {
  getUser(token: string): Promise<{ data: { user: null | { id: string; app_metadata?: Record<string, unknown> } }; error: unknown }>
  refreshSession(input: { refresh_token: string }): Promise<{ data: { session: null | Record<string, unknown> }; error: unknown }>
  signOut(): Promise<{ error: unknown }>
}

function storedSession(value: Record<string, unknown> | null): StoredAccountSessionV1 | null {
  if (
    !value
    || typeof value.access_token !== 'string'
    || typeof value.refresh_token !== 'string'
    || !Number.isSafeInteger(value.expires_at)
    || value.token_type !== 'bearer'
  ) return null
  const expiresAt = (value.expires_at as number) * 1_000
  return Number.isSafeInteger(expiresAt) ? {
    version: 1,
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    expiresAt,
    tokenType: 'bearer',
  } : null
}

async function serviceRequest<T>(
  url: string,
  method: 'GET' | 'POST',
  token: string,
): Promise<ServiceResult<T>> {
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    })
  } catch {
    return { ok: false, kind: 'unavailable' }
  }
  if (response.status === 401) return { ok: false, kind: 'unauthorized' }
  if (response.status === 403) return { ok: false, kind: 'not_entitled' }
  if (!response.ok) return { ok: false, kind: 'unavailable' }
  try {
    return { ok: true, value: await response.json() as T }
  } catch {
    return { ok: false, kind: 'unavailable' }
  }
}

export function createConfiguredSupabaseAccountClient(config: AccountServiceConfig): AccountClient {
  const supabaseAuth = createGooglePkceSupabaseAuthClient(
    config.supabaseUrl,
    config.publishableKey,
  )
  const concreteAuth = supabaseAuth as unknown as ConcreteSupabaseAuth
  const sessionStore = createAccountSessionStore(createChromeAccountSessionStorageBoundary())
  return createSupabaseAccountClient({
    sessionStore,
    googleAuth: createGooglePkceAuth({
      auth: supabaseAuth,
      identity: {
        getRedirectURL: (path) => chrome.identity.getRedirectURL(path),
        launchWebAuthFlow: (details) => chrome.identity.launchWebAuthFlow(details),
      },
    }),
    sessionAuth: {
      async getUser(accessToken) {
        try {
          const { data, error } = await concreteAuth.getUser(accessToken)
          if (error || !data.user) return { status: 'invalid' }
          const providers = data.user.app_metadata?.providers
          return data.user.app_metadata?.provider === 'google'
            && Array.isArray(providers)
            && providers.includes('google')
            ? { status: 'valid', authUserId: data.user.id }
            : { status: 'invalid' }
        } catch {
          return { status: 'unavailable' }
        }
      },
      async refresh(refreshToken) {
        try {
          const { data, error } = await concreteAuth.refreshSession({ refresh_token: refreshToken })
          if (error) return { ok: false, kind: 'invalid' }
          const refreshed = storedSession(data.session)
          return refreshed
            ? { ok: true, session: refreshed }
            : { ok: false, kind: 'invalid' }
        } catch {
          return { ok: false, kind: 'unavailable' }
        }
      },
      async signOut() {
        const { error } = await concreteAuth.signOut()
        if (error) throw new Error('sign_out_failed')
      },
    },
    api: {
      getAccountSnapshot: (token) => serviceRequest<AccountServiceSnapshot>(
        `${config.supabaseUrl}/functions/v1/account-snapshot`,
        'GET',
        token,
      ),
      getEntitlementLease: (token) => serviceRequest<unknown>(
        `${config.supabaseUrl}/functions/v1/entitlement-lease`,
        'POST',
        token,
      ),
    },
    verifyLease: (envelope, expectedAccountId, at) => verifyEntitlementLeaseV1(
      envelope as never,
      { expectedAccountId, now: at, trustedKeys: config.trustedLeaseKeys },
    ),
    refreshLock: {
      async request(name, callback) {
        return await navigator.locks.request(name, () => callback())
      },
    },
    now: Date.now,
  })
}
