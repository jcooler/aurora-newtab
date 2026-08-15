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

- **State:** Verified
- **Depends on:** W1-P1
- **Plan:** [`2026-08-13-w1-p2-cross-context-storage-authority.md`](../plans/2026-08-13-w1-p2-cross-context-storage-authority.md)
- **Acceptance:** One proven cross-context mutation authority prevents lost updates between separate new-tab/settings contexts; schema validation and change propagation remain intact; conflicts/retries or authority failures are explicit; storage rejection leaves prior state intact; simulated independent contexts and a real extension-page harness prove no lost update.
- **Expected subsystem:** `src/lib/storage/*`, storage consumers only where the authority API requires adaptation, storage tests, browser harness.
- **Verified evidence:** A stable exclusive Web Lock guards `set`, the complete `update` read/write transaction, initialization/migration, and atomic multi-key restore; authority unavailability is explicit with no unsafe fallback. Timing-free unlocked-control/shared-authority tests prove the lost-update boundary, with failure/retry, validation, migration, subscription, and restore coverage. Final verification passed 7 targeted files / 312 tests, 98 total files / 1,544 tests, TypeScript, production and preview builds at 165 modules, and the production bridge-leak check. The two-page MV3 harness passed 412 / 0 / 3 and retained all 50 mutations. Bounded review's one Important and two Minor findings were fixed; rereview found none open.
- **Finishing commit:** `fac883b` plus checkpoint subject `docs: checkpoint W1-P2`

### W1-P3 — Optional-permission transactions and shared-origin ownership

- **State:** Verified
- **Depends on:** W1-P2
- **Plan:** [`2026-08-13-w1-p3-optional-permission-transactions.md`](../plans/2026-08-13-w1-p3-optional-permission-transactions.md)
- **Acceptance:** Token/RSS/Status/ICS/Home Assistant/APOD permission acquisition, validation, and persistence are recoverable transactions; only newly acquired grants roll back after failure; pre-existing grants remain; origin release considers every configured owner; revoke failure is explicit/retryable; the baseline `remove revokes live` browser failure is fixed or dispositioned with evidence.
- **Required evidence:** Validation failure, storage failure, pre-existing permission, shared origin across connector types/features, final-owner removal, revoke failure/retry, user-gesture order, full harness with the baseline failure cleared.
- **Verified evidence:** A startup permission mirror supports gesture-turn requests for only absent origins; one lifecycle Web Lock covers owner-changing writes, validation/persistence, rollback, fresh global ownership reads, release, and retry without a production fallback or nested lock. All configured connector descriptors plus APOD participate in shared ownership, including configured disabled owners and excluding incomplete configs. Revoke failures remain in a Settings-level accessible Retry surface. Final verification passed 18 targeted files / 631 tests, 103 total files / 1,631 tests, TypeScript, 170-module production/preview builds, and the production adapter-leak gate. The real-extension harness passed 424 / 0 / 3 with acquisition rollback, pre-existing preservation, shared/final ownership, revoke retry, trusted event-turn ordering, exact restoration, and truthful native ceilings. The bounded whole-packet review's three Important findings were fixed in `a8d6236`; scoped rereview found no Critical, Important, or packet-local correctness issue open.
- **Finishing commit:** `a8d6236` plus checkpoint subject `docs: checkpoint W1-P3`

### W1-P4 — Atomic backup/restore and permission reconciliation

- **State:** Verified
- **Depends on:** W1-P2, W1-P3
- **Plan:** [`2026-08-14-w1-p4-atomic-backup-restore-permission-reconciliation.md`](../plans/2026-08-14-w1-p4-atomic-backup-restore-permission-reconciliation.md)
- **Acceptance:** Whole backup validates before mutation; injected failure at each phase restores the exact pre-import state; malformed/old/new schemas are handled honestly; recognized secrets and capability URLs are stripped/redacted; required optional origins are reported and reconciled without pretending the file restored grants; failure is an accessible alert and retry is possible.
- **Verified evidence:** Export excludes connector tokens, RSS/ICS capability URLs, connector snapshots, and APOD cache while emitting trusted re-entry metadata. Import prepares and validates the entire migrated envelope before Confirm; the confirmation gesture enters the existing permission transaction synchronously; lifecycle-before-storage locking, verified all-key target/rollback writes, safe rollback classification, pre-existing/new grant preservation, shared/final ownership, committed revoke failure, durable Retry, accessible recovery, and trusted copy are covered. Final verification passed 15 targeted files / 600 tests, 104 total files / 1,694 tests, TypeScript, 171-module production/preview builds, and the production adapter-leak gate. The real-extension harness passed 432 / 0 / 3 with all eight W1-P4 assertions plus post-reload locked all-key teardown. Task reviews fixed all findings; the bounded whole-packet review's one Important permission/data atomicity finding was fixed in `d28d6f5`; controller verification exposed and fixed the teardown late-write race in `6f30b91`; final scoped reviews found no Critical, Important, or packet-local correctness issue open.
- **Finishing commit:** `6f30b91` plus checkpoint subject `docs: checkpoint W1-P4`

### W1-P5 — Home Assistant data minimization, health, and action safety

- **State:** Verified
- **Depends on:** W1-P1, W1-P3
- **Plan:** [`2026-08-14-w1-p5-home-assistant-data-health-action-safety.md`](../plans/2026-08-14-w1-p5-home-assistant-data-health-action-safety.md)
- **Acceptance:** Normal polling fetches selected entities individually; bulk state fetch is picker-only and disclosed; connection/action-only health performs a genuine narrow network check; per-action pending guards stop double click/keyboard activation; config generations reject stale polls/actions; persistent accessible pending/success/error state recovers after failure.
- **Required evidence:** Selected-entity polling, action-only health, double activation, stale action after reconfiguration, failure/retry, screen-reader state; headed Home Assistant picker/action spot-check requires user instance access and is recorded separately.
- **Verified evidence:** Regular polling requests deduped selected `/api/states/{entity_id}` endpoints in order, omits isolated 404s, and fails closed on authentication/network/non-404/malformed/wrong-ID results; picker-only `/api/states` use is disclosed. Action-only configs require authenticated `/api/` health. Home Assistant's opaque snapshot identity advances to `v2`, rejecting fresh legacy action-only snapshots without exposing config. Per-button synchronous pending, five-input in-memory generations, stale-completion rejection, Strict Mode/unmount safety, persistent associated status/alert feedback, and independent retry are covered. Final verification passed 10 targeted files / 378 tests, 104 total files / 1,709 tests, TypeScript, 171-module production/preview builds, production preview-symbol isolation, and a controller-owned 437 PASS / 0 FAIL / 3 SKIP real-extension run. `ha-action-error.png` and the Chromium accessibility tree were inspected; live picker contents, a successful real service action, and a real screen reader remain explicit user-instance/manual ceilings. Task reviews and the bounded whole-packet review are clean after the legacy-snapshot fix `2ab1139` and preview-scope alignment `74d4e27`.
- **Finishing commit:** `74d4e27` plus checkpoint subject `docs: checkpoint W1-P5`

### W1-P6 — Weather identity and request races

- **State:** Verified
- **Depends on:** W1-P2
- **Plan:** [`2026-08-14-w1-p6-weather-identity-request-races.md`](../plans/2026-08-14-w1-p6-weather-identity-request-races.md)
- **Acceptance:** Weather cache identity uses normalized coordinates plus units/provider inputs; same-name locations do not collide; a late/aborted older request cannot overwrite a newer selection; visibility refresh and cache boundaries are deterministic.
- **Verified evidence:** Weather snapshots carry a normalized four-decimal coordinate identity plus the complete immutable Open-Meteo request contract; providers forward abort signals; legacy and mismatched snapshots are suppressed. Generation, abort, updater-time stored ownership, unmount/clear/reconfiguration, late fulfillment/rejection, and initial location/cache hydration are race-safe. Location/cache mutations are atomic; TTL uses the exact 30-minute boundary and same-identity refreshes dedupe. Final verification passed 17 targeted files / 532 tests, 106 total files / 1,751 tests, TypeScript, 172-module production/preview builds, production preview-symbol isolation, and a controller-owned 443 PASS / 0 FAIL / 3 SKIP real-extension run. The browser harness truthfully models the visibility signal because headless Chromium does not expose a native target visibility transition; exact fake-time unit coverage proves the native listener fencepost. Plan and implementation rereviews found no Critical, Important, or packet-local Minor issue open after fixes `e29aa53` and `f4ed933`.
- **Finishing commit:** `f4ed933` plus checkpoint subject `docs: checkpoint W1-P6`

### W1-P7 — Local-day, DST, midnight, sleep/wake, and timezone rollover

- **State:** Verified
- **Depends on:** W1-P2
- **Plan:** [`2026-08-14-w1-p7-local-day-dst-rollover.md`](../plans/2026-08-14-w1-p7-local-day-dst-rollover.md)
- **Acceptance:** Next midnight is calendar-constructed; spring-forward/fall-back ranges are correct in America/New_York and a second timezone; all-day semantics are explicit; Background, Focus, Countdown, Quote, calendar, and other date-driven surfaces roll in an open tab and reschedule after visibility, sleep/wake, or timezone change; stale timers are generation-safe.
- **Verified evidence:** Shared IANA-zone boundaries handle New York/Berlin 23-hour/25-hour days plus Havana/Santiago/Azores skipped midnights and Apia's skipped day without expired-boundary loops. One generation-owned local-day schedule and restoration-aware clocks update every named surface, while APOD, Calendar, Timer, and ICS preserve stale-owner and exactly-once rules. ICS events carry explicit `allDay`, timed midnight remains timed, and v2 snapshot identity includes the runtime timezone. Final verification passed 23 targeted files / 563 tests, 110 total files / 1,831 tests, TypeScript, 173-module production/preview builds, production preview-symbol isolation, and a 447 PASS / 0 FAIL / 3 SKIP built-extension run. The bounded review's Critical midnight-transition inverse defect was fixed in `2fcb443`; the focused rereview found no remaining Critical, Important, or packet-local correctness finding.
- **Finishing commit:** `2fcb443` plus checkpoint subject `docs: checkpoint W1-P7`

### W1-P8 — Notes persistence integrity

- **State:** Verified
- **Depends on:** W1-P2
- **Plan:** [`2026-08-14-w1-p8-notes-persistence-integrity.md`](../plans/2026-08-14-w1-p8-notes-persistence-integrity.md)
- **Acceptance:** Notes shows Saving only while pending, Saved only after settled persistence, and an accessible recoverable Error after rejection; unsaved text survives failure, close/navigation attempts are safe, and retry persists the latest text.
- **Verified evidence:** Revision-owned, authority-backed Notes writes keep one operation in flight, coalesce newer edits, retain dirty/error text, reconcile authority-ordered external values, and announce Saving/Saved/Error truthfully. Pill, Escape, widget-disable, and arrange entry await the latest successful persistence; failed close stays interactive. Current-tab Search, Quick Link, and bookmark producers retain a dirty-only beforeunload guard with honest browser limits. Final verification passed 13 targeted files / 173 tests, 112 total files / 1,848 tests, TypeScript, 174-module production/preview builds, production preview-symbol isolation, and a 451 PASS / 0 FAIL / 3 SKIP built-extension run. The bounded review's two Important findings—Retry target size and assertion-failure teardown ordering—were fixed in `5c570f7`; the focused rereview found no remaining Critical, Important, or packet-local Minor finding.
- **Finishing commit:** `5c570f7` plus checkpoint subject `docs: checkpoint W1-P8`

### W1-P9 — Privacy classification and secret-handling foundation

- **State:** Verified
- **Depends on:** W1-P3, W1-P4, W1-P5, W1-P6, W1-P8
- **Plan:** [`2026-08-14-w1-p9-privacy-classification-secret-handling.md`](../plans/2026-08-14-w1-p9-privacy-classification-secret-handling.md)
- **Acceptance:** A code-backed data-flow inventory classifies stored/transmitted data and secrets; local plaintext credential posture and device-profile risk are explicit; capability URLs are treated as secrets; unsafe quick-link schemes are rejected; manifest “No accounts” becomes “No Aurora account”; interim privacy/listing/Data Usage source copy matches behavior without claiming the live dashboard is updated; the indirect dev-only nanoid advisory is documented and narrowly resolved only if safe.
- **Verified evidence:** Typed storage and connector records cover all 16 `AuroraData` keys, `aurora:version`, IndexedDB photos, fixed/browser-mediated flows, every connector destination/trigger/method/sent/received/cache/permission/backend boundary, and the exact Home Assistant and APOD contracts. Authentication secrets and RSS/Calendar capability URLs are local plaintext with shared-profile guidance and backup redaction. One Quick Link policy rejects unsafe schemes, credentials, and malformed HTTP(S) at add/import/render. Manifest, Settings, README, privacy policy, and tracked interim listing source use “No Aurora account” and preserve the W6-P3 live-dashboard gate. The exact dev-only `nanoid@3.3.18` override changes no other package and both audits are zero. Final verification passed 6 targeted files / 362 tests, 114 total files / 1,890 tests, TypeScript, 176-module production/preview builds, exact manifest/preview-symbol gates, and 451 PASS / 0 FAIL / 3 SKIP in the built-extension harness. Independent review's three Important findings were fixed; focused rereview returned Ready. The harness's old test-only `chrome-extension://` Quick Link was replaced by an intercepted safe HTTPS destination without weakening production policy.
- **Finishing commit:** `34f8960` plus checkpoint subject `docs: checkpoint W1-P9`

## Wave 2 — Accessibility, recovery states, and narrow reflow

| Packet | State | Depends on | Acceptance summary | Plan | Finishing commit |
|---|---|---|---|---|---|
| W2-P1 Shared async/freshness state primitives | Verified | W1-P9 | Pure orthogonal operation/freshness algebra; shared render-only status/alert/resource feedback; Notes, Home Assistant, connector snapshots, and Weather migrated without changing Wave 1 authorities. Final gate: 10 targeted files / 187 tests, 116 files / 1,929 tests, TypeScript, clean production bridge scan, zero production/dev audit findings, 178-module production/preview builds, and 452 PASS / 0 FAIL / 3 SKIP with exactly one named W2-P1 PASS. Eight recovery/state captures were inspected at native resolution; Chromium AX is supporting evidence, not a real screen-reader run. Whole-packet review's 3 Important / 1 Minor findings were fixed in `f2c1b78`; focused rereview found no new Critical/Important breakage. | [`2026-08-14-w2-p1-shared-async-freshness-state-primitives.md`](../plans/2026-08-14-w2-p1-shared-async-freshness-state-primitives.md) | `7dc510a`, `0d71e1f`, `3505b13`, `76dddae`, `6d93068`, `0b2db71`, `f2c1b78`; checkpoint subject `docs: checkpoint W2-P1` |
| W2-P2 Focus, naming, boundary, and error recovery | Verified | W2-P1 | Focus/Quick Link editors preserve committed state, cancel without writes, expose associated errors, and restore focus; repeated Calendar text is source-named programmatically; the Home Assistant picker has named domain relationships and invoker-owned close restoration; DrawerBoundary retries only after reopen; Data export/import/restore transitions are announced without moving async authority. Final gate: 16 targeted files / 661 tests, 117 files / 1,962 tests, TypeScript, clean production bridge scan, zero production/dev audit findings, 178-module production/preview builds, and 453 PASS / 0 FAIL / 3 SKIP with exactly one named W2-P2 PASS. Six captures were inspected at native resolution; Chromium AX is supporting evidence, not a real screen-reader run. Independent whole-packet review's 3 Important findings were fixed in `5db8dc4`; controller verification's packet-local geometry regression was fixed in `1fdaf0c`; final rereview was Ready with no Critical/Important issue open. | [`2026-08-15-w2-p2-focus-naming-boundary-error-recovery.md`](../plans/2026-08-15-w2-p2-focus-naming-boundary-error-recovery.md) | `dd95889`, `914ac4b`, `5449fc7`, `5db8dc4`, `1fdaf0c`; checkpoint subject `docs: checkpoint W2-P2` |
| W2-P3 Settings and tool reflow | Verified | W2-P1 | Current Settings, Notes, Tasks, Timer, picker, Palette, Location, Folder, Todo menu, and Reset surfaces reflow without horizontal clipping at 320 CSS px; short 320x180 states retain one owned scrollport, keyboard reachability, focus/Escape/restoration, visible non-occluded composites, and at least 36px for the exact touched target inventory. Shared 8px viewport-fit geometry observes both invoker and rendered panel boxes with generation-fenced resize/observer/rAF cleanup while ordinary 1280/2560 placement remains exact. Final gate: 21 plan-focused files / 475 tests, 119 files / 1,998 tests, TypeScript, clean production bridge scan, zero production/dev audit findings, 179-module production/preview builds, and 454 PASS / 0 FAIL / 3 SKIP with exactly one named W2-P3 PASS. Fifteen captures were inspected at original resolution. Whole review's 3 Important gaps plus the final Location resize/active-descendant race were fixed RED-first; same-reviewer final verdict Ready with no Critical/Important issue open. Automated 320 CSS px evidence does not claim native Chrome 400% zoom, Windows scaling/mixed DPI, or a real screen-reader run. | [`2026-08-15-w2-p3-settings-tool-reflow.md`](../plans/2026-08-15-w2-p3-settings-tool-reflow.md) | `461319d`, `135d130`, `ce285f0`, `ced5e1c`, `64675d2`; checkpoint subject `docs: checkpoint W2-P3` |

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
| W5-P4 Visual/motion system convergence | Not started | W5-P3 | Shared surfaces, typography, spacing, state, targets, restrained motion/reduced motion; give the Focus prompt a local background-independent contrast treatment over arbitrary photo imagery, with contrast and representative-background screenshot evidence, without globally flattening muted-text tokens | Create just in time | — |

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
