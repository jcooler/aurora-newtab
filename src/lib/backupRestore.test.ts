import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuroraStorage } from './storage'
import type { StorageDriver } from './storage/driver'
import type { AuroraData } from './storage/schema'
import { layoutV2FromLegacy } from './layout/v2'
import type {
  OriginPermissionAuthority,
  OriginTransactionContext,
  OriginTransactionResult,
  TransactionBodyResult,
} from '../services/permissionTransactions'

type PermissionListener = (permissions: chrome.permissions.Permissions) => void

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function permissionHarness(initial: readonly string[] = [], events: string[] = []) {
  const held = new Set(initial)
  const added: PermissionListener[] = []
  const removed: PermissionListener[] = []
  const getAll = vi.fn(async () => ({ origins: [...held] }))
  const request = vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) => {
    events.push('permission:request')
    origins.forEach((origin) => held.add(origin))
    added.forEach((listener) => listener({ origins }))
    return true
  })
  const contains = vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) =>
    origins.every((origin) => held.has(origin)),
  )
  const remove = vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) => {
    events.push(`permission:remove:${origins[0] ?? ''}`)
    const didRemove = origins.some((origin) => held.delete(origin))
    if (didRemove) removed.forEach((listener) => listener({ origins }))
    return didRemove
  })
  return {
    held,
    getAll,
    request,
    contains,
    remove,
    boundary: {
      getAll,
      request,
      contains,
      remove,
      onAdded: { addListener: (listener: PermissionListener) => added.push(listener) },
      onRemoved: { addListener: (listener: PermissionListener) => removed.push(listener) },
    },
  }
}

interface DriverControls {
  read?: (
    keys: string[] | null,
    call: number,
    proceed: () => Promise<Record<string, unknown>>,
  ) => Promise<Record<string, unknown>>
  write?: (
    patch: Record<string, unknown>,
    call: number,
    apply: () => Promise<void>,
  ) => Promise<void>
}

async function loadRestoreCore(
  initialPermissions: readonly string[] = [],
  controls: DriverControls = {},
  events: string[] = [],
) {
  vi.resetModules()
  const permissions = permissionHarness(initialPermissions, events)
  vi.stubGlobal('chrome', { permissions: permissions.boundary })
  const mirror = await import('../services/permissionMirror')
  await mirror.initializePermissionMirror()
  const [{ createStorage }, { memoryDriver }, { createInProcessStorageAuthority }, backup, restore, schema] = await Promise.all([
    import('./storage'),
    import('./storage/driver'),
    import('./storage/authority'),
    import('./backup'),
    import('./backupRestore'),
    import('./storage/schema'),
  ])

  function storageFor(seed: AuroraData) {
    const base = memoryDriver(clone(seed) as unknown as Record<string, unknown>)
    let readCount = 0
    let writeCount = 0
    const driver: StorageDriver = {
      read(keys) {
        readCount += 1
        events.push(`storage:read:${readCount}`)
        const proceed = () => base.read(keys)
        return controls.read ? controls.read(keys, readCount, proceed) : proceed()
      },
      write(patch) {
        writeCount += 1
        events.push(`storage:write:${writeCount}`)
        const apply = () => base.write(patch)
        return controls.write ? controls.write(patch, writeCount, apply) : apply()
      },
      onChanged: (listener) => base.onChanged(listener),
    }
    return {
      base,
      storage: createStorage(driver, createInProcessStorageAuthority()),
    }
  }

  function prepare(data: AuroraData) {
    const prepared = backup.prepareBackup(backup.serializeBackup(data))
    if (!prepared.ok) throw new Error(`test fixture did not prepare: ${prepared.reason}`)
    return prepared
  }

  return { permissions, backup, restore, schema, storageFor, prepare }
}

function knownSnapshot(dump: Record<string, unknown>, fallback: AuroraData): AuroraData {
  return Object.fromEntries(Object.keys(fallback).map((key) => [key, dump[key]])) as unknown as AuroraData
}

describe('backup restore coordinator', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('requests the deduped missing restored origins synchronously before lifecycle work or storage reads', async () => {
    const events: string[] = []
    const crypto = 'https://api.coingecko.com/*'
    const old = 'https://old.example.com/*'
    const core = await loadRestoreCore([crypto, old], {}, events)
    const previous: AuroraData = {
      ...core.schema.defaults(),
      connectors: {
        rss: { enabled: false, feeds: ['https://old.example.com/feed'], shownCount: 5 },
      },
    }
    const restored: AuroraData = {
      ...core.schema.defaults(),
      connectors: {
        crypto: { enabled: true, coins: ['bitcoin'] },
        status: {
          enabled: false,
          services: [
            { name: 'NASA one', url: 'https://api.nasa.gov/one/status.json' },
            { name: 'NASA two', url: 'https://api.nasa.gov/two/status.json' },
          ],
        },
      },
      photoPrefs: { mode: 'apod', index: 0, lastRotated: '' },
    }
    const prepared = core.prepare(restored)
    expect(prepared.requiredOrigins).toEqual([
      crypto,
      'https://api.nasa.gov/*',
      'https://apod.nasa.gov/*',
    ])
    const { base, storage } = core.storageFor(previous)
    const publicGet = vi.spyOn(storage, 'get')
    const authority: OriginPermissionAuthority = {
      runExclusive<T>(work: () => Promise<T>): Promise<T> {
        events.push('lifecycle:queued')
        return Promise.resolve().then(() => {
          events.push('lifecycle:callback')
          return work()
        })
      },
    }

    void Promise.resolve().then(() => { events.push('other:promise-continuation') })

    const resultPromise = core.restore.restorePreparedBackup(storage, prepared, authority)

    expect(events).toEqual(['lifecycle:queued', 'permission:request'])
    expect(core.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.nasa.gov/*', 'https://apod.nasa.gov/*'],
    })

    await expect(resultPromise).resolves.toEqual({
      status: 'committed',
      pendingCleanup: [],
      reentryRequired: [],
    })
    expect(publicGet).not.toHaveBeenCalled()
    expect(events.indexOf('permission:request')).toBeLessThan(events.indexOf('other:promise-continuation'))
    expect(events.indexOf('permission:request')).toBeLessThan(events.indexOf('lifecycle:callback'))
    expect(events.indexOf('lifecycle:callback')).toBeLessThan(events.indexOf('storage:read:1'))
    expect(events.indexOf('storage:read:2')).toBeLessThan(events.indexOf(`permission:remove:${old}`))
    expect(knownSnapshot(base.dump(), restored)).toEqual(restored)
  })

  it('uses lifecycle authority without a permission request when every restored requirement is already present', async () => {
    const origin = 'https://configured.example.com/*'
    const events: string[] = []
    const core = await loadRestoreCore([origin], {}, events)
    const restored: AuroraData = {
      ...core.schema.defaults(),
      connectors: {
        status: { enabled: false, services: [{ name: 'Configured', url: 'https://configured.example.com/status.json' }] },
      },
    }
    const { storage } = core.storageFor(core.schema.defaults())
    const authority: OriginPermissionAuthority = {
      async runExclusive<T>(work: () => Promise<T>): Promise<T> {
        events.push('lifecycle:callback')
        return work()
      },
    }

    await expect(core.restore.restorePreparedBackup(storage, core.prepare(restored), authority)).resolves.toMatchObject({
      status: 'committed',
      pendingCleanup: [],
    })
    expect(core.permissions.request).not.toHaveBeenCalled()
    expect(events[0]).toBe('lifecycle:callback')
  })

  it('commits the exact restored manual density through ownership finalization', async () => {
    const events: string[] = []
    const core = await loadRestoreCore([], {}, events)
    const previous: AuroraData = {
      ...core.schema.defaults(),
      settings: { ...core.schema.defaults().settings, name: 'Previous', layoutDensity: 'compact' },
    }
    const restored: AuroraData = {
      ...core.schema.defaults(),
      settings: { ...core.schema.defaults().settings, name: 'Restored', layoutDensity: 'spacious' },
    }
    const { base, storage } = core.storageFor(previous)

    await expect(core.restore.restorePreparedBackup(
      storage,
      core.prepare(restored),
      { runExclusive: async (work) => work() },
    )).resolves.toEqual({ status: 'committed', pendingCleanup: [], reentryRequired: [] })

    expect(knownSnapshot(base.dump(), previous).settings).toEqual(restored.settings)
    expect(events.filter((event) => event.startsWith('storage:write'))).toEqual(['storage:write:1'])
  })

  it('maps denial and unavailable permission state to safe retryable failures without touching storage', async () => {
    const denied = await loadRestoreCore()
    denied.permissions.request.mockResolvedValue(false)
    const deniedStore = denied.storageFor(denied.schema.defaults())
    const deniedWrite = vi.spyOn(deniedStore.storage, 'replaceAllWithRollback')
    const restored = {
      ...denied.schema.defaults(),
      photoPrefs: { mode: 'apod', index: 0, lastRotated: '' } as const,
    }

    await expect(denied.restore.restorePreparedBackup(
      deniedStore.storage,
      denied.prepare(restored),
      { runExclusive: async (work) => work() },
    )).resolves.toEqual({
      status: 'denied',
      pendingCleanup: [],
      message: 'Chrome did not grant the site access needed for this restore. You can retry.',
    })
    expect(deniedWrite).not.toHaveBeenCalled()

    vi.resetModules()
    const unavailablePermissions = permissionHarness()
    unavailablePermissions.getAll.mockRejectedValue(new Error('private mirror failure'))
    vi.stubGlobal('chrome', { permissions: unavailablePermissions.boundary })
    const mirror = await import('../services/permissionMirror')
    await mirror.initializePermissionMirror()
    const [{ restorePreparedBackup }, { createStorage }, { memoryDriver }, { createInProcessStorageAuthority }] = await Promise.all([
      import('./backupRestore'),
      import('./storage'),
      import('./storage/driver'),
      import('./storage/authority'),
    ])
    const unavailableStorage = createStorage(memoryDriver(), createInProcessStorageAuthority())
    const unavailableWrite = vi.spyOn(unavailableStorage, 'replaceAllWithRollback')

    await expect(restorePreparedBackup(
      unavailableStorage,
      denied.prepare(restored),
      { runExclusive: async (work) => work() },
    )).resolves.toEqual({
      status: 'permission-unavailable',
      pendingCleanup: [],
      message: 'Chrome site access is unavailable right now. You can retry the restore.',
    })
    expect(unavailableWrite).not.toHaveBeenCalled()
  })

  it('preserves a successfully acquired pattern for durable cleanup when lifecycle authority rejects', async () => {
    const acquired = 'https://api.coingecko.com/*'
    const core = await loadRestoreCore()
    const { storage } = core.storageFor(core.schema.defaults())
    const privateFailure = new Error('private lifecycle details')

    const result = await core.restore.restorePreparedBackup(
      storage,
      core.prepare({
        ...core.schema.defaults(),
        connectors: { crypto: { enabled: true, coins: ['bitcoin'] } },
      }),
      { runExclusive: () => Promise.reject(privateFailure) },
    )

    expect(result).toEqual({
      status: 'failed',
      pendingCleanup: [acquired],
      message: 'That backup could not be restored. Your current data was left unchanged. You can retry.',
    })
    expect(JSON.stringify(result)).not.toContain('private lifecycle')
    expect(core.permissions.held.has(acquired)).toBe(true)
  })

  it('rolls back the full literal pre-import snapshot and the acquired grant when an injected finalizer fails after verification', async () => {
    const acquired = 'https://finalizer-target.example.com/*'
    const events: string[] = []
    const core = await loadRestoreCore([], {}, events)
    const previous: AuroraData = {
      settings: {
        name: 'Literal before finalizer failure',
        use24Hour: true,
        panelColor: '#123456',
        units: 'imperial',
        muted: true,
        layoutDensity: 'auto',
        widgets: {
          search: false,
          weather: true,
          links: false,
          todo: true,
          timer: true,
          quote: false,
          bookmarks: true,
          notes: false,
          clocks: true,
          countdown: true,
          habits: true,
          monthCal: true,
          sun: true,
          moon: true,
        },
      },
      focus: { text: 'Keep literal focus', date: '2026-08-14', done: false },
      todoLists: [{ id: 'before-list', name: 'Before list', items: [{ id: 'before-item', text: 'Keep me', done: false }] }],
      links: [{ id: 'before-link', title: 'Before link', url: 'https://before.example' }],
      timerConfig: { workMinutes: 45, breakMinutes: 10 },
      photoPrefs: { mode: 'gradient', index: 7, lastRotated: '2026-08-13' },
      location: { lat: 42.9, lon: -85.6, label: 'Grand Rapids', manual: true },
      weatherCache: null,
      notes: { text: 'Literal note', updatedAt: 1234 },
      worldClocks: [{ zone: 'Europe/London', label: 'London' }],
      countdowns: [{ id: 'before-countdown', name: 'Before countdown', date: '2026-12-31' }],
      layout: layoutV2FromLegacy({ clock: { x: 12, y: 34 } }),
      connectors: {},
      connectorSnapshots: {},
      habits: [{ id: 'before-habit', name: 'Before habit', createdAt: 10, log: ['2026-08-13'] }],
      apodCache: null,
    }
    const restored: AuroraData = {
      ...core.schema.defaults(),
      settings: { ...core.schema.defaults().settings, name: 'Imported target' },
      connectors: {
        status: {
          enabled: false,
          services: [{ name: 'Target', url: 'https://finalizer-target.example.com/status.json' }],
        },
      },
    }
    const { base, storage } = core.storageFor(previous)
    const finalizerFailure = new Error('injected finalizer failure')
    const storageWithFinalizerFailure = {
      ...storage,
      replaceAllWithRollback<T>(
        next: AuroraData,
        finalize: (preImage: AuroraData) => Promise<T>,
      ) {
        return storage.replaceAllWithRollback(next, async (preImage) => {
          await finalize(preImage)
          events.push('finalizer:injected-failure')
          throw finalizerFailure
        })
      },
    }

    const result = await core.restore.restorePreparedBackup(
      storageWithFinalizerFailure,
      core.prepare(restored),
      { runExclusive: async (work) => work() },
    )

    expect(result).toMatchObject({ status: 'failed', pendingCleanup: [] })
    expect(events.indexOf('storage:read:2')).toBeLessThan(events.indexOf('finalizer:injected-failure'))
    expect(knownSnapshot(base.dump(), previous)).toEqual(previous)
    expect(Object.keys(knownSnapshot(base.dump(), previous))).toEqual(Object.keys(previous))
    expect(core.permissions.remove).toHaveBeenCalledWith({ origins: [acquired] })
    expect(core.permissions.held.has(acquired)).toBe(false)
  })

  it('retains a held pre-import owner and rolls back only the fresh target grant when verified storage fails before cleanup', async () => {
    const oldOwner = 'https://old-finalizer-owner.example.com/*'
    const acquiredTarget = 'https://new-finalizer-target.example.com/*'
    const events: string[] = []
    const core = await loadRestoreCore([oldOwner], {}, events)
    const previous: AuroraData = {
      ...core.schema.defaults(),
      settings: { ...core.schema.defaults().settings, name: 'Exact previous owner state' },
      connectors: {
        rss: {
          enabled: false,
          feeds: ['https://old-finalizer-owner.example.com/feed.xml'],
          shownCount: 5,
        },
      },
    }
    const restored: AuroraData = {
      ...core.schema.defaults(),
      settings: { ...core.schema.defaults().settings, name: 'Must not survive failure' },
      connectors: {
        status: {
          enabled: false,
          services: [{ name: 'New target', url: 'https://new-finalizer-target.example.com/status.json' }],
        },
      },
    }
    const { base, storage } = core.storageFor(previous)
    const storageWithFailureBeforeCleanup = {
      ...storage,
      replaceAllWithRollback<T>(
        next: AuroraData,
        finalize: (preImage: AuroraData) => Promise<T>,
      ) {
        return storage.replaceAllWithRollback(next, async (preImage) => {
          await finalize(preImage)
          events.push('finalizer:failure-before-cleanup')
          throw new Error('injected failure before irreversible cleanup')
        })
      },
    }

    const result = await core.restore.restorePreparedBackup(
      storageWithFailureBeforeCleanup,
      core.prepare(restored),
      { runExclusive: async (work) => work() },
    )

    expect(result).toEqual({
      status: 'failed',
      pendingCleanup: [],
      message: 'That backup could not be restored. Your current data was left unchanged. You can retry.',
    })
    expect(events.indexOf('storage:read:2')).toBeLessThan(events.indexOf('finalizer:failure-before-cleanup'))
    expect(knownSnapshot(base.dump(), previous)).toEqual(previous)
    expect(core.permissions.held.has(oldOwner)).toBe(true)
    expect(core.permissions.held.has(acquiredTarget)).toBe(false)
    expect(core.permissions.remove).toHaveBeenCalledTimes(1)
    expect(core.permissions.remove).toHaveBeenCalledWith({ origins: [acquiredTarget] })
  })

  it.each([
    ['target-write failure with remove rejection', 'target', 'reject'],
    ['verification failure with remove(false) and contains(true)', 'verify', 'false-still-held'],
  ])('keeps the acquired grant in pending cleanup after %s', async (_label, failureMode, cleanupMode) => {
    const acquired = 'https://failed-cleanup.example.com/*'
    const core = await loadRestoreCore([], {
      async write(_patch, call, apply) {
        if (failureMode === 'target' && call === 1) throw new Error('injected target failure')
        await apply()
      },
      async read(_keys, call, proceed) {
        const found = await proceed()
        if (failureMode === 'verify' && call === 2) {
          return { ...found, focus: { text: 'verification mismatch', date: '2026-08-14', done: false } }
        }
        return found
      },
    })
    if (cleanupMode === 'reject') {
      core.permissions.remove.mockRejectedValue(new Error('injected failure-side revoke rejection'))
    } else {
      core.permissions.remove.mockResolvedValue(false)
    }
    const previous: AuroraData = {
      ...core.schema.defaults(),
      settings: { ...core.schema.defaults().settings, name: 'Before failed cleanup' },
      links: [{ id: 'before', title: 'Before', url: 'https://before.example' }],
    }
    const restored: AuroraData = {
      ...core.schema.defaults(),
      connectors: {
        status: {
          enabled: false,
          services: [{ name: 'Failed cleanup', url: 'https://failed-cleanup.example.com/status.json' }],
        },
      },
    }
    const { base, storage } = core.storageFor(previous)

    await expect(core.restore.restorePreparedBackup(
      storage,
      core.prepare(restored),
      { runExclusive: async (work) => work() },
    )).resolves.toMatchObject({
      status: 'failed',
      pendingCleanup: [acquired],
    })
    expect(knownSnapshot(base.dump(), previous)).toEqual(previous)
    expect(core.permissions.remove).toHaveBeenCalledWith({ origins: [acquired] })
    expect(core.permissions.held.has(acquired)).toBe(true)
  })

  it('preserves acquired pending cleanup when access is lost and failure-side removal rejects', async () => {
    const acquired = 'https://access-lost-cleanup.example.com/*'
    const core = await loadRestoreCore()
    core.permissions.contains.mockResolvedValueOnce(false)
    core.permissions.remove.mockRejectedValue(new Error('injected access-lost cleanup rejection'))
    const previous = core.schema.defaults()
    const restored: AuroraData = {
      ...core.schema.defaults(),
      connectors: {
        status: {
          enabled: false,
          services: [{ name: 'Access lost', url: 'https://access-lost-cleanup.example.com/status.json' }],
        },
      },
    }
    const { base, storage } = core.storageFor(previous)

    await expect(core.restore.restorePreparedBackup(
      storage,
      core.prepare(restored),
      { runExclusive: async (work) => work() },
    )).resolves.toMatchObject({
      status: 'access-lost',
      pendingCleanup: [acquired],
    })
    expect(knownSnapshot(base.dump(), previous)).toEqual(previous)
    expect(core.permissions.held.has(acquired)).toBe(true)
  })

  it.each([
    ['target write before apply', 'before'],
    ['target write after apply', 'after'],
    ['target verification mismatch', 'verify'],
  ])('safely rolls back the literal pre-import snapshot after %s and releases only the fresh unowned grant', async (_label, mode) => {
    const acquired = 'https://restore-target.example.com/*'
    const primary = new Error(`private ${mode} failure`)
    const core = await loadRestoreCore([], {
      async write(_patch, call, apply) {
        if (call === 1) {
          if (mode === 'after') await apply()
          if (mode === 'before' || mode === 'after') throw primary
        }
        await apply()
      },
      async read(_keys, call, proceed) {
        const found = await proceed()
        if (mode === 'verify' && call === 2) {
          return { ...found, focus: { text: 'mismatch', date: '2026-08-14', done: false } }
        }
        return found
      },
    })
    const previous: AuroraData = {
      ...core.schema.defaults(),
      settings: { ...core.schema.defaults().settings, name: 'Literal pre-import owner' },
      links: [{ id: 'before', title: 'Before', url: 'https://before.example' }],
    }
    const restored: AuroraData = {
      ...core.schema.defaults(),
      settings: { ...core.schema.defaults().settings, name: 'Imported' },
      connectors: {
        status: { enabled: false, services: [{ name: 'Target', url: 'https://restore-target.example.com/status.json' }] },
      },
    }
    const { base, storage } = core.storageFor(previous)

    const result = await core.restore.restorePreparedBackup(
      storage,
      core.prepare(restored),
      { runExclusive: async (work) => work() },
    )

    expect(result).toMatchObject({
      status: 'failed',
      pendingCleanup: [],
      message: 'That backup could not be restored. Your current data was left unchanged. You can retry.',
    })
    expect(knownSnapshot(base.dump(), previous)).toEqual(previous)
    expect(core.permissions.remove).toHaveBeenCalledWith({ origins: [acquired] })
    expect(core.permissions.held.has(acquired)).toBe(false)
  })

  it('uses a fresh post-rollback ownership sweep and retains a newly acquired grant the pre-import state owns', async () => {
    const origin = 'https://shared-after-rollback.example.com/*'
    const core = await loadRestoreCore([], {
      async write(_patch, call, apply) {
        if (call === 1) throw new Error('target write failed')
        await apply()
      },
    })
    const previous: AuroraData = {
      ...core.schema.defaults(),
      connectors: {
        rss: { enabled: false, feeds: ['https://shared-after-rollback.example.com/feed'], shownCount: 5 },
      },
    }
    const restored: AuroraData = {
      ...core.schema.defaults(),
      connectors: {
        status: { enabled: false, services: [{ name: 'Shared', url: 'https://shared-after-rollback.example.com/status.json' }] },
      },
    }
    const { base, storage } = core.storageFor(previous)

    await expect(core.restore.restorePreparedBackup(
      storage,
      core.prepare(restored),
      { runExclusive: async (work) => work() },
    )).resolves.toMatchObject({ status: 'failed', pendingCleanup: [] })

    expect(knownSnapshot(base.dump(), previous)).toEqual(previous)
    expect(core.permissions.remove).not.toHaveBeenCalled()
    expect(core.permissions.held.has(origin)).toBe(true)
  })

  it('returns rollback-failed without claiming exact recovery when the pre-image cannot be restored', async () => {
    const core = await loadRestoreCore([], {
      async write(_patch, call, apply) {
        if (call === 1) {
          await apply()
          throw new Error('private primary')
        }
        throw new Error('private rollback')
      },
    })
    const { storage } = core.storageFor(core.schema.defaults())

    const result = await core.restore.restorePreparedBackup(
      storage,
      core.prepare({ ...core.schema.defaults(), settings: { ...core.schema.defaults().settings, name: 'Imported' } }),
      { runExclusive: async (work) => work() },
    )

    expect(result).toEqual({
      status: 'rollback-failed',
      pendingCleanup: [],
      message: 'The restore failed, and Aurora could not verify recovery of your previous data. Review your settings before retrying.',
    })
    expect(JSON.stringify(result)).not.toContain('private')
    expect(JSON.stringify(result)).not.toContain('left unchanged')
  })

  it.each(['reject', 'false-still-held'])('commits storage and reports only pending old-owner cleanup when revoke %s', async (mode) => {
    const old = 'https://old-owner.example.com/*'
    const core = await loadRestoreCore([old])
    if (mode === 'reject') core.permissions.remove.mockRejectedValue(new Error('private revoke failure'))
    else core.permissions.remove.mockResolvedValue(false)
    const previous: AuroraData = {
      ...core.schema.defaults(),
      connectors: {
        rss: { enabled: false, feeds: ['https://old-owner.example.com/feed'], shownCount: 5 },
      },
    }
    const restored: AuroraData = {
      ...core.schema.defaults(),
      settings: { ...core.schema.defaults().settings, name: 'Committed despite revoke' },
    }
    const { base, storage } = core.storageFor(previous)

    await expect(core.restore.restorePreparedBackup(
      storage,
      core.prepare(restored),
      { runExclusive: async (work) => work() },
    )).resolves.toEqual({
      status: 'committed',
      pendingCleanup: [old],
      reentryRequired: [],
    })
    expect(knownSnapshot(base.dump(), restored)).toEqual(restored)
  })

  it('keeps committed storage and returns every cleanup candidate as pending when post-commit reconciliation throws', async () => {
    const old = 'https://unexpected-cleanup.example.com/*'
    vi.resetModules()
    vi.doMock('../services/permissionTransactions', async (importActual) => {
      const actual = await importActual<typeof import('../services/permissionTransactions')>()
      return {
        ...actual,
        runOriginTransaction: async <T,>(
          _storage: AuroraStorage,
          _urls: readonly string[],
          body: (context: OriginTransactionContext) => Promise<TransactionBodyResult<T>>,
        ): Promise<OriginTransactionResult<T>> => {
          try {
            const bodyResult = await body({
              releaseUnownedOrigins: async () => {
                throw new Error('private unexpected cleanup failure')
              },
            })
            if (!bodyResult.ok) {
              return {
                status: 'aborted',
                message: bodyResult.message,
                preExisting: [],
                acquired: [],
                pendingCleanup: [],
              }
            }
            return { status: 'committed', value: bodyResult.value, preExisting: [], acquired: [] }
          } catch (error) {
            return { status: 'failed', error, preExisting: [], acquired: [], pendingCleanup: [] }
          }
        },
      }
    })

    try {
      const [{ createStorage }, { memoryDriver }, restore, backup, schema] = await Promise.all([
        import('./storage'),
        import('./storage/driver'),
        import('./backupRestore'),
        import('./backup'),
        import('./storage/schema'),
      ])
      const previous: AuroraData = {
        ...schema.defaults(),
        connectors: {
          rss: { enabled: false, feeds: ['https://unexpected-cleanup.example.com/feed'], shownCount: 5 },
        },
      }
      const restored: AuroraData = {
        ...schema.defaults(),
        settings: { ...schema.defaults().settings, name: 'Committed before cleanup failure' },
      }
      const driver = memoryDriver(clone(previous) as unknown as Record<string, unknown>)
      const storage = createStorage(driver)
      const prepared = backup.prepareBackup(backup.serializeBackup(restored))
      if (!prepared.ok) throw new Error(`test fixture did not prepare: ${prepared.reason}`)

      await expect(restore.restorePreparedBackup(storage, prepared)).resolves.toEqual({
        status: 'committed',
        pendingCleanup: [old],
        reentryRequired: [],
      })
      expect(knownSnapshot(driver.dump(), previous)).toEqual(restored)
    } finally {
      vi.doUnmock('../services/permissionTransactions')
    }
  })
})
