import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import type { WeatherSnapshot } from '../../../lib/storage/schema'
import { openMeteoProvider } from '../../../services/weather/openMeteo'
import { environmentRequestIdentity } from '../../../services/weather/environmentIdentity'
import { weatherRequestIdentity } from '../../../services/weather/identity'
import { resourceStateOf } from '../../../lib/asyncState'

const MAX_AGE_MS = 30 * 60 * 1000

interface InFlightWeather {
  identity: string
  environmentIdentity: string
  generation: number
  controller: AbortController
  promise: Promise<void>
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

export function useWeather() {
  const storage = useStorage()
  const [location] = useStoredKey('location')
  const [storedSnapshot] = useStoredKey('weatherCache')
  const storageReady = location !== undefined && storedSnapshot !== undefined
  const [loading, setLoading] = useState(false)
  const [enrichmentPending, setEnrichmentPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(false)
  const identityRef = useRef<string | null>(null)
  const environmentIdentityRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const inFlightRef = useRef<InFlightWeather | null>(null)

  let currentIdentity: string | null = null
  let currentEnvironmentIdentity: string | null = null
  let coordinateError: string | null = null
  if (location) {
    try {
      currentIdentity = weatherRequestIdentity(location.lat, location.lon)
      currentEnvironmentIdentity = environmentRequestIdentity(location.lat, location.lon)
    } catch (caught) {
      coordinateError = caught instanceof Error ? caught.message : 'Invalid weather coordinates'
    }
  }

  const rawMatchingSnapshot = (
    location &&
    currentIdentity &&
    storedSnapshot?.requestIdentity === currentIdentity
  )
    ? (storedSnapshot.locationLabel === location.label
        ? storedSnapshot
        : { ...storedSnapshot, locationLabel: location.label })
    : null
  const matchingEnvironment = (
    rawMatchingSnapshot?.environment?.requestIdentity === currentEnvironmentIdentity
  ) ? rawMatchingSnapshot.environment : undefined
  const matchingSnapshot: WeatherSnapshot | null = rawMatchingSnapshot && rawMatchingSnapshot.environment !== matchingEnvironment
    ? (({ environment: _environment, ...forecast }) => forecast)(rawMatchingSnapshot)
    : rawMatchingSnapshot

  const now = Date.now()
  const forecastFetchedAt = matchingSnapshot?.fetchedAt ?? null
  const environmentFetchedAt = matchingEnvironment?.fetchedAt ?? null
  const forecastFresh = forecastFetchedAt !== null && now - forecastFetchedAt < MAX_AGE_MS
  const environmentCurrent = environmentFetchedAt !== null && now - environmentFetchedAt < MAX_AGE_MS

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
    environmentIdentityRef.current = currentEnvironmentIdentity
    generationRef.current += 1
    const active = inFlightRef.current
    if (active && (active.identity !== currentIdentity || active.environmentIdentity !== currentEnvironmentIdentity)) {
      active.controller.abort()
      inFlightRef.current = null
    }
    setLoading(false)
    setEnrichmentPending(false)
    setError(null)
  }, [currentEnvironmentIdentity, currentIdentity])

  const refresh = useCallback(async (): Promise<void> => {
    if (!storageReady || !location || !currentIdentity || !currentEnvironmentIdentity || coordinateError) return
    const active = inFlightRef.current
    if (active?.identity === currentIdentity && active.environmentIdentity === currentEnvironmentIdentity) return active.promise
    if (active) active.controller.abort()

    const controller = new AbortController()
    const generation = generationRef.current + 1
    generationRef.current = generation
    const requestTime = Date.now()
    const enrichmentOnly = (
      forecastFetchedAt !== null &&
      requestTime - forecastFetchedAt < MAX_AGE_MS &&
      (
        environmentFetchedAt === null ||
        requestTime - environmentFetchedAt >= MAX_AGE_MS ||
        matchingEnvironment?.status === 'unavailable'
      )
    )
    const request = (async () => {
      if (
        mountedRef.current &&
        identityRef.current === currentIdentity &&
        environmentIdentityRef.current === currentEnvironmentIdentity
      ) {
        setLoading(!enrichmentOnly)
        setEnrichmentPending(enrichmentOnly)
        setError(null)
      }
      try {
        const nextSnapshot = await openMeteoProvider().fetchSnapshot(
          location.lat,
          location.lon,
          location.label,
          { signal: controller.signal },
        )
        if (
          controller.signal.aborted ||
          !mountedRef.current ||
          generationRef.current !== generation ||
          identityRef.current !== currentIdentity ||
          environmentIdentityRef.current !== currentEnvironmentIdentity ||
          nextSnapshot.requestIdentity !== currentIdentity ||
          nextSnapshot.environment?.requestIdentity !== currentEnvironmentIdentity
        ) return

        await storage.updateMany(['location', 'weatherCache'], ({ location: storedLocation }) => {
          if (
            controller.signal.aborted ||
            generationRef.current !== generation ||
            !storedLocation ||
            nextSnapshot.requestIdentity !== currentIdentity ||
            nextSnapshot.environment?.requestIdentity !== currentEnvironmentIdentity
          ) return {}
          try {
            return (
              weatherRequestIdentity(storedLocation.lat, storedLocation.lon) === currentIdentity &&
              environmentRequestIdentity(storedLocation.lat, storedLocation.lon) === currentEnvironmentIdentity
            )
              ? { weatherCache: nextSnapshot }
              : {}
          } catch {
            return {}
          }
        })
      } catch (caught) {
        if (
          controller.signal.aborted ||
          isAbortError(caught) ||
          !mountedRef.current ||
          generationRef.current !== generation ||
          identityRef.current !== currentIdentity ||
          environmentIdentityRef.current !== currentEnvironmentIdentity
        ) return
        if (!enrichmentOnly) setError(caught instanceof Error ? caught.message : 'Weather unavailable')
      } finally {
        const current = inFlightRef.current
        if (current?.generation === generation) {
          inFlightRef.current = null
          if (mountedRef.current && generationRef.current === generation) {
            setLoading(false)
            setEnrichmentPending(false)
          }
        }
      }
    })()
    inFlightRef.current = {
      identity: currentIdentity,
      environmentIdentity: currentEnvironmentIdentity,
      generation,
      controller,
      promise: request,
    }
    return request
  }, [
    coordinateError,
    currentEnvironmentIdentity,
    currentIdentity,
    environmentFetchedAt,
    forecastFetchedAt,
    location,
    matchingEnvironment?.status,
    storage,
    storageReady,
  ])

  useEffect(() => {
    if (!currentIdentity || !currentEnvironmentIdentity || coordinateError || document.visibilityState !== 'visible') return
    if (!forecastFresh || !environmentCurrent) {
      void refresh()
    }
  }, [coordinateError, currentEnvironmentIdentity, currentIdentity, environmentCurrent, forecastFresh, refresh])

  useEffect(() => {
    if (
      !currentIdentity ||
      !currentEnvironmentIdentity ||
      coordinateError ||
      forecastFetchedAt === null ||
      environmentFetchedAt === null
    ) return
    const remaining = Math.min(
      MAX_AGE_MS - (Date.now() - forecastFetchedAt),
      MAX_AGE_MS - (Date.now() - environmentFetchedAt),
    )
    if (remaining <= 0) return
    const timeout = window.setTimeout(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, remaining)
    return () => window.clearTimeout(timeout)
  }, [coordinateError, currentEnvironmentIdentity, currentIdentity, environmentFetchedAt, forecastFetchedAt, refresh])

  useEffect(() => {
    function onVisibilityChange() {
      if (
        document.visibilityState !== 'visible' ||
        !currentIdentity ||
        !currentEnvironmentIdentity ||
        coordinateError
      ) return
      const currentTime = Date.now()
      if (
        forecastFetchedAt === null ||
        currentTime - forecastFetchedAt >= MAX_AGE_MS ||
        environmentFetchedAt === null ||
        currentTime - environmentFetchedAt >= MAX_AGE_MS
      ) {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [coordinateError, currentEnvironmentIdentity, currentIdentity, environmentFetchedAt, forecastFetchedAt, refresh])

  const state = resourceStateOf({
    hasData: matchingSnapshot !== null,
    fetchedAt: matchingSnapshot?.fetchedAt ?? null,
    ttlMs: MAX_AGE_MS,
    pending: loading,
    error: coordinateError ?? error,
    now,
  })
  const stale = state.freshness === 'stale'
  return {
    snapshot: matchingSnapshot,
    stale,
    loading,
    enrichmentPending,
    error: coordinateError ?? error,
    refresh,
    state,
  }
}
