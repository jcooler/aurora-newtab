import type { WeatherSnapshot } from '../../lib/storage/schema'

export interface WeatherProvider {
  fetchSnapshot(
    lat: number,
    lon: number,
    label: string,
    options?: { signal?: AbortSignal },
  ): Promise<WeatherSnapshot>
}

export interface GeoMatch {
  name: string
  country: string
  admin1: string // state/region, e.g. "Georgia" — disambiguates same-name cities
  lat: number
  lon: number
}
