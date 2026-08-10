# GitHub View Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-connector view selection for GitHub — Jon picks which sections his card shows ("Show on your board" toggle chips in settings: Commit graph / Pull requests / Issues / Notifications), with a new accent-tinted contribution heatmap as the Commit-graph section.

**Jon's brief (2026-08-09, verbatim):** "I am disappointed there are no options for the connectors to chooce what you want to see. I may not want to see github PRs and just wanna see my commit graph or something else."

**Jon's pick (2026-08-10, from the rendered option board at `screenshots/options/github-*.png` + `github-README.md`):** **"C + A's graph"** — Variant C's settings mechanism (the "Show on your board" toggle-chip row; the widget renders only the enabled sections, composed vertically) with Variant A's graph-first heatmap treatment as how the Commit-graph section renders. **The board renders are the visual spec** (render-is-the-spec law): the chip states, the accent-tinted heatmap with mono month ticks, the stat line's type treatment, the settings copy "Show on your board" / "Your card shows only the sections you turn on." The board's REFERENCE CODE (house-token-faithful, adapt don't copy blindly) lives in the throwaway worktree `D:\DEV\Chrome plugin\.claude\worktrees\agent-a27a4111c985e955a\board\` — `ui.tsx` (Heatmap/StatLine), `GithubCards.tsx` (ToggleChip, settings face), `seed.ts` (deterministic fixture generator). Read them; they resolve every "what exactly did the render look like" question.

**Architecture:** `GithubConfig` gains an optional `views` field (absent = all four sections on — the additive upgrade: the graph appears, nothing a user already sees vanishes). The service fetches ONLY enabled sections (disabled → prev slice carried verbatim, no request), adding a GraphQL contributions-calendar fetch (a new `postJson` helper in http.ts) with the house quiet-degradation discipline. The widget composes enabled sections vertically: heatmap+stat, PR rows, issue rows; the notifications chip is a "section" too. Settings' GithubBody gains the chip row via a new `connectedExtras` slot on TokenConnectForm. GitLab/Jira/Vercel adopt the same pattern in a LATER plan — this plan ships GitHub end-to-end.

**Tech Stack:** unchanged (React 19, TS strict, Tailwind 4, Vitest, Playwright preview harness). No new deps. No schema-version bump (the new field is optional inside a connector config that only exists post-connect; backup import's structural validation — `enabled` only — already tolerates it, and `views` is NOT a secret so it survives backup export).

## Global Constraints

- The board renders are the spec: `github-C-settings-closeup.png` for the chips, `github-A-graph-closeup.png` for the heatmap treatment, `github-C-composed-closeup.png` for the composed card. Deviations require pixel-level justification in the report — soft-pedaled deviation claims are the known failure mode; the reviewer measures.
- ONE deliberate content deviation from the board, pre-ruled: the stat line says **"contributions"**, not "commits" (board text: "343 commits"). GitHub's calendar counts contributions (commits + PRs + reviews + issues); labeling them "commits" violates the content-accuracy directive. Same type treatment as the render (bright tabular total, accent streak number), word swapped.
- House laws in force: solid surface `bg-panel-solid` via tokens only; quiet degradation (an unavailable endpoint hides its section, no error UI); per-section fetch independence (one section's failure never blanks another); zero-hooks-in-the-gate widget split; interior-worst-case measurement (tier assertions at minimum heights, forced worst states); shrink-never-blink (sections condense/hide monotonically under height pressure, never at a blink); focus/interaction probes at every visual gate (screenshots alone are insufficient); TS strict with single documented casts; comments state constraints, not narration.
- Rail budget: the github card shares the right rail with gitlab + jira below the weather chip's FORCED 3-line worst case (164px + 16 gap — the probe "Weather chip WORST-CASE height probe" pins it). The composed card with all four sections on is the NEW worst case; every affected budget (App.tsx github-block arithmetic comment, short/dense tier allocations, fenceposts) is RE-MEASURED, not patched.
- `MAX_PRS = 2`, `MAX_ISSUES = 2` display caps stay. Card stays `w-80` `p-3 dense:p-2`.
- All existing behavior when `views` is absent must equal: all four sections enabled. Existing users' cards gain the graph and lose nothing.
- Origins unchanged: `https://api.github.com/*` already covers `/graphql` — no new grant flow.
- Verification per task: `npx tsc --noEmit` + full `npx vitest run` + `npm run build`, ALL PASS 0 FAIL; harness tasks add `npm run build:preview` + `node scripts/preview.mjs` (full run). Version stays 1.7.0 until Task 71 bumps 1.8.0. Store discipline: v1.2.1 CWS verdict still gates all submissions; the 1.8.0 zip is STAGED only.
- Commit trailer on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_013tenUZa8vgXK7LVy8Hgfcv`

## Interfaces consumed (main at `41006da`)

```
src/services/connectors/types.ts — GithubConfig { enabled, token, username }; ConnectorDescriptor (invariance note — casts at registry).
src/services/connectors/http.ts — getJson/conditionalGetJson, fetchWithTimeout (8s abort), JsonResult/JsonError. postJson lands beside them (Task 67).
src/services/connectors/github.ts — fetchGithub(token, prev, fetchFn), GithubData { prs, issues, notifications, etags }, per-section helpers, whoamiGithub, githubDescriptor.
src/newtab/widgets/github/GithubWidget.tsx — gate split (connectedGithub narrowing), GithubInner + useConnectorSnapshot, ItemRow, MAX_PRS/MAX_ISSUES, card surface classes.
src/lib/hooks/useConnectorSnapshot.ts — SWR, refresh-once-per-mount via refs, ttl from descriptor (5min), prev carried into refresh. NOT modified by this plan.
src/settings/sections/Connectors.tsx — GithubBody (TokenConnectForm usage, onConnected REPLACES the whole github config — Task 69 must preserve views), ConnectorCard shell.
src/settings/sections/TokenConnectForm.tsx — connected-state layout; gains connectedExtras (Task 69).
src/settings/Switch.tsx — the house switch (chips echo its token family, not its shape).
scripts/preview.mjs — github fixture ~line 1910-1945 (FIXTURE + storage seed + probes), forced-weather-chip worst-case probe, resize sweep, height fenceposts 600/601 & 864/865 & 889/890.
```

---

### Task 67: Service layer — views config, postJson, the contributions fetch, gated fetchGithub

**Files:**
- Modify: `src/services/connectors/types.ts`, `src/services/connectors/http.ts`, `src/services/connectors/github.ts`
- Test: `src/services/connectors/http.test.ts`, `src/services/connectors/github.test.ts` (extend both)

**Interfaces:**
- Consumes: existing `getJson`/`conditionalGetJson` idioms, `GithubData`, `fetchGithub`.
- Produces (later tasks rely on these EXACT names):
  - `types.ts`: `interface GithubViews { commitGraph: boolean; pulls: boolean; issues: boolean; notifications: boolean }`; `GithubConfig` gains `views?: GithubViews`.
  - `github.ts`: `const DEFAULT_GITHUB_VIEWS: GithubViews` (all four `true`); `function resolveGithubViews(config: Pick<GithubConfig, 'views'> | null | undefined): GithubViews`; `interface ContributionDay { date: string; count: number }`; `interface Contributions { days: ContributionDay[]; total: number }`; `GithubData` gains `contributions: Contributions | null`; `fetchGithub(token: string, prev: GithubData | null, views: GithubViews, fetchFn?: typeof fetch): Promise<GithubData>` (NEW third parameter).
  - `http.ts`: `postJson<T>(url: string, headers: Record<string, string>, body: unknown, fetchFn?: typeof fetch): Promise<JsonResult<T> | JsonError>`.

- [ ] **Step 1: Failing http tests for `postJson`** — extend `http.test.ts`: (a) POSTs with `method: 'POST'`, `Content-Type: application/json` merged into headers, `JSON.stringify(body)` as the request body (assert via the injected fetchFn's call args); (b) 200 parses JSON body into `JsonResult`; (c) non-OK status → `JsonError` with that status; (d) fetch rejection → `JsonError` with `status: null`. Run: expect FAIL (postJson not exported).

- [ ] **Step 2: Implement `postJson`** in http.ts. Extend `fetchWithTimeout` with an optional `init?: { method?: string; body?: string }` parameter (spread into the fetch init alongside headers/signal) so the 8s-abort/network-fold discipline is shared, not duplicated:

```ts
export async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  fetchFn: typeof fetch = fetch,
): Promise<JsonResult<T> | JsonError> {
  const outcome = await fetchWithTimeout(
    url,
    { ...headers, 'Content-Type': 'application/json' },
    fetchFn,
    { method: 'POST', body: JSON.stringify(body) },
  )
  if (outcome.failed) return outcome.error
  const { res } = outcome
  if (!res.ok) return statusError(res)
  const parsed = (await res.json()) as T
  return { ok: true, status: res.status, body: parsed, etag: res.headers.get('etag') }
}
```

Run http tests: PASS (getJson/conditionalGetJson untouched and still green).

- [ ] **Step 3: Failing types/normalizer tests** — in `github.test.ts`: `resolveGithubViews(undefined)`, `resolveGithubViews(null)`, and `resolveGithubViews({})` (no `views` key) all return `{ commitGraph: true, pulls: true, issues: true, notifications: true }`; a stored partial like `{ views: { commitGraph: false } as never }` (a hand-edited backup can restore anything structurally enabled) fills missing fields from the default rather than crashing or dropping them. Run: FAIL.

- [ ] **Step 4: Implement `GithubViews` + `resolveGithubViews`**. In types.ts add the interface and the optional field with this constraint comment: absent means ALL sections on — the additive-upgrade rule; new fields here must never make existing cards lose content silently. In github.ts:

```ts
export const DEFAULT_GITHUB_VIEWS: GithubViews = {
  commitGraph: true,
  pulls: true,
  issues: true,
  notifications: true,
}

/** Absent/partial `views` (pre-feature configs, hand-edited backups) resolve
 *  against the all-on default so a section can never vanish for lack of a key. */
export function resolveGithubViews(
  config: Pick<GithubConfig, 'views'> | null | undefined,
): GithubViews {
  const stored = config?.views
  return {
    commitGraph: typeof stored?.commitGraph === 'boolean' ? stored.commitGraph : DEFAULT_GITHUB_VIEWS.commitGraph,
    pulls: typeof stored?.pulls === 'boolean' ? stored.pulls : DEFAULT_GITHUB_VIEWS.pulls,
    issues: typeof stored?.issues === 'boolean' ? stored.issues : DEFAULT_GITHUB_VIEWS.issues,
    notifications: typeof stored?.notifications === 'boolean' ? stored.notifications : DEFAULT_GITHUB_VIEWS.notifications,
  }
}
```

Run: PASS.

- [ ] **Step 5: Failing contributions-fetch tests.** The GraphQL section: query `viewer.contributionsCollection(from:$from, to:$to).contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }` against `https://api.github.com/graphql` via postJson. Window: 112 days ending today (from = today−111 days at 00:00, to = now, both `.toISOString()`). Tests (inject fetchFn):
  - a 200 whose body nests the calendar → `contributions.days` flattened from weeks, ascending by date, only days within the window (GitHub pads the first week with earlier days — they are DROPPED), `total` = totalContributions;
  - a 200 carrying a GraphQL `errors` array (fine-grained PATs may be refused GraphQL access — the token-type analog of the notifications 403) → prev carried (`prev.contributions` when present, else `null`), NO throw;
  - a non-OK / network failure → same prev-carry;
  - `views.commitGraph === false` → NO request to /graphql at all (assert the injected fetchFn never saw that URL) and `contributions` = `prev?.contributions ?? null`.
  Run: FAIL.

- [ ] **Step 6: Implement the contributions section + gated `fetchGithub`.** New helper alongside the existing section helpers, same isolation discipline:

```ts
const GRAPHQL_PATH = '/graphql'
const CONTRIB_DAYS = 112 // 16 weeks — the card-width crop the board pinned

const CONTRIB_QUERY = `query($from: DateTime!, $to: DateTime!) {
  viewer { contributionsCollection(from: $from, to: $to) {
    contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
  } }
}`

interface ContribBody {
  data?: { viewer?: { contributionsCollection?: { contributionCalendar?: {
    totalContributions?: unknown
    weeks?: Array<{ contributionDays?: Array<{ date?: unknown; contributionCount?: unknown }> }>
  } } } }
  errors?: unknown[]
}

/** The contributions calendar via GraphQL (POST — no ETag round-trip exists
 *  for it; the 5-minute ttl is the only fetch governor). Failure carries prev:
 *  a fine-grained PAT refused GraphQL access degrades quietly to a graph-less
 *  card, exactly like the notifications 403 hides the unread chip. */
async function fetchContributionsSection(
  headers: Record<string, string>,
  prev: Contributions | null,
  fetchFn: typeof fetch,
): Promise<Contributions | null> {
  try {
    const to = new Date()
    const from = new Date(to)
    from.setDate(to.getDate() - (CONTRIB_DAYS - 1))
    from.setHours(0, 0, 0, 0)
    const result = await postJson<ContribBody>(
      BASE + GRAPHQL_PATH, headers,
      { query: CONTRIB_QUERY, variables: { from: from.toISOString(), to: to.toISOString() } },
      fetchFn,
    )
    if (!result.ok || Array.isArray(result.body.errors)) return prev
    const calendar = result.body.data?.viewer?.contributionsCollection?.contributionCalendar
    if (!calendar || !Array.isArray(calendar.weeks)) return prev
    const days: ContributionDay[] = []
    for (const week of calendar.weeks) {
      if (!Array.isArray(week.contributionDays)) continue
      for (const d of week.contributionDays) {
        if (typeof d.date !== 'string' || typeof d.contributionCount !== 'number') continue
        if (d.date >= isoDay(from)) days.push({ date: d.date, count: d.contributionCount })
      }
    }
    days.sort((a, b) => (a.date < b.date ? -1 : 1))
    const total = typeof calendar.totalContributions === 'number'
      ? calendar.totalContributions
      : days.reduce((a, d) => a + d.count, 0)
    return { days, total }
  } catch {
    return prev
  }
}
```

(`isoDay` = local yyyy-mm-dd formatter, private to the module.) `fetchGithub` takes `views` and gates EVERY section: a disabled section runs no request and resolves `{ items: prev?.X ?? [], etag: prevEtags[PATH] }` (etag preserved verbatim so re-enabling resumes the conditional chain); `notifications` disabled → count carries prev ?? null; `commitGraph` disabled → prev contributions carried by the helper's gate at the call site (skip the helper entirely, use `prev?.contributions ?? null`). The Promise.all stays — disabled slots become resolved literals. Wire `contributions` into the returned GithubData. Run: PASS.

- [ ] **Step 7: Existing-test sweep.** Every existing `fetchGithub` test call site gains `DEFAULT_GITHUB_VIEWS` as the third argument (mechanical). Any fixture ANYWHERE typed as `GithubData` (App.test.tsx, GithubWidget.test.tsx) fails tsc now that `contributions` is required — add `contributions: null` to those literals in THIS task (type-only; widget behavior changes stay in Task 68). The widget still compiles because Task 67 does NOT change the widget — `GithubData.contributions` is a new required field on the service type; the widget's `useConnectorSnapshot<GithubData>` reads old snapshots that LACK it, which is why Task 68's widget treats `data.contributions ?? null` defensively. Full suite + tsc + build: ALL PASS.

- [ ] **Step 8: Commit + push** — `feat(github): views config and a gated fetch — sections you turn off are never requested`.

---

### Task 68: The widget — contribution grid derivation, ContributionGraph, the composed card

**Files:**
- Create: `src/newtab/widgets/github/contributionGrid.ts`, `src/newtab/widgets/github/ContributionGraph.tsx`
- Modify: `src/newtab/widgets/github/GithubWidget.tsx`
- Test: `src/newtab/widgets/github/contributionGrid.test.ts` (new), `src/newtab/widgets/github/GithubWidget.test.tsx` (extend), `src/newtab/App.test.tsx` (fixtures gain `contributions`, mechanical)

**Interfaces:**
- Consumes: `Contributions`, `ContributionDay`, `resolveGithubViews`, `GithubViews`, `fetchGithub(token, prev, views)` from Task 67.
- Produces: `contributionGrid.ts` exports `interface GridCell { count: number; level: 0|1|2|3|4; date: string }`, `interface MonthTick { col: number; text: string }`, `function buildContributionGrid(days: ContributionDay[]): { cells: (GridCell | null)[]; columns: number; monthTicks: MonthTick[]; streak: number }`. `ContributionGraph.tsx` default-exports `ContributionGraph({ contributions }: { contributions: Contributions })` rendering the heatmap + month ticks + stat line.

- [ ] **Step 1: Failing grid tests.** Port the board's derivations as a PURE module (the board's `seed.ts` grid logic minus the PRNG — reference `.claude\worktrees\agent-a27a4111c985e955a\board\seed.ts` lines 33-109). Test cases with hand-built day arrays:
  - levels are the board's absolute bands: 0→0, 1-2→1, 3-4→2, 5-7→3, 8+→4 (pin as constants; the render used these — a 1-commit day must NOT read max-bright);
  - column-major layout: front-pad `nulls` = first day's weekday (Sunday-first), tail-pad to whole 7-cell columns, `columns = cells.length / 7`;
  - month ticks: one per column where the column's first real day's month differs from the last labelled month (text = 'Jan'…'Dec');
  - streak: consecutive `count > 0` run ending at the LAST day, except a zero on the last day alone doesn't break it (no contribution *yet today* ≠ a broken streak — start from the day before); a zero on both of the last two days → streak 0;
  - empty input → `{ cells: [], columns: 0, monthTicks: [], streak: 0 }`.
  Run: FAIL.

- [ ] **Step 2: Implement `contributionGrid.ts`**, green. Pure, no React, no Date.now (everything derives from the passed days).

- [ ] **Step 3: ContributionGraph component.** Adapt the board's `Heatmap` + `StatLine` (`board/ui.tsx`) with A's geometry — cell 13, gap 3 (the picked A-face treatment; 17 columns × 13px + 16 × 3px = 269px inside the card's 296px content box). Accent levels via the LEVEL_BG ramp over `rgba(245,245,244,0.05)` empty cells, `rounded-[3px]`, inset hairline on filled cells, `role="img"` with an aria-label naming the day count, hover `title` per cell ("N contributions · yyyy-mm-dd" — contributions, not commits), mono month ticks (`font-mono text-[10px] uppercase tracking-wide text-fg-muted/55`) absolutely positioned at `col * (cell+gap)`. Stat line: `<total bright tabular> contributions · <streak accent tabular> day streak`. Dense tier: `dense:` classes shrink nothing here (the graph is fixed-px; the card's own dense padding applies) — but the WHOLE graph block carries the section wrapper's tier classes from Step 4. One deviation from the board is pre-ruled (Global Constraints): the word "contributions".

- [ ] **Step 4: Failing widget tests, then the composed card.** GithubWidget changes:
  - `connectedGithub` narrowing unchanged; `GithubInner` receives the whole `GithubConfig` (token + views): `const views = resolveGithubViews(github)`; refresh closure becomes `(prev) => fetchGithub(token, prev, views)`.
  - Section order: Commit graph (when `views.commitGraph` AND `data.contributions` non-null/non-empty — old snapshots lack the field: read `data.contributions ?? null` and treat `days.length === 0` as absent), then PR rows (`views.pulls`), then issue rows (`views.issues`), `border-t border-panel-border` separators between rendered sections (the board's composed face). Unread chip renders only when `views.notifications` AND count known-positive (existing rule compounded).
  - Empty state: the friendly "No PRs waiting on you 🎉" renders only when at least one of pulls/issues is ENABLED and both enabled lists are empty AND the graph section isn't rendering (a graph-only card with an empty list day is NOT "empty"). ALL four views off → `GithubInner` returns null (the user asked for nothing; settings copy owns the explanation).
  - The graph section wrapper carries `short:hidden` (measured in Task 70 — at ≤600h the right rail cannot hold the graph plus gitlab/jira; rows survive, the graph yields first, monotonic).
  Tests (seeded-snapshot pattern from `RssWidget.test.tsx`/existing github tests): default views render graph + rows + chip; `views: { commitGraph: true, pulls: false, issues: false, notifications: false }` renders the graph and NO list rows and no chip (Jon's literal ask — the graph-only card); all-off renders nothing; an old snapshot without `contributions` renders rows exactly as today (no crash, no graph); stat line text asserts "contributions" and the streak number; graph wrapper carries `short:hidden`.
  Run new tests: FAIL → implement → PASS.

- [ ] **Step 5: Full suite + tsc + build** (App.test fixtures gain `contributions: null` or a small literal — mechanical). ALL PASS.

- [ ] **Step 6: Commit + push** — `feat(github): the commit graph — jon's pick, composed card renders only enabled sections`.

---

### Task 69: Settings — the "Show on your board" chips

**Files:**
- Create: `src/settings/ToggleChip.tsx`, `src/settings/ToggleChip.test.tsx`
- Modify: `src/settings/sections/TokenConnectForm.tsx`, `src/settings/sections/Connectors.tsx`
- Test: `src/settings/sections/TokenConnectForm.test.tsx`, `src/settings/SettingsPanel.test.tsx` (extend)

**Interfaces:**
- Consumes: `GithubViews`, `resolveGithubViews`, `DEFAULT_GITHUB_VIEWS` (Task 67); the existing `TokenConnectForm` props; `storage.update('connectors', …)`.
- Produces: `ToggleChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void })` — the house toggle chip (board's exact classes); `TokenConnectForm` gains `connectedExtras?: ReactNode` rendered ONLY in the connected state, between the connected-as row and the Disconnect row.

- [ ] **Step 1: Failing ToggleChip tests** — renders a `button` with `aria-pressed` mirroring `on`; on state carries the accent tint classes and the ✓ glyph, off state the `+` glyph; click fires `onClick`; the glyph span is `aria-hidden` (the pressed state is the accessible signal, the glyph is decoration). Run: FAIL.

- [ ] **Step 2: Implement ToggleChip** — the board's `ToggleChip` from `board/GithubCards.tsx` lines 152-170, verbatim classes (`rounded-full border px-2.5 py-1 text-xs`, on: `border-accent/40 bg-[rgba(125,211,252,0.14)] text-fg`, off: `border-control-border bg-control-bg text-fg-muted hover:bg-control-bg-hover hover:text-fg`, focus ring `focus-visible:outline-2 focus-visible:outline-accent`, `motion-reduce:transition-none`). Run: PASS.

- [ ] **Step 3: Failing TokenConnectForm test** — when `connectedAs` is non-null and `connectedExtras` is passed, the extras render between the connected row and Disconnect; when disconnected (form state), extras do NOT render. Run: FAIL → implement the slot (one optional prop, rendered in the connected branch only) → PASS.

- [ ] **Step 4: GithubBody wiring.** Compute `const views = resolveGithubViews(github)`. Pass `connectedExtras` to the existing TokenConnectForm:

```tsx
connectedExtras={
  <div>
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
      Show on your board
    </p>
    <div className="flex flex-wrap gap-1.5">
      {VIEW_CHIPS.map(({ key, label }) => (
        <ToggleChip
          key={key}
          label={label}
          on={views[key]}
          onClick={() =>
            void storage.update('connectors', (prev) => {
              const current = prev.github
              if (!current) return prev
              const resolved = resolveGithubViews(current as GithubConfig)
              return {
                ...prev,
                github: { ...current, views: { ...resolved, [key]: !resolved[key] } },
              }
            })
          }
        />
      ))}
    </div>
    <p className="mt-2 text-xs text-fg-muted">Your card shows only the sections you turn on.</p>
  </div>
}
```

with `const VIEW_CHIPS: Array<{ key: keyof GithubViews; label: string }> = [{ key: 'commitGraph', label: 'Commit graph' }, { key: 'pulls', label: 'Pull requests' }, { key: 'issues', label: 'Issues' }, { key: 'notifications', label: 'Notifications' }]`. The first toggle WRITES the full resolved object (partial views never persist — resolveGithubViews backfills, the write normalizes).

- [ ] **Step 5: Reconnect preservation.** `onConnected` currently replaces the whole github config; it must carry `views` through: read `prev.github`, and if it has a `views` object, spread `views: (prev.github as GithubConfig).views` into the new config. A reconnect must never reset a composed card to all-on. Extend the SettingsPanel (or a focused Connectors) test: seed a connected github with `views: { …, issues: false }`, run the reconnect flow (existing test idiom for TokenConnectForm submit), assert the stored config still carries `issues: false`.

- [ ] **Step 6: Panel test for the chips end-to-end** — render settings with a connected github; assert the four chips with correct `aria-pressed`; click "Issues"; assert storage now holds `views.issues === false` and the chip flipped. Full suite + tsc + build: ALL PASS.

- [ ] **Step 7: Commit + push** — `feat(settings): show-on-your-board chips — the connector card composes the widget`.

---

### Task 70: The harness — fixture, probes, re-measured budgets, captures

**Files:**
- Modify: `scripts/preview.mjs`; `src/newtab/App.tsx` + `src/newtab/index.css` ONLY where re-measured tier allocations demand class changes (documented, with arithmetic).

**Interfaces:**
- Consumes: everything shipped in 67-69; the existing github fixture block (~line 1910), the forced-weather-chip probe, the resize sweep, the height fenceposts.

- [ ] **Step 1: The fixture.** Extend the github FIXTURE with a `contributions` literal: a FIXED 112-entry counts array (generate once with the board's mulberry32 generator — seed `0x0a082026`, the trailing-14-streak + week-gap shaping from `board/seed.ts` — then EMBED THE RESULTING NUMBERS as a literal so total/streak/level assertions never drift with the run date). Dates are computed at seed time as today−111…today (hover titles only — no assertion touches them). Derive and pin in a comment: the exact `total` and `streak: 14` the literal produces. Seed `views` ABSENT in the config (the default path is the shipped path).

- [ ] **Step 2: Widget probes** (extend the github block):
  - the graph renders from cache: 112 non-null cells (`[role="img"] > div` count minus padding — assert exactly 112 filled), month-tick row present with ≥3 ticks, stat line text `"<total> contributions"` + `"14 day streak"` verbatim;
  - accent fidelity: pixel-sample one level-4 cell → within tolerance of `rgb(125, 211, 252)` (the render-is-the-spec check that caught the weather ring);
  - the composed card: graph ABOVE the PR rows, separators present, existing 4-link + unread assertions still green;
  - interaction: cells are NOT links (no pointer-cursor false affordance — computed cursor on a cell must not be `pointer`), rows still are.
- [ ] **Step 3: Settings chips probes** — open the drawer → Connectors: four chips render with `aria-pressed` true/true/true/true (absent views resolve all-on); click "Issues" → the LIVE card's issue rows disappear without reload (storage subscription path) and the chip reads `aria-pressed="false"`; click "Commit graph" off → heatmap gone, rows remain; turn both back on → sections return (cache-carried, instant). Re-assert the drawer's existing focus/scroll probes still pass with the taller card body.
- [ ] **Step 4: Budgets, re-measured (interior-worst-case law).** With all four sections on (the DEFAULT), measure the github card's real height at 1600×900 and at the 601/865/890 fenceposts with the weather chip FORCED to its 3-line worst state. Re-derive the right-rail allocation: the App.tsx github-block comment's arithmetic is REWRITTEN with the new numbers; the graph section's `short:hidden` boundary is confirmed (or corrected — if measurement shows the graph also cannot fit `mid` alongside gitlab+jira, the allocation decision is: the graph yields BEFORE any whole card hides, and whole-card hiding order stays gitlab-before-github, jira-before-gitlab as documented today). Every pinned number a probe asserts is re-derived from the measurement, never nudged to green.
- [ ] **Step 5: The sweep.** Full resize sweep (all seven sizes, forced clock 10:44) with the new worst-case github card: zero pairwise overlaps, no console errors, monotonic visibility per widget across the descent. Height fenceposts re-run. Full preview: ALL PASS 0 FAIL (report exact counts).
- [ ] **Step 6: Captures.** Re-shoot `connectors-github.png` (default all-on composed card) + a `github-graph-only.png` (views: graph only — Jon's literal ask, seeded via storage) + settings drawer with the chip row. Controller (not the implementer) reads all three against the board renders before the task closes.
- [ ] **Step 7: Commit + push** — `test(github): the composed card proves itself — grid fidelity, chip probes, re-measured rails`.

---

### Task 71: Wrap — docs, v1.8.0, full pass

- [ ] **Step 1: Docs.** README: one line under the connectors section — GitHub's card is composable ("choose what it shows — commit graph, PRs, issues, notifications — in Settings → Connectors"). Store-listing STAGED addendum for 1.8.0 (chronological, minimal shape, matching the staged-listing discipline).
- [ ] **Step 2: Version 1.8.0** in `package.json` + `manifest.config.ts` (+ lockfile); `npm run package` → `release/aurora-1.8.0.zip`, guards green. STAGED — check the v1.2.1 CWS verdict first; STOP and report if it landed.
- [ ] **Step 3: Full verify** — suite, tsc, build, build:preview, FULL preview, plus the controller's visual pass: the three Task 70 captures against the board renders.
- [ ] **Step 4: Commit + push** — `feat: v1.8.0 — the card you composed`.

## After Task 71

Fable whole-plan review (base `41006da`, head Task 71; special charge: fetch gating actually prevents disabled-section requests — assert via test seams, not prose; views survive reconnect AND backup round-trip; the graph's quiet degradation on GraphQL-refused tokens; budget arithmetic honesty). ONE fix wave + ONE scoped re-review if needed. Report to Jon with the captures. Atlassian sync (Jira AUR issue for connector views → Done; Confluence page bump). Memory update (aurora-project-status: the views pattern is now the template for gitlab/jira/vercel). Delete this plan's SDD workspace; the board worktree `agent-a27a4111c985e955a` may be removed after Task 68 lands (its reference code will have been superseded by shipped source).

## Out of scope

GitLab/Jira/Vercel view selection (same pattern, NEXT plan — their section lists are product choices Jon hasn't seen yet); a year-length (52-week) graph (16 weeks is the pinned card-width crop; revisit only if Jon asks); imperative snapshot refresh on view-toggle (the ≤5-minute self-heal via ttl is documented and acceptable — toggles render instantly from cache because disabled sections carry prev data); SP3 OAuth; the collapsed weather chip's unit question (open with Jon, separate thread).
