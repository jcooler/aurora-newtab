// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBrowserResource } from '../../../lib/hooks/useBrowserResource'
import { restoreRecentlyClosed } from '../../../services/browserNative/recentlyClosed'
import RecentlyClosedWidget from './RecentlyClosedWidget'

vi.mock('../../../lib/hooks/useBrowserResource', () => ({ useBrowserResource: vi.fn() }))
vi.mock('../../../services/browserNative/recentlyClosed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/browserNative/recentlyClosed')>()
  return {
    ...actual,
    loadRecentlyClosed: vi.fn(),
    subscribeRecentlyClosed: vi.fn(() => () => undefined),
    restoreRecentlyClosed: vi.fn().mockResolvedValue(undefined),
  }
})

const ITEMS = [
  { sessionId: 'tab-1', type: 'tab' as const, title: 'Closed tab', tabCount: 1, closedAt: Date.now() - 10_000 },
  { sessionId: 'window-1', type: 'window' as const, title: 'Closed window', tabCount: 4, closedAt: Date.now() - 20_000 },
  { sessionId: 'tab-2', type: 'tab' as const, title: 'Closed tab', tabCount: 1, closedAt: Date.now() - 30_000 },
  { sessionId: 'tab-3', type: 'tab' as const, title: 'Closed tab', tabCount: 1, closedAt: Date.now() - 40_000 },
  { sessionId: 'window-2', type: 'window' as const, title: 'Closed window', tabCount: 2, closedAt: Date.now() - 50_000 },
  { sessionId: 'tab-4', type: 'tab' as const, title: 'Closed tab', tabCount: 1, closedAt: Date.now() - 60_000 },
]
const refresh = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useBrowserResource).mockReturnValue({
    state: { status: 'ready', data: ITEMS, refreshedAt: Date.now(), refreshing: false },
    refresh,
  })
})

describe('RecentlyClosedWidget', () => {
  it('Compact shows only sessions-permission metadata and never claims a title', () => {
    render(<RecentlyClosedWidget canvasSize="compact" />)
    const region = screen.getByRole('region', { name: 'Recently Closed' })
    expect(region.textContent).toContain('Closed tab')
    expect(region.textContent).toContain('Tab')
    expect(screen.queryByRole('button', { name: /Restore Closed tab/ })).toBeNull()
  })

  it('Standard caps the actionable reverse-time list at five rows', () => {
    render(<RecentlyClosedWidget canvasSize="standard" />)
    expect(screen.getAllByRole('button', { name: /^Restore / })).toHaveLength(5)
    expect(screen.getAllByText('Closed tab')).toHaveLength(3)
    expect(screen.getByText(/Window · 4 tabs/)).toBeTruthy()
  })

  it('gives repeated generic sessions distinct state-rich row and restore names', () => {
    render(<RecentlyClosedWidget canvasSize="standard" />)
    const restoreNames = screen.getAllByRole('button', { name: /^Restore / })
      .map((button) => button.getAttribute('aria-label'))
    expect(new Set(restoreNames).size).toBe(restoreNames.length)
    expect(restoreNames.every((name) => /(?:just now|\d+[mhd] ago)/.test(name ?? ''))).toBe(true)
    expect(restoreNames.every((name) => /item \d+ of 5/.test(name ?? ''))).toBe(true)

    const rowNames = screen.getAllByRole('article').map((row) => row.getAttribute('aria-label'))
    expect(new Set(rowNames).size).toBe(rowNames.length)
    expect(rowNames.every((name) => /(?:Tab|Window)/.test(name ?? ''))).toBe(true)
    expect(rowNames.every((name) => /item \d+ of 5/.test(name ?? ''))).toBe(true)
  })

  it('Full groups every returned entry into Tabs and Windows', () => {
    render(<RecentlyClosedWidget canvasSize="full" />)
    expect(screen.getByRole('heading', { name: 'Tabs' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Windows' })).toBeTruthy()
    expect(screen.getAllByText('Closed tab')).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: /^Restore / })).toHaveLength(6)
  })

  it('Docked count and latest sessions-only type open the same restore detail', async () => {
    render(<RecentlyClosedWidget docked />)
    const line = screen.getByRole('button', { name: 'Recently Closed: 6 closed · Tab just now' })
    await act(async () => { line.click() })
    expect(screen.getByRole('dialog', { name: 'Recently Closed details' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Restore Closed tab/ })).toHaveLength(4)
  })

  it('restores the selected session id once and refreshes the browser result', async () => {
    render(<RecentlyClosedWidget canvasSize="standard" />)
    await act(async () => { screen.getAllByRole('button', { name: /Restore Closed tab/ })[1].click() })
    expect(restoreRecentlyClosed).toHaveBeenCalledTimes(1)
    expect(restoreRecentlyClosed).toHaveBeenCalledWith('tab-2')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toContain('Restored Closed tab')
  })

  it('renders empty and retained-error truth', () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'ready', data: [], refreshedAt: 1, refreshing: false }, refresh })
    const view = render(<RecentlyClosedWidget canvasSize="standard" />)
    expect(screen.getByText('Nothing recently closed.')).toBeTruthy()

    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'error', data: ITEMS, refreshedAt: 1, message: 'Recently Closed unavailable' }, refresh })
    view.rerender(<RecentlyClosedWidget canvasSize="standard" />)
    expect(screen.getAllByText('Closed tab').length).toBeGreaterThan(0)
    expect(screen.getByRole('status').textContent).toContain('Recently Closed unavailable')
  })

  it('keeps initial errors as a dense Docked line with retry detail', async () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'error', data: null, refreshedAt: null, message: 'Recently Closed unavailable' }, refresh })
    render(<RecentlyClosedWidget docked />)
    expect(document.querySelector('[data-browser-widget]')).toBeNull()
    const line = screen.getByRole('button', { name: 'Recently Closed: Recently Closed unavailable' })
    await act(async () => { line.click() })
    expect(screen.getByRole('status').textContent).toContain('Recently Closed unavailable')
  })
})
