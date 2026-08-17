# Aurora Information-First Production Readiness Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan packet by packet. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the withdrawn Aurora 2.0.0 candidate into a production-ready information-first new-tab workspace by fixing demonstrated geometry defects, making useful information legible at every common display, converging Settings and Connectors, making Arrange truthful, and proving the result in real Chromium before restaging a release candidate.

**Architecture:** Preserve Canvas V3, explicit-save-only layout persistence, exact V1/V2 recovery, connector and credential authorities, and every frozen data boundary. Replace count-dependent derived placement with stable identity-owned source slots; separate physical viewport ownership from logical Canvas profiles; render transient Weather details in viewport-owned overlay geometry; project the compatible stored density field into text scale only; and reshape Settings, Connectors, and Arrange through presentation adapters around existing storage and service contracts. The final Chromium harness seeds non-personal renderer data and observes actual DOM geometry without live provider requests.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest, Testing Library, Chrome extension storage, CSS, and Playwright-backed real Chromium probes.

**Primary spec:** `docs/superpowers/specs/2026-08-17-aurora-information-first-production-readiness-remediation-design.md`

**Supporting contracts:** `docs/superpowers/specs/2026-08-16-aurora-v1-canvas-adaptive-safety-rails-design.md`, `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md`, `docs/superpowers/specs/2026-07-26-aurora-newtab-design.md`, `docs/superpowers/specs/2026-07-28-arrange-mode-design.md`, `docs/superpowers/aurora-2/STATUS.md`, `docs/superpowers/aurora-2/ROADMAP.md`, and `docs/superpowers/aurora-2/DECISIONS.md` A2-D052 and A2-D053.

## Global constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`. Continue from the verified live head and never reset or rewrite the accepted history.
- Treat `D:\DEV\Chrome plugin` as read-only. It must remain clean and upstream-equal at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- The staged `release/aurora-2.0.0.zip`, Store screenshots, hash, and dossier are withdrawn historical evidence. Do not upload them.
- Do not open, type in, save, upload to, submit, publish, distribute, or otherwise mutate the Chrome Web Store. W6-P5 requires a new action-specific approval after PR-P7.
- Preserve schema v12, Layout V3, exact V1/V2 recovery, explicit-save-only writes, migrations, backups, cross-context storage authority, Notes ownership, connector request identity, cache ownership, credentials, capability URLs, permission ownership, Calendar identity and color neutrality, Chrome Search, manifest permissions, CSP, and dependency posture.
- Do not add dependencies, remote code, telemetry, backend services, or permissions.
- Use strict TDD for every behavior change: add one focused behavior test, run it and observe the expected failure, make the smallest production change, rerun to green, and refactor only while green.
- Test user-visible behavior and pure contracts, not source text or mock existence. Hand-derive expected geometry and state fixtures.
- Implement only the written acceptance criteria. Minor and cosmetic findings are ledgered and do not reopen a verified packet.
- Each implementation packet receives one bounded implementation review and at most one Critical/Important fix plus focused rereview cycle. No additional review loop is authorized.
- Each packet checkpoint includes focused green evidence, TypeScript where production TypeScript changed, `git diff --check`, ledger updates, bounded commits, a pushed branch, clean target/upstream equality, and protected-original proof.
- Packets PR-P1 through PR-P5 run focused tests and focused browser probes only. PR-P6 owns the complete common-display Chromium gate. PR-P7 owns the one stabilized full suite/build/canonical-harness gate.
- Native Windows mixed-DPI transitions, real screen-reader speech, physical touch, live provider accounts, native permission prompts, sleep/wake, and unload timing remain named manual ceilings.

## Stable shared interfaces

These interfaces are the planned seams. Existing compatible exported names may be retained when changing them would create unrelated churn.

```ts
export type CanvasProfileKey = 'compact' | 'standard' | 'display' | 'ultrawide'

export interface CanvasViewport {
  width: number
  height: number
  profile: CanvasProfileKey
}

export function selectCanvasProfile(viewport: {
  width: number
  height: number
}): CanvasProfileKey

export type TextScale = 'standard' | 'large'

export function projectTextScale(
  stored: 'compact' | 'balanced' | 'spacious' | 'auto',
  viewport: Pick<CanvasViewport, 'width' | 'height' | 'profile'>,
): TextScale

export interface WeatherPanelAnchorInput {
  trigger: DOMRectReadOnly
  panel: { width: number; height: number }
  viewport: { width: number; height: number }
  safeMargin: number
  utilityExclusion?: DOMRectReadOnly
}

export interface WeatherPanelAnchor {
  left: number
  top: number
  maxHeight: number
  vertical: 'below' | 'above'
  horizontal: 'inward-left' | 'inward-right'
}

export type ConnectorCardMode = 'summary' | 'setup' | 'edit' | 'reconnect'

export interface ArrangeViewportMode {
  inspector: 'side' | 'sheet'
  physicalWidth: number
}
```

---

## Packet PR-P1: Runtime stability & viewport containment

**Acceptance boundary:** A Settings toggle changes only the selected identity; the closed Settings drawer paints and hits nothing; Weather opens inside the physical viewport without resizing or moving its Canvas item or siblings; and the runtime owns only Canvas viewport state. This packet does not redesign information hierarchy or Settings content.

**Files:**

- Modify: `src/lib/layout/canvasDefaults.ts`
- Modify: `src/lib/layout/canvasDefaults.test.ts`
- Create: `src/newtab/useCanvasViewport.ts`
- Create: `src/newtab/useCanvasViewport.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.test.tsx`
- Create: `src/newtab/widgets/weather/weatherPanelAnchor.ts`
- Create: `src/newtab/widgets/weather/weatherPanelAnchor.test.ts`
- Modify: `src/newtab/widgets/weather/WeatherWidget.tsx`
- Modify: `src/newtab/widgets/weather/WeatherWidget.test.tsx`
- Modify: `src/settings/Drawer.tsx`
- Modify: `src/settings/Drawer.test.tsx`
- Modify: `src/newtab/index.css`
- Create: `scripts/preview-information-first-p1.mjs`

**Implementation contracts:**

- `canvasDefaults` indexes stable complete per-profile identity catalogs. It never derives an existing identity's x, y, size, or layer from the active-entry count.
- `selectCanvasProfile` maps the physical CSS viewport to the compatible four Canvas profile keys without importing Adaptive Stage presentation state.
- `useCanvasViewport` publishes viewport width, height, and profile only, coalesces resize through one animation frame, and removes its listener/frame on cleanup.
- `CanvasSurface` may change document height when the selected Small layout intrinsically needs it, but adding or removing one identity cannot change surviving rectangles.
- Weather expanded content is portaled outside the Canvas item. Its anchor prefers below, aligns inward, flips only when the full panel cannot fit below, clamps to an 8px safe margin, and exposes one finite internal scrollport.
- Drawer closed state combines `inert`, non-visibility, non-hit-testing, and a transform that clears the 1rem inset. Open state retains dialog semantics and focus trapping.

- [x] Add RED `canvasDefaults` tests with hand-written expected placements for the same identities in two different active subsets for all four profiles. Assert exact surviving x, y, size, and layer equality and unchanged custom-profile placements.
- [x] Run `npx vitest run src/lib/layout/canvasDefaults.test.ts` and observe the count-dependent source-slot failure.
- [x] Replace active-count `spread` calls with stable identity slot catalogs and rerun the test green.
- [x] Add RED App/Canvas tests that toggle one widget and one connector, compare surviving item geometry, assert only the selected identity appears or disappears, and assert no layout storage write.
- [x] Run `npx vitest run src/newtab/App.test.tsx src/newtab/canvas/CanvasSurface.test.tsx` and observe geometry or write failure, then connect stable defaults without adding a toggle write path.
- [x] Add RED hook tests for the four profile fenceposts, resize coalescing, and cleanup. Run `npx vitest run src/newtab/useCanvasViewport.test.tsx` and observe the missing hook.
- [x] Implement `useCanvasViewport`, replace `useAdaptiveStageViewport` in `App`, remove layout-density capacity input from runtime layout, and rerun the hook plus App tests green.
- [x] Add RED pure anchor cases for top-left, top-right, bottom-left, bottom-right, narrow viewport internal scrolling, utility exclusion, and 8px clamping. Run `npx vitest run src/newtab/widgets/weather/weatherPanelAnchor.test.ts` and observe the missing module.
- [x] Implement the pure Weather anchor without DOM access and rerun it green.
- [x] Add RED Weather component tests proving portal ownership, disclosure state, Escape, outside click, second activation, invoker focus restoration, resize re-anchoring, finite scroll containment, and unchanged trigger/Canvas footprint. Run `npx vitest run src/newtab/widgets/weather/WeatherWidget.test.tsx` and observe the inline-expansion failure.
- [x] Portal Weather details to `document.body`, measure trigger and panel, observe movement/resize with the pure anchor, preserve the existing data and size content, and rerun component tests green.
- [x] Add RED Drawer tests proving the closed surface has `inert`, zero visibility, zero pointer events, no focusable descendants in sequential navigation, and an off-viewport bounding rect at both narrow and roomy widths. Run `npx vitest run src/settings/Drawer.test.tsx` and observe the visible-strip contract failure.
- [x] Implement the closed/open containment classes and rerun Drawer tests green.
- [x] Build production once for the focused probe with `npm run build` only if the current unpacked build is stale, then run `node scripts/preview-information-first-p1.mjs`. Exercise representative 375x812, 1366x768, 1920x1080, and 3840x2160 viewports, all four Weather corners, closed drawer pixels/hit testing, sibling geometry, toggle stability, layout bytes, page errors, and horizontal overflow.
- [x] Run the exact focused packet gate: `npx vitest run src/lib/layout/canvasDefaults.test.ts src/newtab/useCanvasViewport.test.tsx src/newtab/App.test.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/widgets/weather/weatherPanelAnchor.test.ts src/newtab/widgets/weather/WeatherWidget.test.tsx src/settings/Drawer.test.tsx`.
- [x] Run `npx tsc --noEmit --incremental false --pretty false` and `git diff --check`.
- [x] Commit `fix(canvas): stabilize runtime geometry and overlays`.
- [x] Run one PR-P1 implementation review against this packet only. Fix only Critical/Important findings, rerun affected focused tests, and perform one focused rereview. Ledger Minor/cosmetic findings.
- [x] Update plan evidence, `STATUS.md`, `ROADMAP.md`, and `DECISIONS.md`; commit `docs: checkpoint information-first PR-P1`; push; and prove both repository states.

**Evidence:** Implemented in `d138ee6`. The exact focused gate passed 7 files / 103 tests, TypeScript passed, and `git diff --check` passed. The focused built-extension probe passed at 375x812, 1366x768, 1920x1080, and 3840x2160 with a fully hidden and non-hit-testable closed drawer, exact surviving geometry and layout bytes through one widget toggle and one connector toggle, all four Weather corners at narrow and roomy widths, 8px viewport containment, unchanged Canvas and sibling geometry, focus restoration, no horizontal overflow, and zero runtime errors or failed requests. The bounded review found one Important missing resize-regression witness; a deliberate listener-removal mutation made the new test fail and restoration made it pass. No Critical or Important finding remains. Minor source-comment debt around the retired Weather wrapper-elevation bridge is assigned to PR-P5 reference-proof cleanup.

---

## Packet PR-P2: Information hierarchy & legibility

**Acceptance boundary:** Aurora is visibly information-first, role typography scales on 4K, Text size has truthful compatible persistence, bright/detailed backgrounds retain legibility, Weather sizes use their promised content, Bookmark marks are unambiguous, Search clears fixed controls, and the two unclear settings are renamed and explained.

**Files:**

- Create: `src/newtab/canvas/canvasTextScale.ts`
- Create: `src/newtab/canvas/canvasTextScale.test.ts`
- Create: `src/newtab/canvas/CanvasLegibilityLayer.tsx`
- Create: `src/newtab/canvas/CanvasLegibilityLayer.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/components/Clock.tsx`
- Modify: `src/newtab/components/Clock.test.tsx`
- Modify: `src/newtab/components/Greeting.tsx`
- Modify: `src/newtab/components/Greeting.test.tsx`
- Modify: `src/newtab/components/FocusLine.tsx`
- Modify: `src/newtab/components/FocusLine.test.tsx`
- Modify: `src/newtab/components/AuroraBriefing.tsx`
- Modify: `src/newtab/components/AuroraBriefing.test.tsx`
- Modify: `src/newtab/components/SearchBar.tsx`
- Modify: `src/newtab/components/SearchBar.test.tsx`
- Modify: `src/newtab/widgets/quote/QuoteWidget.tsx`
- Modify: `src/newtab/widgets/quote/QuoteWidget.test.tsx`
- Modify: `src/newtab/widgets/weather/WeatherWidget.tsx`
- Modify: `src/newtab/widgets/weather/WeatherWidget.test.tsx`
- Modify: `src/newtab/widgets/bookmarks/BookmarksBar.tsx`
- Modify: `src/newtab/widgets/bookmarks/BookmarksBar.test.tsx`
- Modify: `src/settings/sections/General.tsx`
- Modify: `src/settings/sections/Layout.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/index.css`

**Implementation contracts:**

- `projectTextScale` reads legacy `compact` as Standard without writing; `balanced` is Standard; `spacious` is Large; `auto` uses the profile-aware readable default.
- Root presentation exposes Canvas profile and text scale data attributes only. Canvas layout does not consume the stored field.
- Clock, Date, Greeting, Focus, Daily summary, Quote, attribution, widget body, and metadata use shared role tokens with written floors and bounded 4K targets.
- One pointer-transparent edge-free legibility layer supplies top, center, side, and bottom washes. Passive content does not gain opaque black cards.
- Weather Compact contains icon, temperature/unit, `Condition - Location`, freshness when applicable, and disclosure chevron. Standard adds the next useful rain/trend signal and one metric row. Full adds a short hourly preview and useful metrics without blank padding.
- A named folder paints one deterministic one- or two-character monogram; an unnamed folder paints one folder glyph; a favicon-less bookmark may paint one globe; no item paints two marks.
- Search reserves the fixed utility-control exclusion zone in every profile.

- [x] Add RED projection tests for every stored density value at ordinary, Large, Wide, and 4K viewports, including no persistence side effect. Run the test and observe the missing projection.
- [x] Implement the pure projection and root data attribute, remove density from Canvas geometry, and rerun focused projection/App tests green.
- [x] Add RED role tests that inspect computed token wiring and user-visible presence for Date, Greeting, Focus, summary, Quote, and attribution. Include literal 3840x2160 Standard and Large floor expectations. Observe the existing undersized supporting roles.
- [x] Add shared role variables and component classes, then rerun the component tests green.
- [x] Add RED legibility-layer tests for one pointer-transparent layer, correct stacking behind content, and absence of passive opaque panels. Implement broad gradient washes through the existing foreground/panel token system.
- [x] Add RED Weather size tests with literal visible-row expectations for Compact, Standard, and Full, including long-location truncation plus accessible full text and zero empty spacer rows. Implement the three written compositions.
- [x] Add RED Bookmark mark tests for named folder, unnamed folder, favicon-less link, one-character name, two-word name, and duplicate-mark prevention. Implement one mutually exclusive mark resolver.
- [x] Add RED Search geometry tests for Compact and roomy utility exclusions and focus-outline clearance. Implement the safe zone without moving fixed Refresh/Settings controls.
- [x] Add RED Settings tests proving `Text size`, `Timer completion sound`, and the exact Daily summary explanation are visible while `Layout density`, `Mute sounds`, and `Show briefing` are absent. Assert the positive timer control writes inverse `muted` and Daily summary writes the existing briefing field.
- [x] Implement the copy/control adapters without schema migration or eager write.
- [x] Run `npx vitest run src/newtab/canvas/canvasTextScale.test.ts src/newtab/canvas/CanvasLegibilityLayer.test.tsx src/newtab/App.test.tsx src/newtab/components/Clock.test.tsx src/newtab/components/Greeting.test.tsx src/newtab/components/FocusLine.test.tsx src/newtab/components/AuroraBriefing.test.tsx src/newtab/components/SearchBar.test.tsx src/newtab/widgets/quote/QuoteWidget.test.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx src/newtab/widgets/bookmarks/BookmarksBar.test.tsx src/settings/SettingsPanel.test.tsx`.
- [x] Run the focused browser probe on the brightest, darkest, and most detailed bundled backgrounds at 375x812, 1920x1080, 2560x1440, and 3840x2160. Record computed type sizes, Search/control clearance, Weather content occupancy, and contrast samples.
- [x] Run TypeScript and `git diff --check`, commit `feat(canvas): make Aurora information-first and legible`, complete one bounded review/fix/rereview cycle, update ledgers, commit `docs: checkpoint information-first PR-P2`, push, and prove both repositories.

**Evidence:** Implemented in `077ab0d`. The exact focused gate passed 12 files / 408 tests; the retired-presentation cascade regression passed 1 file / 3 tests; TypeScript and diff hygiene passed. A focused built-extension probe produced and individually inspected 12 original-resolution captures across bright, dark, and detailed bundled backgrounds at 375x812, 1920x1080, 2560x1440, and 3840x2160. It recorded role floors and contrast, Search clearance, Weather occupancy and exact Compact/Standard/Full rows, one pointer-transparent four-wash legibility layer, no horizontal overflow, and zero runtime errors or failed presentation requests. The bounded acceptance review returned Ready with no Critical or Important defect open. Existing Settings hydration `act(...)` warnings and stale retired Weather commentary remain Minor and do not reopen the packet.

---

## Packet PR-P3: Settings workspace

**Acceptance boundary:** Settings uses the bounded roomy shell, compact navigation and content measure, grouped Widgets, labelled editor disclosures, and concise layout guidance with one document scrollport and no horizontal overflow.

**Files:**

- Modify: `src/settings/Drawer.tsx`
- Modify: `src/settings/Drawer.test.tsx`
- Modify: `src/settings/Tabs.tsx`
- Modify: `src/settings/Tabs.test.tsx`
- Modify: `src/settings/SettingsPanel.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/settings/Section.tsx`
- Create: `src/settings/DisclosureSection.tsx`
- Create: `src/settings/DisclosureSection.test.tsx`
- Modify: `src/settings/sections/General.tsx`
- Modify: `src/settings/sections/Widgets.tsx`
- Modify: `src/settings/sections/Layout.tsx`
- Modify: `src/settings/sections/Weather.tsx`
- Modify: `src/settings/sections/WorldClocks.tsx`
- Modify: `src/settings/sections/Countdowns.tsx`
- Modify: `src/newtab/index.css`

**Implementation contracts:**

- At physical widths of at least 900px, Drawer is `min(calc(100vw - 2rem), 54rem)`, inset 1rem, with a 9rem navigation rail and bounded content measure.
- Below 900px, Drawer is a full-viewport modal with one document scrollport and no nested page scroll.
- Widgets groups are Core, Personal, and Time & sky. Roomy mode uses two columns; narrow uses one.
- Weather location, world clocks, countdowns, and habits editors live in labelled disclosures below the grouped toggles. Disclosure state is session-only and stores no new key.
- Layout contains Arrange, exact previous-layout recovery when available, and concise profile guidance. It has no density control.

- [x] Add RED Drawer/Tabs geometry and keyboard tests for 899/900px boundaries, 54rem maximum, 9rem navigation, readable content width, horizontal narrow tabs, vertical roomy tabs, roving focus, and one scroll owner.
- [x] Implement the bounded shell and navigation dimensions, then rerun Drawer/Tabs tests green.
- [x] Add RED `DisclosureSection` tests for semantic button naming, `aria-expanded`, controlled region association, keyboard activation, and no persistence. Implement the reusable disclosure.
- [x] Add RED Settings integration tests for the three exact widget groups, two-column/one-column class behavior, editor location below toggle groups, only intentionally opened editor content, and preserved toggle/save behavior.
- [x] Reshape Widgets and compose the existing editor sections inside disclosures without changing their storage owners.
- [x] Add RED Layout tests proving Arrange and exact recovery remain, concise Small/Desktop/Large/Wide guidance is present, and no removed presentation terminology remains.
- [x] Run `npx vitest run src/settings/Drawer.test.tsx src/settings/Tabs.test.tsx src/settings/DisclosureSection.test.tsx src/settings/SettingsPanel.test.tsx src/settings/sections/EntityPickerDialog.test.tsx src/settings/sections/TokenConnectForm.test.tsx`.
- [x] Run a focused Chromium Settings probe at 320x568, 390x844, 768x1024, 1024x768, 1366x768, 1920x1080, and 3840x2160. Exercise all tabs, every disclosure, local scrolling, Escape, focus restoration, overflow, and closed-state containment.
- [x] Run TypeScript and `git diff --check`, commit `feat(settings): converge the information workspace`, complete one bounded review/fix/rereview cycle, update ledgers, commit `docs: checkpoint information-first PR-P3`, push, and prove both repositories.

**Evidence:** Implemented in `4b84fb7`. The exact focused gate passed 6 files / 311 tests, TypeScript, and diff hygiene. The focused built-extension probe passed at 320x568, 390x844, 768x1024, 1024x768, 1366x768, 1920x1080, and 3840x2160 with all four tabs, horizontal and vertical keyboard navigation, every editor disclosure opened by Enter, one local document scroll owner, 38rem content measure, exact roomy geometry, Escape, opener focus restoration, closed-state containment, no horizontal overflow, and zero runtime errors or failed requests. All seven original-resolution captures were inspected individually. The bounded review found two acceptance-evidence gaps: no literal 899/900 input witness and pointer-only disclosure activation. The fix/rereview added both without changing the product implementation; no Critical or Important finding remains. Existing Settings hydration `act(...)` warnings and stale retired Weather commentary remain Minor.

---

## Packet PR-P4: Connector workspace

**Acceptance boundary:** Connector Settings shares the Drawer surface, uses truthful summary states, shows only one active setup/edit/reconnect form, distinguishes configured visibility from configuration, and preserves the full privacy and recovery contracts.

**Files:**

- Create: `src/settings/connectors/connectorCardState.ts`
- Create: `src/settings/connectors/connectorCardState.test.ts`
- Create: `src/settings/connectors/ConnectorPrivacyDisclosure.tsx`
- Create: `src/settings/connectors/ConnectorPrivacyDisclosure.test.tsx`
- Create: `src/settings/connectors/ConnectorCardShell.tsx`
- Create: `src/settings/connectors/ConnectorCardShell.test.tsx`
- Modify: `src/settings/sections/Connectors.tsx`
- Modify: `src/settings/sections/TokenConnectForm.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/index.css`
- Create: `scripts/preview-information-first-p4.mjs`

**Implementation contracts:**

- The sticky Connector header inherits the Settings surface and does not paint an unrelated opaque slab.
- Always-visible copy is `Connector details stay in this Chrome profile and are sent only to the services you choose.` The disclosure retains the complete existing plaintext/shared-profile/capability URL/disconnect/data-clear guidance.
- Parent state owns one `editingConnectorId` and one `ConnectorCardMode`. Opening another card closes the previous one and restores focus correctly when closing.
- Authenticated connectors with invalid credentials/config show Set up and no Show on Canvas switch. Reconnect-required fields remain immediately visible.
- Configured connectors show Show on Canvas mapped to the existing `enabled` field plus Edit. Hiding preserves configuration.
- RSS, Calendar, Crypto, and Status derive configured state from meaningful local fields rather than `enabled` alone.
- Default grouping is On canvas and Available by existing category. Search is registry-driven and includes every shipped connector.

- [x] Add RED pure state tables for RSS, GitHub, GitLab, Jira, Vercel, Crypto, Calendar, Status, and Home Assistant across unconfigured, configured-hidden, configured-visible, and reconnect-required inputs. Hand-write expected primary action, switch visibility, mode, and group.
- [x] Run the pure test and observe the missing state model, then implement it without changing persisted connector shapes.
- [x] Add RED privacy disclosure tests for concise always-visible copy, complete protected guidance in the disclosure, keyboard operation, and absence of credential/capability values in DOM or logs.
- [x] Add RED shell tests for truthful labels, Set up/Edit/Show on Canvas behavior, one open body, Cancel/close focus restoration, and reconnect body immediacy.
- [x] Integrate the shell into `Connectors.tsx`, leaving existing permission, disconnect, token, URL, refresh, and storage functions unchanged beneath the presentation boundary.
- [x] Add RED integration tests that configure then hide each local-input connector, verify configuration remains, reopen Edit, and verify no unconfigured Show on Canvas switch. Add authenticated connector reconnect and disconnect regression cases using complete existing fixtures.
- [x] Add RED grouping/search tests proving all nine families are reachable, configured-visible cards are in On canvas, all others are in Available/category groups, and search returns matching identities regardless of group.
- [x] Run `npx vitest run src/settings/connectors/connectorCardState.test.ts src/settings/connectors/ConnectorPrivacyDisclosure.test.tsx src/settings/connectors/ConnectorCardShell.test.tsx src/settings/SettingsPanel.test.tsx src/settings/sections/TokenConnectForm.test.tsx src/settings/sections/EntityPickerDialog.test.tsx src/lib/permissions/optionalTransactions.test.ts src/services/connectors/snapshotIdentity.test.ts`.
- [x] Run a focused Chromium Connector probe at 375x812, 1024x768, 1366x768, 1920x1080, and 3840x2160 with non-personal fixtures. Exercise search, all nine cards, Setup/Edit/Cancel, hide/show, reconnect, disclosure, scrolling, focus, errors, and black-slab absence without live requests.
- [x] Run TypeScript and `git diff --check`, commit `feat(connectors): clarify setup visibility and editing`, complete one bounded review/fix/rereview cycle, update ledgers, commit `docs: checkpoint information-first PR-P4`, push, and prove both repositories.

**Evidence:** Implemented in `7e16c12`. The exact present-file command passed 7 files / 353 tests; the written `src/lib/permissions/optionalTransactions.test.ts` filter has no repository file, so the live `src/services/permissionTransactions.test.ts` authority suite was included in a focused permission/reconnect/disconnect review slice that passed 3 files / 57 tests. TypeScript and diff hygiene passed. The built-extension probe exercised all nine registry identities and every written interaction at 375x812, 1024x768, 1366x768, 1920x1080, and 3840x2160 with no live external request, runtime error, failed request, nested scroll owner, or horizontal overflow. Five original-resolution captures were inspected individually. RED/GREEN visual coverage corrected the sticky header's inherited alpha before review, preventing the prior double-composited slab. The bounded review returned Ready with no Critical or Important defect; existing Settings hydration warnings and legacy connector presentation helpers/comments remain Minor for PR-P5.

---

## Packet PR-P5: Arrange artboards & obsolete presentation retirement

**Acceptance boundary:** Arrange modality follows physical viewport width, every profile uses a truthful logical artboard, the inspector remains compact and non-occluding, and only proven-unreachable Adaptive Stage presentation code is removed.

**Files:**

- Create: `src/newtab/arrange/arrangeViewport.ts`
- Create: `src/newtab/arrange/arrangeViewport.test.ts`
- Create: `src/newtab/arrange/ArrangeArtboard.tsx`
- Create: `src/newtab/arrange/ArrangeArtboard.test.tsx`
- Modify: `src/newtab/arrange/ArrangeController.tsx`
- Modify: `src/newtab/arrange/ArrangeController.test.tsx`
- Modify: `src/newtab/arrange/arrangePreview.ts`
- Modify: `src/newtab/canvas/CanvasSurface.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/index.css`
- Delete after reference proof: `src/newtab/components/BoardItem.tsx`
- Delete after reference proof: `src/newtab/components/BoardItem.test.tsx`
- Delete after reference proof: `src/newtab/components/LauncherShelf.tsx`
- Delete after reference proof: `src/newtab/components/LauncherShelf.test.tsx`
- Delete after reference proof: `src/newtab/dockBlockSizes.ts`
- Delete after reference proof: `src/newtab/dockBlockSizes.test.ts`
- Delete after replacement proof: `src/newtab/useAdaptiveStageViewport.ts`
- Delete after replacement proof: `src/newtab/useAdaptiveStageViewport.test.tsx`
- Modify: `scripts/preview-v1-canvas.mjs`
- Modify: `scripts/preview.mjs`

**Implementation contracts:**

- `arrangeViewportMode(physicalWidth)` returns side at 1100px and above, sheet below 1100px. It never reads the logical profile.
- Logical artboards are exactly Small 390x844, Desktop 1440x900, Large 2560x1440, and Wide 3440x1440.
- Arrange-only uniform scaling fits the logical artboard in the available workspace. Pointer conversion maps client coordinates back to logical artboard coordinates before the existing percentage/snap functions.
- Side inspector is 320 to 340px; sheet is dismissible and at most 50dvh. The selected Canvas remains visible in both modes.
- Existing pointer capture, long press, keyboard movement, guides, collision/layer controls, undo, exact Cancel, explicit Save, recovery, and focus restoration remain unchanged.
- Deletions require `rg` proof of no live imports. Layout V2 types/adapters and pure planner code still imported by compatibility paths remain.

- [x] Add RED physical-width boundary tests at 1099 and 1100px while selecting every logical profile. Observe the current profile-driven inspector failure and implement `arrangeViewportMode`.
- [x] Add RED artboard tests for exact logical dimensions, uniform scale, no production-root transform, client-to-logical pointer conversion, and preview visibility with inspector open.
- [x] Integrate `ArrangeArtboard` and rerun direct drag, keyboard, snap, overlap, layer, Save, Cancel, and focus tests.
- [x] Add RED controller tests for the compact top toolbar, adjacent nudge/size/visibility/layer/restore controls, side inspector bounds, sheet max height, sheet dismissal, and all four profile switches retaining one draft.
- [x] Run `rg -n "BoardItem|LauncherShelf|dockBlockSizes|useAdaptiveStageViewport|adaptive-stage|semantic-zone|signal-dock" src scripts` and record every remaining import or compatibility dependency.
- [x] Delete only the four component/test files and Dock calibration files if the reference proof contains no live consumer. Delete the old viewport hook only after PR-P1 replacement has no imports. Remove CSS/harness branches only when a live Canvas equivalent is already covered.
- [x] Preserve `src/lib/layout/adaptiveStage.ts` and its tests while `canvasAdapter`, V2 recovery, or any live compatibility path imports it. Do not convert compatibility storage.
- [x] Run `npx vitest run src/newtab/arrange/arrangeViewport.test.ts src/newtab/arrange/ArrangeArtboard.test.tsx src/newtab/arrange/ArrangeController.test.tsx src/newtab/arrange/canvasDraft.test.ts src/newtab/arrange/canvasSnap.test.ts src/newtab/arrange/useLongPress.test.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/App.test.tsx src/lib/layout/canvasAdapter.test.ts src/lib/layout/adaptiveStage.test.ts`.
- [x] Run a focused Chromium Arrange probe at 375x812, 1024x768, 1366x768, 1920x1080, 3440x1440, and 3840x2160. Exercise all profiles, inspector modes, real pointer capture, long press, drag, keyboard movement, guides, collisions/layers, Undo, exact Cancel, and one Save.
- [x] Run TypeScript, the reference search again, and `git diff --check`; commit `feat(arrange): add truthful Canvas artboards`; complete one bounded review/fix/rereview cycle; update ledgers; commit `docs: checkpoint information-first PR-P5`; push; and prove both repositories.

**Evidence:** Implemented in `43ff333`. The expanded focused gate passed 11 files / 188 tests, TypeScript, and diff hygiene. The built-extension Arrange probe passed all four profiles at 375x812, 1024x768, 1366x768, 1920x1080, 3440x1440, and 3840x2160 with exact logical artboards, physical-width sheet/side modality, uniform scaling, no production-root transform, live pointer capture, long press, drag, keyboard movement, guides, collision/layer controls, Undo, exact Cancel, and Save. Six original-resolution captures were inspected, including the narrow, 1080p, and 4K fenceposts, with no runtime errors, failed requests, external requests, or horizontal overflow. Reference proof removed the listed unconsumed components, Dock calibration files, and superseded viewport hook while preserving the pure compatibility planner. The bounded review found one Important risk where old custom Small percentages would be reinterpreted on the new fixed coordinate plane; the fix made the plane additive, validated, and explicit-save-only while retaining exact unmarked legacy geometry. Focused rereview was Ready with no Critical or Important defect open. Existing React `act()` warnings remain Minor test noise.

---

## Packet PR-P6: Common-display Chromium QA & owner visual gate

**Acceptance boundary:** All 23 written CSS viewports pass all five required states in direct Chromium, all 115 originals are individually inspected, deeper interactions and connector size compositions are exercised, and the owner receives the eight specified original-resolution captures. Stop after presenting the gate.

**Files:**

- Create: `scripts/information-first-viewports.mjs`
- Create: `scripts/information-first-fixtures.mjs`
- Create: `scripts/preview-information-first.mjs`
- Create: `scripts/preview-information-first.test.mjs`
- Modify: `package.json`
- Create: `docs/superpowers/reports/INFORMATION-FIRST-COMMON-DISPLAY-QA.md`
- Modify only for reproduced defects: affected focused production/test files from PR-P1 through PR-P5

**Harness contracts:**

- Exact viewport catalog: 320x568, 360x800, 375x812, 390x844, 412x915, 768x1024, 820x1180, 1024x600, 1024x768, 1280x720, 1280x800, 1280x1024, 1366x768, 1440x900, 1536x864, 1600x900, 1920x1080, 1920x1200, 2560x1440, 2560x1600, 2560x1080, 3440x1440, and 3840x2160 at device scale factor 1.
- Exact five states at every viewport: information-rich Canvas, Settings Widgets, Settings Connectors, top-right expanded Weather through a real click, and Arrange Small with inspector open.
- Every state records an original PNG and structured geometry JSON. The harness asserts no document horizontal overflow, clipped required region, unintended intersection, missing image, console/page error, failed presentation request, wrong modality, wrong type floor, wrong cursor, or unscrollable finite surface.
- Fixtures use actual renderers with non-personal, non-routable data and no live provider requests.
- Deep interactions run at 375x812, 1024x768, 1366x768, 1920x1080, 3440x1440, and 3840x2160.
- Connector matrix covers RSS, GitHub, GitLab, Jira, Vercel, Crypto, Calendar, Status, and Home Assistant at every registry-promised Compact, Standard, and Full size and representative ready/loading/stale/empty/error states.
- Weather corner matrix covers four legal corners at representative narrow and roomy widths with real activation, direction, 8px margins, sibling stability, Escape/outside close, and focus restore.

- [ ] Add script-level tests that validate the exact 23 unique viewports, five exact state names, 115 expected image paths, six deep-interaction fenceposts, nine connector identities, promised size enumeration from the registry fixture, and four Weather corners. Run `node --test scripts/preview-information-first.test.mjs` and observe the missing harness modules.
- [ ] Implement deterministic fixture seeding and harness orchestration. Add `qa:information-first` to `package.json` as `node scripts/preview-information-first.mjs`.
- [ ] Run focused component/unit tests affected since PR-P5, then build the preview artifact once for this gate.
- [ ] Run `npm run qa:information-first` once. If it fails, diagnose the first actual failure family with screenshots/geometry, add a focused failing regression, fix that family, and rerun only its focused viewport/state until green. Do not restart the complete matrix after cosmetic or report edits.
- [ ] Inspect each of the 115 original-resolution images individually with image viewing, recording pass/fail and concrete observations in `INFORMATION-FIRST-COMMON-DISPLAY-QA.md`. Contact sheets may navigate but cannot substitute for individual inspection.
- [ ] Inspect every connector size capture individually and record whether each larger size adds useful content rather than padding.
- [ ] Compare harness geometry against the written type floors, Weather safe margins, sibling stability, Settings containment, Arrange modality, and local-scroll contracts.
- [ ] Run the exact affected focused unit/component tests, `node --test scripts/preview-information-first.test.mjs`, TypeScript, and `git diff --check`.
- [ ] Commit `test(ui): prove information-first common displays`.
- [ ] Run one PR-P6 implementation/evidence review. Fix only Critical/Important defects with focused RED/GREEN evidence and perform one focused rereview. Do not rerun the complete matrix for report-only changes.
- [ ] Update ledgers and the report, commit `docs: checkpoint information-first PR-P6 visual gate`, push, and prove both repositories.
- [ ] Present these original files without resizing: 375x812 information-rich Canvas; 1024x768 Settings Widgets; 1366x768 Settings Connectors; 1920x1080 top-right expanded Weather; 1920x1080 Small Arrange plus side inspector; 2560x1440 information-rich Large; 3440x1440 information-rich Wide; and 3840x2160 information-rich Canvas with measured supporting type.
- [ ] Stop and wait for explicit owner visual approval. Do not begin PR-P7 and do not change Store state.

---

## Packet PR-P7: Stabilization & release restaging

**Acceptance boundary:** After PR-P6 owner approval, run the single final gate, fix only real failing families under the one-rerun rule, and replace the withdrawn local release package, screenshots, hashes, notes, and dossier without changing Store state.

**Files:**

- Modify only for reproduced final-gate defects: affected source and focused tests
- Modify: `release/store-listing.md`
- Modify: `release/RELEASE-NOTES-2.0.0.md`
- Modify: `release/RESUBMISSION-NOTES.md`
- Modify: `release/LAUNCH-CHECKLIST.md`
- Modify: `release/RELEASE-DOSSIER-2.0.0.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Regenerate ignored: `release/aurora-2.0.0.zip`
- Regenerate ignored: Store screenshot and hash artifacts named by the release dossier

**Final gate policy:**

- The full unit suite runs once after PR-P6 owner approval and code stabilization.
- Production build and preview build run once each.
- The canonical browser harness runs once. If it fails, diagnose the actual failing family, add or update a focused regression, fix it, run that focused family, then rerun the canonical harness once. No third canonical run.
- Documentation, reports, hashes, packaging metadata, and unrelated files never trigger a repeated full code gate.
- Release artifacts are built only from a clean committed source tree and are audited for manifest/version/root/file-count/source/test/harness/sourcemap/secret leakage before being named eligible.
- Store remains read-only and untouched throughout PR-P7.

- [ ] Confirm explicit PR-P6 owner approval in the durable ledger and re-prove both repositories.
- [ ] Run `npm test` once and retain its exact output. For any product failure, add a focused RED test and fix only that family; do not repeat the full suite.
- [ ] Run `npm run build` once and `npm run build:preview` once. Run the production bridge/source leakage scan used by W6-P4.
- [ ] Run the canonical browser harness with `node scripts/preview.mjs` once. If it fails, use the one focused fix plus one canonical rerun policy exactly.
- [ ] Reinspect the accepted eight PR-P6 originals after the final code change. Regenerate only captures affected by an actual visual change.
- [ ] Commit any final defect fix as `fix(ui): stabilize information-first release candidate` and prove a clean committed source head.
- [ ] Build `release/aurora-2.0.0.zip` once from that clean head using the existing package script. Audit root entries, manifest version, permissions, CSP, file count, size, SHA-256, absence of source/tests/harnesses/sourcemaps, and absence of credentials, capability URLs, or personal fixture data.
- [ ] Generate five current Store images from accepted information-first states with the existing Store capture process, inspect each original separately, and record exact dimensions and hashes.
- [ ] Replace withdrawn warnings with the new exact source commit, package hash/size/count, screenshot hashes, test/build/harness evidence, manual ceilings, and accurate information-first listing/reviewer copy. Keep all privacy/Data Usage disclosures unchanged unless executable data flow changed, which this plan forbids.
- [ ] Run `git diff --check` for tracked artifacts. Documentation-only changes do not rerun code gates.
- [ ] Commit `docs: restage Aurora 2 information-first release`, complete one final bounded acceptance review and at most one Critical/Important documentation/artifact fix plus rereview, push, and prove active/protected repository states.
- [ ] Mark PR-P7 Verified only when the worktree is clean and upstream-equal and the local candidate is auditable. Report that W6-P5 remains blocked pending a new action-specific approval.

## Plan self-review checklist

| Design acceptance | Executable evidence |
|---|---|
| 1. Information-first hierarchy | PR-P2 role hierarchy and legibility layer; PR-P6 information-rich Canvas at every viewport |
| 2. Withdrawn candidate remains ineligible | Global constraints; PR-P7 replaces rather than reuses its release evidence |
| 3. Settings sliver, width, and whitespace | PR-P1 closed containment; PR-P3 bounded workspace; PR-P6 five-state geometry |
| 4. Connector slab and one editor | PR-P4 surface, state, and integration tests; PR-P6 Connector state |
| 5. Weather safe overlay and focus | PR-P1 anchor/component tests and browser corners; PR-P6 top-right and four-corner matrix |
| 6. Toggle stability and no layout write | PR-P1 pure placements, App integration, browser rectangles, and storage-byte assertion |
| 7. Independent layouts and exact Save/recovery | PR-P5 Arrange regressions plus preserved Canvas V3 suites; PR-P6 deeper interaction |
| 8. Small preview plus side inspector | PR-P5 1099/1100 boundary and artboard tests; PR-P6 Arrange state |
| 9. Effective Text size and 4K floors | PR-P2 projection/type tests; PR-P6 computed 4K measurements |
| 10. Background legibility without passive cards | PR-P2 washes and background probe; PR-P6 information-rich originals |
| 11. Truthful Timer and Daily summary labels | PR-P2 Settings tests and compatibility adapters |
| 12. Connector state distinctions | PR-P4 all-nine pure state table and integration tests |
| 13. Bookmark marks and Search clearance | PR-P2 component/geometry tests; PR-P6 Canvas states |
| 14. Truthful connector sizes | PR-P6 all-nine connector composition matrix using registry promises |
| 15. Safe obsolete-code retirement | PR-P5 reference proof, compatibility tests, TypeScript, and diff hygiene |
| 16. 23 viewports and five states | PR-P6 exact catalog tests, 115 original captures, individual inspection |
| 17. Owner approval before stabilization | PR-P6 hard stop; PR-P7 first step checks approval |
| 18. One-run and one-rerun policy | Global constraints and PR-P7 final gate policy |
| 19. Clean repositories and untouched Store | Every checkpoint proof; PR-P7 final proof and W6-P5 block |

- [x] Every acceptance criterion in design section 14 maps to at least one packet test or evidence step.
- [x] No production change precedes an observed focused failing test.
- [x] The 23 viewport list, five states, 115 originals, six interaction fenceposts, nine connectors, three promised sizes, four Weather corners, and eight owner captures are exact.
- [x] Settings density compatibility performs no eager write and layout never consumes it.
- [x] Weather overlay, Canvas toggle stability, Arrange modality, and release gates have pure or focused regression seams.
- [x] Frozen authorities and protected/Store boundaries appear in both global constraints and release steps.
- [x] Deletion work requires reference proof and retains compatibility code still imported.
- [x] Each packet has one review/fix/rereview cycle, bounded commits, pushes, ledgers, and repository proofs.
- [x] The plan contains no placeholders, unspecified test commands, or alternative success branches.
