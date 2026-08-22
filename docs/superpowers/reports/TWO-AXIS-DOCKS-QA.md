# Aurora Two-Axis Docks QA

Date: 2026-08-22

Deterministic source commit: `0d1eb7258af23012065898a289ac597518c0fc2b`

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
source commit above and exited zero. The runner first rejected tracked dirty
state, built with that exact Git commit, and verified the emitted
`build-provenance.json` before launching Chromium.

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
- hidden-widget recovery through the real disclosure and Show control,
  followed by Undo with zero writes
- Bookmarks Compact or Standard choice inside the dock
- one explicit Save followed by byte-stable reload
- zero page movement and zero stale transient chrome

The boundary witnesses were also exact:

- `599x800`: Bookmarks, Tasks, Notes, then Weather in the mechanical stacked
  order; all four render as stacked.
- `600x800`: Bookmarks top dock, Weather anchored, Tasks and Notes bottom
  dock; stored X and Y values remain unchanged.
- A dedicated mixed-layout edge probe placed Weather at top `0/0` and Tasks
  at bottom `100/100`, with legacy Bookmarks and Notes in the same docks.
  All four painted boxes remained inside their live band at 600x800, after a
  live resize to 1366x768, after returning to 600x800, and after reload.
  Stored coordinates stayed byte-stable.
- The mixed top and bottom DOM and tab sequences matched stored order at
  every edge-probe stage: Weather then Bookmarks, and Tasks then Notes.

## Legacy and storage evidence

- 12 of 12 absent-Y rectangle comparisons were exact across 1366x768,
  1408x445, and 1600x900.
- 3 of 3 full-page legacy screenshot hashes were byte-identical to the
  immutable baseline.
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
6. The bounded packet review found four Important defects. Explicit dock
   points now receive a storage-neutral live-band clamp, mixed absent-Y and
   explicit-Y members share one physical reading order, hidden recovery
   buttons restore their own pointer events, and the deterministic runner
   rejects dirty tracked source and verifies its built commit.
7. The review's peer-guide observation was also confirmed: dock snapping now
   admits only members actually stored in the same dock, never a free canvas
   widget whose center happens to cross the transparent band.
8. The review's screenshot-equality observation is now executable rather
   than informational. A changed or missing legacy capture fails the run.

Each production correction had a focused failing regression before the
implementation change.

## Bounded review status

The single packet review verdict was **With fixes**. The accepted findings
were implemented in the bounded fix range `18120ce..0d1eb72`, with 28 files
and 558 focused packet tests green, 8 executable harness-contract tests
green, TypeScript clean, and the deterministic browser witness above green.
The same reviewer receives only this fix range for the one allowed rereview.

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
