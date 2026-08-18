import type { LayoutDensityPreference } from '../../lib/layout/types'

export type TextScale = 'standard' | 'large'

/** Presentation-only projection of the stored density preference (A2-D055).
 *  Automatic keeps its exact pre-NL-P2 outcomes without the retired profile
 *  abstraction: large on exactly the viewports the old display/ultrawide
 *  profiles covered. */
export function projectTextScale(
  stored: LayoutDensityPreference,
  viewport: { width: number; height: number },
): TextScale {
  if (stored === 'spacious') return 'large'
  if (stored !== 'auto') return 'standard'
  const { width, height } = viewport
  const ultrawide = width >= 1600 && width / height >= 2.1
  const display = width >= 2200 && height >= 1100
  return ultrawide || display ? 'large' : 'standard'
}
