# Home Assistant Data Minimization, Health, and Action Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Home Assistant dashboard refreshes request only the entities the user selected, prove action-only configurations are reachable with a narrow authenticated health check, and make every action resistant to double activation and stale configuration while exposing persistent, accessible pending/success/error feedback.

**Architecture:** Keep `GET /api/states` exclusively in the explicit entity-picker flow. The dashboard service fetches each deduped selected entity through `GET /api/states/{entity_id}` in parallel; when no state chips are selected but actions are configured, it performs the smaller authenticated `GET /api/` health check before exposing actions. The existing W1-P1 scoped snapshot hook remains the polling generation authority. Action buttons add an independent in-memory generation guard over snapshot epoch, instance URL, token, and action identity, plus a synchronous per-button pending guard and visible live feedback, so an old request cannot update a reconfigured card and repeated click/keyboard activation cannot create duplicate service calls.

**Tech Stack:** TypeScript 5.9 strict, React 19, Chrome Manifest V3, Home Assistant REST API, Vitest 3 with Testing Library, W1-P1 scoped connector snapshots, W1-P3 optional-origin lifecycle authority, and the Playwright real-extension preview harness.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 10.1, 10.2, 10.4, 11, 12, 13, and 16; `docs/superpowers/aurora-2/ROADMAP.md` W1-P5; decisions A2-D008, A2-D012, and A2-D013 in `docs/superpowers/aurora-2/DECISIONS.md`; verified W1-P1/W1-P3/W1-P4 plans and checkpoint evidence.

## Global Constraints

- Execute only W1-P5. Do not implement weather identity/races (W1-P6), local-day rollover, Notes integrity, privacy/Store final copy, Adaptive Stage/layout, CSS redesign, manifest expansion, dependency upgrades, packaging, release staging, or Store actions.
- Preserve `D:\DEV\Chrome plugin` and every V1 artifact. Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory` from checkpoint `0c7f29cdedb387955d2cad4c92cc6f6426ffd312`; verified W1-P4 implementation is `6f30b915719586cb519aa0f8f2b4418b0724debe`.
- Preserve W1-P1 snapshot identity and freshness. `useConnectorSnapshot('homeassistant', completeConfig, refresh)` remains the sole regular-poll cache writer; its scope/generation/queued-owner checks reject stale poll completions. No Home Assistant-specific cache key, raw token, instance URL, entity payload, or action payload may be logged or embedded in a persisted scope.
- Preserve the Home Assistant anti-staleness sentinel: any poll-wide authentication, network, non-404 HTTP, or malformed-body failure resolves `{ entities: null }`, and the whole widget remains hidden. A selected entity returning 404 is an honest missing-entity result and is omitted without failing healthy siblings, matching Home Assistant's documented single-entity endpoint and the existing vanished-selection behavior.
- `fetchAllStates()` and `GET /api/states` remain only for the user-initiated picker. Regular polling must never call them. Selected IDs are normalized through `haEntitiesOf`, deduped again at the network boundary, URL-encoded as path segments, and fetched through the shared `getJson` timeout/error discipline.
- An action-only configuration must not become visible from an empty local snapshot without a real network request. It uses authenticated `GET /api/`, validates a successful JSON object with a non-empty string `message`, and returns `{ entities: [] }` only when that narrow check succeeds; otherwise it returns `{ entities: null }`.
- Preserve W1-P3 permission behavior. Connect/reconnect/disconnect and origin ownership continue through the existing transaction/lifecycle authority, configured disabled Home Assistant remains an owner, action presses request no new permission, and W1-P5 adds no manifest host.
- Per-action pending is synchronous and local to that action. A ref guard is set before the service promise is created, the button is disabled while pending, repeated click or keyboard activation for that action is a no-op, and a different action remains independently operable.
- Each action request captures a generation derived in memory from the current `snapshotEpoch`, instance URL, token, action ID, and action domain without persisting or logging those values. Reconfiguration, including an identical-credential reconnect whose only changed input is `snapshotEpoch`, advances the generation, clears obsolete UI state, and causes any old completion to be ignored. Unmount also prevents late state changes.
- Action feedback is not color-only or title-only. Pending, success, and error have visible text associated with the invoking button; pending and success use a polite live status, failure uses an alert, and the button exposes disabled/busy state while pending. Success/error remain until the next attempt, reconfiguration, or unmount; failure leaves the action retryable.
- Settings discloses, beside the picker control, that opening the picker loads the full entity list from the user's Home Assistant instance only for selection and that regular dashboard refreshes request only selected entities. It never claims data remains on-device when it is transmitted directly to Home Assistant.
- Tests exercise real service parsing, widget state, W1-P1 storage/snapshot behavior, and Settings output. Mocks stop at the fetch boundary and the action network call; expectations use literal hand-derived values. Every production behavior begins with a failing test and a recorded expected failure.
- The preview harness may use the existing real seeded/unreachable-instance boundary but adds no production bridge or network stub. It proves pending disablement, persistent visible/announced failure, retry availability, per-button isolation, and unchanged honest live-instance SKIP. Positive live service execution and picker contents remain user-instance/headed evidence ceilings.
- Final closeout runs the exact targeted suite, `npx tsc --noEmit`, full Vitest, production and preview builds, production preview-symbol searches, the full real-extension harness, screenshot inspection, bounded whole-packet review/fix/rereview, a dedicated `docs: checkpoint W1-P5` commit, push, clean-state proof, and then stops before W1-P6.

---

### Task 0: Commit the independently reviewed execution base

**Files:**

- Review/fix: `docs/superpowers/plans/2026-08-14-w1-p5-home-assistant-data-health-action-safety.md`

**Interfaces:**

- Produces: one immutable plan-base SHA for every W1-P5 implementation/review range.
- Records: protected original starting status and HEAD `eb1354b6a5b041fb6d494655c3dae1862572bc51` for final equality proof.

- [ ] **Step 1: Run the independent plan review**

Dispatch a read-only reviewer against this plan, the master specification, ROADMAP W1-P5, A2-D008/A2-D012/A2-D013, verified W1-P1/W1-P3/W1-P4 plans and checkpoint evidence, official Home Assistant REST endpoint semantics, and current Home Assistant service/widget/picker/settings/harness code. Require Critical/Important/Minor findings with exact plan/code references and explicit coverage of:

- bulk-versus-selected endpoint boundaries and 404 semantics;
- action-only genuine health and authentication behavior;
- W1-P1 poll ownership/generation preservation;
- synchronous double-activation exclusion for mouse and keyboard;
- action-generation changes, late completion, unmount, and retry;
- visible and screen-reader pending/success/error semantics;
- picker disclosure truthfulness and secret safety;
- W1-P3 permission ownership preservation;
- deterministic harness evidence, honest live-instance ceiling, and W1-P6 exclusion.

Verify every finding against repository/source evidence. Fix confirmed Critical/Important findings and packet-local Minor correctness gaps in this plan. Reject unsupported or out-of-scope suggestions with exact evidence.

- [ ] **Step 2: Self-review and commit the plan**

Run:

```powershell
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
git add --intent-to-add -- docs/superpowers/plans/2026-08-14-w1-p5-home-assistant-data-health-action-safety.md
rg -n "TB[D]|TO[D]O|implement late[r]|fill in detail[s]|similar t[o]|appropriate error handlin[g]|write tests fo[r]" docs/superpowers/plans/2026-08-14-w1-p5-home-assistant-data-health-action-safety.md
git diff --check -- docs/superpowers/plans/2026-08-14-w1-p5-home-assistant-data-health-action-safety.md
git diff -- docs/superpowers/plans/2026-08-14-w1-p5-home-assistant-data-health-action-safety.md
```

Require the original checkout to be clean at the literal expected HEAD, the plan diff to be non-empty, no placeholder hits, no whitespace errors, complete spec coverage, and consistent interfaces. Commit only the reviewed plan:

```powershell
git add docs/superpowers/plans/2026-08-14-w1-p5-home-assistant-data-health-action-safety.md
git commit -m "docs: plan W1-P5 Home Assistant safety"
git rev-parse HEAD
```

Record the literal SHA as `W1_P5_PLAN_BASE`.

---

### Task 1: Selected-entity polling and narrow action-only health

**Files:**

- Modify: `src/services/connectors/homeassistant.ts`
- Modify: `src/services/connectors/homeassistant.test.ts`

**Interfaces:**

- `fetchAllStates(instanceUrl, token, fetchFn?)` remains the picker-only `GET /api/states` function with its existing return contract.
- `checkHomeAssistantHealth(instanceUrl, token, fetchFn?): Promise<boolean>` performs authenticated `GET {base}/api/`; it returns true only for an OK JSON object with a non-empty string `message`, and false for non-OK, network, malformed, or thrown results.
- A private selected-state result distinguishes `found`, `missing`, and `failed`. `GET /api/states/{encodeURIComponent(entity.id)}` returning 404 is `missing`; any other non-OK response is `failed`; an OK response must parse to exactly one valid `HaState` whose returned `entity_id` matches the requested ID, otherwise it is `failed`.
- `fetchHomeAssistant(instanceUrl, token, picked, fetchFn?)` dedupes picked IDs in first-occurrence order. With zero IDs it calls `checkHomeAssistantHealth` and returns `{ entities: [] }` or `{ entities: null }`. With IDs it fetches every distinct selected endpoint in parallel, returns found states in selection order, omits 404s, and returns `{ entities: null }` if any selected request is `failed`. It never calls `fetchAllStates`.

- [ ] **Step 1: Write the failing endpoint, minimization, and health tests**

Replace/update the existing `fetchHomeAssistant` bulk-filter and empty-no-fetch tests, while preserving the separate `fetchAllStates` picker suite. Add literal behavior tests that catch these mutations:

1. Two selected entities issue exactly two authenticated GETs to `/api/states/sensor.kitchen_temp` and `/api/states/light.porch`, never `/api/states`; an unrelated entity is never returned or requested.
2. Duplicate selected IDs issue one request and one result, preserving first-selection order.
3. IDs are encoded as one path segment; the returned `entity_id` must equal the requested ID.
4. A 404 omits only that selected entity while a healthy sibling remains; a 401/500, network rejection, non-array/object mismatch, malformed state, or wrong returned ID makes the poll `{ entities: null }`.
5. Empty selected entities perform exactly one authenticated `GET /api/`; an OK `{ message: 'API running.' }` returns `{ entities: [] }`, while non-OK/network/malformed/empty-message responses return `{ entities: null }`.
6. `fetchAllStates` still issues one bulk `/api/states` request and preserves picker parsing, proving bulk access is not removed from the explicit picker.
7. Bearer credentials are sent through headers only and never appear in requested URLs or returned error values.

The production mutation each test catches is explicit: replacing per-entity URLs with bulk `/api/states`, treating an unauthenticated/local empty result as healthy, carrying partial data across an authentication failure, or accepting a response for the wrong entity.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx vitest run src/services/connectors/homeassistant.test.ts
```

Expected: FAIL because regular polling still calls bulk `fetchAllStates`, an empty selection makes no request, and `checkHomeAssistantHealth` does not exist.

- [ ] **Step 3: Implement minimal selected fetch and health behavior**

Reuse `apiBase`, `authHeaders`, `getJson`, and the existing parse discipline. Do not add a second HTTP utility, retry loop, cache, log, WebSocket, or `/api/config` poll. Keep the public `HomeAssistantData` shape and `{ entities: null }` anti-staleness sentinel unchanged so existing W1-P1 snapshot consumers remain compatible.

- [ ] **Step 4: Verify GREEN and commit Task 1**

```powershell
npx vitest run src/services/connectors/homeassistant.test.ts src/services/connectors/registry.test.ts src/services/connectors/http.test.ts
npx tsc --noEmit
rg -n "fetchAllStates" src --glob "*.ts" --glob "*.tsx"
git diff --check
```

Require production `fetchAllStates` callers to remain limited to the Home Assistant picker flow in `Connectors.tsx`; tests may import it directly. Commit only Task 1 files:

```powershell
git add src/services/connectors/homeassistant.ts src/services/connectors/homeassistant.test.ts
git commit -m "fix(ha): minimize polling and verify health"
```

---

### Task 2: Generation-safe action guards and accessible persistent feedback

**Files:**

- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx`
- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx`
- Modify: `src/settings/sections/Connectors.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`

**Interfaces:**

- Export the production `ActionButton` component as a named unit so its real rerender lifecycle can be tested directly without forcing the W1-P1 poll gate to unmount it. It keeps a synchronous `pendingRef`, mounted ref, and monotonically increasing in-memory generation. Generation inputs are `snapshotEpoch`, `instanceUrl`, `token`, `action.id`, and `action.domain`; a `useLayoutEffect` keyed by that tuple increments the generation and resets obsolete pending/feedback only after the new configuration commits and before promise continuations can run. Never read or mutate the generation ref during render.
- Action state is `'idle' | 'pending' | 'success' | 'error'`. Pending sets the ref before calling `callHaService`, disables the button, sets `aria-busy="true"`, and renders `Running {name}…`. Success renders `{name} completed.` in a polite `role="status"`; failure renders `Couldn't run {name}. Try again.` in `role="alert"`. Success/error remain until retry, generation change, or unmount.
- Each feedback element has a stable `useId()` identifier and the button uses `aria-describedby` while feedback exists. Visual tint remains a secondary signal, not the only signal. Reduced-motion classes remain intact.
- A completion updates state only when mounted and its captured generation equals the current generation. In every completion path, the pending ref is released for the matching generation; a stale completion cannot release or overwrite a newer request. The mounted effect must set `mountedRef.current = true` in setup and `false` in cleanup so React Strict Mode's setup/cleanup/setup cycle cannot leave a live component marked unmounted.
- `HomeAssistantInner` still renders nothing for `!data` or `data.entities === null`; action-only visibility therefore depends on Task 1's real health result. Existing W1-P1 scope changes remain the poll generation authority.
- The connected Home Assistant settings card includes the exact disclosure: `Choosing entities loads the full entity list from your Home Assistant instance for this picker only. Regular dashboard updates request only your selected entities.`

- [ ] **Step 1: Write failing widget and Settings tests**

Add real DOM tests for:

1. An action-only config with no cached snapshot remains absent while its health refresh is pending, appears after `{ entities: [] }`, and stays absent after `{ entities: null }`.
2. The first click synchronously enters pending, disables and marks only that button busy, exposes `Running Movie night…`, and leaves sibling actions enabled.
3. Two programmatic click events dispatched in the same `act` turn, before relying on a committed disabled DOM, produce exactly one `callHaService` invocation. This directly proves the synchronous ref guard rather than merely proving native disabled behavior.
4. Success yields visible `Movie night completed.` with `role="status"`, removes busy/disabled state, and remains until the next attempt.
5. Failure yields visible `Couldn't run Movie night. Try again.` with `role="alert"`, removes busy/disabled state, remains retryable, and a successful retry replaces the error with success.
6. Render two production `ActionButton`s. While A is pending, activate sibling B; assert one call per action, independent pending/feedback, and no hidden global guard.
7. Directly rerender one `ActionButton` from generation A to B while A is pending, keeping instance URL, token, action ID, and domain identical and changing only `snapshotEpoch`. Flush the committed layout effect, start B, resolve A after B begins, and prove A neither writes feedback nor releases B's pending guard; B alone settles its own result.
8. Render the real action component under `<StrictMode>` and prove a post-mount completion reports success after the development setup/cleanup/setup cycle. Separately unmount with a promise pending, settle it cleanly, and require no remaining action DOM; this is promise-lifecycle evidence, not a claim that React 19 exposes hidden setter calls. The mounted-ref setup/cleanup guard is additionally a mandatory code-review item.
9. Separately, reconfigure the storage-backed widget from config A to B with identical entity/action IDs and prove the W1-P1 gate hides old data while pending; a B poll completion wins over a later A completion and persisted snapshot scope/data remain B.
10. The Home Assistant card renders the exact picker-only bulk/selected-refresh disclosure beside `Choose entities`; it contains neither token nor instance URL.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx vitest run src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx src/settings/SettingsPanel.test.tsx -t "Home Assistant|action-only|action button|selected entities"
```

Expected: FAIL because the current button allows overlapping calls, uses only a transient tint, accepts old completions after reconfiguration, and Settings has no picker/polling disclosure.

- [ ] **Step 3: Implement minimal guarded state and disclosure**

Keep action safety local to the production `ActionButton`; do not introduce global action storage, optimistic Home Assistant state mutation, new permission checks, notifications, dialogs, or layout changes. Its named export is the real unit consumed by `HomeAssistantInner`, not a test-only wrapper or cleanup API. Clear obsolete state in the committed `useLayoutEffect`, never during render, and compare the captured generation again after the service promise settles before any `setState` or pending-ref release.

Keep the picker save contract unchanged: preserve `snapshotEpoch`, write entity/action selections from current storage, then clear only `connectorSnapshots.homeassistant` so W1-P1 immediately refreshes the new selection.

- [ ] **Step 4: Verify GREEN and commit Task 2**

```powershell
npx vitest run src/services/connectors/homeassistant.test.ts src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx src/lib/hooks/useConnectorSnapshot.test.tsx src/settings/sections/EntityPickerDialog.test.tsx src/settings/SettingsPanel.test.tsx
npx tsc --noEmit
git diff --check
```

Commit only Task 2 files:

```powershell
git add src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx src/settings/sections/Connectors.tsx src/settings/SettingsPanel.test.tsx
git commit -m "fix(ha): guard actions and announce outcomes"
```

---

### Task 3: Real-extension action-state proof and complete packet verification

**Files:**

- Modify: `scripts/preview.mjs`
- Modify production/test files only if a new failing unit/component regression first proves a packet-local defect.

**Interfaces:**

- The existing Home Assistant preview block continues to seed a full config/snapshot through established harness storage setup and drives real board/Settings controls.
- The action probe focuses the enabled target and uses Enter for the first real activation, then immediately verifies only that button is disabled/busy with visible pending copy and is no longer the active/focusable element. Further Enter/Space input and `HTMLElement.click()` while disabled are no-ops; siblings remain enabled. After failure returns it to enabled, the retry is focused and activated with Space, proving both native keyboard activation paths without pretending a disabled button can retain focus. Component tests own exact service-call counting.
- The block captures `screenshots/ha-action-error.png` after failure for controller inspection. It keeps the live-instance picker/action success spot-check as one truthful SKIP and does not call adapter-held origins native grants.
- After proving retry re-enters pending, the block waits for the retry's natural second alert and enabled state before hiding or tearing down the widget. It then restores all Aurora storage keys/viewport/native boundaries using the existing W1-P4 locked all-key finalizer; no Home Assistant request may survive into downstream probes.

- [ ] **Step 1: Update the existing Home Assistant action probe**

Replace the 1,200 ms auto-clear expectations with individually countable assertions for:

1. focusing the enabled action and pressing Enter exposes `aria-busy="true"`, disabled state, `Running Porch plug…`, and moves focus away from the now-disabled button before settlement;
2. further Enter/Space input plus `HTMLElement.click()` while disabled are no-ops; exact one-call evidence stays at the component service boundary;
3. sibling action buttons remain enabled and idle while the target is pending;
4. natural failure exposes `Couldn't run Porch plug. Try again.` through a persistent alert and returns the target button to enabled;
5. the error remains after the former 1,200 ms window; focusing the re-enabled button and pressing Space starts the retry and re-enters pending;
6. the retry naturally settles to a second persistent alert and enabled button before teardown, proving quiescence;
7. seeded `{ entities: null }` still hides chips, actions, and feedback together;
8. Settings renders the exact picker-only bulk/regular-selected disclosure;
9. a Chromium accessibility-tree probe uses `context.newCDPSession(page)` with `Accessibility.getFullAXTree` during pending/error and emits one countable PASS only when the action button exposes its name, disabled/busy state and described pending text, the pending node is a live status, and the failure node is an alert with the complete retry message;
10. screenshot `screenshots/ha-action-error.png` is visually legible and does not rely on red alone.

- [ ] **Step 2: Build preview and run the full harness once**

```powershell
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p5-harness-first.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w1-p5-harness-first.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w1-p5-harness-first.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w1-p5-harness-first.log -Pattern '^SKIP:').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
if ($fail -ne 0) { throw "Preview harness logged $fail FAIL lines" }
if ($pass -ne 437 -or $skip -ne 3) { throw "Expected W1-P5 harness totals PASS=437 SKIP=3, got PASS=$pass SKIP=$skip" }
```

Expected after Tasks 1-2: 437 PASS / 0 FAIL / 3 SKIP. The checkpoint baseline is 432 / 0 / 3; three old action-result/auto-clear lines become six pending/disabled/error/persistence/retry/quiescence lines (+3), the Settings disclosure adds one PASS (+1), and the combined Chromium accessibility-tree inspection adds one PASS (+1). If implementation changes the line decomposition without changing acceptance, update the arithmetic in the plan before the plan-base commit; after that commit these totals are fixed. If a W1-P5 line fails, preserve exact evidence, reproduce a production defect with the smallest failing unit/component assertion before editing production, and follow red-green TDD. Remove the untracked first-run log after recording results.

- [ ] **Step 3: Inspect the screenshot and Chromium accessibility tree; fix only proven packet defects**

Inspect `screenshots/ha-action-error.png` at original resolution. Require readable pending/error text, visible focus/disabled distinction, no clipping at the existing 1600x1100 HA viewport, and meaning independent of color.

Read the harness's compact accessibility-tree summary captured from `Accessibility.getFullAXTree`. Require exact pending/error accessible names, the button's disabled/busy properties, its described-by pending relationship, live-status semantics, and alert semantics. Record this as Chromium accessibility-tree/screen-reader-oriented evidence, not as a real assistive-technology or successful-live-action run. A real Home Assistant action through the user's screen reader remains a separate user-instance/manual ceiling. Any production visual/semantic correction starts with the smallest automated regression and stays within the existing component surface; no global design work enters W1-P5.

- [ ] **Step 4: Run the complete W1-P5 verification gate**

Run the exact targeted suite:

```powershell
npx vitest run src/services/connectors/homeassistant.test.ts src/services/connectors/registry.test.ts src/lib/hooks/useConnectorSnapshot.test.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx src/settings/sections/EntityPickerDialog.test.tsx src/settings/sections/TokenConnectForm.test.tsx src/settings/PermissionCleanupAlert.test.tsx src/settings/usePermissionCleanup.test.tsx src/settings/SettingsPanel.test.tsx
```

Then run fresh:

```powershell
npx tsc --noEmit
npm test
npm run build
rg -n "__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist
if ($LASTEXITCODE -ne 1) { throw 'Preview-only Aurora bridge leaked into production dist' }
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p5-harness.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w1-p5-harness.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w1-p5-harness.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w1-p5-harness.log -Pattern '^SKIP:').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
if ($fail -ne 0) { throw "Preview harness logged $fail FAIL lines" }
if ($pass -ne 437 -or $skip -ne 3) { throw "Expected W1-P5 harness totals PASS=437 SKIP=3, got PASS=$pass SKIP=$skip" }
git diff --check
git status --short
```

Requirements:

- targeted/full Vitest, TypeScript, production build, and preview build have zero failures;
- the production bridge search exits 1 with no match;
- the full harness process exits 0 and the hard gates prove exactly 437 PASS / 0 FAIL / 3 SKIP;
- W1-P5 evidence covers selected per-entity endpoints, picker-only bulk access, action-only real health, double activation, stale poll/action generation, retry, and announced persistent states;
- the live Home Assistant entity picker and successful real service action remain explicit headed/user-instance ceilings unless the environment genuinely supplies them;
- W1-P1 scoped snapshots, W1-P3 permission ownership, and W1-P4 restore/teardown evidence do not regress;
- no W1-P6 or later behavior enters the diff.

Delete untracked harness logs after recording counts.

- [ ] **Step 5: Commit the verified harness integration**

```powershell
git add scripts/preview.mjs
git commit -m "test(ha): prove safe actions in extension"
```

If Task 3 exposed a production/test defect, commit only its exact packet-local files separately before the harness commit. Record the resulting HEAD as the implementation head before whole-packet review.

---

### Task 4: Bounded whole-packet review, fix round, checkpoint, push, and stop

**Files:**

- Review: `W1_P5_PLAN_BASE..HEAD`
- Modify after final verification: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after final verification: `docs/superpowers/aurora-2/STATUS.md`
- Modify after final verification: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Produces: reviewed W1-P5 implementation commits.
- Produces: dedicated `docs: checkpoint W1-P5` handoff commit.
- Produces: pushed `origin/feat/aurora-2-observatory`, clean target/original worktrees, and a W1-P6 continuation prompt without a W1-P6 plan.

- [ ] **Step 1: Request the bounded independent implementation review**

Dispatch a read-only reviewer with plan-base SHA, implementation HEAD, this plan, master spec sections 10.1/10.2/10.4/11/12/13/16, ROADMAP W1-P5, A2-D008/A2-D012/A2-D013, official endpoint semantics, and the complete diff. Require exact file/line references and Critical/Important/Minor severity. Inspect specifically:

- bulk `/api/states` is picker-only and disclosure matches runtime behavior;
- regular polling requests only deduped selected entity endpoints, treats 404 as missing, and fails closed on authentication/network/malformed responses;
- action-only visibility depends on authenticated narrow network health;
- W1-P1 scope/generation/queued-write contracts still reject stale polls;
- per-action synchronous guards cover click and keyboard, stay independent, and never deadlock retry;
- action generation prevents old completions from changing UI or releasing a newer pending request;
- pending/success/error are visible, persistent enough, programmatically announced, associated with the action, and not color-only;
- secrets stay out of URLs, logs, persisted status, snapshots, and harness output;
- W1-P3 permission lifecycle/ownership and W1-P4 restore/teardown remain intact;
- preview evidence is deterministic, truthful about the live-instance ceiling, absent from production, and contains no W1-P6 scope.

- [ ] **Step 2: Verify and fix confirmed findings with TDD**

For each finding, inspect the cited evidence. Reproduce every confirmed defect with the smallest failing unit/component/harness assertion before production edits. Fix confirmed Critical/Important and packet-local Minor correctness findings in one bounded fix wave. Reject unsupported or out-of-scope suggestions with code/spec evidence. Review `git status --short`, stage only the literal confirmed-fix files, inspect the staged set/diff, and commit fixes separately:

```powershell
git status --short
git add -- src/services/connectors/homeassistant.ts src/services/connectors/homeassistant.test.ts src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx src/settings/sections/Connectors.tsx src/settings/SettingsPanel.test.tsx scripts/preview.mjs
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m "fix(ha): address W1-P5 review"
```

Request one scoped rereview over the fix range. No Critical/Important or packet-local correctness finding may remain. After any fix, rerun Task 3 Step 4 completely and re-inspect `screenshots/ha-action-error.png` if visible output changed.

- [ ] **Step 3: Update durable ledgers after fresh final verification**

Update:

- `ROADMAP.md`: mark W1-P5 `Verified`, link this plan, record exact acceptance evidence, implementation SHA, review disposition, and checkpoint subject; leave W1-P6 `Not started` with no plan.
- `STATUS.md`: record the W1-P5 envelope, plan/implementation/review commits, exact targeted/full/type/build/harness counts, official endpoint boundary, screen-reader/action evidence, live-instance ceilings, clean state, and W1-P6 as the single next packet.
- `DECISIONS.md`: append A2-D014 recording picker-only bulk state access, selected-entity polling, narrow action-only health, synchronous per-action pending, in-memory generation rejection, persistent accessible feedback, and headed/live-instance evidence limits.

Commit only the ledger handoff:

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git commit -m "docs: checkpoint W1-P5"
```

- [ ] **Step 4: Push, prove clean state, prepare the next prompt, and stop**

```powershell
git push origin feat/aurora-2-observatory
git status --short --branch
git rev-parse HEAD
git rev-parse '@{upstream}'
git log -12 --oneline
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
```

Require local/upstream equality, no target-worktree entries, and the protected original still clean at recorded starting HEAD `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Provide a ready-to-paste next-session prompt naming the literal worktree, branch, checkpoint HEAD, verified W1-P5 implementation SHA, Packet `W1-P6`, required documents, and instruction to create/review its plan just in time. Stop before creating a W1-P6 plan or changing weather behavior.
