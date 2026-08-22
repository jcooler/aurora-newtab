# Aurora Flow QA

Date: 2026-08-21

Reviewed product source commit: `5802e59` (`fix(flow): serialize config and isolate the live clock`)

This is additive Flow evidence. It does not replace or rewrite the accepted
NL-P6 evidence. All output was written to gitignored scratch directories:
`.qa-nl-p6-flow-sweep` and `.qa-nl-p6-flow-window`.

## Automated product sweep

The production preview build completed a six-scenario by twelve-viewport
matrix. The Flow scenario was captured before and after an attempted edit
chord at every viewport.

- 148 total captures
- 24 Flow captures
- 0 invariant failures
- 0 runtime errors
- 0 failed requests
- 0 storage writes during the full Flow render and resize sweep
- Flow remained the only product surface after `Ctrl+Shift+E`
- Canvas, docks, edit toolbar, Settings, Utility Tray, and photo refresh
  controls remained absent throughout Flow
- No horizontal page overflow

## Visual judgment

The following original-resolution Flow captures were inspected individually.
The standard is usefulness, not merely successful rendering.

| Viewport | Verdict | Judgment |
| --- | --- | --- |
| 599x800 | useful | Timer remains dominant; focus, controls, and next task are legible with comfortable vertical separation. |
| 720x900 | useful | The quiet hierarchy holds and the photograph remains visible rather than becoming a card backdrop. |
| 1024x600 | useful | All four interaction targets fit without crowding or clipped content. |
| 1408x445 | useful | The exact short-height family remains compact, centered, and fully reachable with no overlap. |
| 1600x900 | useful | Focus sentence leads, timer is dominant, and the next task reads as secondary context. |
| 1920x550 | useful | Short-wide composition stays coherent and does not stretch controls across the screen. |
| 3440x1440 | useful | The work field stays intentionally centered; it does not turn immersive whitespace into dashboard filler. |

## Real OS window and cross-tab witness

The headed witness measured a real Chromium window at exactly `1408x445` CSS
pixels and DPR 1. It recorded six stages with no failures, runtime errors, or
failed requests.

- Flow replaced the complete named-layout dashboard.
- A second real new-tab page restored the same `flow: true` state and exact
  absolute deadline.
- The displayed countdowns differed by 0 seconds.
- Pausing in the first tab changed the second tab to Resume without reload.
- Ending Flow restored the named dashboard in both tabs.
- The only Flow interaction writes were two `timerSession` writes: Pause and
  End flow.
- Neither `layout` nor `layouts` was written.

The same witness also retained the accepted named-layout interaction smoke:
free drag, live undock and re-dock, explicit Save, reload round-trip, and exact
Cancel with zero writes.

## Manual ceilings

Automation does not claim the following:

- subjective long-session comfort on every user photograph and custom text
  color combination
- a real screen-reader walkthrough
- operating-system sleep and wake during a running Flow deadline
- operating-system timezone changes during an active day focus
- audible timer completion on every supported host configuration

These ceilings do not conceal a known automated failure. They identify the
remaining human and host-environment checks honestly.

## Review and stabilized gate

The bounded implementation review found three Important issues: timer actions
could reduce against a stale React config snapshot, an idle 500 ms clock could
invalidate the complete App tree, and the first vertical QA bound could accept
its own overflow. Focused failing regressions preceded the fix in `5802e59`.
The same reviewer rereviewed that exact range and returned Ready with no
Critical or Important issue open.

The post-fix scratch sweep and real-window witness both reran green. The
stabilized full Vitest pass reached 158 files, 2,614 passed tests, and one
existing launcher-loop timing failure: the test synthesized Escape before the
panel's passive dialog-stack registration had flushed. `373784f` made the test
model two separate user events explicitly; its causal rerun passed. Per the
written gate rule, the full suite was not churned a second time. TypeScript,
the 8-test information-first contract, the 6-test scratch-output safety
contract, diff hygiene, and the 214-module production build passed. No React
act warning was emitted.
