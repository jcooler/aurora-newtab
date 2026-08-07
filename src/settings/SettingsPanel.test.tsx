// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../lib/storage/index'
import { memoryDriver } from '../lib/storage/driver'
import { StorageProvider } from '../lib/storage/context'
import { parseBackup } from '../lib/backup'
import { CURRENT_VERSION, defaults } from '../lib/storage/schema'
import type { ConnectorDescriptor, GithubConfig, RssConfig } from '../services/connectors/types'
import { addUploads, listUploads, removeUpload } from '../lib/idb'
import { ensureBookmarksPermission } from '../services/bookmarks'
import SettingsPanel from './SettingsPanel'
import { authState } from './sections/Connectors'
// Imported (not hardcoded) so the About footer's version assertion below
// can't silently drift from package.json — the same file __APP_VERSION__ is
// itself derived from at build time (see vite.config.ts / vitest.config.ts).
import pkg from '../../package.json'

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

// The Connectors section's add/remove-feed flow calls ensureOrigin/removeOrigin
// (chrome.permissions — unavailable in jsdom). Mock only those two; originPattern
// stays REAL (the section's "does a remaining feed share this origin?" check
// depends on it, and the rss registry descriptor imported transitively also
// reads it).
vi.mock('../services/permissions', async (importActual) => {
  const actual = await importActual<typeof import('../services/permissions')>()
  return { ...actual, ensureOrigin: vi.fn(), removeOrigin: vi.fn() }
})
import { ensureOrigin, removeOrigin } from '../services/permissions'

// The GitHub connector card's connect flow calls whoamiGithub (a real network
// GET /user) — mock ONLY that. githubDescriptor and fetchGithub stay REAL via
// importActual, so the registry still registers github and releasableOrigins
// (used by onDisconnect below) runs its real path.
vi.mock('../services/connectors/github', async (importActual) => {
  const actual = await importActual<typeof import('../services/connectors/github')>()
  return { ...actual, whoamiGithub: vi.fn() }
})
import { whoamiGithub } from '../services/connectors/github'

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

/** The panel is tabbed (Task 40) and only the ACTIVE tab's panel is mounted,
 *  so a test whose section moved off the default General tab clicks its tab
 *  first. Purely mechanical: nothing else about any pre-existing test below
 *  changed. */
function openTab(name: 'General' | 'Widgets' | 'Connectors' | 'Data') {
  fireEvent.click(screen.getByRole('tab', { name }))
}

describe('SettingsPanel tabs (General / Widgets / Data)', () => {
  it('opens on General, showing its own sections and nothing from the other tabs', async () => {
    await renderPanel()

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'General',
      'Widgets',
      'Connectors',
      'Data',
    ])
    expect(attr(screen.getByRole('tab', { name: 'General' }), 'aria-selected')).toBe('true')

    expect(screen.getByLabelText('Your name')).toBeTruthy()
    expect(themeGroup()).toBeTruthy()
    expect(screen.getByLabelText('24-hour clock')).toBeTruthy()
    expect(screen.getByLabelText('Units')).toBeTruthy()
    expect(screen.getByLabelText('Mute sounds')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Background' })).toBeTruthy()

    // The other tabs' sections are UNMOUNTED, not hidden — the whole reason
    // this shell swaps children instead of toggling visibility.
    expect(screen.queryByLabelText('Bookmarks bar')).toBeNull()
    expect(screen.queryByRole('region', { name: 'World clocks' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Countdowns' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Layout' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Connectors' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Data' })).toBeNull()
    expect(document.querySelector('footer')).toBeNull()
  })

  it('the Connectors tab holds the connector cards and nothing from the other tabs', async () => {
    await renderPanel()
    openTab('Connectors')

    expect(screen.getByRole('region', { name: 'Connectors' })).toBeTruthy()
    // The one shipped connector card (RSS), rendered from its registry
    // descriptor — label, blurb, and its enable toggle.
    expect(screen.getByRole('heading', { name: 'RSS' })).toBeTruthy()
    expect(screen.getByLabelText('Enable RSS')).toBeTruthy()

    expect(screen.queryByLabelText('Your name')).toBeNull()
    expect(screen.queryByLabelText('Bookmarks bar')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Data' })).toBeNull()
    expect(document.querySelector('footer')).toBeNull()
  })

  it('the Widgets tab holds the toggles, world clocks, countdowns and Layout', async () => {
    await renderPanel()
    openTab('Widgets')

    expect(screen.getByRole('region', { name: 'Widgets' })).toBeTruthy()
    expect(screen.getByLabelText('Bookmarks bar')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'World clocks' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Countdowns' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Layout' })).toBeTruthy()

    expect(screen.queryByLabelText('Your name')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Background' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Data' })).toBeNull()
  })

  it('the Weather (location) section rides on the Widgets tab too', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('location', { lat: 1, lon: 2, label: 'Springfield', manual: true })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')

    expect(screen.queryByRole('region', { name: 'Weather' })).toBeNull() // not on General
    openTab('Widgets')
    expect(screen.getByRole('region', { name: 'Weather' })).toBeTruthy()
  })

  it('the Data tab holds Data and the About footer', async () => {
    await renderPanel()
    openTab('Data')

    expect(screen.getByRole('region', { name: 'Data' })).toBeTruthy()
    expect(screen.getByLabelText('Import backup')).toBeTruthy()
    expect(document.querySelector('footer')).not.toBeNull()

    expect(screen.queryByLabelText('Your name')).toBeNull()
    expect(screen.queryByLabelText('Bookmarks bar')).toBeNull()
  })
})

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
    openTab('Widgets')
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
    openTab('Widgets')

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
    openTab('Widgets')
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
    openTab('Widgets')
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
    openTab('Widgets')
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
    openTab('Widgets')
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
    openTab('Data')
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
    openTab('Data')
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
    openTab('Data')
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
    openTab('Data')
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
  // blob -> the object URL handed out for it, so a test can say WHICH blob
  // (thumb vs. full photo) a rendered tile's `src` actually points to — same
  // idiom src/newtab/components/Background.test.tsx uses for its LQIP-vs-
  // photo assertions, needed here for the thumb-vs-full-blob ones below.
  let objectUrls: Map<Blob, string>

  beforeEach(() => {
    vi.mocked(addUploads).mockReset().mockResolvedValue(undefined)
    vi.mocked(listUploads).mockReset().mockResolvedValue([])
    vi.mocked(removeUpload).mockReset().mockResolvedValue(undefined)
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL at all
    // (spyOn requires the method to already exist), so they're stubbed
    // directly, same as Background.test.tsx.
    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    objectUrls = new Map()
    let n = 0
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:mock-${n++}`
      objectUrls.set(blob, url)
      return url
    }) as typeof URL.createObjectURL
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

  it('a gallery tile renders the THUMB object URL, not the full photo, when a thumb exists', async () => {
    // The regression this covers: the grid used to build every tile's URL
    // from the full-resolution blob unconditionally, forcing a multi-MB
    // decode for a ~56px tile even though a ~32px placeholder already sat
    // right next to it in the same IndexedDB record.
    const blob = new Blob(['full-a'], { type: 'image/png' })
    const thumb = new Blob(['thumb-a'], { type: 'image/webp' })
    vi.mocked(listUploads).mockResolvedValue([{ key: 'photo:a', blob, thumb }])
    const { unmount } = await renderPanelInUploadMode()

    const [item] = await screen.findAllByRole('listitem')
    const img = item!.querySelector('img')
    expect(img?.getAttribute('src')).toBe(objectUrls.get(thumb))
    expect(img?.getAttribute('src')).not.toBe(objectUrls.get(blob))

    unmount()
  })

  it('a gallery tile falls back to the full photo when the upload has no thumb yet (pre-heal)', async () => {
    // Tolerant-migration case: an upload added before placeholders existed
    // (or mid-backfill — idb.ts's backfillThumbs runs unattended) has no
    // `thumb`. The grid must still show something for it rather than an
    // empty tile.
    const blob = new Blob(['full-a'], { type: 'image/png' })
    vi.mocked(listUploads).mockResolvedValue([{ key: 'photo:a', blob }])
    const { unmount } = await renderPanelInUploadMode()

    const [item] = await screen.findAllByRole('listitem')
    const img = item!.querySelector('img')
    expect(img?.getAttribute('src')).toBe(objectUrls.get(blob))

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
    openTab('Widgets')
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
    openTab('Widgets')
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
    openTab('Widgets')
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
    openTab('Widgets')

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
    openTab('Widgets')

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
    openTab('Widgets')
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
    openTab('Widgets')
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
    openTab('Widgets')

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
    openTab('Widgets')

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
    openTab('Widgets')

    fireEvent.click(within(layoutRegion()).getByRole('button', { name: 'Arrange layout' }))

    expect(onArrangeLayout).toHaveBeenCalledOnce()
  })

  it('Reset layout opens a real confirm dialog; Cancel writes nothing, confirming writes {}', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', { clock: { x: 10, y: 10 } })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')
    openTab('Widgets')

    fireEvent.click(within(layoutRegion()).getByRole('button', { name: 'Reset layout' }))
    expect(await storage.get('layout')).toEqual({ clock: { x: 10, y: 10 } }) // opening the dialog never writes
    // The dialog portals to document.body, outside the "Layout" region's own
    // subtree — and its confirm button shares the SAME accessible name
    // ("Reset layout") as the section button that opened it, so every
    // dialog-scoped query below goes through `within(dialog)` to disambiguate.
    let dialog = screen.getByRole('dialog', { name: 'Reset layout?' })
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' })) // safe default

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()
    expect(await storage.get('layout')).toEqual({ clock: { x: 10, y: 10 } }) // Cancel never writes

    fireEvent.click(within(layoutRegion()).getByRole('button', { name: 'Reset layout' }))
    dialog = screen.getByRole('dialog', { name: 'Reset layout?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset layout' })) // the dialog's own confirm button
    expect(await storage.get('layout')).toEqual({})
  })

  it('Escape cancels the confirm dialog without writing anything', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', { clock: { x: 10, y: 10 } })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')
    openTab('Widgets')

    fireEvent.click(within(layoutRegion()).getByRole('button', { name: 'Reset layout' }))
    expect(screen.getByRole('dialog', { name: 'Reset layout?' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()
    expect(await storage.get('layout')).toEqual({ clock: { x: 10, y: 10 } })
  })

  it('an open confirm dialog does not survive the drawer closing, so reopening within the same session shows it closed (review fix)', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', { clock: { x: 10, y: 10 } })
    function Wrapper({ open }: { open: boolean }) {
      return (
        <StorageProvider storage={storage}>
          <SettingsPanel onArrangeLayout={() => {}} open={open} />
        </StorageProvider>
      )
    }
    const { rerender } = render(<Wrapper open={true} />)
    await screen.findAllByRole('radio')
    openTab('Widgets')

    fireEvent.click(within(layoutRegion()).getByRole('button', { name: 'Reset layout' }))
    expect(screen.getByRole('dialog', { name: 'Reset layout?' })).toBeTruthy()

    rerender(<Wrapper open={false} />) // Drawer.tsx merely toggles inert/translate — SettingsPanel stays mounted
    rerender(<Wrapper open={true} />) // reopened

    expect(within(layoutRegion()).getByRole('button', { name: 'Reset layout' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()
    // And nothing was actually written by the stray open dialog.
    expect(await storage.get('layout')).toEqual({ clock: { x: 10, y: 10 } })
  })

  it('both buttons are absent entirely (no dead/disabled buttons) when isPremium() is false', async () => {
    vi.mocked(isPremium).mockReturnValue(false)
    await renderPanel()
    openTab('Widgets')

    expect(screen.queryByRole('region', { name: 'Layout' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Arrange layout' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Reset layout/ })).toBeNull()
  })
})

describe('SettingsPanel Connectors section (RSS card)', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigin).mockReset()
    vi.mocked(removeOrigin).mockReset()
  })

  async function renderWithConnectors(rss?: { enabled: boolean; feeds: string[]; shownCount: number }) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    if (rss) await storage.set('connectors', { rss })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')
    openTab('Connectors')
    return storage
  }

  function connectorsRegion() {
    return screen.getByRole('region', { name: 'Connectors' })
  }

  // ConnectorConfig is a 7-member union as of Task 46; this suite only ever
  // stores rss configs, so this single narrowing cast stands in for every
  // `.rss` read below rather than repeating an inline cast at each call site.
  async function readRss(storage: AuroraStorage): Promise<RssConfig | undefined> {
    return (await storage.get('connectors')).rss as RssConfig | undefined
  }

  it('enabling the connector writes the default config (enabled, no feeds, shownCount 5)', async () => {
    const storage = await renderWithConnectors()
    const toggle = screen.getByLabelText('Enable RSS') as HTMLInputElement
    expect(toggle.checked).toBe(false)

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect((await storage.get('connectors')).rss).toEqual({ enabled: true, feeds: [], shownCount: 5 })
  })

  it('add-feed happy path: validates https, requests the origin, then persists the feed', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithConnectors({ enabled: true, feeds: [], shownCount: 5 })

    const input = screen.getByLabelText('Add feed URL') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://news.ycombinator.com/rss' } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(ensureOrigin).toHaveBeenCalledWith('https://news.ycombinator.com/rss')
    expect((await readRss(storage))?.feeds).toEqual(['https://news.ycombinator.com/rss'])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input.value).toBe('') // form resets on success
  })

  it('a denied origin request shows an inline alert and does NOT add the feed', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(false)
    const storage = await renderWithConnectors({ enabled: true, feeds: [], shownCount: 5 })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add feed URL'), {
        target: { value: 'https://news.ycombinator.com/rss' },
      })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(ensureOrigin).toHaveBeenCalledOnce()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
    expect((await readRss(storage))?.feeds).toEqual([])
  })

  it('a non-https URL is rejected with an alert and ensureOrigin is never called (validation is load-bearing)', async () => {
    const storage = await renderWithConnectors({ enabled: true, feeds: [], shownCount: 5 })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add feed URL'), {
        target: { value: 'http://insecure.example.com/rss' },
      })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
    expect((await readRss(storage))?.feeds).toEqual([])
  })

  it('removing a feed revokes its origin ONLY when no remaining feed shares that origin', async () => {
    const storage = await renderWithConnectors({
      enabled: true,
      feeds: [
        'https://example.com/feed-a',
        'https://example.com/feed-b', // shares example.com with feed-a
        'https://other.com/feed',
      ],
      shownCount: 5,
    })

    // Removing one of the two example.com feeds must NOT revoke — the origin
    // is still claimed by the other.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove https://example.com/feed-a' }))
    })
    expect(removeOrigin).not.toHaveBeenCalled()
    expect((await readRss(storage))?.feeds).toEqual([
      'https://example.com/feed-b',
      'https://other.com/feed',
    ])

    // Removing the sole user of other.com DOES revoke.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove https://other.com/feed' }))
    })
    expect(removeOrigin).toHaveBeenCalledWith('https://other.com/feed')
    expect((await readRss(storage))?.feeds).toEqual(['https://example.com/feed-b'])
  })

  it('two same-origin removes racing before a re-render still revoke the origin exactly once', async () => {
    // The leak this covers: `remaining` used to come from the render-time
    // feeds prop, so two removals clicked before React re-rendered each saw
    // the OTHER feed still present and neither revoked — a permanent grant
    // PRIVACY.md's "released automatically" promise doesn't allow. The
    // handler now derives survivors from storage.update's serialized result.
    const storage = await renderWithConnectors({
      enabled: true,
      feeds: ['https://example.com/feed-a', 'https://example.com/feed-b'],
      shownCount: 5,
    })

    await act(async () => {
      // Both clicks in one act, no await between: the second handler runs
      // against the same stale prop the first did.
      fireEvent.click(screen.getByRole('button', { name: 'Remove https://example.com/feed-a' }))
      fireEvent.click(screen.getByRole('button', { name: 'Remove https://example.com/feed-b' }))
    })

    expect((await readRss(storage))?.feeds).toEqual([])
    expect(removeOrigin).toHaveBeenCalledTimes(1)
    expect(removeOrigin).toHaveBeenCalledWith('https://example.com/feed-b')
  })

  it('shownCount is a 3–8 select that persists the chosen value', async () => {
    const storage = await renderWithConnectors({ enabled: true, feeds: [], shownCount: 5 })
    const select = screen.getByLabelText('Headlines shown') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['3', '4', '5', '6', '7', '8'])
    expect(select.value).toBe('5')

    await act(async () => {
      fireEvent.change(select, { target: { value: '8' } })
    })

    expect((await readRss(storage))?.shownCount).toBe(8)
  })

  it('enforces a maximum of 5 feeds: the add row is disabled at the cap', async () => {
    await renderWithConnectors({
      enabled: true,
      feeds: [
        'https://a.example.com/feed',
        'https://b.example.com/feed',
        'https://c.example.com/feed',
        'https://d.example.com/feed',
        'https://e.example.com/feed',
      ],
      shownCount: 5,
    })

    expect((screen.getByLabelText('Add feed URL') as HTMLInputElement).disabled).toBe(true)
    expect((within(connectorsRegion()).getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('is absent entirely (no Connectors tab, no card) when isPremium() is false', async () => {
    vi.mocked(isPremium).mockReturnValue(false)
    try {
      await renderPanel()
      expect(screen.queryByRole('tab', { name: 'Connectors' })).toBeNull()
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['General', 'Widgets', 'Data'])
      expect(screen.queryByRole('region', { name: 'Connectors' })).toBeNull()
    } finally {
      vi.mocked(isPremium).mockReturnValue(true)
    }
  })

  // RSS is auth 'none' — the card shell's status chip (Task 46) is a
  // 'token'-auth-only affordance, so RSS's card must never show one,
  // enabled or not.
  it('auth "none" (RSS) never shows a status chip, enabled or not', async () => {
    await renderWithConnectors({ enabled: true, feeds: [], shownCount: 5 })
    expect(screen.queryByText(/Connected as/)).toBeNull()
    expect(screen.queryByText('Reconnect needed')).toBeNull()
  })
})

describe('SettingsPanel Connectors section (GitHub card — first token connector)', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigin).mockReset()
    vi.mocked(removeOrigin).mockReset()
    vi.mocked(whoamiGithub).mockReset()
  })

  async function renderWithGithub(github?: GithubConfig) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    if (github) await storage.set('connectors', { github })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findAllByRole('radio')
    openTab('Connectors')
    return storage
  }

  async function readGithub(storage: AuroraStorage): Promise<GithubConfig | undefined> {
    return (await storage.get('connectors')).github as GithubConfig | undefined
  }

  it('the card shell renders the GitHub descriptor (label, blurb, enable toggle)', async () => {
    await renderWithGithub()
    expect(screen.getByRole('heading', { name: 'GitHub' })).toBeTruthy()
    expect(screen.getByText('PRs waiting on you, your issues, notifications')).toBeTruthy()
    expect(screen.getByLabelText('Enable GitHub')).toBeTruthy()
    // Not connected -> no status chip yet, and the token form only appears once
    // the connector is enabled (the shell gates the body on `enabled`).
    expect(screen.queryByText(/Connected as/)).toBeNull()
    expect(screen.queryByLabelText('Fine-grained personal access token')).toBeNull()
  })

  it('connect happy path: ensureOrigin (api.github.com) -> whoami -> persists { enabled, token, username }', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiGithub).mockResolvedValue({ ok: true, identity: 'octocat' })
    // Enabled but no token yet -> the token form renders.
    const storage = await renderWithGithub({ enabled: true, token: '', username: '' })

    const input = screen.getByLabelText('Fine-grained personal access token') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'github_pat_123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).toHaveBeenCalledWith('https://api.github.com/*')
    expect(whoamiGithub).toHaveBeenCalledWith('github_pat_123')
    expect(await readGithub(storage)).toEqual({ enabled: true, token: 'github_pat_123', username: 'octocat' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a rejected token surfaces whoami\'s status message as an inline alert and stores nothing', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiGithub).mockResolvedValue({ ok: false, message: 'GitHub rejected that token (status 401).' })
    const storage = await renderWithGithub({ enabled: true, token: '', username: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Fine-grained personal access token'), {
        target: { value: 'github_pat_bad' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('401')
    // Nothing persisted: the token field stays empty in storage.
    expect((await readGithub(storage))?.token).toBe('')
  })

  it('a denied origin grant blocks the connect: whoami is never called and nothing is stored', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(false)
    const storage = await renderWithGithub({ enabled: true, token: '', username: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Fine-grained personal access token'), {
        target: { value: 'github_pat_123' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(whoamiGithub).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
    expect((await readGithub(storage))?.token).toBe('')
  })

  it('connected state renders "Connected as {login}" + Disconnect; disconnecting revokes api.github.com and clears the config', async () => {
    const storage = await renderWithGithub({ enabled: true, token: 'github_pat_x', username: 'octocat' })

    // The shell's own status chip AND the form's connected row both name the
    // login (Task 46 chip + Task 47 form row).
    expect(screen.getAllByText('Connected as octocat').length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    // Revoked through the REAL registry's releasableOrigins (github's sole
    // origin, claimed by no other enabled connector).
    expect(removeOrigin).toHaveBeenCalledWith('https://api.github.com/*')
    // The config entry is cleared entirely.
    expect(await readGithub(storage)).toBeUndefined()
  })

  it('reconnect state (username present, token stripped by a backup) renders the FORM, not the Disconnect row', async () => {
    await renderWithGithub({ enabled: true, token: '', username: 'octocat' })
    // The card shell flags it, and the body offers the form to re-enter a token.
    expect(screen.getByText('Reconnect needed')).toBeTruthy()
    expect(screen.getByLabelText('Fine-grained personal access token')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull()
  })
})

// Pure unit tests of the extracted auth-state helper — exported from
// Connectors.tsx (beside the default export) purely so it can be tested
// directly here, without a real token connector existing yet (the first one,
// github, lands in Task 48). The fake descriptor reuses GithubConfig's shape
// (enabled/token/username, exactly a token connector's minimum) rather than
// inventing a new ad hoc type; it is cast to the base ConnectorDescriptor at
// the call site, the same single-cast pattern backup.test.ts's fake
// descriptor uses (types.ts's ConnectorDescriptor variance comment explains
// why the cast is required once ConnectorConfig is a multi-member union).
describe('authState (Connectors.tsx card auth-state helper)', () => {
  const tokenDescriptor: ConnectorDescriptor<GithubConfig> = {
    id: 'github',
    label: 'Fake Token Connector',
    blurb: 'test',
    auth: 'token',
    ttlMs: 1_000,
    secretFields: ['token'],
    identityField: 'username',
    origins: () => [],
  }

  it('identity + secret both present -> connected', () => {
    const config: GithubConfig = { enabled: true, token: 't', username: 'jon' }
    expect(authState(tokenDescriptor as ConnectorDescriptor, config)).toBe('connected')
  })

  it('identity present, secret missing (backup-restored) -> reconnect', () => {
    const config: GithubConfig = { enabled: true, token: '', username: 'jon' }
    expect(authState(tokenDescriptor as ConnectorDescriptor, config)).toBe('reconnect')
  })

  it('no config at all -> unconfigured', () => {
    expect(authState(tokenDescriptor as ConnectorDescriptor, undefined)).toBe('unconfigured')
  })

  it("auth 'none' -> none, regardless of config", () => {
    const noneDescriptor: ConnectorDescriptor<GithubConfig> = { ...tokenDescriptor, auth: 'none' }
    const config: GithubConfig = { enabled: true, token: 't', username: 'jon' }
    expect(authState(noneDescriptor as ConnectorDescriptor, config)).toBe('none')
  })
})

describe('SettingsPanel About footer (support link + version)', () => {
  it('renders after the last section with the current version and a working Buy Me a Coffee link', async () => {
    await renderPanel()
    openTab('Data')

    // Only one <footer> in the tree (About.tsx) — asserted via a direct DOM
    // query, same "raw DOM over toHaveAttribute" idiom this file's attr()
    // helper documents, since the version/link text is split across sibling
    // text nodes and an <a>, which getByText can't match as one string.
    const footer = document.querySelector('footer')
    expect(footer).not.toBeNull()
    expect(footer!.textContent).toContain(`Aurora v${pkg.version}`)

    const link = screen.getByRole('link', { name: 'Buy me a coffee — support Aurora' })
    expect(footer!.contains(link)).toBe(true)
    expect(attr(link, 'href')).toBe('https://buymeacoffee.com/joncooler')
    expect(attr(link, 'target')).toBe('_blank')
    const rel = (attr(link, 'rel') ?? '').split(/\s+/)
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
  })
})
