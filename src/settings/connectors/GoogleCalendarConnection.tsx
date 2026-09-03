import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { hasProviderCapability } from '../../account/capabilities'
import { useAccount } from '../../account/AccountContext'
import { useDialogEscape } from '../../lib/dialogStack'
import { useFocusTrap } from '../../lib/hooks/useFocusTrap'
import type { AuroraStorage } from '../../lib/storage'
import { resolvedLocalTimeZone } from '../../lib/dates'
import { connectorSnapshotScope, newSnapshotEpoch } from '../../services/connectors/snapshotIdentity'
import {
  fetchGoogleCalendarList,
  isGoogleCalendarSnapshot,
  parseGoogleCalendarConfig,
  type DiscoveredGoogleCalendar,
} from '../../services/connectors/googleCalendar'
import type {
  GoogleCalendarAccountSelection,
  GoogleCalendarConfig,
  GoogleCalendarConnectionIssueCode,
  ConnectorConfig,
} from '../../services/connectors/types'
import type { ProviderGatewayErrorCode } from '../../providers/gateway'
import type { ProviderConnection, ProviderConnectionsState } from '../../providers/types'
import { useGoogleCalendar } from '../../providers/GoogleCalendarProvider'
import type { ConnectorCardMode } from './connectorCardState'
import { btnDanger, btnPrimary, btnQuiet } from '../sections/shared'

const CONNECTION_PROMISE = 'See the calendars you choose from one or more Google accounts. Tab Two reads calendar names, colors, and selected events so your agenda and private calendar-load metrics stay current.'
const PRIVACY_DISCLOSURE = "Google sends calendar data directly to this browser. Tab Two's service keeps an encrypted connection token so this installation can reconnect, but it does not receive your event details. No Gmail, Drive, or Contacts access is requested. Event details and sync cursors stay on this device and are never included in Tab Two backup, encrypted sync, diagnostics, or logs."
const PERMISSION_EXPLANATION = 'Chrome will also ask to let Tab Two communicate with googleapis.com. Chrome uses broad website-permission wording, but the Google grant itself is limited to the read-only calendar access described here.'
const DISCONNECT_CONSEQUENCE = 'This removes access for this Google account from Tab Two. It does not change or delete anything in Google Calendar, and it does not affect your other accounts or ICS calendars.'
const MAX_SELECTED_PER_ACCOUNT = 10
const MAX_SELECTED_TOTAL = 20

type Phase = 'consent' | 'opening' | 'discovering' | 'picker' | 'summary' | 'saving'

interface PickerState {
  connection: ProviderConnection
  calendars: readonly DiscoveredGoogleCalendar[]
  selected: Set<string>
  editing: boolean
  replacesConnectionId: string | null
}

function Spinner() {
  return (
    <span
      data-testid="google-calendar-spinner"
      aria-hidden="true"
      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
    />
  )
}

function operationMessage(code: ProviderGatewayErrorCode): string {
  switch (code) {
    case 'popup_closed': return 'Google’s window was closed before the connection finished.'
    case 'permission_denied': return 'Chrome access was not granted. Nothing was connected.'
    case 'provider_denied': return 'Google did not grant calendar access. You can try again whenever you are ready.'
    case 'authentication_required': return 'Sign in to Tab Two again, then retry the connection.'
    case 'entitlement_required': return 'Premium access needs attention before this connection can continue.'
    case 'reconnect_required': return 'This Google account needs to be reconnected.'
    case 'rate_limited': return 'Google is receiving too many requests right now. Try again shortly.'
    case 'not_configured': return 'Google Calendar connections are not available in this build yet.'
    default: return 'Google Calendar could not connect right now. Try again.'
  }
}

function refreshMessage(code: GoogleCalendarConnectionIssueCode): string {
  switch (code) {
    case 'offline': return 'Offline. Saved events remain available.'
    case 'unauthorized':
    case 'reconnect_required': return 'Reconnect needed'
    case 'rate_limited': return 'Google is busy. Retrying shortly.'
    case 'entitlement_required': return 'Premium access paused'
    case 'limit_exceeded': return 'Calendar selection needs attention'
    default: return 'Needs attention'
  }
}

function initials(email: string): string {
  const name = email.split('@', 1)[0] ?? email
  const parts = name.split(/[._-]+/u).filter(Boolean)
  return (parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : name.slice(0, 2))
    .toLocaleUpperCase('en-US')
}

async function deleteConnectionMetrics(storage: AuroraStorage, connectionId: string): Promise<void> {
  await storage.update('metricsHistory', (current) => current ? ({
    ...current,
    buckets: current.buckets.filter((bucket) => !(
      bucket.source === 'calendar' && bucket.sourceInstanceId === connectionId
    )),
  }) : null)
}

async function persistGoogleConfig(
  storage: AuroraStorage,
  nextConfig: GoogleCalendarConfig | null,
  clearConnectionId: string,
): Promise<void> {
  let nextSnapshot = null
  if (nextConfig) {
    const snapshots = await storage.get('connectorSnapshots')
    const current = snapshots.googleCalendar
    if (current && isGoogleCalendarSnapshot(current.data)) {
      const data = {
        ...current.data,
        calendars: current.data.calendars.filter((source) => source.connectionId !== clearConnectionId),
        ...(current.data.connectionIssues
          ? { connectionIssues: current.data.connectionIssues.filter((issue) => issue.connectionId !== clearConnectionId) }
          : {}),
      }
      nextSnapshot = {
        ...current,
        scope: await connectorSnapshotScope('googleCalendar', nextConfig, {
          accountId: nextConfig.accountId,
          timeZone: resolvedLocalTimeZone(),
        }),
        data,
      }
    }
  }

  await storage.updateMany(['connectors', 'connectorSnapshots'], ({ connectors, connectorSnapshots }) => {
    const nextConnectors = { ...connectors }
    const nextSnapshots = { ...connectorSnapshots }
    if (nextConfig) nextConnectors.googleCalendar = nextConfig
    else delete nextConnectors.googleCalendar
    if (nextSnapshot) nextSnapshots.googleCalendar = nextSnapshot
    else delete nextSnapshots.googleCalendar
    return { connectors: nextConnectors, connectorSnapshots: nextSnapshots }
  })
}

function DisconnectDialog({
  account,
  pending,
  deleteHistory,
  onDeleteHistoryChange,
  onCancel,
  onConfirm,
}: {
  account: GoogleCalendarAccountSelection
  pending: boolean
  deleteHistory: boolean
  onDeleteHistoryChange(value: boolean): void
  onCancel(): void
  onConfirm(): void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  useFocusTrap(dialogRef, true)
  useDialogEscape(() => { if (!pending) onCancel() }, true)

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel()
      }}
    >
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={`Remove ${account.displayEmail}?`}
        className="w-full max-w-[35rem] rounded-3xl border border-panel-border bg-panel-solid p-7 shadow-2xl shadow-black/70 max-[520px]:p-5"
      >
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl border border-red-400/35 bg-red-400/10 text-lg text-red-300">−</span>
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-red-400">Disconnect Google account</p>
        <h3 className="mt-2 break-words font-display text-2xl font-medium tracking-[-0.03em] text-fg">
          Remove {account.displayEmail}?
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{DISCONNECT_CONSEQUENCE}</p>

        <div className="mt-5 divide-y divide-hairline border-y border-hairline text-xs">
          <div className="flex items-start justify-between gap-4 py-3">
            <span className="text-fg-muted">Calendars removed from this device</span>
            <span className="text-right font-medium text-fg">{account.calendars.map((calendar) => calendar.name).join(', ')}</span>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-fg-muted">Events in Google</span>
            <span className="font-medium text-fg">Stay exactly as they are</span>
          </div>
        </div>

        <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-control-border hover:bg-control-bg/35 motion-reduce:transition-none">
          <input
            type="checkbox"
            checked={deleteHistory}
            onChange={(event) => onDeleteHistoryChange(event.currentTarget.checked)}
            className="mt-0.5 size-5 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-sm font-medium text-fg">Also delete this account’s Metrics history</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">Removes only numeric calendar totals collected from this connection.</span>
          </span>
        </label>

        <div className="mt-6 flex justify-end gap-2 max-[420px]:grid max-[420px]:grid-cols-1">
          <button type="button" disabled={pending} className={btnQuiet} onClick={onCancel}>Cancel disconnect</button>
          <button type="button" disabled={pending} className={`${btnDanger} border-red-400/45 bg-red-400/10 font-medium disabled:cursor-not-allowed disabled:opacity-50`} onClick={onConfirm}>
            {pending ? <><Spinner /> Disconnecting…</> : 'Disconnect account'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export default function GoogleCalendarConnection({
  config,
  storage,
  mode: _mode,
  closeEditor,
  onShowPremiumPlans,
  fetchFn = globalThis.fetch.bind(globalThis),
  deleteMetricsHistory,
}: {
  config: ConnectorConfig | undefined
  storage: AuroraStorage
  mode: ConnectorCardMode
  closeEditor(): void
  onShowPremiumPlans(): void
  fetchFn?: typeof fetch
  deleteMetricsHistory?: (connectionId: string) => Promise<void>
}) {
  const account = useAccount()
  const googleRuntime = useGoogleCalendar()
  const parsedConfig = parseGoogleCalendarConfig(config) ?? undefined
  const [localConfig, setLocalConfig] = useState(parsedConfig)
  const [phase, setPhase] = useState<Phase>(parsedConfig ? 'summary' : 'consent')
  const [providerState, setProviderState] = useState<ProviderConnectionsState | null>(null)
  const [picker, setPicker] = useState<PickerState | null>(null)
  const [alert, setAlert] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [rowAlert, setRowAlert] = useState<{ connectionId: string; message: string } | null>(null)
  const [disconnectTarget, setDisconnectTarget] = useState<GoogleCalendarAccountSelection | null>(null)
  const [disconnectPending, setDisconnectPending] = useState(false)
  const [deleteHistory, setDeleteHistory] = useState(false)
  const attempt = useRef(0)
  const disconnectInvoker = useRef<HTMLButtonElement | null>(null)
  const resultHeading = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => setLocalConfig(parsedConfig), [config])

  const scopedConfig = localConfig
    && account.snapshot.mode === 'signed_in'
    && localConfig.accountId === account.snapshot.accountId
    ? localConfig
    : null
  const entitled = account.hydrated && hasProviderCapability(account.snapshot, 'google_calendar')
  const gateway = account.client.providerGateway

  useEffect(() => {
    if (!announcement || (phase !== 'summary' && phase !== 'consent')) return
    const focus = () => resultHeading.current?.focus()
    queueMicrotask(focus)
  }, [announcement, phase])

  useEffect(() => {
    if (!entitled || !gateway) return
    let active = true
    void gateway.listConnections().then((result) => {
      if (!active) return
      if (result.ok) setProviderState(result.value)
      else if (scopedConfig) setAlert(operationMessage(result.code))
    })
    return () => { active = false }
  }, [entitled, gateway, scopedConfig])

  const knownConnectionIds = useMemo(
    () => new Set(scopedConfig?.accounts.map((selected) => selected.connectionId) ?? []),
    [scopedConfig],
  )

  async function discover(
    connection: ProviderConnection,
    editing: boolean,
    revision: number,
    replacesConnectionId: string | null = null,
  ) {
    if (!gateway) return
    setPhase('discovering')
    const session = await gateway.getSession(connection.connectionId)
    if (revision !== attempt.current) return
    if (!session.ok) {
      const message = operationMessage(session.code)
      if (scopedConfig && editing) {
        setRowAlert({ connectionId: connection.connectionId, message })
        setPhase('summary')
      } else {
        setAlert(message)
        setPhase(scopedConfig ? 'summary' : 'consent')
      }
      return
    }
    try {
      const calendars = await fetchGoogleCalendarList(session.value.accessToken, fetchFn)
      if (revision !== attempt.current) return
      const existing = scopedConfig?.accounts.find((selected) => (
        selected.connectionId === (replacesConnectionId ?? connection.connectionId)
      ))
      const selected = new Set(existing?.calendars.map((calendar) => calendar.calendarId)
        ?? calendars.filter((calendar) => calendar.primary).map((calendar) => calendar.calendarId))
      if (selected.size === 0 && calendars[0]) selected.add(calendars[0].calendarId)
      setPicker({ connection, calendars, selected, editing, replacesConnectionId })
      setPhase('picker')
      setAlert(null)
      setRowAlert(null)
    } catch {
      const message = 'Calendars could not be loaded right now. Your last complete selection is unchanged.'
      if (scopedConfig && editing) {
        setRowAlert({ connectionId: connection.connectionId, message })
        setPhase('summary')
      } else {
        setAlert(message)
        setPhase(scopedConfig ? 'summary' : 'consent')
      }
    }
  }

  async function connectAndDiscover(preferredConnectionId?: string) {
    if (!gateway) {
      setAlert(operationMessage('not_configured'))
      return
    }
    const revision = ++attempt.current
    setAnnouncement(null)
    setAlert(null)
    setRowAlert(null)
    setPhase('opening')
    const pending = gateway.connect()
    const result = await pending
    if (revision !== attempt.current) return
    if (!result.ok) {
      setAlert(operationMessage(result.code))
      setPhase(scopedConfig ? 'summary' : 'consent')
      return
    }
    setProviderState(result.value)
    const active = result.value.connections.filter((candidate) => candidate.status === 'active')
    let target = preferredConnectionId
      ? active.find((candidate) => candidate.connectionId === preferredConnectionId)
      : active.find((candidate) => !knownConnectionIds.has(candidate.connectionId))
    if (!target && preferredConnectionId) {
      target = active.find((candidate) => candidate.displayEmail === scopedConfig?.accounts.find(
        (selected) => selected.connectionId === preferredConnectionId,
      )?.displayEmail)
    }
    if (!target) {
      setAlert('That Google account is already connected. Choose a different account or edit its calendars.')
      setPhase(scopedConfig ? 'summary' : 'consent')
      return
    }
    const existingConnection = preferredConnectionId ?? (
      knownConnectionIds.has(target.connectionId) ? target.connectionId : null
    )
    await discover(target, existingConnection !== null, revision, existingConnection)
  }

  function cancelOpening() {
    attempt.current += 1
    setAlert(null)
    setPhase(scopedConfig ? 'summary' : 'consent')
  }

  async function openExistingPicker(connectionId: string) {
    const connection = providerState?.connections.find((candidate) => candidate.connectionId === connectionId)
      ?? scopedConfig?.accounts.find((candidate) => candidate.connectionId === connectionId)
    if (!connection) return
    const providerConnection: ProviderConnection = 'status' in connection ? connection : {
      connectionId: connection.connectionId,
      provider: 'google_calendar',
      accountKind: null,
      displayEmail: connection.displayEmail,
      displayName: null,
      status: 'active',
      grantedScopes: [
        'openid', 'email',
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        'https://www.googleapis.com/auth/calendar.events.readonly',
      ],
      createdAt: 0,
      updatedAt: 0,
    }
    const revision = ++attempt.current
    setPhase('opening')
    await discover(providerConnection, true, revision, connectionId)
  }

  async function retryConnection() {
    setRowAlert(null)
    await storage.update('connectorSnapshots', (snapshots) => {
      const current = snapshots.googleCalendar
      return current ? {
        ...snapshots,
        googleCalendar: { ...current, fetchedAt: 0 },
      } : snapshots
    })
  }

  function toggleCalendar(calendarId: string) {
    setPicker((current) => {
      if (!current) return current
      const selected = new Set(current.selected)
      if (selected.has(calendarId)) selected.delete(calendarId)
      else if (selected.size < MAX_SELECTED_PER_ACCOUNT) selected.add(calendarId)
      return { ...current, selected }
    })
  }

  async function savePicker() {
    if (!picker || account.snapshot.mode !== 'signed_in' || !account.snapshot.accountId) return
    setPhase('saving')
    setAlert(null)
    const calendars = picker.calendars
      .filter((calendar) => picker.selected.has(calendar.calendarId))
      .map((calendar) => ({
        calendarId: calendar.calendarId,
        name: calendar.name,
        color: calendar.color,
        primary: calendar.primary,
      }))
    const currentAccounts = scopedConfig?.accounts ?? []
    const withoutCurrent = currentAccounts.filter((selected) => (
      selected.connectionId !== picker.connection.connectionId
      && selected.connectionId !== picker.replacesConnectionId
    ))
    if (withoutCurrent.reduce((total, selected) => total + selected.calendars.length, 0) + calendars.length > MAX_SELECTED_TOTAL) {
      setAlert('Choose fewer calendars so the combined total stays at 20 or less.')
      setPhase('picker')
      return
    }
    const selectedAccount: GoogleCalendarAccountSelection = {
      connectionId: picker.connection.connectionId,
      displayEmail: picker.connection.displayEmail,
      calendars,
    }
    const next: GoogleCalendarConfig = {
      enabled: true,
      accountId: account.snapshot.accountId,
      accounts: [...withoutCurrent, selectedAccount],
      snapshotEpoch: newSnapshotEpoch(),
    }
    try {
      await persistGoogleConfig(storage, next, picker.replacesConnectionId ?? picker.connection.connectionId)
      const wasEditing = picker.editing
      setLocalConfig(next)
      setPicker(null)
      setProviderState((current) => current ?? stateFromConfig(next))
      setPhase('summary')
      setAlert(null)
      setAnnouncement(`Google Calendar ${wasEditing ? 'was updated' : 'is connected'}. ${calendars.length} ${calendars.length === 1 ? 'calendar now appears' : 'calendars now appear'} in Tab Two.`)
    } catch {
      setAlert('Calendars were not saved. Your previous selection is unchanged.')
      setPhase('picker')
    }
  }

  function closeDisconnect() {
    setDisconnectTarget(null)
    setDeleteHistory(false)
    disconnectInvoker.current?.focus()
  }

  async function confirmDisconnect() {
    if (!disconnectTarget || !gateway || disconnectPending) return
    setDisconnectPending(true)
    setAlert(null)
    const target = disconnectTarget
    const result = await gateway.disconnect(target.connectionId)
    if (!result.ok) {
      setDisconnectPending(false)
      setAlert(operationMessage(result.code))
      return
    }
    const remaining = (scopedConfig?.accounts ?? []).filter((selected) => selected.connectionId !== target.connectionId)
    const next = remaining.length > 0 && scopedConfig ? {
      ...scopedConfig,
      accounts: remaining,
      snapshotEpoch: newSnapshotEpoch(),
    } : null
    try {
      await persistGoogleConfig(storage, next, target.connectionId)
      if (deleteHistory) {
        await (deleteMetricsHistory
          ? deleteMetricsHistory(target.connectionId)
          : deleteConnectionMetrics(storage, target.connectionId))
      }
      setLocalConfig(next ?? undefined)
      setProviderState((current) => current ? {
        ...current,
        connections: current.connections.filter((candidate) => candidate.connectionId !== target.connectionId),
      } : null)
      setDisconnectTarget(null)
      setDeleteHistory(false)
      setPhase(next ? 'summary' : 'consent')
      setAlert(null)
      setAnnouncement(`${target.displayEmail} was disconnected. Your other calendars are unchanged.`)
    } catch {
      setAlert('The Google account was disconnected, but local cleanup needs another try.')
    } finally {
      setDisconnectPending(false)
    }
  }

  if (!account.hydrated) {
    return <p role="status" className="min-h-32 text-sm text-fg-muted">Preparing your Google Calendar connection…</p>
  }

  if (!entitled) {
    return (
      <div className="min-h-56">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Premium calendar</p>
        <h3 className="mt-2 font-display text-2xl font-medium tracking-[-0.03em] text-fg">{scopedConfig ? 'Your Google calendars are saved.' : 'One calendar, across every Google account.'}</h3>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{scopedConfig ? 'Your last calendar view stays available on this device. Premium access resumes the live connection without changing your selections.' : 'Bring your chosen calendars, source colors, and private calendar-load metrics into the schedule you already use.'}</p>
        {scopedConfig ? <p className="mt-4 text-xs text-amber-200">Premium access paused · {scopedConfig.accounts.length} saved {scopedConfig.accounts.length === 1 ? 'account' : 'accounts'}</p> : null}
        <button type="button" className={`${btnPrimary} mt-6 min-h-11`} onClick={onShowPremiumPlans}>See premium plans</button>
      </div>
    )
  }

  if (phase === 'opening' || phase === 'discovering') {
    const discovering = phase === 'discovering'
    return (
      <div className="flex min-h-56 flex-col justify-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">{discovering ? 'Preparing your calendar' : 'Connecting securely'}</p>
        <h3 className="mt-2 font-display text-2xl font-medium tracking-[-0.03em] text-fg">{discovering ? 'Your Google account is connected.' : 'Google’s account window is opening.'}</h3>
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-fg-muted"><Spinner /> {discovering ? 'Loading your calendars…' : 'Opening Google…'}</p>
        <button type="button" className={`${btnQuiet} mt-6 w-fit min-h-11`} onClick={cancelOpening}>{discovering ? 'Cancel calendar loading' : 'Cancel Google connection'}</button>
      </div>
    )
  }

  if ((phase === 'picker' || phase === 'saving') && picker) {
    const selectedCount = picker.selected.size
    const otherCount = (scopedConfig?.accounts ?? [])
      .filter((selected) => selected.connectionId !== picker.connection.connectionId)
      .reduce((total, selected) => total + selected.calendars.length, 0)
    const selectionFull = selectedCount >= MAX_SELECTED_PER_ACCOUNT || otherCount + selectedCount >= MAX_SELECTED_TOTAL
    return (
      <div className="min-h-80">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Google Calendar</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h3 className="font-display text-2xl font-medium tracking-[-0.03em] text-fg">Choose calendars</h3>
          <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted"><span className="size-1.5 rounded-full bg-emerald-400" /> Connected</span>
        </div>
        <p className="mt-1 break-all text-sm text-fg-muted">{picker.connection.displayEmail}</p>
        <div className="mt-5 flex items-center justify-between gap-3 border-y border-hairline py-3">
          <div>
            <p className="text-sm font-medium text-fg">Calendars</p>
            <p className="text-xs text-fg-muted">{selectedCount} selected</p>
          </div>
          <button
            type="button"
            className="min-h-11 cursor-pointer text-xs font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => setPicker((current) => current ? {
              ...current,
              selected: new Set(current.calendars.slice(0, Math.min(MAX_SELECTED_PER_ACCOUNT, MAX_SELECTED_TOTAL - otherCount)).map((calendar) => calendar.calendarId)),
            } : current)}
          >
            Select visible
          </button>
        </div>
        <div role="group" aria-label={`Calendars for ${picker.connection.displayEmail}`} className="divide-y divide-hairline">
          {picker.calendars.map((calendar) => {
            const checked = picker.selected.has(calendar.calendarId)
            return (
              <label key={calendar.calendarId} className="flex min-h-11 cursor-pointer items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label={calendar.name}
                  checked={checked}
                  disabled={!checked && selectionFull}
                  onChange={() => toggleCalendar(calendar.calendarId)}
                  className="size-5 accent-[var(--accent)]"
                />
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: calendar.color }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{calendar.name}</span>
                  {calendar.primary ? <span className="block text-xs text-fg-muted">Primary calendar</span> : null}
                </span>
              </label>
            )
          })}
        </div>
        {alert ? <p role="alert" className="mt-3 text-xs text-red-400">{alert}</p> : null}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-hairline pt-4 max-[420px]:grid max-[420px]:grid-cols-1">
          <p className="text-xs text-fg-muted">{selectedCount} {selectedCount === 1 ? 'calendar' : 'calendars'} selected</p>
          <div className="flex justify-end gap-2 max-[420px]:grid max-[420px]:grid-cols-2">
            <button type="button" disabled={phase === 'saving'} className={btnQuiet} onClick={() => setPhase(scopedConfig ? 'summary' : 'consent')}>Back</button>
            <button type="button" disabled={phase === 'saving' || selectedCount === 0} className={`${btnPrimary} min-h-11 disabled:cursor-not-allowed disabled:opacity-50`} onClick={() => void savePicker()}>
              {phase === 'saving' ? <><Spinner /> Saving…</> : picker.editing ? 'Save calendars' : 'Add to Tab Two'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'summary' && scopedConfig) {
    const connectionById = new Map(providerState?.connections.map((item) => [item.connectionId, item]))
    return (
      <div className="min-h-64">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Google accounts</p>
            <h3 ref={resultHeading} tabIndex={-1} className="mt-2 font-display text-2xl font-medium tracking-[-0.03em] text-fg outline-none">
              {scopedConfig.accounts.length === 1 ? 'Your connected account' : 'Your connected accounts'}
            </h3>
            <p className="mt-1 text-sm text-fg-muted">{scopedConfig.accounts.reduce((total, selected) => total + selected.calendars.length, 0)} selected calendars feed one calm schedule.</p>
          </div>
          <button type="button" aria-label="Add another account" className={`${btnQuiet} min-h-11 border-accent/40 text-accent`} onClick={() => void connectAndDiscover()}><span aria-hidden="true">+</span> Add another account</button>
        </div>

        {announcement ? (
          <p role="status" className="mt-4 border-l-2 border-emerald-400/70 pl-3 text-xs leading-relaxed text-emerald-200">
            {announcement}
          </p>
        ) : null}

        <div className="mt-5 divide-y divide-hairline border-y border-hairline">
          {scopedConfig.accounts.map((selected) => {
            const provider = connectionById.get(selected.connectionId)
            const runtimeIssue = googleRuntime.snapshot?.connectionIssues?.find(
              (candidate) => candidate.connectionId === selected.connectionId,
            )?.code
            const issue = provider?.status === 'reconnect_required' ? 'reconnect_required' : runtimeIssue ?? null
            const status = issue ? refreshMessage(issue) : 'Up to date'
            const reconnect = issue === 'reconnect_required' || issue === 'unauthorized'
            const editSelection = issue === 'limit_exceeded'
            return (
              <div key={selected.connectionId} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 py-4 max-[520px]:grid-cols-[2.5rem_minmax(0,1fr)]">
                <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-xs font-bold text-accent">{initials(selected.displayEmail)}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-all text-sm font-semibold text-fg">{selected.displayEmail}</p>
                    <span className={`inline-flex items-center gap-1.5 text-xs ${issue ? 'text-amber-200' : 'text-fg-muted'}`}>
                      <span className={`size-1.5 rounded-full ${issue ? 'bg-amber-300' : 'bg-emerald-400'}`} />{status}
                    </span>
                  </div>
                  <ul aria-label={`Selected calendars for ${selected.displayEmail}`} className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {selected.calendars.map((calendar) => (
                      <li key={calendar.calendarId} className="flex items-center gap-1.5 text-xs text-fg-muted">
                        <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: calendar.color }} />{calendar.name}
                      </li>
                    ))}
                  </ul>
                  {rowAlert?.connectionId === selected.connectionId ? (
                    <p role="alert" className="mt-2 text-xs leading-relaxed text-red-400">{rowAlert.message}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap justify-end gap-1.5 max-[520px]:col-span-2 max-[520px]:pl-[3.25rem]">
                  {reconnect ? (
                    <button type="button" className={`${btnQuiet} min-h-11 text-accent`} aria-label={`Reconnect ${selected.displayEmail}`} onClick={() => void connectAndDiscover(selected.connectionId)}>Reconnect</button>
                  ) : issue || rowAlert?.connectionId === selected.connectionId ? (
                    <button type="button" className={`${btnQuiet} min-h-11 text-accent`} aria-label={`Try again for ${selected.displayEmail}`} onClick={() => void (editSelection ? openExistingPicker(selected.connectionId) : retryConnection())}>{editSelection ? 'Edit selection' : 'Try again'}</button>
                  ) : (
                    <button type="button" className={`${btnQuiet} min-h-11`} aria-label={`Edit calendars for ${selected.displayEmail}`} onClick={() => void openExistingPicker(selected.connectionId)}>Edit</button>
                  )}
                  <button
                    type="button"
                    className={`${btnQuiet} min-h-11 text-red-300`}
                    aria-label={`Remove ${selected.displayEmail}`}
                    onClick={(event) => {
                      disconnectInvoker.current = event.currentTarget
                      setDisconnectTarget(selected)
                      setDeleteHistory(false)
                    }}
                  >Remove</button>
                </div>
              </div>
            )
          })}
        </div>
        {alert ? <p role="alert" className="mt-3 text-xs text-red-400">{alert}</p> : null}
        <p className="mt-4 text-xs leading-relaxed text-fg-muted">Free ICS calendars remain connected separately.</p>
        {disconnectTarget ? (
          <DisconnectDialog
            account={disconnectTarget}
            pending={disconnectPending}
            deleteHistory={deleteHistory}
            onDeleteHistoryChange={setDeleteHistory}
            onCancel={closeDisconnect}
            onConfirm={() => void confirmDisconnect()}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="min-h-64">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Before you continue</p>
      <h3 ref={resultHeading} tabIndex={-1} className="mt-2 font-display text-2xl font-medium tracking-[-0.03em] text-fg outline-none">Choose what appears in Tab Two.</h3>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{CONNECTION_PROMISE}</p>
      <div className="mt-5 border-l-2 border-emerald-400/70 pl-4">
        <p className="text-sm font-semibold text-fg">Your calendar stays yours.</p>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">Tab Two only displays the calendars you select and never changes events or sends invitations.</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className={`${btnPrimary} min-h-11`} onClick={() => void connectAndDiscover()}>Continue with Google</button>
        <button type="button" className={`${btnQuiet} min-h-11`} onClick={closeEditor}>Cancel</button>
      </div>
      <p className="mt-3 border-l-2 border-accent/50 pl-3 text-[11px] leading-relaxed text-fg-muted">{PERMISSION_EXPLANATION}</p>
      <details className="mt-5 border-t border-hairline pt-4 text-xs text-fg-muted">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-fg">How your calendar data stays private</summary>
        <p className="mt-2 leading-relaxed">{PRIVACY_DISCLOSURE}</p>
      </details>
      {announcement ? <p role="status" className="mt-3 text-xs leading-relaxed text-emerald-200">{announcement}</p> : null}
      {alert ? <p role="alert" className="mt-3 text-xs leading-relaxed text-red-400">{alert}</p> : null}
    </div>
  )
}

function stateFromConfig(config: GoogleCalendarConfig): ProviderConnectionsState {
  return {
    accountId: config.accountId,
    connections: config.accounts.map((selected) => ({
      connectionId: selected.connectionId,
      provider: 'google_calendar',
      accountKind: null,
      displayEmail: selected.displayEmail,
      displayName: null,
      status: 'active',
      grantedScopes: [
        'openid', 'email',
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        'https://www.googleapis.com/auth/calendar.events.readonly',
      ],
      createdAt: 0,
      updatedAt: 0,
    })),
  }
}
