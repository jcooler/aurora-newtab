export type PhotoTier = '2560x1600' | '3840x2400'

/**
 * Picks which bundled AVIF tier to render: the 3840x2400 (4K) tier once the
 * display's physical pixel size — CSS max(width, height) times
 * devicePixelRatio — reaches 2400px, i.e. 1440p and up. This is deliberately
 * generous rather than a strict "avoid upscaling" cutoff: a 4K source
 * downscaled to fit a smaller viewport reads crisper than the 2.5K tier
 * shown at its native resolution, because downscaling a higher-quality
 * source hides lossy-encode softening that a 1:1 render would expose. Only
 * displays below the 1440p-class threshold (maxCssDimension * DPR < 2400)
 * fall back to the smaller 2.5K tier.
 */
export function pickTier(maxCssDimension: number, devicePixelRatio: number): PhotoTier {
  return maxCssDimension * devicePixelRatio >= 2400 ? '3840x2400' : '2560x1600'
}
