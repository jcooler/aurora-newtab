import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withExtensionCors } from '../_shared/http'
import { createSyncHandlers } from '../_shared/syncHandlers'
import { createSyncRepository } from '../_shared/syncRepository'
import { authenticateSyncBearerRequest } from '../_shared/syncAuth'
import type { SyncFunctionDependencies, SyncRepository, SyncSummary } from '../_shared/syncTypes'

const now = Date.UTC(2026, 8, 2, 14, 0, 0)
const accountId = '42000000-0000-4000-8000-000000000001'
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
  }
}

function dependencies(): SyncFunctionDependencies {
  return {
    authenticate: vi.fn(async () => ({ ok: true as const, authUserId: 'auth-user-a', authTime: now - 60_000 })),
    repository: repository(),
    keyring: {
      keyVersion: 1,
      wrapDataKey: vi.fn(async () => 'wrapped-generated'),
      unwrapDataKey: vi.fn(async () => new Uint8Array(rawKey)),
    },
    now: () => now,
    randomBytes: vi.fn((length) => new Uint8Array(length).fill(9)),
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
    deps.authenticate = vi.fn(async () => ({ ok: true as const, authUserId: 'auth-user-a', authTime: now - 300_001 }))
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

    await expect(repo.findAccountForAuthUser('auth-user-a')).resolves.toEqual({ accountId })
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
        data: { user: { id: 'auth-user-a', app_metadata: { provider: 'google', providers: ['google'] } } },
        error: null,
      })),
    }

    await expect(authenticateSyncBearerRequest(new Request('https://example.test', {
      headers: { authorization: `Bearer ${token}` },
    }), auth)).resolves.toEqual({ ok: true, authUserId: 'auth-user-a', authTime: now - 60_000 })
    expect(auth.getUser).toHaveBeenCalledWith(token)
  })

  it('never trusts auth_time when token verification fails', async () => {
    const auth = { getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('invalid') })) }
    await expect(authenticateSyncBearerRequest(new Request('https://example.test', {
      headers: { authorization: 'Bearer header.eyJhdXRoX3RpbWUiOjE3ODgyNjAwMDB9.signature' },
    }), auth)).resolves.toEqual({ ok: false })
  })
})
