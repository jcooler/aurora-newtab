# Aurora SF-P2 Framed Catalog Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every remaining Framed Aurora widget to the exact Compact 216x132, Standard 320x200, and Full 460x284 presentation frames it declares, while preserving authored information, truthful states, one data owner, exact layout recovery, and manual stack behavior.

**Architecture:** `WIDGET_PRESENTATION_CONTRACTS` remains the single presentation authority. Shared resource shells adopt `TierFrame` once, while each widget still owns its row caps, signature visual, actions, and state copy. Stack admission and sizing use the declared `stackSizes` intersection and render an explicit compatibility face for legacy incompatible stacks instead of silently substituting a tier. A registry-derived SF-P2 browser catalog proves every migrated ready tier and bounded family state/stack samples; SF-P4 retains the exhaustive cross-theme product gate.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Testing Library, Vite, Tailwind CSS 4, Playwright Chromium, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-22-aurora-shared-widget-frames-and-stack-composition-design.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`. Never write to `D:\DEV\Chrome plugin`.
- Preserve exact Compact 216x132, Standard 320x200, and Full 460x284 CSS pixel frames. Narrow safety may scale down only and never changes stored tier.
- Observe one focused failing test before every production change. Do not manufacture a production edit when a new regression test already passes.
- Keep one mounted data owner per identity. Do not add hooks, requests, storage owners, credentials, permissions, provider origins, dependencies, or cache authorities.
- Preserve stored anchors, offsets, layers, tiers, dock coordinates, stack membership, facing, Save, Cancel, Undo, backup, and exact recovery. Never write the legacy `layout` key.
- Docked presentations remain independent and content-tight. SF-P2 changes free and framed-stack presentations only.
- Preserve signature content whenever physically possible. GitHub and GitLab keep contribution graphs; Calendar keeps event identity; Month keeps the complete month; status and work cards keep named context; browser-native cards keep distinct actionable rows.
- No framed card or framed stack face owns an internal scrollbar. Bound rows and route overflow to the existing details, Settings, or provider destination.
- Do not modify intrinsic or bar free forms. Clock, Greeting, Quote, Search, Bookmarks, and other non-card stack faces belong to SF-P3.
- Preserve the independent Calendar/ICS, Month, and Public Holidays authorities. Unified Agenda design remains deferred until after SF-P4.
- Run one bounded whole-packet code review and at most one fix/rereview cycle. Only Critical or Important findings block.
- Rebuild `dist` from the exact Ready reviewed commit before owner-facing evidence. Stop at the SF-P2 owner visual gate.
- Chrome Web Store upload, field edits, saves, submission, publication, distribution, and rollout remain blocked without new action-specific W6-P5 approval.

---

## Task 1: Make the presentation authority complete and independently declare stack tiers

**Files:**

- Modify: `src/newtab/widgetSizeContracts.ts`
- Modify: `src/newtab/widgetSizeContracts.test.ts`
- Modify: `src/newtab/widgetRegistry.test.ts`
- Modify: `src/newtab/expansionWidgetContracts.test.ts`
- Modify: `scripts/qa-shared-frame-p1.mjs`
- Modify: `scripts/qa-shared-frame-p1.test.mjs`

- [x] **Step 1: Add focused RED contract tests.** Require every Framed widget to declare a `TierCompositionContract` for every free tier and every stack tier. Require `stackSizes` to be an explicit frozen subset rather than an implicit copy. Assert every tier has non-empty purpose and essential arrays, an explicit signature array, ordered narrow-safety rules, and one overflow destination. Pin the exact 27 Framed ids and prove Weather plus On This Day remain byte-stable authorities.
- [x] **Step 2: Observe RED.** Run:

```powershell
npx vitest run src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRegistry.test.ts src/newtab/expansionWidgetContracts.test.ts
```

Expected: the 25 unmigrated Framed widgets lack tier metadata, and `stackSizes` is still synthesized from `sizes`.

- [x] **Step 3: Extend `contract` without a parallel registry.** Add an explicit `stackSizes` input and complete authored tier metadata for Calendar, Month, Sun, Moon, Habits, Status, GitHub, GitLab, Jira, Vercel, Home Assistant, RSS, Crypto, Reading List, Recently Closed, Downloads, Tab Groups, Timer, Tasks, Notes, Linear, Sentry, Todoist, Public Holidays, and Aurora & Kp. Use existing content contracts and rendered facts as the source. Do not invent provider data.
- [x] **Step 4: Run GREEN and commit.** Run the Step 2 command, `npx tsc --noEmit`, and `git diff --check`, then commit:

```powershell
git add src/newtab/widgetSizeContracts.ts src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRegistry.test.ts src/newtab/expansionWidgetContracts.test.ts scripts/qa-shared-frame-p1.mjs scripts/qa-shared-frame-p1.test.mjs
git commit -m "feat: complete framed presentation contracts"
```

---

## Task 2: Enforce stack-tier intersections without rewriting legacy stacks

**Files:**

- Create: `src/newtab/canvas/stackPresentation.ts`
- Create: `src/newtab/canvas/stackPresentation.test.ts`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.test.tsx`
- Modify: `src/newtab/canvas/StackCard.tsx`
- Modify: `src/newtab/canvas/StackCard.test.tsx`
- Modify: `src/newtab/edit/StackInspector.tsx`
- Modify: `src/newtab/edit/StackInspector.test.tsx`
- Modify only if RED requires pure operation support: `src/lib/layout/stacks.ts`
- Modify only if RED requires pure operation support: `src/lib/layout/stacks.test.ts`

- [x] **Step 1: Add RED pure tests.** Define `commonStackTiers(memberIds)`, `canJoinStackAtTier(sourceId, memberIds, tier)`, and `stackCompatibility(memberIds, storedTier)`. Pin ordered intersection in Compact, Standard, Full order, incompatibility reasons naming the member and valid common tiers, and an empty intersection.
- [x] **Step 2: Observe RED.** Run `npx vitest run src/newtab/canvas/stackPresentation.test.ts`; expect the module to be missing.
- [x] **Step 3: Implement the pure authority.** Read only `WIDGET_PRESENTATION_CONTRACTS[id].stackSizes`. Do not inspect rendered dimensions, DOM, current data, or viewport.
- [x] **Step 4: Add RED interaction tests.** Require the 500ms target to arm only when source and target support the stored tier; require the Stack Inspector to offer only the current member intersection; require removal to reveal newly available tiers without changing the stored tier; and require a legacy incompatible stack to preserve members, facing, tier, geometry, and storage while painting a named compatibility face. Assert no nearest-tier member substitution in stacks.
- [x] **Step 5: Observe RED.** Run:

```powershell
npx vitest run src/newtab/App.test.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/canvas/StackCard.test.tsx src/newtab/edit/StackInspector.test.tsx src/lib/layout/stacks.test.ts
```

Expected: App currently accepts any unstacked member, CanvasSurface calls `resolveRenderTier` per member, and the inspector offers `WIDGET_TIERS` rather than the intersection.

- [x] **Step 6: Implement exact stack behavior.** Gate stack targets through the pure helper. Pass the stack's exact stored tier to every compatible member. Render a presentation-only compatibility face for incompatible members, naming valid common tiers and retaining inspector removal. Do not mutate or normalize the saved stack. Preserve mounted-once, hidden-inert, manual arrows/dots/swipe, click parity, and edit recovery.
- [x] **Step 7: Run GREEN and commit.** Run the Step 5 command plus the pure test, TypeScript, and diff hygiene, then commit:

```powershell
git add src/newtab/canvas/stackPresentation.ts src/newtab/canvas/stackPresentation.test.ts src/newtab/App.tsx src/newtab/App.test.tsx src/newtab/canvas/CanvasSurface.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/canvas/StackCard.tsx src/newtab/canvas/StackCard.test.tsx src/newtab/edit/StackInspector.tsx src/newtab/edit/StackInspector.test.tsx src/lib/layout/stacks.ts src/lib/layout/stacks.test.ts
git commit -m "feat: enforce exact stack tier contracts"
```

Omit optional files from `git add` when RED proves no production change is needed.

---

## Task 3: Migrate shared resource shells to exact frames

**Files:**

- Modify: `src/newtab/widgets/work/WorkWidgetShell.tsx`
- Modify: `src/newtab/widgets/work/WorkWidgetShell.test.tsx`
- Modify: `src/newtab/widgets/browser/BrowserWidgetShell.tsx`
- Modify: `src/newtab/widgets/browser/BrowserWidgetShell.test.tsx`
- Modify: `src/newtab/widgets/glance/GlanceWidgetShell.tsx`
- Modify: `src/newtab/widgets/shared/TierFrame.tsx` only if a focused RED proves a presentation-only slot is required
- Modify: `src/newtab/widgets/shared/TierFrame.test.tsx` only with the matching RED
- Modify: `src/newtab/index.css`

- [x] **Step 1: Add RED shell tests.** For ready, loading, empty, stale/retained, permission/setup, partial, and hard-error examples, require one exact `TierFrame`, stable tier/state attributes, no `data-work-widget-scroll` or `data-browser-widget-scroll`, no `overflow-y-auto`/`scroll`, and a bounded details/refresh path. Pin routine text at 14px where possible and metadata at 11px.
- [x] **Step 2: Observe RED.** Run:

```powershell
npx vitest run src/newtab/widgets/work/WorkWidgetShell.test.tsx src/newtab/widgets/browser/BrowserWidgetShell.test.tsx src/newtab/widgets/shared/TierFrame.test.tsx
```

Expected: both shells use intrinsic width classes and local vertical scroll owners.

- [x] **Step 3: Implement presentation-only shells.** Replace shell geometry with `TierFrame`; retain `WorkResourceBody`, `BrowserResourceBody`, Dock details, portals, focus return, retries, and state semantics. The shell owns header/body framing only. It does not choose row counts or fetch data.
- [x] **Step 4: Run GREEN and commit.** Run the Step 2 command, TypeScript, and diff hygiene, then commit:

```powershell
git add src/newtab/widgets/work/WorkWidgetShell.tsx src/newtab/widgets/work/WorkWidgetShell.test.tsx src/newtab/widgets/browser/BrowserWidgetShell.tsx src/newtab/widgets/browser/BrowserWidgetShell.test.tsx src/newtab/widgets/glance/GlanceWidgetShell.tsx src/newtab/widgets/shared/TierFrame.tsx src/newtab/widgets/shared/TierFrame.test.tsx src/newtab/index.css
git commit -m "feat: frame shared resource shells"
```

---

## Task 4: Author developer and service cards inside the shared frames

**Files:**

- Modify: `src/newtab/widgets/github/GithubWidget.tsx`
- Modify: `src/newtab/widgets/github/GithubWidget.test.tsx`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.tsx`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.test.tsx`
- Modify: `src/newtab/widgets/jira/JiraWidget.tsx`
- Modify: `src/newtab/widgets/jira/JiraWidget.test.tsx`
- Modify: `src/newtab/widgets/vercel/VercelWidget.tsx`
- Modify: `src/newtab/widgets/vercel/VercelWidget.test.tsx`
- Modify: `src/newtab/widgets/status/StatusWidget.tsx`
- Modify: `src/newtab/widgets/status/StatusWidget.test.tsx`
- Modify: `src/newtab/widgets/shared/ContributionGraph.tsx` only if RED requires responsive graph sizing
- Create: `src/newtab/widgets/shared/ContributionGraph.test.tsx` only if the graph change needs isolated coverage
- Modify: `src/newtab/index.css`

- [x] **Step 1: Add per-widget RED tier tests.** Require exact TierFrame state at every supported tier. GitHub and GitLab must retain a legible contribution graph in every tier that currently promises it, with resized cells rather than removal. Standard and Full must be visibly different. Jira and Vercel keep named prioritized rows. Status keeps named service dots and active-issue context. All five bound rows without a frame scrollbar and route excess information to their existing details/provider action.
- [x] **Step 2: Observe RED per file before each production edit.** Run each widget test file separately and record the missing frame or overflow assertion before editing that widget.
- [x] **Step 3: Implement authored compositions.** Reuse existing hooks, computed summaries, contribution data, row identity, links, and Docked branches. Prefer smaller graph cells, tighter gaps, bounded row slices, and line clamps. Do not replace a signature graph with generic counts or remove service names.
- [x] **Step 4: Run the family GREEN gate and commit.** Run all five test files plus `ContributionGraph.test.tsx`, TypeScript, and diff hygiene, then commit:

```powershell
git add src/newtab/widgets/github src/newtab/widgets/gitlab src/newtab/widgets/jira src/newtab/widgets/vercel src/newtab/widgets/status src/newtab/widgets/shared/ContributionGraph.tsx src/newtab/widgets/shared/ContributionGraph.test.tsx src/newtab/index.css
git commit -m "feat: frame developer and service widgets"
```

---

## Task 5: Author connected work, feed, market, and home cards

**Files:**

- Modify: `src/newtab/widgets/linear/LinearWidget.tsx`
- Modify: `src/newtab/widgets/linear/LinearWidget.test.tsx`
- Modify: `src/newtab/widgets/sentry/SentryWidget.tsx`
- Modify: `src/newtab/widgets/sentry/SentryWidget.test.tsx`
- Modify: `src/newtab/widgets/todoist/TodoistWidget.tsx`
- Modify: `src/newtab/widgets/todoist/TodoistWidget.test.tsx`
- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx`
- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx`
- Modify: `src/newtab/widgets/rss/RssWidget.tsx`
- Modify: `src/newtab/widgets/rss/RssWidget.test.tsx`
- Modify: `src/newtab/widgets/crypto/CryptoWidget.tsx`
- Modify: `src/newtab/widgets/crypto/CryptoWidget.test.tsx`
- Modify: `src/newtab/index.css`

- [ ] **Step 1: Add and observe focused RED tests widget by widget.** Require exact frame/state for every declared tier, bounded useful rows, one truthful overflow destination, no internal scrollbar, and Docked XOR free parity. Todoist completion confirmation, Home Assistant actions/tray, RSS links, and Crypto single/multi-coin selection must remain functional.
- [ ] **Step 2: Implement one widget at a time after its RED.** Let the shared Work shell provide geometry for Linear, Sentry, and Todoist, but keep each widget's authored counts, priority, action, and row caps. Frame Home Assistant, RSS, and Crypto directly while preserving their current data and settings authorities.
- [ ] **Step 3: Run GREEN and commit.** Run all six test files, Work shell tests, TypeScript, and diff hygiene, then commit:

```powershell
git add src/newtab/widgets/linear src/newtab/widgets/sentry src/newtab/widgets/todoist src/newtab/widgets/homeassistant src/newtab/widgets/rss src/newtab/widgets/crypto src/newtab/index.css
git commit -m "feat: frame connected information widgets"
```

---

## Task 6: Author browser-native cards inside exact frames

**Files:**

- Modify: `src/newtab/widgets/readingList/ReadingListWidget.tsx`
- Modify: `src/newtab/widgets/readingList/ReadingListWidget.test.tsx`
- Modify: `src/newtab/widgets/recentlyClosed/RecentlyClosedWidget.tsx`
- Modify: `src/newtab/widgets/recentlyClosed/RecentlyClosedWidget.test.tsx`
- Modify: `src/newtab/widgets/downloads/DownloadsWidget.tsx`
- Modify: `src/newtab/widgets/downloads/DownloadsWidget.test.tsx`
- Modify: `src/newtab/widgets/tabGroups/TabGroupsWidget.tsx`
- Modify: `src/newtab/widgets/tabGroups/TabGroupsWidget.test.tsx`
- Modify: `src/newtab/widgets/browser/BrowserWidgetShell.tsx` only through a new focused shell RED
- Modify: `src/newtab/index.css`

- [ ] **Step 1: Add and observe RED tests per browser identity.** Require every supported tier to use the exact frame, preserve distinct accessible row/action names, show meaningful permission/loading/empty/retained-error states in the same frame, and contain the maximum 25-record fixture without an internal scrollbar by rendering a bounded tier subset.
- [ ] **Step 2: Implement authored browser compositions.** Compact keeps the primary count and newest item, Standard keeps a useful queue, Full keeps the richest bounded rows by kind/state. Keep all Chrome API calls, optional permissions, ephemeral ownership, and actions unchanged. Overflow points to existing Settings or native action context rather than a second store.
- [ ] **Step 3: Run GREEN and commit.** Run all four widget tests plus Browser shell tests, TypeScript, and diff hygiene, then commit:

```powershell
git add src/newtab/widgets/readingList src/newtab/widgets/recentlyClosed src/newtab/widgets/downloads src/newtab/widgets/tabGroups src/newtab/widgets/browser/BrowserWidgetShell.tsx src/newtab/index.css
git commit -m "feat: frame browser native widgets"
```

---

## Task 7: Author time, calendar, and local-productivity cards

**Files:**

- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.test.tsx`
- Modify: `src/newtab/widgets/monthcal/MonthCalWidget.tsx`
- Modify: `src/newtab/widgets/monthcal/MonthCalWidget.test.tsx`
- Modify: `src/newtab/widgets/sun/SunWidget.tsx`
- Modify: `src/newtab/widgets/sun/SunWidget.test.tsx`
- Modify: `src/newtab/widgets/moon/MoonWidget.tsx`
- Modify: `src/newtab/widgets/moon/MoonWidget.test.tsx`
- Modify: `src/newtab/widgets/habits/HabitsWidget.tsx`
- Modify: `src/newtab/widgets/habits/HabitsWidget.test.tsx`
- Modify: `src/newtab/widgets/timer/TimerWidget.tsx`
- Modify: `src/newtab/widgets/timer/TimerWidget.test.tsx`
- Modify: `src/newtab/widgets/todo/TodoWidget.tsx`
- Modify: `src/newtab/widgets/todo/TodoWidget.test.tsx`
- Modify: `src/newtab/widgets/notes/NotesWidget.tsx`
- Modify: `src/newtab/widgets/notes/NotesWidget.test.tsx`
- Modify: `src/newtab/widgetRenderers.tsx`
- Create: `src/newtab/widgetRenderers.test.tsx`
- Modify: `src/newtab/index.css`

- [ ] **Step 1: Add and observe focused RED tests per widget.** Require exact frames for every declared tier and state. Calendar preserves event identity and opens the existing detail path. Month remains Standard-only and renders one complete month without a Docked presentation. Sun, Moon, and Habits retain their essential facts. Timer, Tasks, and Notes become useful Compact frames with their existing direct actions and one data owner.
- [ ] **Step 2: Thread `canvasSize` only where missing.** Update renderer props for Sun, Moon, Habits, Timer, Tasks, and Notes as needed. Do not alter their Docked line metrics or panel portals.
- [ ] **Step 3: Implement authored exact-frame layouts one widget at a time.** Preserve Calendar/ICS, Month, and Public Holidays as separate identities and authorities. Do not start Unified Agenda work. Keep complete Month semantics; resize table cells and labels to the 320x200 Standard frame without dropping days or adding scroll.
- [ ] **Step 4: Run GREEN and commit.** Run the eight widget test files plus renderer tests, TypeScript, and diff hygiene, then commit:

```powershell
git add src/newtab/widgets/calendar src/newtab/widgets/monthcal src/newtab/widgets/sun src/newtab/widgets/moon src/newtab/widgets/habits src/newtab/widgets/timer src/newtab/widgets/todo src/newtab/widgets/notes src/newtab/widgetRenderers.tsx src/newtab/widgetRenderers.test.tsx src/newtab/index.css
git commit -m "feat: frame time and productivity widgets"
```

---

## Task 8: Author remaining public-information cards

**Files:**

- Modify: `src/newtab/widgets/glance/PublicHolidaysWidget.tsx`
- Modify: `src/newtab/widgets/glance/PublicHolidaysWidget.test.tsx`
- Modify: `src/newtab/widgets/glance/AuroraKpWidget.tsx`
- Modify: `src/newtab/widgets/glance/AuroraKpWidget.test.tsx`
- Modify: `src/newtab/index.css`

- [x] **Step 1: Add and observe RED tests.** Require exact frames and truthful loading, empty, stale, partial, and hard-error states. Public Holidays keeps national holiday names and dates. Aurora & Kp keeps current Kp, peak, and its bounded forecast signature. Neither card scrolls internally; Full routes additional context to Nager.Date or NOAA.
- [x] **Step 2: Implement bounded authored compositions.** Reuse the framed Glance shell, existing snapshots, local-day owner, retry, and trusted links. Bound rows by tier and keep provider attribution accessible.
- [x] **Step 3: Run GREEN and commit.** Run both widget tests, Work shell tests, TypeScript, and diff hygiene, then commit:

```powershell
git add src/newtab/widgets/glance/PublicHolidaysWidget.tsx src/newtab/widgets/glance/PublicHolidaysWidget.test.tsx src/newtab/widgets/glance/AuroraKpWidget.tsx src/newtab/widgets/glance/AuroraKpWidget.test.tsx src/newtab/index.css
git commit -m "feat: frame public information widgets"
```

---

## Task 9: Build a registry-derived SF-P2 catalog and interaction witness

**Files:**

- Create: `scripts/qa-shared-frame-p2.mjs`
- Create: `scripts/qa-shared-frame-p2.test.mjs`
- Create: `scripts/qa-shared-frame-p2-reviewed-verdicts.mjs`
- Modify: `.gitignore`
- Create: `docs/superpowers/catalog/shared-frames/sf-p2/CATALOG.md`

- [x] **Step 1: Add the RED Node contract.** Import the presentation-authority parser from a shared harness module or extract it from SF-P1 under a focused RED. Require the P2 manifest to derive all Framed ids except the accepted Weather and On This Day reference pair. Fail on a missing declared ready tier, exact dimension, representative state per state-bearing shell family, stack-tier pair, interaction, viewport, fixture, storage audit, or usefulness verdict.
- [x] **Step 2: Observe RED.** Run `node --test scripts/qa-shared-frame-p2.test.mjs`; expect the module/script to be missing.
- [ ] **Step 3: Implement bounded scalable evidence.** Build preview fixtures from existing deterministic harness data. Capture every declared ready free tier for the 25 SF-P2 widgets. For each shared family, add representative loading, empty, stale/partial, permission/setup, and hard-error captures. Pair every widget with a compatible reference member at each declared stack tier, measure equal outer geometry, and run previous/next/dot/swipe/plain-click controls once per family. Cover 1366x768, exact 1408x445, 1600x900, 599/600, dark, light, and saturated panels without multiplying every widget across every axis. SF-P4 owns the exhaustive cross-product.
- [ ] **Step 4: Fail closed on product regressions.** Assert frame dimensions within 0.5px, no clipping or internal scroll, minimum text floors, essential/signature selectors, compatibility copy, selected-text suppression, one mounted owner, unchanged layout bytes except explicit facing writes, no legacy `layout` writes, zero runtime errors, zero failed/unapproved requests, and no capture without a human-reviewed usefulness verdict.
- [ ] **Step 5: Run preliminary Chromium and inspect every original.** Run:

```powershell
node --test scripts/qa-shared-frame-p2.test.mjs
npm run build:preview
node scripts/qa-shared-frame-p2.mjs
```

Record visual defects as focused RED tests before any production correction. Do not use aggregate PASS as a usefulness verdict.
- [ ] **Step 6: Commit harness and preliminary catalog.** Run Node syntax, Node contracts, and diff hygiene, then commit:

```powershell
git add .gitignore scripts/qa-shared-frame-p2.mjs scripts/qa-shared-frame-p2.test.mjs scripts/qa-shared-frame-p2-reviewed-verdicts.mjs docs/superpowers/catalog/shared-frames/sf-p2
git commit -m "test: witness SF-P2 framed catalog"
```

---

## Task 10: Stabilize, review once, and stop at the SF-P2 owner gate

**Files:**

- Create: `docs/superpowers/reports/SHARED-FRAMES-SF-P2-QA.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify only after owner disposition: `docs/superpowers/aurora-2/DECISIONS.md`

- [ ] **Step 1: Run the focused packet gate.** Run all modified widget, shell, contract, stack, inspector, App, renderer, and layout tests; the SF-P1 and SF-P2 Node contract tests; `scripts/preview-information-first.test.mjs` through `node --test`; TypeScript; and diff hygiene. Record exact counts.
- [ ] **Step 2: Run the stabilized full gate once.** Run `npm test` once before review. Record exact file/test counts and warnings. Do not repeat it after docs-only commits or a focused fix cycle.
- [ ] **Step 3: Commit and push the review candidate.** Mark STATUS `SF-P2 review pending`, include active/protected proof, commit, push, and verify active HEAD equals upstream while the protected checkout remains clean at exact `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- [ ] **Step 4: Request one bounded whole-packet review.** Review the SF-P2 range against the spec and plan. Classify findings Critical, Important, or Minor and return Ready or With fixes. If required, add focused RED regressions, make one fix commit, run only affected focused gates, and request one rereview. Ledger accepted Minor debt; do not create another cycle.
- [ ] **Step 5: Rebuild exact reviewed `dist`.** Run `npm run build:preview`, then prove `dist/build-provenance.json` equals the Ready reviewed commit. Resolve any mismatch before owner evidence.
- [ ] **Step 6: Run final exact-build Chromium evidence.** Rerun SF-P2 catalog against exact `dist`, inspect every original at native resolution, and record dimensions, useful content, states, stack geometry and interaction, storage writes, runtime errors, failed/unapproved requests, narrow safety, and themes.
- [ ] **Step 7: Write the QA report and checkpoint.** Include implementation/review ranges, focused/full/Node/typecheck counts, review verdict, per-family frame and usefulness evidence, exact-build provenance, active/upstream equality, protected proof, Store untouched statement, accepted Minor debt, and SF-P3 boundary. Commit and push.
- [ ] **Step 8: Stop at the owner visual gate.** Present a concise representative set from every migrated family plus direct catalog/report paths. Await acceptance or refinements. Do not write the SF-P3 plan or alter intrinsic/bar stack faces before acceptance.
- [ ] **Step 9: Record owner disposition.** On acceptance, add the next live A2 decision, mark SF-P2 Verified/owner accepted, commit/push/prove both repositories, then write the SF-P3 just-in-time plan. On rejection, preserve evidence and remain in SF-P2.

---

## Plan Self-Review

- [x] SF-P2 contains all and only the 25 remaining Framed identities; Weather and On This Day remain the accepted reference pair.
- [x] Every production edit has an explicit focused RED and bounded GREEN command.
- [x] Shared shells own geometry and state structure only; widgets retain data ownership and authored composition.
- [x] Stack tier choices use declared intersections; legacy incompatibility is named and storage-neutral.
- [x] Contribution graphs, complete Month semantics, event identity, service names, browser action identity, and provider attribution are preserved.
- [x] Framed cards and framed stack faces have no internal scroll owner.
- [x] Docked, intrinsic, and bar free forms remain outside this packet.
- [x] Calendar/ICS, Month, and Public Holidays remain independent pending the post-SF-P4 Unified Agenda design.
- [x] Browser evidence is registry-derived and bounded for SF-P2; SF-P4 retains exhaustive product coverage.
- [x] No storage migration, dependency, permission, provider, privacy, Store, or protected-checkout boundary changes.
