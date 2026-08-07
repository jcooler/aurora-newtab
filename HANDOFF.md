# Session Handoff — Aurora v2 build (written 2026-08-02)

Read this whole file, then continue the build. Jon (the user) approved everything
described here; do not re-litigate settled decisions.

## What this project is

Aurora: a local-first MV3 new-tab Chrome extension (React 19 + TS strict + Vite 6
+ @crxjs + Tailwind 4 + Vitest 3 + Playwright preview harness), built to beat
Momentum. **v1.2.0 was REJECTED by Chrome Web Store review** (violation
"Red Argon" — Single Purpose: the in-extension Google/DuckDuckGo/Bing
search-engine picker changed the user's search experience instead of
routing through the Chrome Search API). **v1.2.1 remediation has shipped**
(engine picker deleted; every search now calls `chrome.search.query()` —
see `release/RESUBMISSION-NOTES.md` for the full story) — **resubmission to
the CWS dashboard is pending Jon** (upload + listing-copy update + reviewer
note, steps in that same file). If Jon reports a new store verdict mid-
session, STOP and consult him before anything store-related.

We are starting **v2: the connector era**. Jon approved the roster (GitHub,
GitLab, Gmail, Google Calendar, Spotify, Jira, Vercel, RSS, crypto ticker,
ICS calendar, habit streaks, month calendar), a four-tab Settings overhaul, and
auth-type phasing across four sub-projects:

| Sub-project | Spec | Plan | Status |
|---|---|---|---|
| 1. Settings tabs + connector framework (+RSS reference) | `docs/superpowers/specs/2026-07-30-settings-tabs-connector-framework-design.md` | `docs/superpowers/plans/2026-08-02-settings-tabs-connector-framework.md` (tasks 39–45) | **DONE 2026-08-07 at `23b506f`** — v1.3.0 staged (NOT submitted; v1.2.1 verdict pending); 618 tests, 134 harness assertions; fable whole-plan review Satisfied. SP2 inherits: render card `auth` state; per-entry descriptor cast when ConnectorConfig becomes a union (see types.ts variance note); Data-tab copy naming connector-cache exclusion. |
| 2. Token connectors (GitHub, GitLab, Jira, Vercel, crypto, ICS calendar) | `docs/superpowers/specs/2026-08-02-token-connectors-design.md` | write when its turn comes | **START HERE next** |
| 3. OAuth wave (Spotify first, Google Calendar, Gmail-if-CASA-approved) | `docs/superpowers/specs/2026-08-02-oauth-wave-design.md` | write when its turn comes | after 2; Jon owns Google-console paperwork |
| 4. Local widgets (habit streaks, month calendar) | `docs/superpowers/specs/2026-08-02-local-widgets-design.md` | write when its turn comes | breather — slot anywhere |

Verified at handoff: HEAD = `254544c`… plus this file and 3 specs + 1 plan
committed after; working tree clean, everything pushed, `npm test` 428/428
green, `npm run build` + `npm run build:preview` green.

**Update (2026-08-06):** one remediation commit landed on top of the above
(v1.2.1, Red Argon fix — see the store-state line up top and
`release/RESUBMISSION-NOTES.md`). It bumped the storage schema to
**v4** (migration strips `Settings.searchEngine`) — sub-project 1's plan
below still says "schema v4" for its own connector-framework bump; that now
COLLIDED and has been renumbered to **v5** (plan + spec updated). Do not re-fix the
plan — this note is historical context only, the docs are already
correct. `npm test` is 438/438 green as of this commit.

## Cleanup queue (Jon, 2026-08-06) — run this BEFORE starting SP1

Three user-reported issues, each through the full loop (implement → review →
controller visual gates). Small batch; controller-scheduled like prior
feedback batches (a mini-plan via writing-plans is optional at this size,
the loop discipline is not).

1. **Weather expanded panel is squished.** Redesign the expanded view:
   bigger, better information hierarchy ("more robust" — Jon's words; use the
   frontend-design skill for the pass), and add an outbound "full forecast"
   link that opens a weather site pre-targeted to the saved location
   (lat/lon or derived zip — pick a provider whose URL accepts coordinates;
   user-clicked navigation only, NO new fetches, disclose nothing new).
   Screenshot-gate before/after, including narrow viewports.
2. **Cross-tab photo flicker (INVESTIGATE-FIRST — systematic-debugging
   skill, mandatory).** Opening a new tab makes an already-open new-tab's
   background reload/flicker; Jon: "seems like each browser is connected."
   Reproduce for real first: the Playwright harness can open TWO pages in
   one context. Hypothesis to VERIFY (not assume): tab B's mount triggers a
   photoPrefs/rotation (or tier) write whose storage.onChanged echo reaches
   tab A, re-rendering Background where `key={src}` remounts the <img> and
   re-runs the opacity fade. Fix must not break daily rotation, upload
   galleries, or the deliberate cross-tab sync of settings.
3. **Bookmarks bar scaling + default top-row redesign.** Jon's direction:
   the top of the page belongs to the bookmarks bar ALONE; the timer pill
   and weather widget move BELOW it (new DEFAULT positions — arrange-mode
   stored layouts are user-owned and untouched); on narrower viewports the
   pieces shift/shrink to fit instead of wrapping/stacking. Update default
   placements + the responsive variants; screenshot matrix must include
   ~1420×437 (Jon's window) and the existing sizes; combined-defaults
   collision assertions updated.

## Skills are mandatory (Jon directive — "always use the skill and things")

Honor superpowers:using-superpowers from the first turn: if a skill might
apply, invoke it BEFORE acting. Non-negotiable mappings for this project:
subagent-driven-development for all plan execution (you are the controller;
you do not write feature code); systematic-debugging for ANY bug report
(cleanup item 2 explicitly); brainstorming before designing anything new
with Jon; writing-plans to turn SP2–4 specs into plans when their turn
comes; verification-before-completion before any "done" claim (the visual
gates above are its concrete form); frontend-design for visual redesign
passes (cleanup item 1). Skill invocations are cheap; regressions are not.

## The process (superpowers subagent-driven development)

You are the controller; you do NOT write feature code yourself. Per task:

1. Workspace: `<skill>/scripts/sdd-workspace PLAN_FILE` (ledger `progress.md` inside — create with the plan-file first line; it is your compaction-proof memory).
2. Brief: `<skill>/scripts/task-brief PLAN_FILE <N>`; dispatch ONE implementer
   (general-purpose) with brief path + report path + interfaces from earlier
   tasks + global constraints. Model tiering that has worked: sonnet for
   implementers and task reviewers, haiku for small prescribed re-reviews,
   fable for whole-plan finals. Reports: subagents CANNOT write into
   `.superpowers/` (tool refuses) — they return reports as text; put durable
   bits in the ledger yourself.
   `<skill>` = `C:\Users\SickT\.claude\plugins\cache\claude-plugins-official\superpowers\6.2.0\skills\subagent-driven-development`
3. Review package: `<skill>/scripts/review-package PLAN_FILE <BASE> HEAD`
   (record BASE before dispatch; never HEAD~1). ONE reviewer, spec-first,
   do-not-trust-the-report, read-only, Critical/Important/Minor + verdict.
4. Findings: Critical/Important → fix loop (resume implementer rounds 1–3;
   fresh fixer if the transcript is gone — they evict often; report file/ledger
   is the memory). Scoped re-review per round. Minors → ledger as deferred.
5. Close-out: verify trailer (`git log -1 --format=%B <sha> | grep -c Co-Authored-By`),
   verify pushed, ledger the completion, extract next brief.
6. Visual gate: any UI task runs the harness and YOU personally Read the
   new/changed screenshots before approving. `npm run build` = production;
   `npm run build:preview` = dev flavor with bookmarks install-time — bookmark
   probes ONLY work under the preview build (production prints an honest SKIP).
7. Final whole-plan review (fable) + ONE fix wave + ONE scoped re-review, then
   report to Jon: what shipped, screenshots, what's deferred.

## Immediate next action

FIRST: the three-item cleanup queue above (weather panel redesign,
cross-tab flicker investigation, bookmarks-bar/top-row default layout) —
Jon reported these and wants them before v2 features. THEN:
Sub-project 1, Task 39 — **schema v5, NOT v4** (v4 was consumed by the
Red Argon remediation's searchEngine-removal migration; see the "Update
(2026-08-06)" note above — renumbered — DONE, plan and spec now say v5). The
plan is otherwise complete and self-reviewed — brief it, dispatch it, run
the loop through Task 45, final review, report. Then write sub-project 2's
plan from its spec (writing-plans skill) and continue.

## Jon's standing directives (violating these gets tasks rejected)

1. **No placeholder/"coming soon" UI, ever.** Labels/tabs/cards appear only when real.
2. **See it with your own eyes.** Screenshot-verify every visual change via the
   harness; controller reads the captures personally. Bright-photo worst cases matter.
3. **Background photos: landscapes only, NO people.** Full-res recheck before
   shipping any new photo (thumbnails lie — it caught 3).
4. **Accurate content always** — quotes attributed, README/PRIVACY claims
   audited against code, store disclosures honest even when less flattering.
5. **Build continuously, no pauses between tasks.** Report when done or blocked.
6. **Google extension-policy compliance** in everything; the privacy story IS
   the product. Connectors: direct client→provider only, tokens local +
   backup-stripped, per-origin grants at click time, per-connector disclosure.
7. Local-first: current network = Open-Meteo ×2 + BigDataCloud ×1; connectors
   add ONLY user-granted origins. `legacy/` is read-only reference, gitignored.
8. Quality bar: "not only should it compete [with Momentum], it should be better."

## Hard-won rules (each cost a real bug — do not relearn)

- **Chrome's optional-permission allow-list is law**: `geolocation` CANNOT be
  optional (must be install-time); `bookmarks` can. Check the list before any
  permission design.
- **Gesture chains**: zero awaits before `chrome.permissions.request` — an IPC
  pre-check breaks the user-gesture window. (`services/permissions.ts` doc
  comments carry this.)
- **Stacking contexts**: `position:fixed` elements ARE stacking contexts;
  overlays that must beat body-level portals need conditional z on the WRAPPER.
  No transforms on wrappers containing fixed descendants (PositionedBlock is
  calc-centered for exactly this; the quote wrapper's translate is safe only
  because its subtree has no fixed elements).
- **Harness screenshots**: always condition-wait the photo fade (+800ms settle)
  before capturing — mid-fade shots read as "blurry" and shipped once.
- **Panel surfaces**: floating panels `bg-panel-solid` (themed token — never
  hardcode hex); pills/drawer `bg-panel`; small controls (`gear`, chips,
  refresh) stay `rounded-full` in every theme; panels take the theme radius.
- **Photo-floating text** carries `.text-photo`; the scrim is a light tint,
  not the legibility mechanism.
- **Store artifacts**: `release/` holds listing copy + checklist (tracked) and
  zip + shots (gitignored). `npm run package` has hard guards — trust its
  failures. Store shots: `scripts/store-shots.mjs` (2× supersampled, fade-waited).
- Danger actions: red `text-red-400` convention (survives Mono deliberately —
  Jon-approved ruling); destructive flows get a real confirm dialog
  (`ResetLayoutDialog` pattern), NEVER armed-button timeouts.

## Conventions cheat-sheet

- Escape: `useDialogEscape(onClose, active?)` (newest-first stack;
  `closeAllDialogs()` exists). Focus traps: `useFocusTrap(ref, ready)` with the
  ready-predicate matching the JSX gate (TodoPanel bug class).
- Storage: `src/lib/storage` wrapper + `useStoredKey`/`storage.update`;
  deep-equal writes emit no events — nonce when a re-read must trigger.
- Widgets: gate/inner split (zero hooks when off); `<WidgetBoundary>` per
  widget; every widget is a `BlockId` in the arrange system with a
  screenshot-gated default placement; combined-defaults collision assertions
  live in the harness.
- Connector pattern (framework lands in SP1): descriptor in the registry +
  pure service module + `useConnectorSnapshot` SWR + card in the Connectors
  tab + widget block. Secrets go in `secretFields`.
- Favicons: `faviconUrl()` only. Fonts: bundled Space Grotesk/Inter (SIL OFL).
- Version: `__APP_VERSION__` Vite define (duplicated in vitest.config — Vitest
  ignores vite.config; drift is test-caught).
- Support link lives in the Data tab's About footer (buymeacoffee.com/joncooler).
