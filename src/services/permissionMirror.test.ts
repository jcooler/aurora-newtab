import { afterEach, describe, expect, it, vi } from 'vitest'

interface PermissionEvent {
  addListener(listener: (permissions: chrome.permissions.Permissions) => void): void
  emit(permissions: chrome.permissions.Permissions): void
  count(): number
}

function permissionEvent(): PermissionEvent {
  const listeners: Array<(permissions: chrome.permissions.Permissions) => void> = []
  return {
    addListener(listener) {
      listeners.push(listener)
    },
    emit(permissions) {
      for (const listener of listeners) listener(permissions)
    },
    count: () => listeners.length,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('permission mirror', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('subscribes before seeding and initialization events win per pattern instead of the seed overwriting them', async () => {
    const onAdded = permissionEvent()
    const onRemoved = permissionEvent()
    const seed = deferred<chrome.permissions.Permissions>()
    const getAll = vi.fn(() => {
      expect(onAdded.count()).toBe(1)
      expect(onRemoved.count()).toBe(1)
      return seed.promise
    })
    vi.stubGlobal('chrome', { permissions: { getAll, onAdded, onRemoved } })
    const { initializePermissionMirror, permissionMirror } = await import('./permissionMirror')

    const initializing = initializePermissionMirror()
    onRemoved.emit({ origins: ['https://removed.example.com/*'] })
    onAdded.emit({ origins: ['https://added.example.com/*'] })
    seed.resolve({ origins: ['https://removed.example.com/*', 'https://seed.example.com/*'] })
    await expect(initializing).resolves.toBeUndefined()

    expect(
      permissionMirror.snapshot([
        'https://removed.example.com/*',
        'https://added.example.com/*',
        'https://seed.example.com/*',
        'https://absent.example.com/*',
      ]),
    ).toEqual({
      status: 'ready',
      preExisting: ['https://added.example.com/*', 'https://seed.example.com/*'],
      absent: ['https://removed.example.com/*', 'https://absent.example.com/*'],
    })
    expect(getAll).toHaveBeenCalledTimes(1)
  })

  it('keeps long-lived listeners active after initialization so later permission changes update synchronous snapshots', async () => {
    const onAdded = permissionEvent()
    const onRemoved = permissionEvent()
    vi.stubGlobal('chrome', {
      permissions: { getAll: vi.fn().mockResolvedValue({ origins: ['https://held.example.com/*'] }), onAdded, onRemoved },
    })
    const { initializePermissionMirror, permissionMirror } = await import('./permissionMirror')
    await initializePermissionMirror()

    const listener = vi.fn()
    const unsubscribe = permissionMirror.subscribe(listener)
    onRemoved.emit({ origins: ['https://held.example.com/*'] })
    onAdded.emit({ origins: ['https://later.example.com/*'] })

    expect(permissionMirror.snapshot(['https://held.example.com/*', 'https://later.example.com/*'])).toEqual({
      status: 'ready',
      preExisting: ['https://later.example.com/*'],
      absent: ['https://held.example.com/*'],
    })
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('records an explicit unavailable state when seeding rejects while allowing startup initialization to settle', async () => {
    const onAdded = permissionEvent()
    const onRemoved = permissionEvent()
    vi.stubGlobal('chrome', {
      permissions: { getAll: vi.fn().mockRejectedValue(new Error('permissions unavailable')), onAdded, onRemoved },
    })
    const { initializePermissionMirror, permissionMirror } = await import('./permissionMirror')

    await expect(initializePermissionMirror()).resolves.toBeUndefined()
    expect(permissionMirror.snapshot(['https://a.example.com/*'])).toEqual({
      status: 'unavailable',
      preExisting: [],
      absent: [],
    })
  })

  it('records unavailable and settles when the Chrome permissions boundary is missing, so startup can still render', async () => {
    vi.stubGlobal('chrome', undefined)
    const { initializePermissionMirror, permissionMirror } = await import('./permissionMirror')

    await expect(initializePermissionMirror()).resolves.toBeUndefined()
    expect(permissionMirror.snapshot(['https://a.example.com/*'])).toEqual({
      status: 'unavailable',
      preExisting: [],
      absent: [],
    })
  })

  it.each(['onAdded', 'onRemoved'] as const)(
    'records unavailable and settles when %s listener registration throws before getAll',
    async (failingEvent) => {
      const onAdded = permissionEvent()
      const onRemoved = permissionEvent()
      const throwing = { addListener: vi.fn(() => { throw new Error(`${failingEvent} unavailable`) }) }
      const getAll = vi.fn().mockResolvedValue({ origins: [] })
      vi.stubGlobal('chrome', {
        permissions: {
          getAll,
          onAdded: failingEvent === 'onAdded' ? throwing : onAdded,
          onRemoved: failingEvent === 'onRemoved' ? throwing : onRemoved,
        },
      })
      const { initializePermissionMirror, permissionMirror } = await import('./permissionMirror')

      await expect(initializePermissionMirror()).resolves.toBeUndefined()
      expect(permissionMirror.snapshot(['https://a.example.com/*'])).toEqual({
        status: 'unavailable',
        preExisting: [],
        absent: [],
      })
      expect(getAll).not.toHaveBeenCalled()
    },
  )
})
