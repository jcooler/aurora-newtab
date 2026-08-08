import { useState } from 'react'
import type { AuroraStorage } from '../../lib/storage/index'
import type { WorldClock } from '../../lib/storage/schema'
import Section from '../Section'
import { row, label, control, submitBtn } from './shared'

const MAX_WORLD_CLOCKS = 4
const TIME_ZONES = Intl.supportedValuesOf('timeZone')
const TIME_ZONE_SET = new Set(TIME_ZONES)

/** Default label for a newly-added zone: its city segment, underscores
 *  un-escaped (e.g. 'America/New_York' -> 'New York'). */
function cityFromZone(zone: string): string {
  const city = zone.split('/').pop() ?? zone
  return city.replace(/_/g, ' ')
}

/** Existing zones (edit label / remove) plus the add-zone form, capped at
 *  MAX_WORLD_CLOCKS. `worldClocks` is owned by SettingsPanel (its
 *  useStoredKey read) and flows down as a prop; the add-zone form's own
 *  draft state is section-local. */
export default function WorldClocks({
  worldClocks,
  storage,
}: {
  worldClocks: WorldClock[] | undefined
  storage: AuroraStorage
}) {
  const [newZone, setNewZone] = useState('')
  const [newZoneLabel, setNewZoneLabel] = useState('')
  const [zoneLabelTouched, setZoneLabelTouched] = useState(false)
  const [zoneError, setZoneError] = useState(false)

  const updateWorldClocks = (fn: (list: WorldClock[]) => WorldClock[]) =>
    void storage.update('worldClocks', fn)

  function handleAddZone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const zone = newZone.trim()
    if (!zone || !TIME_ZONE_SET.has(zone)) {
      setZoneError(true)
      return
    }
    const finalLabel = newZoneLabel.trim() || cityFromZone(zone)
    updateWorldClocks((list) =>
      list.length >= MAX_WORLD_CLOCKS ? list : [...list, { zone, label: finalLabel }],
    )
    setNewZone('')
    setNewZoneLabel('')
    setZoneLabelTouched(false)
    setZoneError(false)
  }

  return (
    <Section title="World clocks">
      {(worldClocks ?? []).map((wc, i) => (
        <div key={`${wc.zone}-${i}`} className={row}>
          <span className={label}>{wc.zone}</span>
          <div className="flex items-center gap-2">
            <label htmlFor={`wc-label-${i}`} className="sr-only">
              Label for {wc.zone}
            </label>
            <input
              id={`wc-label-${i}`}
              key={wc.label} // remount on external change, same as the profile name field above
              defaultValue={wc.label}
              onBlur={(e) => {
                const value = e.currentTarget.value.trim()
                if (!value || value === wc.label) return
                updateWorldClocks((list) =>
                  list.map((z, j) => (j === i ? { ...z, label: value } : z)),
                )
              }}
              className={`${control} w-28`}
            />
            <button
              type="button"
              aria-label={`Remove ${wc.label}`}
              onClick={() => updateWorldClocks((list) => list.filter((_, j) => j !== i))}
              className="rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      {(worldClocks?.length ?? 0) < MAX_WORLD_CLOCKS && (
        <form className={row} onSubmit={handleAddZone}>
          <div className="flex items-center gap-2">
            <label htmlFor="wc-new-zone" className="sr-only">
              Time zone
            </label>
            <input
              id="wc-new-zone"
              list="wc-zone-options"
              placeholder="Time zone"
              value={newZone}
              onChange={(e) => {
                const zone = e.currentTarget.value
                setNewZone(zone)
                setZoneError(false)
                if (!zoneLabelTouched) setNewZoneLabel(cityFromZone(zone))
              }}
              aria-describedby={zoneError ? 'wc-zone-error' : undefined}
              className={`${control} w-36`}
            />
            <datalist id="wc-zone-options">
              {TIME_ZONES.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="wc-new-label" className="sr-only">
              Label
            </label>
            <input
              id="wc-new-label"
              placeholder="Label"
              value={newZoneLabel}
              onChange={(e) => {
                setNewZoneLabel(e.currentTarget.value)
                setZoneLabelTouched(true)
              }}
              className={`${control} w-24`}
            />
            <button type="submit" className={submitBtn}>
              Add
            </button>
          </div>
        </form>
      )}
      {zoneError && (
        <p id="wc-zone-error" role="alert" className="text-xs text-fg-muted">
          Pick a time zone from the list.
        </p>
      )}
    </Section>
  )
}
