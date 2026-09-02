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
import { createSyncLocalStateStore, type SyncDeviceStateV1 } from './localState'
import { createCoordinatorStorage, createSyncCoordinator, type SyncCoordinator } from './coordinator'

const LOCK_NAME = 'tab-two:encrypted-sync:v1'

export interface SyncViewState {
  enabled: boolean
  phase: SyncPhase
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
}

export interface SyncViewActions {
  enable(friendlyName: string): Promise<SyncActionOutcome>
  disable(): Promise<SyncActionOutcome>
  syncNow(): Promise<SyncActionOutcome>
}

interface SyncContextValue {
  state: SyncViewState
  actions: SyncViewActions
}

const disabledState: SyncViewState = Object.freeze({
  enabled: false,
  phase: 'disabled',
  lastSuccessAt: null,
  usedBytes: 0,
  quotaBytes: 2_097_152,
  devices: Object.freeze([]),
})

const unavailable = async (): Promise<SyncActionOutcome> => ({ status: 'needs_attention' })
const SyncContext = createContext<SyncContextValue>({
  state: disabledState,
  actions: { enable: unavailable, disable: unavailable, syncNow: unavailable },
})

export function SyncProvider({ children }: { children: ReactNode }) {
  const { snapshot, client } = useAccount()
  const runtime = useSyncStorageRuntime()
  const [state, setState] = useState<SyncViewState>(disabledState)
  const [device, setDevice] = useState<SyncDeviceStateV1 | null>(null)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  const coordinator = useRef<SyncCoordinator | null>(null)
  const lifecycle = useRef(0)

  const localStore = useMemo(() => runtime
    ? createSyncLocalStateStore(runtime.driver, runtime.authority)
    : null, [runtime])

  useEffect(() => {
    const accountId = snapshot.mode === 'signed_in' ? snapshot.accountId : null
    const generation = ++lifecycle.current
    coordinator.current?.stop()
    coordinator.current = null
    if (!accountId || !localStore) {
      setDevice(null)
      setState(disabledState)
      return
    }
    void localStore.readDevice(accountId).then((found) => {
      if (generation !== lifecycle.current) return
      setDevice(found)
      setState(found?.enabled ? { ...disabledState, enabled: true, phase: 'syncing' } : disabledState)
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
    void lockManager.request(LOCK_NAME, {
      mode: 'exclusive',
      ifAvailable: true,
      signal: abort.signal,
    }, async (lock) => {
      if (!lock || abort.signal.aborted || generation !== lifecycle.current) {
        if (!abort.signal.aborted && generation === lifecycle.current) {
          setState((current) => ({ ...current, phase: 'up_to_date' }))
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
        setState((current) => ({
          ...current,
          phase: bootstrapped.kind === 'offline' ? 'offline' : 'needs_attention',
        }))
        return
      }
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
          setState((current) => ({ ...current, ...next, enabled: true }))
        },
      })
      coordinator.current = owner
      setState({
        enabled: true,
        phase: 'syncing',
        lastSuccessAt: null,
        usedBytes: bootstrapped.value.summary.usedBytes,
        quotaBytes: 2_097_152,
        devices: bootstrapped.value.summary.devices,
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
      abort.abort()
      coordinator.current?.stop()
      coordinator.current = null
    }
  }, [accountId, client, device, entitled, localStore, runtime, visible])

  useEffect(() => {
    if (device?.enabled && !entitled) {
      setState((current) => ({ ...current, enabled: true, phase: 'needs_attention' }))
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
      setState((current) => ({ ...current, enabled: true, phase: 'syncing' }))
      return { status: 'completed' }
    } catch {
      return { status: 'needs_attention' }
    }
  }, [accountId, client.syncGateway, entitled, localStore])

  const disable = useCallback(async (): Promise<SyncActionOutcome> => {
    if (!accountId) return { status: 'authentication_required' }
    if (!localStore || !device) return { status: 'needs_attention' }
    coordinator.current?.stop()
    coordinator.current = null
    const result = client.syncGateway
      ? await client.syncGateway.deactivateDevice({ accountId, deviceId: device.deviceId })
      : { ok: false as const, kind: 'needs_attention' as const }
    if (!result.ok) return { status: result.kind }
    try {
      const disabled = await localStore.updateDevice(accountId, (current) => ({
        ...current, enabled: false, registration: 'inactive',
      }))
      setDevice(disabled)
      setState(disabledState)
      return { status: 'completed' }
    } catch {
      return { status: 'needs_attention' }
    }
  }, [accountId, client.syncGateway, device, localStore])

  const syncNow = useCallback(async (): Promise<SyncActionOutcome> => {
    if (!accountId) return { status: 'authentication_required' }
    if (!entitled) return { status: 'entitlement_required' }
    if (!device?.enabled || !coordinator.current) return { status: 'needs_attention' }
    await coordinator.current.syncNow()
    const phase = coordinator.current?.getState().phase
    return phase === 'up_to_date'
      ? { status: 'completed' }
      : { status: phase === 'offline' ? 'offline' : 'needs_attention' }
  }, [accountId, device?.enabled, entitled])

  const actions = useMemo<SyncViewActions>(() => ({ enable, disable, syncNow }), [disable, enable, syncNow])
  const value = useMemo(() => ({ state, actions }), [actions, state])
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  return useContext(SyncContext)
}
