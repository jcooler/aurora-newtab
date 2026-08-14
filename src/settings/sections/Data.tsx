import { useRef, useState } from 'react'
import { prepareBackup, serializeBackup } from '../../lib/backup'
import {
  restorePreparedBackup,
  type PreparedBackup,
  type RestoreBackupResult,
} from '../../lib/backupRestore'
import { todayKey } from '../../lib/dates'
import type { AuroraStorage } from '../../lib/storage'
import { getConnector } from '../../services/connectors/registry'
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
  const [alert, setAlert] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [restorePending, setRestorePending] = useState(false)
  const [restoreAttempted, setRestoreAttempted] = useState(false)

  async function handleExport() {
    setAlert(null)
    setStatus(null)
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
    } catch {
      setAlert('Aurora could not create the backup file. Try again.')
    }
  }

  async function handleImportChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setAlert(null)
    setStatus(null)
    setPendingImport(null)
    setRestoreAttempted(false)
    let text: string
    try {
      text = await file.text()
    } catch {
      setAlert('Aurora could not read that backup file. Choose it again or try another file.')
      return
    }
    const result = prepareBackup(text)
    if (!result.ok) {
      setAlert(result.reason)
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
    if (result.pendingCleanup.length > 0) reportPendingCleanup(result.pendingCleanup)
    setRestorePending(false)
    if (result.status !== 'committed') {
      setRestoreAttempted(true)
      setAlert(result.message)
      return
    }
    const reminder = reentryReminder(prepared, result.reentryRequired)
    setPendingImport(null)
    setRestoreAttempted(false)
    setAlert(null)
    setStatus(`Backup restored.${reminder ? ` ${reminder}` : ''}`)
  }

  function failRestoreSafely() {
    setRestorePending(false)
    setRestoreAttempted(true)
    setAlert('That backup could not be restored. Your current data was left unchanged. You can retry.')
  }

  function handleConfirmImport() {
    if (!pendingImport || restorePending) return
    const prepared = pendingImport.prepared
    setRestorePending(true)
    setAlert(null)
    setStatus(null)
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
    if (restorePending) return
    setPendingImport(null)
    setRestoreAttempted(false)
    setAlert(null)
  }

  const reminder = pendingImport ? reentryReminder(pendingImport.prepared) : null

  return (
    <Section title="Data">
      <div className={row}>
        <span className={label}>Export backup</span>
        <button type="button" onClick={() => void handleExport()} className={btnQuiet}>
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
          aria-describedby={alert ? 'data-backup-alert' : undefined}
          className="max-w-48 text-sm text-fg-muted transition-colors file:mr-2 file:rounded-lg file:border file:border-control-border file:bg-transparent file:px-2.5 file:py-1 file:text-fg hover:file:bg-control-bg-hover"
        />
      </div>
      {alert && (
        <p id="data-backup-alert" role="alert" className="text-xs text-fg-muted">
          {alert}
        </p>
      )}
      {status && (
        <p role="status" className="text-xs text-fg-muted">
          {status}
        </p>
      )}
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
              disabled={restorePending}
              className={btnPrimary}
            >
              {restorePending ? 'Restoring...' : restoreAttempted ? 'Retry restore' : 'Confirm restore'}
            </button>
            <button
              type="button"
              onClick={handleCancelImport}
              disabled={restorePending}
              className={btnQuiet}
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
