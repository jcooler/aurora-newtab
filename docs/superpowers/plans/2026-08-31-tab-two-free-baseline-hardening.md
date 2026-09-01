# Tab Two Free Baseline Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the obsolete global premium gate from every capability that the approved freemium model keeps free, without changing visible behavior, storage, permissions, requests, layouts, or connector authority.

**Architecture:** Existing Connectors, named layouts, live editing, layout switching, keyboard edit entry, long-press entry, and widget-to-connector Settings routing become unconditional free-product paths. No replacement entitlement abstraction is added in this packet. Later paid capabilities will use capability-specific signed grants rather than a global boolean.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Playwright Chromium, Chrome MV3, Vite exact production builds.

**Spec:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`

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

- Create: `src/lib/freeBaseline.test.ts`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/arrange/useLongPress.test.tsx`

**Interfaces:**

- Consumes: Existing Settings and edit-entry behavior.
- Produces: An executable invariant that existing free surfaces never import or call a global premium gate.

- [ ] **Step 1: Add the failing source-boundary test**

Create `src/lib/freeBaseline.test.ts` with the exact current free surfaces:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const FREE_SURFACES = [
  'src/settings/SettingsPanel.tsx',
  'src/settings/sections/Layout.tsx',
  'src/newtab/App.tsx',
  'src/newtab/arrange/useLongPress.ts',
  'src/newtab/edit/useEditMode.ts',
] as const

describe('approved free baseline', () => {
  it.each(FREE_SURFACES)('%s has no global premium gate', (path) => {
    const source = readFileSync(resolve(path), 'utf8')
    expect(source).not.toMatch(/isPremium|lib\/premium/)
  })
})
```

- [ ] **Step 2: Run RED**

Run:

```powershell
npx vitest run src/lib/freeBaseline.test.ts
```

Expected: five failures identifying the current `isPremium` imports or calls.

- [ ] **Step 3: Rewrite stale behavior expectations before implementation**

In `SettingsPanel.test.tsx`, replace the false-premium tests with assertions
that the five tabs always remain `General`, `Progress`, `Widgets`, `Connectors`,
and `Data`, the Layout region remains present, and the Connectors gallery remains
reachable. In `useLongPress.test.tsx`, remove the mocked-entitlement setup and
replace the false-premium case with an ordinary 500ms engagement assertion.

- [ ] **Step 4: Confirm the focused tests remain RED only at the source boundary**

Run:

```powershell
npx vitest run src/lib/freeBaseline.test.ts src/settings/SettingsPanel.test.tsx src/newtab/arrange/useLongPress.test.tsx
```

Expected: behavior assertions pass; `freeBaseline.test.ts` still fails until
the production gates are removed.

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

- [ ] **Step 1: Make Settings unconditional**

Replace `tabsFor(premium)` with a constant five-tab list. Remove the connector
fallback in `focusSettingsTarget`, render Connectors whenever its tab is active,
and remove all `isPremium` imports and variables. Do not rename tab ids or move
sections.

- [ ] **Step 2: Make layout recovery and editing unconditional**

Remove the gate and stale premium commentary from `Layout.tsx`. In
`useEditMode.ts`, retain only `if (!resolved) return`. In `useLongPress.ts`,
remove the early return while preserving every pointer, tolerance, cancellation,
and click-suppression path.

- [ ] **Step 3: Make App routing and entry unconditional**

In `App.tsx`, always route connector-backed widgets to Connectors, allow the
Ctrl/Cmd+Shift+E entry to reach the existing live-session guards, and render the
Layout badge whenever `!session && layoutsDocument`. Do not alter edit-session,
storage-write, stack, dock, or focus-restoration logic.

- [ ] **Step 4: Delete the dead module and run GREEN**

Delete `src/lib/premium.ts`, then run:

```powershell
npx vitest run src/lib/freeBaseline.test.ts src/settings/SettingsPanel.test.tsx src/settings/Tabs.test.tsx src/newtab/arrange/useLongPress.test.tsx src/newtab/edit/useEditMode.test.tsx src/newtab/App.test.tsx
```

Expected: all selected files pass, and `rg -n "isPremium|lib/premium" src`
returns no code reference.

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

- [ ] **Step 1: Remove stale test vocabulary**

Rename the generic `Tabs.test.tsx` varying-count test so it describes bounded
three- and four-item tab rows without calling either set free or premium. Remove
all obsolete premium mocks, resets, imports, and comments from affected tests.

- [ ] **Step 2: Reconcile active ledgers**

Record that the free-baseline packet removed only obsolete gates and changed no
runtime authority. Keep paid architecture in owner-approved design status and
do not claim account, entitlement, or owner-grant implementation.

- [ ] **Step 3: Run focused GREEN and TypeScript**

Run:

```powershell
npx vitest run src/lib/freeBaseline.test.ts src/settings/SettingsPanel.test.tsx src/settings/Tabs.test.tsx src/newtab/arrange/useLongPress.test.tsx src/newtab/edit/useEditMode.test.tsx src/newtab/App.test.tsx
npx tsc --noEmit
git diff --check
```

Expected: every command exits 0, apart from existing line-ending notices from
`git diff --check` if present.

### Task 4: Add exact real-extension proof

**Files:**

- Create: `scripts/qa-free-baseline.mjs`
- Create: `scripts/qa-free-baseline.test.mjs`
- Modify: `package.json`
- Create: `docs/superpowers/reports/TAB-TWO-FREE-BASELINE-QA.md`

**Interfaces:**

- Consumes: Exact production build at the reviewed commit.
- Produces: Original-resolution desktop/touch evidence and storage/request/runtime ledgers.

- [ ] **Step 1: Write the failing harness contract**

Pin that `qa-free-baseline.mjs` requires `--exact`, records the commit and build
provenance, uses the installed extension rather than a page mock, audits storage
and requests, captures 1600x900 and touch-enabled 375x812 screenshots, and fails
on any unjudged capture.

- [ ] **Step 2: Run RED**

Run:

```powershell
node --test scripts/qa-free-baseline.test.mjs
```

Expected: failure because the harness and required contract markers do not exist.

- [ ] **Step 3: Implement the bounded witness**

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

- [ ] **Step 4: Run harness contract GREEN**

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

- [ ] **Step 1: Perform one bounded packet review**

Inspect the complete diff. Only Critical or Important findings block. Apply at
most one focused fix and rereview cycle.

- [ ] **Step 2: Run the single stabilized gate**

Run:

```powershell
npm test
npx tsc --noEmit
node --test scripts/qa-free-baseline.test.mjs
git diff --check
```

Expected: all tests and TypeScript pass; diff hygiene has no new error.

- [ ] **Step 3: Commit reviewed code and build exact provenance**

Stage only intended packet files and commit. With tracked inputs clean, run:

```powershell
npm run build
npm run qa:free-baseline -- --exact
```

Expected: the production artifact identifies the exact reviewed commit and the
Chromium witness passes against that artifact.

- [ ] **Step 4: Inspect every screenshot at original resolution**

Reject any capture with clipped controls, unexpected scrolling, overlapping
content, ambiguous drag state, or touch geometry failure. Record the verdicts
in `TAB-TWO-FREE-BASELINE-QA.md`.

- [ ] **Step 5: Push and prove repository boundaries**

Push `feat/aurora-2-observatory`, prove HEAD equals upstream and remote, confirm
the protected original is clean, and confirm only the two protected untracked
paths remain in the active worktree. Do not merge or perform any Store action.
