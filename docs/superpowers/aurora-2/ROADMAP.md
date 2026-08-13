# Aurora 2 Roadmap

**Program:** Aurora Observatory 2.0.0<br>
**Master spec:** [`2026-08-13-aurora-2-observatory-design.md`](../specs/2026-08-13-aurora-2-observatory-design.md)<br>
**State vocabulary:** Not started, In progress, Verified, Blocked

## Packet rules

- One fresh Codex task executes no more than one packet.
- A packet freezes acceptance criteria, files/subsystems, test scope, and visual scope before implementation.
- Work outside that envelope becomes a follow-up packet.
- Each packet uses TDD, targeted verification, appropriate wider regression/build, bounded independent review, a fix round, and a dedicated ledger checkpoint.
- Visible packets require named headed screenshots and personal inspection.
- Plans after the active packet are created just in time; this prevents stale implementation detail from outrunning repository evidence.

## Wave 0 — Baseline, isolation, and durable specification

| Packet | State | Depends on | Acceptance summary | Plan | Finishing commit |
|---|---|---|---|---|---|
| A2-W0 | Verified | `eb1354b` audited base | Original checkout protected; isolated branch/worktree established; exact tests/build/harness/package/audit and V1 artifact evidence recorded; master spec, roadmap, status, decisions, and W1-P1 plan independently reviewed and fixed; two-commit checkpoint; clean status | Approved brief § First-task instruction | `0ae6769` plus checkpoint subject `docs: checkpoint A2-W0` |

## Wave 1 — Trust and correctness foundation

Wave 1 packets are deliberately sequenced. Snapshot generation safety lands before Home Assistant uses it; cross-context storage authority lands before permission/restore transactions rely on it; privacy copy follows actual corrected behavior.

### W1-P1 — Connector snapshot identity and freshness

- **State:** Verified
- **Depends on:** A2-W0
- **Plan:** [`2026-08-13-w1-p1-connector-snapshot-identity-freshness.md`](../plans/2026-08-13-w1-p1-connector-snapshot-identity-freshness.md)
- **Acceptance:** Connector snapshots are scoped to connector plus a fixed-length fingerprint of fetch-relevant config/account state; raw secrets never appear in keys/logs/exports; different-account reconnect and mounted config mutation cannot show the prior cache; stale completions cannot write over the current scope; TTL expires in an open tab; visible/focus restoration rechecks without overlapping polls; rejected hook refreshes retain only matching stale data and recover cleanly, while connector-specific anti-staleness sentinels remain authoritative.
- **Required evidence:** Red/green tests for different-account reconnect, mounted mutation, TTL, visibility/focus, concurrent consumers, Home Assistant pending reconfiguration, and stale completion ordering; full unit suite; production build. No visual change is expected.
- **Verified evidence:** Scoped identity plus all nine consumers; reconnect epochs; same-render suppression; generation/queued-write guards; TTL, focus, visibility, retry, and cleanup coverage; 12 targeted files / 409 tests; 97 total files / 1,531 tests; TypeScript and production build clean; bounded review's one Important finding fixed and no findings left open.
- **Finishing commit:** `cd511f0` plus checkpoint subject `docs: checkpoint W1-P1`

### W1-P2 — Cross-context storage authority

- **State:** Not started
- **Depends on:** W1-P1
- **Plan gate:** Ready to create just in time from verified W1-P1 implementation `cd511f0`; no W1-P2 implementation has started.
- **Acceptance:** One proven cross-context mutation authority prevents lost updates between separate new-tab/settings contexts; schema validation and change propagation remain intact; conflicts/retries or authority failures are explicit; storage rejection leaves prior state intact; simulated independent contexts and a real extension-page harness prove no lost update.
- **Expected subsystem:** `src/lib/storage/*`, storage consumers only where the authority API requires adaptation, storage tests, browser harness.
- **Finishing commit:** —

### W1-P3 — Optional-permission transactions and shared-origin ownership

- **State:** Not started
- **Depends on:** W1-P2
- **Plan gate:** Create when W1-P2 is Verified.
- **Acceptance:** Token/RSS/Status/ICS/Home Assistant/APOD permission acquisition, validation, and persistence are recoverable transactions; only newly acquired grants roll back after failure; pre-existing grants remain; origin release considers every configured owner; revoke failure is explicit/retryable; the baseline `remove revokes live` browser failure is fixed or dispositioned with evidence.
- **Required evidence:** Validation failure, storage failure, pre-existing permission, shared origin across connector types/features, final-owner removal, revoke failure/retry, user-gesture order, full harness with the baseline failure cleared.
- **Finishing commit:** —

### W1-P4 — Atomic backup/restore and permission reconciliation

- **State:** Not started
- **Depends on:** W1-P2, W1-P3
- **Plan gate:** Create when W1-P3 is Verified.
- **Acceptance:** Whole backup validates before mutation; injected failure at each phase restores the exact pre-import state; malformed/old/new schemas are handled honestly; recognized secrets and capability URLs are stripped/redacted; required optional origins are reported and reconciled without pretending the file restored grants; failure is an accessible alert and retry is possible.
- **Finishing commit:** —

### W1-P5 — Home Assistant data minimization, health, and action safety

- **State:** Not started
- **Depends on:** W1-P1, W1-P3
- **Plan gate:** Create when W1-P4 is Verified unless code ownership permits an earlier checkpointed start.
- **Acceptance:** Normal polling fetches selected entities individually; bulk state fetch is picker-only and disclosed; connection/action-only health performs a genuine narrow network check; per-action pending guards stop double click/keyboard activation; config generations reject stale polls/actions; persistent accessible pending/success/error state recovers after failure.
- **Required evidence:** Selected-entity polling, action-only health, double activation, stale action after reconfiguration, failure/retry, screen-reader state; headed Home Assistant picker/action spot-check requires user instance access and is recorded separately.
- **Finishing commit:** —

### W1-P6 — Weather identity and request races

- **State:** Not started
- **Depends on:** W1-P2
- **Plan gate:** Create when W1-P5 is Verified.
- **Acceptance:** Weather cache identity uses normalized coordinates plus units/provider inputs; same-name locations do not collide; a late/aborted older request cannot overwrite a newer selection; visibility refresh and cache boundaries are deterministic.
- **Finishing commit:** —

### W1-P7 — Local-day, DST, midnight, sleep/wake, and timezone rollover

- **State:** Not started
- **Depends on:** W1-P2
- **Plan gate:** Create when W1-P6 is Verified.
- **Acceptance:** Next midnight is calendar-constructed; spring-forward/fall-back ranges are correct in America/New_York and a second timezone; all-day semantics are explicit; Background, Focus, Countdown, Quote, calendar, and other date-driven surfaces roll in an open tab and reschedule after visibility, sleep/wake, or timezone change; stale timers are generation-safe.
- **Finishing commit:** —

### W1-P8 — Notes persistence integrity

- **State:** Not started
- **Depends on:** W1-P2
- **Plan gate:** Create when W1-P7 is Verified.
- **Acceptance:** Notes shows Saving only while pending, Saved only after settled persistence, and an accessible recoverable Error after rejection; unsaved text survives failure, close/navigation attempts are safe, and retry persists the latest text.
- **Finishing commit:** —

### W1-P9 — Privacy classification and secret-handling foundation

- **State:** Not started
- **Depends on:** W1-P3, W1-P4, W1-P5, W1-P6, W1-P8
- **Plan gate:** Create when behavior-changing Wave 1 packets are Verified.
- **Acceptance:** A code-backed data-flow inventory classifies stored/transmitted data and secrets; local plaintext credential posture and device-profile risk are explicit; capability URLs are treated as secrets; unsafe quick-link schemes are rejected; manifest “No accounts” becomes “No Aurora account”; interim privacy/listing/Data Usage source copy matches behavior without claiming the live dashboard is updated; the indirect dev-only nanoid advisory is documented and narrowly resolved only if safe.
- **Finishing commit:** —

## Wave 2 — Accessibility, recovery states, and narrow reflow

| Packet | State | Depends on | Acceptance summary | Plan | Finishing commit |
|---|---|---|---|---|---|
| W2-P1 Shared async/freshness state primitives | Not started | W1-P9 | Reusable pending/success/error/freshness semantics and announcements survive the redesign; automated accessibility tests | Create just in time | — |
| W2-P2 Focus, naming, boundary, and error recovery | Not started | W2-P1 | Focus editor stability, calendar source names, HA picker headings, DrawerBoundary reset, backup/quick-link announcements, keyboard/Escape/restoration | Create just in time | — |
| W2-P3 Settings and tool reflow | Not started | W2-P1 | No horizontal clipping at 320 CSS px or relevant 400% zoom; reachable controls and responsive dialogs/popovers | Create just in time | — |

Defects in components scheduled for replacement retain open acceptance contracts and are not marked Verified until the replacement surface passes.

## Wave 3 — Adaptive Stage foundation

| Packet | State | Depends on | Acceptance summary | Plan | Finishing commit |
|---|---|---|---|---|---|
| W3-P1 Layout V2 schema and migration | Not started | W2-P3 | Versioned profiles/placements/overrides, legacy preservation, deterministic mapping/collisions, backup compatibility and rollback tests | Create just in time | — |
| W3-P2 Profile engine, registry, BoardItem, and semantic grid | Not started | W3-P1 | Compact/Standard/Display/Ultrawide selection, Auto Fit/density, container-aware registry rendering, no root scaling | Create just in time | — |
| W3-P3 Arrange/profile editor | Not started | W3-P2 | Reorder/move/variant/priority, preview, undo, cancel, reset one, copy profile, keyboard and migration-safe save | Create just in time | — |
| W3-P4 Legacy retirement gate | Not started | W3-P3 | Fixed percentage/hide-tier machinery removed only after replacement parity and rollback evidence | Create just in time | — |

## Wave 4 — Information hierarchy and variants

| Packet | State | Depends on | Acceptance summary | Plan | Finishing commit |
|---|---|---|---|---|---|
| W4-P1 Day and Now zones | Not started | W3-P4 | Responsive day context, protected clock/greeting/search/focus hierarchy, larger displays add detail | Create just in time | — |
| W4-P2 Aurora Briefing | Not started | W4-P1 | Deterministic privacy-preserving synthesis with priority/truncation and no new network dependency | Create just in time | — |
| W4-P3 Work Pulse variants | Not started | W4-P2 | Attention-first compact/standard/expanded connector forms and healthy-state quietness | Create just in time | — |
| W4-P4 Signal Dock and connector survival | Not started | W4-P3 | Every enabled connector represented across constrained/dense profiles; meaningful operable dock entries | Create just in time | — |
| W4-P5 Launcher shelf and remaining content variants | Not started | W4-P4 | Consolidated bookmarks/quick links and RSS/HA/calendar/weather expanded content | Create just in time | — |

## Wave 5 — Premium interaction surfaces

| Packet | State | Depends on | Acceptance summary | Plan | Finishing commit |
|---|---|---|---|---|---|
| W5-P1 Responsive Utility Tray shell | Not started | W4-P5 | Desktop modeless behavior; narrow modal sheet; inert/trap/Escape/restoration only where modal | Create just in time | — |
| W5-P2 Tasks, Notes, Timer, HA actions, refresh integration | Not started | W5-P1 | One expanded tool, running timer remains represented, working tools coherent | Create just in time | — |
| W5-P3 Settings workspace and connector cards | Not started | W5-P2 | Responsive navigation, state-first cards, credentials revealed only for edit/reconnect | Create just in time | — |
| W5-P4 Visual/motion system convergence | Not started | W5-P3 | Shared surfaces, typography, spacing, state, targets, restrained motion/reduced motion | Create just in time | — |

## Wave 6 — Full product QA and Store release candidate

| Packet | State | Depends on | Acceptance summary | Plan | Finishing commit |
|---|---|---|---|---|---|
| W6-P1 Migration, regression, offline/stale/error QA | Not started | W5-P4 | Complete automated and recovery matrix, no accepted finding untracked | Create just in time | — |
| W6-P2 Responsive, mixed-DPI, zoom, keyboard, and accessibility QA | Not started | W6-P1 | Full named viewport/state/zoom matrix, screenshots personally inspected in batches, hardware limits explicit | Create just in time | — |
| W6-P3 Official policy and dashboard reconciliation | Not started | W6-P2 | Current official Chrome/Google policy checked; live V1 version/dashboard answers verified with user; privacy/Data Usage/listing mutually consistent | Create just in time | — |
| W6-P4 2.0.0 package and release dossier | Not started | W6-P3 | Minimal ZIP inspected and hashed; current screenshots/listing/release notes/checklist staged; exact manual submission copy | Create just in time | — |
| W6-P5 Explicit Store approval gate | Not started | W6-P4 | Stop before upload/submission/rollout; execute external action only after explicit approval at that moment | Create just in time | — |

## Program definition of done

Aurora 2.0 is complete only when all accepted P0/P1 findings are verified or explicitly dispositioned, Adaptive Stage and every profile/variant/zone are complete, every enabled connector survives the supported matrix, accessibility/reflow have headed evidence, disclosures match behavior, a minimal 2.0.0 ZIP and dossier are staged, the branch is clean, and the user has approved each external Store action before it occurs.
