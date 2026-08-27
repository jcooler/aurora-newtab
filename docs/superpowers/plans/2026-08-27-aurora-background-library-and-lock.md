# Aurora Background Library and Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Aurora's bundled photo library and let a person lock or explicitly select a bundled background.

**Architecture:** Extend `PhotoPrefs` with an optional lock bit, keep rotation logic pure, and expose selection through the existing Settings background owner. Allow runtime manifest entries to reference either an untouched original or the legacy tier pair so the six new files remain source-resolution without forcing an unrelated migration of the retained catalog.

**Tech Stack:** React 19, TypeScript, Vitest, Tailwind CSS, Chrome MV3 storage, Sharp asset inspection, Playwright browser QA

**Spec:** `docs/superpowers/specs/2026-08-27-aurora-background-library-and-lock-design.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`.
- Do not modify `D:\DEV\Chrome plugin` or Chrome Web Store state.
- Use focused RED/GREEN tests, then one stabilized build and browser gate.
- New images use authentic original-resolution files with no baked crop.
- Preserve uploads, gradient, NASA, serialized storage, permissions, LQIP, and daily local-day behavior.

---

### Task 1: Lock-aware rotation and storage contract

**Files:**
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/services/photos/rotation.ts`
- Test: `src/services/photos/rotation.test.ts`
- Test: `src/lib/backup.test.ts`

**Interfaces:**
- Consumes: existing `PhotoPrefs`, `resolvePhoto`, and `nextPhoto` contracts
- Produces: optional `PhotoPrefs.locked?: boolean`; locked `resolvePhoto` returns the stored bounded index and does not report rotation

- [ ] **Step 1: Write failing tests for locked new-day behavior, preserved lock during refresh, and backup acceptance.**
- [ ] **Step 2: Run the focused tests and observe the intended failures.**
- [ ] **Step 3: Add `locked?: boolean`, validate it when present, and short-circuit daily rotation while locked.**
- [ ] **Step 4: Run the focused tests and confirm they pass.**

### Task 2: Mixed original and legacy photo catalog

**Files:**
- Modify: `scripts/photo-candidates.json`
- Modify: `scripts/verify-photo-manifest.mjs`
- Modify: `src/services/photos/photos.json`
- Modify: `src/services/photos/index.ts`
- Modify: `src/services/photos/index.test.ts`
- Add: `public/photos/32-qNXhVgRfU0E-original.jpg`
- Add: `public/photos/33-0hU6r-vMtao-original.jpg`
- Add: `public/photos/34-P-wAARoptz8-original.jpg`
- Add: `public/photos/35-oYEGPZebzGw-original.jpg`
- Add: `public/photos/36-j3f1lwXBuAI-original.jpg`
- Add: `public/photos/37-V7EgUtCnvLY-original.jpg`
- Remove: the four packaged files belonging to rejected entries `23tpftFIAD0` and `commons-denali-aurora`

**Interfaces:**
- Consumes: `BUNDLED`, `bundledUrl(index, tier)`, manifest credits, and LQIP
- Produces: `BundledPhoto` union supporting `original` or `tiers`; `bundledUrl` prefers untouched originals

- [ ] **Step 1: Write failing manifest tests for the two removals, six additions, and original URL preference.**
- [ ] **Step 2: Run the tests and manifest verifier and observe the intended failures.**
- [ ] **Step 3: Download the six original files, inspect dimensions and MIME types, and generate only inline LQIPs.**
- [ ] **Step 4: Update candidates, manifest, runtime typing, URL resolution, and verifier for original or legacy entries.**
- [ ] **Step 5: Remove the four rejected packaged files and run focused tests plus manifest verification.**

### Task 3: Settings lock and bundled-photo picker

**Files:**
- Modify: `src/settings/sections/Background.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/components/Background.test.tsx`

**Interfaces:**
- Consumes: `BUNDLED`, `bundledLqip`, `bundledUrl`, `readLocalDay`, and serialized `storage.update('photoPrefs', updater)`
- Produces: `Keep this background` switch and `Bundled photos` gallery; selection writes `{ mode: 'auto', index, lastRotated: localDay, locked: true }`

- [ ] **Step 1: Write failing Settings tests for rendering, accessible selected state, selection locking, and unlock persistence.**
- [ ] **Step 2: Write a failing background regression proving manual refresh preserves lock.**
- [ ] **Step 3: Run the focused tests and observe the intended failures.**
- [ ] **Step 4: Add the switch and responsive thumbnail grid using existing storage ownership.**
- [ ] **Step 5: Run Settings and background tests until green.**

### Task 4: Stabilized verification and documentation

**Files:**
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Add: browser evidence under `docs/superpowers/qa/background-library/`

**Interfaces:**
- Consumes: the complete implementation and exact production build
- Produces: owner-testable build evidence and durable decision record

- [ ] **Step 1: Run focused tests, TypeScript, manifest verification, and production build.**
- [ ] **Step 2: Load the exact build in real Chromium and verify desktop and narrow Settings interaction, visual containment, focus, runtime errors, and failed requests.**
- [ ] **Step 3: Record concise status and decision evidence without changing Store state.**
- [ ] **Step 4: Inspect `git diff --check`, repository status, protected checkout state, and final test output.**
