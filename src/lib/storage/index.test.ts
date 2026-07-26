import { describe, expect, it, vi } from 'vitest'
import { createStorage } from './index'
import { memoryDriver } from './driver'
import { CURRENT_VERSION, defaults } from './schema'

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
})
