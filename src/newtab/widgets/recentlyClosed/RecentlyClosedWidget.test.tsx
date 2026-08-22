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
  { sessionId: 'tab-1', type: 'tab' as const, title: 'Aurora docs', tabCount: 1, closedAt: Date.now() - 10_000 },
  { sessionId: 'window-1', type: 'window' as const, title: '4 tabs', tabCount: 4, closedAt: Date.now() - 20_000 },
  { sessionId: 'tab-2', type: 'tab' as const, title: 'Research', tabCount: 1, closedAt: Date.now() - 30_000 },
  { sessionId: 'tab-3', type: 'tab' as const, title: 'Calendar', tabCount: 1, closedAt: Date.now() - 40_000 },
  { sessionId: 'window-2', type: 'window' as const, title: '2 tabs', tabCount: 2, closedAt: Date.now() - 50_000 },
  { sessionId: 'tab-4', type: 'tab' as const, title: 'Sixth row', tabCount: 1, closedAt: Date.now() - 60_000 },
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
  it('Compact shows only the latest title and its real type', () => {
    render(<RecentlyClosedWidget canvasSize="compact" />)
    const region = screen.getByRole('region', { name: 'Recently Closed' })
    expect(region.textContent).toContain('Aurora docs')
    expect(region.textContent).toContain('Tab')
    expect(screen.queryByRole('button', { name: 'Restore Aurora docs' })).toBeNull()
  })

  it('Standard caps the actionable reverse-time list at five rows', () => {
    render(<RecentlyClosedWidget canvasSize="standard" />)
    expect(screen.getAllByRole('button', { name: /^Restore / })).toHaveLength(5)
    expect(screen.queryByText('Sixth row')).toBeNull()
    expect(screen.getByText(/Window · 4 tabs/)).toBeTruthy()
  })

  it('Full groups every returned entry into Tabs and Windows', () => {
    render(<RecentlyClosedWidget canvasSize="full" />)
    expect(screen.getByRole('heading', { name: 'Tabs' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Windows' })).toBeTruthy()
    expect(screen.getByText('Sixth row')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Restore / })).toHaveLength(6)
  })

  it('Docked count and latest title open the same restore detail', async () => {
    render(<RecentlyClosedWidget docked />)
    const line = screen.getByRole('button', { name: 'Recently Closed: 6 closed · Aurora docs' })
    await act(async () => { line.click() })
    expect(screen.getByRole('dialog', { name: 'Recently Closed details' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restore Aurora docs' })).toBeTruthy()
  })

  it('restores the selected session id once and refreshes the browser result', async () => {
    render(<RecentlyClosedWidget canvasSize="standard" />)
    await act(async () => { screen.getByRole('button', { name: 'Restore Research' }).click() })
    expect(restoreRecentlyClosed).toHaveBeenCalledTimes(1)
    expect(restoreRecentlyClosed).toHaveBeenCalledWith('tab-2')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toContain('Restored Research')
  })

  it('renders empty and retained-error truth', () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'ready', data: [], refreshedAt: 1, refreshing: false }, refresh })
    const view = render(<RecentlyClosedWidget canvasSize="standard" />)
    expect(screen.getByText('Nothing recently closed.')).toBeTruthy()

    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'error', data: ITEMS, refreshedAt: 1, message: 'Recently Closed unavailable' }, refresh })
    view.rerender(<RecentlyClosedWidget canvasSize="standard" />)
    expect(screen.getByText('Aurora docs')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Recently Closed unavailable')
  })
})
