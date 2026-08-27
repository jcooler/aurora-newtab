# Aurora Named Layouts and Live Canvas Design

**Status:** Owner approved in design review on 2026-08-17 (sections 1-6 approved with dock-scroll and bulk-size refinements)
**Date:** 2026-08-17
**Supersedes:** The four auto-selected size profiles, derived slot catalogs, hidden coordinate planes, the separate Arrange artboard screen, and fixed widget box tables from `2026-08-16-aurora-v1-canvas-adaptive-safety-rails-design.md` and `2026-08-17-aurora-information-first-production-readiness-remediation-design.md` where they conflict. Everything else in those documents — information-first hierarchy, type roles, legibility washes, connector truthfulness, Settings/Connector workspaces, and every frozen correctness boundary — remains in force.
**Authority:** Owner design session following A2-D060 (PR-P6 rejection and short-height recovery, forensics in `docs/superpowers/reports/SHORT-HEIGHT-RECOVERY-FORENSICS.md`)

## 1. The one-sentence law

The user owns placement; the system owns safety. Aurora never guesses,
derives, swaps, or re-flows a layout on the user's behalf. Every failure
the owner rejected this week traced to a system that anticipated instead
of obeyed: automatic profile swapping, derived slot catalogs, and hidden
coordinate planes. Those mechanisms are removed, not repaired.

## 2. Product model

### 2.1 Named layouts (workspaces)

A layout is a named, user-created object. Users create as many as they
want ("Desktop", "Laptop", "Productivity", "Personal"), and switch
manually. Layout switching is a feature, not a responsive mechanism.

A layout stores:

- its name;
- which widgets are enabled;
- each enabled widget's position (anchor + offset, section 2.2);
- each enabled widget's display tier (section 2.3) and stacking layer;
- dock membership and dock order (section 2.4);
- the layout's default bulk tier, when the user has set one.

Global state that a layout never touches: widget data settings (Weather
location, GitHub credentials and selected sections, calendar feeds, RSS
urls, Home Assistant config), background photos and rotation, Notes,
Tasks, Focus content, quotes, and all credentials. Switching layouts is
instant and cannot lose or alter data.

Controls:

- a small layout badge near the fixed utility controls opens the
  switcher (current layout name, list, "Edit layout", "New layout");
- full management in Settings: create, duplicate, rename, delete,
  reorder;
- per-layout settings contain the bulk tier control: one click sets
  every free-floating widget in this layout to Compact, Standard, or
  Full (docked widgets keep their Docked tier; individual widgets can
  then be overridden in edit mode);
- no automatic switching of any kind. The active layout changes only by
  user action.

Migration: on first run, the current active state (enabled widgets plus
the stored V1/V2/V3 layout) becomes a layout named "My layout". The
prior stored value is preserved exactly under recovery, per the existing
guarantees. No boot rewrite: conversion is in-memory until the first
explicit save.

### 2.2 Geometry: content-tight and edge-glued

- Widget bounds are the rendered content. The fixed `ITEM_BOXES` /
  `BASE_BOXES` tables are deleted. Outlines, collision feedback, drag
  ghosts, and hit areas all follow the true content rect, which makes
  them accurate by construction (the owner's "borders extend way past
  the widget" defect is structural and dies with the structure).
- Position is stored as an anchor plus offset: the widget is glued to
  the nearest of nine regions (four corners, four edge midlines,
  center), inferred from where the user drops it and editable in the
  inspector. Offsets are percentages of the available span from that
  anchor. Resizing the window or moving between monitors keeps every
  widget glued to its region; nothing re-flows.
- No hidden coordinate planes. What the user sees while editing is what
  renders, always, at every window size.
- Narrow floor: below approximately 600 CSS px of width, free-floating
  widgets render as a single vertical stack in layer order, with docks
  (section 2.4) rendered first. This is the only automatic behavior in
  the system, it is purely mechanical (no reordering logic), and it
  exists because nothing else is physically honest at that size.
- Overlap remains legal, warned about while editing, and never silently
  corrected.

### 2.3 Display tiers: Docked, Compact, Standard, Full

Every widget declares which of the four tiers it supports, and each
supported tier is a designed composition:

- **Docked:** one dense line for a dock strip. Text-first, for example
  Weather `75°F · Atlanta · Clear`, GitHub `7 commits · 2 PRs`. Middle
  dots separate facts.
- **Compact:** identity plus the primary value or action.
- **Standard:** primary value plus the useful selected rows or visual.
- **Full:** the complete selected composition — dense and beautiful
  (GitHub keeps the contribution graph and gains detail that fits).

The no-whitespace law: a tier must either fill its space with useful
information or shrink to what it has. If a larger tier would render
sparse for a widget, either the tier adds real data or the widget does
not offer that tier. Empty padding is a defect at every tier.

Bookmarks exemption: the Bookmarks bar renders its full readable form by
default in every layout and every dock decision. The one-letter mark
form exists only when the user explicitly selects it or below the tiny
viewport floor where the approved compact-width behavior already applies
(viewport width at or below 720 CSS px).

Tier catalog: the per-widget tier designs (roughly 26 widgets by up to
four tiers) are delivered as a visual catalog reviewed by the owner
widget-by-widget before implementation of each family is accepted. The
catalog is a gating deliverable: these tiers are the product's selling
piece and do not ship on geometry checks alone.

### 2.4 Docks

- Each layout may have a top dock, a bottom dock, both, or neither.
- A dock is created by dragging a widget to the top or bottom edge in
  edit mode; it disappears when its last widget leaves.
- Docked widgets render their Docked tier in one slim row with small
  margins. Order within the dock is draggable. Clicking a docked widget
  opens the same panel or expansion its free form offers.
- Overflow: the row scrolls horizontally ONLY when it genuinely
  overflows (the row is actually full). The scrollbar is never shown.
  Overflow is signaled by a masked fade at the clipped edge, and
  scrolled by wheel, trackpad, drag, and keyboard. Optional subtle
  arrow nubs may appear on hover at the faded edge. The strip must read
  as a clean status band, never as a scrollable div. Dock scrolling is
  local and never moves the page.
- Nothing is ever docked automatically. Bookmarks follow their
  exemption above.

### 2.5 Live edit mode

There is no separate Arrange screen and no preview artboard. Editing
happens on the real page, on the layout being viewed.

Normal use:

- hovering a widget fades in two small controls: a grip and a gear;
- the gear opens Settings focused on that widget's own section;
- clicking a widget performs the widget's own action and never paints a
  selection ring. The current container focus ring
  (`.board-item:focus-within` outline) is removed. Keyboard focus shows
  the browser focus indicator on the actual focused control only.

Edit mode (entered by grabbing a grip, the layout badge's "Edit
layout", or the keyboard command):

- the page dims slightly; widget interiors become inert;
- the selected widget shows a content-tight outline; every widget shows
  a hairline boundary on hover;
- expandable widgets (Weather) additionally show a dashed outline of
  their expanded footprint so placement decisions account for it;
- drag moves with pointer capture, 8px grid snapping, magnetic guides,
  and safe-margin clamping (existing behavior, retained);
- a small floating inspector beside the selected widget offers: tier,
  layer (forward/backward when overlapping), hide, restore defaults;
- a slim toolbar holds: layout switcher, bulk tier control, Undo,
  Reset, Cancel, Save;
- arrow keys move by 8px, Shift+Arrow by 1px, Escape cancels the
  session exactly, Save commits the whole draft once (explicit-save and
  exact recovery semantics are unchanged from Canvas V3);
- long-press enters edit mode on touch only;
- dragging to the top or bottom edge offers the dock drop zone.

### 2.6 Weather and expandable widgets

- Placement is never restricted anywhere on the canvas, including every
  corner. A rendering defect in the expansion is always fixed in the
  expansion, never by constraining placement.
- The expansion opens toward available space, clamps to the layout
  viewport (scrollbar-safe, per `a325891`), and uses one internal
  scrollport with a visible affordance when content exceeds the
  window. Opening moves no other widget.

## 3. What is deleted

Removed after reference proof, with focused regressions:

- automatic profile selection (`selectCanvasProfile` and the
  Small/Desktop/Large/Wide auto-swap machinery);
- derived per-profile slot catalogs and `spread`/`edgePosition`
  placement guessing in `canvasDefaults`;
- the Small coordinate plane (`SMALL_CANVAS_COORDINATE_HEIGHT`) and all
  content-derived plane interpretation;
- the Arrange artboard screen, logical artboard scaling, and
  sheet/side-inspector modality;
- fixed widget box tables (`ITEM_BOXES`, `BASE_BOXES`) and
  `data-stage-variant` / `board-item` emission from `CanvasItem`;
- the `.board-item:focus-within` container ring and remaining retired
  Adaptive Stage presentation CSS as it becomes unreferenced.

Preserved: storage authority, migrations, backup validation and
redaction, exact V1/V2/V3 recovery, connector identities and request
contracts, credentials and permissions, Notes ownership, Calendar and
ICS contracts, accessibility foundations, and every Store boundary.

## 4. Data and migration

- Storage schema advances additively (v12 to v13). A new `layouts`
  document holds the layout list and `activeLayoutId`. The legacy
  `layout` key is preserved untouched as recovery input.
- Layout writes remain explicit-save-only and atomic under the existing
  cross-context storage authority. Failed saves leave the previous
  state byte-for-byte restorable.
- Backup export/import carries the layouts document with full
  validation before any live write; V1/V2/V3 imports migrate through
  the same "My layout" adapter.
- No eager rewrite at boot, ever.

## 5. Interaction with the reopened QA standard

The rebuilt product gate (successor to the withdrawn PR-P6) tests this
model under the corrected standard from A2-D060:

- real Chromium plus at least one real, non-emulated window check;
- short-height desktop families including exact 1408x445;
- existing-layout-shaped storage (V1-adapted, V3, fresh) exercised
  through the migration adapter, plus resize transitions and reloads;
- per-capture usefulness judgment, not geometry alone;
- owner visual approval remains the hard gate before any release
  restaging, and the tier catalog carries its own owner review.

Owner-testing rule learned from the stale-build incident: every
owner-facing check starts by rebuilding `dist` from the exact reviewed
commit and confirming the loaded extension matches it.

## 6. Acceptance criteria

1. A user can create, name, duplicate, switch, and delete layouts; each
   layout restores its widgets, positions, tiers, layers, and docks
   exactly; switching never touches global data.
2. No window resize, monitor change, or reload ever re-flows, swaps, or
   repositions a widget beyond anchor-glued scaling; the narrow floor
   stacking is the only automatic behavior and is purely mechanical.
3. Widget outlines, drag ghosts, and collision feedback trace the real
   rendered content bounds within 1 CSS px.
4. Plain clicks in normal use never paint a widget selection ring.
5. Hover grip and gear appear on every widget; the gear reaches that
   widget's settings; edit mode offers drag, keyboard movement, tier,
   layer, hide, bulk tier, Undo, Reset, exact Cancel, and single
   explicit Save.
6. Expandable widgets show their expansion footprint in edit mode, may
   be placed anywhere including every corner, and expand fully inside
   the window with no sibling movement.
7. Docks render Docked tiers in a clean strip: no visible scrollbar
   ever, scrolling only on true overflow, masked edge fades, local
   scroll only.
8. Every shipped tier obeys the no-whitespace law; Bookmarks render the
   full readable bar by default everywhere.
9. The bulk tier control sets every free-floating widget in one layout
   at once. Individual per-widget tiers set afterward survive until the
   user applies bulk again, which re-baselines the whole layout: the
   most recent explicit action always wins.
10. Migration produces "My layout" from any prior V1/V2/V3 state with
    exact recovery preserved; backups round-trip the layouts document.
11. All deletions in section 3 are reference-proven with focused
    regressions; frozen boundaries are untouched.
12. The rebuilt QA gate passes under the corrected standard and the
    owner approves the visual result before any release restaging.

## 7. Delivery shape

Bounded packets, one review/fix/rereview cycle each, ledger checkpoints,
focused TDD throughout, full gates only at the stabilization packet:

1. **NL-P1 Layouts foundation:** schema v13, layouts document, "My
   layout" migration adapter, switcher plumbing, exact recovery. No
   presentation change.
2. **NL-P2 Content-tight anchored canvas:** anchor+offset geometry,
   content-sized rendering, narrow floor, deletion of boxes/planes/auto
   profiles, focus-ring removal.
3. **NL-P3 Live edit mode:** grips, gears, edit session, inspector,
   toolbar, bulk tier, expansion footprints, touch long-press.
4. **NL-P4 Docks:** dock zones, Docked-tier strip, clean overflow.
5. **NL-P5+ Tier catalog:** per-widget tier designs in owner-reviewed
   visual batches (several packets; each batch gated on owner review).
6. **NL-P6 Product QA gate:** the corrected common-display matrix
   against this model, real-window witness, owner visual gate.
7. **NL-P7 Stabilization and release restaging:** unchanged from the
   prior plan's PR-P7 shape; Store remains blocked pending W6-P5
   action-specific approval.

Implementation begins in a fresh session from a handoff prompt; that
session's first act is a written implementation plan for NL-P1 only,
per the plans-just-in-time rule.
