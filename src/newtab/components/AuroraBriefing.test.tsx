// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import { defaults } from '../../lib/storage/schema'
import { resolvedLocalTimeZone } from '../../lib/dates'
import { connectorSnapshotScope } from '../../services/connectors/snapshotIdentity'
import { weatherRequestIdentity } from '../../services/weather/identity'
import type { IcsConfig } from '../../services/connectors/types'
import AuroraBriefing from './AuroraBriefing'

const NOW = new Date(2026, 7, 16, 12, 0).getTime()
const ICS_CONFIG: IcsConfig = {
  enabled: true,
  calendars: [{ name: 'Work', url: 'https://calendar.example/private-token/basic.ics' }],
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function renderBriefing({
  validScope = true,
  weatherAge = 0,
  briefingEnabled = true,
  withSignals = true,
}: {
  validScope?: boolean
  weatherAge?: number
  briefingEnabled?: boolean | 'absent'
  withSignals?: boolean
} = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  const storage = createStorage(memoryDriver())
  await storage.init()
  const scope = await connectorSnapshotScope('ics', ICS_CONFIG, { timeZone: resolvedLocalTimeZone() })
  const location = { label: 'New York', lat: 40.71, lon: -74.01, manual: true }
  const settings = { ...defaults().settings, use24Hour: false }
  if (briefingEnabled !== 'absent') settings.briefingEnabled = briefingEnabled
  await storage.setMany({
    settings,
    todoLists: withSignals ? [{ id: 'today', name: 'Today', items: [
      { id: '1', text: 'Ship', done: false },
      { id: '2', text: 'Done', done: true },
    ] }] : [],
    connectors: withSignals ? { ics: ICS_CONFIG } : {},
    connectorSnapshots: withSignals ? {
      ics: {
        scope: validScope ? scope : 'ics:v2:wrong',
        fetchedAt: NOW,
        data: { events: [{
          summary: 'Design review',
          // shouldAdvanceTime lets Testing Library's polling clock move. Keep
          // the fixture safely inside the formatter's floored 48-minute band.
          start: NOW + 48 * 60_000 + 30_000,
          end: NOW + 78 * 60_000 + 30_000,
          allDay: false,
          cal: 0,
          meetUrl: 'https://zoom.us/j/private-capability',
        }] },
      },
    } : {},
    location: withSignals ? location : null,
    weatherCache: withSignals ? {
      current: { tempC: 20, feelsLikeC: 20, code: 1, windKmh: 5, humidity: 40 },
      hourly: [{ time: '2026-08-16T19:00', tempC: 18, precipProb: 70, code: 61 }],
      fetchedAt: NOW - weatherAge,
      locationLabel: location.label,
      requestIdentity: weatherRequestIdentity(location.lat, location.lon),
    } : null,
  })
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  const view = render(<StorageProvider storage={storage}><AuroraBriefing /></StorageProvider>)
  await act(async () => {})
  return { storage, fetchSpy, ...view }
}

describe('AuroraBriefing local-only rendering', () => {
  it('renders nothing when the opt-in preference is absent or off and never rewrites Settings', async () => {
    for (const briefingEnabled of ['absent', false] as const) {
      const { container, storage, fetchSpy, unmount } = await renderBriefing({ briefingEnabled })
      expect(container.querySelector('[data-aurora-briefing]')).toBeNull()
      expect((await storage.get('settings')).briefingEnabled).toBe(briefingEnabled === 'absent' ? undefined : false)
      expect(fetchSpy).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('renders no empty briefing when enabled but no signal is useful', async () => {
    const { container } = await renderBriefing({ briefingEnabled: true, withSignals: false })
    await waitFor(() => expect(container.querySelector('[data-aurora-briefing]')).toBeNull())
    expect(container.textContent).not.toContain('Nothing urgent.')
  })

  it('renders deterministic 1/2/3 segment variants without initiating a request or exposing a capability URL', async () => {
    const { container, fetchSpy } = await renderBriefing()
    await waitFor(() => expect(container.querySelector('[data-briefing-display]')?.textContent).toContain('Design review'))

    expect(container.querySelector('[data-briefing-compact]')?.textContent).toBe('Design review in 48m')
    expect(container.querySelector('[data-briefing-standard]')?.textContent).toBe('Design review in 48m · 1 task needs attention')
    expect(container.querySelector('[data-briefing-display]')?.textContent).toBe('Design review in 48m · 1 task needs attention · Rain 7 PM')
    expect(container.textContent).not.toContain('private-token')
    expect(container.textContent).not.toContain('zoom.us')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('omits wrong-scope Calendar data and stale Weather while retaining local Tasks', async () => {
    const { container } = await renderBriefing({ validScope: false, weatherAge: 30 * 60_000 })
    await waitFor(() => expect(container.querySelector('[data-briefing-display]')?.textContent).toBe('1 task needs attention'))
  })

  it('reacts to local task storage updates without persistence side effects', async () => {
    const { container, storage, fetchSpy } = await renderBriefing()
    await waitFor(() => expect(container.querySelector('[data-briefing-standard]')?.textContent).toContain('1 task'))
    await act(async () => {
      await storage.set('todoLists', [{ id: 'today', name: 'Today', items: [] }])
    })
    await waitFor(() => expect(container.querySelector('[data-briefing-standard]')?.textContent).toBe('Design review in 48m · Rain 7 PM'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
