# SF-P1 Shared Frame Foundation and Reference Pair QA

**Date:** 2026-08-22<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Plan checkpoint:** `0eddea120c6c75988948680c5ba8055167b2a50b`<br>
**Reviewed product commit:** `67168930d9a717129232375c5a5621bc5682f58c`<br>
**Final loaded build commit:** `62dacdd65e41f52a71cc273dc28bb6ca44cddbc2`<br>
**Review range:** `0eddea1..ce84b32`; fix range `ce84b32..6716893`

## Outcome

SF-P1 is implementation-complete and ready for the required owner visual gate. It establishes one authoritative frozen presentation contract, exact shared Compact 216x132, Standard 320x200, and Full 460x284 frames, and authored Weather plus On This Day faces for every declared tier and state. The same authored face renders free or inside the mounted-once stack. Docked forms, storage, schema, layouts, connector authorities, permissions, dependencies, CSP, and Store state are unchanged.

The initial bounded review returned With fixes with eight Important findings. One consolidated focused-TDD fix wave closed clipped Weather location results, state-contract drift, non-adaptive accent/focus contrast, sparse tier composition, weak loading/empty states, undersized targets, generated catalog verdicts, and missing proportional/real-window evidence. The single rereview returned Ready with no Critical or Important finding open.

## Verification

- Focused packet gate before review: 23 files / 459 tests.
- Stabilized full gate, run once: 198 files / 3,093 tests.
- Review-fix GREEN: 10 files / 206 tests; Node harnesses 24/24; TypeScript, syntax, and diff hygiene clean.
- Independent rereview: affected slice 10 files / 212 tests; App 53/53; Node harnesses 24/24; TypeScript, syntax, and range hygiene clean.
- Post-rereview real-window harness correction: observed RED for Playwright's rejected `deviceScaleFactor` plus `viewport:null` combination, then Node harnesses 24/24, syntax, and hygiene clean. This checkpoint changes tooling only.
- Final `npm run build:preview`: 249 modules; `dist/build-provenance.json` exactly `62dacdd65e41f52a71cc273dc28bb6ca44cddbc2`.

The build emitted only the existing Vite chunk-size advisory. No second full-suite run occurred after the documentation/tooling-only checkpoints.

## Exact frame and state evidence

The final 36-capture Chromium catalog records 36 explicit human-reviewed `Useful` verdicts, 20 exact audited requests, four expected stack-facing storage-write batches, and zero runtime errors, failed requests, unexpected requests, legacy `layout` writes, clipping, internal frame scroll owners, or page horizontal overflow.

| Tier or boundary | Measured frame | Result |
| --- | --- | --- |
| Compact desktop | 216x132 | Exact |
| Standard desktop | 320x200 | Exact |
| Full desktop | 460x284 | Exact |
| 599px planner floor | 460x284 | Stored Full remains Full |
| 600px planner boundary | 460x284 | Stored Full remains Full |
| 412px narrow safety | 388x239.546875 | Proportional scale, stored Full unchanged, zero writes |

Weather Compact now includes current conditions, location, and freshness. Standard uses the frame for trend plus Feels, Wind, and Humidity. Full adds a larger current hierarchy and four-slot hourly signature. Loading and empty states retain Weather identity, bounded structure, and the existing Refresh authority. The portalled location list remains owned by the original combobox and is selectable at Compact and Standard without clipping.

On This Day renders one title and one English date. Compact shows one event, Standard three events, and Full uses multi-line event summaries plus one birth and one death with one trusted `More on Wikipedia` destination. Retained refresh failures map to the declared `stale` frame state while preserving data, error copy, and Retry.

Black, light, saturated blue, and bright pink panels were captured without hover, focus, edit chrome, or text selection. Minimum measured accent and focus-indicator contrast was 6.3002:1. Minimum measured interactive height was 36px.

## Stack and real-window evidence

The Standard Weather and On This Day reference stack remains one exact footprint. Both members stay mounted once; the hidden face is inert; arrows, dots, previous, next, swipe, and Weather details passed; swipe selected no text; and only explicit facing changes wrote storage. The exact 1408x445 Weather details surface remained viewport-owned and outside the frame.

The final headed witness ran with Playwright `viewport:null`, no `page.setViewportSize`, and no emulated device scale. Chromium reported a real 1889x1988 CSS viewport at DPR 1. Full Weather measured exactly 460x284 with client and scroll dimensions equal, no internal scroll owner, no clipped essential/signature content, no storage writes, and zero console, runtime, failed-request, or unexpected-request failures.

## Repository and authority proof

- Active branch checkpoint before this report: `62dacdd65e41f52a71cc273dc28bb6ca44cddbc2`, equal to `origin/feat/aurora-2-observatory`.
- Protected original: `D:\DEV\Chrome plugin`, clean on `main` at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- Chrome Web Store upload, field edits, saves, submission, publication, distribution, and rollout were not touched.
- Calendar/ICS, Month, and Public Holidays remain independent. The possible unified Agenda design remains deferred until after SF-P4.

## Accepted Minor debt and boundary

- Four 599/600 catalog verdict reasons have reversed wording; viewport and geometry columns remain correct.
- Stack-at-rest hidden controls are proven by CSS and tests, not a dedicated at-rest PNG.
- Distinct explicit `stackSizes` remains deferred to SF-P2/SF-P3.

SF-P2 remains blocked until the owner accepts or refines this SF-P1 visual gate. No owner acceptance or DECISIONS entry is recorded by this report.
