import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAccount } from '../account/AccountContext'
import type { SyncActionOutcome, SyncPhase } from '../account/types'
import { useSyncStorageRuntime } from '../lib/storage/context'
import { createCoordinatorStorage, createSyncCoordinator, retryDelay, type SyncCoordinator } from './coordinator'
import { deleteConflictBackup, restoreConflictBackup } from './conflictBackups'
import {
  createSyncLocalStateStore,
  emptyConflictBackups,
  emptySyncIndex,
  SYNC_CONFLICT_BACKUPS_STORAGE_KEY,
  SYNC_INDEX_STORAGE_KEY,
  type SyncDeviceStateV1,
} from './localState'
import type { SyncGatewayFailure } from './gateway'

const LOCK_NAME = 'tab-two:encrypted-sync:v1'

export interface SyncViewState {
  enabled: boolean
  phase: SyncPhase
  attention: SyncGatewayFailure | null
  lastSuccessAt: number | null
  usedBytes: number
  quotaBytes: 2_097_152
  devices: readonly {
    id: string
    name: string
    lastSyncAt: number | null
    current: boolean
    revoked: boolean
  }[]
  recoveries: readonly {
    id: string
    entityType: string
    entityId: string
    createdAt: number
  }[]
}

export interface SyncViewActions {
  enable(friendlyName: string): Promise<SyncActionOutcome>
  disable(): Promise<SyncActionOutcome>
  syncNow(): Promise<SyncActionOutcome>
  renameDevice(deviceId: string, friendlyName: string): Promise<SyncActionOutcome>
  revokeDevice(deviceId: string): Promise<SyncActionOutcome>
  restoreRecovery(backupId: string): Promise<SyncActionOutcome>
  discardRecovery(backupId: string): Promise<SyncActionOutcome>
  deleteVault(): Promise<SyncActionOutcome>
  deleteAccount(): Promise<SyncActionOutcome>
}

interface SyncContextValue {
  state: SyncViewState
  actions: SyncViewActions
}

const disabledState: SyncViewState = Object.freeze({
  enabled: false,
  phase: 'disabled',
  attention: null,
  lastSuccessAt: null,
  usedBytes: 0,
  quotaBytes: 2_097_152,
  devices: Object.freeze([]),
  recoveries: Object.freeze([]),
})

const unavailable = async (): Promise<SyncActionOutcome> => ({ status: 'needs_attention' })

function localDeviceSummary(device: SyncDeviceStateV1): SyncViewState['devices'][number] {
  return {
    id: device.deviceId,
    name: device.friendlyName,
    lastSyncAt: null,
    current: true,
    revoked: false,
  }
}

function withLocalDevice(
  devices: SyncViewState['devices'],
  device: SyncDeviceStateV1,
): SyncViewState['devices'] {
  const existing = devices.find((candidate) => candidate.id === device.deviceId)
  const current = existing
    ? { ...existing, name: device.friendlyName, current: true, revoked: false }
    : localDeviceSummary(device)
  return [current, ...devices.filter((candidate) => candidate.id !== device.deviceId)]
}

const SyncContext = createContext<SyncContextValue>({
  state: disabledState,
  actions: {
    enable: unavailable,
    disable: unavailable,
    syncNow: unavailable,
    renameDevice: unavailable,
    revokeDevice: unavailable,
    restoreRecovery: unavailable,
    discardRecovery: unavailable,
    deleteVault: unavailable,
    deleteAccount: unavailable,
  },
})

export function SyncProvider({ children }: { children: ReactNode }) {
  const { snapshot, client, actions: accountActions } = useAccount()
  const runtime = useSyncStorageRuntime()
  const [state, setState] = useState<SyncViewState>(disabledState)
  const [device, setDevice] = useState<SyncDeviceStateV1 | null>(null)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  const coordinator = useRef<SyncCoordinator | null>(null)
  const lifecycle = useRef(0)
  const bootstrapFailures = useRef(0)
  const takeoverRequested = useRef(false)
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)

  const localStore = useMemo(() => runtime
    ? createSyncLocalStateStore(runtime.driver, runtime.authority)
    : null, [runtime])

  useEffect(() => {
    const accountId = snapshot.mode === 'signed_in' ? snapshot.accountId : null
    const generation = ++lifecycle.current
    coordinator.current?.stop()
    coordinator.current = null
    if (!accountId || !localStore) {
      bootstrapFailures.current = 0
      setDevice(null)
      setState(disabledState)
      return
    }
    void localStore.readDevice(accountId).then((found) => {
      if (generation !== lifecycle.current) return
      setDevice(found)
      setState(found?.enabled
        ? { ...disabledState, enabled: true, phase: 'syncing', devices: [localDeviceSummary(found)] }
        : disabledState)
    }).catch(() => {
      if (generation === lifecycle.current) setState({ ...disabledState, phase: 'needs_attention' })
    })
  }, [localStore, snapshot.accountId, snapshot.mode])

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === 'visible')
    const onFocus = () => coordinator.current?.focus()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const entitled = snapshot.mode === 'signed_in'
    && snapshot.lease?.capabilities.includes('encrypted_sync') === true
  const accountId = snapshot.mode === 'signed_in' ? snapshot.accountId : null

  useEffect(() => {
    const gateway = client.syncGateway
    const lockManager = typeof navigator === 'undefined' ? undefined : navigator.locks
    if (!visible || !entitled || !accountId || !device?.enabled || !runtime || !localStore || !gateway
      || !lockManager || typeof lockManager.request !== 'function') {
      coordinator.current?.stop()
      coordinator.current = null
      return
    }
    const generation = ++lifecycle.current
    const abort = new AbortController()
    let bootstrapRetryTimer: number | null = null
    const takeOwnership = takeoverRequested.current
    takeoverRequested.current = false
    const lockOptions: LockOptions = takeOwnership
      ? { mode: 'exclusive', steal: true }
      : { mode: 'exclusive', ifAvailable: true, signal: abort.signal }
    void lockManager.request(LOCK_NAME, lockOptions, async (lock) => {
      if (!lock || abort.signal.aborted || generation !== lifecycle.current) {
        if (!abort.signal.aborted && generation === lifecycle.current) {
          setState((current) => ({ ...current, phase: 'needs_attention', attention: 'needs_attention' }))
        }
        return
      }
      const bootstrapped = await gateway.bootstrap({
        accountId,
        deviceId: device.deviceId,
        friendlyName: device.friendlyName,
      }, abort.signal)
      if (abort.signal.aborted || generation !== lifecycle.current) return
      if (!bootstrapped.ok) {
        if (bootstrapped.kind === 'device_limit') {
          try {
            const disabled = await localStore.updateDevice(accountId, (current) => ({
              ...current,
              enabled: false,
              registration: 'unregistered',
            }))
            if (abort.signal.aborted || generation !== lifecycle.current) return
            setDevice(disabled)
          } catch {
            if (!abort.signal.aborted && generation === lifecycle.current) {
              setState((current) => ({ ...current, phase: 'needs_attention', attention: 'needs_attention' }))
            }
            return
          }
        }
        setState((current) => ({
          ...current,
          enabled: bootstrapped.kind === 'device_limit' ? false : current.enabled,
          phase: bootstrapped.kind === 'offline' ? 'offline' : 'needs_attention',
          attention: bootstrapped.kind,
        }))
        if (bootstrapped.kind === 'offline') {
          bootstrapFailures.current += 1
          bootstrapRetryTimer = window.setTimeout(
            () => setBootstrapAttempt((attempt) => attempt + 1),
            retryDelay(bootstrapFailures.current),
          )
        }
        return
      }
      bootstrapFailures.current = 0
      await localStore.updateDevice(accountId, (current) => ({
        ...current,
        enabled: true,
        registration: 'active',
      }))
      if (abort.signal.aborted || generation !== lifecycle.current) return
      const owner = createSyncCoordinator({
        accountId,
        deviceId: device.deviceId,
        key: bootstrapped.value.dataKey,
        gateway,
        storage: createCoordinatorStorage({ ...runtime, accountId }),
        onState: (next) => {
          if (abort.signal.aborted || generation !== lifecycle.current) return
          setState((current) => ({ ...current, ...next, enabled: true, attention: null }))
          void localStore.readConflictBackups(accountId).then((backups) => {
            if (abort.signal.aborted || generation !== lifecycle.current) return
            setState((current) => ({
              ...current,
              recoveries: backups.map((backup) => ({
                id: backup.id,
                entityType: backup.entity.entityType,
                entityId: backup.entity.entityId,
                createdAt: backup.createdAt,
              })),
            }))
          }).catch(() => {
            if (!abort.signal.aborted && generation === lifecycle.current) {
              setState((current) => ({ ...current, phase: 'needs_attention' }))
            }
          })
        },
      })
      coordinator.current = owner
      setState({
        enabled: true,
        phase: 'syncing',
        attention: null,
        lastSuccessAt: null,
        usedBytes: bootstrapped.value.summary.usedBytes,
        quotaBytes: 2_097_152,
        devices: withLocalDevice(bootstrapped.value.summary.devices, device),
        recoveries: (await localStore.readConflictBackups(accountId)).map((backup) => ({
          id: backup.id,
          entityType: backup.entity.entityType,
          entityId: backup.entity.entityId,
          createdAt: backup.createdAt,
        })),
      })
      owner.start()
      await new Promise<void>((resolve) => abort.signal.addEventListener('abort', () => resolve(), { once: true }))
      owner.stop()
      if (coordinator.current === owner) coordinator.current = null
    }).catch(() => {
      if (!abort.signal.aborted && generation === lifecycle.current) {
        setState((current) => ({ ...current, phase: 'needs_attention' }))
      }
    })
    return () => {
      lifecycle.current += 1
      if (bootstrapRetryTimer !== null) window.clearTimeout(bootstrapRetryTimer)
      abort.abort()
      coordinator.current?.stop()
      coordinator.current = null
    }
  }, [accountId, bootstrapAttempt, client, device, entitled, localStore, runtime, visible])

  useEffect(() => {
    if (device?.enabled && !entitled) {
      setState((current) => ({ ...current, enabled: true, phase: 'needs_attention', attention: 'entitlement_required' }))
    }
  }, [device?.enabled, entitled])

  const enable = useCallback(async (friendlyName: string): Promise<SyncActionOutcome> => {
    if (!accountId) return { status: 'authentication_required' }
    if (!entitled) return { status: 'entitlement_required' }
    if (!localStore || !client.syncGateway) return { status: 'needs_attention' }
    try {
      await localStore.ensureDevice(accountId, friendlyName)
      const enabled = await localStore.updateDevice(accountId, (current) => ({
        ...current,
        friendlyName,
        enabled: true,
        registration: current.registration === 'revoked' ? 'unregistered' : current.registration,
      }))
      setDevice(enabled)
      setState((current) => ({
        ...current,
        enabled: true,
        phase: 'syncing',
        attention: null,
        devices: withLocalDevice(current.devices, enabled),
      }))
      return { status: 'completed' }
    } catch {
      return { status: 'needs_attention' }
    }
  }, [accountId, client.syncGateway, entitled, localStore])

  const disable = useCallback(async (): Promise<SyncActionOutcome> => {
    if (!accountId) return { status: 'authentication_required' }
    if (!localStore || !device) return { status: 'needs_attention' }
    lifecycle.current += 1
    coordinator.current?.stop()
    coordinator.current = null
    let disabled: SyncDeviceStateV1
    try {
      disabled = await localStore.updateDevice(accountId, (current) => ({
        ...current, enabled: false,
      }))
      setDevice(disabled)
      setState(disabledState)
    } catch {
      return { status: 'needs_attention' }
    }

    if (disabled.registration !== 'active') return { status: 'completed' }
    if (!client.syncGateway) return { status: 'deactivation_unconfirmed' }
    try {
      const result = await client.syncGateway.deactivateDevice({
        accountId,
        deviceId: disabled.deviceId,
      })
      if (!result.ok) return { status: 'deactivation_unconfirmed' }
      try {
        const inactive = await localStore.updateDevice(accountId, (current) => ({
          ...current, enabled: false, registration: 'inactive',
        }))
        setDevice(inactive)
      } catch {
        // The server already confirmed deactivation and local sync remains off.
      }
      return { status: 'completed' }
    } catch {
      return { status: 'deactivation_unconfirmed' }
    }
  }, [accountId, client.syncGateway, device, localStore])

  const syncNow = useCallback(async (): Promise<SyncActionOutcome> => {
    if (!accountId) return { status: 'authentication_required' }
    if (!entitled) return { status: 'entitlement_required' }
    if (!device?.enabled) return { status: 'needs_attention' }
    if (!coordinator.current) {
      takeoverRequested.current = true
      setState((current) => ({ ...current, phase: 'syncing', attention: null }))
      setBootstrapAttempt((attempt) => attempt + 1)
      return { status: 'completed' }
    }
    await coordinator.current.syncNow()
    const phase = coordinator.current?.getState().phase
    return phase === 'up_to_date'
      ? { status: 'completed' }
      : { status: phase === 'offline' ? 'offline' : 'needs_attention' }
  }, [accountId, device?.enabled, entitled])

  const renameDevice = useCallback(async (deviceId: string, friendlyName: string): Promise<SyncActionOutcome> => {
    if (!accountId) return { status: 'authentication_required' }
    if (!entitled) return { status: 'entitlement_required' }
    const gateway = client.syncGateway
    if (!gateway || !localStore) return { status: 'needs_attention' }
    const result = await gateway.renameDevice({ accountId, deviceId, friendlyName })
    if (!result.ok) return { status: result.kind }
    setState((current) => ({ ...current, devices: result.value.devices }))
    if (device?.deviceId === deviceId) {
      const renamed = await localStore.updateDevice(accountId, (current) => ({ ...current, friendlyName }))
      setDevice(renamed)
    }
    return { status: 'completed' }
  }, [accountId, client.syncGateway, device?.deviceId, entitled, localStore])

  const revokeDevice = useCallback(async (targetDeviceId: string): Promise<SyncActionOutcome> => {
    if (!accountId) return { status: 'authentication_required' }
    if (!entitled) return { status: 'entitlement_required' }
    const gateway = client.syncGateway
    if (!gateway || !device) return { status: 'needs_attention' }
    const result = await gateway.revokeDevice({
      accountId,
      currentDeviceId: device.deviceId,
      targetDeviceId,
    })
    if (!result.ok) return { status: result.kind }
    setState((current) => ({ ...current, devices: result.value.devices }))
    return { status: 'completed' }
  }, [accountId, client.syncGateway, device, entitled])

  const restoreRecovery = useCallback(async (backupId: string): Promise<SyncActionOutcome> => {
    if (!accountId) return { status: 'authentication_required' }
    if (!entitled) return { status: 'entitlement_required' }
    if (!runtime || !localStore) return { status: 'needs_attention' }
    try {
      const backup = (await localStore.readConflictBackups(accountId)).find((item) => item.id === backupId)
      if (!backup) return { status: 'needs_attention' }
      await restoreConflictBackup(
        { driver: runtime.driver, authority: runtime.authority },
        accountId,
        backupId,
        backup.observedRemoteRevision,
      )
      setState((current) => ({
        ...current,
        recoveries: current.recoveries.filter((item) => item.id !== backupId),
      }))
      return { status: 'completed' }
    } catch {
      return { status: 'needs_attention' }
    }
  }, [accountId, entitled, localStore, runtime])

  const discardRecovery = useCallback(async (backupId: string): Promise<SyncActionOutcome> => {
    if (!accountId) return { status: 'authentication_required' }
    if (!runtime) return { status: 'needs_attention' }
    try {
      await deleteConflictBackup({ driver: runtime.driver, authority: runtime.authority }, accountId, backupId)
      setState((current) => ({
        ...current,
        recoveries: current.recoveries.filter((item) => item.id !== backupId),
      }))
      return { status: 'completed' }
    } catch {
      return { status: 'needs_attention' }
    }
  }, [accountId, runtime])

  const clearSyncMetadata = useCallback(async () => {
    if (!accountId || !runtime || !localStore) return
    coordinator.current?.stop()
    coordinator.current = null
    await runtime.authority.runExclusive(async () => {
      await runtime.driver.write({
        [SYNC_INDEX_STORAGE_KEY]: emptySyncIndex(accountId),
        [SYNC_CONFLICT_BACKUPS_STORAGE_KEY]: emptyConflictBackups(accountId),
      })
    })
    const disabled = await localStore.updateDevice(accountId, (current) => ({
      ...current, enabled: false, registration: 'unregistered',
    }))
    setDevice(disabled)
    setState(disabledState)
  }, [accountId, localStore, runtime])

  const deleteVault = useCallback(async (): Promise<SyncActionOutcome> => {
    if (!accountId) return { status: 'authentication_required' }
    if (!device || !client.syncGateway) return { status: 'needs_attention' }
    const result = await client.syncGateway.deleteVault({ accountId, deviceId: device.deviceId })
    if (!result.ok) return { status: result.kind }
    await clearSyncMetadata()
    return { status: 'completed' }
  }, [accountId, clearSyncMetadata, client.syncGateway, device])

  const deleteAccount = useCallback(async (): Promise<SyncActionOutcome> => {
    if (!accountId) return { status: 'authentication_required' }
    if (!client.syncGateway) return { status: 'needs_attention' }
    const result = await client.syncGateway.deleteAccount({ accountId })
    if (!result.ok) return { status: result.kind }
    await clearSyncMetadata()
    await accountActions.signOut()
    return { status: 'completed' }
  }, [accountActions, accountId, clearSyncMetadata, client.syncGateway])

  const actions = useMemo<SyncViewActions>(() => ({
    enable,
    disable,
    syncNow,
    renameDevice,
    revokeDevice,
    restoreRecovery,
    discardRecovery,
    deleteVault,
    deleteAccount,
  }), [
    deleteAccount,
    deleteVault,
    disable,
    discardRecovery,
    enable,
    renameDevice,
    restoreRecovery,
    revokeDevice,
    syncNow,
  ])
  const value = useMemo(() => ({ state, actions }), [actions, state])
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  return useContext(SyncContext)
}
