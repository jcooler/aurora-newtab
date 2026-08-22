# Aurora Two-Axis Dock Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every top- and bottom-dock member independent, safe X/Y placement while preserving exact absent-Y rendering, one-gesture undo, exact recovery, and the user's pre-dock free tier.

**Architecture:** Add optional `y` and `returnTier` members to the existing schema-v16/layout-document-v1 dock placement without a migration. The renderer keeps absent-Y members in the current intrinsic edge-anchored grid and places explicit-Y members in a separate absolute layer inside a transparent responsive band. A pure dock-geometry module owns pointer conversion, live-size containment, peer/center magnetism, Alt bypass, and keyboard conversion; the drag hook owns one explicit canvas/dock transition state and cancellation lifecycle, while `editSession.ts` remains the only draft transformation authority.

**Tech Stack:** TypeScript 5.9, React 19, Vitest 3, Testing Library, CSS Grid/absolute positioning, Playwright 1.62 against the built MV3 extension, and Aurora's existing authority-backed storage adapter.

**Spec:** `docs/superpowers/specs/2026-08-22-aurora-two-axis-dock-placement-design.md`

## Global Constraints

- The user owns placement; the system owns safety. There are no dock slots, tracks, rows, auto-packing, collision correction, recentering, or peer movement.
- DY-P1 runs before SF-P1. Do not implement shared frames, stack-frame migration, docked stacks, multi-select, or user-resizable dock depth in this packet.
- The top and bottom bands use `height: clamp(96px, 16vh, 128px)`, the existing 16px edge inset, and the existing 72px side safety insets.
- `DockedWidgetPlacement.y` and `returnTier` are optional and additive. `LAYOUTS_DOCUMENT_VERSION` stays 1 and storage `CURRENT_VERSION` stays 16.
- An absent `y` preserves the exact current edge-specific grid baseline. No cleaner, renderer, edit-session entry, Save, backup, or boot path may materialize it.
- Docking a free widget stores its current free tier in `returnTier` and immediately previews its Docked presentation. Undocking restores `returnTier`, or Standard through the existing nearest-supported renderer fallback when absent.
- Stored order derives from X only: X ascending, then the prior stored order, then stable `BLOCK_IDS` identity. Y never changes reading or narrow-floor order.
- Arrow moves eight CSS px; Shift+Arrow moves one CSS px; Alt bypasses pointer magnetism only.
- One pointer gesture creates one undo entry. Pointer cancel, lost pointer capture, Escape, and explicit Cancel restore the exact pre-gesture draft and clear all transient chrome without drop semantics.
- Dock overlap is legal and warned from current measured rectangles. The warning must clear in the same gesture when rectangles stop intersecting.
- The band has no normal-mode fill, border, scrollbar, fade, or hidden scrollport. Empty regions remain pointer-transparent except as an edit-mode drag target.
- Below 600 CSS px, the existing dock-first mechanical stack remains authoritative. Stored X/Y values survive unchanged and resume at 600px.
- Preserve storage authority, backup validation/redaction, exact V1/V2/V3 recovery, connector identities and request contracts, credentials, permissions, Notes ownership, Calendar/ICS contracts, CSP, dependencies, and every privacy boundary.
- Do not modify `D:\DEV\Chrome plugin`. It remains read-only on `main` at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- Do not upload, type into, save, submit, publish, distribute, or roll out any Chrome Web Store state without a new action-specific W6-P5 approval.
- Observe a focused RED before every production or QA-harness behavior change. Use one bounded packet review and at most one confirmed-finding fix/rereview cycle.
- New QA output goes only to ignored repository-local scratch directories. Do not alter accepted `docs/superpowers/qa/nl-p6` evidence.
- Rebuild `dist` from the exact reviewed commit before any owner-facing check and record the commit/build provenance.

## File Structure

- `src/lib/layout/namedLayouts.ts`: additive dock storage fields, strict absent-safe cleaning, and percent helpers.
- `src/lib/layout/renderLayout.ts`: carries optional explicit Y to desktop rendering while leaving narrow order and absent-Y data unchanged.
- `src/lib/layout/editSession.ts`: X/Y dock draft operations, X-only stable order derivation, `returnTier`, undock/redock memory, and one-entry undo.
- `src/newtab/edit/dockGeometry.ts`: new DOM-free band measurement, live-size clamp, dock magnetism, guide coordinates, and keyboard point conversion.
- `src/newtab/edit/useCanvasDrag.ts`: one canvas/dock drag-state vocabulary, live rectangle refresh, normalized pointer offset, Alt bypass, and exact cancellation.
- `src/newtab/canvas/CanvasSurface.tsx`: transparent fixed bands, legacy/explicit layers, dock-local guides, and mixed absent-Y/explicit-Y rendering.
- `src/newtab/canvas/CanvasItem.tsx`: keeps the old grid style for absent Y and uses absolute X/Y center positioning only for explicit Y.
- `src/newtab/App.tsx`: composes measured transitions with the edit session, captures gesture tier memory, routes keyboard nudges, and derives live same-space overlap.
- `src/newtab/edit/WidgetInspector.tsx`: receives truthful overlap labels for docked selections; no new layout-control vocabulary.
- `src/newtab/index.css`: responsive band, exact legacy sub-grid, explicit positioning layer, transient drop target, and dock-local guide styling.
- `scripts/qa-dy-p1-output.mjs`: scratch-only path validation and cleanup.
- `scripts/qa-dy-p1.mjs`: deterministic exact-viewport Chromium matrix plus pre-feature/post-feature absent-Y comparison.
- `scripts/qa-dy-p1-window.mjs`: real non-emulated Chrome-window witness against an exact reviewed build.
- `scripts/qa-dy-p1.test.mjs`: static and pure harness contracts, including output safety and immutable NL-P6 evidence.
- `docs/superpowers/reports/TWO-AXIS-DOCKS-QA.md`: bounded packet evidence and build provenance.

---

### Task 0: Checkpoint this just-in-time DY-P1 plan

**Files:**

- Create: `docs/superpowers/plans/2026-08-22-aurora-two-axis-dock-placement-implementation.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`

**Interfaces:**

- Consumes: owner-approved A2-D071 and `2026-08-22-aurora-two-axis-dock-placement-design.md`.
- Produces: one pushed executable-plan checkpoint with no production changes.

- [ ] **Step 1: Pin repository authority before editing**

Run:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse origin/feat/aurora-2-observatory
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
```

Expected: active worktree clean and equal to upstream; protected checkout clean at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.

- [ ] **Step 2: Record the current executable packet**

Add to STATUS and ROADMAP: DY-P1 plan path, dependency on A2-D071, explicit precedence before SF-P1, Store block, and the starting commit. Do not mark implementation Verified.

- [ ] **Step 3: Self-review the plan**

Run:

```powershell
$forbidden = @('T' + 'BD', 'T' + 'ODO', 'implement ' + 'later', 'similar ' + 'to', 'appropriate error ' + 'handling')
Select-String -Path docs/superpowers/plans/2026-08-22-aurora-two-axis-dock-placement-implementation.md -Pattern $forbidden
git diff --check
git diff --name-only
```

Expected: no placeholder hits; diff contains only this plan and the two ledgers.

- [ ] **Step 4: Commit and push the plan**

```powershell
git add docs/superpowers/plans/2026-08-22-aurora-two-axis-dock-placement-implementation.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md
git commit -m "docs: plan two-axis dock placement"
git push origin feat/aurora-2-observatory
```

---

### Task 1: Capture the immutable absent-Y baseline and harness safety

**Files:**

- Create: `scripts/qa-dy-p1-output.mjs`
- Create: `scripts/qa-dy-p1.test.mjs`
- Create: `scripts/qa-dy-p1.mjs`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: current pre-DY-P1 rendering at the plan checkpoint, Playwright, and `scripts/qa-nl-p6-output.mjs` path-safety conventions.
- Produces:

```js
export function prepareDyOutputDir(argv, repoRoot, phase)
export const DY_VIEWPORTS = Object.freeze([
  { width: 1366, height: 768 },
  { width: 1408, height: 445 },
  { width: 1600, height: 900 },
  { width: 599, height: 800 },
  { width: 600, height: 800 },
])
```

The `--phase=baseline` run writes only `.qa-dy-p1-baseline`; later `--phase=after` reads but never rewrites it.

- [ ] **Step 1: Write the failing harness contract**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { prepareDyOutputDir } from './qa-dy-p1-output.mjs'

test('DY output accepts only its ignored scratch roots', () => {
  const root = resolve('.')
  assert.match(prepareDyOutputDir([], root, 'baseline'), /\.qa-dy-p1-baseline$/)
  assert.throws(() => prepareDyOutputDir(['--out=docs/superpowers/qa/nl-p6'], root, 'after'), /unsafe/i)
})
```

- [ ] **Step 2: Run the RED**

Run: `node --test scripts/qa-dy-p1.test.mjs`

Expected: FAIL because `qa-dy-p1-output.mjs` does not exist.

- [ ] **Step 3: Implement guarded scratch output and baseline capture**

Use exact suffix allowlists:

```js
const SUFFIX = phase === 'baseline' ? '.qa-dy-p1-baseline' : '.qa-dy-p1-after'
const requested = argv.find((value) => value.startsWith('--out='))?.slice(6)
const output = resolve(repoRoot, requested ?? SUFFIX)
if (!output.endsWith(SUFFIX)) throw new Error(`unsafe DY-P1 output path: ${output}`)
```

The baseline seed must contain absent-Y top and bottom members with materially different sizes:

```js
active.widgets.weather = { kind: 'docked', dock: 'top', order: 0, x: 18 }
active.widgets.bookmarks = { kind: 'docked', dock: 'top', order: 1, x: 72 }
active.widgets.tasks = { kind: 'docked', dock: 'bottom', order: 0, x: 24 }
active.widgets.notes = { kind: 'docked', dock: 'bottom', order: 1, x: 76 }
```

For each desktop viewport, record screenshot SHA-256 plus each member's `{left, top, right, bottom, width, height}` and the byte-shaped `layouts` value. For 599/600 record only deterministic order and storage preservation. The baseline command must refuse to overwrite an existing baseline unless passed `--replace-baseline`.

- [ ] **Step 4: Run the harness tests GREEN**

Run: `node --test scripts/qa-dy-p1.test.mjs`

Expected: PASS.

- [ ] **Step 5: Capture the baseline before any production change**

Run:

```powershell
node scripts/qa-dy-p1.mjs --phase=baseline
```

Expected: 12 absent-Y desktop rectangle witnesses (four identities across three desktop viewports) plus two narrow-floor order/storage witnesses, zero runtime errors, failed requests, unexpected writes, or Store interactions. Confirm `.qa-dy-p1-baseline/evidence.json` records the plan-checkpoint commit.

- [ ] **Step 6: Commit the harness baseline authority**

```powershell
git add .gitignore scripts/qa-dy-p1-output.mjs scripts/qa-dy-p1.test.mjs scripts/qa-dy-p1.mjs
git commit -m "test: pin legacy dock baselines"
```

Scratch evidence remains untracked.

---

### Task 2: Add absent-safe Y and return-tier storage

**Files:**

- Modify: `src/lib/layout/namedLayouts.ts`
- Modify: `src/lib/layout/namedLayouts.test.ts`
- Modify: `src/lib/backup.test.ts`
- Test unchanged production validator: `src/lib/backup.ts`
- Test unchanged schema authority: `src/lib/storage/schema.ts`

**Interfaces:**

- Consumes: `WidgetTier`, `DockEdge`, `cleanLayoutsDocument`, and backup's strict `isLayoutsDocument` path.
- Produces:

```ts
export interface DockPoint {
  xPct: number
  yPct: number
}

export interface DockedWidgetPlacement {
  kind: 'docked'
  dock: DockEdge
  order: number
  x?: number
  y?: number
  align?: DockAlign
  tier?: WidgetTier
  returnTier?: WidgetTier
}

export function dockedYPercent(placement: DockedWidgetPlacement): number | undefined
```

- [ ] **Step 1: Write failing document and backup tests**

```ts
it('round-trips explicit dock y and returnTier while preserving their absence', () => {
  const doc = validDocument()
  doc.layouts[0].widgets.weather = {
    kind: 'docked', dock: 'top', order: 0, x: 17.5, y: 82.25, returnTier: 'full',
  }
  const cleaned = cleanLayoutsDocument(doc)
  expect(cleaned.layouts[0].widgets.weather).toEqual(doc.layouts[0].widgets.weather)
  expect(cleaned.layouts[0].widgets.bookmarks).toEqual({ kind: 'docked', dock: 'bottom', order: 0 })
})

it.each([
  ['y', Number.NaN], ['y', -0.01], ['y', 100.01], ['returnTier', 'giant'],
])('rejects malformed dock %s in documents and backups', (key, value) => {
  // mutate the known valid dock row, assert cleanLayoutsDocument throws,
  // then place the same document in a current-version backup and assert
  // prepareBackup returns ok:false.
})
```

Also assert `CURRENT_VERSION === 16` and `LAYOUTS_DOCUMENT_VERSION === 1` in the test. No production version edit is allowed.

- [ ] **Step 2: Run the RED**

Run:

```powershell
npx vitest run src/lib/layout/namedLayouts.test.ts src/lib/backup.test.ts
```

Expected: FAIL because `y`, `returnTier`, and `dockedYPercent` are not recognized.

- [ ] **Step 3: Implement strict additive validation**

Extend `isDockedPlacement` with:

```ts
&& (value.y === undefined || (finite(value.y) && value.y >= 0 && value.y <= 100))
&& (value.returnTier === undefined || (typeof value.returnTier === 'string' && TIER_SET.has(value.returnTier)))
```

Add:

```ts
export function dockedYPercent(placement: DockedWidgetPlacement): number | undefined {
  return typeof placement.y === 'number'
    ? Math.min(100, Math.max(0, placement.y))
    : undefined
}
```

Do not canonicalize absent fields. `cleanNamedLayout` continues cloning the known placement as written.

- [ ] **Step 4: Run the focused GREEN**

Run:

```powershell
npx vitest run src/lib/layout/namedLayouts.test.ts src/lib/backup.test.ts
npx tsc --noEmit
```

Expected: PASS, with no version or migration diff.

- [ ] **Step 5: Commit the model**

```powershell
git add src/lib/layout/namedLayouts.ts src/lib/layout/namedLayouts.test.ts src/lib/backup.test.ts
git commit -m "feat: add two-axis dock storage"
```

---

### Task 3: Make dock draft operations two-dimensional and tier-reversible

**Files:**

- Modify: `src/lib/layout/editSession.ts`
- Modify: `src/lib/layout/editSession.test.ts`
- Modify: `src/lib/layout/renderLayout.ts`
- Modify: `src/lib/layout/renderLayout.test.ts`

**Interfaces:**

- Consumes: `DockPoint`, optional `DockedWidgetPlacement.y`, `returnTier`, `dockedXPercent`, `dockedYPercent`, and existing session `commit`/`replaceSelected` semantics.
- Produces:

```ts
export interface DockGestureMemory {
  dockTier?: WidgetTier
  returnTier?: WidgetTier
}

export function dockSelected(
  session: EditSession,
  dock: DockEdge,
  point: DockPoint,
  memory?: DockGestureMemory,
): EditSession

export function dockSelectedLive(
  session: EditSession,
  dock: DockEdge,
  point: DockPoint,
  memory?: DockGestureMemory,
): EditSession

export interface DockedRenderItem {
  id: BlockId
  mode: 'docked'
  dock: DockEdge
  order: number
  xPct: number
  yPct?: number
  dockTier?: WidgetTier
}
```

- [ ] **Step 1: Write failing pure edit tests**

Cover these exact transitions:

```ts
it('stores independent x/y, source returnTier, and x-only stable order', () => {
  let session = selectWidget(fresh(), 'clock') // source Clock is Full
  session = dockSelected(session, 'bottom', { xPct: 12, yPct: 81 })
  expect(activeDraftLayout(session).widgets.clock).toEqual({
    kind: 'docked', dock: 'bottom', order: 0, x: 12, y: 81, returnTier: 'full',
  })
})

it('keeps prior order for equal x, then BLOCK_IDS identity as final tie', () => {
  // seed equal X with deliberately different prior orders; move Y only;
  // assert order is unchanged and never sorted by Y.
})

it('restores returnTier and falls back to Standard only when absent', () => {
  // explicit returnTier compact -> free compact; legacy no returnTier -> free standard.
})

it('top to bottom to canvas to top remains one undo entry and retains gesture memory', () => {
  // first dockSelected pushes; every transition after it uses Live;
  // one Undo restores the exact baseline.
})
```

Add render tests proving explicit `yPct` is emitted, absent Y is omitted, and 599px narrow rendering ignores X/Y without mutating the input.

- [ ] **Step 2: Run the RED**

Run:

```powershell
npx vitest run src/lib/layout/editSession.test.ts src/lib/layout/renderLayout.test.ts
```

Expected: compile/test FAIL on the new point signature and `yPct`/`returnTier` expectations.

- [ ] **Step 3: Implement clamped X/Y and stable X-only ordering**

`dockSelectedInternal` derives memory exactly once:

```ts
const derivedReturnTier = memory?.returnTier
  ?? (existing?.kind === 'free' ? existing.tier : existing?.kind === 'docked' ? existing.returnTier : undefined)
const derivedDockTier = memory?.dockTier
  ?? (existing?.kind === 'docked' ? existing.tier : undefined)

widgets[id] = {
  kind: 'docked',
  dock,
  order: existing?.kind === 'docked' ? existing.order : Number.MAX_SAFE_INTEGER,
  x: clampPct(point.xPct),
  y: clampPct(point.yPct),
  ...(derivedDockTier ? { tier: derivedDockTier } : {}),
  ...(derivedReturnTier ? { returnTier: derivedReturnTier } : {}),
}
```

Before rewriting orders, snapshot every dock member's prior order and sort by:

```ts
dockedXPercent(a.placement) - dockedXPercent(b.placement)
  || a.priorOrder - b.priorOrder
  || BLOCK_IDS.indexOf(a.memberId) - BLOCK_IDS.indexOf(b.memberId)
```

`undockSelectedInternal` uses `placement.returnTier ?? 'standard'`. `setSelectedTier` changes only dock `tier`; it preserves `returnTier` through object spread.

- [ ] **Step 4: Emit optional Y without touching narrow behavior**

In `planLayoutRender`, carry `yPct` only when `dockedYPercent(placement)` is defined. Do not set `yPct: 50`, write data, or include Y in `dockSorted`.

- [ ] **Step 5: Run the focused GREEN**

Run:

```powershell
npx vitest run src/lib/layout/editSession.test.ts src/lib/layout/renderLayout.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit pure operations**

```powershell
git add src/lib/layout/editSession.ts src/lib/layout/editSession.test.ts src/lib/layout/renderLayout.ts src/lib/layout/renderLayout.test.ts
git commit -m "feat: add reversible two-axis dock edits"
```

---

### Task 4: Add pure live dock geometry, guides, and keyboard conversion

**Files:**

- Create: `src/newtab/edit/dockGeometry.ts`
- Create: `src/newtab/edit/dockGeometry.test.ts`
- Reuse unchanged type: `src/newtab/arrange/canvasSnap.ts:CanvasGuide`

**Interfaces:**

- Consumes: `DockEdge`, `DockPoint`, `CanvasGuide`.
- Produces:

```ts
export const DOCK_SIDE_INSET = 72
export const DOCK_EDGE_INSET = 16
export const DOCK_MAGNETIC_THRESHOLD = 5

export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

export interface DockSnapNeighbor extends RectLike { id: string }

export function fallbackDockBandRect(
  edge: DockEdge,
  viewport: Readonly<{ width: number; height: number }>,
): RectLike

export function snapDockPoint(input: Readonly<{
  pointer: { x: number; y: number }
  pointerOffsetRatio: { x: number; y: number }
  member: { width: number; height: number }
  band: RectLike
  neighbors: readonly DockSnapNeighbor[]
  bypassMagnetism: boolean
}>): { point: DockPoint; guides: readonly CanvasGuide[] }

export function nudgeDockPoint(input: Readonly<{
  memberRect: RectLike
  band: RectLike
  delta: { x: number; y: number }
}>): DockPoint
```

- [ ] **Step 1: Write failing geometry tests**

```ts
it('clamps the live member box, not only its center', () => {
  const result = snapDockPoint({
    pointer: { x: -100, y: 999 }, pointerOffsetRatio: { x: .5, y: .5 },
    member: { width: 200, height: 40 },
    band: { left: 72, top: 16, width: 856, height: 100 },
    neighbors: [], bypassMagnetism: false,
  })
  expect(result.point).toEqual({ xPct: 200 / 2 / 856 * 100, yPct: (100 - 20) / 100 * 100 })
})

it('snaps both axes to band and peer centers/edges inside exactly 5px', () => {
  // Assert center and edge guide kind/value; repeat at 5.01px and expect none.
})

it('Alt bypass keeps the unsnapped continuous point but still clamps safety', () => {
  // Same pointer as the snapping test, bypassMagnetism:true, guides:[].
})

it('converts 8px and 1px keyboard movement through the same measured clamp', () => {
  // Use nudgeDockPoint at center and at each band edge.
})
```

- [ ] **Step 2: Run the RED**

Run: `npx vitest run src/newtab/edit/dockGeometry.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement continuous no-grid dock math**

Use raw top-left from the pointer and normalized grab ratio:

```ts
const rawLeft = pointer.x - band.left - pointerOffsetRatio.x * member.width
const rawTop = pointer.y - band.top - pointerOffsetRatio.y * member.height
```

Generate X/Y candidates from the moving member's left/center/right or top/center/bottom against band center and every peer left/center/right or top/center/bottom. Select nearest distance with band-center tie priority, apply at most one guide per axis, then clamp top-left to `[0, band.width - member.width]` / `[0, band.height - member.height]`. Convert the clamped center to percentages. Do not round or grid-snap.

- [ ] **Step 4: Run the focused GREEN**

Run:

```powershell
npx vitest run src/newtab/edit/dockGeometry.test.ts src/newtab/arrange/canvasSnap.test.ts
npx tsc --noEmit
```

Expected: PASS; existing canvas 8px grid behavior stays unchanged.

- [ ] **Step 5: Commit pure geometry**

```powershell
git add src/newtab/edit/dockGeometry.ts src/newtab/edit/dockGeometry.test.ts
git commit -m "feat: add dock placement geometry"
```

---

### Task 5: Render responsive bands with exact legacy and explicit-Y layers

**Files:**

- Modify: `src/newtab/canvas/CanvasSurface.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.test.tsx`
- Modify: `src/newtab/canvas/CanvasItem.tsx`
- Modify: `src/newtab/canvas/CanvasItem.test.tsx`
- Modify: `src/newtab/edit/GuideOverlay.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**

- Consumes: `DockedRenderItem.yPct?: number`, existing `CanvasGuide`, and current content-tight `CanvasItem` behavior.
- Produces:

```ts
export interface DragGuideSet {
  space: 'canvas' | DockEdge
  guides: readonly CanvasGuide[]
}
```

`CanvasSurface` accepts `guideSet?: DragGuideSet | null`. `DockStrip` receives legacy children, explicit children, and only the guides for its own edge.

- [ ] **Step 1: Write failing mixed-render tests**

```tsx
it('keeps absent-Y members on the legacy edge grid and positions explicit-Y members in both axes', () => {
  // Seed top and bottom docks with one absent-y and one explicit-y member.
  expect(legacy.dataset.dockPositioning).toBe('legacy')
  expect(legacy.style.top).toBe('')
  expect(explicit.dataset.dockPositioning).toBe('explicit')
  expect(explicit.style.left).toBe('27%')
  expect(explicit.style.top).toBe('73%')
  expect(explicit.style.transform).toBe('translate(-50%, -50%)')
})
```

Add CSS contract assertions for exact band height, 16px edge/72px side insets, pointer-transparent nav/lane, no scroll/fade tokens, and a retained nested legacy grid with the current `padding: 16px 2px 2px; align-items: end` declarations.

Also pin hit testing: normal-mode dock interiors remain live; edit-mode interiors are inert; the grip and settings affordances remain reachable outside the inert content; empty band space has no normal-mode hit target.

- [ ] **Step 2: Run the RED**

Run:

```powershell
npx vitest run src/newtab/canvas/CanvasSurface.test.tsx src/newtab/canvas/CanvasItem.test.tsx
```

Expected: FAIL because explicit Y and the two-layer band do not render.

- [ ] **Step 3: Implement the mixed band DOM**

The band structure is:

```tsx
<nav aria-label={label} className={edge === 'top' ? 'canvas-top-bar' : 'canvas-bottom-bar'}>
  <div className="dock-lane" data-edge={edge}>
    <div className="dock-lane__legacy" data-edge={edge}>{legacyChildren}</div>
    <div className="dock-lane__placed">{explicitChildren}</div>
    <GuideOverlay guides={guides} className="edit-guides--dock" />
  </div>
</nav>
```

Partition by `item.yPct === undefined`; never derive Y for the legacy group. Keep DOM order X-derived in both layers.

- [ ] **Step 4: Implement CanvasItem's two paths**

Absent-Y dock style remains the current grid path exactly:

```ts
{
  position: 'relative', gridArea: '1 / 1', justifySelf: 'start',
  marginLeft: `${item.xPct}%`, transform: 'translateX(-50%)',
}
```

Explicit-Y style is:

```ts
{
  position: 'absolute', left: `${item.xPct}%`, top: `${item.yPct}%`,
  transform: 'translate(-50%, -50%)',
}
```

Set `data-dock-positioning` only on docked wrappers. Do not add a fixed widget size.

- [ ] **Step 5: Implement the transparent responsive band CSS**

```css
.canvas-bottom-bar,
.canvas-top-bar {
  position: fixed;
  z-index: 30;
  right: 72px;
  left: 72px;
  height: clamp(96px, 16vh, 128px);
  pointer-events: none;
}
.canvas-bottom-bar { bottom: 16px; }
.canvas-top-bar { top: 16px; }
.dock-lane { position: relative; width: 100%; height: 100%; pointer-events: none; }
.dock-lane__legacy {
  position: absolute;
  right: 0;
  left: 0;
  display: grid;
  width: 100%;
  align-items: end;
  padding: 16px 2px 2px;
}
.dock-lane__legacy[data-edge="top"] { top: 0; }
.dock-lane__legacy[data-edge="bottom"] { bottom: 0; }
.dock-lane .canvas-item { pointer-events: auto; }
```

No `overflow`, scrollbar, mask, fade, background, border, or box-shadow declaration belongs to the band.

- [ ] **Step 6: Run the focused GREEN**

Run:

```powershell
npx vitest run src/newtab/canvas/CanvasSurface.test.tsx src/newtab/canvas/CanvasItem.test.tsx src/lib/layout/renderLayout.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Run post-feature baseline equality before interaction changes**

Run: `node scripts/qa-dy-p1.mjs --phase=after --baseline-only`

Expected: every absent-Y desktop member rectangle equals baseline within 0.5 CSS px; screenshots have the same dimensions; storage remains byte-shaped with no `y`/`returnTier` materialization. If not, fix the layer/CSS before proceeding.

- [ ] **Step 8: Commit rendering**

```powershell
git add src/newtab/canvas/CanvasSurface.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/canvas/CanvasItem.tsx src/newtab/canvas/CanvasItem.test.tsx src/newtab/edit/GuideOverlay.tsx src/newtab/index.css
git commit -m "feat: render two-axis dock bands"
```

---

### Task 6: Make drag transitions, cancellation, guides, overlap, and keyboard truthful

**Files:**

- Modify: `src/newtab/edit/useCanvasDrag.ts`
- Modify: `src/newtab/edit/useCanvasDrag.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/edit/WidgetInspector.tsx`
- Modify: `src/newtab/edit/WidgetInspector.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**

- Consumes: Task 3's `dockSelected*` point/memory API, Task 4's geometry API, and Task 5's `DragGuideSet`/band DOM.
- Produces:

```ts
export type DragPlacement =
  | Readonly<{ kind: 'canvas'; point: { xPct: number; yPct: number } }>
  | Readonly<{ kind: 'dock'; dock: DockEdge; point: DockPoint }>

export interface CanvasDragDrop {
  placement: DragPlacement
  stackTarget: StackDropTarget | null
}

export interface CanvasDragApi {
  dragging: CanvasDragSubject | null
  stackTarget: StackDropTarget | null
  guideSet: DragGuideSet | null
  startDrag(subject: CanvasDragSubject, event: StartPointer): void
  cancelDrag(): void
}
```

`onPreviewMove(subject, placement, first, pointer)` receives `{clientX, clientY, altKey}`. `onDrop` receives the last placement. The hook never calls `onDrop` from cancellation.

- [ ] **Step 1: Write failing hook tests for the transition machine**

Add tests that:

1. cross canvas -> top -> canvas -> bottom in one gesture and publish the exact placement sequence;
2. replace the start-time box with the live rect after presentation changes and preserve a normalized grab offset;
3. publish dock-local X and Y guides, then clear them synchronously on band exit;
4. bypass magnetism while `altKey` is true;
5. call `onCancel` and never `onDrop` for pointercancel, lostpointercapture, and `cancelDrag()`;
6. remove document/surface listeners after every finish path;
7. keep stack subjects canvas-only.

Representative assertion:

```ts
expect(onPreviewMove.mock.calls.map((call) => call[1].kind)).toEqual([
  'dock', 'canvas', 'dock',
])
expect(rendered.result.current.guideSet).toEqual({ space: 'bottom', guides: expect.any(Array) })
```

- [ ] **Step 2: Run the hook RED**

Run: `npx vitest run src/newtab/edit/useCanvasDrag.test.tsx`

Expected: FAIL on the new placement vocabulary, live-box refresh, Alt, and cancellation API.

- [ ] **Step 3: Implement one explicit drag-state machine**

At drag start, store the grab ratio, not a frozen pixel offset:

```ts
const pointerOffsetRatio = subject.kind === 'stack-member'
  ? { x: .5, y: .5 }
  : {
      x: clamp01((start.clientX - itemRect.left) / Math.max(1, itemRect.width)),
      y: clamp01((start.clientY - itemRect.top) / Math.max(1, itemRect.height)),
    }
```

On every move, re-read `getItemRects().get(sourceKey)` for current width/height. Determine top/bottom membership from the actual band rect or `fallbackDockBandRect` when the band is still empty. Run `snapDockPoint` in dock space and existing `snapCanvasPosition` in canvas space. Only canvas space can arm a stack hold.

One `cancelActive()` function clears hold state, guides, zone, dragging, pointer capture, and listeners before calling `onCancel`. Use it for `pointercancel`, `lostpointercapture`, public `cancelDrag()`, and unmount.

- [ ] **Step 4: Run the hook GREEN**

Run:

```powershell
npx vitest run src/newtab/edit/useCanvasDrag.test.tsx src/newtab/edit/dockGeometry.test.ts src/newtab/arrange/canvasSnap.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing App tests for reversible tiers, one undo, keyboard, and live overlap**

Add integration tests proving:

```ts
it('docks Standard Weather without a Compact prerequisite and restores Standard after undock', async () => {
  // drag standard free Weather into bottom; assert docked composition during drag;
  // drag back to canvas; assert data-canvas-size="standard" and one Undo restores baseline.
})

it('keeps dock tier and return tier through bottom -> canvas -> top in one gesture', async () => {
  // seed tier compact + returnTier full; cross both boundaries; assert final top placement preserves both.
})

it('nudges dock X/Y by 8px and Shift by 1px through measured containment', async () => {
  // select explicit-Y dock member, ArrowUp then Shift+ArrowRight; assert exact percent conversion.
})

it('shows and clears dock overlap from current rectangles during the same gesture', async () => {
  // publish intersecting rects, expect warning; publish separated rect before pointerup, expect no warning.
})

it('Escape during a drag restores the origin draft, clears guides, and writes nothing', async () => {
  // compare JSON layouts before/after and storage write spy.
})
```

Also assert the transient band boundary renders only while an eligible widget drag is over that edge, and disappears synchronously on exit, drop, cancel, lost capture, Escape, and edit-session close.

- [ ] **Step 6: Run the App RED**

Run:

```powershell
npx vitest run src/newtab/App.test.tsx src/newtab/edit/WidgetInspector.test.tsx
```

Expected: FAIL on old X-only docking, hardcoded Standard undock, free-only nudge, and free-only overlap labels.

- [ ] **Step 7: Compose gesture memory and exact transitions in App**

At drag start, snapshot only tier memory from the origin placement:

```ts
type ActiveDockMemory = Readonly<{
  dockTier?: WidgetTier
  returnTier?: WidgetTier
}>
```

- free source: `returnTier = placement.tier`, no dock tier;
- dock source: retain `tier` and `returnTier` (fallback return tier remains absent until a deliberate redock);
- every dock preview/drop calls `dockSelected*` with the memory;
- every canvas preview calls `undockSelected*` only when currently docked, otherwise `moveSelected*`;
- `first` is the only push-undo decision for the whole gesture.

The final pointer drop re-runs the last placement with `Live`, so final live-size clamp wins without a second undo entry.

- [ ] **Step 8: Route Escape and keyboard through the measured path**

Change the edit Escape callback to:

```ts
useDialogEscape(() => {
  drag.cancelDrag()
  editMode.cancel()
}, session !== null)
```

For a docked selection, query its current member and band rectangles, call `nudgeDockPoint`, then call `dockSelected` on the same edge. For free/stack selections, keep the existing `nudgeSelected` path. Alt does not change keyboard behavior.

- [ ] **Step 9: Derive overlap from the selected placement space**

- free widget/stack: compare only free widgets/stacks as today;
- docked widget: compare only non-empty docked peers on the same edge;
- always read `itemRectsRef.current` after the geometry revision triggered by `CanvasItem`'s placement effect;
- pass the resulting labels to `WidgetInspector` for both free and docked placements.

Do not delay overlap calculation to Save or session reopen.

- [ ] **Step 10: Run the integration GREEN**

Run:

```powershell
npx vitest run src/newtab/App.test.tsx src/newtab/edit/useCanvasDrag.test.tsx src/newtab/edit/WidgetInspector.test.tsx src/newtab/canvas/CanvasSurface.test.tsx src/lib/layout/editSession.test.ts
npx tsc --noEmit
```

Expected: PASS with zero unhandled errors.

- [ ] **Step 11: Commit interactions**

```powershell
git add src/newtab/edit/useCanvasDrag.ts src/newtab/edit/useCanvasDrag.test.tsx src/newtab/App.tsx src/newtab/App.test.tsx src/newtab/edit/WidgetInspector.tsx src/newtab/edit/WidgetInspector.test.tsx src/newtab/index.css
git commit -m "feat: add live two-axis dock movement"
```

---

### Task 7: Complete deterministic and real-window Chromium acceptance

**Files:**

- Modify: `scripts/qa-dy-p1.mjs`
- Modify: `scripts/qa-dy-p1.test.mjs`
- Create: `scripts/qa-dy-p1-window.mjs`
- Create: `docs/superpowers/reports/TWO-AXIS-DOCKS-QA.md`

**Interfaces:**

- Consumes: Task 1 baseline evidence, exact DY-P1 interaction selectors, and an extension build directory.
- Produces:

```powershell
node scripts/qa-dy-p1.mjs --phase=after
node scripts/qa-dy-p1-window.mjs --dist=dist
```

Both commands exit nonzero for any contract failure, runtime error, failed request, unexpected write, legacy `layout` write, stale guide, page movement, or absent-Y mismatch.

- [ ] **Step 1: Extend the failing harness contract**

Static-test the script source for every required viewport, `returnTier`, `pointercancel`, `Alt`, top-to-bottom and bottom-to-top stage names, baseline rectangle comparison, byte-stable `layouts`, `layout`-write rejection, and `--dist` provenance. Assert no write target under `docs/superpowers/qa/nl-p6`.

- [ ] **Step 2: Run the harness RED**

Run: `node --test scripts/qa-dy-p1.test.mjs`

Expected: FAIL because the interaction stages and real-window script are incomplete.

- [ ] **Step 3: Implement the exact-viewport matrix**

At 1366x768, exact 1408x445, and 1600x900, exercise Weather, Tasks, Notes, and Bookmarks at far-left/off-center/center/far-right and high/middle/low points. Include:

- absent-Y before/after equality;
- free Standard Weather -> bottom dock without size prerequisite;
- bottom -> top and top -> bottom in one gesture;
- dock -> canvas restores source tier;
- re-entry without bounce (drop settles within 2 CSS px of final preview);
- center and peer edge/center guides on both axes;
- Alt bypass with zero guide nodes;
- overlap warning appears and clears before pointerup;
- pointercancel and explicit Cancel exactness;
- Save/reload byte-stable X/Y;
- Bookmarks compact/full dock size choice unchanged;
- no band scrollbar/fade, page movement, stale guide, runtime error, failed request, unexpected write, or legacy `layout` write.

At 599x800 and 600x800, prove the boundary order and unchanged stored X/Y.

- [ ] **Step 4: Implement the non-emulated window witness**

Launch persistent Chromium with `headless:false`, `viewport:null`, an OS window sized to the 1408x445 family, and the caller-provided exact build directory. Measure and record the actual inner size and DPR. Repeat free-to-dock, in-dock X/Y, opposite dock, tier-restoring undock, Save/reload, pointercancel, and Escape/zero-write checks with real mouse movement.

- [ ] **Step 5: Run the harness contract GREEN**

Run:

```powershell
node --test scripts/qa-dy-p1.test.mjs
node --check scripts/qa-dy-p1.mjs
node --check scripts/qa-dy-p1-window.mjs
```

Expected: PASS.

- [ ] **Step 6: Run the deterministic Chromium witness**

Run: `node scripts/qa-dy-p1.mjs --phase=after`

Expected: every stage passes, absent-Y rectangle delta <=0.5px, final-preview delta <=2px, no errors/failed requests/unexpected writes.

- [ ] **Step 7: Write the bounded QA report**

Record commit, scenarios, exact viewport table, baseline deltas, storage write keys, interaction verdicts, screenshots, and honest manual ceilings. Do not claim a real-window pass until Task 9 runs it against reviewed `dist`.

- [ ] **Step 8: Commit the witness**

```powershell
git add scripts/qa-dy-p1.mjs scripts/qa-dy-p1.test.mjs scripts/qa-dy-p1-window.mjs docs/superpowers/reports/TWO-AXIS-DOCKS-QA.md
git commit -m "test: witness two-axis dock placement"
```

---

### Task 8: Run the packet gate and one bounded review cycle

**Files:**

- Review range: plan checkpoint through Task 7 witness commit.
- Modify only confirmed Critical/Important findings in the one allowed fix cycle.

**Interfaces:**

- Consumes: all DY-P1 commits and deterministic Chromium evidence.
- Produces: one review verdict, optionally one fix commit, and one rereview verdict.

- [ ] **Step 1: Run the focused packet gate**

```powershell
npx vitest run src/lib/layout src/newtab/edit src/newtab/canvas src/newtab/App.test.tsx src/lib/backup.test.ts
node --test scripts/qa-dy-p1.test.mjs
npx tsc --noEmit
git diff --check
```

Expected: all pass with zero unhandled errors.

- [ ] **Step 2: Run the one stabilized full gate**

```powershell
npm test
npm run build:preview
```

Expected: full suite and preview build pass. This is the packet's one full run; do not repeat it for Minor-only review notes.

- [ ] **Step 3: Request one bounded review**

The reviewer checks spec sections 3-13, every acceptance criterion, exact baseline evidence, transition state, cancellation, storage/backup boundaries, no shared-frame scope, no dependencies, protected checkout, and Store block. Findings must be labeled Critical, Important, or Minor.

- [ ] **Step 4: Apply at most one fix/rereview cycle**

For every accepted Critical/Important finding: write a focused failing regression test, observe RED, implement only the confirmed fix, rerun the focused family and deterministic witness stages it affects, commit once, and ask the same reviewer to rereview the fix range. Record Minor findings in STATUS instead of churning code.

---

### Task 9: Rebuild exact reviewed dist, run the real window, and checkpoint DY-P1

**Files:**

- Modify: `docs/superpowers/reports/TWO-AXIS-DOCKS-QA.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Consumes: reviewer-approved implementation commit and one real non-emulated Chrome window.
- Produces: a pushed DY-P1 checkpoint, exact build provenance, active/protected repository proof, and SF-P1 still pending its own just-in-time plan.

- [ ] **Step 1: Rebuild `dist` from the exact reviewed commit**

```powershell
git status --short
git rev-parse HEAD
npm run build
```

Record HEAD, build module count, `dist/manifest.json` version/name, and a SHA-256 of `dist/manifest.json` in the QA report. If the tree is not clean before build, stop and reconcile rather than testing stale output.

- [ ] **Step 2: Run the real-window witness against reviewed `dist`**

Run: `node scripts/qa-dy-p1-window.mjs --dist=dist`

Expected: measured real inner window in the 1408x445 family; all real-pointer transitions, X/Y movement, tier restoration, Save/reload, cancel, guide cleanup, and write checks pass.

- [ ] **Step 3: Update ledgers and decision evidence**

Mark DY-P1 Verified only after the real-window result. Add the finishing commit, test totals, Chromium evidence, baseline maximum delta, review/rereview verdict, protected-checkout proof, Store block, and any accepted Minor debt. ROADMAP advances to SF-P1 design-plan creation; it does not mark shared frames started.

- [ ] **Step 4: Commit and push the checkpoint**

```powershell
git add docs/superpowers/reports/TWO-AXIS-DOCKS-QA.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/DECISIONS.md
git commit -m "docs: checkpoint two-axis dock placement"
git push origin feat/aurora-2-observatory
```

- [ ] **Step 5: Prove both repositories**

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse origin/feat/aurora-2-observatory
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
```

Expected: active branch clean and equal to upstream; protected original clean at exact `eb1354b6a5b041fb6d494655c3dae1862572bc51`; no Store action occurred.
