// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBrowserResource } from '../../../lib/hooks/useBrowserResource'
import {
  focusTabGroupWindow,
  setTabGroupCollapsed,
} from '../../../services/browserNative/tabGroups'
import TabGroupsWidget from './TabGroupsWidget'

vi.mock('../../../lib/hooks/useBrowserResource', () => ({ useBrowserResource: vi.fn() }))
vi.mock('../../../services/browserNative/tabGroups', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/browserNative/tabGroups')>()
  return {
    ...actual,
    loadTabGroups: vi.fn(),
    subscribeTabGroups: vi.fn(() => () => undefined),
    focusTabGroupWindow: vi.fn().mockResolvedValue(undefined),
    setTabGroupCollapsed: vi.fn().mockResolvedValue(undefined),
  }
})

const ITEMS = [
  { id: 1, windowId: 10, windowOrdinal: 1, title: 'Work', color: 'blue' as const, collapsed: false, shared: false },
  { id: 2, windowId: 10, windowOrdinal: 1, title: 'Shared launch', color: 'pink' as const, collapsed: true, shared: true },
  { id: 3, windowId: 20, windowOrdinal: 2, title: 'Research', color: 'green' as const, collapsed: false, shared: false },
  { id: 4, windowId: 20, windowOrdinal: 2, title: 'Untitled red group', color: 'red' as const, collapsed: true, shared: false },
  { id: 5, windowId: 30, windowOrdinal: 3, title: 'Personal', color: 'purple' as const, collapsed: false, shared: false },
  { id: 6, windowId: 30, windowOrdinal: 3, title: 'Sixth group', color: 'yellow' as const, collapsed: false, shared: false },
]
const refresh = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useBrowserResource).mockReturnValue({
    state: { status: 'ready', data: ITEMS, refreshedAt: Date.now(), refreshing: false },
    refresh,
  })
})

describe('TabGroupsWidget', () => {
  it.each([
    ['compact', 0],
    ['standard', 2],
    ['full', 4],
  ] as const)('%s keeps 25 browser groups inside its exact frame with bounded native actions', (canvasSize, visibleRows) => {
    const colors = ['blue', 'cyan', 'green', 'grey', 'orange', 'pink', 'purple', 'red', 'yellow'] as const
    const items = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1,
      windowId: Math.floor(index / 2) + 10,
      windowOrdinal: Math.floor(index / 2) + 1,
      title: `Browser group ${index + 1}`,
      color: colors[index % colors.length],
      collapsed: index % 2 === 1,
      shared: index % 3 === 0,
    }))
    vi.mocked(useBrowserResource).mockReturnValueOnce({
      state: { status: 'ready', data: items, refreshedAt: 1, refreshing: false },
      refresh,
    })

    render(<TabGroupsWidget canvasSize={canvasSize} />)

    const frame = screen.getByRole('region', { name: 'Tab Groups' })
    expect(frame.getAttribute('data-tier-frame')).toBe(canvasSize)
    expect(frame.className).toContain(`tier-frame--${canvasSize}`)
    expect(frame.querySelector('.overflow-y-auto, .overflow-y-scroll')).toBeNull()
    expect(frame.querySelectorAll('article')).toHaveLength(visibleRows)

    if (visibleRows > 0) {
      const actions = [...frame.querySelectorAll<HTMLButtonElement>('button[aria-label]')]
      const names = actions.map((button) => button.getAttribute('aria-label'))
      expect(names.every(Boolean)).toBe(true)
      expect(new Set(names).size).toBe(names.length)
      expect(actions.every((button) => button.className.includes('text-sm'))).toBe(true)
      expect(frame.textContent).toContain(`${25 - visibleRows} more Chrome tab groups`)
    }
  })

  it('gives duplicate group titles distinct row and native action names', () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({
      state: {
        status: 'ready',
        data: Array.from({ length: 4 }, (_, index) => ({
          ...ITEMS[index],
          id: index + 20,
          title: 'Workspace',
          collapsed: false,
        })),
        refreshedAt: 1,
        refreshing: false,
      },
      refresh,
    })

    render(<TabGroupsWidget canvasSize="full" />)

    const rowNames = screen.getAllByRole('article').map((row) => row.getAttribute('aria-label'))
    const focusNames = screen.getAllByRole('button', { name: /^Focus Workspace/ })
      .map((button) => button.getAttribute('aria-label'))
    expect(new Set(rowNames).size).toBe(4)
    expect(new Set(focusNames).size).toBe(4)
  })

  it('Compact shows the group count and first group without actions', () => {
    render(<TabGroupsWidget canvasSize="compact" />)
    const region = screen.getByRole('region', { name: 'Tab Groups' })
    expect(region.textContent).toContain('6 groups')
    expect(region.textContent).toContain('Work')
    expect(screen.queryByRole('button', { name: /^Focus Work window,/ })).toBeNull()
  })

  it('Standard caps at two and shows real color, window, shared, and collapsed metadata', () => {
    render(<TabGroupsWidget canvasSize="standard" />)
    expect(screen.getAllByRole('button', { name: /^Focus / })).toHaveLength(2)
    expect(screen.queryByText('Sixth group')).toBeNull()
    expect(screen.getByText(/Window 1 · Collapsed · Shared/)).toBeTruthy()
    const pink = screen.getByTestId('tab-group-color-2')
    expect(pink.getAttribute('data-tab-group-color')).toBe('pink')
    expect(pink.className).toContain('bg-pink-400')
  })

  it('Full organizes two bounded windows by stable ordinal', () => {
    render(<TabGroupsWidget canvasSize="full" />)
    expect(screen.getByRole('heading', { name: 'Window 1' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Window 2' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Window 3' })).toBeNull()
    expect(screen.queryByText('Sixth group')).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Focus / })).toHaveLength(4)
  })

  it('Full uses its width to keep both window sections inside the fixed height', () => {
    render(<TabGroupsWidget canvasSize="full" />)
    const firstWindow = screen.getByRole('heading', { name: 'Window 1' }).parentElement
    const secondWindow = screen.getByRole('heading', { name: 'Window 2' }).parentElement
    expect(firstWindow?.parentElement).toBe(secondWindow?.parentElement)
    expect(firstWindow?.parentElement?.className).toContain('grid-cols-2')
  })

  it('Docked opens the same group actions', async () => {
    render(<TabGroupsWidget docked />)
    const line = screen.getByRole('button', { name: 'Tab Groups: 6 groups · Work' })
    await act(async () => { line.click() })
    expect(screen.getByRole('dialog', { name: 'Tab Groups details' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Focus Work window,/ })).toBeTruthy()
  })

  it('keeps missing permission as a dense Docked line', async () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'permission-required' }, refresh })
    render(<TabGroupsWidget docked />)
    expect(document.querySelector('[data-browser-widget]')).toBeNull()
    const line = screen.getByRole('button', { name: 'Tab Groups: Tab Groups · Enable in Settings' })
    await act(async () => { line.click() })
    expect(screen.getByText('Enable Tab Groups in Settings.')).toBeTruthy()
  })

  it('focuses the selected window and toggles only the selected group', async () => {
    render(<TabGroupsWidget canvasSize="full" />)
    await act(async () => { screen.getByRole('button', { name: /^Focus Research window,/ }).click() })
    await act(async () => { screen.getByRole('button', { name: /^Expand Shared launch,/ }).click() })
    expect(focusTabGroupWindow).toHaveBeenCalledWith(20)
    expect(setTabGroupCollapsed).toHaveBeenCalledWith(2, false)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('renders the explicit empty state and never references tab content', () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'ready', data: [], refreshedAt: 1, refreshing: false }, refresh })
    const view = render(<TabGroupsWidget canvasSize="standard" />)
    expect(screen.getByText('No tab groups open.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('tab URL')

    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'error', data: ITEMS, refreshedAt: 1, message: 'Tab Groups unavailable' }, refresh })
    view.rerender(<TabGroupsWidget canvasSize="standard" />)
    expect(screen.getByText('Work')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Tab Groups unavailable')
  })
})
