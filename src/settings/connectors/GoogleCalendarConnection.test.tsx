// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AccountProvider } from '../../account/AccountContext'
import type { AccountClient } from '../../account/client'
import { localAccountClient } from '../../account/localAccountClient'
import type { AccountSnapshot } from '../../account/types'
import { createStorage } from '../../lib/storage'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import { GOOGLE_CALENDAR_SCOPES } from '../../providers/connections'
import type { ProviderGateway } from '../../providers/gateway'
import type { ProviderConnection, ProviderConnectionsState } from '../../providers/types'
import type { GoogleCalendarConfig } from '../../services/connectors/types'
import GoogleCalendarConnection from './GoogleCalendarConnection'

const now = Date.parse('2026-09-03T16:00:00.000Z')
const accountId = '43000000-0000-4000-8000-000000000001'
const connectionId = '63000000-0000-4000-8000-000000000001'

function account(entitled = true, id = accountId): AccountSnapshot {
  return {
    mode: 'signed_in', accountId: id, email: 'alex@example.test', displayName: 'Alex',
    billing: { state: entitled ? 'complimentary' : 'none', plan: null, currentPeriodEnd: null, courtesyEnd: null, cancelAtPeriodEnd: false, introductoryEligible: false },
    lease: entitled ? {
      verification: 'verified', leaseVersion: 1, keyId: 'test', leaseId: 'lease', accountId: id,
      capabilities: ['multi_account', 'google_calendar', 'metrics_history'], grantSources: ['complimentary_owner'],
      issuedAt: 0, expiresAt: now + 365 * 86_400_000,
    } : null,
    sync: { enabled: false, phase: 'disabled', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152 },
    devices: [],
  }
}

function connection(
  id = connectionId,
  email = 'alex@example.test',
  status: ProviderConnection['status'] = 'active',
): ProviderConnection {
  return {
    connectionId: id,
    provider: 'google_calendar',
    accountKind: null,
    displayEmail: email,
    displayName: 'Alex',
    status,
    grantedScopes: GOOGLE_CALENDAR_SCOPES,
    createdAt: now - 60_000,
    updatedAt: now,
  }
}

function state(connections: readonly ProviderConnection[] = [connection()]): ProviderConnectionsState {
  return { accountId, connections }
}

function gateway(overrides: Partial<ProviderGateway> = {}): ProviderGateway {
  return {
    listConnections: vi.fn(async () => ({ ok: true as const, value: state() })),
    connect: vi.fn(async () => ({ ok: true as const, value: state() })),
    getSession: vi.fn(async (id) => ({
      ok: true as const,
      value: { connectionId: id, provider: 'google_calendar' as const, accessToken: 'provider-token', expiresAt: now + 3_600_000 },
    })),
    disconnect: vi.fn(async () => ({ ok: true as const, value: { revocationConfirmed: true, remainingConnections: 0 } })),
    clearMemory: vi.fn(),
    ...overrides,
  }
}

function client(snapshot: AccountSnapshot, providerGateway: ProviderGateway): AccountClient {
  return {
    getSnapshot: vi.fn(async () => snapshot),
    subscribe: vi.fn(() => () => {}),
    actions: localAccountClient.actions,
    syncGateway: null,
    providerGateways: { google_calendar: providerGateway },
  }
}

function calendarList(): Response {
  return new Response(JSON.stringify({
    items: [
      {
        id: 'primary', summary: 'Alex', primary: true, selected: true, accessRole: 'owner',
        backgroundColor: '#4285f4', foregroundColor: '#ffffff',
      },
      {
        id: 'family@example.test', summary: 'Family', accessRole: 'reader',
        backgroundColor: '#0b8043', foregroundColor: '#ffffff',
      },
    ],
  }), { headers: { 'content-type': 'application/json' } })
}

function configured(id = accountId): GoogleCalendarConfig {
  return {
    enabled: true,
    accountId: id,
    accounts: [{
      connectionId,
      displayEmail: 'alex@example.test',
      calendars: [{ calendarId: 'primary', name: 'Alex', color: '#4285f4', primary: true }],
    }],
  }
}

async function setup({
  snapshot = account(),
  providerGateway = gateway(),
  config,
  fetchFn = vi.fn<typeof fetch>().mockResolvedValue(calendarList()),
  onShowPremiumPlans = vi.fn(),
  closeEditor = vi.fn(),
  deleteMetricsHistory = vi.fn(async () => undefined),
}: {
  snapshot?: AccountSnapshot
  providerGateway?: ProviderGateway
  config?: GoogleCalendarConfig
  fetchFn?: typeof fetch
  onShowPremiumPlans?: () => void
  closeEditor?: () => void
  deleteMetricsHistory?: (connectionId: string) => Promise<void>
} = {}) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', {
    ics: { enabled: true, calendars: [{ name: 'Personal ICS', url: 'https://example.test/calendar.ics' }] },
    ...(config ? { googleCalendar: config } : {}),
  })
  await act(async () => {
    render(
      <StorageProvider storage={storage}>
        <AccountProvider client={client(snapshot, providerGateway)}>
          <GoogleCalendarConnection
            config={config}
            storage={storage}
            mode={config ? 'edit' : 'setup'}
            closeEditor={closeEditor}
            onShowPremiumPlans={onShowPremiumPlans}
            fetchFn={fetchFn}
            deleteMetricsHistory={deleteMetricsHistory}
          />
        </AccountProvider>
      </StorageProvider>,
    )
    for (let index = 0; index < 12; index += 1) await Promise.resolve()
  })
  return { storage, providerGateway, fetchFn, onShowPremiumPlans, closeEditor, deleteMetricsHistory }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GoogleCalendarConnection', () => {
  it('shows the premium outcome without exposing a dead connect control', async () => {
    const onShowPremiumPlans = vi.fn()
    const providerGateway = gateway()
    await setup({ snapshot: account(false), providerGateway, onShowPremiumPlans })

    expect(screen.getByText('One calendar, across every Google account.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'See premium plans' }))
    expect(onShowPremiumPlans).toHaveBeenCalledTimes(1)
    expect(providerGateway.connect).not.toHaveBeenCalled()
  })

  it('opens Google from the activation, shows stable progress, and lets cancel win a late result', async () => {
    let resolve!: (value: Awaited<ReturnType<ProviderGateway['connect']>>) => void
    const pending = new Promise<Awaited<ReturnType<ProviderGateway['connect']>>>((done) => { resolve = done })
    const providerGateway = gateway({ connect: vi.fn(() => pending) })
    await setup({ providerGateway })

    const continueButton = screen.getByRole('button', { name: 'Continue with Google' })
    fireEvent.click(continueButton)
    expect(providerGateway.connect).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Opening Google…')).toBeTruthy()
    expect(screen.getByTestId('google-calendar-spinner')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Google connection' }))
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()

    await act(async () => resolve({ ok: true, value: state() }))
    expect(screen.queryByText('Choose calendars')).toBeNull()
  })

  it('shows calendar discovery separately and lets cancel ignore a late Google response', async () => {
    let resolve!: (value: Response) => void
    const fetchFn = vi.fn<typeof fetch>(() => new Promise<Response>((done) => { resolve = done }))
    await setup({ fetchFn })

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByText('Loading your calendars…')).toBeTruthy()
    expect(screen.getByText('Your Google account is connected.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel calendar loading' }))
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()

    await act(async () => resolve(calendarList()))
    expect(screen.queryByText('Choose calendars')).toBeNull()
  })

  it.each([
    ['popup_closed', 'Google’s window was closed before the connection finished.'],
    ['permission_denied', 'Chrome access was not granted. Nothing was connected.'],
  ] as const)('keeps a retryable consent screen for %s', async (code, message) => {
    await setup({ providerGateway: gateway({ connect: vi.fn(async () => ({ ok: false as const, code })) }) })
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
  })

  it('discovers calendars, defaults the primary calendar, and saves without changing free ICS', async () => {
    const { storage, providerGateway } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    const picker = await screen.findByRole('group', { name: 'Calendars for alex@example.test' })
    expect(screen.getByText('Choose calendars')).toBeTruthy()
    expect((within(picker).getByRole('checkbox', { name: 'Alex' }) as HTMLInputElement).checked).toBe(true)
    expect((within(picker).getByRole('checkbox', { name: 'Family' }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to Tab Two' }))

    await waitFor(async () => {
      const connectors = await storage.get('connectors')
      expect(connectors.googleCalendar).toMatchObject({
        enabled: true,
        accountId,
        accounts: [{
          connectionId,
          displayEmail: 'alex@example.test',
          calendars: [
            { calendarId: 'primary', name: 'Alex', color: '#4285f4', primary: true },
            { calendarId: 'family@example.test', name: 'Family', color: '#0b8043', primary: false },
          ],
        }],
      })
      expect(connectors.ics).toEqual({
        enabled: true,
        calendars: [{ name: 'Personal ICS', url: 'https://example.test/calendar.ics' }],
      })
    })
    expect(providerGateway.getSession).toHaveBeenCalledWith(connectionId)
    const summary = screen.getByRole('heading', { name: 'Your connected account' })
    expect(summary).toBeTruthy()
    expect(document.activeElement).toBe(summary)
    expect(screen.getByRole('status').textContent).toBe('Google Calendar is connected. 2 calendars now appear in Tab Two.')
  })

  it('does not replace an existing account when Add another account returns a duplicate', async () => {
    const providerGateway = gateway()
    const { storage } = await setup({ config: configured(), providerGateway })
    await screen.findByText('Your connected account')
    fireEvent.click(screen.getByRole('button', { name: 'Add another account' }))
    expect((await screen.findByRole('alert')).textContent).toContain('That Google account is already connected.')
    expect((await storage.get('connectors')).googleCalendar).toEqual(configured())
  })

  it('shows an add-account discovery failure without marking the healthy account as failed', async () => {
    const second = connection('63000000-0000-4000-8000-000000000002', 'work@example.test')
    await setup({
      config: configured(),
      providerGateway: gateway({ connect: vi.fn(async () => ({ ok: true as const, value: state([connection(), second]) })) }),
      fetchFn: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')),
    })
    await screen.findByText('Your connected account')

    fireEvent.click(screen.getByRole('button', { name: 'Add another account' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Calendars could not be loaded right now.')
    expect(screen.getByText('Up to date')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again for alex@example.test' })).toBeNull()
  })

  it('isolates reconnect attention to one account while leaving the healthy account current', async () => {
    const secondId = '63000000-0000-4000-8000-000000000002'
    const second = connection(secondId, 'work@example.test', 'reconnect_required')
    const config: GoogleCalendarConfig = {
      ...configured(),
      accounts: [
        configured().accounts[0]!,
        {
          connectionId: secondId,
          displayEmail: 'work@example.test',
          calendars: [{ calendarId: 'work', name: 'Work', color: '#7986cb', primary: true }],
        },
      ],
    }
    await setup({
      config,
      providerGateway: gateway({ listConnections: vi.fn(async () => ({ ok: true as const, value: state([connection(), second]) })) }),
    })

    await screen.findByText('work@example.test')
    expect(screen.getByText('Up to date')).toBeTruthy()
    expect(screen.getByText('Reconnect needed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reconnect work@example.test' })).toBeTruthy()
  })

  it('replaces the stale connection identity after reauthorization instead of adding a duplicate account', async () => {
    const replacementId = '63000000-0000-4000-8000-000000000002'
    const stale = connection(connectionId, 'alex@example.test', 'reconnect_required')
    const replacement = connection(replacementId, 'alex@example.test')
    const providerGateway = gateway({
      listConnections: vi.fn(async () => ({ ok: true as const, value: state([stale]) })),
      connect: vi.fn(async () => ({ ok: true as const, value: state([replacement]) })),
    })
    const { storage } = await setup({ config: configured(), providerGateway })
    await screen.findByText('Reconnect needed')

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect alex@example.test' }))
    await screen.findByText('Choose calendars')
    fireEvent.click(screen.getByRole('button', { name: 'Save calendars' }))

    await waitFor(async () => {
      const saved = (await storage.get('connectors')).googleCalendar as GoogleCalendarConfig
      expect(saved.accounts).toHaveLength(1)
      expect(saved.accounts[0]?.connectionId).toBe(replacementId)
    })
  })

  it('disconnects only the confirmed account and optionally deletes only its metric history', async () => {
    const providerGateway = gateway()
    const deleteMetricsHistory = vi.fn(async () => undefined)
    const { storage } = await setup({ config: configured(), providerGateway, deleteMetricsHistory })
    await screen.findByText('Your connected account')

    const remove = screen.getByRole('button', { name: 'Remove alex@example.test' })
    fireEvent.click(remove)
    const dialog = screen.getByRole('alertdialog', { name: 'Remove alex@example.test?' })
    expect(within(dialog).getByText(/does not change or delete anything in Google Calendar/i)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /also delete this account’s metrics history/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect account' }))

    await waitFor(() => expect(providerGateway.disconnect).toHaveBeenCalledWith(connectionId))
    expect(deleteMetricsHistory).toHaveBeenCalledWith(connectionId)
    expect((await storage.get('connectors')).googleCalendar).toBeUndefined()
    expect((await storage.get('connectors')).ics).toBeTruthy()
  })

  it('restores focus when disconnect is cancelled', async () => {
    await setup({ config: configured() })
    await screen.findByText('Your connected account')
    const remove = screen.getByRole('button', { name: 'Remove alex@example.test' })
    fireEvent.click(remove)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel disconnect' }))
    expect(document.activeElement).toBe(remove)
  })

  it('contains disconnect focus and closes only that confirmation with Escape', async () => {
    await setup({ config: configured() })
    await screen.findByText('Your connected account')
    const remove = screen.getByRole('button', { name: 'Remove alex@example.test' })
    fireEvent.click(remove)
    const dialog = screen.getByRole('alertdialog', { name: 'Remove alex@example.test?' })
    const checkbox = within(dialog).getByRole('checkbox', { name: /also delete this account’s metrics history/i })
    const disconnect = within(dialog).getByRole('button', { name: 'Disconnect account' })

    expect(document.activeElement).toBe(checkbox)
    disconnect.focus()
    fireEvent.keyDown(disconnect, { key: 'Tab' })
    expect(document.activeElement).toBe(checkbox)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(remove)
    expect(screen.getByText('Your connected account')).toBeTruthy()
  })

  it('keeps loading motion optional for people who request reduced motion', async () => {
    let resolve!: (value: Awaited<ReturnType<ProviderGateway['connect']>>) => void
    const pending = new Promise<Awaited<ReturnType<ProviderGateway['connect']>>>((done) => { resolve = done })
    await setup({ providerGateway: gateway({ connect: vi.fn(() => pending) }) })

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(screen.getByTestId('google-calendar-spinner').className).toContain('motion-reduce:animate-none')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Google connection' }))
    await act(async () => resolve({ ok: true, value: state() }))
  })

  it('keeps saved selections visible locally when premium access is paused', async () => {
    const onShowPremiumPlans = vi.fn()
    await setup({ snapshot: account(false), config: configured(), onShowPremiumPlans })

    expect(screen.getByText('Your Google calendars are saved.')).toBeTruthy()
    expect(screen.getByText('Premium access paused · 1 saved account')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'See premium plans' }))
    expect(onShowPremiumPlans).toHaveBeenCalledTimes(1)
  })

  it('never reveals another Tab Two account’s saved Google selections', async () => {
    await setup({ snapshot: account(true, '43000000-0000-4000-8000-000000000002'), config: configured() })
    expect(screen.queryByText('alex@example.test')).toBeNull()
    expect(screen.getByText('Choose what appears in Tab Two.')).toBeTruthy()
  })
})
