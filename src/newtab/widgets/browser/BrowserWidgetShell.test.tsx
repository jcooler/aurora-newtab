// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BrowserDockDetail, BrowserWidgetShell } from './BrowserWidgetShell'

describe('BrowserWidgetShell', () => {
  it('renders truthful permission, checking, and empty states without a blank card', () => {
    const view = render(
      <BrowserWidgetShell title="Reading List" canvasSize="compact" state={{ status: 'permission-required' }} empty={false} emptyLabel="Reading list clear">
        <p>rows</p>
      </BrowserWidgetShell>,
    )
    expect(screen.getByText('Enable Reading List in Settings.')).toBeTruthy()
    expect(screen.queryByText('rows')).toBeNull()

    view.rerender(
      <BrowserWidgetShell title="Reading List" canvasSize="standard" state={{ status: 'checking' }} empty={false} emptyLabel="Reading list clear">
        <p>rows</p>
      </BrowserWidgetShell>,
    )
    expect(screen.getByText('Checking Reading List…')).toBeTruthy()

    view.rerender(
      <BrowserWidgetShell title="Reading List" canvasSize="full" state={{ status: 'ready', data: [], refreshedAt: 1, refreshing: false }} empty emptyLabel="Reading list clear">
        <p>rows</p>
      </BrowserWidgetShell>,
    )
    expect(screen.getByText('Reading list clear')).toBeTruthy()
  })

  it('retains children with a visible stale/error message and bounded Refresh', () => {
    const refresh = vi.fn()
    render(
      <BrowserWidgetShell title="Reading List" canvasSize="standard" state={{ status: 'error', data: ['kept'], refreshedAt: 1, message: 'Offline' }} empty={false} emptyLabel="Reading list clear" onRefresh={refresh}>
        <p>kept row</p>
      </BrowserWidgetShell>,
    )
    expect(screen.getByText('kept row')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Offline')
    screen.getByRole('button', { name: 'Refresh Reading List' }).click()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('docked detail is keyboard-operable, closes on Escape, and restores trigger focus', async () => {
    render(
      <BrowserDockDetail label="Reading List" summary="2 unread · Launch notes">
        <p>Reading list details</p>
      </BrowserDockDetail>,
    )
    const trigger = screen.getByRole('button', { name: 'Reading List: 2 unread · Launch notes' })
    trigger.focus()
    await act(async () => { trigger.click() })
    expect(screen.getByRole('dialog', { name: 'Reading List details' })).toBeTruthy()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
