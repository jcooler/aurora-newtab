# NL-P4 Docks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-created top and bottom docks: drag-to-edge drop zones in edit mode, draggable order, drag-out undocking, and strip rendering that reads as a clean status band — no visible scrollbar ever, scrolling only on true overflow with masked edge fades, local scroll only.

**Architecture:** Docking is three pure edit-session operations (`dockSelected`, `undockSelected`, and re-dock-at-index which is `dockSelected` again) — a drag that enters an edge zone docks at the pointer-derived index on drop; a drag that starts on a docked item undocks on its first move and continues as a normal free drag, which makes reorder (drop back into a zone) and undock (drop on the canvas) one mechanism. Strip mechanics live in a `useDockOverflow` hook (measured true-overflow state driving CSS masks) plus wheel/keyboard/nub scrolling that never moves the page.

**Tech Stack:** TypeScript, React, Vitest, Playwright witness. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md` §2.4 (docks), §2.5 ("dragging to the top or bottom edge offers the dock drop zone"), AC 7. Owner-insisted (kickoff): "no visible scrollbar ever; scroll only on true overflow with masked edge fades; the strip must read as a clean status band." Built on NL-P1..P3 (`238acc8`).

## Global Constraints

- **Nothing is ever docked automatically** (spec 2.4). Docking happens only by the user's drag into a zone; a dock disappears when its last widget leaves (already true: strips render only when members exist).
- **The scrollbar is never shown.** Overflow is signaled by a masked fade at the clipped edge and scrolled by wheel, trackpad, drag, and keyboard; optional subtle arrow nubs on hover at the faded edge. Dock scrolling is local and never moves the page (spec 2.4).
- **Scroll only on TRUE overflow** — the fade/scroll affordances must key on measured `scrollWidth > clientWidth`, never on static state.
- **Clicking a docked widget opens the same panel or expansion its free form offers** (spec 2.4) — docked interiors stay live in normal mode (they already are; do not regress).
- **Bookmarks follow their exemption** (spec 2.3): the full readable bar renders in the dock; no one-letter forcing.
- **Per-widget Docked-tier COMPOSITIONS are NL-P5's catalog.** NL-P4 renders docked widgets at their existing compact composition inside the slim strip; only the strip mechanics and geometry are this packet's scope.
- Exact-cancel/single-save semantics unchanged; every write remains `saveLayoutsDocument` only; the legacy `layout` key is never written; frozen boundaries untouched.
- Strict TDD; bounded commits; one bounded review + at most one fix/rereview; ledger checkpoint. Working directory `D:\DEV\Chrome plugin-aurora-2`.

## Scope decisions locked by this plan

1. **Undock tier is `'standard'`** (clamped by `resolveRenderTier` per widget), layer above every stored free layer. A docked placement stores no tier, so nothing is being discarded; remembering the pre-dock tier is an NL-P5 nicety once Docked tiers are designed (note it in the ledger).
2. **The dock zone threshold is 56 CSS px** from the top/bottom edge of the canvas surface during a drag.
3. **Insertion index = count of that dock's items whose center-x is left of the pointer** (from the live rect map). Orders are renumbered compactly (0..n-1) on every dock mutation.
4. **Drag-from-strip undocks on first move** (the one-mechanism rule above); a press-with-no-move on a docked item in edit mode still just selects it. Below the narrow floor there are no strips, so no dock interactions exist there.
5. **jsdom does not exercise the real drag geometry** (zero-size rects); the pure operations and overflow hook get unit coverage, the strip render gets component coverage, and the real drag-to-dock/reorder/undock truth belongs to the Chromium witness — the same division NL-P3 used.

---

### Task 1: Pure dock operations

**Files:**
- Modify: `src/lib/layout/editSession.ts`
- Test: `src/lib/layout/editSession.test.ts`

**Interfaces:**
- Produces:

```ts
export function dockSelected(session: EditSession, dock: DockEdge, index: number): EditSession
export function undockSelected(session: EditSession, point: { xPct: number; yPct: number }): EditSession
export function dockOrder(layout: NamedLayout, dock: DockEdge): readonly BlockId[]
```

Semantics: `dockSelected` converts the selected widget's placement (free, hidden, or already-docked) to `{ kind: 'docked', dock, order: index }`, inserting among that dock's existing members and renumbering BOTH docks' orders compactly; clamps index into [0, memberCount]; identity with no selection. `undockSelected` converts a DOCKED selected placement to `freePlacementFromPoint({ ...point, tier: 'standard', layer: maxFreeLayer + 1 + BLOCK_IDS.indexOf(id) })`; identity for non-docked. `dockOrder` lists a dock's members in order (pure helper for index math and tests). All go through `commit` (undoable, dirty-tracked, validated).

- [ ] **Step 1: Failing tests** (append to editSession.test.ts):

```ts
describe('dock operations (NL-P4)', () => {
  it('dockSelected inserts at the index and renumbers compactly', () => {
    // DOC already has bookmarks docked bottom order 0.
    let session = selectWidget(fresh(), 'clock')
    session = dockSelected(session, 'bottom', 0)
    const layout = activeDraftLayout(session)
    expect(layout.widgets.clock).toEqual({ kind: 'docked', dock: 'bottom', order: 0 })
    expect(layout.widgets.bookmarks).toEqual({ kind: 'docked', dock: 'bottom', order: 1 })
    expect(dockOrder(layout, 'bottom')).toEqual(['clock', 'bookmarks'])
    expect(session.dirty).toBe(true)
  })

  it('dockSelected moves an already-docked widget to a new index (reorder)', () => {
    let session = selectWidget(fresh(), 'clock')
    session = dockSelected(session, 'bottom', 0)
    session = selectWidget(session, 'clock')
    session = dockSelected(session, 'bottom', 2)
    expect(dockOrder(activeDraftLayout(session), 'bottom')).toEqual(['bookmarks', 'clock'])
  })

  it('dockSelected can create the top dock and clamps a wild index', () => {
    let session = selectWidget(fresh(), 'weather')
    session = dockSelected(session, 'top', 99)
    expect(activeDraftLayout(session).widgets.weather).toEqual({ kind: 'docked', dock: 'top', order: 0 })
  })

  it('undockSelected returns a docked widget to a free anchor at the drop point', () => {
    let session = selectWidget(fresh(), 'bookmarks')
    session = undockSelected(session, { xPct: 30, yPct: 60 })
    const bookmarks = activeDraftLayout(session).widgets.bookmarks as FreeWidgetPlacement
    expect(bookmarks.kind).toBe('free')
    expect(pointFromFreePlacement(bookmarks)).toEqual({ x: 30, y: 60 })
    expect(bookmarks.tier).toBe('standard')
    expect(undockSelected(selectWidget(fresh(), 'clock'), { xPct: 10, yPct: 10 }))
      .toEqual(selectWidget(fresh(), 'clock'))
  })
})
```

(Import `dockOrder`, `dockSelected`, `undockSelected` in the file's import block.)

- [ ] **Step 2: RED** — `npx vitest run src/lib/layout/editSession.test.ts`
- [ ] **Step 3: Implement** in editSession.ts. Renumbering: collect both docks' member lists in current order, splice the selected id into the target list at the clamped index (removing it from wherever it was), then write orders 0..n-1 for both lists.
- [ ] **Step 4: GREEN + tsc + hygiene.**
- [ ] **Step 5: Commit** — `feat(edit): pure dock, reorder, and undock operations`

---

### Task 2: Drag zones and dock wiring

**Files:**
- Modify: `src/newtab/edit/useCanvasDrag.ts` (zone detection), `src/newtab/App.tsx` (zone state, drop handling, docked-item drag-out), `src/newtab/canvas/CanvasItem.tsx` (docked items draggable in edit mode), `src/newtab/index.css` (zone highlight)
- Test: `src/newtab/edit/useCanvasDrag.test.tsx`, `src/lib/layout/editSession.test.ts` (drag-out composition already covered by Task 1 ops)

**Interfaces:**
- `useCanvasDrag` input gains `onZoneChange?: (zone: DockEdge | null) => void`; `onDrop` becomes `onDrop: (context: { zone: DockEdge | null; pointerX: number }) => void`; the hook computes `zone` per move: `'top'` when pointer-y (surface-local) < 56, `'bottom'` when > surfaceHeight - 56, else null; while a zone is active it still reports `onPreviewMove` (the item follows the pointer; the highlight communicates the outcome).
- App: `dragZone` state from `onZoneChange` renders `.dock-drop-zone[data-edge]` highlights; `onDrop` with a zone dispatches `dockSelected(current, zone, indexFromPointer)` where the index counts that dock's items (from `dockOrder` + the live rect map) with center-x < pointerX. CanvasItem: `onPointerDown` in editing mode extends to `item.mode === 'docked'`; App's grip/wrapper handler, when the dragged item is docked, dispatches `undockSelected` at the CURRENT pointer percent on the FIRST move (wire via a `dragStartedDockedRef`), then the normal drag continues.

- [ ] **Step 1: Failing hook tests** (append to useCanvasDrag.test.tsx):

```ts
  it('reports dock zones near the top and bottom edges and the drop context', () => {
    const { surface, rendered, onDrop } = setup()
    const onZoneChange = vi.fn()
    // re-render hook with onZoneChange included (extend setup to accept it)
    act(() => rendered.result.current.startDrag('clock', { clientX: 110, clientY: 110, pointerId: 3 }))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 20, pointerId: 3 })) })
    expect(onZoneChange).toHaveBeenLastCalledWith('top')
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 480, pointerId: 3 })) })
    expect(onZoneChange).toHaveBeenLastCalledWith('bottom')
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 250, pointerId: 3 })) })
    expect(onZoneChange).toHaveBeenLastCalledWith(null)
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 15, pointerId: 3 })) })
    act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 15, pointerId: 3 })) })
    expect(onDrop).toHaveBeenLastCalledWith({ zone: 'top', pointerX: 300 })
  })
```

(Adjust the existing two tests' `onDrop` assertions to the new context signature: `{ zone: null, pointerX: <last x> }`.)

- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement** hook zone math (surface-local y, threshold 56, tracked so `onZoneChange` fires only on change), App wiring (zone highlights, drop-to-dock dispatch, docked drag-out with first-move undock), CanvasItem docked pointerdown, and the highlight CSS:

```css
.dock-drop-zone {
  position: fixed;
  z-index: 45;
  right: 0;
  left: 0;
  height: 56px;
  border: 1px dashed color-mix(in srgb, var(--accent) 60%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  pointer-events: none;
}
.dock-drop-zone[data-edge="top"] { top: 0; }
.dock-drop-zone[data-edge="bottom"] { bottom: 0; }
```

- [ ] **Step 4: GREEN + tsc + hygiene; rerun the edit and App families.**
- [ ] **Step 5: Commit** — `feat(edit): dock drop zones with drag-out undocking`

---

### Task 3: Clean strip — hidden scrollbar, masked fades, local scroll

**Files:**
- Create: `src/newtab/edit/useDockOverflow.ts`
- Modify: `src/newtab/canvas/CanvasSurface.tsx` (strips use the hook), `src/newtab/index.css`
- Test: `src/newtab/edit/useDockOverflow.test.tsx`, `src/newtab/canvas/CanvasSurface.test.tsx` (CSS contracts)

**Interfaces:**

```ts
export interface DockOverflowState { overflowing: boolean; atStart: boolean; atEnd: boolean }
export function useDockOverflow(ref: React.RefObject<HTMLElement | null>, memberCount: number): DockOverflowState
```

Behavior: measures on mount, on `memberCount` change, on element scroll, and on window resize: `overflowing = scrollWidth > clientWidth + 1`; `atStart = scrollLeft <= 1`; `atEnd = scrollLeft >= scrollWidth - clientWidth - 1`. CanvasSurface applies to BOTH strips: `data-dock-overflow` when overflowing, `data-dock-at-start` / `data-dock-at-end`, a wheel handler (`deltaY` or `deltaX` → `scrollLeft += delta`, `preventDefault`, so dock scrolling never moves the page), a keydown handler on the nav (ArrowLeft/ArrowRight scroll by 80px when the event target is not an inner control that uses arrows), and two hover nubs (`.dock-nub[data-direction]`, `aria-hidden`, pointer-scroll by 160px) rendered only while overflowing and not at that edge.

CSS:

```css
.canvas-bottom-bar,
.canvas-top-bar {
  /* A clean status band: the scrollbar never shows (spec 2.4). */
  scrollbar-width: none;
}
.canvas-bottom-bar::-webkit-scrollbar,
.canvas-top-bar::-webkit-scrollbar {
  display: none;
}
/* True-overflow fades at the clipped edge(s) only. */
.canvas-bottom-bar[data-dock-overflow]:not([data-dock-at-end]) { mask-image: linear-gradient(to right, black calc(100% - 40px), transparent); }
.canvas-bottom-bar[data-dock-overflow]:not([data-dock-at-start]) { mask-image: linear-gradient(to right, transparent, black 40px); }
.canvas-bottom-bar[data-dock-overflow]:not([data-dock-at-start]):not([data-dock-at-end]) { mask-image: linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent); }
/* (Same three rules for .canvas-top-bar.) */
.dock-nub {
  position: absolute;
  top: 50%;
  z-index: 1;
  display: flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid var(--control-border);
  background: var(--panel-solid);
  color: var(--fg-muted);
  translate: 0 -50%;
  opacity: 0;
  transition: opacity 120ms ease;
}
.canvas-bottom-bar:hover .dock-nub, .canvas-top-bar:hover .dock-nub { opacity: 1; }
.dock-nub[data-direction="start"] { left: 2px; }
.dock-nub[data-direction="end"] { right: 2px; }
@media (prefers-reduced-motion: reduce) { .dock-nub { transition: none; } }
```

Note the strips need `position: fixed` + mask — nubs must live INSIDE the scrolling element's parent: wrap each strip's items in an inner scroller (`.dock-scroller`) so the nav stays the positioning context and the MASK applies to the scroller, not the nubs. Restructure: `nav.canvas-bottom-bar > div.dock-scroller (overflow-x: auto, masked) > items`, nubs as nav children. Move the overflow/gap/scroll CSS from the nav to `.dock-scroller`; the nav keeps position/translate/max-width. Update the two CSS-contract tests that pin `.canvas-bottom-bar .canvas-item { container-type: normal; width: max-content; }` to the scroller-scoped selector `.dock-scroller .canvas-item` (one rule can serve both strips after this).

- [ ] **Step 1: Failing tests.** Hook test with a fake element (mock scrollWidth/clientWidth/scrollLeft getters, dispatch `scroll` events): overflowing flips on metrics; atStart/atEnd track scrollLeft; re-measures on memberCount change. CanvasSurface CSS contracts: `scrollbar-width: none` on both strips' scroller, the three mask rules per strip, and a render assertion that a strip with members gets the scroller + (mock overflow via defineProperty) `data-dock-overflow`.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: GREEN + tsc + hygiene; rerun canvas + App families (the strip restructure must not break the docked-strip tests — update selectors, not semantics).**
- [ ] **Step 5: Commit** — `feat(canvas): clean dock strips with true-overflow fades and local scroll`

---

### Task 4: Chromium witness

**Files:**
- Create: `scripts/preview-nl-p4.mjs` (clone preview-nl-p3.mjs scaffolding; dirs `.preview-nl-p4-*`; add the three entries to `.gitignore` in this task)

**Stages (1600x900 unless noted; per-capture usefulness judgment):**
1. **Create by drag:** edit session → drag Clock into the top 56px → zone highlight capture → drop → Clock renders in the top strip; Save → stored `{ kind: 'docked', dock: 'top', order: 0 }`; reload persists.
2. **Reorder by drag:** seed a stored document with three bottom-docked launchers (timer/tasks/notes) → edit → drag the middle one left past the first → drop in the bottom zone → Save → orders `[tasks, timer, notes]` → the strip renders in the new order.
3. **Undock by drag:** drag a docked item from the strip onto the canvas center → it renders anchored at the drop point; the dock with remaining members stays; empty docks disappear (drag the LAST top item out → no top strip).
4. **Clean overflow at 900x600:** seed a document with 8+ bottom-docked widgets → `scrollWidth > clientWidth` true → assert: no scrollbar box (`offsetHeight === clientHeight` on the scroller AND computed `scrollbar-width: none`); `data-dock-overflow` present with an end-side fade (computed mask-image non-none); `dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }))` on the scroller increases `scrollLeft` while `window.scrollY` stays 0; scrolled to the end → `data-dock-at-end` and the mask flips to the start side; with few members → NO `data-dock-overflow` and NO mask (scroll only on true overflow).
5. **Docked click still works:** normal mode, click the docked Tasks launcher → its panel opens (same as free form; spec 2.4).
6. Whole-run write log (armed across reloads): only `layouts`; zero runtime errors/failed requests; PNGs inspected individually.

- [ ] **Step 1:** Write and run `node scripts/preview-nl-p4.mjs` → `PASS: NL-P4 docks`; fix genuine failures with focused RED/GREEN; one rerun allowed.
- [ ] **Step 2:** Inspect every PNG at original resolution (A2-D060 usefulness bar: the strip must READ as a clean status band).
- [ ] **Step 3:** Commit — `test(canvas): focused NL-P4 docks Chromium witness`

---

### Task 5: Gate, review, ledger, checkpoint

- [ ] **Step 1: Focused gate** — `npx vitest run src/lib/layout src/newtab/edit src/newtab/canvas src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx` + `npx tsc --noEmit` + `git diff --check` + one `npm run build` (record modules). No canonical harness.
- [ ] **Step 2: Bounded review** (one review + at most one fix/rereview). Reviewer verifies: nothing docks automatically (only the drop-zone path dispatches `dockSelected`); the scrollbar is structurally unshowable; fades key on measured overflow only; wheel scroll is local; docked interiors stay live in normal mode; Bookmarks unforced; the compact-composition-in-strip interim is ledgered for NL-P5; exact-cancel/save and layouts-only writes hold through dock edits.
- [ ] **Step 3: Ledger** — STATUS: Last verified → NL-P4, Current → NL-P5 tier catalog (owner-gated, batch-reviewed); NL-P4 evidence bullet with counts, witness stages, review outcome, and the undock-tier note.
- [ ] **Step 4: Checkpoint** — `docs: checkpoint NL-P4 docks`, push, repository proof (protected still `eb1354b`).

---

## Self-review notes

- **Spec 2.4 coverage:** dock per edge, created by drag, disappears when empty — Tasks 1/2 + witness 1/3; slim row — existing strip CSS + Task 3 restructure; draggable order — Tasks 1/2 + witness 2; docked click opens the same panel — witness 5 (no code change needed, guarded against regression); overflow contract — Task 3 + witness 4; nothing automatic — review checklist + only-path-in-code proof.
- **AC7 fully covered** (no visible scrollbar ever, true-overflow-only scrolling, masked fades, local scroll).
- **Type consistency:** `dockSelected(session, dock, index)` / `undockSelected(session, point)` / `dockOrder(layout, dock)` consistent across Tasks 1-2; `onDrop({ zone, pointerX })` consistent between hook and App; `useDockOverflow(ref, memberCount)` consistent between Tasks 3 and its tests.
- **Known risk:** the strip restructure (inner `.dock-scroller`) touches selectors that NL-P2/P3 tests pin — the plan names the exact updates; treat any OTHER breakage as a defect to fix, not a test to update.
