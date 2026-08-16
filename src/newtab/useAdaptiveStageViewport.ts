import { useEffect, useLayoutEffect, useState } from 'react'
import {
  DENSITY_TOKENS,
  STAGE_CAPACITIES,
  selectStageProfile,
  selectStageSublayout,
  type Density,
  type ViewportSize,
} from '../lib/layout/adaptiveStage'

const OWNED_PROPERTIES = [
  '--stage-gap', '--stage-inset', '--stage-track-min', '--stage-control-target',
  '--stage-day-cols', '--stage-day-rows', '--stage-now-cols', '--stage-now-rows',
  '--stage-pulse-cols', '--stage-pulse-rows',
] as const

function currentViewport(): ViewportSize {
  return { width: window.innerWidth, height: window.innerHeight }
}

export function useAdaptiveStageViewport(densityInput: Density | ((viewport: ViewportSize) => Density)) {
  const [viewport, setViewport] = useState(currentViewport)
  const profile = selectStageProfile(viewport)
  const density = typeof densityInput === 'function' ? densityInput(viewport) : densityInput

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
    const token = DENSITY_TOKENS[density]
    const capacity = STAGE_CAPACITIES[selectStageSublayout(profile, viewport.width)][density]
    root.dataset.stageProfile = profile
    root.dataset.stageDensity = density
    root.style.setProperty('--stage-gap', `${token.gap}px`)
    root.style.setProperty('--stage-inset', `${token.inset}px`)
    root.style.setProperty('--stage-track-min', `${token.minimumTrack}px`)
    root.style.setProperty('--stage-control-target', `${token.targetControl}px`)
    for (const zone of ['day', 'now', 'pulse'] as const) {
      root.style.setProperty(`--stage-${zone}-cols`, String(capacity[zone][0]))
      root.style.setProperty(`--stage-${zone}-rows`, String(capacity[zone][1]))
    }
    return () => {
      delete root.dataset.stageProfile
      delete root.dataset.stageDensity
      for (const property of OWNED_PROPERTIES) root.style.removeProperty(property)
    }
  }, [density, profile, viewport.width])

  return { ...viewport, profile, density }
}
