import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { useAccount } from '../../account/AccountContext'
import type { AccountActions, SubscriptionState } from '../../account/types'
import { AssertiveAlert, PoliteStatus } from '../../components/StateFeedback'
import { useDialogEscape } from '../../lib/dialogStack'
import { useFocusTrap } from '../../lib/hooks/useFocusTrap'
import Section from '../Section'
import Switch from '../Switch'
import { btnDanger, btnPrimary, btnQuiet, control, label } from './shared'

const SIGN_IN_STATUS_ID = 'account-sign-in-status'
const DEVICE_LIMIT_ID = 'account-device-limit'

const subscriptionLabels: Record<SubscriptionState, string> = {
  none: 'No subscription',
  active: 'Active subscription',
  past_due: 'Payment needs attention',
  canceling: 'Subscription canceling',
  expired: 'Subscription expired',
  complimentary: 'Complimentary subscription',
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

function DestructiveAccountDialog({
  kind,
  invokerRef,
  actions,
  onClose,
}: {
  kind: 'vault' | 'account' | null
  invokerRef: RefObject<HTMLButtonElement | null>
  actions: AccountActions
  onClose: () => void
}) {
  const open = kind !== null
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

  if (!kind) return null

  const deletingAccount = kind === 'account'
  const title = deletingAccount ? 'Delete your Tab Two account?' : 'Delete synced data?'
  const actionLabel = deletingAccount ? 'Delete account' : 'Delete synced data'
  const titleId = `account-${kind}-dialog-title`
  const descriptionId = `account-${kind}-dialog-description`

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
    if (!verified || confirmation !== 'DELETE') return
    setPending(true)
    setError(null)
    try {
      if (deletingAccount) await actions.deleteAccount()
      else await actions.deleteVault()
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
            : 'Deletes the encrypted synced copy for this account.'}
        </p>
        <p className="mt-3 text-sm text-fg">Does not erase local data on this or any other installation.</p>

        <div className="mt-5 space-y-4">
          {verified ? (
            <PoliteStatus className="block text-sm text-fg">Google account verified</PoliteStatus>
          ) : (
            <button type="button" disabled={pending} onClick={() => void verify()} className={btnQuiet}>
              Verify with Google
            </button>
          )}

          <div>
            <label htmlFor={`account-${kind}-confirmation`} className={label}>Type DELETE to confirm</label>
            <input
              id={`account-${kind}-confirmation`}
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              autoComplete="off"
              className={`${control} mt-1 w-full font-mono`}
            />
          </div>

          <AssertiveAlert className="block text-xs text-red-400">{error}</AssertiveAlert>

          <div className="flex justify-end gap-2">
            <button type="button" disabled={pending} onClick={onClose} className={btnQuiet}>Cancel</button>
            <button
              type="button"
              disabled={pending || !verified || confirmation !== 'DELETE'}
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
  const { snapshot, actions } = useAccount()
  const [signInStatus, setSignInStatus] = useState<string | null>(null)
  const [destructiveKind, setDestructiveKind] = useState<'vault' | 'account' | null>(null)
  const destructiveInvokerRef = useRef<HTMLButtonElement>(null)

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

  function openDestructive(kind: 'vault' | 'account', invoker: HTMLButtonElement) {
    destructiveInvokerRef.current = invoker
    setDestructiveKind(kind)
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
            <button type="button" onClick={() => void actions.openPlans()} className={btnQuiet}>View plans</button>
          </div>
          {signInStatus ? (
            <PoliteStatus id={SIGN_IN_STATUS_ID} className="mt-3 block text-xs text-fg-muted">
              {signInStatus}
            </PoliteStatus>
          ) : null}
          <p className="mt-3 text-xs text-fg-muted">Signing in does not enable sync or upload local data.</p>
        </Section>

        <Section title="What sync can include">
          <ul className="account-sync-inventory">
            <li>Settings, layouts, and widget configuration</li>
            <li>Tasks, habits, goals, and custom links</li>
            <li>Passwords, tokens, sessions, and feed URLs</li>
          </ul>
          <p className="mt-3 text-xs text-fg-muted">You choose whether to enable encrypted sync after signing in.</p>
        </Section>
      </>
    )
  }

  const activeDevices = snapshot.devices.filter((device) => !device.revoked)
  const atDeviceLimit = !snapshot.sync.enabled && activeDevices.length >= 5

  return (
    <>
      <Section className="account-sync-intro">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">Account & Sync</p>
        <h2 className="mt-2 font-display text-2xl font-medium tracking-[-0.03em]">
          {snapshot.displayName ?? snapshot.email ?? 'Tab Two account'}
        </h2>
        {snapshot.email && snapshot.displayName ? <p className="mt-1 text-sm text-fg-muted">{snapshot.email}</p> : null}
        <p className="mt-3 text-sm text-fg">{subscriptionLabels[snapshot.subscription]}</p>
      </Section>

      <Section title="Encrypted sync">
        <div className="flex min-h-9 items-center justify-between gap-4">
          <div>
            <label htmlFor="account-sync-enabled" className="text-sm text-fg">Enable sync</label>
            <p className="mt-0.5 text-xs text-fg-muted">Local data stays available when sync is off.</p>
          </div>
          <Switch
            id="account-sync-enabled"
            checked={snapshot.sync.enabled}
            disabled={atDeviceLimit}
            describedBy={atDeviceLimit ? DEVICE_LIMIT_ID : undefined}
            onChange={(enabled) => void (enabled ? actions.enableSync() : actions.disableSync())}
          />
        </div>
        {atDeviceLimit ? (
          <AssertiveAlert id={DEVICE_LIMIT_ID} className="mt-3 block rounded-lg border border-amber-400/35 bg-amber-400/10 p-3 text-xs text-fg">
            Five installations are already syncing. Remove one below before enabling sync here.
          </AssertiveAlert>
        ) : null}
        <dl className="account-sync-facts mt-5">
          <Fact label="Last successful sync">{formatSyncTime(snapshot.sync.lastSuccessAt)}</Fact>
          <Fact label="Storage used">{formatBytes(snapshot.sync.usedBytes)} of {formatBytes(snapshot.sync.quotaBytes)}</Fact>
          <Fact label="Status">{snapshot.sync.phase.replaceAll('_', ' ')}</Fact>
        </dl>
        <button type="button" onClick={() => void actions.syncNow()} className={`${btnQuiet} mt-4`}>Sync now</button>
      </Section>

      <Section title="Devices">
        <ul className="divide-y divide-hairline" aria-label="Signed-in installations">
          {activeDevices.map((device) => (
            <li key={device.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-fg">{device.name}</p>
                <p className="text-xs text-fg-muted">
                  {device.current ? 'Current installation' : `Last sync: ${formatSyncTime(device.lastSyncAt)}`}
                </p>
              </div>
              {!device.current ? (
                <button type="button" onClick={() => void actions.revokeDevice(device.id)} className={btnQuiet} aria-label={`Remove ${device.name}`}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Account actions">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void actions.openBilling()} className={btnQuiet}>Manage billing</button>
          <button type="button" onClick={() => void actions.signOut()} className={btnQuiet}>Sign out</button>
        </div>
        <div className="mt-5 border-t border-hairline pt-5">
          <p className="mb-3 text-xs text-fg-muted">Destructive actions require fresh Google verification and never erase local data.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={(event) => openDestructive('vault', event.currentTarget)} className={btnDanger}>
              Delete synced data
            </button>
            <button type="button" onClick={(event) => openDestructive('account', event.currentTarget)} className={btnDanger}>
              Delete account
            </button>
          </div>
        </div>
      </Section>

      <DestructiveAccountDialog
        kind={destructiveKind}
        invokerRef={destructiveInvokerRef}
        actions={actions}
        onClose={() => setDestructiveKind(null)}
      />
    </>
  )
}
