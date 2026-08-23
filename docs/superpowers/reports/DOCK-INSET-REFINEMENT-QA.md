# Aurora 5px Dock Inset Refinement QA

Date: 2026-08-22

Exact browser source commit: `1e9a1afe3275b6688cf24676d4694dbc5d237e96`

This is additive evidence for the owner-approved outer-perimeter refinement.
It does not replace, rewrite, or weaken the immutable 16px edge and 72px side
DY-P1 baseline. Changing the parent band intentionally changes absolute
absent-Y viewport rectangles, while storage absence, reading order, internal
legacy margins, and recovery behavior remain protected.

## Measured Chromium result

`node scripts/qa-dock-inset.mjs` built the clean Git HEAD, verified emitted
build provenance, loaded that exact extension in Chromium, and exited zero.
The stabilized product gate also passed 197 files / 3,076 tests, 10/10
additive harness contracts, and TypeScript.

| Viewport | Top band | Bottom band | Toolbar top | Visual judgment |
| --- | --- | --- | ---: | --- |
| 600x800 | left 5, top 5, right 595, bottom 133 | left 5, top 667, right 595, bottom 795 | 141px | Useful. The dock boundary reads as nearly edge-to-edge while retaining a small visible perimeter. |
| 1408x445 | left 5, top 5, right 1403, bottom 101 | left 5, top 344, right 1403, bottom 440 | 109px | Useful. Both short-window bands reach the corners without covering the toolbar or fixed utilities. |

For both viewports:

- a held Clock at pointer coordinate 5,5 remained in the top dock;
- moving the same held Clock to 4,4 changed it to canvas placement;
- returning to 5,5 restored dock placement immediately;
- every painted member remained inside its live band;
- top reading order remained Clock and bottom reading order remained Tasks,
  then Notes;
- absent-Y members retained the internal 16px top, 2px right, and 2px bottom
  margins;
- the measured reload preserved the exact pre-reload seeded layouts bytes;
- pointer cancellation plus Escape restored the exact stored layouts bytes;
- storage writes: 0;
- runtime errors: 0;
- failed requests: 0;
- harness failures: 0.

Original-resolution screenshots and structured evidence are retained under
the gitignored `.qa-dy-p1-inset` root. The executable harness refuses dirty
tracked source and never touches `.qa-dy-p1-baseline`, `.qa-dy-p1-after`, or
the frozen NL-P6 evidence tree.

## Manual ceiling

The owner is evaluating whether the 5px visual breathing room feels better
than a true zero-inset edge. Automation does not claim subjective comfort for
every photograph, widget combination, or pointer trajectory.

Chrome Web Store upload, field edits, saves, submission, publication,
distribution, and rollout remain blocked pending a new action-specific
W6-P5 owner approval.
