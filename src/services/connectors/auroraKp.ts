import type { AuroraKpConfig, ConnectorDescriptor } from './types'
import { getJson } from './http'

export const AURORA_KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json'
const FORECAST_HORIZON_MS = 72 * 60 * 60_000
const MAX_FORECAST_ROWS = 25

export type KpSource = 'observed' | 'estimated' | 'predicted'
export type AuroraActivity = 'Quiet' | 'Unsettled' | 'Storm'

export interface KpInterval {
  time: string
  kp: number
  source: KpSource
  scale: `G${1 | 2 | 3 | 4 | 5}` | null
}

export interface AuroraKpData {
  current: KpInterval | null
  forecast: KpInterval[]
  peak: KpInterval | null
}

export function auroraActivity(kp: number): AuroraActivity {
  if (kp >= 5) return 'Storm'
  if (kp >= 3) return 'Unsettled'
  return 'Quiet'
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const timestamp = Date.parse(`${value.trim().replace(' ', 'T')}Z`)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function parseScale(value: unknown): KpInterval['scale'] {
  return typeof value === 'string' && /^G[1-5]$/.test(value) ? value as KpInterval['scale'] : null
}

function normalizeRows(body: unknown): KpInterval[] | null {
  if (!Array.isArray(body) || body.length === 0 || !Array.isArray(body[0])) return null
  const header = body[0] as unknown[]
  const timeIndex = header.indexOf('time_tag')
  const kpIndex = header.indexOf('Kp')
  const sourceIndex = header.indexOf('observed')
  const scaleIndex = header.indexOf('noaa_scale')
  if ([timeIndex, kpIndex, sourceIndex, scaleIndex].some((index) => index < 0)) return null
  const sources = new Set<KpSource>(['observed', 'estimated', 'predicted'])
  const rows: KpInterval[] = []
  for (const candidate of body.slice(1)) {
    if (!Array.isArray(candidate)) continue
    const time = parseTimestamp(candidate[timeIndex])
    const kp = typeof candidate[kpIndex] === 'number'
      ? candidate[kpIndex]
      : typeof candidate[kpIndex] === 'string'
        ? Number(candidate[kpIndex])
        : NaN
    const source = candidate[sourceIndex]
    if (!time || !Number.isFinite(kp) || kp < 0 || kp > 9 || !sources.has(source as KpSource)) continue
    rows.push({ time, kp, source: source as KpSource, scale: parseScale(candidate[scaleIndex]) })
  }
  return rows.sort((a, b) => a.time.localeCompare(b.time))
}

export function isAuroraKpData(value: unknown): value is AuroraKpData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<AuroraKpData>
  const valid = (row: unknown): row is KpInterval => !!row && typeof row === 'object'
    && typeof (row as KpInterval).time === 'string'
    && Number.isFinite((row as KpInterval).kp)
    && (row as KpInterval).kp >= 0
    && (row as KpInterval).kp <= 9
    && ['observed', 'estimated', 'predicted'].includes((row as KpInterval).source)
  return (data.current === null || valid(data.current))
    && Array.isArray(data.forecast)
    && data.forecast.length <= MAX_FORECAST_ROWS
    && data.forecast.every(valid)
    && (data.peak === null || valid(data.peak))
}

export async function fetchAuroraKp(
  now: Date,
  fetchFn: typeof fetch = fetch,
): Promise<AuroraKpData> {
  try {
    const result = await getJson<unknown>(AURORA_KP_URL, { Accept: 'application/json' }, fetchFn)
    if (!result.ok) throw new Error('request failed')
    const rows = normalizeRows(result.body)
    if (!rows) throw new Error('invalid response')
    const nowMs = now.getTime()
    const current = rows
      .filter((row) => row.source !== 'predicted' && Date.parse(row.time) <= nowMs)
      .at(-1) ?? null
    const forecast = rows
      .filter((row) => {
        const time = Date.parse(row.time)
        return row.source === 'predicted' && time > nowMs && time <= nowMs + FORECAST_HORIZON_MS
      })
      .slice(0, MAX_FORECAST_ROWS)
    const peak = forecast.reduce<KpInterval | null>((best, row) => {
      if (!best || row.kp > best.kp) return row
      return best
    }, null)
    return { current, forecast, peak }
  } catch {
    throw new Error('Aurora & Kp is unavailable.')
  }
}

export function isAuroraKpConfig(config: unknown): config is AuroraKpConfig {
  if (!config || typeof config !== 'object') return false
  return typeof (config as Partial<AuroraKpConfig>).enabled === 'boolean'
}

export const auroraKpDescriptor: ConnectorDescriptor<AuroraKpConfig> = {
  id: 'auroraKp',
  label: 'Aurora & Kp',
  blurb: 'Current geomagnetic activity and the next forecast peak',
  category: 'at-a-glance',
  auth: 'none',
  ttlMs: 15 * 60_000,
  secretFields: [],
  origins: () => [],
  ownsOrigins: isAuroraKpConfig,
}
