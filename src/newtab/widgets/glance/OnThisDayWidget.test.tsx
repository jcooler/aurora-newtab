// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react'
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

async function seededStorage(
  data: OnThisDayData | null = DATA,
  fetchedAt = NOW,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { onThisDay: CONFIG })
  if (data) {
    await storage.set('connectorSnapshots', {
      onThisDay: {
        scope: await connectorSnapshotScope('onThisDay', CONFIG, '2026-08-22'),
        fetchedAt,
        data,
      },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, props: { canvasSize?: 'compact' | 'standard' | 'full'; docked?: boolean } = {}) {
  return render(<StorageProvider storage={storage}><OnThisDayWidget {...props} /></StorageProvider>)
}

function frame(tier: 'compact' | 'standard' | 'full'): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-tier-frame="${tier}"]`)
  expect(element, `missing ${tier} On This Day frame`).toBeTruthy()
  return element!
}

function expectAuthoredFrame(element: HTMLElement): void {
  expect(within(element).getAllByText('On This Day')).toHaveLength(1)
  expect(within(element).getAllByText('August 22')).toHaveLength(1)
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

describe('OnThisDayWidget', () => {
  it('authors Compact with one dated event, its year, and accessible full summary', async () => {
    mount(await seededStorage(), { canvasSize: 'compact' })
    await screen.findByText('Historical event 0')

    const compact = frame('compact')
    expectAuthoredFrame(compact)
    expect(within(compact).getByText('1969')).toBeTruthy()
    expect(within(compact).getByRole('link', { name: 'Historical event 0' })).toBeTruthy()
    expect(within(compact).queryByText('Historical event 1')).toBeNull()
    const provider = within(compact).getByRole('link', { name: 'More on Wikipedia' })
    expect(provider.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/August_22')
  })

  it('authors Standard with exactly three dated events and one provider destination', async () => {
    mount(await seededStorage(), { canvasSize: 'standard' })
    await screen.findByText('Historical event 2')

    const standard = frame('standard')
    expectAuthoredFrame(standard)
    expect(within(standard).getAllByRole('listitem')).toHaveLength(3)
    expect(within(standard).getByText('1967')).toBeTruthy()
    expect(within(standard).queryByText('Historical event 3')).toBeNull()
    expect(within(standard).getAllByRole('link', { name: 'More on Wikipedia' })).toHaveLength(1)
  })

  it('visually clamps a long Compact event to two lines without truncating its accessible text', async () => {
    const text = 'A deliberately long historical event whose full provider text remains available while the compact card stays at two visual lines.'
    mount(await seededStorage({ ...DATA, events: [{ year: 1969, text, url: 'https://en.wikipedia.org/wiki/Apollo_11' }] }), { canvasSize: 'compact' })
    const link = await screen.findByRole('link', { name: text })
    expect(link.className).toContain('[-webkit-line-clamp:2]')
    expect(link.getAttribute('title')).toBe(text)
  })

  it('authors Full with three events, one birth, one death, and no local overflow', async () => {
    mount(await seededStorage(), { canvasSize: 'full' })
    await screen.findByText('Historical event 2')

    const full = frame('full')
    expectAuthoredFrame(full)
    expect(within(full).queryByText('Historical event 3')).toBeNull()
    expect(within(full).getByRole('region', { name: 'Born on this day' })).toBeTruthy()
    expect(within(full).getByRole('region', { name: 'Died on this day' })).toBeTruthy()
    expect(within(full).getByText('1900')).toBeTruthy()
    expect(within(full).getByText('Notable birth')).toBeTruthy()
    expect(within(full).getByText('1800')).toBeTruthy()
    expect(within(full).getByText('Notable death')).toBeTruthy()
    expect(within(full).getAllByRole('link', { name: 'More on Wikipedia' })).toHaveLength(1)
    expect(within(full).getByRole('link', { name: 'Historical event 0' }).className).toContain('[-webkit-line-clamp:2]')
    expect(within(full).getByRole('link', { name: 'Historical event 0' }).className).toContain('min-h-9')
    expect(within(full).getByRole('link', { name: 'More on Wikipedia' }).className).toContain('min-h-9')
  })

  it('opens the same contextual rows from one dense Docked line', async () => {
    mount(await seededStorage(), { docked: true })
    const trigger = await screen.findByRole('button', { name: 'On This Day: 1969, Historical event 0' })
    await act(async () => { trigger.click() })
    expect(screen.getByRole('dialog', { name: 'On This Day details' })).toBeTruthy()
    expect(screen.getByText('Historical event 2')).toBeTruthy()
    expect(screen.getByText('From Wikipedia')).toBeTruthy()
  })
})

describe('OnThisDayWidget tier frame states', () => {
  it('keeps Standard loading inside the selected frame with a named state', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    mount(await seededStorage(null), { canvasSize: 'standard' })
    await screen.findByText('Loading On This Day…')

    const standard = frame('standard')
    expect(standard.dataset.tierFrameState).toBe('loading')
    expect(standard.querySelector('[data-on-this-day-skeleton]')).toBeTruthy()
    expect(within(standard).getByRole('status').textContent).toBe('Loading On This Day…')
    expectAuthoredFrame(standard)
  })

  it('keeps Standard empty inside the selected frame with a named state', async () => {
    mount(await seededStorage({ ...DATA, events: [], births: [], deaths: [] }), { canvasSize: 'standard' })
    await screen.findByText('No event returned for today.')

    const standard = frame('standard')
    expect(standard.dataset.tierFrameState).toBe('empty')
    expect(within(standard).getByRole('status').textContent).toBe('No event returned for today.')
    expectAuthoredFrame(standard)
  })

  it('keeps retained rows through stale and retained-error states and clears only its snapshot on retry', async () => {
    let rejectRefresh: ((reason: Error) => void) | undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((_resolve, reject) => {
      rejectRefresh = reject
    })))
    const storage = await seededStorage(DATA, NOW - 25 * 60 * 60_000)
    const unrelated = { scope: 'keep-public-holidays', fetchedAt: NOW, data: { marker: 'keep' } }
    await storage.update('connectorSnapshots', (previous) => ({
      ...previous,
      publicHolidays: unrelated,
    }))
    mount(storage, { canvasSize: 'standard' })
    await screen.findByText('Historical event 1')

    const standard = frame('standard')
    expect(standard.dataset.tierFrameState).toBe('stale')
    expect(within(standard).queryByText('Historical event 2')).toBeNull()
    expect(within(standard).getByRole('status').textContent).toBe('Showing saved data while On This Day refreshes.')
    expectAuthoredFrame(standard)

    await act(async () => {
      rejectRefresh?.(new Error('provider unavailable'))
      await Promise.resolve()
    })
    await waitFor(() => expect(standard.dataset.tierFrameState).toBe('stale'))
    expect(within(standard).getByText('Historical event 0')).toBeTruthy()
    expect(within(standard).getByRole('status').textContent).toBe('On This Day is unavailable.')

    await act(async () => {
      within(standard).getByRole('button', { name: 'Refresh On This Day' }).click()
      await Promise.resolve()
    })
    const snapshots = await storage.get('connectorSnapshots')
    expect(snapshots.onThisDay).toBeUndefined()
    expect(snapshots.publicHolidays).toEqual(unrelated)
  })

  it('keeps Standard hard error inside the selected frame with the existing retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')))
    mount(await seededStorage(null), { canvasSize: 'standard' })
    await screen.findByRole('alert')

    const standard = frame('standard')
    expect(standard.dataset.tierFrameState).toBe('hard-error')
    expect(within(standard).getByRole('alert').textContent).toBe('On This Day is unavailable.')
    expect(within(standard).getByRole('button', { name: 'Refresh On This Day' })).toBeTruthy()
    expectAuthoredFrame(standard)
  })
})
