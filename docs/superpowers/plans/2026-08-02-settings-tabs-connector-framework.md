# Settings Tabs + Connector Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four-tab Settings (General / Widgets / Connectors / Data) + the connector framework (registry, snapshots, per-origin permissions, secret-stripped backups), proven end-to-end by the RSS reference connector.

**Architecture:** The framework is registry-driven — a connector is a descriptor + a pure service module + a widget block + a settings card, with ALL generic machinery (snapshot SWR, origin grants, backup stripping) written once. Settings becomes a tab shell composing the existing section components, which move but do not change.

**Tech Stack:** React 19 + TS strict + Vite 6 + @crxjs + Tailwind 4 + Vitest 3 + Playwright harness. NO new runtime deps (RSS parsing via DOMParser).

**Spec:** `docs/superpowers/specs/2026-07-30-settings-tabs-connector-framework-design.md`

## Global Constraints

- Everything standing still binds: local-first; `chrome.*` ONLY in the storage driver + `src/services/bookmarks.ts` (chrome.bookmarks) + `src/services/permissions.ts` (chrome.permissions) — connector fetches are plain `fetch` from the page; a11y non-negotiable (labels, focus-visible, Escape via `useDialogEscape`, tablist keyboard per ARIA); panel surfaces `bg-panel-solid` for floating panels / `bg-panel` for pills+drawer; `.text-photo` on photo-floating text; deep-equal storage writes emit no events (nonce where re-read must trigger); serialized writes via `storage.update`.
- **Compliance hard rules**: check Chrome's optional-permission allow-list before ANY permission design (geolocation lesson); `chrome.permissions.request`/origin requests called with ZERO awaits earlier in the gesture (twice-learned); `optional_host_permissions` is the only new manifest key this plan may add.
- **Rendering hard rules** (paid for in blood): `position:fixed` elements are stacking contexts — overlays that must outrank body-level portals need explicit conditional z on the WRAPPER; no transforms on wrappers that contain `position:fixed` descendants (PositionedBlock is calc-centered for this reason); preview screenshots must wait out the photo fade (condition-wait + 800ms settle idiom, already in the harness helpers).
- No-placeholder rule: the Connectors tab does not EXIST in the UI until its first real card ships (Task 44). Toggle labels land with their widget.
- Verification per task: `npm test` + `npm run build` (+ `npm run build:preview` + `node scripts/preview.mjs` where stated) with NO console errors; controller reviews new/changed screenshots personally. Preview build (`build:preview`) is required for any probe touching bookmarks.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; push after every task. Work on `main`, continuous. Version stays 1.2.1 until Task 45 bumps to 1.3.0.

---

### Task 39: Schema v5 — connector keys, migration, secret-aware backup

**Files:**
- Create: `src/services/connectors/types.ts`
- Modify: `src/lib/storage/schema.ts`, `src/lib/storage/migrations.ts`, `src/lib/backup.ts`
- Test: `src/lib/storage/migrations.test.ts`, `src/lib/backup.test.ts` (extend)

**Interfaces:**
- Produces (`types.ts`):

```ts
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
```

- Produces (schema): `AuroraData` gains `connectors: Partial<Record<ConnectorId, ConnectorConfig>>` and `connectorSnapshots: Partial<Record<ConnectorId, ConnectorSnapshot>>`; `defaults()` gains `{}` for both; `CURRENT_VERSION = 5`; `migrations[4]` backfills both `{}` (follow `migrations[2]`'s style incl. spread-preserve).
- Produces (backup): a `SECRET_FIELDS: Partial<Record<ConnectorId, string[]>>` map in `backup.ts` (RSS: `[]` — the MECHANISM ships now, exercised by test with a fake entry); export strips listed fields per connector; validators for both new keys (`connectors` entries: plain object with boolean `enabled`; unknown connector ids DROPPED in cleaning, same convention as layout's unknown block ids; `connectorSnapshots`: plain objects with finite `fetchedAt` — snapshots are cache, also acceptable to EXCLUDE from export entirely: **decision — snapshots are excluded from exports** (cache, not user data; smaller files; one less validator surface on import — imports simply never contain them, and any present in a hand-edited file are dropped).

- [ ] **Step 1: Failing migration tests** — v4→v5 backfills both keys `{}`; a v1 snapshot chains 1→2→3→4 (assert `layout` AND `connectors` both present after `migrate({}, 1)`, and `searchEngine` absent — migrations[3] strips it); extend the custom-registry ordering test with `4:` (expect `[0,1,2,3,4]`).
- [ ] **Step 2: Run to fail, implement schema/types/migration, run to green.**
- [ ] **Step 3: Failing backup tests** — export of defaults contains `connectors` but NOT `connectorSnapshots`; a config with a fake secret field listed in a test-injected SECRET_FIELDS entry is stripped from export but survives in storage; import drops unknown connector ids and any snapshot key; malformed `connectors` (string) rejects naming the key.
- [ ] **Step 4: Implement, green. Full suite + build.** Wrapper tests still seed version symbolically — verify no hard-coded `3`.
- [ ] **Step 5: Commit + push** — `feat: schema v5 — connector config and snapshot keys, secret-aware backup` + trailer.

---

### Task 40: Settings tab shell — General / Widgets / Data

**Files:**
- Create: `src/settings/Tabs.tsx`
- Modify: `src/settings/SettingsPanel.tsx`
- Test: `src/settings/SettingsPanel.test.tsx` (reorganize), new `src/settings/Tabs.test.tsx`

**Interfaces:**
- Produces: `Tabs({ tabs: { id: string; label: string }[], active, onChange, children })` — renders `role="tablist"` of `role="tab"` buttons (`aria-selected`, `id`/`aria-controls` wiring to a `role="tabpanel"`); keyboard: Left/Right/Home/End roving focus per ARIA tabs pattern, focus-visible outlines per house idiom. SettingsPanel owns `const [tab, setTab] = useState<'general' | 'widgets' | 'data'>('general')` — resets each drawer open (component remounts with the drawer's children; verify and rely on that, don't add state clearing).
- Section redistribution (MOVE, don't rewrite — imports and JSX order only): **General** = name, 24-hour, theme, units, mute, Background section (NOTE: the search-engine picker no longer exists — deleted in the Red Argon remediation, ed25420). **Widgets** = widget toggles, Weather (location), World clocks, Countdowns, Layout. **Data** = Data section + About footer. Every existing element id / aria-label is preserved (the harness and tests select on them).
- The `'connectors'` tab id is NOT in this task (no-placeholder: it appears in Task 44 with its first real card).

- [ ] **Step 1: Failing Tabs tests** — three tabs render; clicking switches panels (other panels unmounted, not hidden — sections with `useStoredKey` must not run hooks when not shown... **decision: unmount inactive tabs** — cheaper and matches the gate/inner zero-hooks philosophy); ArrowRight/Left/Home/End move focus and select; `aria-selected`/`aria-controls` correct.
- [ ] **Step 2: Implement Tabs, green.**
- [ ] **Step 3: Reorganize SettingsPanel** into the three tab panels. SettingsPanel.test.tsx: tests select within the right tab (add a `openTab(name)` helper clicking the tab first); NO assertion deleted — each existing test gains at most the helper call. Run the full settings suite; every pre-existing behavior test must pass with only that mechanical addition (a test needing MORE than the helper = a behavior change = stop and reconsider).
- [ ] **Step 4: Preview harness** — replace the drawer scroll-captures with per-tab captures: `drawer-general.png`, `drawer-widgets.png`, `drawer-data.png` (theme loop keeps using General for its three theme shots; Escape-order and arrange probes retarget their controls via the Widgets tab — audit every `preview.mjs`/`store-shots.mjs` selector that touches the drawer). Full run: all PASS lines, no console errors.
- [ ] **Step 5: Full suite + build + build:preview + preview. Controller reviews the three new captures.**
- [ ] **Step 6: Commit + push** — `feat: settings tabs — general, widgets, data` + trailer.

---

### Task 41: Per-origin permission support

**Files:**
- Modify: `src/manifest.ts`, `src/services/permissions.ts`
- Test: `src/services/permissions.test.ts` (extend)

**Interfaces:**
- Produces (manifest): `optional_host_permissions: ['https://*/*']` in BOTH build modes (verify production `dist/manifest.json` byte-diff shows only this addition).
- Produces (permissions.ts):

```ts
/** Origin pattern for a URL: https://news.ycombinator.com/path -> https://news.ycombinator.com/* .
 *  Throws on non-https (connector URLs are https-only by validation). */
export function originPattern(url: string): string
export async function hasOrigin(url: string): Promise<boolean>   // chrome.permissions.contains
export async function ensureOrigin(url: string): Promise<boolean> // request — ZERO awaits before chrome.permissions.request (gesture chain; same doc discipline as ensurePermission)
export async function removeOrigin(url: string): Promise<void>    // chrome.permissions.remove; safe no-op if absent
```

- [ ] **Step 1: Failing tests** (chrome stub via `vi.stubGlobal`, per the file's existing idiom): `originPattern` cases (path/query stripped, port preserved, http throws, invalid throws); `ensureOrigin` forwards `{ origins: [pattern] }` and NEVER calls `contains` first (regression guard, same as the named-permission one); `removeOrigin` forwards and tolerates rejection.
- [ ] **Step 2: Implement, green.**
- [ ] **Step 3: Manifest change + both builds; assert production manifest diff is exactly the one key (report the diff).** Full suite + build.
- [ ] **Step 4: Commit + push** — `feat: per-origin optional host permissions` + trailer.

---

### Task 42: Framework core — registry, snapshot lifecycle

**Files:**
- Create: `src/services/connectors/registry.ts`, `src/lib/hooks/useConnectorSnapshot.ts`
- Modify: `src/services/connectors/types.ts`
- Test: `src/services/connectors/registry.test.ts`, `src/lib/hooks/useConnectorSnapshot.test.tsx`

**Interfaces:**
- Produces (types additions):

```ts
export interface ConnectorDescriptor<C extends ConnectorConfig = ConnectorConfig> {
  id: ConnectorId
  label: string           // card + widget aria naming
  blurb: string           // one-line what-you-get on the card
  auth: 'none' | 'token' | 'oauth'
  ttlMs: number
  secretFields: (keyof C & string)[]
  origins(config: C): string[] // every URL the service will fetch, for grant/revoke bookkeeping
}
```

- Produces (registry.ts): `CONNECTORS: ConnectorDescriptor[]` (Task 43 adds the RSS entry; this task ships the array + `getConnector(id)` + an invariant test that every `CONNECTOR_IDS` member has exactly one descriptor once RSS lands — written now, asserting over the array generically). `SECRET_FIELDS` in backup.ts is REPLACED by reading descriptors (single source of truth; backup.ts imports the registry — verify no import cycle: registry must stay pure, no React/chrome).
- Produces (useConnectorSnapshot):

```ts
/** SWR over connectorSnapshots[id]: returns the cached snapshot immediately,
 *  and if absent/staler than ttlMs, runs `refresh` ONCE per mount (not per
 *  render), writing the result via storage.update. Refresh failures keep the
 *  stale snapshot (quiet-failure) and set `lastError` locally (never stored).
 *  Concurrency: a module-level in-flight map keyed by id dedupes across
 *  multiple mounted consumers (two tabs of the same page each run their own —
 *  cross-tab dedupe is NOT attempted; last write wins, harmless for caches). */
export function useConnectorSnapshot<T>(id: ConnectorId, refresh: () => Promise<T>): { data: T | null; fetchedAt: number | null; refreshing: boolean; lastError: string | null }
```

- [ ] **Step 1: Failing hook tests** (memoryDriver): fresh mount with no snapshot → refresh runs once, snapshot written; stale snapshot → cached data returned IMMEDIATELY, refresh follows; fresh-enough snapshot → no refresh; refresh rejection → stale data kept, `lastError` set, nothing written; two mounted consumers → one refresh (in-flight dedupe).
- [ ] **Step 2: Implement, green.**
- [ ] **Step 3: Registry + backup.ts source-of-truth swap** (failing test first: descriptor-declared secret is stripped; the Task 39 fake-map test migrates to a fake descriptor). Full suite + build.
- [ ] **Step 4: Commit + push** — `feat: connector registry and snapshot lifecycle` + trailer.

---

### Task 43: RSS service — parser + fetch orchestration

**Files:**
- Create: `src/services/connectors/rss.ts`
- Test: `src/services/connectors/rss.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Headline { source: string; title: string; url: string; publishedAt: number }
/** Pure: parses one RSS 2.0 or Atom document (DOMParser). Malformed XML or an
 *  unrecognized root -> []. Entities decoded; missing dates -> 0. `source` =
 *  channel/feed title, falling back to the feed URL's hostname. */
export function parseFeed(xml: string, feedUrl: string): Headline[]
/** Fetches all feeds (AbortController, 8s timeout each, failures isolated per
 *  feed), merges newest-first, returns top `count`. Empty feeds list -> []. */
export async function fetchHeadlines(feeds: string[], count: number, fetchFn?: typeof fetch): Promise<Headline[]>
export const rssDescriptor: ConnectorDescriptor<RssConfig> // ttlMs 30*60_000, auth 'none', secretFields [], origins = feeds.map(originPattern)
```

Registered in `CONNECTORS` (registry invariant test now bites for real).

- [ ] **Step 1: Failing parser tests** — fixtures as template strings: RSS 2.0 minimal; Atom minimal (`<entry>/<link href>`); entities (`&amp;`, CDATA titles); missing pubDate; malformed XML → `[]`; HTML-not-feed → `[]`; source fallback to hostname.
- [ ] **Step 2: Implement parseFeed, green.**
- [ ] **Step 3: Failing fetch tests** (mock fetchFn) — merge order newest-first; one feed rejecting doesn't sink the rest; count truncation; abort on timeout (fake timers).
- [ ] **Step 4: Implement, register descriptor, green. Full suite + build.**
- [ ] **Step 5: Commit + push** — `feat: rss connector service` + trailer.

---

### Task 44: Connectors tab, RSS card, RSS widget

**Files:**
- Create: `src/settings/sections/Connectors.tsx`, `src/newtab/widgets/rss/RssWidget.tsx`
- Modify: `src/settings/SettingsPanel.tsx` (add the tab), `src/newtab/App.tsx`, `src/lib/layout/types.ts` (BLOCK_IDS + `'rss'`), `scripts/preview.mjs`
- Test: `src/settings/SettingsPanel.test.tsx` (extend), `src/newtab/widgets/rss/RssWidget.test.tsx`

**Interfaces:**
- Connectors tab: appears ONLY now (fourth tab). Gated on `isPremium()` — tab absent entirely when false (test with mocked premium). One card (RSS, from the registry — the card SHELL is generic, rendering descriptor label/blurb/auth-state, with a per-connector config body slot): enable toggle; feeds list (add row: https-URL validation + `ensureOrigin(url)` IN the add-click gesture — denied → feed not added + `role="alert"` per idiom; remove row → `removeOrigin` when no remaining feed shares the origin); shownCount (3–8 select). Config via `storage.update('connectors', …)`.
- RSS widget: `'rss'` joins BLOCK_IDS (layout tolerant by construction — Task 32's unknown-id filter note applies forward); `<WidgetBoundary name="rss">` + `PositionedBlock id="rss"` in App, gated on `connectors.rss?.enabled && feeds.length > 0`, gate/inner split. Inner: `useConnectorSnapshot('rss', …)` → up to shownCount headline rows — `text-sm font-medium text-photo` title links (`target="_blank" rel="noopener noreferrer"` — external site, unlike internal launcher links), `text-xs text-fg-muted` source prefix. Default placement: left-middle column, clear of refresh/Notes at defaults — pin exact classes during implementation with a screenshot gate; a combined-defaults collision assertion joins the harness (rss vs notes pill vs refresh rects).
- Preview probe: fixture feed WITHOUT live network — seed by writing a pre-baked `connectorSnapshots.rss` snapshot + enabled config via the merge-seed (probe asserts rows render from cache — the service layer is unit-tested; the harness proves the widget+config path), capture `connectors-rss.png` + `drawer-connectors.png`; restore state.

- [ ] **Step 1: Failing card tests** — enable flow; add-feed happy path calls `ensureOrigin` then persists (mocked permissions service); denial → alert + not persisted; remove revokes when last user of origin; shownCount bounds; premium-false → no Connectors tab.
- [ ] **Step 2: Implement tab + card, green.**
- [ ] **Step 3: Failing widget tests** — renders headlines from a seeded snapshot (memoryDriver); disabled/empty-feeds → renders nothing (zero hooks in gate — assert via the established pattern); link attrs (`target`/`rel`).
- [ ] **Step 4: Implement widget + block wiring, green.**
- [ ] **Step 5: Harness probes + captures; full suite + build + build:preview + preview — all PASS lines incl. the new collision assertion; controller reviews `connectors-rss.png` + `drawer-connectors.png`.**
- [ ] **Step 6: Commit + push** — `feat: connectors tab with rss reference connector and headline widget` + trailer.

---

### Task 45: Wrap — docs, version 1.3.0, full pass

**Files:**
- Modify: `README.md`, `PRIVACY.md`, `release/store-listing.md`, `src/manifest.ts` + `package.json` (→ 1.3.0)

- [ ] **Step 1: Docs** — README: Connectors feature section (framework + RSS, the per-origin grant story) + Settings-tabs mention; PRIVACY.md: Connectors section (direct-to-service pattern, per-origin grants, tokens-local-and-backup-stripped forward promise, RSS's concrete disclosure: fetches only the feed URLs you add, sends nothing but the request) + effective-date bump; store-listing.md: host-permission justification block + description delta for the eventual store update (marked as staged-for-next-submission, not yet submitted).
- [ ] **Step 2: Version 1.3.0 both files (+ lockfile sync via `npm install`, metadata-only verified).**
- [ ] **Step 3: Full verify** — suite, production build, `npm run package` (guards green; NOTE the zip is staged for a FUTURE store update — v1.2.0 is still in review; do not confuse the artifacts: name check `aurora-1.3.0.zip`), `build:preview` + full preview run (all captures re-generated, all PASS lines), controller full visual pass.
- [ ] **Step 4: Commit + push** — `feat: v1.3.0 — settings tabs and connector framework with rss` + trailer.

---

## After Task 45

Final whole-plan review (fable tier; base = this plan's start commit, head = task-45 commit; ledger minors triaged MERGE-BLOCKING vs CAN-DEFER), ONE fix wave + ONE scoped re-review if needed, full visual pass, then report to Jon: what shipped, screenshots, that v1.3.0's zip AWAITS his store-update submission (v1.2.0 review verdict may land meanwhile — if v1.2.0 was REJECTED, stop and consult Jon before any 1.3.0 submission planning).

## Out of scope

Every other connector (sub-projects 2–3 specs exist — new plans when their turn comes); habit streaks / month calendar (sub-project 4 spec); OAuth machinery; tab-state persistence; connector badges/notifications.
