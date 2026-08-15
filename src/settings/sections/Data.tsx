import { useId, useRef, useState } from 'react'
import { prepareBackup, serializeBackup } from '../../lib/backup'
import {
  restorePreparedBackup,
  type PreparedBackup,
  type RestoreBackupResult,
} from '../../lib/backupRestore'
import { todayKey } from '../../lib/dates'
import type { AuroraStorage } from '../../lib/storage'
import { getConnector } from '../../services/connectors/registry'
import { AssertiveAlert, PoliteStatus } from '../../components/StateFeedback'
import Section from '../Section'
import { row, label, btnQuiet, btnPrimary } from './shared'

interface PendingImport {
  prepared: PreparedBackup
  summary: string
}

function reentryReminder(prepared: PreparedBackup, ids = prepared.redactions.reentryRequired): string | null {
  if (prepared.legacyReentryMayBeRequired) {
    return 'This older backup may omit connection details. Review connector settings and re-enter anything missing.'
  }
  const labels = [...new Set(ids.flatMap((id) => {
    const descriptor = getConnector(id)
    return descriptor ? [descriptor.label] : []
  }))]
  return labels.length > 0
    ? `Re-enter connection details after restore: ${labels.join(', ')}.`
    : null
}

export default function Data({
  storage,
  reportPendingCleanup,
}: {
  storage: AuroraStorage
  reportPendingCleanup: (patterns: readonly string[]) => void
}) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const operationInFlightRef = useRef<'export' | 'restore' | null>(null)
  const statusId = useId()
  const alertId = useId()
  const [alert, setAlert] = useState<string | null>(null)
  const [alertOwner, setAlertOwner] = useState<'export' | 'import' | 'restore' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [statusOwner, setStatusOwner] = useState<'export' | 'restore' | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [exportPending, setExportPending] = useState(false)
  const [restorePending, setRestorePending] = useState(false)
  const [restoreAttempted, setRestoreAttempted] = useState(false)

  async function handleExport() {
    if (operationInFlightRef.current) return
    operationInFlightRef.current = 'export'
    setExportPending(true)
    setAlert(null)
    setAlertOwner(null)
    setStatus('Creating backup…')
    setStatusOwner('export')
    try {
      const data = await storage.snapshot()
      const json = serializeBackup(data)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `aurora-backup-${todayKey()}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setStatus('Backup downloaded.')
    } catch {
      setStatus(null)
      setStatusOwner(null)
      setAlert('Aurora could not create the backup file. Try again.')
      setAlertOwner('export')
    } finally {
      if (operationInFlightRef.current === 'export') operationInFlightRef.current = null
      setExportPending(false)
    }
  }

  async function handleImportChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (operationInFlightRef.current) return
    if (!file) return
    setAlert(null)
    setAlertOwner(null)
    setStatus(null)
    setStatusOwner(null)
    setPendingImport(null)
    setRestoreAttempted(false)
    let text: string
    try {
      text = await file.text()
    } catch {
      setAlert('Aurora could not read that backup file. Choose it again or try another file.')
      setAlertOwner('import')
      return
    }
    const result = prepareBackup(text)
    if (!result.ok) {
      setAlert(result.reason)
      setAlertOwner('import')
      return
    }
    const date = result.exportedAt ? result.exportedAt.slice(0, 10) : 'an unknown date'
    setPendingImport({
      prepared: result,
      summary:
        `Replace current data? Backup from ${date} - ${result.data.todoLists.length} lists, `
        + `${result.data.links.length} links, ${result.data.countdowns.length} countdowns.`,
    })
  }

  function finishRestore(result: RestoreBackupResult, prepared: PreparedBackup) {
    if (operationInFlightRef.current === 'restore') operationInFlightRef.current = null
    if (result.pendingCleanup.length > 0) reportPendingCleanup(result.pendingCleanup)
    setRestorePending(false)
    if (result.status !== 'committed') {
      setRestoreAttempted(true)
      setStatus(null)
      setStatusOwner(null)
      setAlert(result.message)
      setAlertOwner('restore')
      return
    }
    const reminder = reentryReminder(prepared, result.reentryRequired)
    setPendingImport(null)
    setRestoreAttempted(false)
    setAlert(null)
    setAlertOwner(null)
    setStatus(`Backup restored.${reminder ? ` ${reminder}` : ''}`)
    setStatusOwner('restore')
  }

  function failRestoreSafely() {
    if (operationInFlightRef.current === 'restore') operationInFlightRef.current = null
    setRestorePending(false)
    setRestoreAttempted(true)
    setStatus(null)
    setStatusOwner(null)
    setAlert('That backup could not be restored. Your current data was left unchanged. You can retry.')
    setAlertOwner('restore')
  }

  function handleConfirmImport() {
    if (!pendingImport || operationInFlightRef.current) return
    operationInFlightRef.current = 'restore'
    const prepared = pendingImport.prepared
    setRestorePending(true)
    setAlert(null)
    setAlertOwner(null)
    setStatus('Restoring backup…')
    setStatusOwner('restore')
    let restore: Promise<RestoreBackupResult>
    try {
      restore = restorePreparedBackup(storage, prepared)
    } catch {
      failRestoreSafely()
      return
    }
    void restore.then(
      (result) => finishRestore(result, prepared),
      () => failRestoreSafely(),
    )
  }

  function handleCancelImport() {
    if (operationInFlightRef.current) return
    setPendingImport(null)
    setRestoreAttempted(false)
    setAlert(null)
    setAlertOwner(null)
    setStatus(null)
    setStatusOwner(null)
  }

  const reminder = pendingImport ? reentryReminder(pendingImport.prepared) : null

  return (
    <Section title="Data">
      <div className={row}>
        <span className={label}>Export backup</span>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exportPending || restorePending}
          aria-busy={exportPending ? 'true' : undefined}
          aria-describedby={
            statusOwner === 'export' ? statusId : alertOwner === 'export' ? alertId : undefined
          }
          className={`${btnQuiet} min-h-9 min-w-9`}
        >
          Export
        </button>
      </div>
      <div className={row}>
        <label htmlFor="set-import" className={label}>
          Import backup
        </label>
        <input
          id="set-import"
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          onChange={(event) => void handleImportChange(event)}
          disabled={exportPending || restorePending}
          aria-describedby={alertOwner === 'import' ? alertId : undefined}
          className="min-h-9 min-w-9 max-w-48 text-sm text-fg-muted transition-colors file:mr-2 file:rounded-lg file:border file:border-control-border file:bg-transparent file:px-2.5 file:py-1 file:text-fg hover:file:bg-control-bg-hover"
        />
      </div>
      <AssertiveAlert id={alertId} className="text-xs text-fg-muted">
        {alert}
      </AssertiveAlert>
      <PoliteStatus id={statusId} className="text-xs text-fg-muted">
        {status}
      </PoliteStatus>
      {pendingImport && (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-control-border p-3">
          <p className="text-sm text-fg-muted">{pendingImport.summary}</p>
          <p className="text-sm text-fg-muted">
            This restore needs access to {pendingImport.prepared.requiredOrigins.length} configured sites. Chrome will ask for any missing access when you confirm.
          </p>
          {reminder && <p className="text-sm text-fg-muted">{reminder}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={restorePending || exportPending}
              aria-busy={restorePending ? 'true' : undefined}
              aria-describedby={
                statusOwner === 'restore' ? statusId : alertOwner === 'restore' ? alertId : undefined
              }
              className={`${btnPrimary} min-h-9 min-w-9`}
            >
              {restorePending ? 'Restoring...' : restoreAttempted ? 'Retry restore' : 'Confirm restore'}
            </button>
            <button
              type="button"
              onClick={handleCancelImport}
              disabled={restorePending || exportPending}
              aria-describedby={restorePending || exportPending ? statusId : undefined}
              className={`${btnQuiet} min-h-9 min-w-9`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-fg-muted">
        Background photo uploads, connector sign-in secrets, RSS and calendar capability URLs, and cached connector data are not included.
      </p>
    </Section>
  )
}
