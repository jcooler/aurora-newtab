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
    mode: item.dataset.canvasMode,
    size: item.dataset.canvasSize,
    left: item.style.left,
    top: item.style.top,
    layer: item.style.zIndex,
  }
}

function itemPoint(id: string): { x: number; y: number } {
  const item = canvasItem(id)
  return { x: Number.parseFloat(item.style.left), y: Number.parseFloat(item.style.top) }
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
      fireEvent.click(launcher)
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
    fireEvent.click(timer)
    expect(await screen.findByRole('dialog', { name: 'Focus timer' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Utility Tray' })).toBeNull()
    expect(canvasItem('timer').dataset.canvasMode).toBe('anchored')
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
