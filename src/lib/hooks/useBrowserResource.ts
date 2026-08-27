import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { hasPermission, subscribePermission } from '../../services/permissions'

export type BrowserResourceState<T> =
  | { status: 'checking' }
  | { status: 'permission-required' }
  | { status: 'ready'; data: T; refreshedAt: number; refreshing: boolean }
  | { status: 'error'; data: T | null; refreshedAt: number | null; message: string }

interface BrowserResourceOptions<T> {
  identity: string
  permission: chrome.runtime.ManifestPermission
  load: () => Promise<T>
  subscribe: (listener: () => void) => () => void
  retryDelayMs?: number
}

const inFlight = new Map<string, Promise<unknown>>()

export function __resetBrowserResourceForTests(): void {
  inFlight.clear()
}

export function useBrowserResource<T>({
  identity,
  permission,
  load,
  subscribe,
  retryDelayMs = 5_000,
}: BrowserResourceOptions<T>): {
  state: BrowserResourceState<T>
  refresh: () => Promise<void>
} {
  const [state, setState] = useState<BrowserResourceState<T>>({ status: 'checking' })
  const stateRef = useRef(state)
  stateRef.current = state
  const loadRef = useRef(load)
  loadRef.current = load
  const subscribeRef = useRef(subscribe)
  subscribeRef.current = subscribe
  const liveRef = useRef(false)
  const generationRef = useRef(0)
  const retryTimerRef = useRef<number | null>(null)
  const automaticRetriesRef = useRef(0)

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    const generation = ++generationRef.current
    clearRetry()

    let permitted: boolean
    try {
      permitted = await hasPermission(permission)
    } catch {
      permitted = false
    }
    if (!liveRef.current || generationRef.current !== generation) return
    if (!permitted) {
      automaticRetriesRef.current = 0
      setState({ status: 'permission-required' })
      return
    }

    const previous = stateRef.current
    if (previous.status === 'ready') {
      setState({ ...previous, refreshing: true })
    } else if (previous.status !== 'error' || previous.data === null) {
      setState({ status: 'checking' })
    }

    let pending = inFlight.get(identity) as Promise<T> | undefined
    const owner = pending === undefined
    if (!pending) {
      pending = Promise.resolve().then(() => loadRef.current())
      inFlight.set(identity, pending)
    }

    try {
      const data = await pending
      if (!liveRef.current || generationRef.current !== generation) return
      automaticRetriesRef.current = 0
      setState({ status: 'ready', data, refreshedAt: Date.now(), refreshing: false })
    } catch (error) {
      if (!liveRef.current || generationRef.current !== generation) return
      const current = stateRef.current
      const retainedData = current.status === 'ready' || current.status === 'error' ? current.data : null
      const retainedAt = current.status === 'ready' || current.status === 'error' ? current.refreshedAt : null
      setState({
        status: 'error',
        data: retainedData,
        refreshedAt: retainedAt,
        message: error instanceof Error ? error.message : String(error),
      })
      if (automaticRetriesRef.current < 1) {
        automaticRetriesRef.current += 1
        retryTimerRef.current = window.setTimeout(() => void refresh(), retryDelayMs)
      }
    } finally {
      if (owner && inFlight.get(identity) === pending) inFlight.delete(identity)
    }
  }, [clearRetry, identity, permission, retryDelayMs])

  useLayoutEffect(() => {
    liveRef.current = true
    generationRef.current += 1
    automaticRetriesRef.current = 0
    setState({ status: 'checking' })
    return () => {
      liveRef.current = false
      generationRef.current += 1
      clearRetry()
    }
  }, [clearRetry, identity, permission])

  useEffect(() => {
    const onFeatureChange = () => {
      automaticRetriesRef.current = 0
      void refresh()
    }
    const removeFeatureListener = subscribeRef.current(onFeatureChange)
    const removePermissionListener = subscribePermission(permission, (held) => {
      generationRef.current += 1
      clearRetry()
      automaticRetriesRef.current = 0
      if (!held) {
        setState({ status: 'permission-required' })
      } else {
        void refresh()
      }
    })
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        automaticRetriesRef.current = 0
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    void refresh()
    return () => {
      removeFeatureListener()
      removePermissionListener()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [clearRetry, permission, refresh])

  return { state, refresh }
}
