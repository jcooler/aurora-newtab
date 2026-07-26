import { useState } from 'react'
import { searchCity } from '../../../services/weather/geocode'
import { reverseGeocode } from '../../../services/weather/reverseGeocode'
import type { GeoMatch } from '../../../services/weather/types'
import { useStorage } from '../../../lib/storage/context'

export default function LocationSetup() {
  const storage = useStorage()
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<GeoMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function useDevice() {
    setBusy(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = Math.round(pos.coords.latitude * 100) / 100 // ~1km precision is plenty
          const lon = Math.round(pos.coords.longitude * 100) / 100
          // One-time lookup so the pill reads "Overcast · Dallas", not "· My location"
          const label = (await reverseGeocode(lat, lon)) ?? 'My location'
          await storage.set('location', { lat, lon, label, manual: false })
        } catch {
          setError('Could not save location — try again.')
        } finally {
          setBusy(false)
        }
      },
      () => {
        setBusy(false)
        setError('Location denied — search for your city instead.')
      },
      { timeout: 8000 },
    )
  }

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    setError(null)
    try {
      const found = await searchCity(query)
      setMatches(found)
      if (found.length === 0) setError('No matching city found.')
    } catch {
      setError('City search failed — are you offline?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-fg-muted">Weather needs a location.</p>
      <button
        type="button"
        onClick={useDevice}
        disabled={busy}
        className="self-start rounded-panel border border-panel-border px-2 py-1 text-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        Use my location
      </button>
      <form onSubmit={search} className="flex gap-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="or search a city"
          aria-label="Search for a city"
          className="w-40 border-b border-panel-border bg-transparent text-fg outline-none focus-visible:border-accent"
        />
      </form>
      {matches && matches.length > 0 && (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {matches.map((m) => (
            <li key={`${m.lat},${m.lon}`}>
              <button
                type="button"
                onClick={() =>
                  storage.set('location', {
                    lat: m.lat,
                    lon: m.lon,
                    label: m.name,
                    manual: true,
                  })
                }
                className="text-left text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                {m.name}
                {m.admin1 ? `, ${m.admin1}` : ''}
                {m.country ? ` · ${m.country}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-fg-muted">{error}</p>}
    </div>
  )
}
