// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AccountProvider } from '../account/AccountContext'
import type { AccountClient } from '../account/client'
import { localAccountClient } from '../account/localAccountClient'
import type { AccountSnapshot, PremiumCapability } from '../account/types'
import { resolvedLocalTimeZone } from '../lib/dates'
import { __resetInFlight } from '../lib/hooks/useConnectorSnapshot'
import { createStorage } from '../lib/storage'
import { StorageProvider } from '../lib/storage/context'
import { memoryDriver } from '../lib/storage/driver'
import { connectorSnapshotScope } from '../services/connectors/snapshotIdentity'
import type { MicrosoftCalendarConfig } from '../services/connectors/types'
import type { ProviderGateway } from './gateway'
import {
  MicrosoftCalendarProvider,
  microsoftCalendarRetryDelay,
  microsoftCalendarWindow,
  useMicrosoftCalendar,
} from './MicrosoftCalendarProvider'

const now = Date.parse('2026-03-08T16:00:00.000Z')
const accountId = '43000000-0000-4000-8000-000000000001'
const connectionId = '63000000-0000-4000-8000-000000000001'
const calendarId = 'work'
const deltaLink = `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/calendarView/delta?$deltatoken=done`

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
  Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: { digest } })
})

function account(
  capabilities: readonly PremiumCapability[] = ['multi_account', 'microsoft_calendar'],
  expiresAt = now + 86_400_000,
  id = accountId,
): AccountSnapshot {
  return {
    mode: 'signed_in', accountId: id, email: 'alex@example.test', displayName: 'Alex',
    billing: { state: 'complimentary', plan: null, currentPeriodEnd: null, courtesyEnd: null, cancelAtPeriodEnd: false, introductoryEligible: false },
    lease: {
      verification: 'verified', leaseVersion: 1, keyId: 'test', leaseId: 'lease', accountId: id,
      capabilities,
      grantSources: ['complimentary_owner'], issuedAt: now - 1_000, expiresAt,
    },
    sync: { enabled: false, phase: 'disabled', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152 },
    devices: [],
  }
}

function config(enabled = true): MicrosoftCalendarConfig {
  return {
    enabled,
    accountId,
    accounts: [{
      connectionId,
      displayEmail: 'alex@contoso.example',
      accountKind: 'work_or_school',
      calendars: [{ calendarId, name: 'Work', color: '#0078d4', isDefault: true }],
    }],
  }
}

function cachedSnapshot() {
  return {
    version: 1 as const,
    fetchedAt: now - 60_000,
    calendars: [{
      connectionId,
      calendarId,
      color: '#0078d4',
      windowStart: now - 86_400_000,
      windowEnd: now + 86_400_000,
      deltaLink,
      events: [{
        eventId: 'planning', title: 'Planning review', start: now + 60 * 60_000, end: now + 90 * 60_000,
        allDay: false, startDate: null, endDate: null, cancelled: false, showAs: 'busy' as const,
        sensitivity: 'normal' as const, eventType: 'singleInstance' as const, seriesMasterId: null,
        updatedAt: now - 60_000,
      }],
    }],
  }
}

function graphResponse(): Response {
  return new Response(JSON.stringify({ value: [], '@odata.deltaLink': deltaLink }), {
    headers: { 'content-type': 'application/json' },
  })
}

function gateway(getSession = vi.fn(async () => ({
  ok: true as const,
  value: { connectionId, provider: 'microsoft_calendar' as const, accessToken: 'provider-token', expiresAt: now + 3_600_000 },
}))): ProviderGateway {
  return {
    listConnections: vi.fn(), connect: vi.fn(), getSession,
    disconnect: vi.fn(), clearMemory: vi.fn(),
  }
}

function client(snapshot: AccountSnapshot, providerGateway: ProviderGateway | null): AccountClient {
  return {
    getSnapshot: vi.fn(async () => snapshot), subscribe: vi.fn(() => () => {}),
    actions: localAccountClient.actions, syncGateway: null,
    providerGateways: providerGateway ? { microsoft_calendar: providerGateway } : {},
  }
}

function Probe() {
  const state = useMicrosoftCalendar()
  return <output>{JSON.stringify({
    entitled: state.entitled,
    calendars: state.snapshot?.calendars.length ?? 0,
    issues: state.snapshot?.connectionIssues?.length ?? 0,
    refreshing: state.refreshing,
    lastError: state.lastError,
  })}</output>
}

async function setup({
  children = <Probe />,
  accountSnapshot = account(),
  providerGateway = gateway(),
  connectorConfig = config(),
  fetchFn = vi.fn<typeof fetch>().mockResolvedValue(graphResponse()),
  seed,
}: {
  children?: ReactNode
  accountSnapshot?: AccountSnapshot
  providerGateway?: ProviderGateway | null
  connectorConfig?: MicrosoftCalendarConfig
  fetchFn?: typeof fetch
  seed?: (storage: ReturnType<typeof createStorage>, connectorConfig: MicrosoftCalendarConfig) => Promise<void>
} = {}) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { microsoftCalendar: connectorConfig })
  await seed?.(storage, connectorConfig)
  let view!: ReturnType<typeof render>
  await act(async () => {
    view = render(
      <StorageProvider storage={storage}>
        <AccountProvider client={client(accountSnapshot, providerGateway)}>
          <MicrosoftCalendarProvider fetchFn={fetchFn} now={() => now}>{children}</MicrosoftCalendarProvider>
        </AccountProvider>
      </StorageProvider>,
    )
    for (let index = 0; index < 32; index += 1) await Promise.resolve()
  })
  return { storage, view, providerGateway, fetchFn }
}

describe('MicrosoftCalendarProvider', () => {
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

  it('computes the DST-safe 31-day-before and 61-day-after window', () => {
    const window = microsoftCalendarWindow(now, 'America/New_York')
    const key = (instant: number) => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(instant)
    expect(key(window.start)).toBe('2026-02-05')
    expect(key(window.end - 1)).toBe('2026-05-08')
    expect(window.end - window.start).not.toBe(93 * 86_400_000)
  })

  it('keeps retry jitter inside the approved 20 percent and 1 to 30 second bounds', () => {
    expect(microsoftCalendarRetryDelay(30_000, () => 0)).toBe(20_000)
    expect(microsoftCalendarRetryDelay(30_000, () => 0.5)).toBe(25_000)
    expect(microsoftCalendarRetryDelay(30_000, () => 1)).toBe(30_000)
    expect(microsoftCalendarRetryDelay(1_000, () => 0)).toBe(1_000)
  })

  it.each([
    ['disabled', account(), config(false)],
    ['account mismatch', account(['multi_account', 'microsoft_calendar'], now + 86_400_000, '43000000-0000-4000-8000-000000000002'), config()],
    ['capability absent', account(['multi_account']), config()],
    ['lease expired', account(['multi_account', 'microsoft_calendar'], now), config()],
  ])('does not request a provider session when %s', async (_label, accountSnapshot, connectorConfig) => {
    const providerGateway = gateway()
    await setup({ accountSnapshot, connectorConfig, providerGateway })
    expect(providerGateway.getSession).not.toHaveBeenCalled()
  })

  it('does not request a provider session before account hydration completes', async () => {
    let resolveSnapshot!: (value: AccountSnapshot) => void
    const pendingSnapshot = new Promise<AccountSnapshot>((resolve) => { resolveSnapshot = resolve })
    const providerGateway = gateway()
    const deferredClient: AccountClient = {
      getSnapshot: vi.fn(() => pendingSnapshot), subscribe: vi.fn(() => () => {}),
      actions: localAccountClient.actions, syncGateway: null,
      providerGateways: { microsoft_calendar: providerGateway },
    }
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { microsoftCalendar: config() })
    const view = render(
      <StorageProvider storage={storage}>
        <AccountProvider client={deferredClient}>
          <MicrosoftCalendarProvider now={() => now}><Probe /></MicrosoftCalendarProvider>
        </AccountProvider>
      </StorageProvider>,
    )
    await act(async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve() })
    expect(providerGateway.getSession).not.toHaveBeenCalled()
    view.unmount()
    resolveSnapshot(account())
  })

  it('uses one visible-document Web Lock owner and exposes pending state', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    let resolveSession!: (value: Awaited<ReturnType<ProviderGateway['getSession']>>) => void
    const getSession = vi.fn(() => new Promise<Awaited<ReturnType<ProviderGateway['getSession']>>>((resolve) => {
      resolveSession = resolve
    }))
    const providerGateway = gateway(getSession)
    await setup({ providerGateway })
    expect(getSession).not.toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      for (let index = 0; index < 12; index += 1) await Promise.resolve()
    })
    expect(screen.getByText(/"refreshing":true/)).toBeTruthy()
    expect(navigator.locks.request).toHaveBeenCalledWith(
      expect.stringContaining('microsoftCalendar'), { mode: 'exclusive' }, expect.any(Function),
    )

    await act(async () => {
      resolveSession({
        ok: true,
        value: { connectionId, provider: 'microsoft_calendar', accessToken: 'provider-token', expiresAt: now + 3_600_000 },
      })
      for (let index = 0; index < 24; index += 1) await Promise.resolve()
    })
    expect(screen.getByText(/"calendars":1/)).toBeTruthy()
  })

  it('retains cached data without a request when entitlement is inactive', async () => {
    const providerGateway = gateway()
    await setup({
      accountSnapshot: account(['multi_account', 'microsoft_calendar'], now),
      providerGateway,
      seed: async (storage) => storage.set('connectorSnapshots', {
        microsoftCalendar: { fetchedAt: now - 60_000, data: cachedSnapshot() },
      }),
    })
    expect(screen.getByText(/"entitled":false/)).toBeTruthy()
    expect(screen.getByText(/"calendars":1/)).toBeTruthy()
    expect(providerGateway.getSession).not.toHaveBeenCalled()
  })

  it('honors Manual refresh for a retained scoped snapshot', async () => {
    const providerGateway = gateway()
    await setup({
      providerGateway,
      seed: async (storage, connectorConfig) => {
        await storage.set('refreshPreferences', { microsoftCalendar: 'manual' })
        await storage.set('connectorSnapshots', {
          microsoftCalendar: {
            scope: await connectorSnapshotScope('microsoftCalendar', connectorConfig, {
              accountId, timeZone: resolvedLocalTimeZone(),
            }),
            fetchedAt: now - 30 * 86_400_000,
            data: cachedSnapshot(),
          },
        })
      },
    })
    expect(screen.getByText(/"calendars":1/)).toBeTruthy()
    expect(providerGateway.getSession).not.toHaveBeenCalled()
  })

  it('keeps a partial snapshot and retries while the visible document remains eligible', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    await setup({ fetchFn })
    expect(screen.getByText(/"issues":1/)).toBeTruthy()
    expect(fetchFn).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
      for (let index = 0; index < 20; index += 1) await Promise.resolve()
    })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
