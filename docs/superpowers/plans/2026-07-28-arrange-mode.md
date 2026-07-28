# Arrange Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Long-press any widget to enter arrange mode: drag every block anywhere with 8px grid snap and magnetic alignment guides, keyboard-accessible, persisted to storage, one-click reset — Aurora's first premium-seam feature.

**Architecture:** A pure layout engine (`src/lib/layout/`) does all math (snap, guides, clamp, panel anchoring); a `PositionedBlock` wrapper renders each of 13 blocks at its stored percent-center or its default spot (pixel-identical when unarranged); one capture-phase arrange controller handles long-press, drag, keyboard, and overlay — widgets themselves stay untouched by arrange logic.

**Tech Stack:** React 19 + TS strict, pointer events (NO new runtime deps — dnd-kit rejected per spec), Vitest + RTL, Playwright preview harness.

**Spec:** `docs/superpowers/specs/2026-07-28-arrange-mode-design.md`

## Global Constraints

- Everything from v1.x still binds: local-first (no new network), `chrome.*` only in the storage driver + `src/services/bookmarks.ts`, no new runtime deps, a11y non-negotiable (labels, focus-visible, Escape via `useDialogEscape`, reduced-motion), panel surface classes verbatim, deep-equal writes emit no events.
- Google extension-policy compliance (standing directive): this feature adds no permissions, no network, no remote code — keep it that way.
- Blocks: `clock | greeting | worldClocks | countdown | search | focus | links | quote | weather | timer | tasks | notes | bookmarks`. Gear + photo-refresh are NEVER draggable.
- Positions: block **center**, percent of viewport (0–100), finite numbers; sparse map (absent = default); clamp so the block box keeps ≥8px viewport margin.
- Snap: 8px grid; guides for viewport center lines + other blocks' centers/edges, threshold 6px; guides win over grid.
- Long-press: 500ms hold, cancels on >8px movement or early release; engaging suppresses the following click.
- Premium seam: `isPremium()` from `src/lib/premium.ts` gates every arrange entry point.
- The UNARRANGED page must stay pixel-identical to today at every task boundary (controller screenshots enforce this).
- Verification per task: `npm test` + `npm run build` (+ `node scripts/preview.mjs` where the task says so), NO console errors; commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; push after each task. Work on `main`, continuous.

---

### Task 32: Schema v3 — `layout` key, migration, backup validation

**Files:**
- Create: `src/lib/layout/types.ts`
- Modify: `src/lib/storage/schema.ts`, `src/lib/storage/migrations.ts`, `src/lib/backup.ts`
- Test: `src/lib/storage/migrations.test.ts`, `src/lib/backup.test.ts` (extend)

**Interfaces:**
- Produces (`src/lib/layout/types.ts`):

```ts
export const BLOCK_IDS = [
  'clock', 'greeting', 'worldClocks', 'countdown', 'search', 'focus', 'links',
  'quote', 'weather', 'timer', 'tasks', 'notes', 'bookmarks',
] as const
export type BlockId = (typeof BLOCK_IDS)[number]
/** Block CENTER as percent of viewport (0-100 each axis), finite. */
export interface BlockPos { x: number; y: number }
export type Layout = Partial<Record<BlockId, BlockPos>>
```

- Produces (schema): `AuroraData` gains `layout: Layout`; `defaults()` gains `layout: {}`; `CURRENT_VERSION = 3`; `migrations[2]` backfills `layout: {}`.

- [ ] **Step 1: Failing migration tests** — append to `migrations.test.ts`:

```ts
describe('v2 -> v3', () => {
  it('backfills an empty layout map', () => {
    const out = migrate({ settings: defaults().settings }, 2)
    expect(out.layout).toEqual({})
  })
  it('a v1 snapshot chains through both migrations', () => {
    const out = migrate({}, 1)
    expect(out.settings.widgets.notes).toBe(true) // v1->v2 still ran
    expect(out.layout).toEqual({}) // v2->v3 ran after it
  })
})
```

Also extend the custom-registry ordering test (it defines only `0` and `1` now, which throws at v2): add `2: (data) => { calls.push(2); return data }` and change the expectation to `expect(calls).toEqual([0, 1, 2])`.

- [ ] **Step 2: Run to fail** (`npx vitest run src/lib/storage/migrations.test.ts`) — missing key/version.
- [ ] **Step 3: Implement** — create `types.ts` exactly as above; schema imports `Layout` from `../layout/types`, adds the field + default, bumps `CURRENT_VERSION` to 3; migrations gains:

```ts
// v2 -> v3: free-layout map for arrange mode. Absent for every v2 user.
2: (data) => ({ ...data, layout: {} }),
```

- [ ] **Step 4: Failing backup-validation tests** — append to `backup.test.ts`:

```ts
it('rejects a layout whose entry is not a finite pair', () => {
  const bad = envelope({ ...defaults(), layout: { clock: { x: NaN, y: 10 } } })
  expect(runImportValidation(bad).ok).toBe(false) // adapt to the file's existing helper idiom
})
it('drops unknown block ids from layout on import but keeps known ones', () => {
  const data = { ...defaults(), layout: { clock: { x: 40, y: 30 }, bogus: { x: 1, y: 1 } } }
  const cleaned = expectValidCleaned(envelope(data)) // adapt to existing idiom
  expect(cleaned.layout).toEqual({ clock: { x: 40, y: 30 } })
})
```

(Adapt the helper names to the idiom `backup.test.ts` already uses for per-key validation — read the file first; do NOT invent a parallel harness.)

- [ ] **Step 5: Implement validator** — `VALIDATORS.layout` (the `Record<DataKey, …>` type forces the new entry): every value is a plain object with `Number.isFinite` x and y. In the cleaned-assembly step, filter `layout` entries to `BLOCK_IDS` membership (unknown ids dropped silently, matching the unknown-top-level-key convention).
- [ ] **Step 6: Full suite + build green.** Existing v1→v2 tests must pass unchanged (they now chain through `migrations[2]`).
- [ ] **Step 7: Commit + push** — `feat: schema v3 — layout map for arrange mode` + trailer.

---

### Task 33: Pure layout engine — clamp, snap, guides, panel anchoring

**Files:**
- Create: `src/lib/layout/clamp.ts`, `src/lib/layout/snap.ts`, `src/lib/layout/anchor.ts`
- Test: `src/lib/layout/clamp.test.ts`, `src/lib/layout/snap.test.ts`, `src/lib/layout/anchor.test.ts`

**Interfaces (Produces — exact signatures later tasks rely on):**

```ts
// clamp.ts
import type { BlockPos } from './types'
export interface Size { w: number; h: number }
/** Clamp a percent-center so the block's box keeps >= marginPx from every viewport edge.
 *  Degenerate case (block bigger than viewport): pin to viewport center on that axis. */
export function clampCenterPct(pos: BlockPos, size: Size, viewport: Size, marginPx?: number): BlockPos

// snap.ts
import type { BlockPos } from './types'
import type { Size } from './clamp'
export interface OtherRect { cxPx: number; cyPx: number; w: number; h: number }
export interface Guide { axis: 'v' | 'h'; pct: number } // v = vertical line at x-pct
export interface SnapResult { pos: BlockPos; guides: Guide[] }
export function snapPosition(
  rawPct: BlockPos, size: Size, others: OtherRect[], viewport: Size,
  opts?: { gridPx?: number; thresholdPx?: number }, // defaults 8 / 6
): SnapResult

// anchor.ts — panels follow their pill in arrange-aware quadrant style
export interface PanelPlacement { left: number; top: number } // px
/** Place a panel adjacent to its pill: opens toward screen center — below the
 *  pill when the pill is in the top half (else above), left-aligned when the
 *  pill is in the left half (else right-aligned), 8px gap, clamped to >= 8px
 *  from every edge. */
export function anchorPanel(pillRect: DOMRectReadOnly | { left: number; top: number; right: number; bottom: number; width: number; height: number }, panel: Size, viewport: Size): PanelPlacement
```

Snap algorithm (binding): work in px. Per axis, candidate targets = viewport center + each other-rect's center and both edges (compare dragged center↔target center, dragged edges↔target edges). Nearest candidate within `thresholdPx` wins and emits its guide (line at the target's px→pct); with no candidate in range, round the axis to the `gridPx` grid. Guides list has ≤1 entry per axis.

- [ ] **Step 1: Failing clamp tests** — concrete cases: center 50/50 of a 200×100 block in 1600×900 → unchanged; center 1/1 → clamped to `((100/2+8)/1600*100, (100/2+8)/900*100)`… write the arithmetic out with expected literals (compute them in the test as expressions, e.g. `((200 / 2 + 8) / 1600) * 100`); right/bottom overflow symmetric; degenerate 2000-wide block → x pinned 50.
- [ ] **Step 2–3: Fail, implement, pass.**
- [ ] **Step 4: Failing snap tests** — cases with literal numbers (1600×900, 200×100 block): raw center within 6px of viewport-center x → snaps to 50% + emits `{axis:'v', pct:50}`; within 6px of another rect's center-y → snaps + `{axis:'h', …}`; edge-to-edge capture (dragged left edge within 6px of other's left edge); no candidate → grid rounding (e.g. raw 403px → 400px); guide preempts grid on the captured axis while the other axis still grid-rounds; both-axes guides.
- [ ] **Step 5–6: Fail, implement, pass.**
- [ ] **Step 7: Failing anchor tests** — pill top-left quadrant → panel below-left of pill (`left = pillRect.left`, `top = pillRect.bottom + 8`); pill bottom-right → panel above-right (`left = pillRect.right - panel.w`, `top = pillRect.top - 8 - panel.h`); clamping when the pill hugs an edge.
- [ ] **Step 8–9: Fail, implement, pass. Full suite + build.**
- [ ] **Step 10: Commit + push** — `feat: pure layout engine — clamp, snap+guides, panel anchoring` + trailer.

---

### Task 34: PositionedBlock + center-stack dissolution (pixel-identical default)

**Files:**
- Create: `src/newtab/components/PositionedBlock.tsx`
- Modify: `src/newtab/App.tsx`
- Test: `src/newtab/components/PositionedBlock.test.tsx`

**Interfaces:**
- Consumes: `Layout`/`BlockId`/`BlockPos` (Task 32), `clampCenterPct` (Task 33).
- Produces:

```tsx
export default function PositionedBlock({ id, pos, className, children }: {
  id: BlockId
  pos: BlockPos | undefined  // stored position; undefined = default placement
  className?: string          // default-placement classes (peripherals pass their old fixed classes; stack children pass none)
  children: ReactNode
}): ReactNode
```

Behavior: renders `<div data-block-id={id}>`. Without `pos`: `className` applies untouched (stack children flow normally; unarranged page unchanged). With `pos`: `position: fixed`, `left/top` = clamped percent, `translate: -50% -50%`, `className` NOT applied (the default positioning classes must not fight the override); clamping re-runs on mount and window resize using the div's measured size (`useLayoutEffect` + resize listener; measured size of 0 — jsdom — skips clamping). A `pos` with a non-finite `x` or `y` is treated as `undefined` (spec: corrupt entries fall back to the default position, per-block) — include an RTL case for it.

- [ ] **Step 1: Failing RTL tests** — without pos renders children with the given className and no inline position; with pos `{x:50,y:50}` sets `position: fixed` and `left: 50%`/`top: 50%` and drops className; `data-block-id` always present.
- [ ] **Step 2–3: Fail, implement, pass.**
- [ ] **Step 4: Dissolve the center stack in App.tsx** — `App` reads `const [layout] = useStoredKey('layout')`. Each former stack child gets its own boundary + block; `Clock` and `Greeting` split into separate boundaries (`name="clock"`, `name="greeting"`). The stack `<div className="flex h-full flex-col items-center justify-center">` remains as the flow container:

```tsx
<div className="flex h-full flex-col items-center justify-center">
  <WidgetBoundary name="clock"><PositionedBlock id="clock" pos={layout?.clock}><Clock /></PositionedBlock></WidgetBoundary>
  <WidgetBoundary name="greeting"><PositionedBlock id="greeting" pos={layout?.greeting}><Greeting /></PositionedBlock></WidgetBoundary>
  <WidgetBoundary name="clocks"><PositionedBlock id="worldClocks" pos={layout?.worldClocks}><WorldClocks /></PositionedBlock></WidgetBoundary>
  <WidgetBoundary name="countdown"><PositionedBlock id="countdown" pos={layout?.countdown}><CountdownLine /></PositionedBlock></WidgetBoundary>
  <WidgetBoundary name="search"><PositionedBlock id="search" pos={layout?.search}><SearchBar /></PositionedBlock></WidgetBoundary>
  <WidgetBoundary name="focus"><PositionedBlock id="focus" pos={layout?.focus}><FocusLine /></PositionedBlock></WidgetBoundary>
  <WidgetBoundary name="links"><PositionedBlock id="links" pos={layout?.links}><LinksWidget /></PositionedBlock></WidgetBoundary>
</div>
```

A block with a stored pos goes `fixed` and leaves the flow (the stack re-centers — accepted spec behavior). `if (!settings || !photoPrefs) return null` gains `|| !layout` — wait: `layout` resolves async like every `useStoredKey`; add it to the same guard so blocks never flash from default to positioned.

- [ ] **Step 5: Verify pixel-identical** — full suite; build; `node scripts/preview.mjs`; the controller compares `newtab.png` against the pre-task capture (empty layout ⇒ every block default ⇒ identical output expected; the split of clock/greeting boundaries must not change spacing — Clock+Greeting were siblings in one boundary; WidgetBoundary renders no wrapper chrome, but PositionedBlock introduces a `<div>` around each — the stack is `flex-col items-center`, and the new divs are block-level children, so vertical rhythm is preserved only if no margin/gap semantics relied on sibling selectors. Check `Clock`/`Greeting` for `mt-*`/sibling styles and preserve exact spacing (move such margins onto the PositionedBlock div via className if needed).
- [ ] **Step 6: Commit + push** — `feat: PositionedBlock + center stack dissolution (default layout unchanged)` + trailer.

---

### Task 35: Peripheral widgets adopt PositionedBlock; panels follow their pill

**Files:**
- Modify: `src/newtab/App.tsx`, `src/newtab/widgets/weather/WeatherWidget.tsx`, `src/newtab/widgets/timer/TimerWidget.tsx`, `src/newtab/widgets/notes/NotesWidget.tsx`, `src/newtab/widgets/notes/NotesPanel.tsx`, `src/newtab/widgets/todo/TodoWidget.tsx`, `src/newtab/widgets/todo/TodoPanel.tsx`, `src/newtab/widgets/quote/QuoteWidget.tsx`, `src/newtab/widgets/bookmarks/BookmarksBar.tsx`
- Test: existing widget test files (assertions on moved classes), `src/newtab/App.test.tsx` if present — plus preview verification.

**Interfaces:**
- Consumes: `PositionedBlock` (Task 34), `anchorPanel` (Task 33).

Pattern per peripheral: the widget's ROOT positioning classes (e.g. WeatherWidget's `fixed right-4 top-4 …`, QuoteWidget's bottom-center classes, pills' `fixed bottom-4 …`, BookmarksBar's `fixed left-1/2 top-4 …`) move OUT of the widget into App's `<PositionedBlock className="…">`; the widget root keeps its non-positional classes. Gate/inner splits, boundaries, and z-index behavior stay exactly as they are (BookmarksBar keeps its conditional `z-50`/`z-20` — that class stays on the nav INSIDE the block; the block div itself carries only placement).

Panels follow pills: `TimerWidget`, `TodoWidget`/`TodoPanel`, `NotesWidget`/`NotesPanel` stop using their own fixed panel coordinates. Each pill measures its rect on open (`ref.getBoundingClientRect()`) and the panel positions via `anchorPanel(pillRect, PANEL_SIZE, viewport)` (inline style, `position: fixed`). `PANEL_SIZE` per panel = its current fixed dimensions (Notes `w-80 h-64` = 320×256; Todo/Timer: read their classes and hardcode the same way — name the constants). Unarranged, `anchorPanel` MUST reproduce today's panel spots (verify: Notes pill bottom-left → panel above-left ⇒ matches old `bottom-16 left-4` within a few px; adjust the gap constant if today's exact spots differ — pixel-parity wins over formula elegance; document any deliberate ±px drift in the report).

- [ ] **Step 1:** Move WeatherWidget + QuoteWidget + BookmarksBar root positioning into PositionedBlock wrappers (`weather`, `quote`, `bookmarks` blocks). Existing tests asserting those classes move their assertions to App-level or drop to the block wrapper — keep coverage, don't delete it.
- [ ] **Step 2:** Pills: `timer`, `tasks`, `notes` blocks (pill classes to the wrapper). Panels switch to `anchorPanel`. RTL: mock `getBoundingClientRect` for the pill; assert the panel's inline left/top equals `anchorPanel`'s output for that rect.
- [ ] **Step 3:** Full suite + build + preview. Controller compares every screenshot against pre-task captures — the whole set must be visually unchanged (panels open in their usual spots).
- [ ] **Step 4: Commit + push** — `feat: peripherals adopt PositionedBlock; panels anchor to their pill` + trailer.

---

### Task 36: Arrange controller — long-press, drag, guides overlay, persistence

**Files:**
- Create: `src/lib/premium.ts`, `src/newtab/arrange/useLongPress.ts`, `src/newtab/arrange/ArrangeController.tsx`
- Modify: `src/newtab/App.tsx`
- Test: `src/newtab/arrange/useLongPress.test.ts`, `src/newtab/arrange/ArrangeController.test.tsx`

**Interfaces:**
- Consumes: `snapPosition`, `clampCenterPct` (Task 33), `PositionedBlock`'s `data-block-id` divs (Task 34/35), `useDialogEscape`, `storage.update`.
- Produces:

```ts
// src/lib/premium.ts
/** Future licensing hook: everything premium gates on this one function. */
export function isPremium(): boolean // hardcoded true today

// useLongPress.ts — document-level capture listener, no per-widget wiring
export function useLongPress(onEngage: (blockId: BlockId, e: PointerEvent) => void, opts?: { holdMs?: number; tolerancePx?: number }): void
// Attaches capture-phase pointerdown on document; a press on (a descendant of)
// [data-block-id] starts the timer; pointermove > tolerance or pointerup/cancel
// aborts; on fire it calls onEngage and installs a one-shot capture-phase click
// suppressor (stopPropagation + preventDefault) so the release never activates
// the widget. No-ops entirely when isPremium() is false.
```

`ArrangeController` (rendered last in `<main>`): owns `mode: 'off' | 'on'`, the in-flight drag (block id, live pos), and the overlay. On engage: enters mode, begins dragging the engaged block immediately (pointer capture on the overlay). While in mode: a full-viewport overlay (`fixed inset-0 z-[60]`) renders per-block outline buttons positioned over each `[data-block-id]` rect (measured on entry + on resize), the two center guide lines while active in a drag, the active snap guides (1px `bg-accent` lines), and the bottom-center pill (`Reset layout` · `Done`, panel surface classes). Pointer flow: overlay pointermove → `snapPosition` (others = all other blocks' current rects) → live-update the dragged block via inline transform on a positioned ghost — simplest correct v1: update React state each move and let `PositionedBlock` re-render from a `draftLayout` context override (drops = `storage.update('layout', merge)`; drafts never hit storage). Widgets inert: the overlay covers everything, so widget interiors can't receive events while in mode. Escape exits via `useDialogEscape(exit, mode === 'on')`; `Done` exits; drops persist immediately, so exit persists nothing extra. Reduced-motion: lift animation honors `motion-reduce`.

- [ ] **Step 1: Failing useLongPress tests** (fake timers): fires after 500ms hold on a `[data-block-id]` descendant; cancelled by 9px move; cancelled by early pointerup; click after engage is suppressed (listener sees no click); press on non-block does nothing; `isPremium()` false → never engages (mock the module).
- [ ] **Step 2–3: Fail, implement, pass.**
- [ ] **Step 4: Failing ArrangeController tests** — engage → overlay + pill render (`Done`, `Reset layout` buttons by role); Escape exits; a (mocked-rect) drag sequence pointerdown→move→up writes the expected snapped/clamped pos via `storage.update` (assert storage contents, memoryDriver); `Done` exits leaving layout persisted.
- [ ] **Step 5–6: Fail, implement, pass. Full suite + build + preview (no console errors; `newtab.png` unchanged — mode off by default).**
- [ ] **Step 7: Commit + push** — `feat: arrange mode — long-press, drag with snap guides, persistence` + trailer.

---

### Task 37: Keyboard arrange, Settings entry, reset

**Files:**
- Modify: `src/newtab/arrange/ArrangeController.tsx`, `src/settings/sections/General.tsx` (or the section file that fits — read `src/settings/sections/` and pick where layout controls belong; create `Layout.tsx` section if none fits), `src/settings/SettingsPanel.tsx` (section wiring), `src/newtab/App.tsx` (open-arrange plumbing from Settings)
- Test: `src/newtab/arrange/ArrangeController.test.tsx`, `src/settings/SettingsPanel.test.tsx` (extend)

**Interfaces:**
- Consumes: everything from Task 36.
- Produces: `ArrangeController` accepts `openSignal?: number` (nonce prop — bumping it enters mode; App wires a `requestArrange()` callback down to Settings and bumps the nonce; drawer closes first so the page is visible).

- [ ] **Step 1: Keyboard support in the overlay** — the per-block outline elements are `<button aria-label="Move {label}">` in DOM order; Tab/Shift-Tab native cycling (no trap needed beyond the overlay being the only interactive layer); Arrow keys on a focused block nudge 8px, Shift+Arrow 1px — each nudge runs through `clampCenterPct` and persists via `storage.update`; Enter or Escape exits. Failing tests first: arrow-nudge writes expected pos delta; shift-arrow 1px; labels present for all visible blocks.
- [ ] **Step 2: Settings entry + reset** — in the chosen Settings section: `Arrange layout` button (closes the drawer, then bumps the arrange nonce) and `Reset layout` with the two-step inline confirm idiom (first click arms — copy style: "Reset layout? This puts every widget back." — second click writes `storage.set('layout', {})`); both gated on `isPremium()` (hidden entirely when false — no dead buttons, per the no-placeholder rule). The arrange pill's `Reset layout` uses the same two-step confirm inside the pill. Failing tests: reset writes `{}` after two clicks, not one; buttons absent when `isPremium()` mocked false.
- [ ] **Step 3: Full suite + build + preview.**
- [ ] **Step 4: Commit + push** — `feat: keyboard arrange, settings entry, layout reset` + trailer.

---

### Task 38: Preview probes, README, wrap

**Files:**
- Modify: `scripts/preview.mjs`, `README.md`

- [ ] **Step 1: Preview probes** (real mouse, the layer jsdom can't verify) — appended after the existing captures, restoring state afterward:
  1. Long-press the clock block (`page.mouse.move` to its center, `mouse.down()`, `waitForTimeout(650)`) → assert the arrange pill appeared (`button:has-text("Done")`).
  2. Drag toward mid-left (e.g. x 400, y 450) crossing the horizontal center line slowly; screenshot `arrange-mode.png` mid-drag (outlines + guide line visible); `mouse.up()`.
  3. Click `Done`; reload; assert the clock's `[data-block-id="clock"]` rect center moved to ≈ the drop point (±16px) — print `PASS/FAIL: arrange position persisted`.
  4. Re-enter arrange (long-press), click `Reset layout` twice (two-step confirm), `Done`, reload, assert the clock is back at its default rect — print `PASS/FAIL: layout reset`.
  5. The run's earlier `newtab.png` capture (taken before these probes) remains the proof the default layout is untouched.
- [ ] **Step 2: README** — features list gains an accurate Arrange-mode line (long-press to rearrange, keyboard support, reset; no overclaims); note it stores positions locally like everything else.
- [ ] **Step 3: Full verify** — suite, build, full preview run: all existing captures visually unchanged + `arrange-mode.png` + both PASS lines; controller does the visual pass.
- [ ] **Step 4: Commit + push** — `feat: arrange mode — preview probes and docs` + trailer.

---

## Out of scope

Per-block resize, multiple saved layouts, per-monitor layouts, dnd-kit adoption, touch-specific affordances, premium licensing UI.
