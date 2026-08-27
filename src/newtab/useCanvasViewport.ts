import { useEffect, useLayoutEffect, useState } from 'react'

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

// Automatic profile selection was deleted with the named-layouts rebuild
// (spec §3): rendering never swaps a layout for the window. The frozen
// migration-input interpreter of pre-named-layouts storage lives in
// src/lib/layout/myLayoutAdapter.ts as migrationSourceProfile.
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

  return { ...viewport }
}
