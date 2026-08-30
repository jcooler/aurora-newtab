import { useState } from 'react'

import type { AuroraStorage } from '../../lib/storage'
import {
  refreshPolicyFor,
  refreshValueFor,
  type RefreshSourceId,
  type RefreshPreferences,
  type RefreshValue,
} from '../../services/refreshPolicy'
import { btnQuiet, select } from './shared'

export default function RefreshFrequencyControl({
  source,
  label,
  storage,
  preferences,
  onRefreshNow,
}: {
  source: RefreshSourceId
  label: string
  storage: AuroraStorage
  preferences: RefreshPreferences | undefined
  onRefreshNow: () => Promise<void>
}) {
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const policy = refreshPolicyFor(source)
  if (!policy.configurable) return null
  const value = refreshValueFor(source, preferences)

  const save = (next: RefreshValue) => {
    void storage.update('refreshPreferences', (current) => ({ ...current, [source]: next }))
  }

  const refreshNow = async () => {
    if (refreshing) return
    setRefreshing(true)
    setError(null)
    try {
      await onRefreshNow()
    } catch {
      setError(`Could not refresh ${label}. Try again.`)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section aria-label={`${label} refresh`} className="mt-4 border-t border-hairline pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={`refresh-frequency-${source}`} className="text-sm text-fg-muted">
          Refresh frequency
        </label>
        <div className="flex items-center gap-2">
          <select
            id={`refresh-frequency-${source}`}
            aria-label={`${label} refresh frequency`}
            value={String(value)}
            onChange={(event) => save(event.currentTarget.value === 'manual' ? 'manual' : Number(event.currentTarget.value))}
            className={select}
          >
            {policy.options.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 1 ? 'Every minute' : `Every ${minutes} minutes`}
                {minutes === policy.defaultMinutes ? ' (Balanced)' : ''}
              </option>
            ))}
            <option value="manual">Manual only</option>
          </select>
          <button
            type="button"
            aria-label={`Refresh ${label} now`}
            disabled={refreshing}
            onClick={() => void refreshNow()}
            className={btnQuiet}
          >
            {refreshing ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">
        Refreshes only while Tab Two is visible. Open tabs share one refresh.
      </p>
      {error ? <p role="alert" className="mt-2 text-xs text-fg-muted">{error}</p> : null}
    </section>
  )
}
