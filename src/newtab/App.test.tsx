// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageProvider } from '../lib/storage/context'
import { memoryDriver } from '../lib/storage/driver'
import { createStorage } from '../lib/storage/index'
import { defaults } from '../lib/storage/schema'
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

describe('App — Adaptive Stage composition', () => {
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

  it('owns the semantic root and keeps all four named zones structurally present', async () => {
    await renderApp()
    expect(document.querySelector('main[data-adaptive-stage]')).toBeTruthy()
    for (const name of ['Day', 'Now', 'Work Pulse', 'Signal Dock']) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
  })

  it('opens a modeless Utility Tray without making the Standard dashboard inert', async () => {
    await renderApp()
    const invoker = screen.getByRole('button', { name: 'Open utility tray' })
    const dashboard = invoker.closest('.contents')

    fireEvent.click(invoker)

    const tray = screen.getByRole('dialog', { name: 'Utility Tray' })
    expect(tray.getAttribute('data-utility-tray-mode')).toBe('modeless')
    expect(tray.getAttribute('aria-modal')).toBeNull()
    expect(dashboard?.hasAttribute('inert')).toBe(false)
  })

  it('derives a modal Compact Utility Tray, inerts only the dashboard, and restores its invoker', async () => {
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

  it('shows render-only date context only when Day has no semantic allocation', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const settings = defaults().settings
    const widgetsOff = Object.fromEntries(
      Object.keys(settings.widgets).map((key) => [key, false]),
    ) as unknown as typeof settings.widgets
    await storage.set('settings', {
      ...settings,
      widgets: widgetsOff,
    })
    await storage.set('connectors', {})
    await renderApp(storage)

    const day = screen.getByRole('region', { name: 'Day' })
    expect(day.querySelector('[data-day-context]')).toBeTruthy()
    expect(day.querySelectorAll(':scope > [data-block-id]')).toHaveLength(0)
    expect(document.querySelector('[data-block-id="day-context"]')).toBeNull()

    await act(async () => {
      await storage.set('settings', { ...settings, widgets: { ...widgetsOff, weather: true } })
    })
    expect(day.querySelector('[data-day-context]')).toBeNull()
    expect(day.querySelectorAll(':scope > [data-block-id]')).toHaveLength(1)
  })

  it('keeps the source-default Now hierarchy in semantic order', async () => {
    await renderApp()
    const nowIds = [...screen.getByRole('region', { name: 'Now' }).querySelectorAll<HTMLElement>(':scope > [data-block-id]')]
      .map((node) => node.dataset.blockId)
    expect(nowIds).toEqual(['clock', 'greeting', 'search', 'focus', 'links'])
    expect(document.querySelectorAll('[data-aurora-briefing]')).toHaveLength(1)
    expect(document.querySelector('[data-aurora-briefing]')?.closest('[data-block-id]')?.getAttribute('data-block-id')).toBe('greeting')
  })

  it('consolidates adjacent Quick Links and Bookmarks without duplicating either allocation', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const settings = defaults().settings
    await storage.set('settings', {
      ...settings,
      layoutDensity: 'balanced',
      widgets: { ...settings.widgets, links: true, bookmarks: true, habits: false },
    })
    await storage.set('layout', {
      version: 2,
      profiles: { standard: {
        links: { zone: 'now', order: 6, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'automatic' },
        bookmarks: { zone: 'now', order: 7, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'automatic' },
      } },
    })
    await renderApp(storage)

    const shelf = screen.getByRole('group', { name: 'Launchers' })
    expect(shelf.closest('[data-stage-zone="now"]')).toBeTruthy()
    expect(shelf.querySelectorAll('[data-block-id="links"]')).toHaveLength(1)
    expect(shelf.querySelectorAll('[data-block-id="bookmarks"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-block-id="links"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-block-id="bookmarks"]')).toHaveLength(1)
  })

  it('renders each active registry ID exactly once on the board or in the Dock', async () => {
    await renderApp()
    for (const id of ['clock', 'greeting', 'focus', 'weather', 'search', 'links', 'tasks', 'notes']) {
      expect(document.querySelectorAll(`[data-block-id="${id}"]`)).toHaveLength(1)
    }
    expect(document.querySelector('[data-block-id="clock"]')?.getAttribute('data-stage-zone')).toBe('now')
    expect(document.querySelector('[data-block-id="notes"]')?.getAttribute('data-stage-zone')).toBe('dock')
  })

  it('publishes finite Dock geometry with inline container ownership and explicit sizing', async () => {
    await renderApp()
    const dock = screen.getByRole('region', { name: 'Signal Dock' })
    const dockItems = [...dock.querySelectorAll<HTMLElement>(':scope > [data-block-id]')]
    const plannedTracks = dockItems.reduce(
      (total, item) => total + Number(item.style.getPropertyValue('--board-col-span')),
      0,
    )
    expect(dock.style.getPropertyValue('--stage-dock-track-count')).toBe(String(plannedTracks))
    const notes = document.querySelector<HTMLElement>('[data-block-id="notes"]')!
    expect(notes.style.getPropertyValue('--board-col-span')).toBe('1')
    expect(notes.style.getPropertyValue('--board-row-span')).toBe('1')
    expect(notes.style.containerType).toBe('inline-size')
    expect(notes.style.inlineSize).toBe('var(--stage-track-min)')
  })

  it('publishes zero explicit Dock tracks when no allocation belongs to the Dock', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const settings = defaults().settings
    await storage.set('settings', {
      ...settings,
      widgets: { ...settings.widgets, notes: false, todo: false, timer: false },
    })
    await renderApp(storage)
    const dock = screen.getByRole('region', { name: 'Signal Dock' })
    expect(dock.querySelectorAll(':scope > [data-block-id]')).toHaveLength(0)
    expect(dock.style.getPropertyValue('--stage-dock-track-count')).toBe('0')
  })

  it('replans in the same update when widget settings change', async () => {
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

  it('replans one mounted Stage for connector availability, active-profile layout, and density changes', async () => {
    const storage = await renderApp()

    expect(document.querySelector('[data-block-id="rss"]')).toBeNull()
    await act(async () => {
      await storage.set('connectors', { rss: { enabled: true, feeds: [], shownCount: 5 } })
    })
    expect(document.querySelectorAll('[data-block-id="rss"]')).toHaveLength(1)

    await act(async () => {
      await storage.set('layout', {
        version: 2,
        profiles: { standard: { focus: {
          zone: 'day', order: 99, colSpan: 1, rowSpan: 1,
          variant: 'compact', priority: 'pinned',
        } } },
      })
    })
    expect(document.querySelector('[data-block-id="focus"]')?.getAttribute('data-stage-zone')).toBe('day')

    await act(async () => {
      await storage.set('settings', { ...defaults().settings, layoutDensity: 'compact' })
    })
    expect(document.documentElement.dataset.stageDensity).toBe('compact')
    expect(document.documentElement.style.getPropertyValue('--stage-gap')).toBe('12px')
  })

  it('waits through transient raw settings and layout shapes, then recovers on the same mount', async () => {
    const driver = memoryDriver()
    const storage = createStorage(driver)
    await renderApp(storage)
    expect(document.querySelector('main[data-adaptive-stage]')).toBeTruthy()

    await act(async () => {
      await driver.write({ settings: { layoutDensity: 'auto' } })
    })
    expect(document.querySelector('main[data-adaptive-stage]')).toBeNull()

    await act(async () => {
      await driver.write({ settings: defaults().settings, layout: { version: 2 } })
    })
    expect(document.querySelector('main[data-adaptive-stage]')).toBeNull()

    await act(async () => {
      await driver.write({ layout: emptyLayoutV2() })
    })
    expect(document.querySelector('main[data-adaptive-stage]')).toBeTruthy()
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

  it('gives a Docked connector one operable entry and removes the wrapper when it returns to Work Pulse', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { github: { enabled: true, username: '' } })
    await storage.set('layout', {
      version: 2,
      profiles: { standard: { github: {
        zone: 'dock', order: 3, colSpan: 1, rowSpan: 1,
        variant: 'compact', priority: 'dock',
      } } },
    })
    await renderApp(storage)

    expect(document.querySelectorAll('[data-block-id="github"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-signal-dock-entry]')).toHaveLength(1)
    expect(document.querySelector('[data-block-id="notes"] [data-signal-dock-entry]')).toBeNull()
    const open = screen.getByRole('button', { name: 'Open GitHub details' })
    fireEvent.click(open)
    expect(open.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(document.querySelector('[data-signal-dock-content]') as HTMLElement, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Open GitHub details' })).toBe(document.activeElement)

    await act(async () => {
      await storage.set('layout', {
        version: 2,
        profiles: { standard: { github: {
          zone: 'pulse', order: 1, colSpan: 1, rowSpan: 1,
          variant: 'compact', priority: 'automatic',
        } } },
      })
    })
    expect(document.querySelectorAll('[data-block-id="github"]')).toHaveLength(1)
    expect(document.querySelector('[data-block-id="github"]')?.getAttribute('data-stage-zone')).toBe('pulse')
    expect(document.querySelector('[data-signal-dock-entry]')).toBeNull()
  })

  it('uses only the active-profile override and ignores legacy for committed rendering', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('layout', {
      version: 2,
      profiles: { standard: { focus: { zone: 'day', order: 99, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' } } },
      legacy: { focus: { x: -10_000, y: 10_000 } },
    })
    await renderApp(storage)
    const focus = document.querySelector<HTMLElement>('[data-block-id="focus"]')!
    expect(focus.dataset.stageZone).toBe('day')
    expect(focus.style.position).toBe('')
    expect(focus.style.left).toBe('')
    expect(focus.style.top).toBe('')
    const semanticStyle = focus.style.cssText

    await act(async () => {
      await storage.set('layout', {
        version: 2,
        profiles: { standard: { focus: { zone: 'day', order: 99, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' } } },
      })
    })
    expect(focus.dataset.stageZone).toBe('day')
    expect(focus.style.cssText).toBe(semanticStyle)
  })

  it('preserves a migrated pinned Clock override while canonical Now protection stays separate', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', { ...defaults().settings, layoutDensity: 'compact' })
    await storage.set('layout', {
      version: 2,
      profiles: { standard: { clock: {
        zone: 'day', order: 0, colSpan: 1, rowSpan: 1,
        variant: 'compact', priority: 'pinned',
      } } },
      legacy: { clock: { x: 25, y: 50 } },
    })
    await renderApp(storage)
    const clock = document.querySelector<HTMLElement>('[data-block-id="clock"]')!
    expect(clock.dataset.stageZone).toBe('day')
    expect(clock.dataset.stageVariant).toBe('compact')
    expect(clock.style.getPropertyValue('--board-col-span')).toBe('1')
    expect(clock.style.getPropertyValue('--board-row-span')).toBe('1')
  })

  it('marks explicit pinned implicit rows for Stage-owned vertical overflow', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const pinned = Object.fromEntries(['clock', 'greeting', 'focus'].map((id, order) => [id, {
      zone: 'now', order, colSpan: 4, rowSpan: 4,
      variant: id === 'clock' ? 'expanded' : 'standard', priority: 'pinned',
    }]))
    await storage.set('settings', { ...defaults().settings, layoutDensity: 'compact' })
    await storage.set('layout', { version: 2, profiles: { standard: pinned } })
    await renderApp(storage)
    expect(document.querySelector('main[data-adaptive-stage]')?.getAttribute('data-stage-pinned-overflow')).toBe('true')
  })

  it('replans across viewport profile changes without duplicating active IDs', async () => {
    await renderApp()
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frame = callback; return 1 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    await act(async () => {
      window.dispatchEvent(new Event('resize'))
      frame?.(0)
      await Promise.resolve()
    })
    expect(document.documentElement.dataset.stageProfile).toBe('compact')
    expect(document.querySelectorAll('[data-block-id="clock"]')).toHaveLength(1)
  })

  it('reveals a focused Dock control with the frozen minimum-scroll alignment', async () => {
    await renderApp()
    const notes = await screen.findByRole('button', { name: 'Notes' })
    notes.focus()
    expect(notes.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  })

  it('resolves Tab focus from the pre-keyboard Dock offset before applying nearest alignment', async () => {
    await renderApp()
    const dock = screen.getByRole('region', { name: 'Signal Dock' }) as HTMLElement
    const notes = await screen.findByRole('button', { name: 'Notes' })
    dock.scrollLeft = 37
    fireEvent.keyDown(notes, { key: 'Tab' })
    // Chromium may scroll during its native focus step before React receives
    // focus. The handler must replay nearest from the keyboard-start offset.
    dock.scrollLeft = 900
    fireEvent.focus(notes)
    expect(dock.scrollLeft).toBe(37)
    expect(notes.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  })

  it('does not move a Dock control between pointer down and click', async () => {
    await renderApp()
    const notes = await screen.findByRole('button', { name: 'Notes' })
    fireEvent.pointerDown(notes)
    notes.focus()
    expect(notes.scrollIntoView).not.toHaveBeenCalled()
    fireEvent.pointerUp(notes)
  })

  it('keeps open utility surfaces above sibling stage items', async () => {
    await renderApp()
    const notes = await screen.findByRole('button', { name: 'Notes' })
    fireEvent.click(notes)
    expect(document.querySelector('[data-block-id="notes"]')?.classList.contains('z-30')).toBe(true)
    expect(screen.getByRole('region', { name: 'Signal Dock' }).classList.contains('stage-zone--elevated')).toBe(true)
    fireEvent.click(notes)
    expect(document.querySelector('[data-block-id="notes"]')?.classList.contains('z-30')).toBe(false)
    expect(screen.getByRole('region', { name: 'Signal Dock' }).classList.contains('stage-zone--elevated')).toBe(false)
  })

  it('keeps Settings focus restoration and Arrange entry/exit behavior', async () => {
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

  it('replans from the semantic Arrange preview and restores the exact stored profile on Cancel', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const active = this.hasAttribute('data-block-id')
      return { left: 10, top: 10, right: active ? 210 : 10, bottom: active ? 110 : 10, width: active ? 200 : 0, height: active ? 100 : 0, x: 10, y: 10, toJSON: () => ({}) } as DOMRect
    })
    const storage = createStorage(memoryDriver())
    await storage.init()
    const stored = await storage.get('layout')
    await renderApp(storage)
    const weather = () => document.querySelector<HTMLElement>('[data-block-id="weather"]')!
    const before = weather().dataset.stageVariant

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Widgets' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Arrange layout' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Weather' }))
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(weather().dataset.stageVariant).toBe('compact')
    expect(await storage.get('layout')).toEqual(stored)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(weather().dataset.stageVariant).toBe(before)
    expect(await storage.get('layout')).toEqual(stored)
  })

  it('Reset layout preserves a manual density choice', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', { ...defaults().settings, layoutDensity: 'spacious' })
    await storage.set('layout', { ...emptyLayoutV2(), profiles: { standard: { focus: { zone: 'day', order: 1, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' } } } })
    await renderApp(storage)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Widgets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }))
    const dialog = screen.getByRole('dialog', { name: 'Reset layout?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset layout' }))
    await act(async () => {})
    expect((await storage.get('settings')).layoutDensity).toBe('spacious')
    expect(await storage.get('layout')).toEqual(emptyLayoutV2())
  })

  it('does not introduce a root transform or duplicate profile authority', async () => {
    await renderApp()
    const main = document.querySelector<HTMLElement>('main[data-adaptive-stage]')!
    expect(main.style.transform).toBe('')
    expect(main.dataset.stageProfile).toBeUndefined()
    expect(document.documentElement.dataset.stageProfile).toBe('standard')
  })
})
