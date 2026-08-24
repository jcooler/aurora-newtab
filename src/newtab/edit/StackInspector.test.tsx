// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WIDGET_REGISTRY_BY_ID } from '../widgetRegistry'
import StackInspector from './StackInspector'
import indexCss from '../index.css?raw'

function rect(left: number, top: number, width: number, height: number): DOMRectReadOnly {
  return {
    left, top, width, height,
    right: left + width, bottom: top + height,
    x: left, y: top,
    toJSON: () => ({}),
  } as DOMRectReadOnly
}

const stack = {
  id: 'stack-day',
  members: ['weather', 'clock', 'notes'] as const,
  facing: 'weather' as const,
  anchor: 'top-right' as const,
  offsetX: -8,
  offsetY: 13,
  tier: 'standard' as const,
  layer: 4,
}

function setup() {
  const callbacks = {
    onTier: vi.fn(),
    onLayer: vi.fn(),
    onReorder: vi.fn(),
    onRemove: vi.fn(),
    onMemberPointerDown: vi.fn(),
    onHide: vi.fn(),
  }
  render(
    <StackInspector
      stack={stack}
      entries={stack.members.map((id) => WIDGET_REGISTRY_BY_ID[id])}
      anchorRect={rect(900, 60, 320, 220)}
      overlapLabels={[]}
      {...callbacks}
    />,
  )
  return { dialog: screen.getByRole('dialog', { name: 'Weather +2 inspector' }), ...callbacks }
}

describe('StackInspector', () => {
  afterEach(cleanup)

  it('offers only the member intersection and names an incompatible stored tier', () => {
    const { dialog, onTier, onLayer, onHide } = setup()
    expect(within(dialog).getByText('Weather +2')).toBeTruthy()
    expect(within(dialog).getByText('Widget stack')).toBeTruthy()
    expect(within(dialog).getByText('Overlap order')).toBeTruthy()
    expect(within(dialog).queryByText('Layer')).toBeNull()
    expect(within(dialog).getAllByRole('radio').map((radio) => radio.textContent))
      .toEqual(['Compact'])
    expect(within(dialog).getByRole('radio', { name: 'Compact' }).getAttribute('aria-checked')).toBe('false')
    expect(within(dialog).getByText('Standard is not available for Notes. Choose Compact or remove the incompatible member.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Compact' }))
    expect(onTier).toHaveBeenCalledWith('compact')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send backward' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bring forward' }))
    expect(onLayer.mock.calls.map(([direction]) => direction)).toEqual(['backward', 'forward'])
    expect(within(dialog).queryByRole('button', { name: 'Restore defaults' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hide stack' }))
    expect(onHide).toHaveBeenCalledOnce()
  })

  it('shows ordered member rows with boundary-safe reorder, Remove, and drag-out handles', () => {
    const { dialog, onReorder, onRemove, onMemberPointerDown } = setup()
    const rows = [...dialog.querySelectorAll('[data-stack-inspector-member]')]
    expect(rows.map((row) => row.getAttribute('data-stack-inspector-member')))
      .toEqual(['weather', 'clock', 'notes'])
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: 'Move Weather earlier' }).hasAttribute('disabled')).toBe(true)
    expect(within(rows[2] as HTMLElement).getByRole('button', { name: 'Move Notes later' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Move Clock earlier' }))
    expect(onReorder).toHaveBeenCalledWith('clock', -1)
    fireEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Remove Clock from stack' }))
    expect(onRemove).toHaveBeenCalledWith('clock')
    fireEvent.pointerDown(within(rows[1] as HTMLElement).getByRole('button', { name: 'Move Clock out of stack' }))
    expect(onMemberPointerDown).toHaveBeenCalledWith('clock', expect.anything())
  })

  it('keeps overlap information passive and stack-local', () => {
    const callbacks = {
      onTier: vi.fn(), onLayer: vi.fn(), onReorder: vi.fn(), onRemove: vi.fn(),
      onMemberPointerDown: vi.fn(), onHide: vi.fn(),
    }
    render(
      <StackInspector
        stack={stack}
        entries={stack.members.map((id) => WIDGET_REGISTRY_BY_ID[id])}
        anchorRect={rect(900, 60, 320, 220)}
        overlapLabels={['Quote', 'Month']}
        {...callbacks}
      />,
    )
    const note = screen.getByText('Overlaps Quote, Month')
    expect(note.closest('button')).toBeNull()
  })

  it('uses a measured, wider inspector with compact ordered rows and a grab cursor', () => {
    expect(indexCss).toMatch(/\.edit-inspector--stack\s*\{[^}]*width:\s*280px;/)
    expect(indexCss).toMatch(/\.stack-inspector__member\s*\{[^}]*display:\s*grid;/)
    expect(indexCss).toMatch(/\.stack-inspector__drag\s*\{[^}]*cursor:\s*grab;/)
    expect(indexCss).toMatch(/\.stack-inspector__icon:disabled\s*\{[^}]*opacity:/)
  })

  it('keeps a tall short-window inspector beside the selected stack instead of covering its dots', () => {
    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1408 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 445 })
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(rect(0, 0, 280, 381.25) as DOMRect)
    const callbacks = {
      onTier: vi.fn(), onLayer: vi.fn(), onReorder: vi.fn(), onRemove: vi.fn(),
      onMemberPointerDown: vi.fn(), onHide: vi.fn(),
    }

    try {
      render(
        <StackInspector
          stack={stack}
          entries={stack.members.map((id) => WIDGET_REGISTRY_BY_ID[id])}
          anchorRect={rect(650.2578125, 117.25, 445.390625, 255)}
          overlapLabels={['Greeting', 'Search', 'Focus', 'Links']}
          {...callbacks}
        />,
      )
      const dialog = screen.getByRole('dialog', { name: 'Weather +2 inspector' })
      expect(dialog.style.left).toBe('362.2578125px')
      expect(dialog.style.top).toBe('54.125px')
      expect(dialog.style.bottom).toBe('')
    } finally {
      bounds.mockRestore()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight })
    }
  })
})
