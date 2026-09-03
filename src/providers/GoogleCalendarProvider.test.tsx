// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { AccountProvider } from '../account/AccountContext'
import { localAccountClient } from '../account/localAccountClient'
import type { AccountClient } from '../account/client'
import type { AccountSnapshot } from '../account/types'
import { createStorage } from '../lib/storage'
import { memoryDriver } from '../lib/storage/driver'
import { StorageProvider } from '../lib/storage/context'
import { __resetInFlight } from '../lib/hooks/useConnectorSnapshot'
import { connectorSnapshotScope } from '../services/connectors/snapshotIdentity'
import { resolvedLocalTimeZone } from '../lib/dates'
import CalendarWidget from '../newtab/widgets/calendar/CalendarWidget'
import type { ProviderGateway } from './gateway'
import {
  GoogleCalendarProvider,
  googleCalendarRetryDelay,
  googleCalendarWindow,
  useGoogleCalendar,
} from './GoogleCalendarProvider'

const now = Date.parse('2026-03-08T16:00:00.000Z')
const accountId = '43000000-0000-4000-8000-000000000001'
const connectionId = '63000000-0000-4000-8000-000000000001'

beforeAll(() => {
  const digest = vi.fn(async (_algorithm: AlgorithmIdentifier, source: BufferSource) => {
    const bytes = source instanceof ArrayBuffer
      ? new Uint8Array(source)
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    const output = new Uint8Array(32)
    bytes.forEach((byte, index) => {
      const slot = index % output.length
      output[slot] = ((output[slot] ?? 0) * 33 + byte + index) & 0xff
    })
    return output.buffer
  })
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    value: { digest },
  })
})

function snapshot(expiresAt = now + 86_400_000): AccountSnapshot {
  return {
    mode: 'signed_in', accountId, email: 'alex@example.test', displayName: 'Alex',
    billing: { state: 'complimentary', plan: null, currentPeriodEnd: null, courtesyEnd: null, cancelAtPeriodEnd: false, introductoryEligible: false },
    lease: {
      verification: 'verified', leaseVersion: 1, keyId: 'test', leaseId: 'lease', accountId,
      capabilities: ['multi_account', 'google_calendar'], grantSources: ['complimentary_owner'],
      issuedAt: now - 1_000, expiresAt,
    },
    sync: { enabled: false, phase: 'disabled', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152 },
    devices: [],
  }
}

function gateway(getSession = vi.fn(async () => ({
  ok: true as const,
  value: { connectionId, provider: 'google_calendar' as const, accessToken: 'provider-token', expiresAt: now + 3_600_000 },
}))): ProviderGateway {
  return {
    listConnections: vi.fn(), connect: vi.fn(), getSession,
    disconnect: vi.fn(), clearMemory: vi.fn(),
  }
}

function client(account: AccountSnapshot, providerGateway: ProviderGateway): AccountClient {
  return {
    getSnapshot: vi.fn(async () => account), subscribe: vi.fn(() => () => {}),
    actions: localAccountClient.actions,
    syncGateway: null,
    providerGateways: { google_calendar: providerGateway },
  }
}

function Probe() {
  const state = useGoogleCalendar()
  return <output>{JSON.stringify({
    entitled: state.entitled,
    calendars: state.snapshot?.calendars.length ?? 0,
    issues: state.snapshot?.connectionIssues?.length ?? 0,
    refreshing: state.refreshing,
  })}</output>
}

function StatefulProbe() {
  const [count, setCount] = useState(0)
  return <button type="button" onClick={() => setCount((current) => current + 1)}>State {count}</button>
}

function cachedGoogleSnapshot() {
  return {
    version: 1 as const,
    fetchedAt: now - 60_000,
    calendars: [{
      connectionId, calendarId: 'primary', color: '#4285f4',
      windowStart: now - 86_400_000, windowEnd: now + 86_400_000, syncToken: 'sync',
      events: [{
        eventId: 'planning', title: 'Planning review', status: 'confirmed' as const,
        start: now + 60 * 60_000, end: now + 90 * 60_000,
        allDay: false, startDate: null, endDate: null, updatedAt: now - 60_000,
      }],
    }],
  }
}

async function setup(
  children: ReactNode,
  account = snapshot(),
  providerGateway = gateway(),
  seed?: (storage: ReturnType<typeof createStorage>) => Promise<void>,
) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', {
    googleCalendar: {
      enabled: true,
      accountId,
      accounts: [{
        connectionId,
        displayEmail: 'alex@example.test',
        calendars: [{ calendarId: 'primary', name: 'Alex', color: '#4285f4', primary: true }],
      }],
    },
  })
  await seed?.(storage)
  let view!: ReturnType<typeof render>
  await act(async () => {
    view = render(
      <StorageProvider storage={storage}>
        <AccountProvider client={client(account, providerGateway)}>
          {children}
        </AccountProvider>
      </StorageProvider>,
    )
    for (let index = 0; index < 32; index += 1) await Promise.resolve()
  })
  return { storage, view }
}

describe('GoogleCalendarProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    __resetInFlight()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: vi.fn(async (_name: string, _options: unknown, work: () => Promise<void>) => work()) },
    })
  })
  afterEach(() => {
    __resetInFlight()
    vi.useRealTimers()
  })

  it('computes the 31-day-before and 61-day-after local window across DST', () => {
    const window = googleCalendarWindow(now, 'America/New_York')
    const key = (instant: number) => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(instant)
    expect(key(window.start)).toBe('2026-02-05')
    expect(key(window.end - 1)).toBe('2026-05-08')
    expect(window.end - window.start).not.toBe(93 * 86_400_000)
  })

  it('jitters retries within the bounded 1 to 30 second window', () => {
    expect(googleCalendarRetryDelay(30_000, () => 0)).toBe(20_000)
    expect(googleCalendarRetryDelay(30_000, () => 0.5)).toBe(25_000)
    expect(googleCalendarRetryDelay(30_000, () => 1)).toBe(30_000)
    expect(googleCalendarRetryDelay(1_000, () => 0)).toBe(1_000)
  })

  it('does not remount the application when Google Calendar becomes configured', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ items: [], nextSyncToken: 'sync' }), {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
    await act(async () => {
      render(
        <StorageProvider storage={storage}>
          <AccountProvider client={client(snapshot(), gateway())}>
            <GoogleCalendarProvider fetchFn={fetchFn}><StatefulProbe /></GoogleCalendarProvider>
          </AccountProvider>
        </StorageProvider>,
      )
      for (let index = 0; index < 16; index += 1) await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: 'State 0' }))

    await act(async () => {
      await storage.set('connectors', {
        googleCalendar: {
          enabled: true,
          accountId,
          accounts: [{
            connectionId,
            displayEmail: 'alex@example.test',
            calendars: [{ calendarId: 'primary', name: 'Alex', color: '#4285f4', primary: true }],
          }],
        },
      })
      for (let index = 0; index < 32; index += 1) await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'State 1' })).toBeTruthy()
  })

  it('does not request a provider session while the document is hidden, then refreshes on visibility', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    const getSession = vi.fn(async () => ({
      ok: true as const,
      value: { connectionId, provider: 'google_calendar' as const, accessToken: 'provider-token', expiresAt: now + 3_600_000 },
    }))
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ items: [], nextSyncToken: 'sync' }), {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
    await setup(<GoogleCalendarProvider fetchFn={fetchFn}><Probe /></GoogleCalendarProvider>, snapshot(), gateway(getSession))
    await act(async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve() })
    expect(getSession).not.toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      for (let index = 0; index < 20; index += 1) await Promise.resolve()
    })
    expect(screen.getByText(/"calendars":1/)).toBeTruthy()
    expect(getSession).toHaveBeenCalledWith(connectionId)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(navigator.locks.request).toHaveBeenCalledWith(
      expect.stringContaining('googleCalendar'), { mode: 'exclusive' }, expect.any(Function),
    )
  })

  it('retains cached data without a provider request after entitlement expires', async () => {
    const providerGateway = gateway()
    await setup(
      <GoogleCalendarProvider><Probe /></GoogleCalendarProvider>,
      snapshot(now),
      providerGateway,
      async (storage) => storage.set('connectorSnapshots', {
        googleCalendar: { fetchedAt: now - 60_000, data: cachedGoogleSnapshot() },
      }),
    )
    expect(screen.getByText(/"entitled":false/)).toBeTruthy()
    expect(screen.getByText(/"calendars":1/)).toBeTruthy()
    expect(providerGateway.getSession).not.toHaveBeenCalled()
  })

  it('honors Manual refresh for a retained scoped snapshot', async () => {
    const providerGateway = gateway()
    await setup(
      <GoogleCalendarProvider><Probe /></GoogleCalendarProvider>,
      snapshot(),
      providerGateway,
      async (storage) => {
        const config = (await storage.get('connectors')).googleCalendar!
        await storage.set('refreshPreferences', { googleCalendar: 'manual' })
        await storage.set('connectorSnapshots', {
          googleCalendar: {
            scope: await connectorSnapshotScope('googleCalendar', config, {
              accountId,
              timeZone: resolvedLocalTimeZone(),
            }),
            fetchedAt: now - 30 * 86_400_000,
            data: cachedGoogleSnapshot(),
          },
        })
      },
    )
    expect(screen.getByText(/"calendars":1/)).toBeTruthy()
    expect(providerGateway.getSession).not.toHaveBeenCalled()
  })

  it('keeps a truthful offline snapshot and retries while the visible tab remains eligible', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    await setup(
      <GoogleCalendarProvider fetchFn={fetchFn}><Probe /></GoogleCalendarProvider>,
    )

    expect(screen.getByText(/"issues":1/)).toBeTruthy()
    expect(fetchFn).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
      for (let index = 0; index < 20; index += 1) await Promise.resolve()
    })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('shows Google source name and exact color in the existing Calendar after expiry', async () => {
    await setup(
      <GoogleCalendarProvider>
        <CalendarWidget stageVariant="standard" canvasSize="standard" layoutId="work" />
      </GoogleCalendarProvider>,
      snapshot(now),
      gateway(),
      async (storage) => {
        await storage.set('calendarPreferences', {
          work: { defaultView: 'agenda', includePublicHolidays: false },
        })
        await storage.set('connectorSnapshots', {
          googleCalendar: { fetchedAt: now - 60_000, data: cachedGoogleSnapshot() },
        })
      },
    )
    expect(screen.getByText('Planning review')).toBeTruthy()
    expect(screen.getByText('Alex · alex@example.test')).toBeTruthy()
    const dot = screen.getByText('Planning review').closest('li')?.querySelector<HTMLElement>('[data-calendar-color="#4285f4"]')
    expect(dot?.style.backgroundColor).toBe('rgb(66, 133, 244)')
  })
})
