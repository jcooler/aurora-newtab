// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BrowserDockDetail, BrowserWidgetShell, browserDockSummary } from './BrowserWidgetShell'

describe('BrowserWidgetShell', () => {
  it('renders truthful permission, checking, and empty states without a blank card', () => {
    const view = render(
      <BrowserWidgetShell title="Reading List" canvasSize="compact" state={{ status: 'permission-required' }} empty={false} emptyLabel="Reading list clear">
        <p>rows</p>
      </BrowserWidgetShell>,
    )
    expect(screen.getByText('Enable Reading List in Settings.')).toBeTruthy()
    expect(screen.queryByText('rows')).toBeNull()
    expect(screen.getByRole('region', { name: 'Reading List' }).dataset.tierFrameState).toBe('permission-required')

    view.rerender(
      <BrowserWidgetShell title="Reading List" canvasSize="standard" state={{ status: 'checking' }} empty={false} emptyLabel="Reading list clear">
        <p>rows</p>
      </BrowserWidgetShell>,
    )
    expect(screen.getByText('Checking Reading List…')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Reading List' }).dataset.tierFrame).toBe('standard')

    view.rerender(
      <BrowserWidgetShell title="Reading List" canvasSize="full" state={{ status: 'ready', data: [], refreshedAt: 1, refreshing: false }} empty emptyLabel="Reading list clear">
        <p>rows</p>
      </BrowserWidgetShell>,
    )
    expect(screen.getByText('Reading list clear')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Reading List' }).dataset.tierFrameState).toBe('empty')
  })

  it('retains children with a visible stale/error message and bounded Refresh', () => {
    const refresh = vi.fn()
    render(
      <BrowserWidgetShell title="Reading List" canvasSize="standard" state={{ status: 'error', data: ['kept'], refreshedAt: 1, message: 'Offline' }} empty={false} emptyLabel="Reading list clear" onRefresh={refresh}>
        <p>kept row</p>
      </BrowserWidgetShell>,
    )
    expect(screen.getByText('kept row')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Reading List' }).dataset.tierFrameState).toBe('partial')
    const status = screen.getByRole('status')
    const retry = screen.getByRole('button', { name: 'Refresh Reading List' })
    const body = screen.getByRole('region', { name: 'Reading List' }).querySelector('header + div')
    expect(status.textContent).toContain('Offline')
    expect(status.parentElement?.className).toContain('mt-2')
    expect(status.parentElement?.className).toContain('pt-1')
    expect(retry.className).toContain('mt-1')
    expect(body?.className).toContain('p-2')
    retry.click()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps maximum result fixtures inside one exact frame with no local scroll owner', () => {
    render(
      <BrowserWidgetShell title="Downloads" canvasSize="full" state={{ status: 'ready', data: Array.from({ length: 25 }), refreshedAt: 1, refreshing: false }} empty={false} emptyLabel="No downloads">
        <p>maximum rows</p>
      </BrowserWidgetShell>,
    )
    const shell = screen.getByRole('region', { name: 'Downloads' })
    expect(shell.dataset.tierFrame).toBe('full')
    expect(document.querySelector('[data-browser-widget-scroll]')).toBeNull()
    expect(shell.querySelector('.overflow-y-auto, .overflow-y-scroll')).toBeNull()
  })

  it('keeps every degraded resource state as one truthful dock line with detail and retry', async () => {
    const refresh = vi.fn()
    expect(browserDockSummary('Reading List', { status: 'checking' }, '2 unread')).toBe('Checking Reading List')
    expect(browserDockSummary('Reading List', { status: 'permission-required' }, '2 unread')).toBe('Reading List · Enable in Settings')
    expect(browserDockSummary('Reading List', { status: 'error', data: null, refreshedAt: null, message: 'Offline' }, '2 unread')).toBe('Reading List unavailable')
    expect(browserDockSummary('Reading List', { status: 'error', data: ['kept'], refreshedAt: 1, message: 'Offline' }, '2 unread')).toBe('2 unread · Update failed')

    render(
      <BrowserDockDetail
        label="Reading List"
        summary="Reading List unavailable"
        state={{ status: 'error', data: null, refreshedAt: null, message: 'Offline' }}
        empty
        emptyLabel="Reading list clear"
        onRefresh={refresh}
      >
        <p>rows</p>
      </BrowserDockDetail>,
    )
    const trigger = screen.getByRole('button', { name: 'Reading List: Reading List unavailable' })
    expect(trigger.getAttribute('data-dock-line')).toBe('')
    await act(async () => { trigger.click() })
    expect(screen.getByRole('status').textContent).toContain('Offline')
    screen.getByRole('button', { name: 'Refresh Reading List' }).click()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('docked detail is keyboard-operable, closes on Escape, and restores trigger focus', async () => {
    render(
      <BrowserDockDetail label="Reading List" summary="2 unread · Launch notes" state={{ status: 'ready', data: ['row'], refreshedAt: 1, refreshing: false }} empty={false} emptyLabel="Reading list clear">
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
