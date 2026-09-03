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
import { MICROSOFT_CALENDAR_SCOPES } from '../../providers/connections'
import type { ProviderGateway } from '../../providers/gateway'
import type { ProviderConnection, ProviderConnectionsState } from '../../providers/types'
import type { MicrosoftCalendarConfig } from '../../services/connectors/types'
import MicrosoftCalendarConnection from './MicrosoftCalendarConnection'

const now = Date.parse('2026-09-03T16:00:00.000Z')
const accountId = '42000000-0000-4000-8000-000000000001'
const personalId = '62000000-0000-4000-8000-000000000001'
const workId = '62000000-0000-4000-8000-000000000002'

function account(entitled = true): AccountSnapshot {
  return {
    mode: 'signed_in', accountId, email: 'alex@example.test', displayName: 'Alex',
    billing: { state: entitled ? 'complimentary' : 'none', plan: null, currentPeriodEnd: null, courtesyEnd: null, cancelAtPeriodEnd: false, introductoryEligible: false },
    lease: entitled ? {
      verification: 'verified', leaseVersion: 1, keyId: 'test', leaseId: 'lease', accountId,
      capabilities: ['multi_account', 'microsoft_calendar', 'metrics_history'], grantSources: ['complimentary_owner'],
      issuedAt: 0, expiresAt: now + 365 * 86_400_000,
    } : null,
    sync: { enabled: false, phase: 'disabled', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152 },
    devices: [],
  }
}

function connection(
  id = personalId,
  email = 'alex@outlook.test',
  accountKind: ProviderConnection['accountKind'] = 'personal',
  status: ProviderConnection['status'] = 'active',
): ProviderConnection {
  return {
    connectionId: id,
    provider: 'microsoft_calendar',
    accountKind,
    displayEmail: email,
    displayName: 'Alex',
    status,
    grantedScopes: MICROSOFT_CALENDAR_SCOPES,
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
      value: { connectionId: id, provider: 'microsoft_calendar' as const, accessToken: 'provider-token', expiresAt: now + 3_600_000 },
    })),
    disconnect: vi.fn(async () => ({ ok: true as const, value: { revocationConfirmed: false, remainingConnections: 0 } })),
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
    providerGateways: { microsoft_calendar: providerGateway },
  }
}

function calendarList(count = 2): Response {
  return new Response(JSON.stringify({
    value: Array.from({ length: count }, (_, index) => ({
      id: index === 0 ? 'default' : `calendar-${index}`,
      name: index === 0 ? 'Alex' : index === 1 ? 'Family' : `Calendar ${index + 1}`,
      color: index === 0 ? 'lightBlue' : 'lightGreen',
      hexColor: index === 0 ? '#0078d4' : '#0b8043',
      isDefaultCalendar: index === 0,
      canViewPrivateItems: index === 0,
    })),
  }), { headers: { 'content-type': 'application/json' } })
}

function configured(accounts: MicrosoftCalendarConfig['accounts'] = [{
  connectionId: personalId,
  displayEmail: 'alex@outlook.test',
  accountKind: 'personal',
  calendars: [{ calendarId: 'default', name: 'Alex', color: '#0078d4', isDefault: true }],
}]): MicrosoftCalendarConfig {
  return { enabled: true, accountId, accounts }
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
  config?: MicrosoftCalendarConfig
  fetchFn?: typeof fetch
  onShowPremiumPlans?: () => void
  closeEditor?: () => void
  deleteMetricsHistory?: (connectionId: string) => Promise<void>
} = {}) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', {
    ics: { enabled: true, calendars: [{ name: 'Personal ICS', url: 'https://example.test/calendar.ics' }] },
    googleCalendar: {
      enabled: true,
      accountId,
      accounts: [{
        connectionId: '63000000-0000-4000-8000-000000000001',
        displayEmail: 'google@example.test',
        calendars: [{ calendarId: 'primary', name: 'Google', color: '#4285f4', primary: true }],
      }],
    },
    ...(config ? { microsoftCalendar: config } : {}),
  })
  await act(async () => {
    render(
      <StorageProvider storage={storage}>
        <AccountProvider client={client(snapshot, providerGateway)}>
          <MicrosoftCalendarConnection
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

afterEach(() => vi.restoreAllMocks())

describe('MicrosoftCalendarConnection', () => {
  it('uses benefits-first read-only copy and gives a locked user one real primary action', async () => {
    const onShowPremiumPlans = vi.fn()
    const providerGateway = gateway()
    await setup({ snapshot: account(false), providerGateway, onShowPremiumPlans })

    expect(screen.getByText('Bring your Microsoft calendars together.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue with Microsoft' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'See premium plans' }))
    expect(onShowPremiumPlans).toHaveBeenCalledTimes(1)
    expect(providerGateway.connect).not.toHaveBeenCalled()
  })

  it('starts permission from the Connect activation, shows stable reduced-motion progress, and lets Cancel win', async () => {
    let resolve!: (result: Awaited<ReturnType<ProviderGateway['connect']>>) => void
    const pending = new Promise<Awaited<ReturnType<ProviderGateway['connect']>>>((done) => { resolve = done })
    const providerGateway = gateway({ connect: vi.fn(() => pending) })
    await setup({ providerGateway })

    expect(providerGateway.connect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Microsoft' }))
    expect(providerGateway.connect).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Opening Microsoft...')).toBeTruthy()
    expect(screen.getByTestId('microsoft-calendar-spinner').className).toContain('motion-reduce:animate-none')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Microsoft connection' }))
    expect(screen.getByRole('button', { name: 'Continue with Microsoft' })).toBeTruthy()

    await act(async () => resolve({ ok: true, value: state() }))
    expect(screen.queryByText('Choose calendars')).toBeNull()
  })

  it('recovers from a closed popup and renders organization approval as a distinct unsaved state', async () => {
    const popupGateway = gateway({ connect: vi.fn(async () => ({ ok: false as const, code: 'popup_closed' as const })) })
    const popup = await setup({ providerGateway: popupGateway })
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Microsoft' }))
    expect((await screen.findByRole('alert')).textContent).toContain('window was closed')
    popupGateway.connect = vi.fn(async () => ({ ok: false as const, code: 'organization_approval_required' as const }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Microsoft' }))

    expect(await screen.findByText('Your organization needs to approve Tab Two before this account can connect.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try another account' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to Microsoft Calendar' })).toBeTruthy()
    expect((await popup.storage.get('connectors')).microsoftCalendar).toBeUndefined()
  })

  it('separates discovery, defaults the Microsoft default calendar, supports keyboard selection, and preserves Google and ICS', async () => {
    let resolveCalendars!: (response: Response) => void
    const fetchFn = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => { resolveCalendars = resolve }))
    const { storage, providerGateway } = await setup({ fetchFn })
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Microsoft' }))
    expect(await screen.findByText('Loading your calendars...')).toBeTruthy()
    await act(async () => resolveCalendars(calendarList()))
    const picker = await screen.findByRole('group', { name: 'Calendars for alex@outlook.test' })
    const defaultCalendar = within(picker).getByRole('checkbox', { name: 'Alex' }) as HTMLInputElement
    expect(defaultCalendar.checked).toBe(true)
    const family = within(picker).getByRole('checkbox', { name: 'Family' }) as HTMLInputElement
    family.focus()
    fireEvent.keyDown(family, { key: ' ' })
    fireEvent.click(family)
    fireEvent.click(screen.getByRole('button', { name: 'Add to Tab Two' }))

    await waitFor(async () => {
      const connectors = await storage.get('connectors')
      expect(connectors.microsoftCalendar).toMatchObject({
        accounts: [{
          accountKind: 'personal',
          calendars: [
            { calendarId: 'default', isDefault: true },
            { calendarId: 'calendar-1', isDefault: false },
          ],
        }],
      })
      expect(connectors.googleCalendar).toBeTruthy()
      expect(connectors.ics).toBeTruthy()
    })
    expect(providerGateway.getSession).toHaveBeenCalledWith(personalId)
    expect(screen.getByText('Personal and work, clearly separated.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Personal and work, clearly separated.' }))
  })

  it('enforces ten calendars per account and twenty in total with real disabled choices', async () => {
    await setup({ fetchFn: vi.fn<typeof fetch>().mockResolvedValue(calendarList(12)) })
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Microsoft' }))
    const picker = await screen.findByRole('group', { name: 'Calendars for alex@outlook.test' })
    for (let index = 1; index < 10; index += 1) {
      fireEvent.click(within(picker).getByRole('checkbox', { name: index === 1 ? 'Family' : `Calendar ${index + 1}` }))
    }
    expect((within(picker).getByRole('checkbox', { name: 'Calendar 11' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('10 calendars selected')).toBeTruthy()
  })

  it('enforces the combined twenty-calendar limit across Microsoft accounts', async () => {
    const calendars = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({
      calendarId: `${prefix}-${index}`,
      name: `${prefix} ${index + 1}`,
      color: '#0078d4',
      isDefault: index === 0,
    }))
    const thirdId = '62000000-0000-4000-8000-000000000003'
    const config = configured([
      { connectionId: personalId, displayEmail: 'alex@outlook.test', accountKind: 'personal', calendars: calendars('Personal', 10) },
      { connectionId: workId, displayEmail: 'alex@contoso.test', accountKind: 'work_or_school', calendars: calendars('Work', 9) },
    ])
    const third = connection(thirdId, 'alex@another.test', 'personal')
    await setup({
      config,
      providerGateway: gateway({
        listConnections: vi.fn(async () => ({ ok: true as const, value: state([connection(), connection(workId, 'alex@contoso.test', 'work_or_school'), third]) })),
        connect: vi.fn(async () => ({ ok: true as const, value: state([connection(), connection(workId, 'alex@contoso.test', 'work_or_school'), third]) })),
      }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Add another Microsoft account' }))
    const picker = await screen.findByRole('group', { name: 'Calendars for alex@another.test' })
    expect((within(picker).getByRole('checkbox', { name: 'Alex' }) as HTMLInputElement).checked).toBe(true)
    expect((within(picker).getByRole('checkbox', { name: 'Family' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('1 calendar selected')).toBeTruthy()
  })

  it('shows a save spinner and retains the previous selection after local storage failure', async () => {
    const previous = configured()
    const setupResult = await setup({ config: previous })
    fireEvent.click(await screen.findByRole('button', { name: 'Manage alex@outlook.test' }))
    const picker = await screen.findByRole('group', { name: 'Calendars for alex@outlook.test' })
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Family' }))
    vi.spyOn(setupResult.storage, 'updateMany').mockRejectedValueOnce(new Error('disk'))
    fireEvent.click(screen.getByRole('button', { name: 'Save calendars' }))
    expect(screen.getByText('Saving...')).toBeTruthy()
    expect(await screen.findByText('Calendars were not saved. Your previous selection is unchanged.')).toBeTruthy()
    expect((await setupResult.storage.get('connectors')).microsoftCalendar).toEqual(previous)
  })

  it('labels personal and work accounts with text and isolates a reconnecting account', async () => {
    const work = connection(workId, 'alex@contoso.test', 'work_or_school', 'reconnect_required')
    const selection = configured([
      configured().accounts[0]!,
      { connectionId: workId, displayEmail: 'alex@contoso.test', accountKind: 'work_or_school', calendars: [{ calendarId: 'work', name: 'Team', color: '#7719aa', isDefault: true }] },
    ])
    await setup({ config: selection, providerGateway: gateway({ listConnections: vi.fn(async () => ({ ok: true as const, value: state([connection(), work]) })) }) })

    expect(await screen.findByText('PERSONAL')).toBeTruthy()
    expect(screen.getByText('WORK OR SCHOOL')).toBeTruthy()
    expect(screen.getByText('Alex')).toBeTruthy()
    expect(screen.getByText('Team')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reconnect alex@contoso.test' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Manage alex@outlook.test' })).toBeTruthy()
  })

  it('keeps one account healthy when another account discovery fails', async () => {
    const selection = configured([
      configured().accounts[0]!,
      { connectionId: workId, displayEmail: 'alex@contoso.test', accountKind: 'work_or_school', calendars: [{ calendarId: 'work', name: 'Team', color: '#7719aa', isDefault: true }] },
    ])
    const providerGateway = gateway({
      listConnections: vi.fn(async () => ({ ok: true as const, value: state([connection(), connection(workId, 'alex@contoso.test', 'work_or_school')]) })),
      getSession: vi.fn(async (id) => id === workId
        ? ({ ok: false as const, code: 'rate_limited' as const })
        : ({ ok: true as const, value: { connectionId: id, provider: 'microsoft_calendar' as const, accessToken: 'provider-token', expiresAt: now + 3_600_000 } })),
    })
    await setup({ config: selection, providerGateway })
    fireEvent.click(await screen.findByRole('button', { name: 'Manage alex@contoso.test' }))
    expect(await screen.findByText('Microsoft is receiving too many requests right now. Try again shortly.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Manage alex@outlook.test' })).toBeTruthy()
    expect(screen.getByText('Up to date')).toBeTruthy()
  })

  it('explains retained data when entitlement pauses', async () => {
    await setup({ snapshot: account(false), config: configured() })
    expect(screen.getByText('Your Microsoft calendars are saved.')).toBeTruthy()
    expect(screen.getByText(/last complete calendar view stays available on this device/i)).toBeTruthy()
    expect(screen.getByText(/1 saved account/i)).toBeTruthy()
  })

  it('disconnects in a trapped Escape-aware confirmation, keeps history by default, and scopes optional deletion', async () => {
    const providerGateway = gateway()
    const deleteMetricsHistory = vi.fn(async () => undefined)
    const { storage } = await setup({ config: configured(), providerGateway, deleteMetricsHistory })
    await storage.set('connectorSnapshots', {
      microsoftCalendar: { fetchedAt: now, data: { version: 1, fetchedAt: now, calendars: [] } },
    })
    const remove = await screen.findByRole('button', { name: 'Remove alex@outlook.test' })
    fireEvent.click(remove)
    const dialog = screen.getByRole('alertdialog')
    const history = within(dialog).getByRole('checkbox', { name: /Also delete this account's calendar-load history/i }) as HTMLInputElement
    expect(history.checked).toBe(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(remove)

    fireEvent.click(remove)
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('checkbox', { name: /Also delete this account's calendar-load history/i }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Disconnect account' }))
    await waitFor(() => expect(providerGateway.disconnect).toHaveBeenCalledWith(personalId))
    expect(deleteMetricsHistory).toHaveBeenCalledWith(personalId)
    expect(providerGateway.clearMemory).toHaveBeenCalled()
    const connectors = await storage.get('connectors')
    const snapshots = await storage.get('connectorSnapshots')
    expect(connectors.microsoftCalendar).toBeUndefined()
    expect(snapshots.microsoftCalendar).toBeUndefined()
    expect(connectors.googleCalendar).toBeTruthy()
    expect(connectors.ics).toBeTruthy()
  })

  it('keeps all selection and account actions at least 44px tall', async () => {
    await setup()
    expect(screen.getByRole('button', { name: 'Continue with Microsoft' }).className).toContain('min-h-11')
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Microsoft' }))
    const picker = await screen.findByRole('group', { name: 'Calendars for alex@outlook.test' })
    expect(within(picker).getByText('Alex').closest('label')?.className).toContain('min-h-11')
    expect(screen.getByRole('button', { name: 'Add to Tab Two' }).className).toContain('min-h-11')
  })
})
