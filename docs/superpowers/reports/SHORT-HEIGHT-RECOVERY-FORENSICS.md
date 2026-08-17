# Short-height installed-extension recovery forensics

Date: 2026-08-17<br>
Trigger: Owner rejection of the PR-P6 `Ready` verdict against the installed extension at 1408x445<br>
Fix commit: `a325891`<br>
Probes: `scripts/forensic-short-height.mjs`, `scripts/forensic-weather-scroll.mjs`

## Verdict being corrected

The owner's installed extension at 1408x445 showed tiny ambiguous Bookmark
circles, a floating Timer chip, a mid-page Weather pill, a Clock clipped
below the viewport, and fixed utility controls. This is not an
information-first new tab. The PR-P6 acceptance recorded in `de76fed`
(A2-D059) and the PASS conclusion of
`INFORMATION-FIRST-COMMON-DISPLAY-QA.md` are rejected evidence. Commits
`7ee99b6` and `de76fed` remain preserved history.

## Reproduced root causes

Each cause below was traced in source and reproduced in real Chromium with
a production-mode build, existing-layout-shaped storage, and real pointer
interactions before any fix was written.

### 1. Short desktop windows received the Small phone document

`selectCanvasProfile` (`src/newtab/useCanvasViewport.ts`) returned
`compact` for any viewport under 700 CSS px tall, so the owner's 1408x445
desktop window rendered the phone profile. The derived compact profile is
a 3200px vertical coordinate plane (`SMALL_CANVAS_COORDINATE_HEIGHT`), so
the window showed only the top 445px of a scrolling phone document.
Reproduced with three storage shapes:

| Storage shape | Coordinate plane | Fully visible widgets at 1408x445 |
|---|---|---|
| Derived default (no `layout` key) | 3200 | 5 of 12 |
| V1 user layout (`legacyProfile` adaptation) | 1880 (content-derived) | 4 of 12, Clock top at 488px |
| Unmarked custom V3 compact (Arrange-saved) | 1276 (content-derived) | 6 of 12 |

The V1 case matches the owner's screenshot: V1 percentages were authored
against the visible page, but the compact plane reinterpreted them against
a content-derived document roughly four times taller than the window.

The V1-era CSS in `src/newtab/index.css` documents that the original
product deliberately supported "the owner's ~1420x437 short-wide browser
window" with height-responsive compression tiers (`short`, `xshort`,
`mid`) while keeping the desktop composition. The Canvas profile selector
regressed that decision.

**Fix:** width alone selects the phone profile; the
`--stage-css-profile` CSS mirror drops its `max-height: 699px` clause.
After the fix the V1-shaped layout renders all 12 enabled widgets inside
one non-scrolling 445px viewport.

### 2. Derived side-column minimum inflated the canvas height

`canvasMinimumHeight` used a flat 220px per side row, so three light
personal widgets forced a 900px canvas and pushed the centered Focus stack
below short folds even on the correct desktop profile. The minimum now
sums actual box heights per alternating column (240 + tallest column).
Derived defaults at 1408x445 now keep Clock, Greeting, Search, Focus,
Bookmarks, Weather, Timer, and Month inside the first viewport; Quote,
Tasks, and Notes sit within one intentional local scroll.

### 3. Weather anchor clamped against the scrollbar-inclusive viewport

`weatherPanelAnchor` math is correct, but `WeatherWidget` fed it
`window.innerWidth/innerHeight`, which include the classic Windows
scrollbar gutter whenever the document scrolls. A top-right panel could
legally sit up to ~17px underneath the scrollbar, matching the owner's
right-edge cut. Because root cause 1 made every short window scrollable,
this fired reliably in the installed extension while the emulated PR-P6
harness (overlay scrollbars, `clientWidth == innerWidth`) could never see
it. The anchor now clamps against `documentElement.clientWidth/Height`.

Also reproduced while open: scrolling the document detaches the panel
from its trigger and pins it at the viewport top over unrelated content
(the owner's narrow full-page capture). With root cause 1 fixed the
short-window document no longer scrolls in the common case; the pinning
behavior on genuinely scrollable canvases remains ledgered below.

### 4. Retired Adaptive Stage CSS restyled live Canvas bookmarks

`CanvasItem` still emits the legacy `board-item` class and
`data-stage-variant`, and retired stage rules
(`.board-item[data-stage-variant="compact"][data-block-id="bookmarks"]`)
hid every chip label and forced one-letter mark circles at ANY viewport
width whenever the placement size was compact. That block is deleted.
Label collapse now belongs solely to the `compact:` width media variant
(<= 720px), and named folders regain the media-gated pair the canonical
harness already models: folder glyph beside the readable label when roomy,
monogram alone in the compact circle. The PR-P2 single-node mark resolver
had regressed that swap.

## Why the PR-P6 harness passed

Each hypothesis from the recovery instruction was proved or rejected:

1. **Synthetic fixture replaced user state — proved.**
   `information-first-fixtures.mjs` seeds a hand-authored custom V3 layout
   with `coordinateHeight: 1800` before every state. The derived 3200px
   plane, V1-adapted layouts, and unmarked custom layouts were never
   rendered by the gate.
2. **Absent short-height desktop coverage — proved.** The 23-viewport
   catalog has no width >= 1100 with height < 720. The only short entry,
   1024x600, was judged as an intended "Compact height profile".
3. **Geometry-only assertions — proved.** The harness asserts overflow,
   clipping, and intersections against its own seeded layout. A phone
   document at desktop width passes every geometry check.
4. **Inspection biased by the written profile model — proved for
   1024x600.** The individually inspected capture showed the phone
   presentation on a desktop-wide window and was recorded PASS because the
   profile model said compact was correct there.
5. **Programmatic Weather repositioning — proved with a caveat.** Corner
   cases click the real disclosure, but placements are written directly to
   storage, and the emulated environment cannot reproduce classic
   scrollbar geometry, which is the mechanism behind the owner's cut.

## Focused evidence

- RED tests were written and observed failing for every fix family:
  profile selection (6 cases), side-column minimum (2), scrollbar clamp
  (1), bookmark mark pairing (1), and two CSS cascade contracts.
- Focused gate after the fix: 12 files / 204 tests green, TypeScript
  clean, `git diff --check` clean.
- Probe evidence (production-mode build, DSF 1, real clicks):
  `.forensic-short-height-out/forensic-evidence.json` plus captures. The
  post-fix V1 scenario renders 12/12 widgets in one 445px viewport;
  Weather expands inside the viewport at 1408x445, 1920x500, and 1280x720
  with real activation.

## Ledgered follow-ups (not closed by this fix)

1. **Arrange Small artboard truthfulness for unmarked custom profiles:**
   an Arrange-saved compact profile without `coordinateHeight` previews
   against the fixed 390x844 artboard but renders against a
   content-derived plane (reproduced: y=50% saved in the preview rendered
   at 582px of a 1276px plane). The artboard and runtime must share one
   plane. This affects phone-width windows only after fix 1.
2. **Open Weather panel pinning on scrollable canvases:** when the
   document scrolls while details are open, the fixed panel detaches from
   its trigger and pins at the top. Consider closing on trigger exit or
   scrolling with the owner.
3. **Real-window witnesses:** classic scrollbar geometry, native DPI
   scaling, and the owner's exact monitor arrangement cannot be emulated;
   the next owner-facing gate needs at least one real (non-emulated)
   window check at their 1408x445 class.
4. **Retired presentation debt:** `CanvasItem` still emits `board-item`
   and `data-stage-variant`, and live compact Weather chip styling keys on
   them. Full retirement needs the PR-P5-style reference-proof treatment.
5. **1920x500 selects Wide** under the pre-existing aspect rule
   (>= 1600px and ratio >= 2.1). Accepted behavior, recorded here.

## Required QA before any new owner gate

- Add a short-height desktop family to the matrix: widths around 1280,
  1366, 1408, 1440, 1920, and 2560 with heights between 400 and 720,
  including the exact 1408x445.
- Exercise existing-layout-shaped storage (V1-adapted, unmarked custom
  V3, derived default), resize transitions, and reloads, not only fresh
  fixture seeds.
- Judge each capture for usefulness, not only geometry: a green JSON with
  a broken-looking page fails the gate.
- Do not rerun the exhaustive 115-capture matrix until the focused
  families above are covered; follow the bounded one-run/one-rerun
  policy.

## Boundaries

The protected original at `D:\DEV\Chrome plugin` remained read-only and
upstream-equal at `eb1354b`. No Chrome Web Store state changed. PR-P7 and
all Store actions remain blocked pending a corrected owner-approved
visual gate and a new action-specific W6-P5 approval.
