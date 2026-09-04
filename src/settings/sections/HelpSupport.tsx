import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useAccount } from '../../account/AccountContext'
import type { AccountSnapshot } from '../../account/types'
import { useDialogEscape } from '../../lib/dialogStack'
import { useFocusTrap } from '../../lib/hooks/useFocusTrap'
import {
  createDiagnosticReport,
  diagnosticFilename,
  serializeDiagnosticReport,
  type DiagnosticReportV1,
} from '../../support/diagnostics'
import { useSync, type SyncViewState } from '../../sync/SyncProvider'
import DisclosureSection from '../DisclosureSection'
import Section from '../Section'
import { btnPrimary, btnQuiet } from './shared'

const BILLING_STATUS: Readonly<Record<AccountSnapshot['billing']['state'], string>> = {
  none: 'No subscription',
  active: 'Active subscription',
  past_due: 'Payment needs attention',
  canceling: 'Subscription cancelling',
  expired: 'Subscription expired',
  complimentary: 'Complimentary subscription',
}

function accountStatus(account: AccountSnapshot): string {
  return account.mode === 'local' ? 'Local mode' : 'Signed in'
}

function billingStatus(account: AccountSnapshot): string {
  return account.mode === 'local' ? 'No subscription' : BILLING_STATUS[account.billing.state]
}

function syncStatus(sync: SyncViewState): string {
  if (!sync.enabled || sync.phase === 'disabled') return 'Sync is off'
  if (sync.phase === 'syncing') return 'Syncing now'
  if (sync.phase === 'offline') return 'Offline, local data is safe'
  if (sync.phase === 'needs_attention') return 'Sync needs attention'
  const currentDevice = sync.devices.find((device) => device.current && !device.revoked)
  return currentDevice ? `${currentDevice.name} is protected` : 'Encrypted sync is protected'
}

function downloadDiagnosticReport(report: DiagnosticReportV1): void {
  const blob = new Blob([serializeDiagnosticReport(report)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = diagnosticFilename(report)
  anchor.click()
  URL.revokeObjectURL(url)
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 py-2 first:pt-0 last:pb-0 max-[420px]:grid-cols-1 max-[420px]:gap-0.5">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="text-sm font-medium text-fg">{value}</span>
    </div>
  )
}

function DiagnosticDialog({
  report,
  download,
  onClose,
}: {
  report: DiagnosticReportV1
  download(report: DiagnosticReportV1): void
  onClose(): void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  useFocusTrap(dialogRef, true)
  useDialogEscape(onClose, true)

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagnostic-report-title"
        className="my-auto w-full max-w-[42rem] overflow-hidden rounded-3xl border border-panel-border bg-panel-solid text-fg shadow-2xl shadow-black/60"
      >
        <header className="border-b border-hairline bg-[radial-gradient(circle_at_0_0,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_55%)] px-7 py-6 max-[520px]:px-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Private by design</p>
          <h2 id="diagnostic-report-title" className="mt-1 font-display text-2xl font-semibold tracking-[-0.025em]">
            Review diagnostic report
          </h2>
          <p className="mt-2 max-w-[36rem] text-sm leading-relaxed text-fg-muted">
            This report includes only app, account-state, billing-state, and sync-health fields. It excludes names, email addresses, identifiers, tokens, URLs, and your content.
          </p>
        </header>

        <div className="space-y-5 px-7 py-6 max-[520px]:px-5">
          <pre
            role="textbox"
            aria-label="Diagnostic report contents"
            aria-readonly="true"
            tabIndex={0}
            className="max-h-[45dvh] overflow-auto rounded-xl border border-control-border bg-control-bg/45 p-4 text-xs leading-relaxed text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            {serializeDiagnosticReport(report)}
          </pre>
          <p className="text-xs leading-relaxed text-fg-muted">
            Downloading saves this JSON file to your device. Tab Two does not upload or send it.
          </p>
          <div className="flex flex-wrap justify-end gap-2 max-[420px]:flex-col-reverse">
            <button type="button" className={`${btnQuiet} min-h-11`} onClick={onClose}>Cancel</button>
            <button
              type="button"
              className={`${btnPrimary} min-h-11`}
              onClick={() => {
                download(report)
                onClose()
              }}
            >
              Download report
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export function HelpSupportView({
  account,
  sync,
  now = Date.now,
  download = downloadDiagnosticReport,
}: {
  account: AccountSnapshot
  sync: SyncViewState
  now?: () => number
  download?: (report: DiagnosticReportV1) => void
}) {
  const createButtonRef = useRef<HTMLButtonElement>(null)
  const [report, setReport] = useState<DiagnosticReportV1 | null>(null)
  const [diagnosticError, setDiagnosticError] = useState(false)

  function closeReport() {
    setReport(null)
    queueMicrotask(() => createButtonRef.current?.focus())
  }

  function createReport() {
    try {
      setDiagnosticError(false)
      setReport(createDiagnosticReport({ now: now(), appVersion: __APP_VERSION__, account, sync }))
    } catch {
      setDiagnosticError(true)
    }
  }

  return (
    <>
      <Section title="Help">
        <div className="max-w-[34rem]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Help & troubleshooting</p>
          <h2 className="mt-1 font-display text-[1.7rem] font-semibold tracking-[-0.035em] text-fg">Keep Tab Two working</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Check the signals that matter, recover common connections, and create a privacy-safe report when you need a closer look.
          </p>
        </div>

        <section
          aria-label="Tab Two status"
          className="mt-5 border-l-2 border-accent bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_8%,transparent),transparent_65%)] px-4 py-3"
        >
          <StatusRow label="Account" value={accountStatus(account)} />
          <StatusRow label="Billing" value={billingStatus(account)} />
          <StatusRow label="Encrypted sync" value={syncStatus(sync)} />
        </section>
      </Section>

      <Section title="Quick recovery" className="space-y-2">
        <DisclosureSection title="Sign-in and billing">
          <p className="text-sm leading-relaxed text-fg-muted">
            Account & Sync updates your subscription automatically after sign-in, checkout, cancellation, and payment changes. If the status looks old, close and reopen Settings after confirming you are online.
          </p>
        </DisclosureSection>
        <DisclosureSection title="Encrypted sync">
          <p className="text-sm leading-relaxed text-fg-muted">
            Sync now starts a fresh protected update. If a connection fails, your local data stays in place; check your connection and use Try again only while an error is shown.
          </p>
        </DisclosureSection>
        <DisclosureSection title="Google Calendar">
          <p className="text-sm leading-relaxed text-fg-muted">
            Reconnect only the account that needs attention. Existing calendars remain separate, and disconnecting removes Tab Two's access without deleting events from Google.
          </p>
        </DisclosureSection>
        <DisclosureSection title="Microsoft Calendar">
          <p className="text-sm leading-relaxed text-fg-muted">
            Your personal and work or school accounts stay separate. Reconnect the affected account, then choose its calendars again if Microsoft asks you to grant access.
          </p>
        </DisclosureSection>
        <DisclosureSection title="Backup and deletion">
          <p className="text-sm leading-relaxed text-fg-muted">
            Data creates a local backup you can keep before making major changes. Account & Sync handles synced-data and account deletion, with fresh verification before anything is removed from the service.
          </p>
        </DisclosureSection>
      </Section>

      <Section title="Diagnostic report">
        <div className="rounded-2xl border border-control-border bg-control-bg/25 p-4">
          <h3 className="font-display text-lg font-semibold text-fg">A private snapshot you control</h3>
          <p className="mt-1 max-w-[34rem] text-sm leading-relaxed text-fg-muted">
            Your diagnostic stays on this device until you download it.
          </p>
          <p className="mt-1 max-w-[34rem] text-sm leading-relaxed text-fg-muted">
            Review every field first; Tab Two never sends the report automatically.
          </p>
          <button
            ref={createButtonRef}
            type="button"
            className={`${btnPrimary} mt-4 min-h-11`}
            onClick={createReport}
          >
            Create diagnostic report
          </button>
          {diagnosticError ? (
            <p role="alert" className="mt-3 text-sm text-red-400">The report could not be created safely.</p>
          ) : null}
        </div>
      </Section>

      <Section title="More help">
        <p className="max-w-[34rem] text-sm leading-relaxed text-fg-muted">
          Tab Two is independently developed and maintained. Self-service guidance is available here, and product assistance is best-effort without guaranteed response times.
        </p>
        <div className="mt-3 max-w-[34rem] border-l-2 border-accent/70 pl-3">
          <p className="text-sm leading-relaxed text-fg">
            A monitored private support channel will be available before launch.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            Until then, use the guidance here and keep diagnostic reports and personal information private.
          </p>
        </div>
      </Section>

      {report ? <DiagnosticDialog report={report} download={download} onClose={closeReport} /> : null}
    </>
  )
}

export default function HelpSupport() {
  const { snapshot } = useAccount()
  const { state } = useSync()
  return <HelpSupportView account={snapshot} sync={state} />
}
