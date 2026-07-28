import type { AuroraStorage } from '../../lib/storage/index'
import type { StoredLocation } from '../../lib/storage/schema'
import { row, label } from './shared'

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
  return (
    <section aria-label="Weather">
      <h3 className="mb-1 text-sm font-medium text-fg">Weather</h3>
      <div className={row}>
        <span className={label}>Location</span>
        <button
          type="button"
          onClick={() => {
            void storage.set('location', null)
            void storage.set('weatherCache', null)
          }}
          className="rounded border border-panel-border px-2 py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          {`${location.label} — clear`}
        </button>
      </div>
    </section>
  )
}
