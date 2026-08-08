import type { AuroraStorage } from '../../lib/storage/index'
import type { StoredLocation } from '../../lib/storage/schema'
import Section from '../Section'
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
  return (
    <Section title="Weather">
      <div className={row}>
        <span className={label}>Location</span>
        <button
          type="button"
          onClick={() => {
            void storage.set('location', null)
            void storage.set('weatherCache', null)
          }}
          className={btnQuiet}
        >
          {`${location.label} — clear`}
        </button>
      </div>
    </Section>
  )
}
