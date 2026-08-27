# W3-P2 Adaptive Stage Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute this plan task by task. Use superpowers:test-driven-development for every behavior change, superpowers:requesting-code-review after each task, and superpowers:verification-before-completion before any completion claim.

**Goal:** Replace Aurora 2's fixed legacy new-tab positioning with the Adaptive Stage's deterministic profile, density, registry, allocation, and semantic-grid foundation while preserving every widget, saved layout intent, current Arrange usability, and Aurora V1.

**Architecture:** Keep profile selection and allocation pure and React-free. A source-owned widget registry supplies metadata and renderers; a planner produces exactly one board-or-dock allocation per active widget; `BoardItem` supplies containment and failure isolation; `App` renders semantic Day/Now/Pulse/Dock zones. Persist only the user's density preference and per-profile overrides. Retain the legacy layout and `PositionedBlock` as a temporary Arrange bridge until W3-P3/W3-P4.

**Tech Stack:** React, TypeScript, Vitest, CSS Grid/container queries, Chrome extension storage, Vite, Playwright-backed `scripts/preview.mjs` harness.

**Authoritative inputs:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` (Adaptive Stage profiles, density, placement, registry, compatibility, verification, and non-goals), `docs/superpowers/aurora-2/ROADMAP.md` W3-P2, `docs/superpowers/aurora-2/STATUS.md`, `docs/superpowers/aurora-2/DECISIONS.md`, and the verified W3-P1 checkpoint `bc8bc45b9c0b042955ed9e27290f56d1e6d18d82`.

## Global constraints and starting proof

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`.
- Before implementation, prove HEAD and upstream both equal `bc8bc45b9c0b042955ed9e27290f56d1e6d18d82`, divergence is `0 0`, and the worktree is clean apart from this reviewed plan commit.
- Prove protected Aurora V1 at `D:\DEV\Chrome plugin` remains on `main`, matches its upstream, and is clean. Never edit, clean, reset, commit, or push there.
- Baseline evidence at the checkpoint is `455 PASS / 0 FAIL / 3 SKIP`; focused Vitest evidence is 323 passing tests across `v2`, `PositionedBlock`, `App`, `ArrangeController`, and `SettingsPanel`.
- Do not upload, submit, publish, or change Chrome Web Store state. W6-P5 remains an explicit approval gate.
- Every implementation task follows RED -> smallest GREEN -> focused regression -> independent review -> separate fixer if findings exist -> rereview -> task commit.
- Review agents inspect diffs and evidence only. The controller does not silently fix review findings; a separate fixer owns confirmed fixes. Use the repository severity vocabulary `Critical`, `Important`, and `Minor` throughout; do not translate findings to P0/P1/P2.
- Preserve unrelated user changes. Stop if provenance, protected-original proof, or ownership is ambiguous.

## Frozen behavior contract

### Profile selection and CSS precedence

`selectStageProfile({ width, height })` uses CSS viewport pixels only; device-pixel ratio, native display resolution, and browser zoom are not inputs. Evaluate in this exact order:

1. `compact` when `width < 900 || height < 700`.
2. Otherwise `ultrawide` when `width >= 1600 && width / height >= 2.1`.
3. Otherwise `display` when `width >= 2200 && height >= 1100`.
4. Otherwise `standard`.

Required fenceposts: 899/900 width; 699/700 height; 1599/1600 ultrawide width; aspect immediately below/equal to 2.1; 2199/2200 display width; 1099/1100 display height. Ultrawide wins when both ultrawide and display predicates match. The same precedence must appear in pure tests and ordered CSS media rules; JS owns the authoritative `data-stage-profile`, while CSS queries are a no-script/first-paint mirror and may not disagree at the fenceposts.

### Density preference, resolved density, and grid constants

Persist `LayoutDensityPreference = 'auto' | 'compact' | 'balanced' | 'spacious'`. `auto` is the fresh-install and migration default; `balanced` is the default manual choice shown when the user leaves Auto Fit. Resolve Auto Fit by trying `spacious`, then `balanced`, then `compact`. A candidate is eligible only when both (a) its exact active profile/sublayout pixel geometry—outer tracks, every finite zone track, gaps, insets, and Dock—fits the actual CSS viewport width and height without page/stage scrolling or clipping, and (b) its allocation has zero automatic `eligible-dock` or `overflow-dock` dispositions. Explicit pinned/priority/override Dock dispositions and pinned implicit-row overflow do not count toward condition (b), but pinned implicit rows fail condition (a) when they exceed the viewport. Choose the first candidate satisfying both; if none does, resolve `compact` and return a typed `density-viewport-overflow` diagnostic rather than pretending it fit.

Do not scale the root, use transforms, or shrink typography globally. Apply these exact density tokens:

| Resolved density | gap | zone inset | minimum track | target control | maximum automatic variant |
| --- | ---: | ---: | ---: | ---: | --- |
| compact | 12px | 12px | 64px | 36px | compact |
| balanced | 16px | 16px | 80px | 36px | standard |
| spacious | 24px | 24px | 96px | 44px | expanded |

Finite capacity is defined by these `(columns x rows)` values. Compact has two explicit sublayouts because stacking all seven finite rows at 800x600 is impossible: `compact-wide` when CSS viewport width is at least 600px, and `compact-narrow` below 600px. There is no separate or ambiguous narrow-tall single-column branch. Dock is a separate one-row, horizontally scrollable, column-flow grid with no finite item count and is excluded from board-capacity calculations. A Dock item nevertheless has finite geometry: force `rowSpan = 1` and clamp `colSpan` to 1 for compact, 2 for standard, or 3 for expanded. Dock uses `grid-auto-columns: minmax(var(--stage-track-min), max-content)`; its finite span is required for deterministic geometry and bounded focus scrolling.

| Profile | Density | Day | Now | Pulse |
| --- | --- | --- | --- | --- |
| compact-wide (width >= 600) | compact | 2x2 | 2x3 | 2x2 |
| compact-wide (width >= 600) | balanced | 2x1 | 2x3 | 2x1 |
| compact-wide (width >= 600) | spacious | 1x1 | 2x2 | 1x1 |
| compact-narrow (width < 600) | compact | 1x2 | 2x2 | 1x2 |
| compact-narrow (width < 600) | balanced | 1x1 | 2x2 | 1x1 |
| compact-narrow (width < 600) | spacious | 1x1 | 2x1 | 1x1 |
| standard | compact | 3x6 | 4x5 | 3x6 |
| standard | balanced | 2x5 | 4x4 | 2x5 |
| standard | spacious | 2x4 | 4x4 | 2x4 |
| display | compact | 4x7 | 6x6 | 4x7 |
| display | balanced | 4x6 | 6x5 | 4x6 |
| display | spacious | 3x5 | 6x5 | 3x5 |
| ultrawide | compact | 5x6 | 6x6 | 5x6 |
| ultrawide | balanced | 4x6 | 6x5 | 4x6 |
| ultrawide | spacious | 4x5 | 6x5 | 4x5 |

### Effective placement, variants, spans, and invariants

- Registry identity fields (`id`, safe display `label`, renderer key, enable selector, eligible-zone order, allowed variants, footprints, source order, and protected-clock status) are source-owned and cannot be overridden by storage. The registry does not invent a source lock.
- For the active profile, compute one effective placement per active entry. Field precedence for `zone`, `order`, `colSpan`, `rowSpan`, `variant`, and `priority` is the stored active-profile placement when present, otherwise that profile's source default. Preserve a stored placement's optional `locked` value unchanged (`true`, `false`, or absent), but W3-P2 does not interpret it in allocation or Arrange; W3-P3 owns lock behavior. Tests prove both preservation and non-effect so current Arrange can still move every item. Ignore inactive-profile overrides at runtime.
- Stored overrides must already pass W3-P1 structural validation. A pinned override preserves every schema-valid variant even when it is outside today's registry `allowedVariants` (including W3-P1's standard variant on a source compact-only entry), plus its clamped effective spans and valid zone. For an automatic override, constrain a disallowed variant to the nearest allowed variant at or below it (or the smallest allowed variant if none is below), emitting a diagnostic. Preserve a valid zone outside current eligibility only when effective priority is pinned; otherwise emit a diagnostic and begin with the registry's first eligible zone. A source `dock` entry remains Dock-only.
- Eligible zones are ordered arrays, not sets. For an automatic override whose zone is eligible, try that configured zone first and then the registry's remaining eligible zones in declared order without duplication. Without an override, use the declared order exactly. Never derive order from object keys.
- Variant rank is `compact < standard < expanded`. The density maximum caps automatic variant selection; pinned items retain their constrained stored variant.
- A registry entry lists its allowed variants and an exact footprint for each. An automatic source default uses its registry footprint. An automatic stored override gets one first attempt using its effective constrained variant and effective clamped spans; later downgrade attempts use the smaller registry variant footprints. Try those candidates across the configured eligible-zone order, then Dock.
- Stored board spans must be finite integers. Clamp each to at least 1 and at most the active zone's columns/rows before collision checks. Dock uses the finite 1/2/3-column contract above. Registry footprints, not historical pixel dimensions, drive automatic placement.
- Allocate with explicit phases: (1) derive and stably sort all active effective placements; (2) place every pinned Day/Now/Pulse item in zone order, then numeric effective order, then binary `id`, using row-major collision resolution and implicit rows; (3) terminally classify pinned items whose effective zone is Dock as `pinned-dock`; (4) protect Clock in Now; (5) place automatic items using only finite board capacity and the algorithm below; (6) terminally classify effective `priority: 'dock'` items as `priority-dock`; (7) sort all terminal Dock allocations together by numeric effective order then binary `id`—reason never changes user-configured order.
- The canonical source-default Clock rectangle is row 1, horizontally centered in Now: `rowStart = 1`, `colStart = floor((nowColumns - clockColSpan) / 2) + 1`, with the active profile's source-default Clock footprint. If active Clock is pinned in Now, its actual occupied rectangle is the protection and no ghost exists. If active Clock is pinned elsewhere, try the canonical rectangle after all pinned placements; if pinned cells cover it, relocate the same-size reservation to the first free in-capacity Now rectangle in row-major order; if none fits, emit `clock-reservation-unavailable` and do not evict a pinned item or create implicit rows for a ghost. A synthetic active-entry set with no Clock creates no reservation. Adversarial tests cover an earlier-order automatic item, a later pinned item, Clock elsewhere, Clock absent, canonical-clock cells occupied, relocated reservation, and no-fit diagnostics.
- Every Dock allocation carries exactly one terminal `dockReason`: `pinned-dock`, `priority-dock`, `override-dock`, `eligible-dock`, or `overflow-dock`. A pinned Dock placement preserves its schema-valid effective variant, then applies Dock's 1/2/3 column clamp. A priority-Dock source uses its source variant. An automatic stored override whose first preferred zone is Dock terminates once as `override-dock`, preserves its density-capped allowed effective variant, and does not try later zones. Other automatic entries try all allowed variants across finite eligible zones in configured order with Dock removed from that loop; if none fits and Dock is eligible, allocate once as `eligible-dock`, otherwise once as `overflow-dock`. Both use the smallest allowed variant (compact when available) and its finite Dock span. Never retry or duplicate Dock in the zone/variant loops.
- Emit typed reconciliation diagnostics only for `eligible-dock` and `overflow-dock`, including ID, attempted finite zones/variants, and final variant/span; intended `pinned-dock`, `priority-dock`, and `override-dock` are dispositions, not errors. Auto Fit counts only `eligible-dock` and `overflow-dock` as automatic items newly docked. It excludes pinned, priority, and explicit override Dock dispositions; therefore user intent cannot force Auto Fit down to Compact. Unit tests assert all five reasons, diagnostics, final order, variants/spans, exactly-once terminal behavior, and Auto Fit classification.
- Produce exactly one allocation for each active registry ID: never duplicate, silently omit, or render an active ID outside the returned board-or-dock model.
- `priority: 'dock'` always allocates to Dock. Automatic items that do not fit their eligible finite zones downgrade variant, try eligible zones in listed order, then allocate to Dock.
- Pinned items stay in their requested valid zone and constrained variant. Resolve collisions in the pinned phase. If finite rows are exhausted, append implicit rows in that zone; pinned items never spill into Dock.
- Preserve a valid stored/migrated pinned zone even if it is outside the current registry eligibility list. Eligibility constrains defaults and future editor choices; runtime reconciliation must not destroy legacy intent.
- Insertion invariance: adding an item after an existing item's `(zone, order, id)` may not move earlier non-colliding allocations. Object/map enumeration order must never affect output.
- The planner returns allocations plus typed reconciliation diagnostics; it does not mutate settings or write storage.

### Source-owned registry: all 26 defaults

The registry must contain exactly the `BLOCK_IDS` set, once each. `C/S/E` are exact compact/standard/expanded footprints; `--` means the variant is not allowed. Profile desired variants are: Compact profile = compact; Standard = the `Default` column; Display and Ultrawide = expanded when allowed, otherwise standard. Density may cap that choice.

| ID | Safe label | Default zone/order | Priority | Eligible zones | Default | C | S | E |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| weather | Weather | day/0 | automatic | day | standard | 1x1 | 2x2 | 3x2 |
| ics | Calendar | day/1 | automatic | day,dock | standard | 1x1 | 2x2 | 3x2 |
| monthCal | Month | day/2 | automatic | day,dock | standard | 1x1 | 2x2 | 3x2 |
| sun | Sun times | day/3 | automatic | day,dock | compact | 1x1 | 2x1 | -- |
| moon | Moon phase | day/4 | automatic | day,dock | compact | 1x1 | 2x1 | -- |
| quote | Quote | day/5 | automatic | day,dock | compact | 1x1 | 2x1 | -- |
| clock | Clock | now/0 | pinned | now | expanded | 2x2 | 2x2 | 3x2 |
| greeting | Greeting | now/1 | automatic | now | standard | 2x1 | 2x1 | 2x2 |
| worldClocks | World clocks | now/2 | automatic | now,day | standard | 1x1 | 2x1 | 2x2 |
| countdown | Countdown | now/3 | automatic | now,day | compact | 1x1 | 2x1 | -- |
| search | Search | now/4 | automatic | now | standard | 2x1 | 2x1 | -- |
| focus | Focus | now/5 | automatic | now | standard | 2x1 | 2x1 | -- |
| links | Links | now/6 | automatic | now,dock | standard | 1x1 | 2x1 | -- |
| habits | Habits | now/7 | automatic | now,day,dock | standard | 1x1 | 2x2 | 3x2 |
| bookmarks | Bookmarks | now/8 | automatic | now,dock | compact | 1x1 | 2x1 | -- |
| status | Service status | pulse/0 | automatic | pulse,dock | compact | 1x1 | 2x1 | -- |
| github | GitHub | pulse/1 | automatic | pulse,dock | standard | 1x1 | 2x2 | 3x2 |
| gitlab | GitLab | pulse/2 | automatic | pulse,dock | standard | 1x1 | 2x2 | 3x2 |
| jira | Jira | pulse/3 | automatic | pulse,dock | standard | 1x1 | 2x2 | 3x2 |
| vercel | Deploys | pulse/4 | automatic | pulse,dock | standard | 1x1 | 2x2 | 3x2 |
| homeassistant | Home Assistant | pulse/5 | automatic | pulse,dock | standard | 1x1 | 2x2 | 3x2 |
| rss | Headlines | pulse/6 | automatic | pulse,dock | standard | 1x1 | 2x2 | 3x2 |
| crypto | Crypto | pulse/7 | automatic | pulse,dock | compact | 1x1 | 2x1 | -- |
| timer | Timer | dock/0 | dock | dock | compact | 1x1 | -- | -- |
| tasks | Tasks | dock/1 | dock | dock | compact | 1x1 | -- | -- |
| notes | Notes | dock/2 | dock | dock | compact | 1x1 | -- | -- |

Registry availability is pure over the already-loaded Settings and connector configuration snapshot. Exact mapping: `clock`, `greeting`, and `focus` are always active; `search -> settings.widgets.search`; `weather -> weather`; `links -> links`; `tasks -> todo`; `timer -> timer`; `quote -> quote`; `bookmarks -> bookmarks`; `notes -> notes`; `worldClocks -> clocks`; `countdown -> countdown`; `habits -> habits`; `monthCal -> monthCal`; `sun -> sun`; `moon -> moon`. The nine connector IDs `rss`, `github`, `gitlab`, `jira`, `vercel`, `crypto`, `ics`, `status`, and `homeassistant` are active exactly when `connectors[id]?.enabled === true`, even when setup or data is incomplete. Do not gate registry activity on `connectorSnapshots`, credentials, feeds, coins, services, entities, actions, fetch state, or child-renderer nullability. Changes to settings, connector configurations, layout, density, or viewport must recompute active/effective entries and rerun the pure planner from scratch in the same React update; stale allocations must not remain. Keep React-free metadata in `src/newtab/widgetRegistry.ts` and an exhaustive renderer resolver in `src/newtab/widgetRenderers.tsx`; `ArrangeController` imports labels from the metadata and deletes its `BLOCK_LABELS` duplication. Do not import or rename `src/services/connectors/registry.ts`.

### Persistence and compatibility boundary

- Bump storage schema from 10 to 11. Add one honest persisted field under Settings: `layoutDensity: 'auto' | 'compact' | 'balanced' | 'spacious'`.
- Migration `10 -> 11` adds `layoutDensity: 'auto'` only when `settings` is a plain object. It must not repair other malformed settings, accept an invalid explicit density as v11-valid, or rewrite the existing `layout` envelope, legacy block coordinates, connector data, or unknown non-settings stores. A malformed v10 backup remains malformed after migration and is rejected by strict post-migration backup validation.
- Fresh defaults and valid already-v11 live data round-trip unchanged. The strict v11 backup validator in `src/lib/backup.ts` requires the field and accepts exactly the four literals; missing, null, non-string, and unknown values reject the Settings key/restore with the existing user-safe reason. Schema-10 backups acquire Auto Fit through migration, older supported backups run their existing steps and then 10 -> 11, and future schemas remain rejected by the current future-version guard.
- Live storage is a different trust boundary from backup import. Add a narrow density repair in `src/lib/storage/index.ts`: if a current-v11 live Settings object has a missing/invalid density, preserve every other Settings field, repair only density to `auto` under the existing storage authority, verify the write, and surface the existing typed initialization/rollback failure if repair cannot be proven. Never loosen `validateBackupShape` to perform this repair.
- Failed migration/restore remains atomic: retain the previous stored snapshot and surface the existing typed failure. Do not add a side channel or dual-write.
- Existing `layout.profiles`, `layout.legacy`, and W3-P1 validation remain intact. W3-P2 consumes active-profile overrides but does not remove legacy data.
- `layoutDensity` is an independent user preference. “Reset layout” at both existing entry points clears only Layout V2 overrides with `storage.set('layout', emptyLayoutV2())` and preserves density byte-for-byte, including a manual choice. Cancel writes neither key. This is full-stage placement reset, not a density reset and not W3-P3's future reset-one behavior.

### Outer grid, root markers, resize ownership, and 320px floor

- The owning `<main>` has `data-adaptive-stage`, and `document.documentElement` carries the authoritative `data-stage-profile` and `data-stage-density`. `BoardItem` repeats the profile marker only for testability/container styling; CSS never infers a competing profile.
- Publish exact owned CSS variables on the root: `--stage-gap`, `--stage-inset`, `--stage-track-min`, `--stage-control-target`, `--stage-day-cols`, `--stage-day-rows`, `--stage-now-cols`, `--stage-now-rows`, `--stage-pulse-cols`, `--stage-pulse-rows`, and testable computed mirror `--stage-css-profile`. Each `BoardItem` publishes exact `--board-col-span` and `--board-row-span`; CSS consumes them in `grid-column: span var(--board-col-span)` and `grid-row: span var(--board-row-span)`. Values come only from the frozen tables above.
- Exact outer templates are: Compact-wide, columns `repeat(3, minmax(0,1fr))`, rows `minmax(0,1fr) auto`, areas `"day now pulse" "dock dock dock"`; Compact-narrow, columns `repeat(2, minmax(0,1fr))`, rows `minmax(0,1fr) minmax(0,1fr) auto`, areas `"now now" "day pulse" "dock dock"`; Standard, columns `minmax(0,2fr) minmax(0,4fr) minmax(0,2fr)` and areas `"day now pulse" "dock dock dock"`; Display, `minmax(0,3fr) minmax(0,6fr) minmax(0,3fr)` with the same areas; Ultrawide, `minmax(0,4fr) minmax(0,6fr) minmax(0,4fr)` with the same areas. Non-compact profiles use rows `minmax(0,1fr) auto`.
- Each finite zone uses its exact sublayout/profile/density column count and explicit finite rows, `grid-auto-rows: minmax(var(--stage-track-min), 1fr)`, and `min-width: 0`. At 800x600 and the 600px compact-sublayout fenceposts, every finite automatic cell plus Dock must be simultaneously in view with no stage/page scroll; wide-short probes include 800x600, 800x599, and 1200x600. Compact-narrow proves the same at 320x800 and 599x800. Only explicit pinned overflow may add implicit rows and activate the stage's vertical scroll at these supported W3-P2 sizes. The pre-existing W2-P3 320x180 owned-scrollport contract remains an explicit extreme-height exception and must not clip controls. Dock alone may scroll horizontally and uses mandatory focus reveal (`scrollIntoView({ block: 'nearest', inline: 'nearest' })` on `focusin`).
- Mirror profile selection in ordered CSS solely to prove first-paint agreement: base `--stage-css-profile: standard`; Display query next (`min-width: 2200px` and `min-height: 1100px`); Ultrawide after Display (`min-width: 1600px` and `min-aspect-ratio: 21/10`); Compact last through separate `max-width: 899px` and `max-height: 699px` queries. Within Compact, `max-width: 599px` selects compact-narrow and `min-width: 600px` selects compact-wide. Browser fencepost tests compare the computed marker and sublayout to JS state at 599/600 plus every profile fencepost; JS remains authoritative for rendering/replanning.
- Own viewport state in a `useAdaptiveStageViewport` hook: synchronously seed from `window.innerWidth/innerHeight`, listen to `resize`, coalesce with one `requestAnimationFrame`, and on unmount remove the listener, cancel the pending frame, and remove only the profile/density attributes and CSS variables written by the hook. RED tests prove one listener, no post-unmount update, no leaked frame, and marker replacement across every fencepost.
- At 320 CSS px wide, the stage has `min-width: 0`, stays within the viewport with no document-level horizontal scroll, keeps readable content and focus rings, and makes all overflow reachable through the owned stage/Dock scrollports. Add an automated 320x800 profile/geometry/keyboard probe; native zoom remains a manual ceiling.

### BoardItem, WidgetBoundary, and temporary Arrange bridge

- Add `BoardItem` as the sole committed semantic-grid wrapper. It owns `data-block-id`, `data-stage-profile`, `data-stage-zone`, `data-stage-variant`, `data-stage-priority`, CSS row/column spans, `container-type: inline-size`, and the existing `src/newtab/components/WidgetBoundary.tsx`.
- Harden that existing boundary rather than creating another. A render failure displays a local fixed-safe named fallback with `role="alert"` and the registry-owned accessible name inside `BoardItem`, does not introduce transform/layout containment or a new positioned ancestor, and does not remove siblings or crash the stage. `componentDidCatch` may log only a constant prefix plus the registry-owned safe label; never log/interpolate the thrown value, message, stack, component stack, widget data, connector config, tokens, URLs, or capability URLs. A RED test throws a unique fake token and capability URL and proves neither appears in DOM nor any captured console argument/stringification.
- `BoardItem` must not add pixel positioning, transforms, root scaling, or `contain: layout`. Widgets adapt through container queries and their existing responsive internals.
- `App` derives active registry entries once, plans once, and renders semantic `Day`, `Now`, `Pulse`, and `Dock` containers. Empty zones stay structurally present; Dock is visible whenever it has allocations.
- Delete the current behavior that hides enabled connectors. Every enabled connector must retain a wrapper even when its internal widget is in setup, loading, empty, or error state.
- Committed rendering ignores `layout.legacy`. While Arrange mode is active, keep the current Provider topology in `App`: `DraftLayoutContext` remains above the semantic zone/BoardItem siblings and `ArrangeController`, and the draft remains a multi-entry `Layout` map, not a single active item. Every ID present in the draft renders through `PositionedBlock` using its live percentage coordinate while all other IDs remain semantic. Multiple pointer-dragged and keyboard-nudged entries must coexist; dropping one preserves every other draft entry, persists only the dropped entry through `withLegacyBlockPosition`, avoids the stale-frame flicker, and all entries return to semantic rendering only when current Arrange exit clears the map.
- Do not invent W3-P3 save/cancel, undo/redo, reset-one, collision preview, keyboard move, or copy-between-profile behavior. Keep current full reset semantics. W3-P3 replaces this bridge; W3-P4 removes legacy positioning/CSS after migration proof.
- W4-P4 owns intentionally condensed Dock widget content. W3-P2 owns only correct allocation, wrapper visibility, order, overflow, and accessibility.

## Task 0: Review and checkpoint this plan

**Files:**
- Create: `docs/superpowers/plans/2026-08-15-w3-p2-adaptive-stage-registry.md`

1. Verify provenance and both worktrees using `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse @{upstream}`, and `git rev-list --left-right --count HEAD...@{upstream}`.
2. Have an independent reviewer compare every frozen table, boundary, migration rule, exclusion, and gate to the master spec and current source.
3. If findings exist, assign a separate plan fixer, then rerun independent review. Do not begin production work with unresolved Critical, Important, or packet-local Minor findings.
4. Run `git diff --check` and a placeholder scan for `TBD`, `FIXME`, `XXX`, and unresolved bracket markers.
5. Commit only the plan: `docs: plan W3-P2 Adaptive Stage registry`.

## Task 1: Pure profile, density, and allocation engine

**Files:**
- Create: `src/lib/layout/adaptiveStage.ts`
- Create: `src/lib/layout/adaptiveStage.test.ts`
- Modify: `src/lib/layout/types.ts`
- Modify: `scripts/preview.mjs` (pre-author the aggregate only)

1. Before production code, add the complete named harness aggregate `W3-P2 profile engine, registry, BoardItem, and semantic grid semantics`. Run the full harness and record exactly `455 PASS / 1 FAIL / 3 SKIP`; all 455 predecessors must remain green, the new aggregate must be the only failure, process exit must remain 0, and page/viewport/storage cleanup must complete.
2. Write Vitest RED cases for all profile fenceposts and precedence; exact pixel-geometry fit/failure for every profile/sublayout/density; Standard 900x700 and Ultrawide 1600x700 witnesses; all capacity/token constants; the two-condition Auto Fit ordering and no-candidate diagnostic; exact-fit rectangles; downgrade; Dock fallback; migrated pinned-Dock and very-large span normalization; pinned overflow; lower-order automatic versus later pinned; every clock reservation state/cell rule; collision stability; insertion invariance; span clamping; enumeration-order independence; effective override precedence/constraints including stored `locked` preservation with no W3-P2 behavioral effect; and exactly-once output.
3. Implement pure exported selectors/constants/planner with typed inputs and diagnostics. Do not import React, storage APIs, DOM globals, or the renderer registry.
4. Run `npm test -- --run src/lib/layout/adaptiveStage.test.ts src/lib/layout/v2.test.ts` and prove the intended RED became GREEN without weakening W3-P1 tests.
5. Obtain independent code/spec review. Send findings to a separate fixer, rerun focused tests, and rereview until clear.
6. Commit: `feat(layout): add W3-P2 profile engine`.

## Task 2: Persist density in schema v11

**Files:**
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/migrations.test.ts`
- Modify: `src/lib/storage/index.ts`
- Modify: `src/lib/storage/index.test.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/lib/backupRestore.ts`
- Modify: `src/lib/backupRestore.test.ts`
- Modify: `src/settings/sections/Layout.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`

1. Write RED migration tests for well-formed v10 -> v11 Auto Fit, malformed-v10 non-repair, valid v11 round-trip, idempotence, preservation of layout/legacy/connectors/unknown stores, and sequential older migration.
2. Write RED `storage/index` tests for fresh defaults, v10 -> v11 target write/readback/rollback/retry, current-v11 missing/null/non-string/unknown density repair only at the live boundary, authority-held write verification, repair rollback/retry, future-version behavior, subscriptions, and preservation of every sibling Settings field.
3. Write RED `backup` and `backupRestore` tests covering export, strict schema-11 restore for all four values, each invalid/missing density rejection, schema-10/older migration to Auto Fit, future rejection, ownership finalization, atomic rollback, rollback failure, and no partial write. Never describe invalid v11 backup data as normalized.
4. Write RED settings tests for a labeled four-option density control, Auto Fit default, Balanced manual option, persistence, reload, unchanged legacy controls, and Reset layout clearing only Layout V2 while preserving density and all Settings byte-for-byte; Cancel writes neither key.
5. Implement the schema/migration/live-repair/backup changes and the smallest accessible control. The label and description explain that Auto Fit chooses the roomiest layout that keeps automatic items on the board.
6. Run `npx vitest run src/lib/storage/migrations.test.ts src/lib/storage/index.test.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts src/settings/SettingsPanel.test.tsx`.
7. Obtain independent review, separate fixing, focused rerun, and rereview.
8. Commit: `feat(settings): persist Adaptive Stage density`.

## Task 3: Source-owned registry and BoardItem boundary

**Files:**
- Create: `src/newtab/widgetRegistry.ts`
- Create: `src/newtab/widgetRegistry.test.ts`
- Create: `src/newtab/widgetRenderers.tsx`
- Create: `src/newtab/components/BoardItem.tsx`
- Create: `src/newtab/components/BoardItem.test.tsx`
- Modify: `src/newtab/components/WidgetBoundary.tsx`
- Create: `src/newtab/components/WidgetBoundary.test.tsx`
- Modify: `src/newtab/arrange/ArrangeController.tsx` (derive labels only)
- Modify: `src/newtab/arrange/ArrangeController.test.tsx` (label-source proof only)

1. Write registry RED tests proving exact set equality with `BLOCK_IDS`, no duplicate IDs, every exact existing Arrange label/table value above, deterministic ordering, every exact toggle mapping, all nine exact connector mappings, enabled connector inclusion regardless of readiness/data, disabled exclusion, exhaustive renderer resolution, and pure availability output for changed settings/config inputs. App-level live replanning remains Task 4.
2. Write BoardItem/WidgetBoundary RED tests for every data attribute, finite board/Dock span variables, container type/class contract, child rendering, fixed-safe named fallback, sibling survival, safe constant logging, and the unique fake-secret non-leak contract across DOM and console arguments.
3. Implement one immutable React-free metadata registry with a renderer key and one exhaustive renderer resolver; metadata remains the single source for labels/planning/availability, and the resolver must be set-equal by type and test rather than duplicate metadata. Delete `ArrangeController.tsx`'s local `BLOCK_LABELS`, derive its labels from this metadata, and update only its label-source assertions here; do not move Task 4's semantic rendering/replanning into this task.
4. Implement `BoardItem` and harden the existing `WidgetBoundary`; do not restyle individual widget content in this task.
5. Run `npx vitest run src/newtab/widgetRegistry.test.ts src/newtab/components/BoardItem.test.tsx src/newtab/components/WidgetBoundary.test.tsx src/newtab/arrange/ArrangeController.test.tsx src/lib/layout/adaptiveStage.test.ts`.
6. Obtain independent review, separate fixing, focused rerun, and rereview.
7. Commit: `feat(layout): add registry and BoardItem`.

## Task 4: Render the semantic Adaptive Stage and retain Arrange compatibility

**Files:**
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/index.css`
- Create: `src/newtab/useAdaptiveStageViewport.ts`
- Create: `src/newtab/useAdaptiveStageViewport.test.tsx`
- Modify: `src/newtab/arrange/ArrangeController.tsx`
- Modify: `src/newtab/arrange/ArrangeController.test.tsx`
- Modify: `src/newtab/arrange/draftLayout.ts`
- Modify: `src/newtab/components/PositionedBlock.test.tsx` only for superseded committed-render assumptions
- Modify: `scripts/preview.mjs`

1. Inventory every existing layout-sensitive unit and harness assertion. Classify it as still authoritative, temporarily Arrange-only, or superseded by semantic layout. Preserve every unrelated interaction, accessibility, storage, connector, network, and error assertion.
2. Write RED App/viewport/Arrange tests for root marker/CSS-variable ownership and resize cleanup; exact outer templates and 320px behavior; effective-placement field precedence and constraints; four semantic zones; empty-zone structure; exactly-once wrappers; connector setup/error wrappers and replan on settings/connectors/layout/density/viewport changes; finite Dock geometry; phased pinned/clock/automatic placement; local failure isolation; and multi-entry Draft topology. The Draft tests must cover two touched IDs, pointer plus repeated keyboard-nudge paths, dropping one without deleting the other, pointer-cancel, async storage echo without flicker, Arrange exit cleanup, exactly one `data-block-id` node per active ID, and Layout-only reset preserving density from both entry points.
3. Integrate registry -> planner -> semantic zone rendering. Merge source defaults with only the active `layout.profiles[profile]` overrides. Remove manual 26-block construction and `legacyLayoutOf` from committed rendering.
4. Replace fixed-stage CSS with named semantic grids, the frozen tokens/capacities, stable source order, horizontal Dock, wrapper container queries, focus visibility, text contrast surfaces, and no clipping/overlap/root transform. Preserve legacy rules only under the explicit live-draft compatibility state.
5. Adapt each superseded harness assertion one-for-one so the predecessor result count stays 455. In particular, update the W3-P1 predecessor's exact schema/version assertions from v10 to v11 and assert migrated `settings.layoutDensity === 'auto'` without renaming or weakening the W3-P1 result. Do not delete or combine named predecessors merely to make the total pass.
6. Complete the pre-authored W3-P2 aggregate at the same extension page. It must exercise clean storage and at least these exact viewports: Compact 800x600 plus compact sublayout 599/600 fenceposts and 320x800 no-clipping, Standard 900x700 and 1600x900, Display 2560x1440, Ultrawide 1600x700 and 3440x1440. Assert profile, exact pixel-geometry feasibility, resolved density, sparse and dense registries, both Auto Fit conditions, manual density, active-profile override, every active/enabled connector wrapper exactly once, board-or-Dock allocation, protected clock, zero rectangle overlap, no viewport/stage clipping or unintended scroll, no root transform, wrapper container semantics, and `errors.length === 0`.
7. Save durable review captures outside the repository under `C:\Users\SickT\Documents\Codex\2026-08-14\continue-aurora-2-continuously-through-all\outputs\w3-p2\` using exact names `w3-p2-compact-800x600.png`, `w3-p2-standard-1600x900.png`, `w3-p2-display-2560x1440.png`, `w3-p2-ultrawide-3440x1440.png`, `w3-p2-compact-dense-dock.png`, and `w3-p2-compact-320x800-keyboard.png`. Inspect at original resolution for readable greeting/focus text across backgrounds, visible focus rings, zone balance, Dock reachability, clipping, overlap, and unintended hidden widgets. Record a keyboard trace proving every visible control is reachable once, no focus enters inert/hidden content, focused offscreen Dock content scrolls into view, and Arrange exit restores focus to the Settings gear.
8. Run focused tests plus `npm run build`, then the browser harness. Expected result is exactly `456 PASS / 0 FAIL / 3 SKIP`, with the W3-P2 aggregate `1 PASS / 0 FAIL` and all predecessor names accounted for.
9. Obtain independent UI/code/spec review with capture and machine evidence. Assign a separate fixer for every confirmed finding, rerun focused/build/harness evidence, and rereview.
10. Commit: `feat(layout): render the Adaptive Stage`.

## Task 5: Whole-packet review, final gate, ledgers, and pushed checkpoint

**Files:**
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` only if implementation revealed an approved clarification; never silently rewrite scope

1. Give an independent whole-packet reviewer the authoritative spec, this plan, `git diff` from the plan checkpoint, task commits, test output, harness result list, and captures. Require explicit review of all 26 entries, migration/backup matrix, exactly-once allocation, protected/pinned behavior, Arrange bridge, accessibility, and exclusions.
2. Route confirmed findings to a separate fixer. Require RED reproduction where feasible, smallest fix, focused/full reruns, a fix commit, and independent rereview. Repeat until there are no unresolved Critical, Important, or packet-local Minor findings.
3. Run the final machine gate from a clean built state:
   - `npx vitest run src/lib/layout/adaptiveStage.test.ts src/lib/layout/v2.test.ts src/lib/storage/migrations.test.ts src/lib/storage/index.test.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts src/newtab/widgetRegistry.test.ts src/newtab/components/BoardItem.test.tsx src/newtab/components/WidgetBoundary.test.tsx src/newtab/useAdaptiveStageViewport.test.tsx src/newtab/App.test.tsx src/newtab/arrange/ArrangeController.test.tsx src/newtab/components/PositionedBlock.test.tsx src/settings/SettingsPanel.test.tsx`;
   - `npx tsc --noEmit`;
   - `npm test`;
   - `npm run build`;
   - `rg -n "__auroraStorageHarness|__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist` followed immediately by `if ($LASTEXITCODE -ne 1) { throw "Production preview-bridge scan expected rg exit 1, got $LASTEXITCODE" }`; expected `rg` exit is exactly 1 with no output, meaning no preview bridge in production;
   - established privacy/secret/CSP/manifest/banned-pattern audits, expected 0 findings;
   - preview build/start and full `scripts/preview.mjs` browser suite;
   - parse the complete result stream, expected exactly `456 PASS / 0 FAIL / 3 SKIP`, named W3-P2 `1/0`, no duplicate/missing result names, clean teardown, and zero page/console errors.
4. Reinspect all six durable captures after the final build and replay the keyboard trace. Record automated evidence separately from manual ceilings.
5. Update `docs/superpowers/aurora-2/ROADMAP.md` W3-P2 to Verified and leave W3-P3 Not started. Update `docs/superpowers/aurora-2/STATUS.md` with commit range, exact gates, durable capture paths, compatibility bridge, and ceilings. Append decision `A2-D024` to `docs/superpowers/aurora-2/DECISIONS.md`, freezing the profile/density/registry/allocation/schema-v11 contract and its W3-P3/W3-P4 handoff.
6. Run `git diff --check`, inspect `git diff --stat` and `git status --short`, and verify no generated captures, credentials, profiles, build output, or unrelated files are tracked.
7. Commit the packet ledger checkpoint as `docs: checkpoint W3-P2`.
8. Push only the Aurora 2 feature branch to its existing upstream, fetch, and prove local HEAD = upstream HEAD with divergence `0 0` and a clean worktree.
9. Re-prove `D:\DEV\Chrome plugin` is unchanged, clean, on `main`, and equal to its upstream.
10. Re-read the three ledgers at their exact `docs/superpowers/aurora-2/` paths, then continue automatically to W3-P3 discovery under A2-D019 unless blocked by a real decision/manual requirement. Do not implement W3-P3 as part of this packet.

## Required manual ceilings

- Automated CSS-pixel resizing does not prove native Chrome zoom at 400%, Windows display scaling, mixed-DPI monitor moves, or every OS font-rendering combination.
- Automated semantics and keyboard checks do not constitute a real screen-reader pass; W6-P2 owns named assistive-technology proof.
- Home Assistant live discovery/action state, native permission prompts, and NASA/native-host permission surfaces retain their existing manual ceilings.
- W3-P2 does not claim unload-time asynchronous persistence guarantees beyond the existing documented boundary.
- Record these as ceilings, not failures and not silently implied passes.

## Explicit exclusions

- W3-P3 profile editor semantics: save/cancel, undo/redo, per-item reset, copy profile, keyboard placement, editor collision UI, and final legacy-coordinate replacement.
- W3-P4 migration deletion/cleanup of `layout.legacy`, `PositionedBlock`, legacy CSS, or the temporary Arrange bridge.
- W4 widget-content redesign and W4-P4 condensed Dock content.
- W5 Focus-mode behavior, including the requested greeting/focus visibility/accessibility backlog item beyond ensuring W3-P2 surfaces remain readable and contrast-safe.
- W6 accessibility certification, performance budgets, release packaging, Store assets/listing, submission, publication, rollout, or rollback operations.
- New dependencies, connector service behavior, credential/permission scope, manifest privileges, telemetry, remote code, or Aurora V1 changes.

## Definition of done

W3-P2 is complete only when schema 11 safely persists density; the pure engine passes every boundary/invariance test; the registry owns all 26 defaults exactly once; every active widget, including enabled incomplete connectors, has one board-or-Dock allocation; pinned and clock rules hold; `BoardItem` isolates failures and establishes container semantics; semantic grids render across all four profiles without overlap/clipping/root scaling; current Arrange remains temporarily usable; exact final evidence is `456 PASS / 0 FAIL / 3 SKIP`; independent review is clear; ledgers and A2-D024 are committed; the feature branch is pushed/equal/clean; and the protected Aurora V1 checkout remains untouched.
