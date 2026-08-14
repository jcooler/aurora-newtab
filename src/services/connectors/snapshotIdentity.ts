import type { ConnectorConfig, ConnectorId } from './types'

function canonicalSerializable(input: unknown): string {
  if (input === null) return 'null'
  if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input)
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new TypeError('Connector snapshot scope contains a non-finite number')
    }
    return JSON.stringify(input)
  }
  if (Array.isArray(input)) return `[${input.map(canonicalSerializable).join(',')}]`
  if (typeof input === 'object') {
    const record = input as Record<string, unknown>
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalSerializable(record[key])}`)
      .join(',')}}`
  }
  throw new TypeError('Connector snapshot scope contains an unsupported value')
}

export function canonicalConnectorConfig(value: ConnectorConfig): string {
  return canonicalSerializable(value)
}

export function canonicalConnectorRuntimeScope(value: unknown): string {
  return canonicalSerializable(value)
}

export async function connectorSnapshotScope(
  id: ConnectorId,
  config: ConnectorConfig,
  runtimeScope?: unknown,
): Promise<string> {
  const canonical = canonicalConnectorConfig(config)
  const identity =
    runtimeScope === undefined ? `${id}\n${canonical}` : `${id}\n${canonical}\n${canonicalSerializable(runtimeScope)}`
  const bytes = new TextEncoder().encode(identity)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const version = id === 'homeassistant' || id === 'ics' ? 'v2' : 'v1'
  return `${id}:${version}:${hex}`
}

export function newSnapshotEpoch(): string {
  return crypto.randomUUID()
}
