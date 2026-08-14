import type { AuroraStorage } from '../lib/storage'
import type { PhotoPrefs } from '../lib/storage/schema'
import { APOD_ORIGINS } from './apod'
import { ownedConnectorOriginPatterns } from './connectors/registry'
import type { ConnectorConfig, ConnectorId } from './connectors/types'
import { canonicalOriginPatterns } from './permissions'

export interface OriginOwnershipState {
  connectors: Partial<Record<ConnectorId, ConnectorConfig>>
  photoPrefs: PhotoPrefs
}

export interface OriginOwnerProvider {
  ownedOriginPatterns(state: OriginOwnershipState): readonly string[]
}

const connectorOwnerProvider: OriginOwnerProvider = {
  ownedOriginPatterns: (state) => ownedConnectorOriginPatterns(state.connectors),
}

const apodOwnerProvider: OriginOwnerProvider = {
  ownedOriginPatterns: (state) => (state.photoPrefs.mode === 'apod' ? APOD_ORIGINS : []),
}

export const ORIGIN_OWNER_PROVIDERS: OriginOwnerProvider[] = [connectorOwnerProvider, apodOwnerProvider]

/** Pure global ownership sweep. Providers are extension points, so every
 *  boundary is defensive: a malformed config, throw, non-array result, or
 *  invalid member degrades to fewer claims rather than aborting cleanup. */
export function ownedOriginPatterns(state: OriginOwnershipState): string[] {
  const owned = new Set<string>()
  for (const provider of ORIGIN_OWNER_PROVIDERS) {
    let candidates: readonly string[]
    try {
      candidates = provider.ownedOriginPatterns(state)
    } catch {
      continue
    }
    if (!Array.isArray(candidates)) continue
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue
      try {
        const [pattern] = canonicalOriginPatterns([candidate])
        if (pattern) owned.add(pattern)
      } catch {
        // Malformed persisted/provider output is not an ownership claim.
      }
    }
  }
  return [...owned]
}

export async function readOwnedOriginPatterns(storage: AuroraStorage): Promise<string[]> {
  const [connectors, photoPrefs] = await Promise.all([
    storage.get('connectors'),
    storage.get('photoPrefs'),
  ])
  return ownedOriginPatterns({ connectors, photoPrefs })
}
