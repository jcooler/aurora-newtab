import type { GeoMatch } from './types'

export async function searchCity(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<GeoMatch[]> {
  // Open-Meteo matches on place NAME only — strip a ", GA"-style qualifier so
  // "Dallas, GA" still finds every Dallas; admin1 in the results disambiguates.
  const name = query.split(',')[0].trim()
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    name,
  )}&count=10&language=en&format=json`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`Geocoding failed: HTTP ${res.status}`)
  const data = await res.json()
  return (data.results ?? []).map(
    (r: {
      name: string
      country?: string
      admin1?: string
      latitude: number
      longitude: number
    }) => ({
      name: r.name,
      country: r.country ?? '',
      admin1: r.admin1 ?? '',
      lat: r.latitude,
      lon: r.longitude,
    }),
  )
}
