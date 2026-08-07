// src/services/connectors/types.ts — shared connector identity + config
// shapes. Sub-project 1 (settings tabs + connector framework) starts with a
// single connector (rss); CONNECTOR_IDS grows as later sub-projects add more,
// and ConnectorConfig becomes a real union at that point.

export const CONNECTOR_IDS = ['rss'] as const // grows per sub-project
export type ConnectorId = (typeof CONNECTOR_IDS)[number]

export interface RssConfig {
  enabled: boolean
  feeds: string[] // https URLs, max 5
  shownCount: number // 3-8, default 5
}
export type ConnectorConfig = RssConfig // union grows with CONNECTOR_IDS

export interface ConnectorSnapshot {
  fetchedAt: number // epoch ms
  data: unknown // per-connector shape, typed at the service boundary
}

/** One connector's static identity + policy. Descriptors are the single source
 *  of truth the generic framework reads: cards/widgets for naming, backup for
 *  which fields never leave the device, the snapshot hook for staleness. Pure
 *  data + a pure `origins` mapper — no React, no chrome.*.
 *
 *  Variance: `C` sits in an INVARIANT position via `secretFields: (keyof C &
 *  string)[]`, so once ConnectorConfig becomes a multi-member union a
 *  `ConnectorDescriptor<SpecificConfig>` is NOT assignable to the base
 *  `ConnectorDescriptor` — registering connector #2 will require an honest
 *  per-entry cast in CONNECTORS (`rssDescriptor as ConnectorDescriptor`),
 *  the same pattern backup.test.ts already uses for its fake descriptor.
 *  (`origins` being method syntax keeps ITS parameter bivariant, but that
 *  does not rescue the type as a whole.) */
export interface ConnectorDescriptor<C extends ConnectorConfig = ConnectorConfig> {
  id: ConnectorId
  label: string // card + widget aria naming
  blurb: string // one-line what-you-get on the card
  auth: 'none' | 'token' | 'oauth'
  ttlMs: number
  secretFields: (keyof C & string)[]
  origins(config: C): string[] // every URL the service will fetch, for grant/revoke bookkeeping
}
