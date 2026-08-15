# W2-P2 Focus, Naming, Boundary, and Error Recovery Implementation Plan

> **For Codex:** Execute this plan with `superpowers:subagent-driven-development`, one task at a time. Use `superpowers:test-driven-development` for every behavior change, `superpowers:requesting-code-review` after each task and for the whole packet, and `superpowers:verification-before-completion` before any completion claim or checkpoint.

**Goal:** Make Aurora's existing editors, multi-source calendar, Home Assistant picker, Settings error boundary, and backup/Quick Link recovery surfaces keyboard-stable and programmatically understandable without changing Wave 1 data authorities or entering W2-P3 reflow.

**Architecture:** Preserve the existing dialog stack, focus trap, storage authority, backup/permission transaction, Quick Link trust policy, connector snapshot ownership, Calendar selection/fetching, and Home Assistant network/action contracts. Add only caller-owned focus handoffs, semantic names/relationships, a reopen reset signal for the existing boundary, and W2-P1's shared render-only `PoliteStatus`/`AssertiveAlert` feedback. Browser evidence uses real built-extension components and deterministic Playwright routing; no production harness API or async owner is added.

**Tech Stack:** React 19, TypeScript, Vitest/jsdom, Tailwind CSS 4, Vite, Manifest V3, Playwright/Chromium, Chrome DevTools Protocol accessibility tree.

**Plan base:** `e1732f75593214c59efe313f2bb973d9b444ef7d` (`docs: checkpoint W2-P1`), equal to `origin/feat/aurora-2-observatory` with a clean target and protected original checkout.

---

## Global Constraints

- Execute only W2-P2. W2-P3 retains 320 CSS px/400% zoom reflow, responsive dialog/popover sizing, Settings widths, and narrow-layout clipping. Do not start Adaptive Stage, Layout V2, BoardItem/registry, Utility Tray redesign, variants, release packaging, or Store work.
- Preserve Aurora V1. `D:\DEV\Chrome plugin` must remain clean on `main` at `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Never edit, build into, package from, or push from that protected checkout.
- Preserve W1/W2-P1 authorities. Do not change `normalizeQuickLinkUrl`, backup preparation/restore algorithms, permission lifecycle/storage locks, Home Assistant fetch/action services, connector snapshot identity/generation/TTL, Calendar event selection/fetching, or Notes/Weather/Home Assistant operation ownership.
- Reuse `PoliteStatus` and `AssertiveAlert` as render-only components. Literal caller copy remains bounded; raw caught/provider/storage errors never render.
- Healthy state is quiet. Keep a stable polite atomic status node where transition announcements must be heard; render exactly one atomic alert for the current recoverable failure.
- Every interactive control touched by this packet must expose a measured target of at least 36 by 36 CSS px without relying on a child glyph/input's intrinsic box. Add numeric jsdom style/class coverage plus real-browser `getBoundingClientRect()` predicates for Focus completion/Edit/editor controls, Quick Link editor controls, Calendar Join, HA search/check labels/Cancel/Save, and Data export/import/confirm/cancel controls. Apply bounded local `min-h-9`/`min-w-9` or equivalent target wrappers; do not change shared global sizing tokens or use target fixes to claim W2-P3 reflow acceptance.
- A visually unchanged semantic fix still needs programmatic proof. Chromium AX evidence supports structure but is not a real screen-reader session.
- The browser harness must retain exactly three SKIPs and the same manual ceilings: live Home Assistant picker contents/successful action against the user's instance, native NASA Block, and native NASA Allow. Because W2-P2 adds a deterministic routed `/api/states` fixture for structural picker evidence, update the Home Assistant SKIP's explanatory copy truthfully: real component semantics are now route-backed in Chromium, while live user-instance contents/action success remain unproved. Do not remove the SKIP, reduce its live ceiling, or keep the old now-false claim that picker behavior is unit-only and network fixtures are forbidden.
- Preflight before every task: fetch, prove target branch/HEAD/upstream provenance, clean target, and clean protected original; reread this plan plus current `STATUS.md`, `ROADMAP.md`, and `DECISIONS.md`.
- After every task: independent read-only task review, one bounded fix wave for confirmed findings, focused tests, `git diff --check`, implementation commit, and clean-state proof. Do not combine task reviews or commits.
- After the packet review/fix and complete verification, update durable ledgers in a dedicated `docs: checkpoint W2-P2`, push, prove equality/cleanliness, and immediately begin W2-P3 under A2-D019.

## Frozen Acceptance Contract

1. **Focus editor:** keyboard activation of Edit moves focus into the editor; Escape cancels without writing and restores Edit focus; Enter commits once and restores focus; prompt blur can commit; empty submission cannot poison later edits; a parent rerender does not discard the active draft.
2. **Quick Link editor:** invalid/malformed/unsafe input remains focused, gains `aria-invalid`, and is described by exactly one atomic alert; correction clears the invalid state; Escape/Cancel close without a write and restore Add quick link focus; Enter still uses the unchanged W1-P9 policy.
3. **Calendar source identity:** when multiple calendars are configured, headline, agenda rows, duplicate same-summary events, and an eligible Join control expose the configured calendar name programmatically while visible copy, dot colors, geometry, selection, and fetch behavior stay unchanged. A trimmed non-empty configured name wins; otherwise a non-negative integer source index maps to the exact safe fallback `Calendar N` (one-based), and any other invalid value maps to `Calendar`. Capability URLs are never a fallback. Single-calendar copy remains quiet.
4. **Home Assistant picker:** the dialog is named by a real visible heading; each domain owns a real heading and named group; Show/Action checkboxes have programmatic relationships to the full visible entity label/ID and their column purpose; search focus, caps, fuzzy order, reseeding, save fallbacks, picker-only bulk access, Cancel/Escape/backdrop/Save closure, and trigger restoration remain intact.
5. **DrawerBoundary:** a caught Settings crash remains isolated and announced; closing then reopening retries the child after the cause is repaired. Healthy close/reopen preserves the existing Settings instance/tab behavior rather than remounting it on every close.
6. **Backup feedback:** export pending/success, restore pending/success, and safe errors use one stable polite atomic status plus one atomic alert; active controls remain rendered, disabled/busy, and associated with current feedback while pending. Exact atomic restore, rollback, cleanup, re-entry, retry, and gesture timing do not change.
7. **Keyboard/restoration:** Settings close button, backdrop, and Escape restore the real invoker; nested Reset and HA picker Escape remain newest-first; Focus and Quick Link editor cancellation restores their invokers.
8. **Built evidence:** one pre-authored aggregate moves from exactly one named W2-P2 FAIL against the plan base to exactly one named W2-P2 PASS after real production behavior changes. Final complete harness total is exactly 453 PASS / 0 FAIL / 3 SKIP.

## Preflight Conflict Map

| File/subsystem | Planned owner | Boundary |
|---|---|---|
| `scripts/preview.mjs` | Task 1 authors the complete immutable W2-P2 aggregate, captures, and AX checks; Task 4 runs it | Later tasks do not rewrite predicates to manufacture GREEN |
| Focus and Quick Link editors | Task 1 | No Calendar, Settings, backup, or layout changes |
| Calendar and HA picker semantics | Task 2 | No connector services, snapshots, permissions, or responsive styling |
| DrawerBoundary/App/Data feedback | Task 3 | No backup algorithms, storage/permission ownership, or Settings reflow |
| Evidence/review/ledgers | Task 4 | No unreviewed production behavior; confirmed review fixes get their own bounded commit |

### Task 0: Independently review and commit the executable plan

**Files:**
- Create: `docs/superpowers/plans/2026-08-15-w2-p2-focus-naming-boundary-error-recovery.md`

**Step 1: Run a read-only independent plan review**

Review against the complete master specification, W2-P2/W2-P3 boundary, A2-D005/A2-D013/A2-D014/A2-D017/A2-D018/A2-D019/A2-D020, verified W2-P1 evidence, and current implementations/tests for Focus, Links, Calendar, `EntityPickerDialog`, `DrawerBoundary`, `Drawer`, App, Data, dialog stack/focus trap, Settings, and `scripts/preview.mjs`.

Require Critical/Important/Minor findings with exact plan/code references. Inspect specifically:

1. whether every accepted W2-P2 seam has a non-tautological RED witness;
2. keyboard/Escape/focus restoration ordering, blur/submit double-fire, stale refs, portaled dialog focus, Strict Mode, and unmount behavior;
3. semantic naming without leaking calendar capability URLs, HA credentials, raw errors, or hidden test markers;
4. Drawer recovery without remounting healthy Settings on each close;
5. preservation of backup/permission/storage/request/generation authorities and the W2-P3 boundary;
6. one immutable browser aggregate, deterministic real-component fixtures, exact captures, AX evidence, full verification, manual ceilings, checkpoint/push, and automatic W2-P3 continuation.

**Step 2: Fix all confirmed plan findings and rerun a fresh scoped review**

Do not accept a `Ready` verdict that depends on invented production bridges, browser-only assertions that unit tests cannot reproduce, or moving responsive work into this packet.

**Step 3: Commit the reviewed plan**

```powershell
git add docs/superpowers/plans/2026-08-15-w2-p2-focus-naming-boundary-error-recovery.md
git diff --cached --check
git commit -m "docs: plan W2-P2 recovery semantics"
```

Expected: one plan-only commit, clean worktree, W2-P2 still Not started in the durable roadmap until implementation begins.

### Task 1: Stabilize Focus and Quick Link keyboard editors

**Files:**
- Modify: `src/newtab/components/FocusLine.tsx`
- Modify: `src/newtab/components/FocusLine.test.tsx`
- Modify: `src/newtab/widgets/links/LinksWidget.tsx`
- Create: `src/newtab/widgets/links/LinksWidget.test.tsx`
- Modify: `scripts/preview.mjs`

**Step 1: Pre-author the complete built-extension aggregate and prove packet RED**

At existing deterministic Focus, Calendar, Settings/Data, Home Assistant, and Quick Link seams, add exactly one final result named:

```text
PASS: W2-P2 focus, naming, boundary, and recovery semantics
FAIL: W2-P2 focus, naming, boundary, and recovery semantics
```

The single aggregate must inspect real built-extension DOM/interaction and require all of these before PASS:

- Focus keyboard Edit → focused editor, preserved draft over an unrelated storage rerender, Escape cancel/no write/Edit focus, then keyboard Enter exact commit/focus restoration;
- invalid Quick Link keyboard submit → one described atomic alert with focused invalid input, then Escape/no write/Add quick link focus;
- two identical Calendar events from differently named configured sources have distinct source-bearing AX text while visible strings remain identical;
- a deterministically routed Home Assistant `/api/states` fixture opens the real picker and exposes a heading-named dialog, real domain headings/named groups, related Show/Action/entity-ID semantics, newest-first Escape, and trigger focus restoration; do not use or claim a live user instance;
- Data Export through the real control produces a real download plus a polite success announcement; invalid import produces an associated atomic alert; normal Settings Escape/reopen restores the gear and remains operable.

For every touched interactive surface reached by the aggregate, measure the actual target rectangle and require both width and height to be at least 36 CSS px. The predicate must include Focus completion/Edit/input, Quick Link Add/Cancel/inputs, Calendar Join when present, HA search/Show/Action/Cancel/Save, and Data Export/import/Confirm/Cancel. Do not infer target size from class names or screenshots.

Author the six exact captures and AX queries now; they may be emitted only after the relevant state is genuinely reached:

- `screenshots/w2-p2-focus-link-800x600.png`
- `screenshots/w2-p2-calendar-sources-1600x900.png`
- `screenshots/w2-p2-calendar-sources-2560x1440.png`
- `screenshots/w2-p2-ha-picker-800x600.png`
- `screenshots/w2-p2-ha-picker-1600x1100.png`
- `screenshots/w2-p2-data-feedback-2560x1440.png`

Build preview and run the foreground harness once. Baseline is 452 / 0 / 3. Expected plan-base witness: exactly 452 PASS / 1 FAIL / 3 SKIP, with exactly one named W2-P2 FAIL and zero named W2-P2 PASS. Older results must retain baseline totals. Record any unrelated legacy flake separately and rerun unchanged; never weaken the aggregate.

**Step 2: Add failing Focus component tests**

Add interaction tests that prove:

- activating Edit focuses and selects or positions the existing text editor;
- an unrelated parent/storage rerender leaves the current draft and focus intact;
- Escape cancels without a storage write and restores focus to Edit;
- Enter commits exactly once and restores focus to Edit;
- initial prompt blur commits a trimmed non-empty focus;
- empty submit does not leave the guard poisoned for a later blur/edit;
- local-day rollover continues to expire prior-day display without assigning an old draft to the new day.
- every touched Focus checkbox/Edit/editor target has a local measurable 36px floor without changing centered-column layout ownership.

Run:

```powershell
npx vitest run src/newtab/components/FocusLine.test.tsx
```

Expected: RED for focus handoff, Escape/restoration, and prompt blur/guard behavior.

**Step 3: Implement Focus editor ownership without changing storage authority**

Use component refs/state and explicit editor-session flags only. Preserve `useStoredKey('focus')`, `useLocalDay`, `currentFocus`, and `setFocusText`. One commit path owns Enter/blur, cancellation cannot fall through into blur-save, explicit commit/cancel restores the real Edit invoker after it remounts, and an external rerender cannot replace the active draft. Give the real checkbox label, Edit button, and editor a bounded local 36px target without moving centered-column layout authority. Do not add a second persistence queue or claim save failure recovery in this packet.

**Step 4: Add failing Quick Link component tests**

Mount the real `LinksWidget` with memory storage. Prove:

- unsafe/malformed submit performs no write, keeps URL focus, sets `aria-invalid="true"`, and connects the input to exactly one atomic alert containing `Enter a valid address.`;
- correcting the value clears invalid/alert semantics and keyboard submit still persists the W1-P9-normalized HTTP(S) URL;
- Escape and Cancel perform no write, close the form, and restore focus to Add quick link;
- no success/error string includes the rejected URL.
- Add, form inputs, submit, and Cancel each expose a local measurable 36px target floor.

Run:

```powershell
npx vitest run src/newtab/widgets/links/LinksWidget.test.tsx src/newtab/widgets/links/linksLogic.test.ts src/lib/quickLinkUrl.test.ts
```

Expected: RED because the current error is a plain paragraph and editor restoration is absent.

**Step 5: Implement Quick Link announcement and restoration**

Reuse `AssertiveAlert`; keep one stable error ID, set `aria-invalid`/`aria-describedby` only while invalid, and keep the invalid URL input focused. Add a single editor-close path for successful Add, Cancel, and Escape that restores the Add quick link button only when that editor action owned focus. Give both inputs and the Add/Cancel controls local 36px targets without changing wrapping/breakpoints. Do not change URL normalization, safe stored-link rendering, drag/reorder, or storage API semantics.

**Step 6: Verify and review Task 1**

```powershell
npx vitest run src/newtab/components/FocusLine.test.tsx src/newtab/widgets/links/LinksWidget.test.tsx src/newtab/widgets/links/linksLogic.test.ts src/newtab/widgets/links/LinkTile.test.tsx src/lib/quickLinkUrl.test.ts
npx tsc --noEmit
git diff --check
```

Dispatch an independent task reviewer. Fix confirmed findings with new RED coverage, rerun the focused suite, and commit only Task 1 files:

```powershell
git add src/newtab/components/FocusLine.tsx src/newtab/components/FocusLine.test.tsx src/newtab/widgets/links/LinksWidget.tsx src/newtab/widgets/links/LinksWidget.test.tsx scripts/preview.mjs
git diff --cached --check
git commit -m "fix(a11y): stabilize W2-P2 editors"
```

Expected: Focus/Links focused suite GREEN; packet browser aggregate remains RED until Tasks 2 and 3 land.

### Task 2: Expose Calendar source identity and Home Assistant picker structure

**Files:**
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.test.tsx`
- Modify: `src/settings/sections/EntityPickerDialog.tsx`
- Modify: `src/settings/sections/EntityPickerDialog.test.tsx`
- Modify only if trigger-level restoration needs proof/fix: `src/settings/sections/Connectors.tsx`
- Modify only if integration coverage needs it: `src/settings/SettingsPanel.test.tsx`

**Step 1: Add failing Calendar semantic-name tests**

Use configured names `Personal` and `Work` plus same-summary/same-start duplicates. Require distinct source-bearing programmatic text for headline and every multi-calendar row without changing current visible text. When Join renders, its accessible name/description must identify the event and source rather than ambiguous `Join`, and the Join target must measure at least 36px. Single-calendar mode must not add redundant source chatter. Freeze `trim()`med non-empty configured names, exact `Calendar N` one-based fallback for non-negative integer indices with an empty/missing/out-of-range configured name, and exact `Calendar` fallback for any other invalid value; never inspect or expose a URL.

```powershell
npx vitest run src/newtab/widgets/calendar/CalendarWidget.test.tsx
```

Expected: RED because current source dots are `aria-hidden` and names are unused.

**Step 2: Implement Calendar source semantics only**

Derive the frozen safe display name from `calendars[event.cal]`; never use the URL as fallback. Add screen-reader text or stable accessible relationships that survive Chromium AX inspection and give Join a local 36px target while leaving all visible event copy, dot classes, list order, keys, caps, variants, Join visibility, selection helpers, and snapshot/fetch calls unchanged.

**Step 3: Add failing Home Assistant picker structure/restoration tests**

Require:

- one visible `h2` names the dialog through `aria-labelledby`;
- each domain is a real `h3` and labels one semantic group;
- a visible column-purpose header and the full visible entity label/ID participate in each Show/Action checkbox name/description without duplicated speech;
- count/instructions are associated where useful and secrets remain absent;
- the search box receives initial focus;
- Cancel, Escape, backdrop, and Save close through their current callbacks and restore focus to the actual external Choose entities trigger in a controlled open/close wrapper;
- search, each Show/Action checkbox label target, Cancel, and Save measure at least 36 by 36 CSS px without changing modal width/breakpoints;
- fuzzy ordering, independent caps, reseeding, and vanished-action fallbacks remain unchanged.

```powershell
npx vitest run src/settings/sections/EntityPickerDialog.test.tsx src/settings/SettingsPanel.test.tsx
```

Expected: RED for heading levels, named groups, entity-ID relationships, and full restoration proof.

**Step 4: Implement picker semantics without changing HA ownership**

Use stable `useId`-derived IDs, real headings/groups, and `aria-labelledby`/`aria-describedby` relationships. Add only local 36px target wrappers/minimums; do not edit shared global control tokens or dialog breakpoints. Preserve portal/backdrop layering, search-first DOM order, `useFocusTrap`, `useDialogEscape`, selection state, caps, fetch-first opening, `fetchAllStates`, save mapping, snapshot invalidation, and permission behavior. No preview-only component or production bridge is permitted; browser evidence routes the existing real request deterministically.

**Step 5: Verify and review Task 2**

```powershell
npx vitest run src/newtab/widgets/calendar/CalendarWidget.test.tsx src/settings/sections/EntityPickerDialog.test.tsx src/settings/SettingsPanel.test.tsx src/services/connectors/ics.test.ts src/services/connectors/homeassistant.test.ts
npx tsc --noEmit
git diff --check
```

Dispatch an independent task reviewer, fix confirmed findings with RED tests, rerun, and commit only Task 2 files:

```powershell
git add src/newtab/widgets/calendar/CalendarWidget.tsx src/newtab/widgets/calendar/CalendarWidget.test.tsx src/settings/sections/EntityPickerDialog.tsx src/settings/sections/EntityPickerDialog.test.tsx
git add src/settings/sections/Connectors.tsx src/settings/SettingsPanel.test.tsx # only if actually changed for this task
git diff --cached --check
git commit -m "fix(a11y): name W2-P2 source relationships"
```

### Task 3: Make Settings boundary and backup feedback recover honestly

**Files:**
- Modify: `src/settings/DrawerBoundary.tsx`
- Modify: `src/settings/DrawerBoundary.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/settings/sections/Data.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`

**Step 1: Add failing DrawerBoundary and App tests**

Prove a thrown child renders one alert without unmounting siblings. While still open, repairing/rerendering must not retry. Closing alone must not retry. The next closed-to-open transition retries exactly once and renders repaired children; a still-failing child returns to one fallback without a loop. Prove healthy Settings preserves its active tab and component instance across close/reopen. At App composition level, close button, backdrop, and Escape each close Settings and restore the gear; nested Reset Escape still closes newest-first and restores first to the underlying Settings control, then to the gear. Throw a secret-shaped error object/string and prove `componentDidCatch` emits only the fixed diagnostic `[aurora] settings drawer crashed` with no raw error argument, token, credential URL, payload, or backup text.

```powershell
npx vitest run src/settings/DrawerBoundary.test.tsx src/newtab/App.test.tsx
```

Expected: RED because failure is permanently latched and App's current Escape test does not establish restoration across every close path.

**Step 2: Implement reopen-scoped boundary reset**

Give `DrawerBoundary` an explicit open/reset signal and clear `failed` only on a genuine closed-to-open retry. Replace raw-object logging with the exact bounded diagnostic `[aurora] settings drawer crashed`; the boundary still logs that a failure occurred but never the caught value. Do not key/remount healthy Settings on each close or retry continuously while still open. App supplies the current Settings open state; `Drawer`, `useFocusTrap`, and dialog-stack ordering stay authoritative.

**Step 3: Add failing backup feedback tests**

Hold `storage.snapshot()` and `replaceAllWithRollback()` separately. Require:

- Export remains rendered, disabled, `aria-busy="true"`, and described by polite atomic `Creating backup…` until the real download is created; success becomes `Backup downloaded.`; rejection produces the existing bounded alert and no raw error;
- Confirm/Retry remains rendered, disabled, busy, and described by polite atomic `Restoring backup…`; success preserves exact `Backup restored...` copy; failure keeps confirmation plus reachable Retry associated with exactly one alert;
- the import input remains associated with parse/read errors; clearing/retrying does not leave stale alert/status associations;
- rapid double activation cannot start duplicate export/restore work.
- Export, file input, Confirm/Retry, and Cancel expose numeric local 36px target floors; target fixes do not alter restore gesture ordering or Settings widths.

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx src/lib/backup.test.ts src/lib/backupRestore.test.ts
```

Expected: RED for export pending/success, restore live status/associations, busy truth, and duplicate exclusion.

**Step 4: Implement shared render-only backup feedback**

Reuse `PoliteStatus` and `AssertiveAlert` with stable IDs. Add synchronous ref-backed component-local in-flight exclusion so two same-turn activations cannot start duplicate work; `restorePreparedBackup` retains the permission/storage transaction and remains invoked synchronously from the confirmation gesture. Add only local 36px target minimums, not shared Settings sizing changes. Preserve exact cleanup reporting, rollback messages, re-entry copy, Retry, file reset, download filename/content, and no-secret behavior.

**Step 5: Verify and review Task 3**

```powershell
npx vitest run src/settings/DrawerBoundary.test.tsx src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx src/lib/dialogStack.test.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts src/components/StateFeedback.test.tsx
npx tsc --noEmit
git diff --check
```

Dispatch an independent task reviewer, fix confirmed findings with RED tests, rerun, and commit only Task 3 files:

```powershell
git add src/settings/DrawerBoundary.tsx src/settings/DrawerBoundary.test.tsx src/newtab/App.tsx src/newtab/App.test.tsx src/settings/sections/Data.tsx src/settings/SettingsPanel.test.tsx
git diff --cached --check
git commit -m "fix(a11y): recover W2-P2 settings feedback"
```

Expected: the unchanged pre-authored browser aggregate is now capable of GREEN; no W2-P3 CSS/layout change exists.

### Task 4: Browser evidence, whole-packet review, verification, checkpoint, push, and continuation

**Files:**
- Verify: every W2-P2 production/test/harness file
- Update after verification: `docs/superpowers/aurora-2/ROADMAP.md`
- Update after verification: `docs/superpowers/aurora-2/STATUS.md`
- Update after verification: `docs/superpowers/aurora-2/DECISIONS.md`

**Step 1: Run the built-extension acceptance aggregate and inspect evidence**

```powershell
npm run build:preview
node scripts/preview.mjs
```

Require exactly 453 PASS / 0 FAIL / 3 SKIP, exactly one named W2-P2 PASS, and zero named W2-P2 FAIL. Reject and rerun an unchanged harness if an unrelated documented legacy timing flake occurs; never weaken the W2-P2 predicate.

Inspect all six exact captures at original resolution for visible focus, readable non-color-only feedback, stable bounded Focus/Calendar/Quick Link geometry, understandable picker headings/columns, and no clipping introduced by this packet. Separately retain the aggregate's numeric `getBoundingClientRect()` proof that every enumerated touched control is at least 36 by 36 CSS px; screenshots alone are not target-size proof. Do not claim W2-P3 narrow-reflow acceptance from these views.

Inspect Chromium FullAXTree evidence for:

- focused Focus/Quick Link editors and associated invalid alert;
- distinct configured Calendar source text and a source-specific Join name/description;
- picker dialog heading, domain headings/groups, Show/Action/entity ID relationships, and restored trigger focus;
- backup polite atomic status, atomic error, button busy/disabled/description state;
- Settings Escape/reopen semantics.

State explicitly that Chromium AX is not a real screen-reader session and deterministic HA fixture semantics are not live user-instance picker/action evidence.

**Step 2: Run a bounded independent whole-packet review**

Review the plan-base-to-implementation diff, task review reports, RED/GREEN evidence, screenshots, AX evidence, and current durable contracts. Require severity-ranked findings and inspect:

1. focus ownership, blur/submit/Escape ordering, double activation, Strict Mode, and stale/unmounted callbacks;
2. Calendar source truth with duplicate events, Join, single-calendar quietness, invalid indices, and no URL leakage;
3. picker heading/group/control relationships, search/caps/save behavior, numeric local target sizes, focus restoration, truthful routed-fixture SKIP copy, and no live-HA overclaim;
4. boundary retry only on reopen, negative no-retry transitions, bounded diagnostic logging, and healthy Settings instance preservation;
5. backup gesture timing, exact restore authority, retry/error associations, and no raw errors/secrets;
6. Quick Link policy preservation, exact single alert, numeric target sizes, and safe focus restoration;
7. harness causality, exact aggregate totals, capture truth, AX scope, W2-P3 exclusion, and V1 preservation.

**Step 3: Apply one bounded review-fix wave and obtain a clean scoped rereview**

Use a fresh implementation fixer, write RED tests before each confirmed production fix, run focused/full verification proportionate to the change, commit the fix wave separately, and ask the same reviewer to mark every prior finding Addressed/Not addressed plus any new Critical/Important issue. Do not let the controller silently patch implementation findings.

**Step 4: Run the complete fresh verification gate**

```powershell
npx vitest run src/components/StateFeedback.test.tsx src/newtab/components/FocusLine.test.tsx src/newtab/widgets/links/LinksWidget.test.tsx src/newtab/widgets/links/linksLogic.test.ts src/newtab/widgets/links/LinkTile.test.tsx src/lib/quickLinkUrl.test.ts src/newtab/widgets/calendar/CalendarWidget.test.tsx src/settings/sections/EntityPickerDialog.test.tsx src/settings/DrawerBoundary.test.tsx src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx src/lib/dialogStack.test.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts src/services/connectors/ics.test.ts src/services/connectors/homeassistant.test.ts
npx tsc --noEmit
npm test
npm run build
rg -n "__auroraStorageHarness|__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist
if ($LASTEXITCODE -ne 1) { throw "Production preview-bridge scan expected rg exit 1, got $LASTEXITCODE" }
npm audit --omit=dev
npm audit --include=dev
npm run build:preview
node scripts/preview.mjs
git diff --check
git status --short
```

Requirements: all targeted/full tests, TypeScript, production/preview builds, and audits pass; production bridge search exits 1; harness is exactly 453/0/3 with one named W2-P2 PASS; screenshots and AX evidence are personally inspected; W1/W2-P1 behavior remains unchanged; three SKIPs/manual ceilings remain; no W2-P3 behavior enters the diff.

**Step 5: Update durable ledgers and commit the packet checkpoint**

Mark W2-P2 Verified with exact plan/implementation/review/test/build/harness/visual/AX/manual-ceiling evidence. Leave W2-P3 Not started with no plan. Append A2-D021 recording that focus restoration is invoker-owned, ambiguous repeated data is programmatically source-named, error boundaries retry only on reopen, and transition feedback uses the shared render-only semantics without moving async authority.

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git diff --cached --check
git commit -m "docs: checkpoint W2-P2"
```

**Step 6: Push, prove clean equality, and immediately begin W2-P3**

```powershell
git push origin feat/aurora-2-observatory
git fetch origin
git rev-parse HEAD
git rev-parse '@{u}'
git rev-list --left-right --count '@{u}...HEAD'
git status --short
git -C 'D:\DEV\Chrome plugin' branch --show-current
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
git -C 'D:\DEV\Chrome plugin' rev-parse '@{u}'
git -C 'D:\DEV\Chrome plugin' status --short
```

Require target/upstream equality, zero divergence, clean target, and protected original clean/equal on `main` at `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Then re-read the master specification and durable ledgers, reverify provenance, create and independently review only the W2-P3 just-in-time plan, and continue automatically under A2-D019. Do not create a continuation prompt or combine W2-P3 with this packet.
