// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBrowserResource } from '../../../lib/hooks/useBrowserResource'
import {
  removeReadingListEntry,
  setReadingListReadState,
} from '../../../services/browserNative/readingList'
import ReadingListWidget from './ReadingListWidget'

vi.mock('../../../lib/hooks/useBrowserResource', () => ({ useBrowserResource: vi.fn() }))
vi.mock('../../../services/browserNative/readingList', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/browserNative/readingList')>()
  return {
    ...actual,
    loadReadingList: vi.fn(),
    subscribeReadingList: vi.fn(() => () => undefined),
    removeReadingListEntry: vi.fn().mockResolvedValue(undefined),
    setReadingListReadState: vi.fn().mockResolvedValue(undefined),
  }
})

const ITEMS = [
  { url: 'https://news.example/launch', title: 'Launch notes', host: 'news.example', hasBeenRead: false, createdAt: 10, updatedAt: 50 },
  { url: 'https://docs.example/guide', title: 'Guide', host: 'docs.example', hasBeenRead: false, createdAt: 20, updatedAt: 40 },
  { url: 'https://aurora.example/read', title: 'Aurora story', host: 'aurora.example', hasBeenRead: true, createdAt: 30, updatedAt: 30 },
]

const refresh = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useBrowserResource).mockReturnValue({
    state: { status: 'ready', data: ITEMS, refreshedAt: Date.now(), refreshing: false },
    refresh,
  })
})

describe('ReadingListWidget', () => {
  it.each([
    ['compact', 0],
    ['standard', 1],
    ['full', 2],
  ] as const)('%s keeps a 25-record queue inside its exact frame with a bounded useful subset', (canvasSize, visibleRows) => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      url: `https://reading.example/item-${index + 1}`,
      title: `Saved page ${index + 1}`,
      host: 'reading.example',
      hasBeenRead: index >= 18,
      createdAt: index + 1,
      updatedAt: 25 - index,
    }))
    vi.mocked(useBrowserResource).mockReturnValueOnce({
      state: { status: 'ready', data: items, refreshedAt: 1, refreshing: false },
      refresh,
    })

    render(<ReadingListWidget canvasSize={canvasSize} />)

    const frame = screen.getByRole('region', { name: 'Reading List' })
    expect(frame.getAttribute('data-tier-frame')).toBe(canvasSize)
    expect(frame.className).toContain(`tier-frame--${canvasSize}`)
    expect(frame.querySelector('.overflow-y-auto, .overflow-y-scroll')).toBeNull()
    expect(frame.querySelectorAll('article')).toHaveLength(visibleRows)

    if (visibleRows > 0) {
      const actions = [...frame.querySelectorAll<HTMLElement>('a[aria-label], button[aria-label]')]
      const names = actions.map((action) => action.getAttribute('aria-label'))
      expect(names.every(Boolean)).toBe(true)
      expect(new Set(names).size).toBe(names.length)
      expect(actions.every((action) => action.className.includes('text-sm'))).toBe(true)
      expect(screen.getByRole('link', { name: /^Open Saved page 1,/ })).toBeTruthy()
      expect(frame.textContent).toContain(`${25 - visibleRows} more in Chrome Reading List`)
    }
  })

  it('gives duplicate saved-page titles distinct row and action names', () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({
      state: {
        status: 'ready',
        data: [
          { ...ITEMS[0], url: 'https://news.example/first', title: 'Same title' },
          { ...ITEMS[0], url: 'https://news.example/second', title: 'Same title' },
        ],
        refreshedAt: 1,
        refreshing: false,
      },
      refresh,
    })

    render(<ReadingListWidget canvasSize="full" />)

    const rowNames = screen.getAllByRole('article').map((row) => row.getAttribute('aria-label'))
    const openNames = screen.getAllByRole('link', { name: /^Open Same title/ })
      .map((link) => link.getAttribute('aria-label'))
    expect(new Set(rowNames).size).toBe(2)
    expect(new Set(openNames).size).toBe(2)
  })

  it('Compact answers the glance question without rendering the working list', () => {
    render(<ReadingListWidget canvasSize="compact" />)
    expect(screen.getByRole('region', { name: 'Reading List' }).textContent).toContain('2 unread')
    expect(screen.getByText('Launch notes')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Open Launch notes/ })).toBeNull()
  })

  it('Standard renders unread title, host, age, and safe row actions', () => {
    render(<ReadingListWidget canvasSize="standard" />)
    expect(screen.getByText('news.example')).toBeTruthy()
    const open = screen.getByRole('link', { name: /^Open Launch notes,/ })
    expect(open.getAttribute('href')).toBe('https://news.example/launch')
    expect(open.getAttribute('target')).toBe('_blank')
    expect(open.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByRole('button', { name: /^Mark Launch notes,.* read$/ })).toBeTruthy()
  })

  it('Full earns space with unread and recently read sections', () => {
    render(<ReadingListWidget canvasSize="full" />)
    expect(screen.getByRole('heading', { name: 'Unread' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Recently read' })).toBeTruthy()
    expect(screen.getByText('Aurora story')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Mark Aurora story,.* unread$/ })).toBeTruthy()
  })

  it('Full places one unread and one recently read row side by side above the remaining-count footer', () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      url: `https://reading.example/item-${index + 1}`,
      title: `Saved page ${index + 1}`,
      host: 'reading.example',
      hasBeenRead: index >= 18,
      createdAt: index + 1,
      updatedAt: 25 - index,
    }))
    vi.mocked(useBrowserResource).mockReturnValueOnce({
      state: { status: 'ready', data: items, refreshedAt: 1, refreshing: false },
      refresh,
    })

    render(<ReadingListWidget canvasSize="full" />)

    const frame = screen.getByRole('region', { name: 'Reading List' })
    const sections = frame.querySelector<HTMLElement>('[data-reading-list-sections="parallel"]')
    const footer = frame.querySelector<HTMLElement>('[data-reading-list-footer]')
    expect(sections).not.toBeNull()
    expect(sections?.className).toContain('grid-cols-2')
    expect(sections?.querySelectorAll('section')).toHaveLength(2)
    expect(sections?.querySelectorAll('article')).toHaveLength(2)
    expect(footer?.textContent).toBe('23 more in Chrome Reading List')
    expect(frame.querySelector('.overflow-y-auto, .overflow-y-scroll')).toBeNull()
  })

  it('Docked renders one clean line and opens the same actionable detail', async () => {
    render(<ReadingListWidget docked />)
    const line = screen.getByRole('button', { name: 'Reading List: 2 unread · Launch notes' })
    expect(line.getAttribute('data-dock-line')).toBe('')
    expect(screen.queryByRole('link', { name: /Open Launch notes/ })).toBeNull()
    await act(async () => { line.click() })
    expect(screen.getByRole('dialog', { name: 'Reading List details' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^Open Launch notes,/ })).toBeTruthy()
  })

  it('marks an item read then refreshes from Chrome before announcing success', async () => {
    render(<ReadingListWidget canvasSize="standard" />)
    await act(async () => { screen.getByRole('button', { name: /^Mark Launch notes,.* read$/ }).click() })
    expect(setReadingListReadState).toHaveBeenCalledWith('https://news.example/launch', true)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toContain('Marked Launch notes read')
  })

  it('requires a second inline confirmation before Remove', async () => {
    render(<ReadingListWidget canvasSize="standard" />)
    await act(async () => { screen.getByRole('button', { name: /^Remove Launch notes,/ }).click() })
    expect(removeReadingListEntry).not.toHaveBeenCalled()
    await act(async () => { screen.getByRole('button', { name: /^Confirm remove Launch notes,/ }).click() })
    expect(removeReadingListEntry).toHaveBeenCalledWith('https://news.example/launch')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('renders truthful permission, empty, and retained-error states', () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'permission-required' }, refresh })
    const view = render(<ReadingListWidget canvasSize="standard" />)
    expect(screen.getByText('Enable Reading List in Settings.')).toBeTruthy()

    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'ready', data: [], refreshedAt: 1, refreshing: false }, refresh })
    view.rerender(<ReadingListWidget canvasSize="standard" />)
    expect(screen.getByText('Reading list clear')).toBeTruthy()

    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'error', data: ITEMS, refreshedAt: 1, message: 'Reading List unavailable' }, refresh })
    view.rerender(<ReadingListWidget canvasSize="standard" />)
    expect(screen.getByText('Launch notes')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Reading List unavailable')
  })

  it('renders all-read Standard as clear instead of a blank card', () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({
      state: { status: 'ready', data: ITEMS.map((item) => ({ ...item, hasBeenRead: true })), refreshedAt: 1, refreshing: false },
      refresh,
    })
    render(<ReadingListWidget canvasSize="standard" />)
    expect(screen.getByText('Reading list clear')).toBeTruthy()
    expect(document.querySelector('[data-browser-widget]')?.textContent?.trim()).not.toBe('Reading List')
  })

  it('keeps permission loss as a dense Docked line instead of a card in the strip', async () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'permission-required' }, refresh })
    render(<ReadingListWidget docked />)
    expect(document.querySelector('[data-browser-widget]')).toBeNull()
    const line = screen.getByRole('button', { name: 'Reading List: Reading List · Enable in Settings' })
    await act(async () => { line.click() })
    expect(screen.getByText('Enable Reading List in Settings.')).toBeTruthy()
  })
})
