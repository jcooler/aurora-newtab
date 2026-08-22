# Aurora Browser-Native Widgets Implementation Plan

> **For the implementing agent:** Execute this plan task by task with strict
> focused RED to GREEN evidence. Do not combine later addition waves into this
> packet. Request one bounded review after Task 7 and apply at most one fix and
> rereview cycle.

**Goal:** Add Reading List, Recently Closed, Downloads, and Tab Groups as four
polished, permission-scoped Aurora widgets without storing browser-owned
content or adding broad tab/history access.

**Architecture:** Additive schema v16 toggles and preview/production manifest
splits establish permission and persistence truth. A shared generation-safe
resource hook owns refresh lifecycle while four thin Chrome API adapters own
their exact browser calls and pure normalization. Four content-tight widgets
consume those resources once per identity and integrate through the existing
registry, named-layout tiers, dock, stack, Settings, privacy, and QA systems.

**Tech stack:** React 19, TypeScript, Chrome MV3 APIs, Vitest, Testing Library,
Vite/CRXJS, Playwright/Chromium, Node test runner.

**Design authority:**
`docs/superpowers/specs/2026-08-22-aurora-browser-native-widgets-design.md`

## Global constraints

- Production permissions are optional and requested only from each Settings
  switch gesture. Preview moves the same four permissions install-time.
- No `tabs`, `history`, `downloads.open`, host origin, network request, browser
  snapshot storage, or new dependency.
- Each identity has one resource owner. Docked and free are mutually exclusive;
  stacks mount each identity once.
- Browser results stay in memory and out of backup, logs, and evidence JSON.
- All placement remains user-owned. New static defaults do not move existing
  layouts, and no runtime reflow is introduced.
- Store mutations and the protected checkout remain forbidden.

## Task 1: Schema, manifest, and privacy foundation

**Files:**

- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/migrations.test.ts`
- Modify: `src/lib/storage/widgetToggleVersions.ts`
- Modify: `src/lib/storage/widgetToggleVersions.test.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/manifest.ts`
- Modify: `src/privacy/dataFlows.ts`
- Modify: `src/privacy/dataFlows.test.ts`

- [x] **Step 1: Write schema and migration failures**

Add failing assertions that `CURRENT_VERSION` is 16, migration step 15 backfills
exactly the four false toggles into old nested settings while preserving
unknown keys and all prior fields, widget introduction metadata records 16,
and a v15 backup remains importable after migration.

- [x] **Step 2: Observe storage RED**

Run:

```powershell
npx vitest run src/lib/storage/migrations.test.ts src/lib/storage/widgetToggleVersions.test.ts src/lib/backup.test.ts
```

Expected: FAIL on the missing v16 keys and migration.

- [x] **Step 3: Implement additive schema v16**

Add `readingList`, `recentlyClosed`, `downloads`, and `tabGroups` to
`WidgetToggles`, default all four to false, and add migration 15. The migration
must merge defaults only into an already-valid settings/widget map so malformed
older documents still reach strict rejection instead of being laundered into a
valid shape. Move `METADATA_ONLY_FLOOR` for the non-identity step and update
exact validators/fixtures without weakening them.

- [x] **Step 4: Reach storage GREEN**

Run the focused storage command from Step 2 and `npx tsc --noEmit`.

- [x] **Step 5: Write manifest and privacy failures**

Pin production optional permissions to bookmarks plus the four new names,
preview install-time permissions to bookmarks plus the four new names, and the
absence of `tabs`, `history`, `downloads.open`, and new origins. Pin four
browser-mediated privacy entries and the official warning copy.

- [x] **Step 6: Observe manifest/privacy RED**

Run:

```powershell
npx vitest run src/privacy/dataFlows.test.ts
```

Expected: FAIL because the manifest and inventory do not yet declare Program F.

- [x] **Step 7: Implement the permission split and inventory**

Generalize the Bookmarks preview split without duplicating a permission between
`permissions` and `optional_permissions`. Add the four exact browser-data flow
entries. Do not add an origin or product request.

- [x] **Step 8: Commit the foundation slice**

Run focused GREEN, TypeScript, and `git diff --check`, then commit:

```text
feat(browser): add native-widget permission foundation
```

## Task 2: Chrome boundaries and generation-safe resource ownership

**Files:**

- Create: `src/services/browserNative/boundary.ts`
- Create: `src/services/browserNative/boundary.test.ts`
- Create: `src/services/browserNative/readingList.ts`
- Create: `src/services/browserNative/readingList.test.ts`
- Create: `src/services/browserNative/recentlyClosed.ts`
- Create: `src/services/browserNative/recentlyClosed.test.ts`
- Create: `src/services/browserNative/downloads.ts`
- Create: `src/services/browserNative/downloads.test.ts`
- Create: `src/services/browserNative/tabGroups.ts`
- Create: `src/services/browserNative/tabGroups.test.ts`
- Create: `src/lib/hooks/useBrowserResource.ts`
- Create: `src/lib/hooks/useBrowserResource.test.tsx`
- Modify: `src/services/permissions.ts`
- Modify: `src/services/permissions.test.ts`

- [x] **Step 1: Write pure adapter failures**

Pin deterministic sorting, title/host/filename fallbacks, stable window
ordinals, state grouping, progress truth, 25-item limits, exact Chrome query
arguments, and action allowlists. Assert no adapter exposes `acceptDanger`,
`open`, `removeFile`, `erase`, tab-content query, or network behavior.

- [x] **Step 2: Observe adapter RED**

Run the five new service test files. Expected: FAIL because the adapters are
missing.

- [x] **Step 3: Implement the boundaries and adapters**

Create a preview-only injectable boundary that production constant-folds to
`chrome.readingList`, `chrome.sessions`, `chrome.downloads`,
`chrome.tabGroups`, and `chrome.windows`. Keep normalization pure and API calls
thin. Add named permission helpers or an exact identity-to-permission map on
top of the existing no-pre-await `ensurePermission` path.

- [x] **Step 4: Write resource-lifecycle failures**

Cover absent permission, one in-flight load per identity, stale completion
suppression, event refresh, visible-document refresh, in-memory stale data on
error, bounded retry, permission revocation, listener cleanup, and zero storage
writes.

- [x] **Step 5: Observe resource RED and implement**

Run `src/lib/hooks/useBrowserResource.test.tsx`, observe failure, implement the
shared hook, and rerun the focused service/hook family to GREEN.

- [x] **Step 6: Commit the runtime foundation**

Run TypeScript and diff hygiene, then commit:

```text
feat(browser): add native resource boundaries
```

## Task 3: Reading List widget

**Files:**

- Create: `src/newtab/widgets/browser/BrowserWidgetShell.tsx`
- Create: `src/newtab/widgets/browser/BrowserWidgetShell.test.tsx`
- Create: `src/newtab/widgets/readingList/ReadingListWidget.tsx`
- Create: `src/newtab/widgets/readingList/ReadingListWidget.test.tsx`
- Modify: `src/newtab/index.css`

- [x] **Step 1: Write tier and interaction failures**

Cover permission-required, loading, empty, stale/error, Compact, Standard,
Full, and Docked. Pin title/host/age rows, dock click parity, Open, Mark read,
Mark unread, two-step Remove, focus restoration, keyboard operation, and no
blank shell.

- [x] **Step 2: Observe Reading List RED**

Run the two new widget test files. Expected: FAIL because the shared shell and
widget are missing.

- [x] **Step 3: Implement the shared browser shell and Reading List**

Use existing Aurora tokens, dialog stack, anchor clamp, soft/full hover law,
and a narrow unread rail. No Add current page affordance. Every mutation
refreshes from Chrome before announcing success.

- [x] **Step 4: Reach Reading List GREEN and commit**

Run focused tests, TypeScript, and diff hygiene, then commit:

```text
feat(browser): add Reading List widget
```

## Task 4: Recently Closed widget

**Files:**

- Create: `src/newtab/widgets/recentlyClosed/RecentlyClosedWidget.tsx`
- Create: `src/newtab/widgets/recentlyClosed/RecentlyClosedWidget.test.tsx`
- Modify: `src/newtab/index.css`

- [ ] **Step 1: Write Recently Closed failures**

Pin tab/window labels, missing-field fallbacks, 5-row Standard, 25-entry Full,
Docked detail parity, explicit restore by selected session ID, empty/error
truth, and one action per click.

- [ ] **Step 2: Observe RED, implement, and reach GREEN**

Run the new widget test, implement against the shared shell/resource, rerun it
with TypeScript and diff hygiene.

- [ ] **Step 3: Commit**

```text
feat(browser): add Recently Closed widget
```

## Task 5: Downloads widget

**Files:**

- Create: `src/newtab/widgets/downloads/DownloadsWidget.tsx`
- Create: `src/newtab/widgets/downloads/DownloadsWidget.test.tsx`
- Modify: `src/newtab/index.css`

- [ ] **Step 1: Write Downloads failures**

Pin real progress values, unknown-total text, active/completed/interrupted/
dangerous states, tier row caps, Docked detail parity, Pause, Resume, two-step
Cancel, Show in folder, action-failure announcements, and the structural
absence of Open/Accept/Delete/Erase actions.

- [ ] **Step 2: Observe RED, implement, and reach GREEN**

Run the new widget test, implement the actual progress-track visual signature,
then rerun focused tests with TypeScript and diff hygiene.

- [ ] **Step 3: Commit**

```text
feat(browser): add Downloads widget
```

## Task 6: Tab Groups widget

**Files:**

- Create: `src/newtab/widgets/tabGroups/TabGroupsWidget.tsx`
- Create: `src/newtab/widgets/tabGroups/TabGroupsWidget.test.tsx`
- Modify: `src/newtab/index.css`

- [ ] **Step 1: Write Tab Groups failures**

Pin title/color/collapsed/shared/window metadata, untitled fallbacks, stable
window ordinals, tier row caps, Docked detail parity, exact Focus and
Expand/Collapse calls, and zero calls to `chrome.tabs`.

- [ ] **Step 2: Observe RED, implement, and reach GREEN**

Run the new widget test, implement a narrow real-color tab spine with quiet
surfaces, then rerun focused tests with TypeScript and diff hygiene.

- [ ] **Step 3: Commit**

```text
feat(browser): add Tab Groups widget
```

## Task 7: Product integration and Settings permissions

**Files:**

- Modify: `src/lib/layout/types.ts`
- Modify: `src/lib/layout/defaultPlacements.ts`
- Modify: `src/lib/layout/defaultPlacements.test.ts`
- Modify: `src/newtab/widgetSizeContracts.ts`
- Modify: `src/newtab/widgetSizeContracts.test.ts`
- Modify: `src/newtab/widgetRegistry.ts`
- Modify: `src/newtab/widgetRegistry.test.ts`
- Modify: `src/newtab/widgetRenderers.tsx`
- Modify: `src/newtab/expansionWidgetContracts.test.ts`
- Modify: `src/settings/sections/Widgets.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: affected layout, backup, and fixture exact-set tests

- [ ] **Step 1: Write exact integration failures**

Pin all four identities across BlockId, contracts, registry, renderer, toggle,
default placement, enabled-id, dock support, and expansion parity. Pin distinct
static default points and no movement of existing points.

- [ ] **Step 2: Observe integration RED**

Run the exact registry/contract/default-placement families. Expected: FAIL on
the missing identities.

- [ ] **Step 3: Integrate all four identities**

Declare Compact, Standard, Full, and Docked for each. Add static default points
in the Pulse side of the canvas without changing old literals. Thread existing
renderer props only; do not add another App owner.

- [ ] **Step 4: Write Settings permission failures**

For every new switch, assert request is the first async boundary, grant enables
only that widget, denial/rejection keeps it off with feature-specific copy,
turning off makes no request, and no other permission is requested.

- [ ] **Step 5: Observe Settings RED and implement**

Add a Browser Settings group and a data-driven exact permission map. Keep the
existing Bookmarks behavior unchanged. Rerun Settings and integration families
to GREEN.

- [ ] **Step 6: Commit integration**

Run TypeScript and diff hygiene, then commit:

```text
feat(browser): integrate native widgets
```

## Task 8: Chromium evidence, review, and checkpoint

**Files:**

- Create: `scripts/preview-browser-native.mjs`
- Create: `scripts/preview-browser-native.test.mjs`
- Create: `scripts/browser-native-output-safety.test.mjs`
- Create: `docs/superpowers/reports/BROWSER-NATIVE-WIDGETS-QA.md`
- Modify: `.gitignore`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: this plan

- [ ] **Step 1: Write harness and output-safety failures**

Pin a required explicit `.qa-browser-native-*` direct-child output, rejection of
source/canonical/protected/non-empty/link targets, deterministic preview
adapters installed before React, exact API call logs, no browser-data storage,
and every required scenario.

- [ ] **Step 2: Observe harness RED and implement**

Build a preview harness that captures all four tiers plus permission-required,
empty, error, dock-detail, edit, and action states. Include 1600x900 and exact
1408x445. Fail on console/page errors, failed requests, external requests,
degenerate geometry, unpainted content, inaccessible actions, forbidden API
calls, or any browser-result storage write.

- [ ] **Step 3: Build and inspect the exact implementation**

Run `npm run build:preview`, execute the focused harness, and inspect every
original PNG. Record per-capture usefulness judgments rather than one aggregate
PASS.

- [ ] **Step 4: Request one bounded implementation review**

Review the packet range against the design, with special attention to native
permission gesture timing, browser-content leakage, action safety, stale
generation handling, all tiers, exact 1408x445 usefulness, frozen boundaries,
and protected/Store proof.

- [ ] **Step 5: Apply at most one fix and rereview cycle**

Write focused failing regressions for confirmed Critical or Important findings,
apply one bounded fix commit, and return to the same reviewer once. Ledger Minor
findings rather than churning.

- [ ] **Step 6: Run one stabilized final gate**

```powershell
npm test
npx tsc --noEmit
npm run test:information-first-contract
npm run test:expansion-contract
node --test scripts/preview-browser-native.test.mjs scripts/browser-native-output-safety.test.mjs
npm run build:preview
git diff --check
```

Do not repeat the full suite after a test-only timing correction; run the exact
causal family and record it.

- [ ] **Step 7: Update ledgers, checkpoint, push, and prove repositories**

Record A2-D067, exact commits/range, RED/GREEN evidence, review verdict,
capture counts, manual ceilings, active/upstream equality, protected exact HEAD,
and the continuing Work wave. Commit:

```text
docs: checkpoint Aurora browser-native widgets
```

Push `feat/aurora-2-observatory`, prove both repositories clean, then proceed
directly to the Program F Work wave without a routine continuation prompt.
