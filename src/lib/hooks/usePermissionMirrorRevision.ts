import { useSyncExternalStore } from 'react'
import { permissionMirror } from '../../services/permissionMirror'

export function usePermissionMirrorRevision(): number {
  return useSyncExternalStore(permissionMirror.subscribe, permissionMirror.getRevision, permissionMirror.getRevision)
}
