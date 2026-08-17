# Aurora V1 Canvas & Adaptive Safety Rails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan packet by packet. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rejected Calm Canvas presentation with Aurora's approved photo-first V1 Canvas, direct arrangement, real per-profile layouts, meaningful widget sizes, completed calendars, and an additive recoverable V3 layout format.

**Architecture:** Keep stable widget identities and all frozen storage, connector, credential, permission, Notes, backup, and recovery authorities. Add a tolerant in-memory V1/V2/V3 adapter in front of a normalized Canvas model, render that model through one measured Canvas surface, and edit one complete in-memory profile draft that writes only on explicit Save. Source-owned V1 defaults remain the deterministic derived layouts; saved profiles become independent custom layouts. The old semantic planner remains compatibility code only and has no user-facing presentation authority.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest, Testing Library, Chrome extension storage, CSS, and Playwright-backed real Chromium probes.

**Primary spec:** `docs/superpowers/specs/2026-08-16-aurora-v1-canvas-adaptive-safety-rails-design.md`

**Supporting contracts:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md`, `docs/superpowers/specs/2026-07-26-aurora-newtab-design.md`, `docs/superpowers/specs/2026-07-28-arrange-mode-design.md`, `docs/superpowers/specs/2026-07-26-aurora-v1.1-design.md`, `docs/superpowers/aurora-2/STATUS.md`, `docs/superpowers/aurora-2/ROADMAP.md`, and `docs/superpowers/aurora-2/DECISIONS.md` A2-D039.

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`. The approved start is `03bca3b920eba6eaf54f8266795a0e7124cee284`; if the live ledger advances, continue from the newer verified state and never reset history.
- Treat `D:\DEV\Chrome plugin` as read-only. It must remain clean and upstream-equal at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- Preserve the rejected Calm Canvas commits as history. Do not resume its Day, Now, Work Pulse, Signal Dock, Earlier, Later, Pinned, Automatic, or Dock presentation.
- Preserve all frozen security, privacy, credential, capability URL, connector identity, snapshot ownership, storage serialization, Notes ownership, backup, permission, photo, recovery, and Store boundaries.
- Do not add dependencies, permissions, telemetry, remote code, or Chrome Web Store actions. W6-P5 remains blocked pending explicit owner approval.
- Use test-driven development for every behavior change: write one focused failing behavior test, observe the expected failure, implement the minimum production change, observe green, and refactor only while green.
- Derive test expectations independently. Test real outcomes instead of mocks or source text. Keep test-only helpers outside production modules.
- Implement only the written acceptance criteria. Do not invent stronger acceptance criteria, broaden browser matrices, or reopen completed correctness work.
- Each packet gets focused development verification, one implementation review, and at most one Critical/Important fix plus focused rereview cycle. Ledger Minor or cosmetic findings without reopening the packet.
- A packet checkpoint consists of bounded implementation commits, focused green evidence, `git diff --check`, an updated durable ledger, a pushed branch, target/upstream equality, a clean active worktree, and proof that the protected original remains clean and unchanged.
- Do not run the full unit/build/browser gate during Packets 1 through 7. Packet 8 owns the one final full gate after visual approval and stabilization. Documentation-only changes do not repeat code gates.
- Keep automation evidence distinct from native Chrome permissions, real screen readers, true OS zoom and mixed-DPI movement, physical touch, live Home Assistant, and real external connector ceilings.

## Approved Visual Implementation Contract

- **Subject and job:** Aurora is a personal new-tab ritual whose photograph, time, focus, and chosen information remain immediately available without reading a dashboard.
- **Palette:** photo ink `#F7FAFC`, muted photo ink `#BAC6D2`, Aurora cyan `#7DDCFF`, active surface `rgb(8 12 18 / 94%)`, and quiet hairline `rgb(255 255 255 / 16%)`, all routed through the existing theme and contrast system.
- **Type:** retain bundled Space Grotesk for the clock and greeting, Inter for controls and body copy, and tabular numeric treatment for coordinates, time, and measurements.
- **Layout:** top Bookmarks; centered Clock, Greeting, World Clocks, Countdown, Search, Focus, and Links; meaningful personal widgets along the left; work connectors along the right; Timer upper left; Notes lower left; Tasks lower right; fixed Refresh and Settings controls.
- **Signature:** the full-bleed photograph remains the dominant material while the centered personal ritual stays stable. Passive content gets localized legibility support; opaque surfaces are reserved for active editors, panels, and popovers.
- **Editor:** a slim top toolbar and non-occluding right inspector reveal placement geometry without replacing the Canvas identity. Small uses one dismissible sheet instead of shrinking the preview behind an inspector.
- **Motion:** only arrangement lift, guides, panel entry, and state transitions move; every motion has a reduced-motion equivalent.

The visual contract deliberately preserves Aurora's own photo-first identity. It avoids introducing a new palette, decorative structure, or generic dashboard metaphor.

---

## Packet 1: V3 Layout Foundation

**Acceptance boundary:** Add schema v12, the V3 union, runtime normalization, exact recovery, and explicit-save persistence helpers with no presentation change and no eager layout rewrite.

**Files:**
- Create: `src/lib/layout/canvasTypes.ts`
- Create: `src/lib/layout/canvasTypes.test.ts`
- Create: `src/lib/layout/canvasAdapter.ts`
- Create: `src/lib/layout/canvasAdapter.test.ts`
- Modify: `src/lib/layout/types.ts`
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/migrations.test.ts`
- Modify: `src/lib/storage/index.test.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/lib/backupRestore.test.ts`
- Modify: `src/settings/sections/Layout.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`

**Interfaces:**
- `CanvasProfileKey = 'compact' | 'standard' | 'display' | 'ultrawide'`
- `CanvasMode = 'derived' | 'custom'`
- `CanvasSize = 'compact' | 'standard' | 'full'`
- `CanvasPlacement`, `BottomBarPlacement`, `CanvasProfile`, and `LayoutV3` match the approved normative shapes.
- `adaptStoredLayout` accepts V1, V2, or V3 and returns a normalized in-memory V3 view without writing.
- `saveCanvasProfile` receives the current stored union and a complete valid draft; the first Canvas save preserves the exact V1 or V2 value in `recovery`, later saves retain existing recovery, and invalid saves return a failure without a partial value.
- `restorePreviousLayout` returns the exact preserved V1 or V2 value while recovery exists.

- [x] Write RED type/validator tests for all four profiles, derived/custom modes, finite coordinates, known IDs, allowed Canvas and Bottom bar placement shapes, valid sizes/layers, per-block invalid-placement fallback, and unknown block removal.
- [x] Write RED adapter tests for V1 percentage positions, V2 semantic placements, V3 custom profiles, deterministic derived missing profiles, independent saved profiles, disabled/unknown identities, and input immutability.
- [x] Write RED save/recovery tests proving Save is the only V3 write, the exact prior V1/V2 object survives in recovery, later V3 saves retain it, a failed save returns no new stored value, and restore returns the exact prior layout.
- [x] Write RED migration/storage tests proving v11 to v12 changes version metadata only, preserves the layout value byte-for-byte, performs no boot rewrite, and gives a new install an empty derived V3 layout.
- [x] Write RED backup tests proving strict V1/V2/V3 validation before live write, finite coordinate and known identity enforcement, exact recovery round-trip, and unchanged secret/capability URL redaction.
- [x] Implement the union, pure validators/adapters, additive schema v12 migration, atomic authority-backed save/restore helpers, and a Settings `Restore previous layout` action visible only while recovery exists.
- [x] Run `npx vitest run src/lib/layout/canvasTypes.test.ts src/lib/layout/canvasAdapter.test.ts src/lib/storage/migrations.test.ts src/lib/storage/index.test.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts src/settings/SettingsPanel.test.tsx`.
- [x] Commit `feat(layout): add recoverable Canvas V3 foundation`.
- [x] Run one implementation review against Packet 1 only. Fix Critical/Important findings, run the affected focused tests, and perform one focused rereview. Ledger Minor/cosmetic findings.
- [x] Update the ledgers, run `git diff --check`, commit `docs: checkpoint Canvas P1`, push, and prove both repository states.

**Packet 1 evidence:** Implemented in `412a420`, with bounded data-protection fixes in `b074187` and `f71148d`. The final focused gate passed 9 files / 609 tests, TypeScript, and `git diff --check`. The single review/fix/rereview cycle closed destructive V3 downgrade, global V3 reset, and exact recovery defects. The rereview's additional corrupt-active-placement blocker was fixed under the exhausted cycle and verified locally without requesting another review. Repeated React test `act(...)` warnings from Settings layout availability remain ledgered as Minor test-harness noise.

## Packet 2: Canvas Renderer

**Acceptance boundary:** Render the approved V1 hierarchy from normalized Canvas profiles with safe geometry and materially different profile defaults. Do not change widget content contracts yet.

**Files:**
- Create: `src/lib/layout/canvasDefaults.ts`
- Create: `src/lib/layout/canvasDefaults.test.ts`
- Create: `src/lib/layout/canvasGeometry.ts`
- Create: `src/lib/layout/canvasGeometry.test.ts`
- Create: `src/newtab/canvas/CanvasSurface.tsx`
- Create: `src/newtab/canvas/CanvasSurface.test.tsx`
- Create: `src/newtab/canvas/CanvasItem.tsx`
- Create: `src/newtab/canvas/CanvasItem.test.tsx`
- Modify: `src/newtab/widgetRegistry.ts`
- Modify: `src/newtab/widgetRegistry.test.ts`
- Modify: `src/newtab/widgetRenderers.tsx`
- Modify: `src/newtab/components/BoardItem.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/useAdaptiveStageViewport.tsx`
- Modify: `src/newtab/useAdaptiveStageViewport.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- `canvasDefaults(profile, registry)` returns source-owned V1 anchors, meaningful default sizes, and stable layers for every enabled identity.
- `fitCanvasProfile(profile, bounds)` returns display-only clamped geometry and never mutates stored coordinates.
- `CanvasSurface` owns the measured safe canvas, normalized placement rendering, document-safe Small vertical flow, selection geometry hooks, and optional Bottom bar.
- Existing connector/render components receive the effective Canvas size, but Packet 2 does not redesign their inner content.

- [x] Write RED default tests proving top-center Bookmarks, centered Clock and Focus, V1 left/right edge meaning, Timer/Notes/Tasks launcher anchors, fixed utility controls outside the registry, all enabled identities present, and materially different Small/Desktop/Large/Wide dimensions.
- [x] Write RED geometry tests for 8px safe margins, finite percentage-to-pixel conversion, per-block clamping, tall Small canvases, display-only fitting, stable layering, and no document-level horizontal overflow.
- [x] Write RED component tests proving every enabled registry identity renders once, normalized V1/V2/V3 inputs render through the same surface, hidden identities do not render, Bottom bar remains optional/empty, and corrupt block geometry falls back without affecting siblings.
- [x] Write RED App/profile tests proving Small, Desktop, Large, and Wide select the correct normalized profile, custom profiles remain independent, derived profiles use source defaults, and `Use Desktop layout everywhere` previews fitted copies without writing.
- [x] Implement `CanvasSurface` and `CanvasItem`, replace the semantic zone DOM in `App`, retire user-facing semantic labels, and preserve real widget content, boundaries, Settings, Refresh, hydration, and fixed permissions behavior.
- [x] Add Canvas CSS using the existing V1 tokens and photo-native treatment. Keep production content untransformed; any Arrange preview scaling is isolated to the editor artboard.
- [x] Run `npx vitest run src/lib/layout/canvasDefaults.test.ts src/lib/layout/canvasGeometry.test.ts src/newtab/canvas/CanvasSurface.test.tsx src/newtab/canvas/CanvasItem.test.tsx src/newtab/widgetRegistry.test.ts src/newtab/App.test.tsx src/newtab/useAdaptiveStageViewport.test.tsx`.
- [x] Commit `feat(canvas): restore the V1 placement surface`.
- [x] Run one Packet 2 implementation review, one Critical/Important fix and focused rereview cycle if needed, update ledgers, run `git diff --check`, commit `docs: checkpoint Canvas P2`, push, and prove both repository states.

**Packet 2 evidence:** Implemented in `dffa11d` with the bounded review fix in `68c8cd6`. The final focused gate passed 8 files / 71 tests, TypeScript, and `git diff --check`. The single review/fix/rereview cycle connected preserved compact presentations to Canvas sizes, added the in-memory Desktop-everywhere fitted preview, and placed newly enabled identities at a nearest safe snapped position without moving saved custom blocks. The rereview returned Ready with no Critical, Important, or Minor finding open.

## Packet 3: Direct Arrange

**Acceptance boundary:** Replace semantic profile editing with one explicit-save Canvas draft that supports direct pointer and keyboard placement for every visible widget.

**Files:**
- Create: `src/newtab/arrange/canvasDraft.ts`
- Create: `src/newtab/arrange/canvasDraft.test.ts`
- Create: `src/newtab/arrange/canvasSnap.ts`
- Create: `src/newtab/arrange/canvasSnap.test.ts`
- Modify: `src/newtab/arrange/ArrangeController.tsx`
- Modify: `src/newtab/arrange/ArrangeController.test.tsx`
- Modify: `src/newtab/arrange/useLongPress.ts`
- Modify: `src/newtab/arrange/useLongPress.test.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.tsx`
- Modify: `src/newtab/canvas/CanvasItem.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- A session snapshots the exact effective profile and stored layout once. All edits remain in `CanvasDraft { profile, placements, history, selectedId }` until Save.
- `snapCanvasPosition` applies an 8px grid plus magnetic canvas-center and neighbor-center/edge guides within the written threshold.
- Pointer drag uses pointer capture. Arrow keys move 8px, Shift+Arrow moves 1px, and Escape cancels the active move before it cancels the session.
- Save validates the complete draft and performs one authority-backed V3 update. Cancel writes nothing and restores the snapshot. A failed Save leaves the draft/editor open.

- [x] Write RED pure-draft tests for select, move, resize to supported choices only, Bottom bar move, overlap detection, bring forward/send backward only while overlapping, undo, reset profile, copy profile, `Use Desktop layout everywhere`, normalized layers, Cancel identity, and immutability.
- [x] Write RED snap/geometry tests for 8px grid, magnetic canvas/neighbor guides, 8px safe margins, pointer offsets, keyboard deltas, collisions allowed with warnings, and guide cleanup after movement.
- [x] Write RED component tests for entry by Settings and long press, direct selection of every visible item, pointer capture, real-content inertness during editing, toolbar profile tabs labelled Small/Desktop/Large/Wide, Undo/Reset/Cancel/Save, and one live preview with zero writes.
- [x] Write RED inspector tests for position/coordinates, supported sizes only, applicable display/visibility/default controls, overlap warning and layer controls, a reduced Canvas width on larger profiles, and a dismissible Small sheet that replaces rather than covers the preview.
- [x] Write RED accessibility/lifecycle tests for selection and movement announcements, visible keyboard focus, Escape hierarchy, exact Cancel restore, invoking focus restore, failed Save alert, one atomic successful Save, fresh re-entry from storage, and reduced motion.
- [x] Implement the draft model and controller by recovering only the approved direct-manipulation behavior from the protected V1 reference. Do not copy its immediate storage writes.
- [x] Run `npx vitest run src/newtab/arrange/canvasDraft.test.ts src/newtab/arrange/canvasSnap.test.ts src/newtab/arrange/useLongPress.test.tsx src/newtab/arrange/ArrangeController.test.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/App.test.tsx`.
- [x] Commit `feat(arrange): add direct Canvas editing`.
- [x] Run one Packet 3 implementation review, one Critical/Important fix and focused rereview cycle if needed, update ledgers, run `git diff --check`, commit `docs: checkpoint Canvas P3`, push, and prove both repository states.

**Packet 3 evidence:** Implemented in `5aa01e5`, with the bounded review fixes in `96482b8` and the rereview's remaining restored-size clamp in `8996b15`. The final focused gate passed 6 files / 79 tests, TypeScript, and `git diff --check`. Direct pointer and keyboard editing now share measured Canvas-local geometry, all size paths preserve the 8px safe margin, profile-wide preview state survives tab changes, long-press focus returns to the real invoker, and terminal Save/Cancel announcements survive editor teardown. The single review/fix/rereview cycle found no Minor issue; its final residual Important branch was reproduced and closed under the exhausted cycle without requesting another rereview.

## Packet 4: V1 Interaction Restoration

**Acceptance boundary:** Restore the direct V1 launcher/panel and centered personal-ritual behavior needed to judge the first presentation gate.

**Files:**
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/components/FocusLine.tsx`
- Modify: `src/newtab/components/FocusLine.test.tsx`
- Modify: `src/newtab/components/Greeting.tsx`
- Modify: `src/newtab/components/Greeting.test.tsx`
- Modify: `src/newtab/components/AuroraBriefing.tsx`
- Modify: `src/newtab/components/AuroraBriefing.test.tsx`
- Modify: `src/lib/briefing.ts`
- Modify: `src/lib/briefing.test.ts`
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/settings/sections/Layout.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/widgets/bookmarks/BookmarksBar.tsx`
- Modify: `src/newtab/widgets/bookmarks/BookmarksBar.test.tsx`
- Modify: `src/newtab/widgets/timer/TimerWidget.tsx`
- Modify: `src/newtab/widgets/todo/TodoWidget.tsx`
- Modify: `src/newtab/widgets/notes/NotesWidget.tsx`
- Modify: `src/newtab/index.css`
- Create: `scripts/preview-v1-canvas.mjs`

**Interfaces:**
- `briefingEnabled?: boolean` reads false when absent and is written only after the user changes it.
- Focus keeps one centered footprint in empty, editing, committed, completed, and edit-again states.
- Bookmarks and Timer/Tasks/Notes remain movable Canvas identities; their popovers/panels anchor to the launcher when space permits and use one Small sheet when it does not.

- [x] Write RED Focus tests for one stable centered footprint across all states, edit-again behavior, visible focus, and no opaque prompt surface.
- [x] Write RED Briefing tests proving absent/off renders nothing, no signals renders nothing, `Nothing urgent.` is never returned or painted, enabling writes only after user action, and no boot or Settings-open migration write occurs.
- [x] Write RED launcher tests proving Bookmarks default top-center and movable, Timer/Tasks/Notes render visible movable launchers, each direct activation opens its existing function, panels remain in the viewport, Small uses one document-safe sheet, Escape/close restores launcher focus, and Timer/Notes/Tasks persistence ownership is unchanged.
- [x] Implement the centered hierarchy, restrained V1 surfaces, anchored panels, conditional Briefing, and stable Focus footprint. Preserve existing async data and permission behavior.
- [x] Add a focused Chromium script that uses deterministic real-content fixtures and exercises default, Arrange entry, pointer drag, keyboard movement, selection, inspector, panel open/close, overflow, and console/page errors.
- [x] Capture and inspect at original resolution: Desktop 1600x900 default; Desktop 1600x900 Arrange with Clock selected and inspector visible; Small 375x812 default; Small 375x812 Arrange.
- [x] Run `npx vitest run src/lib/briefing.test.ts src/newtab/components/AuroraBriefing.test.tsx src/newtab/components/Greeting.test.tsx src/newtab/components/FocusLine.test.tsx src/newtab/widgets/bookmarks/BookmarksBar.test.tsx src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx` and the focused `scripts/preview-v1-canvas.mjs` probe only.
- [x] Commit `feat(canvas): restore V1 interactions and focus`.
- [x] Run one Packet 4 implementation review, one Critical/Important fix and focused rereview cycle if needed, inspect all four captures again, update ledgers, run `git diff --check`, commit `docs: checkpoint Canvas P4 visual gate`, push, and prove both repository states.
- [x] Stop at the required early owner visual gate. Present the four separate original-resolution captures with interaction/error evidence and await explicit approval before Packet 5.

**Packet 4 evidence:** Implemented in `6403b26`, with the single review finding fixed in `045ed09`. The exact focused gate passed 7 files / 332 tests, TypeScript, and `git diff --check`. The focused Chromium probe regenerated and directly inspected the four required original-resolution captures after exercising bookmarks, direct Notes/Tasks/Timer panels, Timer continuation, transparent empty Focus, pointer drag, live guides, keyboard movement, selection, the side inspector, collision feedback, exact Cancel, and the Small document-safe sheet. Runtime errors, failed requests, and horizontal overflow were empty. The rereview returned Ready with no Critical or Important finding open. The exercised Clock overlap warning and existing Settings test `act(...)` hydration warnings remain Minor.

## Packet 5: Meaningful Widget Sizes

**Prerequisite:** The owner has approved the Packet 4 Canvas and Arrange direction.

**Acceptance boundary:** Make supported sizes truthfully distinct and restore user-selected connector content without changing connector configuration authority.

**Files:**
- Create: `src/newtab/widgetSizeContracts.ts`
- Create: `src/newtab/widgetSizeContracts.test.ts`
- Modify: `src/newtab/widgetRegistry.ts`
- Modify: `src/newtab/widgetRegistry.test.ts`
- Modify: `src/newtab/widgetRenderers.tsx`
- Modify: `src/newtab/arrange/ArrangeController.tsx`
- Modify: `src/newtab/arrange/ArrangeController.test.tsx`
- Modify: `src/newtab/widgets/github/GithubWidget.tsx`
- Modify: `src/newtab/widgets/github/GithubWidget.test.tsx`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.tsx`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.test.tsx`
- Modify: `src/newtab/widgets/jira/JiraWidget.tsx`
- Modify: `src/newtab/widgets/jira/JiraWidget.test.tsx`
- Modify: `src/newtab/widgets/vercel/VercelWidget.tsx`
- Modify: `src/newtab/widgets/vercel/VercelWidget.test.tsx`
- Modify: `src/newtab/widgets/status/StatusWidget.tsx`
- Modify: `src/newtab/widgets/status/StatusWidget.test.tsx`
- Modify: `src/newtab/widgets/rss/RssWidget.tsx`
- Modify: `src/newtab/widgets/rss/RssWidget.test.tsx`
- Modify: `src/newtab/widgets/crypto/CryptoWidget.tsx`
- Modify: `src/newtab/widgets/crypto/CryptoWidget.test.tsx`
- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx`
- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Each identity declares an ordered set of actually distinct supported sizes plus a content contract.
- Compact exposes identity plus one useful primary value/action; Standard adds selected rows or visual; Full exposes the complete selected composition that fits.
- Existing `Show on your board` choices remain authoritative. Canvas size neither resets nor overrides connector settings.

- [x] Write RED registry/inspector tests proving visually identical or unsupported choices are absent and size conflicts explain which selected content needs a larger size.
- [x] Write table-driven RED component tests for every connector contract, with complete real snapshot fixtures and explicit selected-view combinations.
- [x] Prove GitHub graph/count and selected rows, Jira real issue rows, GitLab, Vercel, Status, RSS, Crypto, and Home Assistant preserve their selected sections at every size claiming support.
- [x] Prove Large and Wide reveal useful detail or legibility and do not merely spread Compact content.
- [x] Implement explicit Canvas size inputs and content contracts. Remove CSS-only hiding that violates a supported size contract; retain safe reflow/truncation that does not erase selected sections.
- [x] Run the focused widget, registry, Arrange, and App tests for the changed files.
- [x] Commit `feat(widgets): make Canvas sizes meaningful`.
- [x] Run one Packet 5 implementation review, one Critical/Important fix and focused rereview cycle if needed, update ledgers, run `git diff --check`, commit `docs: checkpoint Canvas P5`, push, and prove both repository states.

**Packet 5 evidence:** Implemented in `10ff533`, with the bounded review fix in `484cd63` and configuration-aware residual closure in `121da8d`. The final focused gate passed 15 files / 317 tests, TypeScript, and `git diff --check`. Registry and Arrange now expose only materially distinct sizes and exact selected-section conflicts. GitHub, GitLab, Jira, Vercel, Status, RSS, Crypto, and Home Assistant receive Canvas size without changing their configuration authority; compact summaries remain truthful, Standard preserves prioritized selected rows or visuals, and Full bypasses legacy hides for complete selected compositions. The owner-approved compact Weather, folder-monogram, and Small Search-clearance refinements are included. The single review/fix/rereview cycle closed three Important findings; its two residual configuration/test branches were closed with focused evidence under the exhausted cycle and no second rereview. Canvas/viewport folder glyph duplication remains Minor, and exact Small clearance remains a Packet 7 browser witness.

## Packet 6: Calendar Completion

**Acceptance boundary:** Complete Month's two truthful sizes and add backward-compatible identity-owned ICS colors without changing feed, permission, snapshot, or redaction behavior.

**Files:**
- Modify: `src/newtab/widgets/monthcal/MonthCalWidget.tsx`
- Modify: `src/newtab/widgets/monthcal/MonthCalWidget.test.tsx`
- Modify: `src/lib/monthGrid.ts`
- Modify: `src/lib/monthGrid.test.ts`
- Create: `src/services/connectors/calendarColors.ts`
- Create: `src/services/connectors/calendarColors.test.ts`
- Modify: `src/services/connectors/types.ts`
- Modify: `src/services/connectors/ics.ts`
- Modify: `src/services/connectors/ics.test.ts`
- Modify: `src/settings/sections/Connectors.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.test.tsx`
- Modify: `src/newtab/widgetRegistry.ts`
- Modify: `src/newtab/widgetRegistry.test.ts`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Month supports only Compact and Standard. Compact returns the complete Sunday-to-Saturday current week; Standard returns the complete current month grid.
- `IcsCalendar.color` is optional and reads as `auto`. Palette values are a closed contrast-safe union.
- Auto uses the existing deterministic position-based palette. A chosen color is stored on the calendar object so it follows calendar identity through reorder.

- [ ] Write RED Month tests for exactly seven Compact days including today, complete Standard month rows, named/reachable Previous/Next/Today controls, and no Full or four-day path.
- [ ] Write RED color tests for absent/Auto compatibility, the unchanged deterministic position palette, closed palette validation, contrast-safe token mapping, reorder identity ownership, and color plus name attribution.
- [ ] Write RED Settings/widget tests proving one accessible color control per feed, row/event color agreement, selected color persistence on the feed object, and unchanged normalized URLs, permissions, snapshots, per-feed errors, Today/Upcoming/One per calendar views, and redaction.
- [ ] Implement the Month render contracts, palette helper, optional type, Settings control, and event-dot use without eager writes.
- [ ] Run `npx vitest run src/lib/monthGrid.test.ts src/newtab/widgets/monthcal/MonthCalWidget.test.tsx src/services/connectors/calendarColors.test.ts src/services/connectors/ics.test.ts src/newtab/widgets/calendar/CalendarWidget.test.tsx src/newtab/widgetRegistry.test.ts src/settings/SettingsPanel.test.tsx`.
- [ ] Commit `feat(calendar): complete Month sizes and ICS colors`.
- [ ] Run one Packet 6 implementation review, one Critical/Important fix and focused rereview cycle if needed, update ledgers, run `git diff --check`, commit `docs: checkpoint Canvas P6`, push, and prove both repository states.

## Packet 7: Integrated Visual QA

**Acceptance boundary:** Inspect representative real-content profiles and interaction states in real Chromium, close only explicit Critical/Important failures, and stop at the connector/calendar owner gate.

**Files:**
- Modify: `scripts/preview-v1-canvas.mjs`
- Create: `docs/superpowers/reports/V1-CANVAS-QA.md`
- Modify: packet-local production/tests only if a real browser failure proves an explicit criterion is broken

- [ ] Extend the focused Canvas probe with deterministic real Bookmarks plus rich GitHub/Jira fixtures, Calendar color witnesses, Timer/Tasks/Notes panels, selected and overlapping blocks, drag with guides, keyboard movement, Undo/Cancel/Save, profile copy, inspector sizing, and Small sheet behavior.
- [ ] Exercise visible-state changes, pointer capture, long press, focus restoration, menus/popovers/panels, scrollability, hit coverage, cursor state, clipping, overflow, and console/page errors. Do not add an exhaustive cross-product.
- [ ] Capture and inspect separately at original resolution: Desktop 1600x900 with Bookmarks plus rich GitHub/Jira; Large 2560x1440 dense; Wide 3440x1440 dense.
- [ ] Verify all 18 acceptance criteria against direct DOM, storage, interaction, and visual evidence. Keep unsupported native/manual ceilings explicit.
- [ ] Run one integrated implementation review. Fix only Critical/Important findings with a failing regression test, rerun only the affected focused family, and perform one focused rereview. Ledger Minor/cosmetic findings.
- [ ] Write the QA report with capture paths, original dimensions, interaction witnesses, error state, review findings, and manual ceilings.
- [ ] Commit `test(canvas): verify integrated V1 Canvas`.
- [ ] Update ledgers, run `git diff --check`, commit `docs: checkpoint Canvas P7 visual gate`, push, and prove both repository states.
- [ ] Stop at the connector/calendar owner visual gate. Present the three separate original-resolution captures and await explicit approval before Packet 8.

## Packet 8: Final Gates

**Prerequisite:** The owner has accepted the stabilized Canvas, connector, and calendar direction.

**Acceptance boundary:** Run the complete release-quality evidence exactly once, fix only a demonstrated failing family, finalize durable records, and stop before Store work.

**Files:**
- Modify: only files required by an actual failing family
- Modify: `docs/superpowers/reports/V1-CANVAS-QA.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

- [ ] Confirm the active worktree is clean and upstream-equal at the Packet 7 checkpoint and the protected original is clean, unchanged, and upstream-equal.
- [ ] Run the full unit suite once with `npm test`.
- [ ] Run `npm run build` once and `npm run build:preview` once.
- [ ] Run the production bridge scan required by the current Aurora ledger.
- [ ] Run the canonical browser harness once. If it fails, diagnose the actual failing family, add a focused failing regression test, fix only that family, rerun its focused evidence, then rerun the canonical harness once.
- [ ] Inspect the final required captures at original resolution and confirm `errors: []`. Do not substitute counts or a contact sheet for direct inspection.
- [ ] Perform the final acceptance review against the approved design and frozen boundaries. No new criteria are introduced at this gate.
- [ ] Mark all eight Canvas packets Verified, append the final decision freezing the V3 Canvas/save/recovery and presentation authority, record Minor/manual follow-ups, and leave the next release packet explicit.
- [ ] Run `git diff --check`, inspect the final diff/status, commit `docs: checkpoint V1 Canvas recovery`, push, and prove target/upstream equality, clean target, and the unchanged protected original.
- [ ] Do not upload, submit, publish, or alter Chrome Web Store state. W6-P5 still requires explicit owner approval.

## Definition of Done

The V1 Canvas recovery is complete when all 18 design acceptance criteria are met; all visible widgets use the photo-first Canvas and direct Arrange; profile layouts are real and independently saved; Focus, Briefing, launchers, connectors, Month, and ICS colors meet their written contracts; V1/V2 data remains exactly recoverable without boot rewrites; each packet has its bounded review and push proof; both owner visual gates are approved; the one final gate is green; the active branch is clean and upstream-equal; the protected original is unchanged; and no Chrome Web Store action has occurred.
