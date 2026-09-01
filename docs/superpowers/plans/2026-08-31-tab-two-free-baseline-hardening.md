# Tab Two Free Baseline Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the obsolete global premium gate from every capability that the approved freemium model keeps free, without changing visible behavior, storage, permissions, requests, layouts, or connector authority.

**Architecture:** Existing Connectors, named layouts, live editing, layout switching, keyboard edit entry, long-press entry, and widget-to-connector Settings routing become unconditional free-product paths. No replacement entitlement abstraction is added in this packet. Later paid capabilities will use capability-specific signed grants rather than a global boolean.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Playwright Chromium, Chrome MV3, Vite exact production builds.

**Spec:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`

**Execution correction (2026-08-31):** The original source-text guard and
script-marker contract were replaced with observable behavior tests and an
executable QA CLI contract. Source scanning remains a review/build hygiene
check, not a shipped unit test. This preserves the approved outcome while
following the repository rule that tests exercise behavior rather than grep
implementation text.

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`.
- Preserve `artifacts/` and `docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md` untouched and untracked.
- Keep all 15 current connectors, named layouts, layout editing, drag and drop, stacks, docks, backup, and every current local feature free.
- Do not add account, entitlement, subscription, Supabase, Stripe, permission, network, storage, analytics, sync, Metrics, provider, Store, merge, or release behavior.
- Do not add a replacement `isPremium`, build flag, email allowlist, owner bypass, or unused future-capability framework.
- Keep existing connector credentials, feed colors, storage authorities, layout bytes, refresh policy, request ownership, and privacy behavior unchanged.
- Start with observed RED, make the smallest production change, perform one bounded Critical/Important review with at most one fix cycle, and run the stabilized full gate only once.

---

### Task 1: Pin the free baseline RED

**Files:**

- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/arrange/useLongPress.test.tsx`

**Interfaces:**

- Consumes: Existing Settings and edit-entry behavior.
- Produces: Observable failures proving that the legacy gate still blocks
  current free Settings, Layout, Connectors, and long-press entry.

- [x] **Step 1: Reverse the stale gated expectations**

Under the existing mocked false result, require the five Settings tabs,
Layout recovery controls, Connectors region, and 500ms long-press engagement.
Each expectation names the user-visible behavior the obsolete gate blocks.

- [x] **Step 2: Run RED**

Run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx src/newtab/arrange/useLongPress.test.tsx
```

Observed: four intended failures, with the remaining 293 focused tests passing.

- [x] **Step 3: Preserve the permanent behavior coverage**

The existing ordinary-path tests already assert the five tabs, Layout recovery,
Connectors gallery, and 500ms long press. Remove the obsolete false-premium
mocks after GREEN instead of retaining duplicate or source-coupled tests.

- [x] **Step 4: Confirm isolated RED**

Run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx src/newtab/arrange/useLongPress.test.tsx
```

Observed: exactly the four intended behavior assertions fail until the
production gates are removed.

### Task 2: Remove the obsolete gate

**Files:**

- Delete: `src/lib/premium.ts`
- Modify: `src/settings/SettingsPanel.tsx`
- Modify: `src/settings/sections/Layout.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/arrange/useLongPress.ts`
- Modify: `src/newtab/edit/useEditMode.ts`

**Interfaces:**

- Consumes: Existing connector, layout, edit-mode, and Settings interfaces unchanged.
- Produces: The same public behavior with no entitlement dependency.

- [x] **Step 1: Make Settings unconditional**

Replace `tabsFor(premium)` with a constant five-tab list. Remove the connector
fallback in `focusSettingsTarget`, render Connectors whenever its tab is active,
and remove all `isPremium` imports and variables. Do not rename tab ids or move
sections.

- [x] **Step 2: Make layout recovery and editing unconditional**

Remove the gate and stale premium commentary from `Layout.tsx`. In
`useEditMode.ts`, retain only `if (!resolved) return`. In `useLongPress.ts`,
remove the early return while preserving every pointer, tolerance, cancellation,
and click-suppression path.

- [x] **Step 3: Make App routing and entry unconditional**

In `App.tsx`, always route connector-backed widgets to Connectors, allow the
Ctrl/Cmd+Shift+E entry to reach the existing live-session guards, and render the
Layout badge whenever `!session && layoutsDocument`. Do not alter edit-session,
storage-write, stack, dock, or focus-restoration logic.

- [x] **Step 4: Delete the dead module and run GREEN**

Delete `src/lib/premium.ts`, then run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx src/settings/Tabs.test.tsx src/newtab/arrange/useLongPress.test.tsx src/newtab/edit/useEditMode.test.tsx src/newtab/App.test.tsx
```

Observed: 5 files / 368 tests pass; `rg -n "isPremium|lib/premium" src`
returns no code reference. The existing ProgressRail React `act()` warning
remains unchanged test noise.

### Task 3: Reconcile test names and source truth

**Files:**

- Modify: `src/settings/Tabs.test.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/arrange/useLongPress.test.tsx`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Consumes: Green production behavior from Task 2.
- Produces: Tests and ledgers that no longer call existing connectors or layout editing premium.

- [x] **Step 1: Remove stale test vocabulary**

Rename the generic `Tabs.test.tsx` varying-count test so it describes bounded
three- and four-item tab rows without calling either set free or premium. Remove
all obsolete premium mocks, resets, imports, and comments from affected tests.

- [x] **Step 2: Reconcile active ledgers**

Record that the free-baseline packet removed only obsolete gates and changed no
runtime authority. Keep paid architecture in owner-approved design status and
do not claim account, entitlement, or owner-grant implementation.

- [x] **Step 3: Run focused GREEN and TypeScript**

Run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx src/settings/Tabs.test.tsx src/newtab/arrange/useLongPress.test.tsx src/newtab/edit/useEditMode.test.tsx src/newtab/App.test.tsx
npx tsc --noEmit
git diff --check
```

Observed: the focused baseline passed 5 files / 368 tests before the final touch
regression was added; TypeScript and diff hygiene passed. The final stabilized
gate below includes the added touch regression.

### Task 4: Add exact real-extension proof

**Files:**

- Create: `scripts/qa-free-baseline.mjs`
- Create: `scripts/qa-free-baseline.test.mjs`
- Modify: `package.json`
- Create: `docs/superpowers/reports/TAB-TWO-FREE-BASELINE-QA.md`

**Interfaces:**

- Consumes: Exact production build at the reviewed commit.
- Produces: Original-resolution desktop/touch evidence and storage/request/runtime ledgers.

- [x] **Step 1: Write the failing harness contract**

Execute `qa-free-baseline.mjs` in contract mode against controlled arguments and
temporary output. Prove that missing `--exact` is rejected before browser work,
then prove exact mode records commit/build provenance, uses the installed
extension rather than a page mock, audits storage and requests, captures
1600x900 and touch-enabled 768x812 screenshots, and fails on any unjudged
capture.

- [x] **Step 2: Run RED**

Run:

```powershell
node --test scripts/qa-free-baseline.test.mjs
```

Expected: failure because the harness and required contract markers do not exist.

- [x] **Step 3: Implement the bounded witness**

Add the exact package entry:

```json
"qa:free-baseline": "node scripts/qa-free-baseline.mjs"
```

The witness must:

1. Open Settings and prove all five tabs, Connectors, and Layout are reachable.
2. Open a connector-backed widget's gear and prove focus lands on its connector card.
3. Enter editing with Ctrl+Shift+E and with a 500ms pointer hold.
4. Drag one free widget, cancel without a write, then drag, save, reload, and
   prove only the `layouts` authority changed.
5. Exercise one stack reorder and one dock move without touching credentials,
   connector snapshots, refresh preferences, or the legacy `layout` key.
6. Record zero unexpected requests, console errors, page errors, failed
   requests, clipping, overlap, or viewport overflow.
7. Save original-resolution screenshots and require an explicit judgment for
   each capture.

- [x] **Step 4: Run harness contract GREEN**

Run:

```powershell
node --test scripts/qa-free-baseline.test.mjs
```

Expected: all contract tests pass.

### Task 5: Review, stabilize, build, and deliver

**Files:** All packet files only.

**Interfaces:**

- Consumes: Tasks 1 through 4.
- Produces: One reviewed and pushed free-baseline packet.

- [x] **Step 1: Perform one bounded packet review**

Inspect the complete diff. Only Critical or Important findings block. Apply at
most one focused fix and rereview cycle.

- [x] **Step 2: Run the single stabilized gate**

Run:

```powershell
npm test
npx tsc --noEmit
node --test scripts/qa-free-baseline.test.mjs
git diff --check
```

Observed after the touch-release correction: 222 files / 3,520 tests, TypeScript,
the 6-test QA contract, and diff hygiene passed. The existing ProgressRail React
`act()` warning remains unchanged test noise.

- [x] **Step 3: Commit reviewed code and build exact provenance**

Stage only intended packet files and commit. With tracked inputs clean, run:

```powershell
npm run build
npm run qa:free-baseline -- --exact
```

Expected: the production artifact identifies the exact reviewed commit and the
Chromium witness passes against that artifact.

- [x] **Step 4: Inspect every screenshot at original resolution**

Reject any capture with clipped controls, unexpected scrolling, overlapping
content, ambiguous drag state, or touch geometry failure. Record the verdicts
in `TAB-TWO-FREE-BASELINE-QA.md`.

- [x] **Step 5: Push and prove repository boundaries**

Push `feat/aurora-2-observatory`, prove HEAD equals upstream and remote, confirm
the protected original is clean, and confirm only the two protected untracked
paths remain in the active worktree. Do not merge or perform any Store action.
