import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { useAccount } from '../../account/AccountContext'
import { billingPlanCopy } from '../../account/billing'
import type { BillingActionOutcome, BillingPlan, BillingSummary } from '../../account/billing'
import type { AccountActions, SyncActionOutcome, SyncPhase } from '../../account/types'
import { AssertiveAlert, PoliteStatus } from '../../components/StateFeedback'
import { useDialogEscape } from '../../lib/dialogStack'
import { useFocusTrap } from '../../lib/hooks/useFocusTrap'
import Section from '../Section'
import Switch from '../Switch'
import { btnDanger, btnPrimary, btnQuiet, control, label } from './shared'
import { useSync } from '../../sync/SyncProvider'

const SIGN_IN_STATUS_ID = 'account-sign-in-status'
const DEVICE_LIMIT_ID = 'account-device-limit'
const billingButton = `${btnQuiet} disabled:cursor-not-allowed disabled:opacity-40`
const syncFailureCopy: Record<Exclude<SyncActionOutcome['status'], 'completed'>, string> = {
  authentication_required: 'Sign in with Google to continue.',
  entitlement_required: 'Encrypted sync is not included with the current account access.',
  device_limit: 'Five installations are already syncing. Remove one before trying again.',
  offline: 'You’re offline. Your local data is still available; try again when connected.',
  deactivation_unconfirmed: 'Sync is off on this device. Tab Two could not confirm the device-list update; no local data was removed.',
  needs_attention: 'Sync could not complete safely. Your local data has not been removed.',
}

type SyncActionKind = 'sync' | 'disable' | 'other'

type DestructiveTarget =
  | { kind: 'vault' }
  | { kind: 'account' }
  | { kind: 'device'; deviceId: string; deviceName: string }

const subscriptionLabels: Record<BillingSummary['state'], string> = {
  none: 'No subscription',
  active: 'Active subscription',
  past_due: 'Payment needs attention',
  canceling: 'Subscription canceling',
  expired: 'Subscription expired',
  complimentary: 'Complimentary subscription',
}

const billingErrorCopy: Record<Exclude<BillingActionOutcome['status'], 'opened'>, string> = {
  authentication_required: 'Sign in with Google to continue.',
  not_configured: 'Billing is not configured in this build.',
  unavailable: 'Billing is unavailable right now. Try again.',
}

function BillingPlans({
  billing,
  pending,
  error,
  onChoose,
}: {
  billing: BillingSummary
  pending: boolean
  error: string | null
  onChoose: (plan: BillingPlan) => void
}) {
  const hasManagedSubscription = ['active', 'past_due', 'canceling'].includes(billing.state)
  const annualPlan: BillingPlan = billing.introductoryEligible ? 'intro_annual' : 'annual'
  const monthly = billingPlanCopy.monthly
  const annual = billingPlanCopy[annualPlan]
  return (
    <Section title="Plans">
      <ul className="space-y-3" aria-label="Tab Two plans">
        <li className="flex items-center justify-between gap-4 px-1 py-1 max-[420px]:flex-col max-[420px]:items-stretch max-[420px]:gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">Monthly</p>
            <p className="mt-1 flex items-baseline gap-1 text-fg">
              <span className="font-display text-xl font-medium tracking-[-0.02em]">{monthly.amount}</span>
              <span className="text-xs text-fg-muted">{monthly.cadence}</span>
            </p>
          </div>
          <button type="button" disabled={pending || hasManagedSubscription} onClick={() => onChoose('monthly')} className={billingButton}>Choose monthly</button>
        </li>
        <li className="relative flex items-center justify-between gap-4 overflow-hidden rounded-xl border border-accent/30 bg-accent/5 p-3 pl-4 max-[420px]:flex-col max-[420px]:items-stretch max-[420px]:gap-3">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">Annual</p>
              {annual.badge ? (
                <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent">
                  {annual.badge}
                </span>
              ) : null}
            </div>
            <p className="mt-1 flex items-baseline gap-1.5 text-fg">
              <span className="font-display text-2xl font-semibold tracking-[-0.03em]">{annual.amount}</span>
              <span className="text-xs text-fg-muted">{annual.cadence}</span>
            </p>
            {annual.renewal ? <p className="mt-0.5 text-xs text-fg-muted">{annual.renewal}</p> : null}
          </div>
          <button
            type="button"
            disabled={pending || hasManagedSubscription}
            onClick={() => onChoose(annualPlan)}
            className={`${btnPrimary} shrink-0 disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {billing.introductoryEligible ? 'Start annual plan' : 'Choose annual'}
          </button>
        </li>
      </ul>
      <AssertiveAlert className="mt-2 block px-1 text-xs text-red-400">{error}</AssertiveAlert>
    </Section>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 KB'
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1_048_576).toFixed(bytes % 1_048_576 === 0 ? 0 : 1)} MB`
}

function formatSyncTime(timestamp: number | null): string {
  return timestamp === null ? 'Not synced yet' : new Date(timestamp).toLocaleString()
}

function Fact({ label: factLabel, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="account-sync-fact">
      <dt>{factLabel}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function SyncDisclosure() {
  return (
    <Section title="What syncs">
      <div className="account-sync-disclosure-grid">
        <section aria-label="Encrypted & synced" className="account-sync-disclosure account-sync-disclosure--included">
          <h4>Encrypted &amp; synced</h4>
          <p>Available on your signed-in devices.</p>
          <ul className="account-sync-inventory">
            <li>Layouts and widget settings</li>
            <li>Tasks, notes, habits, and goals</li>
            <li>Safe connector preferences</li>
          </ul>
        </section>
        <section aria-label="Always stays local" className="account-sync-disclosure">
          <h4>Always stays local</h4>
          <p>Never leaves the device where it was added.</p>
          <ul className="account-sync-inventory">
            <li>Passwords and sign-in sessions</li>
            <li>Private URLs and provider data</li>
            <li>Uploaded images and device state</li>
          </ul>
        </section>
      </div>
    </Section>
  )
}

function validDeviceName(value: string): boolean {
  return value === value.trim()
    && [...value].length >= 1
    && [...value].length <= 48
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function DeviceNameDialog({
  mode,
  initialName,
  invokerRef,
  onConfirm,
  onClose,
}: {
  mode: 'enable' | 'rename'
  initialName: string
  invokerRef: RefObject<HTMLButtonElement | null>
  onConfirm: (friendlyName: string) => Promise<SyncActionOutcome>
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState(initialName)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useFocusTrap(dialogRef, true)
  useDialogEscape(() => { if (!pending) onClose() }, true)

  useEffect(() => {
    const invoker = invokerRef.current
    return () => queueMicrotask(() => { if (invoker?.isConnected) invoker.focus() })
  }, [invokerRef])

  const enabling = mode === 'enable'
  const title = enabling ? 'Name this installation' : 'Rename installation'
  const titleId = `account-sync-${mode}-device-title`
  async function confirm() {
    if (!validDeviceName(name)) return
    setPending(true)
    setError(null)
    const result = await onConfirm(name)
    if (result.status === 'completed') {
      onClose()
      return
    }
    setPending(false)
    setError(syncFailureCopy[result.status])
  }
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" onClick={(event) => {
      if (event.target === event.currentTarget && !pending) onClose()
    }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-2xl border border-hairline bg-panel-solid p-5 text-fg shadow-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">Encrypted sync</p>
        <h2 id={titleId} className="mt-2 font-display text-xl font-medium tracking-[-0.02em]">{title}</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {enabling
            ? 'Use a name you’ll recognize when managing up to five installations.'
            : 'This name appears only in your Tab Two device list.'}
        </p>
        <label htmlFor="account-sync-device-name" className={`${label} mt-5 block`}>Device name</label>
        <input
          id="account-sync-device-name"
          value={name}
          maxLength={48}
          autoFocus
          autoComplete="off"
          onChange={(event) => setName(event.currentTarget.value)}
          className={`${control} mt-1 w-full`}
        />
        <p className="mt-2 text-xs text-fg-muted">1–48 characters. You can change this later.</p>
        <AssertiveAlert className="mt-3 block text-xs text-red-400">{error}</AssertiveAlert>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={pending} onClick={onClose} className={btnQuiet}>Cancel</button>
          <button type="button" disabled={pending || !validDeviceName(name)} onClick={() => void confirm()} className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-40`}>
            {enabling ? 'Enable encrypted sync' : 'Save name'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function DestructiveAccountDialog({
  target,
  invokerRef,
  actions,
  execute,
  onClose,
}: {
  target: DestructiveTarget | null
  invokerRef: RefObject<HTMLButtonElement | null>
  actions: AccountActions
  execute: {
    deleteVault(): Promise<SyncActionOutcome>
    deleteAccount(): Promise<SyncActionOutcome>
    revokeDevice(deviceId: string): Promise<SyncActionOutcome>
  }
  onClose: () => void
}) {
  const open = target !== null
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousOpen = useRef(false)
  const [verified, setVerified] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useFocusTrap(dialogRef, open)
  useDialogEscape(onClose, open)

  useEffect(() => {
    const wasOpen = previousOpen.current
    if (open && !wasOpen) {
      setVerified(false)
      setConfirmation('')
      setPending(false)
      setError(null)
    } else if (!open && wasOpen) {
      const invoker = invokerRef.current
      queueMicrotask(() => {
        if (invoker?.isConnected) invoker.focus()
      })
    }
    previousOpen.current = open
  }, [invokerRef, open])

  if (!target) return null

  const deletingAccount = target.kind === 'account'
  const removingDevice = target.kind === 'device'
  const deviceId = target.kind === 'device' ? target.deviceId : null
  const title = deletingAccount
    ? 'Delete your Tab Two account?'
    : removingDevice
      ? `Remove ${target.deviceName}?`
      : 'Delete synced data?'
  const actionLabel = deletingAccount ? 'Delete account' : removingDevice ? 'Remove device' : 'Delete synced data'
  const titleId = `account-${target.kind}-dialog-title`
  const descriptionId = `account-${target.kind}-dialog-description`

  async function verify() {
    setPending(true)
    setError(null)
    const result = await actions.beginSignIn()
    setPending(false)
    if (result.ok) {
      setVerified(true)
      return
    }
    setError('Google verification could not be completed. Try again.')
  }

  async function confirmDelete() {
    if (!verified || (!removingDevice && confirmation !== 'DELETE')) return
    setPending(true)
    setError(null)
    try {
      const result = deletingAccount
        ? await execute.deleteAccount()
        : deviceId
          ? await execute.revokeDevice(deviceId)
          : await execute.deleteVault()
      if (result.status !== 'completed') {
        setPending(false)
        setError(syncFailureCopy[result.status])
        return
      }
      onClose()
    } catch {
      setPending(false)
      setError(`${actionLabel} could not be completed. Try again.`)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-2xl border border-hairline bg-panel-solid p-5 text-fg shadow-2xl"
      >
        <h2 id={titleId} className="font-display text-xl font-medium tracking-[-0.02em]">{title}</h2>
        <p id={descriptionId} className="mt-1 text-sm text-fg-muted">
          {deletingAccount
            ? 'Deletes your Tab Two account and its encrypted synced data.'
            : removingDevice
              ? 'Stops this installation from accessing future synced updates.'
              : 'Deletes the encrypted synced copy for this account.'}
        </p>
        <p className="mt-3 text-sm text-fg">
          {removingDevice
            ? 'Does not erase local data already stored on that installation.'
            : 'Does not erase local data on this or any other installation.'}
        </p>

        <div className="mt-5 space-y-4">
          {verified ? (
            <PoliteStatus className="block text-sm text-fg">Google account verified</PoliteStatus>
          ) : (
            <button type="button" disabled={pending} onClick={() => void verify()} className={btnQuiet}>
              Verify with Google
            </button>
          )}

          {!removingDevice ? (
            <div>
              <label htmlFor={`account-${target.kind}-confirmation`} className={label}>Type DELETE to confirm</label>
              <input
                id={`account-${target.kind}-confirmation`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.currentTarget.value)}
                autoComplete="off"
                className={`${control} mt-1 w-full font-mono`}
              />
            </div>
          ) : null}

          <AssertiveAlert className="block text-xs text-red-400">{error}</AssertiveAlert>

          <div className="flex justify-end gap-2">
            <button type="button" disabled={pending} onClick={onClose} className={btnQuiet}>Cancel</button>
            <button
              type="button"
              disabled={pending || !verified || (!removingDevice && confirmation !== 'DELETE')}
              onClick={() => void confirmDelete()}
              className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function AccountSync() {
  const { snapshot, actions, client } = useAccount()
  const coordinatedSync = useSync()
  const [signInStatus, setSignInStatus] = useState<string | null>(null)
  const [billingPending, setBillingPending] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [destructiveTarget, setDestructiveTarget] = useState<DestructiveTarget | null>(null)
  const [deviceNameTarget, setDeviceNameTarget] = useState<null | { mode: 'enable' | 'rename'; deviceId?: string; initialName: string }>(null)
  const [syncActionError, setSyncActionError] = useState<string | null>(null)
  const [syncActionNotice, setSyncActionNotice] = useState<string | null>(null)
  const [syncActionPending, setSyncActionPending] = useState<SyncActionKind | null>(null)
  const syncActionOriginPhase = useRef<SyncPhase | null>(null)
  const destructiveInvokerRef = useRef<HTMLButtonElement>(null)
  const deviceNameInvokerRef = useRef<HTMLButtonElement>(null)
  const refreshAfterHandoff = useRef(false)
  const refreshInFlight = useRef<Promise<void> | null>(null)

  useEffect(() => {
    if (snapshot.mode !== 'signed_in') return

    let active = true
    const retryTimers = new Set<number>()

    const refresh = () => {
      if (!active || refreshInFlight.current) return

      const pending = (async () => {
        try {
          await actions.refreshBilling()
        } catch {
          // Keep the last server-verified state and retry on the next activation.
        }
      })()
      refreshInFlight.current = pending
      void pending.finally(() => {
        if (refreshInFlight.current === pending) refreshInFlight.current = null
      })
    }

    const refreshOnActivation = () => {
      if (document.visibilityState !== 'visible') return

      const needsConvergenceRetries = refreshAfterHandoff.current
      refreshAfterHandoff.current = false
      refresh()

      if (!needsConvergenceRetries) return
      for (const delay of [1_000, 3_000]) {
        const timer = window.setTimeout(() => {
          retryTimers.delete(timer)
          refresh()
        }, delay)
        retryTimers.add(timer)
      }
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshOnActivation()
    }

    refresh()
    window.addEventListener('focus', refreshOnActivation)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      active = false
      window.removeEventListener('focus', refreshOnActivation)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      for (const timer of retryTimers) window.clearTimeout(timer)
    }
  }, [actions, snapshot.mode])

  async function signIn() {
    setSignInStatus(null)
    const result = await actions.beginSignIn()
    if (result.ok) return
    setSignInStatus(
      result.code === 'not_configured'
        ? 'Google sign-in is not configured in this build.'
        : result.code === 'cancelled'
          ? 'Google sign-in was cancelled.'
          : 'Google sign-in could not be completed. Try again.',
    )
  }

  function openDestructive(target: DestructiveTarget, invoker: HTMLButtonElement) {
    destructiveInvokerRef.current = invoker
    setDestructiveTarget(target)
  }

  async function choosePlan(plan: BillingPlan) {
    setBillingPending(true)
    setBillingError(null)
    const result = await actions.openPlans(plan)
    setBillingPending(false)
    if (result.status === 'opened') {
      refreshAfterHandoff.current = true
      return
    }
    setBillingError(billingErrorCopy[result.status])
  }

  async function manageBilling() {
    setBillingPending(true)
    setBillingError(null)
    const result = await actions.openBilling()
    setBillingPending(false)
    if (result.status === 'opened') {
      refreshAfterHandoff.current = true
      return
    }
    setBillingError(billingErrorCopy[result.status])
  }

  if (snapshot.mode === 'local') {
    return (
      <>
        <Section className="account-sync-intro">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">Account & Sync</p>
          <h2 className="mt-2 font-display text-2xl font-medium tracking-[-0.03em]">Local mode</h2>
          <p className="mt-2 text-sm text-fg-muted">Your Tab Two data stays on this device.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              aria-describedby={signInStatus ? SIGN_IN_STATUS_ID : undefined}
              onClick={() => void signIn()}
              className={btnPrimary}
            >
              Sign in with Google
            </button>
          </div>
          {signInStatus ? (
            <PoliteStatus id={SIGN_IN_STATUS_ID} className="mt-3 block text-xs text-fg-muted">
              {signInStatus}
            </PoliteStatus>
          ) : null}
          <p className="mt-3 text-xs text-fg-muted">Signing in does not enable sync or upload local data.</p>
        </Section>

        <BillingPlans billing={snapshot.billing} pending={billingPending} error={billingError} onChoose={(plan) => void choosePlan(plan)} />

        <SyncDisclosure />
        <p className="py-4 text-xs text-fg-muted">You choose whether to enable encrypted sync after signing in.</p>
      </>
    )
  }

  const hasCoordinator = client.syncGateway !== null
  const syncState = hasCoordinator
    ? coordinatedSync.state
    : { ...snapshot.sync, attention: null, devices: snapshot.devices, recoveries: [] }
  const syncOperations = hasCoordinator
    ? coordinatedSync.actions
    : {
        enable: (friendlyName: string) => actions.enableSync(friendlyName),
        disable: () => actions.disableSync(),
        syncNow: () => actions.syncNow(),
        renameDevice: (deviceId: string, friendlyName: string) => actions.renameDevice(deviceId, friendlyName),
        revokeDevice: (deviceId: string) => actions.revokeDevice(deviceId),
        restoreRecovery: (backupId: string) => actions.restoreConflictBackup(backupId),
        discardRecovery: (backupId: string) => actions.discardConflictBackup(backupId),
        deleteVault: () => actions.deleteVault(),
        deleteAccount: () => actions.deleteAccount(),
      }
  const activeDevices = syncState.devices.filter((device) => !device.revoked)
  const atDeviceLimit = !syncState.enabled && activeDevices.length >= 5
  const rejectedByDeviceLimit = syncState.attention === 'device_limit'
  const currentDevice = activeDevices.find((candidate) => candidate.current) ?? null
  const currentDeviceName = currentDevice?.name ?? 'This device'
  const presentationPhase = syncActionPending === 'sync' && syncActionOriginPhase.current === 'up_to_date'
    ? 'up_to_date'
    : syncState.phase
  const phaseTitle = {
    disabled: 'Sync is off',
    syncing: currentDevice ? `Protecting ${currentDeviceName}` : 'Protecting this device',
    up_to_date: currentDevice ? `${currentDeviceName} is protected` : 'This device is protected',
    offline: currentDevice ? `${currentDeviceName} is waiting` : 'This device is waiting',
    needs_attention: currentDevice ? `${currentDeviceName} needs attention` : 'Sync needs attention',
  }[presentationPhase]
  const phaseDescription = {
    disabled: 'Nothing is uploaded. Your local data stays here.',
    syncing: 'Encrypting and sending your latest changes.',
    up_to_date: 'Encrypted changes are safely up to date.',
    offline: 'Your changes are safe here and will sync automatically when you’re back online.',
    needs_attention: 'Your local data is still safe on this device.',
  }[presentationPhase]
  const syncing = syncActionPending === 'sync' || syncState.phase === 'syncing'
  const retrying = syncState.phase === 'offline' || syncState.phase === 'needs_attention'
  const syncActionLabel = syncing ? 'Syncing…' : retrying ? 'Try again' : 'Sync now'

  async function runSyncAction(action: () => Promise<SyncActionOutcome>, kind: SyncActionKind = 'other') {
    if (syncActionPending !== null) return
    syncActionOriginPhase.current = syncState.phase
    setSyncActionPending(kind)
    setSyncActionError(null)
    setSyncActionNotice(null)
    try {
      const result = await action()
      if (result.status === 'deactivation_unconfirmed') {
        setSyncActionNotice(syncFailureCopy[result.status])
      } else if (result.status !== 'completed') {
        setSyncActionError(syncFailureCopy[result.status])
      }
    } catch {
      setSyncActionError('Sync could not complete safely. Try again.')
    } finally {
      syncActionOriginPhase.current = null
      setSyncActionPending(null)
    }
  }

  return (
    <>
      <Section className="account-sync-intro">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">Account & Sync</p>
        <h2 className="mt-2 font-display text-2xl font-medium tracking-[-0.03em]">
          {snapshot.displayName ?? snapshot.email ?? 'Tab Two account'}
        </h2>
        {snapshot.email && snapshot.displayName ? <p className="mt-1 text-sm text-fg-muted">{snapshot.email}</p> : null}
        <p className="mt-3 text-sm text-fg">{subscriptionLabels[snapshot.billing.state]}</p>
        {snapshot.billing.state === 'past_due' && snapshot.billing.courtesyEnd !== null ? (
          <p className="mt-1 text-xs text-amber-300">Courtesy access ends {new Date(snapshot.billing.courtesyEnd).toLocaleDateString()}.</p>
        ) : null}
        {snapshot.billing.state === 'canceling' && snapshot.billing.currentPeriodEnd !== null ? (
          <p className="mt-1 text-xs text-fg-muted">Access continues through {new Date(snapshot.billing.currentPeriodEnd).toLocaleDateString()}.</p>
        ) : null}
      </Section>

      <BillingPlans billing={snapshot.billing} pending={billingPending} error={billingError} onChoose={(plan) => void choosePlan(plan)} />

      <Section title="Encrypted sync">
        <div className="flex min-h-9 items-center justify-between gap-4">
          <div>
            <label htmlFor="account-sync-enabled" className="text-sm text-fg">Enable sync</label>
            <p className="mt-0.5 text-xs text-fg-muted">Local data stays available when sync is off.</p>
          </div>
          <Switch
            id="account-sync-enabled"
            checked={syncState.enabled}
            disabled={atDeviceLimit || syncActionPending !== null}
            describedBy={atDeviceLimit ? DEVICE_LIMIT_ID : undefined}
            onChange={(enabled) => {
              if (enabled) {
                deviceNameInvokerRef.current = document.getElementById('account-sync-enabled') as HTMLButtonElement
                setDeviceNameTarget({ mode: 'enable', initialName: 'This device' })
              } else {
                void runSyncAction(syncOperations.disable, 'disable')
              }
            }}
          />
        </div>
        {atDeviceLimit || rejectedByDeviceLimit ? (
          <AssertiveAlert id={DEVICE_LIMIT_ID} className="mt-3 block rounded-lg border border-amber-400/35 bg-amber-400/10 p-3 text-xs text-fg">
            {atDeviceLimit
              ? 'Five installations are already syncing. Remove one below before enabling sync here.'
              : 'Five installations are already syncing. Open Tab Two on an existing synced installation and remove one there, then try again here.'}
          </AssertiveAlert>
        ) : null}
        <div
          role="region"
          aria-label="Sync status"
          className={`account-sync-status account-sync-status--${presentationPhase}`}
        >
          <div className="account-sync-status__header">
            <div className="min-w-0">
              <h4 className="account-sync-status__title">{phaseTitle}</h4>
              <PoliteStatus className="account-sync-status__description">{phaseDescription}</PoliteStatus>
            </div>
            {syncState.enabled ? (
              <button
                type="button"
                disabled={syncActionPending !== null || syncState.phase === 'syncing'}
                aria-busy={syncing ? 'true' : undefined}
                onClick={() => void runSyncAction(syncOperations.syncNow, 'sync')}
                className={`${retrying ? btnPrimary : btnQuiet} account-sync-status__action disabled:cursor-not-allowed disabled:opacity-55`}
              >
                {syncing ? <span aria-hidden="true" className="account-sync-status__spinner" /> : null}
                {syncActionLabel}
              </button>
            ) : null}
          </div>
          {syncActionNotice ? (
            <PoliteStatus className="account-sync-status__notice">{syncActionNotice}</PoliteStatus>
          ) : null}
          <AssertiveAlert className="account-sync-status__error">{syncActionError}</AssertiveAlert>
          <dl className="account-sync-facts">
            <Fact label="Last successful sync">{formatSyncTime(syncState.lastSuccessAt)}</Fact>
            <Fact label="Storage used">{formatBytes(syncState.usedBytes)} of {formatBytes(syncState.quotaBytes)}</Fact>
          </dl>
        </div>
      </Section>

      <SyncDisclosure />

      {syncState.recoveries.length > 0 ? (
        <Section title="Recovery copies">
          <p className="mb-3 text-xs text-fg-muted">A local edit was preserved before Tab Two adopted a newer verified copy.</p>
          <ul className="divide-y divide-hairline" aria-label="Recoverable local copies">
            {syncState.recoveries.map((recovery) => (
              <li key={recovery.id} className="flex min-h-14 items-center justify-between gap-3 py-2 max-[420px]:items-start">
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{recovery.entityType.replaceAll('_', ' ')}</p>
                  <p className="text-xs text-fg-muted">Saved {new Date(recovery.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className={btnPrimary} onClick={() => void runSyncAction(() => syncOperations.restoreRecovery(recovery.id))}>Restore</button>
                  <button type="button" className={btnQuiet} onClick={() => void runSyncAction(() => syncOperations.discardRecovery(recovery.id))}>Discard</button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Devices">
        {activeDevices.length === 0 ? (
          <p className="text-sm text-fg-muted">Your devices will appear here after sync is enabled.</p>
        ) : null}
        {activeDevices.length > 0 ? (
          <ul className="account-sync-device-list" aria-label="Signed-in installations">
            {activeDevices.map((device) => (
            <li key={device.id} className="account-sync-device-row">
              <div className="min-w-0">
                <div className="account-sync-device-row__title">
                  <p className="truncate text-sm text-fg">{device.name}</p>
                  {device.current ? <span className="account-sync-device-badge">This device</span> : null}
                </div>
                <p className="mt-1 text-xs text-fg-muted">{device.current ? 'Encrypted sync enabled' : `Last sync: ${formatSyncTime(device.lastSyncAt)}`}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {device.current ? (
                  <button
                    type="button"
                    className={btnQuiet}
                    onClick={(event) => {
                      deviceNameInvokerRef.current = event.currentTarget
                      setDeviceNameTarget({ mode: 'rename', deviceId: device.id, initialName: device.name })
                    }}
                  >
                    Rename
                  </button>
                ) : (
                <button
                  type="button"
                  onClick={(event) => openDestructive(
                    { kind: 'device', deviceId: device.id, deviceName: device.name },
                    event.currentTarget,
                  )}
                  className={btnQuiet}
                  aria-label={`Remove ${device.name}`}
                >
                  Remove
                </button>
                )}
              </div>
            </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Account actions">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={billingPending} onClick={() => void manageBilling()} className={billingButton}>Manage billing</button>
          <button type="button" onClick={() => void actions.signOut()} className={btnQuiet}>Sign out</button>
        </div>
        <div className="mt-5 border-t border-hairline pt-5">
          <p className="mb-3 text-xs text-fg-muted">Destructive actions require fresh Google verification and never erase local data.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={(event) => openDestructive({ kind: 'vault' }, event.currentTarget)} className={btnDanger}>
              Delete synced data
            </button>
            <button type="button" onClick={(event) => openDestructive({ kind: 'account' }, event.currentTarget)} className={btnDanger}>
              Delete account
            </button>
          </div>
        </div>
      </Section>

      <DestructiveAccountDialog
        target={destructiveTarget}
        invokerRef={destructiveInvokerRef}
        actions={actions}
        execute={{
          deleteVault: syncOperations.deleteVault,
          deleteAccount: syncOperations.deleteAccount,
          revokeDevice: syncOperations.revokeDevice,
        }}
        onClose={() => setDestructiveTarget(null)}
      />
      {deviceNameTarget ? (
        <DeviceNameDialog
          mode={deviceNameTarget.mode}
          initialName={deviceNameTarget.initialName}
          invokerRef={deviceNameInvokerRef}
          onConfirm={(friendlyName) => deviceNameTarget.mode === 'enable'
            ? syncOperations.enable(friendlyName)
            : syncOperations.renameDevice(deviceNameTarget.deviceId!, friendlyName)}
          onClose={() => setDeviceNameTarget(null)}
        />
      ) : null}
    </>
  )
}
