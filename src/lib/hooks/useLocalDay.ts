import { useEffect, useState } from 'react'
import { resolvedLocalTimeZone, zonedLocalDayRange } from '../dates'

const TIMEZONE_PROBE_MS = 60_000

export interface LocalDaySample {
  key: string
  timeZone: string
  now: Date
}

export function readLocalDay(): LocalDaySample & { end: number } {
  const nowMs = Date.now()
  const timeZone = resolvedLocalTimeZone()
  const range = zonedLocalDayRange(nowMs, timeZone)
  return { key: range.key, timeZone, now: new Date(nowMs), end: range.end }
}

export function useLocalDay(): LocalDaySample {
  const [sample, setSample] = useState<LocalDaySample>(() => readLocalDay())

  useEffect(() => {
    let live = true
    let generation = 0
    let timeoutId: number | undefined

    const clearSchedule = () => {
      generation++
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
        timeoutId = undefined
      }
    }

    const reschedule = () => {
      if (!live) return
      clearSchedule()
      const currentGeneration = generation
      const next = readLocalDay()
      setSample((previous) =>
        previous.key === next.key && previous.timeZone === next.timeZone
          ? previous
          : { key: next.key, timeZone: next.timeZone, now: next.now },
      )
      const delay = Math.max(1, Math.min(TIMEZONE_PROBE_MS, next.end - next.now.getTime()))
      timeoutId = window.setTimeout(() => {
        if (!live || currentGeneration !== generation) return
        reschedule()
      }, delay)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') reschedule()
    }
    const onRestore = () => reschedule()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onRestore)
    window.addEventListener('pageshow', onRestore)
    reschedule()

    return () => {
      live = false
      clearSchedule()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onRestore)
      window.removeEventListener('pageshow', onRestore)
    }
  }, [])

  return sample
}
