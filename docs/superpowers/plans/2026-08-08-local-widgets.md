# Local Widgets (SP4): Habit Streaks + Month Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two zero-network, zero-permission local widgets — a habit-streak chip column and a compact month-glance calendar — completing the product-concept vision's local layer, wrapped at v1.5.0.

**Architecture:** Pure math modules first (`src/lib/habits.ts`, `src/lib/monthGrid.ts`, TDD-hard), then gate/inner widgets in the established idiom, config on the Widgets tab, schema v6 for the one new storage key. Both widgets join the combined-defaults collision gate with quantified floors — the SP2 phase lesson (probe-logged measurements, forced worst states, no boolean-only pairs) binds every placement here.

**Tech Stack:** React 19 + TS strict + Vite 6 + @crxjs MV3 + Tailwind 4 + Vitest 3 + Playwright preview harness. NO new deps, NO network, NO permissions.

**Spec:** `docs/superpowers/specs/2026-08-02-local-widgets-design.md`

## Global Constraints

- Everything standing still binds: local-first; a11y non-negotiable; `bg-panel-solid` for floating panels, `text-photo` for photo-floating text; deep-equal storage writes emit no events; serialized writes via `storage.update`; `cursor-pointer` discipline (Tailwind v4 preflight); comments state constraints not narration; TS strict, single documented casts; no placeholder UI — labels land with their widget; empty ≠ placeholder.
- **Placement discipline (SP2 phase lesson, BINDING):** every default slot is derived from PROBE-LOGGED real-harness measurements (never a side script); every meaningful gap gets a quantified floor (≥16px, or ≥8px only with a reasoned in-code exception); variable-height neighbors are seeded at their forced worst state. If a slot cannot honestly fit, STOP and report BLOCKED with the measured budget — never shave floors.
- **The spec's suggested defaults are STALE** (written before SP2 filled the map): "upper-left under the timer pill" now holds the ICS calendar widget (left-8 top-[13vh]); "lower-center above the quote" now holds the crypto strip (86vh band). This plan pins a mid-left second column instead (details in Tasks 57/58); the harness is the arbiter.
- Current measured map at 1600×900, all widgets at display max (from SP2's close): left column calendar 117→175 / RSS 198→542 (shownCount 8) / vercel 576→768; right column github 189→424 / gitlab 450→624 / jira 648→822; crypto strip 774→794 in the 762.5→804 links→quote band; clock/greeting centered column reaches x≈635→965 in the 24vh band; RSS right edge x=320; Tasks pill top 846; timer pill bottom ≈100.
- Verification per task: `npx tsc --noEmit` + `npm test` + `npm run build`; harness-touching tasks add `npm run build:preview` + full `node scripts/preview.mjs` (ALL PASS, 0 FAIL, no console errors — run `build:preview` FIRST, dist state is never assumed). Controller reviews every new capture. Commits end with the standard trailer; push after every task. Version stays 1.4.0 until Task 59 bumps 1.5.0.
- Store discipline: v1.2.1 verdict still gates all store motion; the v1.5.0 zip is STAGED like its predecessors.

## SP1/SP2 interfaces this plan consumes (main at `ae569fd`)

```ts
// src/lib/storage/schema.ts — CURRENT_VERSION = 5; defaults(); migrations[] (see migrations[4] style)
// src/lib/backup.ts — per-key validators + cleaning conventions (cleanLayout/cleanConnectors: drop malformed rows, never throw)
// src/settings/sections/Widgets.tsx — the widget-toggles section (Widgets tab); WIDGET_LABELS convention
// src/lib/layout/types.ts BLOCK_IDS; src/newtab/arrange/ArrangeController.tsx BLOCK_LABELS
// src/newtab/App.tsx — PositionedBlock wiring, gate/inner widget idiom (WorldClocks is the closest local-widget sibling)
// scripts/preview.mjs — combined-defaults gate (18 elements / 153 pairs), quantified floor probes, openSettingsTab, merge-seed
// src/lib/hooks/useStoredKey.ts; Clock.tsx's useNow(60_000) ticking hook (reuse, don't reinvent)
```

---

### Task 56: Schema v6 + pure habit math

**Files:**
- Create: `src/lib/habits.ts`, `src/lib/habits.test.ts`
- Modify: `src/lib/storage/schema.ts`, `src/lib/storage/migrations.ts`, `src/lib/backup.ts`
- Test: `src/lib/storage/migrations.test.ts`, `src/lib/backup.test.ts` (extend)

**Interfaces:**

```ts
// schema: AuroraData gains
export interface Habit { id: string; name: string; createdAt: number; log: string[] } // log = local YYYY-MM-DD keys, days marked done, unordered-tolerant
// habits: Habit[] (max 6 enforced at the UI boundary, tolerated structurally)
// defaults() gains habits: []; CURRENT_VERSION = 6; migrations[5] backfills habits: [] (migrations[4]-style spread-preserve)

// src/lib/habits.ts — PURE, no Date.now() anywhere; `todayKey` always injected
export function localDateKey(d: Date): string            // local YYYY-MM-DD (NOT toISOString — UTC would shift across midnight; TDD proves it)
export function streak(log: string[], todayKey: string): number
// consecutive local-date keys ending at todayKey OR the day before it (yesterday keeps
// a streak alive until today is marked — morning users aren't punished).
// today marked: counts back from today. today unmarked but yesterday marked: counts back from yesterday.
// neither: 0. Duplicates in log tolerated; unsorted tolerated.
export function toggleDay(log: string[], key: string): string[]  // add if absent, remove if present; returns NEW array, sorted
export function prevDayKey(key: string): string           // local-date arithmetic via Date parts, never ms subtraction (DST!)
```

- Backup: `habits` is user data — exported in full, no secrets; import cleaning drops malformed rows (non-string id/name, non-array log, non-`\d{4}-\d{2}-\d{2}` log entries filtered per-entry) via a `cleanHabits` following `cleanConnectors`'s shape.

- [ ] **Step 1: Failing habits.ts tests.** The spec's TDD-hard list, every case a real fixture: localDateKey at 2026-11-01 01:30 local (DST fall-back day → still 2026-11-01); streak across a spring-forward week (keys are date-only, DST must be a non-event because arithmetic is date-part-based — a test proves prevDayKey('2026-03-09') === '2026-03-08' etc.); month roll (Mar 1 → Feb 28; leap Feb 29 2028); gap = reset (log has today, gap, older run → streak counts only the tail run); yesterday-keeps-alive (log ends yesterday, today unmarked → N; today marked → N+1); unmark-today recompute (toggleDay removes today → streak falls back to the yesterday rule); neither today nor yesterday → 0; duplicates/unsorted tolerated; toggleDay add + remove + immutability (input array untouched).
- [ ] **Step 2: Implement habits.ts, green.**
- [ ] **Step 3: Failing schema/migration tests** — v5→v6 backfills `habits: []`; a v1 snapshot chains 1→…→6 (assert habits present AND the v5-era keys intact); migration-registry ordering test extends to `[0..5]`.
- [ ] **Step 4: Implement schema v6, green.**
- [ ] **Step 5: Failing backup tests** — export includes habits verbatim; import drops a malformed row but keeps valid siblings; a log entry `'not-a-date'` is filtered while its habit survives.
- [ ] **Step 6: Implement cleanHabits, green. Full suite + build.**
- [ ] **Step 7: Commit + push** — `feat: schema v6 — habits key and pure streak math` + trailer.

---

### Task 57: Habits widget + config

**Files:**
- Create: `src/newtab/widgets/habits/HabitsWidget.tsx`, `src/newtab/widgets/habits/HabitsWidget.test.tsx`
- Modify: `src/settings/sections/Widgets.tsx` (toggle + habits editor), `src/newtab/App.tsx`, `src/lib/layout/types.ts` (+`'habits'`), `src/newtab/arrange/ArrangeController.tsx` (`habits: 'Habits'`), `scripts/preview.mjs`
- Test: `src/settings/SettingsPanel.test.tsx` (extend)

**Interfaces:**
- Settings (Widgets tab): `widgets.habits` toggle (label `Habits`, WIDGET_LABELS same-task); below it when ON, a Habits editor following the WorldClocks section idiom: rows of existing habits (text input rename inline + remove ×), an add row (name input + Add), max 6 enforced (add row disabled at cap with a quiet note). All writes via `storage.update('habits', …)`; renames edit in place by id; remove deletes the row (the log goes with it — destructive but small; no confirm, matching WorldClocks' remove).
- Widget: gate on `settings?.widgets.habits && habits.length > 0` (defensive: `Array.isArray`). Inner: a VERTICAL column of habit chips, one per habit (max 6 by construction): rounded-full `bg-panel` chip per the small-control convention — name (`text-sm font-medium`, truncate + title) + `🔥 {streak}` (`text-xs text-fg-muted`; hide the flame at streak 0) + a check control for today: the WHOLE chip is a button (`aria-pressed={todayDone}`, `cursor-pointer`, focus-visible ring) — one tap marks today, tap again unmarks (`toggleDay`), streak recomputes live. `todayKey` from `localDateKey(new Date(useNow(60_000)))` — the ONE impure boundary, commented (the minute tick also rolls the widget over midnight).
- Default placement — the mid-left second column (see Global Constraints map): `fixed left-[21rem] top-[47vh] w-56` (chips column below Task 58's month grid; if Task 58 hasn't landed yet the slot is measured against its RESERVED extent — the two tasks share the column and Task 59's gate seeds both). Floors: ≥16px to RSS's column right edge (x=320 → 336 = 16px exactly — assert it), ≥16px to the centered column's measured left edge at this band, ≥16px vertical to the month grid above and the crypto strip/links row below at worst case (6 chips ≈ 6×40+gaps ≈ 264px: 47vh=423 → bottom ≈ 687; links top ≈ 700 at 1600×900 — 13px… the probe decides; if <16, raise the column start or drop the default max to 5 chips with a comment — measured, not assumed).
- Empty-connected is impossible by gate (needs ≥1 habit); a habit with an empty log renders `name 🔥—` no — renders name + unpressed check, no flame (streak 0). No scroll regions.

- [ ] **Step 1: Failing widget tests** — renders one chip per habit (cap 6 by construction: 7 in storage → 6 rendered, falsifying); today-marked chip has `aria-pressed=true`; tap writes toggleDay's result via storage.update (memoryDriver assert); tap again unmarks; streak text matches a seeded log (fixture with known streak); streak 0 hides the flame; disabled/empty → nothing + gate hook discipline; truncate + title on long names.
- [ ] **Step 2: Implement widget + wiring, green.**
- [ ] **Step 3: Failing settings tests** — toggle writes `widgets.habits`; add/rename/remove rows round-trip storage; max-6 disables add; label present.
- [ ] **Step 4: Implement editor, green.**
- [ ] **Step 5: Harness** — seed 3 habits (one with a 12-day streak ending today, one ending yesterday, one empty) + `widgets.habits: true`; probes: 3 chips render with expected streak texts; whole-chip `aria-pressed` toggles on real click (click chip → assert storage log gained todayKey → click again → gone — the interaction probe the quality bar demands); measured floor assertions for the slot (probe-logged); capture `widgets-habits.png`; restore off. Full chain + build:preview first.
- [ ] **Step 6: Commit + push** — `feat: habit streaks widget — chips, one-tap today, pure streak math` + trailer.

---

### Task 58: Month calendar widget

**Files:**
- Create: `src/lib/monthGrid.ts`, `src/lib/monthGrid.test.ts`, `src/newtab/widgets/monthcal/MonthCalWidget.tsx`, `src/newtab/widgets/monthcal/MonthCalWidget.test.tsx`
- Modify: `src/settings/sections/Widgets.tsx` (toggle `Month calendar`), `src/newtab/App.tsx`, `src/lib/layout/types.ts` (+`'monthCal'`), `src/newtab/arrange/ArrangeController.tsx` (`monthCal: 'Month'`), `scripts/preview.mjs`
- Test: `src/settings/SettingsPanel.test.tsx` (extend)

**Interfaces:**

```ts
// src/lib/monthGrid.ts — PURE
export interface MonthCell { key: string /* local YYYY-MM-DD */; day: number; inMonth: boolean }
export function monthGrid(year: number, month0: number): MonthCell[][]
// weeks matrix, weekday origin SUNDAY (spec-fixed), leading/trailing cells from
// adjacent months flagged inMonth:false; always 4-6 rows as the month demands
// (do NOT pad to 6 — the widget height varies and the placement floor uses the
// 6-row worst case). TDD: Feb 2026 (starts Sunday, exactly 4 rows), leap Feb
// 2028 (29 days), a 6-row month (e.g. May 2026: Fri start + 31 days), year
// boundaries (Dec→Jan grid edges), month0 out-of-range normalization (13 → Jan
// next year — or throw; DECIDE: normalize, it makes prev/next nav trivial).
```

- Widget: `bg-panel-solid rounded-2xl shadow-lg p-3 w-56` compact card. Header row: month name + year (`text-sm font-medium`) with prev/next chevron buttons (`aria-label="Previous month"/"Next month"`) and, when not viewing the current month, a small `Today` button snapping back. **A11y decision (spec-sanctioned lighter path, taken deliberately): the grid is a STATIC `<table>`** with `<caption class="sr-only">` naming month+year, weekday `<th scope="col">` initials, and plain `<td>` cells — display-only, no interactive cells, so the full ARIA grid pattern's roving tabindex is unnecessary; the three header buttons are the entire tab surface. Document this reasoning in the component comment.
- Cells: `text-xs`; out-of-month cells `text-fg-muted/50`; **today ringed with accent** (`ring-1 ring-accent rounded-full` on the cell's inner span) only when viewing the current month; **countdown dates dotted** — a 3px accent dot under any cell whose key matches a `countdowns` entry's local date (read the countdowns shape in schema.ts; entries store a date — convert to local key via the same convention it's stored in; verify how CountdownWidget parses it and match EXACTLY, TDD one test pinning parity).
- View state: `useState<{y, m0}>` initialized from `new Date()` (impure boundary, one place, commented); the current-month "today" ring re-derives from `useNow(60_000)` so the widget rolls over midnight.
- Gate: `settings?.widgets.monthCal`. Default OFF.
- Default placement — mid-left column top: `fixed left-[21rem] top-[24vh] w-56` — floors: ≥16px to RSS column right edge, to the centered clock column's measured left edge in this band (≈635 at 1600 — card right edge 336+224=560, ≈75px), and to the habits column below at BOTH worst cases (6-row month AND the month-nav header; 24vh=216 + ~232 worst height ≈ 448 → habits top 423 COLLIDES — the two tasks share the column: **Task 58 owns re-deriving both tops together** (e.g. monthCal 24vh + habits 50vh), probe-logged, ≥16px between; adjust Task 57's pinned class in the same commit if needed — cross-task placement is one measured system, and this task lands second).
- [ ] **Step 1: Failing monthGrid tests** (the list above). **Step 2: implement, green.**
- [ ] **Step 3: Failing widget tests** — renders the seeded month's matrix (fixed system time via vi.setSystemTime); today ringed only in current month; prev/next navigate (header text changes, matrix swaps); Today button appears only off-month and snaps back; countdown dot parity test (seeded countdown date → dot present; parity with CountdownWidget's date parsing); out-of-month styling; gate off → nothing.
- [ ] **Step 4: Implement widget + wiring + toggle, green.**
- [ ] **Step 5: Harness** — seed `widgets.monthCal: true` + one countdown; probes: grid renders current month, today-cell ring present (computed class), prev-click swaps header (real interaction probe), dot on the countdown date; measured floor assertions for the WHOLE mid-left column (monthCal + habits both seeded, both worst cases — 6-row month forced by picking the view month via prev/next clicks if the real month is shorter, documented); captures `widgets-monthcal.png`; restore. Full chain.
- [ ] **Step 6: Commit + push** — `feat: month calendar widget — glance grid with countdown dots` + trailer.

---

### Task 59: Combined gate extension + wrap — v1.5.0

**Files:**
- Modify: `scripts/preview.mjs` (combined gate grows to 20 elements), `README.md`, `package.json` + `src/manifest.ts` (→ 1.5.0)
- PRIVACY.md: verify NOTHING is needed (zero network/permissions — the spec's "easiest disclosure ever"; the storage line already covers both keys. Confirm by reading; only touch it if a claim would otherwise be false).

- [ ] **Step 1: Combined gate** — habits + monthCal join the all-on scenario at their worst cases (6 chips; 6-row month): element list 18 → 20, pairwise count grows accordingly (C(20,2)=190 — log it); the mid-left column's internal floors join the quantified-floor block. Fix any collision by adjusting pinned classes (measured); BLOCKED if structural.
- [ ] **Step 2: README** — two one-liners in the widgets section (habits: streaks that survive mornings; month calendar: the "what date is the 3rd Friday" glance, countdown dates dotted). Match voice.
- [ ] **Step 3: Version 1.5.0** both files + `npm install` (metadata-only verified); `npm run package` → `release/aurora-1.5.0.zip`, guards green, STAGED (v1.2.1 verdict still gates; if a verdict landed, STOP and consult Jon).
- [ ] **Step 4: Full verify** — suite, build, build:preview, full preview (ALL PASS incl. 190-pair line, 0 FAIL, no console errors), controller visual pass on `connectors-all.png` (now with locals) + the two widget captures.
- [ ] **Step 5: Commit + push** — `feat: v1.5.0 — habit streaks and month calendar` + trailer.

## After Task 59

Final whole-plan review (fable tier; base = this plan's commit, head = Task 59 commit; ledger minors triaged), ONE fix wave + ONE scoped re-review if needed, report to Jon (zip staged), Jira AUR-88 + Confluence sync, memory update, SDD workspace deleted at close.

## Out of scope

Habit reminders/notifications; habit history charts; calendar event display (the connector calendar's job); week-start preference (Sunday fixed until someone asks); any change to shipped SP1/SP2 widget defaults beyond the mid-left column's own internal fit.
