import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStorage } from '../storage/context'
import {
  currentCacheAuthorityEpoch,
  subscribeCacheAuthority,
} from '../cacheAuthority'
import type { ConnectorConfig, ConnectorId, ConnectorSnapshot } from '../../services/connectors/types'
import { getConnector } from '../../services/connectors/registry'
import {
  canonicalConnectorEventConfig,
  canonicalConnectorRuntimeScope,
  connectorSnapshotScope,
} from '../../services/connectors/snapshotIdentity'
import { resourceStateOf, type AsyncResourceState } from '../asyncState'

const inFlight = new Map<string, Promise<unknown>>()
const latestConfigKeys = new Map<ConnectorId, string>()

export function __resetInFlight(): void {
  inFlight.clear()
  latestConfigKeys.clear()
}

interface SnapshotState<T> {
  configKey: string | null
  data: T | null
  fetchedAt: number | null
  refreshing: boolean
  lastError: string | null
}

const EMPTY_STATE = {
  configKey: null,
  data: null,
  fetchedAt: null,
  refreshing: false,
  lastError: null,
} as const

/**
 * Configuration-scoped SWR for connector snapshots. The synchronous
 * canonical key filters old data on the config-changing render; the opaque
 * SHA-256 scope is the only identity persisted with the cache.
 */
export function useConnectorSnapshot<T>(
  id: ConnectorId,
  config: ConnectorConfig,
  refresh: (prev: T | null) => Promise<T>,
  ttlMs: number = getConnector(id)?.ttlMs ?? 0,
  runtimeScope?: unknown,
  isData?: (value: unknown) => value is T,
): {
  data: T | null
  fetchedAt: number | null
  refreshing: boolean
  lastError: string | null
  state: AsyncResourceState
} {
  const storage = useStorage()
  const cacheAuthorityEpoch = useSyncExternalStore(
    subscribeCacheAuthority,
    currentCacheAuthorityEpoch,
    currentCacheAuthorityEpoch,
  )
  const runtimeKey = runtimeScope === undefined ? '' : canonicalConnectorRuntimeScope(runtimeScope)
  const connectorConfigKey = `${canonicalConnectorEventConfig(id, config)}\n${runtimeKey}`
  const configKey = `${connectorConfigKey}\ncache:${cacheAuthorityEpoch}`
  const [state, setState] = useState<SnapshotState<T>>(EMPTY_STATE)

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const isDataRef = useRef(isData)
  isDataRef.current = isData

  useLayoutEffect(() => {
    latestConfigKeys.set(id, configKey)
  }, [id, configKey])

  useEffect(() => {
    let live = true
    let unsubscribe: () => void = () => undefined
    let unsubscribeConnectors: () => void = () => undefined
    let removeRestorationListeners: () => void = () => undefined
    let expiryTimer: number | undefined

    const isCurrent = () => (
      latestConfigKeys.get(id) === configKey &&
      currentCacheAuthorityEpoch() === cacheAuthorityEpoch
    )

    const clearExpiryTimer = () => {
      if (expiryTimer !== undefined) {
        window.clearTimeout(expiryTimer)
        expiryTimer = undefined
      }
    }

    const setCurrentState = (update: (current: SnapshotState<T>) => SnapshotState<T>) => {
      if (!live || !isCurrent()) return
      setState((previous) => {
        const current = previous.configKey === configKey ? previous : { ...EMPTY_STATE, configKey }
        return update(current)
      })
    }

    void (async () => {
      const scope = await connectorSnapshotScope(id, config, runtimeScope)
      if (!live || !isCurrent()) return

      const scheduleCheck = (delayMs: number, checkFreshness: () => Promise<void>) => {
        clearExpiryTimer()
        expiryTimer = window.setTimeout(() => void checkFreshness(), delayMs)
      }

      const showSnapshot = (snapshot: ConnectorSnapshot): boolean => {
        if (isDataRef.current && !isDataRef.current(snapshot.data)) return false
        setCurrentState((current) => ({
          ...current,
          data: snapshot.data as T,
          fetchedAt: snapshot.fetchedAt,
        }))
        return true
      }

      let checkFreshness: () => Promise<void>

      const scheduleSnapshot = (snapshot: ConnectorSnapshot) => {
        const dueIn = Math.max(0, snapshot.fetchedAt + ttlMs - Date.now())
        scheduleCheck(dueIn, checkFreshness)
      }

      const scheduleRetry = () => {
        const retryIn = Math.min(Math.max(ttlMs, 1_000), 30_000)
        scheduleCheck(retryIn, checkFreshness)
      }

      const runRefresh = async (previousData: T | null): Promise<void> => {
        const connectors = await storage.get('connectors')
        if (!live || !isCurrent()) return
        const authoritativeConfig = connectors[id]
        const authoritativeConfigKey = authoritativeConfig
          ? `${canonicalConnectorEventConfig(id, authoritativeConfig)}\n${runtimeKey}`
          : null
        // Snapshot removal and connector replacement are delivered as
        // separate React/storage notifications. Revalidate before issuing
        // the request so the old mounted owner cannot make one last call with
        // credentials that authoritative storage has already disconnected.
        if (!authoritativeConfig?.enabled || authoritativeConfigKey !== connectorConfigKey) return

        const requestKey = `${id}\n${scope}\ncache:${cacheAuthorityEpoch}`
        let pending = inFlight.get(requestKey)
        const owner = pending === undefined
        if (pending === undefined) {
          pending = Promise.resolve().then(() => refreshRef.current(previousData))
          inFlight.set(requestKey, pending)
        }

        setCurrentState((current) => ({ ...current, refreshing: true }))
        try {
          const result = await pending
          if (isDataRef.current && !isDataRef.current(result)) {
            throw new Error(`Invalid ${id} snapshot payload`)
          }
          if (owner && isCurrent()) {
            const snapshot: ConnectorSnapshot = {
              scope,
              fetchedAt: Date.now(),
              data: result,
            }
            await storage.updateMany(['connectors', 'connectorSnapshots'], ({ connectors, connectorSnapshots }) => {
              const authoritativeConfig = connectors[id]
              const authoritativeConfigKey = authoritativeConfig
                ? `${canonicalConnectorEventConfig(id, authoritativeConfig)}\n${runtimeKey}`
                : null
              // A restore/config save can commit before React propagates the
              // new props into this mounted owner. Revalidate against the
              // authoritative connector record inside the same queued update
              // that would write the derived cache; render-local generation
              // ownership alone cannot authorize a stale completion.
              if (!isCurrent() || !authoritativeConfig?.enabled || authoritativeConfigKey !== connectorConfigKey) {
                return {}
              }
              return {
                connectorSnapshots: {
                  ...connectorSnapshots,
                  [id]: snapshot,
                },
              }
            })
          }
          setCurrentState((current) => ({ ...current, lastError: null }))
        } catch (error) {
          setCurrentState((current) => ({
            ...current,
            lastError: error instanceof Error ? error.message : String(error),
          }))
          if (live && isCurrent()) scheduleRetry()
        } finally {
          if (owner && inFlight.get(requestKey) === pending) inFlight.delete(requestKey)
          setCurrentState((current) => ({ ...current, refreshing: false }))
        }
      }

      checkFreshness = async () => {
        if (!live || !isCurrent()) return
        clearExpiryTimer()
        const snapshots = await storage.get('connectorSnapshots')
        if (!live || !isCurrent()) return
        const snapshot = snapshots[id]
        if (!snapshot || snapshot.scope !== scope) {
          setCurrentState(() => ({ ...EMPTY_STATE, configKey }))
          await runRefresh(null)
          return
        }

        if (!showSnapshot(snapshot)) {
          setCurrentState(() => ({ ...EMPTY_STATE, configKey }))
          await runRefresh(null)
          return
        }
        if (Date.now() - snapshot.fetchedAt >= ttlMs) {
          await runRefresh(snapshot.data as T)
        } else {
          scheduleSnapshot(snapshot)
        }
      }

      unsubscribe = storage.subscribe('connectorSnapshots', (snapshots) => {
        if (!live || !isCurrent()) return
        // A direct chrome.storage removal reports the key as undefined to
        // subscribers even though Aurora's typed storage facade normally
        // supplies an object. Treat that transient/removal shape exactly like
        // an empty snapshot map so the mounted connector refreshes cleanly.
        const snapshot = snapshots?.[id]
        if (!snapshot || snapshot.scope !== scope) {
          setCurrentState(() => ({ ...EMPTY_STATE, configKey }))
          void runRefresh(null)
          return
        }
        if (!showSnapshot(snapshot)) {
          setCurrentState(() => ({ ...EMPTY_STATE, configKey }))
          void runRefresh(null)
          return
        }
        scheduleSnapshot(snapshot)
      })

      unsubscribeConnectors = storage.subscribe('connectors', (connectors) => {
        if (!live || !isCurrent()) return
        const authoritativeConfig = connectors?.[id]
        const authoritativeConfigKey = authoritativeConfig
          ? `${canonicalConnectorEventConfig(id, authoritativeConfig)}\n${runtimeKey}`
          : null
        // A render can observe the next config while an earlier queued
        // storage update is still finishing. Once storage confirms that same
        // owner, retry freshness; removed or different owners stay silent.
        if (authoritativeConfig?.enabled && authoritativeConfigKey === connectorConfigKey) {
          void checkFreshness()
        }
      })

      const onVisibility = () => {
        if (document.visibilityState === 'visible') void checkFreshness()
      }
      const onFocus = () => void checkFreshness()
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('focus', onFocus)
      removeRestorationListeners = () => {
        document.removeEventListener('visibilitychange', onVisibility)
        window.removeEventListener('focus', onFocus)
      }

      const snapshots = await storage.get('connectorSnapshots')
      if (!live || !isCurrent()) return
      const snapshot = snapshots[id]
      if (!snapshot || snapshot.scope !== scope) {
        setCurrentState(() => ({ ...EMPTY_STATE, configKey }))
        await runRefresh(null)
      } else {
        if (!showSnapshot(snapshot)) {
          setCurrentState(() => ({ ...EMPTY_STATE, configKey }))
          await runRefresh(null)
          return
        }
        if (Date.now() - snapshot.fetchedAt >= ttlMs) {
          await runRefresh(snapshot.data as T)
        } else {
          scheduleSnapshot(snapshot)
        }
      }

      if (!live) {
        removeRestorationListeners()
      }
    })()

    return () => {
      live = false
      clearExpiryTimer()
      unsubscribe()
      unsubscribeConnectors()
      removeRestorationListeners()
    }
  }, [id, storage, configKey, connectorConfigKey, cacheAuthorityEpoch, ttlMs])

  const current = state.configKey === configKey ? state : EMPTY_STATE
  const now = Date.now()
  return {
    data: current.data,
    fetchedAt: current.fetchedAt,
    refreshing: current.refreshing,
    lastError: current.lastError,
    state: resourceStateOf({
      hasData: current.data !== null,
      fetchedAt: current.fetchedAt,
      ttlMs,
      pending: current.refreshing,
      error: current.lastError,
      now,
    }),
  }
}
