# Aurora Information-First Production Readiness Remediation Design

**Status:** Ready for owner review  
**Date:** 2026-08-17  
**Target:** Aurora 2.0.0 production-ready release candidate  
**Authority:** Owner visual QA of the packaged `864ffce` candidate, the approved V1 Canvas foundation, and frozen Aurora 2 correctness boundaries

## 1. Decision

The staged Aurora 2.0.0 presentation is not production-ready. Its local ZIP, Store screenshots, and release dossier remain useful historical evidence, but they are not eligible for upload.

Aurora is an information-first new-tab workspace. Its primary job is to make an open tab useful within roughly three seconds through time, focus, personal context, work signals, connector data, and a clear next action. Photography is supporting atmosphere and visual identity. It must not consume the product hierarchy, reduce legibility, or substitute for useful information.

This design combines both approved remediation paths:

1. Correct the demonstrated runtime and viewport defects first.
2. Converge the Canvas, Settings, Connectors, typography, contrast, and Arrange experience into one coherent production UI.

This specification supersedes the photo-dominance language in the V1 Canvas specification and decisions A2-D044, A2-D047, and A2-D049 where they conflict. It does not supersede Canvas V3, explicit-save-only layout persistence, exact V1/V2 recovery, independent profiles, direct Arrange, truthful widget sizes, complete Month behavior, ICS colors, or any frozen security and privacy boundary.

## 2. Confirmed release blockers

The following are confirmed from the owner's installed-extension screenshots, direct Chromium measurements, and source inspection:

1. The roomy Settings drawer is 1,024 CSS px wide while its useful content is much narrower, leaving hundreds of pixels of dead space. Its closed transform can leave a visible strip at the viewport edge.
2. The Connectors sticky introduction paints an unrelated black slab over the Settings surface.
3. Weather expansion changes the Canvas item's intrinsic box around its center. At the legal top edge this moves the expanded content upward and clips it outside the viewport.
4. Enabling or disabling widgets recomputes count-based default positions and Canvas height. Existing visible widgets can jump even though the user moved only one switch.
5. Selecting the Small profile on a roomy physical display turns the inspector into a full-width sheet and hides the actual preview. The profile being previewed is incorrectly used as the editor modality.
6. At a 3,840 by 2,160 CSS viewport, the clock grows but the date, quote, attribution, and supporting context remain laptop-sized. The current UI has no useful text-size control.
7. Passive text depends on a weak global scrim plus selectors written for the retired Adaptive Stage. It is not reliably legible over every bundled or uploaded background.
8. `Mute sounds` is unexplained and controls only the timer completion sound. `Show briefing` does not explain its Calendar, Tasks, and rain inputs.
9. `Layout density` remains user-facing even though Canvas profiles own layout and the old density model has no coherent Canvas meaning.
10. Connector Settings cards expose long forms for every enabled connector, advertise setup-needed connectors as enabled, and use large repeated card shells. The result is visually noisy, vertically inefficient, and semantically unclear.
11. `src/newtab/index.css` still contains a large retired Adaptive Stage presentation layer. `BoardItem`, `LauncherShelf`, old Dock sizing, and legacy harness branches remain even where the Canvas no longer imports them.

These are product failures, not documentation-only or screenshot-only defects. The release path stays blocked until the accepted implementation and visual QA replace the rejected candidate.

## 3. Product north star

Aurora should answer these questions without opening another app:

1. What time and day is it?
2. What am I focused on?
3. What personal or work information changed?
4. What needs attention next?
5. What can I act on now?

The default visual order is:

1. Time, date, greeting, Focus, and optional Daily summary.
2. User-selected calendar, weather, task, and personal context.
3. User-selected connector signals with truthful state and useful detail.
4. Direct action launchers for Timer, Tasks, Notes, Search, Refresh, and Settings.
5. Background photography as a continuous atmosphere behind the information.

No profile may turn Aurora into an empty wallpaper screen when the user has enabled information. No dense profile may turn it into a pile of unrelated black cards.

## 4. Visual system

### 4.1 Type roles

Retain the bundled typefaces:

- Space Grotesk for time, dates, greetings, primary numeric values, and selected headings.
- Inter for controls, metadata, connector prose, lists, and settings.
- Tabular numerals for time, temperatures, counts, dates, and Arrange coordinates.

Canvas typography uses role tokens rather than component-local laptop-only utilities:

| Role | Ordinary desktop floor | Large and 4K target | Notes |
|---|---:|---:|---|
| Clock | 72 px | 184 to 216 px | Bounded by both width and height |
| Date | 16 px | 20 to 22 px | Always visible when Clock size promises it |
| Greeting | 32 px | 48 to 56 px | May truncate a user name but not silently shrink below the floor |
| Focus and Daily summary | 16 px | 18 to 20 px | Primary supporting information |
| Quote | 15 px | 18 to 20 px | Compact excerpts remain readable |
| Quote attribution | 13 px | 16 px | Never 10 or 11 px on a 4K Canvas |
| Widget body | 14 px | 16 to 18 px | 12 px remains metadata only |
| Metadata | 12 px | 14 px | Never the main information value |

The existing stored `settings.layoutDensity` key remains accepted in schema v12 for compatibility, but layout no longer consumes it. Settings presents the control as **Text size**:

- Automatic writes `auto` and uses profile-aware readable defaults.
- Standard writes `balanced`.
- Large writes `spacious`.
- A legacy stored `compact` value reads as Standard until the user explicitly changes it.

This adapter avoids a schema migration, preserves backups, performs no eager write, and gives the field one truthful user-facing meaning.

### 4.2 Contrast and surfaces

Add one pointer-transparent Canvas legibility layer with broad, edge-free gradients:

- a top wash behind Bookmarks;
- a center radial wash behind Clock, Greeting, Focus, and Daily summary;
- left and right edge washes behind personal and connector information;
- a bottom wash behind Quote and fixed utility controls.

The washes must fade without visible rectangular boundaries. Text retains the local shadow treatment. Uploaded backgrounds and the brightest and most detailed bundled photos must keep ordinary text at WCAG AA contrast where practical for dynamic imagery.

Structured data widgets may use a quiet translucent surface when rows, controls, or charts need grouping. Passive text does not receive an opaque black rectangle. Opaque surfaces are reserved for active panels, Settings, Arrange, dialogs, menus, and disclosures.

Panel color remains user-selectable and continues to drive foreground adaptation. The remediation must not introduce a second unrelated black token.

### 4.3 Spacing

Spacing must follow content, not viewport size alone:

- Passive widgets have no fixed empty minimum height beyond their declared size contract.
- A collapsed Weather widget's visible content occupies at least 60 percent of its allocated block height.
- Settings rows use a bounded label-to-control distance rather than stretching controls to the far edge of a 1,024 px panel.
- Large and Wide layouts spend additional space on useful rows, readable charts, or larger type, not blank gaps.

## 5. Stable Canvas behavior

### 5.1 Stable source slots

Replace count-dependent `spread(index, count, ...)` placement with a profile-specific source slot catalog keyed by stable widget identity. A widget's preferred source position does not depend on which siblings are enabled.

For derived profiles:

- each identity owns one preferred slot and size per profile;
- disabling an identity removes only that identity from rendering;
- re-enabling it returns it to the same source slot;
- surviving widgets keep identical x, y, size, and layer values;
- no layout write occurs from a Settings toggle;
- a dense default may use multiple information columns or a taller Small document, but it may not move existing widgets merely because active count changed.

For custom V3 profiles, the current rule remains: saved placements win exactly, and a newly visible unsaved identity alone is placed at the nearest free safe location. Existing custom blocks never move to make room.

### 5.2 Runtime profile ownership

Replace `useAdaptiveStageViewport` with a Canvas-specific viewport hook that owns only:

- CSS viewport width and height;
- Small, Desktop, Large, or Wide profile selection;
- the compatible Text size projection;
- resize subscription and cleanup.

It must not publish Day, Now, Work Pulse, Signal Dock, density-capacity, or semantic-grid variables.

### 5.3 Toggle stability acceptance

For every widget and connector toggle exercised in Chromium:

- record all visible Canvas item rectangles before the toggle;
- toggle one identity on and then off;
- assert every surviving identity's center, size, and layer remain unchanged within 1 CSS px;
- assert the changed identity alone appears or disappears;
- assert storage layout bytes remain unchanged.

## 6. Weather

### 6.1 Collapsed size contracts

Weather remains a movable Canvas widget with meaningful sizes:

- Compact: icon, temperature and unit, `Condition - Location`, freshness when needed, and a disclosure chevron.
- Standard: Compact content plus the next useful rain or trend signal and one supporting metric row.
- Full: Standard content plus a short hourly preview and the most useful held metrics that fit without empty padding.

The label uses a hyphen in product copy, for example `Clear - Atlanta`. Long locations truncate with a title and accessible full name. The chevron is visible at every size and has an accessible expanded state.

### 6.2 Viewport-owned details

Weather details render in a portal owned by the viewport, not inside the Canvas item's centered intrinsic box.

A pure anchor function receives the trigger rectangle, panel size, viewport size, 8 px safe margin, and fixed utility exclusion area. It must:

1. Prefer opening below the trigger.
2. Align inward from the nearest horizontal edge.
3. Flip above only when the complete panel cannot fit below.
4. Clamp left, top, right, and bottom to the viewport safe area.
5. Set a finite max height and one internal vertical scrollport when content cannot fit.
6. Recompute after trigger movement, resize, content resize, and profile transition.

Opening Weather must not change its Canvas placement, Canvas height, or any sibling rectangle. Escape, outside click, and a second trigger activation close it and restore focus.

### 6.3 Bookmarks and Search

Compact Bookmarks uses one unambiguous mark per item:

- a named folder shows a deterministic one- or two-character monogram from its name;
- an unnamed folder shows the folder glyph;
- a bookmark URL without a favicon may show the generic globe;
- no item paints both a glyph and a monogram.

Standard and Full Bookmarks retain readable names wherever the size contract promises them. Search reserves the fixed utility-control safe zone at every profile, so its input, placeholder, text, and focus outline cannot touch Refresh, Settings, or Utility controls.

## 7. Settings workspace

### 7.1 Drawer shell

On physical viewports at least 900 CSS px wide:

- width is `min(calc(100vw - 2rem), 54rem)`;
- the panel is inset 1rem from the top, right, and bottom;
- navigation is 9rem wide;
- content is bounded to a readable measure instead of stretching to the panel edge;
- the closed state paints no pixels and has no hit-testable or focusable remainder.

Below 900 CSS px, Settings remains a full-viewport modal workspace with one document scrollport and no horizontal overflow.

### 7.2 Information architecture

Keep four primary sections: General, Widgets, Connectors, and Data.

General contains:

- profile and appearance controls;
- Text size;
- clock format and units;
- **Timer completion sound**, expressed as a positive on/off setting while continuing to store the inverse `muted` boolean;
- **Daily summary**, with the description `Uses your next calendar event, unfinished tasks, and rain forecast. Nothing is shown when there is no useful update.`

Widgets uses compact grouped controls:

- Core: Search, Bookmarks, Quick links, Focus timer, Tasks, Notes.
- Personal: Weather, Daily quote, Habits, Month calendar.
- Time and sky: World clocks, Countdown, Sun times, Moon phase.

Roomy Settings uses two columns of compact toggle rows. Narrow Settings uses one column. Editors such as Weather location, world clocks, countdowns, and habits appear in their own labelled disclosures below the toggle groups, not as a long unbroken continuation of the switch list.

Layout no longer shows `Layout density`. It shows Arrange, exact V1/V2 recovery when available, and concise profile guidance.

## 8. Connector workspace

### 8.1 Header

The sticky header uses the same Settings surface token as its scroll container. It must not paint a black rectangle inside the drawer.

The always-visible disclosure is concise:

`Connector details stay in this Chrome profile and are sent only to the services you choose.`

An adjacent **How connector data is handled** disclosure contains the complete existing local-plaintext, shared-profile, capability URL, disconnect, and data-clear guidance. No privacy warning is removed or weakened.

### 8.2 Connector card states

Each connector card has a compact summary row with identity, truthful configuration state, short purpose, and one primary action.

- Unconfigured authenticated connector: `Set up`. No `Show on canvas` switch appears until configuration is valid.
- Reconnect required: reconnect fields remain immediately visible, preserving the existing recovery contract.
- Configured connector: `Show on canvas` maps to the existing `enabled` field. `Edit` reveals the configuration body.
- Configured but hidden connector: configuration remains stored and editable while the Canvas representation is off.
- Local-input connectors such as RSS, Calendar, Crypto, and Status derive configured state from their meaningful fields. Their setup form is available without falsely claiming the connector is already on the Canvas.

Only the connector currently being set up, edited, or reconnected paints its form. Closing Edit returns focus to its invoker. Disconnect, permission ownership, secret clearing, snapshot identity, and retry behavior remain unchanged.

### 8.3 Grouping

With no search query:

- `On canvas` lists configured enabled connectors.
- `Available` groups every other connector by the existing categories.

Search remains registry-driven and returns all matching connectors. Cards remain in the Settings document scrollport and do not create nested page scroll regions.

## 9. Arrange workspace

### 9.1 Modality follows the physical viewport

The editor's modality depends on physical CSS viewport width, not the profile being previewed.

At 1,100 CSS px and wider:

- a compact top toolbar remains visible;
- the logical preview is framed on the left;
- a 320 to 340 px inspector stays on the right;
- Small, Desktop, Large, and Wide all keep the preview visible while the inspector is open.

Below 1,100 CSS px:

- the preview fills the available workspace;
- the inspector becomes a dismissible bottom sheet with a maximum height of 50dvh;
- the preview remains visible above or behind the sheet and can be restored immediately;
- the sheet never becomes a blank full-width desktop page.

### 9.2 Truthful preview frames

Arrange renders logical artboards:

- Small: 390 by 844;
- Desktop: 1,440 by 900;
- Large: 2,560 by 1,440;
- Wide: 3,440 by 1,440.

The Arrange artboard alone may scale uniformly to fit the editor workspace. Production Canvas content is never root-scaled. Pointer and keyboard movement continue to edit logical percentage coordinates, snapping, guides, safe margins, and exact explicit Save behavior.

The selected item remains visually obvious. Nudge controls form a compact directional group. Size, visibility, overlap, layer, and restore actions stay adjacent to their labels rather than spreading across the full viewport.

## 10. Obsolete presentation retirement

Remove only code proven unreachable from the accepted Canvas runtime:

- the `BoardItem` component and its presentation-only tests when no live import remains;
- `LauncherShelf` and its presentation-only tests when no live import remains;
- old Dock size calibration files when no current renderer or compatibility adapter consumes them;
- `.adaptive-stage`, semantic-zone, Signal Dock, and retired variant selectors after equivalent Canvas selectors cover every live renderer;
- stale preview-harness branches that accept Adaptive Stage as an alternative success path.

Preserve:

- Layout V2 types and pure adapter logic required for backward compatibility and exact recovery;
- migrations, backup validators, storage authority, recovery, and schema v12;
- registry identities and truthful Canvas size metadata;
- any pure legacy planner code still imported by the V2 adapter until a separately tested decoupling replaces that dependency.

Every deletion requires an import/reference search, focused regression coverage, TypeScript, and `git diff --check`. Line-count reduction alone is not acceptance evidence.

## 11. Common-display QA matrix

The production-readiness harness must exercise all of these CSS viewport sizes in real Chromium at device scale factor 1:

| Class | Viewports |
|---|---|
| Narrow and phone reflow | 320x568, 360x800, 375x812, 390x844, 412x915 |
| Tablet and compact landscape | 768x1024, 820x1180, 1024x600, 1024x768 |
| Laptop and legacy desktop | 1280x720, 1280x800, 1280x1024, 1366x768, 1440x900, 1536x864 |
| Desktop and high density | 1600x900, 1920x1080, 1920x1200, 2560x1440, 2560x1600 |
| Wide and ultrawide | 2560x1080, 3440x1440 |
| 4K | 3840x2160 |

The 1,536x864 entry represents the common CSS workspace of a scaled 4K display. Native Windows DPI transitions remain a manual ceiling and are not falsely claimed from CSS viewport emulation.

At every one of the 23 viewports, the harness must use representative non-personal real content and exercise five states:

1. Information-rich Canvas.
2. Settings Widgets.
3. Settings Connectors.
4. Weather moved to the legal top-right position and expanded through a real click.
5. Arrange with the Small preview selected and its inspector open.

For every state it records an original-resolution screenshot and asserts:

- no document-level horizontal overflow;
- no clipped required control, Canvas block, panel, or dialog;
- no unintended intersecting visible blocks;
- no missing image, console error, page error, or failed presentation request;
- correct Settings closed containment and correct open modality;
- Weather remains within the 8 px safe area and leaves sibling rectangles unchanged;
- correct side-inspector or bottom-sheet mode from physical width;
- measured type floors for the active viewport and Text size choice;
- pointer cursor only on interactive content;
- local scrollability wherever content exceeds a finite surface.

Each of the 115 screenshots is inspected individually at original resolution. Contact sheets may aid navigation but are not acceptance evidence.

Deeper real interactions run at the representative fenceposts 375x812, 1024x768, 1366x768, 1920x1080, 3440x1440, and 3840x2160. They cover Settings keyboard tabs and focus restoration, connector Setup/Edit/Cancel, Weather Escape and outside close, direct tool panels, long press, pointer capture, dragging, keyboard movement, guides, overlap/layer controls, profile switching, exact Cancel, and one explicit Arrange Save.

A separate connector composition matrix renders every shipped connector family at every Compact, Standard, and Full size that its registry promises. It uses actual renderer content for RSS, GitHub, GitLab, Jira, Vercel, Crypto, Calendar, Status, and Home Assistant, and inspects representative ready, loading, stale, empty, and error behavior without making live provider requests. Desktop, Large, and Wide captures must show that each larger size adds useful information instead of blank padding.

Weather anchor coverage includes the top-left, top-right, bottom-left, and bottom-right legal Canvas positions at representative narrow and roomy viewports. Each position uses a real disclosure click and proves the panel's chosen direction, safe margins, focus restoration, and unchanged sibling geometry.

## 12. Delivery sequence

The executable plan will use seven bounded packets after this design is approved:

1. **PR-P1 Runtime stability and viewport containment:** stable identity slots, toggle stability, Canvas viewport hook, fully hidden closed drawer, and viewport-owned Weather details.
2. **PR-P2 Information hierarchy and legibility:** role-based responsive type, Text size projection, local contrast system, meaningful Weather content, Timer completion sound, and Daily summary copy.
3. **PR-P3 Settings workspace:** bounded drawer, compact navigation and rows, grouped Widgets, editor disclosures, and concise Layout controls.
4. **PR-P4 Connector workspace:** surface convergence, compact card state model, explicit Setup/Edit, configured visibility semantics, and complete privacy disclosure.
5. **PR-P5 Arrange artboards and obsolete code retirement:** physical-viewport modality, framed logical previews, compact inspector, and proven-unreachable presentation cleanup.
6. **PR-P6 Common-display Chromium QA and owner visual gate:** all 23 viewports and five states, focused defect correction, individual original-resolution inspection, and a curated set of originals for owner review.
7. **PR-P7 Stabilization and release restaging:** after owner approval, run the full unit suite once, production and preview builds once, the canonical browser harness once with one permitted failing-family rerun, then rebuild and re-audit the local ZIP, Store screenshots, and dossier without changing Store state.

Each implementation packet uses focused TDD, one bounded acceptance review, at most one Critical/Important fix and rereview cycle, a bounded commit, a pushed checkpoint, and active/protected repository proof. Minor and cosmetic observations are ledgered without reopening a completed packet.

PR-P6 is a real owner visual gate. It must provide these original-resolution captures at minimum, in addition to the complete matrix evidence:

- 375x812 information-rich Small Canvas;
- 1024x768 Settings Widgets;
- 1366x768 Settings Connectors;
- 1920x1080 Weather expanded at the legal top-right edge;
- 1920x1080 Small Arrange artboard with side inspector;
- 2560x1440 information-rich Large Canvas;
- 3440x1440 information-rich Wide Canvas;
- 3840x2160 information-rich 4K Canvas with measured supporting type.

## 13. Frozen boundaries

The remediation must not change:

- connector request scope, identity, freshness, generation, or cache ownership;
- credential and capability URL storage, display, logging, or backup redaction;
- permission gesture order, ownership registry, rollback, cleanup, or retry;
- cross-context storage authority or atomic restore;
- Notes ownership, pending-save guard, and error recovery;
- Calendar event identity, ICS color cache neutrality, or complete Month contracts;
- V1/V2 exact layout recovery or explicit-save-only Canvas V3 persistence;
- Chrome Search API usage, manifest permissions, CSP, dependencies, telemetry, remote code, or backend posture;
- the protected original checkout;
- Chrome Web Store state.

No Store upload, field edit, save, submission, publication, distribution, or rollout is authorized by this specification or by the owner's signed-in session.

## 14. Acceptance criteria

The remediation is accepted only when:

1. Aurora's documented and rendered hierarchy is information-first, with photography supporting rather than dominating it.
2. The staged `864ffce` package and screenshots remain marked ineligible for upload until replaced by PR-P7 evidence.
3. Settings paints no closed sliver, uses the bounded roomy width, and contains no demonstrated dead-space layout.
4. Connector Settings has no unrelated black header slab and shows only one active setup/edit form at a time.
5. Weather opened from every legal edge remains within the viewport, prefers down at the top edge, restores focus, and moves no Canvas sibling.
6. Toggling any widget or connector moves no surviving Canvas item and writes no layout.
7. Small, Desktop, Large, and Wide remain independent real Canvas layouts with exact explicit Save and recovery behavior.
8. Selecting Small on a roomy display shows a framed Small Canvas plus a side inspector, not a full-width blank sheet.
9. Text size is understandable and visibly effective, and ordinary 4K supporting text meets the written floors.
10. Clock, Greeting, Focus, Daily summary, Quote, and attribution remain legible across bright, dark, and detailed backgrounds without passive opaque cards.
11. `Timer completion sound` and `Daily summary` truthfully explain their behavior; no user-facing `Mute sounds`, `Show briefing`, or `Layout density` remains.
12. Connector configuration, on-Canvas visibility, reconnect, edit, disconnect, and privacy states are distinct and accurate.
13. Named Bookmark folders have one correct monogram, unnamed folders have one folder glyph, and Search never collides with fixed utility controls.
14. Every shipped connector still renders truthful Compact, Standard, and Full content where the registry promises those sizes.
15. Only proven-unreachable presentation code is removed; compatibility, migrations, backup, security, and recovery remain green.
16. All 23 common viewports and all five required states have direct Chromium evidence and individual original-resolution inspection.
17. The owner approves the PR-P6 original captures before final stabilization and package restaging.
18. The final focused/full gates follow the written one-run and one-rerun policy with no repeated full-harness churn.
19. The active branch is clean and upstream-equal, the protected original remains clean and unchanged, and the Chrome Web Store remains untouched.

## 15. Release consequence

W6-P5 remains blocked. Its dependency changes from W6-P4 to successful PR-P7 release restaging plus a new contemporaneous, action-specific owner approval.

The current ignored `release/aurora-2.0.0.zip`, five Store images, hashes, and dossier are historical rejected-candidate evidence. They must not be uploaded. PR-P7 will replace their release-candidate status only after the information-first design is visually accepted and the stabilized gates pass.
