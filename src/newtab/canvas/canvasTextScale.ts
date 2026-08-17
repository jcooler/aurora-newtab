import type { CanvasProfileKey } from '../../lib/layout/canvasTypes'
import type { LayoutDensityPreference } from '../../lib/layout/types'

export type TextScale = 'standard' | 'large'

export interface CanvasTextViewport {
  width: number
  height: number
  profile: CanvasProfileKey
}

export function projectTextScale(
  stored: LayoutDensityPreference,
  viewport: CanvasTextViewport,
): TextScale {
  if (stored === 'spacious') return 'large'
  if (stored !== 'auto') return 'standard'
  return viewport.profile === 'display' || viewport.profile === 'ultrawide'
    ? 'large'
    : 'standard'
}
