// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react'
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

const MANY_HOLIDAYS: PublicHolidaysData = {
  countryCode: 'US',
  year: 2026,
  holidays: [
    { date: '2026-12-21', name: 'Current One', localName: 'Current One' },
    { date: '2026-12-22', name: 'Current Two', localName: 'Current Two' },
    { date: '2026-12-23', name: 'Current Three', localName: 'Current Three' },
    { date: '2027-01-01', name: 'Next One', localName: 'Next One' },
    { date: '2027-02-01', name: 'Next Two', localName: 'Next Two' },
    { date: '2027-03-01', name: 'Next Three', localName: 'Next Three' },
  ],
}

vi.mock('../../../lib/hooks/useLocalDay', () => ({
  useLocalDay: () => ({ key: '2026-12-20', timeZone: 'America/New_York', now: new Date(NOW) }),
}))

async function seededStorage(
  data: PublicHolidaysData | null = DATA,
  config = CONFIG,
  fetchedAt = NOW,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { publicHolidays: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      publicHolidays: {
        scope: await connectorSnapshotScope('publicHolidays', config, '2026-12-20'),
        fetchedAt,
        data,
      },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, props: { canvasSize?: 'compact' | 'standard' | 'full'; docked?: boolean } = {}) {
  return render(<StorageProvider storage={storage}><PublicHolidaysWidget {...props} /></StorageProvider>)
}

function frame(tier: 'compact' | 'standard' | 'full'): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-tier-frame="${tier}"]`)
  expect(element, `missing ${tier} Public Holidays frame`).toBeTruthy()
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

  it('authors a bounded Full signature across current and next year with a provider path', async () => {
    mount(await seededStorage(MANY_HOLIDAYS), { canvasSize: 'full' })
    await screen.findByText('Next Two')

    const full = frame('full')
    expect(full.dataset.tierFrameState).toBe('ready')
    expectBoundedFrame(full)
    expect(within(full).getAllByRole('listitem')).toHaveLength(4)
    expect(within(full).getByText('Current One')).toBeTruthy()
    expect(within(full).getByText('Current Two')).toBeTruthy()
    expect(within(full).queryByText('Current Three')).toBeNull()
    expect(within(full).getByText('Next One')).toBeTruthy()
    expect(within(full).getByText('Next Two')).toBeTruthy()
    expect(within(full).queryByText('Next Three')).toBeNull()
    expect(within(full).getByRole('link', { name: 'Open Nager.Date' }).getAttribute('href')).toBe('https://date.nager.at')
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

describe('PublicHolidaysWidget tier frame states', () => {
  it('keeps loading and empty inside the selected exact frame', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const loadingView = mount(await seededStorage(null), { canvasSize: 'standard' })
    await screen.findByText('Loading Public Holidays…')
    expect(frame('standard').dataset.tierFrameState).toBe('loading')
    expectBoundedFrame(frame('standard'))
    loadingView.unmount()

    mount(await seededStorage({ ...DATA, holidays: [] }), { canvasSize: 'standard' })
    await screen.findByText('No upcoming national holidays returned for US.')
    expect(frame('standard').dataset.tierFrameState).toBe('empty')
    expectBoundedFrame(frame('standard'))
  })

  it('keeps retained holiday names and dates through stale and partial states', async () => {
    const rejectRefresh: Array<(reason: Error) => void> = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((_resolve, reject) => {
      rejectRefresh.push(reject)
    })))
    mount(await seededStorage(DATA, CONFIG, NOW - 25 * 60 * 60_000), { canvasSize: 'standard' })
    await screen.findByText('Christmas Day')

    const standard = frame('standard')
    expect(standard.dataset.tierFrameState).toBe('stale')
    const holidayRows = within(standard).getAllByRole('listitem')
    expect(holidayRows).toHaveLength(3)
    expect(holidayRows.every((row) => row.getAttribute('data-holiday-row-layout') === 'dense')).toBe(true)
    expect(within(standard).getByText(/Dec 25/)).toBeTruthy()
    expect(within(standard).getByText('Local Civic Day')).toBeTruthy()
    const provider = within(standard).getByRole('link', { name: 'Open Nager.Date' })
    expect(provider.parentElement?.getAttribute('data-holiday-context-layout')).toBe('dense')
    expect(within(standard).getByRole('status').textContent).toBe('Showing saved data while Public Holidays refreshes.')
    expectBoundedFrame(standard)

    await act(async () => {
      rejectRefresh.forEach((reject) => reject(new Error('provider unavailable')))
      await Promise.resolve()
    })
    await waitFor(() => expect(standard.dataset.tierFrameState).toBe('partial'))
    expect(within(standard).getByText('Christmas Day')).toBeTruthy()
    expect(within(standard).getByText(/Dec 25/)).toBeTruthy()
    expect(within(standard).getByRole('status').textContent).toBe('Public Holidays is unavailable.')
  })

  it('keeps a hard error and retry inside the selected exact frame', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')))
    mount(await seededStorage(null), { canvasSize: 'standard' })
    await screen.findByRole('alert')

    const standard = frame('standard')
    expect(standard.dataset.tierFrameState).toBe('hard-error')
    expect(within(standard).getByRole('alert').textContent).toBe('Public Holidays is unavailable.')
    expect(within(standard).getByRole('button', { name: 'Refresh Public Holidays' })).toBeTruthy()
    expectBoundedFrame(standard)
  })
})
