// src/services/photos/index.ts
import manifest from './photos.json'
import type { PhotoTier } from './tier'

export interface BundledPhoto {
  id: string
  tiers: Record<PhotoTier, string>
  label: string
  photographer: string
  license: string
  source: string
  /** Inline 32x20 WebP data URI — see scripts/encode-photos.mjs. */
  lqip: string
}

export const BUNDLED: BundledPhoto[] = manifest

/** Absolute extension URL for a bundled photo at the given resolution tier. */
export function bundledUrl(index: number, tier: PhotoTier): string {
  return `/photos/${BUNDLED[index]!.tiers[tier]}`
}

/**
 * The inline blurred placeholder for the same photo `bundledUrl` serves at
 * this index. It is a data URI, not a file path, so it needs no load at all
 * — the point is to have pixels available in the frame where the full photo
 * is still decoding (first paint, and re-display of a tab whose decoded
 * image memory Chrome purged while it was in the background).
 */
export function bundledLqip(index: number): string {
  return BUNDLED[index]!.lqip
}

export { nextPhoto, resolvePhoto } from './rotation'
export { pickTier } from './tier'
export type { PhotoTier } from './tier'
