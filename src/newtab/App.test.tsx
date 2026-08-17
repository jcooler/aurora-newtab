// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageProvider } from '../lib/storage/context'
import { memoryDriver } from '../lib/storage/driver'
import { createStorage } from '../lib/storage/index'
import { defaults } from '../lib/storage/schema'
import type { LayoutV3 } from '../lib/layout/canvasTypes'
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
    x: item.dataset.canvasX,
    y: item.dataset.canvasY,
    size: item.dataset.canvasSize,
    left: item.style.left,
    top: item.style.top,
    width: item.style.width,
    minHeight: item.style.minHeight,
    layer: item.style.zIndex,
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

  it('owns one V1 Canvas and retires the rejected semantic presentation regions', async () => {
    await renderApp()
    expect(document.querySelectorAll('main[data-aurora-canvas]')).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Canvas' }).getAttribute('data-canvas-layout')).toBe('Desktop')
    for (const name of ['Day', 'Now', 'Work Pulse', 'Signal Dock']) {
      expect(screen.queryByRole('region', { name })).toBeNull()
    }
  })

  it('opens a functional modeless Utility Tray without duplicating the direct Canvas tools', async () => {
    await renderApp()
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
    expect(within(tray).getByRole('button', { name: 'Refresh' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(tray).getByRole('region', { name: 'Background refresh' })).toBeTruthy()
  })

  it('derives a modal Small Utility Tray, inerts only the Canvas host, and restores its invoker', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    await renderApp()
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
    expect(Number(canvasItem('bookmarks').dataset.canvasY)).toBeLessThan(10)
    for (const id of ['clock', 'greeting', 'search', 'focus', 'links']) {
      expect(canvasItem(id).dataset.canvasX).toBe('50')
    }
    expect(Number(canvasItem('clock').dataset.canvasY)).toBeLessThan(Number(canvasItem('focus').dataset.canvasY))
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
      expect(canvasItem(id).dataset.canvasKind).toBe('canvas')
    }
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).toBeNull()
  })

  it('fits active Canvas items to finite absolute geometry with the frozen safe inset', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { github: { enabled: true, username: '' } })
    await renderApp(storage)

    for (const id of ['weather', 'clock', 'github', 'notes']) {
      const item = canvasItem(id)
      expect(item.style.position).toBe('absolute')
      expect(Number.parseFloat(item.style.left)).toBeGreaterThanOrEqual(8)
      expect(Number.parseFloat(item.style.top)).toBeGreaterThanOrEqual(8)
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
    expect(canvasItem('notes').dataset.canvasKind).toBe('bottom-bar')
    expect(canvasItem('clock').dataset.canvasKind).toBe('canvas')
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
    expect(canvasItem('focus').dataset.canvasX).toBe('50')
    expect(canvasItem('focus').dataset.canvasY).toBe('70')
    expect(canvasItem('focus').dataset.canvasSize).toBe('compact')
    expect(screen.getByRole('region', { name: 'Canvas' }).getAttribute('data-canvas-mode')).toBe('custom')
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
    expect(canvasItem('github').dataset.canvasKind).toBe('bottom-bar')
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
    expect(canvasItem('github').dataset.canvasKind).toBe('canvas')
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
    expect(canvasItem('focus').dataset.canvasX).toBe('16.667')
    expect(canvasItem('focus').dataset.canvasY).toBe('62')
    expect(canvasItem('focus').dataset.canvasSize).toBe('compact')
    expect(Number.parseFloat(canvasItem('focus').style.left)).toBeGreaterThanOrEqual(8)
  })

  it('preserves a migrated V1 Clock coordinate when adapting a legacy layout', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', { clock: { x: 25, y: 50 } })
    await renderApp(storage)
    expect(canvasItem('clock').dataset.canvasX).toBe('25')
    expect(canvasItem('clock').dataset.canvasY).toBe('50')
    expect(canvasItem('clock').dataset.canvasSize).toBe('standard')
  })

  it('gives Small a vertical document path with no horizontal document overflow', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    await renderApp()
    const canvas = screen.getByRole('region', { name: 'Canvas' })
    expect(canvas.getAttribute('data-canvas-layout')).toBe('Small')
    expect(Number.parseFloat((canvas as HTMLElement).style.height)).toBeGreaterThan(600)
    for (const item of document.querySelectorAll<HTMLElement>('[data-canvas-kind="canvas"]')) {
      expect(item.dataset.canvasX).toBe('50')
      expect(Number.parseFloat(item.style.width)).toBeLessThanOrEqual(784)
    }
  })

  it('replans across all four viewport profiles without duplicating active identities', async () => {
    await renderApp()
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frame = callback; return 1 })

    for (const [width, height, profile, label] of [
      [800, 600, 'compact', 'Small'],
      [1400, 900, 'standard', 'Desktop'],
      [2560, 1440, 'display', 'Large'],
      [1800, 700, 'ultrawide', 'Wide'],
    ] as const) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
      await act(async () => {
        window.dispatchEvent(new Event('resize'))
        frame?.(0)
        await Promise.resolve()
      })
      expect(document.documentElement.dataset.stageProfile).toBeUndefined()
      expect(document.querySelector('main[data-aurora-canvas]')?.getAttribute('data-canvas-profile')).toBe(profile)
      expect(screen.getByRole('region', { name: 'Canvas' }).getAttribute('data-canvas-layout')).toBe(label)
      expect(document.querySelectorAll('[data-block-id="clock"]')).toHaveLength(1)
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

    expect(Number(canvasItem('timer').dataset.canvasX)).toBeLessThan(50)
    expect(Number(canvasItem('timer').dataset.canvasY)).toBeLessThan(50)
    expect(Number(canvasItem('notes').dataset.canvasX)).toBeLessThan(50)
    expect(Number(canvasItem('notes').dataset.canvasY)).toBeGreaterThan(50)
    expect(Number(canvasItem('tasks').dataset.canvasX)).toBeGreaterThan(50)
    expect(Number(canvasItem('tasks').dataset.canvasY)).toBeGreaterThan(50)

    for (const entry of [
      { id: 'notes', button: 'Notes', dialog: 'Notes' },
      { id: 'tasks', button: 'Tasks', dialog: 'Tasks' },
    ]) {
      const launcher = await screen.findByRole('button', { name: entry.button })
      launcher.focus()
      fireEvent.click(launcher)
      expect(await screen.findByRole('dialog', { name: entry.dialog })).toBeTruthy()
      expect(screen.queryByRole('dialog', { name: 'Utility Tray' })).toBeNull()
      expect(canvasItem(entry.id).dataset.canvasKind).toBe('canvas')
      fireEvent.keyDown(document, { key: 'Escape' })
      await act(async () => {})
      expect(screen.queryByRole('dialog', { name: entry.dialog })).toBeNull()
      expect(document.activeElement).toBe(launcher)
    }

    const timer = await screen.findByRole('button', { name: /Focus timer:/ })
    timer.focus()
    fireEvent.click(timer)
    expect(await screen.findByRole('dialog', { name: 'Focus timer' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Utility Tray' })).toBeNull()
    expect(canvasItem('timer').dataset.canvasKind).toBe('canvas')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Focus timer' })).toBeNull()
    expect(document.activeElement).toBe(timer)
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

  it('keeps Settings focus restoration and the temporary Arrange entry and exit behavior', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const active = this.hasAttribute('data-block-id')
      return { left: 10, top: 10, right: active ? 210 : 10, bottom: active ? 110 : 10, width: active ? 200 : 0, height: active ? 100 : 0, x: 10, y: 10, toJSON: () => ({}) } as DOMRect
    })
    await renderApp()
    const gear = screen.getByRole('button', { name: 'Open settings' })
    gear.focus()
    fireEvent.click(gear)
    fireEvent.click(await screen.findByRole('tab', { name: 'Widgets' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Arrange layout' }))
    expect(await screen.findByRole('button', { name: 'Edit Weather' })).toBe(document.activeElement)
    expect(screen.getByRole('region', { name: 'Canvas' }).dataset.canvasViewportWidth).toBe('1280')
    fireEvent.click(screen.getByRole('tab', { name: 'Small' }))
    expect(screen.getByRole('region', { name: 'Canvas' }).dataset.canvasViewportWidth).toBe('375')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(gear)
  })

  it('previews a Canvas size edit and restores the exact stored layout on Cancel', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const active = this.hasAttribute('data-block-id')
      return { left: 10, top: 10, right: active ? 210 : 10, bottom: active ? 110 : 10, width: active ? 200 : 0, height: active ? 100 : 0, x: 10, y: 10, toJSON: () => ({}) } as DOMRect
    })
    const storage = createStorage(memoryDriver())
    await storage.init()
    const stored = await storage.get('layout')
    await renderApp(storage)
    const before = canvasItem('weather').dataset.canvasSize

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Widgets' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Arrange layout' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Weather' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Weather inspector' })).getByRole('radio', { name: 'Compact' }))
    expect(canvasItem('weather').dataset.canvasSize).toBe('compact')
    expect(await storage.get('layout')).toEqual(stored)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(canvasItem('weather').dataset.canvasSize).toBe(before)
    expect(await storage.get('layout')).toEqual(stored)
  })

  it('hides a non-required widget only in the live preview until the Arrange session is saved', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const active = this.hasAttribute('data-block-id')
      return { left: 10, top: 10, right: active ? 210 : 10, bottom: active ? 110 : 10, width: active ? 200 : 0, height: active ? 100 : 0, x: 10, y: 10, toJSON: () => ({}) } as DOMRect
    })
    const storage = createStorage(memoryDriver())
    await storage.init()
    await renderApp(storage)

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Widgets' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Arrange layout' }))
    const inspector = await screen.findByRole('complementary', { name: 'Weather inspector' })
    fireEvent.click(within(inspector).getByRole('checkbox', { name: 'Visible' }))

    expect(screen.queryByTestId('canvas-item-weather')).toBeNull()
    expect((await storage.get('settings')).widgets.weather).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByTestId('canvas-item-weather')).toBeTruthy()
    expect((await storage.get('settings')).widgets.weather).toBe(true)
  })

  it('previews Use Desktop layout everywhere on Small without writing', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const active = this.hasAttribute('data-block-id')
      return { left: 10, top: 10, right: active ? 210 : 10, bottom: active ? 110 : 10, width: active ? 200 : 0, height: active ? 100 : 0, x: 10, y: 10, toJSON: () => ({}) } as DOMRect
    })
    const storage = createStorage(memoryDriver())
    await storage.init()
    const before = await storage.get('layout')
    await renderApp(storage)
    expect(canvasItem('clock').dataset.canvasSize).toBe('compact')

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Widgets' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Arrange layout' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use Desktop layout everywhere' }))

    expect(canvasItem('clock').dataset.canvasSize).toBe('full')
    expect(await storage.get('layout')).toEqual(before)
  })

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

  it('does not introduce a root transform or duplicate profile authority', async () => {
    await renderApp()
    const main = document.querySelector<HTMLElement>('main[data-aurora-canvas]')!
    expect(main.style.transform).toBe('')
    expect(main.dataset.canvasProfile).toBe('standard')
    expect(document.documentElement.dataset.stageProfile).toBeUndefined()
    expect(screen.getByRole('region', { name: 'Canvas' }).getAttribute('data-canvas-profile')).toBe('standard')
  })
})
