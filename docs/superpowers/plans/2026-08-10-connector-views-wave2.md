# Connector Views Wave 2 (GitLab / Jira / Vercel) + Weather Unit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shipped "Show on your board" view-selection pattern (GitHub, v1.8.0 at `f0e3743`) to GitLab, Jira, and Vercel with the section lists Jon approved on 2026-08-10, plus the unit letter on the collapsed weather chip's big temperature (his direct ask: "adding F or C to the card would be nice").

**Jon's approved section lists (AskUserQuestion, 2026-08-10 — all recommended sets):**
- **GitLab (all four):** Merge requests (today's rows) · **Review asks** (NEW — MRs waiting on his review) · To-dos (today's chip) · **Activity graph** (NEW — GitLab contribution heatmap in the GitHub graph's accent language).
- **Jira (all three):** Assigned issues (today's rows) · Status chips (today's header line) · **Due soon** (NEW — issues due within 7 days).
- **Vercel (both):** Deployments (today's failures-first rows) · **Status summary** (NEW — derived chip line "3 ready · 1 error · 1 building", zero extra network).

**Architecture:** Each connector config gains an optional per-connector `views` object resolved through ONE new shared generic (`resolveViews`) that github's shipped resolver refactors onto. **DEFAULT RULE FOR THIS WAVE (differs from github's all-on, same principle):** absent `views` = exactly today's card — existing sections ON, NEW sections OFF. Github's graph defaulted on because the graph WAS Jon's explicit ask; these new sections are menu expansion he approved as *options*. Default-off keeps every existing card byte-identical on upgrade (the strongest additive guarantee) and avoids a two-graph default the right rail cannot hold. The settings chips advertise the new options. The GitHub tier machinery (sibling+composition-aware reveal, no-husk, inverse-tier empty lines) generalizes; a new cross-card rule is pinned for the two-graph case. `ContributionGraph`/`contributionGrid` hoist to a shared home and serve both forges.

**Tech Stack:** unchanged (React 19, TS strict, Tailwind 4, Vitest, Playwright preview harness). No new deps. No schema-version bump (optional fields inside post-connect configs; `views` is never a secret — same ruling as wave 1).

## Global Constraints

- The DESIGN LANGUAGE IS SETTLED — no option boards this wave. The shipped GitHub artifacts are the spec: `src/settings/ToggleChip.tsx` verbatim for chips; the GithubBody "Show on your board" block's structure and copy ("Show on your board" / "Your card shows only the sections you turn on."); `ContributionGraph`'s exact geometry (cell 13 / gap 3, LEVEL_BG accent ramp, mono month ticks, absolute level bands 0/1-2/3-4/5-7/8+, stat-line treatment) for the GitLab graph. Deviations get pixel-measured in review.
- GitLab's stat line: the calendar counts GitLab **contributions** (pushes + issues + MRs + comments) — the line says "contributions", same content-accuracy ruling as github's.
- House laws in force (all from wave 1, verbatim): quiet degradation (an unavailable endpoint hides its section, no error UI; the undocumented GitLab calendar endpoint especially); per-section fetch independence (Promise.all never rejects; one section never blanks another); disabled sections are NEVER requested and carry prev verbatim; zero-hooks-in-the-gate; TS strict single documented casts; comments state constraints; shrink-never-blink + monotonic visibility; **sweep fixtures at TRUE display maxes for every card — a fixture seeded below max makes the falsifier blind (the wave-1 law)**; **never gate visibility on DATA when display is CSS-tier-gated** (the wave-1 empty-state law — inverse tier classes are the pattern).
- **The no-husk rule GENERALIZES this wave (and retrofits github):** a card renders null when NOTHING inside it would render (no chip with a value, no rows, no graph section that is both enabled and data-bearing, no friendly empty line). A composition whose only visible content is tier-hidden carries the tier on the SECTION (whole-card yield, github's shipped pattern). This closes wave 1's deferred "notifications-only husk".
- **Cross-card graph rule (NEW, pinned):** github's graph is the hero — when BOTH forge graphs are enabled and the cards are stacked, **gitlab's graph yields first** (a strictly lower reveal tier never above github's). All boundaries derived by measurement per the taller:890/grand:1041 precedent (named variants in index.css with derivation comments; numbers live ONLY there). Whole-card hide order (gitlab/jira at dense) unchanged.
- Display caps unchanged: gitlab MAX_MRS=3, jira MAX_ISSUES=3, vercel MAX_DEPLOYMENTS=5, and new rows sections get their own caps pinned in-task (review asks 2, due soon 2). Card surfaces unchanged (w-80 rounded-2xl bg-panel-solid p-3/p-4 dense:p-2 shadow-lg as each card has today).
- Origins unchanged everywhere: gitlab's calendar endpoint is on the already-granted instance origin; jira's second JQL is the same site; vercel adds no request.
- Weather: the collapsed chip's big temp gains the unit letter in the GRID'S OWN two-span idiom (bright `displayTemp` + `text-[0.7em] text-fg-muted align-baseline` `unitLetter`) — the concatenation must equal `displayTempWithUnit` by construction (the units.ts convention comment). No other chip changes.
- Verification per task: `npx tsc --noEmit` + `npx vitest run` + `npm run build` ALL PASS 0 FAIL; harness tasks add `npm run build:preview` + FULL `node scripts/preview.mjs`. Version stays 1.8.0 until Task 78 bumps 1.9.0. Store discipline: v1.2.1 CWS verdict still gates; the 1.9.0 zip is STAGED only.
- Commit trailer on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_013tenUZa8vgXK7LVy8Hgfcv`

## Interfaces consumed (main at `f0e3743`)

```
src/services/connectors/types.ts — GitlabConfig{enabled,token,instanceUrl,username}, JiraConfig{enabled,email,apiToken,site,displayName}, VercelConfig{enabled,token,username}; GithubViews lives here.
src/services/connectors/github.ts — resolveGithubViews/DEFAULT_GITHUB_VIEWS, Contributions/ContributionDay (MOVE to types.ts, re-export), fetchContributionsSection idiom, postJson consumer.
src/services/connectors/gitlab.ts — fetchGitlab(instanceUrl, token, prev), GitlabData{mrs,todos}, apiBase(), parseMrs, per-section helpers, whoamiGitlab, descriptor (origins from instanceUrl).
src/services/connectors/jira.ts — fetchJira(site,email,apiToken,prev), JiraData{issues,counts}, SEARCH_PATH idiom, normalizeJiraSite, parseIssues(site), countByStatus.
src/services/connectors/vercel.ts — fetchVercel(token,prev), VercelData{deployments}, sortDeployments, relAge.
src/newtab/widgets/github/ — contributionGrid.ts + ContributionGraph.tsx (HOIST to src/newtab/widgets/shared/), GithubWidget.tsx (graphNeedsGrand/graphOnly/sectionTier/inverse-tier patterns to generalize + the no-husk retrofit).
src/newtab/widgets/{gitlab,jira,vercel}/ — the three widgets (read in full; caps + narrowing + empty lines above).
src/settings/ToggleChip.tsx, src/settings/sections/Connectors.tsx (GithubBody chips block + VIEW_CHIPS + reconnect preservation = the template; GitlabBody/JiraBody/VercelBody gain the same), TokenConnectForm connectedExtras.
src/newtab/widgets/weather/WeatherWidget.tsx:282-284 — the collapsed big temp span; services/weather/units.ts displayTemp/unitLetter/displayTempWithUnit.
src/newtab/index.css — @custom-variant taller (890) / grand (1041) + derivation-comment convention.
scripts/preview.mjs — github fixture + probes (the template), forced-weather-chip probe, resize sweep, seedFixtures/seedRails, GITHUB_FIXTURE contributions literal.
```

---

### Task 72: The weather chip says its unit

**Files:**
- Modify: `src/newtab/widgets/weather/WeatherWidget.tsx` (the collapsed big-temp span only)
- Test: `src/newtab/widgets/weather/WeatherWidget.test.tsx` (extend), `scripts/preview.mjs` ONLY if an existing probe pins the old chip text (sweep for `displayTemp`-shaped assertions first)

**Interfaces:** consumes `unitLetter(units)` from units.ts (exists). Produces nothing downstream.

- [ ] **Step 1: Failing test** — render the collapsed chip from a seeded snapshot with units 'imperial': the big-temp span's textContent equals `displayTempWithUnit(tempC, 'imperial')` (e.g. "72°F"), with the letter in a child span carrying `text-[0.7em]` + `text-fg-muted`; repeat for 'metric' ("22°C"). Run: FAIL.
- [ ] **Step 2: Implement** — inside the existing `font-display text-[2rem]` span (WeatherWidget.tsx:282-284), the grid's two-span idiom:

```tsx
<span className="font-display text-[2rem] font-light leading-none tabular-nums">
  {displayTemp(snapshot.current.tempC, settings.units)}
  <span className="align-baseline text-[0.7em] text-fg-muted">{unitLetter(settings.units)}</span>
</span>
```

The constraint comment: the two pieces concatenate to exactly `displayTempWithUnit` — one derivation, styled apart (the grid's own rule at line ~376). Run: PASS.
- [ ] **Step 3: Probe sweep** — grep preview.mjs for assertions on the chip's temp text; update any exact-string pins (the forced-worst-case probes assert height/lines, but verify). Full gates: tsc + vitest + build (+ build:preview + full preview if preview.mjs changed). ALL PASS.
- [ ] **Step 4: Commit + push** — `feat(weather): the big number says its unit — jon's ask`.

---

### Task 73: Shared machinery — the views resolver, the graph goes shared, the three view types

**Files:**
- Create: `src/services/connectors/views.ts`, `src/services/connectors/views.test.ts`, `src/newtab/widgets/shared/contributionGrid.ts`, `src/newtab/widgets/shared/ContributionGraph.tsx` (moves — git mv, imports updated)
- Modify: `src/services/connectors/types.ts`, `src/services/connectors/github.ts`, `src/newtab/widgets/github/GithubWidget.tsx` (import paths), test files that import the moved modules
- Test: `src/services/connectors/views.test.ts` (new); existing moved-module tests keep passing at their new paths

**Interfaces:**
- Produces (later tasks rely on these EXACT names):
  - `views.ts`: `export function resolveViews<V extends Record<string, boolean>>(defaults: V, stored: Partial<V> | null | undefined): V` — every key resolved from `defaults` unless `stored` carries a boolean for it (the wave-1 backfill semantics, generic).
  - `types.ts`: `ContributionDay`/`Contributions` MOVE here (github.ts re-exports for existing importers); `interface GitlabViews { mergeRequests: boolean; reviewAsks: boolean; todos: boolean; activityGraph: boolean }`; `interface JiraViews { assigned: boolean; statusChips: boolean; dueSoon: boolean }`; `interface VercelViews { deployments: boolean; statusSummary: boolean }`; `GitlabConfig`/`JiraConfig`/`VercelConfig` each gain `views?: <TheirViews>` with the WAVE-2 DEFAULT comment (absent = today's card: existing sections on, NEW sections off — the additive rule this wave).
  - `github.ts`: `resolveGithubViews` reimplemented as `resolveViews(DEFAULT_GITHUB_VIEWS, config?.views)` — public signature and behavior byte-identical (its existing tests are the proof; they must pass UNCHANGED).
  - Defaults (exported per service in Task 74, named here for consistency): `DEFAULT_GITLAB_VIEWS = { mergeRequests: true, reviewAsks: false, todos: true, activityGraph: false }`; `DEFAULT_JIRA_VIEWS = { assigned: true, statusChips: true, dueSoon: false }`; `DEFAULT_VERCEL_VIEWS = { deployments: true, statusSummary: false }`.
- [ ] **Step 1: Failing resolveViews tests** — undefined/null/{} → defaults verbatim; partial stored overrides only its keys; non-boolean stored values (hand-edited backup: `{ todos: "yes" }`) fall back to the default for that key. Run: FAIL → implement → PASS.
- [ ] **Step 2: The github refactor** — swap resolveGithubViews's body onto the generic. Existing github.test.ts resolver cases pass UNCHANGED (they are the regression net; do not edit them).
- [ ] **Step 3: The moves** — `git mv` contributionGrid.ts + ContributionGraph.tsx to `src/newtab/widgets/shared/`; update every import (grep `widgets/github/contributionGrid|widgets/github/ContributionGraph`); move their test files alongside. `Contributions`/`ContributionDay` to types.ts with re-exports from github.ts. No behavior changes anywhere — the full suite green is the proof.
- [ ] **Step 4: Full gates. Commit + push** — `refactor(connectors): one resolver, one graph — the views machinery goes shared`.

---

### Task 74: Service layer — gitlab grows two sections, jira splits in two, vercel gates

**Files:**
- Modify: `src/services/connectors/gitlab.ts`, `src/services/connectors/jira.ts`, `src/services/connectors/vercel.ts`
- Test: their three `.test.ts` files (extend)

**Interfaces:**
- Consumes: `resolveViews`, `Contributions`, `postJson`-era http helpers (`getJson` suffices — all three connectors are GET-only), Task 73's view types.
- Produces:
  - `gitlab.ts`: `DEFAULT_GITLAB_VIEWS`; `GitlabData` gains `reviewMrs: GitlabMr[]` and `contributions: Contributions | null`; `fetchGitlab(instanceUrl, token, username, views, prev, fetchFn?)` (NEW username + views params — username comes from config, needed by both new endpoints); paths `const REVIEW_PATH = (username) => '/api/v4/merge_requests?scope=all&state=opened&reviewer_username=' + encodeURIComponent(username) + '&per_page=10'` and `const CALENDAR_PATH = (username) => '/users/' + encodeURIComponent(username) + '/calendar.json'`.
  - `jira.ts`: `DEFAULT_JIRA_VIEWS`; `JiraIssue` gains `due?: string` (yyyy-mm-dd, only on due-soon rows); `JiraData` gains `dueSoon: JiraIssue[]`; `fetchJira(site, email, apiToken, views, prev, fetchFn?)` (NEW views param); `const DUE_PATH` = `/rest/api/3/search/jql?jql=` + encodeURIComponent(`assignee=currentUser() AND resolution=Unresolved AND due <= 7d ORDER BY due ASC`) + `&fields=summary,status,duedate&maxResults=10`.
  - `vercel.ts`: `DEFAULT_VERCEL_VIEWS`; `fetchVercel(token, views, prev, fetchFn?)` — the ONE endpoint is fetched when EITHER section is on (statusSummary derives from deployments — fetch gating keys on DATA needs, not sections 1:1; a comment states this); both off → prev carried, no request.
- [ ] **Step 1: GitLab failing tests** — (a) review-asks section parses with parseMrs (same shape), isolated failure carries prev; (b) the calendar section: a 200 `{"2026-08-01": 3, "2026-08-05": 1}` map shapes into `Contributions` over a 112-day window ending today — EVERY day present (zeros filled for absent dates), ascending, `total` = sum; non-OK / network / parse-throw / non-object body → prev?.contributions ?? null (the undocumented-endpoint degradation is THE case — an instance without calendar.json must cost nothing visible); (c) gating: each of the four views off → its endpoint NEVER requested (assert the injected fetchFn's seen URLs) and prev carried verbatim; (d) existing mrs/todos tests pass with `DEFAULT_GITLAB_VIEWS`-plus-overrides threaded through. NOTE the calendar URL is on the INSTANCE WEB ROOT (no /api/v4) — same origin, the descriptor needs no change (assert `origins()` output unchanged).
- [ ] **Step 2: Implement gitlab** — two new section helpers copying the per-section isolation idiom; `Promise.all` over four gated slots; contributions windowing mirrors github's (local `isoDay`, zero-fill; the wave-1 streak/level derivations live in contributionGrid — the SERVICE ships days+total only). Run: PASS.
- [ ] **Step 3: Jira failing tests** — dueSoon parses `duedate` into `due` (absent/malformed → row kept without `due`); the TWO searches run independently (assigned failure keeps prev.issues+counts while dueSoon lands, and vice versa — the single-endpoint full-replace becomes two isolated sections); gating per views (off → no request, prev carried); counts still derive from the ASSIGNED section only. Implement, PASS.
- [ ] **Step 4: Vercel failing tests** — both-off → no request + prev; either-on → one request; data shape unchanged. Implement, PASS.
- [ ] **Step 5: Call-site sweep** — the three widgets pass their `DEFAULT_*_VIEWS` as a stopgap (one line each; Task 75 replaces with resolved views); GithubWidget untouched. Full gates ALL PASS.
- [ ] **Step 6: Commit + push** — `feat(connectors): gated fetches for gitlab, jira, vercel — sections you turn off are never requested`.

---

### Task 75: The widgets — three composed cards, one no-husk law for all four

**Files:**
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.tsx`, `src/newtab/widgets/jira/JiraWidget.tsx`, `src/newtab/widgets/vercel/VercelWidget.tsx`, `src/newtab/widgets/github/GithubWidget.tsx` (no-husk retrofit only)
- Test: the four widget test files (extend)

**Interfaces:**
- Consumes: Task 73's shared `ContributionGraph`/`resolveViews`, Task 74's data fields + fetch signatures, the shipped GithubWidget patterns (sectionTier / inverse-tier empty line / graphNeedsGrand).
- Produces (Task 76-77 rely on): section DOM markers — the gitlab graph section wrapper reuses ContributionGraph's `role="img"`; new rows sections are plain `<ul>`s in fixed order; caps `MAX_REVIEW_ASKS = 2`, `MAX_DUE_SOON = 2` (pinned — glance panel discipline; the header chips/counts already say "there's more").
- [ ] **Step 1: GitLab composed card (failing tests first)** — section order: Activity graph (when enabled AND data-bearing) → Merge requests → Review asks (rows identical ItemRow shape; a quiet "REVIEW ASKS" eyebrow separates it from assigned MRs when both render — `text-[11px] uppercase tracking-[0.08em] text-fg-muted`, the house eyebrow) → to-dos stays the header chip (gated by views.todos). Stat line under the graph says "contributions". Graph TIER (measured properly in Task 77; classes land now with the wave-1 sole-vs-stacked logic): gitlab's graph reveals `taller:block` when gitlab is the SOLE forge card, `grand:block` when stacked WITHOUT github's graph enabled, and `hidden` entirely (a `data-yield="github"` marker attribute, no reveal tier) when github's graph is ALSO enabled and cards are stacked — the cross-card rule: github's graph wins; Task 77 measures whether a very-tall reveal is honest and updates the class + derivation if so. The widget reads github's graph-enabled state from the same `connectors` it already subscribes to (`resolveGithubViews(connectors?.github as GithubConfig)?.commitGraph` — narrow defensively, one documented cast, enabled-shaped github only).
  Tests: composition per views; strictly-graph-only gitlab follows its lone section's tier whole-card; graph+no-data renders without the graph; class-pins for sole/stacked/stacked-with-github-graph.
- [ ] **Step 2: Jira composed card** — order: Assigned issues → Due soon (rows with the due date as the quiet prefix line: `{due} · {key}` when due present, else key — title attr carries the summary; a "DUE SOON" eyebrow when both rows sections render); status chips stay the header line (views.statusChips). Empty line "Nothing assigned to you." gated on (assigned || dueSoon) enabled + both empty (inverse-tier machinery NOT needed — jira has no tier-gated section). Tests per composition.
- [ ] **Step 3: Vercel composed card** — order: Status summary (a one-line chips row: counts by state from the UNSLICED deployments array, lowercased labels "3 ready · 1 error · 1 building", ERROR count in the existing danger tone when >0, others muted; states with 0 omitted; renders only when deployments non-empty) → Deployments rows. Both-off → null (service already skips the fetch). Tests.
- [ ] **Step 4: The no-husk law, all four cards (failing tests first)** — one shared rule, implemented per-card: render null when nothing inside would render — github retrofits the notifications-only-with-0/null case (closes the wave-1 deferred minor: views {notifications only} + count 0/null → null, not a bare header); gitlab todos-only with 0 to-dos → null; jira statusChips-only with empty counts → null; vercel statusSummary-only with no deployments → null. Each with a falsifiable test (container.firstChild === null) and the positive twin (a value present → card renders).
- [ ] **Step 5: Full gates (App.test fixtures gain the new data fields mechanically). Commit + push** — `feat(widgets): three cards you compose — and no card ever renders as a bare heading`.

---

### Task 76: Settings — three more "Show on your board" rows

**Files:**
- Modify: `src/settings/sections/Connectors.tsx` (GitlabBody, JiraBody, VercelBody)
- Test: `src/settings/SettingsPanel.test.tsx` (extend)

**Interfaces:** consumes ToggleChip, connectedExtras, the GithubBody template (VIEW_CHIPS array + full-resolved-object writes + `if (!current) return prev` guard + reconnect preservation).
- [ ] **Step 1: Failing tests** — per connector: chips render with aria-pressed mirroring the resolved default (gitlab true/false/true/false; jira true/true/false; vercel true/false); clicking a NEW section's chip writes the FULL resolved object with that key true; reconnect preserves stored views (seed `views` with a non-default, drive the real connect submit, assert preserved) — gitlab's onConnected must also keep working when username CHANGES (views survive; the fetch uses the new username).
- [ ] **Step 2: Implement** — three `connectedExtras` blocks, each a VIEW_CHIPS map in the connector's own key order and labels: gitlab `[mergeRequests 'Merge requests', reviewAsks 'Review asks', todos 'To-dos', activityGraph 'Activity graph']`; jira `[assigned 'Assigned issues', statusChips 'Status chips', dueSoon 'Due soon']`; vercel `[deployments 'Deployments', statusSummary 'Status summary']`. Copy verbatim from the house strings. Run: PASS.
- [ ] **Step 3: Full gates. Commit + push** — `feat(settings): show-on-your-board everywhere — every connector card composes its widget`.

---

### Task 77: The harness — budgets for a second graph, honest sweeps, chips probes ×3

**Files:**
- Modify: `scripts/preview.mjs`; `src/newtab/index.css` + widget tier classes ONLY where measurement demands (derivation comments); `src/newtab/App.tsx` comment arithmetic
- (Layout defects found = fixed in-task with measurement, documented.)

- [ ] **Step 1: Fixtures at TRUE display maxes (the wave-1 law).** GITLAB_FIXTURE gains: reviewMrs (2 rows, distinct titles), a contributions literal (reuse the frozen generator ONCE, embed the numbers, pin total/streak in a comment), views ABSENT in config (the default path — which means graph/reviewAsks OFF by default; the sweep ALSO needs an enabled-composition fixture, see Step 3). JIRA_FIXTURE gains dueSoon rows (2, with due dates). VERCEL_FIXTURE unchanged shape (summary derives). The combined-defaults gate and sweep seed the DEFAULT views path (today's cards — byte-identical layout is the assertion) — this proves the additive guarantee.
- [ ] **Step 2: Default-path regression probes** — at 1600×900 with all connectors on and views absent: every card's rect matches its pre-wave geometry (the upgrade changes NOTHING visually); chips in settings show the wave's defaults (new sections unpressed).
- [ ] **Step 3: Enabled-composition fenceposts (measured).** Dedicated blocks per the wave-1 pattern, each with the forced 3-line weather chip: (a) gitlab SOLE forge card, graph+all sections on — measure the card, derive its reveal boundary, assert monotonic reveal + 16px floors (mirror of github's block); (b) gitlab stacked with github+jira, gitlab graph on, github graph OFF — measure; if the grand:1041 stack fits (gitlab graph ~176 vs github's, same arithmetic shape), pin it; else derive the honest boundary, name the variant, document; (c) BOTH graphs enabled, stacked — assert gitlab's graph does NOT render at any swept/fencepost height (the cross-card rule) while github's follows its own tiers; if measurement shows an honest very-tall boundary exists (~1217+ by the wave-1 arithmetic), pinning it is the implementer's call — EITHER a named variant with derivation OR the never-renders rule, documented in App.tsx and the gitlab widget comment; (d) jira with dueSoon on — taller card, re-derive the dense hide edge if its bottom moves (the 865 fencepost); (e) vercel with summary on — left-column budget check only (vercel is left rail; its column's existing fenceposts re-run green or get re-derived).
- [ ] **Step 4: Widget probes** — gitlab graph from cache (112 filled cells, stat text verbatim, accent pixel-sample — the render-fidelity class); review-asks rows are real links below an eyebrow; jira due rows show the due prefix; vercel summary line matches the seeded states with error-tone assertion; cursor discipline on all new content (cells not pointer, rows pointer).
- [ ] **Step 5: Chips probes ×3 through the real drawer** — per connector: default aria-pressed pattern; toggle a NEW section on → the live card gains it without reload; toggle an existing section off → it leaves; restore. Drawer focus/scroll probes still green with three taller card bodies.
- [ ] **Step 6: The sweep** — full resize sweep + all fenceposts + monotonicity across the descent for every new section. FULL preview ALL PASS 0 FAIL (report exact counts). Captures: `connectors-gitlab-composed.png` (graph+all, sole), `connectors-jira-composed.png` (all three sections), `connectors-vercel-composed.png` (both), `weather-chip-unit.png` (the collapsed chip with the letter), plus a re-shot settings capture showing all four chip rows. Controller views all five against the house language before the task closes.
- [ ] **Step 7: Commit + push** — `test(connectors): every composition proves itself — second-graph budgets, honest sweeps, chips probes`.

---

### Task 78: Wrap — docs, v1.9.0, full pass

- [ ] **Step 1: Docs** — README: the composable-card line generalizes ("Every connector card is composable — choose what each shows in Settings → Connectors"); store-listing STAGED v1.9.0 addendum (chronological minimal shape; note the gitlab calendar endpoint is the instance's own origin, no new hosts).
- [ ] **Step 2: Version 1.9.0** in package.json + src/manifest.ts (+ lockfile); `npm run package` → release/aurora-1.9.0.zip, guards green. STAGED — v1.2.1 verdict check first (repo evidence only), STOP if landed.
- [ ] **Step 3: Full verify** — suite, tsc, build, build:preview, FULL preview; controller visual pass on the five Task 77 captures.
- [ ] **Step 4: Commit + push** — `feat: v1.9.0 — every card you compose, and the weather says F`.

## After Task 78

Fable whole-plan review (base `f0e3743`, head Task 78; special charges: the default path is byte-identical for existing users — verify in probes not prose; gating seams per connector; the calendar endpoint's degradation; cross-card graph rule honesty; the no-husk retrofit didn't regress github's chip-card state; jira's two-section independence). ONE fix wave + ONE scoped re-review. Report to Jon with captures. Atlassian (new AUR story → Done; Confluence bump). Memory sync. Delete the SDD workspace.

## Out of scope

Sole graph-only lower reveal tier for github (wave-1 deferred candidate — untouched); RSS/crypto/ICS view selection (no sections to choose yet); SP3 OAuth; imperative refresh on view-toggle (ttl self-heal stands); GitLab calendar via the documented Events API (calendar.json chosen deliberately; revisit only if an instance breaks).
