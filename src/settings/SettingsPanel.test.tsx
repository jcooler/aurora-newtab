// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../lib/storage/index'
import { memoryDriver } from '../lib/storage/driver'
import { StorageProvider } from '../lib/storage/context'
import { parseBackup } from '../lib/backup'
import { CURRENT_VERSION, defaults } from '../lib/storage/schema'
import { addUploads, listUploads, removeUpload } from '../lib/idb'
import SettingsPanel from './SettingsPanel'

// Only the Background section's gallery touches IndexedDB; mock the whole
// module so those tests don't need real IndexedDB (unavailable in jsdom) —
// same pattern as Background.test.tsx.
vi.mock('../lib/idb', () => ({
  addUploads: vi.fn(),
  listUploads: vi.fn(),
  removeUpload: vi.fn(),
}))

// No jest-dom matchers are registered in this project (see vitest.config.ts),
// so attribute checks go through getAttribute() + toBe() like the rest of the
// suite (e.g. Background.test.tsx's querySelector/toBeNull checks) rather
// than toHaveAttribute().
function attr(el: Element, name: string) {
  return el.getAttribute(name)
}

async function renderPanel() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  render(
    <StorageProvider storage={storage}>
      <SettingsPanel />
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
        <SettingsPanel />
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

    expect(await screen.findByText("That file isn't valid JSON.")).toBeTruthy()
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
        <SettingsPanel />
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
})
