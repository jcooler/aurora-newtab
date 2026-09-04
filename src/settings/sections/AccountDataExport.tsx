import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import {
  accountDataExportFilename,
  createAccountDataExportV1,
  downloadJsonFile,
  serializeAccountDataExport,
} from '../../account/dataExport'
import type { AccountActions, AccountDataExportOutcome } from '../../account/types'
import { AssertiveAlert, PoliteStatus } from '../../components/StateFeedback'
import { useDialogEscape } from '../../lib/dialogStack'
import { useFocusTrap } from '../../lib/hooks/useFocusTrap'
import Section from '../Section'
import { btnPrimary, btnQuiet } from './shared'

type ExportActions = Pick<AccountActions, 'beginSignIn' | 'prepareAccountDataExport'>
type ExportPhase = 'idle' | 'preparing' | 'success' | 'failure'
type Download = (serialized: string, filename: string) => void

const failureCopy: Record<Exclude<AccountDataExportOutcome['status'], 'ready'>, string> = {
  authentication_required: 'Sign in with Google to continue.',
  verification_required: 'Google verification is required before downloading.',
  offline: 'You’re offline. Nothing was downloaded; try again when connected.',
  rate_limited: 'Too many download attempts. Please wait and try again.',
  data_unavailable: 'Tab Two could not prepare a complete download. Nothing was changed.',
}

function VerificationDialog({
  invokerRef,
  pending,
  onConfirm,
  onClose,
}: {
  invokerRef: RefObject<HTMLButtonElement | null>
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true)
  useDialogEscape(() => { if (!pending) onClose() }, true)

  useEffect(() => {
    const invoker = invokerRef.current
    return () => queueMicrotask(() => { if (invoker?.isConnected) invoker.focus() })
  }, [invokerRef])

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-data-export-title"
        className="w-full max-w-lg rounded-2xl border border-hairline bg-panel-solid p-5 text-fg shadow-2xl"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">Private export</p>
        <h2 id="account-data-export-title" className="mt-2 font-display text-xl font-medium tracking-[-0.02em]">
          Download your account data?
        </h2>
        <p className="mt-3 text-sm leading-6 text-fg-muted">
          Tab Two will ask Google to verify that it is really you, then prepare one readable JSON file on this device.
        </p>
        <p className="mt-4 border-l-2 border-accent pl-3 text-xs leading-5 text-fg">
          The download never includes passwords, sign-in sessions, payment IDs, provider tokens, or encryption keys.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2 max-[420px]:flex-col-reverse">
          <button type="button" disabled={pending} onClick={onClose} className={`${btnQuiet} disabled:opacity-50`}>Cancel</button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-55`}
          >
            Verify with Google &amp; download
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function AccountDataExport({
  accountId,
  enabled,
  actions,
  now = Date.now,
  download = (serialized, filename) => downloadJsonFile(serialized, filename),
}: {
  accountId: string
  enabled: boolean
  actions: ExportActions
  now?: () => number
  download?: Download
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [phase, setPhase] = useState<ExportPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const invokerRef = useRef<HTMLButtonElement>(null)
  const requestPending = useRef(false)

  useEffect(() => {
    setDialogOpen(false)
    setPhase('idle')
    setError(null)
    requestPending.current = false
  }, [accountId])

  if (!enabled) return null

  function openDialog(event: React.MouseEvent<HTMLButtonElement>) {
    if (requestPending.current) return
    invokerRef.current = event.currentTarget
    setDialogOpen(true)
  }

  function fail(message: string) {
    setPhase('failure')
    setError(message)
  }

  async function prepareDownload() {
    if (requestPending.current) return
    requestPending.current = true
    setDialogOpen(false)
    setPhase('preparing')
    setError(null)
    try {
      const verification = await actions.beginSignIn()
      if (!verification.ok) {
        fail(verification.code === 'cancelled'
          ? 'Google verification was cancelled. Nothing was downloaded.'
          : verification.code === 'not_configured'
            ? 'Google verification is not configured in this build.'
            : 'Google verification could not be completed. Try again.')
        return
      }
      const result = await actions.prepareAccountDataExport()
      if (result.status !== 'ready') {
        fail(failureCopy[result.status])
        return
      }
      const exportedAt = now()
      const serialized = serializeAccountDataExport(createAccountDataExportV1(result.value, exportedAt))
      download(serialized, accountDataExportFilename(exportedAt))
      setPhase('success')
    } catch {
      fail('The download could not be saved. Nothing was changed.')
    } finally {
      requestPending.current = false
    }
  }

  const preparing = phase === 'preparing'
  return (
    <>
      <Section title="Your data">
        <div className="account-data-export-row">
          <div className="min-w-0">
            <h4 className="text-sm font-medium text-fg">Download account data</h4>
            <p className="mt-1 max-w-xl text-xs leading-5 text-fg-muted">
              {preparing
                ? 'Preparing a private, readable copy. Keep this window open.'
                : 'Create a readable JSON copy of your account details, connected accounts, subscription, devices, and encrypted sync data.'}
            </p>
            {phase === 'success' ? (
              <PoliteStatus className="mt-2 block text-xs text-accent">Account data downloaded.</PoliteStatus>
            ) : null}
            <AssertiveAlert className="mt-2 block text-xs text-red-400">{error}</AssertiveAlert>
          </div>
          <button
            ref={invokerRef}
            type="button"
            disabled={preparing}
            aria-busy={preparing ? 'true' : undefined}
            onClick={openDialog}
            className={`${phase === 'failure' ? btnPrimary : btnQuiet} account-data-export-action disabled:cursor-not-allowed disabled:opacity-55`}
          >
            {preparing ? <span aria-hidden="true" className="account-sync-status__spinner" /> : null}
            {preparing ? 'Preparing download...' : phase === 'failure' ? 'Try again' : 'Download account data'}
          </button>
        </div>
      </Section>
      {dialogOpen ? (
        <VerificationDialog
          invokerRef={invokerRef}
          pending={false}
          onConfirm={() => void prepareDownload()}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </>
  )
}
