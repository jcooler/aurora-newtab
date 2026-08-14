import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuroraStorage } from '../lib/storage'
import type { AuroraData, PhotoPrefs } from '../lib/storage/schema'
import type { ConnectorConfig, ConnectorId } from './connectors/types'

type PermissionListener = (permissions: chrome.permissions.Permissions) => void

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createPermissionHarness(initial: readonly string[] = [], emitRequestEvents = true) {
  const held = new Set(initial)
  const addedListeners: PermissionListener[] = []
  const removedListeners: PermissionListener[] = []
  const onAdded = { addListener: (listener: PermissionListener) => addedListeners.push(listener) }
  const onRemoved = { addListener: (listener: PermissionListener) => removedListeners.push(listener) }
  const emitAdded = (origins: string[]) => addedListeners.forEach((listener) => listener({ origins }))
  const emitRemoved = (origins: string[]) => removedListeners.forEach((listener) => listener({ origins }))
  const getAll = vi.fn(async () => ({ origins: [...held] }))
  const request = vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) => {
    for (const origin of origins) held.add(origin)
    if (emitRequestEvents) emitAdded(origins)
    return true
  })
  const contains = vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) =>
    origins.every((origin) => held.has(origin)),
  )
  const remove = vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) => {
    const removed = origins.some((origin) => held.delete(origin))
    if (removed) emitRemoved(origins)
    return removed
  })
  return {
    held,
    emitAdded,
    emitRemoved,
    getAll,
    request,
    contains,
    remove,
    chromePermissions: { getAll, request, contains, remove, onAdded, onRemoved },
  }
}

async function loadCore(initial: readonly string[] = [], emitRequestEvents = true) {
  vi.resetModules()
  const permissions = createPermissionHarness(initial, emitRequestEvents)
  vi.stubGlobal('chrome', { permissions: permissions.chromePermissions })
  const mirror = await import('./permissionMirror')
  await mirror.initializePermissionMirror()
  const transactions = await import('./permissionTransactions')
  return { permissions, mirror, transactions }
}

function createTestStorage(
  connectors: Partial<Record<ConnectorId, ConnectorConfig>> = {},
  photoPrefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '' },
) {
  const data = { connectors, photoPrefs }
  const updateCalls: string[] = []
  const storage = {
    async get(key: keyof AuroraData) {
      return data[key as keyof typeof data]
    },
    async update(key: keyof AuroraData, update: (value: unknown) => unknown) {
      updateCalls.push(key)
      const next = update(data[key as keyof typeof data])
      ;(data as Record<string, unknown>)[key] = next
      return next
    },
  } as unknown as AuroraStorage
  return { data, storage, updateCalls }
}

describe('runOriginTransaction', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('queues the lifecycle lock then requests only the canonical snapshot-absent subset in the original turn without awaiting', async () => {
    const a = 'https://a.example.com/*'
    const b = 'https://b.example.com/*'
    const { permissions, transactions } = await loadCore([a])
    const order: string[] = []
    permissions.request.mockImplementation(async ({ origins = [] }) => {
      order.push('request')
      for (const origin of origins) permissions.held.add(origin)
      return true
    })
    const authority = {
      runExclusive<T>(work: () => Promise<T>): Promise<T> {
        order.push('lock-queued')
        return Promise.resolve().then(() => {
          order.push('lock-callback')
          return work()
        })
      },
    }

    const resultPromise = transactions.runOriginTransaction(
      createTestStorage().storage,
      ['https://a.example.com/path', 'https://b.example.com/one', 'https://b.example.com/two'],
      async () => ({ ok: true, value: 'saved', ownerCommitted: true }),
      authority,
    )

    expect(order).toEqual(['lock-queued', 'request'])
    expect(permissions.request).toHaveBeenCalledTimes(1)
    expect(permissions.request).toHaveBeenCalledWith({ origins: [b] })
    expect(permissions.getAll).toHaveBeenCalledTimes(1)
    await expect(resultPromise).resolves.toMatchObject({
      status: 'committed',
      value: 'saved',
      preExisting: [a],
      acquired: [b],
    })
  })

  it('does not redundantly request an all-present set', async () => {
    const a = 'https://a.example.com/*'
    const { permissions, transactions } = await loadCore([a])
    const body = vi.fn(async () => ({ ok: true as const, value: 1, ownerCommitted: true as const }))

    const result = await transactions.runOriginTransaction(
      createTestStorage().storage,
      ['https://a.example.com/path', a],
      body,
      transactions.createInProcessOriginPermissionAuthority(),
    )

    expect(result).toMatchObject({ status: 'committed', preExisting: [a], acquired: [] })
    expect(permissions.request).not.toHaveBeenCalled()
    expect(body).toHaveBeenCalledTimes(1)
  })

  it('returns permission-unavailable without requesting, running the body, or writing when the mirror seed failed', async () => {
    vi.resetModules()
    const permissions = createPermissionHarness()
    permissions.getAll.mockRejectedValue(new Error('unavailable'))
    vi.stubGlobal('chrome', { permissions: permissions.chromePermissions })
    const mirror = await import('./permissionMirror')
    await mirror.initializePermissionMirror()
    const transactions = await import('./permissionTransactions')
    const { storage, updateCalls } = createTestStorage()
    const body = vi.fn(async () => ({ ok: true as const, value: 1, ownerCommitted: true as const }))

    const result = await transactions.runOriginTransaction(
      storage,
      ['https://a.example.com/'],
      body,
      transactions.createInProcessOriginPermissionAuthority(),
    )

    expect(result).toEqual({ status: 'permission-unavailable' })
    expect(permissions.request).not.toHaveBeenCalled()
    expect(body).not.toHaveBeenCalled()
    expect(updateCalls).toEqual([])
  })

  it('denial never runs the body or writes storage', async () => {
    const { permissions, transactions } = await loadCore()
    permissions.request.mockResolvedValue(false)
    const { storage, updateCalls } = createTestStorage()
    const body = vi.fn(async () => ({ ok: true as const, value: 1, ownerCommitted: true as const }))

    const result = await transactions.runOriginTransaction(
      storage,
      ['https://denied.example.com/'],
      body,
      transactions.createInProcessOriginPermissionAuthority(),
    )

    expect(result).toEqual({ status: 'denied' })
    expect(body).not.toHaveBeenCalled()
    expect(updateCalls).toEqual([])
  })

  it('request rejection is an explicit denial and never runs the body or writes storage', async () => {
    const { permissions, transactions } = await loadCore()
    permissions.request.mockRejectedValue(new Error('gesture lost'))
    const { storage, updateCalls } = createTestStorage()
    const body = vi.fn(async () => ({ ok: true as const, value: 1, ownerCommitted: true as const }))

    const result = await transactions.runOriginTransaction(
      storage,
      ['https://rejected.example.com/'],
      body,
      transactions.createInProcessOriginPermissionAuthority(),
    )

    expect(result).toEqual({ status: 'denied' })
    expect(body).not.toHaveBeenCalled()
    expect(updateCalls).toEqual([])
  })

  it('handles request rejection immediately while the lifecycle lock is deferred, avoiding an unhandledrejection window', async () => {
    const { permissions, transactions } = await loadCore()
    const allowLock = deferred()
    const authority = {
      async runExclusive<T>(work: () => Promise<T>): Promise<T> {
        await allowLock.promise
        return work()
      },
    }
    const rejection = new Error('gesture lost behind lock')
    permissions.request.mockRejectedValue(rejection)
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => { unhandled.push(reason) }
    const rejectionEvents = (globalThis as typeof globalThis & {
      process: {
        on(event: 'unhandledRejection', listener: (reason: unknown) => void): void
        off(event: 'unhandledRejection', listener: (reason: unknown) => void): void
      }
    }).process
    rejectionEvents.on('unhandledRejection', onUnhandled)

    try {
      const result = transactions.runOriginTransaction(
        createTestStorage().storage,
        ['https://rejected-behind-lock.example.com/'],
        async () => ({ ok: true, value: 'saved', ownerCommitted: true }),
        authority,
      )

      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(unhandled).toEqual([])
      allowLock.resolve()
      await expect(result).resolves.toEqual({ status: 'denied' })
    } finally {
      allowLock.resolve()
      rejectionEvents.off('unhandledRejection', onUnhandled)
    }
  })

  it('validation abort rolls back only the newly acquired pattern and preserves the click-time pre-existing grant', async () => {
    const preExisting = 'https://existing.example.com/*'
    const acquired = 'https://new.example.com/*'
    const { permissions, transactions } = await loadCore([preExisting])

    const result = await transactions.runOriginTransaction(
      createTestStorage().storage,
      [preExisting, acquired],
      async () => ({ ok: false, message: 'validation failed' }),
      transactions.createInProcessOriginPermissionAuthority(),
    )

    expect(result).toEqual({
      status: 'aborted',
      message: 'validation failed',
      preExisting: [preExisting],
      acquired: [acquired],
      pendingCleanup: [],
    })
    expect(permissions.remove).toHaveBeenCalledTimes(1)
    expect(permissions.remove).toHaveBeenCalledWith({ origins: [acquired] })
    expect(permissions.held).toEqual(new Set([preExisting]))
  })

  it('storage update rejection is failed and rolls back the newly acquired unowned grant', async () => {
    const acquired = 'https://write-failed.example.com/*'
    const { permissions, transactions } = await loadCore()
    const { storage } = createTestStorage()
    storage.update = vi.fn().mockRejectedValue(new Error('write failed'))

    const result = await transactions.runOriginTransaction(
      storage,
      [acquired],
      async () => {
        await storage.update('connectors', (value) => value)
        return { ok: true, value: 'saved', ownerCommitted: true }
      },
      transactions.createInProcessOriginPermissionAuthority(),
    )

    expect(result).toMatchObject({ status: 'failed', acquired: [acquired], pendingCleanup: [] })
    expect(permissions.held.has(acquired)).toBe(false)
  })

  it('fresh ownership after a partially persisted body withholds blanket rollback for the owner that landed', async () => {
    const acquired = 'https://partial.example.com/*'
    const { permissions, transactions } = await loadCore()
    const { storage, data } = createTestStorage()

    const result = await transactions.runOriginTransaction(
      storage,
      [acquired],
      async () => {
        await storage.update('connectors', (prev) => ({
          ...(prev as Partial<Record<ConnectorId, ConnectorConfig>>),
          rss: { enabled: true, feeds: ['https://partial.example.com/feed'], shownCount: 5 },
        }))
        throw new Error('post-write failure')
      },
      transactions.createInProcessOriginPermissionAuthority(),
    )

    expect(result).toMatchObject({ status: 'failed', acquired: [acquired], pendingCleanup: [] })
    expect(data.connectors).toHaveProperty('rss')
    expect(permissions.remove).not.toHaveBeenCalled()
    expect(permissions.held.has(acquired)).toBe(true)
  })

  it('holds the lifecycle authority from acquisition classification through owner commit, so a queued release sees the fresh owner', async () => {
    const origin = 'https://locked.example.com/*'
    const { permissions, transactions } = await loadCore()
    const { storage } = createTestStorage()
    const authority = transactions.createInProcessOriginPermissionAuthority()
    const bodyStarted = deferred()
    const allowCommit = deferred()

    const transaction = transactions.runOriginTransaction(
      storage,
      [origin],
      async () => {
        bodyStarted.resolve()
        await allowCommit.promise
        await storage.update('connectors', (prev) => ({
          ...(prev as Partial<Record<ConnectorId, ConnectorConfig>>),
          rss: { enabled: true, feeds: ['https://locked.example.com/feed'], shownCount: 5 },
        }))
        return { ok: true, value: 'saved', ownerCommitted: true }
      },
      authority,
    )
    await bodyStarted.promise

    const release = transactions.releaseUnownedOrigins(storage, [origin], authority)
    await Promise.resolve()
    expect(permissions.remove).not.toHaveBeenCalled()
    allowCommit.resolve()

    await expect(transaction).resolves.toMatchObject({ status: 'committed' })
    await expect(release).resolves.toEqual({ released: [], pending: [] })
    expect(permissions.remove).not.toHaveBeenCalled()
  })

  it('a release already holding the lock removes a snapshot-present grant; the queued transaction never reacquires and aborts access-lost', async () => {
    const origin = 'https://stale.example.com/*'
    const { permissions, transactions } = await loadCore([origin])
    const { storage } = createTestStorage()
    const authority = transactions.createInProcessOriginPermissionAuthority()
    const removeStarted = deferred()
    const allowRemove = deferred()
    permissions.remove.mockImplementation(async ({ origins = [] }) => {
      removeStarted.resolve()
      await allowRemove.promise
      for (const candidate of origins) permissions.held.delete(candidate)
      permissions.emitRemoved(origins)
      return true
    })

    const release = transactions.releaseUnownedOrigins(storage, [origin], authority)
    await removeStarted.promise
    const body = vi.fn(async () => ({ ok: true as const, value: 'saved', ownerCommitted: true as const }))
    const transaction = transactions.runOriginTransaction(storage, [origin], body, authority)

    expect(permissions.request).not.toHaveBeenCalled()
    expect(body).not.toHaveBeenCalled()
    allowRemove.resolve()

    await expect(release).resolves.toEqual({ released: [origin], pending: [] })
    await expect(transaction).resolves.toEqual({
      status: 'access-lost',
      preExisting: [origin],
      acquired: [],
      pendingCleanup: [],
    })
    expect(permissions.request).not.toHaveBeenCalled()
    expect(body).not.toHaveBeenCalled()
  })

  it('a second request queued behind a failing transaction aborts access-lost after the first rollback removes access', async () => {
    const origin = 'https://overlap.example.com/*'
    const { permissions, transactions } = await loadCore([], false)
    const authority = transactions.createInProcessOriginPermissionAuthority()
    const firstBodyStarted = deferred()
    const allowFirstAbort = deferred()
    const storage = createTestStorage().storage
    const first = transactions.runOriginTransaction(
      storage,
      [origin],
      async () => {
        firstBodyStarted.resolve()
        await allowFirstAbort.promise
        return { ok: false, message: 'first failed' }
      },
      authority,
    )
    await firstBodyStarted.promise
    const secondBody = vi.fn(async () => ({ ok: true as const, value: 'second', ownerCommitted: true as const }))
    const second = transactions.runOriginTransaction(storage, [origin], secondBody, authority)

    expect(permissions.request).toHaveBeenCalledTimes(2)
    allowFirstAbort.resolve()

    await expect(first).resolves.toMatchObject({ status: 'aborted' })
    await expect(second).resolves.toMatchObject({ status: 'access-lost' })
    expect(secondBody).not.toHaveBeenCalled()
  })
})

describe('ownership-aware release and retry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('withholds remove while another configured owner remains and removes only after the final owner is gone', async () => {
    const origin = 'https://shared.example.com/*'
    const { permissions, transactions } = await loadCore([origin])
    const { storage, data } = createTestStorage({
      status: {
        enabled: false,
        services: [{ name: 'Shared', url: 'https://shared.example.com/status.json' }],
      },
    })
    const authority = transactions.createInProcessOriginPermissionAuthority()

    await expect(transactions.releaseUnownedOrigins(storage, [origin], authority)).resolves.toEqual({
      released: [],
      pending: [],
    })
    expect(permissions.remove).not.toHaveBeenCalled()

    data.connectors = {}
    await expect(transactions.releaseUnownedOrigins(storage, [origin], authority)).resolves.toEqual({
      released: [origin],
      pending: [],
    })
    expect(permissions.remove).toHaveBeenCalledTimes(1)
  })

  it('treats remove(false)+contains(false) as success while still-held, remove rejection, and verification rejection remain pending', async () => {
    const absent = 'https://absent.example.com/*'
    const held = 'https://held.example.com/*'
    const removeRejects = 'https://remove-rejects.example.com/*'
    const verifyRejects = 'https://verify-rejects.example.com/*'
    const { permissions, transactions } = await loadCore([held, removeRejects, verifyRejects])
    permissions.remove.mockImplementation(async ({ origins = [] }) => {
      if (origins[0] === removeRejects) throw new Error('remove failed')
      return false
    })
    permissions.contains.mockImplementation(async ({ origins = [] }) => {
      if (origins[0] === verifyRejects) throw new Error('contains failed')
      return origins.every((origin) => permissions.held.has(origin))
    })

    await expect(
      transactions.releaseUnownedOrigins(
        createTestStorage().storage,
        [absent, held, removeRejects, verifyRejects],
        transactions.createInProcessOriginPermissionAuthority(),
      ),
    ).resolves.toEqual({ released: [absent], pending: [held, removeRejects, verifyRejects] })
  })

  it('retry canonicalizes only the prior pending set, rechecks fresh ownership, removes unowned entries once, and clears on success', async () => {
    const pending = 'https://pending.example.com/*'
    const nowOwned = 'https://owned.example.com/*'
    const { permissions, transactions } = await loadCore([pending, nowOwned])
    const { storage } = createTestStorage({
      rss: { enabled: false, feeds: ['https://owned.example.com/feed'], shownCount: 5 },
    })

    await expect(
      transactions.retryOriginRelease(
        storage,
        [pending, 'https://pending.example.com/path', nowOwned],
        transactions.createInProcessOriginPermissionAuthority(),
      ),
    ).resolves.toEqual({ released: [pending], pending: [] })
    expect(permissions.remove).toHaveBeenCalledTimes(1)
    expect(permissions.remove).toHaveBeenCalledWith({ origins: [pending] })
    expect(permissions.held.has(nowOwned)).toBe(true)
  })

  it('the production Web Lock authority has no in-process fallback when Web Locks are unavailable', async () => {
    const { transactions } = await loadCore()
    const work = vi.fn(async () => 'unsafe')

    await expect(transactions.createWebLockOriginPermissionAuthority(undefined).runExclusive(work)).rejects.toThrow(
      'Web Locks',
    )
    expect(work).not.toHaveBeenCalled()
  })
})
