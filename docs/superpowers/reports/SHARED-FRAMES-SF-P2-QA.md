# SF-P2 Framed Catalog Migration QA

**Date:** 2026-08-23<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Reviewed product commit:** `c4f98d0fa80652e817320eea0b3afc3ac17be4e5`<br>
**Final loaded build commit:** `c4f98d0fa80652e817320eea0b3afc3ac17be4e5`<br>
**Implementation range:** `170f9be..c4f98d0`<br>
**Review range:** `170f9be..6a3c34c`; fix range `6a3c34c..c4f98d0`

## Outcome

SF-P2 is implementation-complete and ready for the required owner visual gate. The 25 remaining Framed identities now use the exact shared Compact 216x132, Standard 320x200, and Full 460x284 frame system at their authored tiers. Weather and On This Day remain the accepted reference pair. Every migrated identity has a bounded, tier-authored composition, no framed internal scrollbar, one mounted data owner, and explicit stack compatibility behavior.

The initial bounded review returned With fixes with three Important findings. One consolidated focused-TDD fix cycle added applicable setup and permission states, kept a legacy-incompatible stack's real renderer mounted exactly once behind its visible compatibility face, and replaced synthetic interaction evidence with real actions plus correctly timed selection measurement. The single rereview returned Ready with no Critical or Important finding open.

Calendar/ICS, Month, and Public Holidays remain independent. The possible unified Agenda design remains deferred until after SF-P4.

## Verification

- Focused packet gate before review: 106 files / 1,402 tests.
- Stabilized full gate, run once: 200 files / 3,217 tests.
- Review-fix GREEN: 4 files / 110 tests; SF-P1 and SF-P2 Node harnesses 40/40; information-first contracts 9/9; TypeScript, syntax, and diff hygiene clean.
- Independent rereview: 3 files / 57 tests; Node harnesses 40/40; TypeScript, harness syntax, and range hygiene clean.
- Final `npm run build:preview`: 250 modules; `dist/build-provenance.json` exactly `c4f98d0fa80652e817320eea0b3afc3ac17be4e5`.
- Final exact-build Chromium evidence: 189/189 captures, all explicitly reviewed `Useful`.

The build emitted only the existing Vite chunk-size advisory. The single full gate exposed an asynchronous Settings appearance-write race after assertions had completed; focused stabilization now awaits committed storage and all four related cases pass. No second full-suite run occurred.

## Exact frame, state, and visual evidence

The final catalog records 49 exact Compact frames, 107 exact Standard frames, and 33 exact Full frames. Every frame had equal client and scroll geometry, zero clipped measured content, zero internal scroll owner, one mounted owner, and a minimum measured text size of 11px.

| Family | Captures | Result |
| --- | ---: | --- |
| Developer and service | 42 | Exact tiers, named service and work context, real Status detail action |
| Connected information | 49 | Exact tiers, bounded rows, setup/error states, real provider action |
| Browser native | 39 | Exact tiers, optional permission state, retained data/error states, real Reading List update |
| Calendar and local | 33 | Exact authored tiers, fixed stacks, real Tasks detail action |
| Public information | 26 | Exact tiers, country setup/error states, real trusted provider action |

The matrix includes 166 ready, five loading, five empty, five stale, two partial, three permission-required, and three hard-error captures. It includes 69 common-display, 90 exact 1408x445 short-window, 28 laptop, one 599px narrow-floor, and one 600px planner-boundary capture. Light and saturated panel witnesses supplement the default dark catalog.

All 189 final PNGs are byte-identical to the separately inspected reviewed originals. The setup, permission, real-action, and compatibility additions were reopened at native resolution before verdict assignment. The visible setup cards name the missing action without implying data exists. The Full Moon mismatch face names the supported tier and the exact edit-mode recovery path.

## Interaction, ownership, request, and storage evidence

Every stack family passed initial face, next, previous, dot, swipe, and plain-click evidence. Swipe selected no page text. Plain clicks now perform one real family action: open a detail surface, invoke a trusted provider link, or update Reading List through its existing owner.

Legacy-incompatible stack members preserve the actual renderer and its warm data owner in a hidden inert layer while the compatibility face paints the recovery message. The harness measures `data-stack-widget-owner`, and every capture reports exactly one mounted owner.

The exact run recorded 36 audited request records, zero failed or unexpected requests, and zero runtime errors. Twenty explicit next, previous, dot, or swipe captures changed only `layouts`; no capture wrote the legacy `layout` key or another storage key. Browser cleanup closed Chromium and removed its temporary profile.

## Repository and authority proof

- Reviewed active checkpoint: `c4f98d0fa80652e817320eea0b3afc3ac17be4e5`, equal to `origin/feat/aurora-2-observatory` before this report checkpoint.
- Protected original: `D:\DEV\Chrome plugin`, clean on `main` at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- Chrome Web Store upload, field edits, saves, submission, publication, distribution, and rollout were not touched.
- Catalog: `docs/superpowers/catalog/shared-frames/sf-p2/CATALOG.md`.
- Machine evidence: `docs/superpowers/catalog/shared-frames/sf-p2/evidence.json`.

## Accepted Minor debt and boundary

- The clipping probe automatically measures direct text-owning elements. SVG-only painted content remains covered by native-resolution human inspection rather than an equivalent glyph-bound probe.

SF-P3 remains blocked until the owner accepts or refines this SF-P2 visual gate. No owner acceptance or DECISIONS entry is recorded by this report.
