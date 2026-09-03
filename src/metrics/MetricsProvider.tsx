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
import { hasCapability } from '../account/capabilities'
import { useAccount } from '../account/AccountContext'
import { useStorage } from '../lib/storage/context'
import type { AuroraData } from '../lib/storage/schema'
import {
  collectConnectorSeries,
  collectHabitSeries,
  collectTaskSeries,
} from './collectors'
import { serializeMetricsExport } from './export'
import {
  assertMetricsHistory,
  emptyMetricsHistory,
  isMetricDateKey,
  pruneMetricsHistory,
  upsertLocalMetricBucket,
} from './history'
import type { MetricBucketInput, MetricSource, MetricsHistoryV1 } from './types'

const DERIVED_LOCAL_SOURCES = new Set(['local-habits', 'local-tasks'])
const createUuid = () => crypto.randomUUID()

export interface MetricsDeleteFilter {
  source?: MetricSource
  before?: string
}

export type MetricsIssue = 'storage' | 'collection'

export interface MetricsContextValue {
  hydrated: boolean
  entitled: boolean
  history: MetricsHistoryV1 | null
  issue: MetricsIssue | null
  retryMetrics(): void
  deleteMetricsHistory(filter?: MetricsDeleteFilter): Promise<void>
  exportMetricsHistory(exportedAt?: string): string | null
  recordFocusCompletion(
    current: MetricsHistoryV1 | null,
    minutes: number,
    date: string,
  ): MetricsHistoryV1 | null
}

const unavailable = async () => {}
const MetricsContext = createContext<MetricsContextValue>({
  // Isolated consumers outside the production provider keep their existing
  // local-only behavior instead of blocking on an owner that is not mounted.
  hydrated: true,
  entitled: false,
  history: null,
  issue: null,
  retryMetrics: () => {},
  deleteMetricsHistory: unavailable,
  exportMetricsHistory: () => null,
  recordFocusCompletion: (current) => current,
})

interface MetricSources {
  habits: AuroraData['habits']
  todoLists: AuroraData['todoLists']
  connectorSnapshots: AuroraData['connectorSnapshots']
  metricsHistory: AuroraData['metricsHistory']
}

const SOURCE_KEYS = ['habits', 'todoLists', 'connectorSnapshots', 'metricsHistory'] as const

function localDateKey(now: number): string {
  const date = new Date(now)
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}

function sameValues(left: MetricBucketInput['values'], right: MetricBucketInput['values']): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function reconcileCollectedMetrics(
  current: MetricsHistoryV1 | null,
  installationId: string,
  inputs: readonly MetricBucketInput[],
  today: string,
  createId: () => string,
): MetricsHistoryV1 {
  let next = pruneMetricsHistory(current ?? emptyMetricsHistory(installationId), today)
  const localTuples = new Set(inputs
    .filter((input) => DERIVED_LOCAL_SOURCES.has(input.sourceInstanceId))
    .map((input) => `${input.date}|${input.source}|${input.sourceInstanceId}`))
  next = {
    ...next,
    buckets: next.buckets.filter((bucket) => (
      bucket.installationId !== next.installationId
      || !DERIVED_LOCAL_SOURCES.has(bucket.sourceInstanceId)
      || localTuples.has(`${bucket.date}|${bucket.source}|${bucket.sourceInstanceId}`)
    )),
  }

  for (const input of inputs) {
    const existing = next.buckets.find((bucket) => (
      bucket.installationId === next.installationId
      && bucket.date === input.date
      && bucket.source === input.source
      && bucket.sourceInstanceId === input.sourceInstanceId
    ))
    if (existing && sameValues(existing.values, input.values)) continue
    next = upsertLocalMetricBucket(next, input, createId)
  }
  assertMetricsHistory(next)
  return next
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function MetricsProvider({
  children,
  createId = createUuid,
  installationId,
}: {
  children: ReactNode
  createId?: () => string
  installationId?: string
}) {
  const storage = useStorage()
  const { hydrated: accountHydrated, snapshot } = useAccount()
  const [sources, setSources] = useState<MetricSources | null>(null)
  const [entitlementClock, setEntitlementClock] = useState(0)
  const [issue, setIssue] = useState<MetricsIssue | null>(null)
  const [retryRevision, setRetryRevision] = useState(0)
  const installationIdRef = useRef<string | null>(installationId ?? null)
  const lastCollectedSignature = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    const latest: Partial<MetricSources> = {}
    const unsubscribers: Array<() => void> = []
    const publish = () => {
      if (!active || SOURCE_KEYS.some((key) => !(key in latest))) return
      setSources({
        habits: latest.habits!,
        todoLists: latest.todoLists!,
        connectorSnapshots: latest.connectorSnapshots!,
        metricsHistory: latest.metricsHistory!,
      })
    }
    const hydrate = () => {
      unsubscribers.push(...SOURCE_KEYS.map((key) => storage.subscribe(key, (value) => {
        latest[key] = value as never
        publish()
      })))
      void Promise.all(SOURCE_KEYS.map(async (key) => [key, await storage.get(key)] as const))
        .then((entries) => {
          if (!active) return
          for (const [key, value] of entries) {
            if (!(key in latest)) latest[key] = value as never
          }
          publish()
        })
        .catch(() => {
          if (active) {
            setIssue('storage')
            console.error('[tab-two] metrics storage hydration failed')
          }
        })
    }
    if (import.meta.env.MODE === 'preview') {
      void import('./previewMetricsState').then(({ parsePreviewMetricsState }) => {
        if (!active) return
        const previewState = parsePreviewMetricsState(globalThis.location?.search ?? '')
        if (previewState === 'loading') return
        if (previewState === 'error') {
          setIssue('storage')
          return
        }
        hydrate()
      })
    } else {
      hydrate()
    }
    return () => {
      active = false
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [retryRevision, storage])

  const entitled = useMemo(
    () => accountHydrated && hasCapability(snapshot, 'metrics_history', Date.now()),
    [accountHydrated, snapshot, entitlementClock],
  )

  useEffect(() => {
    const expiresAt = snapshot.lease?.expiresAt
    if (!expiresAt || !entitled) return
    const delay = Math.max(0, expiresAt - Date.now() + 1)
    const timeout = window.setTimeout(() => setEntitlementClock((value) => value + 1), delay)
    return () => window.clearTimeout(timeout)
  }, [snapshot.lease?.expiresAt, entitled])

  useEffect(() => {
    if (!sources || !entitled) {
      lastCollectedSignature.current = null
      return
    }
    const today = localDateKey(Date.now())
    const signature = JSON.stringify({
      today,
      habits: sources.habits,
      todoLists: sources.todoLists,
      connectorSnapshots: sources.connectorSnapshots,
    })
    if (lastCollectedSignature.current === signature) return
    lastCollectedSignature.current = signature
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const id = installationIdRef.current ?? (installationIdRef.current = installationId ?? createId())
      const inputs = [
        ...collectHabitSeries(sources.habits, today),
        ...collectTaskSeries(sources.todoLists, today),
        ...collectConnectorSeries(sources.connectorSnapshots, today),
      ]
      void storage.update('metricsHistory', (current) => {
        const next = reconcileCollectedMetrics(current, id, inputs, today, createId)
        return structurallyEqual(current, next) ? current : next
      }).then(() => setIssue(null), () => {
          lastCollectedSignature.current = null
          setIssue('collection')
          console.error('[tab-two] metric collection failed')
        })
    })
    return () => { cancelled = true }
  }, [createId, entitled, installationId, sources, storage])

  const retryMetrics = useCallback(() => {
    lastCollectedSignature.current = null
    setIssue(null)
    setSources(null)
    setRetryRevision((value) => value + 1)
  }, [])

  const deleteMetricsHistory = useCallback(async (filter?: MetricsDeleteFilter) => {
    if (filter?.before !== undefined && !isMetricDateKey(filter.before)) throw new Error('metric_date_invalid')
    await storage.update('metricsHistory', (current) => {
      if (!current) return null
      if (!filter || (filter.source === undefined && filter.before === undefined)) return null
      const buckets = current.buckets.filter((bucket) => {
        if (filter.source !== undefined && bucket.source !== filter.source) return true
        if (filter.before !== undefined && bucket.date >= filter.before) return true
        return false
      })
      return { ...current, buckets }
    })
  }, [storage])

  const exportMetricsHistory = useCallback((exportedAt = new Date().toISOString()) => (
    sources?.metricsHistory ? serializeMetricsExport(sources.metricsHistory, exportedAt) : null
  ), [sources?.metricsHistory])

  const recordFocusCompletion = useCallback((
    current: MetricsHistoryV1 | null,
    minutes: number,
    date: string,
  ): MetricsHistoryV1 | null => {
    if (!entitled) return current
    if (!Number.isSafeInteger(minutes) || minutes <= 0 || !isMetricDateKey(date)) throw new Error('metric_focus_invalid')
    const id = installationIdRef.current ?? (installationIdRef.current = installationId ?? createId())
    const history = current ?? emptyMetricsHistory(id)
    const existing = history.buckets.find((bucket) => (
      bucket.installationId === history.installationId
      && bucket.date === date
      && bucket.source === 'focus'
      && bucket.sourceInstanceId === history.installationId
    ))
    const values = existing?.values.kind === 'focus'
      ? { kind: 'focus' as const, sessions: existing.values.sessions + 1, minutes: existing.values.minutes + minutes }
      : { kind: 'focus' as const, sessions: 1, minutes }
    return pruneMetricsHistory(upsertLocalMetricBucket(history, {
      date,
      source: 'focus',
      sourceInstanceId: history.installationId,
      values,
    }, createId), date)
  }, [createId, entitled, installationId])

  const value = useMemo<MetricsContextValue>(() => ({
    hydrated: (sources !== null || issue !== null) && accountHydrated,
    entitled,
    history: sources?.metricsHistory ?? null,
    issue,
    retryMetrics,
    deleteMetricsHistory,
    exportMetricsHistory,
    recordFocusCompletion,
  }), [accountHydrated, deleteMetricsHistory, entitled, exportMetricsHistory, issue, recordFocusCompletion, retryMetrics, sources])

  return <MetricsContext.Provider value={value}>{children}</MetricsContext.Provider>
}

export function useMetrics(): MetricsContextValue {
  return useContext(MetricsContext)
}
