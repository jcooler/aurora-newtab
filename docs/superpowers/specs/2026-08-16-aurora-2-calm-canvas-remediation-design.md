# Aurora 2 Calm Canvas Remediation Design

**Date:** 2026-08-16

**Status:** Owner approved the V1-first direction in chat; UI-completeness verification revision awaiting owner review.

## 1. Problem

Aurora 2's current Adaptive Stage is functionally robust but visually unacceptable. It stretches Day and Work Pulse into full-height side slabs, distributes sparse content through equal-height rows, positions the protected Clock through first-free packing instead of true canvas centering, and leaves a nearly empty full-width Dock across the bottom. Dense configurations add more isolated content to those slabs without creating a coherent reading order.

This violates the existing Observatory design requirements that Aurora retain a calm centered Now anchor, use coherent content regions, remain photography-forward, and reveal useful detail rather than empty separation on large canvases. The problem is architectural and blocks release. Store packaging and asset work remain stopped until this remediation is visually accepted.

## 2. Approved direction

Use Aurora V1's calm centered composition as the visual baseline while retaining Aurora 2's functionality and safety work.

- One centered Now anchor is the page's visual thesis.
- Day and Work Pulse are content-sized edge clusters, not full-height rails.
- Launchers are one compact, readable shelf near the Now anchor.
- Routine tools remain in one quiet bottom utility surface.
- Overflow and detailed work use the existing Signal Dock, Utility Tray, Settings workspace, dialogs, and popovers.
- The photograph remains visible and important.

The memorable element is the centered live Now stack floating over the photograph. Everything else supports it and yields visual priority to it.

## 3. Goals

1. Restore a true viewport-centered Clock and a single coherent Now hierarchy.
2. Replace stretched Day and Work Pulse slabs with content-sized clusters whose surfaces follow their content.
3. Keep healthy and low-priority connector information quiet while preserving every enabled connector exactly once.
4. Preserve readable launcher labels instead of reducing them to ambiguous truncated fragments.
5. Keep the bottom utility and overflow surfaces only as large as their current content requires.
6. Preserve core accessibility, responsive behavior, data integrity, security, privacy, and local-first operation.
7. Produce a dense 2560x1440 composition that looks intentionally designed, not merely collision-free.

## 4. Non-goals and frozen contracts

This remediation does not change:

- storage schema v11 or any migration;
- `LayoutV2` field names, profile keys, placement values, or legacy provenance;
- every `WIDGET_REGISTRY` entry and its identity, availability, eligible zones, defaults, variants, footprints, order, and priority;
- profile thresholds, density tokens, capacity tables, and planner output semantics;
- credential, capability URL, backup-redaction, permission, or network behavior;
- connector refresh and snapshot ownership;
- Weather, Home Assistant, Notes, restore, or timer persistence semantics;
- Chrome Web Store state;
- the protected Aurora V1 checkout.

The current planner and registry remain byte-for-byte authorities for active entries, zone, order, variant, priority, spans, and Dock disposition. Presentation stops treating the planner's collision rect as a mandate to preserve empty visual grid tracks. Stored user intent remains meaningful:

- `zone` selects Day, Now, Work Pulse, or Dock;
- `order` determines flow order inside that region;
- `colSpan` controls relative width inside the region;
- `rowSpan` controls the content allocation's minimum depth without creating empty rows before it;
- `variant` controls Compact, Standard, or Expanded content;
- `priority` and `locked` retain their existing planner/editor semantics.

## 5. Composition

### 5.1 Now

Now is centered against the viewport, not merely centered within the middle grid column.

The default reading order is:

1. Clock
2. optional long date
3. Greeting and Briefing
4. Search
5. Focus
6. launcher shelf

Clock occupies the full Now inline measure and its visual center must match the viewport horizontal center. Greeting and Briefing sit immediately below it. Search and Focus form one restrained control band. Quick Links and Bookmarks share one compact shelf with readable labels and a bounded number of visible entries; additional items remain reachable through their existing controls.

Now has no framed region. A localized radial scrim may protect text over the photograph, but it cannot read as a card or column.

### 5.2 Day

Day sits at the upper-left edge on Standard and larger profiles. Its background and border wrap the actual content envelope with one consistent inset. It does not stretch to the viewport bottom.

Weather is the leading Day signal when enabled. Calendar, next-event, month, sun, moon, countdown, and quote follow in planner order using a compact auto-flow grid. Empty grid positions have zero visual height. Sparse Day may be a single Weather card or local-day context; dense Day remains a bounded cluster. Items that do not fit the profile continue through the planner's existing Dock disposition.

### 5.3 Work Pulse

Work Pulse sits at the upper-right edge on Standard and larger profiles. Its shared surface wraps the current connector summaries and does not stretch below the content.

Failed, stale, pending, or actionable information leads. Healthy states remain quiet. Multiple connectors read as one ordered instrument with internal hairlines, not independent floating cards. Expanded detail remains available when the active variant and capacity support it; overflow remains represented through Signal Dock.

### 5.4 Dock and utility tools

The bottom surface shrink-wraps its current allocations until horizontal overflow is genuinely required. It must not span the viewport as an empty translucent bar.

Routine Tasks, Notes, Timer, refresh, Settings, and Utility Tray affordances remain reachable and retain their current target, focus, modality, save-guard, and restoration contracts. Connector entries placed in Signal Dock keep their condensed disclosure behavior and horizontal keyboard/touch reachability.

### 5.5 Surfaces and type

- Day and Work Pulse use one content-sized shared glance surface each.
- Now remains unframed and photo-forward.
- Launcher and bottom utility surfaces are compact and content-sized.
- Opaque near-black remains reserved for active work surfaces, popovers, dialogs, and editors.
- Ordinary glance text remains at least 14 CSS px; metadata remains at least 12 CSS px.
- Routine controls remain at least 36 CSS px, or 44 CSS px under Spacious density.
- Cyan indicates interaction or attention, not every boundary.
- No new decorative texture, badge system, or animation is introduced.

## 6. Responsive profiles

### Compact

Use one centered Now stack first. Day and Work Pulse follow as compact content-sized regions in document order. Signal Dock remains horizontally reachable. The existing Utility Tray remains the compact modal detail owner. No root scaling or page-level horizontal scrolling is allowed.

### Standard

Use a centered Now stack with content-sized Day and Work Pulse clusters at the upper edges. Clusters may occupy two internal columns when content justifies them, but their outer surfaces remain content-sized.

### Display

Increase useful detail and breathing room inside the same composition. Do not increase empty tracks or stretch side surfaces. Clock remains truly centered. Day and Work Pulse gain wider content measures before they gain height.

### Ultrawide

Retain the same centered thesis. Edge clusters stay within comfortable reading widths rather than moving farther toward the physical edges indefinitely. The canvas may reveal more photograph between regions, but not by scattering related items.

## 7. Implementation architecture

1. Add a presentation mode to `BoardItem` for finite content-flow regions. The planner still publishes exact allocations, but normal region flow uses spans without explicit `gridRowStart` or `gridColumnStart`. Arrange/editor diagnostics may continue to consume planner rects.
2. Replace the outer stretched three-zone grid with an overlay composition: centered Now, upper-left Day, upper-right Work Pulse, and bottom content-sized Dock.
3. Make Day and Work Pulse internal grids auto-flow by allocation order with content-sized rows. No empty planner row may create painted height.
4. Give Clock a true centered presentation invariant without changing its registry identity, protected status, storage shape, or migration behavior.
5. Keep LauncherShelf, SignalDockEntry, Utility Tray, and Settings as existing behavior owners; change only their placement and surface sizing needed by this composition.
6. Preserve the exact active-entry and single-ownership pipeline from registry through planner to renderer.

## 8. Acceptance criteria

### Visual composition

- At 1600x900 sparse Standard, Clock is horizontally centered in the viewport and Now is the dominant visual anchor.
- At 2012x1397 with a representative user-like configuration, Day and Work Pulse surfaces end within one shared inset after their last painted child. No full-height side slab or full-width empty bottom slab is present.
- At 2560x1440 dense Display, related Day signals read as one cluster, connector signals read as one Work Pulse instrument, launcher labels are readable, and the photograph remains materially visible.
- At 3440x1440 Ultrawide, edge clusters retain bounded readable widths and Now remains centered.
- Compact 800x600 and 375x812 retain a coherent reading order with owned scrolling only where already authorized.
- Clock's visual center matches the viewport horizontal center within 2 CSS px at every representative Standard, Display, and Ultrawide witness.
- The painted Day and Work Pulse envelopes end within the shared inset after their final visible child. The painted Dock envelope follows its allocated content unless real overflow is present.
- No witness has document-level horizontal scrolling, clipped actionable content, unintended overlap, unreadable launcher labels, or an empty painted slab.

### Functional and safety preservation

- Every enabled widget or connector is represented exactly once on the canvas or in Dock.
- Stored layout profiles, variants, priorities, spans, locks, and legacy provenance round-trip unchanged.
- Arrange Save, Cancel, Undo, reset-one, and copy-profile behavior remains intact.
- No connector request, permission, secret handling, backup content, storage key, migration, or external endpoint changes.
- Existing Notes guards, Home Assistant pending/action behavior, focus restoration, reduced motion, and target floors remain intact.
- No console/page error, clipping, unintended overlap, or document-level horizontal overflow appears in the focused browser replay.

### UI completeness inventory

The implementation is not visually complete until a browser-evidence inventory accounts for every shipped registry surface and every distinct work surface. The inventory is generated from the frozen `WIDGET_REGISTRY`, connector registry, Settings tabs, Utility Tray tool union, and dialog/popover owners. Each row records its fixture, viewport, action path, expected result, screenshot path, geometry result, keyboard/touch result where applicable, and console/page/network result.

The inventory must cover:

- all 26 registry entries: Weather, Calendar, Month, Sun times, Moon phase, Quote, Clock, Greeting, World clocks, Countdown, Search, Focus, Links, Habits, Bookmarks, Service status, GitHub, GitLab, Jira, Deploys, Home Assistant, Headlines, Crypto, Timer, Tasks, and Notes;
- all four Settings tabs: General, Widgets, Connectors, and Data, including the narrow Drawer presentation;
- all five Utility Tray tools: Tasks, Notes, Timer, Home Assistant, and Refresh;
- Arrange entry, profile selection, placement controls, live preview, Undo, Save, Cancel, reset-one, and copy-profile;
- Quick Link editing, Bookmark folder disclosure, Palette, Calendar source controls, Weather location search, Home Assistant entity picker, reset confirmation, Tasks detail, and Notes detail;
- representative initial, empty, loading, healthy, attention, stale, error, retry, dirty, pending, running, expanded, condensed, and overflow states where those states already exist for a surface.

Every inventory row must have direct evidence or a documented not-applicable reason grounded in the existing product contract. A passing shell capture cannot substitute for an unexercised surface. Every connector must appear at least once, but the same connector does not need to be multiplied across every viewport and state when the shared behavior owner is already proven.

## 9. Verification and review

Development uses focused tests and small real-Chromium probes while the composition is changing. After the implementation stabilizes, one comprehensive UI-completeness replay produces the evidence inventory and final visual set.

### 9.1 Full-page composition witnesses

The final set covers profile interiors, threshold boundaries, sparse and dense content, short viewports, touch, and the owner's reported geometry:

1. 320x180 Compact extreme reflow;
2. 375x812 Compact touch;
3. 600x800 Compact boundary;
4. 800x600 Compact sparse;
5. 800x600 Compact dense;
6. 900x700 Standard boundary;
7. 1280x800 Standard typical;
8. 1600x900 Standard sparse;
9. 1600x900 Standard dense;
10. 1920x1080 Standard typical;
11. 2012x1397 owner-like dense;
12. 2200x1100 Display boundary;
13. 2560x1440 Display sparse;
14. 2560x1440 Display dense;
15. 3840x2160 Display 4K dense;
16. 1600x700 Ultrawide boundary;
17. 3440x1440 Ultrawide dense.

These are not the whole acceptance gate. Additional close-up captures document open work surfaces and interaction states from the inventory. Related surfaces may share one screenshot when each remains legible and individually asserted.

### 9.2 Real interaction audit

The replay uses real clicks or taps plus Tab, Shift+Tab, Enter, Space, Escape, scrolling, resizing, disclosure, and Arrange interactions as applicable. It checks:

- visibility, hit target, focus movement, focus restoration, keyboard reachability, and owned scrolling before and after each action;
- Clock centering, content-envelope sizing, no overlap, no clipping, no paint escape, no hidden actionable content, and no document-level horizontal overflow;
- launcher add/edit/remove, bookmark folder drill/back, search and Focus entry, and Palette opening/dismissal;
- Signal Dock disclosure, horizontal reveal, Escape closure, and focus restoration;
- Tasks editing, Notes dirty/save/error/retry guard, Timer run/close/reopen, Home Assistant pending/error/action isolation, and Refresh feedback;
- Settings tab navigation, narrow reflow, connector search/configuration presentation, Data confirmation/error presentation, and Arrange edit/cancel/save paths;
- missing or failed images, unexpected external requests, failed network requests, uncaught page errors, console errors, and teardown restoration.

Every final screenshot is inspected at original resolution, not only through automated geometry assertions. A contact sheet and indexed inventory are delivered for owner review. Visual acceptance requires the owner to approve the representative board after the implementation's automated and agent-inspected results are green.

### 9.3 Bounded final gates

The implementation receives one review and, if a Critical or Important finding exists, one fix/rereview cycle. After the composition is visually approved and stable, run the full unit suite, production/preview builds, and full browser harness once. If the final harness exposes an actual failing family, fix that family and rerun once.

Critical or Important UI findings block acceptance when they demonstrate a security/privacy risk, stored-data loss, broken core functionality, core accessibility failure, or failure of an explicit criterion above. Minor evidence naming, cosmetic edge cases, and speculative cross-product gaps are recorded in the ledger without reopening the remediation.

Store listing, package, screenshots, promo assets, upload, submission, and rollout remain blocked. W6-P3 resumes only after this remediation is accepted; W6-P5 still requires contemporaneous explicit Store approval.
