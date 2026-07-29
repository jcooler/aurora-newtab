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
}

export const BUNDLED: BundledPhoto[] = manifest

/** Absolute extension URL for a bundled photo at the given resolution tier. */
export function bundledUrl(index: number, tier: PhotoTier): string {
  return `/photos/${BUNDLED[index]!.tiers[tier]}`
}

export { nextPhoto, resolvePhoto } from './rotation'
export { pickTier } from './tier'
export type { PhotoTier } from './tier'
