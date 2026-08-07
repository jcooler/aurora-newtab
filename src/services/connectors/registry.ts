// src/services/connectors/registry.ts — the connector catalog. PURE by
// contract: no React, no chrome.*, and no import that transitively reaches
// either. backup.ts imports this for secret-field stripping, so a side effect
// or a cycle here would poison the storage/backup path. Descriptors are the
// one source of truth every generic consumer reads, keyed by ConnectorId.
//
// rss.ts stays pure too (see its own doc comment): it imports originPattern
// from ../permissions for its `origins` mapper, but permissions.ts only
// touches chrome.* inside function bodies, never at module scope, so pulling
// it in here doesn't add a load-time chrome.* dependency.
import type { ConnectorConfig, ConnectorDescriptor, ConnectorId } from './types'
import { rssDescriptor } from './rss'

// Task 46 grows ConnectorConfig into a real 7-member union, which is exactly
// the situation types.ts's ConnectorDescriptor variance comment predicted:
// ConnectorDescriptor<RssConfig> is no longer assignable to the base
// ConnectorDescriptor, so registering rss needs the one honest cast below —
// rssDescriptor itself stays typed ConnectorDescriptor<RssConfig>.
export const CONNECTORS: ConnectorDescriptor[] = [rssDescriptor as ConnectorDescriptor]

/** The descriptor for `id`, or undefined if none is registered. Linear scan
 *  is fine: the catalog is tiny and fixed at build time. */
export function getConnector(id: ConnectorId): ConnectorDescriptor | undefined {
  return CONNECTORS.find((descriptor) => descriptor.id === id)
}

/** descriptor.origins(config), wrapped defensively — same contract rss.ts's
 *  origins() documents: a caller sweeping origins() across every registered
 *  descriptor must be able to trust that one connector's bad/malformed
 *  persisted config degrades to fewer origins rather than throwing out of
 *  the sweep. Descriptors that follow the contract (like rssDescriptor)
 *  never need this catch; it exists for the ones that don't. */
function originsOf(descriptor: ConnectorDescriptor, config: ConnectorConfig): string[] {
  try {
    return descriptor.origins(config)
  } catch {
    return []
  }
}

/** Origins safe to revoke when `id` disconnects: its own origins minus any
 *  origin another ENABLED connector still derives. Pure; callers do the
 *  actual removeOrigin calls (this fulfils the production caller
 *  descriptor.origins() was promised — SP1 finding 3).
 *
 *  "Other" here means every OTHER registered connector whose stored config
 *  has `enabled: true` — a disabled connector's config might still name the
 *  same site, but it isn't actively fetching it, so it doesn't get to keep
 *  the grant alive. The disconnecting connector's OWN origins are read
 *  unconditionally (its own `enabled` flag doesn't gate what it's *asking*
 *  to release) — only the sharing check on the OTHER side is enabled-gated.
 *
 *  Deduped: a connector can derive the same origin more than once (e.g. two
 *  of its own feeds sharing a host), and descriptor.origins() makes no
 *  uniqueness promise — a caller that removeOrigin's the result shouldn't
 *  see (or redundantly act on) the same origin twice. */
export function releasableOrigins(id: ConnectorId, configs: Partial<Record<ConnectorId, ConnectorConfig>>): string[] {
  const config = configs[id]
  const descriptor = getConnector(id)
  if (!descriptor || !config) return []

  const own = originsOf(descriptor, config)

  const stillClaimed = new Set<string>()
  for (const other of CONNECTORS) {
    if (other.id === id) continue
    const otherConfig = configs[other.id]
    if (!otherConfig?.enabled) continue
    for (const origin of originsOf(other, otherConfig)) stillClaimed.add(origin)
  }

  return [...new Set(own.filter((origin) => !stillClaimed.has(origin)))]
}
