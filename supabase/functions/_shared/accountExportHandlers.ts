import { jsonResponse } from './http.ts'
import { encodeBase64Url } from './syncKeyring.ts'
import { normalizeAccountExportServiceSnapshot } from './accountExportRepository.ts'
import type {
  AccountExportAuditOutcome,
  AccountExportDependencies,
} from './accountExportTypes.ts'

const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const FINGERPRINT = /^[A-Za-z0-9_-]{43}$/u
const FIVE_MINUTES = 5 * 60 * 1_000
const MAX_CLOCK_SKEW = 60 * 1_000
const MAX_BODY_BYTES = 2_048
const MAX_RESPONSE_BYTES = 4 * 1_024 * 1_024

type AccountExportError =
  | 'method_not_allowed'
  | 'authentication_required'
  | 'fresh_authentication_required'
  | 'account_not_found'
  | 'invalid_request'
  | 'rate_limited'
  | 'service_unavailable'

function errorResponse(error: AccountExportError, status: number): Response {
  return jsonResponse({ error }, status)
}

function fresh(authTime: number | null, effectiveAt: number): boolean {
  return authTime !== null
    && Number.isSafeInteger(authTime)
    && authTime >= 0
    && authTime <= effectiveAt + MAX_CLOCK_SKEW
    && effectiveAt - authTime <= FIVE_MINUTES
}

async function exactBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get('content-type') ?? '')) {
    return null
  }
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) return null
  let text: string
  try {
    text = await request.text()
  } catch {
    return null
  }
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  return Object.keys(body).length === 1 && Object.hasOwn(body, 'accountId') ? body : null
}

async function safeAudit(
  dependencies: AccountExportDependencies,
  input: {
    accountId: string
    outcome: AccountExportAuditOutcome
    recordCount: number
    byteCount: number
    occurredAt: number
  },
): Promise<void> {
  try {
    await dependencies.repository.recordAudit(input)
  } catch {
    // Export availability does not depend on observability availability.
  }
}

export function createAccountExportHandler(
  dependencies: AccountExportDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)

    let authentication: Awaited<ReturnType<AccountExportDependencies['authenticate']>>
    try {
      authentication = await dependencies.authenticate(request)
    } catch {
      return errorResponse('service_unavailable', 503)
    }
    if (!authentication.ok) return errorResponse('authentication_required', 401)
    const effectiveAt = dependencies.now()
    if (!Number.isSafeInteger(effectiveAt) || effectiveAt < 0) {
      return errorResponse('service_unavailable', 503)
    }
    if (!fresh(authentication.authTime, effectiveAt)) {
      return errorResponse('fresh_authentication_required', 401)
    }

    const body = await exactBody(request)
    if (!body || typeof body.accountId !== 'string' || !ACCOUNT_UUID.test(body.accountId)) {
      return errorResponse('invalid_request', 400)
    }

    let resolvedAccountId: string | null = null
    let rawKey: Uint8Array | null = null
    try {
      const account = await dependencies.repository.findAccountForAuthUser(authentication.authUserId)
      if (!account) {
        return errorResponse('account_not_found', 403)
      }
      if (Object.keys(account).length !== 1
        || typeof account.accountId !== 'string'
        || !ACCOUNT_UUID.test(account.accountId)) {
        throw new Error('account_export_account_invalid')
      }
      if (account.accountId !== body.accountId) return errorResponse('account_not_found', 403)
      resolvedAccountId = account.accountId

      const ipFingerprint = await dependencies.requestFingerprint(request)
      if (!FINGERPRINT.test(ipFingerprint)) throw new Error('account_export_fingerprint_invalid')
      const allowed = await dependencies.repository.consumeRateLimit({
        accountId: resolvedAccountId,
        action: 'export_account',
        ipFingerprint,
        effectiveAt,
      })
      if (typeof allowed !== 'boolean') throw new Error('account_export_rate_limit_invalid')
      if (!allowed) {
        await safeAudit(dependencies, {
          accountId: resolvedAccountId,
          outcome: 'rate_limited',
          recordCount: 0,
          byteCount: 0,
          occurredAt: effectiveAt,
        })
        return errorResponse('rate_limited', 429)
      }

      const candidate = await dependencies.repository.getSnapshot(resolvedAccountId, effectiveAt)
      if (candidate === null) throw new Error('account_export_snapshot_unavailable')
      const snapshot = normalizeAccountExportServiceSnapshot(candidate)
      const recordCount = snapshot.vault.records.length
      let dataKey: string | null = null
      if (recordCount > 0) {
        if (snapshot.vault.wrappedDataKey === null) throw new Error('account_export_key_unavailable')
        rawKey = await dependencies.keyring.unwrapDataKey(snapshot.vault.wrappedDataKey)
        if (!(rawKey instanceof Uint8Array) || rawKey.byteLength !== 32) {
          throw new Error('account_export_key_unavailable')
        }
        dataKey = encodeBase64Url(rawKey)
      }

      const { wrappedDataKey: _wrappedDataKey, ...publicVault } = snapshot.vault
      const responseBody = {
        version: 1 as const,
        account: snapshot.account,
        connectedAccounts: snapshot.connectedAccounts,
        subscription: snapshot.subscription,
        entitlement: snapshot.entitlement,
        devices: snapshot.devices,
        vault: publicVault,
        dataKey,
      }
      const byteCount = new TextEncoder().encode(JSON.stringify(responseBody)).byteLength
      if (byteCount > MAX_RESPONSE_BYTES) throw new Error('account_export_response_too_large')
      await safeAudit(dependencies, {
        accountId: resolvedAccountId,
        outcome: 'success',
        recordCount,
        byteCount,
        occurredAt: effectiveAt,
      })
      return jsonResponse(responseBody)
    } catch {
      if (resolvedAccountId !== null) {
        await safeAudit(dependencies, {
          accountId: resolvedAccountId,
          outcome: 'data_unavailable',
          recordCount: 0,
          byteCount: 0,
          occurredAt: effectiveAt,
        })
      }
      return errorResponse('service_unavailable', 503)
    } finally {
      rawKey?.fill(0)
    }
  }
}
