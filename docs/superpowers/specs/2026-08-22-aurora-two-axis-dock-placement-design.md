# Aurora Two-Axis Dock Placement Design

**Status:** Owner approved in visual and sectioned design review on 2026-08-22. Implementation pending.
**Date:** 2026-08-22
**Authority:** Owner correction that docked widgets must move vertically inside the top or bottom dock, not only horizontally. The owner refined the outer safety inset to 5px on every viewport edge on 2026-08-22.
**Extends:** The owner-refined free-X dock implementation recorded in `STATUS.md` on 2026-08-18 and the named-layout live editor.

## 1. Purpose and law

Aurora's current dock is free along X but still one row along Y. The user can put Tasks at any horizontal position but cannot move it higher or lower within the dock. That is still a system-owned slot, just on one axis.

The governing law remains:

> The user owns placement; the system owns safety. Nothing auto-swaps, derives, guesses, or re-flows.

Each dock therefore becomes a transparent two-dimensional placement band. Every member owns an independent X and Y position. The system provides guides, exact recovery, and viewport containment but never lays out the members for the user.

## 2. Scope and preserved boundaries

This design replaces only the one-row Y behavior of the existing free-X dock. It preserves:

- the user's exact X placement;
- top and bottom dock identities;
- one mounted widget and data owner per identity;
- Docked presentation and click parity;
- Bookmarks' explicit dock size choice;
- invisible strip background and pointer-transparent empty regions;
- narrow-floor dock-first ordering;
- exact edit-session Save, Cancel, Undo, and one-entry-per-gesture behavior;
- all storage, backup, connector, credential, permission, CSP, dependency, privacy, protected-checkout, and Store boundaries.

There are no dock slots, sections, rows, auto-packing, collision avoidance, or automatic recentering.

## 3. Placement model

`DockedWidgetPlacement` gains two optional additive fields:

```ts
export interface DockedWidgetPlacement {
  kind: 'docked'
  dock: 'top' | 'bottom'
  order: number
  x?: number
  y?: number
  align?: 'start' | 'center' | 'end'
  tier?: WidgetTier
  returnTier?: WidgetTier
}
```

`x` and `y` are the widget center as percentages of the dock band's usable width and height. Explicit values are finite and clamped to `[0, 100]` before storage. Final viewport containment uses the measured member rectangle, so a center may be clamped further during interaction without mutating another member.

`returnTier` records the free-floating tier that existed immediately before docking. It is not the Docked presentation size:

- docking a free widget stores its free tier as `returnTier`;
- changing the docked size changes `tier` only;
- undocking restores `returnTier`;
- an old docked placement with no `returnTier` keeps the current compatibility fallback to the nearest supported Standard presentation.

The optional shape is absent-safe. `LAYOUTS_DOCUMENT_VERSION` remains 1 and the top-level storage schema version does not change solely for these fields. The layouts cleaner and backup validator recognize finite optional values and preserve absence. No boot rewrite materializes `y` or `returnTier`.

## 4. Legacy behavior and the outer-perimeter exception

An existing placement with no `y` must remain at the current legacy baseline. It must not be interpreted as `50` and must not jump to the vertical center of the new band.

The renderer keeps a legacy baseline path for absent-Y members. It uses the current edge-specific CSS alignment and current hover-control headroom. Explicit-Y positioning activates only after the user deliberately moves the member vertically or redocks it.

Mixed docks are valid: an old absent-Y member and a newly positioned member can coexist. Saving another edit does not materialize or normalize the old member.

The original DY-P1 browser witness compares old-layout screenshots and measured member rectangles before and after the two-axis feature with no explicit Y edits. That immutable 16px/72px baseline remains the acceptance evidence for the original packet and must never be replaced.

The owner-approved 5px outer-perimeter refinement is an explicit exception to absolute viewport rectangles and full-page screenshot equality because moving the parent band necessarily moves its absent-Y children. It does not permit Aurora to materialize Y, rewrite storage, reorder members, or alter the internal legacy 16px/2px margins. A separate additive witness must prove exact 5px band bounds, inclusive corner docking, member containment, unchanged layouts bytes and reading order, toolbar clearance, and zero unexpected writes or runtime failures.

## 5. Placement band

Each non-empty dock owns one fixed-position transparent band:

```css
height: clamp(96px, 16vh, 128px)
```

- The top band begins 5px from the top edge.
- The bottom band begins 5px from the bottom edge.
- Both bands begin 5px from the left and right edges.
- The band overlays the canvas and does not consume layout space or move canvas objects.
- Empty areas are pointer-transparent in normal use.
- Widget interiors remain interactive in normal use.
- The band has no normal-mode fill, border, or permanent guide.
- The band is not a scrollport and never shows a scrollbar or overflow fade.

At the narrow floor below 600 CSS px, dock members continue to participate in the mechanical dock-first vertical stack. Stored X and Y values remain untouched and resume when the viewport returns above the floor.

## 6. Drag interaction

### 6.1 Move within one dock

Dragging a docked member inside its current band updates only that member's X and Y. The widget follows the pointer continuously without discrete slots or section snapping.

The first actual movement owns the gesture's single undo snapshot. Later pointer moves use the live operation without adding history entries.

### 6.2 Free widget into a dock

Crossing into a valid dock band previews the widget's Docked presentation immediately. The user never needs to choose Compact before docking. The preview uses the pointer's X and Y, clamped by the member's measured Docked rectangle.

Dropping stores the dock edge, X, Y, Docked size when explicitly chosen, and the source free tier as `returnTier`. The drag does not write until the edit session is saved.

### 6.3 Dock member into the canvas

Crossing from the band into the free canvas previews a free placement at the pointer. The free preview uses `returnTier`, or the legacy Standard compatibility fallback when absent. It does not bounce between unrelated default locations as the pointer crosses the boundary.

Dropping keeps that point and restored tier. Re-entering either dock during the same gesture returns to a Docked preview without requiring a separate size operation.

### 6.4 Dock member into the opposite dock

A single gesture can move a member directly from top to bottom or bottom to top. It retains its Docked size and return tier and writes the new edge, X, and Y as one undoable edit.

### 6.5 Cancellation

`pointercancel`, Escape, lost pointer capture, and explicit Cancel restore the exact pre-gesture draft. They clear all preview state, guides, overlap warnings born during the gesture, and temporary band highlighting. They never invoke drop semantics.

## 7. Guides and precision

Dock movement is continuous. The dock does not inherit the canvas's mandatory 8px grid.

Magnetic candidates are:

- the band's vertical centerline;
- the band's horizontal centerline;
- every peer member's horizontal center;
- every peer member's vertical center;
- every peer member's left, right, top, and bottom edge.

A candidate activates only inside a small pointer-distance threshold. The exact threshold is implementation-calibrated in Chromium and pinned by tests; it may not create broad hidden slots. Holding Alt bypasses magnetism for the gesture.

Only the active alignment guides paint. They appear during the drag and disappear synchronously on pointer up, pointer cancel, Escape, lost capture, band exit, or edit-session close. No guide or blue border remains at rest or in normal mode.

Keyboard nudging follows the established editor convention rather than creating a second one:

- Arrow moves eight CSS px.
- Shift+Arrow moves one CSS px.
- Alt does not affect keyboard nudging.

Nudging updates X and Y through the same measured clamp and creates one undo entry per key action.

## 8. Containment, overlap, and reading order

The system clamps the selected member using its live measured width and height. No painted edge may cross the viewport safety boundary. The clamp never moves peers.

Overlap remains legal. During editing, the warning is derived from current rectangles on every relevant move. It must clear during the same gesture once rectangles no longer intersect. It may not use a saved or pre-drag rectangle, and it never delays truth until Save or a new edit session.

Stored `order` remains an accessibility and narrow-floor order, not a placement mechanism. It is derived from X only:

1. lower X first;
2. existing order for equal X;
3. stable widget identity as the final tie-break.

Y never changes reading order. This prevents small vertical adjustments from reshuffling keyboard or narrow-floor order.

## 9. Edit chrome and hit testing

Docked widget interiors remain live in normal use. In edit mode they become inert like free widgets, while their grip and settings affordances remain reachable and outside the content collision zone.

The placement band's empty area accepts drag targeting only while an eligible object is being dragged in edit mode. At all other times it is pointer-transparent so it cannot block the layout badge, utility controls, launchers, or canvas content beneath it.

The band may show a subtle drop-target boundary while an eligible object is over it. That boundary is not a saved layout guide and disappears with the gesture.

## 10. Pure and component testing

Pure model coverage includes:

- optional Y and return-tier validation, cleaning, backup rejection, and round-trip;
- absent-Y and absent-return-tier compatibility;
- docking, in-dock movement, opposite-dock movement, undocking, and redocking;
- exact X/Y clamping inputs;
- X-only order derivation with stable ties;
- one undo entry per drag gesture;
- exact Cancel and pointer-cancel restoration;
- layouts-only Save and no legacy `layout` write.

Component coverage includes:

- top and bottom explicit-Y rendering;
- mixed legacy and explicit members;
- transient guides and Alt bypass;
- one-pixel and eight-pixel keyboard nudges;
- inert interiors with reachable edit chrome;
- current-rectangle overlap truth;
- pointer-transparent empty bands;
- no scrollbar, fade, or hidden scroller machinery.

## 11. Chromium acceptance

The real-browser witness uses existing-layout-shaped storage and includes:

- an absent-Y legacy top and bottom dock before any edit;
- Weather, Tasks, Notes, and Bookmarks at materially different widths and heights;
- far-left, off-center, center, far-right, high, middle, and low placements;
- top-to-bottom and bottom-to-top moves;
- free-to-dock without a prerequisite tier change;
- dock-to-free tier restoration;
- boundary crossing without bouncing;
- peer-center and peer-edge guide activation on both axes;
- Alt guide bypass;
- live overlap warning appearance and same-gesture clearance;
- pointer cancellation and exact Cancel;
- Save, reload, and byte-stable X/Y persistence;
- no stale guides, page movement, runtime errors, failed requests, unexpected writes, or legacy `layout` writes.

Viewport coverage includes 1366x768, exact 1408x445, 1600x900, both sides of the 600px narrow floor, and one real non-emulated Chrome window witness.

Before owner review, `dist` is rebuilt from the exact reviewed commit and build provenance is verified.

## 12. Delivery packet

The dock work is one independent packet, `DY-P1`, delivered before shared-frame migration:

1. optional data model and exact legacy rendering;
2. pure X/Y edit operations and tier restoration;
3. two-dimensional band rendering and drag transitions;
4. guides, keyboard movement, and live overlap truth;
5. focused Chromium witness, bounded review, one fix cycle if needed, ledger checkpoint, push, and repository proof.

No exhaustive shared-widget catalog runs inside this packet.

## 13. Acceptance criteria

1. Every dock member can be placed independently at any safe X and Y inside its band.
2. There are no left, center, right, high, middle, or low slots.
3. Existing absent-Y placements render exactly as before until deliberately moved.
4. Free-to-dock automatically uses the Docked presentation; no prior Compact choice is required.
5. Dock-to-free restores the pre-dock free tier when available.
6. Guides are accurate, transient, and bypassable.
7. Overlap feedback reflects live geometry and clears during the gesture.
8. One drag is one undo entry; Cancel and pointer cancellation are exact.
9. Narrow-floor order remains deterministic and stored coordinates survive it unchanged.
10. Frozen storage, backup, connector, permission, privacy, CSP, dependency, protected-checkout, and Store boundaries remain intact.

## 14. Deferred

- Docked widget stacks remain deferred.
- Multi-select and group movement remain deferred.
- User-resizable dock-band depth remains deferred; the approved responsive band is the only depth policy in this packet.
- Automatic collision packing or empty-space optimization is rejected, not deferred.
