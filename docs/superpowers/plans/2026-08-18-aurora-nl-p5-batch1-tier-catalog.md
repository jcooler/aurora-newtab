# NL-P5 Batch 1 Tier Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first owner-reviewable tier-catalog batch: true Docked-tier lines for the daily-ritual/tool family, the docked render path, and a tracked visual catalog of every supported tier for the batch — then stop for the owner's widget-by-widget review.

**Architecture:** The Docked tier threads as a `docked?: boolean` presentation flag through `renderWidget` into the existing widget renderers — each widget keeps sole ownership of its data and panels (a widget is docked OR free, never both, so no double data consumers). Weather and Clock gain designed dense lines (`75°F · Atlanta · Clear`-style, middle dots separating facts); Timer/Tasks/Notes launcher chips and the Bookmarks full bar already satisfy the Docked contract and are declared, not rebuilt. A catalog script renders each batch-1 widget at every supported tier with seeded data and writes tracked PNGs plus a CATALOG.md index for the owner gate.

**Tech Stack:** TypeScript, React, Vitest, Playwright (catalog captures). No new dependencies, no storage changes.

**Spec:** `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md` §2.3 (tiers, no-whitespace law, Bookmarks exemption), §2.4 (docked click parity). Owner gate per §2.3: "delivered as a visual catalog reviewed by the owner widget-by-widget before implementation of each family is accepted."

## Global Constraints

- **Docked: one dense line for a dock strip. Text-first... Middle dots separate facts** (spec 2.3, verbatim examples: Weather `75°F · Atlanta · Clear`).
- **The no-whitespace law:** a tier must either fill its space with useful information or shrink to what it has. Empty padding is a defect at every tier.
- **Bookmarks exemption:** the Bookmarks bar renders its full readable form by default in every layout and every dock decision.
- **Click parity** (spec 2.4): clicking a docked widget opens the same panel or expansion its free form offers.
- **Owner gate:** batch 1 is NOT accepted until the owner reviews the catalog widget-by-widget. This packet ends at the catalog handoff — no restaging, no NL-P6 work.
- **Batch 1 widgets (10):** clock, greeting, search, focus, quote, weather, timer, tasks, notes, bookmarks. Docked support declared for: clock, focus, weather, timer, tasks, notes, bookmarks. NOT docked in batch 1: greeting, search, quote (no honest one-line dock form; the owner can overrule at review).
- **No storage or schema change.** No `layout`/`layouts` writes. Frozen boundaries untouched. Strict TDD, bounded commits, one review + at most one fix/rereview, ledger checkpoint.
- Working directory `D:\DEV\Chrome plugin-aurora-2`.

---

### Task 1: Docked contracts in the registry

**Files:**
- Modify: `src/newtab/widgetSizeContracts.ts` (contract gains optional `docked`)
- Modify: `src/newtab/widgetRegistry.ts` (entries expose `supportsDocked`)
- Test: `src/newtab/widgetSizeContracts.test.ts`, `src/newtab/widgetRegistry.test.ts`

**Interfaces:**
- Produces: `WIDGET_SIZE_CONTRACTS[id].docked?: string` (one-line content contract, present only for widgets that support the Docked tier) and `WidgetRegistryEntry.supportsDocked: boolean`.

- [ ] **Step 1: Failing test** — in `widgetSizeContracts.test.ts`:

```ts
it('declares the batch-1 Docked contracts and no others yet (NL-P5 batch 1)', () => {
  const docked = Object.entries(WIDGET_SIZE_CONTRACTS)
    .filter(([, contract]) => contract.docked !== undefined)
    .map(([id]) => id)
    .sort()
  expect(docked).toEqual(['bookmarks', 'clock', 'focus', 'notes', 'tasks', 'timer', 'weather'])
  expect(WIDGET_SIZE_CONTRACTS.weather.docked).toBe('Temperature · location · condition')
  expect(WIDGET_SIZE_CONTRACTS.clock.docked).toBe('Time · date')
  expect(WIDGET_SIZE_CONTRACTS.bookmarks.docked).toBe('Full readable bookmark bar')
})
```

and in `widgetRegistry.test.ts`:

```ts
it('exposes supportsDocked from the size contracts', () => {
  expect(WIDGET_REGISTRY_BY_ID.weather.supportsDocked).toBe(true)
  expect(WIDGET_REGISTRY_BY_ID.quote.supportsDocked).toBe(false)
})
```

- [ ] **Step 2:** Run both files, observe RED (property missing).
- [ ] **Step 3:** Implement — `contract()` helper in `widgetSizeContracts.ts` gains an optional trailing `docked?: string` parameter stored on the contract object; set it for the seven ids with these exact strings: clock `'Time · date'`, focus `'Focus text and completion'`, weather `'Temperature · location · condition'`, timer `'Timer state'`, tasks `'Tasks action'`, notes `'Notes action'`, bookmarks `'Full readable bookmark bar'`. In `widgetRegistry.ts`'s `registryEntry`, add `supportsDocked: contentContract.docked !== undefined` to the frozen entry (and the `WidgetRegistryEntry` interface member `supportsDocked: boolean`).
- [ ] **Step 4:** Run both files GREEN, plus `npx tsc --noEmit`, `git diff --check`.
- [ ] **Step 5:** Commit `feat(tiers): declare batch-1 Docked content contracts`.

---

### Task 2: The docked render path and the two new dense lines

**Files:**
- Modify: `src/newtab/widgetRenderers.tsx` (props gain `docked?: boolean`; weather/clock renderers thread it)
- Modify: `src/newtab/canvas/CanvasSurface.tsx` (`renderWidget` signature gains `docked`; docked items pass `true`)
- Modify: `src/newtab/App.tsx` (renderWidget closure threads the flag)
- Modify: `src/newtab/components/Clock.tsx` (docked line), `src/newtab/widgets/weather/WeatherWidget.tsx` (docked line)
- Modify: `src/newtab/index.css` (`.dock-line` typography)
- Test: `src/newtab/canvas/CanvasSurface.test.tsx`, `src/newtab/components/Clock.test.tsx`, `src/newtab/widgets/weather/WeatherWidget.test.tsx` (or the file's existing test home)

**Interfaces:**
- `WidgetRendererProps.docked?: boolean` (default false).
- `CanvasSurfaceProps.renderWidget: (entry, size, docked) => ReactNode` — third parameter `docked: boolean`.
- Docked lines render one flex row `class="dock-line"` with `data-dock-line` and middle-dot-separated `<span>` facts.

- [ ] **Step 1: Failing tests.**

CanvasSurface (extend the docked-strip test): with a layout docking `clock` bottom, assert `renderWidget` mock receives `docked === true` for clock and `false` for anchored items:

```tsx
it('passes docked=true to the renderer only for strip members', () => {
  const seen = new Map<string, boolean>()
  render(
    <CanvasSurface
      activeLayout={{ ...LAYOUT, widgets: { ...LAYOUT.widgets, clock: { kind: 'docked', dock: 'bottom', order: 0 } } }}
      entries={ENTRIES}
      viewport={{ width: 1408, height: 445 }}
      renderWidget={(entry, _size, docked) => { seen.set(entry.id, docked); return <span>{entry.label}</span> }}
    />,
  )
  expect(seen.get('clock')).toBe(true)
  expect(seen.get('weather')).toBe(false)
})
```

Clock (`Clock.test.tsx`): `render(<Clock docked />)` shows one `[data-dock-line]` row whose text matches `/\d{1,2}:\d{2}/` and contains the day-context date, with NO `.clock-face` big-glyph block; `render(<Clock />)` unchanged.

Weather (in the Weather widget's existing test file): with a seeded cache prop/hook fixture, `docked` renders one `[data-dock-line]` button whose accessible name contains the temperature, location label, and condition, and clicking it opens the same `Weather details` dialog (assert by role); without `docked` the existing compositions are untouched (run the file's existing cases).

- [ ] **Step 2:** RED on all three.
- [ ] **Step 3: Implement.**
  - `widgetRenderers.tsx`: add `docked?: boolean` to `WidgetRendererProps`; weather renderer becomes `(props) => <WeatherWidget onExpandedChange={props.onWeatherExpandedChange} stageVariant={effectiveVariant(props)} docked={props.docked} />`; clock becomes `(props) => <Clock docked={props.docked} />`. Timer/tasks/notes/bookmarks/focus need no change (their existing forms are their Docked lines; declared in Task 1).
  - `CanvasSurface.tsx`: `renderWidget(entry, size, item.mode === 'docked')` in `renderItem`; update the prop type.
  - `App.tsx`: `const renderWidget = (entry, size, docked = false) => { const Renderer = resolveWidgetRenderer(entry.rendererKey); return <Renderer {...rendererProps} canvasSize={size} docked={docked} /> }`.
  - `Clock.tsx`: when `docked`, return `<div data-dock-line className="dock-line"><span>{time}</span><span aria-hidden>·</span><span>{formatDayContext(now, 'compact')}</span></div>` reusing the component's existing `now`/format sources; the accessible time value stays in a `<time>` element.
  - `WeatherWidget.tsx`: when `docked` and a usable current snapshot exists, render `<button data-dock-line className="dock-line" onClick={openDetails}>` with three fact spans — formatted temperature (existing unit formatting helpers), location label, condition text (existing WMO-code describer) — separated by `·` spans; opening reuses the SAME details-panel state the free form uses (click parity, spec 2.4). With no location/cache, render the existing compact setup affordance unchanged (a setup prompt is the honest dock line).
  - `index.css`: one `.dock-line { display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; line-height: 20px; padding: 4px 10px; }` block (no scrollbars, no fixed width — the strip owns overflow).
- [ ] **Step 4:** GREEN on the three files plus `src/newtab/canvas`, `src/newtab/App.test.tsx`; `npx tsc --noEmit`; `git diff --check`.
- [ ] **Step 5:** Commit `feat(tiers): docked render path with Weather and Clock dense lines`.

---

### Task 3: The visual catalog generator and the batch-1 catalog

**Files:**
- Create: `scripts/catalog-nl-p5.mjs` (reuses the witness scaffolding: preview build, persistent Chromium, seeded storage)
- Create (generated, tracked): `docs/superpowers/catalog/batch-1/*.png` + `docs/superpowers/catalog/batch-1/CATALOG.md`

**What the script does:**
1. Build preview dist, launch Chromium at 1600x900 DSF 1 (the catalog is composition evidence, not a viewport matrix — A2-D061 forbids exhaustive matrices here).
2. Seed: batch-1 widgets enabled; Dallas location + fresh weather cache (the forensic seed); focus text; a running-ish timer config; three bookmark folders; notes/tasks content; quote of the day.
3. For each batch-1 widget and each supported tier (`compact`/`standard`/`full` from `canvasSizes`, plus `docked` when `supportsDocked`): seed a one-widget layouts document placing ONLY that widget (free anchored center at the tier, or docked bottom order 0), reload, wait, and capture a tight screenshot of the widget's bounding rect (padding 12px) to `docs/superpowers/catalog/batch-1/<id>-<tier>.png`.
4. Write `CATALOG.md`: one section per widget — the tier table (tier, content contract string from `WIDGET_SIZE_CONTRACTS`, capture link) plus a blank **Owner verdict:** line per tier for the review.
5. Assertions per capture: widget rendered exactly once, non-zero size, zero runtime errors/failed requests; docked captures additionally assert `[data-dock-line]` presence for weather/clock and the strip's no-scrollbar contract.

- [ ] **Step 1:** Write the script (copy the `preview-nl-p4.mjs` launch/seed scaffolding; the per-tier loop drives `chrome.storage.local.set({ layouts: ... })` documents).
- [ ] **Step 2:** `node scripts/catalog-nl-p5.mjs` → exit 0, `PASS: NL-P5 batch 1 catalog` with ~31 captures (7 docked + 10 compact + 8 standard + 6 full per the current contracts).
- [ ] **Step 3:** Inspect EVERY capture individually (A2-D060 usefulness judgment). Fix genuine composition defects found (focused RED/GREEN on the owning widget); note owner-decision items in CATALOG.md rather than papering over them.
- [ ] **Step 4:** Commit the script and the catalog: `feat(tiers): batch-1 visual tier catalog`.

---

### Task 4: Gate, review, ledger, owner handoff

- [ ] **Step 1:** Focused gate: `npx vitest run src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRegistry.test.ts src/newtab/canvas src/newtab/App.test.tsx src/newtab/components/Clock.test.tsx src/lib/layout` + weather's test file; `npx tsc --noEmit`; `git diff --check`; `npm run build` (record module count).
- [ ] **Step 2:** Bounded review (one + at most one fix/rereview): verify click parity, no storage writes added, the no-double-consumer argument (docked XOR free), Bookmarks exemption untouched, and that greeting/search/quote genuinely declare no docked contract.
- [ ] **Step 3:** Ledger: STATUS.md gains the NL-P5-batch-1 evidence bullet; Current packet stays `NL-P5 tier catalog` with state `awaiting owner review of batch 1`.
- [ ] **Step 4:** Checkpoint commit + push + repository proof (both repos).
- [ ] **Step 5: STOP for the owner gate.** Present: the catalog directory path, CATALOG.md, and the reminder that per the stale-build rule any owner-facing extension check must rebuild `dist` from the exact reviewed commit first. Do NOT begin batch 2 or NL-P6 until the owner reviews batch 1 widget-by-widget.

---

## Self-review notes

- Spec 2.3 coverage: Docked = designed dense line (Task 2 for weather/clock; Task 1 declares the chip/bar widgets whose existing forms already ARE their dock lines — the catalog makes that claim visually for the owner to judge). No-whitespace law: enforced by inspection in Task 3 Step 3 and by the owner gate itself. Bookmarks exemption: untouched code, declared contract, catalog capture proves the full bar in the dock.
- Spec 2.4 click parity: Task 2 Weather docked opens the same details panel (tested); timer/tasks/notes chips already open their panels (existing App tests cover the docked case since NL-P4's witness stage 5).
- Deliberately NOT in batch 1: connector widgets (GitHub `7 commits · 2 PRs` etc.) — batch 2+; per-widget Full-tier redesigns beyond defect fixes — owner feedback drives them.
- Type consistency: `renderWidget(entry, size, docked)` third positional parameter matches Tasks 2's CanvasSurface/App changes; `supportsDocked` naming consistent across Tasks 1 and 3.
