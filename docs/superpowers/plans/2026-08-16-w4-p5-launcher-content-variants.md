# W4-P5 Launcher Shelf and Remaining Content Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate co-located Quick Links and Bookmarks into one launcher shelf and make Calendar, Weather, Home Assistant, and RSS reveal useful Compact, Standard, and Expanded content from data they already hold.

**Architecture:** Keep the frozen registry and planner authoritative. App groups only geometrically adjacent Links and Bookmarks allocations inside a render-only grid wrapper that reproduces their assigned tracks, while separated or Dock allocations remain independent and exactly once. Pass each existing allocation variant to its renderer so the four remaining widgets can select bounded presentation rows or reveal their already-renderable forecast without changing fetching, persistence, permissions, or configuration.

**Tech Stack:** React, TypeScript, Vitest, existing Adaptive Stage planner/registry and widget renderers, CSS, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md`, sections 4-7; `docs/superpowers/aurora-2/ROADMAP.md` W4-P5; `docs/superpowers/aurora-2/DECISIONS.md` through A2-D030.

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; preserve verified W4-P4 checkpoint `03d8d73d6eb32aba96f1b7e663d9beb961b51fe1` and the protected original checkout.
- Preserve schema v11, the frozen 26-entry registry, profile thresholds, footprints, capacities/allocation, Layout V2, migrations/backups, storage, connector snapshot/permission authorities, secrets/privacy copy, and Store state.
- Implement only W4-P5. Do not absorb W5 Utility Tray behavior or W6 Store work.
- Keep every active registry ID mounted exactly once. Launcher consolidation is render-only and must preserve each allocation's identity, focusable descendants, popovers, links, and planner-owned footprint.
- Content variants may select only already-held component data. They start no request, change no fetch configuration, persist/log nothing, and never expose credentials, capability URLs, or raw payloads.
- Use focused tests during development. Allow one implementation review and one fix/rereview. Only Critical/Important defects block. Run the full unit suite, production/preview builds, production bridge scan, and full browser harness once after stabilization; if the browser harness fails, fix only the actual family and rerun once.

---

### Task 1: Consolidate adjacent launcher allocations without changing planning

**Files:**
- Create: `src/newtab/components/LauncherShelf.tsx`
- Create: `src/newtab/components/LauncherShelf.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Consumes: the existing `links` and `bookmarks` `StageAllocation` objects after planning.
- Produces: `resolveLauncherShelf(allocations)` returning a shelf only when both allocations have edge-adjacent finite rectangles in the same non-Dock zone; `LauncherShelf` renders both existing `BoardItem`s once in equivalent nested tracks and labels the shared surface `Launchers`.

- [x] Write failing tests proving adjacent Links and Bookmarks become one `data-launcher-shelf` group while both `data-block-id` identities and their controls remain exactly once; non-adjacent and split-zone allocations are not grouped.
- [x] Run `npx vitest run src/newtab/components/LauncherShelf.test.tsx src/newtab/App.test.tsx` and confirm failure because no shelf resolver/component exists.
- [x] Implement the smallest adjacency resolver, nested grid wrapper, App composition, and quiet shared shelf surface. Rebase child grid coordinates relative to the wrapper without mutating the planner result.
- [x] Run the focused tests and `npx tsc --noEmit`; require green output.
- [x] Commit `feat(launchers): consolidate adjacent links and bookmarks`.

### Task 2: Give Calendar, RSS, and Home Assistant bounded content variants

**Files:**
- Modify: `src/newtab/widgetRenderers.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.test.tsx`
- Modify: `src/newtab/widgets/rss/RssWidget.tsx`
- Modify: `src/newtab/widgets/rss/RssWidget.test.tsx`
- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx`
- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Consumes: `WidgetRendererProps.stageVariant` from the allocation and already-derived agenda rows, headlines, entity states, and configured HA actions.
- Produces: Calendar row budgets `0/2/5`, RSS headline budgets `2/6/configured maximum`, and HA budgets `2 states plus an action-only fallback / 4 states and 2 actions / existing full 6 states and 3 actions` for Compact/Standard/Expanded respectively.

- [x] Write failing component tests with literal fixtures proving each variant's visible content budget, order, safe existing links/actions, and action-only HA fallback.
- [x] Run the three widget test files and confirm the new variant cases fail because allocation variants are not consumed.
- [x] Pass `stageVariant` through the exhaustive renderer interface and implement only the bounded render-time slices. Remove the superseded expanded RSS cap so hidden links are not mounted focusably.
- [x] Run the three focused suites plus `src/newtab/App.test.tsx` and `npx tsc --noEmit`; require green output.
- [x] Commit `feat(widgets): add remaining content variants`.

### Task 3: Reveal the fuller Weather trend for Expanded allocations

**Files:**
- Modify: `src/newtab/widgets/weather/WeatherWidget.tsx`
- Modify: `src/newtab/widgets/weather/WeatherWidget.test.tsx`

**Interfaces:**
- Consumes: `stageVariant` and the existing current/hourly weather snapshot.
- Produces: Compact current conditions, Standard user-operable hourly disclosure, and Expanded fuller trend visible from the existing forecast anatomy. The existing disclosure callback continues to own elevation and cleanup.

- [x] Write a failing Weather component test proving an Expanded allocation exposes the hourly/trend content from the same cached snapshot without a click or extra refresh, while Compact/Standard remain collapsed initially and Standard disclosure still works.
- [x] Run `npx vitest run src/newtab/widgets/weather/WeatherWidget.test.tsx` and confirm the Expanded case fails because only local click state controls detail.
- [x] Implement the minimal variant-aware reveal while preserving the existing refresh owner, callback cleanup, accessible state, and manual Standard disclosure.
- [x] Run the Weather test, the combined Task 2 suites, and `npx tsc --noEmit`; require green output.
- [x] Commit `feat(weather): reveal expanded forecast content`.

### Task 4: Focused browser proof, bounded review, final gates, and checkpoint

**Files:**
- Create: `scripts/preview-w4-p5.mjs`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: this plan

**Interfaces:**
- Consumes: stabilized W4-P5 implementation and built preview extension.
- Produces: focused Compact/Standard/Display evidence and captures under `outputs/w4-p5/`, one implementation review/fix cycle, final verification record, decision A2-D031, pushed checkpoint, and clean/upstream proof.

- [x] Add one focused replay that seeds safe launcher/Calendar/Weather/RSS/HA data, places the two launchers adjacently, and proves one shelf plus exact IDs, focusable/safe launcher controls, the four content progressions, containment, zero runtime errors, no presentation-attributable requests, and exact cleanup at Compact 800x600, Standard 1600x900, and Display 2560x1440.
- [x] Build preview once, run the focused replay once, inspect the three required captures, and fix only genuine W4-P5 acceptance failures.
- [x] Run one implementation review against only W4-P5 acceptance. Fix only Critical/Important findings and perform at most one focused rereview; ledger Minor/cosmetic observations without reopening.
- [x] After stabilization, run the full unit suite once, TypeScript once, production and preview builds once, production bridge scan once, and full browser harness once. If the harness fails, fix the actual failing family and rerun it once only.
- [x] Mark W4-P5 Verified, record exact evidence and A2-D031, commit `docs: checkpoint W4-P5`, push, and prove target/upstream equality plus clean target/protected-original worktrees. Do not repeat full gates for documentation.
- [x] Begin W5-P1 automatically. Chrome Web Store actions remain blocked until explicit W6-P5 approval.

## Definition of Done

W4-P5 is complete when adjacent Links and Bookmarks render as one accessible launcher shelf while preserving both registry identities and all controls exactly once; Calendar, Weather, RSS, and Home Assistant visibly progress from useful Compact to Standard to Expanded content using already-held data; no frozen schema/registry/allocation/storage/privacy/permission/Store contract changes; focused evidence and required captures pass; one bounded review has no Critical/Important issue open; and the checkpoint is pushed cleanly.
