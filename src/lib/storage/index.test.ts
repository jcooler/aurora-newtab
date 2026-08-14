import { describe, expect, it, vi } from 'vitest'
import { createStorage } from './index'
import { memoryDriver, type StorageDriver } from './driver'
import { CURRENT_VERSION, defaults } from './schema'
import {
  createInProcessStorageAuthority,
  type StorageAuthority,
} from './authority'

function recordingAuthority(events: string[] = []): StorageAuthority {
  const inner = createInProcessStorageAuthority()
  return {
    runExclusive: (work) => inner.runExclusive(async () => {
      events.push('lock:enter')
      try {
        return await work()
      } finally {
        events.push('lock:exit')
      }
    }),
  }
}

describe('createStorage', () => {
  it('init seeds defaults and stamps the version on first run', async () => {
    const driver = memoryDriver()
    await createStorage(driver).init()
    expect(driver.dump()['aurora:version']).toBe(CURRENT_VERSION)
    expect(driver.dump()['settings']).toEqual(defaults().settings)
  })

  it('init preserves existing data at the current version', async () => {
    const driver = memoryDriver({
      'aurora:version': CURRENT_VERSION,
      settings: { ...defaults().settings, name: 'Jon' },
    })
    const storage = createStorage(driver)
    await storage.init()
    expect((await storage.get('settings')).name).toBe('Jon')
  })

  it('first-run init acquires once, reads all data, and writes defaults plus the version', async () => {
    const events: string[] = []
    const base = memoryDriver()
    const driver: StorageDriver = {
      async read(keys) {
        events.push(`read:${keys === null ? 'null' : keys.join(',')}`)
        return base.read(keys)
      },
      async write(patch) {
        events.push('write')
        await base.write(patch)
      },
      onChanged: (cb) => base.onChanged(cb),
    }

    await createStorage(driver, recordingAuthority(events)).init()

    expect(events).toEqual(['lock:enter', 'read:null', 'write', 'lock:exit'])
    expect(base.dump()['aurora:version']).toBe(CURRENT_VERSION)
    expect(base.dump().settings).toEqual(defaults().settings)
  })

  it('old-version init migrates under one acquisition, preserves user data, and stamps once', async () => {
    const events: string[] = []
    const base = memoryDriver({
      'aurora:version': 8,
      settings: {
        ...defaults().settings,
        name: 'Migrated',
        widgets: {
          search: true, weather: true, links: true, todo: true, timer: false,
          quote: true, bookmarks: false, notes: true, clocks: false,
          countdown: false, habits: false, monthCal: false,
        },
      },
    })
    const driver: StorageDriver = {
      async read(keys) {
        events.push(`read:${keys === null ? 'null' : keys.join(',')}`)
        return base.read(keys)
      },
      async write(patch) {
        events.push('write')
        await base.write(patch)
      },
      onChanged: (cb) => base.onChanged(cb),
    }

    await createStorage(driver, recordingAuthority(events)).init()

    expect(events).toEqual(['lock:enter', 'read:null', 'write', 'lock:exit'])
    expect(base.dump()['aurora:version']).toBe(CURRENT_VERSION)
    expect((base.dump().settings as ReturnType<typeof defaults>['settings']).name).toBe('Migrated')
    expect((base.dump().settings as ReturnType<typeof defaults>['settings']).widgets.sun).toBe(false)
    expect((base.dump().settings as ReturnType<typeof defaults>['settings']).widgets.moon).toBe(false)
  })

  it('future-version init warns under one acquisition and performs no write', async () => {
    const events: string[] = []
    const base = memoryDriver({ 'aurora:version': CURRENT_VERSION + 1 })
    const driver: StorageDriver = {
      async read(keys) {
        events.push(`read:${keys === null ? 'null' : keys.join(',')}`)
        return base.read(keys)
      },
      async write(patch) {
        events.push('write')
        await base.write(patch)
      },
      onChanged: (cb) => base.onChanged(cb),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await createStorage(driver, recordingAuthority(events)).init()

    expect(events).toEqual(['lock:enter', 'read:null', 'lock:exit'])
    expect(warn).toHaveBeenCalledWith(
      `Aurora data is schema v${CURRENT_VERSION + 1}, app expects v${CURRENT_VERSION}`,
    )
    warn.mockRestore()
  })

  it('get falls back to defaults for a missing key', async () => {
    const storage = createStorage(memoryDriver({ 'aurora:version': CURRENT_VERSION }))
    await storage.init()
    expect(await storage.get('timerConfig')).toEqual({ workMinutes: 25, breakMinutes: 5 })
  })

  it('set/get round-trips', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('focus', { text: 'Ship M2', date: '2026-07-26', done: false })
    expect((await storage.get('focus'))?.text).toBe('Ship M2')
  })

  it('update applies a function to the current value', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('links', [{ id: 'a', title: 'A', url: 'https://a.example' }])
    const out = await storage.update('links', (links) => [
      ...links,
      { id: 'b', title: 'B', url: 'https://b.example' },
    ])
    expect(out.map((l) => l.id)).toEqual(['a', 'b'])
    expect(await storage.get('links')).toEqual(out)
  })

  it('subscribe fires for its key only, and unsubscribe stops it', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const onFocus = vi.fn()
    const unsub = storage.subscribe('focus', onFocus)
    await storage.set('links', [])
    expect(onFocus).not.toHaveBeenCalled()
    await storage.set('focus', { text: 'x', date: '2026-07-26', done: false })
    expect(onFocus).toHaveBeenCalledWith({ text: 'x', date: '2026-07-26', done: false })
    unsub()
    await storage.set('focus', null)
    expect(onFocus).toHaveBeenCalledTimes(1)
  })

  it('a deep-equal write does not notify subscribers; a changed write does', async () => {
    // chrome.storage.onChanged never fires for a write that doesn't actually
    // change the stored value. memoryDriver must be faithful to that or bugs
    // like the photo-upload no-op (deep-equal re-save of photoPrefs) slip past
    // tests that use a more permissive double.
    const storage = createStorage(memoryDriver())
    await storage.init()
    const onPhotoPrefs = vi.fn()
    storage.subscribe('photoPrefs', onPhotoPrefs)

    const current = await storage.get('photoPrefs')
    await storage.set('photoPrefs', { ...current })
    expect(onPhotoPrefs).not.toHaveBeenCalled()

    const changed = { ...current, mode: 'gradient' as const }
    await storage.set('photoPrefs', changed)
    expect(onPhotoPrefs).toHaveBeenCalledTimes(1)
    expect(onPhotoPrefs).toHaveBeenCalledWith(changed)
  })

  it('serializes concurrent update() calls on the same key', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('todoLists', [{ id: 'l1', name: 'A', items: [] }])
    const slow = storage.update('todoLists', (lists) => [
      ...lists,
      { id: 'l2', name: 'B', items: [] },
    ])
    const fast = storage.update('todoLists', (lists) => [
      ...lists,
      { id: 'l3', name: 'C', items: [] },
    ])
    await Promise.all([slow, fast])
    const ids = (await storage.get('todoLists')).map((l) => l.id)
    expect(ids).toEqual(['l1', 'l2', 'l3']) // neither write lost
  })

  it('preserves both same-key updates from independent storage contexts', async () => {
    const base = memoryDriver({
      'aurora:version': CURRENT_VERSION,
      todoLists: [{ id: 'l1', name: 'A', items: [] }],
    })
    let waitingReads = 0
    let releaseReads = () => {}
    const readsReleased = new Promise<void>((resolve) => {
      releaseReads = resolve
    })
    const driver: StorageDriver = {
      async read(keys) {
        const value = await base.read(keys)
        if (keys?.includes('todoLists')) {
          waitingReads += 1
          if (waitingReads === 2) releaseReads()
          await Promise.race([
            readsReleased,
            new Promise<void>((resolve) => setTimeout(resolve, 25)),
          ])
        }
        return value
      },
      write: (patch) => base.write(patch),
      onChanged: (cb) => base.onChanged(cb),
    }
    const authority = createInProcessStorageAuthority()
    const first = createStorage(driver, authority)
    const second = createStorage(driver, authority)

    await Promise.all([
      first.update('todoLists', (lists) => [...lists, { id: 'l2', name: 'B', items: [] }]),
      second.update('todoLists', (lists) => [...lists, { id: 'l3', name: 'C', items: [] }]),
    ])

    expect((await first.get('todoLists')).map((list) => list.id)).toEqual(['l1', 'l2', 'l3'])
  })

  it('holds one authority acquisition across update read and write', async () => {
    const events: string[] = []
    const base = memoryDriver({
      'aurora:version': CURRENT_VERSION,
      links: [{ id: 'a', title: 'A', url: 'https://a.example' }],
    })
    const driver: StorageDriver = {
      async read(keys) {
        events.push('read')
        return base.read(keys)
      },
      async write(patch) {
        events.push('write')
        await base.write(patch)
      },
      onChanged: (cb) => base.onChanged(cb),
    }
    const storage = createStorage(driver, recordingAuthority(events))

    await storage.update('links', (links) => [
      ...links,
      { id: 'b', title: 'B', url: 'https://b.example' },
    ])

    expect(events).toEqual(['lock:enter', 'read', 'write', 'lock:exit'])
  })

  it('routes set and setMany through the same authority and propagates changed keys', async () => {
    const events: string[] = []
    const base = memoryDriver({ 'aurora:version': CURRENT_VERSION })
    const driver: StorageDriver = {
      read: (keys) => base.read(keys),
      async write(patch) {
        events.push(`write:${Object.keys(patch).sort().join(',')}`)
        await base.write(patch)
      },
      onChanged: (cb) => base.onChanged(cb),
    }
    const storage = createStorage(driver, recordingAuthority(events))
    const focusChanges = vi.fn()
    const linkChanges = vi.fn()
    storage.subscribe('focus', focusChanges)
    storage.subscribe('links', linkChanges)

    await storage.set('focus', { text: 'First', date: '2026-08-13', done: false })
    await storage.setMany({
      focus: { text: 'Ship W1-P2', date: '2026-08-13', done: false },
      links: [{ id: 'authority', title: 'Authority', url: 'https://example.com' }],
    })

    expect(events).toEqual([
      'lock:enter', 'write:focus', 'lock:exit',
      'lock:enter', 'write:focus,links', 'lock:exit',
    ])
    expect(focusChanges).toHaveBeenLastCalledWith({
      text: 'Ship W1-P2', date: '2026-08-13', done: false,
    })
    expect(linkChanges).toHaveBeenCalledWith([
      { id: 'authority', title: 'Authority', url: 'https://example.com' },
    ])
  })

  it('authority failure performs no read, updater callback, or write', async () => {
    const read = vi.fn(async () => ({ links: [] }))
    const write = vi.fn(async () => {})
    const updater = vi.fn((links: ReturnType<typeof defaults>['links']) => links)
    const authority: StorageAuthority = {
      runExclusive: async () => { throw new Error('authority failed') },
    }
    const storage = createStorage({ read, write, onChanged: () => () => {} }, authority)

    await expect(storage.update('links', updater)).rejects.toThrow('authority failed')
    expect(read).not.toHaveBeenCalled()
    expect(updater).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('a rejected write preserves the old value and the next queued update succeeds', async () => {
    const base = memoryDriver({
      'aurora:version': CURRENT_VERSION,
      links: [{ id: 'a', title: 'A', url: 'https://a.example' }],
    })
    let rejectNext = true
    const driver: StorageDriver = {
      read: (keys) => base.read(keys),
      async write(patch) {
        if (rejectNext) {
          rejectNext = false
          throw new Error('storage rejected')
        }
        await base.write(patch)
      },
      onChanged: (cb) => base.onChanged(cb),
    }
    const storage = createStorage(driver, createInProcessStorageAuthority())

    await expect(storage.update('links', (links) => [
      ...links,
      { id: 'b', title: 'B', url: 'https://b.example' },
    ])).rejects.toThrow('storage rejected')
    expect((await storage.get('links')).map((link) => link.id)).toEqual(['a'])

    await expect(storage.update('links', (links) => [
      ...links,
      { id: 'c', title: 'C', url: 'https://c.example' },
    ])).resolves.toEqual([
      { id: 'a', title: 'A', url: 'https://a.example' },
      { id: 'c', title: 'C', url: 'https://c.example' },
    ])
  })

  it('update() works when destructured (no this-binding)', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const { update, get } = storage
    await update('focus', () => ({ text: 'x', date: '2026-07-26', done: false }))
    expect((await get('focus'))?.text).toBe('x')
  })
})
