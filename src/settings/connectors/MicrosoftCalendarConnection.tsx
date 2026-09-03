import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { hasProviderCapability } from '../../account/capabilities'
import { useAccount } from '../../account/AccountContext'
import { resolvedLocalTimeZone } from '../../lib/dates'
import { useDialogEscape } from '../../lib/dialogStack'
import { useFocusTrap } from '../../lib/hooks/useFocusTrap'
import type { AuroraStorage } from '../../lib/storage'
import { MICROSOFT_CALENDAR_SCOPES } from '../../providers/connections'
import type { ProviderGatewayErrorCode } from '../../providers/gateway'
import { useMicrosoftCalendar } from '../../providers/MicrosoftCalendarProvider'
import type { ProviderConnection, ProviderConnectionsState } from '../../providers/types'
import {
  fetchMicrosoftCalendarList,
  isMicrosoftCalendarSnapshot,
  parseMicrosoftCalendarConfig,
  type DiscoveredMicrosoftCalendar,
} from '../../services/connectors/microsoftCalendar'
import { connectorSnapshotScope, newSnapshotEpoch } from '../../services/connectors/snapshotIdentity'
import type {
  ConnectorConfig,
  MicrosoftCalendarAccountSelection,
  MicrosoftCalendarConfig,
  MicrosoftCalendarConnectionIssueCode,
} from '../../services/connectors/types'
import type { ConnectorCardMode } from './connectorCardState'
import { btnDanger, btnPrimary, btnQuiet } from '../sections/shared'

const MAX_SELECTED_PER_ACCOUNT = 10
const MAX_SELECTED_TOTAL = 20
const CONNECTION_PROMISE = 'Choose calendars from Outlook.com or Microsoft 365 and see them in the schedule you already use. Tab Two can read calendar names, colors, and selected events. It cannot change events or send invitations.'
const PERMISSION_EXPLANATION = 'Chrome will ask to let Tab Two communicate with graph.microsoft.com only after you continue. The Microsoft grant is limited to the read-only calendar access shown here.'
const PRIVACY_DISCLOSURE = "Microsoft sends calendar data directly to this browser. Tab Two's service keeps an encrypted connection token so this installation can reconnect, but it does not receive your event details. Event details and sync cursors stay on this device and are excluded from backup, encrypted sync, diagnostics, and logs."
const DISCONNECT_CONSEQUENCE = 'This removes this Microsoft account from Tab Two. It does not change or delete anything in Outlook or Microsoft 365, and it does not affect your other Microsoft, Google, or ICS calendars.'

type Phase = 'consent' | 'opening' | 'discovering' | 'picker' | 'summary' | 'saving' | 'organization_approval'

interface PickerState {
  connection: ProviderConnection
  calendars: readonly DiscoveredMicrosoftCalendar[]
  selected: Set<string>
  editing: boolean
  replacesConnectionId: string | null
}

function Spinner() {
  return (
    <span
      data-testid="microsoft-calendar-spinner"
      aria-hidden="true"
      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
    />
  )
}

function operationMessage(code: ProviderGatewayErrorCode): string {
  switch (code) {
    case 'popup_closed': return "Microsoft's window was closed before the connection finished."
    case 'permission_denied': return 'Chrome access was not granted. Nothing was connected.'
    case 'provider_denied': return 'Microsoft did not grant calendar access. You can try again whenever you are ready.'
    case 'authentication_required': return 'Sign in to Tab Two again, then retry the connection.'
    case 'entitlement_required': return 'Premium access needs attention before this connection can continue.'
    case 'reconnect_required': return 'This Microsoft account needs to be reconnected.'
    case 'organization_approval_required': return 'Your organization needs to approve Tab Two before this account can connect.'
    case 'rate_limited': return 'Microsoft is receiving too many requests right now. Try again shortly.'
    case 'not_configured': return 'Microsoft Calendar connections are not available in this build yet.'
    default: return 'Microsoft Calendar could not connect right now. Try again.'
  }
}

function refreshMessage(code: MicrosoftCalendarConnectionIssueCode): string {
  switch (code) {
    case 'offline': return 'Offline. Saved events remain available.'
    case 'unauthorized':
    case 'reconnect_required': return 'Reconnect needed'
    case 'organization_approval_required': return 'Organization approval needed'
    case 'rate_limited': return 'Microsoft is busy. Retrying shortly.'
    case 'entitlement_required': return 'Premium access paused'
    case 'limit_exceeded': return 'Calendar selection needs attention'
    default: return 'Needs attention'
  }
}

function accountKindLabel(kind: MicrosoftCalendarAccountSelection['accountKind']): string {
  return kind === 'personal' ? 'PERSONAL' : 'WORK OR SCHOOL'
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

async function persistMicrosoftConfig(
  storage: AuroraStorage,
  nextConfig: MicrosoftCalendarConfig | null,
  clearConnectionId: string,
): Promise<void> {
  let nextSnapshot = null
  if (nextConfig) {
    const snapshots = await storage.get('connectorSnapshots')
    const current = snapshots.microsoftCalendar
    if (current && isMicrosoftCalendarSnapshot(current.data)) {
      const data = {
        ...current.data,
        calendars: current.data.calendars.filter((source) => source.connectionId !== clearConnectionId),
        ...(current.data.connectionIssues
          ? { connectionIssues: current.data.connectionIssues.filter((issue) => issue.connectionId !== clearConnectionId) }
          : {}),
      }
      nextSnapshot = {
        ...current,
        scope: await connectorSnapshotScope('microsoftCalendar', nextConfig, {
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
    if (nextConfig) nextConnectors.microsoftCalendar = nextConfig
    else delete nextConnectors.microsoftCalendar
    if (nextSnapshot) nextSnapshots.microsoftCalendar = nextSnapshot
    else delete nextSnapshots.microsoftCalendar
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
  account: MicrosoftCalendarAccountSelection
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
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-red-400">Disconnect Microsoft account</p>
        <h3 className="mt-2 break-words font-display text-2xl font-medium tracking-[-0.03em] text-fg">Remove {account.displayEmail}?</h3>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{DISCONNECT_CONSEQUENCE}</p>
        <div className="mt-5 divide-y divide-hairline border-y border-hairline text-xs">
          <div className="flex items-start justify-between gap-4 py-3">
            <span className="text-fg-muted">Calendars removed from this device</span>
            <span className="text-right font-medium text-fg">{account.calendars.map((calendar) => calendar.name).join(', ')}</span>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-fg-muted">Events in Microsoft</span>
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
            <span className="block text-sm font-medium text-fg">Also delete this account's calendar-load history</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">Removes only daily calendar counts and merged busy minutes from this connection.</span>
          </span>
        </label>
        <div className="mt-6 flex justify-end gap-2 max-[420px]:grid max-[420px]:grid-cols-1">
          <button type="button" disabled={pending} className={btnQuiet} onClick={onCancel}>Keep account</button>
          <button type="button" disabled={pending} className={`${btnDanger} border-red-400/45 bg-red-400/10 font-medium disabled:cursor-not-allowed disabled:opacity-50`} onClick={onConfirm}>
            {pending ? <><Spinner /> Disconnecting...</> : 'Disconnect account'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export default function MicrosoftCalendarConnection({
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
  const runtime = useMicrosoftCalendar()
  const parsedConfig = parseMicrosoftCalendarConfig(config) ?? undefined
  const [localConfig, setLocalConfig] = useState(parsedConfig)
  const [phase, setPhase] = useState<Phase>(parsedConfig ? 'summary' : 'consent')
  const [providerState, setProviderState] = useState<ProviderConnectionsState | null>(null)
  const [picker, setPicker] = useState<PickerState | null>(null)
  const [alert, setAlert] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [rowAlert, setRowAlert] = useState<{ connectionId: string; message: string } | null>(null)
  const [disconnectTarget, setDisconnectTarget] = useState<MicrosoftCalendarAccountSelection | null>(null)
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
  const entitled = account.hydrated && hasProviderCapability(account.snapshot, 'microsoft_calendar')
  const gateway = account.client.providerGateways.microsoft_calendar ?? null
  const knownConnectionIds = useMemo(
    () => new Set(scopedConfig?.accounts.map((selected) => selected.connectionId) ?? []),
    [scopedConfig],
  )

  useEffect(() => {
    if (!announcement || phase !== 'summary') return
    queueMicrotask(() => resultHeading.current?.focus())
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
      if (session.code === 'organization_approval_required') {
        setAlert(null)
        setPhase('organization_approval')
      } else if (scopedConfig && editing) {
        setRowAlert({ connectionId: replacesConnectionId ?? connection.connectionId, message })
        setPhase('summary')
      } else {
        setAlert(message)
        setPhase(scopedConfig ? 'summary' : 'consent')
      }
      return
    }
    try {
      const calendars = await fetchMicrosoftCalendarList(session.value.accessToken, fetchFn)
      if (revision !== attempt.current) return
      const existing = scopedConfig?.accounts.find((selected) => (
        selected.connectionId === (replacesConnectionId ?? connection.connectionId)
      ))
      const selected = new Set(existing?.calendars.map((calendar) => calendar.calendarId)
        ?? calendars.filter((calendar) => calendar.isDefault && calendar.readable).map((calendar) => calendar.calendarId))
      if (selected.size === 0) {
        const first = calendars.find((calendar) => calendar.readable)
        if (first) selected.add(first.calendarId)
      }
      setPicker({ connection, calendars, selected, editing, replacesConnectionId })
      setPhase('picker')
      setAlert(null)
      setRowAlert(null)
    } catch {
      const message = 'Calendars could not be loaded right now. Your last complete selection is unchanged.'
      if (scopedConfig && editing) {
        setRowAlert({ connectionId: replacesConnectionId ?? connection.connectionId, message })
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
    const result = await gateway.connect()
    if (revision !== attempt.current) return
    if (!result.ok) {
      if (result.code === 'organization_approval_required') {
        setPhase('organization_approval')
      } else {
        setAlert(operationMessage(result.code))
        setPhase(scopedConfig ? 'summary' : 'consent')
      }
      return
    }
    setProviderState(result.value)
    const active = result.value.connections.filter((candidate) => (
      candidate.provider === 'microsoft_calendar'
      && candidate.status === 'active'
      && candidate.accountKind !== null
    ))
    let target = preferredConnectionId
      ? active.find((candidate) => candidate.connectionId === preferredConnectionId)
      : active.find((candidate) => !knownConnectionIds.has(candidate.connectionId))
    if (!target && preferredConnectionId) {
      target = active.find((candidate) => candidate.displayEmail === scopedConfig?.accounts.find(
        (selected) => selected.connectionId === preferredConnectionId,
      )?.displayEmail)
    }
    if (!target) {
      setAlert('That Microsoft account is already connected. Choose a different account or manage its calendars.')
      setPhase(scopedConfig ? 'summary' : 'consent')
      return
    }
    const existingConnection = preferredConnectionId ?? (knownConnectionIds.has(target.connectionId) ? target.connectionId : null)
    await discover(target, existingConnection !== null, revision, existingConnection)
  }

  function cancelOperation() {
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
      provider: 'microsoft_calendar',
      accountKind: connection.accountKind,
      displayEmail: connection.displayEmail,
      displayName: null,
      status: 'active',
      grantedScopes: MICROSOFT_CALENDAR_SCOPES,
      createdAt: 0,
      updatedAt: 0,
    }
    const revision = ++attempt.current
    setPhase('opening')
    await discover(providerConnection, true, revision, connectionId)
  }

  async function retryConnection(connectionId: string) {
    setRowAlert(null)
    await storage.update('connectorSnapshots', (snapshots) => {
      const current = snapshots.microsoftCalendar
      return current ? { ...snapshots, microsoftCalendar: { ...current, fetchedAt: 0 } } : snapshots
    })
    setAnnouncement(`Microsoft Calendar will retry ${scopedConfig?.accounts.find((item) => item.connectionId === connectionId)?.displayEmail ?? 'this account'} automatically.`)
  }

  function toggleCalendar(calendarId: string) {
    setPicker((current) => {
      if (!current) return current
      const calendar = current.calendars.find((candidate) => candidate.calendarId === calendarId)
      if (!calendar?.readable) return current
      const selected = new Set(current.selected)
      if (selected.has(calendarId)) selected.delete(calendarId)
      else if (selected.size < MAX_SELECTED_PER_ACCOUNT) selected.add(calendarId)
      return { ...current, selected }
    })
  }

  async function savePicker() {
    if (!picker || account.snapshot.mode !== 'signed_in' || !account.snapshot.accountId || !picker.connection.accountKind) return
    setPhase('saving')
    setAlert(null)
    const calendars = picker.calendars
      .filter((calendar) => picker.selected.has(calendar.calendarId) && calendar.readable)
      .map((calendar) => ({
        calendarId: calendar.calendarId,
        name: calendar.name,
        color: calendar.color,
        isDefault: calendar.isDefault,
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
    const selectedAccount: MicrosoftCalendarAccountSelection = {
      connectionId: picker.connection.connectionId,
      displayEmail: picker.connection.displayEmail,
      accountKind: picker.connection.accountKind,
      calendars,
    }
    const next: MicrosoftCalendarConfig = {
      enabled: true,
      accountId: account.snapshot.accountId,
      accounts: [...withoutCurrent, selectedAccount],
      snapshotEpoch: newSnapshotEpoch(),
    }
    try {
      await persistMicrosoftConfig(storage, next, picker.replacesConnectionId ?? picker.connection.connectionId)
      const wasEditing = picker.editing
      setLocalConfig(next)
      setPicker(null)
      setProviderState((current) => current ?? stateFromConfig(next))
      setPhase('summary')
      setAlert(null)
      setAnnouncement(`Microsoft Calendar ${wasEditing ? 'was updated' : 'is connected'}. ${calendars.length} ${calendars.length === 1 ? 'calendar now appears' : 'calendars now appear'} in Tab Two.`)
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
      await persistMicrosoftConfig(storage, next, target.connectionId)
      if (deleteHistory) {
        await (deleteMetricsHistory ? deleteMetricsHistory(target.connectionId) : deleteConnectionMetrics(storage, target.connectionId))
      }
      gateway.clearMemory()
      setLocalConfig(next ?? undefined)
      setProviderState((current) => current ? {
        ...current,
        connections: current.connections.filter((candidate) => candidate.connectionId !== target.connectionId),
      } : null)
      setDisconnectTarget(null)
      setDeleteHistory(false)
      setPhase(next ? 'summary' : 'consent')
      setAnnouncement(`${target.displayEmail} was disconnected. Your other calendars are unchanged.`)
    } catch {
      setAlert('The Microsoft account was disconnected, but local cleanup needs another try.')
    } finally {
      setDisconnectPending(false)
    }
  }

  if (!account.hydrated) {
    return <p role="status" className="min-h-32 text-sm text-fg-muted">Preparing your Microsoft Calendar connection...</p>
  }

  if (!entitled) {
    return (
      <div className="min-h-56">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Premium calendar</p>
        <h3 className="mt-2 font-display text-2xl font-medium tracking-[-0.03em] text-fg">{scopedConfig ? 'Your Microsoft calendars are saved.' : 'Bring your Microsoft calendars together.'}</h3>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{scopedConfig ? 'Your last complete calendar view stays available on this device. Premium access resumes live updates without changing your selections.' : 'See the Outlook.com and Microsoft 365 calendars you choose in one calm, current schedule.'}</p>
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
        <h3 className="mt-2 font-display text-2xl font-medium tracking-[-0.03em] text-fg">{discovering ? 'Your Microsoft account is connected.' : "Microsoft's account window is opening."}</h3>
        <p aria-live="polite" role="status" className="mt-3 flex items-center gap-2 text-sm text-fg-muted"><Spinner /> {discovering ? 'Loading your calendars...' : 'Opening Microsoft...'}</p>
        <button type="button" className={`${btnQuiet} mt-6 w-fit min-h-11`} onClick={cancelOperation}>{discovering ? 'Cancel calendar loading' : 'Cancel Microsoft connection'}</button>
      </div>
    )
  }

  if (phase === 'organization_approval') {
    return (
      <div className="min-h-64">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">Your organization controls access</p>
        <h3 className="mt-2 max-w-2xl font-display text-2xl font-medium tracking-[-0.03em] text-fg">Your organization needs to approve Tab Two before this account can connect.</h3>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">No connection was saved. Your existing calendars and accounts are unchanged. You can ask your Microsoft 365 administrator for approval or use another account.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className={`${btnPrimary} min-h-11`} onClick={() => void connectAndDiscover()}>Try another account</button>
          <button type="button" className={`${btnQuiet} min-h-11`} onClick={cancelOperation}>Back to Microsoft Calendar</button>
        </div>
      </div>
    )
  }

  if ((phase === 'picker' || phase === 'saving') && picker) {
    const selectedCount = picker.selected.size
    const otherCount = (scopedConfig?.accounts ?? [])
      .filter((selected) => selected.connectionId !== picker.connection.connectionId && selected.connectionId !== picker.replacesConnectionId)
      .reduce((total, selected) => total + selected.calendars.length, 0)
    const selectionFull = selectedCount >= MAX_SELECTED_PER_ACCOUNT || otherCount + selectedCount >= MAX_SELECTED_TOTAL
    return (
      <div className="min-h-80">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Microsoft Calendar</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h3 className="font-display text-2xl font-medium tracking-[-0.03em] text-fg">Choose calendars</h3>
          <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted"><span className="size-1.5 rounded-full bg-emerald-400" /> Connected</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="break-all text-sm text-fg-muted">{picker.connection.displayEmail}</p>
          <span className="rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] text-accent">{accountKindLabel(picker.connection.accountKind ?? 'personal')}</span>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 border-y border-hairline py-3">
          <div><p className="text-sm font-medium text-fg">Calendars</p><p className="text-xs text-fg-muted">{selectedCount} selected</p></div>
          <button
            type="button"
            className="min-h-11 cursor-pointer text-xs font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => setPicker((current) => current ? {
              ...current,
              selected: new Set(current.calendars.filter((calendar) => calendar.readable).slice(0, Math.min(MAX_SELECTED_PER_ACCOUNT, MAX_SELECTED_TOTAL - otherCount)).map((calendar) => calendar.calendarId)),
            } : current)}
          >Select visible</button>
        </div>
        <div role="group" aria-label={`Calendars for ${picker.connection.displayEmail}`} className="divide-y divide-hairline">
          {picker.calendars.map((calendar) => {
            const checked = picker.selected.has(calendar.calendarId)
            return (
              <label key={calendar.calendarId} className={`flex min-h-11 items-center gap-3 py-2.5 ${calendar.readable ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'}`}>
                <input
                  type="checkbox"
                  aria-label={calendar.name}
                  checked={checked}
                  disabled={!calendar.readable || (!checked && selectionFull)}
                  onChange={() => toggleCalendar(calendar.calendarId)}
                  className="size-5 accent-[var(--accent)]"
                />
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: calendar.color }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{calendar.name}</span>
                  {calendar.isDefault ? <span className="block text-xs text-fg-muted">Default calendar</span> : null}
                </span>
              </label>
            )
          })}
        </div>
        {alert ? <p role="alert" className="mt-3 text-xs text-red-400">{alert}</p> : null}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-hairline pt-4 max-[420px]:grid max-[420px]:grid-cols-1">
          <p className="text-xs text-fg-muted">{selectedCount} {selectedCount === 1 ? 'calendar' : 'calendars'} selected</p>
          <div className="flex justify-end gap-2 max-[420px]:grid max-[420px]:grid-cols-2">
            <button type="button" disabled={phase === 'saving'} className={`${btnQuiet} min-h-11`} onClick={() => setPhase(scopedConfig ? 'summary' : 'consent')}>Back</button>
            <button type="button" disabled={phase === 'saving' || selectedCount === 0} className={`${btnPrimary} min-h-11 disabled:cursor-not-allowed disabled:opacity-50`} onClick={() => void savePicker()}>
              {phase === 'saving' ? <><Spinner /> Saving...</> : picker.editing ? 'Save calendars' : 'Add to Tab Two'}
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
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Microsoft Calendar</p>
            <h3 ref={resultHeading} tabIndex={-1} className="mt-2 font-display text-2xl font-medium tracking-[-0.03em] text-fg outline-none">Personal and work, clearly separated.</h3>
            <p className="mt-1 text-sm text-fg-muted">{scopedConfig.accounts.reduce((total, selected) => total + selected.calendars.length, 0)} selected calendars feed one calm schedule.</p>
          </div>
          <button type="button" aria-label="Add another Microsoft account" className={`${btnQuiet} min-h-11 border-accent/40 text-accent`} onClick={() => void connectAndDiscover()}><span aria-hidden="true">+</span> Add another</button>
        </div>
        {announcement ? <p aria-live="polite" role="status" className="mt-4 border-l-2 border-emerald-400/70 pl-3 text-xs leading-relaxed text-emerald-200">{announcement}</p> : null}
        <div className="mt-5 divide-y divide-hairline border-y border-hairline">
          {scopedConfig.accounts.map((selected) => {
            const provider = connectionById.get(selected.connectionId)
            const runtimeIssue = runtime.snapshot?.connectionIssues?.find((candidate) => candidate.connectionId === selected.connectionId)?.code
            const issue = provider?.status === 'reconnect_required' ? 'reconnect_required' : runtimeIssue ?? null
            const hasRowAlert = rowAlert?.connectionId === selected.connectionId
            const status = hasRowAlert ? 'Needs attention' : issue ? refreshMessage(issue) : 'Up to date'
            const reconnect = issue === 'reconnect_required' || issue === 'unauthorized' || issue === 'organization_approval_required'
            const editSelection = issue === 'limit_exceeded'
            return (
              <div key={selected.connectionId} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 py-4 max-[520px]:grid-cols-[2.5rem_minmax(0,1fr)]">
                <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-xs font-bold text-accent">{initials(selected.displayEmail)}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-all text-sm font-semibold text-fg">{selected.displayEmail}</p>
                    <span className="rounded-full border border-control-border px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] text-fg-muted">{accountKindLabel(selected.accountKind)}</span>
                    <span className={`inline-flex items-center gap-1.5 text-xs ${issue || hasRowAlert ? 'text-amber-200' : 'text-fg-muted'}`}><span className={`size-1.5 rounded-full ${issue || hasRowAlert ? 'bg-amber-300' : 'bg-emerald-400'}`} />{status}</span>
                  </div>
                  <ul aria-label={`Selected calendars for ${selected.displayEmail}`} className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {selected.calendars.map((calendar) => <li key={calendar.calendarId} className="flex items-center gap-1.5 text-xs text-fg-muted"><span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: calendar.color }} />{calendar.name}</li>)}
                  </ul>
                  {rowAlert?.connectionId === selected.connectionId ? <p role="alert" className="mt-2 text-xs leading-relaxed text-red-400">{rowAlert.message}</p> : null}
                </div>
                <div className="flex flex-wrap justify-end gap-1.5 max-[520px]:col-span-2 max-[520px]:pl-[3.25rem]">
                  {reconnect ? (
                    <button type="button" className={`${btnQuiet} min-h-11 text-accent`} aria-label={`Reconnect ${selected.displayEmail}`} onClick={() => void connectAndDiscover(selected.connectionId)}>Reconnect</button>
                  ) : issue || rowAlert?.connectionId === selected.connectionId ? (
                    <button type="button" className={`${btnQuiet} min-h-11 text-accent`} aria-label={`Try again for ${selected.displayEmail}`} onClick={() => void (editSelection ? openExistingPicker(selected.connectionId) : retryConnection(selected.connectionId))}>{editSelection ? 'Edit selection' : 'Try again'}</button>
                  ) : (
                    <button type="button" className={`${btnQuiet} min-h-11`} aria-label={`Manage ${selected.displayEmail}`} onClick={() => void openExistingPicker(selected.connectionId)}>Manage</button>
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
        <p className="mt-4 text-xs leading-relaxed text-fg-muted">Google and free ICS calendars remain connected separately.</p>
        {disconnectTarget ? <DisconnectDialog account={disconnectTarget} pending={disconnectPending} deleteHistory={deleteHistory} onDeleteHistoryChange={setDeleteHistory} onCancel={closeDisconnect} onConfirm={() => void confirmDisconnect()} /> : null}
      </div>
    )
  }

  return (
    <div className="min-h-64">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Microsoft Calendar</p>
        <span className="rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] text-accent">READ-ONLY</span>
      </div>
      <h3 ref={resultHeading} tabIndex={-1} className="mt-2 font-display text-2xl font-medium tracking-[-0.03em] text-fg outline-none">Bring your Microsoft calendars together.</h3>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{CONNECTION_PROMISE}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ['Choose what appears', 'Select only the calendars you want in Tab Two.'],
          ['Keep account ownership clear', 'Personal and work sources stay visibly labeled.'],
          ['Direct to this browser', 'Event details and sync cursors stay on this device.'],
        ].map(([title, detail]) => <div key={title} className="border-l-2 border-accent/45 pl-3"><p className="text-xs font-semibold text-fg">{title}</p><p className="mt-1 text-[11px] leading-relaxed text-fg-muted">{detail}</p></div>)}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className={`${btnPrimary} min-h-11`} onClick={() => void connectAndDiscover()}>Continue with Microsoft</button>
        <button type="button" className={`${btnQuiet} min-h-11`} onClick={closeEditor}>Cancel</button>
      </div>
      <p className="mt-3 border-l-2 border-accent/50 pl-3 text-[11px] leading-relaxed text-fg-muted">{PERMISSION_EXPLANATION}</p>
      <details className="mt-5 border-t border-hairline pt-4 text-xs text-fg-muted">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-fg">How your calendar data stays private</summary>
        <p className="mt-2 leading-relaxed">{PRIVACY_DISCLOSURE}</p>
      </details>
      {announcement ? <p aria-live="polite" role="status" className="mt-3 text-xs leading-relaxed text-emerald-200">{announcement}</p> : null}
      {alert ? <p role="alert" className="mt-3 text-xs leading-relaxed text-red-400">{alert}</p> : null}
    </div>
  )
}

function stateFromConfig(config: MicrosoftCalendarConfig): ProviderConnectionsState {
  return {
    accountId: config.accountId,
    connections: config.accounts.map((selected) => ({
      connectionId: selected.connectionId,
      provider: 'microsoft_calendar',
      accountKind: selected.accountKind,
      displayEmail: selected.displayEmail,
      displayName: null,
      status: 'active',
      grantedScopes: MICROSOFT_CALENDAR_SCOPES,
      createdAt: 0,
      updatedAt: 0,
    })),
  }
}
