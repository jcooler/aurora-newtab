# Aurora V1 Canvas & Adaptive Safety Rails Design

**Date:** 2026-08-16

**Status:** Owner approved for implementation on 2026-08-16.

**Supersedes:** `2026-08-16-aurora-2-calm-canvas-remediation-design.md` and the user-facing layout, arrangement, and presentation parts of the Observatory design where they conflict with this document.

## 1. Decision

Aurora returns to its approved V1 product identity: a calm, photo-first personal canvas with a centered clock and focus, top bookmarks, meaningful edge widgets, direct free placement, and user-selected connector content.

Aurora 2's security, privacy, local-first storage, migrations, connector freshness, error recovery, accessibility, permissions, and backup work remain intact. The rejected Calm Canvas and semantic-zone presentation are replaced, not the correctness foundation beneath them.

The new architecture is a V1 canvas with adaptive safety rails:

- V1 determines the visual hierarchy and default composition.
- Every visible widget or launcher is directly selectable and movable.
- Snap guides, safe margins, responsive profiles, and collision feedback help users compose a clean page without taking control away from them.
- Responsive behavior adapts a user's composition. It does not silently replace it with Day, Now, Work Pulse, or Signal Dock concepts.

The owner approved this written specification on 2026-08-16. The bounded implementation plan is `docs/superpowers/plans/2026-08-16-aurora-v1-canvas-adaptive-safety-rails.md`.

## 2. Product north star

Aurora is a quiet, local-first home on every new tab. The photograph, time, personal focus, and the user's chosen information form one coherent composition.

Within roughly three seconds Aurora should answer:

1. What time is it, and where am I in the day?
2. What did I choose to focus on?
3. What information or action did I intentionally place within view?

Aurora is not:

- a collection of opaque dashboard cards;
- an automatic overflow system the user must learn;
- a semantic timeline of Earlier, Now, and Later;
- a productivity framework that decides where tools belong;
- a layout editor made primarily of abstract ordering buttons;
- a compressed status board that hides the information users selected.

The signature remains the full-bleed landscape with a centered live time and personal focus. Space Grotesk remains the time and numeric display face. Inter remains the interface and prose face. White, muted cool gray, cyan, and near-black remain the palette. Cyan marks interaction, selection, or attention. Opaque near-black belongs to active panels, editors, dialogs, and popovers, not passive focus copy or every widget.

## 3. Explicitly rejected candidate behavior

The Calm Canvas candidate at `3c5015a` is evidence and a recoverable checkpoint, not an accepted visual foundation or release candidate.

The following behavior is rejected:

- Bookmarks defaulting inside the centered content or bottom overflow.
- User-facing Day, Now, Work Pulse, or Signal Dock layout concepts.
- Move earlier and Move later as the primary spatial controls.
- Tasks, Notes, or Timer being Dock-only or otherwise unselectable.
- A fixed bottom Arrange dialog covering the content being arranged.
- Size or profile controls that do not cause a visible, useful change.
- An empty Aurora Briefing that says `Nothing urgent.`
- An opaque black Focus prompt pill.
- Committed Focus content shifting away from the centered axis.
- Compact Month showing an incomplete four-day row.
- Fixed-by-position ICS colors with no user choice.
- GitHub, Jira, GitLab, Vercel, or other connector cards losing user-selected sections merely to satisfy a generic compact presentation.

## 4. Default canvas composition

The stock Desktop profile restores the V1 composition:

```text
+ Timer ------------- Bookmarks ------------- Weather +
|                                                     |
| Personal widgets       Clock and greeting      Work |
| on the left            World clocks            cards|
|                        Countdown                    |
|                        Search                       |
|                        Focus                        |
|                        Quick Links                  |
|                                                     |
| Notes             Optional quote              Tasks|
+ Refresh ---------------------------------- Settings +
```

Default anchors are starting positions, not permanent ownership rules:

- Bookmarks: top center, full readable bar.
- Weather: upper right.
- Timer: upper left.
- Clock, greeting, world clocks, countdown, search, focus, and Quick Links: centered vertical rhythm.
- Calendar, sun, moon, habits, and other personal-day widgets: left side.
- GitHub, GitLab, Jira, Vercel, Status, RSS, Crypto, and Home Assistant: right side.
- Notes: lower left launcher.
- Tasks: lower right launcher.
- Quote: optional lower-center content.
- Refresh and Settings: fixed recovery controls that are never movable.

No region receives a painted slab merely because it owns empty capacity. Passive widgets use photo-native text, quiet localized scrims, hairlines, or one content-sized surface when the content needs one. The photograph must remain visually important.

## 5. Responsive profiles

Internal profile keys remain `compact`, `standard`, `display`, and `ultrawide` for compatibility. User-facing names become:

| Internal key | User-facing name | Intended canvas |
|---|---|---|
| `compact` | Small | Narrow windows, short windows, high zoom, and touch layouts |
| `standard` | Desktop | Ordinary laptop and desktop new tabs |
| `display` | Large | Large desktop and 4K CSS canvases |
| `ultrawide` | Wide | Wide and ultrawide canvases |

Each profile owns a real preview and can hold its own positions and sizes. Arrange presents these as tabs, not as an inert Copy from profile selector.

Profile behavior:

- Desktop is the primary authoring profile.
- Small, Large, and Wide start from deterministic fitted versions of Desktop unless the user customizes them.
- A profile becomes independent only after the user changes and saves it.
- `Use Desktop layout everywhere` previews a fitted copy in every profile before Save.
- Copying a profile is explicit, immediately visible, and undoable.
- Changing the active preview tab changes the actual preview canvas dimensions and content, not only a label.
- A profile transition never hides an enabled item without a reachable representation.

The current threshold logic may be recalibrated with named viewport evidence, but profile names must not imply physical monitor size or viewing distance.

## 6. Direct arrangement

### 6.1 Entry and selection

Users enter Arrange through:

- long-pressing any visible movable block;
- choosing `Arrange layout` in Settings;
- a keyboard-accessible Arrange command.

Every visible widget and launcher is selectable, including Clock, Greeting, Search, Focus, Quick Links, Bookmarks, Timer, Tasks, Notes, and every connector. Fixed Refresh and Settings controls remain outside arrangement so recovery is always available.

### 6.2 Canvas manipulation

The primary operation is direct drag placement:

- Drag follows the pointer with pointer capture.
- An 8px grid provides light snapping.
- Magnetic guides appear for viewport centers and neighboring edges and centers.
- Positions clamp to an 8px safe margin.
- The selected block keeps its real visual content visible during arrangement.
- Widget interiors are inert while arranging so dragging cannot open a panel or trigger an action.
- A user may intentionally overlap blocks. Aurora warns visibly and in the accessibility status, but never silently relocates the block.
- Save is allowed with an overlap because layout ownership remains with the user. Reset and Undo remain available.

Keyboard behavior:

- Tab and Shift+Tab move through every visible block and editor control.
- Arrow keys move the selected block by 8px.
- Shift+Arrow moves by 1px.
- Escape cancels the whole session and restores the pre-session layout.
- Save commits the complete draft once.

### 6.3 Non-occluding editor

Arrange uses two controls:

1. A slim top toolbar containing profile tabs, Undo, Reset, Cancel, and Save.
2. A right-side inspector for the selected widget.

The preview canvas is reduced to the remaining viewport width while the inspector is open. The inspector does not overlay the canvas. On Small, the inspector is a dismissible sheet that temporarily replaces the preview rather than covering the selected content.

The inspector shows only applicable controls:

- Position as direct movement controls and readable coordinates.
- Size choices that have materially different presentations.
- Bring forward and Send backward when the selected block overlaps another block.
- Widget-specific display choices already owned by that widget.
- Visibility, when the widget is not always required.
- Restore default position and Restore default size.

The primary interface contains no Earlier, Later, Now, Pinned, Automatic, Dock, Day, or Work Pulse vocabulary. Internal layout metadata may use stable technical names, but users arrange physical content through physical controls.

### 6.4 Optional Bottom bar

The Signal Dock name is retired from the user interface. A Bottom bar may exist as an optional compact launcher shelf:

- It is empty and unpainted by default on Desktop, Large, and Wide.
- It appears when the user places launchers there or when Small needs a reachable overflow representation.
- It never silently absorbs full connector cards on roomy profiles.
- Items placed there remain individually movable and removable.
- Its horizontal scrolling is local and never moves the document or canvas.

## 7. Canvas ownership & derived layout

The canvas separates five responsibilities:

- **Widget registry:** retains stable block identity, availability, renderer, supported sizes, and default placement metadata. It no longer restricts ordinary widgets to user-facing semantic zones.
- **Canvas defaults:** owns the versioned V1-inspired starting position and size for each block in each profile.
- **Layout adapter:** reads V1, V2, or V3 and produces one normalized in-memory Canvas profile without writing storage.
- **Canvas surface:** renders normalized positions, clamps them to the safe canvas, and owns canvas scrolling and stacking.
- **Arrange session:** owns one isolated draft, selection, guides, history, overlap feedback, and the single atomic Save.

Derived profiles remain deterministic and clean without becoming a hidden semantic-zone system:

- Core anchors reserve the top Bookmarks band, centered personal stack, upper-corner Weather and Timer, and lower-corner Notes and Tasks.
- Optional personal widgets pack downward from their versioned left-side defaults.
- Optional work widgets pack downward from their versioned right-side defaults.
- Large and Wide may use additional edge columns when measured content would otherwise exceed the safe height.
- Small uses one readable vertical document flow in the same semantic order as the visual defaults, with Bookmarks and tool launchers still directly reachable.
- If a derived Desktop, Large, or Wide profile cannot fit all enabled content, the canvas gains vertical scrolling. It never hides, scales down, or silently sends full widgets to the Bottom bar.
- Enabling a widget in a custom profile places only that new widget at its profile default. If occupied, it uses the nearest safe snapped position without moving existing custom blocks.
- Resizing within one profile preserves percentage positions and clamps only blocks that would leave the safe canvas.
- Crossing a profile boundary loads that profile's derived or custom layout. It never mutates either profile.
- Once a profile is custom, Aurora does not replan its existing blocks.

The canvas surface may use internal anchor names for deterministic code, but those names never become controls, visible headings, or accessibility labels.

## 8. Layout data & migration safety

The layout document advances additively from semantic Layout V2 to Canvas Layout V3. The storage schema advances from v11 to v12 to validate the layout union explicitly while preserving existing values.

```ts
type CanvasProfileKey = 'compact' | 'standard' | 'display' | 'ultrawide'
type CanvasMode = 'derived' | 'custom'
type CanvasSize = 'compact' | 'standard' | 'full'

interface CanvasPlacement {
  kind: 'canvas'
  x: number        // center, percentage of safe canvas width
  y: number        // center, percentage of safe canvas height
  size: CanvasSize
  layer: number    // finite, normalized on Save
}

interface BottomBarPlacement {
  kind: 'bottom-bar'
  order: number
  size: 'compact'
}

interface CanvasProfile {
  mode: CanvasMode
  placements: Partial<Record<BlockId, CanvasPlacement | BottomBarPlacement>>
}

interface LayoutV3 {
  version: 3
  profiles: Partial<Record<CanvasProfileKey, CanvasProfile>>
  recovery?: {
    semanticV2?: LayoutV2
    legacyV1?: Layout
  }
}
```

These types and contracts are normative for implementation planning:

- V1 and V2 layouts remain accepted inputs during the supported migration period.
- Opening Aurora performs an in-memory conversion only. It never writes a converted layout merely because the page rendered.
- The first Canvas Save stores the exact previous layout under `recovery` before committing V3.
- Backup export/import supports V1, V2, and V3 layouts and validates all finite coordinates and known block IDs before any live write.
- Failed migration or failed Save leaves the previous layout byte-for-byte restorable.
- `Restore previous layout` is available while recovery data exists.
- Resetting one profile does not delete other profiles or recovery data.
- Disabled widgets keep their positions.
- Unknown or corrupt positions fall back per block without rejecting the entire layout.
- Overlapping canvas blocks use their stored finite layer. Arrange exposes Bring forward and Send backward only when layering is relevant.
- No migration changes connector settings, credentials, capability URLs, snapshots, permissions, Notes, Tasks, links, calendars, uploaded photos, or any other stored data.

The storage schema advances from v11 to v12 so the `layout` key can validate the V1, V2, and V3 union explicitly. The v11 to v12 migration preserves an existing V1 or V2 `layout` value byte-for-byte, changes only schema-version metadata, and does not rewrite any Aurora data key. New installs receive an empty derived V3 layout. The application renders an existing V1 or V2 value through an in-memory adapter and writes V3 only after an explicit Canvas Save. Before that first V3 write, the exact previous layout is copied into `recovery` and the write remains atomic under the existing storage authority.

## 9. Focus, greeting & Briefing

Focus retains one centered footprint across every state:

- Empty prompt, input, committed text, completion checkbox, feedback, and Edit remain on the same centered axis.
- Committing text does not change the block's left edge, width, or alignment.
- The opaque Focus prompt pill is removed.
- Contrast uses a restrained local gradient, text shadow, or content-sized translucent wash that does not read as a black control.
- The text input remains visually clear, keyboard reachable, and correctly labelled.

The Aurora Briefing becomes optional and conditional:

- A new optional `briefingEnabled` setting reads as `false` when absent and writes only after the user changes it. No migration eagerly rewrites Settings.
- It is off by default for migrated and new users until explicitly enabled.
- It renders nothing when there is no meaningful signal.
- `Nothing urgent.` is removed.
- It never displaces Focus or changes the centered rhythm when empty.
- Its content remains deterministic, local, and cloud-free.

## 10. Bookmarks, tools & panels

### Bookmarks

- Default position is top center, matching V1.
- The full readable bar is the default Desktop, Large, and Wide presentation.
- A Small presentation may collapse overflow but preserves names and folder access.
- The complete Bookmarks block is movable.
- Folder popovers remain viewport-contained, clickable, keyboard navigable, and outside any clipping ancestor.

### Timer, Tasks & Notes

- Timer, Tasks, and Notes are movable launchers, not Bottom-bar-only identities.
- Default Timer position is upper left.
- Default Notes and Tasks positions are lower left and lower right.
- Each launcher can open its established panel without moving the launcher.
- One panel may open at a time where existing ownership requires it, but no mandatory global Utility Tray button is required to reach the tools.
- Timer continues running when its panel closes.
- Notes preserves revision ownership, truthful Saving/Saved/Error states, retry, and awaited close behavior.
- Open panels anchor from their launchers when space allows and use a contained sheet on Small.

The Utility Tray may remain as an optional command surface or narrow-screen container, but it is not the only path to Tasks, Notes, Timer, Home Assistant, or Refresh.

## 11. Widget sizes & content contracts

Size choices are shown only when their content is materially different. A control never offers Compact, Standard, or Full if two choices render the same useful information.

General contract:

- Compact: identity plus one useful primary value or action.
- Standard: primary value plus two or three useful rows or a selected visual.
- Full: the complete user-selected composition that fits the measured surface.

Each widget owns its content contract. Responsive CSS may reflow or truncate within that contract but may not quietly remove a user-selected section. If the chosen size cannot fit selected content, the inspector explains the conflict and offers a larger size.

### Connector restoration

- GitHub Compact: selected primary count or graph sparkline.
- GitHub Standard: contribution graph or the user's selected rows, according to existing `Show on your board` choices.
- GitHub Full: contribution graph, contribution stats, and selected PR, issue, and notification rows.
- Jira Compact: meaningful count by selected view.
- Jira Standard: real prioritized issue rows with key, summary, and status or due context.
- Jira Full: all user-selected Jira sections within a measured readable surface.
- GitLab, Vercel, Status, RSS, Crypto, and Home Assistant follow the same selected-section rule.
- Existing connector view settings remain authoritative. Layout size does not reset or override them.
- Healthy states stay quiet, but quiet does not mean empty or gutted.

Display and Wide profiles must reveal useful detail or improve legibility. They may not merely spread the same compact content farther apart.

## 12. Month & ICS calendars

Month and ICS remain separate widgets with separate jobs.

### Month

- Compact shows a complete seven-day current-week strip with today clearly marked.
- Standard shows the complete month grid.
- Month offers no Full size because Standard already contains the complete month. A future combined month and agenda design requires its own approved specification.
- No variant shows an arbitrary four-day fragment.
- Previous, next, and Today controls remain named and reachable.

### ICS

- Today, Upcoming, and One per calendar views remain.
- Existing named feeds, normalized `webcal` URLs, permissions, snapshot ownership, redaction, and per-feed failure behavior remain unchanged.
- Every calendar has an `Auto` color and a user-selectable contrast-safe palette.
- Auto preserves the existing deterministic position-based palette.
- A selected color follows the calendar identity when calendars are reordered.
- The settings row and event dots use the same chosen color.
- Colors supplement names and never become the only calendar attribution.
- Existing configurations without a color read as `Auto`; no eager write is required.

## 13. Visual system

The visual system returns to V1 restraint:

| Role | Reference value | Use |
|---|---|---|
| Photo ink | `#F7FAFC` | Primary time and photo-native text |
| Muted photo ink | `#BAC6D2` | Secondary copy after contrast verification |
| Aurora cyan | `#7DDCFF` | Focus, selection, links, guides, and attention |
| Active surface | `rgb(8 12 18 / 94%)` | Dialogs, editors, active panels, and popovers |
| Quiet hairline | `rgb(255 255 255 / 16%)` | Content separation where spacing alone is insufficient |

These are reference tokens, not permission to bypass the existing theme and contrast system. Final token values must pass the packaged-photo contrast witnesses.

- Full-bleed bundled photography is the dominant material.
- Center content is primarily typographic.
- Passive widgets use localized contrast support instead of generic black cards whenever readability permits.
- Rich cards are content-sized and reserved for information that benefits from a bounded surface.
- Opaque near-black surfaces are used for active panels, dialogs, editors, and popovers.
- One cyan accent communicates interaction, selection, focus, or attention.
- Borders and shadows are quiet until hover, focus, selection, stale data, failure, or pending work requires emphasis.
- Motion is limited to arrangement lift, guide appearance, panel entry, and state transitions, with reduced-motion equivalents.

Accessibility contrast remains non-negotiable. The visual solution must meet contrast without turning every passive phrase into a pill.

## 14. Error handling & accessibility

- Every widget continues to isolate failures through its existing boundary.
- A corrupt layout affects only the invalid block.
- A failed layout Save leaves the draft open and the stored layout unchanged.
- Cancel restores the exact pre-session layout and invoking focus.
- Arrange announces selection, movement, profile, overlap warnings, Save, failure, and cancellation.
- All direct manipulation has keyboard equivalents.
- Focus indicators remain visible over every packaged photograph.
- Popovers and panels restore focus to the invoking movable launcher.
- Small profile retains one document-safe vertical path and no document-level horizontal overflow.
- Real screen-reader speech, native Chrome zoom, mixed-DPI movement, live Home Assistant, native permissions, and physical touch remain explicit manual ceilings.

## 15. Acceptance criteria

The design is implemented only when all of the following are true:

1. The stock Desktop composition is visibly recognizable as Aurora V1 rather than the rejected semantic dashboard.
2. Bookmarks default to the top center and remain movable.
3. Timer, Tasks, and Notes are visible, selectable, movable launchers.
4. Every visible registry identity can be selected in Arrange.
5. Arrange uses direct drag, snapping, keyboard movement, and a non-occluding inspector.
6. No primary user-facing control says Day, Now, Work Pulse, Signal Dock, Earlier, Later, Pinned, Automatic, or Dock.
7. Small, Desktop, Large, and Wide tabs preview materially different canvases when their saved layouts differ.
8. Unsupported or visually identical widget sizes are not offered.
9. Focus remains centered before entry, during editing, after commit, after completion, and while editing again.
10. Focus uses no opaque black prompt pill.
11. Empty Briefing renders nothing and never says `Nothing urgent.`
12. GitHub, Jira, GitLab, Vercel, and other connector cards preserve user-selected content at sizes that claim to support it.
13. Compact Month shows seven days; Standard shows the complete month; no four-day fragment exists.
14. ICS calendar colors are user-selectable, backward-compatible, accessible, and not the sole source indicator.
15. Current Layout V2 and preserved V1 layout data remain recoverable and are not rewritten on boot.
16. No connector, credential, capability URL, permission, snapshot, backup, Notes, Tasks, photo, or other stored-data contract regresses.
17. The protected original checkout remains untouched and equal to its upstream.
18. No Chrome Web Store action occurs before explicit W6-P5 approval.

## 16. Delivery packets

The implementation plan should decompose this design into bounded packets:

1. **V3 layout foundation:** union validation, in-memory adapters, recovery model, migration tests, no presentation change.
2. **Canvas renderer:** V1 default anchors, profile fitting, safe margins, selection geometry, no widget-content change.
3. **Direct Arrange:** drag, snap, guides, keyboard movement, top toolbar, side inspector, Save/Cancel/Undo/Reset, every visible widget selectable.
4. **V1 interaction restoration:** top Bookmarks; movable Timer, Tasks, and Notes; direct panels; Focus and conditional Briefing.
5. **Meaningful widget sizes:** restore connector compositions and make profile/size choices materially distinct.
6. **Calendar completion:** seven-day/full Month variants and per-calendar ICS colors.
7. **Integrated visual QA:** representative profiles and states, original-resolution review, one implementation review and one fix/rereview cycle.
8. **Final gates:** full unit suite, production/preview builds, and canonical browser harness once after the owner accepts the stabilized visual direction.

Each packet uses focused tests while developing. Only Critical or Important defects block completion. Minor cosmetic or evidence debt is ledgered. Full gates are not repeated because reports or unrelated files changed.

## 17. Visual approval gates

The first implementation packet that changes presentation must stop after producing these real-content captures:

- Desktop 1600x900 default composition.
- Desktop 1600x900 Arrange with Clock selected and inspector visible.
- Small 375x812 default and Arrange.

After the owner approves that canvas and arrangement direction, the widget-size and calendar packets must stop after producing:

- Desktop 1600x900 Bookmarks plus GitHub and Jira rich cards.
- Large 2560x1440 dense composition.
- Wide 3440x1440 dense composition.

The owner must approve the direction before deeper widget-variant work or final gates. A contact sheet is navigation only; each capture is inspected at original resolution.

## 18. Protected boundaries

- Do not modify `D:\DEV\Chrome plugin`.
- Do not weaken security, privacy, permissions, snapshot identity, storage serialization, Notes persistence, backup validation, secret redaction, or migration rollback.
- Do not delete the rejected candidate commits. They remain historical evidence and a recoverable checkpoint.
- Do not create or modify Store assets, packages, dashboard answers, uploads, submissions, rollout, or live listing state until the roadmap reaches the appropriate packet and W6-P5 receives explicit contemporaneous approval.
- Do not begin production code until the owner approves this written specification.
