import { useEffect, useRef, useState } from 'react'
import { useStorage } from '../storage/context'
import type { ConnectorId, ConnectorSnapshot } from '../../services/connectors/types'
import { getConnector } from '../../services/connectors/registry'

// Dedupes concurrent refreshes of ONE connector across every mounted consumer
// in this document (two widgets reading 'rss' trigger a single fetch). Keyed by
// id. NOT cross-tab: two browser tabs of the same page each run their own
// refresh — last write wins, harmless for a cache. Module-level, so it outlives
// any single mount and therefore leaks between tests unless reset.
const inFlight = new Map<ConnectorId, Promise<unknown>>()

/** Test-only: clear the module-level in-flight map between cases. Without it a
 *  pending (or resolved) refresh from one test would dedupe the next. Not part
 *  of the production surface. */
export function __resetInFlight(): void {
  inFlight.clear()
}

/** SWR over connectorSnapshots[id]: returns the cached snapshot immediately,
 *  and if absent/staler than ttlMs, runs `refresh` ONCE per mount (not per
 *  render), writing the result via storage.update. Refresh failures keep the
 *  stale snapshot (quiet-failure) and set `lastError` locally (never stored).
 *  Concurrency: the module-level in-flight map keyed by id dedupes across
 *  multiple mounted consumers — only the starter writes; joiners receive the
 *  fresh snapshot through the storage subscription. Cross-tab dedupe is NOT
 *  attempted; last write wins, harmless for caches.
 *
 *  `ttlMs` defaults to the registry descriptor's (getConnector(id).ttlMs), so
 *  Task 43+ call sites stay clean: `useConnectorSnapshot('rss', refreshFn)`.
 *  The registry is empty until Task 43 — the `?? 0` fallback then treats every
 *  snapshot as stale (refresh on mount), and tests pass an explicit ttl to
 *  exercise the fresh-enough path.
 *
 *  `refresh` receives the previously-cached data (null when there was none) —
 *  exactly what the mount effect just read from the snapshot, never a fresh
 *  storage read. Token connectors (Task 46+) use this to carry over fields a
 *  fetch doesn't repeat every call (e.g. a display name resolved once at
 *  connect time). RSS ignores the argument; a callback declared with fewer
 *  parameters is assignable here, so its call site compiles unchanged. */
export function useConnectorSnapshot<T>(
  id: ConnectorId,
  refresh: (prev: T | null) => Promise<T>,
  ttlMs: number = getConnector(id)?.ttlMs ?? 0,
): { data: T | null; fetchedAt: number | null; refreshing: boolean; lastError: string | null } {
  const storage = useStorage()
  const [data, setData] = useState<T | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  // Callers pass inline closures whose identity changes each render; capture
  // the latest in refs so the mount effect can stay [id, storage] and fire the
  // refresh exactly ONCE per mount, never on an unrelated re-render.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const ttlRef = useRef(ttlMs)
  ttlRef.current = ttlMs

  useEffect(() => {
    let live = true

    const unsubscribe = storage.subscribe('connectorSnapshots', (snapshots) => {
      const snap = snapshots[id]
      if (live && snap) {
        setData(snap.data as T)
        setFetchedAt(snap.fetchedAt)
      }
    })

    async function runRefresh(prev: T | null): Promise<void> {
      let pending = inFlight.get(id)
      const owner = pending === undefined
      if (pending === undefined) {
        pending = refreshRef.current(prev)
        inFlight.set(id, pending)
      }
      if (live) setRefreshing(true)
      try {
        const result = await pending
        // Only the consumer that STARTED the fetch writes; joiners get the
        // fresh snapshot via the subscription above. fetchedAt changes every
        // write, so the write is never deep-equal — the driver always emits
        // onChanged and the subscription lands (deep-equal writes are dropped).
        if (owner) {
          const snapshot: ConnectorSnapshot = { fetchedAt: Date.now(), data: result }
          await storage.update('connectorSnapshots', (prev) => ({ ...prev, [id]: snapshot }))
        }
      } catch (error) {
        // Quiet failure: keep the stale snapshot, surface the error locally
        // only. A transient fetch failure must never poison the cache other
        // tabs read, so nothing is written to storage.
        if (live) setLastError(error instanceof Error ? error.message : String(error))
      } finally {
        if (owner) inFlight.delete(id)
        if (live) setRefreshing(false)
      }
    }

    void storage.get('connectorSnapshots').then((snapshots) => {
      if (!live) return
      const snap = snapshots[id]
      if (snap) {
        setData(snap.data as T)
        setFetchedAt(snap.fetchedAt)
      }
      const stale = snap === undefined || Date.now() - snap.fetchedAt >= ttlRef.current
      if (stale) void runRefresh(snap ? (snap.data as T) : null)
    })

    return () => {
      live = false
      unsubscribe()
    }
    // Deps are [id, storage] ONLY: refresh/ttl are read through refs so their
    // per-render identity change must not re-run this — the refresh fires once
    // per mount, not per render.
  }, [id, storage])

  return { data, fetchedAt, refreshing, lastError }
}
