// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBrowserResource } from '../../../lib/hooks/useBrowserResource'
import {
  cancelDownload,
  pauseDownload,
  resumeDownload,
  showDownload,
} from '../../../services/browserNative/downloads'
import DownloadsWidget from './DownloadsWidget'

vi.mock('../../../lib/hooks/useBrowserResource', () => ({ useBrowserResource: vi.fn() }))
vi.mock('../../../services/browserNative/downloads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/browserNative/downloads')>()
  return {
    ...actual,
    loadDownloads: vi.fn(),
    subscribeDownloads: vi.fn(() => () => undefined),
    cancelDownload: vi.fn().mockResolvedValue(undefined),
    pauseDownload: vi.fn().mockResolvedValue(undefined),
    resumeDownload: vi.fn().mockResolvedValue(undefined),
    showDownload: vi.fn(),
  }
})

const ITEMS = [
  { id: 1, filename: 'aurora.zip', state: 'in_progress' as const, paused: false, canResume: false, dangerous: false, danger: 'safe' as const, bytesReceived: 50, totalBytes: 100, progressPercent: 50, startedAt: 50, exists: true, error: null },
  { id: 2, filename: 'archive.iso', state: 'in_progress' as const, paused: true, canResume: true, dangerous: false, danger: 'safe' as const, bytesReceived: 2, totalBytes: null, progressPercent: null, startedAt: 40, exists: true, error: null },
  { id: 3, filename: 'done.pdf', state: 'complete' as const, paused: false, canResume: false, dangerous: false, danger: 'safe' as const, bytesReceived: 20, totalBytes: 20, progressPercent: 100, startedAt: 30, exists: true, error: null },
  { id: 4, filename: 'failed.mov', state: 'interrupted' as const, paused: false, canResume: true, dangerous: false, danger: 'safe' as const, bytesReceived: 4, totalBytes: 40, progressPercent: 10, startedAt: 20, exists: true, error: 'NETWORK_FAILED' },
  { id: 5, filename: 'warning.exe', state: 'complete' as const, paused: false, canResume: false, dangerous: true, danger: 'uncommon' as const, bytesReceived: 10, totalBytes: 10, progressPercent: 100, startedAt: 10, exists: true, error: null },
]
const refresh = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useBrowserResource).mockReturnValue({
    state: { status: 'ready', data: ITEMS, refreshedAt: Date.now(), refreshing: false },
    refresh,
  })
})

describe('DownloadsWidget', () => {
  it.each([
    ['compact', 0],
    ['standard', 3],
    ['full', 5],
  ] as const)('%s keeps 25 download records inside its exact frame with a bounded stateful subset', (canvasSize, visibleRows) => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      ...ITEMS[index % ITEMS.length],
      id: index + 1,
      filename: `download-${index + 1}.bin`,
      startedAt: 25 - index,
    }))
    vi.mocked(useBrowserResource).mockReturnValueOnce({
      state: { status: 'ready', data: items, refreshedAt: 1, refreshing: false },
      refresh,
    })

    render(<DownloadsWidget canvasSize={canvasSize} />)

    const frame = screen.getByRole('region', { name: 'Downloads' })
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
      const overflowSummary = screen.getByText(`${25 - visibleRows} more in Chrome Downloads`)
      expect(overflowSummary.parentElement?.className).toContain('space-y-1')
    }
  })

  it('gives duplicate filenames distinct row and native action names', () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({
      state: {
        status: 'ready',
        data: Array.from({ length: 5 }, (_, index) => ({ ...ITEMS[0], id: index + 20, filename: 'archive.zip' })),
        refreshedAt: 1,
        refreshing: false,
      },
      refresh,
    })

    render(<DownloadsWidget canvasSize="full" />)

    const rowNames = screen.getAllByRole('article').map((row) => row.getAttribute('aria-label'))
    const pauseNames = screen.getAllByRole('button', { name: /^Pause archive.zip/ })
      .map((button) => button.getAttribute('aria-label'))
    expect(new Set(rowNames).size).toBe(5)
    expect(new Set(pauseNames).size).toBe(5)
  })

  it('Compact shows the active count and newest filename without a row wall', () => {
    render(<DownloadsWidget canvasSize="compact" />)
    const region = screen.getByRole('region', { name: 'Downloads' })
    expect(region.textContent).toContain('2 active')
    expect(region.textContent).toContain('aurora.zip')
    expect(screen.queryByRole('button', { name: /^Pause aurora.zip,/ })).toBeNull()
  })

  it('Standard paints truthful known and unknown progress and caps at three rows', () => {
    render(<DownloadsWidget canvasSize="standard" />)
    const progress = screen.getByRole('progressbar', { name: /^aurora.zip,.* download progress$/ })
    expect(progress.getAttribute('aria-valuenow')).toBe('50')
    expect(screen.getByText(/size unknown/i)).toBeTruthy()
    expect(screen.queryByText('warning.exe')).toBeNull()
    expect(screen.getByText('done.pdf')).toBeTruthy()
  })

  it('Full distinguishes dangerous files and exposes only state-safe actions', () => {
    render(<DownloadsWidget canvasSize="full" />)
    expect(screen.getByText('Potentially unsafe')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Pause aurora.zip,/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Resume archive.iso,/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Resume failed.mov,/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Show done.pdf,.* in folder$/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Open|Accept|Delete|Erase/i })).toBeNull()
  })

  it('Docked active count and filename open the same detailed view', async () => {
    render(<DownloadsWidget docked />)
    const line = screen.getByRole('button', { name: 'Downloads: 2 active · aurora.zip' })
    await act(async () => { line.click() })
    expect(screen.getByRole('dialog', { name: 'Downloads details' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Pause aurora.zip,/ })).toBeTruthy()
  })

  it('keeps missing permission as a dense Docked line', async () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'permission-required' }, refresh })
    render(<DownloadsWidget docked />)
    expect(document.querySelector('[data-browser-widget]')).toBeNull()
    const line = screen.getByRole('button', { name: 'Downloads: Downloads · Enable in Settings' })
    await act(async () => { line.click() })
    expect(screen.getByText('Enable Downloads in Settings.')).toBeTruthy()
  })

  it('Pause, Resume, and Show call exactly the selected download', async () => {
    render(<DownloadsWidget canvasSize="full" />)
    await act(async () => { screen.getByRole('button', { name: /^Pause aurora.zip,/ }).click() })
    await act(async () => { screen.getByRole('button', { name: /^Resume archive.iso,/ }).click() })
    await act(async () => { screen.getByRole('button', { name: /^Show done.pdf,.* in folder$/ }).click() })
    expect(pauseDownload).toHaveBeenCalledWith(1)
    expect(resumeDownload).toHaveBeenCalledWith(2)
    expect(showDownload).toHaveBeenCalledWith(3)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('Cancel requires a second inline confirmation', async () => {
    render(<DownloadsWidget canvasSize="full" />)
    await act(async () => { screen.getByRole('button', { name: /^Cancel aurora.zip,/ }).click() })
    expect(cancelDownload).not.toHaveBeenCalled()
    await act(async () => { screen.getByRole('button', { name: /^Confirm cancel aurora.zip,/ }).click() })
    expect(cancelDownload).toHaveBeenCalledWith(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('announces action failure without hiding retained rows', async () => {
    vi.mocked(pauseDownload).mockRejectedValueOnce(new Error('Pause failed'))
    render(<DownloadsWidget canvasSize="full" />)
    await act(async () => { screen.getByRole('button', { name: /^Pause aurora.zip,/ }).click() })
    expect(screen.getByText('aurora.zip')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Pause failed')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('renders the explicit empty state', () => {
    vi.mocked(useBrowserResource).mockReturnValueOnce({ state: { status: 'ready', data: [], refreshedAt: 1, refreshing: false }, refresh })
    render(<DownloadsWidget canvasSize="standard" />)
    expect(screen.getByText('No recent downloads.')).toBeTruthy()
  })
})
