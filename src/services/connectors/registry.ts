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
import type { ConnectorDescriptor, ConnectorId } from './types'
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
