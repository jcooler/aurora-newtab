// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WIDGET_REGISTRY_BY_ID } from '../widgetRegistry'
import SignalDockEntry from './SignalDockEntry'

describe('SignalDockEntry', () => {
  it('keeps registry identity, truthful fallback, and one mounted renderer behind one operable disclosure', () => {
    const onOpenChange = vi.fn()
    render(
      <SignalDockEntry entry={WIDGET_REGISTRY_BY_ID.github} open={false} onOpenChange={onOpenChange}>
        <p data-render-count="one">3 need attention</p>
      </SignalDockEntry>,
    )

    const entry = document.querySelector('[data-signal-dock-entry]')
    expect(entry?.getAttribute('data-signal-dock-open')).toBe('false')
    expect(screen.getByText('GitHub')).toBeTruthy()
    expect(screen.getByText('Enabled')).toBeTruthy()
    expect(screen.getByText('3 need attention')).toBeTruthy()
    expect(document.querySelectorAll('[data-render-count="one"]')).toHaveLength(1)

    const button = screen.getByRole('button', { name: 'Open GitHub details' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('closes on Escape and restores focus to the invoking disclosure', () => {
    const onOpenChange = vi.fn()
    render(
      <SignalDockEntry entry={WIDGET_REGISTRY_BY_ID.status} open onOpenChange={onOpenChange}>
        <p>1 service issue</p>
      </SignalDockEntry>,
    )
    const button = screen.getByRole('button', { name: 'Close Service status details' })
    const content = document.querySelector('[data-signal-dock-content]') as HTMLElement
    content.focus()
    fireEvent.keyDown(content, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(document.activeElement).toBe(button)
  })
})
