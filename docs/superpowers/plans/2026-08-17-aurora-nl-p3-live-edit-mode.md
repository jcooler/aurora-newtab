# NL-P3 Live Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editing happens on the real page: hover grips and gears in normal use, a draft-based edit session with drag/keyboard movement, snapping and guides, a floating inspector (tier, layer, hide, restore), a slim toolbar (switcher, bulk tier, Undo, Reset, Cancel, Save), expansion footprints, touch long-press, the layout-switcher badge, and full layout management in Settings.

**Architecture:** A pure edit-session model (`editSession.ts`) holds a baseline snapshot and a draft `LayoutsDocument`; every mutation is a pure function with an undo stack, and the ONLY write is `saveLayoutsDocument(storage, session.draft)` on explicit Save — which is also the moment the in-memory "My layout" first materializes. Rendering reuses NL-P2's `planLayoutRender` on the draft during a session. Pointer editing reuses the retained `canvasSnap` (8px grid, magnetic guides, clamping) in pixel space, converting the drop point back to anchor+offset percent via `freePlacementFromPoint`. A new `{ kind: 'hidden' }` placement records per-layout hide without losing membership.

**Tech Stack:** TypeScript, React, Vitest, Playwright witness. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md` §2.1 (controls, switcher, management), §2.5 (live edit mode), §2.6 (expansion footprints), §6 AC 1/4/5/6/9. NL-P1 foundation (`1441704`), NL-P2 rendering (`7023045`).

## Global Constraints

- **Explicit-save and exact recovery semantics are unchanged from Canvas V3** (spec 2.5): Escape cancels the session exactly; Save commits the whole draft once; a discarded session leaves storage byte-identical.
- **Plain clicks never paint a selection ring in normal use** (spec 2.5); selection chrome is edit-mode only; outlines trace real content bounds tightly (the content-tight wrapper IS the content rect, so `outline` on `.canvas-item--selected` is accurate by construction).
- **Expandable widgets show a dashed expanded-footprint outline in edit mode and are never placement-restricted** (spec 2.6).
- **Nothing is ever docked automatically** (spec 2.4). Dock drop zones ("dragging to the top or bottom edge offers the dock drop zone") are NL-P4's deliverable and are OUT of this packet; NL-P3 drags clamp inside the surface.
- **The legacy `layout` key is never written.** The only new write path is `saveLayoutsDocument` (validated, single-key) plus the switcher's explicit layout switches — all user actions.
- **Overlap remains legal, warned about while editing, never silently corrected** (spec 2.2): the inspector shows a passive overlap note when the selected widget's rect intersects a sibling; nothing moves automatically.
- **Retained machinery is reused, not reinvented:** `canvasSnap.ts` (snapCanvasPosition, canvasKeyboardDelta, clampCanvasTopLeft), `useLongPress.ts` (document-level, premium-gated, interactive-element-safe), `anchorPanel` (inspector positioning), `dialogStack.closeAllDialogs` (mode entry), `isPremium()` gates every entry point.
- **Frozen boundaries untouched**; working directory `D:\DEV\Chrome plugin-aurora-2`; strict TDD; bounded commits; one bounded review + at most one fix/rereview; ledger checkpoint at the end.

## Scope decisions locked by this plan

1. **Hidden is a placement kind, not a membership deletion.** `{ kind: 'hidden' }` in `NamedLayout.widgets` means "enabled globally, not shown in this layout" — distinct from "absent" (never placed → designed default slot). This keeps NL-P2's enabled-but-unplaced default rule intact while making Hide durable. The document version stays 1 (additive union member; NL-P1 validation learns the new kind).
2. **Save persists placements from the draft, never from derived render output** (the NL-P2 review's layer guidance): the session materializes absent-but-enabled widgets into the draft ONCE at session start using `defaultFreePlacement(id, maxLayer + 1 + BLOCK_IDS.indexOf(id))`, so what the user sees, edits, and saves are the same stored values.
3. **Mid-session layout switching is blocked while dirty:** the toolbar switcher is disabled with the title `Save or cancel your changes first` when `session.dirty`; switching a clean session re-begins on the other layout. No auto-save, no prompt, no data loss.
4. **The keyboard command to enter edit mode is `Ctrl/Cmd+Shift+E`**, registered on `window` like the palette's Ctrl+K, gated on `isPremium()` and suppressed while Settings/palette/tray dialogs are open (`dialogStack` depth > 0) or a text input has focus.
5. **"New layout" from the badge creates and switches in one explicit action:** `createLayout` with id `crypto.randomUUID()` and name `Layout N` (N = count + 1), then `switchActiveLayout`, then one `saveLayoutsDocument`. Rename lives in Settings management.
6. **The gear deep-links Settings:** connector-backed widgets open the Connectors tab; everything else opens the Widgets tab; the target row/card scrolls into view and receives focus via a `data-settings-anchor="<blockId>"` attribute.
7. **Weather's expansion footprint is a declared nominal box** on its registry source (`expandedFootprint: { width: 352, height: 430 }` — the details panel's 22rem width and its typical clamped height), rendered as a dashed outline anchored the same way the real panel opens (toward available space). It is advisory chrome, not geometry authority.

---

### Task 1: Hidden placement kind

**Files:**
- Modify: `src/lib/layout/namedLayouts.ts` (union + validation)
- Modify: `src/lib/layout/renderLayout.ts` (skip hidden)
- Test: `src/lib/layout/namedLayouts.test.ts`, `src/lib/layout/renderLayout.test.ts`, `src/lib/backup.test.ts`

**Interfaces:**
- Produces: `export interface HiddenWidgetPlacement { kind: 'hidden' }`; `NamedLayoutPlacement` becomes `FreeWidgetPlacement | DockedWidgetPlacement | HiddenWidgetPlacement`. `planLayoutRender` never emits an item for a hidden widget (and does NOT fall through to the default slot).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/layout/namedLayouts.test.ts` inside the `cleanLayoutsDocument` describe:

```ts
  it('accepts the hidden placement kind and rejects extra members on it', () => {
    const doc = validDocument()
    ;(doc.layouts[0].widgets as Record<string, unknown>).notes = { kind: 'hidden' }
    expect(cleanLayoutsDocument(doc).layouts[0].widgets.notes).toEqual({ kind: 'hidden' })
    ;(doc.layouts[0].widgets as Record<string, unknown>).notes = { kind: 'hidden', layer: 3 }
    expect(cleanLayoutsDocument(doc).layouts[0].widgets.notes).toEqual({ kind: 'hidden' })
  })
```

Append to `src/lib/layout/renderLayout.test.ts`:

```ts
  it('renders nothing for a hidden widget — and never re-adds it through the default slot', () => {
    const withHidden: NamedLayout = {
      ...LAYOUT,
      widgets: { ...LAYOUT.widgets, notes: { kind: 'hidden' } },
    }
    const plan = planLayoutRender(withHidden, [...ENABLED], 1408)
    expect(plan.items.some((item) => item.id === 'notes')).toBe(false)
    const narrow = planLayoutRender(withHidden, [...ENABLED], 599)
    expect(narrow.items.some((item) => item.id === 'notes')).toBe(false)
  })
```

Append to `src/lib/backup.test.ts` layouts describe: a document containing `{ kind: 'hidden' }` round-trips through `serializeBackup`/`prepareBackup` exactly.

```ts
  it('round-trips a hidden placement', () => {
    const withHidden = structuredClone(document) as { layouts: { widgets: Record<string, unknown> }[] }
    withHidden.layouts[0].widgets.notes = { kind: 'hidden' }
    const prepared = prepareBackup(serializeBackup({ ...defaults(), layouts: withHidden as unknown as AuroraData['layouts'] }))
    expect(prepared.ok).toBe(true)
    if (prepared.ok) expect((prepared.data.layouts as { layouts: { widgets: Record<string, unknown> }[] }).layouts[0].widgets.notes).toEqual({ kind: 'hidden' })
  })
```

- [ ] **Step 2: Run to observe RED** — `npx vitest run src/lib/layout/namedLayouts.test.ts src/lib/layout/renderLayout.test.ts src/lib/backup.test.ts`

- [ ] **Step 3: Implement**

`namedLayouts.ts`: add

```ts
export interface HiddenWidgetPlacement { kind: 'hidden' }
```

extend `NamedLayoutPlacement`, add

```ts
function isHiddenPlacement(value: unknown): value is HiddenWidgetPlacement {
  return isPlainObject(value) && value.kind === 'hidden'
}
```

and in `cleanNamedLayout` accept it, cloning canonically: `if (isHiddenPlacement(placement)) { widgets[id] = { kind: 'hidden' }; continue }` (before the reject branch).

`renderLayout.ts`: in the first loop, `if (placement.kind === 'hidden') continue` — placing it BEFORE the docked branch, and note the widget is deliberately not fed to the default-slot loop (it has a placement, so `layout.widgets[id]` is truthy there already — verify that loop keys on presence, which it does).

- [ ] **Step 4: GREEN, TypeScript, hygiene** — same vitest command; `npx tsc --noEmit`; `git diff --check`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(layouts): hidden placement kind for per-layout hide"`

---

### Task 2: Pure edit-session model

**Files:**
- Create: `src/lib/layout/editSession.ts`
- Test: `src/lib/layout/editSession.test.ts`

**Interfaces:**
- Consumes: `LayoutsDocument`, `NamedLayout`, `WidgetTier`, `freePlacementFromPoint`, `cleanLayoutsDocument` from `./namedLayouts`; `defaultFreePlacement` from `./defaultPlacements`; `BLOCK_IDS`, `BlockId` from `./types`.
- Produces (Task 4–6 consume):

```ts
export interface EditSession {
  baseline: LayoutsDocument
  draft: LayoutsDocument
  selectedId: BlockId | null
  past: readonly LayoutsDocument[]
  dirty: boolean
}
export function beginEditSession(document: LayoutsDocument, enabledIds: readonly BlockId[]): EditSession
export function activeDraftLayout(session: EditSession): NamedLayout
export function selectWidget(session: EditSession, id: BlockId | null): EditSession
export function moveSelected(session: EditSession, point: { xPct: number; yPct: number }): EditSession
export function nudgeSelected(session: EditSession, delta: { xPct: number; yPct: number }): EditSession
export function setSelectedTier(session: EditSession, tier: WidgetTier): EditSession
export function stepSelectedLayer(session: EditSession, direction: 'forward' | 'backward'): EditSession
export function hideSelected(session: EditSession): EditSession
export function restoreSelectedDefaults(session: EditSession): EditSession
export function applyBulkTier(session: EditSession, tier: WidgetTier): EditSession
export function undo(session: EditSession): EditSession
export function resetSession(session: EditSession): EditSession
```

Semantics: `beginEditSession` deep-snapshots the document as `baseline`, then materializes every enabled-but-absent widget into the active draft layout with `defaultFreePlacement(id, maxLayer + 1 + BLOCK_IDS.indexOf(id))` (scope decision 2) — this materialization is part of the INITIAL draft and is NOT dirty by itself. Every mutating operation pushes the prior draft onto `past` (cap 50), sets `dirty: true`, and returns a new session; operations on a docked/hidden/unselected widget where they don't apply are identity (`setSelectedTier` on docked → identity; `moveSelected` with no selection → identity). `moveSelected` re-anchors via `freePlacementFromPoint` keeping tier/layer. `nudgeSelected` adds percent deltas to the reconstructed point then re-anchors. `stepSelectedLayer` swaps the selected widget's layer with the nearest free sibling above/below (deterministic; identity at the extremes). `hideSelected` sets `{ kind: 'hidden' }` and clears the selection. `restoreSelectedDefaults` sets `defaultFreePlacement(id, currentLayerOrDefault)`. `applyBulkTier` sets every FREE placement's tier in the active layout and `bulkTier` on the layout (spec AC9: bulk re-baselines; later per-widget tiers survive until the next bulk). `undo` pops `past` (selection preserved if still visible); `dirty` recomputes as `draft !== baseline` structural inequality. `resetSession` restores `draft = baseline` with one undo entry. Every returned draft passes `cleanLayoutsDocument`.

- [ ] **Step 1: Write the failing tests** — `src/lib/layout/editSession.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  activeDraftLayout,
  applyBulkTier,
  beginEditSession,
  hideSelected,
  moveSelected,
  nudgeSelected,
  resetSession,
  restoreSelectedDefaults,
  selectWidget,
  setSelectedTier,
  stepSelectedLayer,
  undo,
} from './editSession'
import { pointFromFreePlacement, type FreeWidgetPlacement, type LayoutsDocument } from './namedLayouts'

const DOC: LayoutsDocument = {
  version: 1,
  activeLayoutId: 'a',
  layouts: [{
    id: 'a',
    name: 'Desktop',
    widgets: {
      clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -26, tier: 'full', layer: 0 },
      weather: { kind: 'free', anchor: 'top-right', offsetX: -7, offsetY: 13, tier: 'standard', layer: 1 },
      bookmarks: { kind: 'docked', dock: 'bottom', order: 0 },
    },
  }],
}

const ENABLED = ['clock', 'weather', 'bookmarks', 'notes'] as const

function fresh() {
  return beginEditSession(structuredClone(DOC), [...ENABLED])
}

describe('beginEditSession', () => {
  it('snapshots the baseline exactly and materializes enabled-but-absent widgets without dirtying', () => {
    const session = fresh()
    expect(session.baseline).toEqual(DOC)
    expect(session.dirty).toBe(false)
    const notes = activeDraftLayout(session).widgets.notes as FreeWidgetPlacement
    expect(pointFromFreePlacement(notes)).toEqual({ x: 7, y: 91 })
    expect(notes.layer).toBe(1 + 1 + 11) // maxLayer(1) + 1 + BLOCK_IDS.indexOf('notes')
  })
})

describe('move, nudge, tier, layer', () => {
  it('moveSelected re-anchors to the dropped point exactly and marks dirty with one undo step', () => {
    let session = selectWidget(fresh(), 'clock')
    session = moveSelected(session, { xPct: 12.5, yPct: 80 })
    const clock = activeDraftLayout(session).widgets.clock as FreeWidgetPlacement
    expect(pointFromFreePlacement(clock)).toEqual({ x: 12.5, y: 80 })
    expect(clock.tier).toBe('full')
    expect(session.dirty).toBe(true)
    expect(session.past).toHaveLength(1)
    expect(undo(session).dirty).toBe(false)
  })

  it('nudgeSelected moves by percent deltas and is identity without a selection', () => {
    let session = selectWidget(fresh(), 'weather')
    session = nudgeSelected(session, { xPct: -1, yPct: 2 })
    const weather = activeDraftLayout(session).widgets.weather as FreeWidgetPlacement
    expect(pointFromFreePlacement(weather)).toEqual({ x: 92, y: 15 })
    expect(nudgeSelected(fresh(), { xPct: 5, yPct: 5 })).toEqual(fresh())
  })

  it('setSelectedTier changes only the selected free tier; docked selection is identity', () => {
    let session = selectWidget(fresh(), 'weather')
    session = setSelectedTier(session, 'full')
    expect((activeDraftLayout(session).widgets.weather as FreeWidgetPlacement).tier).toBe('full')
    const docked = setSelectedTier(selectWidget(fresh(), 'bookmarks'), 'full')
    expect(activeDraftLayout(docked).widgets.bookmarks).toEqual({ kind: 'docked', dock: 'bottom', order: 0 })
  })

  it('stepSelectedLayer swaps with the nearest free sibling and is identity at the extreme', () => {
    let session = selectWidget(fresh(), 'clock')
    session = stepSelectedLayer(session, 'forward')
    expect((activeDraftLayout(session).widgets.clock as FreeWidgetPlacement).layer).toBe(1)
    expect((activeDraftLayout(session).widgets.weather as FreeWidgetPlacement).layer).toBe(0)
    const top = stepSelectedLayer(session, 'forward')
    // clock is now above weather; notes sits far above — swap continues upward
    expect((activeDraftLayout(top).widgets.clock as FreeWidgetPlacement).layer)
      .toBe((activeDraftLayout(session).widgets.notes as FreeWidgetPlacement).layer)
  })
})

describe('hide, restore, bulk, reset', () => {
  it('hideSelected records the hidden kind and clears the selection', () => {
    const session = hideSelected(selectWidget(fresh(), 'weather'))
    expect(activeDraftLayout(session).widgets.weather).toEqual({ kind: 'hidden' })
    expect(session.selectedId).toBeNull()
  })

  it('restoreSelectedDefaults returns the designed slot', () => {
    let session = selectWidget(fresh(), 'weather')
    session = moveSelected(session, { xPct: 10, yPct: 10 })
    session = restoreSelectedDefaults(session)
    const weather = activeDraftLayout(session).widgets.weather as FreeWidgetPlacement
    expect(pointFromFreePlacement(weather)).toEqual({ x: 93, y: 13 })
  })

  it('applyBulkTier sets every free tier, records bulkTier, and leaves docked/hidden untouched (AC9)', () => {
    let session = hideSelected(selectWidget(fresh(), 'notes'))
    session = applyBulkTier(session, 'compact')
    const layout = activeDraftLayout(session)
    expect((layout.widgets.clock as FreeWidgetPlacement).tier).toBe('compact')
    expect((layout.widgets.weather as FreeWidgetPlacement).tier).toBe('compact')
    expect(layout.widgets.bookmarks).toEqual({ kind: 'docked', dock: 'bottom', order: 0 })
    expect(layout.widgets.notes).toEqual({ kind: 'hidden' })
    expect(layout.bulkTier).toBe('compact')
    // a later per-widget tier survives until bulk re-baselines (AC9)
    session = setSelectedTier(selectWidget(session, 'clock'), 'full')
    expect((activeDraftLayout(session).widgets.clock as FreeWidgetPlacement).tier).toBe('full')
    session = applyBulkTier(session, 'standard')
    expect((activeDraftLayout(session).widgets.clock as FreeWidgetPlacement).tier).toBe('standard')
  })

  it('resetSession restores the baseline as one undoable step and never mutates inputs', () => {
    const original = structuredClone(DOC)
    let session = selectWidget(fresh(), 'clock')
    session = moveSelected(session, { xPct: 20, yPct: 20 })
    session = resetSession(session)
    expect(session.draft).toEqual(session.baseline)
    expect(session.dirty).toBe(false)
    expect(undo(session).dirty).toBe(true)
    expect(DOC).toEqual(original)
  })
})
```

- [ ] **Step 2: RED** — `npx vitest run src/lib/layout/editSession.test.ts`
- [ ] **Step 3: Implement `editSession.ts`** per the semantics block above. Layer swap: collect free placements sorted by layer; find the selected index; swap layer values with the neighbor in the given direction; identity if none. Dirty: `!structurallyEqual(draft, baseline)` — implement a local `deepEqual` via `JSON.stringify` on canonically-cleaned documents (cleanLayoutsDocument produces stable key order from BLOCK_IDS iteration, so stringify equality is sound here; state that in a comment).
- [ ] **Step 4: GREEN + tsc + hygiene**
- [ ] **Step 5: Commit** — `feat(layouts): pure edit-session draft model`

---

### Task 3: Hover chrome (grip + gear) and the Settings deep link

**Files:**
- Modify: `src/newtab/canvas/CanvasItem.tsx` (hover controls in normal mode), `src/newtab/canvas/CanvasSurface.tsx` (thread callbacks), `src/newtab/App.tsx` (open Settings focused), `src/settings/SettingsPanel.tsx` (`focusWidget` prop), `src/settings/sections/Widgets.tsx` + `src/settings/sections/Connectors.tsx` (`data-settings-anchor` attributes), `src/newtab/index.css` (chrome styles)
- Test: `src/newtab/canvas/CanvasItem.test.tsx`, `src/newtab/App.test.tsx`, `src/settings/SettingsPanel.test.tsx`

**Interfaces:**
- `CanvasItem` new optional props: `onGripPointerDown?: (id: BlockId, e: React.PointerEvent) => void`, `onGearClick?: (id: BlockId) => void`, `chrome?: 'normal' | 'editing' | 'none'` (default `'none'` keeps strips/stack chrome-free).
- `SettingsPanel` new optional prop: `focusWidget?: { id: BlockId; nonce: number } | null` — on nonce change, selects the right tab (`connectors` for connector-backed ids when premium, else `widgets`) and scrolls/focuses `[data-settings-anchor="<id>"]`.
- App: `openSettingsForWidget(id)` sets `focusWidget` with an incremented nonce and opens the drawer through the existing `requestSettingsOpen` guard path.

- [ ] **Step 1: Failing tests.** CanvasItem: `chrome="normal"` renders two buttons with accessible names `Move <label>` and `<label> settings`, absent when `chrome` is omitted, and `onGearClick` fires with the id; the grip button forwards pointerdown. App: clicking the Clock's gear opens the Settings drawer with the Widgets tab active and focus inside `[data-settings-anchor="clock"]`; a connector widget's gear (seed a configured github) lands on the Connectors tab card. SettingsPanel: setting `focusWidget={{ id: 'weather', nonce: 1 }}` activates the Widgets tab and moves focus to the anchor row.

Concrete test bodies follow the files' existing idioms (`renderApp`, `renderPanel`); assertions:

```ts
// CanvasItem.test.tsx
expect(screen.getByRole('button', { name: 'Move Clock' })).toBeTruthy()
expect(screen.getByRole('button', { name: 'Clock settings' })).toBeTruthy()
// App.test.tsx
fireEvent.click(within(canvasItem('clock')).getByRole('button', { name: 'Clock settings' }))
expect(await screen.findByRole('tab', { name: 'Widgets', selected: true })).toBeTruthy()
expect(document.activeElement?.closest('[data-settings-anchor="clock"]')).toBeTruthy()
```

- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.** CanvasItem renders, inside the wrapper AFTER the WidgetBoundary, a `.canvas-item-chrome` group with the grip (`aria-label={`Move ${entry.label}`}`, `onPointerDown`) and gear (`aria-label={`${entry.label} settings`}`); CSS fades it in on `.canvas-item:hover` and `:focus-within` (opacity transition, `motion-reduce` safe), pointer-events enabled only on the buttons. App threads `chrome="normal"` for anchored items when not editing, `openSettingsForWidget` via gear; SettingsPanel effect on `focusWidget.nonce` sets the tab and `requestAnimationFrame`s `element.scrollIntoView({ block: 'center' })` + `focus()` on the anchor (anchors: the Widgets toggle row wrapper per widget id; the Connectors card wrapper per connector id — add `data-settings-anchor` + `tabIndex={-1}`).
- [ ] **Step 4: GREEN + tsc + hygiene.** Also rerun `src/newtab/canvas` and `src/newtab/App.test.tsx` whole-file.
- [ ] **Step 5: Commit** — `feat(edit): hover grip and gear with Settings deep link`

---

### Task 4: Edit session hook, toolbar, and exact Cancel/Save

**Files:**
- Create: `src/newtab/edit/useEditMode.ts`, `src/newtab/edit/EditToolbar.tsx`
- Modify: `src/newtab/App.tsx` (session state, dim/inert, keyboard entry, badge entry point placeholder for Task 7), `src/newtab/canvas/CanvasSurface.tsx` + `CanvasItem.tsx` (editing chrome: hairline hover, selected outline, interior inert), `src/newtab/index.css`
- Test: `src/newtab/edit/useEditMode.test.tsx`, `src/newtab/App.test.tsx`

**Interfaces:**

```ts
// useEditMode.ts
export interface EditModeApi {
  session: EditSession | null
  begin: (invoker?: HTMLElement | null) => void
  select: (id: BlockId | null) => void
  dispatch: (updater: (session: EditSession) => EditSession) => void
  cancel: () => void
  save: () => Promise<void>
}
export function useEditMode(input: {
  document: LayoutsDocument | null
  enabledIds: readonly BlockId[]
  storage: AuroraStorage
}): EditModeApi
```

Behavior: `begin` runs `closeAllDialogs()` then `beginEditSession`; `save` validates and calls `saveLayoutsDocument(storage, session.draft)` once, ends the session, restores invoker focus; `cancel` ends the session with NO write (exact cancel — assert storage untouched); Escape cancels (registered on the shared dialog stack so it is exact and topmost-dialog-safe); arrow keys nudge the selection (8px → percent conversion happens in App where the surface size is known: `xPct = 8 / surfaceWidth * 100`, `fine` 1px with Shift, via `canvasKeyboardDelta`); while a session is live, App renders `CanvasSurface` from `activeDraftLayout(session)`, sets `data-editing` on `<main>`, dims the page (`.aurora-canvas[data-editing] .canvas-legibility-layer` darkens or a dedicated scrim div), and widget interiors become inert (`CanvasItem` sets `inert` on the WidgetBoundary wrapper when `chrome="editing"`; the wrapper itself becomes the selectable target: `role="button"`, `tabIndex=0`, `aria-pressed` for selection, click selects, never activates the widget).

`EditToolbar` (fixed, slim, top-center; `role="toolbar"`, label `Edit layout`): layout switcher `<select>` (disabled while dirty, title per scope decision 3), bulk tier control (three buttons Compact/Standard/Full → `applyBulkTier`), `Undo` (disabled when `past` empty), `Reset`, `Cancel`, `Save` (the only committing control).

- [ ] **Step 1: Failing tests.** Hook test (renderHook with memory storage): begin→dispatch(moveSelected)→save writes exactly one `layouts` key (write-spy like NL-P1's) and ends the session; cancel after edits writes nothing and storage equals the pre-session bytes; Escape path via returned cancel. App tests: entering edit (call the exposed begin via the grip pointerdown from Task 3's button) dims the page (`main` has `data-editing`), widget interiors are inert, clicking a widget selects it (`aria-pressed="true"`, `.canvas-item--selected` class) and never triggers widget action; Cancel restores the exact pre-session render (positions byte-equal); Save persists and the next render reads the stored document; toolbar Undo/Reset behave; bulk tier updates every free widget's `data-canvas-size`.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement** hook + toolbar + App wiring + CSS (`.canvas-item--editing` hairline on hover: `outline: 1px solid color-mix(in srgb, var(--accent) 55%, transparent)`; `.canvas-item--selected`: `outline: 2px solid var(--accent); outline-offset: 2px;` — edit-mode only classes, never applied without a session; scrim: `[data-editing] .edit-scrim { position: fixed; inset: 0; background: rgb(0 0 0 / 0.25); pointer-events: none; }`).
- [ ] **Step 4: GREEN + tsc + hygiene; rerun App + canvas families.**
- [ ] **Step 5: Commit** — `feat(edit): live edit session with toolbar, exact cancel, and single save`

---

### Task 5: Pointer drag with snapping, guides, and long-press entry

**Files:**
- Create: `src/newtab/edit/useCanvasDrag.ts`, `src/newtab/edit/GuideOverlay.tsx`
- Modify: `src/newtab/App.tsx` (wire drag + long-press), `src/newtab/index.css` (guide lines)
- Test: `src/newtab/edit/useCanvasDrag.test.tsx`, `src/newtab/App.test.tsx`

**Interfaces:**

```ts
export interface CanvasDragApi {
  dragging: BlockId | null
  guides: readonly CanvasGuide[]
  startDrag: (id: BlockId, e: { clientX: number; clientY: number; pointerId: number; target: Element }) => void
}
export function useCanvasDrag(input: {
  surfaceRef: React.RefObject<HTMLElement | null>
  itemRects: ReadonlyMap<BlockId, DOMRectReadOnly>   // from CanvasSurface onItemGeometryChange
  onPreviewMove: (id: BlockId, point: { xPct: number; yPct: number }) => void  // dispatch(moveSelected) after select
  onDrop: () => void
}): CanvasDragApi
```

Drag mechanics: `startDrag` captures the pointer on the surface (`setPointerCapture`), records the pointer offset inside the item rect, and on every `pointermove` computes `snapCanvasPosition({ pointer, pointerOffset, box: itemRect, bounds: surfaceRect(inset 8), neighbors: other item rects, grid: 8, magneticThreshold: 6 })`, converts the snapped top-left to a CENTER percent (`xPct = (left + box.width / 2) / surfaceW * 100`), and calls `onPreviewMove` (one undo entry per drag: App wraps the first move of a drag in `dispatch(moveSelected)` and subsequent moves in a non-pushing variant — add `moveSelectedLive` to `editSession.ts`: identical to `moveSelected` but reuses the current undo entry; test it in the Task 2 file as part of this task's RED). `pointerup` releases capture and fires `onDrop` (clears guides). Guides render as absolutely positioned 1px lines in `GuideOverlay` (`.edit-guide[data-axis]`, accent color, pointer-events none). Grip pointerdown (Task 3) begins the session if none and immediately starts the drag; `useLongPress` engages the same path on touch (entry per spec 2.5); dragging never leaves the surface bounds (clamp is inside snapCanvasPosition).

- [ ] **Step 1: Failing tests.** `moveSelectedLive` semantics in editSession.test.ts (no extra undo entry). Hook test with a fake surface/rect map: startDrag + two synthetic pointermoves produce snapped percent calls (grid multiples at the fake sizes) and guides when aligned with a neighbor center; pointerup fires onDrop. App test: pointerdown on the grip, pointermove, pointerup moves the widget (style.left changed to a grid-snapped percent) with ONE undo entry; Escape after the drag still exact-cancels to baseline.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: GREEN + tsc + hygiene.**
- [ ] **Step 5: Commit** — `feat(edit): pointer drag with grid snap, magnetic guides, and long-press entry`

---

### Task 6: Floating inspector and expansion footprints

**Files:**
- Create: `src/newtab/edit/WidgetInspector.tsx`
- Modify: `src/newtab/widgetRegistry.ts` + `src/newtab/widgetSizeContracts.ts` (declare `expandedFootprint` for weather), `src/newtab/App.tsx`, `src/newtab/canvas/CanvasItem.tsx` (footprint outline), `src/newtab/index.css`
- Test: `src/newtab/edit/WidgetInspector.test.tsx`, `src/newtab/App.test.tsx`, `src/newtab/widgetRegistry.test.ts`

**Interfaces:**
- Registry: `WidgetRegistryEntry.expandedFootprint?: { width: number; height: number }` — weather declares `{ width: 352, height: 430 }` (spec 2.6, scope decision 7).
- `WidgetInspector` props: `{ entry: WidgetRegistryEntry; placement: NamedLayoutPlacement; anchorRect: DOMRectReadOnly; overlapIds: readonly BlockId[]; onTier: (tier: WidgetTier) => void; onLayer: (direction: 'forward' | 'backward') => void; onHide: () => void; onRestore: () => void }` — positioned beside the selection via `anchorPanel(anchorRect, { w: 240, h: 260 }, viewport)`; `role="dialog"` non-modal, label `<label> inspector`; tier radios limited to `entry.canvasSizes`; a passive overlap note (`Overlaps <labels>` styled as text, no control) when `overlapIds` is non-empty.
- CanvasItem: when `chrome="editing"` and the entry has `expandedFootprint`, render a `.canvas-item-footprint` sibling box (dashed 1px outline, accent at 45%, pointer-events none) sized to the footprint and positioned the way the real panel opens (horizontal: toward viewport center from the item edge — reuse the `anchorPanel` left/right half rule; vertical: below when in the top half). Footprint renders at every position including corners — no placement restriction anywhere.

- [ ] **Step 1: Failing tests.** Registry: weather's entry carries the exact footprint, every other entry omits it. Inspector: renders tier radios only for declared sizes, fires all four callbacks, shows the overlap note when given ids and no note otherwise. App: selecting Weather in edit mode shows the inspector beside it and a dashed footprint box; selecting a widget WITHOUT a footprint shows none; moving Weather into the bottom-right corner keeps it selectable and footprint visible (never placement-restricted, AC6); hide via inspector removes the item and Save persists `{ kind: 'hidden' }`; restore returns the designed slot.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.** Overlap detection in App from the live rect map: selected rect intersects sibling rect (strict overlap, not adjacency).
- [ ] **Step 4: GREEN + tsc + hygiene.**
- [ ] **Step 5: Commit** — `feat(edit): floating inspector, overlap warning, and expansion footprints`

---

### Task 7: Layout switcher badge and Settings management

**Files:**
- Create: `src/newtab/edit/LayoutBadge.tsx`
- Modify: `src/newtab/App.tsx` (badge near the fixed utility controls), `src/settings/sections/Layout.tsx` (management list), `src/newtab/widgets/palette/PaletteHost.tsx` (optional `Edit layout` palette command threading — a `onEditLayout` prop invoked from the palette; keep minimal)
- Test: `src/newtab/edit/LayoutBadge.test.tsx`, `src/newtab/App.test.tsx`, `src/settings/SettingsPanel.test.tsx`

**Interfaces:**
- `LayoutBadge` props: `{ document: LayoutsDocument; onSwitch: (id: string) => void; onEdit: () => void; onNew: () => void }` — a small fixed pill (bottom-right cluster beside the tray/gear, `aria-haspopup="menu"`, label `Layout: <name>`) opening a menu: one radio item per layout (switch), separator, `Edit layout`, `New layout`. Escape/outside-click close with focus restoration (reuse the file-local menu idiom from UtilityTray or a minimal popover — read the existing component before writing).
- App: `onSwitch` = `saveLayoutsDocument(storage, switchActiveLayout(document, id))` (explicit user action; instant, cannot lose data — spec 2.1); `onNew` per scope decision 5; `onEdit` = `editMode.begin(badgeElement)`.
- Settings Layout section gains **Layouts** management above the legacy recovery actions: a list of the resolved document's layouts (name, active marker) with Rename (inline input), Duplicate, Delete (confirm via the existing ResetLayoutDialog pattern but with layout-scoped copy; blocked for the last layout per `deleteLayout`), Reorder (Up/Down buttons — `reorderLayouts`), and Create. Every action = one pure `layoutOperations` call + one `saveLayoutsDocument`.

- [ ] **Step 1: Failing tests.** Badge: shows the active name; switching calls onSwitch with the id; menu closes and restores focus. App: switching layouts via the badge writes only the `layouts` key and re-renders the other layout's placements; `New layout` creates+switches+persists in one write... (assert exactly one storage write via spy, containing both the new layout and the new activeLayoutId). Settings: create/rename/duplicate/reorder/delete each persist through `saveLayoutsDocument` (write-spy: only `layouts`), delete of the last layout is not offered, deleting the active layout moves the active pointer (assert per `deleteLayout` semantics), and the management list reflects the stored document after each action.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.** `New layout` composes pure ops: `saveLayoutsDocument(storage, switchActiveLayout(createLayout(doc, { id, name }), id))` — one write.
- [ ] **Step 4: GREEN + tsc + hygiene; rerun Settings + App families.**
- [ ] **Step 5: Commit** — `feat(layouts): switcher badge and Settings layout management`

---

### Task 8: Focused Chromium witness

**Files:**
- Create: `scripts/preview-nl-p3.mjs` (clone the scaffolding of `scripts/preview-nl-p2.mjs`: same build/launch/seed/evidence conventions, dirs `.preview-nl-p3-*`; add them to `.gitignore` in this task)

**Matrix and assertions (production preview build, real Chromium, DSF 1, 1408x445 and 1600x900):**
1. **Entry and chrome:** hover the Clock → grip/gear visible; plain click on the Quote wrapper still paints no outline (AC4 regression); gear click opens Settings on the Widgets tab (drawer visible, anchor focused); Escape closes Settings.
2. **Edit session:** grip-drag the Clock 200px right → page dims (`[data-editing]` present), widget interiors inert (a click on the Search input does not focus it), drop lands grid-snapped; toolbar visible with Undo enabled.
3. **Exact cancel:** Escape → storage `layouts` key unchanged from pre-session bytes AND the Clock renders at its original percent.
4. **Save persists:** repeat the drag, click Save → `layouts` document exists in storage with the moved placement; reload → the Clock renders at the saved percent (first-save materialization witnessed).
5. **Inspector:** enter edit, select Weather → inspector visible with tier radios; dashed footprint box visible; drag Weather to the bottom-right corner → still selectable, footprint still rendered (AC6); Hide → Weather gone; Save; reload → still hidden; re-enter edit, restore via Settings toggle stays on (settings.widgets.weather === true).
6. **Bulk tier (AC9):** bulk Compact → every free item's `data-canvas-size` is compact (docked untouched); set Clock to Full via inspector; bulk Standard → Clock standard.
7. **Switcher:** badge shows `My layout`; New layout → badge shows `Layout 2`, canvas renders defaults; switch back → original placements return exactly; every write in the run touched ONLY the `layouts` key (storage listener log).
8. Zero runtime errors, failed requests, or horizontal overflow throughout; PNGs for each numbered stage; per-capture usefulness inspection.

- [ ] **Step 1:** Write the script; run `node scripts/preview-nl-p3.mjs` → `PASS: NL-P3 live edit mode`. Fix genuine failures via focused RED/GREEN on the owning file; one rerun allowed.
- [ ] **Step 2:** Inspect every PNG at original resolution; judge usefulness per A2-D060.
- [ ] **Step 3:** Commit — `test(edit): focused NL-P3 live-edit Chromium witness`

---

### Task 9: Packet gate, review, ledger, checkpoint

- [ ] **Step 1: Focused gate** — `npx vitest run src/lib/layout src/newtab/edit src/newtab/canvas src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx src/lib/backup.test.ts src/newtab/widgetRegistry.test.ts` plus `npx tsc --noEmit`, `git diff --check`, one `npm run build` (record module count). No full canonical harness (NL-P6 scale).
- [ ] **Step 2: Bounded review** (superpowers:requesting-code-review; one review + at most one fix/rereview). Reviewer verifies: exact-cancel leaves storage byte-identical; Save is the single write path and writes only `layouts`; normal-mode clicks paint no ring; interiors inert only during a session; no placement restriction anywhere for Weather; the hidden kind round-trips backup; dock drop zones correctly absent (NL-P4); `useLongPress`/`canvasSnap` reused not duplicated.
- [ ] **Step 3: Ledger** — STATUS.md: Last verified → NL-P3, Current → NL-P4 docks; NL-P3 evidence bullet with exact counts, witness stages, review outcome.
- [ ] **Step 4: Checkpoint** — commit `docs: checkpoint NL-P3 live edit mode`, push, repository proof (active clean+pushed; protected still `eb1354b`).

---

## Self-review notes

- **Spec 2.5 coverage:** grips/gears — Task 3; dim + inert interiors — Task 4; content-tight selected outline + hover hairline — Task 4 CSS; expanded-footprint dashed outline — Task 6; drag with pointer capture/8px grid/magnetic guides/clamping — Task 5 (retained canvasSnap); inspector tier/layer/hide/restore — Task 6; toolbar switcher/bulk/Undo/Reset/Cancel/Save — Task 4 (+ switcher enable rule, scope decision 3); arrows 8px, Shift+Arrow 1px — Task 4 via canvasKeyboardDelta; Escape exact cancel, single Save — Tasks 2/4; long-press — Task 5; dock drop zone — explicitly deferred to NL-P4 (global constraints).
- **Spec 2.1 coverage:** badge switcher with current name/list/Edit/New — Task 7; Settings create/duplicate/rename/delete/reorder — Task 7; bulk tier per layout — Tasks 2/4 (AC9 test in Task 2); instant switching that cannot lose data — Task 7 App tests (only `layouts` writes).
- **AC coverage:** AC1 partially (create/switch/delete/rename + exact restore — Task 7 + witness 7; duplicate in Settings), AC4 (witness 1), AC5 (Tasks 3–6 + witness), AC6 (Task 6 + witness 5), AC9 (Task 2 + witness 6).
- **Type consistency check:** `EditSession`/`beginEditSession(document, enabledIds)` consistent across Tasks 2/4/5; `moveSelectedLive` added in Task 5's RED against editSession; `CanvasDragApi.onPreviewMove` percent signature matches `moveSelected`'s `{ xPct, yPct }`; `focusWidget` nonce shape consistent between Tasks 3 App/SettingsPanel.
- **Known risks:** jsdom pointer-capture support is partial — the drag hook test uses synthetic events against the hook's own handlers rather than real capture (the witness owns real-pointer truth); inspector positioning via anchorPanel needs real rects (witness-verified, unit tests pass fake rects). If `UtilityTray`'s menu idiom doesn't transplant cleanly to LayoutBadge, write the minimal popover inline rather than abstracting prematurely.
