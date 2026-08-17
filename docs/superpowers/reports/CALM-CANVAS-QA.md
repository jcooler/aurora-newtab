# Calm Canvas QA Report

**Date:** 2026-08-16  
**Result:** Ready for owner visual approval  
**Final full gate:** Deliberately pending owner visual approval

## Outcome

The stretched three-column dashboard was replaced with the approved photo-forward Calm Canvas. Now is centered, Day and Work Pulse shrink-wrap their real content, the Signal Dock stays compact and owns its horizontal overflow, and Compact reflows through one Stage-owned vertical scrollport.

Forty-one required PNGs were inspected at original resolution: 17 composition witnesses and 24 interaction/state witnesses. The contact sheet was used only as an index. No Critical or Important visual or functional defect remains open.

## Blocking fixes completed

| Finding | Severity | Correction and proof |
|---|---|---|
| Compact Weather escaped semantic flow at emergency height | Important | Kept the open surface in flow; source contract and Compact browser witnesses pass |
| Standard 1280x800 Now content could paint through Dock | Important | First row now honors `max-content` before spare-height growth; targeted geometry witness passes |
| Empty Dock reservation painted a large slab | Important | Dock surface now shrink-wraps its real row; sparse/dense witnesses pass |
| Quick Link names and labels were incomplete/truncated | Important | Explicit anchor names plus 80px Now label measure; focused tests and visual witnesses pass |
| Wide dense Habits drifted off the Now axis | Important | Centered the fixed-width stack; wide dense witnesses pass |
| Bookmark popover was visible but its controls were intercepted | Important | Portaled the panel, removed the viewport interceptor, clamped it to the live chip, and retained Dock-only scroll ownership |
| Clicking the active bookmark chip could immediately reopen its menu | Important, review fix | RED test reproduced the pointerdown/click split; anchor exclusion fixed it; 31/31 bookmark tests and packaged-Chromium bookmark rereview pass |
| Weather suggestions sacrificed the city name before secondary detail | Important | City is nonshrinking; secondary location owns truncation; 24/24 LocationSetup tests and direct typeahead witness pass |

## Verification performed before owner approval

- Focused implementation set: 4 files / 83 tests passed before review.
- Review fix rereview: `BookmarksBar.test.tsx` 31/31 passed, including the new active-anchor regression.
- Preview TypeScript/build: clean, 189 modules transformed.
- Focused packaged-Chromium composition: sparse 1600x900 and owner-like dense 2012x1397 passed.
- Composition audit: all 17 witnesses passed geometry, identity, collision, paint, overflow, target, image, request, runtime, and cleanup checks.
- Interaction audit: 24 captured states cover primary entry, tools, connectors, Settings, Arrange, bookmark drill-in, Weather typeahead, keyboard, Escape, touch, and recovery surfaces.
- Corrected bookmark family: packaged-Chromium rerun passed with Stage `scrollLeft` 0, viewport-contained 256px dialog, internal Dock reveal, Escape, Back, and focus restoration.
- Weather search family: packaged-Chromium rerun passed with deterministic geocoding, two suggestions, active descendant, and Escape.
- Contact sheet regeneration: passed after the final visual corrections.
- One implementation review plus one Critical/Important fix-rereview cycle: Ready; 0 Critical and 0 Important findings remain.

The initial comprehensive driver completed all 17 composition captures before a stale click strategy stopped the interaction phase. The interaction families were then completed through bounded family runs after correcting the actual selectors and fixtures. This is harness-driver evidence debt, not a product failure, and no extra comprehensive replay was launched during incremental fixes.

## Minor ledger

- A dense Dock may show a partial next item to communicate horizontal continuation. It remains keyboard/touch reachable and is not document overflow.
- The 320x180 witness necessarily shows only the first semantic content in the initial viewport; the Stage scrollport contains the rest.
- Some historical raw diagnostic evidence JSON records the driver failure that preceded the successful bounded family runs. This report and the named clean family evidence are the authoritative approval index.
- Direct current screenshots were not duplicated for every unchanged Notes/Data recovery permutation already owned by focused tests and the canonical full harness. The final canonical harness remains scheduled once, after visual approval.

## Deferred final gate

After the owner approves the representative UI, run exactly once:

```text
npm test
npm run build
npm run build:preview
node scripts/preview.mjs
```

If the browser harness exposes an actual failing family, fix that family and rerun it once. Do not repeat gates for report-only changes.

## Protected boundaries

No schema, migration, registry, planner, stored-data, privacy, permission, connector, backup, packaging, Store, or protected-original contract changed. Chrome Web Store actions remain blocked until explicit contemporaneous W6-P5 approval.
