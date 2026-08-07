// src/services/connectors/registry.ts — the connector catalog. PURE by
// contract: no React, no chrome.*, and no import that transitively reaches
// either. backup.ts imports this for secret-field stripping, so a side effect
// or a cycle here would poison the storage/backup path. Descriptors are the
// one source of truth every generic consumer reads, keyed by ConnectorId.
import type { ConnectorDescriptor, ConnectorId } from './types'

// EMPTY until Task 43 registers the RSS descriptor. No placeholder entries —
// this project forbids them; the registry invariant test is written to start
// enforcing full CONNECTOR_IDS coverage the moment a real descriptor lands.
export const CONNECTORS: ConnectorDescriptor[] = []

/** The descriptor for `id`, or undefined if none is registered (true for every
 *  id while CONNECTORS is empty). Linear scan is fine: the catalog is tiny and
 *  fixed at build time. */
export function getConnector(id: ConnectorId): ConnectorDescriptor | undefined {
  return CONNECTORS.find((descriptor) => descriptor.id === id)
}
