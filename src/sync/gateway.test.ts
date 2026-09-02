import { describe, expect, it, vi } from 'vitest'

import { createSyncGateway } from './gateway'

const origin = 'https://ovlobmvxtryitupxwylg.supabase.co'
const accountId = '42000000-0000-4000-8000-000000000001'
const deviceId = 'AAECAwQFBgcICQoLDA0ODw'
const keyMaterial = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc'

function response(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json',
      ...headers,
    },
  })
}

function serverSummary() {
  return {
    vaultVersion: 4,
    encodedSize: 120,
    currentDeviceId: deviceId,
    devices: [{
      deviceId,
      friendlyName: 'Primary browser',
      state: 'active',
      acknowledgedVaultVersion: 3,
      lastSeenAt: 1_788_352_400_000,
    }],
  }
}

function dependencies(overrides: Partial<Parameters<typeof createSyncGateway>[0]> = {}) {
  return {
    origin,
    allowedOrigins: [origin] as const,
    enabled: true,
    getAccessToken: vi.fn(async () => 'verified-access-token'),
    invalidateAuthentication: vi.fn(async () => undefined),
    fetch: vi.fn(async () => response({ status: 'completed' })),
    timeoutMs: 10_000,
    ...overrides,
  }
}

describe('authenticated sync gateway', () => {
  it('fails closed without requesting a token or network in a production-disabled build', async () => {
    const deps = dependencies({ enabled: false })
    const gateway = createSyncGateway(deps)

    await expect(gateway.bootstrap({
      accountId,
      deviceId,
      friendlyName: 'Primary browser',
    })).resolves.toEqual({ ok: false, kind: 'needs_attention' })
    expect(deps.getAccessToken).not.toHaveBeenCalled()
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it('accepts only the exact approved local or production service origin', () => {
    expect(() => createSyncGateway(dependencies({ origin: 'https://example.test' }))).toThrow('sync_gateway_config_invalid')
    expect(() => createSyncGateway(dependencies({ origin: `${origin}/functions` }))).toThrow('sync_gateway_config_invalid')
    const localOrigin = 'http://127.0.0.1:54321'
    expect(() => createSyncGateway(dependencies({ origin: localOrigin, allowedOrigins: [localOrigin] }))).not.toThrow()
    expect(() => createSyncGateway(dependencies())).not.toThrow()
  })

  it('posts an authenticated exact bootstrap body and returns only a nonextractable CryptoKey plus presentation summary', async () => {
    const deps = dependencies({
      fetch: vi.fn(async () => response({ keyVersion: 1, keyMaterial, summary: serverSummary() })),
    })
    const gateway = createSyncGateway(deps)
    const result = await gateway.bootstrap({ accountId, deviceId, friendlyName: 'Primary browser' })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected bootstrap success')
    expect(result.value.dataKey).toBeInstanceOf(CryptoKey)
    expect(result.value.dataKey.extractable).toBe(false)
    expect(result.value.summary).toEqual({
      vaultVersion: 4,
      usedBytes: 120,
      currentDeviceId: deviceId,
      devices: [{
        id: deviceId,
        name: 'Primary browser',
        lastSyncAt: 1_788_352_400_000,
        current: true,
        revoked: false,
      }],
    })
    expect(JSON.stringify(result.value)).not.toContain(keyMaterial)

    const [url, init] = vi.mocked(deps.fetch).mock.calls[0]!
    expect(url).toBe(`${origin}/functions/v1/sync-bootstrap`)
    expect(init).toEqual(expect.objectContaining({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      body: JSON.stringify({ deviceId, friendlyName: 'Primary browser' }),
    }))
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer verified-access-token')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(deps.getAccessToken).toHaveBeenCalledWith(accountId, expect.any(AbortSignal))
  })

  it('invalidates local authentication on a 401 without reflecting response or token material', async () => {
    const deps = dependencies({
      fetch: vi.fn(async () => response({ error: 'failed with verified-access-token' }, 401)),
    })
    const result = await createSyncGateway(deps).pull({
      accountId,
      deviceId,
      afterVaultVersion: 0,
      cursor: 0,
      limit: 100,
      acknowledgeVaultVersion: null,
    })
    expect(result).toEqual({ ok: false, kind: 'authentication_required' })
    expect(deps.invalidateAuthentication).toHaveBeenCalledOnce()
    expect(JSON.stringify(result)).not.toContain('verified-access-token')
  })

  it('preserves the authentication-required result when local invalidation fails', async () => {
    const deps = dependencies({
      fetch: vi.fn(async () => response({ error: 'account_not_found' }, 403)),
      invalidateAuthentication: vi.fn(async () => { throw new Error('local storage unavailable') }),
    })
    const result = await createSyncGateway(deps).pull({
      accountId,
      deviceId,
      afterVaultVersion: 0,
      cursor: 0,
      limit: 100,
      acknowledgeVaultVersion: null,
    })
    expect(result).toEqual({ ok: false, kind: 'authentication_required' })
    expect(deps.invalidateAuthentication).toHaveBeenCalledOnce()
  })

  it('maps bounded pull ciphertext to an account-bound coordinator record without exposing storage metadata', async () => {
    const deps = dependencies({
      fetch: vi.fn(async () => response({
        records: [{
          entityType: 'notes', entityId: 'singleton', revision: 1, vaultVersion: 4,
          tombstone: false, nonce: 'A'.repeat(16), ciphertext: 'A'.repeat(22), storedSize: 96,
        }],
        nextCursor: null,
        vaultVersion: 4,
      })),
    })
    const result = await createSyncGateway(deps).pull({
      accountId,
      deviceId,
      afterVaultVersion: 0,
      cursor: 0,
      limit: 100,
      acknowledgeVaultVersion: null,
    })
    expect(result).toEqual({
      ok: true,
      value: {
        records: [{
          envelopeVersion: 1,
          accountId,
          entityType: 'notes',
          entityId: 'singleton',
          revision: 1,
          vaultVersion: 4,
          tombstone: false,
          nonce: 'A'.repeat(16),
          ciphertext: 'A'.repeat(22),
        }],
        nextCursor: null,
        vaultVersion: 4,
      },
    })
    expect(JSON.stringify(result)).not.toContain('storedSize')
  })

  it('rejects pull pages whose cursor or record ordering conflicts with the vault version', async () => {
    const makeRecord = (vaultVersion: number) => ({
      entityType: 'notes', entityId: `note-${vaultVersion}`, revision: 1, vaultVersion,
      tombstone: false, nonce: 'A'.repeat(16), ciphertext: 'A'.repeat(22), storedSize: 96,
    })
    const deps = dependencies({
      fetch: vi.fn(async () => response({
        records: [makeRecord(4), makeRecord(3)],
        nextCursor: 3,
        vaultVersion: 4,
      })),
    })
    const input = {
      accountId,
      deviceId,
      afterVaultVersion: 0,
      cursor: 0,
      limit: 100,
      acknowledgeVaultVersion: null,
    }
    await expect(createSyncGateway(deps).pull(input)).resolves.toEqual({
      ok: false,
      kind: 'needs_attention',
    })

    deps.fetch = vi.fn(async () => response({
      records: [makeRecord(4)],
      nextCursor: 3,
      vaultVersion: 4,
    }))
    await expect(createSyncGateway(deps).pull(input)).resolves.toEqual({
      ok: false,
      kind: 'needs_attention',
    })
  })

  it('posts only the reviewed flattened push envelope and validates the matching outcome', async () => {
    const deps = dependencies({
      fetch: vi.fn(async () => response({
        outcomes: [{
          status: 'accepted', entityType: 'notes', entityId: 'singleton', revision: 1, vaultVersion: 5,
        }],
      })),
    })
    const result = await createSyncGateway(deps).push({
      accountId,
      deviceId,
      mutations: [{
        idempotencyId: '53000000-0000-4000-8000-000000000001',
        expectedRevision: 0,
        record: {
          envelopeVersion: 1,
          accountId,
          entityType: 'notes',
          entityId: 'singleton',
          revision: 1,
          tombstone: false,
          nonce: 'A'.repeat(16),
          ciphertext: 'A'.repeat(22),
        },
      }],
    })
    expect(result).toEqual({ ok: true, value: [{
      status: 'accepted', entityType: 'notes', entityId: 'singleton', revision: 1, vaultVersion: 5,
    }] })
    const body = JSON.parse(String(vi.mocked(deps.fetch).mock.calls[0]?.[1]?.body))
    expect(body).toEqual({
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
        ciphertext: 'A'.repeat(22),
      }],
    })
  })

  it('rejects a push outcome with mismatched identity or an unreviewed field', async () => {
    const gateway = createSyncGateway(dependencies({
      fetch: vi.fn(async () => response({
        outcomes: [{
          status: 'accepted', entityType: 'notes', entityId: 'foreign', revision: 1,
          vaultVersion: 5, internal: 'must not leave',
        }],
      })),
    }))
    await expect(gateway.push({
      accountId,
      deviceId,
      mutations: [{
        idempotencyId: '53000000-0000-4000-8000-000000000001',
        expectedRevision: 0,
        record: {
          envelopeVersion: 1,
          accountId,
          entityType: 'notes',
          entityId: 'singleton',
          revision: 1,
          tombstone: false,
          nonce: 'A'.repeat(16),
          ciphertext: 'A'.repeat(22),
        },
      }],
    })).resolves.toEqual({ ok: false, kind: 'needs_attention' })
  })

  it('rejects an encoded request over 256 KiB before acquiring network authority', async () => {
    const deps = dependencies()
    const result = await createSyncGateway(deps).push({
      accountId,
      deviceId,
      mutations: [{
        idempotencyId: '53000000-0000-4000-8000-000000000001',
        expectedRevision: 0,
        record: {
          envelopeVersion: 1,
          accountId,
          entityType: 'notes',
          entityId: 'singleton',
          revision: 1,
          tombstone: false,
          nonce: 'A'.repeat(16),
          ciphertext: 'A'.repeat(262_144),
        },
      }],
    })
    expect(result).toEqual({ ok: false, kind: 'needs_attention' })
    expect(deps.getAccessToken).not.toHaveBeenCalled()
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it.each([
    [403, 'entitlement_required', 'entitlement_required'],
    [409, 'device_limit', 'device_limit'],
    [429, 'rate_limited', 'offline'],
    [503, 'service_unavailable', 'offline'],
    [400, 'invalid_request', 'needs_attention'],
  ] as const)('maps %s %s to the stable %s outcome', async (status, error, kind) => {
    const gateway = createSyncGateway(dependencies({
      fetch: vi.fn(async () => response({ error }, status)),
    }))
    await expect(gateway.deactivateDevice({ accountId, deviceId })).resolves.toEqual({ ok: false, kind })
  })

  it('forwards caller cancellation and converts timeout or secret-bearing transport failures to offline', async () => {
    vi.useFakeTimers()
    try {
      let observedSignal: AbortSignal | undefined
      const deps = dependencies({
        timeoutMs: 50,
        fetch: vi.fn(async (_url, init) => {
          observedSignal = init?.signal as AbortSignal
          return await new Promise<Response>((_resolve, reject) => {
            observedSignal?.addEventListener('abort', () => reject(new Error('network failed with verified-access-token')), { once: true })
          })
        }),
      })
      const pending = createSyncGateway(deps).deactivateDevice({ accountId, deviceId })
      await vi.advanceTimersByTimeAsync(51)
      await expect(pending).resolves.toEqual({ ok: false, kind: 'offline' })
      expect(observedSignal?.aborted).toBe(true)

      const controller = new AbortController()
      controller.abort()
      await expect(createSyncGateway(dependencies()).deactivateDevice(
        { accountId, deviceId }, controller.signal,
      )).resolves.toEqual({ ok: false, kind: 'offline' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects cacheable, malformed, or oversized JSON responses before returning server data', async () => {
    const cases = [
      response({ status: 'completed' }, 200, { 'cache-control': 'public, max-age=60' }),
      new Response('{', { status: 200, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } }),
      response({ value: 'A'.repeat(262_144) }),
    ]
    for (const candidate of cases) {
      const gateway = createSyncGateway(dependencies({ fetch: vi.fn(async () => candidate) }))
      await expect(gateway.deactivateDevice({ accountId, deviceId })).resolves.toEqual({
        ok: false,
        kind: 'needs_attention',
      })
    }
  })
})
