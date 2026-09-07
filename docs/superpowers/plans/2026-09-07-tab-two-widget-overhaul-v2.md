# Tab Two widget overhaul v2 implementation plan

> Execute sequentially with the executing-plans workflow. The owner prohibits subagents. Use the verified existing worktree; do not recreate it.

**Goal:** Implement the complete approved 38-widget review while preserving every existing color control, supported presentation, data authority, and action.

**Approval:** On September 7, 2026 the owner approved proceeding with the complete September 6 review, conditional on keeping widget color customization and avoiding widget regressions.

**Spec:** The immutable review inputs are in `C:/Users/SickT/Documents/Codex/2026-09-05/continue-tab-two-paid-mvp-delivery/outputs/widget-overhaul-v2/`: `inventory.json`, `design-data.js`, `renderers.js`, `review.css`, and 384 current-render captures. The review covers 38 widgets, 17 connectors, 213 supported placements, and 28 independent existing-setting variants. Sample content and state selectors are demonstrations, not authorization to remove existing functionality or invent provider behavior.

**Architecture:** Keep the existing React components, storage authority, connector snapshots, provider handlers, and explicit named layouts. Add presentation-only graph preferences to Settings, independent of connector configuration, with migration and backup validation. Use shared, panel-aware accent tokens and authored per-family layouts. Preserve custom panel/text/photo colors and intrinsic free widgets.

**Tech stack:** Existing React/TypeScript/Tailwind/Vite, Vitest, and installed Chromium harnesses. No dependency, permission, or hosted change.

## Constraints

- Worktree `D:/DEV/Chrome plugin-aurora-2`, branch `feat/aurora-2-observatory`, starting local/upstream/remote `6d66a4c480f3a6651c3559c97f8c1c24ac32fbdd`.
- Protected original remains clean at `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Preserve artifacts, takeover document, and all Google/Microsoft QA evidence.
- Keep 216×132, 320×200, and 460×284 framed sizes, existing intrinsic footprints, supported size declarations, manual stacks, and dock authority.
- Keep all source selections, view toggles, larger detail surfaces, actions, accessibility labels, errors, cached-data behavior, and permission prompts. Do not replace these with prototype sample data.
- Keep Calendar/Month/Public Holidays/Google/Microsoft authorities independent. Keep all-day spans, timezone/date logic, view keyboard navigation, and day-context popovers.
- Clock, Greeting, Quote, and other intrinsic free modes remain unframed. Fitness remains on hold. All publication, hosted, paid infrastructure, merge, packaging, release, and Store gates remain separate.

## Tasks

### 1. Independent color preferences and theme preservation

- [x] Add failing tests for independent GitHub/GitLab graph palettes, upgrade of v24 settings preserving existing colors/layouts, strict invalid-palette rejection, and color-control persistence without connector changes.
- [x] Add `graphColors` to Settings with Blue/Orange defaults, migrate v24→v25, and validate backup/recovery/sync boundaries.
- [x] Add a graph-color selector to each existing GitHub/GitLab connector editor, using `storage.update('settings', current => ...)` so parallel changes preserve unrelated preferences. Do not touch connector configuration or its request fingerprint.
- [x] Implement panel-adaptive semantic accents in `src/theme/`, preserving `panelColor`, `widgetTextColor`, and all photo-ink overrides.
- [x] Run affected theme/storage/backup/settings tests and TypeScript.

### 2. Calendar and square contribution geometry

- [x] Preserve contribution data/totals/date range/hover labels and selected views; render actual square cells with one-pixel corners and independent palettes at every tier.
- [x] Replace inconsistent Calendar day wrappers with equal-height containers, fixed circular date badges, and a separate marker lane; retain actionable day popovers and source colors.
- [x] Apply the same fixed date-badge treatment to standalone Month without changing its static table or countdown authority.
- [x] Verify meaningful unit contracts and actual Chromium four/five/six-week month bounds and square graph cells.

### 3. Complete catalog presentation

- [x] Day/sky: Weather, Calendar, Month, Sun, Moon, World Clocks, Public Holidays, Aurora Kp.
- [x] Intrinsic/personal: Clock, Greeting, Quote, Countdown, Focus, Progress; keep source-owned content and correct semantics.
- [x] Core/browser: Search, Links, Bookmarks, Habits, Timer, Tasks, Notes, Reading List, Recently Closed, Downloads, Tab Groups.
- [x] Connected/work: GitHub, GitLab, Jira, Deploys, Home Assistant, Headlines, Crypto, Linear, Sentry, Todoist, On This Day, Metrics.
- [x] Use available larger frames for useful rows/forecast/history context. Keep existing longer-content access and every action; preserve Home Assistant actions and browser-native affordances.
- [x] Retain source-specific/status colors and shared spacing across connector settings without altering authorization flows.
- [x] Record an implementation disposition for every one of the 38 identities; no unreviewed prototype feature is silently substituted.

### 4. Actual implementation proof

- [x] Adapt the review capture harness to a new evidence directory; never overwrite before images or previous artifacts.
- [x] Capture all 213 placements in the actual extension. Inspect per-widget originals, dark/light/colored panels, custom ink, graph colors, long content, relevant settings, and the short 1408×445 viewport.
- [x] Exercise settings persistence/reload, no graph-color provider refetch, month view/day-context/keyboard behavior, stack/dock controls, and preserved action families.
- [x] Run affected unit/script contracts, TypeScript, one stabilized full unit suite, exact builds, and the composed stabilization gate. Avoid unrelated historical harness repair or repeat verification absent a new failure.

### 5. Delivery and reconciliation

- [x] Perform one bounded self-review for Critical/Important defects, fix any such defects, and rerun only affected checks before stabilization.
- [x] Update STATUS, ROADMAP, DECISIONS, QA evidence report, and cumulative owner-QA checklist with exact provenance and honest manual limits.
- [x] Commit intended source/docs only, push the existing feature branch, and prove local/upstream/remote equality. Do not merge or package.
- [x] Recheck protected files and original checkout; publish a new actual-implementation review beside the unchanged prototype and before captures.
