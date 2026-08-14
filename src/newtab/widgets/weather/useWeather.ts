import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import { openMeteoProvider } from '../../../services/weather/openMeteo'
import { weatherRequestIdentity } from '../../../services/weather/identity'

const MAX_AGE_MS = 30 * 60 * 1000

interface InFlightWeather {
  identity: string
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(false)
  const identityRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const inFlightRef = useRef<InFlightWeather | null>(null)

  let currentIdentity: string | null = null
  let coordinateError: string | null = null
  if (location) {
    try {
      currentIdentity = weatherRequestIdentity(location.lat, location.lon)
    } catch (caught) {
      coordinateError = caught instanceof Error ? caught.message : 'Invalid weather coordinates'
    }
  }

  const matchingSnapshot = (
    location &&
    currentIdentity &&
    storedSnapshot?.requestIdentity === currentIdentity
  )
    ? (storedSnapshot.locationLabel === location.label
        ? storedSnapshot
        : { ...storedSnapshot, locationLabel: location.label })
    : null

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
    if (active && active.identity !== currentIdentity) {
      active.controller.abort()
      inFlightRef.current = null
    }
    setLoading(false)
    setError(null)
  }, [currentIdentity])

  const refresh = useCallback(async (): Promise<void> => {
    if (!location || !currentIdentity || coordinateError) return
    const active = inFlightRef.current
    if (active?.identity === currentIdentity) return active.promise
    if (active) active.controller.abort()

    const controller = new AbortController()
    const generation = generationRef.current + 1
    generationRef.current = generation
    const request = (async () => {
      if (mountedRef.current && identityRef.current === currentIdentity) {
        setLoading(true)
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
          nextSnapshot.requestIdentity !== currentIdentity
        ) return

        await storage.updateMany(['location', 'weatherCache'], ({ location: storedLocation }) => {
          if (
            controller.signal.aborted ||
            generationRef.current !== generation ||
            !storedLocation ||
            nextSnapshot.requestIdentity !== currentIdentity
          ) return {}
          try {
            return weatherRequestIdentity(storedLocation.lat, storedLocation.lon) === currentIdentity
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
          identityRef.current !== currentIdentity
        ) return
        setError(caught instanceof Error ? caught.message : 'Weather unavailable')
      } finally {
        const current = inFlightRef.current
        if (current?.generation === generation) {
          inFlightRef.current = null
          if (mountedRef.current && generationRef.current === generation) setLoading(false)
        }
      }
    })()
    inFlightRef.current = { identity: currentIdentity, generation, controller, promise: request }
    return request
  }, [coordinateError, currentIdentity, location, storage])

  useEffect(() => {
    if (!currentIdentity || coordinateError || document.visibilityState !== 'visible') return
    if (!matchingSnapshot || Date.now() - matchingSnapshot.fetchedAt >= MAX_AGE_MS) {
      void refresh()
    }
  }, [coordinateError, currentIdentity, matchingSnapshot, refresh])

  useEffect(() => {
    if (!currentIdentity || coordinateError || !matchingSnapshot) return
    const remaining = MAX_AGE_MS - (Date.now() - matchingSnapshot.fetchedAt)
    if (remaining <= 0) return
    const timeout = window.setTimeout(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, remaining)
    return () => window.clearTimeout(timeout)
  }, [coordinateError, currentIdentity, matchingSnapshot?.fetchedAt, refresh])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible' || !currentIdentity || coordinateError) return
      if (!matchingSnapshot || Date.now() - matchingSnapshot.fetchedAt >= MAX_AGE_MS) {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [coordinateError, currentIdentity, matchingSnapshot, refresh])

  const stale = !!matchingSnapshot && Date.now() - matchingSnapshot.fetchedAt >= MAX_AGE_MS
  return {
    snapshot: matchingSnapshot,
    stale,
    loading,
    error: coordinateError ?? error,
    refresh,
  }
}
