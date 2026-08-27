# W1-P8 Notes Persistence Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Notes report persistence truthfully, retain the latest draft after a rejected write, and allow close, arrange-mode entry, widget disable, or current-tab navigation only through a recoverable latest-text save path.

**Architecture:** Add a Notes-specific persistence hook that owns the debounced draft revision, one authority-backed write at a time, coalescing, error/retry state, and the unsaved-page guard. `NotesPanel` renders the hook's accessible state and exposes one imperative `requestClose()` boundary; `NotesWidget` routes pill close and disable through it. Extend the shared dialog stack with an awaited close-all transaction so arrange mode cannot inert a Notes error, and add a preview-only storage-write control to prove the real built extension without weakening the W1-P2 authority.

**Tech Stack:** TypeScript 5.9 strict, React 19, Chrome Manifest V3, W1-P2 `AuroraStorage` plus Web Locks, Vitest 3 with Testing Library/fake timers and controllable storage drivers, Playwright real-extension preview harness.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 10.3, 10.6, 12, 13, and 16; `docs/superpowers/aurora-2/ROADMAP.md` W1-P8; A2-D009/A2-D016 in `docs/superpowers/aurora-2/DECISIONS.md`; verified W1-P2/W1-P7 plans and checkpoint evidence.

## Global Constraints

- Execute only W1-P8. Do not implement W1-P9 privacy/Store copy, shared Wave 2 async primitives, Utility Tray redesign, Adaptive Stage/layout, CSS redesign, dependency upgrades, packaging, release staging, or Store actions.
- Preserve `D:\DEV\Chrome plugin` and every V1 artifact. Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory` from checkpoint `82184cd1b76cd34b44f475a0abc97bad2d2c2192`; verified W1-P7 implementation is `2fcb4438b0857500db1e5fb0785e1da45e9eacd8`.
- Preserve W1-P2 as the sole cross-context mutation authority. Notes writes call `AuroraStorage.set('notes', value)` and await it; add no raw production driver write, local/session-storage draft, service worker, manifest permission, context-local correctness fallback, or nested Web Lock.
- The editable `text` is the latest draft authority while dirty. A storage rejection cannot replace it with the persisted value, clear it, close its panel, or suppress its retry.
- A note revision becomes `Saved` only after the exact latest revision's `storage.set` fulfills. An older fulfillment/rejection may not publish `Saved`/`Error`, release newer ownership, close the panel, or overwrite a newer draft.
- The 500 ms debounce remains. `Saving` begins with the first unsaved edit and remains while debounce, queued/in-flight work, or an awaited close flush exists; it is never shown while clean. `Saved` is a quiet 1,400 ms confirmation only after the latest revision settles; a new edit cancels it. `Error` persists until a new successful latest-revision save, and exposes the visible copy `Couldn’t save. Your note is still here.` plus a `Retry save` button.
- At most one Notes write is in flight per mounted editor. Edits while it is pending coalesce to the latest revision and begin the next write after the current operation settles; no stale completion changes current UI state.
- External `notes` subscription values may replace the textarea only while the local editor is clean and unfocused. While focus or a local dirty/error revision blocks application, retain the latest suppressed subscription by arrival order. An exact `{ text, updatedAt }` echo of the captured in-flight payload is the local acknowledgement: it clears any earlier suppressed external value because the authority-ordered local write won; a later non-matching subscription remains pending and applies once the editor is clean and unfocused. On blur, reconcile a pending value when focus was the only blocker. Timestamps are payload data, not the ordering authority, so same-millisecond writes remain deterministic.
- Escape, pill re-click, `closeAllDialogs`, arrange-mode entry, and widget disable are close requests. Clean Notes closes immediately. Dirty/pending Notes cancels its debounce, awaits the latest revision, and closes only after success. Rejection keeps the panel interactive with its draft, alert, retry control, Escape registration, and focus trap intact.
- Current-tab navigation uses a standards-based `beforeunload` guard only while Notes is unsaved. The handler starts the same latest-revision flush, calls `preventDefault()`, and assigns `returnValue`; no claim is made that browsers let async work delay an unload the user explicitly confirms. A dismissed navigation keeps the page/draft available; after persistence settles the listener is removed and navigation is unblocked. Source tests preserve all actual producers: SearchBar delegates to `searchWeb`, `searchWeb` requests `CURRENT_TAB`, Quick Links are current-tab anchors, and loose/folder bookmarks are current-tab anchors. The built extension exercises a seeded Quick Link; native bookmark contents remain source/component evidence because deterministic headless permission/profile contents are unavailable.
- `closeAllDialogs(): Promise<boolean>` closes current entries newest-first, awaiting each. A false/rejected close leaves that entry registered and stops; a successful entry is removed before continuing. Existing synchronous dialogs remain source-compatible through `void | boolean | Promise<boolean>` callbacks.
- Arrange mode awaits `closeAllDialogs()`. It does not set `mode`, draft placement, drag state, inertness, or pending focus when a close fails. Long-press entry preserves the measured block/pointer input and begins only after the close transaction succeeds.
- Accessibility is behavioral: one `role="status"`/polite atomic region reports `Saving…` and `Saved`; a failure is a persistent `role="alert"`; Retry is a keyboard-operable button inside the existing focus trap; status meaning is visible and not color-only; successful close restores focus through the existing trap.
- Preview automation may add a preview-only Notes-write controller at the already-approved `__auroraStorageHarness` boundary. Production build search must prove the bridge/control absent. The controller wraps the same driver's `write` before `createStorage`; even deferred/rejected test writes still enter through `AuroraStorage` and the W1-P2 Web Lock. Its reset rejects every held operation before restoration so teardown cannot leave a lock or late write alive.
- Every production behavior starts with a witnessed failing unit/component/harness test for the expected missing or broken contract. Tests assert rendered state and persisted data, not only mock calls.
- Final closeout runs the exact targeted suite, `npx tsc --noEmit`, full Vitest, production and preview builds, production preview-symbol searches, the full real-extension harness, compact/standard/large Notes inspection, keyboard/AX inspection, bounded whole-packet review/fix/rereview, a dedicated `docs: checkpoint W1-P8` commit, push, clean-state proof, and stops before W1-P9.

---

### Task 0: Independently review and commit the executable plan

**Files:**

- Review/fix: `docs/superpowers/plans/2026-08-14-w1-p8-notes-persistence-integrity.md`

**Interfaces:**

- Produces: one immutable `W1_P8_PLAN_BASE` SHA for every implementation and review range.

- [ ] **Step 1: Request the bounded independent plan review**

Dispatch a fresh read-only reviewer against this plan, the complete master specification, ROADMAP W1-P8, A2-D009/A2-D016, verified W1-P2/W1-P7 plan/checkpoint evidence, and the current Notes panel/widget/tests, storage hook/authority/driver, dialog stack, arrange controller, current-tab navigation, App composition, and preview harness. Require Critical/Important/Minor findings with exact plan/code references and inspect specifically:

1. truthful state boundaries through debounce, authority queueing, fulfillment, rejection, newer edits, Strict Mode, and unmount;
2. one in-flight save, coalescing, latest-revision retry, and stale completion ownership;
3. dirty external-update protection without changing clean/unfocused last-writer-wins behavior;
4. pill/Escape/disable/arrange close safety, async dialog-stack ordering, focus restoration, and failed-close interactivity;
5. current-tab search/link/bookmark navigation warning boundaries and honest browser limitations;
6. status/alert semantics, keyboard access, live announcements, reduced motion, and no panel resize/reflow regression;
7. W1-P2 authority preservation, preview-only failure/defer injection, teardown, production isolation, and W1-P9 exclusion.

Verify every finding against source/spec evidence. Fix confirmed Critical/Important findings and packet-local Minor correctness gaps in this plan. Reject unsupported or out-of-scope suggestions with exact evidence.

- [ ] **Step 2: Self-review and commit the plan**

Run:

```powershell
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
git add --intent-to-add -- docs/superpowers/plans/2026-08-14-w1-p8-notes-persistence-integrity.md
rg -n "TB[D]|TO[D]O|implement late[r]|fill in detail[s]|similar t[o]|appropriate error handlin[g]|write tests fo[r]" docs/superpowers/plans/2026-08-14-w1-p8-notes-persistence-integrity.md
git diff --check
git diff -- docs/superpowers/plans/2026-08-14-w1-p8-notes-persistence-integrity.md
git add docs/superpowers/plans/2026-08-14-w1-p8-notes-persistence-integrity.md
git commit -m "docs: plan W1-P8 Notes persistence integrity"
git rev-parse HEAD
```

Expected: protected original clean at `eb1354b6a5b041fb6d494655c3dae1862572bc51`; placeholder search exit 1/no matches; diff check clean; one plan-only commit. Record its full SHA as `W1_P8_PLAN_BASE`.

---

### Task 1: Generation-owned Notes persistence and accessible recovery

**Files:**

- Create: `src/newtab/widgets/notes/useNotesPersistence.ts`
- Create: `src/newtab/widgets/notes/useNotesPersistence.test.tsx`
- Modify: `src/newtab/widgets/notes/NotesPanel.tsx`
- Modify: `src/newtab/widgets/notes/NotesPanel.test.tsx`

**Interfaces:**

- `type NoteSaveStatus = 'idle' | 'saving' | 'saved' | 'error'`.
- `useNotesPersistence()` consumes the current `AuroraStorage`, subscribes to `notes`, and returns `{ ready, text, status, edit, focus, blur, retry, flushLatest }`.
- `edit(value: string): void` advances a monotonically increasing revision, retains the exact value in a ref/state, marks the draft dirty/Saving, clears the saved-flash timer, and schedules the 500 ms save.
- `retry(): Promise<boolean>` cancels the debounce and persists the latest draft through the same single-flight path.
- `flushLatest(): Promise<boolean>` dedupes concurrent flushes, cancels the debounce, and resolves true only when the current latest revision is clean; it never owns or calls a UI close callback.
- `NotesPanel` owns `requestClose(): Promise<boolean>`: it reads the latest `onClose` through a ref, dedupes concurrent close requests, awaits `flushLatest()`, invokes that current callback once after success, and returns false without closing on rejection.
- `export interface NotesPanelHandle { requestClose(): Promise<boolean> }`; `NotesPanel` uses `forwardRef`/`useImperativeHandle` to expose the same request.

- [ ] **Step 1: Write the failing persistence-hook tests**

Use a real `createStorage(driver, base.authority)` instance around a controllable raw `StorageDriver` whose `write` delegates to `memoryDriver()` except for literal deferred/rejected `notes` patches. Do not broaden the authorized-driver overload. Assert rendered hook state and `storage.get('notes')`, not merely calls. Add these tests:

1. initial storage hydration yields the persisted text, `ready:true`, and `idle` without writing;
2. edit immediately yields `Saving`, remains Saving through 499 ms and a deferred authority write, and yields `Saved` only after the latest write fulfills; after 1,400 ms clean state is `idle`;
3. three edits within one debounce write only the literal latest text once;
4. an edit during a deferred first write never lets the first completion publish Saved; after it settles, one coalesced second write stores the literal latest text and only that completion publishes Saved;
5. a current-revision rejection yields Error, leaves the textarea/draft literal unchanged, and leaves the old persisted text unchanged;
6. Retry after further editing stores the literal newest text, clears Error only on fulfillment, and does not retry the rejected stale value;
7. a stale rejection from an older revision does not publish Error or block the queued latest save;
8. two storage contexts sharing the same authority prove arrival ordering with fixed same-millisecond `updatedAt`: an external write before the local self-echo is superseded by local success, an external write after that echo is retained while focused and applies on blur, and no dirty/saving/error draft is overwritten;
9. two simultaneous `flushLatest()` calls share one write and return true only after the latest revision settles; a rejection returns false and a later retry persists the latest value;
10. Strict Mode setup/cleanup leaves one live debounce/save owner and clears both debounce and Saved-flash timers on final unmount without a state update after unmount.

- [ ] **Step 2: Run the hook tests and verify RED**

```powershell
npx vitest run src/newtab/widgets/notes/useNotesPersistence.test.tsx
```

Expected: FAIL because the hook and its revision/single-flight/recovery contract do not exist.

- [ ] **Step 3: Implement the minimal hook**

Use refs for `text`, `revision`, `dirty`, `focused`, current save promise, flush promise, captured in-flight payload, pending external value/arrival sequence, debounce timer, and Saved-flash timer. The single-flight save captures `{ revision, text, updatedAt: Date.now() }`, awaits `storage.set`, and changes status only when its captured revision is still current. Subscription handling compares the complete value with the captured payload: its exact self-echo clears earlier pending external data; later non-matching values retain their arrival order and reconcile only when clean/unfocused. If a newer revision exists after settlement, immediately drain that latest revision once its debounce has elapsed or a close/retry requested a flush. Catch rejections inside the controller so no unhandled promise rejection reaches the page.

The `beforeunload` effect is active only while `dirtyRef.current` is true. Its handler calls the non-blocking latest flush, `event.preventDefault()`, and sets `event.returnValue = ''`; cleanup removes the exact handler.

- [ ] **Step 4: Write failing NotesPanel status/error/retry tests**

Add component tests proving:

1. the header has one initially empty `role="status"` with `aria-live="polite"` and `aria-atomic="true"`; it visibly says `Saving…` for an unsaved/deferred edit and `Saved` only after fulfillment;
2. rejection renders `role="alert"` with exact copy `Couldn’t save. Your note is still here.`, keeps the textarea value, and renders a keyboard-operable `Retry save` button;
3. edit after failure keeps the latest text; Retry persists that latest text and returns the header to Saved;
4. Escape while dirty leaves the dialog mounted until the write settles, then closes and restores focus; on rejection it remains open with textarea and Retry reachable inside the focus trap;
5. repeated Escape while one close flush is pending starts no duplicate write/close, and a parent rerender replacing `onClose` causes the eventual success to invoke only the latest callback;
6. a clean Escape closes immediately and preserves the existing newest-first stack behavior.

- [ ] **Step 5: Run NotesPanel tests and verify RED**

```powershell
npx vitest run src/newtab/widgets/notes/NotesPanel.test.tsx
```

Expected: FAIL because current Notes fire-and-forgets writes, reports Saved before settlement, has no accessible status/error/retry, and unmounts before close persistence settles.

- [ ] **Step 6: Integrate the hook and verify GREEN**

Replace the panel's ad hoc timers/direct `storage.set` calls with `useNotesPersistence`. Keep the same role/name, anchor styles, `h-64 w-80`, label, placeholder, typography, focus trap, and readiness-gated Escape registration. Render exactly one polite status region; render the failure alert and Retry button without hiding or disabling the textarea.

Run:

```powershell
npx vitest run src/newtab/widgets/notes/useNotesPersistence.test.tsx src/newtab/widgets/notes/NotesPanel.test.tsx src/lib/storage/authority.test.ts src/lib/storage/index.test.ts src/lib/hooks/useStoredKey.test.tsx
npx tsc --noEmit
git diff --check
git add src/newtab/widgets/notes/useNotesPersistence.ts src/newtab/widgets/notes/useNotesPersistence.test.tsx src/newtab/widgets/notes/NotesPanel.tsx src/newtab/widgets/notes/NotesPanel.test.tsx
git diff --cached --check
git diff --cached
git commit -m "fix(notes): await recoverable persistence"
```

---

### Task 2: Safe pill, disable, arrange, and navigation close paths

**Files:**

- Modify: `src/newtab/widgets/notes/NotesWidget.tsx`
- Modify: `src/newtab/widgets/notes/NotesWidget.test.tsx`
- Modify: `src/lib/dialogStack.ts`
- Modify: `src/lib/dialogStack.test.ts`
- Modify: `src/newtab/arrange/ArrangeController.tsx`
- Modify: `src/newtab/arrange/ArrangeController.test.tsx`
- Modify: `src/newtab/App.test.tsx` only if the real composed disable/arrange path needs an integration regression beyond `AppLikeFixture`.
- Modify: `src/newtab/components/SearchBar.test.tsx`
- Modify: `src/services/search.test.ts`
- Create: `src/newtab/widgets/links/LinkTile.test.tsx`
- Modify: `src/newtab/widgets/bookmarks/BookmarksBar.test.tsx`

**Interfaces:**

- `NotesInner` holds `useRef<NotesPanelHandle | null>` and routes every open-panel pill click through `handle.requestClose()`; a not-yet-loaded clean panel may close directly.
- The outer Notes gate passes `enabled` into `NotesInner` rather than immediately unmounting an open editor. When disabled while open, it requests close; the pill disappears, but a failed editor remains interactive until Retry succeeds. Once disabled and closed, Notes renders nothing and owns no persistence listener/timer.
- `type DialogCloseResult = void | boolean | Promise<boolean>`; false or rejection means “not closed.”
- `closeAllDialogs(): Promise<boolean>` awaits the live top entry, removes it only after success, and stops on failure. It treats `void` as success and never double-invokes an entry removed by its own callback.

- [ ] **Step 1: Write failing widget close/disable tests**

With a controllable real storage driver, add tests proving:

1. re-clicking the Notes pill during debounce keeps `aria-expanded="true"` and the dialog mounted through a deferred write, then closes once and restores focus after fulfillment;
2. rejected pill close leaves `aria-expanded="true"`, exact draft, alert, and Retry visible; Retry stores the latest post-failure edit, after which a second close succeeds;
3. changing `settings.widgets.notes` to false while dirty hides the pill but keeps the panel through saving/error; successful retry closes the panel and leaves no Notes DOM;
4. a clean disable unmounts immediately and `onOpenChange(false)` remains exact;
5. disable during a rejected dirty close, edit/retry/close, then re-enable: exactly one closed Notes pill returns with no stale `aria-expanded`, panel, Error, debounce, Saved-flash timer, or listener; a fresh open hydrates the literal latest persisted retry text;
6. clean/open/close geometry and lazy loading remain unchanged.

- [ ] **Step 2: Run NotesWidget tests and verify RED**

```powershell
npx vitest run src/newtab/widgets/notes/NotesWidget.test.tsx
```

Expected: FAIL because pill close and widget disable currently unmount the panel synchronously.

- [ ] **Step 3: Implement the minimal widget gate/handle integration**

Keep positioning, corner-hug, z-index callback, button copy, and `aria-expanded` behavior. Do not lift note text into App or introduce a second draft store.

- [ ] **Step 4: Write failing async dialog-stack and arrange tests**

Add literal tests proving:

1. `closeAllDialogs()` awaits a deferred newest entry before invoking the older entry and resolves true after both succeed;
2. false or rejected newest close resolves false, leaves it on top for the next Escape/retry, and never invokes the older entry;
3. a successful callback that unregisters itself during close is removed exactly once; subsequent Escape sees the correct next entry;
4. two concurrent close-all requests share/serialize the current top and never double-call it;
5. entering arrange with dirty Notes does not render Done/outlines or set the page inert until the save fulfills;
6. an injected Notes save failure leaves arrange off and Notes interactive with Error/Retry; after Retry, a fresh arrange request succeeds and the panel is gone before inertness;
7. long-press entry retains the selected block/pointer-derived drag start across the awaited close, while a failed close produces no layout write.

- [ ] **Step 5: Run dialog/arrange tests and verify RED**

```powershell
npx vitest run src/lib/dialogStack.test.ts src/newtab/arrange/ArrangeController.test.tsx src/newtab/App.test.tsx
```

Expected: FAIL because `closeAllDialogs` is synchronous/clears before callbacks and arrange enters immediately.

- [ ] **Step 6: Implement awaited close-all and arrange entry**

Make `beginDrag` and `enterViaSettings` start one async entry transaction. Capture measurements/block/pointer before awaiting when needed; after the await, recheck that the controller is still mounted, premium, and off before setting mode/drag/draft. Deduplicate a pending entry so repeated long-press/settings signals do not race.

- [ ] **Step 7: Verify beforeunload behavior and all close paths GREEN**

The hook tests must dispatch a cancelable `BeforeUnloadEvent`/`Event('beforeunload', { cancelable: true })` and prove: clean state does not prevent; dirty/error state prevents and triggers one latest flush; success removes the guard; cleanup removes it. Source/component tests must also prove SearchBar calls the real `searchWeb`, `searchWeb` uses literal `disposition: 'CURRENT_TAB'`, Quick Links omit `target="_blank"`, and loose/folder bookmark anchors omit a new-tab target while preserving their href. Do not test framework internals or exact browser prompt copy.

Run:

```powershell
npx vitest run src/newtab/widgets/notes/useNotesPersistence.test.tsx src/newtab/widgets/notes/NotesPanel.test.tsx src/newtab/widgets/notes/NotesWidget.test.tsx src/lib/dialogStack.test.ts src/newtab/arrange/ArrangeController.test.tsx src/newtab/App.test.tsx src/newtab/components/SearchBar.test.tsx src/services/search.test.ts src/newtab/widgets/links/LinkTile.test.tsx src/newtab/widgets/bookmarks/BookmarksBar.test.tsx
npx tsc --noEmit
git diff --check
git add src/newtab/widgets/notes/NotesWidget.tsx src/newtab/widgets/notes/NotesWidget.test.tsx src/lib/dialogStack.ts src/lib/dialogStack.test.ts src/newtab/arrange/ArrangeController.tsx src/newtab/arrange/ArrangeController.test.tsx src/newtab/App.test.tsx src/newtab/components/SearchBar.test.tsx src/services/search.test.ts src/newtab/widgets/links/LinkTile.test.tsx src/newtab/widgets/bookmarks/BookmarksBar.test.tsx
git diff --cached --check
git diff --cached
git commit -m "fix(notes): guard close and navigation"
```

Stage `src/newtab/App.test.tsx` only if it actually changed.

---

### Task 3: Built-extension persistence, recovery, navigation, and accessibility proof

**Files:**

- Modify: `src/newtab/main.tsx`
- Modify: `scripts/preview.mjs`
- Modify production/test files only if a new failing unit/component/harness assertion first proves a packet-local defect.

**Interfaces:**

- In preview mode only, wrap `chromeDriver().write` before `createStorage` and expose a frozen `__auroraStorageHarness.notes` controller with `deferNext()`, `rejectNext()`, `releaseNext()`, `rejectPending()`, `reset()`, and `snapshot()`; only patches with own key `notes` are controlled. Other writes pass through unchanged.
- A deferred release calls the captured native driver write before resolving, so success still emits real `chrome.storage.onChanged`. A rejection writes nothing. Snapshot exposes counts/modes only, never note text.
- The W1-P8 harness runs in a dedicated disposable extension page, attaches the standard console/page-error capture, snapshots the exact `notes` and complete `settings` values plus the primary page URL and two advancing `Date.now()` samples, and encloses every assertion in `try/finally`. The `finally` block returns from the routed page if necessary, calls `notes.reset()` to reject/settle every held operation, waits for zero pending operations and a quiescent editor, restores `notes` and `settings` through the production `__auroraStorageHarness.update` authority boundary, reloads once, verifies exact readback, closes the disposable page, and proves the primary page URL and advancing clock were unchanged even when an assertion throws.

- [ ] **Step 1: Add four deterministic W1-P8 real-extension assertions**

Add exactly four countable PASS/FAIL lines:

1. Defer the next real Notes write, type literal `W1-P8 pending draft`, prove visible/polite `Saving…`, stored pre-image unchanged, and no Saved; release it, prove visible `Saved`, exact stored text, and no alert.
2. Reject the next write, type literal `W1-P8 failed draft`, prove persistent accessible alert copy, textarea retention, stored pre-image unchanged, and Chromium AX nodes for the alert and `Retry save`; edit to literal `W1-P8 latest retry`, click Retry, and prove only the latest text persists and Saved appears.
3. Defer a dirty close, press Escape and prove the dialog remains open/Saving; release, prove it closes with focus restored to the Notes pill, reload/reopen, and prove the exact latest text. Repeat with arrange entry after a rejected close: no inert/arrange overlay on failure, then Retry plus a fresh arrange request closes Notes before the page becomes inert.
4. Seed a Quick Link pointing to a routed deterministic local URL, reject a dirty navigation flush, and click that real Quick Link anchor; dismiss the browser beforeunload dialog, prove the extension page, draft, alert, and Retry remain. Retry successfully, click the same real anchor, prove navigation occurs without a second dialog, then return to the extension page. Source/component tests remain authoritative for Chrome Search API and bookmark-anchor producers whose deterministic external destination or optional bookmark contents cannot be supplied by this headless profile. This proves the warning/retention boundary, not that an explicitly confirmed unload can await async storage.

Capture `screenshots/w1-p8-notes-error.png` at 1600×900. Also inspect Notes at 800×600 and 2560×1440 for reachable textarea/status/Retry, no clipping, and unchanged fixed panel size; do not redesign it.

- [ ] **Step 2: Build preview and run the full harness once**

```powershell
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p8-harness-first.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w1-p8-harness-first.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w1-p8-harness-first.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w1-p8-harness-first.log -Pattern '^SKIP:').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
if ($fail -ne 0) { throw "Preview harness logged $fail FAIL lines" }
if ($pass -ne 451 -or $skip -ne 3) { throw "Expected W1-P8 harness totals PASS=451 SKIP=3, got PASS=$pass SKIP=$skip" }
```

Expected: 451 PASS / 0 FAIL / 3 SKIP from W1-P7's 447 / 0 / 3 plus the four W1-P8 lines. Preserve the three honest Home Assistant/native-permission ceilings. Delete the first-run log after recording evidence.

- [ ] **Step 3: Run targeted accessibility and production-isolation checks**

```powershell
npx vitest run src/newtab/widgets/notes/useNotesPersistence.test.tsx src/newtab/widgets/notes/NotesPanel.test.tsx src/newtab/widgets/notes/NotesWidget.test.tsx src/lib/dialogStack.test.ts src/newtab/arrange/ArrangeController.test.tsx src/newtab/App.test.tsx src/newtab/components/SearchBar.test.tsx src/services/search.test.ts src/newtab/widgets/links/LinkTile.test.tsx src/newtab/widgets/bookmarks/BookmarksBar.test.tsx src/lib/storage/authority.test.ts src/lib/storage/index.test.ts
npx tsc --noEmit
npm run build
rg -n "__auroraStorageHarness|__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist
if ($LASTEXITCODE -ne 1) { throw 'Preview-only Aurora bridge leaked into production dist' }
git diff --check
```

Inspect the W1-P8 screenshot and Chromium accessibility snapshot. Confirm the error is visible/not color-only, status and alert roles/names are correct, Retry is reachable by keyboard inside the trap, Escape failure retains focusable content, success restores focus, and no compact/large clipping appeared.

- [ ] **Step 4: Commit the verified harness integration**

```powershell
git add src/newtab/main.tsx scripts/preview.mjs screenshots/w1-p8-notes-error.png
git diff --cached --check
git diff --cached
git commit -m "test(notes): prove persistence integrity in extension"
```

If Task 3 exposes a production defect, first reproduce it with the smallest failing test, commit only that exact fix separately, then commit the harness. Record the resulting implementation HEAD.

---

### Task 4: Bounded whole-packet review, fix round, final verification, checkpoint, and stop

**Files:**

- Review: `W1_P8_PLAN_BASE..HEAD`
- Modify after final verification: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after final verification: `docs/superpowers/aurora-2/STATUS.md`
- Modify after final verification: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Produces: reviewed W1-P8 implementation commits and dedicated `docs: checkpoint W1-P8`.
- Produces: pushed `origin/feat/aurora-2-observatory`, clean target/original worktrees, and a W1-P9 continuation prompt without a W1-P9 plan.

- [ ] **Step 1: Request the bounded independent implementation review**

Dispatch a fresh read-only reviewer with plan-base SHA, implementation HEAD, this plan, master spec sections 10.3/10.6/12/13/16, ROADMAP W1-P8, A2-D009/A2-D016, complete diff, red/green evidence, screenshot/AX observations, and verification output. Require exact file/line references and Critical/Important/Minor severity. Inspect the same seven plan-review domains plus:

- promise/ref lifetimes under Strict Mode, close dedupe, stale closures, timer cleanup, and setState-after-unmount;
- save ordering through W1-P2 authority, sync subscription echoes, cross-tab writes, same-millisecond timestamps, and newer edit during success/rejection;
- all close triggers including widget disable/restore and arrange long-press/settings entry;
- async dialog-stack removal/registration ordering and no regression to Reset/Drawer/Timer/Todo/Palette Escape;
- beforeunload guard attachment/removal, no unload-only durability overclaim, and current-tab search/link/bookmark coverage;
- preview controller inactivity/isolation, no note-text logging, exact teardown, screenshot/AX truthfulness, and no W1-P9 behavior.

- [ ] **Step 2: Verify and fix confirmed findings with TDD**

For each finding, inspect cited evidence. Reproduce every confirmed defect with the smallest failing unit/component/harness assertion before production edits. Fix confirmed Critical/Important and packet-local Minor correctness findings in one bounded fix wave. Reject unsupported or out-of-scope suggestions with code/spec evidence. Commit fixes separately:

```powershell
git status --short
git add -- src/newtab/widgets/notes src/lib/dialogStack.ts src/lib/dialogStack.test.ts src/newtab/arrange/ArrangeController.tsx src/newtab/arrange/ArrangeController.test.tsx src/newtab/App.test.tsx src/newtab/main.tsx scripts/preview.mjs screenshots/w1-p8-notes-error.png
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m "fix(notes): address W1-P8 review"
```

Request one focused rereview over the fix range. No Critical/Important or packet-local correctness finding may remain. After any fix, rerun Step 3 completely.

- [ ] **Step 3: Run the complete fresh W1-P8 verification gate**

```powershell
npx vitest run src/newtab/widgets/notes/useNotesPersistence.test.tsx src/newtab/widgets/notes/NotesPanel.test.tsx src/newtab/widgets/notes/NotesWidget.test.tsx src/lib/dialogStack.test.ts src/newtab/arrange/ArrangeController.test.tsx src/newtab/App.test.tsx src/newtab/components/SearchBar.test.tsx src/services/search.test.ts src/newtab/widgets/links/LinkTile.test.tsx src/newtab/widgets/bookmarks/BookmarksBar.test.tsx src/lib/storage/authority.test.ts src/lib/storage/index.test.ts src/lib/hooks/useStoredKey.test.tsx
npx tsc --noEmit
npm test
npm run build
rg -n "__auroraStorageHarness|__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist
if ($LASTEXITCODE -ne 1) { throw 'Preview-only Aurora bridge leaked into production dist' }
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p8-harness.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w1-p8-harness.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w1-p8-harness.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w1-p8-harness.log -Pattern '^SKIP:').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
if ($fail -ne 0) { throw "Preview harness logged $fail FAIL lines" }
if ($pass -ne 451 -or $skip -ne 3) { throw "Expected W1-P8 harness totals PASS=451 SKIP=3, got PASS=$pass SKIP=$skip" }
git diff --check
git status --short
```

Requirements: targeted/full Vitest, TypeScript, production/preview builds, and harness have zero failures; production bridge search exits 1; exact test counts are recorded from fresh output; the screenshot/AX inspection is recorded; the three existing SKIPs remain honest; W1-P1 through W1-P7 evidence does not regress; no W1-P9 behavior enters the diff. Delete untracked harness logs after recording counts.

- [ ] **Step 4: Update durable ledgers and commit the checkpoint**

Update:

- `ROADMAP.md`: mark W1-P8 `Verified`, link this plan, record exact state/close/navigation/accessibility/harness evidence, implementation SHA, review disposition, and checkpoint subject; leave W1-P9 Not started with no plan.
- `STATUS.md`: record the W1-P8 envelope, plan/implementation/review commits, exact targeted/full/type/build/harness counts, screenshot/AX/manual ceilings, clean state, and W1-P9 as the single next packet.
- `DECISIONS.md`: append A2-D017 recording revision-owned awaited Notes persistence, accessible recoverable state, authority-preserving single flight, awaited close-all/arrange gate, and honest beforeunload limits.

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git diff --cached --check
git diff --cached
git commit -m "docs: checkpoint W1-P8"
```

- [ ] **Step 5: Push, prove clean state, prepare the next prompt, and stop**

```powershell
git push origin feat/aurora-2-observatory
git status --short --branch
git rev-parse HEAD
git rev-parse '@{upstream}'
git rev-list --left-right --count 'HEAD...@{upstream}'
git log -16 --oneline
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
```

Require local/upstream equality, no target-worktree entries, and protected original clean at `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Provide a ready-to-paste next-session prompt naming the literal worktree, branch, checkpoint HEAD, verified W1-P8 implementation SHA, Packet `W1-P9`, required documents, and instruction to create/review its privacy-classification plan just in time. Stop before creating a W1-P9 plan or changing privacy/Store/release behavior.
