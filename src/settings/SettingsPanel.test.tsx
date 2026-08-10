// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../lib/storage/index'
import { memoryDriver } from '../lib/storage/driver'
import { StorageProvider } from '../lib/storage/context'
import { parseBackup } from '../lib/backup'
import { CURRENT_VERSION, defaults } from '../lib/storage/schema'
import type { ConnectorDescriptor, CryptoConfig, GithubConfig, GitlabConfig, IcsConfig, JiraConfig, RssConfig, VercelConfig } from '../services/connectors/types'
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

// Same treatment for gitlab (Task 49) — mock ONLY whoamiGitlab, keep
// gitlabDescriptor/fetchGitlab real so the registry still registers gitlab
// and releasableOrigins (used by onDisconnect below) runs its real path.
vi.mock('../services/connectors/gitlab', async (importActual) => {
  const actual = await importActual<typeof import('../services/connectors/gitlab')>()
  return { ...actual, whoamiGitlab: vi.fn() }
})
import { whoamiGitlab } from '../services/connectors/gitlab'

// Same treatment for jira (Task 50) — mock ONLY whoamiJira, keep
// jiraDescriptor/fetchJira/normalizeJiraSite real so the registry still
// registers jira and releasableOrigins (used by onDisconnect below) runs its
// real path.
vi.mock('../services/connectors/jira', async (importActual) => {
  const actual = await importActual<typeof import('../services/connectors/jira')>()
  return { ...actual, whoamiJira: vi.fn() }
})
import { whoamiJira } from '../services/connectors/jira'

// Same treatment for vercel (Task 51) — mock ONLY whoamiVercel, keep
// vercelDescriptor/fetchVercel real so the registry still registers vercel
// and releasableOrigins (used by onDisconnect below) runs its real path.
vi.mock('../services/connectors/vercel', async (importActual) => {
  const actual = await importActual<typeof import('../services/connectors/vercel')>()
  return { ...actual, whoamiVercel: vi.fn() }
})
import { whoamiVercel } from '../services/connectors/vercel'

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
  // so General's fields aren't there on the synchronous first render. The
  // "Your name" input (Profile section, always on the default General tab) is
  // the load sentinel every render in this file waits on — it replaced the old
  // theme radiogroup, which Task 60 removed.
  await screen.findByLabelText('Your name')
  return storage
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
    expect(screen.getByLabelText('Widget color')).toBeTruthy()
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
    await screen.findByLabelText('Your name')

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

// Task 60 retired the three-theme radiogroup entirely; the General tab now
// carries a single widget-color customizer (a native <input type="color">
// behind a swatch, plus a Reset that only appears once a color is set). The
// engine that actually applies the color to CSS vars is unit-tested in
// src/theme/index.test.ts (applyPanelColor) and exercised end-to-end in
// scripts/preview.mjs; these tests cover the Settings row's own behavior.
describe('SettingsPanel Widget color row', () => {
  it('shows a color input at the default surface color, with no Reset when panelColor is null', async () => {
    await renderPanel()
    const input = screen.getByLabelText('Widget color') as HTMLInputElement
    expect(input.type).toBe('color')
    // Default surface = themes.css :root --panel-solid base, rgb(10 10 10).
    expect(input.value).toBe('#0a0a0a')
    // Nothing to reset when the default is in effect.
    expect(screen.queryByRole('button', { name: 'Reset widget color' })).toBeNull()
  })

  it('picking a color writes settings.panelColor and reveals the Reset button', async () => {
    const storage = await renderPanel()
    const input = screen.getByLabelText('Widget color') as HTMLInputElement

    await act(async () => {
      // fireEvent.change dispatches the picker's `change` event — the component
      // commits immediately on that (no need to wait out the drag debounce).
      fireEvent.change(input, { target: { value: '#12ab34' } })
    })

    expect((await storage.get('settings')).panelColor).toBe('#12ab34')
    expect(screen.getByRole('button', { name: 'Reset widget color' })).toBeTruthy()
  })

  it('Reset clears panelColor back to null and hides itself', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', { ...defaults().settings, panelColor: '#12ab34' })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')

    // The swatch reflects the stored pick, and Reset is present.
    const input = screen.getByLabelText('Widget color') as HTMLInputElement
    expect(input.value).toBe('#12ab34')
    const reset = screen.getByRole('button', { name: 'Reset widget color' })

    await act(async () => {
      fireEvent.click(reset)
    })

    expect((await storage.get('settings')).panelColor).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset widget color' })).toBeNull()
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
    await screen.findByLabelText('Your name')
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
    const toggle = screen.getByLabelText('Bookmarks bar') as HTMLButtonElement
    expect(attr(toggle, 'aria-checked')).toBe('false')

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(ensureBookmarksPermission).toHaveBeenCalledOnce()
    expect(attr(toggle, 'aria-checked')).toBe('false')
    const error = await screen.findByRole('alert')
    expect(error.textContent).toBeTruthy()
    expect(toggle.getAttribute('aria-describedby')).toBe(error.id)
    expect((await storage.get('settings')).widgets.bookmarks).toBe(false)
  })

  it('a rejected ensureBookmarksPermission (not just an explicit false) is caught and routed to the same alert, not left as an unhandled rejection', async () => {
    vi.mocked(ensureBookmarksPermission).mockRejectedValue(new Error('gesture context lost'))
    const storage = await renderPanel()
    openTab('Widgets')
    const toggle = screen.getByLabelText('Bookmarks bar') as HTMLButtonElement

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(attr(toggle, 'aria-checked')).toBe('false')
    const error = await screen.findByRole('alert')
    expect(error.textContent).toBeTruthy()
    expect(toggle.getAttribute('aria-describedby')).toBe(error.id)
    expect((await storage.get('settings')).widgets.bookmarks).toBe(false)
  })

  it('granting the bookmarks permission turns the toggle on and shows no alert', async () => {
    vi.mocked(ensureBookmarksPermission).mockResolvedValue(true)
    const storage = await renderPanel()
    openTab('Widgets')
    const toggle = screen.getByLabelText('Bookmarks bar') as HTMLButtonElement

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(attr(toggle, 'aria-checked')).toBe('true')
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
    await screen.findByLabelText('Your name')
    openTab('Widgets')
    const toggle = screen.getByLabelText('Bookmarks bar') as HTMLButtonElement
    expect(attr(toggle, 'aria-checked')).toBe('true')

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(ensureBookmarksPermission).not.toHaveBeenCalled()
    expect(attr(toggle, 'aria-checked')).toBe('false')
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
    await screen.findByLabelText('Your name')
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
    await screen.findByLabelText('Your name')
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
    await screen.findByLabelText('Your name')
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
    await screen.findByLabelText('Your name')
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
    await screen.findByLabelText('Your name')
    openTab('Widgets')

    const dateInput = screen.getByLabelText('Countdown date')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-08-20' } })
    })

    expect(await storage.get('countdowns')).toEqual([{ id: 'c1', name: 'Launch', date: '2026-08-20' }])
  })
})

describe('SettingsPanel Habits section', () => {
  function habitsRegion() {
    return screen.getByRole('region', { name: 'Habits' })
  }

  it('the Habits label is present on the Widgets tab, off by default', async () => {
    await renderPanel()
    openTab('Widgets')
    const toggle = screen.getByLabelText('Habits') as HTMLButtonElement
    expect(attr(toggle, 'aria-checked')).toBe('false')
    // The editor stays absent until the toggle is on — unlike World clocks/
    // Countdowns (always-mounted sections a user can pre-populate before
    // turning the widget on), the brief scopes this editor to the toggled-on
    // state specifically.
    expect(screen.queryByRole('region', { name: 'Habits' })).toBeNull()
  })

  it('turning the toggle on writes widgets.habits and reveals the editor below it', async () => {
    const storage = await renderPanel()
    openTab('Widgets')
    const toggle = screen.getByLabelText('Habits') as HTMLButtonElement

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(attr(toggle, 'aria-checked')).toBe('true')
    expect((await storage.get('settings')).widgets.habits).toBe(true)
    expect(habitsRegion()).toBeTruthy()

    await act(async () => {
      fireEvent.click(toggle)
    })
    expect((await storage.get('settings')).widgets.habits).toBe(false)
    expect(screen.queryByRole('region', { name: 'Habits' })).toBeNull()
  })

  async function renderWithHabits(habits: { id: string; name: string; createdAt: number; log: string[] }[]) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, habits: true },
    })
    await storage.set('habits', habits)
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Widgets')
    return storage
  }

  it('adding a habit persists a new row (id, name, empty log) and resets the form', async () => {
    const storage = await renderWithHabits([])
    const nameInput = screen.getByLabelText('New habit name') as HTMLInputElement

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Read' } })
      fireEvent.click(within(habitsRegion()).getByRole('button', { name: 'Add' }))
    })

    const stored = await storage.get('habits')
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ name: 'Read', log: [] })
    expect(typeof stored[0]!.id).toBe('string')
    expect(typeof stored[0]!.createdAt).toBe('number')
    expect(nameInput.value).toBe('')
  })

  it('a blank name is not added', async () => {
    const storage = await renderWithHabits([])

    await act(async () => {
      fireEvent.click(within(habitsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(await storage.get('habits')).toEqual([])
  })

  it('the remove button on a habit row deletes just that habit — the log goes with it, no confirm', async () => {
    const storage = await renderWithHabits([
      { id: 'a', name: 'Read', createdAt: 0, log: ['2026-08-01'] },
      { id: 'b', name: 'Write', createdAt: 0, log: [] },
    ])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Read' }))
    })

    expect(await storage.get('habits')).toEqual([{ id: 'b', name: 'Write', createdAt: 0, log: [] }])
  })

  it('renaming a habit edits it in place by id (blur-equivalent change)', async () => {
    const storage = await renderWithHabits([{ id: 'a', name: 'Read', createdAt: 0, log: [] }])

    const nameInput = screen.getByLabelText('Habit name') as HTMLInputElement
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Read daily' } })
      fireEvent.blur(nameInput)
    })

    expect(await storage.get('habits')).toEqual([
      { id: 'a', name: 'Read daily', createdAt: 0, log: [] },
    ])
  })

  it('hides the add row and shows a quiet note once 6 habits are stored (the max)', async () => {
    const habits = Array.from({ length: 6 }, (_, i) => ({
      id: `h${i}`,
      name: `Habit ${i}`,
      createdAt: 0,
      log: [],
    }))
    await renderWithHabits(habits)

    expect(screen.getByDisplayValue('Habit 5')).toBeTruthy()
    expect(screen.queryByLabelText('New habit name')).toBeNull()
    expect(within(habitsRegion()).getByText(/Max 6 habits/)).toBeTruthy()
  })
})

// Task 58: a plain toggle, no list editor of its own (unlike World clocks/
// Countdowns/Habits above) — MonthCalWidget reads settings.widgets.monthCal
// directly, so this is the same minimal on/off/persist shape as the
// Bookmarks toggle's own non-permission assertions, without the permission
// side-effect.
describe('SettingsPanel Widgets section (Month calendar toggle)', () => {
  it('the Month calendar label is present on the Widgets tab, off by default', async () => {
    await renderPanel()
    openTab('Widgets')
    const toggle = screen.getByLabelText('Month calendar') as HTMLButtonElement
    expect(attr(toggle, 'aria-checked')).toBe('false')
  })

  it('turning the toggle on writes widgets.monthCal; turning it back off writes false', async () => {
    const storage = await renderPanel()
    openTab('Widgets')
    const toggle = screen.getByLabelText('Month calendar') as HTMLButtonElement

    await act(async () => {
      fireEvent.click(toggle)
    })
    expect(attr(toggle, 'aria-checked')).toBe('true')
    expect((await storage.get('settings')).widgets.monthCal).toBe(true)

    await act(async () => {
      fireEvent.click(toggle)
    })
    expect(attr(toggle, 'aria-checked')).toBe('false')
    expect((await storage.get('settings')).widgets.monthCal).toBe(false)
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
    await screen.findByLabelText('Your name')
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
    await screen.findByLabelText('Your name')
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
    await screen.findByLabelText('Your name')
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
    await screen.findByLabelText('Your name')
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
    const toggle = screen.getByLabelText('Enable RSS') as HTMLButtonElement
    expect(attr(toggle, 'aria-checked')).toBe('false')

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
    await screen.findByLabelText('Your name')
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

    // EXACTLY one "Connected as" indicator — the card SHELL's authState chip.
    // The Task-47 form's connected branch no longer repeats the identity (it's
    // just the Disconnect action now), so this must be a single match, not
    // "at least one" (the loose form silently blessed the old duplication).
    expect(screen.getAllByText('Connected as octocat')).toHaveLength(1)

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

  // Task 69, Step 5: onConnected used to REPLACE the whole github config, so
  // reconnecting after a token was stripped (a backup restore, here) would
  // silently reset a composed card's chip choices back to all-on. It must
  // carry any existing `views` through instead.
  it('reconnecting carries existing `views` through — a reconnect must never reset a composed card to all-on', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiGithub).mockResolvedValue({ ok: true, identity: 'octocat' })
    const seededViews = { commitGraph: true, pulls: true, issues: false, notifications: true }
    // Reconnect state: username present, token stripped, a composed `views`
    // already on record.
    const storage = await renderWithGithub({
      enabled: true,
      token: '',
      username: 'octocat',
      views: seededViews,
    })
    expect(screen.getByText('Reconnect needed')).toBeTruthy()

    const input = screen.getByLabelText('Fine-grained personal access token') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'github_pat_new' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    const stored = await readGithub(storage)
    expect(stored?.token).toBe('github_pat_new')
    expect(stored?.views).toEqual(seededViews)
  })

  // Task 69, Step 6: the "Show on your board" chips, end-to-end through the
  // real panel — four chips reflecting `resolveGithubViews`, and clicking one
  // writes the FULL resolved+flipped object through storage (partial views
  // never persist) while the chip itself flips.
  it('the "Show on your board" chips render for a connected card; clicking one flips storage and the chip', async () => {
    const storage = await renderWithGithub({ enabled: true, token: 'github_pat_x', username: 'octocat' })

    expect(screen.getByText('Show on your board')).toBeTruthy()
    expect(screen.getByText('Your card shows only the sections you turn on.')).toBeTruthy()

    const commitGraphChip = screen.getByRole('button', { name: /Commit graph/ })
    const pullsChip = screen.getByRole('button', { name: /Pull requests/ })
    const issuesChip = screen.getByRole('button', { name: /Issues/ })
    const notifsChip = screen.getByRole('button', { name: /Notifications/ })
    // No `views` stored yet -> resolves against the all-on default.
    expect(commitGraphChip.getAttribute('aria-pressed')).toBe('true')
    expect(pullsChip.getAttribute('aria-pressed')).toBe('true')
    expect(issuesChip.getAttribute('aria-pressed')).toBe('true')
    expect(notifsChip.getAttribute('aria-pressed')).toBe('true')

    await act(async () => {
      fireEvent.click(issuesChip)
    })

    expect(await readGithub(storage)).toMatchObject({
      views: { commitGraph: true, pulls: true, issues: false, notifications: true },
    })
    expect(screen.getByRole('button', { name: /Issues/ }).getAttribute('aria-pressed')).toBe('false')
  })
})

describe('SettingsPanel Connectors section (GitLab card — Task 49, github\'s sibling)', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigin).mockReset()
    vi.mocked(removeOrigin).mockReset()
    vi.mocked(whoamiGitlab).mockReset()
  })

  async function renderWithGitlab(gitlab?: GitlabConfig) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    if (gitlab) await storage.set('connectors', { gitlab })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')
    return storage
  }

  async function readGitlab(storage: AuroraStorage): Promise<GitlabConfig | undefined> {
    return (await storage.get('connectors')).gitlab as GitlabConfig | undefined
  }

  it('the card shell renders the GitLab descriptor (label, blurb, enable toggle)', async () => {
    await renderWithGitlab()
    expect(screen.getByRole('heading', { name: 'GitLab' })).toBeTruthy()
    expect(screen.getByText('Assigned MRs and to-dos')).toBeTruthy()
    expect(screen.getByLabelText('Enable GitLab')).toBeTruthy()
    // Not connected -> no status chip yet, and the token form only appears once
    // the connector is enabled (the shell gates the body on `enabled`).
    expect(screen.queryByText(/Connected as/)).toBeNull()
    expect(screen.queryByLabelText('Personal access token')).toBeNull()
  })

  it('the instance URL field defaults to https://gitlab.com', async () => {
    await renderWithGitlab({ enabled: true, token: '', instanceUrl: '', username: '' })
    const input = screen.getByLabelText('Instance URL') as HTMLInputElement
    expect(input.value).toBe('https://gitlab.com')
  })

  it('connect happy path: ensureOrigin (derived from the instance URL) -> whoami -> persists { enabled, token, instanceUrl, username }', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiGitlab).mockResolvedValue({ ok: true, identity: 'jcooler' })
    // Enabled but no token yet -> the token form renders.
    const storage = await renderWithGitlab({ enabled: true, token: '', instanceUrl: '', username: '' })

    const input = screen.getByLabelText('Personal access token') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'glpat_123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    // originsFor derives the origin from the instance-url FIELD VALUE — the
    // form's own defaultValue ('https://gitlab.com'), since this test never
    // touched that field.
    expect(ensureOrigin).toHaveBeenCalledWith('https://gitlab.com/*')
    expect(whoamiGitlab).toHaveBeenCalledWith('https://gitlab.com', 'glpat_123')
    expect(await readGitlab(storage)).toEqual({
      enabled: true,
      token: 'glpat_123',
      instanceUrl: 'https://gitlab.com',
      username: 'jcooler',
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a self-hosted instance URL drives ensureOrigin/whoami with that host, not gitlab.com', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiGitlab).mockResolvedValue({ ok: true, identity: 'jon' })
    const storage = await renderWithGitlab({ enabled: true, token: '', instanceUrl: '', username: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Instance URL'), {
        target: { value: 'https://gitlab.example.com:8443' },
      })
      fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'glpat_x' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).toHaveBeenCalledWith('https://gitlab.example.com:8443/*')
    expect(whoamiGitlab).toHaveBeenCalledWith('https://gitlab.example.com:8443', 'glpat_x')
    expect((await readGitlab(storage))?.instanceUrl).toBe('https://gitlab.example.com:8443')
  })

  it('a non-https instance URL blocks the connect with an inline alert: no permission requested, nothing stored', async () => {
    const storage = await renderWithGitlab({ enabled: true, token: '', instanceUrl: '', username: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Instance URL'), { target: { value: 'http://insecure.example.com' } })
      fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'glpat_x' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    expect(whoamiGitlab).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
    expect((await readGitlab(storage))?.token).toBe('')
  })

  it('a rejected token surfaces whoami\'s status message as an inline alert and stores nothing', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiGitlab).mockResolvedValue({ ok: false, message: 'GitLab rejected that token (status 401).' })
    const storage = await renderWithGitlab({ enabled: true, token: '', instanceUrl: '', username: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'glpat_bad' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('401')
    expect((await readGitlab(storage))?.token).toBe('')
  })

  it('a denied origin grant blocks the connect: whoami is never called and nothing is stored', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(false)
    const storage = await renderWithGitlab({ enabled: true, token: '', instanceUrl: '', username: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'glpat_123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(whoamiGitlab).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
    expect((await readGitlab(storage))?.token).toBe('')
  })

  it('connected state renders "Connected as {username}" + Disconnect; disconnecting revokes the instance origin and clears the config', async () => {
    const storage = await renderWithGitlab({
      enabled: true,
      token: 'glpat_x',
      instanceUrl: 'https://gitlab.com',
      username: 'jcooler',
    })

    expect(screen.getAllByText('Connected as jcooler')).toHaveLength(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    // Revoked through the REAL registry's releasableOrigins (gitlab's sole
    // origin, claimed by no other enabled connector).
    expect(removeOrigin).toHaveBeenCalledWith('https://gitlab.com/*')
    expect(await readGitlab(storage)).toBeUndefined()
  })

  it('disconnecting a self-hosted instance with NO other connector sharing it revokes that instance origin', async () => {
    await renderWithGitlab({
      enabled: true,
      token: 'glpat_x',
      instanceUrl: 'https://gitlab.example.com',
      username: 'jon',
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    expect(removeOrigin).toHaveBeenCalledWith('https://gitlab.example.com/*')
  })

  it('reconnect state (username present, token stripped by a backup) renders the FORM, not the Disconnect row', async () => {
    await renderWithGitlab({ enabled: true, token: '', instanceUrl: 'https://gitlab.com', username: 'jcooler' })
    expect(screen.getByText('Reconnect needed')).toBeTruthy()
    expect(screen.getByLabelText('Personal access token')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull()
  })

  // Task 76 (wave 2): the "Show on your board" chips, github's template
  // reused — four chips reflecting resolveViews(DEFAULT_GITLAB_VIEWS, …), and
  // clicking a NEW (wave-2, off-by-default) section writes the FULL
  // resolved+flipped object through storage.
  it('the "Show on your board" chips render for a connected card; clicking a NEW section writes the full resolved object', async () => {
    const storage = await renderWithGitlab({
      enabled: true,
      token: 'glpat_x',
      instanceUrl: 'https://gitlab.com',
      username: 'jcooler',
    })

    expect(screen.getByText('Show on your board')).toBeTruthy()
    expect(screen.getByText('Your card shows only the sections you turn on.')).toBeTruthy()

    const mrChip = screen.getByRole('button', { name: /Merge requests/ })
    const reviewChip = screen.getByRole('button', { name: /Review asks/ })
    const todosChip = screen.getByRole('button', { name: /To-dos/ })
    const activityChip = screen.getByRole('button', { name: /Activity graph/ })
    // No `views` stored yet -> resolves against DEFAULT_GITLAB_VIEWS: the two
    // sections that already shipped stay on, the two wave-2 adds stay off.
    expect(mrChip.getAttribute('aria-pressed')).toBe('true')
    expect(reviewChip.getAttribute('aria-pressed')).toBe('false')
    expect(todosChip.getAttribute('aria-pressed')).toBe('true')
    expect(activityChip.getAttribute('aria-pressed')).toBe('false')

    await act(async () => {
      fireEvent.click(reviewChip)
    })

    expect(await readGitlab(storage)).toMatchObject({
      views: { mergeRequests: true, reviewAsks: true, todos: true, activityGraph: false },
    })
    expect(screen.getByRole('button', { name: /Review asks/ }).getAttribute('aria-pressed')).toBe('true')
  })

  // Reconnecting must never reset a composed card back to defaults — same
  // rule githubBody's own reconnect test documents (Task 69, Step 5).
  it('reconnecting carries existing `views` through — a reconnect must never reset a composed card to defaults', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiGitlab).mockResolvedValue({ ok: true, identity: 'jcooler' })
    const seededViews = { mergeRequests: true, reviewAsks: true, todos: false, activityGraph: true }
    const storage = await renderWithGitlab({
      enabled: true,
      token: '',
      instanceUrl: 'https://gitlab.com',
      username: 'jcooler',
      views: seededViews,
    })
    expect(screen.getByText('Reconnect needed')).toBeTruthy()

    const input = screen.getByLabelText('Personal access token') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'glpat_new' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    const stored = await readGitlab(storage)
    expect(stored?.token).toBe('glpat_new')
    expect(stored?.views).toEqual(seededViews)
  })

  // GitLab-specific nuance (brief, Step 1): a reconnect can land on a
  // DIFFERENT account on the same instance — the fetch must use the fresh
  // identity from whoami, while `views` preservation must NOT be gated on the
  // username staying the same (a naive "only preserve if username matches"
  // guard would silently reset a composed card just because the user
  // reconnected as someone else on the same instance).
  it('reconnecting as a DIFFERENT username still preserves `views`, and whoami is called with the NEW token', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiGitlab).mockResolvedValue({ ok: true, identity: 'newuser' })
    const seededViews = { mergeRequests: false, reviewAsks: true, todos: true, activityGraph: true }
    const storage = await renderWithGitlab({
      enabled: true,
      token: '',
      instanceUrl: 'https://gitlab.com',
      username: 'jcooler',
      views: seededViews,
    })

    const input = screen.getByLabelText('Personal access token') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'glpat_new' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(whoamiGitlab).toHaveBeenCalledWith('https://gitlab.com', 'glpat_new')
    const stored = await readGitlab(storage)
    expect(stored?.username).toBe('newuser')
    expect(stored?.views).toEqual(seededViews)
  })
})

describe('SettingsPanel Connectors section (Jira card — Task 50, three fields)', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigin).mockReset()
    vi.mocked(removeOrigin).mockReset()
    vi.mocked(whoamiJira).mockReset()
  })

  async function renderWithJira(jira?: JiraConfig) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    if (jira) await storage.set('connectors', { jira })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')
    return storage
  }

  async function readJira(storage: AuroraStorage): Promise<JiraConfig | undefined> {
    return (await storage.get('connectors')).jira as JiraConfig | undefined
  }

  it('the card shell renders the Jira descriptor (label, blurb, enable toggle)', async () => {
    await renderWithJira()
    expect(screen.getByRole('heading', { name: 'Jira' })).toBeTruthy()
    expect(screen.getByText('Issues assigned to you')).toBeTruthy()
    expect(screen.getByLabelText('Enable Jira')).toBeTruthy()
    // Not connected -> no status chip yet, and the token form only appears once
    // the connector is enabled (the shell gates the body on `enabled`).
    expect(screen.queryByText(/Connected as/)).toBeNull()
    expect(screen.queryByLabelText('API token')).toBeNull()
  })

  it('the card renders THREE fields: site, email, API token', async () => {
    await renderWithJira({ enabled: true, email: '', apiToken: '', site: '', displayName: '' })
    expect(screen.getByLabelText('Site')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('API token')).toBeTruthy()
    expect((screen.getByLabelText('Site') as HTMLInputElement).placeholder).toBe('yoursite.atlassian.net')
  })

  it('connect happy path: ensureOrigin (derived from the site) -> whoami -> persists { enabled, email, apiToken, site, displayName }', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiJira).mockResolvedValue({ ok: true, identity: 'Jon Cooler' })
    const storage = await renderWithJira({ enabled: true, email: '', apiToken: '', site: '', displayName: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'yoursite.atlassian.net' } })
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jon@acme.com' } })
      fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'tok_123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).toHaveBeenCalledWith('https://yoursite.atlassian.net/*')
    expect(whoamiJira).toHaveBeenCalledWith('yoursite.atlassian.net', 'jon@acme.com', 'tok_123')
    expect(await readJira(storage)).toEqual({
      enabled: true,
      email: 'jon@acme.com',
      apiToken: 'tok_123',
      site: 'yoursite.atlassian.net',
      displayName: 'Jon Cooler',
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a site typed with an https:// prefix / trailing slash is normalized before ensureOrigin/whoami/persist', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiJira).mockResolvedValue({ ok: true, identity: 'Jon Cooler' })
    const storage = await renderWithJira({ enabled: true, email: '', apiToken: '', site: '', displayName: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'https://yoursite.atlassian.net/' } })
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jon@acme.com' } })
      fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'tok_123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).toHaveBeenCalledWith('https://yoursite.atlassian.net/*')
    expect(whoamiJira).toHaveBeenCalledWith('yoursite.atlassian.net', 'jon@acme.com', 'tok_123')
    expect((await readJira(storage))?.site).toBe('yoursite.atlassian.net')
  })

  it('a site that is not *.atlassian.net blocks the connect with an inline alert: no permission requested, nothing stored', async () => {
    const storage = await renderWithJira({ enabled: true, email: '', apiToken: '', site: '', displayName: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'yoursite.com' } })
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jon@acme.com' } })
      fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'tok_123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    expect(whoamiJira).not.toHaveBeenCalled()
    // Review fix (round 1): the EXACT brief-mandated copy, not just "some
    // alert text" — TokenConnectForm now surfaces originsFor's own thrown
    // message (jira.ts's normalizeJiraSite) instead of discarding it for a
    // generic fallback.
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Enter your site as yoursite.atlassian.net')
    expect((await readJira(storage))?.apiToken).toBe('')
  })

  it("a rejected token surfaces whoami's status message as an inline alert and stores nothing", async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiJira).mockResolvedValue({ ok: false, message: 'Jira rejected that token (status 401).' })
    const storage = await renderWithJira({ enabled: true, email: '', apiToken: '', site: '', displayName: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'yoursite.atlassian.net' } })
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jon@acme.com' } })
      fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'tok_bad' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('401')
    expect((await readJira(storage))?.apiToken).toBe('')
  })

  it('a denied origin grant blocks the connect: whoami is never called and nothing is stored', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(false)
    const storage = await renderWithJira({ enabled: true, email: '', apiToken: '', site: '', displayName: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'yoursite.atlassian.net' } })
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jon@acme.com' } })
      fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'tok_123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(whoamiJira).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
    expect((await readJira(storage))?.apiToken).toBe('')
  })

  it('connected state renders "Connected as {displayName}" + Disconnect; disconnecting revokes the site origin and clears the config', async () => {
    const storage = await renderWithJira({
      enabled: true,
      email: 'jon@acme.com',
      apiToken: 'tok_x',
      site: 'yoursite.atlassian.net',
      displayName: 'Jon Cooler',
    })

    expect(screen.getAllByText('Connected as Jon Cooler')).toHaveLength(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    // Revoked through the REAL registry's releasableOrigins (jira's sole
    // origin, claimed by no other enabled connector).
    expect(removeOrigin).toHaveBeenCalledWith('https://yoursite.atlassian.net/*')
    expect(await readJira(storage)).toBeUndefined()
  })

  it('reconnect state (displayName present, apiToken stripped by a backup) renders the FORM, not the Disconnect row', async () => {
    await renderWithJira({
      enabled: true,
      email: 'jon@acme.com',
      apiToken: '',
      site: 'yoursite.atlassian.net',
      displayName: 'Jon Cooler',
    })
    expect(screen.getByText('Reconnect needed')).toBeTruthy()
    expect(screen.getByLabelText('API token')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull()
  })

  // Task 76 (wave 2): the "Show on your board" chips, github's template
  // reused — three chips reflecting resolveViews(DEFAULT_JIRA_VIEWS, …), and
  // clicking the NEW (wave-2, off-by-default) section writes the FULL
  // resolved+flipped object through storage.
  it('the "Show on your board" chips render for a connected card; clicking the NEW section writes the full resolved object', async () => {
    const storage = await renderWithJira({
      enabled: true,
      email: 'jon@acme.com',
      apiToken: 'tok_x',
      site: 'yoursite.atlassian.net',
      displayName: 'Jon Cooler',
    })

    expect(screen.getByText('Show on your board')).toBeTruthy()
    expect(screen.getByText('Your card shows only the sections you turn on.')).toBeTruthy()

    const assignedChip = screen.getByRole('button', { name: /Assigned issues/ })
    const statusChip = screen.getByRole('button', { name: /Status chips/ })
    const dueSoonChip = screen.getByRole('button', { name: /Due soon/ })
    // No `views` stored yet -> resolves against DEFAULT_JIRA_VIEWS: both
    // sections that already shipped stay on, the wave-2 add stays off.
    expect(assignedChip.getAttribute('aria-pressed')).toBe('true')
    expect(statusChip.getAttribute('aria-pressed')).toBe('true')
    expect(dueSoonChip.getAttribute('aria-pressed')).toBe('false')

    await act(async () => {
      fireEvent.click(dueSoonChip)
    })

    expect(await readJira(storage)).toMatchObject({
      views: { assigned: true, statusChips: true, dueSoon: true },
    })
    expect(screen.getByRole('button', { name: /Due soon/ }).getAttribute('aria-pressed')).toBe('true')
  })

  // Reconnecting must never reset a composed card back to defaults — same
  // rule githubBody's own reconnect test documents (Task 69, Step 5).
  it('reconnecting carries existing `views` through — a reconnect must never reset a composed card to defaults', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiJira).mockResolvedValue({ ok: true, identity: 'Jon Cooler' })
    const seededViews = { assigned: true, statusChips: false, dueSoon: true }
    const storage = await renderWithJira({
      enabled: true,
      email: 'jon@acme.com',
      apiToken: '',
      site: 'yoursite.atlassian.net',
      displayName: 'Jon Cooler',
      views: seededViews,
    })
    expect(screen.getByText('Reconnect needed')).toBeTruthy()

    // JiraBody's three fields carry NO defaultValue (unlike GitlabBody's
    // instanceUrl), so a reconnect's form starts blank even though the prior
    // config's site/email are still on record — all three are required for
    // handleConnect to proceed past its synchronous required-field check.
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'yoursite.atlassian.net' } })
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jon@acme.com' } })
      fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'tok_new' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    const stored = await readJira(storage)
    expect(stored?.apiToken).toBe('tok_new')
    expect(stored?.views).toEqual(seededViews)
  })
})

describe('SettingsPanel Connectors section (Vercel card — Task 51, github\'s sibling)', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigin).mockReset()
    vi.mocked(removeOrigin).mockReset()
    vi.mocked(whoamiVercel).mockReset()
  })

  async function renderWithVercel(vercel?: VercelConfig) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    if (vercel) await storage.set('connectors', { vercel })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')
    return storage
  }

  async function readVercel(storage: AuroraStorage): Promise<VercelConfig | undefined> {
    return (await storage.get('connectors')).vercel as VercelConfig | undefined
  }

  it('the card shell renders the Vercel descriptor (label, blurb, enable toggle)', async () => {
    await renderWithVercel()
    expect(screen.getByRole('heading', { name: 'Vercel' })).toBeTruthy()
    expect(screen.getByText('Your latest deployments')).toBeTruthy()
    expect(screen.getByLabelText('Enable Vercel')).toBeTruthy()
    // Not connected -> no status chip yet, and the token form only appears once
    // the connector is enabled (the shell gates the body on `enabled`).
    expect(screen.queryByText(/Connected as/)).toBeNull()
    expect(screen.queryByLabelText('Personal access token')).toBeNull()
  })

  it('connect happy path: ensureOrigin (api.vercel.com) -> whoami -> persists { enabled, token, username }', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiVercel).mockResolvedValue({ ok: true, identity: 'jon' })
    // Enabled but no token yet -> the token form renders.
    const storage = await renderWithVercel({ enabled: true, token: '', username: '' })

    const input = screen.getByLabelText('Personal access token') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'vc_123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).toHaveBeenCalledWith('https://api.vercel.com/*')
    expect(whoamiVercel).toHaveBeenCalledWith('vc_123')
    expect(await readVercel(storage)).toEqual({ enabled: true, token: 'vc_123', username: 'jon' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it("a rejected token surfaces whoami's status message as an inline alert and stores nothing", async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiVercel).mockResolvedValue({ ok: false, message: 'Vercel rejected that token (status 401).' })
    const storage = await renderWithVercel({ enabled: true, token: '', username: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Personal access token'), {
        target: { value: 'vc_bad' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('401')
    // Nothing persisted: the token field stays empty in storage.
    expect((await readVercel(storage))?.token).toBe('')
  })

  it('a denied origin grant blocks the connect: whoami is never called and nothing is stored', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(false)
    const storage = await renderWithVercel({ enabled: true, token: '', username: '' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Personal access token'), {
        target: { value: 'vc_123' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(whoamiVercel).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
    expect((await readVercel(storage))?.token).toBe('')
  })

  it('connected state renders "Connected as {identity}" + Disconnect; disconnecting revokes api.vercel.com and clears the config', async () => {
    const storage = await renderWithVercel({ enabled: true, token: 'vc_x', username: 'jon' })

    // EXACTLY one "Connected as" indicator — the card SHELL's authState chip.
    expect(screen.getAllByText('Connected as jon')).toHaveLength(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    // Revoked through the REAL registry's releasableOrigins (vercel's sole
    // origin, claimed by no other enabled connector).
    expect(removeOrigin).toHaveBeenCalledWith('https://api.vercel.com/*')
    // The config entry is cleared entirely.
    expect(await readVercel(storage)).toBeUndefined()
  })

  it('reconnect state (username present, token stripped by a backup) renders the FORM, not the Disconnect row', async () => {
    await renderWithVercel({ enabled: true, token: '', username: 'jon' })
    // The card shell flags it, and the body offers the form to re-enter a token.
    expect(screen.getByText('Reconnect needed')).toBeTruthy()
    expect(screen.getByLabelText('Personal access token')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull()
  })

  // Task 76 (wave 2): the "Show on your board" chips, github's template
  // reused — two chips reflecting resolveViews(DEFAULT_VERCEL_VIEWS, …), and
  // clicking the NEW (wave-2, off-by-default) section writes the FULL
  // resolved+flipped object through storage.
  it('the "Show on your board" chips render for a connected card; clicking the NEW section writes the full resolved object', async () => {
    const storage = await renderWithVercel({ enabled: true, token: 'vc_x', username: 'jon' })

    expect(screen.getByText('Show on your board')).toBeTruthy()
    expect(screen.getByText('Your card shows only the sections you turn on.')).toBeTruthy()

    const deploymentsChip = screen.getByRole('button', { name: /Deployments/ })
    const statusChip = screen.getByRole('button', { name: /Status summary/ })
    // No `views` stored yet -> resolves against DEFAULT_VERCEL_VIEWS: the
    // section that already shipped stays on, the wave-2 add stays off.
    expect(deploymentsChip.getAttribute('aria-pressed')).toBe('true')
    expect(statusChip.getAttribute('aria-pressed')).toBe('false')

    await act(async () => {
      fireEvent.click(statusChip)
    })

    expect(await readVercel(storage)).toMatchObject({
      views: { deployments: true, statusSummary: true },
    })
    expect(screen.getByRole('button', { name: /Status summary/ }).getAttribute('aria-pressed')).toBe('true')
  })

  // Reconnecting must never reset a composed card back to defaults — same
  // rule githubBody's own reconnect test documents (Task 69, Step 5).
  it('reconnecting carries existing `views` through — a reconnect must never reset a composed card to defaults', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiVercel).mockResolvedValue({ ok: true, identity: 'jon' })
    const seededViews = { deployments: false, statusSummary: true }
    const storage = await renderWithVercel({ enabled: true, token: '', username: 'jon', views: seededViews })
    expect(screen.getByText('Reconnect needed')).toBeTruthy()

    const input = screen.getByLabelText('Personal access token') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'vc_new' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    const stored = await readVercel(storage)
    expect(stored?.token).toBe('vc_new')
    expect(stored?.views).toEqual(seededViews)
  })
})

describe('SettingsPanel Connectors section (Crypto card — Task 52, no auth)', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigin).mockReset()
    vi.mocked(removeOrigin).mockReset()
  })

  async function renderWithCrypto(crypto?: CryptoConfig) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    if (crypto) await storage.set('connectors', { crypto })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')
    return storage
  }

  async function readCrypto(storage: AuroraStorage): Promise<CryptoConfig | undefined> {
    return (await storage.get('connectors')).crypto as CryptoConfig | undefined
  }

  it('the card shell renders the Crypto descriptor (label, blurb, enable toggle); no status chip (auth "none"), no body until enabled', async () => {
    await renderWithCrypto()
    expect(screen.getByRole('heading', { name: 'Crypto' })).toBeTruthy()
    expect(screen.getByText('Prices for the coins you watch')).toBeTruthy()
    expect(screen.getByLabelText('Enable Crypto')).toBeTruthy()
    expect(screen.queryByText(/Connected as/)).toBeNull()
    expect(screen.queryByText('Reconnect needed')).toBeNull()
    expect(screen.queryByLabelText('Coins (CoinGecko ids, comma-separated)')).toBeNull()
  })

  it('enabling the connector via the shell toggle writes ONLY { enabled: true } — crypto is not RSS-shaped, so nothing extra is seeded', async () => {
    const storage = await renderWithCrypto()
    const toggle = screen.getByLabelText('Enable Crypto') as HTMLButtonElement
    expect(attr(toggle, 'aria-checked')).toBe('false')

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(await readCrypto(storage)).toEqual({ enabled: true })
    // The now-enabled body renders with an EMPTY input (no coins seeded).
    expect((screen.getByLabelText('Coins (CoinGecko ids, comma-separated)') as HTMLInputElement).value).toBe('')
  })

  it('save happy path: validates, requests api.coingecko.com, then persists the parsed/normalized ids', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithCrypto({ enabled: true, coins: [] })

    const input = screen.getByLabelText('Coins (CoinGecko ids, comma-separated)') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: ' Bitcoin, ETHEREUM ,,dogecoin' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(ensureOrigin).toHaveBeenCalledWith('https://api.coingecko.com/api/v3/')
    expect(await readCrypto(storage)).toEqual({
      enabled: true,
      coins: ['bitcoin', 'ethereum', 'dogecoin'],
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input.value).toBe('bitcoin, ethereum, dogecoin') // normalized back into the field
  })

  it('fewer than 2 ids is rejected with an alert naming the rule; ensureOrigin is never called', async () => {
    const storage = await renderWithCrypto({ enabled: true, coins: [] })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Coins (CoinGecko ids, comma-separated)'), {
        target: { value: 'bitcoin' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/2 to 5/)
    expect((await readCrypto(storage))?.coins).toEqual([])
  })

  it('more than 5 ids is rejected with an alert naming the rule; ensureOrigin is never called', async () => {
    const storage = await renderWithCrypto({ enabled: true, coins: [] })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Coins (CoinGecko ids, comma-separated)'), {
        target: { value: 'a,b,c,d,e,f' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/2 to 5/)
    expect((await readCrypto(storage))?.coins).toEqual([])
  })

  it('an id with an invalid character is rejected with an alert naming the offending id; ensureOrigin is never called', async () => {
    const storage = await renderWithCrypto({ enabled: true, coins: [] })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Coins (CoinGecko ids, comma-separated)'), {
        target: { value: 'bitcoin, bit_coin' }, // underscore is not in [a-z0-9-]
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('bit_coin')
    expect((await readCrypto(storage))?.coins).toEqual([])
  })

  it('a denied origin grant blocks the save: nothing is persisted', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(false)
    const storage = await renderWithCrypto({ enabled: true, coins: [] })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Coins (CoinGecko ids, comma-separated)'), {
        target: { value: 'bitcoin, ethereum' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
    expect((await readCrypto(storage))?.coins).toEqual([])
  })

  it('when already configured, the input shows the current ids joined', async () => {
    await renderWithCrypto({ enabled: true, coins: ['bitcoin', 'ethereum'] })
    expect((screen.getByLabelText('Coins (CoinGecko ids, comma-separated)') as HTMLInputElement).value).toBe(
      'bitcoin, ethereum',
    )
  })

  it('Clear empties the config entirely and revokes api.coingecko.com', async () => {
    const storage = await renderWithCrypto({ enabled: true, coins: ['bitcoin', 'ethereum'] })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    })

    // Revoked through the REAL registry's releasableOrigins (crypto's sole
    // origin, claimed by no other enabled connector).
    expect(removeOrigin).toHaveBeenCalledWith('https://api.coingecko.com/*')
    expect(await readCrypto(storage)).toBeUndefined()
  })

  it('the Clear button is absent when no coins are configured yet', async () => {
    await renderWithCrypto({ enabled: true, coins: [] })
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  // Crypto is auth 'none' — the card shell's status chip (Task 46) is a
  // 'token'-auth-only affordance, so Crypto's card must never show one,
  // enabled or not.
  it('auth "none" (Crypto) never shows a status chip, enabled or not', async () => {
    await renderWithCrypto({ enabled: true, coins: ['bitcoin', 'ethereum'] })
    expect(screen.queryByText(/Connected as/)).toBeNull()
    expect(screen.queryByText('Reconnect needed')).toBeNull()
  })
})

describe('SettingsPanel Connectors section (Calendar/ics card — Task 4, named list, webcal welcome, view picker)', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigin).mockReset()
    vi.mocked(removeOrigin).mockReset()
  })

  const ICS_URL = 'https://calendar.example.com/private-abc123/basic.ics'

  // `seedSnapshot`: mirrors CalendarWidget.test.tsx's own seededStorage — a
  // FRESH connectorSnapshots.ics entry, present so the add/remove-clears-it
  // tests below have something to observe disappearing. Default false keeps
  // every existing call site (which doesn't care about the snapshot) as-is.
  async function renderWithIcs(ics?: IcsConfig, seedSnapshot = false) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    if (ics) await storage.set('connectors', { ics })
    if (seedSnapshot) {
      await storage.set('connectorSnapshots', { ics: { fetchedAt: Date.now(), data: { events: [] } } })
    }
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')
    return storage
  }

  function connectorsRegion() {
    return screen.getByRole('region', { name: 'Connectors' })
  }

  async function readIcs(storage: AuroraStorage): Promise<IcsConfig | undefined> {
    return (await storage.get('connectors')).ics as IcsConfig | undefined
  }

  it('the card shell renders the Calendar descriptor (label, blurb, enable toggle); no status chip (auth "none"), no body until enabled', async () => {
    await renderWithIcs()
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeTruthy()
    expect(screen.getByText('Your next events, from any calendar app')).toBeTruthy()
    expect(screen.getByLabelText('Enable Calendar')).toBeTruthy()
    expect(screen.queryByText(/Connected as/)).toBeNull()
    expect(screen.queryByText('Reconnect needed')).toBeNull()
    expect(screen.queryByLabelText('Secret calendar address (ICS URL)')).toBeNull()
  })

  it('enabling the connector via the shell toggle writes ONLY { enabled: true }; the now-enabled body renders an EMPTY, password-type url field', async () => {
    const storage = await renderWithIcs()
    const toggle = screen.getByLabelText('Enable Calendar') as HTMLButtonElement
    expect(attr(toggle, 'aria-checked')).toBe('false')

    await act(async () => {
      fireEvent.click(toggle)
    })

    expect(await readIcs(storage)).toEqual({ enabled: true })
    const input = screen.getByLabelText('Secret calendar address (ICS URL)') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.type).toBe('password')
  })

  it('shows the Apple/Google/Outlook helper text VERBATIM', async () => {
    await renderWithIcs({ enabled: true })
    expect(
      screen.getByText(
        'In Apple Calendar: turn on "Public Calendar" (only the calendar\'s owner sees the option) and paste the webcal link here. Google/Outlook: Settings → your calendar → "Secret address in iCal format". It stays on this device.',
      ),
    ).toBeTruthy()
  })

  it('webcal:// converts to https:// before validating/requesting/persisting — a link pasted from Apple Calendar just works', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithIcs({ enabled: true })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Personal' } })
      fireEvent.change(screen.getByLabelText('Secret calendar address (ICS URL)'), {
        target: { value: 'webcal://p57-caldav.icloud.com/published/2/abc' },
      })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(ensureOrigin).toHaveBeenCalledWith('https://p57-caldav.icloud.com/published/2/abc')
    expect(await readIcs(storage)).toEqual({
      enabled: true,
      calendars: [{ name: 'Personal', url: 'https://p57-caldav.icloud.com/published/2/abc' }],
      view: 'today',
      upcomingCount: 3,
    })
  })

  it('http:// is rejected with the https-or-webcal copy; nothing persisted, ensureOrigin never called', async () => {
    const storage = await renderWithIcs({ enabled: true })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Secret calendar address (ICS URL)'), {
        target: { value: 'http://calendar.example.com/basic.ics' },
      })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Enter a calendar address that starts with https:// or webcal://')
    expect(await readIcs(storage)).toEqual({ enabled: true })
  })

  it('an empty name defaults to "Calendar N" by current count + 1', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithIcs({ enabled: true })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Secret calendar address (ICS URL)'), {
        target: { value: 'https://calendar.example.com/one/basic.ics' },
      })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })
    expect((await readIcs(storage))?.calendars?.[0]).toEqual({
      name: 'Calendar 1',
      url: 'https://calendar.example.com/one/basic.ics',
    })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Secret calendar address (ICS URL)'), {
        target: { value: 'https://calendar.example.com/two/basic.ics' },
      })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })
    expect((await readIcs(storage))?.calendars?.[1]).toEqual({
      name: 'Calendar 2',
      url: 'https://calendar.example.com/two/basic.ics',
    })
  })

  it('adding a url already in the list — even respelled as webcal:// — is rejected as a duplicate', async () => {
    const storage = await renderWithIcs({
      enabled: true,
      calendars: [{ name: 'Personal', url: 'https://p57-caldav.icloud.com/published/2/abc' }],
    })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Secret calendar address (ICS URL)'), {
        target: { value: 'webcal://p57-caldav.icloud.com/published/2/abc' },
      })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('That calendar is already in the list.')
    expect((await readIcs(storage))?.calendars).toEqual([
      { name: 'Personal', url: 'https://p57-caldav.icloud.com/published/2/abc' },
    ])
  })

  it('enforces a maximum of 5 calendars: the add row is disabled at the cap', async () => {
    await renderWithIcs({
      enabled: true,
      calendars: Array.from({ length: 5 }, (_, i) => ({
        name: `Cal ${i + 1}`,
        url: `https://calendar${i}.example.com/basic.ics`,
      })),
    })

    expect((screen.getByLabelText('Secret calendar address (ICS URL)') as HTMLInputElement).disabled).toBe(true)
    expect((within(connectorsRegion()).getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('a denied origin grant blocks the add: the denial copy shows, nothing is persisted', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(false)
    const storage = await renderWithIcs({ enabled: true })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Secret calendar address (ICS URL)'), {
        target: { value: ICS_URL },
      })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Permission to read that calendar was denied, so nothing was saved.')
    expect(await readIcs(storage)).toEqual({ enabled: true })
  })

  it('a configured list shows each name, host, a dot colored by list position, and a per-row Remove button', async () => {
    await renderWithIcs({
      enabled: true,
      calendars: [
        { name: 'Personal', url: 'https://calendar.example.com/personal/basic.ics' },
        { name: 'Family', url: 'https://calendar.other.com/family/basic.ics' },
      ],
    })

    const region = connectorsRegion()
    expect(within(region).getByText('Personal')).toBeTruthy()
    expect(within(region).getByText('Family')).toBeTruthy()
    expect(within(region).getByText('calendar.example.com')).toBeTruthy()
    expect(within(region).getByText('calendar.other.com')).toBeTruthy()

    const items = within(region).getAllByRole('listitem')
    expect(items[0]?.querySelector('.bg-accent')).toBeTruthy()
    expect(items[1]?.querySelector('.bg-sky-400')).toBeTruthy()

    expect(within(region).getByRole('button', { name: 'Remove Personal' })).toBeTruthy()
    expect(within(region).getByRole('button', { name: 'Remove Family' })).toBeTruthy()
  })

  it('removing a calendar revokes its origin ONLY when no remaining calendar shares that origin', async () => {
    const storage = await renderWithIcs({
      enabled: true,
      calendars: [
        { name: 'Personal', url: 'https://calendar.example.com/personal/basic.ics' },
        { name: 'Family', url: 'https://calendar.example.com/family/basic.ics' }, // shares the host
      ],
    })

    // Removing one of the two same-host calendars must NOT revoke — the
    // origin is still claimed by the other.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Personal' }))
    })
    expect(removeOrigin).not.toHaveBeenCalled()
    expect((await readIcs(storage))?.calendars).toEqual([
      { name: 'Family', url: 'https://calendar.example.com/family/basic.ics' },
    ])

    // Removing the last remaining calendar on that host DOES revoke.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Family' }))
    })
    expect(removeOrigin).toHaveBeenCalledWith('https://calendar.example.com/*')
    expect((await readIcs(storage))?.calendars).toEqual([])
  })

  it('a legacy single-url config (pre-migration) surfaces as one calendar named "Calendar"', async () => {
    await renderWithIcs({ enabled: true, url: ICS_URL })
    const region = connectorsRegion()
    // getByText('Calendar') alone would also match the card's OWN heading
    // (descriptor.label is 'Calendar') — the row's Remove button, whose
    // aria-label is `Remove ${cal.name}`, is the unambiguous proof the list
    // itself holds one entry named 'Calendar'.
    expect(within(region).getByRole('button', { name: 'Remove Calendar' })).toBeTruthy()
    expect(within(region).getByText('calendar.example.com')).toBeTruthy()
  })

  it('view controls write immediately, with no Save button: "One per calendar" persists view, "Upcoming" + a count persists upcomingCount', async () => {
    const storage = await renderWithIcs({
      enabled: true,
      calendars: [{ name: 'Personal', url: ICS_URL }],
    })

    const viewSelect = within(connectorsRegion()).getByLabelText('Show') as HTMLSelectElement
    expect([...viewSelect.options].map((o) => o.textContent)).toEqual(['Today', 'Upcoming', 'One per calendar'])
    expect(viewSelect.value).toBe('today')

    await act(async () => {
      fireEvent.change(viewSelect, { target: { value: 'per-calendar' } })
    })
    expect(await readIcs(storage)).toEqual({
      enabled: true,
      calendars: [{ name: 'Personal', url: ICS_URL }],
      view: 'per-calendar',
      upcomingCount: 3,
    })

    await act(async () => {
      fireEvent.change(viewSelect, { target: { value: 'upcoming' } })
    })
    const countSelect = within(connectorsRegion()).getByLabelText('How many upcoming events') as HTMLSelectElement
    expect([...countSelect.options].map((o) => o.value)).toEqual(['2', '3', '4'])

    await act(async () => {
      fireEvent.change(countSelect, { target: { value: '4' } })
    })
    expect(await readIcs(storage)).toEqual({
      enabled: true,
      calendars: [{ name: 'Personal', url: ICS_URL }],
      view: 'upcoming',
      upcomingCount: 4,
    })
  })

  // Final-review fix wave (Finding 1): adding/removing a calendar remounts
  // CalendarWidget (its key includes the urls — CalendarWidget.tsx), but a
  // FRESH cached snapshot would still short-circuit useConnectorSnapshot's
  // one-refresh-per-mount for up to the 15-min TTL — a newly added calendar
  // would show no events, and a removal would leave stale cal-indexed
  // events pointing at the wrong calendars. IcsBody's handleAdd/handleRemove
  // now delete connectorSnapshots.ics as part of the same write so the
  // remounted widget finds none and fetches immediately.
  it('adding a calendar clears the cached ics snapshot', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithIcs({ enabled: true }, true)
    expect((await storage.get('connectorSnapshots')).ics).toBeTruthy()

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Secret calendar address (ICS URL)'), {
        target: { value: ICS_URL },
      })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect((await readIcs(storage))?.calendars).toEqual([{ name: 'Calendar 1', url: ICS_URL }])
    expect((await storage.get('connectorSnapshots')).ics).toBeUndefined()
  })

  it('removing a calendar clears the cached ics snapshot', async () => {
    const storage = await renderWithIcs(
      { enabled: true, calendars: [{ name: 'Personal', url: ICS_URL }] },
      true,
    )
    expect((await storage.get('connectorSnapshots')).ics).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Personal' }))
    })

    expect((await readIcs(storage))?.calendars).toEqual([])
    expect((await storage.get('connectorSnapshots')).ics).toBeUndefined()
  })

  it('a view-mode change does NOT clear the cached ics snapshot — only add/remove invalidate it', async () => {
    const storage = await renderWithIcs(
      { enabled: true, calendars: [{ name: 'Personal', url: ICS_URL }] },
      true,
    )
    expect((await storage.get('connectorSnapshots')).ics).toBeTruthy()

    const viewSelect = within(connectorsRegion()).getByLabelText('Show') as HTMLSelectElement
    await act(async () => {
      fireEvent.change(viewSelect, { target: { value: 'per-calendar' } })
    })

    expect(await readIcs(storage)).toEqual({
      enabled: true,
      calendars: [{ name: 'Personal', url: ICS_URL }],
      view: 'per-calendar',
      upcomingCount: 3,
    })
    expect((await storage.get('connectorSnapshots')).ics).toBeTruthy()
  })

  // Calendar is auth 'none' — the card shell's status chip (Task 46) is a
  // 'token'-auth-only affordance, so Calendar's card must never show one,
  // enabled or not (same rule Crypto's own case above documents).
  it('auth "none" (Calendar) never shows a status chip, enabled or not', async () => {
    await renderWithIcs({ enabled: true, calendars: [{ name: 'Personal', url: ICS_URL }] })
    expect(screen.queryByText(/Connected as/)).toBeNull()
    expect(screen.queryByText('Reconnect needed')).toBeNull()
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
