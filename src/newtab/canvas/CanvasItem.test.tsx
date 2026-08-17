// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WIDGET_REGISTRY_BY_ID } from '../widgetRegistry'
import CanvasItem from './CanvasItem'

describe('CanvasItem', () => {
  afterEach(cleanup)

  it('publishes finite selection geometry, profile, size, and stable layer without clipping content', () => {
    render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.clock}
        profile="standard"
        placement={{ kind: 'canvas', x: 50, y: 40, size: 'full', layer: 7, left: 500, top: 320, width: 432, height: 288 }}
      >
        <button type="button">Clock content</button>
      </CanvasItem>,
    )

    const item = screen.getByTestId('canvas-item-clock')
    expect(item.dataset.canvasProfile).toBe('standard')
    expect(item.dataset.canvasSize).toBe('full')
    expect(item.dataset.stageVariant).toBe('expanded')
    expect(item.classList.contains('board-item')).toBe(true)
    expect(item.style.left).toBe('500px')
    expect(item.style.top).toBe('320px')
    expect(item.style.zIndex).toBe('7')
    expect(screen.getByRole('button', { name: 'Clock content' })).toBeTruthy()
  })

  it('activates the preserved compact presentation contract for Canvas and Bottom bar items', () => {
    const { rerender } = render(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.github}
        profile="compact"
        placement={{ kind: 'canvas', x: 50, y: 40, size: 'compact', layer: 1, left: 188, top: 200, width: 240, height: 128 }}
      >
        <span>GitHub content</span>
      </CanvasItem>,
    )
    expect(screen.getByTestId('canvas-item-github')).toMatchObject({
      dataset: expect.objectContaining({ stageVariant: 'compact' }),
    })
    expect(screen.getByTestId('canvas-item-github').classList.contains('board-item--dock')).toBe(false)

    rerender(
      <CanvasItem
        entry={WIDGET_REGISTRY_BY_ID.github}
        profile="compact"
        placement={{ kind: 'bottom-bar', order: 0, size: 'compact' }}
      >
        <span>GitHub content</span>
      </CanvasItem>,
    )
    expect(screen.getByTestId('canvas-item-github').classList.contains('board-item--dock')).toBe(true)
  })
})
