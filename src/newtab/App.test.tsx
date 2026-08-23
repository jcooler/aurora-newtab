// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageProvider } from '../lib/storage/context'
import { memoryDriver } from '../lib/storage/driver'
import { createStorage } from '../lib/storage/index'
import { defaults } from '../lib/storage/schema'
import type { LayoutV3 } from '../lib/layout/canvasTypes'
import type { LayoutsDocument } from '../lib/layout/namedLayouts'
import { emptyLayoutV2 } from '../lib/layout/v2'
import { hasBookmarksPermission, loadBarModel } from '../services/bookmarks'
import { weatherRequestIdentity } from '../services/weather/identity'
import App from './App'

vi.mock('../services/bookmarks', () => ({
  loadBarModel: vi.fn().mockResolvedValue({ folders: [], loose: [] }),
  hasBookmarksPermission: vi.fn().mockResolvedValue(false),
}))
vi.mock('./widgets/links/linksLogic', () => ({ faviconUrl: (url: string) => `favicon:${url}` }))

async function renderApp(storage?: ReturnType<typeof createStorage>) {
  const value = storage ?? createStorage(memoryDriver())
  await value.init()
  render(<StorageProvider storage={value}><App /></StorageProvider>)
  await act(async () => {})
  return value
}

function canvasItem(id: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!
}

function canvasGeometry(id: string) {
  const item = canvasItem(id)
  return {
    mode: item.dataset.canvasMode,
    size: item.dataset.canvasSize,
    left: item.style.left,
    top: item.style.top,
    layer: item.style.zIndex,
  }
}

function itemPoint(target: string | HTMLElement): { x: number; y: number } {
  const item = typeof target === 'string' ? canvasItem(target) : target
  return { x: Number.parseFloat(item.style.left), y: Number.parseFloat(item.style.top) }
}

function testRect(left: number, top: number, width: number, height: number): DOMRectReadOnly {
  return {
    left, top, width, height,
    right: left + width, bottom: top + height,
    x: left, y: top,
    toJSON: () => ({}),
  } as DOMRectReadOnly
}

function installStackGeometry() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-canvas-surface')) return testRect(0, 0, 1000, 600)
    const objectId = this.getAttribute('data-canvas-object-id')
    if (objectId === 'clock') return testRect(100, 100, 220, 120)
    if (objectId === 'weather') return testRect(500, 100, 260, 180)
    if (objectId === 'stack:stack-day') return testRect(500, 100, 300, 220)
    return testRect(20, 500, 100, 50)
  })
}

function installDockGeometry() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-canvas-surface')) return testRect(0, 0, 1000, 600)
    if (this.classList.contains('canvas-top-bar')) return testRect(5, 5, 990, 96)
    if (this.classList.contains('canvas-bottom-bar')) return testRect(5, 499, 990, 96)
    const objectId = this.getAttribute('data-canvas-object-id')
    if (objectId === 'weather' || objectId === 'clock') {
      const width = objectId === 'weather' ? 180 : 160
      const height = objectId === 'weather' ? 40 : 36
      if (this.dataset.canvasMode === 'docked') {
        const edge = this.closest('.canvas-top-bar') ? 'top' : 'bottom'
        const band = edge === 'top' ? testRect(5, 5, 990, 96) : testRect(5, 499, 990, 96)
        const xPct = Number.parseFloat(this.style.left || this.style.marginLeft || '50')
        const yPct = Number.parseFloat(this.style.top || '50')
        const centerX = band.left + band.width * xPct / 100
        const centerY = band.top + band.height * yPct / 100
        return testRect(centerX - width / 2, centerY - height / 2, width, height)
      }
      const freeWidth = objectId === 'weather' ? 260 : 220
      const freeHeight = objectId === 'weather' ? 180 : 120
      const centerX = Number.parseFloat(this.style.left || (objectId === 'weather' ? '50' : '25')) * 10
      const centerY = Number.parseFloat(this.style.top || (objectId === 'weather' ? '40' : '30')) * 6
      return testRect(centerX - freeWidth / 2, centerY - freeHeight / 2, freeWidth, freeHeight)
    }
    return testRect(20, 620, 100, 50)
  })
}

function stackedDocument(): LayoutsDocument {
  return {
    version: 1,
    activeLayoutId: 'stack-layout',
    layouts: [{
      id: 'stack-layout',
      name: 'Stacks',
      widgets: {},
      stacks: [{
        id: 'stack-day',
        members: ['notes', 'tasks'],
        facing: 'notes',
        anchor: 'top-right',
        offsetX: -8,
        offsetY: 13,
        tier: 'compact',
        layer: 4,
      }],
    }],
  }
}

describe('App Canvas composition', () => {
  beforeEach(() => {
    vi.mocked(hasBookmarksPermission).mockResolvedValue(false)
    vi.mocked(loadBarModel).mockResolvedValue({ folders: [], loose: [] })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('owns one anchored Canvas and retires the rejected semantic presentation regions', async () => {
    await renderApp()
    expect(document.querySelectorAll('main[data-aurora-canvas]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-canvas-legibility]')).toHaveLength(1)
    expect(document.querySelector('[data-canvas-legibility]')?.parentElement?.hasAttribute('data-canvas-surface')).toBe(true)
    for (const name of ['Day', 'Now', 'Work Pulse', 'Signal Dock']) {
      expect(screen.queryByRole('region', { name })).toBeNull()
    }
  })

  it('renders Flow as a mutually exclusive surface and restores the untouched dashboard on exit', async () => {
    const storage = createStorage(memoryDriver({
      ...defaults(),
      timerSession: {
        mode: 'work',
        running: false,
        endsAt: null,
        remainingMs: 11 * 60_000,
        cycles: 2,
        flow: true,
      },
      'aurora:version': 15,
    }))
    await storage.init()
    const beforeLayout = JSON.stringify(await storage.get('layout'))
    const beforeLayouts = JSON.stringify(await storage.get('layouts'))

    await renderApp(storage)

    expect(document.querySelector('[data-flow-screen]')).toBeTruthy()
    expect(document.querySelector('[data-canvas-surface]')).toBeNull()
    expect(document.querySelector('[data-edit-toolbar]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New background photo' })).toBeNull()

    fireEvent.keyDown(window, { key: 'E', ctrlKey: true, shiftKey: true })
    expect(document.querySelector('[data-edit-toolbar]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'End flow' }))
    await waitFor(() => expect(document.querySelector('[data-canvas-surface]')).toBeTruthy())

    expect(await storage.get('timerSession')).toMatchObject({
      flow: false,
      remainingMs: 11 * 60_000,
      cycles: 2,
    })
    expect(JSON.stringify(await storage.get('layout'))).toBe(beforeLayout)
    expect(JSON.stringify(await storage.get('layouts'))).toBe(beforeLayouts)
  })

  // The tray trigger renders only when the tray offers more than the corner
  // photo button already does (owner-questioned twice): Home Assistant
  // actions are that "more", so these tray tests seed one.
  async function renderAppWithTrayTools() {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      homeassistant: {
        enabled: true,
        instanceUrl: 'https://ha.example.com',
        token: 'tok',
        entities: [],
        actions: [{ id: 'scene.movie', name: 'Movie night', domain: 'scene' }],
      },
    })
    return renderApp(storage)
  }

  it('hides the Utility Tray trigger when the tray would only duplicate the photo button (no HA actions)', async () => {
    await renderApp()
    expect(screen.queryByRole('button', { name: 'Open utility tray' })).toBeNull()
    // ...and the layout badge hugs the gear instead of clearing a trigger
    // that isn't there (owner-reported 2026-08-19: the dead gap).
    expect(document.querySelector('.layout-badge-host')?.hasAttribute('data-clears-tray')).toBe(false)
  })

  it('the layout badge slides left only while the tray trigger actually renders', async () => {
    await renderAppWithTrayTools()
    expect(screen.getByRole('button', { name: 'Open utility tray' })).toBeTruthy()
    expect(document.querySelector('.layout-badge-host')?.getAttribute('data-clears-tray')).toBe('true')
  })

  it('opens a functional modeless Utility Tray without duplicating the direct Canvas tools', async () => {
    await renderAppWithTrayTools()
    const invoker = screen.getByRole('button', { name: 'Open utility tray' })
    const dashboard = invoker.closest('.contents')

    fireEvent.click(invoker)

    const tray = screen.getByRole('dialog', { name: 'Utility Tray' })
    expect(tray.getAttribute('data-utility-tray-mode')).toBe('modeless')
    expect(tray.getAttribute('aria-modal')).toBeNull()
    expect(dashboard?.hasAttribute('inert')).toBe(false)
    for (const directTool of ['Tasks', 'Notes', 'Timer']) {
      expect(within(tray).queryByRole('button', { name: directTool })).toBeNull()
    }
    // Home Assistant (the reason the trigger exists) is the default tool;
    // Refresh remains reachable beside it.
    expect(within(tray).getByRole('button', { name: 'Home Assistant' }).getAttribute('aria-pressed')).toBe('true')
    await act(async () => {
      fireEvent.click(within(tray).getByRole('button', { name: 'Refresh' }))
    })
    expect(within(tray).getByRole('region', { name: 'Background refresh' })).toBeTruthy()
  })

  it('derives a modal Small Utility Tray, inerts only the Canvas host, and restores its invoker', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    await renderAppWithTrayTools()
    const invoker = screen.getByRole('button', { name: 'Open utility tray' })
    const dashboard = invoker.closest('.contents')

    fireEvent.click(invoker)

    expect(screen.getByRole('dialog', { name: 'Utility Tray' }).getAttribute('data-utility-tray-mode')).toBe('modal')
    expect(dashboard?.hasAttribute('inert')).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Utility Tray' })).toBeNull()
    expect(dashboard?.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(invoker)
  })

  it('renders no synthetic Day context when all optional widgets are off', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const settings = defaults().settings
    const widgetsOff = Object.fromEntries(
      Object.keys(settings.widgets).map((key) => [key, false]),
    ) as unknown as typeof settings.widgets
    await storage.set('settings', { ...settings, widgets: widgetsOff })
    await storage.set('connectors', {})
    await renderApp(storage)

    expect(screen.getByRole('region', { name: 'Canvas' })).toBeTruthy()
    expect(document.querySelector('[data-day-context]')).toBeNull()
    expect(document.querySelector('[data-block-id="day-context"]')).toBeNull()
  })

  it('restores the source V1 anchors with Bookmarks at the top and the ritual centered', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, bookmarks: true },
    })
    await renderApp(storage)
    expect(itemPoint('bookmarks').y).toBeLessThan(10)
    for (const id of ['clock', 'greeting', 'search', 'focus', 'links']) {
      expect(itemPoint(id).x).toBe(50)
    }
    expect(itemPoint('clock').y).toBeLessThan(itemPoint('focus').y)
    expect(document.querySelectorAll('[data-aurora-briefing]')).toHaveLength(0)
  })

  it('renders adjacent Quick Links and Bookmarks exactly once without a synthetic launcher shelf', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const settings = defaults().settings
    await storage.set('settings', {
      ...settings,
      widgets: { ...settings.widgets, links: true, bookmarks: true, habits: false },
    })
    await renderApp(storage)

    expect(document.querySelectorAll('[data-block-id="links"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-block-id="bookmarks"]')).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'Launchers' })).toBeNull()
  })

  it('renders each active registry identity exactly once on the Canvas', async () => {
    await renderApp()
    for (const id of ['clock', 'greeting', 'focus', 'weather', 'search', 'links', 'tasks', 'notes']) {
      expect(document.querySelectorAll(`[data-block-id="${id}"]`)).toHaveLength(1)
      expect(canvasItem(id).dataset.canvasMode).toBe('anchored')
    }
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).toBeNull()
  })

  it('mounts the persisted timer authority once for the dashboard Timer', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, timer: true },
    })
    await storage.set('timerSession', {
      mode: 'work',
      running: false,
      endsAt: null,
      remainingMs: 9 * 60_000,
      cycles: 2,
      flow: false,
    })

    await renderApp(storage)

    expect(screen.getByRole('button', { name: /Focus timer: 09:00 remaining/ })).toBeTruthy()
  })

  it('positions active items by anchored percent with content-tight boxes (no imposed width or grid)', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { github: { enabled: true, username: '' } })
    await renderApp(storage)

    for (const id of ['weather', 'clock', 'github', 'notes']) {
      const item = canvasItem(id)
      expect(item.style.position).toBe('absolute')
      expect(item.style.left).toMatch(/%$/)
      expect(item.style.top).toMatch(/%$/)
      expect(item.style.width).toBe('')
      expect(item.style.minHeight).toBe('')
      expect(item.style.gridColumn).toBe('')
      expect(item.style.gridRow).toBe('')
    }
  })

  it('renders an optional Bottom bar only for explicitly stored bottom-bar placements', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const layout: LayoutV3 = {
      version: 3,
      profiles: { standard: { mode: 'custom', placements: {
        notes: { kind: 'bottom-bar', order: 0, size: 'compact' },
        clock: { kind: 'canvas', x: 50, y: 24, size: 'full', layer: 0 },
      } } },
    }
    await storage.set('layout', layout)
    await renderApp(storage)

    const bottomBar = screen.getByRole('navigation', { name: 'Bottom bar' })
    expect(within(bottomBar).getByTestId('canvas-item-notes')).toBeTruthy()
    expect(document.querySelectorAll('[data-block-id="notes"]')).toHaveLength(1)
    expect(canvasItem('notes').dataset.canvasMode).toBe('docked')
    expect(canvasItem('clock').dataset.canvasMode).toBe('anchored')
  })

  it('replans on the same mount when widget settings change', async () => {
    const storage = await renderApp()
    await act(async () => {
      await storage.set('settings', { ...defaults().settings, widgets: { ...defaults().settings.widgets, search: false } })
    })
    expect(document.querySelector('[data-block-id="search"]')).toBeNull()
    await act(async () => {
      await storage.set('settings', { ...defaults().settings, widgets: { ...defaults().settings.widgets, search: true } })
    })
    expect(document.querySelectorAll('[data-block-id="search"]')).toHaveLength(1)
  })

  it('changes only the toggled identity and never writes layout while settings and connectors change', async () => {
    const storage = await renderApp()
    const layoutBefore = JSON.stringify(await storage.get('layout'))
    const survivors = ['clock', 'focus', 'search', 'tasks', 'notes']
    const geometryBefore = Object.fromEntries(survivors.map((id) => [id, canvasGeometry(id)]))

    await act(async () => {
      await storage.set('settings', {
        ...defaults().settings,
        widgets: { ...defaults().settings.widgets, weather: false },
      })
    })

    expect(document.querySelector('[data-block-id="weather"]')).toBeNull()
    expect(Object.fromEntries(survivors.map((id) => [id, canvasGeometry(id)]))).toEqual(geometryBefore)
    expect(JSON.stringify(await storage.get('layout'))).toBe(layoutBefore)

    await act(async () => {
      await storage.set('connectors', {
        github: { enabled: true, username: '' },
      })
    })

    expect(document.querySelectorAll('[data-block-id="github"]')).toHaveLength(1)
    expect(Object.fromEntries(survivors.map((id) => [id, canvasGeometry(id)]))).toEqual(geometryBefore)
    expect(JSON.stringify(await storage.get('layout'))).toBe(layoutBefore)

    await act(async () => {
      await storage.set('connectors', {})
    })

    expect(document.querySelector('[data-block-id="github"]')).toBeNull()
    expect(Object.fromEntries(survivors.map((id) => [id, canvasGeometry(id)]))).toEqual(geometryBefore)
    expect(JSON.stringify(await storage.get('layout'))).toBe(layoutBefore)
  })

  it('opens viewport-owned Weather details without moving its Canvas item or any sibling', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const location = { lat: 33.75, lon: -84.39, label: 'Atlanta', manual: true }
    await storage.set('location', location)
    await storage.set('weatherCache', {
      current: { tempC: 24, feelsLikeC: 25, code: 0, windKmh: 8, humidity: 52, isDay: true },
      hourly: [{ time: '2026-08-17T12:00', tempC: 24, precipProb: 0, code: 0, isDay: true }],
      fetchedAt: Date.now(),
      locationLabel: 'Atlanta',
      requestIdentity: weatherRequestIdentity(location.lat, location.lon),
      sunriseISO: '2026-08-17T07:02',
      sunsetISO: '2026-08-17T20:23',
    })
    await renderApp(storage)
    const ids = ['weather', 'clock', 'focus', 'search', 'tasks']
    const before = Object.fromEntries(ids.map((id) => [id, canvasGeometry(id)]))
    const canvas = screen.getByRole('region', { name: 'Canvas' }) as HTMLElement
    const canvasHeight = canvas.style.height

    fireEvent.click(within(canvasItem('weather')).getByRole('button', { expanded: false }))

    const details = screen.getByRole('dialog', { name: 'Weather details' })
    expect(details.parentElement).toBe(document.body)
    expect(Object.fromEntries(ids.map((id) => [id, canvasGeometry(id)]))).toEqual(before)
    expect(canvas.style.height).toBe(canvasHeight)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Weather details' })).toBeNull()
  })

  it('updates one mounted Canvas for connector availability and active-profile V3 placement', async () => {
    const storage = await renderApp()
    expect(document.querySelector('[data-block-id="rss"]')).toBeNull()

    await act(async () => {
      await storage.set('connectors', { rss: { enabled: true, feeds: [], shownCount: 5 } })
    })
    expect(document.querySelectorAll('[data-block-id="rss"]')).toHaveLength(1)

    await act(async () => {
      await storage.set('layout', {
        version: 3,
        profiles: { standard: { mode: 'custom', placements: {
          focus: { kind: 'canvas', x: 50, y: 70, size: 'compact', layer: 7 },
        } } },
      })
    })
    expect(itemPoint('focus')).toEqual({ x: 50, y: 70 })
    expect(canvasItem('focus').dataset.canvasSize).toBe('compact')
    expect(canvasItem('focus').style.zIndex).toBe('7')
  })

  it('waits through transient raw settings and layout shapes, then recovers on the same mount', async () => {
    const driver = memoryDriver()
    const storage = createStorage(driver)
    await renderApp(storage)
    expect(document.querySelector('main[data-aurora-canvas]')).toBeTruthy()

    await act(async () => {
      await driver.write({ settings: { layoutDensity: 'auto' } })
    })
    expect(document.querySelector('main[data-aurora-canvas]')).toBeNull()

    await act(async () => {
      await driver.write({ settings: defaults().settings, layout: { version: 2 } })
    })
    expect(document.querySelector('main[data-aurora-canvas]')).toBeNull()

    await act(async () => {
      await driver.write({ layout: emptyLayoutV2() })
    })
    expect(document.querySelector('main[data-aurora-canvas]')).toBeTruthy()
  })

  it('keeps enabled incomplete connector wrappers instead of hiding setup states', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      github: { enabled: true, username: '' },
      rss: { enabled: true, feeds: [], shownCount: 5 },
    })
    await renderApp(storage)
    expect(document.querySelectorAll('[data-block-id="github"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-block-id="rss"]')).toHaveLength(1)
  })

  it('moves a connector between the Canvas and Bottom bar without duplicating it', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { github: { enabled: true, username: '' } })
    await storage.set('layout', {
      version: 3,
      profiles: { standard: { mode: 'custom', placements: {
        github: { kind: 'bottom-bar', order: 0, size: 'compact' },
      } } },
    })
    await renderApp(storage)

    expect(document.querySelectorAll('[data-block-id="github"]')).toHaveLength(1)
    expect(canvasItem('github').dataset.canvasMode).toBe('docked')
    expect(screen.getByRole('navigation', { name: 'Bottom bar' })).toBeTruthy()

    await act(async () => {
      await storage.set('layout', {
        version: 3,
        profiles: { standard: { mode: 'custom', placements: {
          github: { kind: 'canvas', x: 87, y: 42, size: 'compact', layer: 0 },
        } } },
      })
    })
    expect(document.querySelectorAll('[data-block-id="github"]')).toHaveLength(1)
    expect(canvasItem('github').dataset.canvasMode).toBe('anchored')
    expect(itemPoint('github')).toEqual({ x: 87, y: 42 })
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).toBeNull()
  })

  it('uses the active V2 profile adapter and ignores legacy coordinates for committed rendering', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', {
      version: 2,
      profiles: { standard: { focus: {
        zone: 'day', order: 2, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned',
      } } },
      legacy: { focus: { x: -10_000, y: 10_000 } },
    })
    await renderApp(storage)
    expect(itemPoint('focus')).toEqual({ x: 16.667, y: 62 })
    expect(canvasItem('focus').dataset.canvasSize).toBe('compact')
  })

  it('preserves a migrated V1 Clock coordinate when adapting a legacy layout', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', { clock: { x: 25, y: 50 } })
    await renderApp(storage)
    expect(itemPoint('clock')).toEqual({ x: 25, y: 50 })
    expect(canvasItem('clock').dataset.canvasSize).toBe('standard')
  })

  it('renders the mechanical narrow-floor stack below 600px and stays anchored above it', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 599 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    await renderApp()
    const canvas = screen.getByRole('region', { name: 'Canvas' }) as HTMLElement
    expect(canvas.dataset.canvasNarrow).toBe('true')
    for (const item of document.querySelectorAll<HTMLElement>('[data-canvas-mode]')) {
      expect(item.dataset.canvasMode).toBe('stacked')
      expect(item.style.position).toBe('relative')
    }
  })

  it('keeps every anchored position glued through resizes — no re-flow, swap, or duplication', async () => {
    await renderApp()
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frame = callback; return 1 })
    const ids = ['clock', 'focus', 'weather', 'notes', 'tasks']
    const before = Object.fromEntries(ids.map((id) => [id, itemPoint(id)]))

    for (const [width, height, textScale] of [
      [1408, 445, 'standard'],
      [2560, 1440, 'large'],
      [1920, 500, 'large'],
      [1400, 900, 'standard'],
    ] as const) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
      await act(async () => {
        window.dispatchEvent(new Event('resize'))
        frame?.(0)
        await Promise.resolve()
      })
      expect(document.documentElement.dataset.stageProfile).toBeUndefined()
      expect(document.querySelector('main[data-aurora-canvas]')?.getAttribute('data-canvas-text-scale')).toBe(textScale)
      expect(document.querySelectorAll('[data-block-id="clock"]')).toHaveLength(1)
      expect(Object.fromEntries(ids.map((id) => [id, itemPoint(id)]))).toEqual(before)
    }
  })

  it('opens movable Timer, Tasks, and Notes launchers in their own contained panels and restores each invoker', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, timer: true },
    })
    await renderApp(storage)

    expect(itemPoint('timer').x).toBeLessThan(50)
    expect(itemPoint('timer').y).toBeLessThan(50)
    expect(itemPoint('notes').x).toBeLessThan(50)
    expect(itemPoint('notes').y).toBeGreaterThan(50)
    expect(itemPoint('tasks').x).toBeGreaterThan(50)
    expect(itemPoint('tasks').y).toBeGreaterThan(50)

    for (const entry of [
      { id: 'notes', button: 'Notes', dialog: 'Notes' },
      { id: 'tasks', button: 'Tasks', dialog: 'Tasks' },
    ]) {
      const launcher = await screen.findByRole('button', { name: entry.button })
      launcher.focus()
      // Flush the panel's useDialogEscape registration before synthesizing
      // the next separate user event. findByRole can resolve from the click
      // render before passive effects have joined the shared Escape stack.
      await act(async () => { fireEvent.click(launcher) })
      expect(await screen.findByRole('dialog', { name: entry.dialog })).toBeTruthy()
      expect(screen.queryByRole('dialog', { name: 'Utility Tray' })).toBeNull()
      expect(canvasItem(entry.id).dataset.canvasMode).toBe('anchored')
      fireEvent.keyDown(document, { key: 'Escape' })
      await act(async () => {})
      expect(screen.queryByRole('dialog', { name: entry.dialog })).toBeNull()
      expect(document.activeElement).toBe(launcher)
    }

    const timer = await screen.findByRole('button', { name: /Focus timer:/ })
    timer.focus()
    await act(async () => { fireEvent.click(timer) })
    expect(await screen.findByRole('dialog', { name: 'Focus timer' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Utility Tray' })).toBeNull()
    expect(canvasItem('timer').dataset.canvasMode).toBe('anchored')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Focus timer' })).toBeNull()
    expect(document.activeElement).toBe(timer)
  })

  it('requires the full 500ms target hold to create a stack and preserves the one-gesture undo', async () => {
    installStackGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', {
      version: 1,
      activeLayoutId: 'a',
      layouts: [{
        id: 'a',
        name: 'Desktop',
        widgets: {
          clock: { kind: 'free', anchor: 'top-left', offsetX: 20, offsetY: 20, tier: 'full', layer: 2 },
          weather: { kind: 'free', anchor: 'top-right', offsetX: -20, offsetY: 20, tier: 'standard', layer: 1 },
        },
      }],
    })
    await renderApp(storage)
    vi.useFakeTimers()
    try {
      fireEvent.pointerDown(within(canvasItem('clock')).getByRole('button', { name: 'Move Clock' }), {
        pointerId: 31, clientX: 110, clientY: 110,
      })
      await act(async () => {})
      fireEvent.pointerMove(document, { pointerId: 31, clientX: 550, clientY: 140 })
      act(() => vi.advanceTimersByTime(499))
      expect(screen.queryByText('Stack with Weather')).toBeNull()
      fireEvent.pointerUp(document, { pointerId: 31, clientX: 550, clientY: 140 })
      await act(async () => {})
      expect(screen.queryByTestId(/canvas-item-stack:/)).toBeNull()

      fireEvent.pointerDown(canvasItem('clock'), { pointerId: 32, clientX: 550, clientY: 140 })
      fireEvent.pointerMove(document, { pointerId: 32, clientX: 550, clientY: 140 })
      act(() => vi.advanceTimersByTime(500))
      expect(screen.getByText('Stack with Weather')).toBeTruthy()
      fireEvent.pointerUp(document, { pointerId: 32, clientX: 550, clientY: 140 })
      await act(async () => {})

      expect(document.querySelector('[data-canvas-object-id^="stack:"]')).toBeTruthy()
      expect(screen.getByRole('dialog', { name: 'Clock +1 inspector' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      await act(async () => {})
      expect(document.querySelector('[data-canvas-object-id^="stack:"]')).toBeNull()
      expect(canvasItem('clock')).toBeTruthy()
      expect(canvasItem('weather')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('appends a standalone widget to an existing stack only after the same explicit hold', async () => {
    installStackGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', stackedDocument())
    await renderApp(storage)
    vi.useFakeTimers()
    try {
      fireEvent.pointerDown(within(canvasItem('clock')).getByRole('button', { name: 'Move Clock' }), {
        pointerId: 33, clientX: 110, clientY: 110,
      })
      await act(async () => {})
      fireEvent.pointerMove(document, { pointerId: 33, clientX: 550, clientY: 140 })
      act(() => vi.advanceTimersByTime(500))
      expect(screen.getByText('Stack with Notes')).toBeTruthy()
      fireEvent.pointerUp(document, { pointerId: 33, clientX: 550, clientY: 140 })
      await act(async () => {})

      expect(screen.getByRole('dialog', { name: 'Clock +2 inspector' })).toBeTruthy()
      expect(within(screen.getByTestId('canvas-item-stack:stack-day')).getByRole('button', { name: 'Show Clock' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      await act(async () => {})
      expect(screen.getByRole('group', { name: 'Notes, 1 of 2' })).toBeTruthy()
      expect(canvasItem('clock')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves a whole stack as one card and restores its exact point with one Undo', async () => {
    installStackGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', stackedDocument())
    await renderApp(storage)

    const card = screen.getByTestId('canvas-item-stack:stack-day')
    expect(itemPoint(card)).toEqual({ x: 92, y: 13 })
    fireEvent.pointerDown(within(card).getByRole('button', { name: 'Move Notes +1' }), {
      pointerId: 34, clientX: 510, clientY: 110,
    })
    await act(async () => {})
    fireEvent.pointerMove(document, { pointerId: 34, clientX: 300, clientY: 300 })
    fireEvent.pointerUp(document, { pointerId: 34, clientX: 300, clientY: 300 })
    await act(async () => {})

    expect(itemPoint(screen.getByTestId('canvas-item-stack:stack-day'))).not.toEqual({ x: 92, y: 13 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await act(async () => {})
    expect(itemPoint(screen.getByTestId('canvas-item-stack:stack-day'))).toEqual({ x: 92, y: 13 })
  })

  it('normal stack paging persists only the face and plain face clicks still open the widget', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', stackedDocument())
    const legacyBefore = JSON.stringify(await storage.get('layout'))
    const updateSpy = vi.spyOn(storage, 'update')
    await renderApp(storage)

    const card = screen.getByTestId('canvas-item-stack:stack-day')
    fireEvent.click(within(card).getByRole('button', { name: /^Notes$/ }))
    expect(await screen.findByRole('dialog', { name: 'Notes' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await act(async () => {})

    fireEvent.click(within(card).getByRole('button', { name: 'Next widget' }))
    await waitFor(() => expect(screen.getByRole('group', { name: 'Tasks, 2 of 2' })).toBeTruthy())
    expect((await storage.get('layouts'))?.layouts[0].stacks?.[0].facing).toBe('tasks')
    expect(updateSpy.mock.calls.every(([key]) => key === 'layouts')).toBe(true)
    expect(JSON.stringify(await storage.get('layout'))).toBe(legacyBefore)
  })

  it('edit dots are undoable, Save reloads the exact stack, and Cancel remains write-free', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', stackedDocument())
    const setSpy = vi.spyOn(storage, 'set')
    await renderApp(storage)

    const card = screen.getByTestId('canvas-item-stack:stack-day')
    fireEvent.pointerDown(within(card).getByRole('button', { name: 'Move Notes +1' }), {
      pointerId: 31, clientX: 510, clientY: 110,
    })
    fireEvent.pointerUp(document, { pointerId: 31, clientX: 510, clientY: 110 })
    await act(async () => {})
    // The real release emits one click over the object; edit entry swallows it
    // so it cannot activate the face that just replaced the hover grip.
    fireEvent.click(screen.getByTestId('canvas-item-stack:stack-day'))
    fireEvent.click(within(screen.getByTestId('canvas-item-stack:stack-day')).getByRole('button', { name: 'Show Tasks' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {})
    expect((await storage.get('layouts'))?.layouts[0].stacks?.[0].facing).toBe('notes')
    expect(setSpy.mock.calls.filter(([key]) => key === 'layouts')).toHaveLength(0)

    fireEvent.pointerDown(within(screen.getByTestId('canvas-item-stack:stack-day')).getByRole('button', { name: 'Move Notes +1' }))
    await act(async () => {})
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Notes +1 inspector' })).getByRole('radio', { name: 'Full' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(async () => {})
    expect(setSpy.mock.calls.filter(([key]) => key === 'layouts').map(([key]) => key)).toEqual(['layouts'])
    expect((await storage.get('layouts'))?.layouts[0].stacks?.[0]).toEqual({
      ...stackedDocument().layouts[0].stacks?.[0],
      tier: 'full',
    })

    cleanup()
    await renderApp(storage)
    expect(screen.getByTestId('canvas-item-stack:stack-day').dataset.canvasSize).toBe('full')
    expect(screen.getByRole('group', { name: 'Notes, 1 of 2' })).toBeTruthy()
  })

  it('dragging a member out dissolves a two-member stack and one Undo restores it', async () => {
    installStackGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', stackedDocument())
    await renderApp(storage)

    const card = screen.getByTestId('canvas-item-stack:stack-day')
    fireEvent.pointerDown(within(card).getByRole('button', { name: 'Move Notes +1' }), {
      pointerId: 41, clientX: 510, clientY: 110,
    })
    await act(async () => {})
    const inspector = screen.getByRole('dialog', { name: 'Notes +1 inspector' })
    fireEvent.pointerDown(within(inspector).getByRole('button', { name: 'Move Tasks out of stack' }), {
      pointerId: 42, clientX: 900, clientY: 400,
    })
    fireEvent.pointerMove(document, { pointerId: 42, clientX: 300, clientY: 300 })
    fireEvent.pointerUp(document, { pointerId: 42, clientX: 300, clientY: 300 })
    await act(async () => {})

    expect(screen.queryByTestId('canvas-item-stack:stack-day')).toBeNull()
    expect(canvasItem('notes')).toBeTruthy()
    expect(canvasItem('tasks')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await act(async () => {})
    expect(screen.getByTestId('canvas-item-stack:stack-day')).toBeTruthy()
  })

  it('restores free movement exactly when the browser cancels the pointer gesture', async () => {
    installStackGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', {
      version: 1,
      activeLayoutId: 'cancel-free',
      layouts: [{
        id: 'cancel-free',
        name: 'Cancel free',
        widgets: {
          clock: { kind: 'free', anchor: 'top-left', offsetX: 20, offsetY: 20, tier: 'full', layer: 2 },
        },
      }],
    })
    await renderApp(storage)
    const before = itemPoint('clock')

    fireEvent.pointerDown(within(canvasItem('clock')).getByRole('button', { name: 'Move Clock' }), {
      pointerId: 51, clientX: 110, clientY: 110,
    })
    await act(async () => {})
    fireEvent.pointerMove(document, { pointerId: 51, clientX: 360, clientY: 260 })
    fireEvent.pointerCancel(document, { pointerId: 51, clientX: 360, clientY: 260 })
    await act(async () => {})

    expect(itemPoint('clock')).toEqual(before)
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(true)
  })

  it('restores the exact dock and x position when the browser cancels the pointer gesture', async () => {
    installStackGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', {
      version: 1,
      activeLayoutId: 'cancel-dock',
      layouts: [{
        id: 'cancel-dock',
        name: 'Cancel dock',
        widgets: {
          weather: { kind: 'docked', dock: 'bottom', order: 0, x: 31, tier: 'compact' },
        },
      }],
    })
    await renderApp(storage)
    const before = canvasGeometry('weather')

    fireEvent.pointerDown(within(canvasItem('weather')).getByRole('button', { name: 'Move Weather' }), {
      pointerId: 52, clientX: 550, clientY: 520,
    })
    await act(async () => {})
    fireEvent.pointerMove(document, { pointerId: 52, clientX: 760, clientY: 20 })
    fireEvent.pointerCancel(document, { pointerId: 52, clientX: 760, clientY: 20 })
    await act(async () => {})

    expect(canvasGeometry('weather')).toEqual(before)
    expect(within(screen.getByRole('navigation', { name: 'Bottom bar' })).getByTestId('canvas-item-weather')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps an inspector-origin member in its stack when the browser cancels the pointer gesture', async () => {
    installStackGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', stackedDocument())
    await renderApp(storage)

    const card = screen.getByTestId('canvas-item-stack:stack-day')
    fireEvent.pointerDown(within(card).getByRole('button', { name: 'Move Notes +1' }), {
      pointerId: 53, clientX: 510, clientY: 110,
    })
    await act(async () => {})
    const inspector = screen.getByRole('dialog', { name: 'Notes +1 inspector' })
    fireEvent.pointerDown(within(inspector).getByRole('button', { name: 'Move Tasks out of stack' }), {
      pointerId: 54, clientX: 900, clientY: 400,
    })
    fireEvent.pointerMove(document, { pointerId: 54, clientX: 300, clientY: 300 })
    fireEvent.pointerCancel(document, { pointerId: 54, clientX: 300, clientY: 300 })
    await act(async () => {})

    expect(screen.getByTestId('canvas-item-stack:stack-day')).toBeTruthy()
    expect(document.querySelector('[data-canvas-object-id="tasks"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(true)
  })

  it('docks Standard Weather without a Compact prerequisite and restores Standard after undock', async () => {
    installDockGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', {
      version: 1,
      activeLayoutId: 'weather-tier',
      layouts: [{
        id: 'weather-tier',
        name: 'Weather tier',
        widgets: {
          weather: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -10, tier: 'standard', layer: 1 },
        },
      }],
    })
    await renderApp(storage)
    const before = canvasGeometry('weather')

    fireEvent.pointerDown(within(canvasItem('weather')).getByRole('button', { name: 'Move Weather' }), {
      pointerId: 61, clientX: 500, clientY: 240,
    })
    await act(async () => {})
    fireEvent.pointerMove(document, { pointerId: 61, clientX: 500, clientY: 536 })
    await act(async () => {})
    expect(canvasItem('weather').dataset.canvasMode).toBe('docked')
    expect(canvasItem('weather').dataset.canvasSize).toBe('compact')
    expect(document.querySelector('.dock-drop-zone')?.getAttribute('data-edge')).toBe('bottom')

    fireEvent.pointerMove(document, { pointerId: 61, clientX: 400, clientY: 300 })
    await act(async () => {})
    expect(canvasItem('weather').dataset.canvasMode).toBe('anchored')
    expect(canvasItem('weather').dataset.canvasSize).toBe('standard')
    expect(document.querySelector('.dock-drop-zone')).toBeNull()
    fireEvent.pointerUp(document, { pointerId: 61, clientX: 400, clientY: 300 })
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await act(async () => {})
    expect(canvasGeometry('weather')).toEqual(before)
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(true)
  })

  it('places the edit toolbar below the full live top dock band', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1408 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 445 })
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', {
      version: 1,
      activeLayoutId: 'top-dock-access',
      layouts: [{
        id: 'top-dock-access',
        name: 'Top dock access',
        widgets: {
          weather: { kind: 'docked', dock: 'top', order: 0, x: 26, y: 76, tier: 'compact', returnTier: 'standard' },
        },
      }],
    })
    await renderApp(storage)

    fireEvent.keyDown(window, { key: 'E', ctrlKey: true, shiftKey: true })
    await act(async () => {})

    const toolbar = screen.getByRole('toolbar', { name: 'Edit layout' })
    // 5px edge inset + 96px short-window band + 8px clearance.
    expect(toolbar.style.top).toBe('109px')
  })

  it('keeps dock tier and return tier through bottom -> canvas -> top in one gesture', async () => {
    installDockGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', {
      version: 1,
      activeLayoutId: 'dock-memory',
      layouts: [{
        id: 'dock-memory',
        name: 'Dock memory',
        widgets: {
          weather: {
            kind: 'docked', dock: 'bottom', order: 0, x: 50, y: 50,
            tier: 'compact', returnTier: 'full',
          },
        },
      }],
    })
    await renderApp(storage)

    fireEvent.pointerDown(within(canvasItem('weather')).getByRole('button', { name: 'Move Weather' }), {
      pointerId: 62, clientX: 500, clientY: 536,
    })
    await act(async () => {})
    fireEvent.pointerMove(document, { pointerId: 62, clientX: 400, clientY: 300 })
    await act(async () => {})
    expect(canvasItem('weather').dataset.canvasMode).toBe('anchored')
    expect(canvasItem('weather').dataset.canvasSize).toBe('full')
    fireEvent.pointerMove(document, { pointerId: 62, clientX: 600, clientY: 64 })
    await act(async () => {})
    expect(canvasItem('weather').dataset.canvasMode).toBe('docked')
    expect(canvasItem('weather').dataset.canvasSize).toBe('compact')
    fireEvent.pointerUp(document, { pointerId: 62, clientX: 600, clientY: 64 })
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(async () => {})

    expect((await storage.get('layouts'))?.layouts[0].widgets.weather).toMatchObject({
      kind: 'docked', dock: 'top', tier: 'compact', returnTier: 'full',
    })
  })

  it('nudges dock X/Y by 8px and Shift by 1px through measured containment', async () => {
    installDockGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', {
      version: 1,
      activeLayoutId: 'dock-keyboard',
      layouts: [{
        id: 'dock-keyboard',
        name: 'Dock keyboard',
        widgets: {
          weather: { kind: 'docked', dock: 'bottom', order: 0, x: 50, y: 50, tier: 'compact' },
        },
      }],
    })
    await renderApp(storage)

    fireEvent.pointerDown(within(canvasItem('weather')).getByRole('button', { name: 'Move Weather' }), {
      pointerId: 63, clientX: 500, clientY: 536,
    })
    fireEvent.pointerUp(document, { pointerId: 63, clientX: 500, clientY: 536 })
    await act(async () => {})
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    await act(async () => {})
    expect(Number.parseFloat(canvasItem('weather').style.top)).toBeCloseTo(40 / 96 * 100, 5)
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })
    await act(async () => {})
    expect(Number.parseFloat(canvasItem('weather').style.left)).toBeCloseTo(496 / 990 * 100, 5)
  })

  it('shows and clears same-dock overlap from current rectangles during the gesture', async () => {
    installDockGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', {
      version: 1,
      activeLayoutId: 'dock-overlap',
      layouts: [{
        id: 'dock-overlap',
        name: 'Dock overlap',
        widgets: {
          weather: { kind: 'docked', dock: 'bottom', order: 0, x: 45, y: 50, tier: 'compact' },
          clock: { kind: 'docked', dock: 'bottom', order: 1, x: 49, y: 50, tier: 'compact' },
        },
      }],
    })
    await renderApp(storage)

    fireEvent.pointerDown(within(canvasItem('weather')).getByRole('button', { name: 'Move Weather' }), {
      pointerId: 64, clientX: 457, clientY: 536,
    })
    await act(async () => {})
    expect(within(screen.getByRole('dialog', { name: 'Weather inspector' })).getByText('Overlaps Clock')).toBeTruthy()

    fireEvent.pointerMove(document, { pointerId: 64, clientX: 800, clientY: 520, altKey: true })
    await act(async () => {})
    expect(within(screen.getByRole('dialog', { name: 'Weather inspector' })).queryByText('Overlaps Clock')).toBeNull()
    fireEvent.pointerUp(document, { pointerId: 64, clientX: 800, clientY: 520 })
  })

  it('Escape during a drag restores the origin, clears dock chrome, and writes nothing', async () => {
    installDockGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', {
      version: 1,
      activeLayoutId: 'escape-drag',
      layouts: [{
        id: 'escape-drag',
        name: 'Escape drag',
        widgets: {
          weather: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -10, tier: 'standard', layer: 1 },
        },
      }],
    })
    const layoutsBefore = JSON.stringify(await storage.get('layouts'))
    const setSpy = vi.spyOn(storage, 'set')
    await renderApp(storage)

    fireEvent.pointerDown(within(canvasItem('weather')).getByRole('button', { name: 'Move Weather' }), {
      pointerId: 65, clientX: 500, clientY: 240,
    })
    await act(async () => {})
    fireEvent.pointerMove(document, { pointerId: 65, clientX: 500, clientY: 536 })
    await act(async () => {})
    expect(document.querySelector('.dock-drop-zone')).toBeTruthy()
    expect(document.querySelector('.edit-guides--dock')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    await act(async () => {})
    expect(document.querySelector('main[data-editing]')).toBeNull()
    expect(document.querySelector('.dock-drop-zone')).toBeNull()
    expect(document.querySelector('.edit-guides')).toBeNull()
    expect(JSON.stringify(await storage.get('layouts'))).toBe(layoutsBefore)
    expect(setSpy.mock.calls.filter(([key]) => key === 'layouts')).toHaveLength(0)
  })

  it('the visible Cancel action tears down an active drag before a later edit session', async () => {
    installDockGeometry()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layouts', {
      version: 1,
      activeLayoutId: 'button-cancel-drag',
      layouts: [{
        id: 'button-cancel-drag',
        name: 'Button cancel drag',
        widgets: {
          weather: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -10, tier: 'standard', layer: 1 },
        },
      }],
    })
    await renderApp(storage)

    fireEvent.pointerDown(within(canvasItem('weather')).getByRole('button', { name: 'Move Weather' }), {
      pointerId: 66, clientX: 500, clientY: 240,
    })
    await act(async () => {})
    fireEvent.pointerMove(document, { pointerId: 66, clientX: 500, clientY: 536 })
    await act(async () => {})
    expect(document.querySelector('.dock-drop-zone')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {})

    // A stale listener would continue changing the hidden drag zone. On the
    // next edit entry that stale state would repaint a lying band boundary.
    fireEvent.pointerMove(document, { pointerId: 66, clientX: 500, clientY: 64 })
    fireEvent.keyDown(window, { key: 'E', ctrlKey: true, shiftKey: true })
    await act(async () => {})
    expect(document.querySelector('main[data-editing]')).toBeTruthy()
    expect(document.querySelector('.dock-drop-zone')).toBeNull()
  })

  it('uses one body-owned document-safe tool sheet on Small', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 })
    await renderApp()

    const notes = await screen.findByRole('button', { name: 'Notes' })
    notes.focus()
    fireEvent.click(notes)
    const sheet = await screen.findByRole('dialog', { name: 'Notes' })

    expect(document.documentElement.dataset.stageProfile).toBeUndefined()
    expect(sheet.getAttribute('data-canvas-tool-panel')).toBe('')
    expect(sheet.parentElement).toBe(document.body)
    expect(document.querySelectorAll('[data-canvas-tool-panel]')).toHaveLength(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    await act(async () => {})
    expect(screen.queryByRole('dialog', { name: 'Notes' })).toBeNull()
    expect(document.activeElement).toBe(notes)
  })

  it('grip entry dims the page, inerts interiors, selects on click, and exact-cancels on Escape (spec 2.5)', async () => {
    const storage = await renderApp()
    const layoutsBefore = JSON.stringify(await storage.get('layouts'))
    const positionsBefore = ['clock', 'focus', 'weather'].map((id) => canvasItem(id).style.left + canvasItem(id).style.top)

    fireEvent.pointerDown(within(canvasItem('clock')).getByRole('button', { name: 'Move Clock' }))
    await act(async () => {})

    expect(document.querySelector('main[data-editing]')).toBeTruthy()
    expect(document.querySelector('.edit-scrim')).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: 'Edit layout' })).toBeTruthy()
    // Interiors are inert; the wrapper is the selection target.
    const focusWrapper = canvasItem('focus')
    expect(focusWrapper.querySelector('[inert]')).toBeTruthy()
    fireEvent.click(focusWrapper)
    expect(focusWrapper.getAttribute('aria-pressed')).toBe('true')

    // Move the selection with arrows, then Escape: exact cancel.
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'Escape' })
    await act(async () => {})

    expect(document.querySelector('main[data-editing]')).toBeNull()
    expect(JSON.stringify(await storage.get('layouts'))).toBe(layoutsBefore)
    expect(['clock', 'focus', 'weather'].map((id) => canvasItem(id).style.left + canvasItem(id).style.top)).toEqual(positionsBefore)
  })

  it('Save commits the whole draft once and the moved placement persists (spec 2.5)', async () => {
    const storage = await renderApp()
    expect(await storage.get('layouts')).toBeNull()

    fireEvent.pointerDown(within(canvasItem('clock')).getByRole('button', { name: 'Move Clock' }))
    await act(async () => {})
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(async () => {})

    expect(document.querySelector('main[data-editing]')).toBeNull()
    const stored = await storage.get('layouts')
    expect(stored).not.toBeNull()
    expect(stored?.layouts[0].widgets.clock?.kind).toBe('free')
  })

  it('bulk tier sets every free widget at once and Undo restores (AC9)', async () => {
    await renderApp()
    fireEvent.pointerDown(within(canvasItem('clock')).getByRole('button', { name: 'Move Clock' }))
    await act(async () => {})

    const sizesBefore = ['clock', 'focus', 'weather'].map((id) => canvasItem(id).dataset.canvasSize)
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Edit layout' })).getByRole('button', { name: 'Compact' }))
    await act(async () => {})
    for (const id of ['clock', 'focus', 'weather']) {
      expect(canvasItem(id).dataset.canvasSize).toBe('compact')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await act(async () => {})
    expect(['clock', 'focus', 'weather'].map((id) => canvasItem(id).dataset.canvasSize)).toEqual(sizesBefore)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {})
  })

  it('selecting Weather shows the inspector and its dashed expansion footprint anywhere, and Hide persists as hidden (spec 2.5/2.6)', async () => {
    const storage = await renderApp()
    fireEvent.pointerDown(within(canvasItem('weather')).getByRole('button', { name: 'Move Weather' }))
    await act(async () => {})
    fireEvent.click(canvasItem('weather'))
    await act(async () => {})

    expect(screen.getByRole('dialog', { name: 'Weather inspector' })).toBeTruthy()
    expect(screen.getByTestId('canvas-footprint-weather')).toBeTruthy()
    // The Clock has no expansion footprint.
    fireEvent.click(canvasItem('clock'))
    await act(async () => {})
    expect(screen.queryByTestId('canvas-footprint-clock')).toBeNull()

    // Never placement-restricted: park Weather in the bottom-right corner —
    // still selected, footprint still rendered (AC6).
    fireEvent.click(canvasItem('weather'))
    await act(async () => {})
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await act(async () => {})
    expect(screen.getByTestId('canvas-footprint-weather')).toBeTruthy()

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Weather inspector' })).getByRole('button', { name: 'Hide' }))
    await act(async () => {})
    expect(screen.queryByTestId('canvas-item-weather')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(async () => {})
    const stored = await storage.get('layouts')
    expect(stored?.layouts[0].widgets.weather).toEqual({ kind: 'hidden' })
    // The global toggle is untouched — hide is per-layout (spec 2.1).
    expect((await storage.get('settings')).widgets.weather).toBe(true)
  })

  it('the entry chord during a live session is identity — a draft is never silently discarded (review fix C1)', async () => {
    await renderApp()
    fireEvent.pointerDown(within(canvasItem('clock')).getByRole('button', { name: 'Move Clock' }))
    await act(async () => {})
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await act(async () => {})
    const movedTo = itemPoint('clock')
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false)

    fireEvent.keyDown(window, { key: 'E', ctrlKey: true, shiftKey: true })
    await act(async () => {})

    // Still the SAME session: the moved position and the undo history live.
    expect(itemPoint('clock')).toEqual(movedTo)
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {})
  })

  it('the toolbar lists hidden widgets and Show restores them to the designed slot (review fix I2)', async () => {
    await renderApp()
    fireEvent.pointerDown(within(canvasItem('weather')).getByRole('button', { name: 'Move Weather' }))
    await act(async () => {})
    fireEvent.click(canvasItem('weather'))
    await act(async () => {})
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Weather inspector' })).getByRole('button', { name: 'Hide' }))
    await act(async () => {})
    expect(screen.queryByTestId('canvas-item-weather')).toBeNull()

    fireEvent.click(screen.getByText(/Hidden \d+/))
    fireEvent.click(within(screen.getByRole('group', { name: 'Hidden in this layout' })).getByRole('button', { name: 'Show Weather' }))
    await act(async () => {})
    expect(screen.getByTestId('canvas-item-weather')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Hidden in this layout' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {})
  })

  it('the badge switches and creates layouts with single validated writes of only the layouts key (spec 2.1)', async () => {
    const storage = await renderApp()
    const setSpy = vi.spyOn(storage, 'set')
    const clockBefore = itemPoint('clock')

    fireEvent.click(screen.getByRole('button', { name: 'Layout: My layout' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New layout' }))
    await act(async () => {})

    expect(setSpy.mock.calls.every(([key]) => key === 'layouts')).toBe(true)
    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Layout: Layout 2' })).toBeTruthy()
    // The new layout renders the designed defaults; switching back restores
    // the original placements exactly.
    fireEvent.click(screen.getByRole('button', { name: 'Layout: Layout 2' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'My layout' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Layout: My layout' })).toBeTruthy()
    expect(itemPoint('clock')).toEqual(clockBefore)
    expect(setSpy.mock.calls.every(([key]) => key === 'layouts')).toBe(true)
  })

  it('the gear on a widget opens Settings focused on that widget\'s own section (spec 2.5)', async () => {
    await renderApp()

    fireEvent.click(within(canvasItem('weather')).getByRole('button', { name: 'Weather settings' }))
    await act(async () => {})

    expect(screen.getByRole('tab', { name: 'Widgets', selected: true })).toBeTruthy()
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)) })
    expect(document.activeElement?.closest('[data-settings-anchor="weather"]')).toBeTruthy()
  })

  // The Arrange artboard, its inspector, and the Use-Desktop-everywhere
  // preview were deleted with the named-layouts rebuild (NL-P2, spec §3);
  // live on-page editing arrives in NL-P3.

  it('Reset layout preserves a manual density choice', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', { ...defaults().settings, layoutDensity: 'spacious' })
    await renderApp(storage)
    await act(async () => {
      await storage.set('layout', { ...emptyLayoutV2(), profiles: { standard: { focus: { zone: 'day', order: 1, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' } } } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Widgets' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reset layout' }))
    const dialog = screen.getByRole('dialog', { name: 'Reset layout?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset layout' }))
    await act(async () => {})
    expect((await storage.get('settings')).layoutDensity).toBe('spacious')
    expect(await storage.get('layout')).toEqual(emptyLayoutV2())
  })

  it('does not introduce a root transform or any profile authority', async () => {
    await renderApp()
    const main = document.querySelector<HTMLElement>('main[data-aurora-canvas]')!
    expect(main.style.transform).toBe('')
    expect(main.dataset.canvasProfile).toBeUndefined()
    expect(document.documentElement.dataset.stageProfile).toBeUndefined()
    expect(screen.getByRole('region', { name: 'Canvas' }).getAttribute('data-canvas-profile')).toBeNull()
  })

  it('reads legacy Compact density as Standard text without eagerly rewriting storage', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', { ...defaults().settings, layoutDensity: 'compact' })

    await renderApp(storage)

    expect(document.querySelector('main[data-aurora-canvas]')?.getAttribute('data-canvas-text-scale')).toBe('standard')
    expect((await storage.get('settings')).layoutDensity).toBe('compact')
  })
})
