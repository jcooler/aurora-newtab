# Aurora SF-P1 Frame Foundation and Reference Pair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish Aurora's exact shared-frame primitive and authoritative presentation metadata, then migrate Weather and On This Day to authored Compact, Standard, and Full frames without changing storage, data ownership, Docked forms, or any other widget's presentation.

**Architecture:** Extend the existing registry-owned size contract with presentation class, stack-tier, state, and tier-composition metadata while retaining the current `sizes` and Docked compatibility surface. A new presentation-only `TierFrame` owns exact outer geometry and theme tokens; Weather and On This Day continue to own their hooks, data, actions, and state copy inside that frame. Their free and stack faces render the same authored component, so the existing mounted-once stack remains warm while the reference pair gains identical painted bounds. Other stack members retain their current presentation until their just-in-time SF-P2 or SF-P3 migration; SF-P1 does not apply a generic wrapper or expose incomplete faces.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind 4 plus `src/newtab/index.css`, Vitest and Testing Library, Playwright Chromium, MV3 preview build.

**Spec:** `docs/superpowers/specs/2026-08-22-aurora-shared-widget-frames-and-stack-composition-design.md`, owner approved 2026-08-22; delivery packet SF-P1 only.

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; never reset or rewrite history.
- Keep `D:\DEV\Chrome plugin` read-only, clean on `main`, and exact at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- Chrome Web Store upload, field edits, saves, submission, publication, distribution, and rollout remain blocked without a new action-specific W6-P5 approval.
- Preserve layouts/storage versions, exact Save/Cancel/Undo/recovery, legacy `layout`, connector identities and requests, credentials, permissions, snapshot/cache ownership, privacy/redaction, CSP, dependencies, Notes/Tasks/Timer/Calendar/ICS/Weather authorities, and the one-mounted-data-owner rule.
- Observe a focused failing test before every production change. Record each RED command and failure in this plan before implementing its GREEN.
- Do not wrap Docked forms, intrinsic free forms, bars, or unmigrated widgets in `TierFrame` during SF-P1.
- Do not change stored tiers, anchors, offsets, layers, dock coordinates/order, stack membership, or stack facing values.
- Do not add internal scrollbars to a frame. Weather's viewport-owned details dialog may retain its bounded dialog scroll; it is not the framed surface.
- No generic fact-grid composition, decorative cards inside cards, nearest-tier substitution changes, automatic movement, automatic stack paging, or new dependency.
- The Calendar, Month, and Public Holidays consolidation is deferred design work. Record it, but do not change those identities, settings, storage, connectors, or presentations in SF-P1.
- Run one bounded packet review and at most one fix/rereview cycle. Only Critical and Important findings block the checkpoint.
- Before owner review, rebuild `dist` from the exact reviewed commit and verify `dist/build-provenance.json` matches it.

---

## File Structure

### Create

- `src/newtab/widgets/shared/TierFrame.tsx` - exact shared outer frame and tier/state semantics only.
- `src/newtab/widgets/shared/TierFrame.test.tsx` - DOM, CSS, theme-token, and geometry-contract tests.
- `scripts/qa-shared-frame-p1.mjs` - exact-build Chromium reference-pair and stack witness.
- `scripts/qa-shared-frame-p1.test.mjs` - deterministic harness contract tests.
- `docs/superpowers/catalog/shared-frames/sf-p1/CATALOG.md` - per-capture usefulness verdict table generated as data.
- `docs/superpowers/reports/SHARED-FRAMES-SF-P1-QA.md` - packet evidence and owner-gate record.

### Modify

- `src/newtab/widgetSizeContracts.ts` - authoritative presentation metadata while preserving the existing compatibility fields.
- `src/newtab/widgetSizeContracts.test.ts` - full registry declaration and reference-pair contract tests.
- `src/newtab/widgetRegistry.ts` - expose the same frozen presentation contract on each registry entry.
- `src/newtab/widgetRegistry.test.ts` - identity, immutability, and metadata derivation proof.
- `src/newtab/widgets/weather/WeatherWidget.tsx` - authored fixed-frame free tiers; Docked line and details authority unchanged.
- `src/newtab/widgets/weather/WeatherWidget.test.tsx` - exact tier hierarchy and fixed state-frame tests.
- `src/newtab/widgets/glance/OnThisDayWidget.tsx` - flat reference composition with one title/date and no local scroll.
- `src/newtab/widgets/glance/OnThisDayWidget.test.tsx` - tier hierarchy, overflow destination, and state-frame tests.
- `src/newtab/widgets/work/WorkWidgetShell.tsx` - export the existing resource-state body for composition reuse; no behavior change to other work widgets.
- `src/newtab/widgets/glance/GlanceWidgetShell.tsx` - re-export that body for public-data widgets.
- `src/newtab/canvas/StackCard.test.tsx` - exact reference-pair face geometry and unchanged paging behavior.
- `src/newtab/canvas/CanvasSurface.test.tsx` - same stored tier reaches both reference members without another renderer or write.
- `src/newtab/index.css` - exact frame geometry, authored Weather/On This Day layouts, narrow safety, focus, and reduced-motion rules.
- `.gitignore` - ignore only SF-P1 browser profile/build scratch directories.
- `docs/superpowers/aurora-2/STATUS.md` - active packet and final evidence.
- `docs/superpowers/aurora-2/ROADMAP.md` - SF-P1 state and deferred unified Agenda design topic.
- `docs/superpowers/aurora-2/DECISIONS.md` - final owner-gate decision only after owner review.

---

## Task 1: Declare the presentation contract without changing presentation

**Files:**

- Modify: `src/newtab/widgetSizeContracts.ts`
- Modify: `src/newtab/widgetSizeContracts.test.ts`
- Modify: `src/newtab/widgetRegistry.ts`
- Modify: `src/newtab/widgetRegistry.test.ts`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`

- [ ] **Step 1: Write the failing contract tests.** Add these public types and assertions to `widgetSizeContracts.test.ts` before production edits:

```ts
expect(WIDGET_PRESENTATION_CONTRACTS.weather).toMatchObject({
  presentationClass: 'framed',
  sizes: ['compact', 'standard', 'full'],
  stackSizes: ['compact', 'standard', 'full'],
  states: ['loading', 'ready', 'empty', 'stale', 'partial', 'permission-required', 'hard-error'],
})
expect(WIDGET_PRESENTATION_CONTRACTS.onThisDay).toMatchObject({
  presentationClass: 'framed',
  sizes: ['compact', 'standard', 'full'],
  stackSizes: ['compact', 'standard', 'full'],
  states: ['loading', 'ready', 'empty', 'stale', 'hard-error'],
})
expect(WIDGET_PRESENTATION_CONTRACTS.bookmarks.presentationClass).toBe('bar')
expect(WIDGET_PRESENTATION_CONTRACTS.clock.presentationClass).toBe('intrinsic')
for (const id of BLOCK_IDS) {
  const contract = WIDGET_PRESENTATION_CONTRACTS[id]
  expect(contract.stackSizes.every((tier) => contract.sizes.includes(tier)), id).toBe(true)
}
```

Pin the exact class sets so a future identity cannot enter by omission:

```ts
expect(idsFor('bar')).toEqual(['bookmarks'])
expect(idsFor('intrinsic')).toEqual([
  'clock', 'countdown', 'focus', 'greeting', 'links', 'quote', 'search', 'worldClocks',
])
expect(idsFor('framed')).toEqual([
  'auroraKp', 'crypto', 'downloads', 'github', 'gitlab', 'habits', 'homeassistant',
  'ics', 'jira', 'linear', 'monthCal', 'moon', 'notes', 'onThisDay', 'publicHolidays',
  'readingList', 'recentlyClosed', 'rss', 'sentry', 'status', 'sun', 'tabGroups',
  'tasks', 'timer', 'todoist', 'vercel', 'weather',
])
```

The Weather and On This Day tier contracts must name exact purpose, essential facts, signature information, ordered support, narrow-reduction order, and overflow destination:

```ts
expect(WIDGET_PRESENTATION_CONTRACTS.weather.tiers.standard).toEqual({
  purpose: 'Current conditions and forecast context',
  essential: ['temperature', 'condition', 'location'],
  signature: ['forecast trend'],
  supporting: ['feels like', 'wind', 'humidity'],
  narrowSafety: ['tighten spacing', 'shorten location', 'truncate condition'],
  overflow: { kind: 'details', label: 'Weather details' },
})
expect(WIDGET_PRESENTATION_CONTRACTS.onThisDay.tiers.standard).toEqual({
  purpose: 'Three historical events for the local date',
  essential: ['title', 'local date', 'event year', 'event summary'],
  signature: ['historical event list'],
  supporting: ['provider attribution'],
  narrowSafety: ['tighten spacing', 'clamp event summaries'],
  overflow: { kind: 'provider', label: 'More on Wikipedia' },
})
```

- [ ] **Step 2: Observe RED.** Run:

```powershell
npx vitest run src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRegistry.test.ts
```

Expected: imports/properties for `WIDGET_PRESENTATION_CONTRACTS`, `presentationClass`, `stackSizes`, `states`, and `tiers` fail because only the old size-promise shape exists.

- [ ] **Step 3: Implement the frozen metadata.** In `widgetSizeContracts.ts`, retain `compact`, `standard`, `full`, `docked`, and `sizes` for compatibility, then add:

```ts
export type WidgetPresentationClass = 'framed' | 'intrinsic' | 'bar'
export type WidgetPresentationState =
  | 'loading' | 'ready' | 'empty' | 'stale' | 'partial'
  | 'permission-required' | 'hard-error'

export interface TierCompositionContract {
  purpose: string
  essential: readonly string[]
  signature: readonly string[]
  supporting: readonly string[]
  narrowSafety: readonly string[]
  overflow: Readonly<{ kind: 'none' | 'details' | 'settings' | 'provider'; label?: string }>
}

export interface WidgetPresentationContract extends WidgetSizeContract {
  presentationClass: WidgetPresentationClass
  stackSizes: readonly CanvasSize[]
  states: readonly WidgetPresentationState[]
  tiers: Readonly<Partial<Record<CanvasSize, TierCompositionContract>>>
}
```

Build every row through one freezing helper. Export `WIDGET_PRESENTATION_CONTRACTS` as the authority and `WIDGET_SIZE_CONTRACTS` as the same object under the compatibility name, not as a second hand-maintained map:

```ts
export const WIDGET_PRESENTATION_CONTRACTS = Object.freeze({ /* all BLOCK_IDS */ })
export const WIDGET_SIZE_CONTRACTS = WIDGET_PRESENTATION_CONTRACTS
```

For SF-P1, every identity declares class, free sizes, stack sizes, Docked promise, and applicable state names. Weather and On This Day additionally declare complete tier composition metadata. Later SF packets fill tier composition for their bounded families before migrating their renderers. Do not read this metadata from a widget or use it to change current rendering in Task 1.

- [ ] **Step 4: Expose the authority through the registry.** Add `presentationContract: WidgetPresentationContract` to `WidgetRegistryEntry`, point `canvasSizes`, `supportsDocked`, and the compatibility `contentContract` at that same frozen object, and test referential identity plus freezing. No component branches on it yet.

- [ ] **Step 5: Record the deferred Agenda topic without settling it.** Add one ROADMAP backlog line:

```md
- Unified Agenda design after SF-P4: explore one Agenda identity that can optionally bind the month beneath its event list and enrich it with public holidays. Preserve the current Calendar/ICS, Month, and Public Holidays authorities until the owner approves a separate design; no consolidation is part of SF-P1 through SF-P4.
```

- [ ] **Step 6: Run GREEN and commit.** Run the same focused Vitest command, then:

```powershell
npx tsc --noEmit
git diff --check
git add src/newtab/widgetSizeContracts.ts src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRegistry.ts src/newtab/widgetRegistry.test.ts docs/superpowers/aurora-2/ROADMAP.md
git commit -m "feat: declare shared frame presentation contracts"
```

---

## Task 2: Build the exact `TierFrame` primitive

**Files:**

- Create: `src/newtab/widgets/shared/TierFrame.tsx`
- Create: `src/newtab/widgets/shared/TierFrame.test.tsx`
- Modify: `src/newtab/index.css`

- [ ] **Step 1: Write RED component and CSS tests.** Assert one semantic section, exact data attributes, no extra data owner, and the shared theme classes:

```tsx
render(<TierFrame label="Weather" tier="standard" state="ready"><p>Forecast</p></TierFrame>)
const frame = screen.getByRole('region', { name: 'Weather' })
expect(frame.dataset.tierFrame).toBe('standard')
expect(frame.dataset.tierFrameState).toBe('ready')
expect(frame.className).toContain('tier-frame')
```

Pin CSS literals for 216x132, 320x200, 460x284, `box-sizing: border-box`, `overflow: hidden`, the `calc(100vw - 24px)` narrow cap, per-tier aspect ratios, no `overflow-y: auto|scroll`, token-derived panel/border/ink, visible focus, and reduced-motion handling.

- [ ] **Step 2: Observe RED.** Run:

```powershell
npx vitest run src/newtab/widgets/shared/TierFrame.test.tsx
```

Expected: module-not-found for `TierFrame`.

- [ ] **Step 3: Implement a presentation-only frame.** Use no hooks, storage, renderer lookup, or data logic:

```tsx
export default function TierFrame({ label, tier, state, className = '', children }: TierFrameProps) {
  return (
    <section
      aria-label={label}
      data-tier-frame={tier}
      data-tier-frame-state={state}
      className={`tier-frame tier-frame--${tier} ${className}`.trim()}
    >
      {children}
    </section>
  )
}
```

Use custom properties and aspect ratio so desktop dimensions are exact and only widths narrower than `frame width + 24px` scale down proportionally:

```css
.tier-frame {
  box-sizing: border-box;
  width: min(var(--tier-frame-width), calc(100vw - 24px));
  height: auto;
  aspect-ratio: var(--tier-frame-ratio);
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius);
  background: var(--panel-solid);
  color: var(--canvas-fg);
}
.tier-frame--compact { --tier-frame-width: 216px; --tier-frame-ratio: 216 / 132; }
.tier-frame--standard { --tier-frame-width: 320px; --tier-frame-ratio: 320 / 200; }
.tier-frame--full { --tier-frame-width: 460px; --tier-frame-ratio: 460 / 284; }
```

Use the repository's actual panel-radius, panel-background, border, ink, shadow, and focus token names after inspecting computed CSS; do not create a parallel theme system. Frame content uses flex/grid with `min-width: 0` and `min-height: 0`; it must not acquire a scroll owner.

- [ ] **Step 4: Run GREEN and commit.** Run:

```powershell
npx vitest run src/newtab/widgets/shared/TierFrame.test.tsx src/newtab/adaptiveStageLegibility.test.ts
npx tsc --noEmit
git diff --check
git add src/newtab/widgets/shared/TierFrame.tsx src/newtab/widgets/shared/TierFrame.test.tsx src/newtab/index.css
git commit -m "feat: add exact shared widget frames"
```

---

## Task 3: Author Weather inside all three frames

**Files:**

- Modify: `src/newtab/widgets/weather/WeatherWidget.tsx`
- Modify: `src/newtab/widgets/weather/WeatherWidget.test.tsx`
- Modify: `src/newtab/index.css`

- [ ] **Step 1: Add focused RED tests for ready tiers.** Seed the existing rich Weather fixture and assert:

```ts
expect(frame('compact').getAttribute('data-tier-frame')).toBe('compact')
expect(within(frame('compact')).getByText(/72/)).toBeTruthy()
expect(within(frame('compact')).queryByText('Feels')).toBeNull()

expect(frame('standard').dataset.tierFrame).toBe('standard')
expect(within(frame('standard')).getByText('Feels')).toBeTruthy()
expect(within(frame('standard')).getByText('Wind')).toBeTruthy()
expect(within(frame('standard')).getByText('Humidity')).toBeTruthy()

expect(within(frame('full')).getByTestId('weather-summary-hourly')).toBeTruthy()
```

Use DOM data attributes rather than class-order assumptions. Pin that the authored frame contains no decorative nested panel and no element with `overflow-y-auto` or `overflow-y-scroll`.

- [ ] **Step 2: Observe RED for ready tiers.** Run only `WeatherWidget.test.tsx`; expect missing `data-tier-frame` and old viewport/content-tight shell behavior.

- [ ] **Step 3: Implement ready composition.** Keep all existing hooks and snapshot calculations in the same component. Leave the Docked branch byte-for-byte equivalent in behavior and keep the existing viewport-owned details portal. For non-Docked ready data:

  - Compact: current icon and temperature, condition/location, urgent alert or freshness line. No metrics or hourly row.
  - Standard: current icon/temperature, condition/location, trend signal, flat Feels/Wind/Humidity row.
  - Full: Standard content plus the four-slot hourly signature row, resized to fit the frame.

Replace the free-form outer section only with `TierFrame`. Do not place the expanded Weather details dialog inside the frame. Keep every summary pixel inside the existing disclosure button so click parity remains exact.

- [ ] **Step 4: Add RED state tests.** Cover no-location/setup, initial loading, cached stale, partial environmental/alerts failure, and hard error. Every free state must retain the selected frame and a truthful named status/action. Docked state remains a dense line. Observe failures where the current no-data/setup shells do not have fixed bounds.

- [ ] **Step 5: Implement fixed states without changing authority.** Reuse `LocationSetup`, `ResourceFeedback`, existing refresh, and existing permission flows. Tighten their authored layout per tier; do not invent a second fetch or store. Preserve cached current conditions in stale/partial states. A hard error names Weather and retains the existing retry. Ensure all status text is at least 11px and routine text at least 14px where the frame can support it.

- [ ] **Step 6: Run GREEN and commit.** Run:

```powershell
npx vitest run src/newtab/widgets/weather/WeatherWidget.test.tsx src/newtab/widgets/weather/LocationSetup.test.tsx src/newtab/widgets/shared/TierFrame.test.tsx
npx tsc --noEmit
git diff --check
git add src/newtab/widgets/weather/WeatherWidget.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx src/newtab/index.css
git commit -m "feat: compose Weather in shared frames"
```

---

## Task 4: Author On This Day without repetition or local scroll

**Files:**

- Modify: `src/newtab/widgets/glance/OnThisDayWidget.tsx`
- Modify: `src/newtab/widgets/glance/OnThisDayWidget.test.tsx`
- Modify: `src/newtab/widgets/work/WorkWidgetShell.tsx`
- Modify: `src/newtab/widgets/glance/GlanceWidgetShell.tsx`
- Modify: `src/newtab/index.css`

- [ ] **Step 1: Add the RED tier-composition tests.** Replace the old Full-local-overflow expectation with bounded authored content:

```ts
expect(within(frame).getAllByText('On This Day')).toHaveLength(1)
expect(within(frame).getAllByText('August 22')).toHaveLength(1)
expect(frame.querySelector('[data-work-widget-scroll]')).toBeNull()
expect(frame.querySelector('[class*="overflow-y-auto"]')).toBeNull()
expect(screen.getByRole('link', { name: 'More on Wikipedia' })).toBeTruthy()
```

Pin Compact to one event with year and accessible full summary, Standard to three events, and Full to a bounded events/births/deaths composition. The Full tier keeps all three information families but caps their rows instead of scrolling.

- [ ] **Step 2: Observe RED.** Run `OnThisDayWidget.test.tsx`; expect missing exact frame/date hierarchy and the current Full `data-work-widget-scroll` assertion to conflict.

- [ ] **Step 3: Reuse the existing resource-state body.** Export `WorkResourceBody` from `WorkWidgetShell.tsx` and re-export it as `GlanceResourceBody`; do not alter its rendered behavior for existing consumers. On This Day uses it inside `TierFrame` so loading, retained stale data, empty, and retry semantics remain one implementation.

- [ ] **Step 4: Implement the authored hierarchy.** Render:

  - one `On This Day` heading;
  - one English month/day line derived from the already-owned `useLocalDay().now`;
  - Compact: one event;
  - Standard: three events;
  - Full: three events, then at most one birth and one death, preserving year and summary;
  - one `More on Wikipedia` trusted-provider link when bounded data has more context than fits.

Resize spacing/type and clamp summaries before removing the year or information family. Keep each event's accessible full text and existing safe article link. Do not fetch more data, store a second date, repeat the date, or add a scroll owner.

- [ ] **Step 5: Add and satisfy RED state tests.** Cover loading, empty, stale/retained error, and hard error at Standard. Each retains the exact outer frame and names the state. Retry continues to clear only the existing `connectorSnapshots.onThisDay` entry.

- [ ] **Step 6: Run GREEN and commit.** Run:

```powershell
npx vitest run src/newtab/widgets/glance/OnThisDayWidget.test.tsx src/newtab/widgets/work/WorkWidgetShell.test.tsx src/newtab/widgets/shared/TierFrame.test.tsx
npx tsc --noEmit
git diff --check
git add src/newtab/widgets/glance/OnThisDayWidget.tsx src/newtab/widgets/glance/OnThisDayWidget.test.tsx src/newtab/widgets/work/WorkWidgetShell.tsx src/newtab/widgets/glance/GlanceWidgetShell.tsx src/newtab/index.css
git commit -m "feat: compose On This Day in shared frames"
```

---

## Task 5: Prove the reference stack stays exact without broad migration

**Files:**

- Modify: `src/newtab/canvas/StackCard.test.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.test.tsx`
- Modify only if RED proves necessary: `src/newtab/canvas/StackCard.tsx`
- Modify only if RED proves necessary: `src/newtab/canvas/CanvasSurface.tsx`
- Modify only if RED proves necessary: `src/newtab/index.css`

- [ ] **Step 1: Write the RED integration test.** Render a stored Standard stack containing Weather and On This Day through `CanvasSurface`. Assert both members mount exactly once, both receive exact `standard`, the visible face is interactive, the hidden face remains mounted/inert, and storage callbacks are never invoked by rendering or face geometry.

- [ ] **Step 2: Add a browser-geometry component contract.** In `StackCard.test.tsx`, use members that render real `TierFrame`s and assert the grid contains two same-tier frames, no generic outer panel, unchanged arrows/dots/swipe/click behavior, and no internal scroll class. This jsdom test pins structure; Task 6 measures pixels in Chromium.

- [ ] **Step 3: Observe RED.** Run:

```powershell
npx vitest run src/newtab/canvas/StackCard.test.tsx src/newtab/canvas/CanvasSurface.test.tsx
```

Expected: the new exact-frame reference assertions fail only where integration attributes/props are missing. If they pass without production changes, record that result and do not manufacture a code change.

- [ ] **Step 4: Make only evidence-required integration changes.** Do not replace global tallest-member behavior or nearest-tier fallback in SF-P1. The reference pair already shares all three tiers and paints the same `TierFrame`; global stack-tier intersection and compatibility faces land when the remaining framed/intrinsic/bar presentations are available in SF-P2/SF-P3. Any necessary change must be presentation-only and retain mounted-once, hidden-inert, manual paging, plain-click parity, and edit-mode behavior.

- [ ] **Step 5: Run GREEN and commit tests/integration.** Run:

```powershell
npx vitest run src/newtab/canvas/StackCard.test.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx src/newtab/widgets/glance/OnThisDayWidget.test.tsx
npx tsc --noEmit
git diff --check
git add src/newtab/canvas/StackCard.test.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/canvas/StackCard.tsx src/newtab/canvas/CanvasSurface.tsx src/newtab/index.css
git commit -m "test: pin shared reference stack geometry"
```

If no production file changed, omit it from `git add`. If the RED passed without implementation, commit only the meaningful new regression coverage.

---

## Task 6: Build scalable SF-P1 browser evidence

**Files:**

- Create: `scripts/qa-shared-frame-p1.mjs`
- Create: `scripts/qa-shared-frame-p1.test.mjs`
- Modify: `.gitignore`
- Create: `docs/superpowers/catalog/shared-frames/sf-p1/CATALOG.md`

- [ ] **Step 1: Write the RED harness contract.** The Node test must import the manifest generation helper and assert the matrix is derived from `WIDGET_PRESENTATION_CONTRACTS` for exactly `weather` and `onThisDay`, not copied into a second tier list. It must fail on a missing tier, state, theme, stack direction/dot interaction, viewport, usefulness verdict, or expected frame dimension.

- [ ] **Step 2: Observe RED.** Run:

```powershell
node --test scripts/qa-shared-frame-p1.test.mjs
```

Expected: module/script missing.

- [ ] **Step 3: Implement the deterministic witness.** Use a preview build and isolated Chrome profile. Seed existing-layout-shaped `layouts`, current settings/location, connector config, and valid snapshots before the app observes them. Block unapproved external traffic and fulfil only exact expected provider requests. Derive declared tiers from the registry source/module, then capture:

  - ready Weather and On This Day at Compact, Standard, and Full;
  - applicable loading, setup/permission, empty, stale/partial, and hard-error states;
  - Standard reference stack on both faces, after previous/next, after a dot, after swipe, and after Weather plain click opens details;
  - dark, light, and strongly saturated panel tokens;
  - 1366x768, exact 1408x445, 1600x900, and 599px narrow-floor boundary.

For every frame, measure outer width/height within 0.5 CSS px, content scroll width/height, computed overflow, minimum text size, focus visibility, duplicate accessible names, selected text after swipe, and storage writes. The exact stored tier, layout bytes, membership, facing, and anchors must survive reload except for the explicit face-page write being tested. Fail on runtime errors, failed requests, unexpected requests, legacy `layout` writes, internal frame scrollbars, clipping, missing essential/signature selectors, or a capture with no usefulness verdict.

- [ ] **Step 4: Generate the owner catalog.** `CATALOG.md` lists each original-resolution PNG, measured geometry, visible essential/signature content, state, theme, viewport, and one explicit `Useful`, `Needs refinement`, or `Rejected` verdict. Do not auto-label a capture useful merely because assertions passed.

- [ ] **Step 5: Run the harness contract and a preliminary witness.** Run:

```powershell
node --test scripts/qa-shared-frame-p1.test.mjs
npm run build:preview
node scripts/qa-shared-frame-p1.mjs
```

Inspect every PNG at original resolution. Correct only verified SF-P1 defects through new focused RED tests before review.

- [ ] **Step 6: Commit the harness and catalog.** Run `node --check`, `git diff --check`, then commit only script, ignore, catalog, and evidence-safe fixture changes:

```powershell
git add .gitignore scripts/qa-shared-frame-p1.mjs scripts/qa-shared-frame-p1.test.mjs docs/superpowers/catalog/shared-frames/sf-p1
git commit -m "test: witness SF-P1 shared frames"
```

---

## Task 7: Stabilize, review once, and stop at the owner gate

**Files:**

- Create: `docs/superpowers/reports/SHARED-FRAMES-SF-P1-QA.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify only after owner review: `docs/superpowers/aurora-2/DECISIONS.md`

- [ ] **Step 1: Run the focused packet gate.** Use:

```powershell
npx vitest run src/newtab/widgets/shared/TierFrame.test.tsx src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRegistry.test.ts src/newtab/widgets/weather/WeatherWidget.test.tsx src/newtab/widgets/weather/LocationSetup.test.tsx src/newtab/widgets/glance/OnThisDayWidget.test.tsx src/newtab/widgets/work/WorkWidgetShell.test.tsx src/newtab/canvas/StackCard.test.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/App.test.tsx src/lib/layout
node --test scripts/qa-shared-frame-p1.test.mjs scripts/preview-information-first.test.mjs
npx tsc --noEmit
git diff --check
```

`scripts/preview-information-first.test.mjs` must be invoked through `node --test`, never Vitest, so it cannot reproduce the owner's earlier `No test suite found` error.

- [ ] **Step 2: Run the stabilized full gate once.** Run `npm test`, record exact file/test counts and any pre-existing warnings separately, and do not repeat it after documentation-only commits.

- [ ] **Step 3: Commit the implementation-review candidate and push.** Update STATUS to `SF-P1 review pending`, include active/protected proof, and push the bounded candidate.

- [ ] **Step 4: Request one bounded code review.** Review the full SF-P1 range against the design and this plan. Require classification as Critical, Important, or Minor and a `Ready`/`With fixes` verdict. If fixes are required, observe a focused RED for each code defect, make one fix commit, run the affected focused gate, and request one rereview only. Ledger accepted Minor debt; do not churn it into a second cycle.

- [ ] **Step 5: Rebuild from the exact reviewed commit.** After the review is Ready:

```powershell
npm run build:preview
git rev-parse HEAD
Get-Content -Raw -Encoding utf8 dist/build-provenance.json
```

The provenance commit must equal `HEAD`. If the build itself changes tracked files, stop and resolve that mismatch before owner evidence.

- [ ] **Step 6: Run final exact-build Chromium evidence.** Rerun `node scripts/qa-shared-frame-p1.mjs` against that exact `dist`, inspect all originals, and record capture count, verdicts, measured dimensions, storage writes, runtime errors, failed/unapproved requests, stack geometry before/after each face change, narrow scaling, and theme results.

- [ ] **Step 7: Write the QA report and checkpoint.** `SHARED-FRAMES-SF-P1-QA.md` must include:

  - exact implementation and reviewed commit range;
  - focused/full/Node/typecheck counts;
  - review and optional rereview verdict;
  - frame measurements by tier and viewport;
  - Weather and On This Day state/usefulness judgments;
  - stack paging/click/swipe and storage evidence;
  - exact build provenance;
  - active/upstream equality and protected-checkout proof;
  - explicit Store untouched statement;
  - any accepted Minor debt and SF-P2 boundary.

Commit and push the report/ledger checkpoint. Do not mark SF-P1 owner accepted yet.

- [ ] **Step 8: Stop at the required owner visual gate.** Present the exact reviewed Weather, On This Day, and reference-stack catalog concisely. Await owner acceptance or refinement. Do not create the SF-P2 implementation plan and do not migrate another widget before this gate is accepted.

- [ ] **Step 9: Record owner disposition.** After acceptance, add A2-D074 (or the next live decision id), mark SF-P1 Verified/owner accepted in STATUS and ROADMAP, commit/push, prove both repositories again, then write the SF-P2 just-in-time plan. If rejected, preserve the evidence, record the exact refinements, and remain in SF-P1.

---

## Plan Self-Review

- [ ] The plan covers SF-P1 only and stops at its mandatory owner visual gate.
- [ ] Every production edit follows an observed focused RED; a structurally already-green integration test does not force a meaningless code edit.
- [ ] The authoritative contract keeps compatibility from one object rather than introducing a manually mirrored map.
- [ ] Weather and On This Day remain their own data owners and use one renderer each free or stacked.
- [ ] Docked Weather and Docked On This Day remain content-tight and behaviorally unchanged.
- [ ] Other widgets and stacks remain visually unchanged until their bounded SF packet.
- [ ] The exact frame dimensions, no-scroll law, state stability, theme variance, and narrow safety are measured in Chromium.
- [ ] The Calendar/Month/Public Holidays Agenda idea is recorded but explicitly deferred.
- [ ] No placeholder test, TODO production branch, dependency, storage migration, Store action, or protected-checkout write appears in the plan.
