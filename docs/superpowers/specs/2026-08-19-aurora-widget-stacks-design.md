# Aurora Widget Stacks — Design

**Status:** Owner approved in brainstorming on 2026-08-19 (manual paging, reserve-the-tallest footprint, hold-to-stack creation).
**Extends** the named-layouts model in `2026-08-17-aurora-named-layouts-live-canvas-design.md`. Supersedes nothing.

## 1. Purpose and law

A stack is one card on the canvas holding several widgets, of which one faces
the user at a time. It buys canvas space back without hiding anything, the way
iOS widget stacks do — but WITHOUT iOS's Smart Rotate, because the
named-layouts law is explicit:

> the user owns placement; the system owns safety. Nothing auto-swaps,
> derives, guesses, or re-flows.

A stack therefore changes face ONLY when the user pages it. The face the user
left it on is the face that greets them on the next new tab, every time. Smart
surfacing (a stack jumping to a failed deploy or an imminent meeting) is
deliberately DEFERRED, not rejected — section 9 records exactly what the model
already carries to make it possible later.

## 2. Data model

A stack is a PLACEMENT, not a widget. `NamedLayout` gains one optional field;
every other placement kind is untouched.

```ts
export interface WidgetStack {
  /** Stable identity, so paging and reordering never depend on position. */
  id: string
  /** Paging order. Length >= 2 (see the dissolution rule, section 6). */
  members: readonly BlockId[]
  /** Which member faces the user. MUST be one of `members`. */
  facing: BlockId
  /** The card's own geometry — identical in shape to a free placement. */
  anchor: LayoutAnchor
  offsetX: number
  offsetY: number
  /** One tier for the whole card (section 5). */
  tier: WidgetTier
  layer: number
}

export interface NamedLayout {
  id: string
  name: string
  widgets: Partial<Record<BlockId, NamedLayoutPlacement>>
  bulkTier?: WidgetTier
  /** Absent on every pre-stack document, which is why this is additive and
   *  needs no document-version bump — the same discipline by which docked
   *  placements gained `x` and `tier`. */
  stacks?: readonly WidgetStack[]
}
```

**The one-place rule (validation, not correction).** A widget id may appear in
`widgets` OR in exactly one stack's `members`, never both and never in two
stacks. `cleanLayoutsDocument` enforces it by DROPPING the conflicting stack
membership and keeping the `widgets` entry, because `widgets` is the older,
load-bearing shape. A dropped membership is a cleaning outcome, not an error —
the established convention for malformed placement data.

**Cleaning rules.**

- A member id not in `BLOCK_IDS` is dropped from `members`.
- `facing` not present in the surviving `members` resets to `members[0]`.
- A stack whose surviving `members` length is < 2 is REMOVED, and its single
  survivor becomes a free placement at the stack's own anchor, offset, tier,
  and layer (section 6 dissolution, applied at cleaning time too, so a
  hand-edited or partially restored backup can never strand a widget).
- A stack whose id collides with another stack's id is dropped whole.

**Storage.** The `layouts` key is unchanged in shape and version.
`LAYOUTS_DOCUMENT_VERSION` stays 1: `stacks` is optional and absent-safe.
`backup.ts` validates `stacks` with the same strict structural discipline as
every other placement, rejecting a malformed stack rather than laundering it.

## 3. Rendering

`planLayoutRender` emits ONE render item per stack, at the stack's anchored
position, carrying the facing member's id plus the stack's identity.

```ts
export interface AnchoredRenderItem {
  id: BlockId            // the FACING member
  mode: 'anchored'
  leftPct: number
  topPct: number
  tier: WidgetTier
  layer: number
  /** Present only for a stack's card. */
  stack?: { id: string; members: readonly BlockId[]; facing: BlockId }
}
```

No new render MODE is introduced. A stack is anchored canvas content, so it
reuses anchored geometry, the edge-safety clamp, editing chrome, selection, and
the tier pipeline unchanged. Below the narrow floor a stack contributes exactly
one stacked item, showing its facing member.

**Reserve-the-tallest, without measuring anything.** Every member renders into a
single CSS grid cell (`grid-area: 1 / 1`) — the same grid-stack technique the
dock lane already uses. The cell sizes to its tallest member intrinsically, so:

- the card's footprint is constant across faces by construction;
- paging cannot resize the card, so nothing on the canvas shifts;
- there is no measurement code, no ResizeObserver, and no layout thrash.

Non-facing members are `visibility: hidden` and `pointer-events: none` —
present for sizing, invisible and unreachable. A face shorter than the reserved
box is CENTERED in it (`align-self: center`), so a short face reads as
deliberate rather than as whitespace at the top of a tall box.

**Accepted cost, chosen deliberately.** Hidden members stay mounted, so their
data hooks keep running. This is the same work those widgets did when they sat
separately on the canvas — stacking is not a performance feature — and it means
a face is warm the instant the user reaches it. Each widget already owns its own
caching and refresh lifecycle; nothing here changes it.

## 4. Paging

Manual only. Four affordances, all reaching the same pure operation.

| Affordance | Behavior |
| --- | --- |
| Hover arrows | Fade in at the card's left and right edge; click pages one face. |
| Dots | One dot per member at the card's foot; the facing dot is filled. Visible on hover, and ALWAYS visible during an edit session so a stack is identifiable at a glance. Clicking a dot jumps to that member. |
| Drag-swipe | A horizontal pointer drag past 40 CSS px pages one face. A drag is not a click, so this never steals the widget's own click action. |
| Keyboard | Left/Right arrows page while the card holds focus. |

Paging wraps (last to first). Paging is a WRITE of the active layout's `facing`
— an ordinary explicit change. In normal (non-editing) use it persists
immediately, because the user asked for a different face and no draft session
exists to hold it.

**Click parity is preserved (spec 2.4).** Clicking the face performs the
widget's own action — Weather still opens its details panel. Paging never
happens on a plain click.

**No paging during an edit session.** While editing, the card is a placement
being arranged: pointer drags MOVE the stack, they do not page it. Dots remain
visible and clickable, because choosing which face a layout saves with is
itself a layout decision.

## 5. Tier

The stack carries ONE tier, applied to every member. Members that do not
declare it resolve through the existing nearest-supported rule
(`resolveRenderTier`), so a Compact-only widget in a Standard stack renders
Compact rather than breaking. The inspector shows a single Size control for the
card. Per-member tiers are deliberately NOT offered: the box is shared, so
per-member sizing would reserve space for the largest member while smaller ones
float in it — the outcome reserve-the-tallest exists to avoid.

## 6. Creating, reordering, dissolving

**Create — hold to stack.** During an edit session, dragging a widget over
another and PAUSING for 500 ms marks the target: it shows a distinct stack
outline and a label ("Stack with Notes"). Dropping while marked creates the
stack. Dropping WITHOUT the pause leaves both widgets exactly as today —
overlapping, warned, never corrected. The pause is the intent signal, which is
what preserves deliberate overlap as a first-class placement.

The new stack takes the TARGET's anchor, offset, tier, and layer; the dragged
widget joins as the second member and becomes `facing` (the user just moved it,
so it is what they are looking at). Dragging a widget onto an existing stack
appends it.

**Reorder.** The inspector lists members in paging order with up/down controls.

**Remove.** The inspector offers Remove per member. The removed widget becomes
a free placement offset slightly from the card, so it is visible rather than
hidden underneath it.

**Dissolve.** Removing members until one remains dissolves the stack: the
survivor becomes a free placement at the stack's own geometry. Dragging a
member OUT of the card during an edit session is the direct-manipulation
equivalent and dissolves identically at two members.

**Undo.** Create, page, reorder, remove, and dissolve are each ONE undo entry,
and a drag gesture that creates a stack is one entry for the whole gesture —
the established one-entry-per-gesture rule.

## 7. Edit-session integration

A stack is ONE selectable object. Its inspector shows, in order: the card's
name (the facing member's label plus a count, e.g. "Weather +2"), Size, Layer,
the member list with reorder/remove, and Hide. Hiding a stack hides the whole
card; members are not individually hidable while stacked, because a hidden
member would be an invisible face the user could page into.

The passive overlap warning treats a stack as a single box, since that is what
it occupies.

## 8. Testing and acceptance

**Pure model** (`stacks.ts` plus `editSession`): create/append/page/reorder/
remove/dissolve; the one-place rule; cleaning of unknown members, bad `facing`,
id collisions, and sub-2-member stacks; exact save/restore round-trip; one undo
entry per operation; and a write-spy proof that paging writes only the
`layouts` key.

**Component** (`StackCard`): the card's height equals its tallest member on
every face; a short face is centered; dots reflect membership and facing;
arrows page and wrap; a 40px drag pages while a click does not; Left/Right page
on focus; click parity reaches the widget's own action; during editing, drags
move rather than page.

**QA gate:** NL-P6 gains a `stacks` scenario (a three-member stack including the
tall Month grid, saved and reloaded) so stacks ship proven across the full
viewport matrix, including the short-desktop family and both sides of the
narrow floor.

**Acceptance criteria.**

1. A stack never changes face on its own — across reloads, resizes, and day
   rollovers.
2. The card's footprint is identical on every face.
3. Deliberate overlap still works: a drop without the pause never stacks.
4. Clicking a face does the widget's own action; paging never does.
5. A stack survives Save then reload byte-identically, including `facing`.
6. Dissolving returns the survivor as a normal free widget at the card's
   position, never stranded or hidden.
7. Every existing saved layout — with no `stacks` field — loads and renders
   exactly as before.

## 9. Deferred, and what makes it possible

**Smart surfacing.** The model already stores `facing` as data and pages through
one pure operation, so a later rule ("surface a member with a failed deploy")
sets `facing` through that same operation with NO model change. Shipping it
would require amending the no-auto-swap law, which is an owner decision, not an
implementation detail. Recorded here so the option is not lost.

**Docked stacks.** Canvas only for v1. A dock member is one dense line and a
stack reserves its tallest member; those two rules pull against each other and
deserve a deliberate design rather than an extension of this one.

**Open questions carried into implementation** (both flagged to the owner at
design time):

1. Whether Full-tier members belong in stacks at all — a Full GitHub makes a
   very tall box every other face must reserve. Current answer: allowed,
   because the tier is the user's explicit choice and section 5 keeps it
   uniform.
2. Whether drag-swipe feels right beside the arrows. To be judged in the real
   extension during the QA gate; the arrows, dots, and keyboard paths make it
   removable without redesign if it does not.
