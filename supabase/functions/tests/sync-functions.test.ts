import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withExtensionCors } from '../_shared/http'
import { createSyncHandlers } from '../_shared/syncHandlers'
import { createSyncRepository } from '../_shared/syncRepository'
import { authenticateSyncBearerRequest } from '../_shared/syncAuth'
import type { SyncFunctionDependencies, SyncRepository, SyncSummary } from '../_shared/syncTypes'

const now = Date.UTC(2026, 8, 2, 14, 0, 0)
const accountId = '42000000-0000-4000-8000-000000000001'
const authUserId = '34000000-0000-4000-8000-000000000002'
const deviceId = 'AAECAwQFBgcICQoLDA0ODw'
const otherDeviceId = 'AQEBAQEBAQEBAQEBAQEBAQ'
const rawKey = new Uint8Array(32).fill(7)

const summary: SyncSummary = {
  vaultVersion: 4,
  encodedSize: 120,
  currentDeviceId: deviceId,
  devices: [
    {
      deviceId,
      friendlyName: 'Primary browser',
      state: 'active',
      acknowledgedVaultVersion: 4,
      lastSeenAt: now,
    },
    {
      deviceId: otherDeviceId,
      friendlyName: 'Other browser',
      state: 'inactive',
      acknowledgedVaultVersion: 3,
      lastSeenAt: now - 1_000,
    },
  ],
}

function request(path: string, body: unknown, method = 'POST'): Request {
  return new Request(`http://127.0.0.1:54321/functions/v1/${path}`, {
    method,
    headers: {
      authorization: 'Bearer verified.jwt.value',
      'content-type': 'application/json',
      origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json()
}

function repository(): SyncRepository {
  return {
    findAccountForAuthUser: vi.fn(async () => ({ accountId })),
    getEffectiveCapabilities: vi.fn(async () => ['encrypted_sync']),
    registerDevice: vi.fn(async () => summary),
    getAccountKey: vi.fn(async () => ({ keyVersion: 1 as const, wrappedDataKey: 'wrapped-existing' })),
    storeAccountKey: vi.fn(async () => true),
    getSummary: vi.fn(async () => summary),
    deactivateDevice: vi.fn(async () => true),
    renameDevice: vi.fn(async () => true),
    revokeDevice: vi.fn(async () => true),
    consumeRateLimit: vi.fn(async () => true),
    pullRecords: vi.fn(async () => ({
      records: [], nextCursor: null, vaultVersion: 4,
    })),
    acknowledgePull: vi.fn(async () => true),
    applyMutations: vi.fn(async () => ([{ status: 'accepted', entityType: 'notes', entityId: 'singleton', revision: 1, vaultVersion: 5 }])),
    deleteVault: vi.fn(async () => true),
    findDeletionForAuthUser: vi.fn(async () => null),
    beginAccountDeletion: vi.fn(async () => ({
      operationId: '62000000-0000-4000-8000-000000000001', accountId, authUserId,
      state: 'pending_stripe', subscriptionId: 'sub_test_owned',
    })),
    markDeletionStripeCanceled: vi.fn(async (_operationId) => ({
      operationId: '62000000-0000-4000-8000-000000000001', accountId, authUserId,
      state: 'stripe_canceled', subscriptionId: 'sub_test_owned',
    })),
    deleteAccountData: vi.fn(async (_operationId) => ({
      operationId: '62000000-0000-4000-8000-000000000001', accountId, authUserId,
      state: 'data_deleted', subscriptionId: 'sub_test_owned',
    })),
    completeAccountDeletion: vi.fn(async () => true),
  }
}

function dependencies(): SyncFunctionDependencies {
  return {
    authenticate: vi.fn(async () => ({ ok: true as const, authUserId, authTime: now - 60_000 })),
    repository: repository(),
    keyring: {
      keyVersion: 1,
      wrapDataKey: vi.fn(async () => 'wrapped-generated'),
      unwrapDataKey: vi.fn(async () => new Uint8Array(rawKey)),
    },
    now: () => now,
    randomBytes: vi.fn((length) => new Uint8Array(length).fill(9)),
    requestFingerprint: vi.fn(async () => 'A'.repeat(43)),
    cancelSandboxSubscription: vi.fn(async () => ({ id: 'sub_test_owned', livemode: false, status: 'canceled' as const })),
    deleteAuthUser: vi.fn(async () => undefined),
  }
}

describe('encrypted sync Edge handlers', () => {
  let deps: SyncFunctionDependencies

  beforeEach(() => {
    deps = dependencies()
  })

  it.each([
    ['bootstrap', 'sync-bootstrap', 'bootstrap', {}],
    ['deactivateDevice', 'sync-deactivate-device', 'deactivate', {}],
    ['renameDevice', 'sync-rename-device', 'rename', {}],
    ['revokeDevice', 'sync-revoke-device', 'revoke', {}],
    ['pull', 'sync-pull', 'pull', {}],
    ['push', 'sync-push', 'push', {}],
    ['deleteVault', 'sync-delete-vault', 'delete vault', {}],
    ['deleteAccount', 'account-delete', 'delete account', {}],
  ] as const)('rejects a non-POST %s before authentication', async (handler, path, _label, body) => {
    const response = await createSyncHandlers(deps)[handler](request(path, body, 'GET'))
    expect(response.status).toBe(405)
    expect(await json(response)).toEqual({ error: 'method_not_allowed' })
    expect(deps.authenticate).not.toHaveBeenCalled()
  })

  it('returns a bounded authentication failure before reading account state', async () => {
    deps.authenticate = vi.fn(async () => ({ ok: false as const }))
    const response = await createSyncHandlers(deps).bootstrap(request('sync-bootstrap', {
      deviceId,
      friendlyName: 'Primary browser',
    }))
    expect(response.status).toBe(401)
    expect(await json(response)).toEqual({ error: 'authentication_required' })
    expect(deps.repository.findAccountForAuthUser).not.toHaveBeenCalled()
  })

  it('requires encrypted-sync entitlement before registering or releasing a key', async () => {
    deps.repository.getEffectiveCapabilities = vi.fn(async () => ['metrics_history'])
    const response = await createSyncHandlers(deps).bootstrap(request('sync-bootstrap', {
      deviceId,
      friendlyName: 'Primary browser',
    }))
    expect(response.status).toBe(403)
    expect(await json(response)).toEqual({ error: 'entitlement_required' })
    expect(deps.repository.registerDevice).not.toHaveBeenCalled()
    expect(deps.keyring.unwrapDataKey).not.toHaveBeenCalled()
  })

  it('registers an active device and releases an existing DEK only in the successful no-store response', async () => {
    const response = await createSyncHandlers(deps).bootstrap(request('sync-bootstrap', {
      deviceId,
      friendlyName: 'Primary browser',
    }))
    const body = await json(response)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(deps.repository.registerDevice).toHaveBeenCalledWith({ accountId, deviceId, friendlyName: 'Primary browser', effectiveAt: now })
    expect(deps.keyring.unwrapDataKey).toHaveBeenCalledWith('wrapped-existing')
    expect(body).toEqual({
      keyVersion: 1,
      keyMaterial: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc',
      summary,
    })
    expect(JSON.stringify(body)).not.toContain('wrapped-existing')
  })

  it('creates, wraps, and stores exactly one 32-byte DEK when the account has no key', async () => {
    deps.repository.getAccountKey = vi.fn(async () => null)
    let wrappedInput: Uint8Array | null = null
    deps.keyring.wrapDataKey = vi.fn(async (value) => {
      wrappedInput = new Uint8Array(value)
      return 'wrapped-generated'
    })
    const response = await createSyncHandlers(deps).bootstrap(request('sync-bootstrap', {
      deviceId,
      friendlyName: 'Primary browser',
    }))

    expect(response.status).toBe(200)
    expect(deps.randomBytes).toHaveBeenCalledWith(32)
    expect(wrappedInput).toEqual(new Uint8Array(32).fill(9))
    expect(deps.keyring.wrapDataKey).toHaveBeenCalledOnce()
    expect(vi.mocked(deps.keyring.wrapDataKey).mock.calls[0]?.[0]).toEqual(new Uint8Array(32))
    expect(deps.repository.storeAccountKey).toHaveBeenCalledWith({
      accountId,
      keyVersion: 1,
      wrappedDataKey: 'wrapped-generated',
      effectiveAt: now,
    })
    expect(deps.keyring.unwrapDataKey).not.toHaveBeenCalled()
  })

  it('discards a losing generated key and releases the winning stored key after a creation race', async () => {
    deps.repository.getAccountKey = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ keyVersion: 1 as const, wrappedDataKey: 'wrapped-winner' })
    deps.repository.storeAccountKey = vi.fn(async () => false)

    const response = await createSyncHandlers(deps).bootstrap(request('sync-bootstrap', {
      deviceId,
      friendlyName: 'Primary browser',
    }))

    expect(response.status).toBe(200)
    expect(deps.keyring.unwrapDataKey).toHaveBeenCalledWith('wrapped-winner')
    expect(await json(response)).toEqual(expect.objectContaining({
      keyMaterial: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc',
    }))
  })

  it('maps the transactional fifth-device race to one stable device-limit response', async () => {
    deps.repository.registerDevice = vi.fn(async () => { throw new Error('sync_device_limit') })
    const response = await createSyncHandlers(deps).bootstrap(request('sync-bootstrap', {
      deviceId,
      friendlyName: 'Primary browser',
    }))
    expect(response.status).toBe(409)
    expect(await json(response)).toEqual({ error: 'device_limit' })
    expect(deps.repository.getAccountKey).not.toHaveBeenCalled()
  })

  it.each([
    [{ deviceId: 'short', friendlyName: 'Browser' }, 'invalid device id'],
    [{ deviceId, friendlyName: '' }, 'empty name'],
    [{ deviceId, friendlyName: 'x'.repeat(49) }, 'long name'],
    [{ deviceId, friendlyName: 'Browser', extra: 'plaintext' }, 'extra field'],
  ])('rejects a bounded malformed bootstrap body: %s', async (body) => {
    const response = await createSyncHandlers(deps).bootstrap(request('sync-bootstrap', body))
    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: 'invalid_request' })
    expect(deps.repository.registerDevice).not.toHaveBeenCalled()
  })

  it('deactivates and renames only an exact account-owned device', async () => {
    const handlers = createSyncHandlers(deps)
    const deactivated = await handlers.deactivateDevice(request('sync-deactivate-device', { deviceId }))
    const renamed = await handlers.renameDevice(request('sync-rename-device', {
      deviceId,
      friendlyName: 'Work laptop',
    }))

    expect(deactivated.status).toBe(200)
    expect(renamed.status).toBe(200)
    expect(deps.repository.deactivateDevice).toHaveBeenCalledWith({ accountId, deviceId, effectiveAt: now })
    expect(deps.repository.renameDevice).toHaveBeenCalledWith({ accountId, deviceId, friendlyName: 'Work laptop', effectiveAt: now })
    expect(await json(renamed)).toEqual({ status: 'completed', summary })
  })

  it('requires auth_time within five minutes before revoking another device', async () => {
    deps.authenticate = vi.fn(async () => ({ ok: true as const, authUserId, authTime: now - 300_001 }))
    const response = await createSyncHandlers(deps).revokeDevice(request('sync-revoke-device', {
      currentDeviceId: deviceId,
      targetDeviceId: otherDeviceId,
    }))
    expect(response.status).toBe(401)
    expect(await json(response)).toEqual({ error: 'fresh_authentication_required' })
    expect(deps.repository.revokeDevice).not.toHaveBeenCalled()
  })

  it('revokes one exact non-current device after fresh authentication', async () => {
    const response = await createSyncHandlers(deps).revokeDevice(request('sync-revoke-device', {
      currentDeviceId: deviceId,
      targetDeviceId: otherDeviceId,
    }))
    expect(response.status).toBe(200)
    expect(deps.repository.revokeDevice).toHaveBeenCalledWith({
      accountId,
      currentDeviceId: deviceId,
      targetDeviceId: otherDeviceId,
      effectiveAt: now,
    })
  })

  it('returns the same non-enumerating failure for an unknown or foreign device', async () => {
    deps.repository.deactivateDevice = vi.fn(async () => false)
    deps.repository.renameDevice = vi.fn(async () => false)
    const handlers = createSyncHandlers(deps)
    const first = await handlers.deactivateDevice(request('sync-deactivate-device', { deviceId }))
    const second = await handlers.renameDevice(request('sync-rename-device', { deviceId, friendlyName: 'Browser' }))
    expect(first.status).toBe(404)
    expect(second.status).toBe(404)
    expect(await json(first)).toEqual({ error: 'device_not_found' })
    expect(await json(second)).toEqual({ error: 'device_not_found' })
  })

  it('returns fixed secret-safe failures and never reflects repository or key material', async () => {
    deps.repository.registerDevice = vi.fn(async () => { throw new Error('failed with wrapped-existing and raw-private-key') })
    const response = await createSyncHandlers(deps).bootstrap(request('sync-bootstrap', { deviceId, friendlyName: 'Browser' }))
    const text = await response.text()
    expect(response.status).toBe(503)
    expect(JSON.parse(text)).toEqual({ error: 'service_unavailable' })
    expect(text).not.toContain('wrapped-existing')
    expect(text).not.toContain('raw-private-key')
  })

  it('allows only an exact extension origin and POST preflight headers', async () => {
    const handlers = createSyncHandlers(deps)
    const allowed = new Request('http://127.0.0.1/functions/v1/sync-bootstrap', {
      method: 'OPTIONS',
      headers: {
        origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      },
    })
    const rejected = new Request('http://127.0.0.1/functions/v1/sync-bootstrap', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://attacker.example',
        'access-control-request-method': 'POST',
      },
    })

    expect((await withExtensionCors(allowed, 'POST', handlers.bootstrap)).status).toBe(204)
    expect((await withExtensionCors(rejected, 'POST', handlers.bootstrap)).status).toBe(403)
  })

  it('returns a bounded encrypted pull and acknowledges only a client-confirmed prior version', async () => {
    const response = await createSyncHandlers(deps).pull(request('sync-pull', {
      deviceId,
      afterVaultVersion: 3,
      cursor: 3,
      limit: 100,
      acknowledgeVaultVersion: 3,
    }))
    expect(response.status).toBe(200)
    expect(deps.repository.acknowledgePull).toHaveBeenCalledWith({ accountId, deviceId, vaultVersion: 3, effectiveAt: now })
    expect(deps.repository.pullRecords).toHaveBeenCalledWith({ accountId, deviceId, afterVaultVersion: 3, cursor: 3, limit: 100 })
    expect(await json(response)).toEqual({ records: [], nextCursor: null, vaultVersion: 4 })
  })

  it('rejects malformed or oversized pull output before any ciphertext leaves the service', async () => {
    deps.repository.pullRecords = vi.fn(async () => ({
      records: [{
        entityType: 'notes', entityId: 'singleton', revision: 1, vaultVersion: 4,
        tombstone: false, nonce: 'A'.repeat(16), ciphertext: 'A'.repeat(262_120),
        storedSize: 262_200, extra: 'not-reviewed',
      }] as never,
      nextCursor: null,
      vaultVersion: 4,
    }))
    const response = await createSyncHandlers(deps).pull(request('sync-pull', {
      deviceId,
      afterVaultVersion: 3,
      cursor: 3,
      limit: 100,
      acknowledgeVaultVersion: null,
    }))
    expect(response.status).toBe(503)
    expect(await json(response)).toEqual({ error: 'service_unavailable' })
  })

  it('returns one stable retryable response when either account or IP sync rate limit is exhausted', async () => {
    deps.repository.consumeRateLimit = vi.fn(async () => false)
    const response = await createSyncHandlers(deps).pull(request('sync-pull', {
      deviceId,
      afterVaultVersion: 3,
      cursor: 3,
      limit: 100,
      acknowledgeVaultVersion: null,
    }))
    expect(response.status).toBe(429)
    expect(await json(response)).toEqual({ error: 'rate_limited' })
    expect(deps.repository.consumeRateLimit).toHaveBeenCalledWith({
      accountId,
      action: 'pull',
      ipFingerprint: 'A'.repeat(43),
      effectiveAt: now,
    })
    expect(deps.repository.pullRecords).not.toHaveBeenCalled()
  })

  it('accepts only exact bounded ciphertext envelopes for push', async () => {
    const mutation = {
      idempotencyId: '53000000-0000-4000-8000-000000000001',
      envelopeVersion: 1,
      entityType: 'notes',
      entityId: 'singleton',
      expectedRevision: 0,
      revision: 1,
      tombstone: false,
      nonce: 'A'.repeat(16),
      ciphertext: 'A'.repeat(64),
    }
    const response = await createSyncHandlers(deps).push(request('sync-push', { deviceId, mutations: [mutation] }))
    expect(response.status).toBe(200)
    expect(deps.repository.applyMutations).toHaveBeenCalledWith({
      accountId,
      deviceId,
      mutations: [{ ...mutation, requestDigest: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u) }],
      effectiveAt: now,
    })
    expect(await json(response)).toEqual({ outcomes: [expect.objectContaining({ status: 'accepted' })] })

    const rejected = await createSyncHandlers(deps).push(request('sync-push', {
      deviceId,
      mutations: [{ ...mutation, plaintext: 'must not pass' }],
    }))
    expect(rejected.status).toBe(400)
  })

  it('rejects malformed push outcomes before repository data can be reflected', async () => {
    deps.repository.applyMutations = vi.fn(async () => ([{
      status: 'accepted', entityType: 'notes', entityId: 'singleton', revision: 1,
      vaultVersion: 5, internalSecret: 'must not leave',
    }]))
    const response = await createSyncHandlers(deps).push(request('sync-push', {
      deviceId,
      mutations: [{
        idempotencyId: '53000000-0000-4000-8000-000000000001',
        envelopeVersion: 1,
        entityType: 'notes',
        entityId: 'singleton',
        expectedRevision: 0,
        revision: 1,
        tombstone: false,
        nonce: 'A'.repeat(16),
        ciphertext: 'A'.repeat(64),
      }],
    }))
    expect(response.status).toBe(503)
    expect(await json(response)).toEqual({ error: 'service_unavailable' })
  })

  it('requires fresh authentication and typed confirmation before deleting only the encrypted vault', async () => {
    const response = await createSyncHandlers(deps).deleteVault(request('sync-delete-vault', {
      accountId,
      deviceId,
      confirmation: 'DELETE',
    }))
    expect(response.status).toBe(200)
    expect(deps.repository.deleteVault).toHaveBeenCalledWith({ accountId, deviceId, effectiveAt: now })
    expect(await json(response)).toEqual({ status: 'completed' })
  })

  it('executes account deletion in resumable sandbox-only order without accepting a client subscription id', async () => {
    const response = await createSyncHandlers(deps).deleteAccount(request('account-delete', {
      accountId,
      confirmation: 'DELETE',
    }))
    expect(response.status).toBe(200)
    expect(deps.repository.beginAccountDeletion).toHaveBeenCalledWith({ accountId, authUserId, effectiveAt: now })
    expect(deps.cancelSandboxSubscription).toHaveBeenCalledWith('sub_test_owned')
    expect(deps.repository.markDeletionStripeCanceled).toHaveBeenCalled()
    expect(deps.repository.deleteAccountData).toHaveBeenCalled()
    expect(deps.repository.completeAccountDeletion).toHaveBeenCalled()
    expect(deps.repository.completeAccountDeletion).toHaveBeenCalledBefore(vi.mocked(deps.deleteAuthUser))
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(authUserId)
    expect(await json(response)).toEqual({ status: 'completed' })
  })

  it('keeps account deletion retryable without deleting data when Stripe cancellation fails', async () => {
    deps.cancelSandboxSubscription = vi.fn(async () => { throw new Error('stripe unavailable') })
    const response = await createSyncHandlers(deps).deleteAccount(request('account-delete', {
      accountId,
      confirmation: 'DELETE',
    }))
    expect(response.status).toBe(503)
    expect(await json(response)).toEqual({ error: 'retryable' })
    expect(deps.repository.deleteAccountData).not.toHaveBeenCalled()
    expect(deps.deleteAuthUser).not.toHaveBeenCalled()
  })

  it.each([
    ['stripe_canceled', false, true, true, true],
    ['data_deleted', false, false, true, true],
    ['completed', false, false, true, true],
  ] as const)('resumes account deletion safely from %s', async (
    state,
    cancelExpected,
    dataDeleteExpected,
    completionExpected,
    authDeleteExpected,
  ) => {
    deps.repository.findDeletionForAuthUser = vi.fn(async () => ({
      operationId: '62000000-0000-4000-8000-000000000001',
      accountId,
      authUserId,
      state,
      subscriptionId: 'sub_test_owned',
    }))
    const response = await createSyncHandlers(deps).deleteAccount(request('account-delete', {
      accountId,
      confirmation: 'DELETE',
    }))
    expect(response.status).toBe(200)
    expect(deps.cancelSandboxSubscription).toHaveBeenCalledTimes(cancelExpected ? 1 : 0)
    expect(deps.repository.deleteAccountData).toHaveBeenCalledTimes(dataDeleteExpected ? 1 : 0)
    expect(deps.repository.completeAccountDeletion).toHaveBeenCalledTimes(completionExpected ? 1 : 0)
    expect(deps.deleteAuthUser).toHaveBeenCalledTimes(authDeleteExpected ? 1 : 0)
  })

  it('persists the completion tombstone before Auth deletion so a failed final external step is retryable', async () => {
    deps.repository.findDeletionForAuthUser = vi.fn(async () => ({
      operationId: '62000000-0000-4000-8000-000000000001',
      accountId,
      authUserId,
      state: 'data_deleted',
      subscriptionId: 'sub_test_owned',
    }))
    deps.deleteAuthUser = vi.fn(async () => { throw new Error('auth unavailable') })
    const response = await createSyncHandlers(deps).deleteAccount(request('account-delete', {
      accountId,
      confirmation: 'DELETE',
    }))
    expect(response.status).toBe(503)
    expect(await json(response)).toEqual({ error: 'retryable' })
    expect(deps.repository.completeAccountDeletion).toHaveBeenCalledBefore(vi.mocked(deps.deleteAuthUser))
  })

  it('rejects a live-mode cancellation result without deleting account data', async () => {
    deps.cancelSandboxSubscription = vi.fn(async () => ({
      id: 'sub_test_owned', livemode: true, status: 'canceled',
    } as never))
    const response = await createSyncHandlers(deps).deleteAccount(request('account-delete', {
      accountId,
      confirmation: 'DELETE',
    }))
    expect(response.status).toBe(503)
    expect(await json(response)).toEqual({ error: 'retryable' })
    expect(deps.repository.deleteAccountData).not.toHaveBeenCalled()
  })
})

describe('sync RPC repository', () => {
  it('maps service RPC rows into the bounded handler model', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'tab_two_account_snapshot_for_auth') {
        return { data: [{ account_id: accountId }], error: null }
      }
      if (name === 'tab_two_effective_entitlement_for_account') {
        return { data: [{ capabilities: ['encrypted_sync'] }], error: null }
      }
      if (name === 'tab_two_sync_account_key') {
        return { data: [{ key_version: 1, wrapped_dek: 'wrapped-existing' }], error: null }
      }
      if (name === 'tab_two_sync_summary') {
        return {
          data: {
            vaultVersion: 4,
            encodedSize: 120,
            currentDeviceId: deviceId,
            devices: [{
              deviceId,
              friendlyName: 'Primary browser',
              state: 'active',
              acknowledgedVaultVersion: 4,
              lastSeenAt: now,
            }],
          },
          error: null,
        }
      }
      return { data: true, error: null }
    })
    const repo = createSyncRepository({ rpc })

    await expect(repo.findAccountForAuthUser(authUserId)).resolves.toEqual({ accountId })
    await expect(repo.getEffectiveCapabilities(accountId, now)).resolves.toEqual(['encrypted_sync'])
    await expect(repo.getAccountKey(accountId, deviceId)).resolves.toEqual({
      keyVersion: 1,
      wrappedDataKey: 'wrapped-existing',
    })
    await expect(repo.registerDevice({ accountId, deviceId, friendlyName: 'Primary browser', effectiveAt: now }))
      .resolves.toEqual(expect.objectContaining({ currentDeviceId: deviceId }))
    expect(rpc).toHaveBeenCalledWith('tab_two_sync_register_device', {
      target_account_id: accountId,
      target_device_id: deviceId,
      target_friendly_name: 'Primary browser',
      effective_at: new Date(now).toISOString(),
    })
  })

  it('normalizes database failures without reflecting request material', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'database failed with wrapped-private-key' },
    }))
    const repo = createSyncRepository({ rpc })
    await expect(repo.getSummary(accountId, deviceId)).rejects.toThrow('sync_repository_unavailable')
    try {
      await repo.getSummary(accountId, deviceId)
    } catch (error) {
      expect(String(error)).not.toContain('wrapped-private-key')
    }
  })
})

describe('sync JWT freshness authentication', () => {
  it('uses auth_time only after Supabase verifies the bearer token', async () => {
    const payload = btoa(JSON.stringify({ auth_time: Math.floor((now - 60_000) / 1_000) }))
      .replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
    const token = `header.${payload}.signature`
    const auth = {
      getUser: vi.fn(async () => ({
        data: { user: { id: authUserId, app_metadata: { provider: 'google', providers: ['google'] } } },
        error: null,
      })),
    }

    await expect(authenticateSyncBearerRequest(new Request('https://example.test', {
      headers: { authorization: `Bearer ${token}` },
    }), auth)).resolves.toEqual({ ok: true, authUserId, authTime: now - 60_000 })
    expect(auth.getUser).toHaveBeenCalledWith(token)
  })

  it('never trusts auth_time when token verification fails', async () => {
    const auth = { getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('invalid') })) }
    await expect(authenticateSyncBearerRequest(new Request('https://example.test', {
      headers: { authorization: 'Bearer header.eyJhdXRoX3RpbWUiOjE3ODgyNjAwMDB9.signature' },
    }), auth)).resolves.toEqual({ ok: false })
  })
})
