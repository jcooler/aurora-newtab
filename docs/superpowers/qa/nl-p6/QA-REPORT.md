# NL-P6 Product QA Report

Corrected A2-D060 standard: short-height desktop family including the owner's
exact 1408x445, existing-layout-shaped storage, a real non-emulated window
witness (`window-evidence.json`), and a PER-CAPTURE usefulness judgment — a
capture passes only if the composition is USEFUL at that size; rendering
without error is not a pass.

**Result: 124 captures, every one judged, zero unjudged.** Five storage
shapes x twelve viewports x normal/edit (+ hover-dock probes). Programmatic
invariants (no horizontal page overflow, no degenerate box, nothing fully
offscreen, settings gear always hit-testable, layouts-only writes) hold at
every cell. Nine defects were found and eight fixed under this packet; the
ninth is an owner design decision, below.

## Findings

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | Critical | On a FRESH install at 1408x445 the full clock glyph and the greeting struck through each other. | Fixed — clock/greeting/focus spacing re-derived from the real 30vh-capped block height. |
| F2 | Important | The same collision recurred one row down (greeting vs focus) at 1280x500. | Fixed with F1 in the same re-derivation. |
| F3 | Important | The Tasks launcher sat under the fixed layout-badge/gear cluster at <=1024 widths — a permanently unclickable widget. | Fixed — Tasks raised out of the corner band. |
| F4 | Important | Sun and Moon overlapped the Month card at short viewports. | Fixed — personal column spread below the month's real card height. |
| F5 | Important | Nine simultaneous STANDARD connector cards could not compose in one column at any common height. | Fixed — connectors default to their compact glance tier; the user upsizes what they care about. |
| F6 | Important | Edge-placed widgets were pushed off-screen when the same document opened in a narrower window (percent positions vs pixel widths). | Fixed — a live edge-safety clamp that self-corrects on resize, touches no storage, and moves no neighbour. |
| F7 | Important | An ENABLED but unconfigured widget (World clocks with no clocks, Countdown with no countdowns, Habits with no habits) rendered an invisible GHOST: selectable, draggable, chrome-bearing, and counted in overlap warnings. | Fixed — a widget that renders nothing is marked empty and made wholly inert: no chrome, no selection, no drag, no geometry, no hit area. Detected with a MutationObserver, because widgets fill in asynchronously and a render-time check latched "empty" forever. |
| F8 | Important | The designed default table collided with itself at COMMON heights: Calendar struck the Month card 25-40px at every size including 1920x1080; Status struck the Weather chip; Jira struck Vercel at 1366x768. | Fixed — personal and work column literals re-derived against real card heights, measured not eyeballed. 1920x1080 is now completely clean; 1600x900 has one 6px sliver. |
| F9 | Owner decision | With EVERY widget enabled at once (22+) on a short window (1408x445), the two side columns crowd: ~15 small overlaps. Percent positions against pixel-height cards shrink as the window shortens, so no static table can fit this many widgets at that height — and the spec's own law forbids auto re-flow ("nothing auto-swaps, derives, guesses, or re-flows"). | NOT fixed unilaterally. Every widget stays legible, movable, and reachable; nothing is clipped or lost. Options for you: (a) accept as-is — the user drags what they want where they want; (b) let me design a second static default composition for short windows; (c) revisit the no-re-flow law for DEFAULT slots only. |

Residual minors, recorded not hidden: at 1366x768 the wide Headlines glance
meets the Tasks launcher by 2-15px, and Status meets Weather by 2px. Chasing
these risked re-breaking F3, so they are reported rather than tuned.

## Real-window witness

`window-evidence.json`: a genuine OS window (not viewport emulation) measured
at exactly **1408x445** CSS px. Free drag, dock-out-and-back-in, Save +
reload round-trip, and exact-cancel-writes-nothing all pass in that window.

## Per-capture verdicts

| Capture | Scenario | Viewport | State | Verdict |
| --- | --- | --- | --- | --- |
| ![fresh-1408x445-normal](fresh-1408x445-normal.png) | fresh | 1408x445 | normal | useful |
| ![fresh-1408x445-edit](fresh-1408x445-edit.png) | fresh | 1408x445 | edit | useful |
| ![fresh-1024x600-normal](fresh-1024x600-normal.png) | fresh | 1024x600 | normal | useful |
| ![fresh-1024x600-edit](fresh-1024x600-edit.png) | fresh | 1024x600 | edit | useful |
| ![fresh-1920x550-normal](fresh-1920x550-normal.png) | fresh | 1920x550 | normal | useful |
| ![fresh-1920x550-edit](fresh-1920x550-edit.png) | fresh | 1920x550 | edit | useful |
| ![fresh-1280x500-normal](fresh-1280x500-normal.png) | fresh | 1280x500 | normal | useful |
| ![fresh-1280x500-edit](fresh-1280x500-edit.png) | fresh | 1280x500 | edit | useful |
| ![fresh-1366x768-normal](fresh-1366x768-normal.png) | fresh | 1366x768 | normal | useful |
| ![fresh-1366x768-edit](fresh-1366x768-edit.png) | fresh | 1366x768 | edit | useful |
| ![fresh-1600x900-normal](fresh-1600x900-normal.png) | fresh | 1600x900 | normal | useful |
| ![fresh-1600x900-edit](fresh-1600x900-edit.png) | fresh | 1600x900 | edit | useful |
| ![fresh-1920x1080-normal](fresh-1920x1080-normal.png) | fresh | 1920x1080 | normal | useful |
| ![fresh-1920x1080-edit](fresh-1920x1080-edit.png) | fresh | 1920x1080 | edit | useful |
| ![fresh-2560x1440-normal](fresh-2560x1440-normal.png) | fresh | 2560x1440 | normal | useful |
| ![fresh-2560x1440-edit](fresh-2560x1440-edit.png) | fresh | 2560x1440 | edit | useful |
| ![fresh-3440x1440-normal](fresh-3440x1440-normal.png) | fresh | 3440x1440 | normal | useful |
| ![fresh-3440x1440-edit](fresh-3440x1440-edit.png) | fresh | 3440x1440 | edit | useful |
| ![fresh-720x900-normal](fresh-720x900-normal.png) | fresh | 720x900 | normal | useful |
| ![fresh-720x900-edit](fresh-720x900-edit.png) | fresh | 720x900 | edit | useful |
| ![fresh-599x800-normal](fresh-599x800-normal.png) | fresh | 599x800 | normal | useful |
| ![fresh-599x800-edit](fresh-599x800-edit.png) | fresh | 599x800 | edit | useful |
| ![fresh-600x800-normal](fresh-600x800-normal.png) | fresh | 600x800 | normal | useful |
| ![fresh-600x800-edit](fresh-600x800-edit.png) | fresh | 600x800 | edit | useful |
| ![legacy-v1-1408x445-normal](legacy-v1-1408x445-normal.png) | legacy-v1 | 1408x445 | normal | useful |
| ![legacy-v1-1408x445-edit](legacy-v1-1408x445-edit.png) | legacy-v1 | 1408x445 | edit | useful |
| ![legacy-v1-1024x600-normal](legacy-v1-1024x600-normal.png) | legacy-v1 | 1024x600 | normal | useful |
| ![legacy-v1-1024x600-edit](legacy-v1-1024x600-edit.png) | legacy-v1 | 1024x600 | edit | useful |
| ![legacy-v1-1920x550-normal](legacy-v1-1920x550-normal.png) | legacy-v1 | 1920x550 | normal | useful |
| ![legacy-v1-1920x550-edit](legacy-v1-1920x550-edit.png) | legacy-v1 | 1920x550 | edit | useful |
| ![legacy-v1-1280x500-normal](legacy-v1-1280x500-normal.png) | legacy-v1 | 1280x500 | normal | useful |
| ![legacy-v1-1280x500-edit](legacy-v1-1280x500-edit.png) | legacy-v1 | 1280x500 | edit | useful |
| ![legacy-v1-1366x768-normal](legacy-v1-1366x768-normal.png) | legacy-v1 | 1366x768 | normal | useful |
| ![legacy-v1-1366x768-edit](legacy-v1-1366x768-edit.png) | legacy-v1 | 1366x768 | edit | useful |
| ![legacy-v1-1600x900-normal](legacy-v1-1600x900-normal.png) | legacy-v1 | 1600x900 | normal | useful |
| ![legacy-v1-1600x900-edit](legacy-v1-1600x900-edit.png) | legacy-v1 | 1600x900 | edit | useful |
| ![legacy-v1-1920x1080-normal](legacy-v1-1920x1080-normal.png) | legacy-v1 | 1920x1080 | normal | useful |
| ![legacy-v1-1920x1080-edit](legacy-v1-1920x1080-edit.png) | legacy-v1 | 1920x1080 | edit | useful |
| ![legacy-v1-2560x1440-normal](legacy-v1-2560x1440-normal.png) | legacy-v1 | 2560x1440 | normal | useful |
| ![legacy-v1-2560x1440-edit](legacy-v1-2560x1440-edit.png) | legacy-v1 | 2560x1440 | edit | useful |
| ![legacy-v1-3440x1440-normal](legacy-v1-3440x1440-normal.png) | legacy-v1 | 3440x1440 | normal | useful |
| ![legacy-v1-3440x1440-edit](legacy-v1-3440x1440-edit.png) | legacy-v1 | 3440x1440 | edit | useful |
| ![legacy-v1-720x900-normal](legacy-v1-720x900-normal.png) | legacy-v1 | 720x900 | normal | useful |
| ![legacy-v1-720x900-edit](legacy-v1-720x900-edit.png) | legacy-v1 | 720x900 | edit | useful |
| ![legacy-v1-599x800-normal](legacy-v1-599x800-normal.png) | legacy-v1 | 599x800 | normal | useful |
| ![legacy-v1-599x800-edit](legacy-v1-599x800-edit.png) | legacy-v1 | 599x800 | edit | useful |
| ![legacy-v1-600x800-normal](legacy-v1-600x800-normal.png) | legacy-v1 | 600x800 | normal | useful |
| ![legacy-v1-600x800-edit](legacy-v1-600x800-edit.png) | legacy-v1 | 600x800 | edit | useful |
| ![named-saved-1408x445-normal](named-saved-1408x445-normal.png) | named-saved | 1408x445 | normal | useful |
| ![named-saved-1408x445-edit](named-saved-1408x445-edit.png) | named-saved | 1408x445 | edit | useful |
| ![named-saved-1408x445-hover-dock](named-saved-1408x445-hover-dock.png) | named-saved | 1408x445 | hover-dock | useful |
| ![named-saved-1024x600-normal](named-saved-1024x600-normal.png) | named-saved | 1024x600 | normal | useful |
| ![named-saved-1024x600-edit](named-saved-1024x600-edit.png) | named-saved | 1024x600 | edit | useful |
| ![named-saved-1920x550-normal](named-saved-1920x550-normal.png) | named-saved | 1920x550 | normal | useful |
| ![named-saved-1920x550-edit](named-saved-1920x550-edit.png) | named-saved | 1920x550 | edit | useful |
| ![named-saved-1280x500-normal](named-saved-1280x500-normal.png) | named-saved | 1280x500 | normal | useful |
| ![named-saved-1280x500-edit](named-saved-1280x500-edit.png) | named-saved | 1280x500 | edit | useful |
| ![named-saved-1366x768-normal](named-saved-1366x768-normal.png) | named-saved | 1366x768 | normal | useful |
| ![named-saved-1366x768-edit](named-saved-1366x768-edit.png) | named-saved | 1366x768 | edit | useful |
| ![named-saved-1600x900-normal](named-saved-1600x900-normal.png) | named-saved | 1600x900 | normal | useful |
| ![named-saved-1600x900-edit](named-saved-1600x900-edit.png) | named-saved | 1600x900 | edit | useful |
| ![named-saved-1600x900-hover-dock](named-saved-1600x900-hover-dock.png) | named-saved | 1600x900 | hover-dock | useful |
| ![named-saved-1920x1080-normal](named-saved-1920x1080-normal.png) | named-saved | 1920x1080 | normal | useful |
| ![named-saved-1920x1080-edit](named-saved-1920x1080-edit.png) | named-saved | 1920x1080 | edit | useful |
| ![named-saved-2560x1440-normal](named-saved-2560x1440-normal.png) | named-saved | 2560x1440 | normal | useful |
| ![named-saved-2560x1440-edit](named-saved-2560x1440-edit.png) | named-saved | 2560x1440 | edit | useful |
| ![named-saved-3440x1440-normal](named-saved-3440x1440-normal.png) | named-saved | 3440x1440 | normal | useful |
| ![named-saved-3440x1440-edit](named-saved-3440x1440-edit.png) | named-saved | 3440x1440 | edit | useful |
| ![named-saved-720x900-normal](named-saved-720x900-normal.png) | named-saved | 720x900 | normal | useful |
| ![named-saved-720x900-edit](named-saved-720x900-edit.png) | named-saved | 720x900 | edit | useful |
| ![named-saved-599x800-normal](named-saved-599x800-normal.png) | named-saved | 599x800 | normal | useful |
| ![named-saved-599x800-edit](named-saved-599x800-edit.png) | named-saved | 599x800 | edit | useful |
| ![named-saved-600x800-normal](named-saved-600x800-normal.png) | named-saved | 600x800 | normal | useful |
| ![named-saved-600x800-edit](named-saved-600x800-edit.png) | named-saved | 600x800 | edit | useful |
| ![connectors-1408x445-normal](connectors-1408x445-normal.png) | connectors | 1408x445 | normal | useful — the scenario AUTHORS overlapping standard cards (spec 2.2: the user owns placement); warned, never re-flowed |
| ![connectors-1408x445-edit](connectors-1408x445-edit.png) | connectors | 1408x445 | edit | useful — the scenario AUTHORS overlapping standard cards (spec 2.2: the user owns placement); warned, never re-flowed |
| ![connectors-1408x445-hover-dock](connectors-1408x445-hover-dock.png) | connectors | 1408x445 | hover-dock | useful — the scenario AUTHORS overlapping standard cards (spec 2.2: the user owns placement); warned, never re-flowed |
| ![connectors-1024x600-normal](connectors-1024x600-normal.png) | connectors | 1024x600 | normal | useful — the scenario AUTHORS overlapping standard cards (spec 2.2: the user owns placement); warned, never re-flowed |
| ![connectors-1024x600-edit](connectors-1024x600-edit.png) | connectors | 1024x600 | edit | useful — the scenario AUTHORS overlapping standard cards (spec 2.2: the user owns placement); warned, never re-flowed |
| ![connectors-1920x550-normal](connectors-1920x550-normal.png) | connectors | 1920x550 | normal | useful — the scenario AUTHORS overlapping standard cards (spec 2.2: the user owns placement); warned, never re-flowed |
| ![connectors-1920x550-edit](connectors-1920x550-edit.png) | connectors | 1920x550 | edit | useful — the scenario AUTHORS overlapping standard cards (spec 2.2: the user owns placement); warned, never re-flowed |
| ![connectors-1280x500-normal](connectors-1280x500-normal.png) | connectors | 1280x500 | normal | useful — the scenario AUTHORS overlapping standard cards (spec 2.2: the user owns placement); warned, never re-flowed |
| ![connectors-1280x500-edit](connectors-1280x500-edit.png) | connectors | 1280x500 | edit | useful — the scenario AUTHORS overlapping standard cards (spec 2.2: the user owns placement); warned, never re-flowed |
| ![connectors-1366x768-normal](connectors-1366x768-normal.png) | connectors | 1366x768 | normal | useful |
| ![connectors-1366x768-edit](connectors-1366x768-edit.png) | connectors | 1366x768 | edit | useful |
| ![connectors-1600x900-normal](connectors-1600x900-normal.png) | connectors | 1600x900 | normal | useful |
| ![connectors-1600x900-edit](connectors-1600x900-edit.png) | connectors | 1600x900 | edit | useful |
| ![connectors-1600x900-hover-dock](connectors-1600x900-hover-dock.png) | connectors | 1600x900 | hover-dock | useful |
| ![connectors-1920x1080-normal](connectors-1920x1080-normal.png) | connectors | 1920x1080 | normal | useful |
| ![connectors-1920x1080-edit](connectors-1920x1080-edit.png) | connectors | 1920x1080 | edit | useful |
| ![connectors-2560x1440-normal](connectors-2560x1440-normal.png) | connectors | 2560x1440 | normal | useful |
| ![connectors-2560x1440-edit](connectors-2560x1440-edit.png) | connectors | 2560x1440 | edit | useful |
| ![connectors-3440x1440-normal](connectors-3440x1440-normal.png) | connectors | 3440x1440 | normal | useful |
| ![connectors-3440x1440-edit](connectors-3440x1440-edit.png) | connectors | 3440x1440 | edit | useful |
| ![connectors-720x900-normal](connectors-720x900-normal.png) | connectors | 720x900 | normal | useful |
| ![connectors-720x900-edit](connectors-720x900-edit.png) | connectors | 720x900 | edit | useful |
| ![connectors-599x800-normal](connectors-599x800-normal.png) | connectors | 599x800 | normal | useful |
| ![connectors-599x800-edit](connectors-599x800-edit.png) | connectors | 599x800 | edit | useful |
| ![connectors-600x800-normal](connectors-600x800-normal.png) | connectors | 600x800 | normal | useful |
| ![connectors-600x800-edit](connectors-600x800-edit.png) | connectors | 600x800 | edit | useful |
| ![connectors-default-1408x445-normal](connectors-default-1408x445-normal.png) | connectors-default | 1408x445 | normal | useful with documented limit F9 — every widget enabled at once on a short window crowds the two side columns; each widget stays legible and movable, nothing is clipped or unreachable |
| ![connectors-default-1408x445-edit](connectors-default-1408x445-edit.png) | connectors-default | 1408x445 | edit | useful with documented limit F9 — every widget enabled at once on a short window crowds the two side columns; each widget stays legible and movable, nothing is clipped or unreachable |
| ![connectors-default-1024x600-normal](connectors-default-1024x600-normal.png) | connectors-default | 1024x600 | normal | useful with documented limit F9 — every widget enabled at once on a short window crowds the two side columns; each widget stays legible and movable, nothing is clipped or unreachable |
| ![connectors-default-1024x600-edit](connectors-default-1024x600-edit.png) | connectors-default | 1024x600 | edit | useful with documented limit F9 — every widget enabled at once on a short window crowds the two side columns; each widget stays legible and movable, nothing is clipped or unreachable |
| ![connectors-default-1920x550-normal](connectors-default-1920x550-normal.png) | connectors-default | 1920x550 | normal | useful with documented limit F9 — every widget enabled at once on a short window crowds the two side columns; each widget stays legible and movable, nothing is clipped or unreachable |
| ![connectors-default-1920x550-edit](connectors-default-1920x550-edit.png) | connectors-default | 1920x550 | edit | useful with documented limit F9 — every widget enabled at once on a short window crowds the two side columns; each widget stays legible and movable, nothing is clipped or unreachable |
| ![connectors-default-1280x500-normal](connectors-default-1280x500-normal.png) | connectors-default | 1280x500 | normal | useful with documented limit F9 — every widget enabled at once on a short window crowds the two side columns; each widget stays legible and movable, nothing is clipped or unreachable |
| ![connectors-default-1280x500-edit](connectors-default-1280x500-edit.png) | connectors-default | 1280x500 | edit | useful with documented limit F9 — every widget enabled at once on a short window crowds the two side columns; each widget stays legible and movable, nothing is clipped or unreachable |
| ![connectors-default-1366x768-normal](connectors-default-1366x768-normal.png) | connectors-default | 1366x768 | normal | useful |
| ![connectors-default-1366x768-edit](connectors-default-1366x768-edit.png) | connectors-default | 1366x768 | edit | useful |
| ![connectors-default-1600x900-normal](connectors-default-1600x900-normal.png) | connectors-default | 1600x900 | normal | useful |
| ![connectors-default-1600x900-edit](connectors-default-1600x900-edit.png) | connectors-default | 1600x900 | edit | useful |
| ![connectors-default-1920x1080-normal](connectors-default-1920x1080-normal.png) | connectors-default | 1920x1080 | normal | useful |
| ![connectors-default-1920x1080-edit](connectors-default-1920x1080-edit.png) | connectors-default | 1920x1080 | edit | useful |
| ![connectors-default-2560x1440-normal](connectors-default-2560x1440-normal.png) | connectors-default | 2560x1440 | normal | useful |
| ![connectors-default-2560x1440-edit](connectors-default-2560x1440-edit.png) | connectors-default | 2560x1440 | edit | useful |
| ![connectors-default-3440x1440-normal](connectors-default-3440x1440-normal.png) | connectors-default | 3440x1440 | normal | useful |
| ![connectors-default-3440x1440-edit](connectors-default-3440x1440-edit.png) | connectors-default | 3440x1440 | edit | useful |
| ![connectors-default-720x900-normal](connectors-default-720x900-normal.png) | connectors-default | 720x900 | normal | useful |
| ![connectors-default-720x900-edit](connectors-default-720x900-edit.png) | connectors-default | 720x900 | edit | useful |
| ![connectors-default-599x800-normal](connectors-default-599x800-normal.png) | connectors-default | 599x800 | normal | useful |
| ![connectors-default-599x800-edit](connectors-default-599x800-edit.png) | connectors-default | 599x800 | edit | useful |
| ![connectors-default-600x800-normal](connectors-default-600x800-normal.png) | connectors-default | 600x800 | normal | useful |
| ![connectors-default-600x800-edit](connectors-default-600x800-edit.png) | connectors-default | 600x800 | edit | useful |
