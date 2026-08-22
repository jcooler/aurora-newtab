// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import { createStorage, type AuroraStorage } from '../../../lib/storage'
import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver } from '../../../lib/storage/driver'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import type { PublicHolidaysData } from '../../../services/connectors/publicHolidays'
import type { PublicHolidaysConfig } from '../../../services/connectors/types'
import PublicHolidaysWidget from './PublicHolidaysWidget'

const NOW = new Date(2026, 11, 20, 12).getTime()
const CONFIG: PublicHolidaysConfig = { enabled: true, countryCode: 'US' }
const DATA: PublicHolidaysData = {
  countryCode: 'US',
  year: 2026,
  holidays: [
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day' },
    { date: '2027-01-01', name: "New Year's Day", localName: "New Year's Day" },
    { date: '2027-01-18', name: 'Civic Day', localName: 'Local Civic Day' },
    { date: '2027-02-01', name: 'Future Day', localName: 'Future Day' },
  ],
}

vi.mock('../../../lib/hooks/useLocalDay', () => ({
  useLocalDay: () => ({ key: '2026-12-20', timeZone: 'America/New_York', now: new Date(NOW) }),
}))

async function seededStorage(data: PublicHolidaysData | null = DATA, config = CONFIG): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { publicHolidays: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      publicHolidays: {
        scope: await connectorSnapshotScope('publicHolidays', config, '2026-12-20'),
        fetchedAt: NOW,
        data,
      },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, props: { canvasSize?: 'compact' | 'standard' | 'full'; docked?: boolean } = {}) {
  return render(<StorageProvider storage={storage}><PublicHolidaysWidget {...props} /></StorageProvider>)
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

describe('PublicHolidaysWidget', () => {
  it('shrinks malformed setup to an exact country instruction', async () => {
    mount(await seededStorage(null, { enabled: true, countryCode: '' }))
    expect(await screen.findByText('Choose a country in Settings.')).toBeTruthy()
  })

  it('shows the next holiday in Compact and three national holidays in Standard', async () => {
    const compact = mount(await seededStorage(), { canvasSize: 'compact' })
    expect(await screen.findByText('Christmas Day')).toBeTruthy()
    expect(screen.getByText('5 days away')).toBeTruthy()
    expect(screen.queryByText("New Year's Day")).toBeNull()
    compact.unmount()

    mount(await seededStorage(), { canvasSize: 'standard' })
    expect(await screen.findByText('Local Civic Day')).toBeTruthy()
    expect(screen.queryByText('Future Day')).toBeNull()
  })

  it('groups all Full rows by local month inside bounded overflow', async () => {
    mount(await seededStorage(), { canvasSize: 'full' })
    expect(await screen.findByRole('heading', { name: 'December 2026' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'January 2027' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'February 2027' })).toBeTruthy()
    expect(document.querySelector('[data-work-widget-scroll]')?.className).toContain('overflow-y-auto')
  })

  it('opens the same holiday context from Docked', async () => {
    mount(await seededStorage(), { docked: true })
    const trigger = await screen.findByRole('button', { name: 'Public Holidays: Christmas Day, Dec 25' })
    await act(async () => { trigger.click() })
    expect(screen.getByRole('dialog', { name: 'Public Holidays details' })).toBeTruthy()
    expect(screen.getByText("New Year's Day")).toBeTruthy()
    expect(screen.getByText('Country: US')).toBeTruthy()
  })
})
