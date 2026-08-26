// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WIDGET_REGISTRY_BY_ID } from '../widgetRegistry'
import CanvasItem from './CanvasItem'

function rect(left: number, top: number, width: number, height: number): DOMRectReadOnly {
  return {
    left, top, width, height,
    right: left + width, bottom: top + height,
    x: left, y: top,
    toJSON: () => ({}),
  } as DOMRectReadOnly
}

describe('CanvasItem', () => {
  afterEach(cleanup)

  it('positions an anchored item by percent, content-tight, with no retired emissions', () => {
    render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.clock}
        item={{ id: 'clock', mode: 'anchored', leftPct: 50, topPct: 20, tier: 'full', layer: 7 }}
      >
        <button type="button">Clock content</button>
      </CanvasItem>,
    )

    const item = screen.getByTestId('canvas-item-clock')
    expect(item.dataset.canvasSize).toBe('full')
    expect(item.dataset.canvasMode).toBe('anchored')
    expect(item.dataset.stageVariant).toBeUndefined()
    expect(item.dataset.arrangeLongPressControls).toBeUndefined()
    expect(item.classList.contains('board-item')).toBe(false)
    expect(item.classList.contains('canvas-item')).toBe(true)
    expect(item.style.left).toBe('50%')
    expect(item.style.top).toBe('20%')
    // Centred on its point, plus the NL-P6 F6 edge-safety offset — zero
    // here because nothing escapes the surface (jsdom reports no layout, so
    // the clamp is a documented no-op rather than a jump).
    expect(item.style.transform).toBe('translate(calc(-50% + 0px), calc(-50% + 0px))')
    expect(item.style.zIndex).toBe('7')
    expect(item.style.width).toBe('')
    expect(item.style.minHeight).toBe('')
    expect(screen.getByRole('button', { name: 'Clock content' })).toBeTruthy()
  })

  it('renders docked and stacked items as flow content', () => {
    const { rerender } = render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.github}
        item={{ id: 'github', mode: 'docked', dock: 'bottom', order: 0, xPct: 50 }}
      >
        <span>GitHub content</span>
      </CanvasItem>,
    )
    let item = screen.getByTestId('canvas-item-github')
    expect(item.dataset.canvasMode).toBe('docked')
    expect(item.dataset.canvasSize).toBe('compact')
    expect(item.style.position).toBe('relative')

    rerender(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.github}
        item={{ id: 'github', mode: 'stacked', order: 2, tier: 'standard' }}
      >
        <span>GitHub content</span>
      </CanvasItem>,
    )
    item = screen.getByTestId('canvas-item-github')
    expect(item.dataset.canvasMode).toBe('stacked')
    expect(item.dataset.canvasSize).toBe('standard')
    expect(item.style.position).toBe('relative')
  })

  it('uses exact two-axis positioning only when dock y is explicit', () => {
    const { rerender } = render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.github}
        item={{ id: 'github', mode: 'docked', dock: 'top', order: 0, xPct: 27 }}
      >
        <span>GitHub content</span>
      </CanvasItem>,
    )
    const item = screen.getByTestId('canvas-item-github')
    expect(item.dataset.dockPositioning).toBe('legacy')
    expect(item.style.marginLeft).toBe('calc(27% + 0.92px)')
    expect(item.style.top).toBe('')

    rerender(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.github}
        item={{ id: 'github', mode: 'docked', dock: 'top', order: 0, xPct: 27, yPct: 73 }}
      >
        <span>GitHub content</span>
      </CanvasItem>,
    )
    expect(item.dataset.dockPositioning).toBe('explicit')
    expect(item.style.left).toBe('27%')
    expect(item.style.top).toBe('73%')
    expect(item.style.marginLeft).toBe('')
    expect(item.style.transform).toBe('translate(calc(-50% + 0px), calc(-50% + 0px))')
  })

  it('visually clamps an explicit dock member inside its live lane without changing the stored point', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.canvasMode === 'docked' ? this.parentElement : null
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === 'dock-lane') return rect(0, 0, 300, 100)
      if (this.dataset.canvasMode === 'docked') return rect(-50, -20, 100, 40)
      return rect(0, 0, 0, 0)
    })

    render(
      <div data-testid="dock-lane">
        <CanvasItem
          entry={WIDGET_REGISTRY_BY_ID.github}
          item={{ id: 'github', mode: 'docked', dock: 'top', order: 0, xPct: 0, yPct: 0 }}
        >
          <span>GitHub content</span>
        </CanvasItem>
      </div>,
    )

    const item = screen.getByTestId('canvas-item-github')
    await waitFor(() => {
      expect(item.style.transform).toBe('translate(calc(-50% + 50px), calc(-50% + 20px))')
    })
    expect(item.style.left).toBe('0%')
    expect(item.style.top).toBe('0%')
  })

  it('visually clamps a legacy dock member on the inline axis while preserving its exact row baseline', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.canvasMode === 'docked' ? this.parentElement : null
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === 'dock-lane') return rect(5, 5, 590, 78)
      if (this.dataset.canvasMode === 'docked') return rect(4, 21, 147, 38)
      return rect(0, 0, 0, 0)
    })

    render(
      <div data-testid="dock-lane">
        <CanvasItem
          entry={WIDGET_REGISTRY_BY_ID.clock}
          item={{ id: 'clock', mode: 'docked', dock: 'top', order: 0, xPct: 12 }}
        >
          <span>Clock content</span>
        </CanvasItem>
      </div>,
    )

    const item = screen.getByTestId('canvas-item-clock')
    await waitFor(() => {
      expect(item.style.transform).toBe('translateX(calc(-50% + 1px))')
    })
    expect(item.style.top).toBe('')
    expect(item.style.marginTop).toBe('')
  })

  it('keeps normal dock content live and makes only the interior inert during editing', () => {
    const onGripPointerDown = vi.fn()
    const { rerender } = render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.github}
        item={{ id: 'github', mode: 'docked', dock: 'bottom', order: 0, xPct: 50, yPct: 50 }}
        chrome="normal"
        onGripPointerDown={onGripPointerDown}
      >
        <button type="button">Open GitHub</button>
      </CanvasItem>,
    )
    const item = screen.getByTestId('canvas-item-github')
    const interior = screen.getByRole('button', { name: 'Open GitHub' })
    expect(interior.hasAttribute('inert')).toBe(false)
    expect(screen.getByRole('button', { name: 'Move GitHub' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'GitHub settings' })).toBeTruthy()

    rerender(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.github}
        item={{ id: 'github', mode: 'docked', dock: 'bottom', order: 0, xPct: 50, yPct: 50 }}
        chrome="editing"
        onGripPointerDown={onGripPointerDown}
      >
        <button type="button">Open GitHub</button>
      </CanvasItem>,
    )
    expect(interior.hasAttribute('inert')).toBe(true)
    fireEvent.pointerDown(item)
    expect(onGripPointerDown).toHaveBeenCalledWith('github', expect.anything())
  })

  it('renders hover chrome (grip + gear) only in normal chrome mode and forwards events', () => {
    const onGearClick = vi.fn()
    const onGripPointerDown = vi.fn()
    const { rerender } = render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.clock}
        item={{ id: 'clock', mode: 'anchored', leftPct: 50, topPct: 20, tier: 'full', layer: 0 }}
        chrome="normal"
        onGearClick={onGearClick}
        onGripPointerDown={onGripPointerDown}
      >
        <span>Clock content</span>
      </CanvasItem>,
    )
    const grip = screen.getByRole('button', { name: 'Move Clock' })
    fireEvent.pointerDown(grip)
    expect(onGripPointerDown).toHaveBeenCalledWith('clock', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Clock settings' }))
    expect(onGearClick).toHaveBeenCalledWith('clock')

    rerender(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.clock}
        item={{ id: 'clock', mode: 'anchored', leftPct: 50, topPct: 20, tier: 'full', layer: 0 }}
      >
        <span>Clock content</span>
      </CanvasItem>,
    )
    expect(screen.queryByRole('button', { name: 'Move Clock' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clock settings' })).toBeNull()
  })

  it('publishes a stable stack object identity while keeping facing-widget settings', () => {
    const onObjectGeometryChange = vi.fn()
    render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.weather}
        item={{
          id: 'weather',
          mode: 'anchored',
          leftPct: 80,
          topPct: 20,
          tier: 'standard',
          layer: 4,
          stack: { id: 'stack-day', members: ['weather', 'clock', 'notes'], facing: 'weather' },
        }}
        objectId="stack:stack-day"
        movementLabel="Weather +2"
        chrome="normal"
        onObjectGeometryChange={onObjectGeometryChange}
      >
        <span>Stack content</span>
      </CanvasItem>,
    )

    const item = screen.getByTestId('canvas-item-stack:stack-day')
    expect(item.dataset.canvasObjectId).toBe('stack:stack-day')
    expect(item.dataset.blockId).toBe('weather')
    expect(screen.getByRole('button', { name: 'Move Weather +2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Weather settings' })).toBeTruthy()
    expect(onObjectGeometryChange).toHaveBeenCalledWith('stack:stack-day', expect.any(Object))
  })

  // NL-P6 finding F7: an enabled-but-unconfigured widget (World clocks with
  // no clocks, Countdown with no countdowns, Habits with no habits) renders
  // null by the no-husk law — but the WRAPPER still painted, leaving an
  // invisible ghost that was selectable, draggable, chrome-bearing, and
  // counted in overlap warnings.
  it('marks a widget that rendered NOTHING as empty and gives it no chrome', async () => {
    render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.worldClocks}
        item={{ id: 'worldClocks', mode: 'anchored', leftPct: 50, topPct: 50, tier: 'compact', layer: 0 }}
        chrome="normal"
      >
        {null}
      </CanvasItem>,
    )
    const item = screen.getByTestId('canvas-item-worldClocks')
    await waitFor(() => {
      expect(item.hasAttribute('data-canvas-empty')).toBe(true)
    })
    expect(screen.queryByRole('button', { name: 'Move World clocks' })).toBeNull()
  })

  it('an empty widget is not selectable or draggable in an edit session', () => {
    const onSelect = vi.fn()
    const onGripPointerDown = vi.fn()
    render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.worldClocks}
        item={{ id: 'worldClocks', mode: 'anchored', leftPct: 50, topPct: 50, tier: 'compact', layer: 0 }}
        chrome="editing"
        onSelect={onSelect}
        onGripPointerDown={onGripPointerDown}
      >
        {null}
      </CanvasItem>,
    )
    const item = screen.getByTestId('canvas-item-worldClocks')
    fireEvent.click(item)
    fireEvent.pointerDown(item)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onGripPointerDown).not.toHaveBeenCalled()
    expect(item.getAttribute('role')).toBeNull()
  })

  it('an empty widget publishes NO geometry, so it cannot trigger an overlap warning', () => {
    const onGeometryChange = vi.fn()
    render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.worldClocks}
        item={{ id: 'worldClocks', mode: 'anchored', leftPct: 50, topPct: 50, tier: 'compact', layer: 0 }}
        onGeometryChange={onGeometryChange}
      >
        {null}
      </CanvasItem>,
    )
    // Exact, not `expect.any(Object)` — that matcher also matches null in
    // Vitest, so it could never have caught a real rect leaking through.
    expect(onGeometryChange).toHaveBeenCalledWith('worldClocks', null)
    expect(onGeometryChange.mock.calls.every(([, rect]) => rect === null)).toBe(true)
  })

  it('a widget WITH content keeps its chrome, selection, and geometry', () => {
    const onSelect = vi.fn()
    render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.clock}
        item={{ id: 'clock', mode: 'anchored', leftPct: 50, topPct: 50, tier: 'compact', layer: 0 }}
        chrome="editing"
        onSelect={onSelect}
      >
        <span>Clock content</span>
      </CanvasItem>,
    )
    const item = screen.getByTestId('canvas-item-clock')
    expect(item.hasAttribute('data-canvas-empty')).toBe(false)
    fireEvent.click(item)
    expect(onSelect).toHaveBeenCalledWith('clock')
  })

  it('publishes and withdraws geometry through onGeometryChange', () => {
    const onGeometryChange = vi.fn()
    const { unmount } = render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.clock}
        item={{ id: 'clock', mode: 'anchored', leftPct: 50, topPct: 50, tier: 'compact', layer: 0 }}
        onGeometryChange={onGeometryChange}
      >
        <span>Clock content</span>
      </CanvasItem>,
    )
    expect(onGeometryChange).toHaveBeenCalledWith('clock', expect.any(Object))
    unmount()
    expect(onGeometryChange).toHaveBeenLastCalledWith('clock', null)
  })
})
