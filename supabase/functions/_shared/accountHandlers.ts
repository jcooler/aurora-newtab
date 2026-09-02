import type {
  LeasePayloadV1,
  PremiumCapability,
  SignedEntitlementLeaseV1,
  SignedGrantSource,
} from './lease.ts'
import { errorResponse, jsonResponse } from './http.ts'
import type { RequestAuthentication } from './requestAuth.ts'

export interface ProviderNeutralAccount {
  accountId: string
  email: string
  displayName: string | null
}

export interface EffectiveEntitlement {
  capabilities: readonly PremiumCapability[]
  grantSources: readonly SignedGrantSource[]
  earliestExpiry: number | null
}

export interface BillingSummary {
  state: 'none' | 'active' | 'past_due' | 'canceling' | 'expired'
  plan: 'monthly' | 'annual' | 'intro_annual' | null
  currentPeriodEnd: number | null
  courtesyEnd: number | null
  cancelAtPeriodEnd: boolean
  introductoryEligible: boolean
}

export interface AccountRepository {
  findAccountForAuthUser(authUserId: string): Promise<ProviderNeutralAccount | null>
  getEffectiveEntitlement(accountId: string, effectiveAt: number): Promise<EffectiveEntitlement>
  getBillingSummary(accountId: string): Promise<BillingSummary>
}

export interface AccountFunctionDependencies {
  authenticate(request: Request): Promise<RequestAuthentication>
  repository: AccountRepository
  now(): number
  randomUUID(): string
  signLease(payload: LeasePayloadV1): Promise<SignedEntitlementLeaseV1>
}

const capabilities = new Set<PremiumCapability>([
  'encrypted_sync',
  'multi_account',
  'metrics_history',
  'google_calendar',
  'microsoft_calendar',
  'strava',
])
const grantSources = new Set<SignedGrantSource>(['stripe', 'complimentary_owner'])
const thirtyDays = 30 * 24 * 60 * 60 * 1_000

function validString(value: unknown, maximum = 320): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
}

function normalizeAccount(value: ProviderNeutralAccount | null): ProviderNeutralAccount | null {
  if (!value) return null
  if (
    !validString(value.accountId, 200)
    || !validString(value.email)
    || (value.displayName !== null && !validString(value.displayName, 200))
  ) {
    throw new Error('invalid_account_record')
  }
  return {
    accountId: value.accountId,
    email: value.email,
    displayName: value.displayName,
  }
}

function normalizeEntitlement(value: EffectiveEntitlement): EffectiveEntitlement {
  if (
    !Array.isArray(value.capabilities)
    || value.capabilities.some((capability) => !capabilities.has(capability))
    || new Set(value.capabilities).size !== value.capabilities.length
    || !Array.isArray(value.grantSources)
    || value.grantSources.some((source) => !grantSources.has(source))
    || new Set(value.grantSources).size !== value.grantSources.length
    || (value.earliestExpiry !== null && !Number.isSafeInteger(value.earliestExpiry))
  ) {
    throw new Error('invalid_entitlement_record')
  }
  return {
    capabilities: [...value.capabilities].sort(),
    grantSources: [...value.grantSources].sort(),
    earliestExpiry: value.earliestExpiry,
  }
}

function normalizeBilling(value: BillingSummary): BillingSummary {
  if (
    !value
    || !['none', 'active', 'past_due', 'canceling', 'expired'].includes(value.state)
    || (value.plan !== null && !['monthly', 'annual', 'intro_annual'].includes(value.plan))
    || (value.state === 'none' ? value.plan !== null : value.plan === null)
    || (value.currentPeriodEnd !== null && !Number.isSafeInteger(value.currentPeriodEnd))
    || (value.courtesyEnd !== null && !Number.isSafeInteger(value.courtesyEnd))
    || typeof value.cancelAtPeriodEnd !== 'boolean'
    || typeof value.introductoryEligible !== 'boolean'
  ) throw new Error('invalid_billing_record')
  return { ...value }
}

async function resolveAccount(
  request: Request,
  dependencies: AccountFunctionDependencies,
): Promise<{ account: ProviderNeutralAccount } | Response> {
  const authentication = await dependencies.authenticate(request)
  if (!authentication.ok) return errorResponse('authentication_required', 401)
  const account = normalizeAccount(
    await dependencies.repository.findAccountForAuthUser(authentication.authUserId),
  )
  return account ? { account } : errorResponse('account_not_found', 403)
}

export function createAccountHandlers(dependencies: AccountFunctionDependencies): {
  accountSnapshot(request: Request): Promise<Response>
  entitlementLease(request: Request): Promise<Response>
} {
  return {
    async accountSnapshot(request) {
      if (request.method !== 'GET') return errorResponse('method_not_allowed', 405)
      try {
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        const effectiveAt = dependencies.now()
        const entitlement = normalizeEntitlement(
          await dependencies.repository.getEffectiveEntitlement(resolved.account.accountId, effectiveAt),
        )
        const billing = normalizeBilling(
          await dependencies.repository.getBillingSummary(resolved.account.accountId),
        )
        const subscription = billing.state === 'none'
          && entitlement.grantSources.includes('complimentary_owner')
          ? {
              state: 'complimentary' as const,
              plan: null,
              currentPeriodEnd: null,
              courtesyEnd: null,
              cancelAtPeriodEnd: false,
              introductoryEligible: false,
            }
          : billing
        return jsonResponse({
          accountId: resolved.account.accountId,
          email: resolved.account.email,
          displayName: resolved.account.displayName,
          subscription,
        })
      } catch {
        return errorResponse('service_unavailable', 503)
      }
    },

    async entitlementLease(request) {
      if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)
      try {
        const resolved = await resolveAccount(request, dependencies)
        if (resolved instanceof Response) return resolved
        const issuedAt = dependencies.now()
        if (!Number.isSafeInteger(issuedAt)) return errorResponse('service_unavailable', 503)
        const entitlement = normalizeEntitlement(
          await dependencies.repository.getEffectiveEntitlement(resolved.account.accountId, issuedAt),
        )
        if (!entitlement.capabilities.length || !entitlement.grantSources.length) {
          return errorResponse('entitlement_unavailable', 403)
        }
        const expiresAt = Math.min(
          issuedAt + thirtyDays,
          entitlement.earliestExpiry ?? Number.MAX_SAFE_INTEGER,
        )
        if (expiresAt <= issuedAt) return errorResponse('entitlement_unavailable', 403)

        return jsonResponse(await dependencies.signLease({
          version: 1,
          leaseId: dependencies.randomUUID(),
          accountId: resolved.account.accountId,
          capabilities: entitlement.capabilities,
          grantSources: entitlement.grantSources,
          issuedAt,
          expiresAt,
        }))
      } catch {
        return errorResponse('service_unavailable', 503)
      }
    },
  }
}
