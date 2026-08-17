# NL-P2 Content-Tight Anchored Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the active named layout with anchor+offset geometry and content-tight bounds, add the narrow floor, and delete the automatic profile machinery, derived slot catalogs, hidden coordinate planes, fixed widget boxes, the Arrange artboard, and the container focus ring.

**Architecture:** A pure render planner (`planLayoutRender`) turns the resolved `NamedLayout` plus the enabled-widget set and viewport width into anchored, stacked (narrow floor), or docked render items. `CanvasSurface`/`CanvasItem` are rebuilt to consume that plan: free items are absolutely positioned from anchor+offset percentages and sized by their rendered content (no box tables); below 600 CSS px everything renders as one mechanical vertical stack. The old profile pipeline (`selectCanvasProfile`, `canvasDefaults`, `canvasGeometry`, the Arrange artboard/controller) is deleted after reference proof. The stored V1/V2/V3 `layout` key remains untouched recovery input; the width-based profile rule survives ONLY as the frozen migration-input interpreter inside `myLayoutAdapter`.

**Tech Stack:** TypeScript, React, Vitest, plain CSS in `src/newtab/index.css`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md` (sections 2.1–2.3, 3, and §7 packet NL-P2). NL-P1 foundation: `docs/superpowers/plans/2026-08-17-aurora-nl-p1-layouts-foundation.md` (verified at `1441704`).

## Global Constraints

- **The user owns placement; the system owns safety** (spec §1). Nothing auto-swaps, derives, guesses, or re-flows. The narrow floor below ~600 CSS px is "the only automatic behavior in the system, it is purely mechanical (no reordering logic)" (spec §2.2).
- **Widget bounds are the rendered content** (spec §2.2). `ITEM_BOXES`/`BASE_BOXES` are deleted; outlines/hit areas follow the true content rect.
- **No hidden coordinate planes** (spec §2.2). `SMALL_CANVAS_COORDINATE_HEIGHT` and content-derived plane interpretation are deleted.
- **Plain clicks never paint a selection ring** (spec §2.5). `.board-item:focus-within` is deleted; keyboard focus shows the browser indicator on the actual focused control only.
- **The legacy `layout` key is never written by named-layouts code.** Pre-existing legacy actions (Settings "Reset layout" for V1/V2 stores, "Restore previous layout") keep their existing writes — they predate this system and remain user actions on the recovery input.
- **No eager rewrite at boot.** The `layouts` key is written only by `saveLayoutsDocument` (no caller ships in NL-P2 — the switcher UI is NL-P3). All derivation stays in-memory.
- **Deletions are reference-proven** (spec §3): before deleting a file or CSS block, grep proves no live reference remains; focused regressions cover each deletion family.
- **Preserved:** storage authority, migrations, backup validation/redaction, exact V1/V2/V3 recovery, `canvasAdapter.ts` (recovery + migration input), connector identities, credentials, permissions, Notes ownership, Calendar/ICS contracts, CSP, dependencies, the protected original checkout (`D:\DEV\Chrome plugin`, read-only, `eb1354b`), all Chrome Web Store state.
- **Kept for NL-P3** (spec §2.5 "existing behavior, retained"): `src/newtab/arrange/canvasSnap.ts` (+test) and `src/newtab/arrange/useLongPress.ts` (+test). Everything else under `src/newtab/arrange/` is deleted in this packet.
- **Bookmarks exemption** (spec §2.3): the media-gated ≤720px compact-width behavior in CSS is untouched.
- Height-responsive `short`/`xshort`/`mid` CSS tiers (V1-era) are untouched.
- **Strict TDD**, bounded commits, working directory `D:\DEV\Chrome plugin-aurora-2`, one bounded review plus at most one fix/rereview cycle, ledger checkpoint at the end.

## Scope decisions locked by this plan

1. **Migration-input profile selection is not runtime auto-swap.** `deriveMyLayout` needs to know which stored V3 profile represents the user's layout. The width rule from `selectCanvasProfile` moves into `myLayoutAdapter.ts` as `migrationSourceProfile(viewport)` — documented as the frozen interpreter of PRE-named-layouts storage. While `layouts` is null (every real user until NL-P3 ships a save path), the derived "My layout" follows the window's migration profile exactly as the app behaves today; the moment a document is saved, rendering is anchor-glued and nothing ever swaps again. Deleting the rule entirely would instead force a one-time guess at first boot, which loses information the user's V3 profiles still carry.
2. **Enabled-but-unplaced widgets get the deterministic in-memory center default, never a write.** For a STORED document whose active layout lacks a widget the user just enabled in Settings, `planLayoutRender` places it with the same center rule `deriveMyLayout` uses (in-memory only). Membership is persisted at the user's next explicit layout save (NL-P3). This keeps Settings toggles working with zero new write paths. A widget present in the layout but currently unavailable (toggle off, connector unconfigured) simply does not render.
3. **Tier fallback is deterministic, never a redesign:** if a stored tier is not in the entry's declared `canvasSizes`, render the supported size with the smallest distance in the order compact < standard < full, ties toward the smaller size (`resolveRenderTier`).
4. **Between NL-P2 and NL-P3 the canvas is view-only.** The Arrange artboard is deleted with its machinery; the Settings "Arrange layout" row and profile copy go with it. Live editing returns in NL-P3. The branch is unreleased and the Store is blocked, so no user loses a shipped capability.
5. **Top-docked items render in a minimal fixed top strip** (`.canvas-top-bar`, mirror of the bottom strip). Only a hand-authored stored document can produce them before NL-P4; the real Docked-tier strip with fade-masked overflow is NL-P4's deliverable.
6. **Text scale loses the profile abstraction but keeps its exact behavior:** `projectTextScale` maps `auto` to `large` on exactly the viewports that were `display`/`ultrawide` (width ≥ 2200 and height ≥ 1100, or width ≥ 1600 and aspect ≥ 2.1).

---

### Task 1: Pure render planner

**Files:**
- Create: `src/lib/layout/renderLayout.ts`
- Test: `src/lib/layout/renderLayout.test.ts`

**Interfaces:**
- Consumes: `NamedLayout`, `NamedLayoutPlacement`, `WidgetTier`, `DockEdge`, `ANCHOR_POINTS` from `./namedLayouts`; `BLOCK_IDS`, `BlockId` from `./types`.
- Produces (Task 2 renders from these):

```ts
export const NARROW_FLOOR_WIDTH = 600
export interface AnchoredRenderItem {
  id: BlockId; mode: 'anchored'; leftPct: number; topPct: number
  tier: WidgetTier; layer: number
}
export interface StackedRenderItem { id: BlockId; mode: 'stacked'; order: number; tier: WidgetTier }
export interface DockedRenderItem { id: BlockId; mode: 'docked'; dock: DockEdge; order: number }
export type LayoutRenderItem = AnchoredRenderItem | StackedRenderItem | DockedRenderItem
export interface LayoutRenderPlan { narrow: boolean; items: LayoutRenderItem[] }
export function planLayoutRender(
  layout: NamedLayout,
  enabledIds: readonly BlockId[],
  viewportWidth: number,
): LayoutRenderPlan
export function resolveRenderTier(supported: readonly WidgetTier[], tier: WidgetTier): WidgetTier
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/layout/renderLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  NARROW_FLOOR_WIDTH,
  planLayoutRender,
  resolveRenderTier,
  type AnchoredRenderItem,
  type StackedRenderItem,
} from './renderLayout'
import type { NamedLayout } from './namedLayouts'
import type { BlockId } from './types'

const LAYOUT: NamedLayout = {
  id: 'my-layout',
  name: 'My layout',
  widgets: {
    clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -30, tier: 'full', layer: 2 },
    weather: { kind: 'free', anchor: 'top-right', offsetX: -7, offsetY: 13, tier: 'standard', layer: 1 },
    quote: { kind: 'free', anchor: 'bottom', offsetX: 0, offsetY: -13, tier: 'standard', layer: 0 },
    bookmarks: { kind: 'docked', dock: 'bottom', order: 0 },
    timer: { kind: 'docked', dock: 'top', order: 1 },
    tasks: { kind: 'docked', dock: 'top', order: 0 },
  },
}

const ENABLED: readonly BlockId[] = ['clock', 'weather', 'quote', 'bookmarks', 'timer', 'tasks', 'notes']

describe('planLayoutRender (anchored)', () => {
  const plan = planLayoutRender(LAYOUT, ENABLED, 1408)

  it('positions free placements at anchor point plus offset, in percent', () => {
    expect(plan.narrow).toBe(false)
    const clock = plan.items.find((item) => item.id === 'clock') as AnchoredRenderItem
    expect(clock).toMatchObject({ mode: 'anchored', leftPct: 50, topPct: 20, tier: 'full', layer: 2 })
    const weather = plan.items.find((item) => item.id === 'weather') as AnchoredRenderItem
    expect(weather).toMatchObject({ leftPct: 93, topPct: 13 })
    const quote = plan.items.find((item) => item.id === 'quote') as AnchoredRenderItem
    expect(quote).toMatchObject({ leftPct: 50, topPct: 87 })
  })

  it('clamps degenerate offsets onto the plane without re-flowing anything', () => {
    const wild: NamedLayout = {
      ...LAYOUT,
      widgets: { clock: { kind: 'free', anchor: 'top-left', offsetX: -40, offsetY: 250, tier: 'compact', layer: 0 } },
    }
    const item = planLayoutRender(wild, ['clock'], 1408).items[0] as AnchoredRenderItem
    expect(item.leftPct).toBe(0)
    expect(item.topPct).toBe(100)
  })

  it('keeps docked placements as dock items with their edge and order', () => {
    expect(plan.items.find((item) => item.id === 'bookmarks')).toEqual({
      id: 'bookmarks', mode: 'docked', dock: 'bottom', order: 0,
    })
    expect(plan.items.find((item) => item.id === 'timer')).toEqual({
      id: 'timer', mode: 'docked', dock: 'top', order: 1,
    })
  })

  it('gives an enabled widget missing from the layout the deterministic in-memory center default above every stored layer, and never renders a disabled one', () => {
    const notes = plan.items.find((item) => item.id === 'notes') as AnchoredRenderItem
    expect(notes).toMatchObject({ mode: 'anchored', leftPct: 50, topPct: 50, tier: 'standard', layer: 3 })
    expect(plan.items.some((item) => item.id === 'search')).toBe(false)
    const disabled = planLayoutRender(LAYOUT, ['clock'], 1408)
    expect(disabled.items.map((item) => item.id)).toEqual(['clock'])
  })
})

describe('planLayoutRender (narrow floor)', () => {
  it('below the floor renders one mechanical stack: docks first (top then bottom, by order), then free items in layer order', () => {
    const plan = planLayoutRender(LAYOUT, ENABLED, NARROW_FLOOR_WIDTH - 1)
    expect(plan.narrow).toBe(true)
    const ids = plan.items.map((item) => item.id)
    expect(ids).toEqual(['tasks', 'timer', 'bookmarks', 'quote', 'weather', 'clock', 'notes'])
    expect(plan.items.every((item) => item.mode === 'stacked')).toBe(true)
    expect((plan.items as StackedRenderItem[]).map((item) => item.order)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('exactly at the floor width stays anchored', () => {
    expect(planLayoutRender(LAYOUT, ENABLED, NARROW_FLOOR_WIDTH).narrow).toBe(false)
  })
})

describe('resolveRenderTier', () => {
  it('returns the tier when supported and the nearest supported tier otherwise, ties toward smaller', () => {
    expect(resolveRenderTier(['compact', 'standard', 'full'], 'standard')).toBe('standard')
    expect(resolveRenderTier(['compact'], 'full')).toBe('compact')
    expect(resolveRenderTier(['compact', 'full'], 'standard')).toBe('compact')
    expect(resolveRenderTier([], 'standard')).toBe('standard')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/layout/renderLayout.test.ts`
Expected: FAIL — cannot resolve `./renderLayout`.

- [ ] **Step 3: Implement**

Create `src/lib/layout/renderLayout.ts`:

```ts
import {
  ANCHOR_POINTS,
  type DockEdge,
  type NamedLayout,
  type WidgetTier,
} from './namedLayouts'
import { BLOCK_IDS, type BlockId } from './types'

/** Spec 2.2 narrow floor: below approximately 600 CSS px of width the layout
 *  renders as one vertical stack. The only automatic behavior in the system,
 *  and purely mechanical. */
export const NARROW_FLOOR_WIDTH = 600

export interface AnchoredRenderItem {
  id: BlockId
  mode: 'anchored'
  leftPct: number
  topPct: number
  tier: WidgetTier
  layer: number
}
export interface StackedRenderItem { id: BlockId; mode: 'stacked'; order: number; tier: WidgetTier }
export interface DockedRenderItem { id: BlockId; mode: 'docked'; dock: DockEdge; order: number }
export type LayoutRenderItem = AnchoredRenderItem | StackedRenderItem | DockedRenderItem
export interface LayoutRenderPlan { narrow: boolean; items: LayoutRenderItem[] }

const TIER_ORDER: readonly WidgetTier[] = ['compact', 'standard', 'full']

/** Deterministic fallback when a stored tier isn't supported by the widget:
 *  nearest supported size in tier order, ties toward the smaller size. Never
 *  invents a composition — only picks among what the widget declares. */
export function resolveRenderTier(supported: readonly WidgetTier[], tier: WidgetTier): WidgetTier {
  if (supported.length === 0 || supported.includes(tier)) return tier
  const target = TIER_ORDER.indexOf(tier)
  let best: WidgetTier = supported[0]
  let bestDistance = Infinity
  for (const candidate of TIER_ORDER) {
    if (!supported.includes(candidate)) continue
    const distance = Math.abs(TIER_ORDER.indexOf(candidate) - target)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value))
}

interface PlannedFree { id: BlockId; leftPct: number; topPct: number; tier: WidgetTier; layer: number }
interface PlannedDock { id: BlockId; dock: DockEdge; order: number }

export function planLayoutRender(
  layout: NamedLayout,
  enabledIds: readonly BlockId[],
  viewportWidth: number,
): LayoutRenderPlan {
  const enabled = new Set<BlockId>(enabledIds)
  const free: PlannedFree[] = []
  const docked: PlannedDock[] = []
  let maxLayer = -1

  for (const id of BLOCK_IDS) {
    if (!enabled.has(id)) continue
    const placement = layout.widgets[id]
    if (!placement) continue
    if (placement.kind === 'docked') {
      docked.push({ id, dock: placement.dock, order: placement.order })
      continue
    }
    const anchor = ANCHOR_POINTS[placement.anchor]
    free.push({
      id,
      leftPct: clampPct(anchor.x + placement.offsetX),
      topPct: clampPct(anchor.y + placement.offsetY),
      tier: placement.tier,
      layer: placement.layer,
    })
    maxLayer = Math.max(maxLayer, placement.layer)
  }

  // Enabled widgets the layout doesn't know yet: the same deterministic
  // in-memory center default deriveMyLayout uses (scope decision 2). Nothing
  // is written; membership persists at the user's next explicit save.
  let nextLayer = maxLayer + 1
  for (const id of BLOCK_IDS) {
    if (!enabled.has(id)) continue
    if (layout.widgets[id]) continue
    free.push({ id, leftPct: 50, topPct: 50, tier: 'standard', layer: nextLayer })
    nextLayer += 1
  }

  const dockSorted = [...docked].sort((a, b) => (
    a.dock === b.dock ? a.order - b.order : a.dock === 'top' ? -1 : 1
  ))

  if (viewportWidth < NARROW_FLOOR_WIDTH) {
    // Spec 2.2: docks render first, then free-floating widgets in layer
    // order. Mechanical: stable BLOCK_IDS position breaks layer ties.
    const blockIndex = new Map(BLOCK_IDS.map((id, index) => [id, index]))
    const freeSorted = [...free].sort((a, b) => (
      a.layer === b.layer
        ? (blockIndex.get(a.id) ?? 0) - (blockIndex.get(b.id) ?? 0)
        : a.layer - b.layer
    ))
    const items: StackedRenderItem[] = [...dockSorted, ...freeSorted].map((item, order) => ({
      id: item.id,
      mode: 'stacked',
      order,
      tier: 'tier' in item ? item.tier : 'compact',
    }))
    return { narrow: true, items }
  }

  return {
    narrow: false,
    items: [
      ...dockSorted.map((item): DockedRenderItem => ({ id: item.id, mode: 'docked', dock: item.dock, order: item.order })),
      ...free.map((item): AnchoredRenderItem => ({ id: item.id, mode: 'anchored', ...item })),
    ].map((item) => item),
  }
}
```

Note the stacked tier for docked items is `'compact'` — the narrow stack renders every previously docked widget at its densest free composition until NL-P5 delivers true Docked tiers.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/layout/renderLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: TypeScript, hygiene, commit**

Run: `npx tsc --noEmit` then `git diff --check`

```bash
git add src/lib/layout/renderLayout.ts src/lib/layout/renderLayout.test.ts
git commit -m "feat(canvas): pure anchored/stacked/docked render planner"
```

---

### Task 2: Migration-input profile rule moves into the adapter

**Files:**
- Modify: `src/lib/layout/myLayoutAdapter.ts`
- Modify: `src/newtab/useCanvasViewport.ts` (drop `selectCanvasProfile` and the profile return)
- Test: `src/lib/layout/myLayoutAdapter.test.ts`, `src/newtab/useCanvasViewport.test.tsx`

**Interfaces:**
- Produces: `migrationSourceProfile(viewport: { width: number; height: number }): CanvasProfileKey` exported from `myLayoutAdapter.ts`. `useCanvasViewport()` now returns only `{ width, height }`.
- Consumers in Task 3: App calls `resolveLayoutsDocument(layoutsValue, storedLayout, migrationSourceProfile(viewport), enabledIds)`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/layout/myLayoutAdapter.test.ts`:

```ts
import { migrationSourceProfile } from './myLayoutAdapter'

describe('migrationSourceProfile', () => {
  it('is the frozen width-only interpreter of pre-named-layouts storage', () => {
    expect(migrationSourceProfile({ width: 899, height: 1200 })).toBe('compact')
    expect(migrationSourceProfile({ width: 900, height: 445 })).toBe('standard')
    expect(migrationSourceProfile({ width: 1408, height: 445 })).toBe('standard')
    expect(migrationSourceProfile({ width: 1920, height: 500 })).toBe('ultrawide')
    expect(migrationSourceProfile({ width: 2560, height: 1440 })).toBe('display')
    expect(migrationSourceProfile({ width: 3440, height: 1440 })).toBe('ultrawide')
  })
})
```

(Merge the import into the file's existing import from `./myLayoutAdapter`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/layout/myLayoutAdapter.test.ts`
Expected: FAIL — `migrationSourceProfile` not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/layout/myLayoutAdapter.ts` (behavior copied byte-for-byte from the retired `selectCanvasProfile`, including the a325891 width-only rule):

```ts
/** The frozen interpreter of PRE-named-layouts storage: which stored V3
 *  profile represents "the user's layout" when deriving My layout. This is
 *  migration input, NOT runtime profile selection — once a layouts document
 *  is saved, rendering never consults window size again (beyond the
 *  mechanical narrow floor). Width-only per the a325891 short-height fix. */
export function migrationSourceProfile(viewport: { width: number; height: number }): CanvasProfileKey {
  const { width, height } = viewport
  if (width < 900) return 'compact'
  if (width >= 1600 && width / height >= 2.1) return 'ultrawide'
  if (width >= 2200 && height >= 1100) return 'display'
  return 'standard'
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/layout/myLayoutAdapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Slim useCanvasViewport (RED first)**

In `src/newtab/useCanvasViewport.test.tsx`, update expectations: the hook returns `{ width, height }` with no `profile` member, and delete tests of `selectCanvasProfile` (they move to the adapter test above). Add:

```ts
it('publishes only width and height — profile selection is gone with the auto-swap machinery', () => {
  // render the hook via its existing harness in this file
  // assert: 'profile' in result.current === false
})
```

Write it with the file's existing render harness (it already renders the hook; copy the file's own mount idiom — this is the one place the executor adapts to in-file style rather than pasting). Run to observe RED, then edit `src/newtab/useCanvasViewport.ts`: delete `selectCanvasProfile` and the `CanvasProfileKey` import; return `{ ...viewport }`; keep the retired-property cleanup effect and the resize listener unchanged. App will not compile until Task 3 — that is expected; commit Tasks 2+3 together only if `npx tsc --noEmit` cannot pass, otherwise commit here:

Run: `npx vitest run src/newtab/useCanvasViewport.test.tsx src/lib/layout/myLayoutAdapter.test.ts`
Expected: PASS. If `tsc` fails only because `App.tsx`/`CanvasSurface.tsx` still reference `viewport.profile`, proceed to Task 3 and make the Task 3 commit include this file (note it in the commit body).

```bash
git add src/lib/layout/myLayoutAdapter.ts src/lib/layout/myLayoutAdapter.test.ts src/newtab/useCanvasViewport.ts src/newtab/useCanvasViewport.test.tsx
git commit -m "feat(canvas): freeze profile rule as migration input only"
```

---

### Task 3: CanvasSurface/CanvasItem rebuild and App wiring

**Files:**
- Rewrite: `src/newtab/canvas/CanvasSurface.tsx`, `src/newtab/canvas/CanvasItem.tsx`
- Modify: `src/newtab/App.tsx`, `src/newtab/canvas/canvasTextScale.ts`
- Modify: `src/newtab/index.css` (canvas block ~lines 40–101; board-item block ~lines 1616–1910)
- Test: `src/newtab/canvas/CanvasSurface.test.tsx`, `src/newtab/canvas/CanvasItem.test.tsx`, `src/newtab/canvas/canvasTextScale.test.ts`, `src/newtab/App.test.tsx`

**Interfaces:**
- `CanvasSurface` new props:

```ts
interface CanvasSurfaceProps {
  activeLayout: NamedLayout
  entries: readonly WidgetRegistryEntry[]
  viewport: { width: number; height: number }
  elevatedIds?: ReadonlySet<WidgetRegistryEntry['id']>
  onItemGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  renderWidget: (entry: WidgetRegistryEntry, size: CanvasSize) => ReactNode
}
```

- `CanvasItem` new props: `{ entry, item: LayoutRenderItem, className?, onGeometryChange?, children }`. Emits `canvas-item` class only (no `board-item`, no `data-stage-variant`, no `data-arrange-long-press-controls`), keeps `data-block-id`, `data-canvas-size` (the resolved tier), adds `data-canvas-mode` (`anchored` | `stacked` | `docked`).
- `projectTextScale(stored: LayoutDensityPreference, viewport: { width: number; height: number }): TextScale` (profile member gone).
- App renders: `resolveLayoutsDocument(layouts, storedLayout, migrationSourceProfile(viewport), enabledBlockIds)` → `document.layouts.find((l) => l.id === document.activeLayoutId)!` → `<CanvasSurface activeLayout={...} .../>`.

- [ ] **Step 1: Write the failing CanvasSurface tests**

Rewrite `src/newtab/canvas/CanvasSurface.test.tsx` around the new contract (keep the file's existing React Testing Library harness and registry fixtures; replace profile-based cases):

```tsx
// Fixture: a NamedLayout with clock anchored center offset (0,-30) full/layer 2,
// weather top-right (-7,13) standard/layer 1, bookmarks docked bottom order 0.
// entries: the registry entries for those ids (reuse the file's fixture helpers).

it('positions anchored items by percent with centering translate and layer z-index', () => {
  // render CanvasSurface with viewport {width: 1408, height: 445}
  const clock = screen.getByTestId('canvas-item-clock')
  expect(clock.style.left).toBe('50%')
  expect(clock.style.top).toBe('20%')
  expect(clock.style.zIndex).toBe('2')
  expect(clock.style.width).toBe('')       // content-tight: no fixed box
  expect(clock.style.minHeight).toBe('')
  expect(clock.dataset.stageVariant).toBeUndefined()
  expect(clock.className).not.toMatch(/board-item/)
})

it('renders docked items in the bottom strip in order and nothing in the surface for them', () => {
  const nav = screen.getByRole('navigation', { name: 'Bottom bar' })
  expect(within(nav).getByTestId('canvas-item-bookmarks')).toBeInTheDocument()
})

it('renders the mechanical stack below the narrow floor: docks first, then free in layer order', () => {
  // render with viewport {width: 599, height: 800}
  const surface = screen.getByLabelText('Canvas')
  expect(surface.dataset.canvasNarrow).toBe('true')
  const ids = [...surface.querySelectorAll('[data-block-id]')].map((el) => el.getAttribute('data-block-id'))
  expect(ids).toEqual(['bookmarks', 'weather', 'clock'])
})

it('gives an enabled widget missing from the layout the center default without writing anything', () => {
  // entries include 'notes'; layout.widgets does not
  const notes = screen.getByTestId('canvas-item-notes')
  expect(notes.style.left).toBe('50%')
  expect(notes.style.top).toBe('50%')
})

it('resolves an unsupported stored tier to the nearest declared size', () => {
  // entry for 'timer' declares canvasSizes ['compact']; layout stores tier 'full'
  expect(screen.getByTestId('canvas-item-timer').dataset.canvasSize).toBe('compact')
})
```

Rewrite `src/newtab/canvas/CanvasItem.test.tsx` expectations likewise: no `board-item` class, no `data-stage-variant`, `data-canvas-mode` present, geometry publication unchanged.

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run src/newtab/canvas`
Expected: FAIL on the new expectations.

- [ ] **Step 3: Rewrite CanvasItem**

`src/newtab/canvas/CanvasItem.tsx`:

```tsx
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { LayoutRenderItem } from '../../lib/layout/renderLayout'
import type { WidgetRegistryEntry } from '../widgetRegistry'
import WidgetBoundary from '../components/WidgetBoundary'

interface CanvasItemProps {
  entry: WidgetRegistryEntry
  item: LayoutRenderItem
  className?: string
  onGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  children: ReactNode
}

export default function CanvasItem({ entry, item, className = '', onGeometryChange, children }: CanvasItemProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!onGeometryChange || !ref.current) return
    const publish = () => {
      if (ref.current) onGeometryChange(entry.id, ref.current.getBoundingClientRect())
    }
    publish()
    if (typeof ResizeObserver === 'undefined') return () => onGeometryChange(entry.id, null)
    const observer = new ResizeObserver(publish)
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      onGeometryChange(entry.id, null)
    }
  }, [entry.id, onGeometryChange])

  // Content-tight (spec 2.2): the item box is the rendered content. Anchored
  // items are positioned by percent and centered on their point; no width or
  // height is ever imposed here.
  const style: CSSProperties = item.mode === 'anchored' ? {
    position: 'absolute',
    left: `${item.leftPct}%`,
    top: `${item.topPct}%`,
    transform: 'translate(-50%, -50%)',
    zIndex: item.layer,
  } : {
    position: 'relative',
    flex: '0 0 auto',
  }

  const size = 'tier' in item ? item.tier : 'compact'

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-testid={`canvas-item-${entry.id}`}
      data-block-id={entry.id}
      data-canvas-size={size}
      data-canvas-mode={item.mode}
      className={`canvas-item${className ? ` ${className}` : ''}`}
      style={style}
    >
      <WidgetBoundary name={entry.label}>{children}</WidgetBoundary>
    </div>
  )
}
```

(The resolved tier is computed by CanvasSurface via `resolveRenderTier` and threaded through the item's `tier` before it reaches CanvasItem — see Step 4.)

- [ ] **Step 4: Rewrite CanvasSurface**

`src/newtab/canvas/CanvasSurface.tsx`:

```tsx
import { useMemo, type ReactNode } from 'react'
import {
  planLayoutRender,
  resolveRenderTier,
  type AnchoredRenderItem,
  type DockedRenderItem,
  type LayoutRenderItem,
  type StackedRenderItem,
} from '../../lib/layout/renderLayout'
import type { NamedLayout } from '../../lib/layout/namedLayouts'
import type { CanvasSize } from '../../lib/layout/canvasTypes'
import CanvasItem from './CanvasItem'
import CanvasLegibilityLayer from './CanvasLegibilityLayer'
import type { WidgetRegistryEntry } from '../widgetRegistry'

interface CanvasSurfaceProps {
  activeLayout: NamedLayout
  entries: readonly WidgetRegistryEntry[]
  viewport: { width: number; height: number }
  elevatedIds?: ReadonlySet<WidgetRegistryEntry['id']>
  onItemGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  renderWidget: (entry: WidgetRegistryEntry, size: CanvasSize) => ReactNode
}

export default function CanvasSurface({
  activeLayout,
  entries,
  viewport,
  elevatedIds,
  onItemGeometryChange,
  renderWidget,
}: CanvasSurfaceProps) {
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const plan = useMemo(() => {
    const enabledIds = entries.map((entry) => entry.id)
    const raw = planLayoutRender(activeLayout, enabledIds, viewport.width)
    // Resolve stored tiers against each widget's declared sizes exactly once.
    const items = raw.items.map((item): LayoutRenderItem => {
      if (!('tier' in item)) return item
      const entry = byId.get(item.id)
      return entry ? { ...item, tier: resolveRenderTier(entry.canvasSizes, item.tier) } : item
    })
    return { ...raw, items }
  }, [activeLayout, byId, entries, viewport.width])

  const anchored = plan.items.filter((item): item is AnchoredRenderItem => item.mode === 'anchored')
  const stacked = plan.items.filter((item): item is StackedRenderItem => item.mode === 'stacked')
  const topDock = plan.items
    .filter((item): item is DockedRenderItem => item.mode === 'docked' && item.dock === 'top')
    .sort((a, b) => a.order - b.order)
  const bottomDock = plan.items
    .filter((item): item is DockedRenderItem => item.mode === 'docked' && item.dock === 'bottom')
    .sort((a, b) => a.order - b.order)

  const renderItem = (item: LayoutRenderItem) => {
    const entry = byId.get(item.id)
    if (!entry) return null
    const size = 'tier' in item ? item.tier : 'compact'
    return (
      <CanvasItem
        key={entry.id}
        entry={entry}
        item={item}
        className={elevatedIds?.has(entry.id) ? 'canvas-item--elevated' : ''}
        onGeometryChange={onItemGeometryChange}
      >
        {renderWidget(entry, size)}
      </CanvasItem>
    )
  }

  return (
    <div data-canvas-root="" className="canvas-root">
      {topDock.length > 0 ? (
        <nav aria-label="Top bar" className="canvas-top-bar">{topDock.map(renderItem)}</nav>
      ) : null}
      <section
        aria-label="Canvas"
        data-canvas-surface=""
        data-canvas-narrow={plan.narrow ? 'true' : undefined}
        className={plan.narrow ? 'canvas-surface canvas-surface--stack' : 'canvas-surface'}
        style={plan.narrow ? undefined : { minHeight: `${viewport.height}px` }}
      >
        <CanvasLegibilityLayer />
        {plan.narrow ? stacked.map(renderItem) : anchored.map(renderItem)}
      </section>
      {bottomDock.length > 0 ? (
        <nav aria-label="Bottom bar" className="canvas-bottom-bar">{bottomDock.map(renderItem)}</nav>
      ) : null}
    </div>
  )
}
```

Note: in narrow mode the stack contains dock members too (spec: docks render first in the stack), so the top/bottom strips render only when `plan.narrow` is false — `planLayoutRender` already returns no `docked` items in narrow mode.

- [ ] **Step 5: CSS — content sizing, stack, top bar, focus ring, selector migration**

In `src/newtab/index.css`:

1. `.canvas-item` (line ~63): add `width: max-content;` (content-tight). Keep `max-width: calc(100vw - 16px)` and `container-type: inline-size`.
2. Add after the `.canvas-bottom-bar .canvas-item` rule:

```css
.canvas-top-bar {
  position: fixed;
  z-index: 30;
  right: 50%;
  top: 16px;
  display: flex;
  max-width: calc(100vw - 144px);
  translate: 50% 0;
  gap: 8px;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-width: thin;
}
.canvas-top-bar .canvas-item {
  container-type: normal;
  width: max-content;
}

/* Narrow floor (spec 2.2): one mechanical vertical stack below 600px. */
.canvas-surface--stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 8px;
}
.canvas-surface--stack .canvas-item {
  position: relative;
}
```

3. Delete the `.board-item:focus-within` rule (line ~1809) entirely. No replacement: plain clicks never paint a ring; the browser's own `:focus-visible` indicator on inner controls is untouched.
4. Migrate the LIVE `board-item` rules to the new emission, replacing selectors mechanically:
   - `.board-item[data-block-id="X"] > *` pointer-events fall-through list (lines ~1798–1807) → `.canvas-item[data-block-id="X"] > *`.
   - Every `.board-item[data-stage-variant="compact"][data-block-id="weather"]…` rule (lines ~1818–1878) → `.canvas-item[data-canvas-size="compact"][data-block-id="weather"]…` (same suffixes, `:not(.z-30)` retained).
   - `.board-item[data-block-id="weather"].z-30 > section` and the `@container` block and `.board-item:not(.board-item--dock)[data-block-id="weather"]…` family (lines ~1879–1907+) → `.canvas-item` equivalents; `:not(.board-item--dock)` becomes `[data-canvas-mode="anchored"]`.
   - `.board-item[data-block-id="bookmarks"]` rules (lines ~1749–1760): migrate to `.canvas-item[data-block-id="bookmarks"]`.
5. Reference-proof deletions: `rg 'board-item|stage-zone|data-stage-variant' src/` — every remaining hit must be either (a) a dead CSS rule to delete in this step (`.stage-zone--*`, `.board-item` leftovers, line ~1616 and ~1626 blocks after migration), or (b) a test asserting the ABSENCE of these emissions. Delete the dead rules. `src/lib/layout/legacyRetirement.test.ts` and `src/newtab/adaptiveStageLegibility.test.ts` may pin old selectors — update them to assert the retirement (no `board-item` emission anywhere) rather than deleting coverage.

- [ ] **Step 6: Text scale (RED first)**

Update `src/newtab/canvas/canvasTextScale.test.ts`: replace profile-based cases with viewport-based ones asserting identical outcomes (`auto` at 2560x1440 → large; 3440x1440 → large; 1920x500 → large (aspect ≥ 2.1 and width ≥ 1600); 1408x445 → standard; 1600x900 → standard; `spacious` → large anywhere; `compact`/`balanced` → standard anywhere). Run RED, then:

```ts
import type { LayoutDensityPreference } from '../../lib/layout/types'

export type TextScale = 'standard' | 'large'

export function projectTextScale(
  stored: LayoutDensityPreference,
  viewport: { width: number; height: number },
): TextScale {
  if (stored === 'spacious') return 'large'
  if (stored !== 'auto') return 'standard'
  const { width, height } = viewport
  const ultrawide = width >= 1600 && width / height >= 2.1
  const display = width >= 2200 && height >= 1100
  return ultrawide || display ? 'large' : 'standard'
}
```

- [ ] **Step 7: App wiring**

In `src/newtab/App.tsx`:
- Add `const [layouts] = useStoredKey('layouts')` beside the other keys.
- Delete: `ArrangeController`, `ArrangeArtboard`, `arrangePreview`, `arranging`, `arrangeSignal`, `requestArrange`, `wasArrangingRef`, the arrange-related `useEffect`, the `data-arranging`/`data-arrange-profile`/`data-arrange-viewport-mode` attributes, the `previewProfile`/`visibleCanvasEntries` derivations, and both Arrange JSX blocks. `SettingsPanel` loses its `onArrangeLayout` prop (Task 4 updates SettingsPanel), `PaletteHost` loses `arranging`.
- Compute:

```tsx
const enabledBlockIds = useMemo(() => activeEntries.map((entry) => entry.id), [activeEntries])
const layoutsDocument = useMemo(() => (
  inputsReady && storedLayout && layouts !== undefined
    ? resolveLayoutsDocument(layouts, storedLayout, migrationSourceProfile(viewport), enabledBlockIds)
    : null
), [enabledBlockIds, inputsReady, layouts, storedLayout, viewport.width, viewport.height])
const activeLayout = layoutsDocument
  ? layoutsDocument.layouts.find((layout) => layout.id === layoutsDocument.activeLayoutId) ?? null
  : null
```

Gate render readiness on `activeLayout` too, and render `<CanvasSurface activeLayout={activeLayout} entries={activeEntries} viewport={viewport} elevatedIds={elevatedIds} renderWidget={renderWidget} />`. `data-canvas-profile` on `<main>` is deleted; `textScale` uses the new signature; the `inert` guard `utilityTrayOpen && viewport.profile === 'compact'` becomes `utilityTrayOpen && viewport.width < 900` and `UtilityTray`'s `modal` prop likewise (`viewport.width < 900` — the pre-existing Settings/Tray narrow modality boundary, unrelated to the 600px narrow floor).
- Update `src/newtab/App.test.tsx`: delete the Arrange interaction families (the deleted feature), keep and adapt the toggle-geometry-stability tests to the new attributes (positions are now `style.left/top` percents; the stability contract — toggles never move survivors — must still pass, now trivially because placement comes from the stored layout, not count-based defaults).

- [ ] **Step 8: Run the canvas and App families**

Run: `npx vitest run src/newtab/canvas src/newtab/App.test.tsx src/newtab/useCanvasViewport.test.tsx src/lib/layout`
Expected: PASS.

- [ ] **Step 9: TypeScript, hygiene, commit**

`npx tsc --noEmit` will now surface every remaining consumer of the deleted props/exports (Arrange files, Settings). Task 4 removes them — if tsc cannot pass standalone, fold this commit into Task 4's and say so in the commit body. Otherwise:

```bash
git add src/newtab/canvas src/newtab/App.tsx src/newtab/App.test.tsx src/newtab/index.css src/newtab/useCanvasViewport.ts src/newtab/useCanvasViewport.test.tsx
git commit -m "feat(canvas): anchored content-tight rendering with narrow floor"
```

---

### Task 4: Deletions with reference proof

**Files:**
- Delete: `src/newtab/arrange/ArrangeController.tsx` (+test), `ArrangeArtboard.tsx` (+test), `arrangePreview.ts`, `arrangeViewport.ts` (+test), `canvasDraft.ts` (+test), `profileEditor.ts` (+test)
- Keep: `src/newtab/arrange/canvasSnap.ts` (+test), `useLongPress.ts` (+test) — NL-P3 consumes them (global constraint).
- Delete: `src/lib/layout/canvasDefaults.ts` (+test), `src/lib/layout/canvasGeometry.ts` (+test)
- Modify: `src/settings/SettingsPanel.tsx` (drop `onArrangeLayout` threading), `src/settings/sections/Layout.tsx`, `src/newtab/widgets/palette/PaletteHost.tsx` (drop `arranging`), `src/newtab/index.css` (arrange artboard CSS block ~lines 103–160)
- Test: `src/settings/SettingsPanel.test.tsx`, `src/lib/layout/legacyRetirement.test.ts`

**Interfaces:** none new. After this task, `rg` proves zero live references to: `selectCanvasProfile`, `canvasDefaults`, `resolveCanvasProfile`, `fitCanvasProfile`, `canvasMinimumHeight`, `canvasBoxFor`, `ITEM_BOXES`, `BASE_BOXES`, `SMALL_CANVAS_COORDINATE_HEIGHT`, `CANVAS_PROFILE_LABELS`, `ArrangeController`, `ArrangeArtboard`, `arrangePreview`, `canvasDraft`, `profileEditor`, `arrangeViewport`, `board-item`, `data-stage-variant`, `stage-zone`.

- [ ] **Step 1: Write the failing retirement regression**

Add to `src/lib/layout/legacyRetirement.test.ts` (follow its existing source-scan idiom — it greps source files for retired symbols):

```ts
it('the automatic profile machinery is gone: no live source references remain (NL-P2)', () => {
  // Using the file's existing read-source helpers, assert that no file under
  // src/ (excluding *.test.* and this file) contains: 'selectCanvasProfile',
  // 'SMALL_CANVAS_COORDINATE_HEIGHT', 'resolveCanvasProfile', 'ITEM_BOXES',
  // 'BASE_BOXES', 'CANVAS_PROFILE_LABELS', 'data-stage-variant', or a
  // 'board-item' class emission.
})
```

Write it with the file's real helper functions (read them first; the file already scans source text for retired Adaptive Stage symbols — extend the same lists). Run to observe RED (references still exist).

- [ ] **Step 2: Settings and Palette surgery**

- `src/settings/sections/Layout.tsx`: remove the `onArrangeLayout` prop, the "Widget positions"/"Arrange layout" row, and the four-profile guidance sentence. The section keeps only the legacy-only "Reset layout" (V1/V2 stores) and "Restore previous layout" (recovery input) actions, with NO guidance sentence — roadmap talk in product UI is banned by information-first copy discipline, and the two remaining actions are self-explanatory. (NL-P3 adds the layout-management UI and its copy here.)
- `src/settings/SettingsPanel.tsx`: drop the `onArrangeLayout` prop threading to `Layout`.
- `src/newtab/widgets/palette/PaletteHost.tsx`: remove the `arranging` prop and its uses.
- Update `src/settings/SettingsPanel.test.tsx`: delete the Arrange-callback test (line ~2557 family) and any four-profile copy assertions.

- [ ] **Step 3: Delete the files and dead CSS**

```bash
git rm src/newtab/arrange/ArrangeController.tsx src/newtab/arrange/ArrangeController.test.tsx
git rm src/newtab/arrange/ArrangeArtboard.tsx src/newtab/arrange/ArrangeArtboard.test.tsx
git rm src/newtab/arrange/arrangePreview.ts src/newtab/arrange/arrangeViewport.ts src/newtab/arrange/arrangeViewport.test.ts
git rm src/newtab/arrange/canvasDraft.ts src/newtab/arrange/canvasDraft.test.ts
git rm src/newtab/arrange/profileEditor.ts src/newtab/arrange/profileEditor.test.ts
git rm src/lib/layout/canvasDefaults.ts src/lib/layout/canvasDefaults.test.ts
git rm src/lib/layout/canvasGeometry.ts src/lib/layout/canvasGeometry.test.ts
```

Delete the `.arrange-artboard-*` CSS block (index.css ~lines 103–160) and any remaining `.stage-zone--*` / `.board-item` rules the Task 3 migration left (reference-proof each with `rg 'arrange-artboard|stage-zone|board-item' src/newtab/index.css` → zero hits when done). Comment references to ArrangeController in `src/lib/dialogStack.ts`, `src/lib/premium.ts`, `src/lib/ResetLayoutDialog.tsx` are prose — update the comments, not behavior.

Check `canvasAdapter.ts` still compiles standalone (it must NOT be deleted — recovery + migration input). If `semanticLayoutV2`/`restorePreviousLayout` referenced deleted geometry helpers, they didn't (verify with `rg 'canvasGeometry|canvasDefaults' src/lib/layout/canvasAdapter.ts` → zero).

- [ ] **Step 4: Run the retirement regression and full affected families**

Run: `npx vitest run src/lib/layout src/newtab/canvas src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx src/newtab/adaptiveStageLegibility.test.ts`
Expected: PASS, including the Step 1 regression now GREEN.

- [ ] **Step 5: TypeScript, hygiene, commit**

Run: `npx tsc --noEmit` (must pass now — every consumer is gone) and `git diff --check`.

```bash
git add -A
git commit -m "feat(canvas): delete auto profiles, slot catalogs, planes, boxes, and the Arrange artboard"
```

---

### Task 5: Focused real-Chromium witness

**Files:**
- Create: `scripts/preview-nl-p2.mjs` (model it on `scripts/forensic-short-height.mjs` — same production-mode build, real Chromium launch, storage seeding, and evidence JSON/PNG output conventions; read that script first)

**What it must prove (per capture: usefulness judgment, not geometry alone — A2-D060):**

1. **Displays:** 1408x445 (the owner's class), 1920x1080, 800x600, 390x844 (narrow floor), 599x800 (floor boundary).
2. **Storage shapes:** (a) fresh defaults (derived My layout), (b) V1-shaped `layout` key, (c) custom V3 `layout` key — all with `layouts: null`; plus (d) a stored v13 layouts document with anchored + bottom-docked items.
3. **Assertions per display/shape:**
   - every enabled widget renders exactly once; zero horizontal document overflow; zero runtime errors, page errors, failed requests;
   - content-tight: for three sampled widgets, the `.canvas-item` bounding rect equals its content child's rect within 1 CSS px per edge (acceptance 3);
   - no selection ring: real click on a widget, then assert `getComputedStyle(item).outlineStyle === 'none'` and no `:focus-within` outline anywhere (acceptance 4);
   - narrow floor at 390 and 599 wide: items form one vertical stack (each item's top ≥ previous item's bottom), docks first;
   - resize witness: 1408x445 → 1920x1080 → back; every anchored widget's percent position is unchanged (anchor-glued, no re-flow — acceptance 2);
   - stored-document shape (d): a top-docked item renders in the top strip; reload preserves everything byte-identical.
4. Save PNGs and `evidence.json` under `.preview-nl-p2-out/`; inspect every PNG individually and record the judgment in the ledger.

- [ ] **Step 1:** Read `scripts/forensic-short-height.mjs`, copy its build/launch/seed/capture scaffolding into `scripts/preview-nl-p2.mjs`, implement the matrix above.
- [ ] **Step 2:** `node scripts/preview-nl-p2.mjs` → exit 0 with `PASS: NL-P2 anchored canvas`. Fix any genuine failure via focused RED/GREEN on the owning file (one bounded fix family per failure; rerun once).
- [ ] **Step 3:** Inspect every capture at original resolution. A green JSON with a broken-looking page fails the packet (A2-D060) — judge usefulness.
- [ ] **Step 4:** Commit:

```bash
git add scripts/preview-nl-p2.mjs
git commit -m "test(canvas): focused NL-P2 anchored-canvas Chromium witness"
```

---

### Task 6: Packet gate, review, ledger, checkpoint

- [ ] **Step 1: Focused gate**

Run: `npx vitest run src/lib/layout src/lib/storage src/lib/backup.test.ts src/newtab/canvas src/newtab/App.test.tsx src/newtab/useCanvasViewport.test.tsx src/settings/SettingsPanel.test.tsx src/newtab/adaptiveStageLegibility.test.ts src/newtab/widgetSizeContracts.test.ts`
Plus: `npx tsc --noEmit`, `git diff --check`, and one `npm run build` (the deletion packet must prove the production build still transforms cleanly; record the module count). Do NOT run the full canonical harness (NL-P6/NL-P7 scale).

- [ ] **Step 2: Bounded review** via superpowers:requesting-code-review (one review + at most one fix/rereview). Reviewer must verify: the six §3 deletion families are reference-proven; no `layout`-key write was added; narrow floor is mechanical (no reordering logic beyond layer order); the focus ring is gone; migrationSourceProfile is called only from the resolve path; canvasSnap/useLongPress survive for NL-P3.

- [ ] **Step 3: Ledger** — STATUS.md: Last verified packet → NL-P2, Current packet → NL-P3 (plan just-in-time); add the NL-P2 evidence bullet with exact counts, deletion inventory, probe displays/shapes, and review outcome.

- [ ] **Step 4: Checkpoint**

```bash
git add docs/superpowers/aurora-2/STATUS.md
git commit -m "docs: checkpoint NL-P2 anchored canvas"
git push origin feat/aurora-2-observatory
```

- [ ] **Step 5: Repository proof** — active worktree clean and equal to origin; protected original still `eb1354b` clean.

---

## Self-review notes

- **Spec §7 NL-P2 coverage:** anchor+offset geometry — Tasks 1–3; content-sized rendering — Task 3 (CanvasItem imposes no box; CSS `width: max-content`); narrow floor — Tasks 1 and 3; deletion of boxes/planes/auto profiles — Task 4; focus-ring removal — Task 3 Step 5.3.
- **Spec §3 items deferred with reasons:** the `board-item`/`data-stage-variant` emission dies here (listed for this packet); dock overflow polish (§2.4) is NL-P4; grips/gears/edit session (§2.5) is NL-P3; tier compositions (§2.3) are NL-P5+.
- **Acceptance criteria touched:** AC2 (resize witness, Task 5), AC3 (content-tight within 1px, Task 5), AC4 (no ring, Tasks 3/5). AC1/5/6/7/8/9 belong to later packets.
- **Known risks the executor must treat as stop-and-fix, not paper over:** widget interiors that relied on the imposed box width (Weather chip, Quote, Links) may need their migrated CSS rules tuned — fix in the widget's migrated selector block with a focused test, never by reintroducing a box table. If the Task 5 probe shows a widget rendering unusably without its box, that widget gets a minimal interior width in ITS OWN CSS (content-owned, not a geometry table) and the decision is recorded in the ledger for the NL-P5 catalog.
- **Type consistency check:** `LayoutRenderItem`/`planLayoutRender`/`resolveRenderTier` signatures match between Tasks 1 and 3; `migrationSourceProfile` matches between Tasks 2 and 3; `CanvasSurfaceProps.activeLayout: NamedLayout` consistent; `projectTextScale` new signature used in App (Task 3 Step 7).
