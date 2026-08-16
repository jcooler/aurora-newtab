# W5-P4 Visual and Motion System Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The current delivery policy requires inline execution; no subagent review fan-out is authorized.

**Goal:** Converge Aurora's existing visual roles and interaction floors, and make the empty Focus prompt readable over arbitrary packaged photography without changing global muted text.

**Architecture:** Keep the established Inter/Space Grotesk typography, Adaptive Stage geometry, storage, registry, and component ownership. Name the existing regional glance surfaces through theme tokens, keep editors/dialogs/trays on the opaque active-work surface, normalize the shared Settings controls to the established 36 CSS px routine target, and close only the observed reduced-motion omissions. Give the Focus prompt label a fixed local near-black surface with fixed light ink so its contrast does not depend on the photo or panel-color engine.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest, Playwright/Chromium, MV3 built extension.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 6, 7, 9, 12, and 13; `docs/superpowers/aurora-2/ROADMAP.md` W5-P4 acceptance.

## Global Constraints

- Do not change schema, migrations, registry, planner, storage, permissions, privacy, backup, connector, or Store behavior.
- Preserve the frozen Adaptive Stage geometry and the protected original checkout.
- Keep ordinary glance text at 14 CSS px, metadata at 12 CSS px, and routine controls at least 36 CSS px.
- Do not change `--canvas-fg-muted` globally; the Focus prompt treatment must be local.
- Use one focused built-extension replay with representative packaged photos and reduced-motion emulation; inspect required captures once.
- Use one implementation review and at most one fix/rereview cycle. Only Critical or Important defects block closeout.

---

### Task 1: Focused RED evidence

**Files:**
- Modify: `src/newtab/components/FocusLine.test.tsx`
- Modify: `src/settings/Switch.test.tsx`
- Modify: `src/settings/ToggleChip.test.tsx`
- Create: `scripts/preview-w5-p4.mjs`

- [x] Add focused expectations for a local Focus prompt treatment and unconditional 36px shared-control targets.
- [x] Add one Chromium replay that measures the prompt's computed contrast, representative packaged-photo screenshots, ordinary/metadata type floors, active-work surfaces, routine targets, and reduced-motion transition behavior.
- [x] Run the focused tests/replay against the current product and record the expected missing-treatment failures.

### Task 2: Minimal visual and motion convergence

**Files:**
- Modify: `src/theme/themes.css`
- Modify: `src/newtab/index.css`
- Modify: `src/newtab/components/FocusLine.tsx`
- Modify: `src/settings/sections/shared.ts`
- Modify: `src/settings/Switch.tsx`
- Modify: `src/settings/ToggleChip.tsx`
- Modify: `src/settings/Tabs.tsx`
- Modify: `src/settings/Drawer.tsx`
- Modify: `src/settings/sections/General.tsx`
- Modify: `src/settings/sections/Background.tsx`
- Modify: `src/settings/sections/Data.tsx`

- [x] Introduce semantic glance-surface and Focus-prompt tokens, then replace the existing duplicated Stage regional colors without changing geometry.
- [x] Apply the local Focus prompt label surface while leaving canvas/panel muted tokens unchanged.
- [x] Raise the shared Settings control shells to the 36px floor and add reduced-motion fallbacks to the three observed omissions.
- [x] Run the focused unit tests and Chromium replay to green; inspect the bright, dark, and detailed captures once.

### Task 3: Bounded review and closeout

**Files:**
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: this plan

- [x] Run one implementation review against the written acceptance; it returned Ready with no Critical or Important defect, so no fix/rereview cycle was opened.
- [ ] Run the full unit suite, TypeScript/production build, production bridge scan, preview build, and full browser harness once after implementation stabilizes; rerun only the actually failing family once if required.
- [ ] Update ledgers, checkpoint/push, prove clean/upstream equality and protected checkout integrity, then begin W6-P1 automatically.
