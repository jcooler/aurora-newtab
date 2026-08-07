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

// Task 43 registers the first (and, for now, only) descriptor. With
// ConnectorConfig === RssConfig today, ConnectorDescriptor<RssConfig> is
// exactly ConnectorDescriptor — no cast needed here. types.ts's variance
// comment explains why registering connector #2 WILL need one
// (`rssDescriptor as ConnectorDescriptor`), once ConnectorConfig becomes a
// real union and `secretFields` sits in an invariant position.
export const CONNECTORS: ConnectorDescriptor[] = [rssDescriptor]

/** The descriptor for `id`, or undefined if none is registered. Linear scan
 *  is fine: the catalog is tiny and fixed at build time. */
export function getConnector(id: ConnectorId): ConnectorDescriptor | undefined {
  return CONNECTORS.find((descriptor) => descriptor.id === id)
}
