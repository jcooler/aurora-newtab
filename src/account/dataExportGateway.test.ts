import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAccountDataExportGateway,
  type AccountDataExportGatewayDependencies,
} from './dataExportGateway'
import { encryptSyncRecord, importDataKey } from '../sync/crypto'

const accountId = '42000000-0000-4000-8000-000000000001'
const rawKey = new Uint8Array(32).fill(7)
const now = Date.UTC(2026, 8, 4, 12, 0, 0)

function base64url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

async function serviceResponse() {
  const key = await importDataKey(rawKey)
  const live = await encryptSyncRecord(key, {
    envelopeVersion: 1,
    accountId,
    entityType: 'notes',
    entityId: 'singleton',
    revision: 2,
    tombstone: false,
  }, {
    schemaVersion: 1,
    entityType: 'notes',
    entityId: 'singleton',
    value: { text: 'Portable note', updatedAt: now - 1_000 },
  })
  const tombstone = await encryptSyncRecord(key, {
    envelopeVersion: 1,
    accountId,
    entityType: 'quick_link',
    entityId: 'retired-link',
    revision: 3,
    tombstone: true,
  }, null)
  return {
    version: 1,
    account: {
      accountId,
      email: 'owner@example.test',
      displayName: 'Owner',
      createdAt: now - 10_000,
      identityCreatedAt: now - 9_000,
      identityUpdatedAt: now - 8_000,
    },
    connectedAccounts: [{
      connectionId: '51000000-0000-4000-8000-000000000001',
      provider: 'google_calendar',
      accountKind: null,
      email: 'calendar@example.test',
      displayName: 'Calendar',
      status: 'active',
      grantedScopes: ['openid', 'email'],
      createdAt: now - 7_000,
      updatedAt: now - 6_000,
    }],
    subscription: {
      state: 'complimentary',
      plan: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      courtesyEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: null,
      updatedAt: null,
    },
    entitlement: {
      capabilities: ['encrypted_sync', 'multi_account'],
      grantSources: ['complimentary_owner'],
      expiresAt: null,
    },
    devices: [{
      deviceId: 'AAECAwQFBgcICQoLDA0ODw',
      friendlyName: 'Desktop',
      state: 'active',
      lastSeenAt: now - 1_000,
      createdAt: now - 5_000,
      updatedAt: now - 1_000,
      revokedAt: null,
    }],
    vault: {
      status: 'available',
      vaultVersion: 3,
      storedBytes: 512,
      records: [
        { ...live, vaultVersion: 2 },
        { ...tombstone, vaultVersion: 3 },
      ],
    },
    dataKey: base64url(rawKey),
  }
}

function response(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

async function dependencies(value?: unknown): Promise<AccountDataExportGatewayDependencies> {
  const responseValue = value ?? await serviceResponse()
  return {
    enabled: true,
    origin: 'https://example.supabase.co',
    allowedOrigins: ['https://example.supabase.co'] as const,
    getAccessToken: vi.fn(async () => 'fresh-access-token'),
    invalidateAuthentication: vi.fn(async () => undefined),
    fetch: vi.fn(async () => response(responseValue)) as typeof fetch,
    timeoutMs: 100,
    crypto: globalThis.crypto,
  }
}

describe('account data export gateway', () => {
  beforeEach(() => vi.useRealTimers())

  it('posts one exact account-bound request and returns an immutable readable export source', async () => {
    const deps = await dependencies()
    const gateway = createAccountDataExportGateway(deps)
    const result = await gateway.prepare({ accountId })

    expect(result).toMatchObject({
      ok: true,
      value: {
        account: { accountId },
        syncedData: {
          status: 'available',
          records: [
            { entityType: 'notes', entityId: 'singleton', deleted: false,
              value: { text: 'Portable note', updatedAt: now - 1_000 } },
            { entityType: 'quick_link', entityId: 'retired-link', deleted: true },
          ],
        },
      },
    })
    expect(deps.fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/account-export',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer fresh-access-token',
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ accountId }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(result.ok && Object.isFrozen(result.value)).toBe(true)
    expect(result.ok && Object.isFrozen(result.value.syncedData.records)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(base64url(rawKey))
    expect(JSON.stringify(result)).not.toContain('ciphertext')
  })

  it('imports the decoded data key as non-extractable AES-256-GCM material', async () => {
    const importKey = vi.spyOn(globalThis.crypto.subtle, 'importKey')
    const gateway = createAccountDataExportGateway(await dependencies())
    const result = await gateway.prepare({ accountId })
    expect(result.ok).toBe(true)
    expect(importKey).toHaveBeenCalledWith(
      'raw', expect.any(ArrayBuffer), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    )
    importKey.mockRestore()
  })

  it('returns tombstones without a value and validates every decrypted entity schema', async () => {
    const value = await serviceResponse()
    const key = await importDataKey(rawKey)
    const invalid = await encryptSyncRecord(key, {
      envelopeVersion: 1, accountId, entityType: 'notes', entityId: 'singleton', revision: 4, tombstone: false,
    }, {
      schemaVersion: 1, entityType: 'notes', entityId: 'singleton', value: { providerToken: 'secret' },
    })
    value.vault.records = [{ ...invalid, vaultVersion: 4 }]
    value.vault.vaultVersion = 4
    const result = await createAccountDataExportGateway(await dependencies(value)).prepare({ accountId })
    expect(result).toEqual({ ok: false, kind: 'data_unavailable' })
  })

  it('rejects the complete export when any AES-GCM record authentication fails', async () => {
    const value = await serviceResponse()
    const ciphertext = value.vault.records[1]!.ciphertext
    value.vault.records[1]!.ciphertext = `${ciphertext.slice(0, -1)}${ciphertext.endsWith('A') ? 'B' : 'A'}`
    const result = await createAccountDataExportGateway(await dependencies(value)).prepare({ accountId })
    expect(result).toEqual({ ok: false, kind: 'data_unavailable' })
  })

  it.each([
    ['extra top-level key', async () => ({ ...await serviceResponse(), providerSubject: 'secret' })],
    ['wrong account', async () => ({ ...await serviceResponse(), account: { ...(await serviceResponse()).account, accountId: '42000000-0000-4000-8000-000000000002' } })],
    ['unsorted records', async () => {
      const value = await serviceResponse()
      value.vault.records.reverse()
      return value
    }],
    ['key without records', async () => {
      const value = await serviceResponse()
      value.vault = { status: 'empty', vaultVersion: 0, storedBytes: 0, records: [] }
      return value
    }],
  ])('fails closed for %s', async (_label, build) => {
    const result = await createAccountDataExportGateway(await dependencies(await build())).prepare({ accountId })
    expect(result).toEqual({ ok: false, kind: 'data_unavailable' })
  })

  it('returns account metadata without importing a key when no vault exists', async () => {
    const value = await serviceResponse()
    value.vault = { status: 'not_created', vaultVersion: 0, storedBytes: 0, records: [] }
    ;(value as { dataKey: string | null }).dataKey = null
    const importKey = vi.spyOn(globalThis.crypto.subtle, 'importKey')
    const result = await createAccountDataExportGateway(await dependencies(value)).prepare({ accountId })
    expect(result).toMatchObject({ ok: true, value: { syncedData: { status: 'not_created', records: [] } } })
    expect(importKey).not.toHaveBeenCalled()
    importKey.mockRestore()
  })

  it.each([
    [401, { error: 'authentication_required' }, 'authentication_required', true],
    [401, { error: 'fresh_authentication_required' }, 'verification_required', false],
    [403, { error: 'account_not_found' }, 'authentication_required', true],
    [429, { error: 'rate_limited' }, 'rate_limited', false],
    [503, { error: 'service_unavailable' }, 'data_unavailable', false],
  ] as const)('maps service status %s without leaking error details', async (status, body, kind, invalidates) => {
    const deps = await dependencies()
    deps.fetch = vi.fn(async () => response(body, status)) as typeof fetch
    const result = await createAccountDataExportGateway(deps).prepare({ accountId })
    expect(result).toEqual({ ok: false, kind })
    expect(deps.invalidateAuthentication).toHaveBeenCalledTimes(invalidates ? 1 : 0)
  })

  it('rejects an oversized response before JSON parsing', async () => {
    const deps = await dependencies()
    deps.fetch = vi.fn(async () => new Response('{', {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'content-length': String(4 * 1_024 * 1_024 + 1),
      },
    })) as typeof fetch
    const result = await createAccountDataExportGateway(deps).prepare({ accountId })
    expect(result).toEqual({ ok: false, kind: 'data_unavailable' })
  })

  it('bounds timeout, abort, disabled, and absent-token paths without making unsafe requests', async () => {
    vi.useFakeTimers()
    const deps = await dependencies()
    deps.fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as typeof fetch
    const pending = createAccountDataExportGateway(deps).prepare({ accountId })
    await vi.advanceTimersByTimeAsync(101)
    await expect(pending).resolves.toEqual({ ok: false, kind: 'offline' })

    const disabled = await dependencies()
    disabled.enabled = false
    await expect(createAccountDataExportGateway(disabled).prepare({ accountId }))
      .resolves.toEqual({ ok: false, kind: 'data_unavailable' })
    expect(disabled.fetch).not.toHaveBeenCalled()

    const signedOut = await dependencies()
    signedOut.getAccessToken = vi.fn(async () => null)
    await expect(createAccountDataExportGateway(signedOut).prepare({ accountId }))
      .resolves.toEqual({ ok: false, kind: 'authentication_required' })
    expect(signedOut.fetch).not.toHaveBeenCalled()
  })
})
