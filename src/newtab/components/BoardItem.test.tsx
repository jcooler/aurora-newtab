// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { StageAllocation } from '../../lib/layout/adaptiveStage'
import { WIDGET_REGISTRY } from '../widgetRegistry'
import BoardItem from './BoardItem'

function allocation(overrides: Partial<StageAllocation> = {}): StageAllocation {
  return {
    id: 'weather', zone: 'day', order: 0, variant: 'standard', priority: 'automatic',
    colSpan: 2, rowSpan: 2,
    rect: { colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2 },
    ...overrides,
  }
}

const weather = WIDGET_REGISTRY.find((row) => row.id === 'weather')!

describe('BoardItem', () => {
  it('owns semantic data attributes, finite CSS spans, container semantics, and child rendering', () => {
    render(
      <BoardItem entry={weather} allocation={allocation()} profile="standard">
        <button type="button">Weather action</button>
      </BoardItem>,
    )
    const item = document.querySelector('[data-block-id="weather"]') as HTMLElement
    expect(item.getAttribute('data-block-id')).toBe('weather')
    expect(item.getAttribute('data-stage-profile')).toBe('standard')
    expect(item.getAttribute('data-stage-zone')).toBe('day')
    expect(item.getAttribute('data-stage-variant')).toBe('standard')
    expect(item.getAttribute('data-stage-priority')).toBe('automatic')
    expect(item.classList.contains('board-item')).toBe(true)
    expect(item.classList.contains('board-item--day')).toBe(true)
    expect(item.style.getPropertyValue('--board-col-span')).toBe('2')
    expect(item.style.getPropertyValue('--board-row-span')).toBe('2')
    expect(item.style.containerType).toBe('inline-size')
    expect(screen.getByRole('button', { name: 'Weather action' })).toBeTruthy()
  })

  it('keeps malformed board/Dock span inputs finite without positioning, transforms, or layout containment', () => {
    const { rerender } = render(
      <BoardItem entry={weather} allocation={allocation({ zone: 'dock', colSpan: Infinity, rowSpan: NaN })} profile="compact">
        content
      </BoardItem>,
    )
    let item = document.querySelector('[data-block-id="weather"]') as HTMLElement
    expect(item.style.getPropertyValue('--board-col-span')).toBe('1')
    expect(item.style.getPropertyValue('--board-row-span')).toBe('1')

    rerender(
      <BoardItem entry={weather} allocation={allocation({ colSpan: -2.5, rowSpan: 4.8 })} profile="display">
        content
      </BoardItem>,
    )
    item = document.querySelector('[data-block-id="weather"]') as HTMLElement
    expect(item.style.getPropertyValue('--board-col-span')).toBe('1')
    expect(item.style.getPropertyValue('--board-row-span')).toBe('4')
    expect(item.style.position).toBe('')
    expect(item.style.transform).toBe('')
    expect(item.style.contain).toBe('')
  })
})
