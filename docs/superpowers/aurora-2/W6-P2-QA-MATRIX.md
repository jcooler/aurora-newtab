# W6-P2 Responsive, Zoom, Keyboard, and Accessibility QA Matrix

**Packet:** W6-P2

**Date:** 2026-08-16

**Result:** Verified with one Important product fix; no Critical or Important finding remains open.

## Viewport matrix

Each named size was exercised once without creating a viewport-by-state cross-product.

| CSS viewport | Witness |
|---|---|
| 1024x600 | `screenshots/viewport-1024x600.png` |
| 1280x720 | `screenshots/w2-p3-standard-settings-1280x720.png` |
| 1366x768 | `outputs/w6-p2/w6-p2-viewport-1366x768.png` |
| 1600x900 | `screenshots/default-state-1600x900.png` |
| 1920x1080 | `outputs/w6-p2/w6-p2-viewport-1920x1080.png` |
| 2560x1440 | `screenshots/connectors-all-2560x1440.png` |
| 3440x1440 | `outputs/w6-p2/w6-p2-viewport-3440x1440.png` |
| 3840x2160 | `outputs/w6-p2/w6-p2-viewport-3840x2160.png` |
| 375x812 touch | `outputs/w6-p2/w6-p2-viewport-375x812-touch.png` |
| 320 CSS px | `outputs/w6-p2/w6-p2-zoom-equivalent-400-320x180.png` |

The named replay found no page/body horizontal overflow, retained the resolved Stage profile, and measured every persistent background, Utility Tray, and Settings action at the active 36px or 44px floor.

## State matrix

| State | Witness |
|---|---|
| Sparse | `screenshots/default-state-1600x900.png` |
| Typical | `outputs/w5-p2/w5-p2-standard-working-tools-1600x900.png` |
| Dense | `screenshots/connectors-all-2560x1440.png` |
| Loading | `screenshots/w2-p1-async-feedback-800x600.png` |
| Stale/offline | `screenshots/w2-p1-weather-freshness-1600x900.png` |
| Error | `screenshots/ha-action-error.png` |
| Open Tray | `outputs/w5-p2/w5-p2-standard-working-tools-1600x900.png` |
| Dialog/editor | `outputs/w3-p3/w3-p3-standard-editor-1600x900.png` |
| Arrange | `screenshots/arrange-mode.png` |

The captures were inspected in three bounded batches: viewport/ultrawide, reflow/touch, and state/accessibility. The only blocking visual defect was the unconfigured compact Weather layout described below. Partial next items in the horizontally scrollable Signal Dock are intentional and remain keyboard/touch reachable.

## Zoom and core accessibility

- 100% is represented by the named native CSS viewports. CSS-space equivalents at a 1280x720 reference passed at 125% (`1024x576`), 150% (`853x480`), 200% (`640x360`), and 400% (`320x180`). These are reflow witnesses, not a claim of native Chrome zoom execution.
- At 200% and 400% the Weather input and location action are contained, disjoint, clear of persistent actions, at least 36px high, visibly labelled `Locate`, and retain the accessible name `Use my location`.
- Keyboard traversal reached Settings after 10 Tabs with a 2px solid focus outline. Escape restored the Settings and Utility Tray invokers. The Chromium accessibility tree exposed the named Settings dialog.
- Reduced-motion emulation was active and the Utility Tray transition duration was `0s`.
- A real Playwright touchscreen tap at 375x812 opened and closed the Utility Tray. Chromium's persistent extension context still reported desktop `maxTouchPoints`/coarse-pointer media values, so this is touch-input evidence rather than a hardware-capability claim.
- Existing causal unit/browser evidence continued to cover alerts, statuses, busy/disabled states, active descendants, focus traps, newest-first Escape, names, descriptions, and 36px routine targets.

## Finding and bounded fix

**Important, fixed:** At the 200% and 400% CSS-space witnesses, the unconfigured Weather input and `Use my location` action overlapped each other and then the fixed background/Settings actions. `7c51e78` gives the compact setup a stacked finite allocation, a shorter visible label with an unchanged accessible name, and a short/narrow safe inset. A source regression contract and the packaged replay prove containment, target size, label semantics, and persistent-action clearance.

The implementation review/rereview is Ready with 0 Critical and 0 Important findings open.

## Verification

- Focused development: `adaptiveStageLegibility`, `LocationSetup`, and `WeatherWidget` passed 3 files / 78 tests; the final source contract passed 21/21.
- Packaged W6-P2 replay: PASS across the named gaps, zoom-equivalent spaces, keyboard, focus restoration, reduced motion, Chromium AX naming, touch taps, cleanup, and zero runtime errors.
- Final unit gate: 137 files / 2,264 tests.
- Production and preview builds: TypeScript clean, 189 modules transformed in each mode.
- Production preview-bridge scan: clean.
- Full browser pass and permitted rerun: both process runs exited 0 and printed 455 PASS / 2 FAIL / 3 SKIP. The two FAIL lines were one legacy W2-P3 generic outside-point discovery failure plus its W3-P2 storage-contamination cascade, not two product failures. The Compact Tray is intentionally modal and has only a real backdrop outside its fitted surface. Existing W5-P1 focused evidence directly proves backdrop dismissal/restoration, and current component/unit evidence is green. `931400c` aligned the expected modal lifecycle; `cf3d212` source-corrected the stale generic scanner to the direct backdrop locator. Per the packet's one-rerun limit, no third full run was launched; this remains Minor evidence debt.

## Manual ceilings

- Native Chrome zoom controls, including a real 400% session.
- Windows display scaling and moves between monitors with mixed DPI.
- Real screen-reader speech, timing, browse mode, and platform focus announcements.
- Physical touch/pen hardware, native Chrome permission prompts, live Home Assistant data/actions, genuine sleep/wake, OS timezone changes, and unload-time persistence.

No schema, migration, registry, planner, stored-data, privacy, permission, connector, packaging, Store, or protected-checkout contract changed. Chrome Web Store actions remain blocked until explicit W6-P5 approval.
