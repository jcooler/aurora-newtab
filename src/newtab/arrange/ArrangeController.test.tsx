// @vitest-environment jsdom
import { createRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import type { StoredLayout } from '../../lib/layout/canvasTypes'
import { WIDGET_REGISTRY } from '../widgetRegistry'
import type { ArrangePreview } from './arrangePreview'
import ArrangeController from './ArrangeController'

const ENTRIES = WIDGET_REGISTRY
  .filter((entry) => ['weather', 'clock', 'focus', 'notes', 'github'].includes(entry.id))
  .map((entry) => entry.id === 'github'
    ? { ...entry, selectedContent: [
      { label: 'Contribution graph', minimumSize: 'standard' as const },
      { label: 'Pull requests', minimumSize: 'standard' as const },
    ] }
    : entry)

function rect(left: number, top: number, width = 180, height = 90): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

function Fixture({
  layout,
  onPreviewChange,
  returnFocusRef,
  viewport,
  scale,
  coordinates,
}: {
  layout: StoredLayout
  onPreviewChange: (preview: ArrangePreview | null) => void
  returnFocusRef: ReturnType<typeof createRef<HTMLButtonElement>>
  viewport: { width: number; height: number }
  scale: number
  coordinates?: { width: number; height: number }
}) {
  const [signal, setSignal] = useState(0)
  const [arranging, setArranging] = useState(false)
  return (
    <>
      <button ref={returnFocusRef} type="button" onClick={() => setSignal((value) => value + 1)}>Open editor</button>
      <div data-arrange-artboard-viewport="" data-test-artboard="">
        <div data-arrange-artboard-logical="" data-arrange-scale={scale}>
          <div data-canvas-content="" inert={arranging}>
            <div
              data-canvas-surface=""
              data-test-surface=""
              data-canvas-coordinate-width={coordinates?.width}
              data-canvas-coordinate-height={coordinates?.height}
            >
              {ENTRIES.map((entry, index) => (
                <div key={entry.id} data-block-id={entry.id} data-arrange-long-press-controls="true" data-test-index={index} tabIndex={-1}>
                  <span data-testid={`surface-${entry.id}`}>{entry.label} surface</span>
                  <button type="button">{entry.label} content</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <ArrangeController
        profile="standard"
        layout={layout}
        entries={ENTRIES}
        viewport={viewport}
        onPreviewChange={onPreviewChange}
        onModeChange={setArranging}
        returnFocusRef={returnFocusRef}
        openSignal={signal}
      />
    </>
  )
}

async function setup(
  seed: StoredLayout = { version: 3, profiles: {} },
  options: {
    surface?: DOMRect
    itemRects?: Partial<Record<string, DOMRect>>
    viewport?: { width: number; height: number }
    scale?: number
    artboard?: DOMRect
    coordinates?: { width: number; height: number }
  } = {},
) {
  const surface = options.surface ?? rect(0, 0, 1200, 800)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-test-artboard')) return options.artboard ?? surface
    if (this.hasAttribute('data-test-surface')) return surface
    const id = this.getAttribute('data-block-id')
    if (id && options.itemRects?.[id]) return options.itemRects[id]
    const index = Number(this.getAttribute('data-test-index') ?? -1)
    return index >= 0 ? rect(surface.left + 24 + index * 230, surface.top + 120 + (index % 2) * 150, 200, 100) : rect(0, 0)
  })
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('layout', seed)
  const onPreviewChange = vi.fn<(preview: ArrangePreview | null) => void>()
  const returnFocusRef = createRef<HTMLButtonElement>()
  render(
    <StorageProvider storage={storage}>
      <Fixture
        layout={seed}
        onPreviewChange={onPreviewChange}
        returnFocusRef={returnFocusRef}
        viewport={options.viewport ?? { width: 1200, height: 800 }}
        scale={options.scale ?? 1}
        coordinates={options.coordinates}
      />
    </StorageProvider>,
  )
  const open = screen.getByRole('button', { name: 'Open editor' })
  open.focus()
  fireEvent.click(open)
  await screen.findByRole('toolbar', { name: 'Arrange layout' })
  return { storage, onPreviewChange, open }
}

function latestPreview(spy: ReturnType<typeof vi.fn>): ArrangePreview | null {
  return spy.mock.calls.at(-1)?.[0] as ArrangePreview | null
}

describe('Canvas ArrangeController', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('opens from Settings with one inert real-content preview, every visible edit target, and the four real profile tabs', async () => {
    const { storage, onPreviewChange } = await setup()
    const update = vi.spyOn(storage, 'update')

    expect(document.querySelector('[data-canvas-content]')?.hasAttribute('inert')).toBe(true)
    for (const entry of ENTRIES) expect(screen.getByRole('button', { name: `Edit ${entry.label}` })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit Weather' })).toBe(document.activeElement)
    const toolbar = screen.getByRole('toolbar', { name: 'Arrange layout' })
    expect(within(toolbar).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Small', 'Desktop', 'Large', 'Wide'])
    for (const name of ['Undo', 'Reset', 'Cancel', 'Save']) expect(within(toolbar).getByRole('button', { name })).toBeTruthy()
    expect(latestPreview(onPreviewChange)?.profile).toBe('standard')
    expect(update).not.toHaveBeenCalled()
  })

  it('opens from a long press on visible widget content', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    vi.useFakeTimers()
    try {
      const launcher = screen.getByRole('button', { name: 'Clock content' })
      fireEvent.pointerDown(launcher, { pointerId: 4, clientX: 100, clientY: 100 })
      act(() => vi.advanceTimersByTime(500))
      expect(screen.getByRole('toolbar', { name: 'Arrange layout' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Edit Clock' })).toBe(document.activeElement)
      fireEvent.pointerUp(launcher, { pointerId: 4 })
      fireEvent.click(launcher)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(launcher).toBe(document.activeElement)
    } finally {
      vi.useRealTimers()
    }
  })

  it('switches actual preview profiles and previews Desktop everywhere with zero writes', async () => {
    const { storage, onPreviewChange } = await setup()
    const update = vi.spyOn(storage, 'update')
    fireEvent.click(screen.getByRole('tab', { name: 'Small' }))
    expect(latestPreview(onPreviewChange)?.profile).toBe('compact')
    expect(latestPreview(onPreviewChange)?.canvas.placements.clock).toMatchObject({ size: 'compact' })

    fireEvent.click(screen.getByRole('button', { name: 'Use Desktop layout everywhere' }))
    expect(latestPreview(onPreviewChange)?.profile).toBe('compact')
    expect(latestPreview(onPreviewChange)?.canvas.placements.clock).toMatchObject({ size: 'full' })
    expect(latestPreview(onPreviewChange)?.useDesktopLayoutEverywhere).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Large' }))
    expect(latestPreview(onPreviewChange)?.profile).toBe('display')
    expect(latestPreview(onPreviewChange)?.useDesktopLayoutEverywhere).toBe(true)
    expect(screen.getByRole('button', { name: 'Use Desktop layout everywhere' }).getAttribute('aria-pressed')).toBe('true')
    expect(update).not.toHaveBeenCalled()
  })

  it('selects every item directly and exposes only applicable inspector controls', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Notes' }))
    const inspector = screen.getByRole('complementary', { name: 'Notes inspector' })
    expect(within(inspector).getByText(/X \d/)).toBeTruthy()
    expect(within(inspector).getByText(/Y \d/)).toBeTruthy()
    expect(within(inspector).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Compact'])
    expect(within(inspector).getByRole('checkbox', { name: 'Visible' })).toBeTruthy()
    expect(within(inspector).getByRole('button', { name: 'Restore default position' })).toBeTruthy()
    expect(within(inspector).getByRole('button', { name: 'Restore default size' })).toBeTruthy()
    expect(within(inspector).getByRole('button', { name: 'Move to Bottom bar' })).toBeTruthy()
    expect(within(inspector).queryByRole('button', { name: 'Bring forward' })).toBeNull()
  })

  it('explains selected connector content that cannot fit the currently chosen Canvas size', async () => {
    await setup({ version: 3, profiles: { standard: { mode: 'custom', placements: {
      github: { kind: 'canvas', x: 80, y: 40, size: 'compact', layer: 0 },
    } } } })
    fireEvent.click(screen.getByRole('button', { name: 'Edit GitHub' }))
    expect(screen.getByText('Contribution graph and Pull requests need Standard or Full.')).toBeTruthy()
  })

  it('previews visibility in the undoable draft and atomically disables the widget only on Save', async () => {
    const { storage, onPreviewChange } = await setup()
    const update = vi.spyOn(storage, 'update')
    const updateMany = vi.spyOn(storage, 'updateMany')
    const inspector = screen.getByRole('complementary', { name: 'Weather inspector' })
    const visible = within(inspector).getByRole('checkbox', { name: 'Visible' })

    fireEvent.click(visible)
    expect(latestPreview(onPreviewChange)?.hiddenIds).toEqual(['weather'])
    expect(update).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latestPreview(onPreviewChange)?.hiddenIds).toEqual([])
    fireEvent.click(visible)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(async () => {})

    expect(update).not.toHaveBeenCalled()
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect((await storage.get('settings')).widgets.weather).toBe(false)
    expect(await storage.get('layout')).toMatchObject({ version: 3 })
  })

  it('captures pointer drag, keeps the real content mounted, publishes live draft movement, and clears guides', async () => {
    const { storage, onPreviewChange } = await setup()
    const update = vi.spyOn(storage, 'update')
    const target = screen.getByRole('button', { name: 'Edit Weather' })
    const before = latestPreview(onPreviewChange)?.canvas.placements.weather

    fireEvent.pointerDown(target, { pointerId: 7, clientX: 80, clientY: 150 })
    expect(target.setPointerCapture).toHaveBeenCalledWith(7)
    fireEvent.pointerMove(target, { pointerId: 7, clientX: 510, clientY: 400 })
    expect(latestPreview(onPreviewChange)?.canvas.placements.weather).not.toEqual(before)
    expect(screen.getByRole('button', { name: 'Weather content' })).toBeTruthy()
    fireEvent.pointerUp(target, { pointerId: 7, clientX: 510, clientY: 400 })
    expect(document.querySelectorAll('[data-canvas-guide]')).toHaveLength(0)
    expect(update).not.toHaveBeenCalled()
  })

  it('clips edit targets to the visible scrollable artboard and omits fully off-screen items', async () => {
    await setup({ version: 3, profiles: {} }, {
      surface: rect(100, 56, 390, 1200),
      artboard: rect(100, 56, 390, 400),
      itemRects: {
        weather: rect(124, 430, 200, 100),
        clock: rect(124, 600, 200, 100),
      },
    })

    const partial = screen.getByRole('button', { name: 'Edit Weather' })
    expect(partial.style.top).toBe('430px')
    expect(partial.style.height).toBe('26px')
    expect(screen.queryByRole('button', { name: 'Edit Clock' })).toBeNull()
  })

  it('converts offset Canvas pointer, neighbors, and guides into one local coordinate space', async () => {
    const surface = rect(100, 56, 1200, 800)
    const { onPreviewChange } = await setup({ version: 3, profiles: {} }, { surface })
    const target = screen.getByRole('button', { name: 'Edit Weather' })

    fireEvent.pointerDown(target, { pointerId: 9, clientX: 174, clientY: 206 })
    fireEvent.pointerMove(target, { pointerId: 9, clientX: 650, clientY: 456 })

    expect(latestPreview(onPreviewChange)?.canvas.placements.weather).toMatchObject({ x: 50, y: 52.5 })
    expect(document.querySelector<HTMLElement>('[data-canvas-guide="canvas-center"]')?.style.left).toBe('700px')
  })

  it('converts a uniformly scaled artboard drag and guide back through logical Canvas coordinates', async () => {
    const surface = rect(100, 56, 720, 450)
    const { onPreviewChange } = await setup(
      { version: 3, profiles: {} },
      { surface, scale: 0.5, itemRects: { weather: rect(112, 116, 100, 50) } },
    )
    const target = screen.getByRole('button', { name: 'Edit Weather' })

    fireEvent.pointerDown(target, { pointerId: 11, clientX: 137, clientY: 131 })
    fireEvent.pointerMove(target, { pointerId: 11, clientX: 435, clientY: 282.25 })

    expect(latestPreview(onPreviewChange)?.canvas.placements.weather).toMatchObject({ x: 50, y: 52.666666666666664 })
    expect(document.querySelector<HTMLElement>('[data-canvas-guide="canvas-center"]')?.style.left).toBe('460px')
  })

  it('persists Small pointer movement against its stable coordinate plane instead of its shorter scroll extent', async () => {
    const surface = rect(100, 56, 390, 1000)
    const { onPreviewChange } = await setup(
      { version: 3, profiles: {} },
      {
        surface,
        artboard: rect(100, 56, 390, 844),
        coordinates: { width: 390, height: 3200 },
        itemRects: { weather: rect(124, 120, 200, 100) },
      },
    )
    const target = screen.getByRole('button', { name: 'Edit Weather' })

    fireEvent.pointerDown(target, { pointerId: 13, clientX: 174, clientY: 150 })
    fireEvent.pointerMove(target, { pointerId: 13, clientX: 245, clientY: 436 })

    const placement = latestPreview(onPreviewChange)?.canvas.placements.weather
    expect(placement).toMatchObject({ kind: 'canvas', x: 50 })
    expect(placement?.kind === 'canvas' ? placement.y : Number.NaN).toBeCloseTo(12.5625)
  })

  it('moves by 8px or 1px from the keyboard and announces movement and overlap', async () => {
    const seed: StoredLayout = {
      version: 3,
      profiles: { standard: { mode: 'custom', placements: {
        clock: { kind: 'canvas', x: 50, y: 40, size: 'full', layer: 0 },
        focus: { kind: 'canvas', x: 50, y: 40, size: 'standard', layer: 1 },
      } } },
    }
    const { onPreviewChange } = await setup(seed)
    const target = screen.getByRole('button', { name: 'Edit Clock' })
    fireEvent.keyDown(target, { key: 'ArrowRight' })
    expect((latestPreview(onPreviewChange)?.canvas.placements.clock as { x: number }).x).toBeCloseTo(50 + 8 / 1200 * 100)
    fireEvent.keyDown(target, { key: 'ArrowDown', shiftKey: true })
    expect(latestPreview(onPreviewChange)?.canvas.placements.clock).toMatchObject({ y: 40 + 1 / 800 * 100 })
    expect(screen.getByRole('status').textContent).toMatch(/Clock moved.*overlaps Focus/i)
    const inspector = screen.getByRole('complementary', { name: 'Clock inspector' })
    expect(within(inspector).getByRole('button', { name: 'Bring forward' })).toBeTruthy()
    expect(within(inspector).getByRole('button', { name: 'Send backward' })).toBeTruthy()
  })

  it('keeps keyboard movement inside the 8px Canvas safe margin', async () => {
    const seed: StoredLayout = {
      version: 3,
      profiles: { standard: { mode: 'custom', placements: {
        clock: { kind: 'canvas', x: 91, y: 40, size: 'full', layer: 0 },
      } } },
    }
    const { onPreviewChange } = await setup(seed, { itemRects: { clock: rect(992, 320, 200, 100) } })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Clock' }), { key: 'ArrowRight' })
    expect(latestPreview(onPreviewChange)?.canvas.placements.clock).toMatchObject({ x: 91, y: 40 })
  })

  it('uses Escape to cancel an active move before cancelling the whole session', async () => {
    const { storage, onPreviewChange } = await setup()
    const update = vi.spyOn(storage, 'update')
    const target = screen.getByRole('button', { name: 'Edit Weather' })
    const before = latestPreview(onPreviewChange)?.canvas.placements.weather
    fireEvent.pointerDown(target, { pointerId: 3, clientX: 80, clientY: 150 })
    fireEvent.pointerMove(target, { pointerId: 3, clientX: 600, clientY: 500 })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('toolbar', { name: 'Arrange layout' })).toBeTruthy()
    expect(latestPreview(onPreviewChange)?.canvas.placements.weather).toEqual(before)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('toolbar', { name: 'Arrange layout' })).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('Cancel restores the exact stored value and the invoking focus', async () => {
    const seed: StoredLayout = { clock: { x: 33, y: 44 } }
    const { storage, onPreviewChange, open } = await setup(seed)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Clock' }), { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await storage.get('layout')).toEqual(seed)
    expect(latestPreview(onPreviewChange)).toBeNull()
    expect(document.activeElement).toBe(open)
    expect(screen.getByRole('status').textContent).toBe('Layout changes cancelled.')
  })

  it('performs one atomic successful Save, writes V3 recovery, and re-enters from the saved profile', async () => {
    const seed: StoredLayout = { version: 2, profiles: {} }
    const { storage } = await setup(seed)
    const update = vi.spyOn(storage, 'update')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Clock' }), { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(async () => {})

    expect(update).toHaveBeenCalledTimes(1)
    const saved = await storage.get('layout')
    expect(saved).toMatchObject({ version: 3, recovery: { semanticV2: seed } })
    expect(screen.queryByRole('toolbar', { name: 'Arrange layout' })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Layout saved.')
  })

  it('keeps a failed Save open with a sanitized alert and the complete draft', async () => {
    const { storage, onPreviewChange } = await setup()
    const before = latestPreview(onPreviewChange)?.canvas.placements.clock
    vi.spyOn(storage, 'update').mockRejectedValueOnce(new Error('secret-token capability://private'))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Clock' }), { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByRole('alert')

    expect(alert.textContent).toBe('Layout could not be saved. Review your changes and try again.')
    expect(document.body.textContent).not.toContain('secret-token')
    expect(latestPreview(onPreviewChange)?.canvas.placements.clock).not.toEqual(before)
    expect(screen.getByRole('toolbar', { name: 'Arrange layout' })).toBeTruthy()
  })

  it('uses physical viewport width for a dismissible inspector sheet and keeps every logical preview visible', async () => {
    const { onPreviewChange } = await setup({ version: 3, profiles: {} }, { viewport: { width: 1099, height: 800 } })
    const inspector = screen.getByRole('complementary', { name: 'Weather inspector' })
    expect(inspector.getAttribute('data-arrange-inspector-mode')).toBe('sheet')
    for (const name of ['Small', 'Desktop', 'Large', 'Wide']) {
      fireEvent.click(screen.getByRole('tab', { name }))
      expect(latestPreview(onPreviewChange)?.viewportMode).toBe('sheet')
      expect(screen.getByRole('complementary').getAttribute('data-arrange-inspector-mode')).toBe('sheet')
    }
    fireEvent.click(within(inspector).getByRole('button', { name: 'Close inspector' }))
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(latestPreview(onPreviewChange)?.inspectorOpen).toBe(false)
  })

  it('uses a bounded side inspector at 1100px for every logical profile', async () => {
    const { onPreviewChange } = await setup({ version: 3, profiles: {} }, { viewport: { width: 1100, height: 800 } })
    for (const name of ['Small', 'Desktop', 'Large', 'Wide']) {
      fireEvent.click(screen.getByRole('tab', { name }))
      expect(latestPreview(onPreviewChange)?.viewportMode).toBe('side')
      expect(screen.getByRole('complementary').getAttribute('data-arrange-inspector-mode')).toBe('side')
    }
  })
})
