# W4-P4 Signal Dock and Connector Survival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every enabled connector that cannot receive a full Stage placement one compact, meaningful, keyboard-operable Signal Dock entry without changing the frozen planner, registry, schema, or connector authorities.

**Architecture:** Preserve the existing exactly-once Adaptive Stage allocation and mount each connector renderer only once. When a connector allocation belongs to Dock, wrap that renderer in a shared disclosure that publishes registry identity, a truthful enabled fallback, the renderer's already-held primary value when available, and one button that opens the existing detail surface. Dock-only CSS condenses the closed anatomy and lets the opened renderer use an opaque active-work surface above the existing horizontal scrollport; no data is copied, fetched, logged, or persisted by the wrapper.

**Tech Stack:** React, TypeScript, Vitest, existing Adaptive Stage planner/registry and connector renderers, CSS, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md`, sections 1, 4-7, 10-13, 15, and 16; `docs/superpowers/aurora-2/ROADMAP.md` W4-P4; `docs/superpowers/aurora-2/DECISIONS.md` through A2-D029.

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; preserve verified W4-P3 checkpoint `73121e8dfae77df86871e9e40a4069ddf6d62283` and the protected original checkout.
- Preserve schema v11, the frozen 26-entry registry, profile thresholds, footprints, capacity/allocation, Layout V2, migration/backup, storage, connector snapshot/permission, secret/privacy, and Store contracts.
- Implement only W4-P4. W4-P5 owns launcher consolidation and remaining RSS/Home Assistant/Calendar/Weather content variants; W5 owns the Utility Tray redesign.
- Keep every active registry ID mounted exactly once. A Dock wrapper may present an existing renderer but must not duplicate its hooks, request ownership, state, actions, links, or programmatic content.
- Closed Dock entries retain identity, truthful state/fallback, one useful primary value when current renderer data exists, and one 36 CSS px minimum entry control. Open detail keeps existing actions/link security and restores focus on Escape.
- Use focused tests while developing. Allow one implementation review and one fix/rereview. Only Critical/Important defects block. Run the full unit suite, production/preview builds, production bridge scan, and full browser harness once after stabilization; if the browser harness fails, fix only the actual family and rerun once.

---

### Task 1: Add one shared connector Dock disclosure

**Files:**
- Create: `src/newtab/components/SignalDockEntry.tsx`
- Create: `src/newtab/components/SignalDockEntry.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`

**Interfaces:**
- Consumes: `WidgetRegistryEntry.availability.kind === 'connector'`, the existing single renderer child, and App-owned open state.
- Produces: `SignalDockEntry({ entry, open, onOpenChange, children })`, `data-signal-dock-entry`, `data-signal-dock-open`, `data-signal-dock-content`, and an `aria-expanded` button named `Open {label} details` / `Close {label} details`.

- [x] Write failing component/App tests proving only connector allocations in Dock receive the wrapper, the child renders once, identity plus truthful `Enabled` fallback remain visible, one disclosure can be open, Escape closes and restores its invoking button, and moving the connector back to its board zone removes the Dock wrapper without changing allocation identity.
- [x] Run `npx vitest run src/newtab/components/SignalDockEntry.test.tsx src/newtab/App.test.tsx` and confirm the new assertions fail because the shared disclosure does not exist.
- [x] Implement the minimal shared disclosure and App-owned single-open connector ID. Do not clone the child; render it once inside `data-signal-dock-content`. Clear stale open state when the ID no longer has a Dock allocation.
- [x] Run the same focused test command and `npx tsc --noEmit`; require green output.
- [x] Commit `feat(dock): add operable connector entries`.

### Task 2: Replace preserved full-card Dock geometry with intentional condensed anatomy

**Files:**
- Modify: `src/newtab/components/BoardItem.tsx`
- Modify: `src/newtab/components/BoardItem.test.tsx`
- Modify: `src/newtab/dockBlockSizes.ts`
- Modify: `src/newtab/dockBlockSizes.test.ts`
- Modify: `src/newtab/index.css`
- Create: `src/newtab/signalDockPresentation.test.ts`

**Interfaces:**
- Consumes: Task 1 data hooks and existing connector DOM, including W4-P3 `data-work-pulse-summary` anatomy.
- Produces: a finite connector Dock inline floor, one-row collapsed presentation, hidden closed interactive descendants, one current primary-value preview where renderer data exists, and a bounded open detail surface that preserves original controls and safe external links.

- [x] Write failing source/component tests proving connector Dock allocations no longer use legacy 18-35rem renderer compatibility floors or tall block-size calibration, while non-connector compatibility remains unchanged. Assert 14px ordinary text, a 36px disclosure target, no root transform/percentage geometry/whole-widget height hide, closed descendants cannot receive pointer or keyboard focus, and the open surface is bounded above Dock with visible focus.
- [x] Run `npx vitest run src/newtab/components/BoardItem.test.tsx src/newtab/dockBlockSizes.test.ts src/newtab/signalDockPresentation.test.ts` and confirm the new assertions fail against the W3 compatibility bridge.
- [x] Implement Dock-only styles and connector sizing. Closed entries show the registry identity plus `data-work-pulse-summary` or the renderer's first meaningful current value; `Enabled` remains only when no current value exists. The open surface reveals the same mounted renderer and original actions, never a duplicate renderer or synthetic provider URL.
- [x] Run the Task 1 and Task 2 focused suites together plus `npx tsc --noEmit`; require green output.
- [x] Commit `style(dock): condense connector survival entries`.

### Task 3: Prove every enabled connector survives constrained and dense allocation

**Files:**
- Create: `scripts/preview-w4-p4.mjs`
- Modify: `scripts/preview.mjs` only if an existing assertion directly contradicts W4-P4 written behavior.

**Interfaces:**
- Consumes: built preview extension, all nine frozen connector IDs (`ics`, `status`, `github`, `gitlab`, `jira`, `vercel`, `homeassistant`, `rss`, `crypto`), scoped seeded snapshots, and current Stage profile/density data hooks.
- Produces: one focused replay and required captures under `outputs/w4-p4/` without network traffic or durable fixture residue.

- [x] Add a focused built-extension replay that enables all nine connectors with safe scoped fixture data, checks each enabled connector exactly once across board plus Dock at constrained Compact and dense Standard cases, and requires every Docked connector to expose identity, current/fallback state, a primary value, and an operable disclosure.
- [x] In the same replay, open one non-linking connector (Status or Crypto), verify the existing detail content becomes reachable, close with Escape, prove focus restoration, Tab-nearest Dock scrolling, safe existing external links, no clipping/collision, zero connector request attributable to presentation, zero runtime errors, and exact storage/viewport cleanup.
- [x] Build preview once with `npm run build:preview`, run `node scripts/preview-w4-p4.mjs`, inspect Compact 800x600, Standard 1600x900, and Display 2560x1440 captures once, and fix only genuine W4-P4 failures.
- [x] Commit `test(dock): prove connector survival and operation`.

### Task 4: Bounded review, final gates, and checkpoint

**Files:**
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: this plan

**Interfaces:**
- Consumes: the stabilized W4-P4 implementation and focused evidence.
- Produces: one review result, final verification record, decision A2-D030, pushed checkpoint, and clean/upstream proof.

- [ ] Run one implementation review against only W4-P4 acceptance. Fix only Critical/Important findings and perform at most one focused rereview; ledger Minor/cosmetic observations without reopening.
- [ ] After implementation stabilizes, run the full unit suite once, TypeScript once, production and preview builds once, the production bridge scan once, and the full browser harness once. If the harness fails, fix the actual failing family and rerun it once only.
- [ ] Mark W4-P4 Verified, record exact evidence and A2-D030, commit `docs: checkpoint W4-P4`, push, and prove target/upstream equality plus clean target/protected-original worktrees. Do not repeat full gates for documentation.
- [ ] Begin W4-P5 automatically. Chrome Web Store actions remain blocked until explicit W6-P5 approval.

## Definition of Done

W4-P4 is complete when every enabled connector is represented exactly once in the active profile; any connector assigned to Signal Dock has compact identity, truthful state/fallback, a useful primary value when held data exists, and a keyboard-operable detail path; opening details preserves existing actions and link safety without duplicate requests or mounts; constrained/dense focused evidence and required captures pass; no frozen schema/registry/allocation/storage/privacy/permission/Store contract changes; one bounded review has no Critical/Important issue open; and the checkpoint is pushed cleanly.
