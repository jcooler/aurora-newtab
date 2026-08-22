# Aurora Two-Axis Docks QA

Date: 2026-08-22

Deterministic source commit: `bad863ba44c597cc21265f3215d5a67ef43ccf1c`

Immutable absent-Y baseline commit: `d299fdd0b9f3eab7b7e9aa45d1d4572fc736d09d`

This is additive DY-P1 evidence. It does not replace or rewrite the frozen
NL-P6 evidence. Every browser artifact is confined to the gitignored
`.qa-dy-p1-baseline`, `.qa-dy-p1-after`, and `.qa-dy-p1-window` roots.

## Product contract

- Every explicit dock member owns exact X and Y percentages inside its chosen
  top or bottom safety band. It is not forced into left, center, or right
  slots.
- Dragging may cross canvas, top dock, bottom dock, and back in one gesture.
  Nothing docks, undocks, changes edge, or changes tier automatically outside
  that direct gesture.
- A free widget records its return tier when it enters a dock. Leaving either
  dock restores that tier without a Compact prerequisite.
- Dock movement uses the same X and Y center, edge, and peer guides as canvas
  movement. Alt bypasses magnetism but never bypasses containment.
- Keyboard movement is two-axis: arrows move 8 CSS px and Shift plus arrows
  move 1 CSS px, with the same containment.
- One drag owns one Undo entry. Pointer cancellation and visible Cancel
  restore exact draft state and write nothing.
- Same-edge overlap is a live warning only. Aurora never reflows another
  member or guesses a correction.
- Legacy dock placements with no Y or return tier retain their exact former
  rectangles and storage bytes.

## Deterministic Chromium witness

`node scripts/qa-dy-p1.mjs --phase=after` ran from the exact deterministic
source commit above and exited zero.

| Viewport | Interaction verdict | Preview delta | Cancel delta | Visual judgment |
| --- | --- | ---: | ---: | --- |
| 1366x768 | pass | 0 CSS px | 0 CSS px | Useful. The authored canvas and both bands remain distinct, with all fixed utilities reachable. |
| 1408x445 | pass | 0 CSS px | 0 CSS px | Useful. The compact edit toolbar clears the top band, the modeless inspector cannot trap widgets behind its empty surface, and the final normal view has no forced overlap. |
| 1600x900 | pass | 0 CSS px | 0 CSS px | Useful. Exact X and Y placement remains intentional without stretching or auto-spreading the composition. |

Each desktop scenario proved:

- free to top to bottom and bottom to top traversal
- direct dock to canvas return-tier restoration
- both center guides and both peer guides
- Alt bypass with zero guide nodes
- live same-edge overlap and immediate warning cleanup
- pointer cancellation and visible Cancel with exact restoration
- Bookmarks Compact or Standard choice inside the dock
- one explicit Save followed by byte-stable reload
- zero page movement and zero stale transient chrome

The boundary witnesses were also exact:

- `599x800`: Bookmarks, Tasks, Notes, then Weather in the mechanical stacked
  order; all four render as stacked.
- `600x800`: Bookmarks top dock, Weather anchored, Tasks and Notes bottom
  dock; stored X and Y values remain unchanged.

## Legacy and storage evidence

- 12 of 12 absent-Y rectangle comparisons were exact across 1366x768,
  1408x445, and 1600x900.
- Both 599x800 and 600x800 baseline storage/order witnesses remained exact.
- The only product writes were three expected explicit Saves, one per desktop
  scenario, and every write contained only the `layouts` key.
- Cancel, pointer cancellation, reload, rendering, and boundary probes wrote
  nothing.
- No write included the frozen legacy `layout` key.
- Runtime errors: 0.
- Failed requests: 0.
- Harness failures: 0.

## Witness-caught defects closed before checkpoint

The real-browser sweep exposed defects that focused unit tests alone had not
made visible:

1. A dock presentation-size swap could settle about 45 CSS px away from the
   last visible preview. The held preview now remeasures until React paints
   the live presentation, so all three final deltas are 0.
2. The edit toolbar used a hardcoded 64px top offset and covered top-dock
   members. It now clears the complete measured safety band.
3. Every hidden widget was a full toolbar button, producing a 114px-tall
   control wall in short windows. Recovery now lives behind one `Hidden N`
   disclosure with every Show action preserved.
4. The Bookmarks inspector used a fictional 264px height and left its real
   163px panel under the toolbar. Collision placement now uses the rendered
   variant's bounded height.
5. The modeless inspector's empty surface could block another widget behind
   it. Only real inspector controls retain pointer targets.

Each production correction had a focused failing regression before the
implementation change.

## Real operating-system window status

The headed, non-emulated witness exists and its executable contract is green,
but it has not yet been run for this checkpoint. DY-P1 requires it to consume
the exact reviewed `dist`; Task 9 performs that run only after the bounded
packet review and exact build provenance check.

## Manual ceilings

Automation does not claim:

- genuine touch-hardware feel while crossing both dock bands
- real screen-reader speech and browse-mode behavior
- mixed-DPI monitor transitions during an active pointer gesture
- subjective comfort for every user-authored dense placement
- every possible photograph, custom color, connector payload, or future
  widget combination

Chrome Web Store upload, field edits, saves, submission, publication,
distribution, and rollout remain blocked pending a new action-specific
W6-P5 owner approval.
