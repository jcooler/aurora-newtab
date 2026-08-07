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
