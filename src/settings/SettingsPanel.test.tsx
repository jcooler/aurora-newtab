// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { AtomicRestoreRollbackError, createStorage, type AuroraStorage } from '../lib/storage/index'
import { memoryDriver, type StorageDriver } from '../lib/storage/driver'
import { createInProcessStorageAuthority } from '../lib/storage/authority'
import { StorageProvider } from '../lib/storage/context'
import { BACKUP_REDACTION_NOTICE, parseBackup, serializeBackup } from '../lib/backup'
import { CURRENT_VERSION, defaults, type AuroraData } from '../lib/storage/schema'
import { emptyLayoutV2, layoutV2FromLegacy } from '../lib/layout/v2'
import { saveCanvasProfile } from '../lib/layout/canvasAdapter'
import type { ConnectorDescriptor, CryptoConfig, GithubConfig, GitlabConfig, IcsConfig, JiraConfig, RssConfig, StatusConfig, VercelConfig } from '../services/connectors/types'
import { CURATED_STATUS } from '../services/connectors/status'
import type { HaAction, HaEntityRef, HaState, HomeAssistantConfig } from '../services/connectors/homeassistant'
import { addUploads, listUploads, removeUpload } from '../lib/idb'
import { ensureBookmarksPermission } from '../services/bookmarks'
import { APOD_ORIGINS } from '../services/apod'
import { releaseUnownedOrigins, runOriginTransaction } from '../services/permissionTransactions'
import SettingsPanel from './SettingsPanel'
import { authState, connectorCardState } from './sections/Connectors'
import { LOCAL_SECRET_STORAGE_NOTICE } from '../privacy/dataFlows'
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
// (chrome.permissions — unavailable in jsdom); the Background section's apod
// source (Task 96) calls ensureOrigins, the plural sibling. Mock only those
// three; originPattern stays REAL (the section's "does a remaining feed
// share this origin?" check depends on it, and the rss registry descriptor
// imported transitively also reads it — same for Background's own
// "still held by an enabled connector?" check).
vi.mock('../services/permissions', async (importActual) => {
  const actual = await importActual<typeof import('../services/permissions')>()
  const ensureOrigin = vi.fn()
  // Existing card tests assert connector-specific input/origin mapping through
  // this singular spy. TokenConnectForm now correctly calls ensureOrigins via
  // its transaction, so the test boundary delegates that one-origin batch to
  // the established spy while the dedicated transaction tests exercise Chrome.
  const ensureOrigins = vi.fn(async (origins: readonly string[]) => {
    const granted = await ensureOrigin(origins[0]!)
    if (granted) {
      origins.forEach((origin) => cleanupHeld.add(origin))
      cleanupAddedListeners.forEach((listener) => listener({ origins: [...origins] }))
    }
    return granted
  })
  return { ...actual, ensureOrigin, removeOrigin: vi.fn(), ensureOrigins }
})
import { ensureOrigin, ensureOrigins, originPattern, removeOrigin } from '../services/permissions'
import { initializePermissionMirror } from '../services/permissionMirror'

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

// Same treatment for Home Assistant (Task 99/101) — mock ONLY
// whoamiHomeAssistant (the connect-flow probe) and fetchAllStates (the
// entity picker's bulk fetch), keep homeassistantDescriptor/haEntitiesOf/
// haActionsOf real so the registry still registers homeassistant and
// releasableOrigins (used by onDisconnect below) runs its real path.
vi.mock('../services/connectors/homeassistant', async (importActual) => {
  const actual = await importActual<typeof import('../services/connectors/homeassistant')>()
  return { ...actual, whoamiHomeAssistant: vi.fn(), fetchAllStates: vi.fn() }
})
import { whoamiHomeAssistant, fetchAllStates } from '../services/connectors/homeassistant'

// No jest-dom matchers are registered in this project (see vitest.config.ts),
// so attribute checks go through getAttribute() + toBe() like the rest of the
// suite (e.g. Background.test.tsx's querySelector/toBeNull checks) rather
// than toHaveAttribute().
function attr(el: Element, name: string) {
  return el.getAttribute(name)
}

function expectLocalRoutineTarget(el: Element) {
  const classes = el.getAttribute('class')?.split(/\s+/) ?? []
  expect(classes).toContain('min-h-9')
  expect(classes).toContain('min-w-9')
}

afterEach(() => {
  const removed = [...cleanupHeld]
  cleanupHeld.clear()
  if (removed.length > 0) cleanupRemovedListeners.forEach((listener) => listener({ origins: removed }))
  // Background's APOD cases reset/configure the plural mock directly. Restore
  // the token-card compatibility delegate for the next test without changing
  // any completed assertion in the test that just ran.
  vi.mocked(ensureOrigins).mockImplementation(async (origins) => {
    const granted = await vi.mocked(ensureOrigin)(origins[0]!)
    if (granted) {
      origins.forEach((origin) => cleanupHeld.add(origin))
      cleanupAddedListeners.forEach((listener) => listener({ origins: [...origins] }))
    }
    return granted
  })
})

type PermissionListener = (permissions: chrome.permissions.Permissions) => void

const cleanupHeld = new Set<string>()
const cleanupAddedListeners: PermissionListener[] = []
const cleanupRemovedListeners: PermissionListener[] = []

async function removeHeldOrigin(pattern: string): Promise<boolean> {
  const removed = cleanupHeld.delete(pattern)
  if (removed) cleanupRemovedListeners.forEach((listener) => listener({ origins: [pattern] }))
  return removed
}

function holdOrigin(pattern: string) {
  cleanupHeld.add(pattern)
  cleanupAddedListeners.forEach((listener) => listener({ origins: [pattern] }))
}

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function installQueuedLifecycleLocks() {
  const originalLocks = navigator.locks
  let tail: Promise<void> = Promise.resolve()
  const request = vi.fn(<T,>(
    _name: string,
    _options: LockOptions,
    work: () => Promise<T>,
  ): Promise<T> => {
    const result = tail.then(work)
    tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
  return () => Object.defineProperty(navigator, 'locks', { configurable: true, value: originalLocks })
}

function deferPermissionRemovals() {
  const started = deferred<void>()
  const allow = deferred<void>()
  vi.mocked(removeOrigin).mockImplementation(async (pattern) => {
    started.resolve()
    await allow.promise
    return removeHeldOrigin(pattern)
  })
  return { started, allow }
}

beforeAll(async () => {
  vi.stubGlobal('chrome', {
    permissions: {
      getAll: async () => ({ origins: [...cleanupHeld] }),
      request: async ({ origins = [] }: chrome.permissions.Permissions) => {
        origins.forEach((origin) => cleanupHeld.add(origin))
        cleanupAddedListeners.forEach((listener) => listener({ origins }))
        return true
      },
      contains: async ({ origins = [] }: chrome.permissions.Permissions) => origins.every((origin) => cleanupHeld.has(origin)),
      remove: async ({ origins = [] }: chrome.permissions.Permissions) => {
        const removed = origins.some((origin) => cleanupHeld.delete(origin))
        if (removed) cleanupRemovedListeners.forEach((listener) => listener({ origins }))
        return removed
      },
      onAdded: { addListener: (listener: PermissionListener) => cleanupAddedListeners.push(listener) },
      onRemoved: { addListener: (listener: PermissionListener) => cleanupRemovedListeners.push(listener) },
    },
  })
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, _options: LockOptions, work: () => Promise<unknown>) => work() },
  })
  await initializePermissionMirror()
})

afterAll(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'locks')
})

async function renderPanel(
  onArrangeLayout: () => void = () => {},
  suppliedStorage?: AuroraStorage,
) {
  const storage = suppliedStorage ?? createStorage(memoryDriver())
  if (!suppliedStorage) await storage.init()
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
  it('applies the shared row/control contract with a 36px floor and narrow reflow', async () => {
    await renderPanel()
    const name = screen.getByLabelText('Your name')
    expect(name.className.split(/\s+/)).toContain('min-h-9')
    expect(name.className).toContain('min-w-0')
    expect(name.className).toContain('max-w-full')
    expect(name.className).toContain('max-[420px]:w-full')
    expect(name.parentElement?.className).toContain('max-[420px]:flex-col')
    expect(name.parentElement?.className).toContain('max-[420px]:items-stretch')
  })

  it('keeps the Connectors sticky search inverse to ordinary and narrow Drawer padding', async () => {
    await renderPanel()
    openTab('Connectors')
    const sticky = screen.getByLabelText('Search connectors').parentElement
    expect(sticky?.className).toContain('-top-6')
    expect(sticky?.className).toContain('max-[420px]:-top-3')
  })

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
    expect(screen.getByLabelText('Text size')).toBeTruthy()
    expect(screen.getByLabelText('Timer completion sound')).toBeTruthy()
    expect(screen.getByLabelText('Daily summary')).toBeTruthy()
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
    expect(screen.getByText(LOCAL_SECRET_STORAGE_NOTICE)).toBeTruthy()

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
    const driver = memoryDriver()
    const write = vi.spyOn(driver, 'write')
    const storage = createStorage(driver)
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
    write.mockClear()
    await act(async () => {
      fireEvent.click(clearButton)
      await Promise.resolve()
    })

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith({ location: null, weatherCache: null })
    expect(await storage.get('location')).toBeNull()
    expect(await storage.get('weatherCache')).toBeNull()
  })

  it('reports an atomic clear failure, preserves state, and permits retry', async () => {
    const driver = memoryDriver()
    const baseWrite = driver.write.bind(driver)
    const storage = createStorage(driver)
    await storage.init()
    const location = { lat: 1, lon: 2, label: 'Springfield', manual: true }
    await storage.setMany({
      location,
      weatherCache: {
        current: { tempC: 20, feelsLikeC: 19, code: 0, windKmh: 5, humidity: 50 },
        hourly: [],
        fetchedAt: Date.now(),
        locationLabel: 'Springfield',
      },
    })
    let failNext = true
    driver.write = vi.fn(async (patch) => {
      if (failNext) {
        failNext = false
        throw new Error('disk full')
      }
      await baseWrite(patch)
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
      await Promise.resolve()
    })
    expect(screen.getByRole('alert').textContent).toContain('Could not clear weather location')
    expect(clearButton.hasAttribute('disabled')).toBe(false)
    expect(await storage.get('location')).toEqual(location)
    expect(await storage.get('weatherCache')).not.toBeNull()

    await act(async () => {
      fireEvent.click(clearButton)
      await Promise.resolve()
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
  it('keeps one export operation rendered, busy, described, and duplicate-safe through success', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const snapshotGate = deferred<AuroraData>()
    const snapshot = vi.spyOn(storage, 'snapshot').mockReturnValue(snapshotGate.promise)
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:backup') as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      await renderPanel(() => {}, storage)
      openTab('Data')
      const exportButton = screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement
      expectLocalRoutineTarget(exportButton)

      act(() => {
        fireEvent.click(exportButton)
        fireEvent.click(exportButton)
      })

      expect(snapshot).toHaveBeenCalledTimes(1)
      expect(exportButton.disabled).toBe(true)
      expect(attr(exportButton, 'aria-busy')).toBe('true')
      const pendingId = attr(exportButton, 'aria-describedby')
      expect(pendingId).toBeTruthy()
      expect(document.getElementById(pendingId!)?.getAttribute('role')).toBe('status')
      expect(document.getElementById(pendingId!)?.getAttribute('aria-atomic')).toBe('true')
      expect(document.getElementById(pendingId!)?.textContent).toBe('Creating backup…')

      await act(async () => {
        snapshotGate.resolve(defaults())
        await snapshotGate.promise
        await Promise.resolve()
      })

      expect(exportButton.disabled).toBe(false)
      expect(attr(exportButton, 'aria-busy')).toBeNull()
      expect(screen.getByRole('status').textContent).toBe('Backup downloaded.')
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      clickSpy.mockRestore()
    }
  })

  it('a held export excludes restore and file selection without replacing its active feedback', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const snapshotGate = deferred<AuroraData>()
    const snapshot = vi.spyOn(storage, 'snapshot').mockReturnValue(snapshotGate.promise)
    const replaceAll = vi.spyOn(storage, 'replaceAllWithRollback')
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:backup') as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      await renderPanel(() => {}, storage)
      openTab('Data')
      const input = screen.getByLabelText('Import backup') as HTMLInputElement
      const firstFile = new File([serializeBackup(defaults())], 'first.json', { type: 'application/json' })
      await act(async () => {
        fireEvent.change(input, { target: { files: [firstFile] } })
        await Promise.resolve()
        await Promise.resolve()
      })
      const confirm = await screen.findByRole('button', { name: 'Confirm restore' }) as HTMLButtonElement
      const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement
      const exportButton = screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement
      const replacement = new File(['not json'], 'replacement.json', { type: 'application/json' })

      act(() => {
        fireEvent.click(exportButton)
        fireEvent.click(confirm)
        fireEvent.change(input, { target: { files: [replacement] } })
      })

      expect(snapshot).toHaveBeenCalledTimes(1)
      expect(replaceAll).not.toHaveBeenCalled()
      expect(exportButton.disabled).toBe(true)
      expect(confirm.disabled).toBe(true)
      expect(cancel.disabled).toBe(true)
      expect(input.disabled).toBe(true)
      expect(screen.getByRole('status').textContent).toBe('Creating backup…')
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.getByText(/Replace current data\?/)).toBeTruthy()

      await act(async () => {
        snapshotGate.resolve(defaults())
        await snapshotGate.promise
        await Promise.resolve()
      })
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      clickSpy.mockRestore()
    }
  })

  it('a held restore excludes export and file selection without replacing its active feedback', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const replace = storage.replaceAllWithRollback.bind(storage)
    const started = deferred<void>()
    const allow = deferred<void>()
    const replaceAll = vi.spyOn(storage, 'replaceAllWithRollback').mockImplementation(async <T,>(
      next: AuroraData,
      finalize: (previous: AuroraData) => Promise<T>,
    ) => {
      started.resolve()
      await allow.promise
      return replace(next, finalize)
    })
    const snapshot = vi.spyOn(storage, 'snapshot')
    await renderPanel(() => {}, storage)
    openTab('Data')
    const input = screen.getByLabelText('Import backup') as HTMLInputElement
    const firstFile = new File([serializeBackup(defaults())], 'first.json', { type: 'application/json' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [firstFile] } })
      await Promise.resolve()
      await Promise.resolve()
    })
    const confirm = await screen.findByRole('button', { name: 'Confirm restore' })
    const exportButton = screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement
    const replacement = new File(['not json'], 'replacement.json', { type: 'application/json' })

    act(() => {
      fireEvent.click(confirm)
      fireEvent.click(exportButton)
      fireEvent.change(input, { target: { files: [replacement] } })
    })
    await started.promise

    const restoring = screen.getByRole('button', { name: 'Restoring...' }) as HTMLButtonElement
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement
    expect(replaceAll).toHaveBeenCalledTimes(1)
    expect(snapshot).not.toHaveBeenCalled()
    expect(restoring.disabled).toBe(true)
    expect(exportButton.disabled).toBe(true)
    expect(cancel.disabled).toBe(true)
    expect(input.disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('Restoring backup…')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/Replace current data\?/)).toBeTruthy()

    await act(async () => {
      allow.resolve()
      await Promise.resolve()
    })
  })

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
    await act(async () => {
      await storage.set('links', [{ id: '1', title: 'HN', url: 'https://news.ycombinator.com' }])
      await storage.set('connectors', {
        rss: {
          enabled: true,
          feeds: ['https://rss.example.com/feed.xml?token=rss-private'],
          shownCount: 5,
        },
        ics: {
          enabled: true,
          calendars: [{ name: 'Private', url: 'https://calendar.example.com/private.ics?token=ics-private' }],
        },
      })
    })
    const snapshot = vi.spyOn(storage, 'snapshot')

    const exportButton = await screen.findByRole('button', { name: 'Export' })
    await act(async () => {
      fireEvent.click(exportButton)
    })

    expect(capturedBlob).not.toBeNull()
    expect(snapshot).toHaveBeenCalledTimes(1)
    const text = await (capturedBlob as unknown as Blob).text()
    expect(text).not.toContain('rss-private')
    expect(text).not.toContain('ics-private')
    expect(text).not.toContain('rss.example.com')
    expect(text).not.toContain('calendar.example.com')
    expect(text).toContain(BACKUP_REDACTION_NOTICE)
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
    const storage = createStorage(memoryDriver())
    await storage.init()
    const replaceAll = vi.spyOn(storage, 'replaceAllWithRollback')
    await renderPanel(() => {}, storage)
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

    const confirmButton = await screen.findByRole('button', { name: 'Confirm restore' })
    expect(screen.getByText(/Replace current data\?/)).toBeTruthy()
    expect(screen.getByText(/2026-07-20/)).toBeTruthy()

    await act(async () => {
      fireEvent.click(confirmButton)
    })

    expect(await storage.get('links')).toEqual([
      { id: 'a', title: 'Example', url: 'https://example.com' },
    ])
    expect(replaceAll).toHaveBeenCalledTimes(1)
    expect(replaceAll).toHaveBeenCalledWith(expect.objectContaining({
      links: [{ id: 'a', title: 'Example', url: 'https://example.com' }],
      connectorSnapshots: {},
      apodCache: null,
    }), expect.any(Function))
    expect(screen.queryByRole('button', { name: 'Confirm restore' })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Backup restored')
  })

  it('malformed import shows the rejection reason inline and writes nothing', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const replaceAll = vi.spyOn(storage, 'replaceAllWithRollback')
    await renderPanel(() => {}, storage)
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
    expect(screen.queryByRole('button', { name: 'Confirm restore' })).toBeNull()
    expect(await storage.get('links')).toEqual(before)
    expect(replaceAll).not.toHaveBeenCalled()
  })

  it('backup file read failure offers no Confirm and calls neither permissions nor storage replacement', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const replaceAll = vi.spyOn(storage, 'replaceAllWithRollback')
    vi.mocked(ensureOrigins).mockClear()
    await renderPanel(() => {}, storage)
    openTab('Data')
    const file = new File(['private unreadable contents'], 'unreadable.json', { type: 'application/json' })
    vi.spyOn(file, 'text').mockRejectedValue(new Error('private file boundary'))

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Import backup'), { target: { files: [file] } })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByRole('alert').textContent).toBe('Aurora could not read that backup file. Choose it again or try another file.')
    expect(screen.queryByRole('button', { name: 'Confirm restore' })).toBeNull()
    expect(ensureOrigins).not.toHaveBeenCalled()
    expect(replaceAll).not.toHaveBeenCalled()
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
    expect(screen.queryByRole('button', { name: 'Confirm restore' })).toBeNull()
    expect(await storage.get('links')).toEqual(before)
  })

  it('backup restore denial retains confirmation and exposes a reachable Retry restore that can later succeed', async () => {
    cleanupHeld.clear()
    vi.mocked(ensureOrigin).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const storage = await renderPanel()
    openTab('Data')
    const restored = {
      ...defaults(),
      photoPrefs: { mode: 'apod', index: 0, lastRotated: '' } as const,
    }
    const file = new File([serializeBackup(restored)], 'restore.json', { type: 'application/json' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Import backup'), { target: { files: [file] } })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('This restore needs access to 2 configured sites. Chrome will ask for any missing access when you confirm.')).toBeTruthy()
    const confirm = await screen.findByRole('button', { name: 'Confirm restore' })
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(screen.getByRole('alert').textContent).toContain('Chrome did not grant the site access')
    const retry = screen.getByRole('button', { name: 'Retry restore' })
    expect(attr(retry, 'aria-describedby')).toBe(screen.getByRole('alert').id)
    expectLocalRoutineTarget(retry)
    expect((await storage.get('photoPrefs')).mode).toBe('auto')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry restore' }))
    })

    expect((await storage.get('photoPrefs')).mode).toBe('apod')
    expect(screen.getByRole('status').textContent).toContain('Backup restored')
    expect(screen.queryByRole('button', { name: 'Retry restore' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('backup restore exposes disabled Restoring status while the atomic replace is pending', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const replace = storage.replaceAllWithRollback.bind(storage)
    const started = deferred<void>()
    const allow = deferred<void>()
    let replaceAllCalls = 0
    storage.replaceAllWithRollback = async <T,>(
      next: AuroraData,
      finalize: (previous: AuroraData) => Promise<T>,
    ) => {
      replaceAllCalls += 1
      started.resolve()
      await allow.promise
      return replace(next, finalize)
    }
    await renderPanel(() => {}, storage)
    openTab('Data')
    const file = new File([serializeBackup(defaults())], 'pending.json', { type: 'application/json' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Import backup'), { target: { files: [file] } })
      await Promise.resolve()
      await Promise.resolve()
    })

    const confirm = await screen.findByRole('button', { name: 'Confirm restore' })
    expectLocalRoutineTarget(confirm)
    expectLocalRoutineTarget(screen.getByRole('button', { name: 'Cancel' }))
    expectLocalRoutineTarget(screen.getByLabelText('Import backup'))
    act(() => {
      fireEvent.click(confirm)
      fireEvent.click(confirm)
    })
    await started.promise

    const pending = screen.getByRole('button', { name: 'Restoring...' }) as HTMLButtonElement
    expect(pending.disabled).toBe(true)
    expect(attr(pending, 'aria-busy')).toBe('true')
    const pendingId = attr(pending, 'aria-describedby')
    expect(pendingId).toBeTruthy()
    expect(document.getElementById(pendingId!)?.getAttribute('role')).toBe('status')
    expect(document.getElementById(pendingId!)?.getAttribute('aria-atomic')).toBe('true')
    expect(document.getElementById(pendingId!)?.textContent).toBe('Restoring backup…')
    expect(replaceAllCalls).toBe(1)
    await act(async () => {
      allow.resolve()
      await Promise.resolve()
    })
    expect(await screen.findByRole('status')).toBeTruthy()
  })

  it('backup confirmation uses registry labels for exact re-entry and a generic warning for ambiguous legacy calendars', async () => {
    await renderPanel()
    openTab('Data')
    const exact = new File([JSON.stringify({
      app: 'aurora',
      version: CURRENT_VERSION,
      exportedAt: '2026-08-14T12:00:00.000Z',
      redactions: { reentryRequired: ['github'], notice: BACKUP_REDACTION_NOTICE },
      data: {
        ...defaults(),
        connectors: { github: { enabled: true, username: 'untrusted.example/token' } },
      },
    })], 'exact.json', { type: 'application/json' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Import backup'), { target: { files: [exact] } })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Re-enter connection details after restore: GitHub.')).toBeTruthy()
    expect(screen.getByText('This restore needs access to 0 configured sites. Chrome will ask for any missing access when you confirm.')).toBeTruthy()
    expect(screen.queryByText(/untrusted\.example/)).toBeNull()

    const legacy = new File([JSON.stringify({
      app: 'aurora',
      version: CURRENT_VERSION,
      data: { ...defaults(), connectors: { ics: { enabled: true } } },
    })], 'legacy.json', { type: 'application/json' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Import backup'), { target: { files: [legacy] } })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('This older backup may omit connection details. Review connector settings and re-enter anything missing.')).toBeTruthy()
    expect(screen.queryByText('Re-enter connection details after restore: Calendar.')).toBeNull()
  })

  it('backup rollback failure renders distinct fatal recovery copy and retains Retry restore', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    vi.spyOn(storage, 'replaceAllWithRollback').mockRejectedValue(
      new AtomicRestoreRollbackError(new Error('private primary'), new Error('private rollback')),
    )
    await renderPanel(() => {}, storage)
    openTab('Data')
    const file = new File([serializeBackup({
      ...defaults(),
      settings: { ...defaults().settings, name: 'Imported' },
    })], 'fatal.json', { type: 'application/json' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Import backup'), { target: { files: [file] } })
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm restore' }))
    })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('could not verify recovery')
    expect(alert.textContent).not.toContain('left unchanged')
    expect(alert.textContent).not.toContain('private')
    expect(screen.getByRole('button', { name: 'Retry restore' })).toBeTruthy()
  })

  it('backup revoke failure still commits, keeps Settings cleanup across a tab round trip, and Retry rechecks fresh ownership', async () => {
    const origin = 'https://old-backup-owner.example.com/*'
    cleanupHeld.clear()
    holdOrigin(origin)
    vi.mocked(removeOrigin).mockRejectedValueOnce(new Error('private revoke failure'))
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      rss: { enabled: false, feeds: ['https://old-backup-owner.example.com/feed'], shownCount: 5 },
    })
    await renderPanel(() => {}, storage)
    openTab('Data')
    const file = new File([serializeBackup({
      ...defaults(),
      settings: { ...defaults().settings, name: 'Committed restore' },
    })], 'cleanup.json', { type: 'application/json' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Import backup'), { target: { files: [file] } })
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm restore' }))
    })

    expect((await storage.get('settings')).name).toBe('Committed restore')
    expect(screen.getByRole('status').textContent).toContain('Backup restored')
    expect(screen.getByRole('button', { name: 'Retry permission cleanup' })).toBeTruthy()

    openTab('General')
    expect(screen.getByRole('button', { name: 'Retry permission cleanup' })).toBeTruthy()
    openTab('Data')
    await act(async () => {
      await storage.set('connectors', {
        status: {
          enabled: false,
          services: [{ name: 'New owner', url: 'https://old-backup-owner.example.com/status.json' }],
        },
      })
    })
    vi.mocked(removeOrigin).mockClear()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry permission cleanup' }))
    })

    expect(vi.mocked(removeOrigin)).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Retry permission cleanup' })).toBeNull()
    expect(cleanupHeld.has(origin)).toBe(true)
  })

  it.each([
    ['failed', 'That backup could not be restored'],
    ['access-lost', 'Chrome site access changed'],
  ] as const)('keeps %s restore cleanup in the stable Settings alert and Retry rechecks fresh ownership', async (failureMode, expectedCopy) => {
    const origin = 'https://failed-settings-cleanup.example.com/*'
    cleanupHeld.clear()
    vi.mocked(ensureOrigin).mockReset().mockResolvedValue(true)
    vi.mocked(removeOrigin).mockReset().mockRejectedValue(new Error('private failure-side revoke error'))

    const previous: AuroraData = {
      ...defaults(),
      settings: { ...defaults().settings, name: 'Before failed restore' },
    }
    let storage: AuroraStorage
    if (failureMode === 'failed') {
      const base = memoryDriver({ ...previous })
      let fullWriteCalls = 0
      const knownKeys = Object.keys(defaults())
      const driver: StorageDriver = {
        read: (keys) => base.read(keys),
        write: async (patch) => {
          if (knownKeys.every((key) => key in patch) && ++fullWriteCalls === 1) {
            throw new Error('injected target write failure')
          }
          await base.write(patch)
        },
        onChanged: (listener) => base.onChanged(listener),
      }
      storage = createStorage(driver, createInProcessStorageAuthority())
    } else {
      storage = createStorage(memoryDriver({ ...previous }))
      vi.mocked(ensureOrigins).mockImplementation(async (origins) => {
        origins.forEach((pattern) => holdOrigin(pattern))
        origins.forEach((pattern) => cleanupHeld.delete(pattern))
        cleanupRemovedListeners.forEach((listener) => listener({ origins: [...origins] }))
        return true
      })
    }

    await renderPanel(() => {}, storage)
    openTab('Data')
    const file = new File([serializeBackup({
      ...defaults(),
      settings: { ...defaults().settings, name: 'Must not commit' },
      connectors: {
        status: {
          enabled: false,
          services: [{ name: 'Failed restore', url: 'https://failed-settings-cleanup.example.com/status.json' }],
        },
      },
    })], `${failureMode}.json`, { type: 'application/json' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Import backup'), { target: { files: [file] } })
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm restore' }))
    })

    expect((await storage.get('settings')).name).toBe('Before failed restore')
    expect(vi.mocked(removeOrigin)).toHaveBeenCalledWith(origin)
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes(expectedCopy))).toBe(true)
    expect(screen.getByRole('button', { name: 'Retry restore' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry permission cleanup' })).toBeTruthy()

    openTab('General')
    const cleanupAlert = screen.getByRole('alert')
    expect(cleanupAlert.textContent).toBe('A site permission could not be removed yet. Aurora will keep it only until cleanup succeeds.Retry permission cleanup')
    await act(async () => {
      await storage.set('connectors', {
        status: {
          enabled: false,
          services: [{ name: 'Fresh owner', url: 'https://failed-settings-cleanup.example.com/status.json' }],
        },
      })
    })
    vi.mocked(removeOrigin).mockClear()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry permission cleanup' }))
    })

    expect(vi.mocked(removeOrigin)).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Retry permission cleanup' })).toBeNull()
  })

  it('backup export failure creates no download and renders one safe inline alert', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    vi.spyOn(storage, 'snapshot').mockRejectedValue(new Error('private export failure'))
    const originalCreate = URL.createObjectURL
    URL.createObjectURL = vi.fn() as typeof URL.createObjectURL
    await renderPanel(() => {}, storage)
    openTab('Data')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    })

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toBe('Aurora could not create the backup file. Try again.')
    expect(screen.getByRole('alert').textContent).not.toContain('private')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    URL.createObjectURL = originalCreate
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

  it('an upload completing after another context selects APOD releases the now-unowned NASA grants and reports retryable cleanup', async () => {
    const restoreLocks = installQueuedLifecycleLocks()
    const uploadGate = deferred<void>()
    vi.mocked(addUploads).mockReturnValue(uploadGate.promise)
    vi.mocked(ensureOrigins).mockImplementation(async (origins) => {
      origins.forEach(holdOrigin)
      return true
    })
    vi.mocked(removeOrigin)
      .mockReset()
      .mockRejectedValueOnce(new Error('one-shot remove failure'))
      .mockImplementation(removeHeldOrigin)

    try {
      const { storage } = await renderPanelInUploadMode()
      await storage.set('apodCache', {
        date: '2026-08-14',
        photo: { url: 'https://apod.nasa.gov/apod/image/x.jpg', title: 'X' },
      })
      const file = new File(['a'], 'a.png', { type: 'image/png' })

      act(() => {
        fireEvent.change(screen.getByLabelText('Image files'), { target: { files: [file] } })
      })
      expect(addUploads).toHaveBeenCalledWith([file])

      await act(async () => {
        await runOriginTransaction(storage, APOD_ORIGINS, async () => {
          await storage.update('photoPrefs', (prefs) => ({ ...prefs, mode: 'apod' }))
          return { ok: true, value: undefined, ownerCommitted: true }
        })
      })
      expect((await storage.get('photoPrefs')).mode).toBe('apod')

      await act(async () => {
        uploadGate.resolve()
        await flushAsyncWork()
      })

      expect((await storage.get('photoPrefs')).mode).toBe('upload')
      expect(await storage.get('apodCache')).toBeNull()
      const apodPatterns = APOD_ORIGINS.map(originPattern)
      expect(cleanupHeld.has(apodPatterns[0]!)).toBe(true)
      expect(cleanupHeld.has(apodPatterns[1]!)).toBe(false)
      expect(screen.getByRole('button', { name: 'Retry permission cleanup' })).toBeTruthy()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry permission cleanup' }))
      })

      expect(apodPatterns.some((pattern) => cleanupHeld.has(pattern))).toBe(false)
      expect(screen.queryByRole('button', { name: 'Retry permission cleanup' })).toBeNull()
    } finally {
      restoreLocks()
    }
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

  it('keeps each narrow 36px gallery remove endpoint inside its thumbnail instead of protruding past the scrollable drawer edge', async () => {
    vi.mocked(listUploads).mockResolvedValue([
      { key: 'photo:a', blob: new Blob(['a'], { type: 'image/png' }) },
    ])
    const { unmount } = await renderPanelInUploadMode()
    try {
      const remove = await screen.findByRole('button', { name: 'Remove photo 1' })
      expect(remove.className).toContain('max-[420px]:size-9')
      expect(remove.className).toContain('max-[420px]:right-0')
      expect(remove.className).toContain('max-[420px]:top-0')
      expect(remove.className).not.toContain('max-[420px]:-right-2')
      expect(remove.className).not.toContain('max-[420px]:-top-2')
    } finally {
      unmount()
    }
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

describe('SettingsPanel Background section (APOD source — Task 4)', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigins).mockReset()
    vi.mocked(removeOrigin).mockReset().mockResolvedValue(false)
  })

  function sourceSelect() {
    return screen.getByLabelText('Source') as HTMLSelectElement
  }

  const apodPatterns = APOD_ORIGINS.map(originPattern)

  function grantRequestedOrigins() {
    vi.mocked(ensureOrigins).mockImplementation(async (origins) => {
      origins.forEach(holdOrigin)
      return true
    })
  }

  it('lists "NASA photo of the day" after Gradient', async () => {
    await renderPanel()
    const options = Array.from(sourceSelect().options).map((o) => o.value)
    expect(options).toEqual(['auto', 'upload', 'gradient', 'apod'])
    expect(sourceSelect().options[3]!.textContent).toBe('NASA photo of the day')
  })

  it('queues the lifecycle lock then requests both APOD origins in the initiating change before the lock callback starts', async () => {
    const order: string[] = []
    let openLock!: () => void
    const lockGate = new Promise<void>((resolve) => { openLock = resolve })
    const originalLocks = navigator.locks
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, _options: unknown, work: () => Promise<unknown>) => {
          order.push('lock-queued')
          return lockGate.then(async () => {
            order.push('lock-callback')
            return work()
          })
        },
      },
    })
    vi.mocked(ensureOrigins).mockImplementation(async (origins) => {
      order.push('request')
      origins.forEach(holdOrigin)
      return true
    })

    try {
      const storage = await renderPanel()
      act(() => {
        fireEvent.change(sourceSelect(), { target: { value: 'apod' } })
      })

      expect(order).toEqual(['lock-queued', 'request'])
      expect(ensureOrigins).toHaveBeenCalledWith(apodPatterns)

      await act(async () => {
        openLock()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect((await storage.get('photoPrefs')).mode).toBe('apod')
      expect(cleanupHeld).toEqual(new Set(apodPatterns))
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: originalLocks })
    }
  })

  it('granting the permission saves apod mode and shows no alert', async () => {
    grantRequestedOrigins()
    const storage = await renderPanel()
    const select = sourceSelect()

    await act(async () => {
      fireEvent.change(select, { target: { value: 'apod' } })
    })

    expect(select.value).toBe('apod')
    expect((await storage.get('photoPrefs')).mode).toBe('apod')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('denial leaves the prior mode and APOD cache untouched, with the controlled-select alert', async () => {
    vi.mocked(ensureOrigins).mockResolvedValue(false)
    const storage = createStorage(memoryDriver())
    await storage.init()
    const cache = {
      date: '2026-08-13',
      photo: { url: 'https://apod.nasa.gov/apod/image/x.jpg', title: 'X' },
    }
    await storage.set('apodCache', cache)
    await renderPanel(() => {}, storage)
    const select = sourceSelect()

    await act(async () => {
      fireEvent.change(select, { target: { value: 'apod' } })
    })

    expect(select.value).toBe('auto')
    expect((await storage.get('photoPrefs')).mode).toBe('auto')
    expect(await storage.get('apodCache')).toEqual(cache)
    const error = await screen.findByRole('alert')
    expect(error.id).toBe('bg-apod-error')
    expect(error.textContent).toBe(
      'Permission to reach NASA was denied, so the background is unchanged.',
    )
    expect(error.className).toContain('text-xs')
    expect(error.className).toContain('text-fg-muted')
    expect(select.getAttribute('aria-describedby')).toBe('bg-apod-error')
  })

  it('reports access changed, not denial, when a queued APOD transaction loses its click-time grants to a release', async () => {
    const restoreLocks = installQueuedLifecycleLocks()
    const { started, allow } = deferPermissionRemovals()
    const apodPatterns = APOD_ORIGINS.map(originPattern)
    apodPatterns.forEach(holdOrigin)
    let release: ReturnType<typeof releaseUnownedOrigins> | undefined

    try {
      const storage = await renderPanel()
      release = releaseUnownedOrigins(storage, APOD_ORIGINS)
      await started.promise

      act(() => {
        fireEvent.change(sourceSelect(), { target: { value: 'apod' } })
      })
      expect(ensureOrigins).not.toHaveBeenCalled()

      await act(async () => {
        allow.resolve()
        await release
      })

      expect((await storage.get('photoPrefs')).mode).toBe('auto')
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Access changed before saving. Please try again.',
      )
    } finally {
      allow.resolve()
      await release?.catch(() => undefined)
      restoreLocks()
    }
  })

  it('a rejected APOD request leaves the mode and cache untouched', async () => {
    vi.mocked(ensureOrigins).mockRejectedValue(new Error('gesture context lost'))
    const storage = createStorage(memoryDriver())
    await storage.init()
    const cache = {
      date: '2026-08-13',
      photo: { url: 'https://apod.nasa.gov/apod/image/x.jpg', title: 'X' },
    }
    await storage.set('apodCache', cache)
    await renderPanel(() => {}, storage)
    const select = sourceSelect()

    await act(async () => {
      fireEvent.change(select, { target: { value: 'apod' } })
    })

    expect((await storage.get('photoPrefs')).mode).toBe('auto')
    expect(await storage.get('apodCache')).toEqual(cache)
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('rolls back both newly acquired APOD origins when authoritative photo preference persistence rejects', async () => {
    const driver = memoryDriver()
    let rejectPhotoPrefs = false
    const storage = createStorage({
      ...driver,
      write: async (patch) => {
        if (rejectPhotoPrefs && 'photoPrefs' in patch) throw new Error('photo prefs write failed')
        await driver.write(patch)
      },
    })
    await storage.init()
    rejectPhotoPrefs = true
    grantRequestedOrigins()
    vi.mocked(removeOrigin).mockImplementation(removeHeldOrigin)
    await renderPanel(() => {}, storage)

    await act(async () => {
      fireEvent.change(sourceSelect(), { target: { value: 'apod' } })
    })

    expect((await storage.get('photoPrefs')).mode).toBe('auto')
    expect(cleanupHeld.has(apodPatterns[0]!)).toBe(false)
    expect(cleanupHeld.has(apodPatterns[1]!)).toBe(false)
    expect(removeOrigin).toHaveBeenCalledWith(apodPatterns[0])
    expect(removeOrigin).toHaveBeenCalledWith(apodPatterns[1])
  })

  it('keeps the pre-existing APOD API permission while rolling back only the newly acquired image origin after persistence rejects', async () => {
    const driver = memoryDriver()
    let rejectPhotoPrefs = false
    const storage = createStorage({
      ...driver,
      write: async (patch) => {
        if (rejectPhotoPrefs && 'photoPrefs' in patch) throw new Error('photo prefs write failed')
        await driver.write(patch)
      },
    })
    await storage.init()
    holdOrigin(apodPatterns[0]!)
    rejectPhotoPrefs = true
    grantRequestedOrigins()
    vi.mocked(removeOrigin).mockImplementation(removeHeldOrigin)
    await renderPanel(() => {}, storage)

    await act(async () => {
      fireEvent.change(sourceSelect(), { target: { value: 'apod' } })
    })

    expect(ensureOrigins).toHaveBeenCalledWith([apodPatterns[1]!])
    expect(cleanupHeld.has(apodPatterns[0]!)).toBe(true)
    expect(cleanupHeld.has(apodPatterns[1]!)).toBe(false)
    expect(removeOrigin).not.toHaveBeenCalledWith(apodPatterns[0])
    expect(removeOrigin).toHaveBeenCalledWith(apodPatterns[1])
  })

  it('a later successful source change clears the apod alert', async () => {
    vi.mocked(ensureOrigins).mockResolvedValue(false)
    await renderPanel()
    const select = sourceSelect()

    await act(async () => {
      fireEvent.change(select, { target: { value: 'apod' } })
    })
    expect(await screen.findByRole('alert')).toBeTruthy()

    await act(async () => {
      fireEvent.change(select, { target: { value: 'gradient' } })
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('switching away from APOD clears its cache and releases both unowned origins', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('photoPrefs', { mode: 'apod', index: 0, lastRotated: '' })
    await storage.set('apodCache', {
      date: '2026-08-11',
      photo: { url: 'https://apod.nasa.gov/apod/image/x.jpg', title: 'X' },
    })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    const select = sourceSelect()
    expect(select.value).toBe('apod')

    await act(async () => {
      fireEvent.change(select, { target: { value: 'gradient' } })
    })

    expect((await storage.get('photoPrefs')).mode).toBe('gradient')
    expect(await storage.get('apodCache')).toBeNull()
    expect(removeOrigin).toHaveBeenCalledWith(apodPatterns[0])
    expect(removeOrigin).toHaveBeenCalledWith(apodPatterns[1])
  })

  it('uses the authoritative APOD mode for exit cleanup when the rendered source value is stale', async () => {
    const authoritativeStorage = createStorage(memoryDriver())
    await authoritativeStorage.init()
    await authoritativeStorage.set('apodCache', {
      date: '2026-08-13',
      photo: { url: 'https://apod.nasa.gov/apod/image/x.jpg', title: 'X' },
    })
    const stalePanelStorage: AuroraStorage = {
      ...authoritativeStorage,
      subscribe(key, callback) {
        return key === 'photoPrefs' ? () => {} : authoritativeStorage.subscribe(key, callback)
      },
    }
    apodPatterns.forEach(holdOrigin)
    vi.mocked(removeOrigin).mockImplementation(removeHeldOrigin)
    await renderPanel(() => {}, stalePanelStorage)
    expect(sourceSelect().value).toBe('auto')

    await authoritativeStorage.update('photoPrefs', (prefs) => ({ ...prefs, mode: 'apod' }))

    await act(async () => {
      fireEvent.change(sourceSelect(), { target: { value: 'gradient' } })
    })

    expect((await authoritativeStorage.get('photoPrefs')).mode).toBe('gradient')
    expect(await authoritativeStorage.get('apodCache')).toBeNull()
    expect(cleanupHeld.has(apodPatterns[0]!)).toBe(false)
    expect(cleanupHeld.has(apodPatterns[1]!)).toBe(false)
    expect(removeOrigin).toHaveBeenCalledWith(apodPatterns[0])
    expect(removeOrigin).toHaveBeenCalledWith(apodPatterns[1])
  })

  it('leaving APOD preserves an API origin claimed by a disabled configured connector, then releases it after that final owner disappears', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('photoPrefs', { mode: 'apod', index: 0, lastRotated: '' })
    await storage.set('connectors', {
      rss: { enabled: false, feeds: ['https://api.nasa.gov/planetary/apod'], shownCount: 5 },
    })
    apodPatterns.forEach(holdOrigin)
    vi.mocked(removeOrigin).mockImplementation(removeHeldOrigin)
    await renderPanel(() => {}, storage)

    await act(async () => {
      fireEvent.change(sourceSelect(), { target: { value: 'gradient' } })
    })

    expect((await storage.get('photoPrefs')).mode).toBe('gradient')
    expect(removeOrigin).not.toHaveBeenCalledWith(apodPatterns[0])
    expect(removeOrigin).toHaveBeenCalledWith(apodPatterns[1])
    expect(cleanupHeld.has(apodPatterns[0]!)).toBe(true)
    expect(cleanupHeld.has(apodPatterns[1]!)).toBe(false)

    await act(async () => {
      await storage.update('connectors', () => ({}))
    })
    await expect(releaseUnownedOrigins(storage, [APOD_ORIGINS[0]])).resolves.toEqual({
      released: [apodPatterns[0]],
      pending: [],
    })
    expect(cleanupHeld.has(apodPatterns[0]!)).toBe(false)
  })

  it('commits the selected non-APOD mode when revoke rejects, retains Settings-level retry, and clears it after retry succeeds', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('photoPrefs', { mode: 'apod', index: 0, lastRotated: '' })
    apodPatterns.forEach(holdOrigin)
    vi.mocked(removeOrigin)
      .mockRejectedValueOnce(new Error('remove failed'))
      .mockImplementation(removeHeldOrigin)
    await renderPanel(() => {}, storage)

    await act(async () => {
      fireEvent.change(sourceSelect(), { target: { value: 'gradient' } })
    })

    expect((await storage.get('photoPrefs')).mode).toBe('gradient')
    expect(cleanupHeld.has(apodPatterns[0]!)).toBe(true)
    expect(cleanupHeld.has(apodPatterns[1]!)).toBe(false)
    expect(screen.getByRole('button', { name: 'Retry permission cleanup' })).toBeTruthy()

    openTab('Data')
    expect(screen.getByRole('button', { name: 'Retry permission cleanup' })).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry permission cleanup' }))
    })

    expect(cleanupHeld.has(apodPatterns[0]!)).toBe(false)
    expect(screen.queryByRole('button', { name: 'Retry permission cleanup' })).toBeNull()
  })

  it('still releases APOD origins when the ancillary cache clear fails', async () => {
    const driver = memoryDriver()
    let rejectCache = false
    const storage = createStorage({
      ...driver,
      write: async (patch) => {
        if (rejectCache && 'apodCache' in patch) throw new Error('cache write failed')
        await driver.write(patch)
      },
    })
    await storage.init()
    await storage.set('photoPrefs', { mode: 'apod', index: 0, lastRotated: '' })
    await storage.set('apodCache', {
      date: '2026-08-13',
      photo: { url: 'https://apod.nasa.gov/apod/image/x.jpg', title: 'X' },
    })
    rejectCache = true
    apodPatterns.forEach(holdOrigin)
    vi.mocked(removeOrigin).mockImplementation(removeHeldOrigin)
    await renderPanel(() => {}, storage)

    await act(async () => {
      fireEvent.change(sourceSelect(), { target: { value: 'gradient' } })
    })

    expect((await storage.get('photoPrefs')).mode).toBe('gradient')
    expect(cleanupHeld.has(apodPatterns[0]!)).toBe(false)
    expect(cleanupHeld.has(apodPatterns[1]!)).toBe(false)
    expect(await storage.get('apodCache')).not.toBeNull()
  })

  it('switching between two non-apod modes never touches ensureOrigins/removeOrigin', async () => {
    const storage = await renderPanel()
    const select = sourceSelect()

    await act(async () => {
      fireEvent.change(select, { target: { value: 'gradient' } })
    })

    expect(ensureOrigins).not.toHaveBeenCalled()
    expect(removeOrigin).not.toHaveBeenCalled()
    expect((await storage.get('photoPrefs')).mode).toBe('gradient')
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

// Task 94: sun/moon toggles. Same minimal on/off/persist shape as Month
// calendar's own block above — no list editor of either widget's own — plus
// the location-gate hint SunWidget/MoonWidget's own doc comments describe
// (both widgets render nothing without a stored location; the Widgets tab
// says why via this shared hint rather than leaving the toggle unexplained).
describe('SettingsPanel Widgets section (sun/moon toggles + location hint)', () => {
  const HINT_TEXT =
    'Sun times and moon phase use the weather location. Turn on the weather widget and set a location first.'

  it('the Sun times and Moon phase labels are present on the Widgets tab, off by default', async () => {
    await renderPanel()
    openTab('Widgets')
    const sun = screen.getByLabelText('Sun times') as HTMLButtonElement
    const moon = screen.getByLabelText('Moon phase') as HTMLButtonElement
    expect(attr(sun, 'aria-checked')).toBe('false')
    expect(attr(moon, 'aria-checked')).toBe('false')
  })

  it('turning the toggles on writes widgets.sun / widgets.moon; turning them back off writes false', async () => {
    const storage = await renderPanel()
    openTab('Widgets')
    const sun = screen.getByLabelText('Sun times') as HTMLButtonElement
    const moon = screen.getByLabelText('Moon phase') as HTMLButtonElement

    await act(async () => {
      fireEvent.click(sun)
    })
    expect(attr(sun, 'aria-checked')).toBe('true')
    expect((await storage.get('settings')).widgets.sun).toBe(true)

    await act(async () => {
      fireEvent.click(moon)
    })
    expect(attr(moon, 'aria-checked')).toBe('true')
    expect((await storage.get('settings')).widgets.moon).toBe(true)

    // Separate act() blocks per click (not batched together): each
    // handleWidgetToggle closes over the CURRENT settings prop, so two
    // clicks fired in the same tick without a re-render between them would
    // both patch off the same stale widgets object — same discipline as the
    // Month calendar toggle's own sequential on/off test above.
    await act(async () => {
      fireEvent.click(sun)
    })
    expect((await storage.get('settings')).widgets.sun).toBe(false)

    await act(async () => {
      fireEvent.click(moon)
    })
    expect((await storage.get('settings')).widgets.moon).toBe(false)
  })

  it('with no location stored, a single hint paragraph renders below the moon row and both switches carry describedBy', async () => {
    // renderPanel() never sets `location`, so it resolves to defaults()'s own
    // `null` (unset) once storage.init() backfills it — the exact "no
    // location" state SunWidget/MoonWidget gate on.
    await renderPanel()
    openTab('Widgets')
    const sun = screen.getByLabelText('Sun times') as HTMLButtonElement
    const moon = screen.getByLabelText('Moon phase') as HTMLButtonElement

    const hints = screen.getAllByText(HINT_TEXT)
    expect(hints).toHaveLength(1) // renders ONCE, not once per switch
    const hint = hints[0]!
    expect(hint.id).toBe('w-sky-location-hint')
    expect(hint.className).toBe('text-xs text-fg-muted')

    expect(attr(sun, 'aria-describedby')).toBe(hint.id)
    expect(attr(moon, 'aria-describedby')).toBe(hint.id)
  })

  it('with a location set, the hint is absent', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('location', { lat: 1, lon: 2, label: 'Springfield', manual: true })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Widgets')

    expect(screen.queryByText(HINT_TEXT)).toBeNull()
    const sun = screen.getByLabelText('Sun times') as HTMLButtonElement
    const moon = screen.getByLabelText('Moon phase') as HTMLButtonElement
    expect(attr(sun, 'aria-describedby')).toBeNull()
    expect(attr(moon, 'aria-describedby')).toBeNull()
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

  async function openLayoutTab() {
    await act(async () => {
      openTab('Widgets')
    })
  }

  it('keeps Layout focused on arrangement and removes the retired density and briefing controls', async () => {
    await renderPanel()
    await openLayoutTab()

    const region = within(layoutRegion())
    expect(region.queryByLabelText('Layout density')).toBeNull()
    expect(region.queryByLabelText('Show briefing')).toBeNull()
    expect(region.getByRole('button', { name: 'Arrange layout' })).toBeTruthy()
    expect(region.queryByRole('button', { name: 'Reset layout' })).toBeNull()
  })

  it('shows truthful information controls on General and persists their existing compatible fields', async () => {
    const storage = await renderPanel()
    const size = screen.getByRole('combobox', { name: 'Text size' }) as HTMLSelectElement
    expect(size.value).toBe('auto')
    expect(within(size).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Automatic', 'Standard', 'Large',
    ])
    expect(screen.getByText('Uses your next calendar event, unfinished tasks, and rain forecast. Nothing is shown when there is no useful update.')).toBeTruthy()
    expect(screen.queryByLabelText('Mute sounds')).toBeNull()
    expect(screen.queryByLabelText('Show briefing')).toBeNull()
    expect(screen.queryByLabelText('Layout density')).toBeNull()

    await act(async () => {
      fireEvent.change(size, { target: { value: 'spacious' } })
    })
    expect((await storage.get('settings')).layoutDensity).toBe('spacious')

    const sound = screen.getByRole('switch', { name: 'Timer completion sound' })
    expect(sound.getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      fireEvent.click(sound)
    })
    expect((await storage.get('settings')).muted).toBe(true)

    const summary = screen.getByRole('switch', { name: 'Daily summary' })
    await act(async () => {
      fireEvent.click(summary)
    })
    expect((await storage.get('settings')).briefingEnabled).toBe(true)
  })

  it('projects legacy Compact to Standard without rewriting Settings', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const settings = { ...await storage.get('settings'), name: 'Reloaded', layoutDensity: 'compact' as const }
    await storage.set('settings', settings)
    const set = vi.spyOn(storage, 'set')
    const update = vi.spyOn(storage, 'update')

    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')

    expect((screen.getByRole('combobox', { name: 'Text size' }) as HTMLSelectElement).value).toBe('balanced')
    expect(set).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(await storage.get('settings')).toEqual(settings)
  })

  it('treats an absent Daily summary preference as off and writes it only after the user changes it', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const set = vi.spyOn(storage, 'set')

    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')

    const briefing = screen.getByRole('switch', { name: 'Daily summary' })
    expect(briefing.getAttribute('aria-checked')).toBe('false')
    expect((await storage.get('settings')).briefingEnabled).toBeUndefined()
    expect(set).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(briefing)
    })
    expect((await storage.get('settings')).briefingEnabled).toBe(true)
    expect(set).toHaveBeenCalledOnce()
  })

  it('Arrange layout calls the onArrangeLayout callback threaded down from App (which closes the drawer, then bumps ArrangeController\'s openSignal nonce)', async () => {
    const onArrangeLayout = vi.fn()
    await renderPanel(onArrangeLayout)
    await openLayoutTab()

    fireEvent.click(within(layoutRegion()).getByRole('button', { name: 'Arrange layout' }))

    expect(onArrangeLayout).toHaveBeenCalledOnce()
  })

  it('legacy Reset layout Cancel writes neither key; confirm clears only the V2 layout and preserves Settings byte-for-byte', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const positioned = layoutV2FromLegacy({ clock: { x: 10, y: 10 } })
    const settings = {
      ...await storage.get('settings'),
      name: 'Preserve all settings',
      muted: true,
      layoutDensity: 'spacious' as const,
    }
    await storage.set('settings', settings)
    await storage.set('layout', positioned)
    const set = vi.spyOn(storage, 'set')
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    await openLayoutTab()

    fireEvent.click(within(layoutRegion()).getByRole('button', { name: 'Reset layout' }))
    expect(await storage.get('layout')).toEqual(positioned) // opening the dialog never writes
    // The dialog portals to document.body, outside the "Layout" region's own
    // subtree — and its confirm button shares the SAME accessible name
    // ("Reset layout") as the section button that opened it, so every
    // dialog-scoped query below goes through `within(dialog)` to disambiguate.
    let dialog = screen.getByRole('dialog', { name: 'Reset layout?' })
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' })) // safe default

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()
    expect(await storage.get('layout')).toEqual(positioned) // Cancel never writes
    expect(await storage.get('settings')).toEqual(settings)
    expect(set).not.toHaveBeenCalled()

    fireEvent.click(within(layoutRegion()).getByRole('button', { name: 'Reset layout' }))
    dialog = screen.getByRole('dialog', { name: 'Reset layout?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset layout' })) // the dialog's own confirm button
    await act(async () => {})
    expect(await storage.get('layout')).toEqual(emptyLayoutV2())
    expect(await storage.get('settings')).toEqual(settings)
    expect(set).toHaveBeenCalledOnce()
    expect(set).toHaveBeenCalledWith('layout', emptyLayoutV2())
  })

  it('does not offer the legacy global Reset for Canvas V3 or write the layout on open', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const previous = layoutV2FromLegacy({ clock: { x: 12.25, y: 34.75 } })
    const canvas = saveCanvasProfile(previous, 'standard', {
      mode: 'custom',
      placements: {
        clock: { kind: 'canvas', x: 50, y: 38, size: 'full', layer: 0 },
        notes: { kind: 'canvas', x: 84, y: 76, size: 'standard', layer: 1 },
      },
    })
    await storage.set('layout', canvas)
    const before = JSON.stringify(await storage.get('layout'))
    const set = vi.spyOn(storage, 'set')
    const update = vi.spyOn(storage, 'update')
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    await openLayoutTab()

    expect(within(layoutRegion()).queryByRole('button', { name: 'Reset layout' })).toBeNull()
    expect(within(layoutRegion()).getByRole('button', { name: 'Arrange layout' })).toBeTruthy()
    expect(within(layoutRegion()).getByRole('button', { name: 'Restore previous layout' })).toBeTruthy()
    expect(JSON.stringify(await storage.get('layout'))).toBe(before)
    expect(set.mock.calls.filter(([key]) => key === 'layout')).toEqual([])
    expect(update.mock.calls.filter(([key]) => key === 'layout')).toEqual([])
  })

  it('offers exact previous-layout recovery only while V3 recovery exists', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const previous = layoutV2FromLegacy({ clock: { x: 12.25, y: 34.75 } })
    const saved = saveCanvasProfile(previous, 'standard', {
      mode: 'custom',
      placements: {
        clock: { kind: 'canvas', x: 50, y: 40, size: 'full', layer: 0 },
      },
    })
    await storage.set('layout', saved)
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    await openLayoutTab()

    const restore = within(layoutRegion()).getByRole('button', { name: 'Restore previous layout' })
    await act(async () => {
      fireEvent.click(restore)
    })

    expect(await storage.get('layout')).toEqual(previous)
    expect(within(layoutRegion()).queryByRole('button', { name: 'Restore previous layout' })).toBeNull()
  })

  it('does not show or write recovery for a layout without recovery data', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const update = vi.spyOn(storage, 'update')
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    await openLayoutTab()

    expect(within(layoutRegion()).queryByRole('button', { name: 'Restore previous layout' })).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('Escape cancels the confirm dialog without writing anything', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const positioned = layoutV2FromLegacy({ clock: { x: 10, y: 10 } })
    await storage.set('layout', positioned)
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    await openLayoutTab()

    fireEvent.click(within(layoutRegion()).getByRole('button', { name: 'Reset layout' }))
    expect(screen.getByRole('dialog', { name: 'Reset layout?' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()
    expect(await storage.get('layout')).toEqual(positioned)
  })

  it('an open confirm dialog does not survive the drawer closing, so reopening within the same session shows it closed (review fix)', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', layoutV2FromLegacy({ clock: { x: 10, y: 10 } }))
    function Wrapper({ open }: { open: boolean }) {
      return (
        <StorageProvider storage={storage}>
          <SettingsPanel onArrangeLayout={() => {}} open={open} />
        </StorageProvider>
      )
    }
    const { rerender } = render(<Wrapper open={true} />)
    await screen.findByLabelText('Your name')
    await openLayoutTab()

    fireEvent.click(within(layoutRegion()).getByRole('button', { name: 'Reset layout' }))
    expect(screen.getByRole('dialog', { name: 'Reset layout?' })).toBeTruthy()

    rerender(<Wrapper open={false} />) // Drawer.tsx merely toggles inert/translate — SettingsPanel stays mounted
    rerender(<Wrapper open={true} />) // reopened

    expect(within(layoutRegion()).getByRole('button', { name: 'Reset layout' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Reset layout?' })).toBeNull()
    // And nothing was actually written by the stray open dialog.
    expect(await storage.get('layout')).toEqual(layoutV2FromLegacy({ clock: { x: 10, y: 10 } }))
  })

  it('both buttons are absent entirely (no dead/disabled buttons) when isPremium() is false', async () => {
    vi.mocked(isPremium).mockReturnValue(false)
    await renderPanel()
    await openLayoutTab()

    expect(screen.queryByRole('region', { name: 'Layout' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Arrange layout' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Reset layout/ })).toBeNull()
  })
})

// Task 80 (W3-SP1): the Connectors tab default export grows a search box +
// category grouping + a pinned "On your board" group on top of the plain
// registry-order card list every describe block below still exercises. This
// suite is about THAT restructuring specifically — grouping/search/ranking —
// not any individual card's body, which is why it renders with no config
// (default grouping) or a minimal github/ics seed (pinning), rather than
// going through every connector's own describe block above.
describe('Connectors tab — search and categories', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigin).mockReset()
    vi.mocked(whoamiGithub).mockReset()
  })

  async function renderConnectors(config?: { github?: GithubConfig; ics?: IcsConfig }) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    if (config) await storage.set('connectors', config)
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

  // Every group/pinned eyebrow name that could possibly appear — used to
  // filter getAllByRole('heading', { level: 4 }) down to JUST the eyebrows,
  // since ConnectorCard's own title is ALSO an <h4> (its label, e.g.
  // 'GitHub') and lives in the very same subtree.
  const EYEBROW_NAMES = ['On your board', 'Development', 'Calendar & tasks', 'Home', 'News & markets', 'Fun']

  function eyebrowsIn(container: HTMLElement): string[] {
    return within(container)
      .getAllByRole('heading', { level: 4 })
      .map((h) => h.textContent)
      .filter((t): t is string => t !== null && EYEBROW_NAMES.includes(t))
  }

  // The card titles (h4s that are NOT an eyebrow) inside one eyebrow's own
  // group wrapper — `heading.parentElement` is that wrapper (the group <div>
  // holding exactly its own eyebrow + its own cards, see Connectors.tsx),
  // so `within` scopes strictly to that one group, not its siblings.
  function cardsUnder(heading: HTMLElement): string[] {
    return within(heading.parentElement as HTMLElement)
      .getAllByRole('heading', { level: 4 })
      .map((h) => h.textContent)
      .filter((t): t is string => t !== null && t !== heading.textContent)
  }

  it('default grouping: eyebrows in CATEGORY_ORDER for non-empty categories only; cards in registry order beneath each', async () => {
    await renderConnectors()
    const region = connectorsRegion()

    // No connector enabled -> no pinned group; Fun has no members yet -> no
    // eyebrow for it. Home now has one member (homeassistant, Task 101), so
    // it joins the other three non-empty categories, IN CATEGORY_ORDER.
    expect(eyebrowsIn(region)).toEqual(['Development', 'Calendar & tasks', 'Home', 'News & markets'])

    expect(cardsUnder(within(region).getByRole('heading', { name: 'Development' }))).toEqual([
      'GitHub',
      'GitLab',
      'Jira',
      'Vercel',
      'Status',
    ])
    expect(cardsUnder(within(region).getByRole('heading', { name: 'Calendar & tasks' }))).toEqual(['Calendar'])
    expect(cardsUnder(within(region).getByRole('heading', { name: 'Home' }))).toEqual(['Home Assistant'])
    expect(cardsUnder(within(region).getByRole('heading', { name: 'News & markets' }))).toEqual(['RSS', 'Crypto'])
  })

  it('pinning: enabling github + ics surfaces "On your board" first with exactly those two cards, absent from their categories', async () => {
    await renderConnectors({
      github: { enabled: true, token: '', username: '' },
      ics: { enabled: true, calendars: [{ name: 'Personal', url: 'https://calendar.example.com/basic.ics' }] },
    })
    const region = connectorsRegion()

    // 'On your board' FIRST, registry order (github before ics).
    expect(eyebrowsIn(region)).toEqual(['On your board', 'Development', 'Home', 'News & markets'])
    expect(cardsUnder(within(region).getByRole('heading', { name: 'On your board' }))).toEqual([
      'GitHub',
      'Calendar',
    ])

    // Development keeps its other four, minus the now-pinned github.
    expect(cardsUnder(within(region).getByRole('heading', { name: 'Development' }))).toEqual([
      'GitLab',
      'Jira',
      'Vercel',
      'Status',
    ])

    // Calendar & tasks had ONLY ics -> now empty -> no eyebrow at all (not an
    // empty group, an ABSENT one).
    expect(within(region).queryByRole('heading', { name: 'Calendar & tasks' })).toBeNull()
  })

  it('search filters: "git" is a flat list (no eyebrows) with GitHub + GitLab only; "calendar" matches the Calendar card by blurb', async () => {
    await renderConnectors()
    const region = connectorsRegion()
    const input = screen.getByLabelText('Search connectors') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'git' } })

    expect(eyebrowsIn(region)).toEqual([]) // query active -> flat, no eyebrows at all
    expect(within(region).getByRole('heading', { name: 'GitHub' })).toBeTruthy()
    expect(within(region).getByRole('heading', { name: 'GitLab' })).toBeTruthy()
    expect(within(region).queryByRole('heading', { name: 'Calendar' })).toBeNull()
    expect(within(region).queryByRole('heading', { name: 'RSS' })).toBeNull()
    expect(within(region).queryByRole('heading', { name: 'Crypto' })).toBeNull()
    expect(within(region).queryByRole('heading', { name: 'Jira' })).toBeNull()
    expect(within(region).queryByRole('heading', { name: 'Vercel' })).toBeNull()

    fireEvent.change(input, { target: { value: 'calendar' } })

    expect(within(region).getByRole('heading', { name: 'Calendar' })).toBeTruthy()
    expect(within(region).getByText('Your next events, from any calendar app')).toBeTruthy()
  })

  it('ranking: "crypto" puts the Crypto card first in the scroll region', async () => {
    await renderConnectors()
    fireEvent.change(screen.getByLabelText('Search connectors'), { target: { value: 'crypto' } })

    const scroll = screen.getByTestId('connector-scroll')
    const firstCardHeading = within(scroll).getAllByRole('heading', { level: 4 })[0]
    expect(firstCardHeading?.textContent).toBe('Crypto')
  })

  it('empty state: no match renders the exact copy and no cards', async () => {
    await renderConnectors()
    const region = connectorsRegion()
    fireEvent.change(screen.getByLabelText('Search connectors'), { target: { value: 'zzz' } })

    const empty = within(region).getByText('No connector matches.')
    expect(empty.tagName).toBe('P')
    expect(within(region).queryAllByRole('heading', { level: 4 })).toEqual([])
  })

  it('clearing the search restores the default grouping shape', async () => {
    await renderConnectors()
    const input = screen.getByLabelText('Search connectors') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'git' } })
    expect(screen.queryByRole('heading', { name: 'Development' })).toBeNull()

    fireEvent.change(input, { target: { value: '' } })
    expect(eyebrowsIn(connectorsRegion())).toEqual(['Development', 'Calendar & tasks', 'Home', 'News & markets'])
  })

  // Behavior preservation: the exact "connect happy path" assertions from
  // the GitHub describe block above (ensureOrigin -> whoami -> persisted
  // config), just with a search query active throughout — proof the search/
  // grouping rework changed navigation only, never the card's own behavior.
  it('behavior preservation: the GitHub connect flow still works end-to-end with "github" active in search', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiGithub).mockResolvedValue({ ok: true, identity: 'octocat' })
    const storage = await renderConnectors({ github: { enabled: true, token: '', username: '' } })

    fireEvent.change(screen.getByLabelText('Search connectors'), { target: { value: 'github' } })

    const input = screen.getByLabelText('Fine-grained personal access token') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'github_pat_123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).toHaveBeenCalledWith('https://api.github.com/*')
    expect(whoamiGithub).toHaveBeenCalledWith('github_pat_123')
    expect(await storage.get('connectors')).toMatchObject({
      github: { enabled: true, token: 'github_pat_123', username: 'octocat' },
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('SettingsPanel Connectors section (RSS card)', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigin).mockReset()
    vi.mocked(removeOrigin).mockReset().mockImplementation(removeHeldOrigin)
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

    expect(ensureOrigin).toHaveBeenCalledWith('https://news.ycombinator.com/*')
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

  it('reports access changed, not denial, when a queued RSS add loses its click-time grant to a release', async () => {
    const restoreLocks = installQueuedLifecycleLocks()
    const origin = 'https://race-rss.example.com/*'
    const url = 'https://race-rss.example.com/feed.xml'
    const { started, allow } = deferPermissionRemovals()
    holdOrigin(origin)
    let release: ReturnType<typeof releaseUnownedOrigins> | undefined

    try {
      const storage = await renderWithConnectors({ enabled: true, feeds: [], shownCount: 5 })
      release = releaseUnownedOrigins(storage, [origin])
      await started.promise

      act(() => {
        fireEvent.change(screen.getByLabelText('Add feed URL'), { target: { value: url } })
        fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
      })
      expect(ensureOrigin).not.toHaveBeenCalled()

      await act(async () => {
        allow.resolve()
        await release
      })

      expect((await readRss(storage))?.feeds).toEqual([])
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Access changed before saving. Please try again.',
      )
    } finally {
      allow.resolve()
      await release?.catch(() => undefined)
      restoreLocks()
    }
  })

  it('rolls back a newly acquired RSS origin when persisting the feed rejects', async () => {
    const url = 'https://rollback-rss.example.com/feed.xml'
    const origin = 'https://rollback-rss.example.com/*'
    vi.mocked(ensureOrigin).mockImplementation(async (requested) => {
      holdOrigin(originPattern(requested))
      return true
    })
    const storage = await renderWithConnectors({ enabled: true, feeds: [], shownCount: 5 })
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectors') return Promise.reject(new Error('disk full'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add feed URL'), { target: { value: url } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(cleanupHeld.has(origin)).toBe(false)
    expect((await readRss(storage))?.feeds).toEqual([])
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't save/i)
  })

  it('preserves a pre-existing RSS grant when its persistence write rejects', async () => {
    const url = 'https://preexisting-rss.example.com/feed.xml'
    const origin = 'https://preexisting-rss.example.com/*'
    holdOrigin(origin)
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithConnectors({ enabled: true, feeds: [], shownCount: 5 })
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectors') return Promise.reject(new Error('disk full'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add feed URL'), { target: { value: url } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(cleanupHeld.has(origin)).toBe(true)
    expect(removeOrigin).not.toHaveBeenCalled()
  })

  it('aborts a concurrently duplicated RSS add without rolling back the now-configured owner', async () => {
    const url = 'https://concurrent-rss.example.com/feed.xml'
    const origin = 'https://concurrent-rss.example.com/*'
    vi.mocked(ensureOrigin).mockImplementation(async (requested) => {
      holdOrigin(originPattern(requested))
      return true
    })
    const storage = await renderWithConnectors({ enabled: true, feeds: [], shownCount: 5 })
    const update = storage.update.bind(storage)
    storage.update = ((_key: unknown, fn: unknown) =>
      update('connectors', () =>
        (fn as (value: never) => never)({ rss: { enabled: true, feeds: [url], shownCount: 5 } } as never),
      )
    ) as unknown as AuroraStorage['update']

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add feed URL'), { target: { value: url } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(cleanupHeld.has(origin)).toBe(true)
    expect((await readRss(storage))?.feeds).toEqual([url])
    expect((await screen.findByRole('alert')).textContent).toBe('That feed is already in the list.')
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
    expect(removeOrigin).toHaveBeenCalledWith('https://other.com/*')
    expect((await readRss(storage))?.feeds).toEqual(['https://example.com/feed-b'])
  })

  it('rechecks RSS cleanup ownership before Retry and retains an origin a newly configured Status owner claims', async () => {
    const url = 'https://recoverable-rss.example.com/feed.xml'
    const origin = 'https://recoverable-rss.example.com/*'
    holdOrigin(origin)
    vi.mocked(removeOrigin).mockRejectedValueOnce(new Error('remove failed'))
    const storage = await renderWithConnectors({ enabled: true, feeds: [url], shownCount: 5 })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Remove ${url}` }))
    })

    expect((await readRss(storage))?.feeds).toEqual([])
    expect(screen.queryByRole('button', { name: `Remove ${url}` })).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry permission cleanup' })).toBeTruthy()
    expect(cleanupHeld.has(origin)).toBe(true)

    // A config changed after the failed revoke must be read freshly by Retry,
    // not inferred from the old row-removal transaction. Disabled connectors
    // still own their descriptor origins.
    await act(async () => {
      await storage.update('connectors', (prev) => ({
        ...prev,
        status: {
          enabled: false,
          services: [{ name: 'Shared', url: 'https://recoverable-rss.example.com/api/v2/status.json' }],
        },
      }))
    })

    openTab('Data')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry permission cleanup' }))
    })

    expect(removeOrigin).toHaveBeenCalledTimes(1)
    expect(cleanupHeld.has(origin)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Retry permission cleanup' })).toBeNull()
  })

  it('two same-origin removes racing before a re-render leave no grant behind, even when the second remove verifies absence', async () => {
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
    expect(removeOrigin).toHaveBeenCalledTimes(2)
    expect(removeOrigin).toHaveBeenCalledWith('https://example.com/*')
  })

  it('withholds an RSS revoke while a disabled Status config still owns the same origin', async () => {
    const url = 'https://shared-rss-status.example.com/feed.xml'
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      rss: { enabled: true, feeds: [url], shownCount: 5 },
      status: {
        enabled: false,
        services: [{ name: 'Shared', url: 'https://shared-rss-status.example.com/api/v2/status.json' }],
      },
    })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Remove ${url}` }))
    })

    expect(removeOrigin).not.toHaveBeenCalled()
  })

  it('withholds the RSS API origin while APOD owns it', async () => {
    const url = 'https://api.nasa.gov/planetary/apod'
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { rss: { enabled: true, feeds: [url], shownCount: 5 } })
    await storage.set('photoPrefs', { mode: 'apod', index: 0, lastRotated: '' })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Remove ${url}` }))
    })

    expect(removeOrigin).not.toHaveBeenCalled()
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
    vi.mocked(removeOrigin).mockReset().mockImplementation(removeHeldOrigin)
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
    expect(await readGithub(storage)).toEqual({
      enabled: true,
      token: 'github_pat_123',
      username: 'octocat',
      snapshotEpoch: expect.any(String),
    })
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

  it('reports access changed, not denial, when a queued GitHub connect loses its click-time grant to a release', async () => {
    const restoreLocks = installQueuedLifecycleLocks()
    const origin = 'https://api.github.com/*'
    const { started, allow } = deferPermissionRemovals()
    holdOrigin(origin)
    let release: ReturnType<typeof releaseUnownedOrigins> | undefined

    try {
      const storage = await renderWithGithub({ enabled: true, token: '', username: '' })
      release = releaseUnownedOrigins(storage, [origin])
      await started.promise

      act(() => {
        fireEvent.change(screen.getByLabelText('Fine-grained personal access token'), {
          target: { value: 'github_pat_race' },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
      })
      expect(ensureOrigin).not.toHaveBeenCalled()

      await act(async () => {
        allow.resolve()
        await release
      })

      expect(whoamiGithub).not.toHaveBeenCalled()
      expect((await readGithub(storage))?.token).toBe('')
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Access changed before saving. Please try again.',
      )
    } finally {
      allow.resolve()
      await release?.catch(() => undefined)
      restoreLocks()
    }
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

  it('keeps GitHub connected and does not release when the shared disconnect lifecycle authority is unavailable', async () => {
    const storage = await renderWithGithub({ enabled: true, token: 'github_pat_x', username: 'octocat' })
    const originalLocks = navigator.locks
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })

    try {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
      })
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: originalLocks })
    }

    expect(await readGithub(storage)).toEqual({ enabled: true, token: 'github_pat_x', username: 'octocat' })
    expect(removeOrigin).not.toHaveBeenCalled()
    expect(screen.getAllByText('Connected as octocat')).toHaveLength(1)
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be updated/i)
  })

  it('keeps GitHub connected and does not release when its authoritative removal write rejects', async () => {
    const storage = await renderWithGithub({ enabled: true, token: 'github_pat_x', username: 'octocat' })
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectors') return Promise.reject(new Error('storage rejected'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    expect(await readGithub(storage)).toEqual({ enabled: true, token: 'github_pat_x', username: 'octocat' })
    expect(removeOrigin).not.toHaveBeenCalled()
    expect(screen.getAllByText('Connected as octocat')).toHaveLength(1)
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be updated/i)
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
    vi.mocked(removeOrigin).mockReset().mockImplementation(removeHeldOrigin)
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
      snapshotEpoch: expect.any(String),
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
    vi.mocked(removeOrigin).mockReset().mockImplementation(removeHeldOrigin)
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
      snapshotEpoch: expect.any(String),
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
    vi.mocked(removeOrigin).mockReset().mockImplementation(removeHeldOrigin)
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
    expect(await readVercel(storage)).toEqual({
      enabled: true,
      token: 'vc_123',
      username: 'jon',
      snapshotEpoch: expect.any(String),
    })
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

    expect(ensureOrigin).toHaveBeenCalledWith('https://api.coingecko.com/*')
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

  it('rolls back a newly acquired CoinGecko origin when the crypto save rejects', async () => {
    const origin = 'https://api.coingecko.com/*'
    vi.mocked(removeOrigin).mockImplementation(removeHeldOrigin)
    vi.mocked(ensureOrigin).mockImplementation(async (requested) => {
      holdOrigin(originPattern(requested))
      return true
    })
    const storage = await renderWithCrypto({ enabled: true, coins: [] })
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectors') return Promise.reject(new Error('disk full'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Coins (CoinGecko ids, comma-separated)'), {
        target: { value: 'bitcoin, ethereum' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(cleanupHeld.has(origin)).toBe(false)
    expect(await readCrypto(storage)).toEqual({ enabled: true, coins: [] })
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't save/i)
  })

  it('preserves a pre-existing CoinGecko grant when the crypto save rejects', async () => {
    const origin = 'https://api.coingecko.com/*'
    holdOrigin(origin)
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithCrypto({ enabled: true, coins: [] })
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectors') return Promise.reject(new Error('disk full'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Coins (CoinGecko ids, comma-separated)'), {
        target: { value: 'bitcoin, ethereum' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(cleanupHeld.has(origin)).toBe(true)
    expect(removeOrigin).not.toHaveBeenCalled()
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

  it('keeps Crypto configured and reports an owner-write error when Clear cannot persist removal', async () => {
    const storage = await renderWithCrypto({ enabled: true, coins: ['bitcoin', 'ethereum'] })
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectors') return Promise.reject(new Error('disk full'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    })

    expect(await readCrypto(storage)).toEqual({ enabled: true, coins: ['bitcoin', 'ethereum'] })
    expect((screen.getByLabelText('Coins (CoinGecko ids, comma-separated)') as HTMLInputElement).value).toBe(
      'bitcoin, ethereum',
    )
    expect(removeOrigin).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't clear crypto.*saved configuration/i)
  })

  it('withholds Crypto clear revocation while a disabled descriptor config owns CoinGecko', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      crypto: { enabled: true, coins: ['bitcoin', 'ethereum'] },
      gitlab: {
        enabled: false,
        token: 'glpat-live',
        username: 'octocat',
        instanceUrl: 'https://api.coingecko.com',
      },
    })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    })

    expect((await storage.get('connectors')).crypto).toBeUndefined()
    expect(removeOrigin).not.toHaveBeenCalled()
  })

  it('keeps a failed Crypto clear release in the Settings-level retry surface after its body unmounts', async () => {
    const origin = 'https://api.coingecko.com/*'
    holdOrigin(origin)
    vi.mocked(removeOrigin).mockRejectedValueOnce(new Error('remove failed'))
    const storage = await renderWithCrypto({ enabled: true, coins: ['bitcoin', 'ethereum'] })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    })

    expect(await readCrypto(storage)).toBeUndefined()
    expect(screen.queryByLabelText('Coins (CoinGecko ids, comma-separated)')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry permission cleanup' })).toBeTruthy()

    openTab('Data')
    vi.mocked(removeOrigin).mockImplementation(removeHeldOrigin)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry permission cleanup' }))
    })

    expect(cleanupHeld.has(origin)).toBe(false)
    expect(screen.queryByRole('button', { name: 'Retry permission cleanup' })).toBeNull()
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

    expect(ensureOrigin).toHaveBeenCalledWith('https://p57-caldav.icloud.com/*')
    expect(await readIcs(storage)).toEqual({
      enabled: true,
      calendars: [{ name: 'Personal', url: 'https://p57-caldav.icloud.com/published/2/abc' }],
      view: 'today',
      upcomingCount: 3,
      meetLinks: true,
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

  it('rolls back a newly acquired calendar origin when the list write rejects', async () => {
    const origin = 'https://rollback-ics.example.com/*'
    const url = 'https://rollback-ics.example.com/private.ics'
    vi.mocked(removeOrigin).mockImplementation(removeHeldOrigin)
    vi.mocked(ensureOrigin).mockImplementation(async (requested) => {
      holdOrigin(originPattern(requested))
      return true
    })
    const storage = await renderWithIcs({ enabled: true })
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectors') return Promise.reject(new Error('disk full'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Secret calendar address (ICS URL)'), { target: { value: url } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(cleanupHeld.has(origin)).toBe(false)
    expect(await readIcs(storage)).toEqual({ enabled: true })
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't save/i)
  })

  it('preserves a pre-existing calendar origin when the list write rejects', async () => {
    const origin = 'https://preexisting-ics.example.com/*'
    const url = 'https://preexisting-ics.example.com/private.ics'
    holdOrigin(origin)
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithIcs({ enabled: true })
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectors') return Promise.reject(new Error('disk full'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Secret calendar address (ICS URL)'), { target: { value: url } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(cleanupHeld.has(origin)).toBe(true)
    expect(removeOrigin).not.toHaveBeenCalled()
  })

  it('aborts a calendar add whose authoritative updater finds a concurrent cap, rolls back its grant, and leaves the snapshot intact', async () => {
    const url = 'https://concurrent-ics.example.com/private.ics'
    const origin = 'https://concurrent-ics.example.com/*'
    const full = Array.from({ length: 5 }, (_, i) => ({
      name: `Concurrent ${i + 1}`,
      url: `https://calendar-${i}.example.com/private.ics`,
    }))
    vi.mocked(removeOrigin).mockImplementation(removeHeldOrigin)
    vi.mocked(ensureOrigin).mockImplementation(async (requested) => {
      holdOrigin(originPattern(requested))
      return true
    })
    const storage = await renderWithIcs({ enabled: true }, true)
    const update = storage.update.bind(storage)
    storage.update = ((_key: unknown, fn: unknown) =>
      update('connectors', () =>
        (fn as (value: never) => never)({ ics: { enabled: true, calendars: full } } as never),
      )
    ) as unknown as AuroraStorage['update']

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Secret calendar address (ICS URL)'), { target: { value: url } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(cleanupHeld.has(origin)).toBe(false)
    expect((await readIcs(storage))?.calendars).toEqual(full)
    expect((await storage.get('connectorSnapshots')).ics).toBeTruthy()
    expect((await screen.findByRole('alert')).textContent).toMatch(/Up to 5 calendars/i)
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

  it('persists an explicit feed color without changing its URL, permissions, or snapshot', async () => {
    const url = 'https://calendar.example.com/personal/basic.ics'
    const storage = await renderWithIcs({
      enabled: true,
      calendars: [{ name: 'Personal', url }],
    }, true)
    const beforeSnapshot = (await storage.get('connectorSnapshots')).ics

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Color for Personal' }), { target: { value: 'emerald' } })
    })

    expect(await readIcs(storage)).toEqual({
      enabled: true,
      calendars: [{ name: 'Personal', url, color: 'emerald' }],
    })
    expect(ensureOrigin).not.toHaveBeenCalled()
    expect(removeOrigin).not.toHaveBeenCalled()
    expect((await storage.get('connectorSnapshots')).ics).toEqual(beforeSnapshot)
    expect(within(connectorsRegion()).getByRole('listitem').querySelector('.bg-emerald-400')).toBeTruthy()
  })

  it('ignores a malformed color-control value instead of persisting an open-ended color', async () => {
    const url = 'https://calendar.example.com/personal/basic.ics'
    const storage = await renderWithIcs({
      enabled: true,
      calendars: [{ name: 'Personal', url, color: 'sky' }],
    })

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Color for Personal' }), { target: { value: 'not-a-color' } })
    })

    expect((await readIcs(storage))?.calendars).toEqual([{ name: 'Personal', url, color: 'sky' }])
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

  it('withholds a Calendar revoke while a disabled Home Assistant config owns the same origin', async () => {
    const url = 'https://shared-calendar-ha.example.com/private.ics'
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      ics: { enabled: true, calendars: [{ name: 'Shared', url }] },
      homeassistant: {
        enabled: false,
        instanceUrl: 'https://shared-calendar-ha.example.com',
        token: 'ha-live',
        locationName: 'House',
      },
    })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Shared' }))
    })

    expect(removeOrigin).not.toHaveBeenCalled()
  })

  it('still attempts final-owner release when clearing the removed calendar snapshot rejects', async () => {
    const url = 'https://snapshot-failure-ics.example.com/private.ics'
    const storage = await renderWithIcs({ enabled: true, calendars: [{ name: 'Personal', url }] }, true)
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectorSnapshots') return Promise.reject(new Error('cache write failed'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Personal' }))
    })

    expect((await readIcs(storage))?.calendars).toEqual([])
    expect(removeOrigin).toHaveBeenCalledWith('https://snapshot-failure-ics.example.com/*')
    expect((await screen.findByRole('alert')).textContent).toMatch(/cached events could not be cleared/i)
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
      meetLinks: true,
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
      meetLinks: true,
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
      meetLinks: true,
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

  // Task 89 — the Meeting links toggle, placed with the view controls above.
  describe('the Meeting links toggle (Task 89)', () => {
    it('renders checked by default when the flag is absent from config', async () => {
      await renderWithIcs({ enabled: true, calendars: [{ name: 'Personal', url: ICS_URL }] })
      const toggle = within(connectorsRegion()).getByLabelText('Meeting links') as HTMLButtonElement
      expect(attr(toggle, 'aria-checked')).toBe('true')
    })

    it('flipping it writes meetLinks while preserving calendars/view/upcomingCount, and flipping back restores true', async () => {
      const storage = await renderWithIcs({
        enabled: true,
        calendars: [{ name: 'Personal', url: ICS_URL }],
        view: 'upcoming',
        upcomingCount: 4,
      })
      const toggle = within(connectorsRegion()).getByLabelText('Meeting links') as HTMLButtonElement

      await act(async () => {
        fireEvent.click(toggle)
      })
      expect(await readIcs(storage)).toEqual({
        enabled: true,
        calendars: [{ name: 'Personal', url: ICS_URL }],
        view: 'upcoming',
        upcomingCount: 4,
        meetLinks: false,
      })

      await act(async () => {
        fireEvent.click(toggle)
      })
      expect(await readIcs(storage)).toEqual({
        enabled: true,
        calendars: [{ name: 'Personal', url: ICS_URL }],
        view: 'upcoming',
        upcomingCount: 4,
        meetLinks: true,
      })
    })

    // Contrast handleAdd/handleRemove above (which DO clear the cached
    // snapshot): meetUrl already lives inside the cached events (Task 88), so
    // toggling meetLinks changes nothing about what's cached — only whether
    // rendering is ALLOWED to show it. Render-only, no invalidation.
    it('does NOT clear the cached ics snapshot — render-only', async () => {
      const storage = await renderWithIcs(
        { enabled: true, calendars: [{ name: 'Personal', url: ICS_URL }] },
        true,
      )
      expect((await storage.get('connectorSnapshots')).ics).toBeTruthy()

      const toggle = within(connectorsRegion()).getByLabelText('Meeting links') as HTMLButtonElement
      await act(async () => {
        fireEvent.click(toggle)
      })

      expect((await storage.get('connectorSnapshots')).ics).toBeTruthy()
    })
  })
})

describe('SettingsPanel Connectors section (Status card — Task 85, curated picks + custom URLs)', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigin).mockReset()
    vi.mocked(removeOrigin).mockReset()
  })

  // CURATED_STATUS[0] is GitHub (status.ts) — read from the real module
  // rather than re-hardcoding its url, so this suite can't silently drift
  // from the service layer's own curated list.
  const GITHUB = CURATED_STATUS[0]!
  const CUSTOM_URL = 'https://status.example.com/api/v2/status.json'

  // `seedSnapshot`: mirrors renderWithIcs's own helper above (and
  // CalendarWidget.test.tsx's seededStorage before it) — a FRESH
  // connectorSnapshots.status entry, present so the add/remove-clears-it
  // tests below have something to observe disappearing.
  async function renderWithStatus(status?: StatusConfig, seedSnapshot = false) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    if (status) await storage.set('connectors', { status })
    if (seedSnapshot) {
      await storage.set('connectorSnapshots', { status: { fetchedAt: Date.now(), data: { services: [] } } })
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

  async function readStatus(storage: AuroraStorage): Promise<StatusConfig | undefined> {
    return (await storage.get('connectors')).status as StatusConfig | undefined
  }

  it('the card shell renders the Status descriptor (label, blurb, enable toggle); no status chip (auth "none"), no body until enabled', async () => {
    await renderWithStatus()
    expect(screen.getByRole('heading', { name: 'Status' })).toBeTruthy()
    expect(screen.getByText('Green dots for the services you depend on')).toBeTruthy()
    expect(screen.getByLabelText('Enable Status')).toBeTruthy()
    expect(screen.queryByText(/Connected as/)).toBeNull()
    expect(screen.queryByText('Reconnect needed')).toBeNull()
    expect(screen.queryByLabelText('Add a service')).toBeNull()
  })

  it('a curated pick (selecting GitHub) requests the githubstatus origin, persists { name, url }, and clears the cached snapshot', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithStatus({ enabled: true }, true)
    expect((await storage.get('connectorSnapshots')).status).toBeTruthy()

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add a service'), { target: { value: GITHUB.url } })
    })

    expect(ensureOrigin).toHaveBeenCalledWith(originPattern(GITHUB.url))
    expect(await readStatus(storage)).toEqual({
      enabled: true,
      services: [{ name: GITHUB.name, url: GITHUB.url }],
    })
    expect((await storage.get('connectorSnapshots')).status).toBeUndefined()
  })

  it('a custom add (name + url) persists after the origin grant', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithStatus({ enabled: true })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My API' } })
      fireEvent.change(screen.getByLabelText('Status page URL'), { target: { value: CUSTOM_URL } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(ensureOrigin).toHaveBeenCalledWith(originPattern(CUSTOM_URL))
    expect(await readStatus(storage)).toEqual({
      enabled: true,
      services: [{ name: 'My API', url: CUSTOM_URL }],
    })
  })

  it('an empty custom name defaults to the url\'s host, not "Service N" (hosts are meaningful here)', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithStatus({ enabled: true })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Status page URL'), { target: { value: CUSTOM_URL } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect((await readStatus(storage))?.services).toEqual([{ name: 'status.example.com', url: CUSTOM_URL }])
  })

  it('http:// is rejected with the https copy; nothing persisted, ensureOrigin never called', async () => {
    const storage = await renderWithStatus({ enabled: true })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Status page URL'), {
        target: { value: 'http://status.example.com/api/v2/status.json' },
      })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Enter a status page URL that starts with https://')
    expect(await readStatus(storage)).toEqual({ enabled: true })
  })

  it('rolls back a newly acquired Status origin when the service list write rejects', async () => {
    const origin = 'https://rollback-status.example.com/*'
    const url = 'https://rollback-status.example.com/api/v2/status.json'
    vi.mocked(removeOrigin).mockImplementation(removeHeldOrigin)
    vi.mocked(ensureOrigin).mockImplementation(async (requested) => {
      holdOrigin(originPattern(requested))
      return true
    })
    const storage = await renderWithStatus({ enabled: true })
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectors') return Promise.reject(new Error('disk full'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Status page URL'), { target: { value: url } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(cleanupHeld.has(origin)).toBe(false)
    expect(await readStatus(storage)).toEqual({ enabled: true })
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't save/i)
  })

  it('preserves a pre-existing Status origin when the service list write rejects', async () => {
    const origin = 'https://preexisting-status.example.com/*'
    const url = 'https://preexisting-status.example.com/api/v2/status.json'
    holdOrigin(origin)
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithStatus({ enabled: true })
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectors') return Promise.reject(new Error('disk full'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Status page URL'), { target: { value: url } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(cleanupHeld.has(origin)).toBe(true)
    expect(removeOrigin).not.toHaveBeenCalled()
  })

  it('aborts a concurrently duplicated Status add without rolling back the now-configured service', async () => {
    const url = 'https://concurrent-status.example.com/api/v2/status.json'
    const origin = 'https://concurrent-status.example.com/*'
    vi.mocked(ensureOrigin).mockImplementation(async (requested) => {
      holdOrigin(originPattern(requested))
      return true
    })
    const storage = await renderWithStatus({ enabled: true })
    const update = storage.update.bind(storage)
    storage.update = ((_key: unknown, fn: unknown) =>
      update('connectors', () =>
        (fn as (value: never) => never)({
          status: { enabled: true, services: [{ name: 'Concurrent', url }] },
        } as never),
      )
    ) as unknown as AuroraStorage['update']

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Status page URL'), { target: { value: url } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(cleanupHeld.has(origin)).toBe(true)
    expect((await readStatus(storage))?.services).toEqual([{ name: 'Concurrent', url }])
    expect((await screen.findByRole('alert')).textContent).toBe('That service is already in the list.')
  })

  it('issues permission requests before the lifecycle owner write for both curated and custom Status gestures', async () => {
    const phases: string[] = []
    const originalLocks = navigator.locks
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, _options: LockOptions, work: () => Promise<unknown>) => {
          phases.push('lock queued')
          return work()
        },
      },
    })
    const storage = await renderWithStatus({ enabled: true })
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectors') phases.push('owner write')
      return update(key, fn)
    }) as AuroraStorage['update']

    try {
      let resolveCurated!: (granted: boolean) => void
      vi.mocked(ensureOrigin).mockImplementation((requested) => {
        phases.push(`request ${requested}`)
        return new Promise<boolean>((resolve) => { resolveCurated = resolve })
      })
      act(() => {
        fireEvent.change(screen.getByLabelText('Add a service'), { target: { value: GITHUB.url } })
      })
      expect(phases).toEqual(['lock queued', `request ${originPattern(GITHUB.url)}`])
      await act(async () => {
        resolveCurated(true)
      })

      phases.length = 0
      let resolveCustom!: (granted: boolean) => void
      vi.mocked(ensureOrigin).mockImplementation((requested) => {
        phases.push(`request ${requested}`)
        return new Promise<boolean>((resolve) => { resolveCustom = resolve })
      })
      act(() => {
        fireEvent.change(screen.getByLabelText('Status page URL'), { target: { value: CUSTOM_URL } })
        fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
      })
      expect(phases).toEqual(['lock queued', `request ${originPattern(CUSTOM_URL)}`])
      await act(async () => {
        resolveCustom(true)
      })
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: originalLocks })
    }
  })

  it('a custom url matching an already-configured curated entry is rejected as a duplicate (curated/custom collision on url)', async () => {
    const storage = await renderWithStatus({ enabled: true, services: [{ name: GITHUB.name, url: GITHUB.url }] })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Status page URL'), { target: { value: GITHUB.url } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('That service is already in the list.')
    expect((await readStatus(storage))?.services).toEqual([{ name: GITHUB.name, url: GITHUB.url }])
  })

  it('a denied origin grant blocks the add: the denial copy shows, nothing is persisted', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(false)
    const storage = await renderWithStatus({ enabled: true })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Status page URL'), { target: { value: CUSTOM_URL } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Permission to read that status page was denied, so nothing was saved.')
    expect(await readStatus(storage)).toEqual({ enabled: true })
  })

  it('enforces a maximum of 8 services: BOTH the curated select and the custom add row are disabled at the cap', async () => {
    const services = Array.from({ length: 8 }, (_, i) => ({
      name: `Svc ${i + 1}`,
      url: `https://status${i}.example.com/api/v2/status.json`,
    }))
    await renderWithStatus({ enabled: true, services })

    expect((screen.getByLabelText('Add a service') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Status page URL') as HTMLInputElement).disabled).toBe(true)
    expect((within(connectorsRegion()).getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByText('Up to 8 services.')).toBeTruthy()
  })

  it('a configured list shows each name, host, and a per-row Remove button', async () => {
    await renderWithStatus({
      enabled: true,
      services: [
        { name: 'GitHub', url: 'https://www.githubstatus.com/api/v2/status.json' },
        { name: 'My API', url: 'https://status.example.com/api/v2/status.json' },
      ],
    })

    const region = connectorsRegion()
    // { selector: 'span' } disambiguates each row's own name span from the
    // curated <select>'s identically-texted <option>GitHub</option> living in
    // the very same card (the select always renders every curated name,
    // added or not — see the select's own doc comment above).
    expect(within(region).getByText('GitHub', { selector: 'span' })).toBeTruthy()
    expect(within(region).getByText('www.githubstatus.com')).toBeTruthy()
    expect(within(region).getByText('My API', { selector: 'span' })).toBeTruthy()
    expect(within(region).getByText('status.example.com')).toBeTruthy()
    expect(within(region).getByRole('button', { name: 'Remove GitHub' })).toBeTruthy()
    expect(within(region).getByRole('button', { name: 'Remove My API' })).toBeTruthy()
  })

  it('curated entries already in the list appear as disabled options in the select (no duplicate offers)', async () => {
    await renderWithStatus({ enabled: true, services: [{ name: GITHUB.name, url: GITHUB.url }] })
    const select = screen.getByLabelText('Add a service') as HTMLSelectElement
    const option = [...select.options].find((o) => o.value === GITHUB.url)
    expect(option?.disabled).toBe(true)
  })

  it('removing a service revokes its origin ONLY when no remaining service shares that origin (two custom services, one host)', async () => {
    const storage = await renderWithStatus({
      enabled: true,
      services: [
        { name: 'API One', url: 'https://status.example.com/one/status.json' },
        { name: 'API Two', url: 'https://status.example.com/two/status.json' }, // shares the host
      ],
    })

    // Removing one of the two same-host services must NOT revoke — the
    // origin is still claimed by the other.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove API One' }))
    })
    expect(removeOrigin).not.toHaveBeenCalled()
    expect((await readStatus(storage))?.services).toEqual([
      { name: 'API Two', url: 'https://status.example.com/two/status.json' },
    ])

    // Removing the last remaining service on that host DOES revoke.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove API Two' }))
    })
    expect(removeOrigin).toHaveBeenCalledWith('https://status.example.com/*')
    expect((await readStatus(storage))?.services).toEqual([])
  })

  it('still attempts final-owner release when clearing the removed Status snapshot rejects', async () => {
    const url = 'https://snapshot-failure-status.example.com/api/v2/status.json'
    const storage = await renderWithStatus({ enabled: true, services: [{ name: 'Personal', url }] }, true)
    const update = storage.update.bind(storage)
    storage.update = ((key, fn) => {
      if (key === 'connectorSnapshots') return Promise.reject(new Error('cache write failed'))
      return update(key, fn)
    }) as AuroraStorage['update']

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Personal' }))
    })

    expect((await readStatus(storage))?.services).toEqual([])
    expect(removeOrigin).toHaveBeenCalledWith('https://snapshot-failure-status.example.com/*')
    expect((await screen.findByRole('alert')).textContent).toMatch(/cached service statuses could not be cleared/i)
  })

  it('adding a service clears the cached status snapshot', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const storage = await renderWithStatus({ enabled: true }, true)
    expect((await storage.get('connectorSnapshots')).status).toBeTruthy()

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Status page URL'), { target: { value: CUSTOM_URL } })
      fireEvent.click(within(connectorsRegion()).getByRole('button', { name: 'Add' }))
    })

    expect((await readStatus(storage))?.services).toEqual([{ name: 'status.example.com', url: CUSTOM_URL }])
    expect((await storage.get('connectorSnapshots')).status).toBeUndefined()
  })

  it('removing a service clears the cached status snapshot', async () => {
    const storage = await renderWithStatus(
      { enabled: true, services: [{ name: GITHUB.name, url: GITHUB.url }] },
      true,
    )
    expect((await storage.get('connectorSnapshots')).status).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Remove ${GITHUB.name}` }))
    })

    expect((await readStatus(storage))?.services).toEqual([])
    expect((await storage.get('connectorSnapshots')).status).toBeUndefined()
  })

  // Status is auth 'none' — the card shell's status chip (Task 46) is a
  // 'token'-auth-only affordance, so Status's card must never show one,
  // enabled or not (same rule Crypto's/Calendar's own cases document).
  it('auth "none" (Status) never shows a status chip, enabled or not', async () => {
    await renderWithStatus({ enabled: true, services: [{ name: GITHUB.name, url: GITHUB.url }] })
    expect(screen.queryByText(/Connected as/)).toBeNull()
    expect(screen.queryByText('Reconnect needed')).toBeNull()
  })

  it('sits in the Development category in the drawer, and search finds "status"', async () => {
    await renderWithStatus()
    const region = connectorsRegion()
    const devHeading = within(region).getByRole('heading', { name: 'Development' })
    expect(within(devHeading.parentElement as HTMLElement).getByRole('heading', { name: 'Status' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Search connectors'), { target: { value: 'status' } })
    expect(within(connectorsRegion()).getByRole('heading', { name: 'Status' })).toBeTruthy()
  })
})

// Task 101 (W3-SP5): the card SHELL's identity line now reads
// `Connected {identityPhrase ?? 'as'} {identity}` instead of a hardcoded
// "Connected as" — homeassistantDescriptor is the first (and, today, only)
// descriptor to set identityPhrase: 'to'. These two tests prove the plumbing
// both ways: HA gets "Connected to", and an unrelated existing card (gitlab)
// is completely unaffected by the shell change.
describe('SettingsPanel Connectors section (shell — "Connected to" identityPhrase plumbing, Task 101)', () => {
  it('renders "Connected to Grand Rapids house" for the Home Assistant card when configured', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      homeassistant: {
        enabled: true,
        instanceUrl: 'https://home.example.com',
        token: 'ha_tok',
        locationName: 'Grand Rapids house',
      },
    })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')
    expect(screen.getAllByText('Connected to Grand Rapids house')).toHaveLength(1)
  })

  it('gitlab still renders "Connected as jon" (identityPhrase defaults to \'as\')', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      gitlab: { enabled: true, token: 'glpat_x', instanceUrl: 'https://gitlab.com', username: 'jon' },
    })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')
    expect(screen.getAllByText('Connected as jon')).toHaveLength(1)
  })
})

describe('SettingsPanel Connectors section (Home Assistant card — Task 101, connect + entity picker + THE PACT)', () => {
  beforeEach(() => {
    vi.mocked(ensureOrigin).mockReset()
    vi.mocked(removeOrigin).mockReset().mockImplementation(removeHeldOrigin)
    vi.mocked(whoamiHomeAssistant).mockReset()
    vi.mocked(fetchAllStates).mockReset()
  })

  afterEach(() => vi.restoreAllMocks())

  async function renderWithHa(ha?: HomeAssistantConfig, seedSnapshot = false, revealSetup = true) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    if (ha) await storage.set('connectors', { homeassistant: ha })
    if (seedSnapshot) {
      await storage.set('connectorSnapshots', {
        homeassistant: { fetchedAt: Date.now(), data: { entities: [] } },
      })
    }
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')
    const setup = screen.queryByRole('button', { name: 'Set up connection' })
    if (setup && revealSetup) fireEvent.click(setup)
    return storage
  }

  async function readHa(storage: AuroraStorage): Promise<HomeAssistantConfig | undefined> {
    return (await storage.get('connectors')).homeassistant as HomeAssistantConfig | undefined
  }

  const KITCHEN_LIGHT: HaState = {
    id: 'light.kitchen',
    state: 'on',
    unit: null,
    friendlyName: 'Kitchen Light',
    domain: 'light',
  }
  const MOVIE_SCENE: HaState = {
    id: 'scene.movie_night',
    state: 'scening',
    unit: null,
    friendlyName: 'Movie Night',
    domain: 'scene',
  }
  const OFFICE_SWITCH: HaState = {
    id: 'switch.office_fan',
    state: 'on',
    unit: null,
    friendlyName: 'Office Fan',
    domain: 'switch',
  }

  const CONNECTED_HA: HomeAssistantConfig = {
    enabled: true,
    instanceUrl: 'https://home.example.com',
    token: 'eyJ_tok',
    locationName: 'Grand Rapids house',
    snapshotEpoch: '00000000-0000-4000-8000-000000000100',
  }

  it('the card shell renders the Home Assistant descriptor (label, blurb, enable toggle); no chip/form until enabled', async () => {
    await renderWithHa()
    expect(screen.getByRole('heading', { name: 'Home Assistant' })).toBeTruthy()
    expect(screen.getByText('Your home, at a glance — and three buttons that do things')).toBeTruthy()
    expect(screen.getByLabelText('Enable Home Assistant')).toBeTruthy()
    expect(screen.queryByText(/Connected (to|as)/)).toBeNull()
    expect(screen.queryByLabelText('Instance URL')).toBeNull()
  })

  it('the connect form shows both fields and the verbatim https helper text', async () => {
    await renderWithHa({ enabled: true })
    expect(screen.getByLabelText('Instance URL')).toBeTruthy()
    expect(screen.getByLabelText('Long-lived access token')).toBeTruthy()
    expect(
      screen.getByText(
        'Requires https. Nabu Casa cloud URLs and reverse-proxied instances work; plain http://homeassistant.local:8123 cannot be granted.',
      ),
    ).toBeTruthy()
  })

  it('connect happy path: ensureOrigin (derived from the instance URL) -> whoami -> persists { enabled, instanceUrl, token, locationName }', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiHomeAssistant).mockResolvedValue({ ok: true, identity: 'Grand Rapids house' })
    const storage = await renderWithHa({ enabled: true })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Instance URL'), { target: { value: 'https://home.example.com' } })
      fireEvent.change(screen.getByLabelText('Long-lived access token'), { target: { value: 'eyJ_tok' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).toHaveBeenCalledWith('https://home.example.com/*')
    expect(whoamiHomeAssistant).toHaveBeenCalledWith('https://home.example.com', 'eyJ_tok')
    expect(await readHa(storage)).toEqual({
      enabled: true,
      instanceUrl: 'https://home.example.com',
      token: 'eyJ_tok',
      locationName: 'Grand Rapids house',
      snapshotEpoch: expect.any(String),
    })
  })

  it('keeps fresh Home Assistant credentials hidden until setup is requested', async () => {
    await renderWithHa({ enabled: true }, false, false)
    expect(screen.getByText('Setup needed')).toBeTruthy()
    expect(screen.queryByLabelText('Long-lived access token')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Set up connection' }))
    expect(screen.getByLabelText('Long-lived access token')).toBeTruthy()
  })

  it('disconnecting and reconnecting the identical account rotates the snapshot epoch', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000201')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000202')
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiHomeAssistant).mockResolvedValue({ ok: true, identity: 'Grand Rapids house' })
    const storage = await renderWithHa({ enabled: true })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Instance URL'), {
        target: { value: 'https://home.example.com' },
      })
      fireEvent.change(screen.getByLabelText('Long-lived access token'), {
        target: { value: 'eyJ_tok' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })
    expect((await readHa(storage))?.snapshotEpoch).toBe(
      '00000000-0000-4000-8000-000000000201',
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })
    expect(await readHa(storage)).toBeUndefined()

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Enable Home Assistant'))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Set up connection' }))
    await screen.findByLabelText('Instance URL')
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Instance URL'), {
        target: { value: 'https://home.example.com' },
      })
      fireEvent.change(screen.getByLabelText('Long-lived access token'), {
        target: { value: 'eyJ_tok' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })
    expect((await readHa(storage))?.snapshotEpoch).toBe(
      '00000000-0000-4000-8000-000000000202',
    )
  })

  it('a non-https instance URL blocks the connect with an inline alert: no permission requested, nothing stored', async () => {
    const storage = await renderWithHa({ enabled: true })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Instance URL'), {
        target: { value: 'http://homeassistant.local:8123' },
      })
      fireEvent.change(screen.getByLabelText('Long-lived access token'), { target: { value: 'eyJ_tok' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    expect(whoamiHomeAssistant).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
    expect((await readHa(storage))?.token).toBeUndefined()
  })

  it('reconnecting preserves pre-existing entities/actions', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000301',
    )
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    vi.mocked(whoamiHomeAssistant).mockResolvedValue({ ok: true, identity: 'Grand Rapids house' })
    const seededEntities: HaEntityRef[] = [{ id: 'light.kitchen', name: 'Kitchen Light' }]
    const seededActions: HaAction[] = [{ id: 'scene.movie_night', name: 'Movie Night', domain: 'scene' }]
    const storage = await renderWithHa({
      enabled: true,
      instanceUrl: 'https://home.example.com',
      token: '',
      locationName: 'Grand Rapids house',
      snapshotEpoch: '00000000-0000-4000-8000-000000000300',
      entities: seededEntities,
      actions: seededActions,
    })
    expect(screen.getByText('Reconnect needed')).toBeTruthy()

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Instance URL'), {
        target: { value: 'https://home.example.com' },
      })
      fireEvent.change(screen.getByLabelText('Long-lived access token'), { target: { value: 'eyJ_new' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    const stored = await readHa(storage)
    expect(stored?.entities).toEqual(seededEntities)
    expect(stored?.actions).toEqual(seededActions)
    expect(stored?.snapshotEpoch).toBe('00000000-0000-4000-8000-000000000301')
  })

  it('connected state renders "Connected to {location}" + "No entities picked yet" + a Choose entities button', async () => {
    await renderWithHa(CONNECTED_HA)
    expect(screen.getAllByText('Connected to Grand Rapids house')).toHaveLength(1)
    expect(screen.getByText('No entities picked yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose entities' })).toBeTruthy()
  })

  it('the Home Assistant card explains picker-only bulk loading and selected-entity dashboard updates without exposing credentials', async () => {
    await renderWithHa(CONNECTED_HA)
    const chooseButton = screen.getByRole('button', { name: 'Choose entities' })
    const pickerGroup = chooseButton.parentElement as HTMLElement
    const disclosure = within(pickerGroup).getByText(
      'Choosing entities loads the full entity list from your Home Assistant instance for this picker only. Regular dashboard updates request only your selected entities.',
    )

    expect(disclosure).toBeTruthy()
    expect(pickerGroup.textContent).not.toContain(CONNECTED_HA.token!)
    expect(pickerGroup.textContent).not.toContain(CONNECTED_HA.instanceUrl!)
  })

  it('an already-picked config shows the "N chips · M actions" summary line, not the empty-state copy', async () => {
    await renderWithHa({
      ...CONNECTED_HA,
      entities: [{ id: 'light.kitchen', name: 'Kitchen Light' }],
      actions: [],
    })
    expect(screen.getByText('1 chips · 0 actions')).toBeTruthy()
  })

  it('Choose entities fetches first: the button reads "Loading…" and is disabled while the fetch is in flight; the dialog opens only on arrival', async () => {
    let resolveFetch!: (v: HaState[] | null) => void
    vi.mocked(fetchAllStates).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    await renderWithHa(CONNECTED_HA)

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose entities' }))
    })

    const loadingBtn = screen.getByRole('button', { name: 'Loading…' }) as HTMLButtonElement
    expect(loadingBtn.disabled).toBe(true)
    expect(screen.queryByRole('dialog', { name: 'Pick entities' })).toBeNull()

    await act(async () => {
      resolveFetch([KITCHEN_LIGHT])
    })

    expect(fetchAllStates).toHaveBeenCalledWith('https://home.example.com', 'eyJ_tok')
    expect(screen.getByRole('dialog', { name: 'Pick entities' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose entities' })).toBeTruthy()
  })

  it('restores the real Choose entities trigger after async loading loses focus on every picker close path', async () => {
    await renderWithHa(CONNECTED_HA)

    async function openAfterHeldFetchLosesFocus() {
      let resolveFetch!: (value: HaState[] | null) => void
      vi.mocked(fetchAllStates).mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveFetch = resolve
        }),
      )

      const trigger = screen.getByRole('button', { name: 'Choose entities' }) as HTMLButtonElement
      trigger.focus()
      act(() => {
        fireEvent.click(trigger)
      })

      const loading = screen.getByRole('button', { name: /Loading/ }) as HTMLButtonElement
      expect(loading).toBe(trigger)
      expect(loading.disabled).toBe(true)
      document.body.tabIndex = -1
      document.body.focus()
      document.body.removeAttribute('tabindex')
      expect(document.activeElement).toBe(document.body)

      await act(async () => {
        resolveFetch([KITCHEN_LIGHT, OFFICE_SWITCH])
      })
      expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search entities' }))
      return trigger
    }

    async function expectRestored(trigger: HTMLButtonElement) {
      await act(async () => {})
      expect(screen.queryByRole('dialog', { name: 'Pick entities' })).toBeNull()
      const currentTrigger = screen.getByRole('button', { name: 'Choose entities' })
      expect(currentTrigger).toBe(trigger)
      expect(document.body.contains(currentTrigger)).toBe(true)
      expect(document.activeElement).toBe(currentTrigger)
    }

    let trigger = await openAfterHeldFetchLosesFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await expectRestored(trigger)

    trigger = await openAfterHeldFetchLosesFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await expectRestored(trigger)

    trigger = await openAfterHeldFetchLosesFocus()
    const picker = screen.getByRole('dialog', { name: 'Pick entities' })
    fireEvent.click(picker.parentElement?.previousElementSibling as HTMLElement)
    await expectRestored(trigger)

    trigger = await openAfterHeldFetchLosesFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await expectRestored(trigger)
  })

  it('a failed fetch (null) shows the inline alert verbatim and does NOT open the dialog', async () => {
    vi.mocked(fetchAllStates).mockResolvedValue(null)
    await renderWithHa(CONNECTED_HA)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose entities' }))
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe("Couldn't reach your instance. Check the URL and token, then try again.")
    expect(screen.queryByRole('dialog', { name: 'Pick entities' })).toBeNull()
  })

  it('THE PACT: picking entities in the dialog persists entities+actions AND clears connectorSnapshots.homeassistant, and the summary line updates', async () => {
    vi.mocked(fetchAllStates).mockResolvedValue([KITCHEN_LIGHT, MOVIE_SCENE, OFFICE_SWITCH])
    const storage = await renderWithHa(CONNECTED_HA, true)
    expect((await storage.get('connectorSnapshots')).homeassistant).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose entities' }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Show Kitchen Light light.kitchen' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Show Movie Night scene.movie_night' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Show Office Fan switch.office_fan' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Action Movie Night scene.movie_night' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Action Office Fan switch.office_fan' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    const stored = await readHa(storage)
    expect(stored?.entities).toEqual([
      { id: 'light.kitchen', name: 'Kitchen Light' },
      { id: 'scene.movie_night', name: 'Movie Night' },
      { id: 'switch.office_fan', name: 'Office Fan' },
    ])
    expect(stored?.actions).toEqual([
      { id: 'scene.movie_night', name: 'Movie Night', domain: 'scene' },
      { id: 'switch.office_fan', name: 'Office Fan', domain: 'switch' },
    ])
    expect(stored?.snapshotEpoch).toBe('00000000-0000-4000-8000-000000000100')
    expect((await storage.get('connectorSnapshots')).homeassistant).toBeUndefined()
    expect(screen.getByText('3 chips · 2 actions')).toBeTruthy()
  })

  it('disconnecting revokes the instance origin (no other connector sharing it) and drops the config', async () => {
    const storage = await renderWithHa(CONNECTED_HA)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    expect(removeOrigin).toHaveBeenCalledWith('https://home.example.com/*')
    expect(await readHa(storage)).toBeUndefined()
  })

  it('disconnecting does NOT revoke the instance origin when another enabled connector still shares it', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      homeassistant: CONNECTED_HA,
      status: { enabled: true, services: [{ name: 'Home', url: 'https://home.example.com/status.json' }] },
    })
    render(
      <StorageProvider storage={storage}>
        <SettingsPanel onArrangeLayout={() => {}} />
      </StorageProvider>,
    )
    await screen.findByLabelText('Your name')
    openTab('Connectors')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    expect(removeOrigin).not.toHaveBeenCalled()
    expect((await storage.get('connectors')).homeassistant).toBeUndefined()
  })

  it('sits in the Home category in the drawer', async () => {
    await renderWithHa()
    const region = connectorsRegion()
    const homeHeading = within(region).getByRole('heading', { name: 'Home' })
    expect(within(homeHeading.parentElement as HTMLElement).getByRole('heading', { name: 'Home Assistant' })).toBeTruthy()
  })

  function connectorsRegion() {
    return screen.getByRole('region', { name: 'Connectors' })
  }
})

describe('SettingsPanel permission cleanup recovery', () => {
  it('retains rollback cleanup across the connector and tab unmount, then clears it only after retry succeeds', async () => {
    const origin = 'https://api.github.com/*'
    cleanupHeld.clear()
    vi.mocked(ensureOrigins).mockImplementation(async (origins) => {
      origins.forEach((pattern) => cleanupHeld.add(pattern))
      cleanupAddedListeners.forEach((listener) => listener({ origins: [...origins] }))
      return true
    })
    vi.mocked(removeOrigin).mockRejectedValueOnce(new Error('remove failed'))
    vi.mocked(whoamiGithub).mockResolvedValue({ ok: false, message: 'Bad token' })

    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { github: { enabled: true, token: '', username: '' } })
    await renderPanel(() => {}, storage)
    openTab('Connectors')

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Fine-grained personal access token'), { target: { value: 'ghp_bad' } })
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(cleanupHeld.has(origin)).toBe(true)
    expect(screen.getByRole('button', { name: 'Retry permission cleanup' })).toBeTruthy()

    openTab('Data')
    expect(screen.getByRole('button', { name: 'Retry permission cleanup' })).toBeTruthy()

    vi.mocked(removeOrigin).mockImplementation(async (pattern) => {
      const removed = cleanupHeld.delete(pattern)
      if (removed) cleanupRemovedListeners.forEach((listener) => listener({ origins: [pattern] }))
      return removed
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry permission cleanup' }))
    })

    expect(cleanupHeld.has(origin)).toBe(false)
    expect(screen.queryByRole('button', { name: 'Retry permission cleanup' })).toBeNull()
  })

  it('retains failed final-owner disconnect cleanup after its card disappears, then retries it from another tab', async () => {
    const origin = 'https://api.github.com/*'
    cleanupHeld.clear()
    cleanupHeld.add(origin)
    cleanupAddedListeners.forEach((listener) => listener({ origins: [origin] }))
    vi.mocked(removeOrigin).mockReset().mockRejectedValueOnce(new Error('remove failed'))

    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { github: { enabled: true, token: 'ghp_live', username: 'octocat' } })
    await renderPanel(() => {}, storage)
    openTab('Connectors')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    expect((await storage.get('connectors')).github).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry permission cleanup' })).toBeTruthy()

    openTab('Data')
    vi.mocked(removeOrigin).mockImplementation(async (pattern) => removeHeldOrigin(pattern))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry permission cleanup' }))
    })

    expect(cleanupHeld.has(origin)).toBe(false)
    expect(screen.queryByRole('button', { name: 'Retry permission cleanup' })).toBeNull()
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
    category: 'development', // Task 79 made this required; matches the real githubDescriptor's category
    auth: 'token',
    ttlMs: 1_000,
    secretFields: ['token'],
    identityField: 'username',
    origins: () => [],
    ownsOrigins: () => false,
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

  it('derives state-first labels without exposing secret values', () => {
    const connected: GithubConfig = { enabled: true, token: 'never-render-this', username: 'jon' }
    expect(connectorCardState(tokenDescriptor as ConnectorDescriptor, undefined)).toEqual({
      state: 'off',
      label: 'Off',
    })
    expect(connectorCardState(tokenDescriptor as ConnectorDescriptor, { enabled: true } as GithubConfig)).toEqual({
      state: 'setup',
      label: 'Setup needed',
    })
    expect(connectorCardState(tokenDescriptor as ConnectorDescriptor, { ...connected, token: '' })).toEqual({
      state: 'reconnect',
      label: 'Reconnect needed',
    })
    expect(connectorCardState(tokenDescriptor as ConnectorDescriptor, connected)).toEqual({
      state: 'connected',
      label: 'Connected as jon',
    })
    expect(connectorCardState(tokenDescriptor as ConnectorDescriptor, connected).label).not.toContain('never-render-this')
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
