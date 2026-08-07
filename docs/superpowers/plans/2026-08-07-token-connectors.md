# Token & No-Auth Connectors (SP2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six read-only glance connectors — GitHub, GitLab, Jira, Vercel, crypto ticker, ICS calendar — each a registry descriptor + pure service + settings card body + widget block, on the SP1 framework, wrapped at v1.4.0.

**Architecture:** Nothing here re-designs the framework. Each connector is: a config type + descriptor in the registry (secrets declared, origins derived), a pure service module (`fetchFn` injected, quiet per-section failure), a card body on the generic Connectors shell (token connectors share one `TokenConnectForm`), and a `PositionedBlock` widget with the gate/inner split reading `useConnectorSnapshot`. One framework-accommodation task runs first (config union + casts, `refresh(prev)` for ETags, shell auth-state); one combined-layout harness gate closes the phase.

**Tech Stack:** React 19 + TS strict + Vite 6 + @crxjs MV3 + Tailwind 4 + Vitest 3 + Playwright preview harness. NO new runtime deps (ICS expander is hand-rolled; STOP rule below).

**Spec:** `docs/superpowers/specs/2026-08-02-token-connectors-design.md`

## Global Constraints

- Everything standing still binds: local-first; `chrome.*` ONLY in the storage driver + `src/services/bookmarks.ts` + `src/services/permissions.ts`; connector fetches are plain `fetch` from the page, direct to the service (no proxy); a11y non-negotiable (labels, `role="alert"` idiom, focus-visible, APG patterns); `bg-panel-solid` for floating panels, `text-photo` on photo-floating text; deep-equal storage writes emit no events; serialized writes via `storage.update`; `cursor-pointer` on interactive elements (Tailwind v4 preflight inverts it).
- **Compliance (spec §Compliance):** no new install-time permissions; every origin user-granted at click time — `ensureOrigin` is the FIRST await in its gesture (zero awaits before `chrome.permissions.request`; twice-learned); tokens/secret URLs in `chrome.storage.local` only, declared in `secretFields` (backup-stripped by the framework — verified per connector by test); read-only APIs only; no polling loops — SWR + TTL only, one refresh per stale connector per tab open.
- **Never store a token that failed validation** (spec §Validation on connect).
- **Empty ≠ placeholder** (spec): a connected connector with nothing to show renders its quiet in-voice empty line; a NOT-configured connector renders no widget at all (gate).
- **No schema bump.** New connector ids are additive optional keys under the existing `connectors` / `connectorSnapshots` maps (shape unchanged, `defaults()` already `{}`); older builds importing a newer backup drop unknown ids by design (`cleanConnectors`). State this in the Task 46 commit message so nobody "fixes" it.
- **Gesture-ordering is review-critical:** jsdom mocks cannot catch an await slipped before `ensureOrigin` — every task reviewer must re-trace the connect/add gesture by reading (SP1 ledger ruling).
- **Widget gates are defensive:** backup import validates connector configs structurally (`enabled` only) — every gate must `Array.isArray`/typeof-check the fields it dereferences (RssWidget precedent, SP1 final review finding 2).
- **ICS expander STOP rule (spec):** if the RRULE expander exceeds ~300 lines, STOP and re-decide with Jon before writing more.
- Verification per task: `npx tsc --noEmit` + `npm test` + `npm run build`; harness-touching tasks add `npm run build:preview` + full `node scripts/preview.mjs` with ALL PASS / 0 FAIL / no console errors; controller reviews every new capture personally. Commits end with the standard trailer; push after every task. Version stays 1.3.0 until Task 55 bumps 1.4.0.

## SP1 interfaces this plan consumes (already on main at `23b506f`)

```ts
// src/services/connectors/types.ts
CONNECTOR_IDS = ['rss'] as const; ConnectorId; RssConfig; ConnectorConfig = RssConfig
ConnectorSnapshot { fetchedAt: number; data: unknown }
ConnectorDescriptor<C> { id; label; blurb; auth: 'none'|'token'|'oauth'; ttlMs; secretFields: (keyof C & string)[]; origins(config: C): string[] }
// C is INVARIANT (secretFields keyof C): once ConnectorConfig is a union, every
// CONNECTORS entry needs an honest cast `xDescriptor as ConnectorDescriptor` (types.ts comment).

// src/services/connectors/registry.ts — CONNECTORS: ConnectorDescriptor[]; getConnector(id)
// src/lib/hooks/useConnectorSnapshot.ts
useConnectorSnapshot<T>(id, refresh: () => Promise<T>, ttlMs?): { data: T|null; fetchedAt: number|null; refreshing: boolean; lastError: string|null }
// src/services/permissions.ts — originPattern(url) (https-only, throws otherwise); hasOrigin; ensureOrigin; removeOrigin
// src/lib/backup.ts — stripSecrets reads descriptor.secretFields; snapshots never exported
// src/settings/sections/Connectors.tsx — generic shell (label/blurb/enable) + body slot keyed on descriptor.id
// src/newtab/widgets/rss/RssWidget.tsx — gate/inner pattern; src/lib/layout/types.ts BLOCK_IDS; ArrangeController BLOCK_LABELS
// scripts/preview.mjs — openSettingsTab(name), merge-seed idiom, snapshot seeding with page-context Date.now(), rect-intersection collision idiom
```

---

### Task 46: Framework accommodations — config union, refresh(prev), shell auth-state

**Files:**
- Modify: `src/services/connectors/types.ts`, `src/services/connectors/registry.ts`, `src/lib/hooks/useConnectorSnapshot.ts`, `src/settings/sections/Connectors.tsx`, `src/settings/sections/Data.tsx`
- Test: `src/lib/hooks/useConnectorSnapshot.test.tsx`, `src/settings/SettingsPanel.test.tsx` (extend), `src/services/connectors/registry.test.ts` (should pass unchanged — invariants are generic)

**Interfaces:**
- Produces (types.ts) — the six config types and the union; `identityField` on the descriptor:

```ts
export const CONNECTOR_IDS = ['rss', 'github', 'gitlab', 'jira', 'vercel', 'crypto', 'ics'] as const

export interface GithubConfig { enabled: boolean; token: string; username: string }
export interface GitlabConfig { enabled: boolean; token: string; instanceUrl: string; username: string }
export interface JiraConfig  { enabled: boolean; email: string; apiToken: string; site: string; displayName: string }
export interface VercelConfig { enabled: boolean; token: string; username: string }
export interface CryptoConfig { enabled: boolean; coins: string[] } // 2–5 CoinGecko ids
export interface IcsConfig   { enabled: boolean; url: string }      // the WHOLE url is the secret

export type ConnectorConfig =
  | RssConfig | GithubConfig | GitlabConfig | JiraConfig | VercelConfig | CryptoConfig | IcsConfig

export interface ConnectorDescriptor<C extends ConnectorConfig = ConnectorConfig> {
  // ...existing fields unchanged...
  /** Config field holding the human identity shown as "Connected as X" on the
   *  card shell (token connectors). Absent for auth 'none'. The shell derives
   *  auth-state: secret present + identity present → connected; identity
   *  present + secret MISSING (backup-restored) → needs-reconnect. */
  identityField?: keyof C & string
}
```

- Produces (hook): `refresh` now receives the previous cached data — `refresh: (prev: T | null) => Promise<T>`. The hook passes exactly what it just read from the snapshot (null when absent). RSS's call site compiles unchanged (extra param ignored).
- Produces (shell): `Connectors.tsx` renders per-descriptor auth-state — for `auth: 'token'`: a status chip `Connected as {config[identityField]}` (green-tinted text, existing quiet-chip idiom) / `Reconnect needed` when identity present but every `secretFields` entry empty/missing / nothing when unconfigured. Body slot becomes a `Record<ConnectorId, ComponentType<BodyProps>>` map (`rss` migrates into it verbatim; unknown id → no body).
- Produces (Data.tsx): the export description line now reads "…Background photo uploads, connector sign-in secrets, and cached connector data are not included." (SP1 final-review finding 6, second half).

- [ ] **Step 1: Failing hook tests** — extend `useConnectorSnapshot.test.tsx`: (a) fresh mount with a stale snapshot → `refresh` is called with the PREVIOUS data object; (b) fresh mount with no snapshot → called with `null`. Run to fail (signature mismatch).
- [ ] **Step 2: Implement `refresh(prev)`**, run hook suite green. The prev value is the one read in the mount effect — do NOT re-read storage to build it.
- [ ] **Step 3: Types union + rss cast.** Grow `CONNECTOR_IDS`, add the six configs + union + `identityField`. `registry.ts`: `CONNECTORS = [rssDescriptor as ConnectorDescriptor]` with a one-line comment pointing at the types.ts variance note. `rssDescriptor` itself stays typed `ConnectorDescriptor<RssConfig>`. Run `npx tsc --noEmit` — expect the union to force exactly this cast and nothing else; fix any other fallout by narrowing at the site with a documented single cast (no `as unknown as`).
- [ ] **Step 4: Failing shell tests** (SettingsPanel.test.tsx, Connectors describe): with a seeded `{ github: { enabled: true, token: 't', username: 'jon' } }` AND a fake github descriptor injected — NO: the real github descriptor doesn't exist until Task 48, so test the shell generically through the RSS card (auth 'none' → no status chip) plus a UNIT test of the extracted auth-state helper: `authState(descriptor, config): 'none' | 'unconfigured' | 'connected' | 'reconnect'` — exported from `Connectors.tsx`, tested directly with a fake token descriptor (`{ auth: 'token', secretFields: ['token'], identityField: 'username' }` cast per the backup.test.ts fake-descriptor precedent). Cases: both present → connected; identity without token → reconnect; neither → unconfigured; auth 'none' → none.
- [ ] **Step 5: Implement shell auth-state + body-map + Data.tsx copy, green.** Full suite + build.
- [ ] **Step 6: Commit + push** — `feat: connector framework accommodations — config union, refresh(prev), card auth-state` (body notes: NO schema bump, additive ids by design).

---

### Task 47: Shared plumbing — http helpers, TokenConnectForm, origin release

**Files:**
- Create: `src/services/connectors/http.ts`, `src/services/connectors/http.test.ts`, `src/settings/sections/TokenConnectForm.tsx`
- Test: `src/settings/SettingsPanel.test.tsx` (extend — form tested through a fake descriptor body OR a dedicated `TokenConnectForm.test.tsx`; implementer's choice, dedicated file preferred)

**Interfaces:**
- Produces (http.ts) — pure, `fetchFn` injected, 8s abort per request (same discipline as rss.ts's `fetchOneFeed`, reimplemented here as the shared home; do NOT refactor rss.ts):

```ts
export interface JsonResult<T> { ok: true; status: number; body: T; etag: string | null } 
export interface JsonError { ok: false; status: number | null; message: string } // status null = network/abort
export async function getJson<T>(url: string, headers: Record<string, string>, fetchFn?: typeof fetch): Promise<JsonResult<T> | JsonError>
/** Conditional GET: sends If-None-Match when etag is present; a 304 returns
 *  { ok: true, status: 304, body: null, etag } so callers keep their prev section. */
export async function conditionalGetJson<T>(url: string, headers: Record<string, string>, etag: string | null, fetchFn?: typeof fetch): Promise<JsonResult<T | null> | JsonError>
```

- Produces (TokenConnectForm.tsx) — the one card body all four token connectors render:

```ts
export interface TokenField { id: string; label: string; type: 'text' | 'password'; placeholder: string; defaultValue?: string }
export function TokenConnectForm(props: {
  fields: TokenField[]
  connectLabel?: string // default 'Connect'
  /** Origins to request BEFORE validation — derived synchronously from the
   *  field values. Returning [] or throwing → inline alert, no permission
   *  request, nothing stored. */
  originsFor(values: Record<string, string>): string[]
  /** The who-am-I probe. Runs AFTER the grant. Resolve { ok: true, identity }
   *  to persist; { ok: false, message } → role="alert", NOTHING stored. */
  validate(values: Record<string, string>): Promise<{ ok: true; identity: string } | { ok: false; message: string }>
  /** Persist the validated config (called once, after validate ok). */
  onConnected(values: Record<string, string>, identity: string): Promise<void>
  /** Present when already connected → renders Disconnect instead of the form. */
  connectedAs: string | null
  onDisconnect(): Promise<void>
}): JSX.Element
```

- **Connect gesture (COMPLIANCE-CRITICAL, mirror in code comment):** click → sync trim/required-check → sync `originsFor` (throws/empty → alert, stop) → `await ensureOrigin(o)` for the FIRST origin as the FIRST await (multi-origin: request the first in-gesture; these connectors each derive exactly one origin — assert `origins.length === 1` in `originsFor` consumers) → grant denied → alert, stop → `await validate(values)` → failure → alert, NOTHING stored → success → `await onConnected(values, identity)`.
- Produces (origin release — in `src/services/connectors/registry.ts`): the production caller `descriptor.origins()` was promised (SP1 finding 3):

```ts
/** Origins safe to revoke when `id` disconnects: its own origins minus any
 *  origin another ENABLED connector still derives. Pure; callers do the
 *  actual removeOrigin calls. */
export function releasableOrigins(id: ConnectorId, configs: Partial<Record<ConnectorId, ConnectorConfig>>): string[]
```

- [ ] **Step 1: Failing http tests** — getJson: ok json parsed + etag captured from headers; non-OK → JsonError with status; network reject → status null; abort at 8s (fake timers, mock fetch rejecting on signal abort — copy rss.test.ts's timer idiom). conditionalGetJson: sends `If-None-Match` only when etag present (assert on the mock's received headers); 304 → `{ ok: true, status: 304, body: null }`.
- [ ] **Step 2: Implement http.ts, green.**
- [ ] **Step 3: Failing TokenConnectForm tests** (mock `../services/permissions` like SettingsPanel.test.tsx does): happy path order asserted via call-order spies (`ensureOrigin` before `validate` before `onConnected`); denial → alert + neither validate nor onConnected; validate failure → alert + no onConnected; required-empty field → alert + no ensureOrigin; connectedAs set → Disconnect button calls onDisconnect; every input labelled, alert has `role="alert"`.
- [ ] **Step 4: Implement TokenConnectForm, green.** House styling: same control classes as the RSS body (read Connectors.tsx), password fields get `autocomplete="off"`.
- [ ] **Step 5: Failing releasableOrigins tests** — own origin unused elsewhere → returned; same origin derived by another enabled connector → withheld; disabled other connector → doesn't withhold; bad config rows (origins() filter) → no throw.
- [ ] **Step 6: Implement, green. Full suite + build. Commit + push** — `feat: shared token-connector plumbing — http, connect form, origin release`.

---

### Task 48: GitHub connector

**Files:**
- Create: `src/services/connectors/github.ts`, `src/services/connectors/github.test.ts`, `src/newtab/widgets/github/GithubWidget.tsx`, `src/newtab/widgets/github/GithubWidget.test.tsx`
- Modify: `src/services/connectors/registry.ts`, `src/settings/sections/Connectors.tsx` (body map entry), `src/newtab/App.tsx`, `src/lib/layout/types.ts` (BLOCK_IDS + `'github'`), `src/newtab/arrange/ArrangeController.tsx` (BLOCK_LABELS `github: 'GitHub'`), `scripts/preview.mjs`
- Test: `src/settings/SettingsPanel.test.tsx` (extend), `src/lib/backup.test.ts` (extend: github token stripped)

**Interfaces:**

```ts
// github.ts — all requests: Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'
export interface GithubItem { title: string; url: string; repo: string } // repo = 'owner/name' from repository_url
export interface GithubData {
  prs: GithubItem[]           // GET https://api.github.com/search/issues?q=type:pr+state:open+review-requested:@me&per_page=10
  issues: GithubItem[]        // GET https://api.github.com/search/issues?q=type:issue+state:open+assignee:@me&per_page=10
  notifications: number | null // GET https://api.github.com/notifications?per_page=50 → unread array length; 50 caps display '50+'.
                               // null = endpoint unavailable (fine-grained PATs may 403 it) → widget hides the row. QUIET degradation, no error.
  etags: Record<string, string> // keyed by endpoint path; conditionalGetJson; 304 → keep prev section verbatim
}
export async function fetchGithub(token: string, prev: GithubData | null, fetchFn?: typeof fetch): Promise<GithubData>
export async function whoamiGithub(token: string, fetchFn?: typeof fetch): Promise<{ ok: true; identity: string } | { ok: false; message: string }> // GET /user → login; non-OK → message incl. status
export const githubDescriptor: ConnectorDescriptor<GithubConfig>
// { id:'github', label:'GitHub', blurb:'PRs waiting on you, your issues, notifications', auth:'token',
//   ttlMs: 5*60_000, secretFields:['token'], identityField:'username', origins: () => ['https://api.github.com/*'] }
```

- Sections fail INDEPENDENTLY (Promise.allSettled or per-call try): one 403/500 section keeps its `prev` slice (or `[]`/`null` with no prev) while the others refresh — a bad notifications endpoint must never blank the PR list.
- Widget (panel-surface card, per spec "lists sit on a card"): `bg-panel-solid rounded-2xl shadow-lg p-4 w-80` — header row `GitHub` + optional `{notifications} unread`; then up to 4 PR rows (`text-sm font-medium`, `text-xs text-fg-muted` repo prefix) then up to 3 issue rows under a hairline; every row an external link (`target="_blank" rel="noopener noreferrer"`, whole-row hit target, title attr, cursor-pointer, focus-visible). Empty-connected state: `No PRs waiting on you 🎉` (exact copy). Default placement: right column upper — `fixed right-8 top-[24vh]` (pin exact classes at the screenshot gate; must clear the collapsed weather chip and later stack-mates).
- Gate: `github?.enabled && typeof github.token === 'string' && github.token.length > 0` (defensive per Global Constraints). Inner: `useConnectorSnapshot<GithubData>('github', (prev) => fetchGithub(config.token, prev))`.
- Card body (Connectors.tsx map entry): `TokenConnectForm` with one password field `Fine-grained personal access token`; `originsFor: () => ['https://api.github.com/*']`; `validate: (v) => whoamiGithub(v.token)`; `onConnected` persists `{ enabled: true, token, username }` via `storage.update`; `onDisconnect` clears the config entry AND revokes via `releasableOrigins('github', configs)` → `removeOrigin` each.

- [ ] **Step 1: Failing service tests** — whoami ok/bad-token(401 → message names status); fetchGithub: three sections parsed from fixture JSON (search payload `items[{title, html_url, repository_url}]` → repo derived); notifications 403 → `notifications: null`, others intact; one section network-fail + prev present → prev slice kept; ETag round-trip (first call stores etag, second sends If-None-Match, 304 keeps prev verbatim + still returns fresh etags map).
- [ ] **Step 2: Implement github.ts, register descriptor (cast per registry comment), green.** Registry invariant tests must pass with two entries.
- [ ] **Step 3: Failing card + backup tests** — card: connect happy path (mock whoami via mocking the service module, order ensureOrigin→validate→persist), 401 message → alert + nothing stored, disconnect revokes `https://api.github.com/*` (mock releasable path through real registry), reconnect state renders when username present + token empty. backup.test.ts: exported backup with a github config has `token` ABSENT and `username` present, storage untouched.
- [ ] **Step 4: Failing widget tests** — renders PR/issue rows + unread count from seeded snapshot; `notifications: null` → no unread row; connected-but-empty → the 🎉 line; disabled/missing token → nothing + no snapshot write; link attrs.
- [ ] **Step 5: Implement card body + widget + block wiring, green.**
- [ ] **Step 6: Harness** — seed enabled github config + fresh snapshot (fixture: 2 PRs, 2 issues, 3 unread) via merge-seed; probe: rows render (count + first title), collision vs weather chip/timer at defaults, capture `connectors-github.png` + the card in `drawer-connectors.png` refresh; disable + clear after. Full suite + build + build:preview + preview ALL PASS. Controller reviews captures.
- [ ] **Step 7: Commit + push** — `feat: github connector — reviews, issues, notifications at a glance`.

---

### Task 49: GitLab connector

**Files:** mirror Task 48 with `gitlab` (service `src/services/connectors/gitlab.ts`, widget `src/newtab/widgets/gitlab/GitlabWidget.tsx`, same modify list, BLOCK_LABELS `gitlab: 'GitLab'`).

**Interfaces:**

```ts
export interface GitlabMr { title: string; url: string; project: string } // project from references.full or web_url path
export interface GitlabData { mrs: GitlabMr[]; todos: number } // todos len-capped at 20 → display '20+'
export async function fetchGitlab(instanceUrl: string, token: string, prev: GitlabData | null, fetchFn?: typeof fetch): Promise<GitlabData>
// GET {base}/api/v4/merge_requests?scope=assigned_to_me&state=opened&per_page=10 ; GET {base}/api/v4/todos?per_page=20
// Authorization: Bearer. base = instanceUrl with trailing slash trimmed.
export async function whoamiGitlab(instanceUrl: string, token: string, fetchFn?): Promise<...> // GET {base}/api/v4/user → username
export const gitlabDescriptor: ConnectorDescriptor<GitlabConfig>
// { id:'gitlab', label:'GitLab', blurb:'Assigned MRs and to-dos', auth:'token', ttlMs: 5*60_000,
//   secretFields:['token'], identityField:'username', origins: (c) => https-only-filtered [originPattern(c.instanceUrl)] }
```

- Card body: TokenConnectForm fields `[{ id:'instanceUrl', label:'Instance URL', type:'text', defaultValue:'https://gitlab.com' }, { id:'token', label:'Personal access token', type:'password' }]`; `originsFor` validates https + returns `[originPattern(instanceUrl)]` (throw → inline alert, per form contract). Persist `{ enabled, token, instanceUrl, username }`.
- Widget: panel card like GitHub (header `GitLab` + `{todos} to-dos` when > 0); up to 5 MR rows; empty-connected copy: `No MRs assigned to you.` Default placement: right column middle — `fixed right-8 top-[46vh]` (pin at gate).
- Gate defends `token` AND `instanceUrl` string-ness.

- [ ] **Steps 1–7: same cycle as Task 48** (service TDD incl. instance-origin derivation + trailing-slash trim + non-gitlab.com instance test; card connect/disconnect/reconnect + backup token-strip; widget rows/empty/gate; harness seed + collision + `connectors-gitlab.png`; commit `feat: gitlab connector — assigned MRs and to-dos`). Origin-release test: gitlab on `https://gitlab.example.com` and NO other connector there → revoked; gitlab.com instance shared with nothing else in practice but the releasable helper already covers it generically.

---

### Task 50: Jira connector

**Files:** mirror Task 48 with `jira` (service `jira.ts`, widget `JiraWidget.tsx`, BLOCK_LABELS `jira: 'Jira'`).

**Interfaces:**

```ts
export interface JiraIssue { key: string; summary: string; status: string; url: string } // url = https://{site}/browse/{key}
export interface JiraData { issues: JiraIssue[]; counts: Record<string, number> } // counts by status name, insertion-ordered
export async function fetchJira(site: string, email: string, apiToken: string, prev: JiraData | null, fetchFn?): Promise<JiraData>
// GET https://{site}/rest/api/3/search/jql?jql=assignee%3DcurrentUser()%20AND%20resolution%3DUnresolved%20ORDER%20BY%20updated%20DESC&fields=summary,status&maxResults=10
// (the NEW /search/jql endpoint — the legacy /search is removed on Atlassian cloud)
// Authorization: 'Basic ' + btoa(`${email}:${apiToken}`)
export async function whoamiJira(site, email, apiToken, fetchFn?): Promise<...> // GET https://{site}/rest/api/3/myself → displayName
export const jiraDescriptor: ConnectorDescriptor<JiraConfig>
// { id:'jira', label:'Jira', blurb:'Issues assigned to you', auth:'token', ttlMs: 10*60_000,
//   secretFields:['apiToken'], identityField:'displayName', origins: (c) => [`https://${c.site}/*`] with a site-shape guard }
```

- Site validation (sync, in `originsFor` + service): bare domain matching `/^[a-z0-9-]+\.atlassian\.net$/i` (strip an accidental `https://` prefix and trailing slash before matching; reject anything else with the alert `Enter your site as yoursite.atlassian.net`).
- Card body fields: site (text, placeholder `yoursite.atlassian.net`), email (text), API token (password). Persist `{ enabled, email, apiToken, site, displayName }`.
- Widget: panel card; header `Jira` + counts line (`3 In Progress · 2 To Do` — first two statuses by count); up to 5 rows `KEY-123` (`text-xs text-fg-muted font-medium`) + summary (`text-sm`, truncate + title). Empty-connected: `Nothing assigned to you.` Default placement: right column lower — `fixed right-8 top-[66vh]` (pin at gate; must clear Tasks pill bottom-right).
- [ ] **Steps 1–7: same cycle** (service TDD incl. Basic-auth header assertion, site-shape rejection, ADF-free fields parse `fields.summary`/`fields.status.name`; card/backup apiToken-strip; widget; harness `connectors-jira.png`; commit `feat: jira connector — your assigned issues at a glance`).

---

### Task 51: Vercel connector

**Files:** mirror Task 48 with `vercel` (service `vercel.ts`, widget `VercelWidget.tsx`, BLOCK_LABELS `vercel: 'Deploys'`).

**Interfaces:**

```ts
export interface VercelDeployment { project: string; state: string; url: string; createdAt: number }
// state ∈ READY | ERROR | BUILDING | QUEUED | CANCELED (pass through verbatim; widget maps colors)
export interface VercelData { deployments: VercelDeployment[] } // ERROR states sorted FIRST (spec), then by createdAt desc
export async function fetchVercel(token: string, prev: VercelData | null, fetchFn?): Promise<VercelData>
// GET https://api.vercel.com/v6/deployments?limit=8 — Authorization: Bearer; fields name, state/readyState, inspectorUrl|url, createdAt
export async function whoamiVercel(token, fetchFn?): Promise<...> // GET https://api.vercel.com/v2/user → user.username ?? user.email
export const vercelDescriptor: ConnectorDescriptor<VercelConfig>
// { id:'vercel', label:'Vercel', blurb:'Your latest deployments', auth:'token', ttlMs: 5*60_000,
//   secretFields:['token'], identityField:'username', origins: () => ['https://api.vercel.com/*'] }
```

- Widget: panel card; up to 5 rows — project name + state chip (`READY` → `text-emerald-300`, `ERROR` → `text-red-400` (the parked danger ruling covers this exact usage), building/queued → `text-fg-muted`) + relative age (`3m`, `2h`, `4d` — small pure `relAge(now, createdAt)` helper, unit-tested, no Date.now inside). Failed-first ordering asserted. Empty-connected: `No deployments yet.` Default placement: pinned during implementation into the right-column stack's remaining slot (the stack tops out — if 24/46/66vh are taken, Vercel goes `fixed right-[22rem] top-[24vh]` as a second column start; measure at the gate).
- [ ] **Steps 1–7: same cycle** (service TDD incl. failed-first sort + readyState/state fallback; card/backup; widget incl. state-color classes asserted; harness `connectors-vercel.png`; commit `feat: vercel connector — deployments at a glance, failures first`).

---

### Task 52: Crypto ticker (no auth)

**Files:** mirror Task 48 with `crypto` (service `crypto.ts`, widget `CryptoWidget.tsx`, BLOCK_LABELS `crypto: 'Crypto'`). No TokenConnectForm — bespoke small body.

**Interfaces:**

```ts
export interface CoinRow { id: string; symbol: string; name: string; price: number; change24h: number }
export interface CryptoData { coins: CoinRow[] }
export async function fetchCrypto(ids: string[], prev: CryptoData | null, fetchFn?): Promise<CryptoData>
// GET https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids={ids.join(',')}&per_page=5
// (markets endpoint: one call yields symbol+name+current_price+price_change_percentage_24h)
export const cryptoDescriptor: ConnectorDescriptor<CryptoConfig>
// { id:'crypto', label:'Crypto', blurb:'Prices for the coins you watch', auth:'none', ttlMs: 5*60_000,
//   secretFields: [], origins: () => ['https://api.coingecko.com/*'] }
```

- Card body: enable toggle is the shell's; body = one labelled text input `Coins (CoinGecko ids, comma-separated)` placeholder `bitcoin, ethereum` + Save button. Sync validation: split/trim/lowercase, 2–5 entries, each matching `/^[a-z0-9-]+$/` (else `role="alert"`). Save gesture: `ensureOrigin('https://api.coingecko.com/anything')` FIRST await (the api origin — pass a concrete URL `https://api.coingecko.com/api/v3/` to originPattern), then persist. Unknown ids simply return no row from the API — the widget shows what came back (quiet).
- Widget: a slim centered strip (NOT a tall card): `fixed left-[calc(50%-11rem)] top-[76vh] w-88` — transform-free centering per PositionedBlock discipline; single row of up to 5 `BTC $67,412 +2.4%` cells (`text-sm font-medium text-photo`; change tinted `text-emerald-300` / `text-red-400`; price formatted `Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits: price < 1 ? 4 : 0 })` — pure `formatPrice` helper, tested). Must clear the quote block below and the links row above at defaults — measured at the gate. Empty-connected (API returned nothing): `No prices right now.`
- Gate defends `Array.isArray(coins) && coins.length > 0`.
- [ ] **Steps 1–7: same cycle** (service TDD: markets parse, id order preserved as configured, per-request abort; card: 1 id rejected, 6 ids rejected, happy path grants then persists; widget: tint classes + formatPrice cases (BTC 67412 → $67,412; DOGE 0.1234 → $0.1234); harness seed + `connectors-crypto.png` + collision vs quote/links; commit `feat: crypto ticker connector`).

---

### Task 53: ICS service — parser + RRULE expander (pure, TDD-hard)

**Files:**
- Create: `src/services/connectors/ics.ts`, `src/services/connectors/ics.test.ts`

**Interfaces:**

```ts
export interface IcsEvent { summary: string; start: number; end: number } // epoch ms, expanded occurrences
/** Parses a VCALENDAR and expands recurrences from `windowStart` for `windowDays`
 *  (60 in production). Pure: `now`/window injected, no Date.now(). Handles:
 *  line unfolding (CRLF + leading space/tab), text escapes (\n \, \;),
 *  DTSTART/DTEND (VALUE=DATE all-day → local midnight span; UTC `Z`; TZID via
 *  the JS runtime's zone database using Intl — see expander notes; floating →
 *  local), DURATION fallback when DTEND absent,
 *  RRULE FREQ=DAILY|WEEKLY|MONTHLY with INTERVAL, COUNT, UNTIL, BYDAY (weekly,
 *  e.g. MO,WE,FR; monthly BYDAY/BYMONTHDAY beyond a single simple value → base
 *  event only), EXDATE (multiple, comma lists). ANY other FREQ or unsupported
 *  part → that event renders its base occurrence only (spec's bounded promise).
 *  Malformed input → []. */
export function parseIcs(text: string, windowStart: number, windowDays: number): IcsEvent[]
export interface IcsData { events: IcsEvent[] } // sorted by start asc
/** Fetches the ICS text (response .text(), NOT getJson) and parses+expands it.
 *  The 60-day window starts at Date.now() taken INSIDE the widget's refresh
 *  closure (the impure call boundary) — parseIcs itself stays pure. */
export async function fetchIcs(url: string, windowStart: number, prev: IcsData | null, fetchFn?: typeof fetch): Promise<IcsData>
export const icsDescriptor: ConnectorDescriptor<IcsConfig>
// { id:'ics', label:'Calendar', blurb:'Your next events, from any calendar app',
//   auth: 'none' — deliberately NOT 'token': there is no identity to render, the
//   secret is the URL itself (secretFields:['url'], no identityField).
//   ttlMs: 15*60_000, origins: (c) => https-filtered [originPattern(c.url)] }
```

- **TZID strategy (decide up front, document in the file header):** convert a TZID-stamped local time to epoch via `Intl.DateTimeFormat(..., { timeZone })` inverse search (the small well-known two-pass offset trick: format a UTC guess in the target zone, adjust by the difference, re-check once — handles DST transitions to the minute). If the zone id is unknown to the runtime → treat as floating local, render base occurrence only for RRULEs. This is ~30 lines; it counts toward the 300-line STOP budget.
- **DST tests are mandatory** (the spec calls them out): a weekly 09:00 America/New_York event spanning a spring-forward boundary keeps 09:00 wall time (epoch shifts by the offset change); an UNTIL in UTC that lands mid-window stops expansion; COUNT=5 yields exactly 5; EXDATE removes exactly its occurrence; INTERVAL=2 weekly skips alternate weeks; all-day VALUE=DATE renders as a full-day span; unfolded long SUMMARY reassembles.
- [ ] **Step 1: Failing parser/expander tests** — the full list above as fixtures (template strings; build them from real exported Google Calendar/Outlook snippets, anonymized).
- [ ] **Step 2: Implement in slices** (unfold+parse → then DAILY → WEEKLY+BYDAY → MONTHLY → COUNT/UNTIL/EXDATE → TZID), running the suite each slice. **Count lines when done: if the expander portion exceeds ~300, STOP — commit nothing further and report to the controller for the Jon re-decision the spec demands.**
- [ ] **Step 3: fetchIcs + descriptor + register (cast), green. Full suite + build.**
- [ ] **Step 4: Commit + push** — `feat: ics service — bounded rrule expander`.

---

### Task 54: ICS card + calendar widget

**Files:**
- Create: `src/newtab/widgets/calendar/CalendarWidget.tsx`, `src/newtab/widgets/calendar/CalendarWidget.test.tsx`
- Modify: `src/settings/sections/Connectors.tsx` (ics body), `src/newtab/App.tsx`, `src/lib/layout/types.ts` (+`'ics'`), `src/newtab/arrange/ArrangeController.tsx` (`ics: 'Calendar'`), `scripts/preview.mjs`
- Test: `src/settings/SettingsPanel.test.tsx`, `src/lib/backup.test.ts` (ics url stripped)

**Interfaces:**
- Card body: labelled password-type input `Secret calendar address (ICS URL)` + helper text VERBATIM: `In Google Calendar or Outlook: Settings → your calendar → "Secret address in iCal format" — paste that link here. It stays on this device.` Save gesture: sync https validation → `ensureOrigin(url)` first await → HEAD/GET probe is NOT required (a wrong URL just yields an empty widget; spec demands validation-on-connect only for token identity calls) → persist `{ enabled: true, url }`. Disconnect clears + releases via `releasableOrigins`.
- Widget (photo-floating, NOT a panel — spec): `fixed left-8 top-[62vh]` under RSS's worst case. Line 1 `text-sm font-medium text-photo`: `Next: {summary} · {relative}` (relative via the same `relAge`-style pure helper, forward-looking: `in 25 min`, `in 3 h`, `tomorrow 09:00`). Then up to 4 `text-xs text-fg-muted text-photo` rows: today's REMAINING events (`09:30 Standup`). All-day events render `All day · {summary}` first. Re-render cadence: reuse the app's existing minute tick if one is exported (read `Clock.tsx` first); otherwise a 60s `setInterval` in the inner with cleanup + comment. Empty-connected: `No more events today.`
- Gate defends `typeof url === 'string' && url.length > 0`. Refresh closure: `(prev) => fetchIcs(config.url, Date.now(), prev)` — `Date.now()` lives at this impure call boundary; parseIcs stays pure, 60-day window.
- [ ] **Steps 1–6: the Task 48 cycle minus whoami** (card save/denial/https-reject + backup URL-strip test (the WHOLE url absent from export); widget: next-line + agenda rows from seeded snapshot with fixed `now` injected via seeded event times around a mocked system time (`vi.setSystemTime`), all-day row, empty line, gate; harness: seed snapshot with one event ~2h out + two today → probe rows + `connectors-calendar.png` + collision vs RSS/notes/refresh; commit `feat: calendar widget — ics connector`).

---

### Task 55: Combined-defaults gate + wrap — docs, v1.4.0, full pass

**Files:**
- Modify: `scripts/preview.mjs`, `README.md`, `PRIVACY.md`, `release/store-listing.md`, `package.json` + `src/manifest.ts` (→ 1.4.0), `src/settings/sections/Data.tsx` only if Task 46's copy needs the final connector names (it shouldn't — keep it generic)

- [ ] **Step 1: Combined-layout harness gate (spec-required).** New block: enable ALL SEVEN connectors with seeded fresh snapshots (fixtures from each task's seed), capture `connectors-all.png` at 1600×900 AND run pairwise rect-intersection over every connector block + timer pill + weather chip (collapsed) + notes pill + refresh + Tasks pill + quote + links row + search bar — the falsifiable idiom (measured rects, every `found` required). Repeat the capture (no assertions beyond console-clean) at 1280×800 and 2560×1440. Expanded weather: assert the 500×900-precedent disciplined-occlusion rule INSTEAD of non-overlap for whichever right-column blocks it covers (alpha ≥ 0.9, topmost) — expanded is transient. Restore all connectors off after.
- [ ] **Step 2: Fix any collisions the gate finds** by adjusting the pinned default classes (each widget's own file), re-running until green. Controller reviews `connectors-all.png` personally against the product-concept vision.
- [ ] **Step 3: Docs.** README: Connectors section grows the six (one line each, what you see + what it reads). PRIVACY.md: per-connector one-liners under the existing Connectors section, VERBATIM pattern: `**GitHub** — talks only to api.github.com; sends only your token (as the Authorization header) and the queries for your own PRs, issues, and notifications.` (equivalents for GitLab/instance, Jira/site, Vercel, CoinGecko — note: coin ids sent, nothing else; ICS — fetches only the secret URL you pasted). Effective-date bump. store-listing.md STAGED section gains the Data-Usage line from the spec: `Authentication information: yes — stored locally, never transmitted except to the service it belongs to.`
- [ ] **Step 4: Version 1.4.0** both files + `npm install` lockfile sync (metadata-only verified). `npm run package` → `release/aurora-1.4.0.zip`, guards green, STAGED not submitted (v1.2.1 verdict still gates all store motion — if a verdict has landed, STOP and consult Jon per HANDOFF.md).
- [ ] **Step 5: Full verify** — suite, production build, build:preview, full preview run (every PASS line, zero FAIL, no console errors), controller full visual pass over all new captures.
- [ ] **Step 6: Commit + push** — `feat: v1.4.0 — six glance connectors on the framework`.

---

## After Task 55

Final whole-plan review (fable tier; base `4c80897`, head = Task 55 commit; ledger minors triaged MERGE-BLOCKING vs CAN-DEFER), ONE fix wave + ONE scoped re-review if needed, full visual pass, report to Jon (zip staged behind the v1.2.1 verdict), Jira AUR-86 + Confluence sync, memory update, SDD workspace deleted at close.

## Out of scope

OAuth (SP3 — Spotify/GCal/Gmail); write operations; notifications/badges; stocks; habit streaks + month calendar (SP4); tab-state persistence; RSS changes of any kind (working and reviewed — the shared http helper deliberately does NOT refactor rss.ts).
