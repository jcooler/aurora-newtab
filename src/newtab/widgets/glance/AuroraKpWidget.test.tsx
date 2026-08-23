// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import { createStorage, type AuroraStorage } from '../../../lib/storage'
import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver } from '../../../lib/storage/driver'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import type { AuroraKpData, KpInterval } from '../../../services/connectors/auroraKp'
import type { AuroraKpConfig } from '../../../services/connectors/types'
import AuroraKpWidget from './AuroraKpWidget'

const NOW = new Date('2026-08-22T12:00:00Z').getTime()
const CONFIG: AuroraKpConfig = { enabled: true }
const interval = (time: string, kp: number, scale: KpInterval['scale'] = null): KpInterval => ({
  time,
  kp,
  source: 'predicted',
  scale,
})
const DATA: AuroraKpData = {
  current: { time: '2026-08-22T09:00:00.000Z', kp: 3.67, source: 'estimated', scale: null },
  forecast: [
    interval('2026-08-22T15:00:00.000Z', 4),
    interval('2026-08-22T18:00:00.000Z', 6, 'G2'),
    interval('2026-08-22T21:00:00.000Z', 5, 'G1'),
    interval('2026-08-23T00:00:00.000Z', 4),
    interval('2026-08-23T03:00:00.000Z', 3),
  ],
  peak: interval('2026-08-22T18:00:00.000Z', 6, 'G2'),
}

const DENSE_DATA: AuroraKpData = {
  current: DATA.current,
  forecast: [
    interval('2026-08-22T15:00:00.000Z', 4),
    interval('2026-08-22T18:00:00.000Z', 6, 'G2'),
    interval('2026-08-22T21:00:00.000Z', 5, 'G1'),
    interval('2026-08-23T15:00:00.000Z', 3),
    interval('2026-08-23T18:00:00.000Z', 5, 'G1'),
    interval('2026-08-23T21:00:00.000Z', 4),
    interval('2026-08-24T15:00:00.000Z', 2),
    interval('2026-08-24T18:00:00.000Z', 7, 'G3'),
    interval('2026-08-24T21:00:00.000Z', 3),
  ],
  peak: interval('2026-08-24T18:00:00.000Z', 7, 'G3'),
}

async function seededStorage(data: AuroraKpData | null = DATA, fetchedAt = NOW): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { auroraKp: CONFIG })
  if (data) {
    await storage.set('connectorSnapshots', {
      auroraKp: { scope: await connectorSnapshotScope('auroraKp', CONFIG), fetchedAt, data },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, props: { canvasSize?: 'compact' | 'standard' | 'full'; docked?: boolean } = {}) {
  return render(<StorageProvider storage={storage}><AuroraKpWidget {...props} /></StorageProvider>)
}

function frame(tier: 'compact' | 'standard' | 'full'): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-tier-frame="${tier}"]`)
  expect(element, `missing ${tier} Aurora & Kp frame`).toBeTruthy()
  return element!
}

function expectBoundedFrame(element: HTMLElement): void {
  expect(element.querySelector('[data-work-widget-scroll]')).toBeNull()
  expect(element.querySelector('[class*="overflow-y-auto"]')).toBeNull()
}

beforeEach(() => {
  __resetInFlight()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  __resetInFlight()
  vi.unstubAllGlobals()
  vi.mocked(Date.now).mockRestore()
})

describe('AuroraKpWidget', () => {
  it('shows current activity and next peak in Compact without a visibility probability', async () => {
    mount(await seededStorage(), { canvasSize: 'compact' })
    expect(await screen.findByText('Kp 3.7')).toBeTruthy()
    expect(screen.getByText('Unsettled')).toBeTruthy()
    expect(screen.getByText(/Peak 6\.0/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/probability|chance/i)
  })

  it('adds storm scale and the next four intervals in Standard', async () => {
    mount(await seededStorage(), { canvasSize: 'standard' })
    expect(await screen.findByText('G2 storm scale')).toBeTruthy()
    expect(screen.getAllByTestId('kp-forecast-row')).toHaveLength(4)
  })

  it('authors Full as one bounded daily peak per forecast day with a NOAA path', async () => {
    mount(await seededStorage(DENSE_DATA), { canvasSize: 'full' })
    await screen.findByText('G3 storm scale')

    const full = frame('full')
    expect(full.dataset.tierFrameState).toBe('ready')
    expectBoundedFrame(full)
    expect(within(full).getAllByTestId('kp-forecast-row')).toHaveLength(3)
    expect(within(full).getAllByRole('region', { name: /Kp forecast/i })).toHaveLength(3)
    expect(within(full).getByText('Kp 3.7')).toBeTruthy()
    expect(within(full).getByText(/Peak 7\.0/)).toBeTruthy()
    expect(within(full).getByText('Kp 6.0 · G2')).toBeTruthy()
    expect(within(full).getByText('Kp 5.0 · G1')).toBeTruthy()
    expect(within(full).getByText('Kp 7.0 · G3')).toBeTruthy()
    expect(within(full).getByRole('link', { name: 'Open NOAA Space Weather' }).getAttribute('href')).toBe('https://www.swpc.noaa.gov/products/planetary-k-index')
  })

  it('opens truthful NOAA context from one dense Docked line', async () => {
    mount(await seededStorage(), { docked: true })
    const trigger = await screen.findByRole('button', { name: /Aurora & Kp: Kp 3\.7, peak 6\.0 at/i })
    await act(async () => { trigger.click() })
    expect(screen.getByRole('dialog', { name: 'Aurora & Kp details' })).toBeTruthy()
    expect(screen.getByText(/Darkness, clear sky, location, and light pollution/)).toBeTruthy()
    expect(screen.getByText('NOAA Space Weather Prediction Center')).toBeTruthy()
  })
})

describe('AuroraKpWidget tier frame states', () => {
  it('keeps loading and empty inside the selected exact frame', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const loadingView = mount(await seededStorage(null), { canvasSize: 'standard' })
    await screen.findByText('Loading Aurora & Kp…')
    expect(frame('standard').dataset.tierFrameState).toBe('loading')
    expectBoundedFrame(frame('standard'))
    loadingView.unmount()

    mount(await seededStorage({ current: null, forecast: [], peak: null }), { canvasSize: 'standard' })
    await screen.findByText('NOAA has no current Kp forecast.')
    expect(frame('standard').dataset.tierFrameState).toBe('empty')
    expectBoundedFrame(frame('standard'))
  })

  it('keeps current Kp and peak through stale and partial states', async () => {
    let rejectRefresh: ((reason: Error) => void) | undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((_resolve, reject) => {
      rejectRefresh = reject
    })))
    mount(await seededStorage(DATA, NOW - 16 * 60_000), { canvasSize: 'standard' })
    await screen.findByText('Kp 3.7')

    const standard = frame('standard')
    expect(standard.dataset.tierFrameState).toBe('stale')
    expect(within(standard).getByText(/Peak 6\.0/)).toBeTruthy()
    expect(within(standard).getByRole('status').textContent).toBe('Showing saved data while Aurora & Kp refreshes.')
    expectBoundedFrame(standard)

    await act(async () => {
      rejectRefresh?.(new Error('provider unavailable'))
      await Promise.resolve()
    })
    await waitFor(() => expect(standard.dataset.tierFrameState).toBe('partial'))
    expect(within(standard).getByText('Kp 3.7')).toBeTruthy()
    expect(within(standard).getByText(/Peak 6\.0/)).toBeTruthy()
    expect(within(standard).getByRole('status').textContent).toBe('Aurora & Kp is unavailable.')
  })

  it('keeps a hard error and retry inside the selected exact frame', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')))
    mount(await seededStorage(null), { canvasSize: 'standard' })
    await screen.findByRole('alert')

    const standard = frame('standard')
    expect(standard.dataset.tierFrameState).toBe('hard-error')
    expect(within(standard).getByRole('alert').textContent).toBe('Aurora & Kp is unavailable.')
    expect(within(standard).getByRole('button', { name: 'Refresh Aurora & Kp' })).toBeTruthy()
    expectBoundedFrame(standard)
  })
})
