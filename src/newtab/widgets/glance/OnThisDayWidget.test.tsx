// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import { createStorage, type AuroraStorage } from '../../../lib/storage'
import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver } from '../../../lib/storage/driver'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import type { OnThisDayData } from '../../../services/connectors/onThisDay'
import type { OnThisDayConfig } from '../../../services/connectors/types'
import OnThisDayWidget from './OnThisDayWidget'

const NOW = new Date(2026, 7, 22, 12).getTime()
const CONFIG: OnThisDayConfig = { enabled: true }
const EVENTS = Array.from({ length: 8 }, (_, index) => ({
  year: 1969 - index,
  text: `Historical event ${index}`,
  ...(index === 0 ? { url: 'https://en.wikipedia.org/wiki/Apollo_11' } : {}),
}))
const DATA: OnThisDayData = {
  dateKey: '08-22',
  events: EVENTS,
  births: [{ year: 1900, text: 'Notable birth' }],
  deaths: [{ year: 1800, text: 'Notable death' }],
}

vi.mock('../../../lib/hooks/useLocalDay', () => ({
  useLocalDay: () => ({ key: '2026-08-22', timeZone: 'America/New_York', now: new Date(NOW) }),
}))

async function seededStorage(data: OnThisDayData | null = DATA): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { onThisDay: CONFIG })
  if (data) {
    await storage.set('connectorSnapshots', {
      onThisDay: {
        scope: await connectorSnapshotScope('onThisDay', CONFIG, '2026-08-22'),
        fetchedAt: NOW,
        data,
      },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, props: { canvasSize?: 'compact' | 'standard' | 'full'; docked?: boolean } = {}) {
  return render(<StorageProvider storage={storage}><OnThisDayWidget {...props} /></StorageProvider>)
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

describe('OnThisDayWidget', () => {
  it('renders one event in Compact and three in Standard', async () => {
    const compact = mount(await seededStorage(), { canvasSize: 'compact' })
    expect(await screen.findByText('Historical event 0')).toBeTruthy()
    expect(screen.queryByText('Historical event 1')).toBeNull()
    compact.unmount()

    mount(await seededStorage(), { canvasSize: 'standard' })
    expect(await screen.findByText('Historical event 2')).toBeTruthy()
    expect(screen.queryByText('Historical event 3')).toBeNull()
    expect(screen.getByText('From Wikipedia')).toBeTruthy()
  })

  it('uses Full space for six events plus bounded births and deaths in local overflow', async () => {
    mount(await seededStorage(), { canvasSize: 'full' })
    expect(await screen.findByText('Historical event 5')).toBeTruthy()
    expect(screen.queryByText('Historical event 6')).toBeNull()
    expect(screen.getByText('Notable birth')).toBeTruthy()
    expect(screen.getByText('Notable death')).toBeTruthy()
    expect(document.querySelector('[data-work-widget-scroll]')?.className).toContain('overflow-y-auto')
  })

  it('opens the same contextual rows from one dense Docked line', async () => {
    mount(await seededStorage(), { docked: true })
    const trigger = await screen.findByRole('button', { name: 'On This Day: 1969, Historical event 0' })
    await act(async () => { trigger.click() })
    expect(screen.getByRole('dialog', { name: 'On This Day details' })).toBeTruthy()
    expect(screen.getByText('Historical event 2')).toBeTruthy()
    expect(screen.getByText('From Wikipedia')).toBeTruthy()
  })

  it('renders the provider empty state without a blank card', async () => {
    mount(await seededStorage({ ...DATA, events: [], births: [], deaths: [] }))
    expect(await screen.findByText('No event returned for today.')).toBeTruthy()
  })
})
