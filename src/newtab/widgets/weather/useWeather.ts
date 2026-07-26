import { useCallback, useEffect, useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import { openMeteoProvider } from '../../../services/weather/openMeteo'

const MAX_AGE_MS = 30 * 60 * 1000 // refetch after 30 min

export function useWeather() {
  const storage = useStorage()
  const [location] = useStoredKey('location')
  const [snapshot] = useStoredKey('weatherCache')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!location || inFlight.current) return
    inFlight.current = true
    setLoading(true)
    setError(null)
    try {
      const snap = await openMeteoProvider().fetchSnapshot(
        location.lat,
        location.lon,
        location.label,
      )
      await storage.set('weatherCache', snap)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Weather unavailable')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [location, storage])

  useEffect(() => {
    if (!location) return
    const fresh =
      snapshot &&
      snapshot.locationLabel === location.label &&
      Date.now() - snapshot.fetchedAt < MAX_AGE_MS
    if (!fresh) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on location change only
  }, [location?.label])

  const stale = !!snapshot && Date.now() - snapshot.fetchedAt >= MAX_AGE_MS
  return { snapshot: snapshot ?? null, stale, loading, error, refresh }
}
