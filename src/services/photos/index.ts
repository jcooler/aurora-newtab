// src/services/photos/index.ts
import manifest from './photos.json'
import type { PhotoTier } from './tier'

interface BundledPhotoBase {
  id: string
  preview: string
  label: string
  photographer: string
  license: string
  source: string
  /** Inline 32x20 WebP data URI — see scripts/encode-photos.mjs. */
  lqip: string
}

export type BundledPhoto = BundledPhotoBase & (
  | { original: string; tiers?: never }
  | { original?: never; tiers: Record<PhotoTier, string> }
)

export const BUNDLED = manifest as BundledPhoto[]

/** Absolute extension URL for a bundled photo at the given resolution tier. */
export function bundledUrl(index: number, tier: PhotoTier): string {
  const photo = BUNDLED[index]!
  return `/photos/${photo.original ?? photo.tiers[tier]}`
}

/** Small, sharp local image used only by the Settings photo picker. */
export function bundledPreviewUrl(index: number): string {
  return `/photos/${BUNDLED[index]!.preview}`
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

export { nextPhoto, resolvePhoto, rotatePhotoForDay } from './rotation'
export { pickTier } from './tier'
export type { PhotoTier } from './tier'
