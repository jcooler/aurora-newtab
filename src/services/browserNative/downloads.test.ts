import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetBrowserNativeBoundaryForTests } from './boundary'
import {
  cancelDownload,
  DOWNLOAD_ACTIONS,
  loadDownloads,
  pauseDownload,
  resumeDownload,
  showDownload,
  subscribeDownloads,
} from './downloads'

afterEach(() => {
  __resetBrowserNativeBoundaryForTests()
  vi.unstubAllGlobals()
})

describe('Downloads adapter', () => {
  it('queries 25 newest items and derives truthful progress and filename fallbacks', async () => {
    const search = vi.fn().mockResolvedValue([
      { id: 2, filename: '', url: 'https://files.example/report.pdf', finalUrl: '', state: 'in_progress', paused: false, canResume: false, danger: 'safe', bytesReceived: 25, totalBytes: 100, startTime: '2026-08-22T12:00:00Z', exists: true },
      { id: 1, filename: 'C:\\Users\\Jon\\done.zip', url: '', finalUrl: '', state: 'complete', paused: false, canResume: false, danger: 'safe', bytesReceived: 100, totalBytes: 100, startTime: '2026-08-22T13:00:00Z', exists: true },
      { id: 3, filename: '/tmp/unknown.bin', url: '', finalUrl: '', state: 'in_progress', paused: true, canResume: true, danger: 'uncommon', bytesReceived: 4, totalBytes: -1, startTime: 'bad', exists: true },
    ])
    vi.stubGlobal('chrome', { downloads: { search } })

    const rows = await loadDownloads()
    expect(search).toHaveBeenCalledWith({ limit: 25, orderBy: ['-startTime'] })
    expect(rows.map((row) => row.filename)).toEqual(['done.zip', 'report.pdf', 'unknown.bin'])
    expect(rows[0]).toMatchObject({ state: 'complete', progressPercent: 100, dangerous: false })
    expect(rows[1]).toMatchObject({ state: 'in_progress', progressPercent: 25, dangerous: false })
    expect(rows[2]).toMatchObject({ state: 'in_progress', progressPercent: null, dangerous: true, paused: true })
  })

  it('exposes only the approved action allowlist and exact calls', async () => {
    const pause = vi.fn().mockResolvedValue(undefined)
    const resume = vi.fn().mockResolvedValue(undefined)
    const cancel = vi.fn().mockResolvedValue(undefined)
    const show = vi.fn()
    vi.stubGlobal('chrome', { downloads: { pause, resume, cancel, show } })

    expect(DOWNLOAD_ACTIONS).toEqual(['pause', 'resume', 'cancel', 'show'])
    expect(DOWNLOAD_ACTIONS).not.toEqual(expect.arrayContaining(['open', 'acceptDanger', 'removeFile', 'erase']))
    await pauseDownload(7)
    await resumeDownload(7)
    await cancelDownload(7)
    showDownload(7)
    expect(pause).toHaveBeenCalledWith(7)
    expect(resume).toHaveBeenCalledWith(7)
    expect(cancel).toHaveBeenCalledWith(7)
    expect(show).toHaveBeenCalledWith(7)
  })

  it('subscribes to create/change/erase and cleans up all listeners', () => {
    const makeEvent = () => ({ addListener: vi.fn(), removeListener: vi.fn() })
    const onCreated = makeEvent()
    const onChanged = makeEvent()
    const onErased = makeEvent()
    vi.stubGlobal('chrome', { downloads: { onCreated, onChanged, onErased } })
    const listener = vi.fn()
    const cleanup = subscribeDownloads(listener)
    for (const source of [onCreated, onChanged, onErased]) expect(source.addListener).toHaveBeenCalled()
    cleanup()
    for (const source of [onCreated, onChanged, onErased]) expect(source.removeListener).toHaveBeenCalled()
  })
})
