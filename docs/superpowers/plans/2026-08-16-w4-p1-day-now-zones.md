# W4-P1 Day and Now Zones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the frozen Adaptive Stage Day and Now regions into responsive product surfaces: Day retains useful date context even when sparse, Now presents a calm Clock/Greeting/Search/Focus hierarchy, and large displays reveal useful date detail.

**Architecture:** Keep W3 profile selection, registry identity/defaults, placement, capacity, BoardItem, and semantic zone allocation unchanged. Add a render-only Day context component for the empty Day region, expose deterministic local-date formatting beside the existing clock hook, and use BoardItem/profile-owned CSS to refine Day/Now visual hierarchy without adding a second layout authority.

**Tech Stack:** React, TypeScript, Vitest, CSS Grid/container-aware selectors, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md`, sections 5.4-5.5, 6-7, 12-13; `docs/superpowers/aurora-2/ROADMAP.md` W4-P1; `docs/superpowers/aurora-2/DECISIONS.md` A2-D023 through A2-D026.

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; preserve verified W3-P4 checkpoint `44c5eef48a166ecc4a1659949a2f97f1ec9a2c76` and the protected original checkout.
- Preserve schema v11, Layout V2 including optional exact `legacy` provenance, the frozen 26-entry registry, profile thresholds, allocation/capacity rules, storage authority, migration/backup behavior, permissions, privacy, and Store state.
- Implement only W4-P1: responsive Day context, Clock/Greeting/Search/Focus hierarchy, and useful larger-display detail.
- W4-P2 owns Aurora Briefing; W4-P3 owns Work Pulse connector forms; W4-P4 owns condensed Dock renderers; W4-P5 owns launcher consolidation and remaining Calendar/Weather/RSS/Home Assistant content variants. Do not implement those here.
- Use focused tests while developing. Allow one implementation review and one fix/rereview. Only Critical/Important defects block. Run the final full unit suite, production/preview builds, production bridge scan, and browser harness once after stabilization; if the browser harness fails, fix only the actual failing family and rerun once.

---

### Task 1: Freeze Day/Now presentation contracts

**Files:**
- Modify: `src/lib/clock.ts`
- Modify: `src/lib/clock.test.ts`
- Create: `src/newtab/components/DayContext.tsx`
- Create: `src/newtab/components/DayContext.test.tsx`
- Modify: `src/newtab/components/Clock.test.tsx`
- Modify: `src/newtab/App.test.tsx`

- [ ] Add deterministic local-date formatting tests covering compact and long labels without changing local-day ownership.
- [ ] Add RED component tests for an empty-Day context with semantic `<time>` markup and a distinct long display detail.
- [ ] Add RED App tests proving the context appears only when Day has no allocation and does not become a registry/BoardItem identity.
- [ ] Pin the existing semantic allocation and Clock/Greeting/Search/Focus order so presentation work cannot move, duplicate, or silently Dock those source-default entries.

### Task 2: Implement responsive Day context and large-display detail

**Files:**
- Modify: `src/lib/clock.ts`
- Create: `src/newtab/components/DayContext.tsx`
- Modify: `src/newtab/components/Clock.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: focused tests above

- [ ] Implement locale-stable weekday/month/day formatting from the same `useNow` sample used by each render surface; do not add storage or network state.
- [ ] Render Day context only for a truly empty Day allocation, so sparse profiles remain informative without consuming planner capacity or overlapping Day widgets.
- [ ] Add a long date detail to Clock markup that remains secondary and CSS-controlled; keep the existing `<time>` value, ticking, 12/24-hour setting, and accessible semantics unchanged.
- [ ] Run focused clock/component/App tests, then commit `feat(stage): add responsive Day context`.

### Task 3: Refine the Day/Now visual hierarchy

**Files:**
- Modify: `src/newtab/index.css`
- Modify: `src/lib/layout/legacyRetirement.test.ts`
- Modify: `src/newtab/App.test.tsx`

- [ ] Make Now a calm photo-forward anchor rather than another framed card while Day remains one coherent glance surface; do not alter grid tracks, padding, capacity, or allocation.
- [ ] Scale empty-Day context and Clock date detail by the existing Compact/Standard/Display variants. Large displays add detail; Compact keeps the core hierarchy readable.
- [ ] Keep Clock primary, Greeting secondary, Search operable, and Focus legible with existing target, focus, reduced-motion, and text-floor contracts.
- [ ] Add source guards against viewport-percentage positioning, new height-hide tiers, root scaling, registry mutation, or layout geometry duplication.
- [ ] Run the focused Day/Now/CSS/layout tests, then commit `style(stage): establish Day and Now hierarchy`.

### Task 4: Bounded review, evidence, and checkpoint

**Files:**
- Create: `scripts/preview-w4-p1.mjs`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

- [ ] Run one implementation review against only the explicit W4-P1 criteria. Fix only Critical/Important findings and perform at most one focused rereview; ledger Minor/cosmetic issues without reopening.
- [ ] Run the final full unit suite once, TypeScript, production and preview builds once, the production bridge scan, and the full browser harness once. If the harness fails, fix the actual family and rerun once only.
- [ ] Run one focused built-extension replay with sparse and populated Day states plus Compact 800x600, Standard 1600x900, and Display 2560x1440 Now witnesses. Prove exact semantic hierarchy, single ownership, bounded/paint-contained geometry, targets/focus, no page clipping, useful expanded date detail with Compact remaining concise, and zero runtime errors.
- [ ] Inspect the three required captures once, mark W4-P1 Verified, record exact gates and A2-D027, commit `docs: checkpoint W4-P1`, push, and prove target/upstream equality plus clean target/protected-original worktrees.
- [ ] Begin W4-P2 automatically. Chrome Web Store actions remain blocked until explicit W6-P5 approval.

## Definition of Done

W4-P1 is complete when sparse Day remains meaningfully date-contextual without consuming planner capacity; populated Day remains allocation-owned and collision-free; Now presents Clock, Greeting, Search, and Focus in their frozen semantic hierarchy; larger displays add useful date detail while constrained profiles retain the core content and operability; no schema/registry/storage/privacy/permission/Store contract changes; the bounded review has no Critical/Important issue open; final gates and inspected captures are recorded; and the checkpoint is pushed cleanly.
