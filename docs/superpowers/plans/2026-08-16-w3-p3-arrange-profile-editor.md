# W3-P3 Arrange/Profile Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary percentage-based Arrange bridge with a semantic active-profile editor that previews deterministic placement changes and commits them only on Save.

**Architecture:** Keep editing rules pure in a small `profileEditor` module. `ArrangeController` owns one in-memory session and exposes accessible pointer/keyboard controls over the live Adaptive Stage; `App` supplies the current profile and uses the draft profile as planner input for preview only. Save replaces only the edited profile under the existing storage authority, while Cancel performs no write and W3-P4 retains ownership of deleting legacy code/data.

**Tech Stack:** React, TypeScript, Vitest, Chrome extension storage, CSS Grid, Vite, Playwright-backed `scripts/preview.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md`, section 8; `docs/superpowers/aurora-2/ROADMAP.md` W3-P3; `docs/superpowers/aurora-2/DECISIONS.md` A2-D024.

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; preserve the clean W3-P2 checkpoint `cd6f7e64d98113074c5c1f5c23b9b781adad62ec` and the protected original checkout.
- Implement only the written W3-P3 acceptance boundary: reorder, eligible-zone move, allowed variant, priority, semantic keyboard/pointer editing, preview, undo latest edit, Cancel, Save, reset one profile, copy another profile, placement lock, and migration-safe persistence.
- Preserve schema v11, source-owned registry defaults, exactly-once allocation, storage authority, backup behavior, privacy/secret handling, and the W3-P2 profile/density/allocation contracts.
- Save is the only draft commit. Cancel writes nothing and restores the exact pre-session rendered layout. A rejected Save keeps the editor/draft open with a fixed safe alert.
- Replace only runtime use of the legacy percentage Arrange bridge. Do not delete `layout.legacy`, `PositionedBlock`, legacy CSS, or compatibility helpers; W3-P4 owns their removal.
- Do not add dependencies, permissions, telemetry, remote code, Store changes, Utility Tray work, widget-content redesign, or broader browser matrices.
- Develop with focused tests. After implementation stabilizes, allow one implementation review and one fix/rereview cycle, then run the full unit suite, production/preview builds, and full browser harness once. If the harness fails, fix the actual failing family and rerun once.

---

### Task 1: Pure semantic profile-editing model

**Files:**
- Create: `src/newtab/arrange/profileEditor.ts`
- Create: `src/newtab/arrange/profileEditor.test.ts`
- Modify: `src/lib/layout/v2.ts`
- Modify: `src/lib/layout/v2.test.ts`

**Interfaces:**
- Consumes: `LayoutV2`, `LayoutProfile`, `Placement`, `BlockId`, and `WidgetRegistryEntry`.
- Produces: `ProfileOverrides`, `ArrangeEdit`, `effectiveEditablePlacement`, `applyArrangeEdit`, `undoArrangeEdit`, `resetProfileDraft`, `copyProfileDraft`, and `withProfileOverrides`.

- [ ] Write focused RED tests proving source-default fallback, active-profile-only overrides, stable reordering, eligible-zone moves, variant footprint updates, priority/Dock constraints, span changes, lock/non-lock behavior, undo-one-step history, reset-one, deterministic copy, and input immutability.
- [ ] Add RED persistence-helper tests proving that replacing one profile preserves every other profile and `legacy`, normalizes orders, and never persists source defaults that the user did not edit.
- [ ] Implement immutable helpers. Every accepted edit pushes one prior override snapshot; rejected/no-op edits do not. Variant changes adopt the registry footprint, zone/order edits normalize only affected zones, and a locked entry accepts only the unlock edit.
- [ ] Run `npx vitest run src/newtab/arrange/profileEditor.test.ts src/lib/layout/v2.test.ts` and keep the focused suite green.
- [ ] Commit as `feat(arrange): add semantic profile draft model`.

### Task 2: Live preview and accessible editor controls

**Files:**
- Modify: `src/newtab/arrange/ArrangeController.tsx`
- Modify: `src/newtab/arrange/ArrangeController.test.tsx`
- Modify: `src/newtab/arrange/draftLayout.ts`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Consumes: Task 1 editing helpers, active `LayoutProfile`, active registry entries, current `LayoutV2`, and existing storage authority.
- Produces: `ArrangePreview { profile, overrides }`, an editor overlay, and App planner preview input.

- [ ] Write focused RED component tests proving entry snapshots the active profile, live preview replans without storage writes, one active selection, logical focus, visible eligible-zone/variant/priority/span/lock controls, pointer and keyboard reorder/move, and reduced-motion classes.
- [ ] Add RED session tests proving Undo reverts only the latest edit, Reset profile and Copy profile affect only the draft, Cancel performs zero writes and restores exact pre-session rendering, and Save performs one authority-backed active-profile replacement while preserving other profiles and legacy.
- [ ] Add RED failure/lifecycle tests proving rejected Save retains the draft and exposes a fixed non-color-only alert; Escape acts as Cancel; repeated entry starts from fresh storage; viewport changes do not silently retarget the session; and close restores focus to the Settings gear.
- [ ] Replace percentage draft rendering in `App` with semantic preview overrides passed to the existing W3-P2 planner. Keep the legacy modules present but unused for W3-P4 cleanup.
- [ ] Replace immediate pointer-up/arrow-key storage writes with draft edits. Render labelled zone targets, Move earlier/later, allowed variant, priority, span, lock, Undo, Reset profile, Copy from profile, Cancel, and Save controls with at least 36px routine targets.
- [ ] Run `npx vitest run src/newtab/arrange/profileEditor.test.ts src/newtab/arrange/ArrangeController.test.tsx src/newtab/App.test.tsx src/lib/layout/adaptiveStage.test.ts`.
- [ ] Commit as `feat(arrange): edit Adaptive Stage profiles`.

### Task 3: Canonical browser evidence

**Files:**
- Modify: `scripts/preview.mjs`
- Modify: packet-local tests only when a real browser failure demonstrates the need

**Interfaces:**
- Consumes: the built semantic editor from Task 2.
- Produces: one named W3-P3 aggregate and durable compact/standard/large editor captures.

- [ ] Pre-author `W3-P3 semantic Arrange/profile editor semantics` in the existing W3 evidence family without deleting or renaming predecessor results.
- [ ] Exercise one canonical Standard session plus Compact and Display/Ultrawide preview witnesses: keyboard reorder, eligible-zone move, variant/priority/span/lock edit, undo, copy, reset-one, Cancel no-write/exact restore, Save active-profile-only persistence, rejected Save recovery, focus restoration, no overlap/clipping, and `errors: []`.
- [ ] Save only the written compact, standard, and large visible-packet evidence needed to judge editor clarity and focus; do not add a cross-product matrix.
- [ ] Run focused browser development probes for actual changed families, not the full harness.
- [ ] Commit as `test(arrange): prove W3-P3 editor semantics`.

### Task 4: One review/fix cycle and final packet gate

**Files:**
- Modify: only files required by confirmed Critical or Important findings
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**
- Consumes: the stabilized W3-P3 implementation and its focused evidence.
- Produces: a reviewed, verified, pushed W3-P3 checkpoint and W3-P4 start state.

- [ ] Perform one implementation review against the explicit W3-P3 criteria. Fix only Critical/Important findings, then perform one focused rereview. Record Minor/cosmetic issues in the ledger without reopening the packet.
- [ ] Run the final full unit suite once, then production and preview builds once, the production bridge scan, and the full browser harness once. If the final harness fails, diagnose/fix only the actual failing family and rerun it once.
- [ ] Inspect the required captures once and keep automated CSS-pixel/keyboard evidence distinct from native zoom, mixed-DPI, and real screen-reader ceilings.
- [ ] Mark W3-P3 Verified, append A2-D025 freezing editor/save/legacy-handoff behavior, and record exact evidence and Minor follow-ups. Documentation changes do not trigger another full gate.
- [ ] Run `git diff --check`, inspect status/stat, commit `docs: checkpoint W3-P3`, push the existing branch, and prove target/upstream equality, clean target, and unchanged clean protected original.
- [ ] Begin W3-P4 automatically. Chrome Web Store work remains blocked until explicit W6-P5 approval.

## Definition of Done

W3-P3 is complete when the active profile can be semantically edited by pointer and keyboard; preview/undo/reset/copy/lock work without writes; Save alone persists one normalized profile under the storage authority while preserving other profiles and legacy; Cancel and failed Save preserve user data; the single bounded review/fix cycle has no Critical or Important issue open; the one final gate is green; ledgers are checkpointed and pushed; and W3-P4 has begun.
