// src/services/connectors/types.ts — shared connector identity + config
// shapes. Sub-project 1 (settings tabs + connector framework) shipped with a
// single connector (rss); Task 46 (sub-project 2) grows CONNECTOR_IDS to the
// six token connectors it adapts the framework for, and ConnectorConfig
// becomes a real (multi-member) union to match — see the variance note below
// on ConnectorDescriptor for what that costs at the registration site.

export const CONNECTOR_IDS = ['rss', 'github', 'gitlab', 'jira', 'vercel', 'crypto', 'ics'] as const
export type ConnectorId = (typeof CONNECTOR_IDS)[number]

export interface RssConfig {
  enabled: boolean
  feeds: string[] // https URLs, max 5
  shownCount: number // 3-8, default 5
}

// `type`, not `interface`, on purpose: resolveViews<V extends Record<string,
// boolean>> (views.ts) needs V's inferred type to satisfy that constraint, and
// TS only accepts a plain object type there — a named `interface` is missing
// an index signature and fails the check even though every member is boolean.
// Same reasoning on GitlabViews/JiraViews/VercelViews below.
export type GithubViews = {
  commitGraph: boolean
  pulls: boolean
  issues: boolean
  notifications: boolean
}

// The GitHub contributions calendar's data shapes. Defined here (not in
// github.ts) because Task 73 moved the graph rendering machinery
// (contributionGrid.ts, ContributionGraph.tsx) to widgets/shared, and these
// are the data shapes it consumes — github.ts re-exports both so existing
// importers of './github' keep compiling unchanged.
export interface ContributionDay {
  date: string
  count: number
}

export interface Contributions {
  days: ContributionDay[]
  total: number
}

export interface GithubConfig {
  enabled: boolean
  token: string
  username: string
  // Absent means ALL sections on — the additive-upgrade rule: a config saved
  // before this field existed (or a hand-edited backup missing it) must not
  // silently lose content. New fields added here later must honor the same
  // rule: their absence can never make an existing card's section vanish.
  views?: GithubViews
}

export type GitlabViews = {
  mergeRequests: boolean
  reviewAsks: boolean
  todos: boolean
  activityGraph: boolean
}

export interface GitlabConfig {
  enabled: boolean
  token: string
  instanceUrl: string
  username: string
  // WAVE-2 DEFAULT: absent means today's card — the sections that already
  // exist on this card stay ON, the sections this wave ADDS stay OFF. Unlike
  // github's all-on rule (github's own comment, and github's ONLY — that
  // wave shipped nothing new to gate off), a wave-2 connector's pre-feature
  // config must reproduce today's card exactly, not opt every new section in
  // sight-unseen. See DEFAULT_GITLAB_VIEWS (Task 74) for which keys are which.
  views?: GitlabViews
}

export type JiraViews = {
  assigned: boolean
  statusChips: boolean
  dueSoon: boolean
}

export interface JiraConfig {
  enabled: boolean
  email: string
  apiToken: string
  site: string
  displayName: string
  // WAVE-2 DEFAULT: absent means today's card — existing sections stay ON,
  // sections this wave ADDS stay OFF (see GitlabConfig's comment above for
  // the full rule). See DEFAULT_JIRA_VIEWS (Task 74).
  views?: JiraViews
}

export type VercelViews = {
  deployments: boolean
  statusSummary: boolean
}

export interface VercelConfig {
  enabled: boolean
  token: string
  username: string
  // WAVE-2 DEFAULT: absent means today's card — existing sections stay ON,
  // sections this wave ADDS stay OFF (see GitlabConfig's comment above for
  // the full rule). See DEFAULT_VERCEL_VIEWS (Task 74).
  views?: VercelViews
}
export interface CryptoConfig {
  enabled: boolean
  coins: string[] // 2-5 CoinGecko ids
}
export interface IcsConfig {
  enabled: boolean
  url: string // the WHOLE url is the secret
}

export type ConnectorConfig =
  | RssConfig
  | GithubConfig
  | GitlabConfig
  | JiraConfig
  | VercelConfig
  | CryptoConfig
  | IcsConfig

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
 *  string)[]` (and, as of Task 46, `identityField?: keyof C & string` too),
 *  so once ConnectorConfig becomes a multi-member union a
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
  /** Config field holding the human identity shown as "Connected as X" on the
   *  card shell (token connectors). Absent for auth 'none'. The shell derives
   *  auth-state: secret present + identity present → connected; identity
   *  present + secret MISSING (backup-restored) → needs-reconnect. */
  identityField?: keyof C & string
}
