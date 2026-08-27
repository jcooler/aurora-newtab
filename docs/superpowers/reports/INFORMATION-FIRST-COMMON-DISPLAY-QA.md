# Information-first common-display QA

Date: 2026-08-17<br>
Packet: PR-P6<br>
Harness: `npm run qa:information-first`

> **WITHDRAWN 2026-08-17 (A2-D060):** The owner rejected the installed
> extension at 1408x445, disproving this report's PASS conclusion. The
> matrix contained no short-height desktop viewport, seeded fixture
> layouts in place of user-shaped storage, and could not reproduce classic
> scrollbar geometry. This document is preserved as rejected historical
> evidence; see `SHORT-HEIGHT-RECOVERY-FORENSICS.md` for the reproduced
> root causes and the corrected QA standard.

## Result

PASS at the implementation and evidence boundary. Owner visual approval remains pending. **(Withdrawn - see banner above.)**

The canonical evidence contains all 115 required original-resolution Chromium captures: 23 exact CSS viewports multiplied by the five required states. Every original was opened and inspected individually. The run also contains six deep-interaction fenceposts, 24 registry-promised connector-size captures, four connector-state captures, and four Weather-corner captures. There were no runtime errors, failed requests, unexpected external requests, missing images, document horizontal overflows, or information-rich Canvas intersections.

The first gate exposed three real product defects and one fixture weakness. Focused RED/GREEN work corrected bottom-bar hit geometry, the 4K full Clock type cap, delayed focus restoration after outside-closing Weather, and insufficient data in larger GitLab, Vercel, and Home Assistant connector fixtures. Focused viewport reruns were merged into the canonical evidence rather than restarting the complete matrix.

Evidence JSON: `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\information-first-common-display\information-first-evidence.json`

## Exact verification

- `npm run qa:information-first -- --after=3840x2160`: PASS, 115 states in merged canonical evidence.
- `npx vitest run src/newtab/canvas/CanvasSurface.test.tsx src/newtab/components/Clock.test.tsx src/newtab/adaptiveStageLegibility.test.ts src/newtab/widgets/weather/WeatherWidget.test.tsx`: PASS, 4 files and 92 tests.
- `node --test scripts/preview-information-first.test.mjs`: PASS, 6 tests.
- `npx tsc --noEmit --incremental false --pretty false`: PASS.
- `node --check` for the four PR-P6 harness modules: PASS.
- `git diff --check`: PASS.

The harness used a persistent disposable Chromium extension profile at device scale factor 1, actual production renderers, non-personal `.invalid` fixture identities, scoped connector snapshots, and no live provider requests. Temporary profile and preview-build directories were removed after the run.

## Individual common-display inspection

Each row below represents five separate original PNGs inspected at original resolution: information-rich Canvas, Settings Widgets, Settings Connectors, expanded top-right Weather, and Arrange Small with its inspector open.

| CSS viewport | Information-rich Canvas | Widgets and Connectors | Weather | Arrange Small | Result |
| --- | --- | --- | --- | --- | --- |
| 320x568 | Compact, 7 visible items, 48px Clock, no intersection | Both fill 320x568 and use document scroll | Opens below and inward-left, contained | 390x844 artboard with bottom sheet | PASS |
| 360x800 | Compact, 8 visible items, 48px Clock, no intersection | Both fill 360x800 and remain locally usable | Opens below and inward-left, contained | 390x844 artboard with bottom sheet | PASS |
| 375x812 | Compact, 8 visible items, 48px Clock, direct tools usable | Both fill 375x812 with horizontal tabs and document scroll | Opens below and inward-left, contained | 390x844 artboard remains visible above the sheet | PASS |
| 390x844 | Compact, 9 visible items, 48px Clock, no intersection | Both fill 390x844 without horizontal overflow | Opens below and inward-left, contained | Exact 390x844 logical artboard with bottom sheet | PASS |
| 412x915 | Compact, 9 visible items, 49.44px Clock | Both fill 412x915 and preserve one scroll owner | Opens below and inward-left, contained | Exact Small artboard with bottom sheet | PASS |
| 768x1024 | Compact, 12 visible items, 92.16px Clock | Both fill 768x1024 and keep controls bounded | Opens below and inward-left, contained | Small artboard with bottom sheet | PASS |
| 820x1180 | Compact, 15 visible items, 98.4px Clock | Both fill 820x1180 and retain local scroll | Opens below and inward-left, contained | Small artboard with bottom sheet | PASS |
| 1024x600 | Compact height profile, 7 visible items, 98.64px Clock | Both use an inset 864x568 workspace | Opens below and inward-left, contained | Small artboard with bottom sheet by physical width | PASS |
| 1024x768 | Desktop profile, 13 visible items, 122.88px Clock | Both use an inset 864x736 workspace | Opens below and inward-left, contained | Small artboard with bottom sheet by physical width | PASS |
| 1280x720 | Desktop, 13 visible items, 144px Clock | Both use an inset 864x688 workspace | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 1280x800 | Desktop, 13 visible items, 153.6px Clock | Both use an inset 864x768 workspace | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 1280x1024 | Desktop, 13 visible items, 153.6px Clock | Both use an inset 864x992 workspace | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 1366x768 | Desktop, 13 visible items, 153.6px Clock | Both use an inset 864x736 workspace; Connector header is integrated | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 1440x900 | Desktop, 13 visible items, 160px Clock | Both use an inset 864x868 workspace | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 1536x864 | Desktop, 13 visible items, 160px Clock | Both use an inset 864x832 workspace | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 1600x900 | Desktop, 13 visible items, 160px Clock | Both use an inset 864x868 workspace | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 1920x1080 | Desktop, 13 visible items, 160px Clock | Both use an inset 864x1048 workspace | Opens below and inward-left at the top-right safe margin | Small artboard plus non-occluding side inspector | PASS |
| 1920x1200 | Desktop, 13 visible items, 160px Clock | Both use an inset 864x1168 workspace | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 2560x1440 | Large, 17 visible items, complete connector composition, 167.91px Clock | Both remain an inset 864x1408 document | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 2560x1600 | Large, 17 visible items, complete connector composition, 167.91px Clock | Both remain an inset 864x1568 document | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 2560x1080 | Wide, 17 visible items, complete connector composition, 151.2px Clock | Both remain an inset 864x1048 document | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 3440x1440 | Wide, 17 visible items, complete connector composition, 167.91px Clock | Both remain an inset 864x1408 document | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |
| 3840x2160 | Large, 17 visible items, complete connector composition, 216px Clock | Both remain a bounded 864x2128 document rather than stretching | Opens below and inward-left, contained | Small artboard plus side inspector | PASS |

All recorded information-role floors passed. At 3840x2160 the measured Clock is 216px, date 22px, greeting 56px, Focus/support 20px, quote 20px, attribution 16px, body 18px, and metadata 14px.

## Deep interaction evidence

The deep path passed at 375x812, 1024x768, 1366x768, 1920x1080, 3440x1440, and 3840x2160. Each fencepost exercised Settings keyboard tab navigation and focus return, Weather activation/Escape/focus return, Tasks open/close/focus return, Connector Setup/Cancel and Edit/Close focus return, a real 650ms Clock long press, pointer capture, two live guides, pointer drag, keyboard movement, layer controls when overlapping, all four profile tabs, exact Cancel recovery, and one explicit Save at 1920x1080.

## Weather corner inspection

| Case | Measured panel | Direction | Close and stability | Result |
| --- | --- | --- | --- | --- |
| 390x844 top-left | 374x288.41 at x=8, y=183.64 | Below, inward-right | Siblings stable; Escape and outside close restore focus | PASS |
| 1920x1080 top-right | 384x291 at x=1493.39, y=127.48 | Below, inward-left | Siblings stable; Escape and outside close restore focus | PASS |
| 390x844 bottom-left | 374x288.41 at x=8, y=454.34 | Above, inward-right | Siblings stable; Escape and outside close restore focus | PASS |
| 1920x1080 bottom-right | 384x291 at x=1493.39, y=663.5 | Above, inward-left | Siblings stable; Escape and outside close restore focus | PASS |

## Connector size inspection

All 24 captures were opened individually. Each promised larger size adds useful information, rows, or visualization rather than blank padding.

| Connector | Sizes inspected | Useful progression | Result |
| --- | --- | --- | --- |
| Calendar | Compact, Standard | Next event and named source; Standard adds a second dated event and source | PASS |
| Service status | Compact, Standard | Compact summarizes two services; Standard exposes the individual service states visually | PASS |
| GitHub | Compact, Standard, Full | Attention count; graph and representative PR/issue rows; Full adds the remaining selected PR row | PASS |
| GitLab | Compact, Standard, Full | To-do/contribution summary; graph plus assigned/review rows; Full adds all selected merge-request rows | PASS |
| Jira | Compact, Standard, Full | Status counts; assigned issue rows; Full adds the due-soon section | PASS |
| Vercel | Compact, Standard, Full | Deployment summary; representative deployments; Full adds all four deployment rows | PASS |
| Home Assistant | Compact, Standard, Full | Two selected states; more states plus actions; Full adds the fifth state and third action | PASS |
| RSS | Compact, Standard, Full | Two headlines; six headlines; Full shows all eight configured headlines | PASS |
| Crypto | Compact, Standard | Primary selected coin; Standard adds the second selected coin | PASS |

Representative state captures were also inspected individually. RSS empty and GitLab loading render no stale or empty card shell. Stale Calendar retains useful named Studio and Family events while refresh is held. GitHub error is bounded and falls back to the truthful `All clear` state. These four captures cover ready-adjacent empty, loading, stale, and error behavior without a live provider call.

## Review and defect disposition

The single PR-P6 implementation/evidence review is Ready. No Critical or Important defect remains open.

- Fixed: bottom-bar items had zero intrinsic flex width under inline-size containment, allowing a neighboring launcher to intercept a real click.
- Fixed: the non-dock Clock glyph cap incorrectly applied to Full, limiting its 4K Clock to 167.9px. Full now measures 216px at 3840x2160.
- Fixed: outside pointer-close restored Weather trigger focus before the native pointer default moved focus away. Focus is reasserted after that default action.
- Corrected evidence: richer deterministic GitLab, Vercel, and Home Assistant fixture data now proves their Full branches.
- Corrected evidence: compact bottom-corner Weather baseline is measured only after the stored trigger is scrolled into view, separating user-scroll movement from disclosure geometry.

Minor observations do not reopen the packet: Arrange truthfully shows collision outlines for overlapping Small source placements; the 2560x1080 fixture truncates the long fixture greeting within its bounded assigned size; a user-positioned Weather overlay can cover information beneath it while open; existing Settings hydration tests still emit React `act()` warning noise. None demonstrates a security/privacy risk, data loss, broken core functionality, or failure of a written PR-P6 acceptance criterion.

## Owner captures

| Owner view | Exact original |
| --- | --- |
| 375x812 information-rich Canvas | `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\information-first-common-display\common\375x812\information-rich-canvas.png` |
| 1024x768 Settings Widgets | `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\information-first-common-display\common\1024x768\settings-widgets.png` |
| 1366x768 Settings Connectors | `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\information-first-common-display\common\1366x768\settings-connectors.png` |
| 1920x1080 top-right expanded Weather | `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\information-first-common-display\common\1920x1080\weather-top-right-expanded.png` |
| 1920x1080 Small Arrange with side inspector | `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\information-first-common-display\common\1920x1080\arrange-small-inspector.png` |
| 2560x1440 information-rich Large | `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\information-first-common-display\common\2560x1440\information-rich-canvas.png` |
| 3440x1440 information-rich Wide | `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\information-first-common-display\common\3440x1440\information-rich-canvas.png` |
| 3840x2160 information-rich Canvas | `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\information-first-common-display\common\3840x2160\information-rich-canvas.png` |

## Boundaries

The protected original checkout remained read-only. No Chrome Web Store field, package, image, save control, submission, publication, distribution, or rollout state was changed. PR-P7 remains blocked until the owner explicitly approves the eight PR-P6 originals.
