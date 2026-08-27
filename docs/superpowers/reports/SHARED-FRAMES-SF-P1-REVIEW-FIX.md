# SF-P1 Review Fix Wave Report

**Date:** 2026-08-22<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Base candidate:** `ce84b32cf030cb4a47fbb72c4bfe90098dab91cb`<br>
**Scope:** The one permitted consolidated fix wave for the eight Important packet-review findings.

This report records review-fix implementation and preliminary working-tree evidence only. Task 7 remains incomplete. No final exact-reviewed proof, owner acceptance, SF-P2 start, Store action, or DECISIONS update is claimed.

## Focused RED and GREEN

The initial component RED command was:

```powershell
npx vitest run src/newtab/widgets/weather/LocationSetup.test.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx src/newtab/widgets/glance/OnThisDayWidget.test.tsx src/newtab/widgets/shared/TierFrame.test.tsx src/newtab/canvas/StackCard.test.tsx src/lib/color.test.ts src/theme/index.test.ts src/theme/themes.test.ts
```

It exited 1 with 8 failed files, 17 failed tests, and 148 passed tests. The failures named the missing portal/tier behavior, Weather freshness and authored states, On This Day stale state and Full depth, panel accent token, 36px stack controls, and four-theme contrast.

The initial harness RED command was:

```powershell
node --test scripts/qa-shared-frame-p1.test.mjs scripts/preview-information-first.test.mjs
```

It exited 1 with 9 tests, 8 passed and 1 failed because `applySfP1ReviewedVerdicts` was not exported. The prepared harness tests covered the fail-closed verdict map, four-theme matrix, 412x915 proportional Full witness, 599/600 boundary, and non-emulated real-window contract before tooling implementation.

| Finding | Observable RED | Focused GREEN |
| --- | --- | --- |
| 1. LocationSetup clipping | Initial component command: Compact and Standard portal/selection, outside close/focus, and tier-context tests failed. Browser iterations also failed until the six-result Compact list visibly crossed the frame. | `npx vitest run src/newtab/widgets/weather/LocationSetup.test.tsx`: 1 file / 28 tests passed. Preliminary Chromium typed Dallas and selected the first result at Compact and Standard with one geocode request owner, body-owned listbox, retained combobox ARIA, unchanged stored layout tier, and all setup targets at least 36px. |
| 2. On This Day state drift | Initial component command: retained-error exposed an undeclared frame state and failed the stale expectation. | Final component gate proves retained-error maps to `WidgetPresentationState` `stale` while retained copy, saved rows, Retry, and snapshot-only clearing remain observable. `OnThisDayWidget.test.tsx`: 9/9 passed inside the 206-test gate. |
| 3. Theme contrast | Initial component command: threshold, bright-pink, theme token, and TierFrame adaptive-accent expectations failed. | Color and theme tests pass. Chromium measured all black, light, saturated blue, and bright pink panel witnesses with minimum accent contrast 6.3002:1 and minimum focus-indicator contrast 6.3002:1. |
| 4. No-whitespace composition | Initial component command: Compact freshness and Full On This Day summary-depth assertions failed. The preliminary browser command then produced expected frame-overflow REDs while the exact layouts were tuned. | Weather Compact, Standard, and Full plus On This Day Full are bounded at exact declared desktop dimensions. Chromium confirms four hourly slots, truthful Compact freshness, one title/date, events plus one birth/death, provider destination, no internal widget scroll, and useful narrow compositions. |
| 5. Authored states | Initial component command: Weather loading/empty and On This Day loading header/skeleton/action tests failed. | Final component gate passes named headers, bounded skeletons, truthful status text, and Weather Refresh through the existing authority with no second owner. |
| 6. 36px targets | Initial component command: event/provider, stack dot/arrow, and LocationSetup target contracts failed. | Final DOM/CSS tests pass. Chromium measured a minimum interactive height of 36px; stack arrows/dots remain hidden at rest and visible for hover/focus/edit evidence. |
| 7. Honest catalog | Initial harness command failed before any generated Useful default could satisfy the prepared fail-closed tests. A later focused tooling RED, `node --test scripts/qa-shared-frame-p1.test.mjs`, exited 1 because `formatSfP1Catalog` was not exported. | Node harness families pass 24/24. Capture planning contains no verdict. A separate explicit reviewed map covers every capture and rejects missing/extra/invalid entries. The catalog is labeled preliminary and records the individually inspected originals. |
| 8. Narrow and real-window evidence | The prepared harness RED could not load the missing review/tooling API. During browser RED, both 412px Full widgets initially overflowed their proportional 388x239.546875 frames. | Node tests prove 412x915 coverage, preserved 599/600 coverage, and that `--real-window` requires headed mode, creates `viewport:null`, and does not call `page.setViewportSize`. Preliminary Chromium measured both 412px frames proportionally while their stored tier stayed `full` with no writes. The actual headed native-window witness remains a manual Task 7 ceiling. |

The browser tuning command was repeated only against the affected 36-scenario matrix:

```powershell
node scripts/qa-shared-frame-p1.mjs --expected-commit=ce84b32cf030cb4a47fbb72c4bfe90098dab91cb --capture-only --preliminary-working-tree
```

Expected RED iterations named real overflow or contract defects, including Compact Weather 10px freshness, Weather stale/error/phone overflow, On This Day Compact/Standard/Full/stale/phone overflow, and Compact/Standard LocationSetup escape/context expectations. The final run exited 0:

```text
PASS SF-P1 capture-only preliminary witness: 36 captures, 20 audited requests, 4 storage write batches, 0 runtime/failed/unexpected requests
```

The final catalog command exited 0 with `PASS SF-P1 reviewed catalog: 36 inspected originals`.

## Preliminary browser evidence

- Exact desktop frame measurements remain Compact 216x132, Standard 320x200, and Full 460x284 CSS px.
- The 599x800 and 600x800 witnesses both retain exact 460x284 Full frames.
- The 412x915 witnesses measure 388x239.546875, the proportional result of the unchanged Full frame contract, while stored tier remains `full` and layout writes remain zero.
- The Compact and Standard city listboxes are portalled to `document.body`, are not descendants of `TierFrame`, retain `aria-controls`, `aria-expanded`, input focus, keyboard-ready active state, and 36px result targets, then select through the existing location authority.
- Minimum measured interactive height is 36px. Minimum measured panel accent and focus-indicator contrast is 6.3002:1.
- Clean free/theme captures have focus blurred, selection cleared, pointer moved away, and no edit chrome. Focus visibility is recorded separately by runtime measurement.
- All 36 original PNGs were opened individually after the final preliminary regeneration. Verdicts are 36 Useful, 0 Needs refinement, and 0 Rejected.
- The evidence is preliminary working-tree evidence against base candidate `ce84b32`. It is intentionally not final exact-reviewed evidence.

## Verification

- Affected Vitest gate: 10 files / 206 tests passed.
- Node harness gate including `scripts/preview-information-first.test.mjs`: 24/24 passed.
- `node --check scripts/qa-shared-frame-p1.mjs`: exit 0.
- `npx tsc --noEmit`: exit 0.
- `git diff --check`: exit 0 with line-ending notices only.
- `npm run build:preview` correctly refused the dirty tracked worktree with `Aurora attributable builds require a clean tracked worktree`.
- The bounded preliminary fallback, `$env:AURORA_BUILD_COMMIT = (git rev-parse HEAD); npx vite build --mode preview; Remove-Item Env:AURORA_BUILD_COMMIT`, built 249 modules in approximately 2.96 seconds before the final 36-capture run.
- `npm test` was not run, as required. The prior stabilized full-suite result remains the single full run.

## Deferred and remaining

- Distinct explicit `stackSizes` is deferred to SF-P2/SF-P3 and did not expand this wave.
- A scoped rereview, clean exact-commit preview build, final exact-build Chromium evidence, and owner visual disposition remain in Task 7.
- The real-window CLI path still needs a headed native-window run with `viewport:null`. Automated contract coverage proves the path cannot silently emulate, but it is not a substitute for that manual witness.
- SF-P2 remains blocked. DECISIONS and Store state remain unchanged.
