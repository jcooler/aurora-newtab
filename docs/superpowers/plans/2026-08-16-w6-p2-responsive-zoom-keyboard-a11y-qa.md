# W6-P2 Responsive, Zoom, Keyboard, and Accessibility QA Plan

**Goal:** Complete the written named viewport/state/zoom QA matrix in real Chromium, inspect the required captures in bounded batches, verify core keyboard/accessibility behavior, and state every hardware/manual ceiling without inventing a Cartesian product.

**Architecture:** Reuse the immediately preceding green full-harness state captures for sparse, dense, loading, stale/offline, error, tray, dialog, and arrange witnesses. Add one one-shot packaged-extension replay only for named viewport gaps, zoom-equivalent CSS spaces, touch/coarse-pointer presentation, persistent targets, overflow, focus/Escape restoration, and supporting Chromium AX evidence. Do not rerun the unchanged full unit/build/browser gates for QA reports.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 12 and 13; `docs/superpowers/aurora-2/ROADMAP.md` W6-P2.

## Frozen acceptance

- Cover 1024x600, 1280x720, 1366x768, 1600x900, 1920x1080, 2560x1440, 3440x1440, 3840x2160, 375x812, and 320 CSS px.
- Cover sparse, typical, dense, loading, stale, offline, error, open-tray, dialog, and arrange states without multiplying every state by every viewport.
- Cover 100%, 125%, 150%, 200%, and relevant 400% CSS-space reflow; distinguish CSS-space automation from native Chrome zoom.
- Verify keyboard focus order/restoration, Escape stack behavior, names/states, announcements, reduced motion, and 36/44px target floors using current causal tests/harness evidence plus one canonical replay.
- Inspect screenshots in bounded batches. Only Critical/Important defects block; record Minor/cosmetic findings without reopening verified packets.
- State Windows scaling, mixed-DPI window moves, native Chrome zoom, real screen-reader speech/timing, and hardware/service limits honestly.

## Tasks

### 1. One-shot named viewport and zoom-equivalent replay

- [ ] Add `scripts/preview-w6-p2.mjs` with no production bridge or external request authority.
- [ ] Generate the five missing named board captures (1366x768, 1920x1080, 3440x1440, 3840x2160, 375x812 touch) and four zoom-equivalent CSS-space captures at 1280x720 physical reference (125%, 150%, 200%, 400%).
- [ ] Measure document/body overflow, Stage profile/target token, persistent 36/44px actions, visible focus, Settings/Tray Escape restoration, coarse pointer at 375x812, reduced-motion transition behavior, runtime errors, exact cleanup, and supporting Chromium AX names.

### 2. Complete matrix mapping and capture inspection

- [ ] Map the five new captures plus current 1024x600, 1280x720, 1600x900, 2560x1440, and 320px captures to every named viewport once.
- [ ] Map current full-harness/output captures to sparse, typical, dense, loading, stale, offline, error, open-tray, dialog, and arrange states once.
- [ ] Inspect captures in three bounded batches: viewport/ultrawide, reflow/zoom-equivalent, and state/accessibility.

### 3. Review, ceilings, and checkpoint

- [ ] Record exact automated evidence and explicit manual ceilings in `W6-P2-QA-MATRIX.md`.
- [ ] Perform one implementation review against written acceptance. Use at most one focused fix/rereview cycle for demonstrated Critical/Important product defects.
- [ ] Reuse the unchanged W5-P4 full gate and W6-P1 recovery matrix; do not repeat them for script/report-only changes.
- [ ] Update ledgers, checkpoint/push, prove clean/upstream equality and protected checkout integrity, then begin W6-P3 automatically.
