import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

import {
  currentCacheAuthorityEpoch,
  subscribeCacheAuthority,
} from '../../../lib/cacheAuthority'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import type { WeatherAlertCache } from '../../../lib/storage/schema'
import { fetchWeatherAlerts, weatherAlertRequestIdentity } from '../../../services/weatherAlerts'

const MAX_AGE_MS = 5 * 60_000
const RETRY_MS = 30_000

interface InFlightAlerts {
  identity: string
  cacheAuthorityEpoch: number
  generation: number
  controller: AbortController
  promise: Promise<void>
}

export function useWeatherAlerts() {
  const storage = useStorage()
  const cacheAuthorityEpoch = useSyncExternalStore(
    subscribeCacheAuthority,
    currentCacheAuthorityEpoch,
    currentCacheAuthorityEpoch,
  )
  const [location] = useStoredKey('location')
  const [storedSnapshot] = useStoredKey('weatherAlertCache')
  const storageReady = location !== undefined && storedSnapshot !== undefined
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const mountedRef = useRef(false)
  const identityRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const inFlightRef = useRef<InFlightAlerts | null>(null)

  let currentIdentity: string | null = null
  if (location) {
    try {
      currentIdentity = weatherAlertRequestIdentity(location.lat, location.lon)
    } catch {
      currentIdentity = null
    }
  }
  const matchingSnapshot: WeatherAlertCache | null = currentIdentity && storedSnapshot?.requestIdentity === currentIdentity
    ? storedSnapshot
    : null
  const now = Date.now()
  const fresh = matchingSnapshot !== null && now - matchingSnapshot.fetchedAt < MAX_AGE_MS

  useLayoutEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      inFlightRef.current?.controller.abort()
      inFlightRef.current = null
    }
  }, [])

  useLayoutEffect(() => {
    identityRef.current = currentIdentity
    generationRef.current += 1
    const active = inFlightRef.current
    if (active && (
      active.identity !== currentIdentity ||
      active.cacheAuthorityEpoch !== cacheAuthorityEpoch
    )) {
      active.controller.abort()
      inFlightRef.current = null
    }
    setLoading(false)
    setError(null)
    setRetryAt(null)
  }, [currentIdentity, cacheAuthorityEpoch])

  const refresh = useCallback(async (): Promise<void> => {
    if (!storageReady || !location || !currentIdentity) return
    const active = inFlightRef.current
    if (
      active?.identity === currentIdentity &&
      active.cacheAuthorityEpoch === cacheAuthorityEpoch
    ) return active.promise
    if (active) active.controller.abort()

    const controller = new AbortController()
    const requestEpoch = cacheAuthorityEpoch
    const generation = generationRef.current + 1
    generationRef.current = generation
    const request = (async () => {
      if (mountedRef.current && identityRef.current === currentIdentity) {
        setLoading(true)
        setError(null)
        setRetryAt(null)
      }
      try {
        const result = await fetchWeatherAlerts(location.lat, location.lon, fetch, controller.signal)
        if (
          controller.signal.aborted ||
          !mountedRef.current ||
          generationRef.current !== generation ||
          identityRef.current !== currentIdentity ||
          currentCacheAuthorityEpoch() !== requestEpoch
        ) return
        const next: WeatherAlertCache = {
          requestIdentity: currentIdentity,
          fetchedAt: Date.now(),
          status: result.status,
          alerts: result.status === 'supported' ? result.alerts : [],
        }
        await storage.updateMany(['location', 'weatherAlertCache'], ({ location: storedLocation }) => {
          if (
            controller.signal.aborted ||
            generationRef.current !== generation ||
            currentCacheAuthorityEpoch() !== requestEpoch ||
            !storedLocation
          ) return {}
          try {
            return weatherAlertRequestIdentity(storedLocation.lat, storedLocation.lon) === currentIdentity
              ? { weatherAlertCache: next }
              : {}
          } catch {
            return {}
          }
        })
      } catch {
        if (
          controller.signal.aborted ||
          !mountedRef.current ||
          generationRef.current !== generation ||
          identityRef.current !== currentIdentity ||
          currentCacheAuthorityEpoch() !== requestEpoch
        ) return
        setError('NWS weather alerts are unavailable.')
        setRetryAt(Date.now() + RETRY_MS)
      } finally {
        const activeRequest = inFlightRef.current
        if (activeRequest?.generation === generation) {
          inFlightRef.current = null
          if (mountedRef.current && generationRef.current === generation) setLoading(false)
        }
      }
    })()
    inFlightRef.current = {
      identity: currentIdentity,
      cacheAuthorityEpoch: requestEpoch,
      generation,
      controller,
      promise: request,
    }
    return request
  }, [cacheAuthorityEpoch, currentIdentity, location, storage, storageReady])

  useEffect(() => {
    if (!currentIdentity || document.visibilityState !== 'visible' || fresh) return
    void refresh()
  }, [currentIdentity, fresh, refresh])

  useEffect(() => {
    if (!currentIdentity || matchingSnapshot === null) return
    const remaining = MAX_AGE_MS - (Date.now() - matchingSnapshot.fetchedAt)
    if (remaining <= 0) return
    const timeout = window.setTimeout(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, remaining)
    return () => window.clearTimeout(timeout)
  }, [currentIdentity, matchingSnapshot, refresh])

  useEffect(() => {
    if (!currentIdentity || retryAt === null || document.visibilityState !== 'visible') return
    const timeout = window.setTimeout(() => void refresh(), Math.max(0, retryAt - Date.now()))
    return () => window.clearTimeout(timeout)
  }, [currentIdentity, refresh, retryAt])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !currentIdentity) return
      if (!matchingSnapshot || Date.now() - matchingSnapshot.fetchedAt >= MAX_AGE_MS) void refresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [currentIdentity, matchingSnapshot, refresh])

  return {
    snapshot: matchingSnapshot,
    loading,
    stale: matchingSnapshot !== null && !fresh,
    error,
    refresh,
  }
}
