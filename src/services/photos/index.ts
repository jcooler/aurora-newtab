// src/services/photos/index.ts
import manifest from './photos.json'

export interface BundledPhoto {
  file: string
  label: string
  author: string
  source: string
}

export const BUNDLED: BundledPhoto[] = manifest

/** Absolute extension URL for a bundled photo. */
export function bundledUrl(index: number): string {
  return `/photos/${BUNDLED[index]!.file}`
}

export { nextPhoto, resolvePhoto } from './rotation'
