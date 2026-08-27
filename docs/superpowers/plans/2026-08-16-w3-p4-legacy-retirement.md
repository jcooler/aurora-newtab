# W3-P4 Legacy Retirement Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the retired percentage-placement and whole-widget height-hide machinery after proving the Adaptive Stage/editor replacement preserves semantic behavior and exact rollback provenance.

**Architecture:** Treat the frozen Layout V2 `legacy` member as migration/backup provenance, not a live renderer input. Delete unreachable percentage rendering, snapping, clamping, pill-dodge, and legacy edit helpers; keep legacy validation, v9-to-v11 migration, backup import/export, and exact Save preservation. Remove only height-tier behavior capable of hiding an entire enabled BoardItem; W4 retains ownership of content-detail variants inside represented widgets.

**Tech Stack:** React, TypeScript, Vitest, Chrome extension storage, CSS Grid, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md`, sections 5.3-5.6 and 8; `docs/superpowers/aurora-2/ROADMAP.md` W3-P4; `docs/superpowers/aurora-2/DECISIONS.md` A2-D023 through A2-D025.

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; preserve checkpoint `315901643c69c8502b24a4fa8625bd552dc1ce5a` and the protected original checkout.
- Preserve the frozen Layout V2/schema-v11 and 26-entry registry contracts. `layout.legacy` remains optional exact provenance accepted by migration and backup; W3-P4 removes live percentage behavior, not stored rollback data.
- Implement only the written W3-P4 boundary: fixed percentage machinery, whole-widget height-hide retirement, replacement parity, and rollback evidence. Do not redesign widget content, Dock variants, hierarchy, Utility Tray, permissions, privacy, or storage authority.
- Content-detail compaction inside an already represented widget remains W4-owned and is not a W3-P4 blocker.
- Develop with focused tests. Allow one implementation review and one fix/rereview cycle. Only Critical/Important defects block. Run the full unit suite, production/preview builds, and browser harness once after stabilization; if the harness fails, fix only the actual failing family and rerun once.

---

### Task 1: Freeze retirement and rollback contracts

**Files:**
- Create: `src/lib/layout/legacyRetirement.test.ts`
- Modify: `src/newtab/App.test.tsx`
- Reuse: `src/lib/layout/v2.test.ts`, `src/lib/backup.test.ts`, `src/lib/storage/migrations.test.ts`

- [ ] Write focused RED guards proving production source has no `PositionedBlock`, percentage draft context, snap/pill geometry, or `withLegacyBlockPosition` runtime seam.
- [ ] Add an App parity test proving identical semantic allocations when the same profile overrides are supplied with and without extreme legacy percentage provenance.
- [ ] Pin rollback evidence: legacy v9 migration remains deterministic, current backup validation/import preserves exact optional legacy provenance, and W3-P3 active-profile Save preserves it byte-for-byte.
- [ ] Run only the focused retirement, App, V2, backup, and migration tests while developing.

### Task 2: Delete dormant percentage placement machinery

**Files:**
- Delete: `src/newtab/components/PositionedBlock.tsx`
- Delete: `src/newtab/components/PositionedBlock.test.tsx`
- Delete: `src/lib/layout/snap.ts`
- Delete: `src/lib/layout/snap.test.ts`
- Delete: `src/lib/layout/pillPlacement.ts`
- Delete: `src/lib/layout/pillPlacement.test.ts`
- Delete: `src/lib/layout/clamp.ts`
- Delete: `src/lib/layout/clamp.test.ts`
- Rename: `src/newtab/arrange/draftLayout.ts` to `src/newtab/arrange/arrangePreview.ts`
- Modify: `src/newtab/App.tsx`, `src/newtab/arrange/ArrangeController.tsx`, `src/lib/hooks/useViewportPanelAnchor.ts`, `src/lib/layout/anchor.ts`, `src/lib/layout/types.ts`, `src/lib/layout/v2.ts`, and focused tests

- [ ] Move the shared pixel `Size` type to active panel-anchor code, update semantic preview imports, and remove the unused percentage context/type alias.
- [ ] Remove `legacyLayoutOf` and `withLegacyBlockPosition`; retain legacy validation/mapping and active-profile preservation.
- [ ] Delete the unreachable render/drag/snap/pill modules and their obsolete tests.
- [ ] Update only production comments that would otherwise describe deleted runtime architecture; record broader historical naming as Minor.
- [ ] Run focused retirement, layout, anchor, App, Arrange, backup, and migration tests, then commit `refactor(layout): retire percentage placement runtime`.

### Task 3: Retire whole-widget height hiding

**Files:**
- Modify: `src/newtab/widgets/github/GithubWidget.tsx`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.tsx`
- Modify: `src/newtab/widgets/vercel/VercelWidget.tsx`
- Modify: their focused tests
- Modify: `src/newtab/index.css`

- [ ] Write focused RED tests proving graph-only GitHub/GitLab and crowded Vercel remain represented independently of legacy height-tier class names.
- [ ] Remove component paths that place `hidden <height>:block` on an entire widget section. Keep semantic compact handling and internal detail variants intact for W4.
- [ ] Remove dead fixed-rail selectors/tokens and percentage-era CSS comments that have no production consumer; do not remove active responsive typography/control rules.
- [ ] Add a source guard preventing reintroduction of whole-widget height-hide classes outside explicit internal-detail ownership.
- [ ] Run the focused widget/CSS/retirement tests, then commit `refactor(layout): retire whole-widget height hides`.

### Task 4: Bounded review, evidence, and checkpoint

**Files:**
- Modify: `scripts/preview.mjs` or a focused W3-P4 replay only if required for named evidence
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

- [ ] Run one implementation review against the explicit W3-P4 criteria. Fix only Critical/Important findings and perform one focused rereview; ledger Minor/cosmetic items without reopening.
- [ ] Run the final full unit suite once, production and preview builds once, the production bridge scan, and the full browser harness once. If the harness fails, fix the actual family and rerun once only.
- [ ] Capture/inspect one compact, one standard, and one large semantic-layout witness seeded with legacy provenance; prove no percentage positioning, no whole-widget disappearance, exact rollback preservation, bounded geometry, and no runtime errors.
- [ ] Mark W3-P4 Verified, record exact gates and A2-D026, commit `docs: checkpoint W3-P4`, push, and prove target/upstream equality plus clean target/protected-original worktrees.
- [ ] Begin W4-P1 automatically. Chrome Web Store actions remain blocked until explicit W6-P5 approval.

## Definition of Done

W3-P4 is complete when no production runtime can render or edit viewport-percentage placement; no legacy height tier can hide an entire enabled BoardItem; semantic allocation is identical regardless of optional legacy provenance; migration, backup, restore, and W3-P3 Save preserve exact rollback data under the frozen schema; the bounded review has no Critical/Important issue open; final gates and visible evidence are recorded; the checkpoint is pushed and clean; and W4-P1 has begun.
