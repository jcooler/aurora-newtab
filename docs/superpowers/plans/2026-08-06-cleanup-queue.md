# Cleanup Queue (Jon, 2026-08-06) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three Jon-reported issues — squished weather expanded panel, cross-tab photo flicker, and the bookmarks-bar/top-row default layout — before v2 sub-project 1 begins.

**Architecture:** Three independent tasks against the existing widget/layout system. Task 1 is a visual redesign pass inside `WeatherWidget`. Task 2 is investigate-first (systematic-debugging): reproduce with a two-page Playwright context, verify the root cause, then apply a minimal fix plus a regression probe. Task 3 changes only the DEFAULT placements (the `className` fallbacks on `PositionedBlock` in `App.tsx`) plus responsive variants — arrange-mode stored layouts are user-owned and untouched.

**Tech Stack:** React 19 + TS strict, Tailwind 4, Vitest 3, Playwright preview harness (`scripts/preview.mjs`).

## Global Constraints

- Baseline: 438/438 tests green at `2e950b2`; every task ends with the full suite green (`npm test`), a commit with the `Co-Authored-By: Claude` trailer, and a push.
- **No placeholder/"coming soon" UI, ever.**
- **Screenshot-verify every visual change** via the harness; the controller personally reads every new/changed capture before approval. Bright-photo worst cases matter. Always condition-wait the photo fade (+800ms settle) before capturing.
- Harness: `npm run build:preview` then `node scripts/preview.mjs` (bookmark probes only work under the preview build; production prints an honest SKIP). Captures land in `screenshots/`.
- Viewport matrix (BINDING, `scripts/preview.mjs:667-690`): 1420×437 (Jon's window), 1280×500, 1024×600, 800×450, 2560×1440, plus the 1600×900 launch viewport.
- **Network is frozen**: Open-Meteo ×2 + BigDataCloud ×1. NO new fetches, no new origins. User-clicked outbound navigation (a plain `<a href>`) is allowed; it must disclose nothing new.
- Panel surfaces: floating panels `bg-panel-solid` (themed token — never hardcode hex); pills/drawer `bg-panel`; small controls stay `rounded-full`; panels take the theme radius. Photo-floating text carries `.text-photo`.
- Storage: `src/lib/storage` wrapper + `useStoredKey`/`storage.update`; deep-equal writes emit no events; cross-tab sync of settings is DELIBERATE — do not break it.
- Arrange-mode stored layouts (`layout` DataKey, schema v3+) are user-owned: Task 3 touches DEFAULTS only.
- Implementers must invoke the skills named in their task (frontend-design for Task 1; systematic-debugging for Task 2) before acting.

---

### Task 1: Weather expanded panel redesign + full-forecast link

**Files:**
- Modify: `src/newtab/widgets/weather/WeatherWidget.tsx` (expanded panel; collapsed chip untouched)
- Modify if needed: `src/newtab/widgets/weather/useWeather.ts` (expose already-fetched fields the richer panel needs — NO new fetches), `src/newtab/widgets/weather/WeatherIcon.tsx`
- Modify: `scripts/preview.mjs` (weather-expanded captures: keep the 1600×900 one at line ~303, add narrow-viewport expanded captures at 1420×437 and 800×450)
- Test: `src/newtab/widgets/weather/WeatherWidget.test.tsx`

**Interfaces:**
- Consumes: `useWeather()` snapshot (current conditions + daily/hourly arrays already fetched from Open-Meteo), saved location (lat/lon) from settings storage.
- Produces: nothing downstream; Task 3 moves this widget's DEFAULT position but not its internals.

**Requirements (Jon, verbatim intent):**
- The expanded view is "squished" — redesign it **bigger, with better information hierarchy** ("more robust"). The implementer MUST invoke the `frontend-design` skill and do a real design pass, not just add padding.
- Add an outbound **"full forecast" link** that opens a weather site pre-targeted to the saved location. Pick a provider whose URL accepts raw coordinates (candidates: `https://www.windy.com/{lat}/{lon}`, `https://merrysky.net/forecast/{lat},{lon}`, `https://weather.com/weather/today/l/{lat},{lon}` — implementer picks ONE with a one-line rationale in the report). Plain anchor, `target="_blank" rel="noopener noreferrer"`, **user-clicked navigation only — NO new fetches, no prefetch, no favicon fetch for it, disclose nothing new**.

**Steps:**
- [ ] Invoke frontend-design skill; sketch the hierarchy (current conditions hero → hourly/daily structure → meta row → forecast link) before coding.
- [ ] Write/adjust failing tests: link renders with coordinates substituted into the href, `rel`/`target` correct, absent when no saved location; panel structural assertions updated.
- [ ] Implement the redesign; respect panel-surface conventions and `.text-photo` where applicable.
- [ ] `npm test` — full suite green.
- [ ] Add the two narrow-viewport expanded captures to `scripts/preview.mjs`; `npm run build:preview && node scripts/preview.mjs`; confirm captures exist.
- [ ] Verify NO new network origins: `grep -rn "fetch(" src/newtab/widgets/weather/` shows only existing Open-Meteo/BigDataCloud calls.
- [ ] Commit (`feat: redesign weather expanded panel + full-forecast link`) and push.

**Acceptance:** controller reads `weather-expanded*.png` (all three viewports) and approves hierarchy + legibility over a bright photo; no new fetches; suite green.

### Task 2: Cross-tab photo flicker — investigate, then fix

**Files:**
- Investigate/modify: `src/newtab/components/Background.tsx` (the `key={src}` img + opacity fade), photo rotation/tier logic it consumes (follow the imports; rotation prefs live in photo prefs storage).
- Modify: `scripts/preview.mjs` (new two-page probe)
- Test: `src/newtab/components/Background.test.tsx` + the new harness probe

**Interfaces:**
- Consumes: `src/lib/storage` change events; photoPrefs/rotation state.
- Produces: nothing downstream.

**Requirements (Jon, verbatim intent):** Opening a new tab makes an already-open new-tab's background reload/flicker ("seems like each browser is connected"). **INVESTIGATE-FIRST — systematic-debugging skill, mandatory.**

**Steps:**
- [ ] Invoke systematic-debugging. **Phase A — reproduce for real:** in the Playwright harness open TWO pages in one context; observe tab A while tab B mounts. Instrument (console logs / element identity via `page.evaluateHandle` / animation restarts) to capture the flicker objectively.
- [ ] Verify (not assume) the hypothesis: tab B's mount triggers a photoPrefs/rotation (or tier) write whose `storage.onChanged` echo reaches tab A, re-rendering Background where `key={src}` remounts the `<img>` and re-runs the opacity fade. Record evidence for whichever cause is actually confirmed.
- [ ] **Phase B — minimal fix** for the confirmed cause. Constraints: daily rotation still works; upload galleries still work; deliberate cross-tab settings sync still works (a settings change in tab B must still reach tab A).
- [ ] Regression coverage: unit test for the causal path + a harness probe asserting the already-open page's `<img>` element identity survives (and no fade restart) when a second page opens.
- [ ] `npm test` green; `npm run build:preview && node scripts/preview.mjs` green including the new probe.
- [ ] Commit (`fix: cross-tab photo flicker — <confirmed cause>`) and push.

**Acceptance:** reproduction evidence BEFORE the fix, probe proving the flicker is gone AFTER, rotation/gallery/settings-sync regression checks green. If the hypothesis is falsified, the diagnosis report names the real cause with evidence before any fix is written.

### Task 3: Bookmarks bar owns the top row; timer + weather move below; shrink-not-wrap on narrow

**Files:**
- Modify: `src/newtab/App.tsx` (DEFAULT `className` fallbacks on the weather/timer/bookmarks `PositionedBlock`s — currently weather `fixed right-4 top-4`, timer `fixed left-4 top-4`, bookmarks `fixed inset-x-0 top-4 mx-auto w-fit`)
- Modify: `src/newtab/widgets/bookmarks/BookmarksBar.tsx` (scaling on narrower viewports: shift/shrink to fit, never wrap/stack)
- Modify: `scripts/preview.mjs` (combined-defaults collision assertions ~line 737+ updated to the new expectations; full matrix)
- Test: `src/newtab/widgets/bookmarks/BookmarksBar.test.tsx`, `src/newtab/components/PositionedBlock.test.tsx` if defaults are asserted there

**Interfaces:**
- Consumes: existing responsive custom variants (`narrow`/`tight` ≤1024/≤1300px width, `short`/`xshort` ≤600/450px height) from the Tailwind 4 setup.
- Produces: new DEFAULT positions the collision assertions encode.

**Requirements (Jon, verbatim intent):**
- The top of the page belongs to the bookmarks bar **ALONE**; the timer pill and weather widget move **BELOW** it. New DEFAULT positions only — arrange-mode stored layouts are user-owned and untouched.
- On narrower viewports the pieces **shift/shrink to fit instead of wrapping/stacking**.

**Steps:**
- [ ] Update the three DEFAULT classNames in `App.tsx`: bookmarks keeps the centered top row; weather and timer move below it (top offset clearing the bar's height at every matrix viewport), keeping their right/left alignment.
- [ ] Implement bookmarks-bar shrink behavior on narrow viewports (scale/tighten chips — no wrapping, no stacking; existing `narrow`/`tight` variants are the mechanism).
- [ ] Update the combined-defaults collision assertions in `scripts/preview.mjs` for the new geometry; matrix MUST include 1420×437 and all existing sizes.
- [ ] `npm test` green; `npm run build:preview && node scripts/preview.mjs` — all matrix assertions PASS, captures written.
- [ ] Commit (`feat: bookmarks bar owns top row; timer/weather defaults move below`) and push.

**Acceptance:** controller reads the full matrix captures: bookmarks bar alone on top at every size, timer/weather below without overlap, no wrapping/stacking at 1420×437 or 800×450; stored-layout path untouched (code inspection: only default classNames + responsive variants changed).
