# Aurora Canvas Polish & Stack Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore photo-first intrinsic content, correct stack ordering and edge geometry, reduce dock depth, improve Weather, Focus, and compact Status behavior, and close the remaining Important attention-signal findings.

**Architecture:** Presentation-specific classes keep free content frameless while preserving authored stack faces. Small pure helpers own location labels and status tooltip copy. Stack reorder stays inside the inspector, stack paging controls overlay the exact member frame, and one dock geometry contract is mirrored in CSS and TypeScript.

**Tech Stack:** React 19, TypeScript 5.9, Chrome MV3 local storage, Vitest, Testing Library, Playwright, Vite, existing Aurora layout and connector authorities

**Spec:** `docs/superpowers/specs/2026-08-26-aurora-canvas-polish-and-stack-interactions-design.md`

## Global Constraints

- Work only in `D:/DEV/Chrome plugin-aurora-2`; do not modify `D:/DEV/Chrome plugin`.
- Preserve exact stack face dimensions at Compact `216x132`, Standard `320x200`, and Full `460x284`.
- Preserve named layouts, placements, tiers, layers, dock coordinates, connector scopes, credentials, permissions, and snapshots.
- Use `clamp(60px, 10vh, 78px)` for both CSS and TypeScript dock geometry.
- Use ASCII punctuation in touched product copy and documentation.
- Add no dependency, remote service, schema migration, account system, payment system, premium tier, or Chrome Web Store action.
- Use test-driven development for every production change.
- Run one bounded review cycle and fix every Critical or Important finding before the stabilized gate.
- Push only `feat/aurora-2-observatory`; do not merge or publish.

## File structure

- `src/newtab/components/SearchBar.tsx`: free and stack Search presentation classes.
- `src/newtab/widgets/links/LinkTile.tsx`: frameless free Quick Link appearance.
- `src/newtab/widgets/links/LinksWidget.tsx`: frameless free Add control and stable stack presentation.
- `src/newtab/widgets/weather/locationLabel.ts`: pure city, region, and country formatting.
- `src/newtab/widgets/weather/LocationSetup.tsx`: persist formatted manual selections and comma-separated suggestions.
- `src/settings/sections/Weather.tsx`: separate location text and Clear action.
- `src/newtab/components/FocusLine.tsx`: persistent prompt and completion celebration state.
- `src/newtab/widgets/status/StatusWidget.tsx`: compact body and explicit service tooltip content.
- `src/newtab/widgets/status/StatusTooltip.tsx`: hover and focus tooltip surface.
- `src/newtab/edit/StackInspector.tsx`: pointer reorder ownership.
- `src/newtab/canvas/StackCard.tsx`: paging controls within the member footprint.
- `src/newtab/edit/dockGeometry.ts`: `60`, `78`, and `0.10` fallback geometry constants.
- `src/newtab/index.css`: photo-first styles, confetti, tooltips, stack overlays, and dock depth.
- `src/newtab/components/AttentionContextPanel.tsx`: collision-free placement including Greeting.
- `src/newtab/components/useAttentionSignals.ts`: ICS permission admission.
- `scripts/qa-attention-signals.mjs`: collision and permission witnesses.
- `docs/superpowers/aurora-2/DECISIONS.md`: approved decision and superseded dock/stack control details.

---

### Task 1: Record the approved decision

**Files:**
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**
- Consumes: the approved spec.
- Produces: one dated decision referencing the spec and superseding only the old stack gutter and dock depth details.

- [ ] Add a decision stating that intrinsic Search and Quick Links are frameless, Focus remains prompt-led, compact Status is names and dots with context, stack controls overlay the exact footprint, the grip reorders, and dock depth is `clamp(60px, 10vh, 78px)`.
- [ ] Verify the decision does not authorize a merge, Store action, premium implementation, or image-catalog change.
- [ ] Commit the decision with the approved spec and plan.

### Task 2: Restore free Search and Quick Links

**Files:**
- Modify: `src/newtab/components/SearchBar.tsx`
- Modify: `src/newtab/components/SearchBar.test.tsx`
- Modify: `src/newtab/widgets/links/LinkTile.tsx`
- Modify: `src/newtab/widgets/links/LinkTile.test.tsx`
- Modify: `src/newtab/widgets/links/LinksWidget.tsx`
- Modify: `src/newtab/widgets/links/LinksWidget.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Produces: `data-search-presentation="free"` and `data-quick-link-presentation="free"` witness hooks.
- Preserves: existing stack `TierFrame` and `core-quick-link` contracts.

- [ ] Write tests asserting free Search lacks panel, rounded-card, blur, and shadow classes while stack Search retains its authored face.
- [ ] Run `npx vitest run src/newtab/components/SearchBar.test.tsx` and verify the new assertion fails.
- [ ] Render the free Search icon and transparent bottom-rule input, then rerun the test green.
- [ ] Write tests asserting free Quick Link anchors and the Add control lack filled tile, border-card, blur, and shadow classes.
- [ ] Run `npx vitest run src/newtab/widgets/links/LinkTile.test.tsx src/newtab/widgets/links/LinksWidget.test.tsx` and verify red.
- [ ] Apply the frameless icon, label, Add, hover, and focus treatment without changing stack classes, then rerun green.

### Task 3: Preserve Weather region labels and separate Clear

**Files:**
- Create: `src/newtab/widgets/weather/locationLabel.ts`
- Create: `src/newtab/widgets/weather/locationLabel.test.ts`
- Modify: `src/newtab/widgets/weather/LocationSetup.tsx`
- Modify: `src/newtab/widgets/weather/LocationSetup.test.tsx`
- Modify: `src/settings/sections/Weather.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`

**Interfaces:**
- Produces: `formatGeoMatchLabel(match: GeoMatch): string`.
- Produces: United States state and territory abbreviations for provider `admin1` names.

- [ ] Write formatter cases for Georgia to `Dallas, GA`, duplicate city and region names, non-US regions, and missing region values.
- [ ] Run `npx vitest run src/newtab/widgets/weather/locationLabel.test.ts` and verify the missing module failure.
- [ ] Implement the pure formatter with a complete United States state and territory abbreviation map and comma-separated fallback copy.
- [ ] Rerun the formatter tests green.
- [ ] Write component tests proving manual selection stores and displays `Dallas, GA`, suggestions contain commas and no em dash, and Settings exposes separate `Dallas, GA` text and `Clear Dallas, GA weather location` button.
- [ ] Run the LocationSetup and SettingsPanel tests and verify red.
- [ ] Use the formatter at selection and query update boundaries, split Settings label from Clear, then rerun green.

### Task 4: Keep Focus prompt visible and celebrate completion

**Files:**
- Modify: `src/newtab/components/FocusLine.tsx`
- Modify: `src/newtab/components/FocusLine.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Produces: `data-focus-celebration` for a short decorative burst.
- Preserves: focus persistence, daily rollover, edit focus restoration, and stack presentation.

- [ ] Write tests proving the prompt remains in committed and completed states, `Nice.` never renders, checking emits a `Focus completed` status, and unchecking does not celebrate.
- [ ] Use fake timers to assert celebration removal after 900ms and cleanup on unmount.
- [ ] Run `npx vitest run src/newtab/components/FocusLine.test.tsx` and verify red.
- [ ] Refactor the layout so the prompt is constant and the editor or checkbox row is its second line.
- [ ] Add a local transition-owned celebration generation, twelve decorative particles, timer cleanup, pointer transparency, and a reduced-motion CSS override.
- [ ] Rerun the Focus tests green.

### Task 5: Make compact Status quiet and explainable

**Files:**
- Create: `src/newtab/widgets/status/StatusTooltip.tsx`
- Create: `src/newtab/widgets/status/StatusTooltip.test.tsx`
- Modify: `src/newtab/widgets/status/StatusWidget.tsx`
- Modify: `src/newtab/widgets/status/StatusWidget.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Produces: `statusContext(service: ServiceStatus): string` and a tooltip associated with each compact service row.
- Preserves: indicator colors, configured order, summary accessibility, and Standard/Full incident detail.

- [ ] Write tests for Operational, Partial outage with provider detail, Major outage, and Unreachable copy.
- [ ] Write component tests proving compact has names and dots but no heading or incident line, and tooltip content opens on hover and focus.
- [ ] Run the Status tests and verify red.
- [ ] Implement the pure normalized copy and a non-modal tooltip with stable IDs and `aria-describedby`.
- [ ] Render the compact-specific body and replace the touched em dash incident separator with a colon.
- [ ] Rerun the Status tests green.

### Task 6: Make the stack grip reorder and restore equal edge reach

**Files:**
- Modify: `src/newtab/edit/StackInspector.tsx`
- Modify: `src/newtab/edit/StackInspector.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/canvas/StackCard.tsx`
- Modify: `src/newtab/canvas/StackCard.test.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Replaces: inspector `onMemberPointerDown` drag-out with pointer reorder callbacks.
- Preserves: `onReorder(id, direction)`, explicit Remove, stack paging, swipe, and exact member dimensions.

- [ ] Write inspector tests proving a pointer drag from one member row across another calls reorder and never starts a Canvas object drag.
- [ ] Write App regression coverage proving the grip cannot create a free widget placement while arrow reorder and Remove still work.
- [ ] Run StackInspector and App tests and verify red.
- [ ] Implement inspector-local pointer capture, row hit testing, one-step preview, and a single reorder commit. Remove the stack-member Canvas drag callback from App.
- [ ] Rerun inspector and App tests green.
- [ ] Write CSS contract tests proving `.stack-card` has no padding and arrows and dots are inset within the frame.
- [ ] Run StackCard and CanvasSurface tests and verify red.
- [ ] Move controls to `left: 6px`, `right: 6px`, and `bottom: 4px` overlays, keep 36px hit targets, and retain hover, focus, and propagation behavior.
- [ ] Rerun StackCard and CanvasSurface tests green.

### Task 7: Reduce dock depth consistently

**Files:**
- Modify: `src/newtab/edit/dockGeometry.ts`
- Modify: `src/newtab/edit/dockGeometry.test.ts`
- Modify: `src/newtab/canvas/CanvasSurface.test.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/index.css`
- Modify: `scripts/qa-dock-inset.mjs`

**Interfaces:**
- Produces: one `60`, `78`, `0.10` fallback geometry contract matching CSS `clamp(60px, 10vh, 78px)`.

- [ ] Update tests to expect 78px at 900px height and 60px at 445px height, plus the new CSS clamp for rendered bars and drop zones.
- [ ] Run dockGeometry, CanvasSurface, and App tests and verify red.
- [ ] Update TypeScript constants, CSS bands, drop zones, and scripted expected geometry.
- [ ] Rerun the focused dock tests green.

### Task 8: Close the two Important attention findings

**Files:**
- Modify: `src/newtab/components/AttentionContextPanel.tsx`
- Modify: `src/newtab/components/AttentionContextPanel.test.tsx`
- Modify: `src/newtab/components/useAttentionSignals.ts`
- Modify: `src/newtab/components/useAttentionSignals.test.tsx`
- Modify: `scripts/qa-attention-signals.mjs`
- Modify: `scripts/qa-attention-signals.test.mjs`

**Interfaces:**
- Consumes: current Greeting owner geometry and `hasAttentionConnectorPermission('ics', ics)`.
- Produces: collision-free panel placement and permission-current Calendar admission.

- [ ] Write a panel test where the preferred desktop and compact positions intersect Greeting and assert a collision-free alternative.
- [ ] Write a signal test that starts with a valid cached event, revokes the ICS host permission, and expects Calendar attention to disappear.
- [ ] Run the four focused suites and verify red.
- [ ] Include Greeting in all obstacle sets and gate ICS projection on the permission mirror without deleting its snapshot.
- [ ] Expand scripted desktop and compact obstacle assertions to include every visible owner.
- [ ] Rerun the focused suites green.

### Task 9: Browser witness, review, and stabilized gate

**Files:**
- Modify: `scripts/qa-ui-recovery.mjs` or create one focused browser witness if the existing script cannot express all approved interactions without unrelated fixtures.
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Create: `docs/superpowers/reports/AURORA-CANVAS-POLISH-AND-STACK-INTERACTIONS-QA.md`

**Interfaces:**
- Consumes: all prior task witness hooks.
- Produces: provenance-pinned screenshots, geometry JSON, interaction assertions, and final checkpoint status.

- [ ] Run all changed Vitest and Node contract suites together.
- [ ] Build production with `npm run build` and record the exact HEAD used by the browser witness.
- [ ] In real Chromium verify frameless free Search and Quick Links, `Dallas, GA`, persistent Focus prompt, completion celebration state, compact Status hover and focus context, grip reorder without ejection, equal 8px edge reach, 60px to 78px dock bands, attention collision avoidance, and ICS permission revocation.
- [ ] Capture screenshots at 1600x900 and 1408x445 and fail on console errors, page errors, clipping, viewport overflow, widget collisions, or stale build provenance.
- [ ] Perform one bounded read-only review. Fix and rereview only confirmed Critical or Important findings.
- [ ] Run the stabilized full unit suite, production build, production widget QA, attention QA, and focused polish witness once in production-first order.
- [ ] Update STATUS, ROADMAP, and the QA report with exact commands, counts, commit IDs, screenshot paths, and truthful manual limits.
- [ ] Commit all implementation and evidence files without staging `artifacts/` or the preserved takeover document.
- [ ] Push `feat/aurora-2-observatory` to `origin` and verify local HEAD equals the remote branch. Do not merge or publish.
