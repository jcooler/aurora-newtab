// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
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

async function seededStorage(data: AuroraKpData = DATA): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { auroraKp: CONFIG })
  await storage.set('connectorSnapshots', {
    auroraKp: { scope: await connectorSnapshotScope('auroraKp', CONFIG), fetchedAt: NOW, data },
  })
  return storage
}

function mount(storage: AuroraStorage, props: { canvasSize?: 'compact' | 'standard' | 'full'; docked?: boolean } = {}) {
  return render(<StorageProvider storage={storage}><AuroraKpWidget {...props} /></StorageProvider>)
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

  it('uses Full for the bounded three-day forecast grouped by local day', async () => {
    mount(await seededStorage(), { canvasSize: 'full' })
    expect(await screen.findAllByTestId('kp-forecast-row')).toHaveLength(5)
    expect(screen.getAllByRole('region', { name: /Kp forecast/i }).length).toBeGreaterThan(0)
    expect(document.querySelector('[data-work-widget-scroll]')?.className).toContain('overflow-y-auto')
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
