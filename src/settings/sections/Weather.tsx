import { useState } from 'react'
import type { AuroraStorage } from '../../lib/storage/index'
import type { StoredLocation } from '../../lib/storage/schema'
import { row, label, btnQuiet } from './shared'

/** Shows the current weather location with a one-click way to clear it
 *  (also clearing the cached forecast, so a stale location's weather never
 *  flashes before the next fetch). Absent entirely — not just empty — when
 *  no location is set, same as before extraction. */
export default function Weather({
  location,
  storage,
}: {
  location: StoredLocation
  storage: AuroraStorage
}) {
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function clearLocation() {
    if (clearing) return
    setClearing(true)
    setError(null)
    try {
      await storage.setMany({ location: null, weatherCache: null, weatherAlertCache: null })
    } catch {
      setError('Could not clear weather location — try again.')
      setClearing(false)
    }
  }

  return (
    <>
      <div className={row}>
        <span className={label}>Location</span>
        <span className="min-w-0 flex-1 truncate text-right text-sm text-fg">{location.label}</span>
        <button
          type="button"
          onClick={() => void clearLocation()}
          disabled={clearing}
          aria-describedby={error ? 'weather-clear-error' : undefined}
          aria-label={`Clear ${location.label} weather location`}
          className={btnQuiet}
        >
          Clear
        </button>
      </div>
      {error && (
        <p id="weather-clear-error" role="alert" className="mt-2 text-sm text-fg-muted">
          {error}
        </p>
      )}
    </>
  )
}
