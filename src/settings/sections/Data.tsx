import { useRef, useState } from 'react'
import { serializeBackup, parseBackup, validateBackupShape } from '../../lib/backup'
import { migrate } from '../../lib/storage/migrations'
import { todayKey } from '../../lib/dates'
import { defaults, type AuroraData, type DataKey } from '../../lib/storage/schema'
import type { AuroraStorage } from '../../lib/storage/index'
import { row, label } from './shared'

const DATA_KEYS = Object.keys(defaults()) as DataKey[]

/** Export/import backup, including the confirm-before-overwrite dialog.
 *  Entirely section-local: `storage` (SettingsPanel's single useStorage()
 *  call) is the only thing threaded in from outside. */
export default function Data({ storage }: { storage: AuroraStorage }) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<{
    migrated: AuroraData
    summary: string
  } | null>(null)

  async function handleExport() {
    const entries = await Promise.all(
      DATA_KEYS.map(async (key) => [key, await storage.get(key)] as const),
    )
    const data = Object.fromEntries(entries) as unknown as AuroraData
    const json = serializeBackup(data)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aurora-backup-${todayKey()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = '' // allow re-selecting the same file later
    if (!file) return
    setImportError(null)
    setPendingImport(null)
    const text = await file.text()
    const result = parseBackup(text)
    if (!result.ok) {
      setImportError(result.reason)
      return
    }
    const migrated = migrate(result.data, result.version)
    // Shape-check runs AFTER migrate(): a v1 backup's nested widget keys
    // etc. must be backfilled first, or they'd fail validation for simply
    // predating the current schema. A hand-edited/corrupted backup (e.g.
    // `"settings": "oops"`) that gets this far would otherwise be written
    // verbatim and throw at render time inside the always-mounted Drawer.
    const shapeCheck = validateBackupShape(migrated)
    if (!shapeCheck.ok) {
      setImportError(shapeCheck.reason)
      return
    }
    const data = shapeCheck.data
    // parseBackup already confirmed valid JSON; re-parsing here just recovers
    // exportedAt, which parseBackup's contract deliberately omits.
    let exportedAt: string | undefined
    try {
      const raw = JSON.parse(text) as { exportedAt?: unknown }
      if (typeof raw.exportedAt === 'string') exportedAt = raw.exportedAt
    } catch {
      // unreachable: parseBackup already validated this text is JSON
    }
    const dateStr = exportedAt ? exportedAt.slice(0, 10) : 'an unknown date'
    const summary =
      `Replace current data? Backup from ${dateStr} — ${data.todoLists.length} lists, ` +
      `${data.links.length} links, ${data.countdowns.length} countdowns.`
    setPendingImport({ migrated: data, summary })
  }

  async function handleConfirmImport() {
    if (!pendingImport) return
    const { migrated } = pendingImport
    await Promise.all(DATA_KEYS.map((key) => storage.set(key, migrated[key])))
    setPendingImport(null)
  }

  function handleCancelImport() {
    setPendingImport(null)
  }

  return (
    <section aria-label="Data">
      <h3 className="mb-1 text-sm font-semibold text-fg">Data</h3>
      <div className={row}>
        <span className={label}>Export backup</span>
        <button
          type="button"
          onClick={() => void handleExport()}
          className="rounded border border-panel-border px-2 py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
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
          onChange={(e) => void handleImportChange(e)}
          aria-describedby={importError ? 'import-error' : undefined}
          className="max-w-48 text-sm text-fg-muted file:mr-2 file:rounded file:border file:border-panel-border file:bg-transparent file:px-2 file:py-1 file:text-fg"
        />
      </div>
      {importError && (
        <p id="import-error" role="alert" className="text-xs text-fg-muted">
          {importError}
        </p>
      )}
      {pendingImport && (
        <div className="mt-2 flex flex-col gap-2 rounded border border-panel-border p-2">
          <p className="text-sm text-fg-muted">{pendingImport.summary}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleConfirmImport()}
              className="rounded border border-panel-border px-2 py-1 text-sm text-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={handleCancelImport}
              className="rounded border border-panel-border px-2 py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-fg-muted">Background photo uploads are not included.</p>
    </section>
  )
}
