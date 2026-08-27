# V1 Canvas integrated visual QA

Date: 2026-08-17<br>
Packet: Canvas-P7<br>
Harness: `node scripts/preview-v1-canvas.mjs`

## Result

PASS after owner-reported residual correction and renewed owner approval. The first submitted Desktop capture exposed a malformed Compact Month: seven dates existed in the DOM but stacked vertically because a Compact CSS rule replaced native table-cell layout. Commit `01f5076` removes only that override and adds a real geometry assertion. The corrected one-shot Chromium probe completed with no console errors, page errors, failed requests, missing images, document horizontal overflow, intersections, or clipped owner blocks. Each corrected PNG was inspected again at original resolution during Packet 8; no Critical or Important visual finding remains.

## Packet 8 final gate record

- The active Packet 7 checkpoint and protected original were clean and upstream-equal before the final gate. The protected original remained read-only at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- The one full `npm test` run had one failure: an obsolete W4-P1 source-text assertion that required the retired empty Day presentation. The behavior-level App coverage already proves the Canvas renders no synthetic Day context. Removing only that obsolete assertion left the affected focused family green at 2 files / 29 tests. The full suite was not repeated.
- `npm run build` and `npm run build:preview` each completed with 193 modules transformed. The exact production bridge scan found no preview storage, permission, backup, or restore harness symbol in `dist`.
- The canonical harness was run once, then rerun once after its actual stale Utility Tray/direct Timer selector family was corrected. The permitted rerun passed cross-context storage ownership, Web Locks, 50 concurrent mutations, daily rollover, sleeping Timer transition, and Calendar rollover before a remaining harness-only `timerDialog` reference stopped execution. That reference was corrected and the bounded W1-P7-only Chromium evidence then passed all seven reported checks, including exact storage restoration and an advancing real clock. No third canonical run occurred.
- The second-run log is `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\canvas-p8\canonical-harness.log`. The incomplete canonical traversal is ledgered as Minor procedural evidence debt. It did not demonstrate a security/privacy risk, data loss, broken core functionality, or a failed Canvas acceptance criterion.
- One final acceptance review returned Ready with no Critical or Important finding. The final-gate correction changes only test and browser-harness code; no production, storage, security, privacy, permission, connector, backup, migration, or Store boundary changed.

## Owner captures

| Capture | Exact original dimensions | Observation |
| --- | --- | --- |
| `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\canvas-p7\canvas-p7-desktop-1600x900-bookmarks-github-jira.png` | 1600x900 | Top Bookmarks, centered Clock/Focus, direct tools, Compact Month with `16 17 18 19 20 21 22` in one left-to-right row, rich GitHub graph/rows, and rich Jira rows are visible. Evidence records zero intersections and zero clipped blocks. |
| `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\canvas-p7\canvas-p7-large-2560x1440-dense.png` | 2560x1440 | Dense readable composition shows ICS, Status, GitHub, GitLab, Jira, Vercel, Home Assistant, RSS, Crypto, and a full natural Month. Evidence records zero intersections and zero clipped blocks. |
| `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\canvas-p7\canvas-p7-wide-3440x1440-dense.png` | 3440x1440 | Wide profile preserves the same complete connector composition with added whitespace. Evidence records zero intersections and zero clipped blocks. |

Evidence JSON: `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\canvas-p7\canvas-p7-evidence.json`.

## Fixture and snapshot method

The disposable Playwright extension profile receives deterministic bookmarks and fresh snapshots for ICS, Status, GitHub, GitLab, Jira, Vercel, Home Assistant, RSS, and Crypto. Every snapshot uses the production opaque scope algorithm. ICS includes the live `Intl.DateTimeFormat().resolvedOptions().timeZone` runtime scope and deliberately omits calendar color from event identity. RSS uses its production `Headline[]` payload shape. No network request is made; fixture URLs and tokens are non-secret invalid placeholders and never leave the disposable profile. Desktop enables only the rich GitHub/Jira subset with an explicit custom profile. Large and Wide restore every configured connector with independent saved dense profiles.

## Connector and size witnesses

| Surface | Witness |
| --- | --- |
| Desktop | GitHub Full contains contribution grid, 42 contributions, unread count, PRs, and issue row. Jira Full contains counts, assigned rows, and due-soon row. |
| Large/Wide | ICS Standard visibly attributes neutral event titles to Studio and Family, rather than relying on colored dots; Status has GitHub and Vercel states; GitLab has assigned/review rows; Vercel has READY/ERROR deployments; Home Assistant has selected state chips/actions; RSS has two headlines; Crypto has three selected coins. |
| Size truthfulness | Desktop Full GitHub/Jira show richer selected content than Large/Wide Standard cards. Compact Month contains exactly one seven-day row; Standard Month contains the complete natural August grid. No Full Month control appears. |
| ICS color | Studio begins explicit Fuchsia, Family begins Auto. The Settings color control persists Studio = Emerald and Family = Auto, leaves the exact ICS snapshot unchanged, and the live event-dot classes change to Emerald/Sky accordingly. |

## Interaction trace

- Verified top Bookmarks, centered Clock/Focus, direct Timer/Tasks/Notes, absent empty Briefing, transparent empty Focus prompt, and no retired layout copy.
- Clicked nested Bookmarks popover and dismissed it with focus restoration; confirmed folder popovers are viewport-contained and the 882px client-height nested list scrolls locally through its 1092px content.
- Clicked, typed in, and dismissed Notes; opened/dismissed Tasks and Timer; Timer continued after panel close; all panels restored invoking focus.
- Used Compact Month Previous, Next, and Today. Confirmed exactly seven Compact days whose cell tops match within 1px and whose left coordinates strictly increase. Confirmed Standard Month has at least four natural full rows.
- A real 650ms long-press on Clock time entered Arrange. Drag recorded `gotpointercapture` with active capture, two guides, keyboard movement, selected state, Compact/Standard/Full inspector choices, deliberate overlap feedback, Bring forward layer control, Undo, profile tabs, Desktop-everywhere preview, Copy Desktop layout, exact Cancel, and a separate explicit Save.
- Arrange clicked and asserted `aria-pressed="true"` for every visible `[data-block-id]` on Desktop, Large, and Wide. Large/Wide include all nine connector identities: Calendar, Service status, GitHub, GitLab, Jira, Deploys, Home Assistant, Headlines, and Crypto.
- Computed cursors are explicit: Bookmarks folder and Weather disclosure toggle are `pointer`; Weather's passive surface is `default`; passive Month data is non-pointer.
- Focus lifecycle was executed empty -> first edit -> commit -> complete -> edit again -> recommit. At all six states, footprint and Focus block centers matched exactly and stayed horizontally centered on Canvas (Canvas Y delta 9px from the intentional 51% Focus placement). The harness waits for the lifecycle write, writes and reads back the original seeded Focus, reloads, and asserts visible `Ship Aurora Canvas` before Large/Wide captures.
- On touch-enabled Small 375x812: no document horizontal overflow; Search to Utility Tray visual gap measured 116.625px; compact Weather visibly contained icon, temperature, `Mostly clear · New York`, and disclosure affordance; Notes used the shared 8px-inset 359px sheet.
- Checked cursor/hit coverage through whole-control keyboard/locator actions and recorded all visible target dimensions per capture. Month, folder popovers, panels, scroll-capable popovers, and Settings color select were exercised.

## Acceptance mapping

1. Desktop photo-first V1 hierarchy: PASS.
2. Movable top Bookmarks: PASS.
3. Visible movable Timer, Tasks, Notes: PASS.
4. Visible identities selectable in Arrange: PASS for every visible `[data-block-id]` in each owner fixture, with recorded pressed state.
5. Drag, guides, keyboard, non-occluding inspector: PASS.
6. Retired primary control labels absent: PASS.
7. Small, Desktop, Large, Wide profile switching: PASS.
8. Truthful size choices: PASS by inspector and content witnesses.
9. Centered Focus through empty, first-entry, committed, completed, edit-again, and recommitted states: PASS.
10. No opaque Focus prompt pill: PASS.
11. Empty Briefing renders nothing: PASS.
12. Selected connector content preserved: PASS.
13. Compact seven-day and Standard natural Month: PASS.
14. ICS color selection/Auto/named feeds: PASS. Neutral event titles have visible Studio/Family attribution; persisted Studio Emerald matches live dot classes, Family remains Auto, and the exact snapshot is unchanged.
15. V1/V2 recovery not rewritten on boot: not mutated by this fixture; prior packet authority retained.
16. Stored-data contracts: no harness mutation outside disposable profile; fresh scoped snapshots and no requests: PASS for exercised path.
17. Protected original checkout: untouched.
18. Chrome Web Store action: none.

## Runtime and review

- Runtime errors: none.
- Failed requests: none.
- Missing images: none.
- Owner-capture intersections: none.
- Critical findings: none.
- Important findings: none open. The earlier browser-proven Small compact Weather defect (condition/location and chevron CSS-hidden) was corrected and re-proven. Independent review then found two further Important gaps: multi-calendar source identity was color/aria-only, and the harness had incomplete direct interaction/color evidence. Visible bounded source attribution, focused Calendar RED/GREEN coverage, real long-press/pointer-capture/cursor/scroll/selection/Focus-lifecycle assertions, and snapshot-neutral live-dot color proof closed both review findings. After the first owner submission, the owner correctly rejected the malformed Desktop Compact Month. The RED Chromium run recorded all seven cells at `left: 72px` with vertically increasing tops; the corrected run records one shared top and strictly increasing left coordinates. The owner approved the corrected three-image gate before Packet 8.

## Minor ledger and manual ceilings

- Minor: Compact bookmark folder presentation still has the deferred cosmetic generic-folder-glyph/monogram duplication risk. It does not affect access, names, focus, or hit coverage; no production change was made.
- Minor procedural evidence debt: the permitted canonical rerun stopped on the corrected harness family's leftover local variable before later canonical families ran. The exact family is green in focused Chromium, the final acceptance review found no product blocker, and the owner-directed no-third-run limit was honored.
- Manual ceilings: native Chrome zoom, mixed-DPI movement, real screen-reader speech, physical touch, live Home Assistant picker/actions, native permission prompts, real external accounts, genuine sleep/wake, and unload-time persistence.
