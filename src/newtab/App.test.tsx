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

  it('opens a modeless Utility Tray without making the Desktop Canvas inert', async () => {
    await renderApp()
    const invoker = screen.getByRole('button', { name: 'Open utility tray' })
    const dashboard = invoker.closest('.contents')

    fireEvent.click(invoker)

    const tray = screen.getByRole('dialog', { name: 'Utility Tray' })
    expect(tray.getAttribute('data-utility-tray-mode')).toBe('modeless')
    expect(tray.getAttribute('aria-modal')).toBeNull()
    expect(dashboard?.hasAttribute('inert')).toBe(false)
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
    expect(document.querySelectorAll('[data-aurora-briefing]')).toHaveLength(1)
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
      expect(document.documentElement.dataset.stageProfile).toBe(profile)
      expect(screen.getByRole('region', { name: 'Canvas' }).getAttribute('data-canvas-layout')).toBe(label)
      expect(document.querySelectorAll('[data-block-id="clock"]')).toHaveLength(1)
    }
  })

  it('routes a movable Notes launcher into the single Utility Tray surface', async () => {
    await renderApp()
    const notes = await screen.findByRole('button', { name: 'Notes' })
    fireEvent.click(notes)
    expect(await screen.findByRole('dialog', { name: 'Utility Tray' })).toBeTruthy()
    expect(await screen.findByRole('region', { name: 'Notes' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Tasks' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Notes' }).some((button) => button.getAttribute('aria-pressed') === 'true')).toBe(true)
    expect(canvasItem('notes').dataset.canvasKind).toBe('canvas')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Close utility tray' })))
    expect(screen.queryByRole('dialog', { name: 'Utility Tray' })).toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(gear)
  })

  it('keeps the exact stored Canvas layout when the temporary semantic Arrange session is cancelled', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(canvasItem('weather').dataset.canvasSize).toBe(before)
    expect(await storage.get('layout')).toEqual(stored)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(canvasItem('weather').dataset.canvasSize).toBe(before)
    expect(await storage.get('layout')).toEqual(stored)
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
    expect(document.documentElement.dataset.stageProfile).toBe('standard')
    expect(screen.getByRole('region', { name: 'Canvas' }).getAttribute('data-canvas-profile')).toBe('standard')
  })
})
