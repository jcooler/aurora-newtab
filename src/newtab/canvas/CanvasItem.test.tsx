// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WIDGET_REGISTRY_BY_ID } from '../widgetRegistry'
import CanvasItem from './CanvasItem'

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
