import { permissionMirror } from '../permissionMirror'
import { getConnector } from './registry'
import type { ConnectorConfig, ConnectorId } from './types'

export function hasAttentionConnectorPermission(id: ConnectorId, config: ConnectorConfig): boolean {
  const descriptor = getConnector(id)
  if (!descriptor) return false
  try {
    const origins = descriptor.origins(config)
    if (origins.length === 0) return false
    const snapshot = permissionMirror.snapshot(origins)
    return snapshot.status === 'ready' && snapshot.absent.length === 0
  } catch {
    return false
  }
}
