# Local-day, DST, and Rollover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every local-day surface advance in an already-open tab at the correct calendar boundary, preserve correct 23-hour/25-hour DST ranges and explicit all-day calendar meaning, and recover immediately after visibility, sleep/wake, or runtime-timezone changes without stale timers or requests winning.

**Architecture:** Add pure IANA-zone-aware local-calendar primitives plus a small `useLocalDay` lifecycle hook that schedules the next calendar midnight, probes for timezone changes, and resynchronizes on visibility/focus/pageshow using generation-owned timers. Keep `useNow` as the sub-day clock but make it restoration-aware so Clock, Greeting, Calendar relative time, World clocks, and the Focus timer observe wake promptly. Date-only surfaces consume `useLocalDay`; Calendar preserves `VALUE=DATE` as an explicit `allDay` field, validates the current payload before accepting a cache, uses calendar-constructed day bounds, and scopes its connector snapshot to the runtime timezone so floating/all-day epochs are reparsed after a zone change. Background uses an identity/generation-owned APOD request record so a new local day starts immediately and an older completion cannot write, block, or release newer work.

**Tech Stack:** TypeScript 5.9 strict, React 19, Chrome Manifest V3, `Intl.DateTimeFormat` IANA timezone data, W1-P2 `AuroraStorage`/Web Lock authority, W1-P1 connector snapshot generations, Vitest 3 with Testing Library/fake timers, and the Playwright real-extension preview harness.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 10.3, 10.6, 13, and 16; `docs/superpowers/aurora-2/ROADMAP.md` W1-P7; A2-D009 and A2-D015 in `docs/superpowers/aurora-2/DECISIONS.md`; verified W1-P2/W1-P6 plans and checkpoint evidence.

## Global Constraints

- Execute only W1-P7. Do not implement Notes persistence (W1-P8), privacy/Store copy, Adaptive Stage/layout, CSS redesign, dependency upgrades, packaging, release staging, or Store actions.
- Preserve `D:\DEV\Chrome plugin` and every V1 artifact. Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory` from checkpoint `e10dc3aee88dd449cebce7c986d2dfd5716328d2`; verified W1-P6 implementation is `f4ed9335dcbb74aa35b685eb0149667daaefd31e`.
- Preserve W1-P2 as the sole cross-context storage mutation authority. A late APOD completion may enter `storage.update`, but it must re-read the current cache and recompute current local-day/timezone ownership inside the queued updater before writing. Add no service worker, manifest permission, raw-driver path, or context-local correctness fallback.
- Local-day calculations use a named IANA timezone and calendar components. Construct the next day first, then resolve that day’s midnight. Never derive a day end with `start + 86_400_000`, and never determine calendar-day distance from elapsed milliseconds.
- The required zone matrix is `America/New_York` plus `Europe/Berlin`: 2026 spring-forward local days are 23 hours and fall-back local days are 25 hours in both zones. Tests use literal hand-derived UTC boundaries, not the production helper to compute expected values.
- The runtime timezone comes from `Intl.DateTimeFormat().resolvedOptions().timeZone`. A timezone change changes local-day identity even when the epoch and date key happen to remain equal. Timezone probing is bounded to at most once per minute and visibility/focus/pageshow restoration forces an immediate recheck.
- `useLocalDay` owns exactly one pending timeout per mounted consumer. Every schedule/reschedule advances a generation; a cleared/queued callback from an older generation is a no-op. Cleanup invalidates the generation, removes listeners, and leaves no timer. Strict Mode setup/cleanup/setup must leave only the live generation operative.
- `useNow` retains its existing interval cadence/API and gate behavior, but visible/focus/pageshow restoration updates from the wall clock immediately. Listener cleanup is exact; do not convert disabled widgets into ticking subscribers.
- Background, Focus, Countdown, Quote, Habits, Month calendar, Sun, and Moon derive their local day from `useLocalDay`, not render-time `todayKey()` or a coarse independent minute interval. Quote and Countdown retain outer gate components so disabled/empty widgets allocate no lifecycle timer. Existing copy, storage schema, placement, styling, controls, and no-husk behavior remain unchanged.
- APOD’s module owner is `{ identity: key + timeZone, generation, promise }`, not one global promise. Same-identity mounts dedupe; a new day/timezone starts immediately without waiting for old work. Its authority-held updater writes only if the runtime still has that same identity and no current cache already represents the day. Only the matching generation may clear the owner in `finally`; stale resolve/reject/finally cannot write, block, or release newer work. Existing once-per-day failure caching, optional-permission boundary, and curated fallback remain unchanged.
- ICS `VALUE=DATE` meaning is carried explicitly as `IcsEvent.allDay: boolean` through parsing, recurrence expansion, connector snapshots, fixture data, and rendering. A timed event at local midnight—even one lasting 23, 24, or 25 elapsed hours—remains timed. Do not infer all-day status from epoch shape or duration.
- An all-day default end is the next calendar date’s midnight in the event’s date/floating zone. Explicit DATE `DTEND` remains exclusive, and recurring all-day occurrences preserve their calendar-day span across DST rather than reusing one elapsed-millisecond duration.
- `parseIcs` and `fetchIcs` require the detected runtime timezone explicitly. Only the Calendar/UI boundary resolves the production default. DATE and floating DATE-TIME values resolve through that named zone rather than the test runner/process timezone; TZID and UTC values keep their own authority. Calendar passes the same timezone to parsing and snapshot scope so cached epochs and cache identity cannot diverge.
- Calendar day windows use the active runtime timezone’s constructed midnight boundaries. Day tokens use calendar-date ordinals, not rounded elapsed-day division. Minutes-scale relative copy continues to win across midnight, and existing headline/Join/view semantics remain unchanged except that they read explicit `allDay`.
- ICS connector snapshots advance to `ics:v2` and include a non-secret runtime scope `{ timeZone }`; legacy `ics:v1`, another timezone’s snapshot, and events without the explicit current schema do not render. Other connector identities remain byte-for-byte compatible, including Home Assistant `v2`.
- W1-P1 remains the connector freshness/generation/queued-write authority. The shared hook may accept an optional non-secret runtime scope and optional payload predicate, but it must include runtime scope in synchronous current-owner identity, opaque persisted scope, in-flight dedupe, effect cleanup, and updater-time current checks without changing callers that omit it. A current-scope payload that fails its connector predicate is treated as absent, never shown/retained as previous data, and refreshed from `null`.
- Tests exercise real zoned primitives, real hooks/listeners/timers, real ICS parsing/expansion, real connector snapshot ownership, real components under `StorageProvider`, and real reducer/UI behavior. Mocks stop at wall clock/timezone, fetch, and storage-driver boundaries. Every production behavior starts with a witnessed failing test for the expected missing/broken contract.
- Preview automation adds no production bridge. It uses a dedicated disposable extension page for Playwright’s fixed clock, temporarily parks the main page away from the extension so only the modeled clock owns date-driven effects, and closes the disposable page before restoring/reloading the main page. It must state that fixed-time/visibility signals model sleep/wake and do not prove an operating-system timezone change. Unit tests are authoritative for exact zone/DST boundaries and runtime-zone detection.
- Final closeout runs the exact targeted suite, both named timezone-focused checks, `npx tsc --noEmit`, full Vitest, production and preview builds, production preview-symbol searches, the full real-extension harness, bounded whole-packet review/fix/rereview, a dedicated `docs: checkpoint W1-P7` commit, push, clean-state proof, and then stops before W1-P8.

---

### Task 0: Commit the independently reviewed execution base

**Files:**

- Review/fix: `docs/superpowers/plans/2026-08-14-w1-p7-local-day-dst-rollover.md`

**Interfaces:**

- Produces: one immutable plan-base SHA for every W1-P7 implementation/review range.
- Records: protected original starting status and HEAD `eb1354b6a5b041fb6d494655c3dae1862572bc51` for final equality proof.

- [ ] **Step 1: Run the independent plan review**

Dispatch a fresh read-only reviewer against this plan, the complete master specification, ROADMAP W1-P7, A2-D009/A2-D015, verified W1-P2/W1-P6 plans and checkpoint evidence, and the current dates/useNow/Background/Focus/Countdown/Quote/Habits/Month calendar/Sun/Moon/Timer/ICS/snapshot/harness code. Require Critical/Important/Minor findings with exact plan/code references and explicit coverage of:

- IANA-zone calendar-midnight construction and literal spring/fall boundaries in both named zones;
- timezone detection when the date key does and does not change;
- midnight, visibility, focus, pageshow, sleep/wake, clock-jump, Strict Mode, cleanup, and stale-timer generations;
- all named date-driven surfaces, including disabled-widget gate behavior and Focus edits spanning rollover;
- APOD previous-day/timezone completion and authority-held ownership;
- explicit ICS all-day/default-end/DTEND/recurrence semantics, timed-midnight distinction, and DST spans;
- ICS timezone-scoped cache invalidation while preserving W1-P1 ownership/dedupe and other connector scopes;
- Calendar today/day-token/relative/Join behavior across DST and timezone changes;
- Timer wake completion and honest real-extension evidence limits;
- deterministic teardown, secret safety, W1-P2/W1-P6 preservation, and W1-P8 exclusion.

Verify every finding against repository/source evidence. Fix confirmed Critical/Important findings and packet-local Minor correctness gaps in this plan. Reject unsupported or out-of-scope suggestions with exact evidence.

- [ ] **Step 2: Self-review and commit the plan**

Run:

```powershell
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
git add --intent-to-add -- docs/superpowers/plans/2026-08-14-w1-p7-local-day-dst-rollover.md
rg -n "TB[D]|TO[D]O|implement late[r]|fill in detail[s]|similar t[o]|appropriate error handlin[g]|write tests fo[r]" docs/superpowers/plans/2026-08-14-w1-p7-local-day-dst-rollover.md
git diff --check -- docs/superpowers/plans/2026-08-14-w1-p7-local-day-dst-rollover.md
git diff -- docs/superpowers/plans/2026-08-14-w1-p7-local-day-dst-rollover.md
```

Require the original checkout to be clean at the literal expected HEAD, the plan diff to be non-empty, no placeholder hits, no whitespace errors, complete spec coverage, and consistent interfaces. Commit only the reviewed plan:

```powershell
git add docs/superpowers/plans/2026-08-14-w1-p7-local-day-dst-rollover.md
git commit -m "docs: plan W1-P7 local-day rollover"
git rev-parse HEAD
```

Record the literal SHA as `W1_P7_PLAN_BASE`.

---

### Task 1: Zoned day primitives and generation-safe lifecycle clocks

**Files:**

- Modify: `src/lib/dates.ts`
- Modify: `src/lib/dates.test.ts`
- Create: `src/lib/hooks/useLocalDay.ts`
- Create: `src/lib/hooks/useLocalDay.test.tsx`
- Modify: `src/lib/hooks/useNow.ts`
- Create: `src/lib/hooks/useNow.test.tsx`

**Interfaces:**

- `resolvedLocalTimeZone(): string` returns the runtime IANA zone and throws a stable `Local timezone is unavailable` error only if the runtime supplies no non-empty zone.
- `zonedDateKey(nowMs: number, timeZone: string): string` returns the zone’s literal `YYYY-MM-DD` calendar key.
- `zonedLocalDayRange(nowMs: number, timeZone: string): { key: string; start: number; end: number }` resolves the current date’s midnight and the next calendar date’s midnight. `end` may be 23, 24, or 25 hours after `start`.
- `calendarDayDifference(fromMs: number, toMs: number, timeZone: string): number` compares calendar ordinals derived from zoned date parts and ignores elapsed DST hours.
- `useLocalDay(): { key: string; timeZone: string; now: Date }` publishes one coherent sample. Its timer wakes at the earlier of the next constructed midnight or 60-second timezone probe; visible/focus/pageshow calls resample immediately and replace the pending schedule.
- `useNow(intervalMs?)` retains its return type and interval behavior but also samples immediately on visible/focus/pageshow restoration.

- [ ] **Step 1: Write failing zoned-calendar tests**

Add literal table tests proving:

1. New York 2026-03-08 is `[2026-03-08T05:00:00Z, 2026-03-09T04:00:00Z)` (23h) and 2026-11-01 is `[2026-11-01T04:00:00Z, 2026-11-02T05:00:00Z)` (25h).
2. Berlin 2026-03-29 is `[2026-03-28T23:00:00Z, 2026-03-29T22:00:00Z)` (23h) and 2026-10-25 is `[2026-10-24T22:00:00Z, 2026-10-25T23:00:00Z)` (25h).
3. Month/year/leap rollover constructs the next date (`2026-12-31` -> `2027-01-01`, `2028-02-29` -> `2028-03-01`).
4. `calendarDayDifference` returns 1 across each 23h/25h transition and exact 6/7-day results across a transition.
5. Invalid/unknown timezone input fails explicitly rather than silently using the host zone.

- [ ] **Step 2: Run date tests and verify RED**

```powershell
npx vitest run src/lib/dates.test.ts
```

Expected: FAIL because the zoned range/difference/timezone interfaces do not exist and current day-end logic elsewhere still relies on 24 elapsed hours.

- [ ] **Step 3: Implement minimal zoned primitives and verify GREEN**

Use cached `Intl.DateTimeFormat(...).formatToParts` instances, calendar-tuple normalization through UTC date arithmetic, and a bounded offset-settling conversion for midnight. Derive expected values nowhere in tests through these helpers.

- [ ] **Step 4: Write failing lifecycle-hook and restoration-clock tests**

With fake timers and controlled `Intl.DateTimeFormat().resolvedOptions().timeZone`, prove:

1. Mount at 23:59:59.900 schedules the constructed midnight and emits the new key exactly at the boundary, including 23h/25h days.
2. A 60-second probe detects New York -> Berlin even when both zones currently share the same date key; it updates `timeZone` and replaces the midnight schedule.
3. Hidden time jump past midnight followed by visible, a focus event, and pageshow each resample immediately; repeated restoration signals still leave one current timeout.
4. A backwards clock jump reschedules the future boundary rather than retaining the old shorter delay.
5. Capture an old callback, reschedule, then invoke the old callback: it cannot publish or replace the current timer. Unmount and Strict Mode cleanup likewise reject late generations and remove every listener/timer.
6. `useNow(500)` updates immediately on visible/focus/pageshow after a two-minute wall-clock jump while retaining exactly one 500ms interval and cleaning it on unmount.

- [ ] **Step 5: Run hook tests and verify RED**

```powershell
npx vitest run src/lib/hooks/useLocalDay.test.tsx src/lib/hooks/useNow.test.tsx
```

Expected: FAIL because `useLocalDay` does not exist and `useNow` has no restoration listeners.

- [ ] **Step 6: Implement minimal hooks, verify GREEN, and commit Task 1**

Run:

```powershell
npx vitest run src/lib/dates.test.ts src/lib/hooks/useLocalDay.test.tsx src/lib/hooks/useNow.test.tsx
npx tsc --noEmit
git diff --check
```

Commit only Task 1 files:

```powershell
git add src/lib/dates.ts src/lib/dates.test.ts src/lib/hooks/useLocalDay.ts src/lib/hooks/useLocalDay.test.tsx src/lib/hooks/useNow.ts src/lib/hooks/useNow.test.tsx
git commit -m "fix(time): schedule local-day rollover safely"
```

---

### Task 2: Roll every local-day surface and reject stale APOD days

**Files:**

- Modify: `src/newtab/components/Background.tsx`
- Modify: `src/newtab/components/Background.test.tsx`
- Modify: `src/newtab/components/FocusLine.tsx`
- Create: `src/newtab/components/FocusLine.test.tsx`
- Modify: `src/newtab/widgets/countdown/CountdownLine.tsx`
- Create: `src/newtab/widgets/countdown/CountdownLine.test.tsx`
- Modify: `src/newtab/widgets/quote/QuoteWidget.tsx`
- Modify: `src/newtab/widgets/quote/QuoteWidget.test.tsx`
- Modify: `src/newtab/widgets/habits/HabitsWidget.tsx`
- Modify: `src/newtab/widgets/habits/HabitsWidget.test.tsx`
- Modify: `src/newtab/widgets/monthcal/MonthCalWidget.tsx`
- Modify: `src/newtab/widgets/monthcal/MonthCalWidget.test.tsx`
- Modify: `src/newtab/widgets/sun/SunWidget.tsx`
- Modify: `src/newtab/widgets/sun/SunWidget.test.tsx`
- Modify: `src/newtab/widgets/moon/MoonWidget.tsx`
- Modify: `src/newtab/widgets/moon/MoonWidget.test.tsx`
- Modify: `src/newtab/components/Clock.test.tsx`
- Modify: `src/newtab/components/Greeting.test.tsx`
- Modify: `src/newtab/widgets/clocks/WorldClocks.test.tsx`
- Modify: `src/newtab/widgets/timer/TimerWidget.test.tsx`
- Modify only if integration requires it: `src/newtab/App.test.tsx`

**Interfaces:**

- Each enabled/non-empty date-only surface reads one `useLocalDay` sample. Disabled/empty gates remain outside the hook so they allocate no local-day timer or restoration listener. Quote uses a gate/inner split; Countdown’s settings gate mounts a data gate, which mounts the lifecycle inner component only for a non-empty countdown list.
- Focus saves use the current sample at submit/blur time; an editor left open across midnight/timezone change saves into the new day.
- Background uses `sample.key` for rotation/cache display. An APOD request captures `{ key, timeZone }`; inside `storage.update('apodCache', updater)` it obtains a fresh runtime sample and returns the current cache unchanged unless ownership still matches.
- Habits toggles and streaks, Month calendar’s today ring/current-month control, and Sun/Moon daily calculations all derive from the coherent hook sample rather than independent `useNow(60_000)` intervals.

- [ ] **Step 1: Write failing Background/Focus/Countdown/Quote rollover tests**

Prove without a reload or unrelated storage write:

1. Auto/upload Background advances one photo and persists the new `lastRotated` once at midnight; APOD treats the old cache as stale and starts the new day once.
2. Hold day A’s APOD response, advance to day B, and prove B’s fetch starts and persists before A is released; A’s authority-held updater cannot overwrite B, its rejection stays quiet for B, and its `finally` cannot release B’s owner. Repeat with a timezone change that keeps the same date key but changes timezone identity. A same-identity remount still dedupes to one fetch.
3. A day-A Focus becomes the prompt on day B; submitting or blurring an editor opened on A after rollover writes day B exactly once.
4. Countdown changes from “in 1 day” to “today” at rollover and ignores past entries as before.
5. Quote selects the next day’s deterministic entry at rollover; choose a literal fixture day pair whose expected quote indices differ.
6. Visibility/sleep recovery produces the same results immediately, and Strict Mode does not duplicate storage writes/fetches.
7. Disabled Quote and disabled/empty Countdown attach no local-day timeout or restoration listeners; enabling with real content mounts exactly one live schedule.

- [ ] **Step 2: Run primary surface tests and verify RED**

```powershell
npx vitest run src/newtab/components/Background.test.tsx src/newtab/components/FocusLine.test.tsx src/newtab/widgets/countdown/CountdownLine.test.tsx src/newtab/widgets/quote/QuoteWidget.test.tsx
```

Expected: FAIL because these surfaces read the day only during unrelated renders and Background’s updater can accept an old request day.

- [ ] **Step 3: Implement minimal primary-surface integration**

Keep all UI/copy/DOM structure unchanged. Do not add generalized persistence status or W1-P8 behavior.

- [ ] **Step 4: Write failing Habits/Month calendar/Sun/Moon rollover tests**

Prove:

1. Habits’ pressed state and streak anchor move to the new local key exactly once; a click after rollover writes only the new key.
2. Month calendar moves the today ring/current-month identity at midnight, shows Today when a viewed month becomes non-current, and recovers after sleep/timezone change without resetting an intentionally navigated `view`.
3. Sun recomputes the new local calendar day’s sunrise/sunset and Moon recomputes phase/hemisphere output from the coherent new sample.
4. Disabled toggles, empty habits, or missing location create no `useLocalDay` timer/listener.
5. Clock, Greeting, World clocks, and Timer observe visible/focus/pageshow restoration immediately after a wall-clock jump. Disabled/empty World clocks and disabled Timer retain their outer gates and attach no `useNow` interval/restoration listener.

- [ ] **Step 5: Run secondary surface tests and verify RED**

```powershell
npx vitest run src/newtab/widgets/habits/HabitsWidget.test.tsx src/newtab/widgets/monthcal/MonthCalWidget.test.tsx src/newtab/widgets/sun/SunWidget.test.tsx src/newtab/widgets/moon/MoonWidget.test.tsx src/newtab/components/Clock.test.tsx src/newtab/components/Greeting.test.tsx src/newtab/widgets/clocks/WorldClocks.test.tsx src/newtab/widgets/timer/TimerWidget.test.tsx
```

Expected: FAIL because these surfaces still use independent minute intervals and do not share exact calendar-midnight/timezone restoration semantics.

- [ ] **Step 6: Implement minimal secondary-surface integration, verify GREEN, and commit Task 2**

Run:

```powershell
npx vitest run src/lib/dates.test.ts src/lib/hooks/useLocalDay.test.tsx src/lib/hooks/useNow.test.tsx src/newtab/components/Background.test.tsx src/newtab/components/FocusLine.test.tsx src/newtab/components/focusLogic.test.ts src/newtab/components/Clock.test.tsx src/newtab/components/Greeting.test.tsx src/newtab/widgets/countdown/CountdownLine.test.tsx src/newtab/widgets/quote/QuoteWidget.test.tsx src/newtab/widgets/habits/HabitsWidget.test.tsx src/newtab/widgets/monthcal/MonthCalWidget.test.tsx src/newtab/widgets/sun/SunWidget.test.tsx src/newtab/widgets/moon/MoonWidget.test.tsx src/newtab/widgets/clocks/WorldClocks.test.tsx src/newtab/widgets/timer/TimerWidget.test.tsx src/newtab/App.test.tsx
npx tsc --noEmit
git diff --check
```

Commit only Task 2 files:

```powershell
git add src/newtab/components/Background.tsx src/newtab/components/Background.test.tsx src/newtab/components/FocusLine.tsx src/newtab/components/FocusLine.test.tsx src/newtab/components/Clock.test.tsx src/newtab/components/Greeting.test.tsx src/newtab/widgets/countdown/CountdownLine.tsx src/newtab/widgets/countdown/CountdownLine.test.tsx src/newtab/widgets/quote/QuoteWidget.tsx src/newtab/widgets/quote/QuoteWidget.test.tsx src/newtab/widgets/habits/HabitsWidget.tsx src/newtab/widgets/habits/HabitsWidget.test.tsx src/newtab/widgets/monthcal/MonthCalWidget.tsx src/newtab/widgets/monthcal/MonthCalWidget.test.tsx src/newtab/widgets/sun/SunWidget.tsx src/newtab/widgets/sun/SunWidget.test.tsx src/newtab/widgets/moon/MoonWidget.tsx src/newtab/widgets/moon/MoonWidget.test.tsx src/newtab/widgets/clocks/WorldClocks.test.tsx src/newtab/widgets/timer/TimerWidget.test.tsx src/newtab/App.test.tsx
git commit -m "fix(time): roll local-day surfaces in open tabs"
```

---

### Task 3: Explicit ICS all-day semantics and timezone-scoped Calendar state

**Files:**

- Modify: `src/services/connectors/ics.ts`
- Modify: `src/services/connectors/ics.test.ts`
- Modify: `src/services/connectors/snapshotIdentity.ts`
- Modify: `src/services/connectors/snapshotIdentity.test.ts`
- Modify: `src/lib/hooks/useConnectorSnapshot.ts`
- Modify: `src/lib/hooks/useConnectorSnapshot.test.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.test.tsx`
- Modify fixture types/data only where TypeScript proves necessary: Calendar-related tests and `scripts/preview.mjs`

**Interfaces:**

- `IcsEvent.allDay: boolean` is required on every new parsed/expanded event and stored snapshot event.
- `parseIcs(text, windowStart, windowDays, runtimeTimeZone: string)` and `fetchIcs(calendars, windowStart, prev, runtimeTimeZone: string, fetchFn?)` require the named runtime zone for DATE/floating values. Tests and internal callers cannot omit it; only Calendar resolves `resolvedLocalTimeZone()` through `useLocalDay`. UTC and explicit TZID inputs remain independent of this argument.
- `parseIcs` stamps `allDay: pe.start.allDay`. For all-day events, `push(wall)` constructs each occurrence’s exclusive end from its calendar-day span in the date/floating zone; timed events retain elapsed-duration behavior.
- `isIcsData(value: unknown): value is IcsData` accepts only an object with an events array whose every event has finite `start/end`, string `summary`, finite integer `cal`, required boolean `allDay`, and an optional string `meetUrl`. A matching-scope malformed payload is unusable cache data.
- `connectorSnapshotScope(id, config, runtimeScope?)` and `useConnectorSnapshot(..., ttlMs?, runtimeScope?, isData?)` accept an optional non-secret serializable runtime scope and optional payload predicate. Omitted options preserve every existing hash/config key/version/acceptance path. ICS uses version `v2`; Home Assistant remains `v2`; every other connector remains `v1`.
- Calendar passes `{ timeZone: localDay.timeZone }` as its runtime scope. The synchronous config key, async persisted scope, module in-flight key, render filtering, effect generation, and updater-time ownership all include it.
- Calendar passes `isIcsData` to the shared hook. Initial read, subscription, freshness check, and stale-data retention all treat a current-scope invalid payload as absent, display nothing from it, and invoke `refresh(null)`; valid refresh output is persisted normally.
- Calendar reads `ev.allDay` directly. Its today range and day tokens use `zonedLocalDayRange`/`calendarDayDifference` with the active timezone; it never recreates a local helper with `DAY_MS`.

- [ ] **Step 1: Write failing ICS all-day/DST tests**

Add literal tests proving:

1. `DTSTART;VALUE=DATE:20260308` with no end in New York emits `allDay:true`, 05:00Z -> 04:00Z next day (23h); `20261101` emits 04:00Z -> 05:00Z (25h).
2. The equivalent Berlin spring/fall fixtures emit the literal 23h/25h UTC boundaries.
3. An explicit multi-day DATE `DTEND` remains exclusive and spans the correct count across DST; a recurring all-day event preserves that count for every occurrence.
4. A timed local-midnight event with a 23h, 24h, or 25h duration emits `allDay:false`.
5. UTC, floating, TZID, EXDATE, recurrence bounds, meeting links, sorting, and per-feed fallback retain existing behavior and carry the boolean.
6. The same floating wall time parsed with New York versus Berlin runtime zones produces the two literal expected instants, while an explicit TZID event produces the same instant under both runtime-zone arguments.

- [ ] **Step 2: Run ICS tests and verify RED**

```powershell
npx vitest run src/services/connectors/ics.test.ts
```

Expected: FAIL because `IcsEvent` drops `DateSpec.allDay`, default DATE end is fixed at 24h, and recurrence reuses elapsed duration.

- [ ] **Step 3: Implement minimal explicit all-day expansion**

Do not broaden RRULE support. Preserve the 10,000-iteration bound, per-event failure isolation, and fetch timeout behavior.

- [ ] **Step 4: Write failing snapshot/timezone and Calendar tests**

Prove:

1. Optional runtime scope changes the synchronous key and opaque digest without exposing raw data; omitted scope keeps current GitHub/RSS/etc exact identities. ICS is `v2`; HA stays `v2`.
2. Hold an ICS refresh under New York, change runtime scope to Berlin, resolve both out of order, and prove only Berlin data renders/persists; updater-time current checks reject New York.
3. A fresh legacy `ics:v1` snapshot and a fresh `ics:v2` snapshot from another timezone render no old events and start the current refresh.
4. A fresh current-scope `ics:v2` snapshot whose event omits `allDay`, uses a non-boolean value, or otherwise fails `isIcsData` renders nothing and refreshes from `null`; no malformed event becomes a timed fallback.
5. Today rows include events before the constructed 23h/25h end; the exact end is excluded. Day-token 6/7-day fences remain exact across both DST transitions.
6. Explicit all-day events render All day/never Join; timed-midnight 23h/24h/25h events render a time and retain eligible Join behavior.
7. Hidden/sleep/timezone restoration updates today/relative copy and triggers exactly one current timezone-scoped refresh with no overlap.

- [ ] **Step 5: Run snapshot/Calendar tests and verify RED**

```powershell
npx vitest run src/services/connectors/snapshotIdentity.test.ts src/lib/hooks/useConnectorSnapshot.test.tsx src/newtab/widgets/calendar/CalendarWidget.test.tsx
```

Expected: FAIL because runtime scope/ICS v2 do not exist, Calendar infers all-day from epoch shape, and its day end is fixed at 24h.

- [ ] **Step 6: Implement minimal scope/Calendar integration, verify GREEN, and commit Task 3**

Run:

```powershell
npx vitest run src/lib/dates.test.ts src/lib/hooks/useLocalDay.test.tsx src/lib/hooks/useNow.test.tsx src/services/connectors/ics.test.ts src/services/connectors/snapshotIdentity.test.ts src/lib/hooks/useConnectorSnapshot.test.tsx src/newtab/widgets/calendar/CalendarWidget.test.tsx
npx vitest run src/settings/SettingsPanel.test.tsx -t "Calendar|ICS|snapshot"
npx tsc --noEmit
git diff --check
```

Commit only Task 3 files:

```powershell
git add src/services/connectors/ics.ts src/services/connectors/ics.test.ts src/services/connectors/snapshotIdentity.ts src/services/connectors/snapshotIdentity.test.ts src/lib/hooks/useConnectorSnapshot.ts src/lib/hooks/useConnectorSnapshot.test.tsx src/newtab/widgets/calendar/CalendarWidget.tsx src/newtab/widgets/calendar/CalendarWidget.test.tsx
git commit -m "fix(calendar): preserve all-day timezone semantics"
```

---

### Task 4: Built-extension rollover proof and complete packet verification

**Files:**

- Modify: `scripts/preview.mjs`
- Modify production/test files only if a new failing unit/component regression first proves a packet-local defect.

**Interfaces:**

- The preview scope helper mirrors `ics:v2` plus `{ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }` only for ICS; all existing connector fixture scopes remain exact.
- Before the W1-P7 block, navigate the main harness page to `about:blank` so its real-clock extension effects cannot race the fixed-date fixtures. Open a dedicated same-context extension page, attach the standard console/page-error capture, and use only that page’s `clock.setFixedTime` to model a tab sleeping across a local-day boundary; dispatching standard visibility/pageshow events exercises production restoration listeners. It does not claim an OS timezone change.
- Every preview ICS fixture—not only the W1-P7 fixture—carries explicit `allDay:true/false`, and the preview scope helper mirrors ICS `v2` plus the runtime `{ timeZone }` hash input. It must never stamp a malformed old fixture with a valid current scope.
- Teardown stops the Focus timer, atomically restores seeded storage through the dedicated page, reloads that page once to quiesce pending local-day/APOD/connector work, waits for exact state, closes the dedicated page (destroying its fixed clock), then navigates the main page back to `chrome://newtab/`. Prove the main page’s clock advances by taking two page-side `Date.now()` samples separated by at least 50 ms real time before continuing. No fixed clock, route, timer session, or fixture remains for downstream probes.

- [ ] **Step 1: Add deterministic W1-P7 real-extension assertions**

Add four countable assertions:

1. Seed a current-day Focus, countdown for tomorrow, deterministic quote/background rotation inputs, and a fresh current-day APOD-null/cache shape; after a modeled sleep past calendar midnight plus visible/pageshow, the Focus prompt, countdown “today” copy, new quote identity, and new Background `lastRotated` appear without reload or an unrelated storage write.
2. Start the one-minute Focus timer, jump the wall clock beyond its end while modeled hidden, restore visible/pageshow, and prove the real reducer/UI changes phase exactly once with no stuck running state.
3. Seed a current-timezone `ics:v2` snapshot containing one explicit all-day event plus one timed-midnight event; prove the all-day row says `All day`, the timed row retains `00:00`, and only the timed imminent/running headline can expose Join.
4. Repeated restoration events do not duplicate APOD/ICS work; teardown restores the exact Focus/countdown/photo/connector snapshot/timer-related keys and current wall clock with no later mutation.

Use literal hand-built fixtures. If the current date’s adjacent quote happens to hash to the same array index, choose a fixed pre-midnight date pair whose indices differ before starting the block. The fourth assertion requires both exact restored storage after the dedicated-page reload and an advancing `Date.now()` on the restored main page; re-pinning `setFixedTime(Date.now())` is not restoration. Do not route live APIs to manufacture a positive availability claim.

- [ ] **Step 2: Build preview and run the full harness once**

```powershell
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p7-harness-first.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w1-p7-harness-first.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w1-p7-harness-first.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w1-p7-harness-first.log -Pattern '^SKIP:').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
if ($fail -ne 0) { throw "Preview harness logged $fail FAIL lines" }
if ($pass -ne 447 -or $skip -ne 3) { throw "Expected W1-P7 harness totals PASS=447 SKIP=3, got PASS=$pass SKIP=$skip" }
```

Expected after Tasks 1-3: 447 PASS / 0 FAIL / 3 SKIP from W1-P6’s 443 / 0 / 3 plus the four W1-P7 lines. If a W1-P7 line fails, preserve exact evidence, reproduce a production defect with the smallest failing test before editing production, and follow red-green TDD. Delete the untracked first-run log after recording results.

- [ ] **Step 3: Run the complete W1-P7 verification gate**

Run the exact targeted suite:

```powershell
npx vitest run src/lib/dates.test.ts src/lib/hooks/useLocalDay.test.tsx src/lib/hooks/useNow.test.tsx src/services/connectors/ics.test.ts src/services/connectors/snapshotIdentity.test.ts src/lib/hooks/useConnectorSnapshot.test.tsx src/newtab/components/Background.test.tsx src/newtab/components/FocusLine.test.tsx src/newtab/components/focusLogic.test.ts src/newtab/components/Clock.test.tsx src/newtab/components/Greeting.test.tsx src/newtab/widgets/countdown/CountdownLine.test.tsx src/newtab/widgets/quote/QuoteWidget.test.tsx src/newtab/widgets/habits/HabitsWidget.test.tsx src/newtab/widgets/monthcal/MonthCalWidget.test.tsx src/newtab/widgets/sun/SunWidget.test.tsx src/newtab/widgets/moon/MoonWidget.test.tsx src/newtab/widgets/clocks/WorldClocks.test.tsx src/newtab/widgets/calendar/CalendarWidget.test.tsx src/newtab/widgets/timer/timerReducer.test.ts src/newtab/widgets/timer/TimerWidget.test.tsx src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx
```

Then run fresh:

```powershell
npx tsc --noEmit
npm test
npm run build
rg -n "__auroraStorageHarness|__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist
if ($LASTEXITCODE -ne 1) { throw 'Preview-only Aurora bridge leaked into production dist' }
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p7-harness.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w1-p7-harness.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w1-p7-harness.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w1-p7-harness.log -Pattern '^SKIP:').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
if ($fail -ne 0) { throw "Preview harness logged $fail FAIL lines" }
if ($pass -ne 447 -or $skip -ne 3) { throw "Expected W1-P7 harness totals PASS=447 SKIP=3, got PASS=$pass SKIP=$skip" }
git diff --check
git status --short
```

Requirements:

- targeted/full Vitest, TypeScript, production build, and preview build have zero failures;
- literal New York/Berlin spring/fall unit evidence proves 23h/25h constructed ranges and calendar distances;
- the production bridge search exits 1 with no match;
- the full harness process exits 0 and proves exactly 447 PASS / 0 FAIL / 3 SKIP;
- W1-P7 evidence covers exact midnight, timezone probe with same/different key, visibility/focus/pageshow, sleep/wake, backwards clock change, stale timer generation, Strict Mode/unmount, all named local-day surfaces, timer wake, APOD ownership, explicit all-day semantics, timed-midnight distinction, calendar DST windows/tokens, and timezone-scoped ICS cache generations;
- preserved W1-P1/W1-P2 storage/snapshot, W1-P3 permission, W1-P4 restore, W1-P5 Home Assistant, and W1-P6 Weather evidence does not regress;
- the three existing SKIPs remain honest Home Assistant/native-permission ceilings; no new SKIP substitutes for local-day evidence;
- no W1-P8 or later behavior enters the diff.

Delete untracked harness logs after recording counts.

- [ ] **Step 4: Commit the verified harness integration**

```powershell
git add scripts/preview.mjs
git commit -m "test(time): prove open-tab rollover in extension"
```

If Task 4 exposes a production/test defect, commit only its exact packet-local files separately before the harness commit. Record the resulting HEAD as the implementation head before whole-packet review.

---

### Task 5: Bounded whole-packet review, fix round, checkpoint, push, and stop

**Files:**

- Review: `W1_P7_PLAN_BASE..HEAD`
- Modify after final verification: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after final verification: `docs/superpowers/aurora-2/STATUS.md`
- Modify after final verification: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Produces: reviewed W1-P7 implementation commits.
- Produces: dedicated `docs: checkpoint W1-P7` handoff commit.
- Produces: pushed `origin/feat/aurora-2-observatory`, clean target/original worktrees, and a W1-P8 continuation prompt without a W1-P8 plan.

- [ ] **Step 1: Request the bounded independent implementation review**

Dispatch a fresh read-only reviewer with plan-base SHA, implementation HEAD, this plan, master spec sections 10.3/10.6/13/16, ROADMAP W1-P7, A2-D009/A2-D015, the complete diff, and final verification evidence. Require exact file/line references and Critical/Important/Minor severity. Inspect specifically:

- zone conversion and constructed-midnight boundaries cannot use 24h shortcuts or loop indefinitely;
- date keys/day distances stay correct around both DST directions, month/year/leap changes, and timezone changes;
- lifecycle hooks own/clean one live schedule and reject stale callbacks after every reschedule/unmount/Strict Mode path;
- every named date-driven surface uses current local-day identity without violating hook gates or changing unrelated UI/storage behavior;
- APOD new-identity work starts before old work settles; old-day/timezone resolve/reject/finally cannot overwrite, block, or release newer ownership inside W1-P2 authority;
- `IcsEvent.allDay` is explicit end-to-end, current-scope malformed payloads are rejected/refreshed, every preview fixture carries the boolean, all-day ends/recurrences are calendar-based, and timed-midnight events never misclassify;
- ICS’s required runtime zone and optional hook runtime scope/payload predicate participate in synchronous/async/in-flight/updater ownership without leaking secrets or invalidating other connector identities;
- Calendar today/day-token/relative/Join rules remain correct and refresh after timezone/sleep restoration;
- Clock/Greeting/World clocks/Timer restoration and every disabled/empty gate are covered; Timer completion on wake is exactly once; the disposable-page preview evidence restores an advancing main-page clock, is deterministic/truthful, production contains no new bridge, teardown is complete, and W1-P8 is absent.

- [ ] **Step 2: Verify and fix confirmed findings with TDD**

For each finding, inspect cited evidence. Reproduce every confirmed defect with the smallest failing unit/component/harness assertion before production edits. Fix confirmed Critical/Important and packet-local Minor correctness findings in one bounded fix wave. Reject unsupported or out-of-scope suggestions with code/spec evidence. Stage only literal confirmed-fix files, inspect the staged set/diff, and commit fixes separately:

```powershell
git status --short
git add -- src/lib/dates.ts src/lib/dates.test.ts src/lib/hooks/useLocalDay.ts src/lib/hooks/useLocalDay.test.tsx src/lib/hooks/useNow.ts src/lib/hooks/useNow.test.tsx src/services/connectors/ics.ts src/services/connectors/ics.test.ts src/services/connectors/snapshotIdentity.ts src/services/connectors/snapshotIdentity.test.ts src/lib/hooks/useConnectorSnapshot.ts src/lib/hooks/useConnectorSnapshot.test.tsx src/newtab/components src/newtab/widgets/countdown src/newtab/widgets/quote src/newtab/widgets/habits src/newtab/widgets/monthcal src/newtab/widgets/sun src/newtab/widgets/moon src/newtab/widgets/calendar src/newtab/widgets/timer src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx scripts/preview.mjs
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m "fix(time): address W1-P7 review"
```

Request one scoped rereview over the fix range. No Critical/Important or packet-local correctness finding may remain. After any fix, rerun Task 4 Step 3 completely.

- [ ] **Step 3: Update durable ledgers after fresh final verification**

Update:

- `ROADMAP.md`: mark W1-P7 `Verified`, link this plan, record exact acceptance evidence, implementation SHA, review disposition, and checkpoint subject; leave W1-P8 `Not started` with no plan.
- `STATUS.md`: record the W1-P7 envelope, plan/implementation/review commits, exact targeted/full/type/build/harness counts, zoned-midnight/DST/hook/surface/APOD/ICS/Calendar/Timer evidence, clean state, and W1-P8 as the single next packet.
- `DECISIONS.md`: append A2-D016 recording IANA-zone calendar boundaries, generation-owned local-day schedules, restoration-aware clocks, authority-held APOD day ownership, explicit all-day events, ICS v2 timezone scope, and deterministic extension evidence limits.

Commit only the ledger handoff:

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git commit -m "docs: checkpoint W1-P7"
```

- [ ] **Step 4: Push, prove clean state, prepare the next prompt, and stop**

```powershell
git push origin feat/aurora-2-observatory
git status --short --branch
git rev-parse HEAD
git rev-parse '@{upstream}'
git log -14 --oneline
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
```

Require local/upstream equality, no target-worktree entries, and the protected original still clean at recorded starting HEAD `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Provide a ready-to-paste next-session prompt naming the literal worktree, branch, checkpoint HEAD, verified W1-P7 implementation SHA, Packet `W1-P8`, required documents, and instruction to create/review its Notes-integrity plan just in time. Stop before creating a W1-P8 plan or changing Notes behavior.
