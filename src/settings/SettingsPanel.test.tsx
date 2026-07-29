// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createStorage } from '../lib/storage/index'
import { memoryDriver } from '../lib/storage/driver'
import { StorageProvider } from '../lib/storage/context'
import { parseBackup } from '../lib/backup'
import { CURRENT_VERSION, defaults } from '../lib/storage/schema'
import { addUploads, listUploads, removeUpload } from '../lib/idb'
import { ensureBookmarksPermission } from '../services/bookmarks'
import SettingsPanel from './SettingsPanel'

// Only the Background section's gallery touches IndexedDB; mock the whole
// module so those tests don't need real IndexedDB (unavailable in jsdom) —
// same pattern as Background.test.tsx.
vi.mock('../lib/idb', () => ({
  addUploads: vi.fn(),
  listUploads: vi.fn(),
  removeUpload: vi.fn(),
}))

// The Widgets section's bookmarks toggle calls ensureBookmarksPermission,
// which touches chrome.permissions — unavailable in jsdom. Mock it the same
// way BookmarksBar.test.tsx mocks the rest of this service module.
vi.mock('../services/bookmarks', () => ({ ensureBookmarksPermission: vi.fn() }))

// isPremium() is hardcoded true today — mocked (defaulting to true, same as
// useLongPress.test.tsx / ArrangeController.test.tsx) so the Layout section's
// premium-gating test below can flip it false without touching the real
// module every other test in this file relies on.
vi.mock('../lib/premium', () => ({ isPremium: vi.fn(() => true) }))
import { isPremium } from '../lib/premium'

// No jest-dom matchers are registered in this project (see vitest.config.ts),
// so attribute checks go through getAttribute() + toBe() like the rest of the
// suite (e.g. Background.test.tsx's querySelector/toBeNull checks) rather
// than toHaveAttribute().
function attr(el: Element, name: string) {
  return el.getAttribute(name)
}

async function renderPanel(onArrangeLayout: () => void = () => {}) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  render(
    <StorageProvider storage={storage}>
      <SettingsPanel onArrangeLayout={onArrangeLayout} />
    </StorageProvider>,
  )
  // Settings resolves asynchronously (useStoredKey's storage.get().then(...)),
  // so the radiogroup isn't there on the synchronous first render.
  await screen.findAllByRole('radio')
  return storage
}

function themeGroup() {
  return screen.getByRole('radiogroup', { name: 'Theme' })
}

describe('SettingsPanel theme radiogroup (APG roving-tabindex pattern)', () => {
  it('only the selected theme (default: Aurora) is a tab stop; the rest are -1', async () => {
    await renderPanel()
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['Aurora', 'Glass', 'Mono'])

    const aurora = screen.getByRole('radio', { name: 'Aurora' })
    expect(attr(aurora, 'tabindex')).toBe('0')
    expect(attr(aurora, 'aria-checked')).toBe('true')

    for (const name of ['Glass', 'Mono']) {
      const radio = screen.getByRole('radio', { name })
      expect(attr(radio, 'tabindex')).toBe('-1')
      expect(attr(radio, 'aria-checked')).toBe('false')
    }
  })

  it('ArrowRight moves selection AND applies it: persists, updates aria-checked/tabindex, and moves focus', async () => {
    const storage = await renderPanel()

    await act(async () => {
      fireEvent.keyDown(themeGroup(), { key: 'ArrowRight' })
    })

    const glass = await screen.findByRole('radio', { name: 'Glass' })
    expect(attr(glass, 'aria-checked')).toBe('true')
    expect(attr(glass, 'tabindex')).toBe('0')
    expect(document.activeElement).toBe(glass)

    const aurora = screen.getByRole('radio', { name: 'Aurora' })
    expect(attr(aurora, 'aria-checked')).toBe('false')
    expect(attr(aurora, 'tabindex')).toBe('-1')

    expect((await storage.get('settings')).theme).toBe('glass')
  })

  it('ArrowDown aliases ArrowRight: moves selection AND applies it', async () => {
    const storage = await renderPanel()

    await act(async () => {
      fireEvent.keyDown(themeGroup(), { key: 'ArrowDown' })
    })

    const glass = await screen.findByRole('radio', { name: 'Glass' })
    expect(attr(glass, 'aria-checked')).toBe('true')
    expect(attr(glass, 'tabindex')).toBe('0')
    expect(document.activeElement).toBe(glass)

    const aurora = screen.getByRole('radio', { name: 'Aurora' })
    expect(attr(aurora, 'aria-checked')).toBe('false')
    expect(attr(aurora, 'tabindex')).toBe('-1')

    expect((await storage.get('settings')).theme).toBe('glass')
  })

  it('ArrowLeft wraps from the first theme (Aurora) to the last (Mono)', async () => {
    const storage = await renderPanel()

    await act(async () => {
      fireEvent.keyDown(themeGroup(), { key: 'ArrowLeft' })
    })

    const mono = await screen.findByRole('radio', { name: 'Mono' })
    expect(attr(mono, 'aria-checked')).toBe('true')
    expect(attr(mono, 'tabindex')).toBe('0')
    expect(document.activeElement).toBe(mono)

    expect((await storage.get('settings')).theme).toBe('mono')
  })

  it('End selects the last theme, Home returns to the first', async () => {
    const storage = await renderPanel()

    await act(async () => {
      fireEvent.keyDown(themeGroup(), { key: 'End' })
    })
    const mono = await screen.findByRole('radio', { name: 'Mono' })
    expect(attr(mono, 'aria-checked')).toBe('true')
    expect(document.activeElement).toBe(mono)
    expect((await storage.get('settings')).theme).toBe('mono')

    await act(async () => {
      fireEvent.keyDown(themeGroup(), { key: 'Home' })
    })
    const aurora = await screen.findByRole('radio', { name: 'Aurora' })
    expect(attr(aurora, 'aria-checked')).toBe('true')
    expect(document.activeElement).toBe(aurora)
    expect((await storage.get('settings')).theme).toBe('aurora')
  })
})

describe('SettingsPanel Weather section (clear-location control)', () => {
  it('is absent when no location is stored', async () => {
    await renderPanel()
    expect(screen.queryByRole('region', { name: 'Weather' })).toBeNull()
  })

  it('clearing the location resets both location and weatherCache', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('location', { lat: 1, lon: 2, label: 'Springfield', manual: true })
    await storage.set('weatherCache', {
      current: { tempC: 20, feelsLikeC: 19, code: 0, windKmh: 5, humidity: 50 },
      hourly: [],
      fetchedAt: Date.now(),
      locationLabel: 'Springfield',
    })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')

    const clearButton = await screen.findByRole('button', { name: 'Springfield — clear' })
    await act(async () => {
      fireEvent.click(clearButton)
    })

    expect(await storage.get('location')).toBeNull()
    expect(await storage.get('weatherCache')).toBeNull()
  })
})

describe('SettingsPanel Widgets section (bookmarks permission)', () => {
  beforeEach(() => {
    vi.mocked(ensureBookmarksPermission).mockReset()
  })

  it('denying the bookmarks permission keeps the toggle off and shows an inline alert', async () => {
    vi.mocked(ensureBookmarksPermission).mockResolvedValue(false)
    const storage = await renderPanel()
    const toggle = screen.getByLabelText('Bookmarks bar') as HTMLInputElement
    expect(toggle.checked).toBe(false)

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(ensureBookmarksPermission).toHaveBeenCalledOnce()
    expect(toggle.checked).toBe(false)
    const error = await screen.findByRole('alert')
    expect(error.textContent).toBeTruthy()
    expect(toggle.getAttribute('aria-describedby')).toBe(error.id)
    expect((await storage.get('settings')).widgets.bookmarks).toBe(false)
  })

  it('a rejected ensureBookmarksPermission (not just an explicit false) is caught and routed to the same alert, not left as an unhandled rejection', async () => {
    vi.mocked(ensureBookmarksPermission).mockRejectedValue(new Error('gesture context lost'))
    const storage = await renderPanel()
    const toggle = screen.getByLabelText('Bookmarks bar') as HTMLInputElement

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(toggle.checked).toBe(false)
    const error = await screen.findByRole('alert')
    expect(error.textContent).toBeTruthy()
    expect(toggle.getAttribute('aria-describedby')).toBe(error.id)
    expect((await storage.get('settings')).widgets.bookmarks).toBe(false)
  })

  it('granting the bookmarks permission turns the toggle on and shows no alert', async () => {
    vi.mocked(ensureBookmarksPermission).mockResolvedValue(true)
    const storage = await renderPanel()
    const toggle = screen.getByLabelText('Bookmarks bar') as HTMLInputElement

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(toggle.checked).toBe(true)
    expect((await storage.get('settings')).widgets.bookmarks).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(toggle.getAttribute('aria-describedby')).toBeNull()
  })

  it('turning the widget back off never requests the permission', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, bookmarks: true },
    })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')
    const toggle = screen.getByLabelText('Bookmarks bar') as HTMLInputElement
    expect(toggle.checked).toBe(true)

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(ensureBookmarksPermission).not.toHaveBeenCalled()
    expect(toggle.checked).toBe(false)
    expect((await storage.get('settings')).widgets.bookmarks).toBe(false)
  })
})

describe('SettingsPanel Data section (export/import backup)', () => {
  it('export builds a parseable envelope via a Blob + object URL', async () => {
    let capturedBlob: Blob | null = null
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL at all
    // (spyOn requires the method to already exist), so they're stubbed
    // directly rather than spied-on.
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob
      return 'blob:mock-url'
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
    // jsdom doesn't implement the "download" navigation an <a click> would
    // trigger; the component's logic (Blob + createObjectURL) already ran by
    // the time .click() fires, so stubbing it out avoids a jsdom "Not
    // implemented: navigation" error without affecting what's under test.
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    const storage = await renderPanel()
    await storage.set('links', [{ id: '1', title: 'HN', url: 'https://news.ycombinator.com' }])

    const exportButton = await screen.findByRole('button', { name: 'Export' })
    await act(async () => {
      fireEvent.click(exportButton)
    })

    expect(capturedBlob).not.toBeNull()
    const text = await (capturedBlob as unknown as Blob).text()
    const result = parseBackup(text)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.version).toBe(CURRENT_VERSION)
      expect(result.data.links).toEqual([
        { id: '1', title: 'HN', url: 'https://news.ycombinator.com' },
      ])
    }

    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    clickSpy.mockRestore()
  })

  it('import happy path: parses, shows a confirm summary, and writes storage on confirm', async () => {
    const storage = await renderPanel()
    const backupData = {
      ...defaults(),
      links: [{ id: 'a', title: 'Example', url: 'https://example.com' }],
    }
    const backupText = JSON.stringify({
      app: 'aurora',
      version: CURRENT_VERSION,
      exportedAt: '2026-07-20T00:00:00.000Z',
      data: backupData,
    })
    const file = new File([backupText], 'aurora-backup-2026-07-20.json', {
      type: 'application/json',
    })

    const input = screen.getByLabelText('Import backup') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
      // File.text() is async; let the component's handler resolve.
      await Promise.resolve()
      await Promise.resolve()
    })

    const confirmButton = await screen.findByRole('button', { name: 'Confirm' })
    expect(screen.getByText(/Replace current data\?/)).toBeTruthy()
    expect(screen.getByText(/2026-07-20/)).toBeTruthy()

    await act(async () => {
      fireEvent.click(confirmButton)
    })

    expect(await storage.get('links')).toEqual([
      { id: 'a', title: 'Example', url: 'https://example.com' },
    ])
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  it('malformed import shows the rejection reason inline and writes nothing', async () => {
    const storage = await renderPanel()
    const before = await storage.get('links')
    const file = new File(['not json at all {'], 'broken.json', { type: 'application/json' })

    const input = screen.getByLabelText('Import backup') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
      await Promise.resolve()
      await Promise.resolve()
    })

    const error = await screen.findByText("That file isn't valid JSON.")
    expect(error.getAttribute('role')).toBe('alert')
    expect(input.getAttribute('aria-describedby')).toBe(error.id)
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
    expect(await storage.get('links')).toEqual(before)
  })

  it('a shape-invalid backup (envelope is fine, a key is hand-edited garbage) is rejected before Confirm is offered', async () => {
    // Regression coverage for the bug this fix targets: envelope-level
    // checks (parseBackup) all pass, migrate() is a no-op at CURRENT_VERSION,
    // and without per-key shape validation this would sail through to
    // storage.set and later throw at render time. `links` as an object
    // (rather than an array) exercises that path end-to-end through the
    // real component, not just the pure validateBackupShape unit.
    const storage = await renderPanel()
    const before = await storage.get('links')
    const backupText = JSON.stringify({
      app: 'aurora',
      version: CURRENT_VERSION,
      exportedAt: '2026-07-20T00:00:00.000Z',
      data: { ...defaults(), links: { oops: 'not an array' } },
    })
    const file = new File([backupText], 'aurora-backup-2026-07-20.json', {
      type: 'application/json',
    })

    const input = screen.getByLabelText('Import backup') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByText('That backup\'s "links" data is invalid.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
    expect(await storage.get('links')).toEqual(before)
  })
})

describe('SettingsPanel Background section (upload gallery)', () => {
  let originalCreate: typeof URL.createObjectURL
  let originalRevoke: typeof URL.revokeObjectURL

  beforeEach(() => {
    vi.mocked(addUploads).mockReset().mockResolvedValue(undefined)
    vi.mocked(listUploads).mockReset().mockResolvedValue([])
    vi.mocked(removeUpload).mockReset().mockResolvedValue(undefined)
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL at all
    // (spyOn requires the method to already exist), so they're stubbed
    // directly, same as Background.test.tsx.
    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock-url') as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
  })

  afterEach(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  async function renderPanelInUploadMode() {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('photoPrefs', { mode: 'upload', index: 0, lastRotated: '' })
    const { unmount } = render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')
    // Flush the gallery effect's listUploads() call, same as
    // Background.test.tsx does after mounting in upload mode.
    await act(async () => {})
    return { storage, unmount }
  }

  // A single `await Promise.resolve()` or two isn't reliably enough hops to
  // drain onChange's `await addUploads(...); await storage.update(...)` —
  // the latter is itself a multi-hop read-modify-write chain (see
  // lib/storage/index.ts). A macrotask flush drains the whole microtask
  // queue regardless of chain depth, so it's used instead of guessing a hop count.
  async function flushAsyncWork() {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('selecting files calls addUploads with the files and stamps the uploadedAt nonce', async () => {
    const { storage } = await renderPanelInUploadMode()
    const fileA = new File(['a'], 'a.png', { type: 'image/png' })
    const fileB = new File(['b'], 'b.png', { type: 'image/png' })

    const input = screen.getByLabelText('Image files') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [fileA, fileB] } })
      await flushAsyncWork()
    })

    expect(addUploads).toHaveBeenCalledWith([fileA, fileB])
    expect((await storage.get('photoPrefs')).uploadedAt).toBeTruthy()
  })

  it('renders one thumbnail per upload from the mocked gallery', async () => {
    vi.mocked(listUploads).mockResolvedValue([
      { key: 'photo:a', blob: new Blob(['a'], { type: 'image/png' }) },
      { key: 'photo:b', blob: new Blob(['b'], { type: 'image/png' }) },
    ])
    const { unmount } = await renderPanelInUploadMode()

    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove photo 2' })).toBeTruthy()

    // Unmount now, while URL.revokeObjectURL is still the stub installed
    // above: the thumbnail grid holds live object URLs, so the unmount
    // effect calls revokeObjectURL, and this describe block's afterEach
    // restores the (jsdom-absent) original before RTL's automatic
    // post-test cleanup would otherwise unmount it — see Background.test.tsx.
    unmount()
  })

  it('the ✕ on a thumbnail calls removeUpload with its key and stamps the uploadedAt nonce', async () => {
    vi.mocked(listUploads).mockResolvedValue([
      { key: 'photo:a', blob: new Blob(['a'], { type: 'image/png' }) },
      { key: 'photo:b', blob: new Blob(['b'], { type: 'image/png' }) },
    ])
    const { storage, unmount } = await renderPanelInUploadMode()
    const before = (await storage.get('photoPrefs')).uploadedAt

    const removeSecond = await screen.findByRole('button', { name: 'Remove photo 2' })
    await act(async () => {
      fireEvent.click(removeSecond)
      await flushAsyncWork()
    })

    expect(removeUpload).toHaveBeenCalledWith('photo:b')
    const after = (await storage.get('photoPrefs')).uploadedAt
    expect(after).toBeTruthy()
    expect(after).not.toBe(before)

    // Same live-object-URL ordering concern as the previous test.
    unmount()
  })

  it('an addUploads rejection (e.g. IDB quota) shows an inline alert and does not stamp the nonce; a later successful add clears it', async () => {
    vi.mocked(addUploads).mockRejectedValueOnce(new Error('QuotaExceededError'))
    const { storage } = await renderPanelInUploadMode()
    const before = (await storage.get('photoPrefs')).uploadedAt

    const fileInput = screen.getByLabelText('Image files') as HTMLInputElement
    const fileA = new File(['a'], 'a.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [fileA] } })
      await flushAsyncWork()
    })

    const error = await screen.findByRole('alert')
    expect(error.textContent).toBeTruthy()
    expect(fileInput.getAttribute('aria-describedby')).toBe(error.id)
    // Fire-and-forget was the bug: a failed add must not silently stamp the
    // nonce as if the photo were saved.
    expect((await storage.get('photoPrefs')).uploadedAt).toBe(before)

    // A later successful add clears the error, same as the zone-add idiom.
    const fileB = new File(['b'], 'b.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [fileB] } })
      await flushAsyncWork()
    })

    expect(screen.queryByRole('alert')).toBeNull()
    expect(fileInput.getAttribute('aria-describedby')).toBeNull()
    expect((await storage.get('photoPrefs')).uploadedAt).not.toBe(before)
  })

  it('a removeUpload rejection shows an inline alert and does not stamp the nonce; a later successful remove clears it', async () => {
    vi.mocked(listUploads).mockResolvedValue([
      { key: 'photo:a', blob: new Blob(['a'], { type: 'image/png' }) },
    ])
    vi.mocked(removeUpload).mockRejectedValueOnce(new Error('boom'))
    const { storage, unmount } = await renderPanelInUploadMode()
    const before = (await storage.get('photoPrefs')).uploadedAt

    const removeButton = await screen.findByRole('button', { name: 'Remove photo 1' })
    await act(async () => {
      fireEvent.click(removeButton)
      await flushAsyncWork()
    })

    const error = await screen.findByRole('alert')
    expect(error.textContent).toBeTruthy()
    expect((await storage.get('photoPrefs')).uploadedAt).toBe(before)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }))
      await flushAsyncWork()
    })

    expect(screen.queryByRole('alert')).toBeNull()
    expect((await storage.get('photoPrefs')).uploadedAt).not.toBe(before)

    // Same live-object-URL ordering concern as the other gallery tests above.
    unmount()
  })
})

describe('SettingsPanel World clocks section', () => {
  function worldClocksRegion() {
    return screen.getByRole('region', { name: 'World clocks' })
  }

  it('typing a zone defaults the label to its city segment; submitting persists both and resets the form', async () => {
    const storage = await renderPanel()
    const zoneInput = screen.getByLabelText('Time zone') as HTMLInputElement

    await act(async () => {
      fireEvent.change(zoneInput, { target: { value: 'Asia/Tokyo' } })
    })
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Tokyo')

    await act(async () => {
      fireEvent.click(within(worldClocksRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(await storage.get('worldClocks')).toEqual([{ zone: 'Asia/Tokyo', label: 'Tokyo' }])
    expect(zoneInput.value).toBe('')
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('')
  })

  it('editing the label field overrides the city-segment default', async () => {
    const storage = await renderPanel()
    const zoneInput = screen.getByLabelText('Time zone')
    const labelInput = screen.getByLabelText('Label') as HTMLInputElement

    await act(async () => {
      fireEvent.change(zoneInput, { target: { value: 'America/New_York' } })
      fireEvent.change(labelInput, { target: { value: 'NYC' } })
      fireEvent.click(within(worldClocksRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(await storage.get('worldClocks')).toEqual([{ zone: 'America/New_York', label: 'NYC' }])
  })

  it('an unrecognized zone shows an inline error and persists nothing', async () => {
    const storage = await renderPanel()
    const zoneInput = screen.getByLabelText('Time zone')

    await act(async () => {
      fireEvent.change(zoneInput, { target: { value: 'Not/AZone' } })
      fireEvent.click(within(worldClocksRegion()).getByRole('button', { name: 'Add' }))
    })

    const error = screen.getByText('Pick a time zone from the list.')
    expect(error).toBeTruthy()
    expect(error.getAttribute('role')).toBe('alert')
    expect(zoneInput.getAttribute('aria-describedby')).toBe(error.id)
    expect(await storage.get('worldClocks')).toEqual([])
  })

  it('the remove button on a zone row deletes just that zone', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('worldClocks', [
      { zone: 'Asia/Tokyo', label: 'Tokyo' },
      { zone: 'Europe/London', label: 'London' },
    ])
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Tokyo' }))
    })

    expect(await storage.get('worldClocks')).toEqual([{ zone: 'Europe/London', label: 'London' }])
  })

  it('hides the add row once 4 zones are stored (the max)', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('worldClocks', [
      { zone: 'Asia/Tokyo', label: 'Tokyo' },
      { zone: 'Europe/London', label: 'London' },
      { zone: 'America/New_York', label: 'New York' },
      { zone: 'Australia/Sydney', label: 'Sydney' },
    ])
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')

    expect(await screen.findByText('Australia/Sydney')).toBeTruthy()
    expect(screen.queryByLabelText('Time zone')).toBeNull()
  })
})

describe('SettingsPanel Countdowns section', () => {
  function countdownsRegion() {
    return screen.getByRole('region', { name: 'Countdowns' })
  }

  it('adding a countdown persists it and resets the form', async () => {
    const storage = await renderPanel()
    const nameInput = screen.getByLabelText('New countdown name') as HTMLInputElement
    const dateInput = screen.getByLabelText('New countdown date') as HTMLInputElement

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Launch' } })
      fireEvent.change(dateInput, { target: { value: '2026-08-09' } })
      fireEvent.click(within(countdownsRegion()).getByRole('button', { name: 'Add' }))
    })

    const stored = await storage.get('countdowns')
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ name: 'Launch', date: '2026-08-09' })
    expect(typeof stored[0]!.id).toBe('string')
    expect(nameInput.value).toBe('')
  })

  it('a blank name or date is not added', async () => {
    const storage = await renderPanel()
    const dateInput = screen.getByLabelText('New countdown date')

    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-08-09' } })
      fireEvent.click(within(countdownsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(await storage.get('countdowns')).toEqual([])
  })

  it('the remove button on a countdown row deletes just that countdown', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('countdowns', [
      { id: 'c1', name: 'Launch', date: '2026-08-09' },
      { id: 'c2', name: 'Trip', date: '2026-09-01' },
    ])
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Launch' }))
    })

    expect(await storage.get('countdowns')).toEqual([{ id: 'c2', name: 'Trip', date: '2026-09-01' }])
  })

  it('editing a countdown date on blur-equivalent change persists the new date', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('countdowns', [{ id: 'c1', name: 'Launch', date: '2026-08-09' }])
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')

    const dateInput = screen.getByLabelText('Countdown date')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-08-20' } })
    })

    expect(await storage.get('countdowns')).toEqual([{ id: 'c1', name: 'Launch', date: '2026-08-20' }])
  })
})

describe('SettingsPanel Layout section (arrange entry + reset)', () => {
  afterEach(() => {
    // Only the premium-gating test below ever flips this — reset so it never
    // leaks into a later test/file even if execution order ever changes.
    vi.mocked(isPremium).mockReturnValue(true)
  })

  function layoutRegion() {
    return screen.getByRole('region', { name: 'Layout' })
  }

  it('Arrange layout calls the onArrangeLayout callback threaded down from App (which closes the drawer, then bumps ArrangeController\'s openSignal nonce)', async () => {
    const onArrangeLayout = vi.fn()
    await renderPanel(onArrangeLayout)

    fireEvent.click(within(layoutRegion()).getByRole('button', { name: 'Arrange layout' }))

    expect(onArrangeLayout).toHaveBeenCalledOnce()
  })

  it('Reset layout needs two clicks: the first only arms (swaps the label to the confirm copy) and writes nothing, the second writes {}', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', { clock: { x: 10, y: 10 } })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')

    const resetButton = within(layoutRegion()).getByRole('button', { name: 'Reset layout' })
    fireEvent.click(resetButton)
    expect(await storage.get('layout')).toEqual({ clock: { x: 10, y: 10 } }) // one click: armed, not written
    expect(
      within(layoutRegion()).getByRole('button', {
        name: 'Reset layout? This puts every widget back.',
      }),
    ).toBeTruthy()

    fireEvent.click(resetButton)
    expect(await storage.get('layout')).toEqual({})
  })

  it('both buttons are absent entirely (no dead/disabled buttons) when isPremium() is false', async () => {
    vi.mocked(isPremium).mockReturnValue(false)
    await renderPanel()

    expect(screen.queryByRole('region', { name: 'Layout' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Arrange layout' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Reset layout/ })).toBeNull()
  })
})
