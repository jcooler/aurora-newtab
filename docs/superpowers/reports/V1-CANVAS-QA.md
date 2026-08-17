# V1 Canvas integrated visual QA

Date: 2026-08-17  
Packet: Canvas-P7  
Harness: `node scripts/preview-v1-canvas.mjs`

## Result

PASS. The one-shot real Chromium probe completed with no console errors, page errors, failed requests, missing images, document horizontal overflow, or intersections in any owner capture. Root/controller separately inspected each final PNG at original resolution and reported no Critical or Important visual finding.

## Owner captures

| Capture | Exact original dimensions | Observation |
| --- | --- | --- |
| `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\canvas-p7\canvas-p7-desktop-1600x900-bookmarks-github-jira.png` | 1600x900 | Top Bookmarks, centered Clock/Focus, direct tools, compact Month, rich GitHub graph/rows, and rich Jira rows are visible and non-overlapping. |
| `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\canvas-p7\canvas-p7-large-2560x1440-dense.png` | 2560x1440 | Dense readable composition shows ICS, Status, GitHub, GitLab, Jira, Vercel, Home Assistant, RSS, Crypto, and a full natural Month. |
| `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\canvas-p7\canvas-p7-wide-3440x1440-dense.png` | 3440x1440 | Wide profile preserves the same complete connector composition with added whitespace and no clipping or overlap. |

Evidence JSON: `C:\Users\SickT\Documents\Codex\2026-08-16\aurora-v1-canvas-implementation-session-prompt\outputs\canvas-p7\canvas-p7-evidence.json`.

## Fixture and snapshot method

The disposable Playwright extension profile receives deterministic bookmarks and fresh snapshots for ICS, Status, GitHub, GitLab, Jira, Vercel, Home Assistant, RSS, and Crypto. Every snapshot uses the production opaque scope algorithm. ICS includes the live `Intl.DateTimeFormat().resolvedOptions().timeZone` runtime scope and deliberately omits calendar color from event identity. RSS uses its production `Headline[]` payload shape. No network request is made; fixture URLs and tokens are non-secret invalid placeholders and never leave the disposable profile. Desktop enables only the rich GitHub/Jira subset with an explicit custom profile. Large and Wide restore every configured connector with independent saved dense profiles.

## Connector and size witnesses

| Surface | Witness |
| --- | --- |
| Desktop | GitHub Full contains contribution grid, 42 contributions, unread count, PRs, and issue row. Jira Full contains counts, assigned rows, and due-soon row. |
| Large/Wide | ICS Standard has Studio and Family named feeds/events; Status has GitHub and Vercel states; GitLab has assigned/review rows; Vercel has READY/ERROR deployments; Home Assistant has selected state chips/actions; RSS has two headlines; Crypto has three selected coins. |
| Size truthfulness | Desktop Full GitHub/Jira show richer selected content than Large/Wide Standard cards. Compact Month contains exactly one seven-day row; Standard Month contains the complete natural August grid. No Full Month control appears. |
| ICS color | Studio begins explicit Fuchsia, Family begins Auto. The Settings color control changes Studio to Emerald while Family remains Auto. |

## Interaction trace

- Verified top Bookmarks, centered Clock/Focus, direct Timer/Tasks/Notes, absent empty Briefing, transparent empty Focus prompt, and no retired layout copy.
- Clicked nested Bookmarks popover and dismissed it with focus restoration; confirmed folder popovers are viewport-contained.
- Clicked, typed in, and dismissed Notes; opened/dismissed Tasks and Timer; Timer continued after panel close; all panels restored invoking focus.
- Used Compact Month Previous, Next, and Today. Confirmed exactly seven Compact days. Confirmed Standard Month has at least four natural full rows.
- In Arrange: pointer drag with guides/pointer capture, keyboard movement, selected state, Compact/Standard/Full inspector choices, deliberate overlap feedback, Bring forward layer control, Undo, profile tabs, Desktop-everywhere preview, Copy Desktop layout, exact Cancel, and a separate explicit Save.
- On touch-enabled Small 375x812: no document horizontal overflow; Search to Utility Tray visual gap measured 116.625px; compact Weather visibly contained icon, temperature, `Mostly clear · New York`, and disclosure affordance; Notes used the shared 8px-inset 359px sheet.
- Checked cursor/hit coverage through whole-control keyboard/locator actions and recorded all visible target dimensions per capture. Month, folder popovers, panels, scroll-capable popovers, and Settings color select were exercised.

## Acceptance mapping

1. Desktop photo-first V1 hierarchy: PASS.
2. Movable top Bookmarks: PASS.
3. Visible movable Timer, Tasks, Notes: PASS.
4. Visible identities selectable in Arrange: PASS for exercised registry entries.
5. Drag, guides, keyboard, non-occluding inspector: PASS.
6. Retired primary control labels absent: PASS.
7. Small, Desktop, Large, Wide profile switching: PASS.
8. Truthful size choices: PASS by inspector and content witnesses.
9. Centered Focus through empty/editing states: PASS.
10. No opaque Focus prompt pill: PASS.
11. Empty Briefing renders nothing: PASS.
12. Selected connector content preserved: PASS.
13. Compact seven-day and Standard natural Month: PASS.
14. ICS color selection/Auto/named feeds: PASS.
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
- Important findings: one browser-proven Small compact Weather defect was found during this packet. The condition/location and chevron were CSS-hidden. It was corrected with a focused RED/GREEN test and re-proven by the final Chromium run.

## Minor ledger and manual ceilings

- Minor: Compact bookmark folder presentation still has the deferred cosmetic generic-folder-glyph/monogram duplication risk. It does not affect access, names, focus, or hit coverage; no production change was made.
- Manual ceilings: native Chrome zoom, mixed-DPI movement, real screen-reader speech, physical touch, live Home Assistant picker/actions, native permission prompts, real external accounts, genuine sleep/wake, and unload-time persistence.
