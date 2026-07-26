import type { GeoMatch } from './types'

export async function searchCity(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<GeoMatch[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query.trim(),
  )}&count=5&language=en&format=json`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`Geocoding failed: HTTP ${res.status}`)
  const data = await res.json()
  return (data.results ?? []).map(
    (r: { name: string; country?: string; latitude: number; longitude: number }) => ({
      name: r.name,
      country: r.country ?? '',
      lat: r.latitude,
      lon: r.longitude,
    }),
  )
}
