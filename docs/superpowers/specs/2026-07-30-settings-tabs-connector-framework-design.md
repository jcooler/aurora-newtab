# Settings Tabs + Connector Framework — v2 sub-project 1

**Approved by Jon 2026-07-30**: four-tab Settings IA; decomposition with auth-type phasing (this sub-project first; token connectors next; OAuth wave last). Roster approved: GitHub, GitLab, Gmail, Google Calendar, Spotify, Jira, Vercel, RSS, crypto ticker, calendar-via-ICS, habit streaks, month calendar — all LATER sub-projects except the one reference connector here.

## Goal

Re-architect Settings into four tabs (General / Widgets / Connectors / Data) and build the connector framework every integration will plug into — registry, per-connector config + credential storage, snapshot cache with stale-while-revalidate refresh, opt-in lifecycle with per-origin permission requests, settings cards, and dashboard block wiring — proven end-to-end by **one reference connector: RSS** (no-auth, so the framework's shape is validated without token/OAuth complexity).

## Non-goals

Every other connector (sub-projects 2–3); OAuth of any kind; background polling/alarms; notification badges; sync. The premium seam stays a seam (`isPremium()` still hardcoded true).

## Settings: four tabs

- Tab bar directly under the drawer's "Settings" header: `role="tablist"`, arrow-key navigation, `aria-selected`, focus-visible — the theme radiogroup's keyboard conventions. Panel surface/width unchanged; each tab's content scrolls independently if needed.
- **General**: name, 24-hour clock, theme, units, search engine, mute, Background (source, gallery).
- **Widgets**: all widget toggles; per-widget config (Weather location, World clocks, Countdowns); Layout (Arrange layout / Reset layout).
- **Connectors**: one card per registered connector — icon glyph (inline SVG, never remote), name, one-line what-you-get, state (Off / Configured), expand-to-configure. Gated on `isPremium()` (hidden entirely when false, no-placeholder rule).
- **Data**: Export/Import backup; the About footer (version · support link) stays pinned at this tab's bottom.
- The drawer opens on General each time (no persisted tab state in v1 of this). Existing element ids/aria-labels are preserved wherever a control merely MOVES (tests and the preview harness select on them); renames only where a control's meaning changes, with tests updated deliberately.
- No-placeholder rule holds: the Connectors tab at this sub-project's end shows exactly ONE card (RSS) — real, working. No "coming soon" cards for the approved roster.

## Connector framework

### Registry and modules

- `src/services/connectors/types.ts`: `ConnectorId` union (starts `'rss'`; grows per sub-project), `ConnectorDescriptor { id; label; blurb; auth: 'none' | 'token' | 'oauth'; origins(config): string[]; ttlMs; secretFields: (keyof config)[] }`, `CONNECTORS` registry array.
- Per connector: `src/services/connectors/<id>.ts` — pure service (fetch + parse + typed snapshot), no `chrome.*`. The framework's generic pieces (refresh orchestration, permission requests) live once, not per connector.

### Storage (schema v4)

- `AuroraData` gains `connectors: Partial<Record<ConnectorId, ConnectorConfig>>` (per-connector: `enabled: boolean` + service-specific fields — RSS: `feeds: string[]` (max 5), `shownCount`) and `connectorSnapshots: Partial<Record<ConnectorId, { fetchedAt: number; data: unknown }>>`.
- `CURRENT_VERSION = 4`; `migrations[3]` backfills both `{}`. Backup validators gain both keys (type-forced); **fields listed in a descriptor's `secretFields` are stripped from exports** (future tokens/ICS URLs; RSS has none) — the Data tab's "what's excluded" line mentions connector credentials alongside photos.
- Snapshot lifecycle: on new-tab mount, each ENABLED connector renders its cached snapshot immediately; if `now - fetchedAt > ttlMs`, refresh in the background and write the new snapshot (plain write — `fetchedAt` always changes). Quiet-failure convention: a failed refresh keeps the stale snapshot, no error banners on the dashboard; the connector card in Settings shows last-refresh state.

### Permissions (the load-bearing decision)

Cross-origin fetches from the extension page need host permissions. The design: `optional_host_permissions: ["https://*/*"]` declared in the manifest; when a user adds/enables a connector target, `chrome.permissions.request({ origins: [specificOrigin] })` runs in the click handler — Chrome prompts for THAT site only (e.g. "Read data on news.ycombinator.com"). `src/services/permissions.ts` grows origin-request support beside its existing named-permission support (same gesture-chain discipline: no await before `request`). Removing a feed/connector revokes its origin via `chrome.permissions.remove` when no other connector claims it. Per-origin, user-gesture, minimal — the compliance story extends, not bends: README + PRIVACY gain a Connectors section stating the pattern (connectors talk directly to the services you connect; credentials and data stay local; each origin is granted by you, per site).

### Dashboard wiring

Each shipped connector maps to a `BlockId` (arrange-mode integration). This sub-project adds `'rss'` to `BLOCK_IDS`, with a `<WidgetBoundary name="rss">` + `PositionedBlock` mount gated on the connector's `enabled`. Layout schema untouched beyond the id union growing (sparse map absorbs it; backup unknown-id filter already tolerates forward ids).

## Reference connector: RSS

- Config (Connectors tab card): up to 5 feed URLs (add row validates URL shape + requests the origin on add — denied origin = feed not added, `role="alert"` per idiom), shown-count (3–8).
- Service: fetch each feed (AbortController, per-feed failure isolation), parse RSS 2.0 + Atom via `DOMParser` (no new runtime deps), normalize to `{ source, title, url, publishedAt }`, merge newest-first, snapshot top N.
- Widget: a quiet headline list — `text-sm` links with `text-photo`, source label muted, default placement in the lower-left region (exact spot chosen in the plan with screenshot gates; must not collide with Notes pill/refresh at default). Clicking navigates. TTL 30 minutes.
- Preview probe: seed a LOCAL fixture feed (served from the extension package or a data-URL — no live network dependency in the harness), enable the connector, assert headlines render + screenshot `connectors-rss.png`; drawer captures become per-tab (`drawer-general/widgets/connectors/data.png`, replacing the current scroll-position captures).

## Testing

Pure: registry shape invariants, RSS/Atom parser fixtures (malformed feeds, entity handling), migration v3→v4, backup validators + secret-field stripping, origin-set computation. RTL: tab bar keyboard/aria behavior; each tab renders its moved sections (SettingsPanel tests reorganized per-tab, coverage preserved not deleted); connector card enable flow with mocked permission service; RSS widget renders from a snapshot. Harness: per-tab drawer captures + the RSS probe + all existing PASS lines.

## Compliance

New manifest key `optional_host_permissions` only; no new install-time permissions; every connector origin is user-granted per site at click time; store listing's permission justifications gain the host-permission entry when this ships in a store update (release docs updated in the wrap task).
