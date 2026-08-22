# Aurora Widget Stacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task by task. The owner
> has already authorized inline, back-to-back execution, so do not stop to ask
> for an execution mode or routine continuation.

**Goal:** Let the user combine two or more existing canvas widgets into one
manually paged, content-tight card that preserves its face, position, tier,
and member order across Save and reload.

**Architecture:** `NamedLayout.stacks` is an optional additive placement
collection, so schema v15 and `LAYOUTS_DOCUMENT_VERSION = 1` remain unchanged.
Pure stack transformations operate on `NamedLayout`; the edit session wraps
them with one-entry undo semantics, while normal-mode paging uses one
serialized `layouts` updater. The planner emits one anchored item per stack,
and `StackCard` mounts every member in one CSS grid cell so the tallest member
sets a constant footprint without measurements or a second data owner.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library, CSS Grid,
Playwright against the built MV3 extension, and the existing authority-backed
Aurora storage adapter.

**Specs:**

- `docs/superpowers/specs/2026-08-19-aurora-widget-stacks-design.md`
- `docs/superpowers/specs/2026-08-21-aurora-continuous-delivery-roadmap-design.md`
- `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md`

## Global constraints

- The user owns placement; the system owns safety. A stack never changes face
  without an explicit arrow, dot, swipe, keyboard, or edit-session action.
- Stacks are canvas-only in this packet. Do not implement docked stacks or
  Smart surfacing.
- A widget appears in `widgets` or one stack, never both and never in two
  stacks. Runtime cleaning keeps the older `widgets` entry on conflict.
- Existing layouts with no `stacks` field must clean, render, recover, export,
  and import exactly as before.
- `LAYOUTS_DOCUMENT_VERSION` stays 1, `CURRENT_VERSION` stays 15, and no
  migration or defaults key is added.
- Paging in normal mode writes only `layouts`; edit-mode changes remain in the
  draft until Save; Cancel writes nothing; the frozen legacy `layout` key is
  never written.
- Hidden stack members remain mounted and warm. Do not duplicate hooks,
  providers, requests, snapshots, credentials, or connector identities.
- Preserve storage authority, backup redaction, exact V1/V2/V3 recovery,
  connector contracts, permissions, CSP, dependencies, Notes ownership, and
  every protected boundary.
- Do not modify `D:\DEV\Chrome plugin`. It remains read-only at
  `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- Do not upload, type into, save, submit, publish, distribute, or roll out any
  Chrome Web Store state without a new action-specific W6-P5 approval.
- Every production or QA-harness behavior starts with an observed focused RED.
  Use one bounded review and at most one confirmed-finding fix/rereview cycle.
- New QA output goes only to ignored repository-local scratch directories.
  Accepted `docs/superpowers/qa/nl-p6` evidence is immutable.
- Rebuild `dist` from the exact reviewed commit before final owner-facing
  inspection.

## Product and interaction decisions fixed by this plan

1. Edit selection is a tagged stable identity:

```ts
export type EditSelection =
  | Readonly<{ kind: 'widget'; id: BlockId }>
  | Readonly<{ kind: 'stack'; id: string }>
```

The selection never depends on the facing member, so paging cannot deselect,
move, or rename the card accidentally.

2. A stack has no extra outer panel. The facing widget remains the visual
surface. The stack contributes only a quiet footer index, edge arrows on
hover/focus, and edit-only identity chrome. This avoids a card inside a card
and works with black, bright pink, translucent, and photo-driven themes.

3. The CSS grid reserves the tallest member intrinsically. Every face uses
`grid-area: 1 / 1`; non-facing faces use `visibility: hidden` and
`pointer-events: none`; the facing face is centered in the reserved cell.
There is no `ResizeObserver`, explicit height, or paging animation that can
change the footprint.

4. Normal-mode paging updates the exact layout and stack the user acted on
through a fresh `storage.update('layouts', ...)`. Rapid arrows cannot clobber
one another or page a layout switched in another tab. Edit-mode dots use the
draft and one undo entry.

5. Hold-to-stack uses a 500ms stationary target dwell after movement begins.
The target clears immediately when the pointer leaves it, enters a dock band,
or the gesture ends. A drop before 500ms remains ordinary overlap.

6. New stack ids are generated at the App boundary with
`crypto.randomUUID()` and passed into pure operations. The target contributes
anchor, offsets, tier, and layer; the dragged widget appends and faces.

7. Removing a member places it 4 percentage points from the card toward the
canvas center and one layer above it. If one member remains, that survivor
dissolves at the stack's exact geometry. This deterministic offset satisfies
the spec's visibility requirement without reflowing another object.

8. The approved stack shape has no hidden-state field. Therefore Hide is one
undoable dissolve-to-hidden operation: remove the stack and create a normal
`{ kind: 'hidden' }` placement for every member. The existing toolbar can then
restore members individually without inventing an unapproved storage shape.

9. Global widget disable keeps stored stack membership untouched. If the
facing identity is disabled, that stack renders no card until the same widget
is re-enabled; Aurora never silently chooses a different face. This is the
same exact-recovery behavior standalone placements already have.

10. Swipe is the approved 40 CSS px experiment. It pages only in normal mode,
suppresses the release click after crossing the threshold, and never runs in
edit mode. Reduced motion removes fades but does not remove controls.

## File structure

- `src/lib/layout/namedLayouts.ts`: stack storage shape, canonical cleaning,
  one-place enforcement, and strict stack validation option for backups.
- `src/lib/layout/stacks.ts`: pure layout-level create, append, face, reorder,
  remove, dissolve, move, tier, layer, and hide transformations.
- `src/lib/layout/editSession.ts`: tagged selection plus one-entry draft/undo
  wrappers around the pure stack operations.
- `src/lib/layout/renderLayout.ts`: one render item per stack, unchanged
  anchored/narrow modes, and no automatic face selection.
- `src/lib/layout/layoutOperations.ts`: serialized normal-mode face updates on
  the exact stored layout and stack.
- `src/newtab/canvas/StackCard.tsx`: one intrinsic grid card, manual paging,
  click parity, and accessible arrows/dots/keyboard/swipe.
- `src/newtab/canvas/CanvasSurface.tsx`: render all stack members once and
  route stable stack identity through the existing Canvas shell.
- `src/newtab/canvas/CanvasItem.tsx`: stable object callbacks plus edit-only
  stack target label/outline.
- `src/newtab/edit/useCanvasDrag.ts`: generic drag subjects and the 500ms hold
  candidate lifecycle.
- `src/newtab/edit/StackInspector.tsx`: stack name, tier, layer, ordered
  members, reorder, Remove, drag-out handles, and Hide.
- `src/newtab/App.tsx`: compose paging persistence, drag subjects, stack drop,
  direct member detachment, inspectors, overlap labels, and exact Save/Cancel.
- `src/newtab/index.css`: intrinsic stack grid and restrained interaction
  chrome using existing ink, panel, control, and accent tokens.
- `scripts/qa-nl-p6-scenarios.mjs`, `scripts/qa-nl-p6.mjs`, and
  `scripts/qa-nl-p6-window.mjs`: saved/reloaded stack matrix and real-window
  interaction witness in scratch output only.

---

### Task 0: Checkpoint this just-in-time plan

**Files:**

- Create: `docs/superpowers/plans/2026-08-21-aurora-widget-stacks-implementation.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`

**Produces:** A pushed plan checkpoint from the clean Flow baseline, with no
production change.

- [x] Verify active HEAD equals upstream at `69c9d44`, the active worktree is
  clean, and the protected checkout is clean at `eb1354b6`.
- [x] Update STATUS and ROADMAP so this plan is the current executable packet.
- [x] Run the plan self-review, placeholder scan, `git diff --check`, and a
  protected-boundary diff scan.
- [x] Commit and push:

```powershell
git add docs/superpowers/plans/2026-08-21-aurora-widget-stacks-implementation.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md
git commit -m "docs: approve the Aurora widget-stacks implementation plan"
git push origin feat/aurora-2-observatory
```

### Task 1: Add the optional stack document model and strict recovery

**Files:**

- Modify: `src/lib/layout/namedLayouts.ts`
- Modify: `src/lib/layout/namedLayouts.test.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/lib/backupRestore.test.ts`

**Interfaces:**

- Produces:

```ts
export interface WidgetStack {
  id: string
  members: readonly BlockId[]
  facing: BlockId
  anchor: LayoutAnchor
  offsetX: number
  offsetY: number
  tier: WidgetTier
  layer: number
}

export interface NamedLayout {
  id: string
  name: string
  widgets: Partial<Record<BlockId, NamedLayoutPlacement>>
  bulkTier?: WidgetTier
  stacks?: readonly WidgetStack[]
}

export interface CleanLayoutsDocumentOptions {
  invalidPlacement?: 'reject' | 'drop'
  invalidStack?: 'clean' | 'reject'
}
```

- [ ] **RED:** Add focused tests that require absent `stacks` to remain absent,
  a valid stack to clean canonically, unknown members to drop, bad facing to
  reset, duplicate memberships to keep their first valid stack, conflicts
  with `widgets` to keep the widget placement, duplicate stack ids to drop the
  later stack, and a surviving singleton to become a free widget at the exact
  stack geometry/tier/layer. Run:

```powershell
npx vitest run src/lib/layout/namedLayouts.test.ts
```

Expected RED: `NamedLayout` has no `stacks` contract and the cleaner drops the
field.

- [ ] Implement canonical cleaning in `namedLayouts.ts`. Process `widgets`
  first, then stacks in stored order with one occupied-member set. Never add an
  empty `stacks` array to a document that omitted the field.
- [ ] **RED:** Add backup tests proving a complete valid stack round-trips,
  old backups remain exact, and malformed stack structure, unknown members,
  duplicate members, bad geometry, bad tier, bad facing, and duplicate ids are
  rejected with the existing `layouts` reason instead of being laundered.
- [ ] Make backup validation call
  `cleanLayoutsDocument(value, { invalidStack: 'reject' })`; runtime resolution
  keeps the default `clean` behavior. Do not change connector redaction.
- [ ] Run focused GREEN, TypeScript, and diff hygiene:

```powershell
npx vitest run src/lib/layout/namedLayouts.test.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts
npx tsc --noEmit
git diff --check
```

- [ ] Commit:

```powershell
git add src/lib/layout/namedLayouts.ts src/lib/layout/namedLayouts.test.ts src/lib/backup.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts
git commit -m "feat(stacks): validate stack placements"
```

### Task 2: Build pure stack operations and stable edit selection

**Files:**

- Create: `src/lib/layout/stacks.ts`
- Create: `src/lib/layout/stacks.test.ts`
- Modify: `src/lib/layout/editSession.ts`
- Modify: `src/lib/layout/editSession.test.ts`
- Modify: `src/lib/layout/layoutOperations.ts`
- Modify: `src/lib/layout/layoutOperations.test.ts`
- Modify: `src/newtab/edit/useEditMode.ts`
- Modify: `src/newtab/edit/useEditMode.test.tsx`

**Interfaces:**

- Produces pure layout operations:

```ts
export type StackDropTarget =
  | Readonly<{ kind: 'widget'; id: BlockId }>
  | Readonly<{ kind: 'stack'; id: string }>

export function createOrAppendStack(
  layout: NamedLayout,
  sourceId: BlockId,
  target: StackDropTarget,
  newStackId: string,
): NamedLayout

export function setStackFacing(layout: NamedLayout, stackId: string, face: BlockId): NamedLayout
export function stepStackFacing(layout: NamedLayout, stackId: string, direction: -1 | 1): NamedLayout
export function reorderStackMember(layout: NamedLayout, stackId: string, memberId: BlockId, direction: -1 | 1): NamedLayout
export function removeStackMember(layout: NamedLayout, stackId: string, memberId: BlockId): NamedLayout
export function detachStackMember(layout: NamedLayout, stackId: string, memberId: BlockId, point: { xPct: number; yPct: number }): NamedLayout
export function hideStack(layout: NamedLayout, stackId: string): NamedLayout
```

- Produces tagged edit selection and one-entry wrappers:

```ts
export type EditSelection =
  | Readonly<{ kind: 'widget'; id: BlockId }>
  | Readonly<{ kind: 'stack'; id: string }>

export function selectWidget(session: EditSession, id: BlockId | null): EditSession
export function selectStack(session: EditSession, id: string): EditSession
export function createStackFromDrop(session: EditSession, sourceId: BlockId, target: StackDropTarget, newStackId: string, pushUndo?: boolean): EditSession
export function setSelectedStackFacing(session: EditSession, face: BlockId): EditSession
export function reorderSelectedStackMember(session: EditSession, memberId: BlockId, direction: -1 | 1): EditSession
export function removeSelectedStackMember(session: EditSession, memberId: BlockId): EditSession
export function detachSelectedStackMember(session: EditSession, memberId: BlockId, point: { xPct: number; yPct: number }, pushUndo?: boolean): EditSession
```

- [ ] **RED:** In `stacks.test.ts`, pin create over a widget, append to a
  stack, wraparound previous/next, direct face jump, reorder boundaries,
  removal with centerward 4% offset, exact survivor dissolution, direct
  detach at pointer position, and dissolve-to-hidden. Assert every input stays
  byte-identical.
- [ ] Implement `stacks.ts` as pure NamedLayout transformations. Every result
  returns through `cleanLayoutsDocument` at the edit/document boundary; no
  function reads DOM, storage, clocks, registry state, or random ids.
- [ ] **RED:** Refactor edit-session tests to tagged selection and add one
  undo-entry proofs for create, append, face, reorder, remove, detach,
  dissolve, and Hide. Require move/tier/layer/bulk-tier to address a selected
  stack as one object and `beginEditSession` to skip materializing ids already
  present in stacks.
- [ ] Update `editSession.ts` with shared selected-geometry helpers. Preserve
  the existing widget function names as compatibility wrappers while changing
  `EditSession.selectedId` to `EditSession.selection`.
- [ ] **RED:** Add a storage spy requiring rapid normal-mode paging to apply
  against fresh stored state, touch only `layouts`, preserve `layout`, and do
  nothing when the exact layout or stack no longer exists.
- [ ] Add `updateStoredStackFacing(storage, layoutId, stackId, command)` in
  `layoutOperations.ts` using `storage.update('layouts', current => ...)` and
  strict cleaning. Never derive a document when the stored value is null.
- [ ] Update `useEditMode.select` to accept `EditSelection | null` and retain
  exact Cancel/Save/focus behavior.
- [ ] Run focused GREEN, TypeScript, and diff hygiene:

```powershell
npx vitest run src/lib/layout/stacks.test.ts src/lib/layout/editSession.test.ts src/lib/layout/layoutOperations.test.ts src/newtab/edit/useEditMode.test.tsx
npx tsc --noEmit
git diff --check
```

- [ ] Commit:

```powershell
git add src/lib/layout/stacks.ts src/lib/layout/stacks.test.ts src/lib/layout/editSession.ts src/lib/layout/editSession.test.ts src/lib/layout/layoutOperations.ts src/lib/layout/layoutOperations.test.ts src/newtab/edit/useEditMode.ts src/newtab/edit/useEditMode.test.tsx
git commit -m "feat(stacks): add pure stack editing"
```

### Task 3: Plan and render one constant-footprint stack card

**Files:**

- Modify: `src/lib/layout/renderLayout.ts`
- Modify: `src/lib/layout/renderLayout.test.ts`
- Create: `src/newtab/canvas/StackCard.tsx`
- Create: `src/newtab/canvas/StackCard.test.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.test.tsx`
- Modify: `src/newtab/canvas/CanvasItem.tsx`
- Modify: `src/newtab/canvas/CanvasItem.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**

- Extend anchored and narrow render items with optional stack identity:

```ts
export interface RenderStack {
  id: string
  members: readonly BlockId[]
  facing: BlockId
}

export interface AnchoredRenderItem {
  id: BlockId
  mode: 'anchored'
  leftPct: number
  topPct: number
  tier: WidgetTier
  layer: number
  stack?: RenderStack
}
```

- `StackCard` consumes already resolved members and emits no data hooks:

```ts
export interface StackCardMember {
  id: BlockId
  label: string
  content: ReactNode
}

export interface StackCardProps {
  id: string
  members: readonly StackCardMember[]
  facing: BlockId
  editing: boolean
  onStep: (direction: -1 | 1) => void
  onFace: (id: BlockId) => void
}
```

- [ ] **RED:** Add planner tests requiring one item per stack, no separate
  member items, exact target geometry/tier/layer, unchanged facing across
  widths and reload-shaped calls, one item below 600px, and no materialization
  of stack members as default widgets. Require a disabled facing member to
  suppress the stack without selecting another face.
- [ ] Update `planLayoutRender` to consume stack members before the default
  widget loop and emit the facing identity plus stable `stack` metadata.
- [ ] **RED:** Add `StackCard` tests for all members mounted once, one visible
  face, centered short face, wrapped arrows, direct dots, 40px swipe with
  release-click suppression, sub-threshold click parity, Left/Right only when
  the card itself holds focus, always-visible edit dots, and no arrow/swipe
  paging in edit mode.
- [ ] Implement `StackCard` with one CSS grid and event-local swipe state.
  Controls stop propagation; the face content does not. Use
  `aria-roledescription="widget stack"`, a label such as `Weather, 1 of 3`,
  and explicit Previous/Next names.
- [ ] **RED:** Add Canvas tests proving all member renderers mount exactly
  once, all use the stack tier through each member's nearest-supported rule,
  the outer CanvasItem uses `stack:<id>` as its stable React/geometry key, and
  ordinary standalone/docked behavior remains exact.
- [ ] Route stacks through CanvasSurface and CanvasItem. Keep the facing
  entry's gear action for settings, but label movement/selection as
  `<Facing label> +<remaining count>`.
- [ ] Add CSS contracts for `display: grid`, shared `grid-area`, hidden face
  pointer safety, centered short faces, quiet dots, edge arrows, focus-visible
  treatment, reduced motion, and edit-only visibility. Use only existing
  tokens and do not add an outer card background.
- [ ] Run focused GREEN, TypeScript, and diff hygiene:

```powershell
npx vitest run src/lib/layout/renderLayout.test.ts src/newtab/canvas/StackCard.test.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/canvas/CanvasItem.test.tsx
npx tsc --noEmit
git diff --check
```

- [ ] Commit:

```powershell
git add src/lib/layout/renderLayout.ts src/lib/layout/renderLayout.test.ts src/newtab/canvas/StackCard.tsx src/newtab/canvas/StackCard.test.tsx src/newtab/canvas/CanvasSurface.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/canvas/CanvasItem.tsx src/newtab/canvas/CanvasItem.test.tsx src/newtab/index.css
git commit -m "feat(stacks): render stable manual stack cards"
```

### Task 4: Integrate hold-to-stack and complete live editing

**Files:**

- Modify: `src/newtab/edit/useCanvasDrag.ts`
- Modify: `src/newtab/edit/useCanvasDrag.test.tsx`
- Create: `src/newtab/edit/StackInspector.tsx`
- Create: `src/newtab/edit/StackInspector.test.tsx`
- Modify: `src/newtab/edit/WidgetInspector.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**

```ts
export type CanvasDragSubject =
  | Readonly<{ kind: 'widget'; id: BlockId }>
  | Readonly<{ kind: 'stack'; id: string }>
  | Readonly<{ kind: 'stack-member'; stackId: string; id: BlockId }>

export const STACK_HOLD_MS = 500

export interface CanvasDragDrop {
  zone: DockEdge | null
  pointerX: number
  point: { xPct: number; yPct: number }
  stackTarget: StackDropTarget | null
}
```

- [ ] **RED:** Extend drag-hook tests with fake time: a widget held over a
  free target for 499ms is unmarked, at 500ms is marked, leaving clears it,
  entering a dock clears it, changing targets restarts the clock, drop returns
  only the currently marked target, and a stack subject never becomes a stack
  source. Move/up listeners must clean up after inspector-origin member drags.
- [ ] Generalize `useCanvasDrag` to tagged subjects, document-level move/up
  listeners, target hit testing against the live geometry map, and one owned
  timeout. Preserve pointer capture, snapping, dock bands, and one-first-move
  semantics for standalone widgets.
- [ ] **RED:** Add StackInspector tests for title `Weather +2`, one shared Size
  group, Layer controls, ordered member rows, disabled boundary arrows, Remove,
  drag-out handle names, and Hide. Do not render Restore defaults for stacks.
- [ ] Implement StackInspector using the current inspector visual language:
  labelled rows, joined controls, quiet footer, and no extra modal. Increase
  panel height through measured content and `anchorPanel`; do not hardcode it
  over the selected card.
- [ ] **RED:** Add App interaction tests proving: 500ms hold creates and faces
  the dragged widget; no hold leaves overlap; dropping onto a stack appends;
  a stack drag moves the whole card; member-handle drag detaches one member;
  two-member detach dissolves; dot paging in edit creates one undo entry;
  Cancel writes nothing; Save/reload preserves exact `stacks`; and normal
  arrow paging writes only `layouts` while reaching the widget's own click on
  a plain click.
- [ ] Integrate stable object geometry keys in App. The target outline and
  `Stack with <label>` label render only while the 500ms target is marked.
  Dock zones remain unavailable for stack subjects; standalone widgets keep
  their existing dock eligibility behavior.
- [ ] Feed stack inspector overlap labels from the one card rect. Treat each
  other stack or free widget as one box and never compare hidden or docked
  members.
- [ ] Run focused GREEN, TypeScript, and diff hygiene:

```powershell
npx vitest run src/newtab/edit/useCanvasDrag.test.tsx src/newtab/edit/StackInspector.test.tsx src/newtab/edit/WidgetInspector.test.tsx src/newtab/App.test.tsx
npx tsc --noEmit
git diff --check
```

- [ ] Commit:

```powershell
git add src/newtab/edit/useCanvasDrag.ts src/newtab/edit/useCanvasDrag.test.tsx src/newtab/edit/StackInspector.tsx src/newtab/edit/StackInspector.test.tsx src/newtab/edit/WidgetInspector.tsx src/newtab/App.tsx src/newtab/App.test.tsx src/newtab/index.css
git commit -m "feat(stacks): create and edit stacks on canvas"
```

### Task 5: Extend the real-extension stack matrix

**Files:**

- Modify: `scripts/qa-nl-p6-scenarios.mjs`
- Modify: `scripts/qa-nl-p6.mjs`
- Modify: `scripts/qa-nl-p6-window.mjs`
- Modify: `scripts/qa-nl-p6-output.test.mjs` only if a new scratch suffix is
  required

**Produces:** One new saved `stacks` scenario across all twelve viewports and
one real-window interaction sequence. Accepted NL-P6 files remain unchanged.

- [ ] **RED:** Add a script-contract test or deliberate harness assertion that
  fails because no `stacks` scenario exists. The fixture must contain a
  three-member Standard stack with Month, Weather, and Quote, facing Quote,
  plus at least one standalone and one docked widget.
- [ ] Add the scenario without changing existing scenario bytes. At each cell
  assert one stack card, three mounted members, one visible facing member,
  exact stored facing, no duplicate standalone member wrappers, no zero box,
  no offscreen card, and no page overflow.
- [ ] **RED:** Add real-browser interaction assertions for constant card
  width/height across all three faces, wraparound arrows, dot jump, Weather
  click parity, 40px swipe without face click, keyboard paging, immediate
  `layouts`-only persistence, reload continuity, and edit-mode dot draft with
  exact Cancel.
- [ ] Add 500ms hold creation and sub-500ms deliberate-overlap controls to the
  exact 1408x445 real OS-window witness. Add member reorder/remove/dissolve and
  one-Undo checks where stable automation can observe them without replacing
  the required human judgment.
- [ ] Run the development matrix to ignored scratch output, inspect every new
  original-resolution stack capture, and record defects rather than grading
  mere render success as useful:

```powershell
node scripts/qa-nl-p6.mjs --out=.qa-widget-stacks-sweep
node scripts/qa-nl-p6-window.mjs --out=.qa-widget-stacks-window
```

- [ ] Require zero failures, runtime errors, unexpected failed requests,
  legacy `layout` writes, and cancelled-session writes. Keep authentic network,
  real touch hardware, and real screen-reader behavior as explicit manual
  ceilings.
- [ ] Commit only source and harness changes, never scratch output:

```powershell
git add scripts/qa-nl-p6-scenarios.mjs scripts/qa-nl-p6.mjs scripts/qa-nl-p6-window.mjs scripts/qa-nl-p6-output.test.mjs
git commit -m "test(stacks): prove stack behavior in Chromium"
```

### Task 6: Review, stabilize, document, and checkpoint

**Files:**

- Modify: `docs/superpowers/plans/2026-08-21-aurora-widget-stacks-implementation.md`
- Create: `docs/superpowers/reports/WIDGET-STACKS-QA.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `README.md`

- [ ] Request one independent bounded review of the complete stack range. Give
  the reviewer the approved stack spec, this plan, exact base/head, frozen
  boundaries, test commands, scratch evidence locations, and a Critical /
  Important / Minor reporting contract.
- [ ] If the review finds confirmed Critical or Important issues, add one
  focused failing regression per issue, apply one fix commit, and request one
  rereview of only that fix range. Ledger Minor observations without churn.
- [ ] Rebuild `dist` from the exact reviewed commit, then run one stabilized
  packet gate:

```powershell
npm test
npx tsc --noEmit
npm run test:information-first
node --test scripts/qa-nl-p6-output.test.mjs
npm run build
git diff --check
```

- [ ] Rerun the stack sweep and real-window witness only if the review changed
  stack behavior or QA assertions. Otherwise preserve the already reviewed
  evidence and do not create verification churn.
- [ ] Inspect the stack captures at 599x800, 600x800, 720x900, 1024x600,
  exact 1408x445, 1600x900, 1920x550, and 3440x1440. Record per-capture
  usefulness and the swipe experiment verdict in `WIDGET-STACKS-QA.md`.
- [ ] Record A2-D064: stacks are manual canvas placements with stable facing,
  constant tallest-member footprint, serialized normal paging, draft-only edit
  changes, and no Smart surfacing or docked stacks.
- [ ] Mark every completed checkbox, update STATUS/ROADMAP/README truthfully,
  and commit the packet checkpoint:

```powershell
git add docs/superpowers/plans/2026-08-21-aurora-widget-stacks-implementation.md docs/superpowers/reports/WIDGET-STACKS-QA.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/DECISIONS.md README.md
git commit -m "docs: checkpoint Aurora widget stacks"
git push origin feat/aurora-2-observatory
```

- [ ] Prove active HEAD equals upstream with a clean worktree, prove the
  protected checkout remains clean at `eb1354b6`, and proceed directly to the
  Weather enrichment just-in-time design/plan without a routine continuation
  prompt.

## Self-review checklist

- [ ] Spec sections 1-9 each map to a task above.
- [ ] Every production and harness behavior names its focused RED before its
  implementation step.
- [ ] Every function and type consumed by a later task is defined by an earlier
  task.
- [ ] One-place cleaning, strict backup rejection, exact old-document loading,
  and no version bump are all explicit.
- [ ] Constant footprint, short-face centering, all paging paths, click parity,
  and no edit-mode swipe are all explicit.
- [ ] Hold creation, ordinary overlap, append, reorder, remove, direct detach,
  dissolve, Hide, and one-entry undo are all explicit.
- [ ] Normal paging and edit-mode persistence laws are independently tested.
- [ ] Narrow-floor, short-height, exact 1408x445, and reload evidence are all
  required.
- [ ] Smart surfacing, docked stacks, Weather enrichment, new widgets,
  dependencies, permissions, release packaging, and Store actions remain out
  of scope.
- [ ] Placeholder scan finds no unresolved marker language or unspecified
  error-handling step.
