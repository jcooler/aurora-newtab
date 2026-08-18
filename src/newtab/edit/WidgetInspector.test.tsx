// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WIDGET_REGISTRY_BY_ID } from '../widgetRegistry'
import WidgetInspector from './WidgetInspector'

function rect(left: number, top: number, width: number, height: number): DOMRectReadOnly {
  return {
    left, top, width, height,
    right: left + width, bottom: top + height,
    x: left, y: top,
    toJSON: () => ({}),
  } as DOMRectReadOnly
}

describe('WidgetInspector', () => {
  afterEach(cleanup)

  it('offers tier radios only for declared sizes and fires all four callbacks', () => {
    const onTier = vi.fn()
    const onLayer = vi.fn()
    const onHide = vi.fn()
    const onRestore = vi.fn()
    render(
      <WidgetInspector
        entry={WIDGET_REGISTRY_BY_ID.weather}
        placement={{ kind: 'free', anchor: 'top-right', offsetX: -7, offsetY: 13, tier: 'standard', layer: 1 }}
        anchorRect={rect(900, 60, 300, 180)}
        overlapLabels={[]}
        onTier={onTier}
        onLayer={onLayer}
        onHide={onHide}
        onRestore={onRestore}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Weather inspector' })
    const radios = within(dialog).getAllByRole('radio')
    expect(radios.map((radio) => radio.textContent)).toEqual(['Compact', 'Standard', 'Full'])
    expect(within(dialog).getByRole('radio', { name: 'Standard' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Full' }))
    expect(onTier).toHaveBeenCalledWith('full')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bring forward' }))
    expect(onLayer).toHaveBeenCalledWith('forward')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hide' }))
    expect(onHide).toHaveBeenCalledOnce()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore defaults' }))
    expect(onRestore).toHaveBeenCalledOnce()
  })

  it('shows the passive overlap note only when overlaps exist (spec 2.2)', () => {
    const props = {
      entry: WIDGET_REGISTRY_BY_ID.clock,
      placement: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'full', layer: 0 } as const,
      anchorRect: rect(500, 200, 400, 200),
      onTier: vi.fn(),
      onLayer: vi.fn(),
      onHide: vi.fn(),
      onRestore: vi.fn(),
    }
    const { rerender } = render(<WidgetInspector {...props} overlapLabels={[]} />)
    expect(screen.queryByText(/Overlaps/)).toBeNull()

    rerender(<WidgetInspector {...props} overlapLabels={['Greeting', 'Search']} />)
    const note = screen.getByText('Overlaps Greeting, Search')
    // Passive text, not a control — nothing moves automatically.
    expect(note.closest('button')).toBeNull()
  })
})
