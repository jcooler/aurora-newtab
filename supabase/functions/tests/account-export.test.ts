import { describe, expect, it, vi } from 'vitest'
import { createAccountExportHandler } from '../_shared/accountExportHandlers'
import { createAccountExportRepository } from '../_shared/accountExportRepository'
import { withExtensionCors } from '../_shared/http'
import type {
  AccountExportDependencies,
  AccountExportRepository,
  AccountExportServiceSnapshot,
} from '../_shared/accountExportTypes'

const now = Date.UTC(2026, 8, 4, 12, 0, 0)
const accountId = '42000000-0000-4000-8000-000000000001'
const otherAccountId = '42000000-0000-4000-8000-000000000002'
const authUserId = '34000000-0000-4000-8000-000000000001'
const rawKey = new Uint8Array(32).fill(7)

function snapshot(records = 1): AccountExportServiceSnapshot {
  return {
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
      grantedScopes: ['email', 'openid'],
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
      capabilities: ['encrypted_sync'],
      grantSources: ['complimentary_owner'],
      expiresAt: null,
    },
    devices: [{
      deviceId: 'AAECAwQFBgcICQoLDA0ODw',
      friendlyName: 'Desktop',
      state: 'active',
      lastSeenAt: now - 5_000,
      createdAt: now - 8_000,
      updatedAt: now - 5_000,
      revokedAt: null,
    }],
    vault: {
      status: records === 0 ? 'empty' : 'available',
      vaultVersion: records,
      storedBytes: records === 0 ? 0 : records * 160,
      wrappedDataKey: records === 0 ? null : 'A'.repeat(54),
      records: Array.from({ length: records }, (_, index) => ({
        envelopeVersion: 1 as const,
        accountId,
        entityType: 'notes',
        entityId: index === 0 ? 'singleton' : `record-${index}`,
        revision: 1,
        vaultVersion: index + 1,
        tombstone: false,
        nonce: 'A'.repeat(16),
        ciphertext: 'A'.repeat(64),
      })),
    },
  }
}

function repository(value: AccountExportServiceSnapshot | null = snapshot()): AccountExportRepository {
  return {
    findAccountForAuthUser: vi.fn(async () => ({ accountId })),
    consumeRateLimit: vi.fn(async () => true),
    getSnapshot: vi.fn(async () => value),
    recordAudit: vi.fn(async () => undefined),
  }
}

function dependencies(value: AccountExportServiceSnapshot | null = snapshot()): AccountExportDependencies {
  return {
    authenticate: vi.fn(async () => ({ ok: true as const, authUserId, authTime: now - 60_000 })),
    repository: repository(value),
    keyring: {
      keyVersion: 1,
      wrapDataKey: vi.fn(async () => 'unused'),
      unwrapDataKey: vi.fn(async () => rawKey.slice()),
    },
    now: () => now,
    requestFingerprint: vi.fn(async () => 'F'.repeat(43)),
  }
}

function request(body: unknown = { accountId }, method = 'POST'): Request {
  return new Request('http://127.0.0.1:54321/functions/v1/account-export', {
    method,
    headers: {
      authorization: 'Bearer verified.jwt.value',
      'content-type': 'application/json',
      origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

describe('account export Edge boundary', () => {
  it('returns an exact fresh-authenticated service snapshot without requiring entitlement or a device', async () => {
    const deps = dependencies()
    const handler = createAccountExportHandler(deps)

    const response = await handler(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(Object.keys(body).sort()).toEqual([
      'account', 'connectedAccounts', 'dataKey', 'devices', 'entitlement',
      'subscription', 'vault', 'version',
    ])
    expect(body).toMatchObject({
      version: 1,
      account: { accountId },
      vault: { records: [{ accountId, entityType: 'notes' }] },
    })
    expect(body.dataKey).toBe('BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc')
    expect(deps.repository.getSnapshot).toHaveBeenCalledWith(accountId, now)
    expect(deps.repository.recordAudit).toHaveBeenCalledWith({
      accountId, outcome: 'success', recordCount: 1,
      byteCount: expect.any(Number), occurredAt: now,
    })
    expect('getEffectiveCapabilities' in deps.repository).toBe(false)
  })

  it('denies wrong methods and malformed exact request bodies before snapshot access', async () => {
    for (const candidate of [
      request(undefined, 'GET'),
      request({ accountId, extra: true }),
      request({ accountId: 'not-a-uuid' }),
      new Request('http://local/functions/v1/account-export', {
        method: 'POST', body: JSON.stringify({ accountId }),
      }),
    ]) {
      const deps = dependencies()
      const response = await createAccountExportHandler(deps)(candidate)
      expect([400, 405]).toContain(response.status)
      expect(deps.repository.getSnapshot).not.toHaveBeenCalled()
    }
  })

  it('requires a verified bearer identity and interactive auth no more than five minutes old', async () => {
    for (const authentication of [
      { ok: false as const },
      { ok: true as const, authUserId, authTime: null },
      { ok: true as const, authUserId, authTime: now - 300_001 },
      { ok: true as const, authUserId, authTime: now + 60_001 },
    ]) {
      const deps = dependencies()
      deps.authenticate = vi.fn(async () => authentication)
      const response = await createAccountExportHandler(deps)(request())
      expect(response.status).toBe(401)
      expect(deps.repository.getSnapshot).not.toHaveBeenCalled()
    }
  })

  it('maps an authentication boundary outage to one safe error', async () => {
    const deps = dependencies()
    deps.authenticate = vi.fn(async () => { throw new Error('provider-secret') })
    const response = await createAccountExportHandler(deps)(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'service_unavailable' })
  })

  it('rejects a body account that does not match the verified auth user', async () => {
    const deps = dependencies()
    const response = await createAccountExportHandler(deps)(request({ accountId: otherAccountId }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'account_not_found' })
    expect(deps.repository.getSnapshot).not.toHaveBeenCalled()
  })

  it('applies the dual-scope export rate limit before reading the snapshot', async () => {
    const deps = dependencies()
    deps.repository.consumeRateLimit = vi.fn(async () => false)
    const response = await createAccountExportHandler(deps)(request())
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'rate_limited' })
    expect(deps.repository.consumeRateLimit).toHaveBeenCalledWith({
      accountId, action: 'export_account', ipFingerprint: 'F'.repeat(43), effectiveAt: now,
    })
    expect(deps.repository.getSnapshot).not.toHaveBeenCalled()
  })

  it.each([
    ['not-created', {
      ...snapshot(0),
      devices: [],
      vault: { status: 'not_created', vaultVersion: 0, storedBytes: 0, wrappedDataKey: null, records: [] },
    }],
    ['empty', snapshot(0)],
  ])('returns no key for a %s vault', async (_label, value) => {
    const deps = dependencies(value as AccountExportServiceSnapshot)
    const response = await createAccountExportHandler(deps)(request())
    expect(response.status).toBe(200)
    expect((await response.json()).dataKey).toBeNull()
    expect(deps.keyring.unwrapDataKey).not.toHaveBeenCalled()
  })

  it.each([
    ['records without a key', { ...snapshot(), vault: { ...snapshot().vault, wrappedDataKey: null } }],
    ['a key without records', { ...snapshot(0), vault: { ...snapshot(0).vault, wrappedDataKey: 'A'.repeat(54) } }],
    ['a cross-account record', {
      ...snapshot(),
      vault: { ...snapshot().vault, records: [{ ...snapshot().vault.records[0]!, accountId: otherAccountId }] },
    }],
    ['an impossible vault size', { ...snapshot(), vault: { ...snapshot().vault, storedBytes: 2_097_153 } }],
  ])('fails closed for %s', async (_label, value) => {
    const deps = dependencies(value as AccountExportServiceSnapshot)
    const response = await createAccountExportHandler(deps)(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'service_unavailable' })
    expect(deps.repository.recordAudit).toHaveBeenCalledWith({
      accountId, outcome: 'data_unavailable', recordCount: 0, byteCount: 0, occurredAt: now,
    })
  })

  it('fails closed and clears a malformed unwrapped raw key', async () => {
    const exposed = new Uint8Array(31).fill(9)
    const deps = dependencies()
    deps.keyring.unwrapDataKey = vi.fn(async () => exposed)
    const response = await createAccountExportHandler(deps)(request())
    expect(response.status).toBe(503)
    expect(exposed).toEqual(new Uint8Array(31))
  })

  it('enforces the independent four MiB response ceiling', async () => {
    const oversized = snapshot(17)
    oversized.vault.records = oversized.vault.records.map((record) => ({
      ...record, ciphertext: 'A'.repeat(262_144),
    }))
    const deps = dependencies(oversized)
    const response = await createAccountExportHandler(deps)(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'service_unavailable' })
  })

  it('accepts the exact two MiB vault metadata boundary', async () => {
    const value = snapshot()
    value.vault.storedBytes = 2_097_152
    const response = await createAccountExportHandler(dependencies(value))(request())
    expect(response.status).toBe(200)
  })

  it('does not let an audit outage mask either a customer success or safe failure', async () => {
    const success = dependencies()
    success.repository.recordAudit = vi.fn(async () => { throw new Error('audit-secret') })
    expect((await createAccountExportHandler(success)(request())).status).toBe(200)

    const failure = dependencies(null)
    failure.repository.recordAudit = vi.fn(async () => { throw new Error('audit-secret') })
    const response = await createAccountExportHandler(failure)(request())
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('audit-secret')
  })

  it('clears the successful unwrapped key after constructing the response', async () => {
    const exposed = new Uint8Array(32).fill(4)
    const deps = dependencies()
    deps.keyring.unwrapDataKey = vi.fn(async () => exposed)
    const response = await createAccountExportHandler(deps)(request())
    expect(response.status).toBe(200)
    expect(exposed).toEqual(new Uint8Array(32))
  })

  it('lets the shared extension CORS boundary own preflight and response headers', async () => {
    const deps = dependencies()
    const handler = createAccountExportHandler(deps)
    const response = await withExtensionCors(request(), 'POST', handler)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    )

    const preflight = await withExtensionCors(new Request(
      'http://127.0.0.1:54321/functions/v1/account-export',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization, content-type',
        },
      },
    ), 'POST', handler)
    expect(preflight.status).toBe(204)
    expect(deps.authenticate).toHaveBeenCalledTimes(1)
  })
})

describe('account export repository', () => {
  it('normalizes the exact service RPC shape and emits only bounded RPC inputs', async () => {
    const value = snapshot()
    const databaseSnapshot = {
      ...value,
      account: {
        accountId: value.account.accountId,
        email: value.account.email,
        displayName: value.account.displayName,
        accountCreatedAt: new Date(value.account.createdAt).toISOString(),
        identityCreatedAt: new Date(value.account.identityCreatedAt).toISOString(),
        identityUpdatedAt: new Date(value.account.identityUpdatedAt).toISOString(),
      },
      connectedAccounts: value.connectedAccounts.map((entry) => ({
        ...entry,
        createdAt: new Date(entry.createdAt).toISOString(),
        updatedAt: new Date(entry.updatedAt).toISOString(),
      })),
      devices: value.devices.map((entry) => ({
        ...entry,
        lastSeenAt: new Date(entry.lastSeenAt).toISOString(),
        createdAt: new Date(entry.createdAt).toISOString(),
        updatedAt: new Date(entry.updatedAt).toISOString(),
      })),
    }
    const rpc = vi.fn(async (name: string) => {
      if (name === 'tab_two_account_snapshot_for_auth') {
        return { data: [{ account_id: accountId, email: 'owner@example.test', display_name: 'Owner' }], error: null }
      }
      if (name === 'tab_two_consume_sync_rate_limit') return { data: true, error: null }
      if (name === 'tab_two_account_data_export') return { data: databaseSnapshot, error: null }
      if (name === 'tab_two_record_account_export_event') return { data: null, error: null }
      return { data: null, error: { message: 'unexpected' } }
    })
    const repo = createAccountExportRepository({ rpc })

    await expect(repo.findAccountForAuthUser(authUserId)).resolves.toEqual({ accountId })
    await expect(repo.consumeRateLimit({
      accountId, action: 'export_account', ipFingerprint: 'F'.repeat(43), effectiveAt: now,
    })).resolves.toBe(true)
    await expect(repo.getSnapshot(accountId, now)).resolves.toEqual(value)
    await expect(repo.recordAudit({
      accountId, outcome: 'success', recordCount: 1, byteCount: 1024, occurredAt: now,
    })).resolves.toBeUndefined()

    expect(rpc).toHaveBeenNthCalledWith(3, 'tab_two_account_data_export', {
      target_account_id: accountId,
      effective_at: '2026-09-04T12:00:00.000Z',
    })
    expect(rpc).toHaveBeenNthCalledWith(4, 'tab_two_record_account_export_event', {
      target_account_id: accountId,
      outcome_code: 'success',
      record_count: 1,
      byte_count: 1024,
      occurred_at: '2026-09-04T12:00:00.000Z',
    })
  })

  it('rejects extra service fields before they can cross the Edge boundary', async () => {
    const rpc = vi.fn(async () => ({
      data: { ...snapshot(), providerSubject: 'must-not-cross' },
      error: null,
    }))
    const repo = createAccountExportRepository({ rpc })
    await expect(repo.getSnapshot(accountId, now)).rejects.toThrow(
      'account_export_repository_unavailable',
    )
  })
})
