# Aurora Widget Stacks QA

Date: 2026-08-22

Reviewed product source commit: `619da14` (`fix(stacks): preserve card tier and cancel drags`)

Current checkpoint source: `5096dcc` (reviewed product plus the test-only
information-first scenario contract correction)

This is additive widget-stack evidence. It does not replace or rewrite the
owner-accepted NL-P6 evidence. All browser output was written to gitignored
scratch directories under `.qa-nl-p6-widget-stacks-*`.

## Product contract

- A stack is one manual named-layout placement containing ordered existing
  widget identities. It never duplicates a widget data owner.
- Creation is explicit: an editing drag must remain over an eligible widget
  or stack for 500 ms before Aurora marks the target. Ordinary overlap remains
  an ordinary move.
- All members stay mounted in one grid, while only the facing member is
  visible and interactive.
- The card keeps the stored shared tier and the maximum member footprint.
  Paging to a compact-only member does not collapse Full-capable siblings or
  resize the card.
- Normal arrows, dots, swipe, and keyboard paging serialize the one facing
  field through the `layouts` key. Edit-mode face changes remain draft-only.
- Whole-card movement, member reorder, member removal, direct member detach,
  and automatic two-member dissolution each preserve exact Undo and Cancel.
- Browser or operating-system `pointercancel` restores the exact pre-gesture
  edit session and never invokes drop semantics.
- Stacks do not dock, auto-rotate, auto-create, or surface themselves.

## Automated browser sweep

The production preview build first completed the complete seven-scenario by
twelve-viewport matrix, including normal and edit states plus the existing
dock-hover probes.

- 172 total captures
- 24 widget-stack captures
- 0 invariant failures
- 0 runtime errors
- 0 failed requests
- constant stack box: 470.796875 by 267 CSS px across Quote, Month, and Weather
- normal paging wrote `layouts` only
- edit-mode face change plus Cancel wrote nothing and restored Quote exactly

The bounded review then found two Important defects. Focused regressions and
the single fix cycle closed both. Because the fix changed stack behavior, the
stack-only matrix reran from `5096dcc`:

- 24 captures
- 0 invariant failures
- 0 runtime errors
- 0 failed requests

## Original-resolution visual judgment

Every listed normal and edit capture was inspected at original resolution.
The standard is usefulness and reachable controls, not merely a successful
render.

| Viewport | Verdict | Judgment |
| --- | --- | --- |
| 599x800 | useful | The mechanical narrow floor keeps Timer, Clock, Notes, and the stack in one readable column. The wrapped edit toolbar and hidden-widget controls remain inside the viewport, and the legibility wash reaches the bottom edge. |
| 600x800 | useful | The authored anchored composition resumes exactly at the boundary. Stack dots, face, edit controls, and fixed utilities remain reachable without a hard background seam. |
| 720x900 | useful | The two-row edit toolbar is bounded and legible; the shared stack face is visually distinct without adding a second opaque shell. |
| 1024x600 | useful | The toolbar remains one concise row, the stack face and dots are unobstructed, and standalone Clock and Notes preserve their authored positions. |
| 1408x445 | useful | The exact owner short-window family remains fully visible. Timer stays docked, stack controls remain hit-testable, and the inspector avoidance fix keeps stack dots reachable. |
| 1600x900 | useful | The shared footprint reads clearly in edit mode and preserves ample room around the face without manufacturing content. |
| 1920x550 | useful | The short-wide composition stays coherent and all stack/edit controls remain within the real viewport. |
| 3440x1440 | useful | The authored objects remain intentionally sparse rather than being auto-spread; the stack remains one clear object with compact controls. |

Swipe verdict: a horizontal gesture must exceed 40 CSS px. The 50px witness
paged exactly once, did not activate the Weather face button, and retained the
same card dimensions. Arrow buttons, dots, and ArrowLeft/ArrowRight provide
equivalent explicit paths.

## Real operating-system window witness

The headed Chromium witness measured a real inner window at exactly
`1408x445` CSS px and DPR 1. It recorded nine stages with zero failures,
runtime errors, or failed requests.

- A sub-500ms overlap stayed as two standalone widgets.
- A 550ms hold created a second stack and one Undo restored both standalone
  widgets.
- Reorder, remove, dissolve, and two-step restoration remained exact.
- Edit-mode dot paging plus Escape restored Quote and wrote nothing.
- Normal Weather activation opened the same Weather details dialog.
- Normal paging wrapped, wrote `layouts` only, and restored Month after reload.
- The same witness retained Flow cross-tab deadline and exit proof.

After the review fix, the complete nine-stage witness reran from the exact
current build with the same measured 1408x445 window and remained green.

## Review and stabilized gate

The bounded implementation review found two Important issues and no Critical
issue:

1. resolving the shared stack tier against the facing widget could collapse a
   Full stack when a compact-only member faced;
2. native `pointercancel` called drop semantics after live movement.

Seven focused failures were observed before production changes. `619da14`
preserves the shared tier, resolves every member independently, routes native
cancellation away from drop, and restores the exact pre-preview session. The
same reviewer rereviewed only `09e8112..619da14` and returned Ready with no
Critical or Important issue open.

The stabilized gate passed:

- 161 Vitest files, 2,679 tests
- TypeScript with no errors
- information-first contract: 8 of 8
- scratch-output safety contract: 7 of 7
- production build: 217 modules
- diff hygiene

The plan's stale `test:information-first` alias was resolved to the current
`test:information-first-contract` script. That live contract exposed and then
pinned the new `stacks` scenario in `5096dcc`; no product source changed.

## Manual ceilings

Automation does not claim:

- genuine touch-hardware feel for the 500ms hold and swipe threshold
- real screen-reader speech and browse-mode behavior
- long-session subjective comfort across every photograph and custom color
- live connector network behavior inside every possible stack combination
- mixed-DPI monitor transitions during an active pointer gesture

These are honest environment and judgment ceilings, not concealed automated
failures.
