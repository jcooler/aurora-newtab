import type { AccountServiceConfig } from './accountServiceConfig'
import { createBillingSummary, isTrustedBillingHandoff } from './billing'
import type { BillingPlan, BillingState } from './billing'
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
import { createSyncGateway, type SyncGatewayDependencies } from '../sync/gateway'

export interface AccountServiceSnapshot {
  accountId: string
  email: string
  displayName: string | null
  subscription: {
    state: BillingState
    plan?: 'monthly' | 'annual' | 'intro_annual' | null
    currentPeriodEnd?: number | null
    courtesyEnd?: number | null
    cancelAtPeriodEnd?: boolean
    introductoryEligible?: boolean
  }
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
    createCheckoutSession(accessToken: string, plan: BillingPlan): Promise<ServiceResult<{ url: string }>>
    createPortalSession(accessToken: string): Promise<ServiceResult<{ url: string }>>
  }
  sync?: Pick<SyncGatewayDependencies, 'origin' | 'allowedOrigins' | 'enabled' | 'fetch' | 'timeoutMs' | 'crypto'>
  verifyLease(
    envelope: unknown,
    expectedAccountId: string,
    now: number,
  ): Promise<VerifiedEntitlementLease | null>
  refreshLock: {
    request<T>(name: string, callback: () => Promise<T>): Promise<T>
  }
  now(): number
  openExternal(url: string): void
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
    && ['none', 'active', 'past_due', 'canceling', 'expired', 'complimentary'].includes(value.subscription.state)
    && (value.subscription.plan === undefined
      || value.subscription.plan === null
      || ['monthly', 'annual', 'intro_annual'].includes(value.subscription.plan))
    && (value.subscription.currentPeriodEnd === undefined
      || value.subscription.currentPeriodEnd === null
      || Number.isSafeInteger(value.subscription.currentPeriodEnd))
    && (value.subscription.courtesyEnd === undefined
      || value.subscription.courtesyEnd === null
      || Number.isSafeInteger(value.subscription.courtesyEnd))
    && (value.subscription.cancelAtPeriodEnd === undefined
      || typeof value.subscription.cancelAtPeriodEnd === 'boolean')
    && (value.subscription.introductoryEligible === undefined
      || typeof value.subscription.introductoryEligible === 'boolean'),
  )
}

function signedSnapshot(
  account: AccountServiceSnapshot,
  lease: VerifiedEntitlementLease | null,
  phase: AccountSnapshot['sync']['phase'] = 'disabled',
): AccountSnapshot {
  const verifiedComplimentaryOwner = lease?.grantSources.includes('complimentary_owner') === true
  const billingState = account.subscription.state === 'complimentary'
    ? verifiedComplimentaryOwner ? 'complimentary' : 'none'
    : account.subscription.state === 'none' && verifiedComplimentaryOwner
      ? 'complimentary'
      : account.subscription.state
  return Object.freeze({
    mode: 'signed_in' as const,
    accountId: account.accountId,
    email: account.email,
    displayName: account.displayName,
    billing: createBillingSummary({
      state: billingState,
      plan: account.subscription.plan ?? null,
      currentPeriodEnd: account.subscription.currentPeriodEnd ?? null,
      courtesyEnd: account.subscription.courtesyEnd ?? null,
      cancelAtPeriodEnd: account.subscription.cancelAtPeriodEnd ?? false,
      introductoryEligible: account.subscription.introductoryEligible ?? account.subscription.state === 'none',
    }),
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

  let lastHydrationFresh = false

  async function hydrate(): Promise<AccountSnapshot> {
    lastHydrationFresh = false
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
        lastHydrationFresh = true
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
    lastHydrationFresh = true
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

  async function billingSession(): Promise<StoredAccountSessionV1 | null> {
    let stored: StoredAccountSessionV1 | null
    try {
      stored = await dependencies.sessionStore.read()
    } catch {
      return null
    }
    return stored ? usableSession(stored) : null
  }

  const syncGateway = dependencies.sync
    ? createSyncGateway({
        ...dependencies.sync,
        getAccessToken: async (accountId) => {
          if (current.mode !== 'signed_in' || current.accountId !== accountId) return null
          return (await billingSession())?.accessToken ?? null
        },
        invalidateAuthentication: async () => { await clearAuthority() },
      })
    : null

  async function openPlans(plan: BillingPlan) {
    try {
      const prepared = await billingSession()
      if (!prepared) return { status: 'authentication_required' as const }
      const result = await dependencies.api.createCheckoutSession(prepared.accessToken, plan)
      if (!result.ok) {
        if (result.kind === 'unauthorized') {
          await clearAuthority()
          return { status: 'authentication_required' as const }
        }
        return { status: 'unavailable' as const }
      }
      if (!result.value || !isTrustedBillingHandoff(result.value.url, 'checkout.stripe.com')) {
        return { status: 'unavailable' as const }
      }
      dependencies.openExternal(result.value.url)
      return { status: 'opened' as const }
    } catch {
      return { status: 'unavailable' as const }
    }
  }

  async function openBilling() {
    try {
      const prepared = await billingSession()
      if (!prepared) return { status: 'authentication_required' as const }
      const result = await dependencies.api.createPortalSession(prepared.accessToken)
      if (!result.ok) {
        if (result.kind === 'unauthorized') {
          await clearAuthority()
          return { status: 'authentication_required' as const }
        }
        return { status: result.kind === 'not_entitled' ? 'not_configured' as const : 'unavailable' as const }
      }
      if (!result.value || !isTrustedBillingHandoff(result.value.url, 'billing.stripe.com')) {
        return { status: 'unavailable' as const }
      }
      dependencies.openExternal(result.value.url)
      return { status: 'opened' as const }
    } catch {
      return { status: 'unavailable' as const }
    }
  }

  async function unavailableSync(requireEntitlement = true) {
    if (current.mode !== 'signed_in') return { status: 'authentication_required' as const }
    if (requireEntitlement && !current.lease?.capabilities.includes('encrypted_sync')) {
      return { status: 'entitlement_required' as const }
    }
    return { status: 'needs_attention' as const }
  }
  const actions: AccountActions = Object.freeze({
    beginSignIn,
    signOut,
    enableSync: () => unavailableSync(),
    disableSync: () => unavailableSync(false),
    syncNow: () => unavailableSync(),
    renameDevice: () => unavailableSync(),
    revokeDevice: () => unavailableSync(),
    restoreConflictBackup: () => unavailableSync(),
    discardConflictBackup: () => unavailableSync(),
    openPlans,
    openBilling,
    async refreshBilling() {
      const snapshot = await getSnapshot()
      if (snapshot.mode !== 'signed_in') return { status: 'authentication_required' as const }
      return lastHydrationFresh ? { status: 'refreshed' as const } : { status: 'unavailable' as const }
    },
    deleteVault: () => unavailableSync(false),
    deleteAccount: () => unavailableSync(false),
  })

  return Object.freeze({
    getSnapshot,
    subscribe(listener: (snapshot: AccountSnapshot) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    actions,
    syncGateway,
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
  body?: unknown,
): Promise<ServiceResult<T>> {
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
      createCheckoutSession: (token, plan) => serviceRequest<{ url: string }>(
        `${config.supabaseUrl}/functions/v1/billing-checkout-session`,
        'POST',
        token,
        { plan },
      ),
      createPortalSession: (token) => serviceRequest<{ url: string }>(
        `${config.supabaseUrl}/functions/v1/billing-portal-session`,
        'POST',
        token,
        {},
      ),
    },
    sync: {
      origin: config.supabaseUrl,
      allowedOrigins: [config.supabaseUrl],
      enabled: config.encryptedSyncEnabled,
      fetch: globalThis.fetch.bind(globalThis),
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
    openExternal(url) {
      globalThis.open(url, '_blank', 'noopener')
    },
  })
}
