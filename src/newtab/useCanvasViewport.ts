import { useEffect, useLayoutEffect, useState } from 'react'
import type { CanvasProfileKey } from '../lib/layout/canvasTypes'

const RETIRED_STAGE_PROPERTIES = [
  '--stage-gap',
  '--stage-inset',
  '--stage-track-min',
  '--stage-control-target',
  '--stage-day-cols',
  '--stage-day-rows',
  '--stage-now-cols',
  '--stage-now-rows',
  '--stage-pulse-cols',
  '--stage-pulse-rows',
] as const

function currentViewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

export function selectCanvasProfile(viewport: {
  width: number
  height: number
}): CanvasProfileKey {
  const { width, height } = viewport
  // Width alone selects the Small phone document. A short-height desktop
  // window (the owner's installed 1408x445) is a compressed desktop canvas,
  // never a vertical phone flow — V1 handled that window with height-
  // responsive rhythm, and the short/xshort CSS tiers still do.
  if (width < 900) return 'compact'
  if (width >= 1600 && width / height >= 2.1) return 'ultrawide'
  if (width >= 2200 && height >= 1100) return 'display'
  return 'standard'
}

export function useCanvasViewport() {
  const [viewport, setViewport] = useState(currentViewport)

  useEffect(() => {
    let frame: number | null = null
    const onResize = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        setViewport(currentViewport())
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])

  useLayoutEffect(() => {
    const root = document.documentElement
    delete root.dataset.stageProfile
    delete root.dataset.stageDensity
    for (const property of RETIRED_STAGE_PROPERTIES) root.style.removeProperty(property)
  }, [])

  return { ...viewport, profile: selectCanvasProfile(viewport) }
}
