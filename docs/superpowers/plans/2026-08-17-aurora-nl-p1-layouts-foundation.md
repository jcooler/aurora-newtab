# NL-P1 Layouts Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the named-layouts storage foundation (schema v13, the `layouts` document, the "My layout" migration adapter, and explicit-save switcher plumbing) with exact recovery and zero presentation change.

**Architecture:** A new additive top-level storage key `layouts` (default `null`) holds a validated `LayoutsDocument` of user-named layouts plus `activeLayoutId`. The legacy `layout` key is never written and remains the recovery input. Until the first explicit save of `layouts`, the runtime derives an in-memory document containing one layout, "My layout", from the current active state (enabled widgets plus the stored V1/V2/V3 layout resolved through the existing width-only profile selection). All document mutations are pure functions validated before any write; the only write path is an explicit `saveLayoutsDocument`.

**Tech Stack:** TypeScript, Vitest, existing AuroraStorage (Web-Lock authority, memory driver in tests). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md` (sections 2.1, 2.2 position model, 4 Data and migration). Forensic context: `docs/superpowers/reports/SHORT-HEIGHT-RECOVERY-FORENSICS.md`. Ledger: A2-D060, A2-D061.

## Global Constraints

- **No presentation change.** No CSS, rendered DOM, or visual behavior changes in this packet. The canvas continues to render exactly as it does at `15586e7`.
- **The legacy `layout` key is never written** by any code this packet adds. It is preserved byte-for-byte as recovery input (spec section 4).
- **No eager rewrite at boot, ever** (spec section 4). The v12 to v13 upgrade writes only version metadata. "My layout" derivation is in-memory until the user's first explicit save of the `layouts` key.
- **Storage schema advances additively (v12 to v13)** (spec section 4). `layouts` defaults to `null`; migrations for v11 and v12 are identity functions.
- **Layout writes remain explicit-save-only and atomic** under the existing cross-context storage authority (spec section 4). Every write goes through the existing `AuroraStorage` API; no new storage machinery.
- **Backup export/import carries the layouts document with full validation before any live write** (spec section 4). V1/V2/V3 imports keep `layouts: null` and flow through the same in-memory "My layout" adapter at runtime.
- **Frozen boundaries untouched:** storage authority, backup validation and redaction, exact V1/V2/V3 recovery, connector identities and request contracts, credentials, permissions, Notes ownership, Calendar/ICS contracts, CSP, dependencies (no new packages), the protected original checkout at `D:\DEV\Chrome plugin` (read-only, `eb1354b`), and all Chrome Web Store state.
- **Strict TDD:** every production change is preceded by a focused failing test observed failing. Run commands are given per step.
- **Working directory** for every command: `D:\DEV\Chrome plugin-aurora-2`.
- Commit messages follow the existing `feat(...)`/`fix(...)`/`docs: ...` conventions; bounded commits per task.

## Position model locked by this plan (from spec 2.2)

A free placement is stored as an anchor plus offset. The nine anchors are the four corners, four edge midlines, and center, with reference points in percent of the coordinate plane:

| anchor | point (x, y) |
|---|---|
| `top-left` | (0, 0) |
| `top` | (50, 0) |
| `top-right` | (100, 0) |
| `left` | (0, 50) |
| `center` | (50, 50) |
| `right` | (100, 50) |
| `bottom-left` | (0, 100) |
| `bottom-right` | (100, 100) |
| `bottom` | (50, 100) |

`anchorForPoint` picks the NEAREST anchor per axis independently: an axis value below 25 maps to the 0 edge, above 75 maps to the 100 edge, otherwise to the 50 midline (25/75 are the equidistance boundaries between {0, 50, 100}; ties at exactly 25/75 go to the edge, matching `<= 25` / `>= 75`). Offsets are stored so the original point reconstructs exactly: `offsetX = x - anchorPoint.x`, `offsetY = y - anchorPoint.y`. This makes NL-P1's migration adapter losslessly reversible, which is how the no-presentation-change and exact-recovery criteria are testable. (Rendering against these anchors, and reinterpreting offsets as percentages of available span from the anchor, is NL-P2's job; NL-P1 only stores and round-trips them.)

Display tiers stored in NL-P1: free placements carry `tier: 'compact' | 'standard' | 'full'` (mapped 1:1 from the existing `CanvasSize`); docked placements are tierless in storage (the Docked tier is implied by dock membership, spec 2.3/2.4). The four-tier render catalog is NL-P5+.

---

### Task 1: LayoutsDocument types and strict validation

**Files:**
- Create: `src/lib/layout/namedLayouts.ts`
- Test: `src/lib/layout/namedLayouts.test.ts`

**Interfaces:**
- Consumes: `BLOCK_IDS`, `BlockId` from `src/lib/layout/types.ts`; `isPlainObject` from `src/lib/object.ts`.
- Produces (used by Tasks 2-6): `LAYOUT_ANCHORS`, `LayoutAnchor`, `WIDGET_TIERS`, `WidgetTier`, `DOCK_EDGES`, `DockEdge`, `FreeWidgetPlacement`, `DockedWidgetPlacement`, `NamedLayoutPlacement`, `NamedLayout`, `LayoutsDocument`, `LAYOUTS_DOCUMENT_VERSION`, `LayoutsDocumentValidationError`, `LAYOUTS_DOCUMENT_VALIDATION_MESSAGE`, `cleanLayoutsDocument(value, options?)`, `isLayoutsDocument(value)`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/layout/namedLayouts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  LAYOUTS_DOCUMENT_VALIDATION_MESSAGE,
  LayoutsDocumentValidationError,
  cleanLayoutsDocument,
  isLayoutsDocument,
  type LayoutsDocument,
} from './namedLayouts'

function validDocument(): LayoutsDocument {
  return {
    version: 1,
    activeLayoutId: 'a',
    layouts: [
      {
        id: 'a',
        name: 'Desktop',
        widgets: {
          clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -10.5, tier: 'full', layer: 0 },
          weather: { kind: 'free', anchor: 'top-right', offsetX: -4, offsetY: 6, tier: 'standard', layer: 1 },
          bookmarks: { kind: 'docked', dock: 'top', order: 0 },
        },
      },
      { id: 'b', name: 'Laptop', widgets: {}, bulkTier: 'compact' },
    ],
  }
}

describe('cleanLayoutsDocument', () => {
  it('returns a deep clone of a valid document', () => {
    const input = validDocument()
    const cleaned = cleanLayoutsDocument(input)
    expect(cleaned).toEqual(input)
    expect(cleaned).not.toBe(input)
    expect(cleaned.layouts[0]).not.toBe(input.layouts[0])
    expect(cleaned.layouts[0].widgets.clock).not.toBe(input.layouts[0].widgets.clock)
  })

  it('rejects a non-object, a wrong version, and an empty layout list', () => {
    for (const bad of [null, 'oops', { ...validDocument(), version: 2 }, { ...validDocument(), layouts: [] }]) {
      expect(() => cleanLayoutsDocument(bad)).toThrow(LAYOUTS_DOCUMENT_VALIDATION_MESSAGE)
    }
  })

  it('rejects an activeLayoutId that names no layout', () => {
    expect(() => cleanLayoutsDocument({ ...validDocument(), activeLayoutId: 'missing' }))
      .toThrow(LayoutsDocumentValidationError)
  })

  it('rejects duplicate layout ids, empty ids, and empty names', () => {
    const dupe = validDocument()
    dupe.layouts[1].id = 'a'
    const emptyId = validDocument()
    emptyId.layouts[1].id = ''
    const emptyName = validDocument()
    emptyName.layouts[0].name = ''
    for (const bad of [dupe, emptyId, emptyName]) {
      expect(() => cleanLayoutsDocument(bad)).toThrow(LayoutsDocumentValidationError)
    }
  })

  it('rejects malformed placements in reject mode and drops them in drop mode', () => {
    const doc = validDocument() as unknown as {
      layouts: { widgets: Record<string, unknown> }[]
    }
    doc.layouts[0].widgets.clock = { kind: 'free', anchor: 'nowhere', offsetX: 0, offsetY: 0, tier: 'full', layer: 0 }
    expect(() => cleanLayoutsDocument(doc)).toThrow(LayoutsDocumentValidationError)
    const dropped = cleanLayoutsDocument(doc, { invalidPlacement: 'drop' })
    expect(dropped.layouts[0].widgets.clock).toBeUndefined()
    expect(dropped.layouts[0].widgets.weather).toBeDefined()
  })

  it('always drops unknown widget ids without failing the document', () => {
    const doc = validDocument() as unknown as {
      layouts: { widgets: Record<string, unknown> }[]
    }
    doc.layouts[0].widgets.futureWidget = { kind: 'docked', dock: 'top', order: 1 }
    const cleaned = cleanLayoutsDocument(doc)
    expect('futureWidget' in cleaned.layouts[0].widgets).toBe(false)
  })

  it('rejects a bad bulkTier, a non-integer dock order, and non-finite offsets', () => {
    const badBulk = validDocument() as unknown as { layouts: { bulkTier?: string }[] }
    badBulk.layouts[1].bulkTier = 'docked'
    const badOrder = validDocument() as unknown as {
      layouts: { widgets: Record<string, unknown> }[]
    }
    badOrder.layouts[0].widgets.bookmarks = { kind: 'docked', dock: 'top', order: 1.5 }
    const badOffset = validDocument() as unknown as {
      layouts: { widgets: Record<string, unknown> }[]
    }
    badOffset.layouts[0].widgets.clock = { kind: 'free', anchor: 'center', offsetX: Infinity, offsetY: 0, tier: 'full', layer: 0 }
    for (const bad of [badBulk, badOrder, badOffset]) {
      expect(() => cleanLayoutsDocument(bad)).toThrow(LayoutsDocumentValidationError)
    }
  })
})

describe('isLayoutsDocument', () => {
  it('answers true for valid and false for invalid without throwing', () => {
    expect(isLayoutsDocument(validDocument())).toBe(true)
    expect(isLayoutsDocument(null)).toBe(false)
    expect(isLayoutsDocument({ version: 1, activeLayoutId: 'x', layouts: [] })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/layout/namedLayouts.test.ts`
Expected: FAIL — cannot resolve `./namedLayouts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/layout/namedLayouts.ts`. Follow `canvasTypes.ts`'s conventions exactly (throwing `invalid()`, `finite()`, ReadonlySets, iterate only `BLOCK_IDS`):

```ts
import { isPlainObject } from '../object'
import { BLOCK_IDS, type BlockId } from './types'

/** Spec 2.2: nine anchor regions — four corners, four edge midlines, center. */
export const LAYOUT_ANCHORS = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
] as const
export type LayoutAnchor = (typeof LAYOUT_ANCHORS)[number]

/** Spec 2.3: the free-floating tiers. Docked is implied by dock membership. */
export const WIDGET_TIERS = ['compact', 'standard', 'full'] as const
export type WidgetTier = (typeof WIDGET_TIERS)[number]

export const DOCK_EDGES = ['top', 'bottom'] as const
export type DockEdge = (typeof DOCK_EDGES)[number]

export interface FreeWidgetPlacement {
  kind: 'free'
  anchor: LayoutAnchor
  /** Percent offsets from the anchor's reference point; NL-P1 stores them so
   *  the pre-migration center point reconstructs exactly (see
   *  pointFromFreePlacement). NL-P2 owns rendering them as percentages of the
   *  available span from the anchor. */
  offsetX: number
  offsetY: number
  tier: WidgetTier
  layer: number
}

export interface DockedWidgetPlacement {
  kind: 'docked'
  dock: DockEdge
  order: number
}

export type NamedLayoutPlacement = FreeWidgetPlacement | DockedWidgetPlacement

/** Presence of a widget key means the widget is enabled in this layout
 *  (spec 2.1: a layout stores which widgets are enabled plus each enabled
 *  widget's position, tier, layer, and dock membership). */
export interface NamedLayout {
  id: string
  name: string
  widgets: Partial<Record<BlockId, NamedLayoutPlacement>>
  bulkTier?: WidgetTier
}

export const LAYOUTS_DOCUMENT_VERSION = 1

export interface LayoutsDocument {
  version: typeof LAYOUTS_DOCUMENT_VERSION
  activeLayoutId: string
  layouts: NamedLayout[]
}

export const LAYOUTS_DOCUMENT_VALIDATION_MESSAGE = 'Layouts data is invalid.' as const

export class LayoutsDocumentValidationError extends Error {
  constructor() {
    super(LAYOUTS_DOCUMENT_VALIDATION_MESSAGE)
    this.name = 'LayoutsDocumentValidationError'
  }
}

export interface CleanLayoutsDocumentOptions {
  /** 'reject' (default) throws on a malformed KNOWN widget placement; 'drop'
   *  removes it. Unknown widget ids are always dropped, matching
   *  cleanStoredLayout's unknown-block-id convention. Malformed layout rows
   *  and document-level shape always reject in both modes. */
  invalidPlacement?: 'reject' | 'drop'
}

const ANCHOR_SET: ReadonlySet<string> = new Set(LAYOUT_ANCHORS)
const TIER_SET: ReadonlySet<string> = new Set(WIDGET_TIERS)
const DOCK_SET: ReadonlySet<string> = new Set(DOCK_EDGES)

function invalid(): never {
  throw new LayoutsDocumentValidationError()
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isFreePlacement(value: unknown): value is FreeWidgetPlacement {
  return isPlainObject(value)
    && value.kind === 'free'
    && typeof value.anchor === 'string'
    && ANCHOR_SET.has(value.anchor)
    && finite(value.offsetX)
    && finite(value.offsetY)
    && typeof value.tier === 'string'
    && TIER_SET.has(value.tier)
    && finite(value.layer)
}

function isDockedPlacement(value: unknown): value is DockedWidgetPlacement {
  return isPlainObject(value)
    && value.kind === 'docked'
    && typeof value.dock === 'string'
    && DOCK_SET.has(value.dock)
    && Number.isInteger(value.order)
    && (value.order as number) >= 0
}

function cleanNamedLayout(
  value: unknown,
  invalidPlacement: 'reject' | 'drop',
): NamedLayout {
  if (!isPlainObject(value)
    || typeof value.id !== 'string' || value.id === ''
    || typeof value.name !== 'string' || value.name === ''
    || !isPlainObject(value.widgets)) {
    invalid()
  }
  const widgets: NamedLayout['widgets'] = {}
  for (const id of BLOCK_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value.widgets, id)) continue
    const placement = value.widgets[id]
    if (isFreePlacement(placement) || isDockedPlacement(placement)) {
      widgets[id] = { ...placement }
      continue
    }
    if (invalidPlacement === 'reject') invalid()
  }
  const result: NamedLayout = { id: value.id, name: value.name, widgets }
  if (Object.prototype.hasOwnProperty.call(value, 'bulkTier')) {
    if (typeof value.bulkTier !== 'string' || !TIER_SET.has(value.bulkTier)) invalid()
    result.bulkTier = value.bulkTier as WidgetTier
  }
  return result
}

export function cleanLayoutsDocument(
  value: unknown,
  options: CleanLayoutsDocumentOptions = {},
): LayoutsDocument {
  const invalidPlacement = options.invalidPlacement ?? 'reject'
  if (!isPlainObject(value)
    || value.version !== LAYOUTS_DOCUMENT_VERSION
    || typeof value.activeLayoutId !== 'string'
    || !Array.isArray(value.layouts)
    || value.layouts.length === 0) {
    invalid()
  }
  const layouts = value.layouts.map((layout) => cleanNamedLayout(layout, invalidPlacement))
  const ids = new Set<string>()
  for (const layout of layouts) {
    if (ids.has(layout.id)) invalid()
    ids.add(layout.id)
  }
  if (!ids.has(value.activeLayoutId)) invalid()
  return { version: LAYOUTS_DOCUMENT_VERSION, activeLayoutId: value.activeLayoutId, layouts }
}

export function isLayoutsDocument(value: unknown): value is LayoutsDocument {
  try {
    cleanLayoutsDocument(value)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/layout/namedLayouts.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: TypeScript and diff hygiene, then commit**

Run: `npx tsc --noEmit` then `git diff --check`
Expected: both clean.

```bash
git add src/lib/layout/namedLayouts.ts src/lib/layout/namedLayouts.test.ts
git commit -m "feat(layouts): add validated named-layouts document model"
```

---

### Task 2: Anchor math and the "My layout" migration adapter

**Files:**
- Modify: `src/lib/layout/namedLayouts.ts` (append anchor math)
- Create: `src/lib/layout/myLayoutAdapter.ts`
- Test: `src/lib/layout/namedLayouts.test.ts` (anchor math), `src/lib/layout/myLayoutAdapter.test.ts`

**Interfaces:**
- Consumes: Task 1's types; `adaptStoredLayout` from `src/lib/layout/canvasAdapter.ts`; `StoredLayout`, `CanvasProfileKey`, `CanvasPlacement`, `BottomBarPlacement` from `src/lib/layout/canvasTypes.ts`; `BLOCK_IDS`, `BlockId` from `src/lib/layout/types.ts`.
- Produces (used by Tasks 5-6 and NL-P2):
  - In `namedLayouts.ts`: `ANCHOR_POINTS: Readonly<Record<LayoutAnchor, { x: number; y: number }>>`, `anchorForPoint(x: number, y: number): LayoutAnchor`, `freePlacementFromPoint(point: { x: number; y: number; tier: WidgetTier; layer: number }): FreeWidgetPlacement`, `pointFromFreePlacement(placement: FreeWidgetPlacement): { x: number; y: number }`.
  - In `myLayoutAdapter.ts`: `MY_LAYOUT_ID = 'my-layout'`, `MY_LAYOUT_NAME = 'My layout'`, `deriveMyLayout(stored: StoredLayout, profileKey: CanvasProfileKey, enabledIds: readonly BlockId[]): NamedLayout`, `deriveLayoutsDocument(stored: StoredLayout, profileKey: CanvasProfileKey, enabledIds: readonly BlockId[]): LayoutsDocument`, `resolveLayoutsDocument(storedLayouts: unknown, storedLayout: StoredLayout, profileKey: CanvasProfileKey, enabledIds: readonly BlockId[]): LayoutsDocument`.

- [ ] **Step 1: Write the failing anchor-math tests**

Append to `src/lib/layout/namedLayouts.test.ts`:

```ts
import {
  ANCHOR_POINTS,
  anchorForPoint,
  freePlacementFromPoint,
  pointFromFreePlacement,
} from './namedLayouts'

describe('anchor math', () => {
  it('picks the nearest of nine anchors per axis with 25/75 boundaries', () => {
    expect(anchorForPoint(0, 0)).toBe('top-left')
    expect(anchorForPoint(50, 50)).toBe('center')
    expect(anchorForPoint(100, 100)).toBe('bottom-right')
    expect(anchorForPoint(24.9, 50)).toBe('left')
    expect(anchorForPoint(25, 50)).toBe('left')     // tie goes to the edge
    expect(anchorForPoint(25.1, 50)).toBe('center')
    expect(anchorForPoint(50, 75)).toBe('bottom')   // tie goes to the edge
    expect(anchorForPoint(74.9, 10)).toBe('top')
    expect(anchorForPoint(75, 10)).toBe('top-right')
  })

  it('round-trips every quadrant point exactly through placement and back', () => {
    for (const point of [
      { x: 12.25, y: 88.5 }, { x: 50, y: 50 }, { x: 0, y: 0 },
      { x: 99.9, y: 3.2 }, { x: 33.4, y: 66.6 },
    ]) {
      const placement = freePlacementFromPoint({ ...point, tier: 'standard', layer: 3 })
      expect(pointFromFreePlacement(placement)).toEqual({ x: point.x, y: point.y })
      expect(placement.tier).toBe('standard')
      expect(placement.layer).toBe(3)
      expect(ANCHOR_POINTS[placement.anchor]).toBeDefined()
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/layout/namedLayouts.test.ts`
Expected: FAIL — `anchorForPoint` not exported.

- [ ] **Step 3: Implement the anchor math**

Append to `src/lib/layout/namedLayouts.ts`:

```ts
export const ANCHOR_POINTS: Readonly<Record<LayoutAnchor, { x: number; y: number }>> = Object.freeze({
  'top-left': { x: 0, y: 0 },
  top: { x: 50, y: 0 },
  'top-right': { x: 100, y: 0 },
  left: { x: 0, y: 50 },
  center: { x: 50, y: 50 },
  right: { x: 100, y: 50 },
  'bottom-left': { x: 0, y: 100 },
  bottom: { x: 50, y: 100 },
  'bottom-right': { x: 100, y: 100 },
})

/** Nearest of {0, 50, 100} per axis; 25/75 are the equidistance boundaries
 *  and ties go to the edge. */
function axisBucket(value: number): 0 | 1 | 2 {
  if (value <= 25) return 0
  if (value >= 75) return 2
  return 1
}

const ANCHOR_GRID: readonly (readonly LayoutAnchor[])[] = [
  ['top-left', 'top', 'top-right'],
  ['left', 'center', 'right'],
  ['bottom-left', 'bottom', 'bottom-right'],
]

export function anchorForPoint(x: number, y: number): LayoutAnchor {
  return ANCHOR_GRID[axisBucket(y)][axisBucket(x)]
}

export function freePlacementFromPoint(
  point: { x: number; y: number; tier: WidgetTier; layer: number },
): FreeWidgetPlacement {
  const anchor = anchorForPoint(point.x, point.y)
  const reference = ANCHOR_POINTS[anchor]
  return {
    kind: 'free',
    anchor,
    offsetX: point.x - reference.x,
    offsetY: point.y - reference.y,
    tier: point.tier,
    layer: point.layer,
  }
}

export function pointFromFreePlacement(placement: FreeWidgetPlacement): { x: number; y: number } {
  const reference = ANCHOR_POINTS[placement.anchor]
  return { x: reference.x + placement.offsetX, y: reference.y + placement.offsetY }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/layout/namedLayouts.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing adapter tests**

Create `src/lib/layout/myLayoutAdapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MY_LAYOUT_ID,
  MY_LAYOUT_NAME,
  deriveLayoutsDocument,
  deriveMyLayout,
  resolveLayoutsDocument,
} from './myLayoutAdapter'
import { pointFromFreePlacement, type FreeWidgetPlacement } from './namedLayouts'
import type { StoredLayout } from './canvasTypes'
import type { BlockId } from './types'

const V1_LAYOUT: StoredLayout = {
  clock: { x: 50, y: 18 },
  weather: { x: 88, y: 12 },
}

const V3_LAYOUT: StoredLayout = {
  version: 3,
  profiles: {
    standard: {
      mode: 'custom',
      placements: {
        clock: { kind: 'canvas', x: 50, y: 20, size: 'full', layer: 2 },
        weather: { kind: 'canvas', x: 90, y: 10, size: 'standard', layer: 1 },
        bookmarks: { kind: 'bottom-bar', order: 0, size: 'compact' },
      },
    },
  },
  recovery: { legacyV1: { clock: { x: 50, y: 18 } } },
}

const ENABLED: readonly BlockId[] = ['clock', 'weather', 'bookmarks', 'notes']

describe('deriveMyLayout', () => {
  it('maps a custom V3 profile: canvas rows become exact-round-trip free placements, bottom bar becomes the bottom dock', () => {
    const layout = deriveMyLayout(V3_LAYOUT, 'standard', ENABLED)
    expect(layout.id).toBe(MY_LAYOUT_ID)
    expect(layout.name).toBe(MY_LAYOUT_NAME)
    const clock = layout.widgets.clock as FreeWidgetPlacement
    expect(clock.kind).toBe('free')
    expect(clock.tier).toBe('full')
    expect(clock.layer).toBe(2)
    expect(pointFromFreePlacement(clock)).toEqual({ x: 50, y: 20 })
    const weather = layout.widgets.weather as FreeWidgetPlacement
    expect(pointFromFreePlacement(weather)).toEqual({ x: 90, y: 10 })
    expect(layout.widgets.bookmarks).toEqual({ kind: 'docked', dock: 'bottom', order: 0 })
  })

  it('gives an enabled widget with no stored placement a deterministic center default above every stored layer', () => {
    const layout = deriveMyLayout(V3_LAYOUT, 'standard', ENABLED)
    expect(layout.widgets.notes).toEqual({
      kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'standard', layer: 3,
    })
  })

  it('omits widgets that are not enabled', () => {
    const layout = deriveMyLayout(V3_LAYOUT, 'standard', ['clock'])
    expect(Object.keys(layout.widgets)).toEqual(['clock'])
  })

  it('adapts a V1 legacy layout through the existing adapter (standard size, sequential layers)', () => {
    const layout = deriveMyLayout(V1_LAYOUT, 'standard', ['clock', 'weather'])
    const clock = layout.widgets.clock as FreeWidgetPlacement
    expect(pointFromFreePlacement(clock)).toEqual({ x: 50, y: 18 })
    expect(clock.tier).toBe('standard')
  })

  it('never mutates the stored layout it reads', () => {
    const frozen = JSON.parse(JSON.stringify(V3_LAYOUT)) as StoredLayout
    deriveMyLayout(frozen, 'standard', ENABLED)
    expect(frozen).toEqual(V3_LAYOUT)
  })
})

describe('deriveLayoutsDocument / resolveLayoutsDocument', () => {
  it('derives a single-layout document with My layout active', () => {
    const doc = deriveLayoutsDocument(V3_LAYOUT, 'standard', ENABLED)
    expect(doc.version).toBe(1)
    expect(doc.activeLayoutId).toBe(MY_LAYOUT_ID)
    expect(doc.layouts).toHaveLength(1)
  })

  it('prefers a valid stored document and falls back to derivation otherwise', () => {
    const stored = {
      version: 1,
      activeLayoutId: 'work',
      layouts: [{ id: 'work', name: 'Work', widgets: {} }],
    }
    expect(resolveLayoutsDocument(stored, V3_LAYOUT, 'standard', ENABLED).activeLayoutId).toBe('work')
    for (const invalid of [null, undefined, { version: 1, activeLayoutId: 'x', layouts: [] }]) {
      const resolved = resolveLayoutsDocument(invalid, V3_LAYOUT, 'standard', ENABLED)
      expect(resolved.activeLayoutId).toBe(MY_LAYOUT_ID)
    }
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/lib/layout/myLayoutAdapter.test.ts`
Expected: FAIL — cannot resolve `./myLayoutAdapter`.

- [ ] **Step 7: Implement the adapter**

Create `src/lib/layout/myLayoutAdapter.ts`:

```ts
import { adaptStoredLayout } from './canvasAdapter'
import type { CanvasProfileKey, StoredLayout } from './canvasTypes'
import { BLOCK_IDS, type BlockId } from './types'
import {
  cleanLayoutsDocument,
  freePlacementFromPoint,
  isLayoutsDocument,
  LAYOUTS_DOCUMENT_VERSION,
  type LayoutsDocument,
  type NamedLayout,
} from './namedLayouts'

export const MY_LAYOUT_ID = 'my-layout'
export const MY_LAYOUT_NAME = 'My layout'

/** Spec 2.1 migration: the current active state (enabled widgets plus the
 *  stored V1/V2/V3 layout, resolved through the caller's current profile)
 *  becomes one layout named "My layout". Pure and in-memory: the stored
 *  layout is never rewritten (spec 4, "No eager rewrite at boot, ever"). */
export function deriveMyLayout(
  stored: StoredLayout,
  profileKey: CanvasProfileKey,
  enabledIds: readonly BlockId[],
): NamedLayout {
  const profile = adaptStoredLayout(stored).profiles[profileKey]
  const enabled = new Set<BlockId>(enabledIds)
  const widgets: NamedLayout['widgets'] = {}
  let maxLayer = -1
  for (const id of BLOCK_IDS) {
    if (!enabled.has(id)) continue
    const placement = profile?.placements[id]
    if (placement?.kind === 'canvas') {
      widgets[id] = freePlacementFromPoint({
        x: placement.x,
        y: placement.y,
        tier: placement.size,
        layer: placement.layer,
      })
      maxLayer = Math.max(maxLayer, placement.layer)
    } else if (placement?.kind === 'bottom-bar') {
      widgets[id] = { kind: 'docked', dock: 'bottom', order: placement.order }
    }
  }
  // Enabled widgets without a stored placement: deterministic center default
  // in BLOCK_IDS order, layered above every stored layer. NL-P2 owns real
  // default geometry; NL-P1 only records a truthful, valid document.
  let nextLayer = maxLayer + 1
  for (const id of BLOCK_IDS) {
    if (!enabled.has(id) || widgets[id]) continue
    widgets[id] = { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'standard', layer: nextLayer }
    nextLayer += 1
  }
  return { id: MY_LAYOUT_ID, name: MY_LAYOUT_NAME, widgets }
}

export function deriveLayoutsDocument(
  stored: StoredLayout,
  profileKey: CanvasProfileKey,
  enabledIds: readonly BlockId[],
): LayoutsDocument {
  return {
    version: LAYOUTS_DOCUMENT_VERSION,
    activeLayoutId: MY_LAYOUT_ID,
    layouts: [deriveMyLayout(stored, profileKey, enabledIds)],
  }
}

/** The read-side switcher plumbing: a valid stored document wins; anything
 *  else (null before first explicit save, or malformed data) falls back to
 *  the in-memory "My layout" derivation. Never writes. */
export function resolveLayoutsDocument(
  storedLayouts: unknown,
  storedLayout: StoredLayout,
  profileKey: CanvasProfileKey,
  enabledIds: readonly BlockId[],
): LayoutsDocument {
  if (isLayoutsDocument(storedLayouts)) return cleanLayoutsDocument(storedLayouts)
  return deriveLayoutsDocument(storedLayout, profileKey, enabledIds)
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run src/lib/layout/myLayoutAdapter.test.ts src/lib/layout/namedLayouts.test.ts`
Expected: PASS.

- [ ] **Step 9: TypeScript, diff hygiene, commit**

Run: `npx tsc --noEmit` then `git diff --check`
Expected: both clean.

```bash
git add src/lib/layout/namedLayouts.ts src/lib/layout/namedLayouts.test.ts src/lib/layout/myLayoutAdapter.ts src/lib/layout/myLayoutAdapter.test.ts
git commit -m "feat(layouts): derive the My layout document from stored V1/V2/V3 state"
```

---

### Task 3: Schema v13 with a metadata-only upgrade

**Files:**
- Modify: `src/lib/storage/schema.ts` (CURRENT_VERSION, `layouts` member, defaults)
- Modify: `src/lib/storage/migrations.ts` (identity step 12)
- Modify: `src/lib/storage/index.ts` (generalize the metadata-only init path)
- Test: `src/lib/storage/migrations.test.ts`, `src/lib/storage/index.test.ts`

**Interfaces:**
- Consumes: `LayoutsDocument` from `src/lib/layout/namedLayouts.ts`.
- Produces: `AuroraData.layouts: LayoutsDocument | null` (default `null`), `CURRENT_VERSION = 13`, `migrations[12]` identity, init upgrades stored v11 and v12 by writing only `aurora:version`.

- [ ] **Step 1: Write the failing schema/migration tests**

Add to `src/lib/storage/migrations.test.ts`:

```ts
it('v12 -> v13 is the identity: layouts arrives as null via the default merge only', () => {
  const snapshot = { ...defaults(), settings: { ...defaults().settings, name: 'Kept' } }
  delete (snapshot as Record<string, unknown>).layouts
  const migrated = migrate(snapshot, 12)
  expect(migrated.layouts).toBeNull()
  expect(migrated.settings.name).toBe('Kept')
})

it('a stored v13 layouts document survives migrate untouched', () => {
  const document = {
    version: 1,
    activeLayoutId: 'a',
    layouts: [{ id: 'a', name: 'Desktop', widgets: {} }],
  }
  const migrated = migrate({ ...defaults(), layouts: document }, 13 - 1)
  expect(migrated.layouts).toEqual(document)
})

it('a v9 legacy snapshot still migrates to the current version with layouts null', () => {
  const migrated = migrate(
    { ...defaults(), layout: { clock: { x: 50, y: 20 } } },
    9,
  )
  expect(migrated.layouts).toBeNull()
})
```

Also update the version literal in any existing migrations test asserting `CURRENT_VERSION` equals 12 (search: `CURRENT_VERSION`).

Add to `src/lib/storage/index.test.ts`, next to the existing v11 metadata tests (line ~402), following the same harness (`memoryDriver`, `createInProcessStorageAuthority`):

```ts
it('upgrades a v12 store by writing only version metadata; every data key stays byte-for-byte', async () => {
  const seeded = {
    ...defaults(),
    settings: { ...defaults().settings, name: 'Exact v12' },
    layout: { version: 3, profiles: {} },
    'aurora:version': 12,
  }
  const driver = memoryDriver(clone(seeded))
  const writes: Record<string, unknown>[] = []
  const originalWrite = driver.write.bind(driver)
  driver.write = async (patch: Record<string, unknown>) => {
    writes.push(clone(patch))
    return originalWrite(patch)
  }
  const storage = createStorage(driver, createInProcessStorageAuthority())
  await storage.init()
  expect(writes).toEqual([{ 'aurora:version': CURRENT_VERSION }])
  const all = await driver.read(null)
  const { 'aurora:version': version, ...data } = all
  expect(version).toBe(CURRENT_VERSION)
  const { 'aurora:version': _seedVersion, ...seedData } = seeded as Record<string, unknown>
  expect(data).toEqual(seedData)
})

it('still upgrades a v11 store metadata-only now that current is v13', async () => {
  const driver = memoryDriver(clone({ ...defaults(), 'aurora:version': 11 }))
  const storage = createStorage(driver, createInProcessStorageAuthority())
  await storage.init()
  const all = await driver.read(['aurora:version'])
  expect(all['aurora:version']).toBe(CURRENT_VERSION)
})

it('fresh defaults include layouts: null', async () => {
  const driver = memoryDriver({})
  const storage = createStorage(driver, createInProcessStorageAuthority())
  await storage.init()
  expect(await storage.get('layouts')).toBeNull()
})
```

Note: `memoryDriver` seeding and the exact `clone` helper already exist in `index.test.ts` — reuse them; if `memoryDriver` takes no seed argument, seed via `driver.write` before `createStorage`, matching the file's existing v11 test at line ~402 (copy its exact seeding idiom).

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/lib/storage/migrations.test.ts src/lib/storage/index.test.ts`
Expected: new tests FAIL (`layouts` unknown / migration missing / v12 path performs a full migration).

- [ ] **Step 3: Implement schema v13**

In `src/lib/storage/schema.ts`:
- `export const CURRENT_VERSION = 13`
- `import type { LayoutsDocument } from '../layout/namedLayouts'`
- Add to `AuroraData` after `layout`:

```ts
  /** Named-layouts document (NL-P1, spec 2026-08-17 named-layouts design §4).
   *  A TOP-LEVEL key: like apodCache, missing values are backfilled by
   *  migrate()'s default-merge, so no data-rewriting migration step exists.
   *  `null` means the user has never explicitly saved a layouts document; the
   *  runtime derives an in-memory "My layout" from the legacy `layout` key
   *  (myLayoutAdapter.ts) and MUST NOT write it at boot. The legacy `layout`
   *  key below stays byte-for-byte as recovery input and is never written by
   *  named-layouts code. */
  layouts: LayoutsDocument | null
```

- Add `layouts: null,` to `defaults()` (after `layout: emptyLayoutV3(),`).

In `src/lib/storage/migrations.ts` append:

```ts
  // v12 -> v13: the named-layouts document key. Intentionally the identity,
  // exactly like 11: live initialization treats the v12->v13 (and v11->v13)
  // boundary as a metadata-only version stamp so no Aurora data key is
  // rewritten merely because the extension booted. `layouts` itself is a
  // brand-new top-level key backfilled to null by migrate()'s default-merge.
  12: (data) => data,
```

In `src/lib/storage/index.ts`, replace the v11 special case:

```ts
        if (stored === 11 && CURRENT_VERSION === 12) {
          await upgradeV11MetadataOnly()
          return
        }
```

with:

```ts
        if (stored >= METADATA_ONLY_FLOOR && stored < CURRENT_VERSION) {
          await upgradeMetadataOnly(stored)
          return
        }
```

Add near the top of `createStorage` (module scope is fine too):

```ts
/** Every migration step from this version on is the identity function, so a
 *  boot from any of these versions writes only the version stamp. Raising
 *  CURRENT_VERSION past a NON-identity migration requires moving this floor
 *  up to that migration's target. */
const METADATA_ONLY_FLOOR = 11
```

and generalize `upgradeV11MetadataOnly` to:

```ts
  async function upgradeMetadataOnly(storedVersion: number): Promise<void> {
    const target = { [VERSION_KEY]: CURRENT_VERSION }
    const previous = { [VERSION_KEY]: storedVersion }
    let primaryError: unknown
    try {
      await driver.write(target)
      const verified = await driver.read([VERSION_KEY])
      if (!structurallyEqual(verified, target)) {
        throw new Error('Aurora storage version migration verification failed')
      }
      return
    } catch (caught) {
      primaryError = caught
    }

    try {
      await driver.write(previous)
      const rolledBack = await driver.read([VERSION_KEY])
      if (!structurallyEqual(rolledBack, previous)) {
        throw new Error('Aurora storage version migration rollback verification failed')
      }
    } catch (rollbackError) {
      throw new AtomicMigrationRollbackError(primaryError, rollbackError)
    }
    throw new StorageInitializationError(primaryError)
  }
```

(delete the old `upgradeV11MetadataOnly`; the existing v11 rollback test at index.test.ts:437 keeps passing because behavior for stored=11 is unchanged apart from the target version).

- [ ] **Step 4: Run the failing tests plus the whole storage family**

Run: `npx vitest run src/lib/storage`
Expected: PASS. If existing tests assert version 12 literally, update those literals to `CURRENT_VERSION` (report each such edit in the commit message body). Also update the `KNOWN_KEYS` array in `index.test.ts` (line ~28) to include `'layouts'` — its `satisfies readonly DataKey[]` will not force the addition (it constrains element type, not exhaustiveness), so add it explicitly wherever the test suite enumerates all data keys.

- [ ] **Step 5: TypeScript, diff hygiene, commit**

Run: `npx tsc --noEmit` then `git diff --check`
Expected: clean. TypeScript errors from `VALIDATORS` in `src/lib/backup.ts` (missing `layouts` entry) are EXPECTED at this point only if the Record type forces exhaustiveness — if so, add the minimal entry `layouts: (v) => v === null || isLayoutsDocument(v)` now and note that Task 4 owns its tests; otherwise leave backup.ts untouched for Task 4.

```bash
git add src/lib/storage/schema.ts src/lib/storage/migrations.ts src/lib/storage/index.ts src/lib/storage/migrations.test.ts src/lib/storage/index.test.ts
git commit -m "feat(storage): schema v13 layouts key with metadata-only upgrade"
```

---

### Task 4: Backup boundary for the layouts document

**Files:**
- Modify: `src/lib/backup.ts` (validator + clean branch)
- Test: `src/lib/backup.test.ts`

**Interfaces:**
- Consumes: `cleanLayoutsDocument`, `isLayoutsDocument`, `LayoutsDocument` from `src/lib/layout/namedLayouts.ts`.
- Produces: backups round-trip `layouts`; pre-v13 backups import with `layouts: null`; malformed layouts rejected with `That backup's "layouts" data is invalid.`; unknown widget ids inside a valid document dropped on import.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/backup.test.ts` (reuse the file's existing `defaults()` import and envelope idioms):

```ts
describe('layouts document backup boundary (NL-P1)', () => {
  const document = {
    version: 1,
    activeLayoutId: 'work',
    layouts: [{
      id: 'work',
      name: 'Work',
      widgets: {
        clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -8, tier: 'full', layer: 0 },
        bookmarks: { kind: 'docked', dock: 'top', order: 0 },
      },
    }],
  }

  it('serializes layouts and round-trips it through prepare/validate exactly', () => {
    const input = { ...defaults(), layouts: document }
    const prepared = prepareBackup(serializeBackup(input))
    expect(prepared.ok).toBe(true)
    if (prepared.ok) expect(prepared.data.layouts).toEqual(document)
  })

  it('serializes the default null layouts and imports it as null', () => {
    const prepared = prepareBackup(serializeBackup(defaults()))
    expect(prepared.ok).toBe(true)
    if (prepared.ok) expect(prepared.data.layouts).toBeNull()
  })

  it('imports a pre-v13 backup with layouts backfilled to null', () => {
    const envelope = JSON.parse(serializeBackup(defaults())) as Record<string, unknown>
    envelope.version = 12
    delete (envelope.data as Record<string, unknown>).layouts
    const prepared = prepareBackup(JSON.stringify(envelope))
    expect(prepared.ok).toBe(true)
    if (prepared.ok) expect(prepared.data.layouts).toBeNull()
  })

  it('rejects a malformed layouts document with the exact reason', () => {
    const envelope = JSON.parse(serializeBackup(defaults())) as { data: Record<string, unknown> }
    envelope.data.layouts = { version: 1, activeLayoutId: 'missing', layouts: [] }
    const prepared = prepareBackup(JSON.stringify(envelope))
    expect(prepared).toEqual({ ok: false, reason: 'That backup\'s "layouts" data is invalid.' })
  })

  it('drops an unknown widget id inside an otherwise valid document instead of failing the import', () => {
    const withUnknown = JSON.parse(JSON.stringify(document)) as {
      layouts: { widgets: Record<string, unknown> }[]
    }
    withUnknown.layouts[0].widgets.futureWidget = { kind: 'docked', dock: 'top', order: 3 }
    const envelope = JSON.parse(serializeBackup(defaults())) as { data: Record<string, unknown> }
    envelope.data.layouts = withUnknown
    const prepared = prepareBackup(JSON.stringify(envelope))
    expect(prepared.ok).toBe(true)
    if (prepared.ok) {
      expect(prepared.data.layouts).toEqual(document)
    }
  })
})
```

(If `prepareBackup`'s success shape in this codebase nests data differently — check its `PrepareBackupResult` type first — adjust the property access, not the assertions' substance.)

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/lib/backup.test.ts`
Expected: new describe FAILs (no `layouts` validator, or wholesale rejection).

- [ ] **Step 3: Implement the boundary**

In `src/lib/backup.ts`:

```ts
import { cleanLayoutsDocument, isLayoutsDocument, type LayoutsDocument } from './layout/namedLayouts'

/** null = never explicitly saved (the pre-v13 and fresh-install state). */
function isLayoutsKey(v: unknown): boolean {
  return v === null || isLayoutsDocument(v)
}

/** Strict on known members, drops unknown widget ids — the same convention
 *  as cleanLayout / cleanConnectors. */
function cleanLayoutsKey(v: unknown): LayoutsDocument | null {
  return v === null ? null : cleanLayoutsDocument(v)
}
```

- Add `layouts: isLayoutsKey,` to `VALIDATORS` (the `Record<Exclude<DataKey, ...>>` type demands it once `layouts` exists on `AuroraData`).
- In `validateBackupShape`'s clean chain, add a `layouts` branch beside `layout`:

```ts
    cleaned[key] =
      key === 'layout'
        ? cleanLayout(value)
        : key === 'layouts'
          ? cleanLayoutsKey(value)
          : key === 'connectors'
            ? cleanConnectors(value)
            : key === 'habits'
              ? cleanHabits(value)
              : value
```

No redaction change: the layouts document contains no secrets (names, anchors, tiers, orders only).

- [ ] **Step 4: Run to verify passes plus the backup family**

Run: `npx vitest run src/lib/backup.test.ts src/lib/backupRestore.test.ts src/privacy/dataFlows.test.ts`
Expected: PASS. `backupRestore` and `dataFlows` exercise all-key snapshots; if any enumerates data keys literally, add `layouts` there.

- [ ] **Step 5: TypeScript, diff hygiene, commit**

Run: `npx tsc --noEmit` then `git diff --check`
Expected: clean.

```bash
git add src/lib/backup.ts src/lib/backup.test.ts
git commit -m "feat(backup): validate and round-trip the layouts document"
```

---

### Task 5: Pure switcher operations

**Files:**
- Create: `src/lib/layout/layoutOperations.ts`
- Test: `src/lib/layout/layoutOperations.test.ts`

**Interfaces:**
- Consumes: Task 1's `LayoutsDocument`, `NamedLayout`, `cleanLayoutsDocument`, `LayoutsDocumentValidationError`.
- Produces (used by Task 6 and the NL-P3 switcher UI):
  - `switchActiveLayout(doc: LayoutsDocument, layoutId: string): LayoutsDocument`
  - `createLayout(doc: LayoutsDocument, next: { id: string; name: string }): LayoutsDocument` (appends an empty layout; does not switch)
  - `duplicateLayout(doc: LayoutsDocument, sourceId: string, next: { id: string; name: string }): LayoutsDocument`
  - `renameLayout(doc: LayoutsDocument, layoutId: string, name: string): LayoutsDocument`
  - `deleteLayout(doc: LayoutsDocument, layoutId: string): LayoutsDocument`
  - `reorderLayouts(doc: LayoutsDocument, fromIndex: number, toIndex: number): LayoutsDocument`

All operations are pure (never mutate the input), validate their result through `cleanLayoutsDocument` before returning, and throw `Error` with an exact message on an invalid reference.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/layout/layoutOperations.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  createLayout,
  deleteLayout,
  duplicateLayout,
  renameLayout,
  reorderLayouts,
  switchActiveLayout,
} from './layoutOperations'
import type { LayoutsDocument } from './namedLayouts'

function doc(): LayoutsDocument {
  return {
    version: 1,
    activeLayoutId: 'a',
    layouts: [
      { id: 'a', name: 'Desktop', widgets: { clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'full', layer: 0 } } },
      { id: 'b', name: 'Laptop', widgets: {} },
    ],
  }
}

describe('switchActiveLayout', () => {
  it('changes only activeLayoutId and never mutates its input', () => {
    const input = doc()
    const before = JSON.parse(JSON.stringify(input))
    const next = switchActiveLayout(input, 'b')
    expect(next.activeLayoutId).toBe('b')
    expect(next.layouts).toEqual(input.layouts)
    expect(input).toEqual(before)
  })

  it('throws on an unknown id', () => {
    expect(() => switchActiveLayout(doc(), 'zz')).toThrow('No layout with id "zz"')
  })
})

describe('createLayout / duplicateLayout', () => {
  it('appends an empty named layout without switching', () => {
    const next = createLayout(doc(), { id: 'c', name: 'Personal' })
    expect(next.layouts.map((l) => l.id)).toEqual(['a', 'b', 'c'])
    expect(next.layouts[2]).toEqual({ id: 'c', name: 'Personal', widgets: {} })
    expect(next.activeLayoutId).toBe('a')
  })

  it('duplicates a source layout deeply', () => {
    const next = duplicateLayout(doc(), 'a', { id: 'c', name: 'Desktop copy' })
    expect(next.layouts[2].widgets).toEqual(doc().layouts[0].widgets)
    expect(next.layouts[2].widgets).not.toBe(next.layouts[0].widgets)
  })

  it('rejects a duplicate id and an unknown source', () => {
    expect(() => createLayout(doc(), { id: 'a', name: 'X' })).toThrow('Layout id "a" already exists')
    expect(() => duplicateLayout(doc(), 'zz', { id: 'c', name: 'X' })).toThrow('No layout with id "zz"')
  })
})

describe('renameLayout', () => {
  it('renames with trimming and rejects an empty result', () => {
    expect(renameLayout(doc(), 'b', '  Travel  ').layouts[1].name).toBe('Travel')
    expect(() => renameLayout(doc(), 'b', '   ')).toThrow('Layout name cannot be empty')
  })
})

describe('deleteLayout', () => {
  it('deletes a non-active layout', () => {
    const next = deleteLayout(doc(), 'b')
    expect(next.layouts.map((l) => l.id)).toEqual(['a'])
    expect(next.activeLayoutId).toBe('a')
  })

  it('moves the active pointer to the nearest survivor when deleting the active layout', () => {
    const next = deleteLayout(doc(), 'a')
    expect(next.activeLayoutId).toBe('b')
  })

  it('refuses to delete the last layout', () => {
    const only = deleteLayout(doc(), 'b')
    expect(() => deleteLayout(only, 'a')).toThrow('Cannot delete the last layout')
  })
})

describe('reorderLayouts', () => {
  it('moves a layout and keeps the active pointer by id', () => {
    const next = reorderLayouts(doc(), 0, 1)
    expect(next.layouts.map((l) => l.id)).toEqual(['b', 'a'])
    expect(next.activeLayoutId).toBe('a')
  })

  it('rejects out-of-range indices', () => {
    expect(() => reorderLayouts(doc(), 0, 5)).toThrow('Layout index out of range')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/layout/layoutOperations.test.ts`
Expected: FAIL — cannot resolve `./layoutOperations`.

- [ ] **Step 3: Implement the operations**

Create `src/lib/layout/layoutOperations.ts`:

```ts
import {
  cleanLayoutsDocument,
  type LayoutsDocument,
  type NamedLayout,
} from './namedLayouts'

function requireIndex(doc: LayoutsDocument, layoutId: string): number {
  const index = doc.layouts.findIndex((layout) => layout.id === layoutId)
  if (index === -1) throw new Error(`No layout with id "${layoutId}"`)
  return index
}

function requireFreshId(doc: LayoutsDocument, id: string): void {
  if (doc.layouts.some((layout) => layout.id === id)) {
    throw new Error(`Layout id "${id}" already exists`)
  }
}

/** Every operation returns a freshly validated document (cleanLayoutsDocument
 *  deep-clones), so callers can hand the result straight to the explicit-save
 *  write path without aliasing the input. */
function finish(doc: LayoutsDocument): LayoutsDocument {
  return cleanLayoutsDocument(doc)
}

export function switchActiveLayout(doc: LayoutsDocument, layoutId: string): LayoutsDocument {
  requireIndex(doc, layoutId)
  return finish({ ...doc, activeLayoutId: layoutId })
}

export function createLayout(
  doc: LayoutsDocument,
  next: { id: string; name: string },
): LayoutsDocument {
  requireFreshId(doc, next.id)
  const layout: NamedLayout = { id: next.id, name: next.name, widgets: {} }
  return finish({ ...doc, layouts: [...doc.layouts, layout] })
}

export function duplicateLayout(
  doc: LayoutsDocument,
  sourceId: string,
  next: { id: string; name: string },
): LayoutsDocument {
  const source = doc.layouts[requireIndex(doc, sourceId)]
  requireFreshId(doc, next.id)
  const copy = cleanLayoutsDocument({
    ...doc,
    layouts: [...doc.layouts, { ...source, id: next.id, name: next.name }],
  })
  return copy
}

export function renameLayout(
  doc: LayoutsDocument,
  layoutId: string,
  name: string,
): LayoutsDocument {
  const index = requireIndex(doc, layoutId)
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('Layout name cannot be empty')
  const layouts = doc.layouts.map((layout, i) => (
    i === index ? { ...layout, name: trimmed } : layout
  ))
  return finish({ ...doc, layouts })
}

export function deleteLayout(doc: LayoutsDocument, layoutId: string): LayoutsDocument {
  const index = requireIndex(doc, layoutId)
  if (doc.layouts.length === 1) throw new Error('Cannot delete the last layout')
  const layouts = doc.layouts.filter((_, i) => i !== index)
  const activeLayoutId = doc.activeLayoutId === layoutId
    ? layouts[Math.max(0, index - 1)].id
    : doc.activeLayoutId
  return finish({ ...doc, activeLayoutId, layouts })
}

export function reorderLayouts(
  doc: LayoutsDocument,
  fromIndex: number,
  toIndex: number,
): LayoutsDocument {
  const max = doc.layouts.length - 1
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
    || fromIndex < 0 || fromIndex > max || toIndex < 0 || toIndex > max) {
    throw new Error('Layout index out of range')
  }
  const layouts = [...doc.layouts]
  const [moved] = layouts.splice(fromIndex, 1)
  layouts.splice(toIndex, 0, moved)
  return finish({ ...doc, layouts })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/layout/layoutOperations.test.ts`
Expected: PASS.

- [ ] **Step 5: TypeScript, diff hygiene, commit**

Run: `npx tsc --noEmit` then `git diff --check`
Expected: clean.

```bash
git add src/lib/layout/layoutOperations.ts src/lib/layout/layoutOperations.test.ts
git commit -m "feat(layouts): pure switcher operations over the layouts document"
```

---

### Task 6: Explicit-save write path and the never-touch-legacy proof

**Files:**
- Modify: `src/lib/layout/layoutOperations.ts` (append `saveLayoutsDocument`)
- Test: `src/lib/layout/layoutOperations.test.ts` (storage-level cases)

**Interfaces:**
- Consumes: `AuroraStorage` from `src/lib/storage/index.ts`; test harness `memoryDriver` + `createInProcessStorageAuthority` (same imports as `src/lib/storage/index.test.ts`).
- Produces: `saveLayoutsDocument(storage: AuroraStorage, next: LayoutsDocument): Promise<void>` — validates, then writes ONLY the `layouts` key. This is the single write path the NL-P3 switcher UI and every future save flows through.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/layout/layoutOperations.test.ts`:

```ts
import { createStorage } from '../storage/index'
import { memoryDriver } from '../storage/driver'
import { createInProcessStorageAuthority } from '../storage/authority'
import { LayoutsDocumentValidationError } from './namedLayouts'
import { saveLayoutsDocument } from './layoutOperations'

describe('saveLayoutsDocument', () => {
  it('writes ONLY the layouts key and never the legacy layout key', async () => {
    const driver = memoryDriver()
    const storage = createStorage(driver, createInProcessStorageAuthority())
    await storage.init()
    const legacyBefore = await storage.get('layout')

    const writes: string[][] = []
    const originalWrite = driver.write.bind(driver)
    driver.write = async (patch: Record<string, unknown>) => {
      writes.push(Object.keys(patch).sort())
      return originalWrite(patch)
    }

    await saveLayoutsDocument(storage, doc())
    expect(writes).toEqual([['layouts']])
    expect(await storage.get('layouts')).toEqual(doc())
    expect(await storage.get('layout')).toEqual(legacyBefore)
  })

  it('rejects an invalid document before any write', async () => {
    const driver = memoryDriver()
    const storage = createStorage(driver, createInProcessStorageAuthority())
    await storage.init()
    const bad = { ...doc(), activeLayoutId: 'missing' }
    await expect(saveLayoutsDocument(storage, bad)).rejects.toThrow(LayoutsDocumentValidationError)
    expect(await storage.get('layouts')).toBeNull()
  })
})
```

(If `memoryDriver` requires arguments or a different constructor name, copy the exact instantiation from `src/lib/storage/index.test.ts` — do not invent a new harness.)

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/lib/layout/layoutOperations.test.ts`
Expected: FAIL — `saveLayoutsDocument` not exported.

- [ ] **Step 3: Implement the write path**

Append to `src/lib/layout/layoutOperations.ts`:

```ts
import type { AuroraStorage } from '../storage/index'

/** The ONLY named-layouts write path (spec 4: explicit-save-only, atomic
 *  under the existing storage authority). Validates before writing; a
 *  rejected document leaves storage untouched. Writes exactly one key —
 *  never the legacy `layout` recovery input. */
export async function saveLayoutsDocument(
  storage: AuroraStorage,
  next: LayoutsDocument,
): Promise<void> {
  await storage.set('layouts', cleanLayoutsDocument(next))
}
```

(Move the import to the top of the file with the others.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/layout/layoutOperations.test.ts`
Expected: PASS.

- [ ] **Step 5: No-presentation-change witness**

Run the focused families most likely to see the schema change, plus the App render family:

Run: `npx vitest run src/lib/storage src/lib/backup.test.ts src/lib/backupRestore.test.ts src/lib/layout src/newtab/App.test.tsx`
Expected: PASS with zero modified expectations in `App.test.tsx` — the render path never reads `layouts`, which is the no-presentation-change proof at unit level. If any App test fails, that is a defect in this packet's changes, not a test to update: stop and fix.

- [ ] **Step 6: TypeScript, diff hygiene, commit**

Run: `npx tsc --noEmit` then `git diff --check`
Expected: clean.

```bash
git add src/lib/layout/layoutOperations.ts src/lib/layout/layoutOperations.test.ts
git commit -m "feat(layouts): explicit-save write path that never touches legacy layout"
```

---

### Task 7: Packet gate, review, ledgers, checkpoint

**Files:**
- Modify: `docs/superpowers/aurora-2/STATUS.md` (current-packet line + NL-P1 evidence bullet)
- Modify: `docs/superpowers/aurora-2/DECISIONS.md` only if the review forces a decision-worthy change (otherwise no entry; A2-D061 already records the packet shape)

- [ ] **Step 1: Focused packet gate**

Run: `npx vitest run src/lib/layout src/lib/storage src/lib/backup.test.ts src/lib/backupRestore.test.ts src/privacy/dataFlows.test.ts src/newtab/App.test.tsx`
Expected: PASS. Record the exact file/test counts for the ledger.

Run: `npx tsc --noEmit` and `git diff --check`
Expected: clean.

Do NOT run the full unit suite, builds, or the canonical browser harness — those are NL-P7-scale gates (bounded-packet policy, A2-D053/A2-D061).

- [ ] **Step 2: Bounded review**

Use superpowers:requesting-code-review for one bounded review of the packet diff against this plan and spec sections 2.1/2.2/4. At most one fix/rereview cycle. Verify explicitly:
- no file in the packet writes the `layout` key;
- no rendering/CSS file changed;
- init writes only `aurora:version` for stored v11/v12;
- backup reason strings match the established format.

- [ ] **Step 3: Ledger update**

In `STATUS.md`: set **Last verified packet** to `NL-P1 layouts foundation` and **Current packet** to `NL-P2 content-tight anchored canvas` (plan to be written just-in-time in the next packet), and add an **NL-P1 evidence** bullet recording: the schema v13 metadata-only upgrade, the layouts document model and validation, the My layout adapter with exact round-trip, pure switcher operations with the explicit-save single-key write proof, backup round-trip including pre-v13 backfill, the exact focused gate counts from Step 1, and the review outcome.

- [ ] **Step 4: Checkpoint commit and push**

```bash
git add docs/superpowers/aurora-2/STATUS.md
git commit -m "docs: checkpoint NL-P1 layouts foundation"
git push origin feat/aurora-2-observatory
```

- [ ] **Step 5: Repository proof**

Run and record in the session log:

```bash
git -C "D:\DEV\Chrome plugin-aurora-2" status --short
git -C "D:\DEV\Chrome plugin-aurora-2" rev-parse HEAD origin/feat/aurora-2-observatory
git -C "D:\DEV\Chrome plugin" rev-parse HEAD
git -C "D:\DEV\Chrome plugin" status --short
```

Expected: active worktree clean and equal to origin; protected original still at `eb1354b6a5b041fb6d494655c3dae1862572bc51` with no changes.

---

## Self-review notes

- **Spec coverage (section 4):** additive v12→v13 — Task 3; layouts document + activeLayoutId — Tasks 1/3; legacy `layout` preserved untouched — global constraint + Task 6 proof test; explicit-save-only atomic writes — Task 6; backup carries layouts with full validation, V1/V2/V3 imports flow through the My layout adapter (by keeping `layouts: null`) — Task 4; no eager boot rewrite — Task 3 metadata-only test asserting the single `aurora:version` write.
- **Spec coverage (section 2.1 migration clause):** in-memory "My layout" from enabled widgets + stored layout — Task 2 (`deriveMyLayout`, `resolveLayoutsDocument`); persistence only on first explicit save — Task 6.
- **Deliberately out of NL-P1:** anchored rendering, narrow floor, deletions of profile machinery (NL-P2); switcher UI, edit mode (NL-P3); docks rendering (NL-P4); tier compositions (NL-P5+). The `deriveMyLayout` center-default for placement-less widgets is a storage truthfulness rule, not rendered geometry.
- **Type consistency:** `WidgetTier` = `'compact' | 'standard' | 'full'` maps 1:1 from `CanvasSize`; `resolveLayoutsDocument(storedLayouts, storedLayout, profileKey, enabledIds)` signature is identical in Tasks 2 and 6 consumers; `saveLayoutsDocument(storage, next)` matches Task 6's tests.
- **Known verification risk:** exact `memoryDriver` seeding idioms and `prepareBackup`'s success shape are asserted from existing tests; both tasks instruct copying the in-file idiom rather than inventing one.
