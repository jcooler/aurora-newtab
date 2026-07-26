import type { WeatherSnapshot } from '../../lib/storage/schema'

export interface WeatherProvider {
  fetchSnapshot(lat: number, lon: number, label: string): Promise<WeatherSnapshot>
}

export interface GeoMatch {
  name: string
  country: string
  lat: number
  lon: number
}
