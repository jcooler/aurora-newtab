import type { ConnectorConfig, ConnectorId } from './types'

export function canonicalConnectorConfig(value: ConnectorConfig): string {
  function encode(input: unknown): string {
    if (input === null) return 'null'
    if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input)
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) {
        throw new TypeError('Connector snapshot config contains a non-finite number')
      }
      return JSON.stringify(input)
    }
    if (Array.isArray(input)) return `[${input.map(encode).join(',')}]`
    if (typeof input === 'object') {
      const record = input as Record<string, unknown>
      return `{${Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(record[key])}`)
        .join(',')}}`
    }
    throw new TypeError('Connector snapshot config contains an unsupported value')
  }

  return encode(value)
}

export async function connectorSnapshotScope(
  id: ConnectorId,
  config: ConnectorConfig,
): Promise<string> {
  const canonical = canonicalConnectorConfig(config)
  const bytes = new TextEncoder().encode(`${id}\n${canonical}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  const version = id === 'homeassistant' ? 'v2' : 'v1'
  return `${id}:${version}:${hex}`
}

export function newSnapshotEpoch(): string {
  return crypto.randomUUID()
}
