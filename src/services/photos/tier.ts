export type PhotoTier = '2560x1600' | '3840x2400'

/**
 * Picks which bundled AVIF tier to render: the 3840x2400 (4K) tier once the
 * display's physical pixel size — CSS max(width, height) times
 * devicePixelRatio — exceeds the 2560x1600 (2.5K) tier's own width, i.e. the
 * 2.5K asset would otherwise be upscaled to fill the viewport. Exactly at
 * the boundary (2560 physical px) the 2.5K tier is already a 1:1 match, so
 * it stays picked; only strictly past it does the 4K tier take over.
 */
export function pickTier(maxCssDimension: number, devicePixelRatio: number): PhotoTier {
  return maxCssDimension * devicePixelRatio > 2560 ? '3840x2400' : '2560x1600'
}
