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

  it('offers a docked Size control ONLY where size changes the strip form (Bookmarks), never dead radios', () => {
    const shared = {
      anchorRect: rect(500, 20, 300, 40),
      overlapLabels: [] as string[],
      onTier: vi.fn(),
      onLayer: vi.fn(),
      onHide: vi.fn(),
      onRestore: vi.fn(),
    }
    render(
      <WidgetInspector
        {...shared}
        entry={WIDGET_REGISTRY_BY_ID.bookmarks}
        placement={{ kind: 'docked', dock: 'top', order: 0 }}
      />,
    )
    const bookmarksDialog = screen.getByRole('dialog', { name: 'Bookmarks inspector' })
    // Default checked reflects the docked default: the full readable bar.
    expect(within(bookmarksDialog).getByRole('radio', { name: 'Standard' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(bookmarksDialog).getByRole('radio', { name: 'Compact' }))
    expect(shared.onTier).toHaveBeenCalledWith('compact')
    // Layer is a free-placement concept; docked members get no dead buttons.
    expect(within(bookmarksDialog).queryByRole('button', { name: 'Bring forward' })).toBeNull()
    cleanup()
    render(
      <WidgetInspector
        {...shared}
        entry={WIDGET_REGISTRY_BY_ID.weather}
        placement={{ kind: 'docked', dock: 'bottom', order: 0 }}
      />,
    )
    // Docked weather renders ONE line regardless of size: no Size radios.
    expect(within(screen.getByRole('dialog', { name: 'Weather inspector' })).queryAllByRole('radio')).toHaveLength(0)
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

  it('moves below the live edit toolbar when the anchored position would be covered', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1408 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 445 })
    render(
      <WidgetInspector
        entry={WIDGET_REGISTRY_BY_ID.bookmarks}
        placement={{ kind: 'docked', dock: 'top', order: 0, x: 12, y: 18, tier: 'compact' }}
        anchorRect={rect(190, 30, 180, 32)}
        toolbarRect={rect(12, 64, 1384, 114)}
        overlapLabels={[]}
        onTier={vi.fn()}
        onLayer={vi.fn()}
        onHide={vi.fn()}
        onRestore={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Bookmarks inspector' })
    // The docked Bookmarks panel is materially shorter than a full free-card
    // inspector, so it fits below the toolbar even in the owner's 1408x445
    // window. A one-size 264px estimate incorrectly left it underneath.
    expect(dialog.style.top).toBe('186px')
  })
})
