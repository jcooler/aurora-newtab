# W2-P1 Shared Async and Freshness State Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Aurora one reusable, accessible contract for pending/success/error operations and data freshness, then adopt it at the verified Notes, Home Assistant action, connector-snapshot, and Weather seams without changing their Wave 1 ownership or persistence behavior.

**Architecture:** Add a pure state algebra in `src/lib` that keeps asynchronous outcome and freshness orthogonal, plus shared render-only feedback components under `src/components`. Producers derive semantic state from their existing authoritative data, timestamps, pending flags, and errors; consumers render the shared live-region contract while retaining their current visual copy and retry controls. No primitive owns requests, timers, storage, permissions, or layout.

**Tech Stack:** React 19, strict TypeScript 5.9/ES2022, Vitest 3, Testing Library, Tailwind CSS 4, Playwright built-extension harness, Chrome Manifest V3.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 3, 4, 5.5, 6, 7, 10.1, 10.4, 10.6, 12, 13, 15, and 16; `docs/superpowers/aurora-2/ROADMAP.md` W2-P1; A2-D004, A2-D008, A2-D014, A2-D015, A2-D017, A2-D018, and A2-D019 in `docs/superpowers/aurora-2/DECISIONS.md`; verified W1-P1, W1-P5, W1-P6, W1-P8, and W1-P9 plans/checkpoints; current code at checkpoint `e2cdb8b4d420fd677bb1547feaed78b5e1574f58`.

## Global Constraints

- Execute only W2-P1. W2-P2 retains Focus editor stability, calendar-source names, Home Assistant picker headings/relationships, DrawerBoundary reset, backup/Quick Link announcements, keyboard/Escape/focus restoration. W2-P3 retains 320 CSS px/400% Settings and tool reflow. Do not start Adaptive Stage, registry/BoardItem, Arrange V2, widget variants, Utility Tray, release packaging, or Store work.
- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; preserve clean protected `D:\DEV\Chrome plugin` on `main` at `eb1354b6a5b041fb6d494655c3dae1862572bc51` and every V1 artifact.
- Preserve W1 ownership: `useConnectorSnapshot` remains the configuration/scope/generation/TTL/dedupe/cache authority; `useWeather` remains the coordinate identity/abort/generation/storage authority; Home Assistant retains per-action synchronous exclusion and five-input generations; Notes retains revision-owned serialized persistence, dirty text, awaited close, and Retry.
- The new state module is pure: no React, DOM, timers, storage, fetch, `chrome.*`, connector configuration, raw payload, URL, token, or logging. The render components own semantics only and do not start, retry, cancel, or persist work.
- Async outcome and freshness remain separate. `operation` is exactly `idle | pending | success | error`; `freshness` is exactly `unknown | fresh | stale`; retained cached data may be stale while an operation is pending or has failed. Never collapse that combination into a misleading single success/loading flag.
- A retained failure is also independent from the currently running operation. In particular, Notes retry is `{ operation: 'pending', retainedError: true }` until the retry succeeds, so the existing error and Retry affordance do not disappear while the retry owns the write.
- Healthy/fresh state is quiet. Pending and success use a visible polite atomic status; errors use a visible atomic alert; stale/offline resource feedback is visible and polite, not color-only or `title`-only. An invoking control uses `aria-busy` while pending and `aria-describedby` while feedback is present.
- Preserve current user copy unless this plan names an exact replacement. Do not surface raw caught network/provider messages in new UI. No new dependency is authorized: automated accessibility coverage uses Testing Library against real DOM roles/names/states and the built Chromium accessibility tree.
- Every production behavior begins with a witnessed failing test. Keep hand-written literal expected values; do not derive expectations with the state helper under test or assert only on mocks.
- A harness-touching packet builds production and preview, proves preview-only symbols remain absent from production, runs the full foreground built-extension harness, and records the three unchanged manual SKIPs honestly. Inspect W2-P1 screenshots at original resolution; Chromium AX evidence is not called a real screen-reader run.
- Commit the independently reviewed plan before implementation. Each implementation task commits its tested work. After bounded packet review/fixes and a complete fresh verification gate, create a separate `docs: checkpoint W2-P1`, push, prove equality/cleanliness, and immediately begin W2-P2 under A2-D019.

---

### Task 0: Independently review and commit the executable plan

**Files:**

- Review/fix: `docs/superpowers/plans/2026-08-14-w2-p1-shared-async-freshness-state-primitives.md`

**Interfaces:**

- Produces: immutable `W2_P1_PLAN_BASE`, the plan-only commit used as the implementation/review base.

- [ ] **Step 1: Request bounded independent plan review**

Dispatch a fresh read-only reviewer against this plan, the complete master specification, ROADMAP W2-P1/W2-P2/W2-P3 boundaries, A2-D004/A2-D008/A2-D014/A2-D015/A2-D017/A2-D019, the W1-P1/W1-P5/W1-P6/W1-P8 verified evidence, and current implementations/tests for `useConnectorSnapshot`, `useWeather`, Weather, Notes, Home Assistant actions, shared Settings status/error surfaces, and `scripts/preview.mjs`. Require Critical/Important/Minor findings with exact plan/code references. Inspect specifically:

1. orthogonal pending/success/error and unknown/fresh/stale modeling, including no-data failure, cached-data failure, retry-pending-after-error, scope changes, and exact TTL boundaries;
2. reusable DOM semantics, stable descriptions, atomic announcements, assertive-versus-polite behavior, visible/non-color-only meaning, duplicate-announcement risk, and keyboard-operable retries;
3. preservation of W1 request/storage/generation/permission/Notes contracts with no new async authority or raw error disclosure;
4. whether the migration is sufficient for the future BoardItem/Signal Dock while not entering W2-P2/W2-P3/W3 work;
5. non-tautological RED/GREEN tests, built-extension/AX evidence, screenshot scope, full harness totals, durable ledgers, clean-state proof, and automatic W2-P2 continuation.

Fix every confirmed Critical/Important and packet-local Minor correctness gap in the plan. Record rejected findings with source/spec evidence in the plan-review report; do not broaden the packet.

- [ ] **Step 2: Self-review and commit the plan**

```powershell
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
rg -n "TB[D]|TO[D]O|implement late[r]|fill in detail[s]|similar t[o]|appropriate error handlin[g]|write tests fo[r]" docs/superpowers/plans/2026-08-14-w2-p1-shared-async-freshness-state-primitives.md
git add docs/superpowers/plans/2026-08-14-w2-p1-shared-async-freshness-state-primitives.md
git diff --cached --check
git diff --cached -- docs/superpowers/plans/2026-08-14-w2-p1-shared-async-freshness-state-primitives.md
git commit -m "docs: plan W2-P1 shared async state"
git rev-parse HEAD
```

Expected: protected original clean at `eb1354b6a5b041fb6d494655c3dae1862572bc51`; placeholder search exit 1/no matches; diff check clean; one plan-only commit. Record the full SHA as `W2_P1_PLAN_BASE`.

---

### Task 1: Pure async/freshness algebra and accessible feedback renderers

**Files:**

- Create: `src/lib/asyncState.ts`
- Create: `src/lib/asyncState.test.ts`
- Create: `src/components/StateFeedback.tsx`
- Create: `src/components/StateFeedback.test.tsx`
- Modify: `scripts/preview.mjs`

**Interfaces:**

```ts
export type OperationState = 'idle' | 'pending' | 'success' | 'error'
export type FreshnessState = 'unknown' | 'fresh' | 'stale'

export interface OperationFeedbackState {
  operation: OperationState
  retainedError: boolean
}

export interface AsyncResourceState {
  operation: OperationState
  freshness: FreshnessState
  hasData: boolean
}

export function freshnessAt(
  fetchedAt: number | null,
  ttlMs: number,
  now: number,
): FreshnessState

export function resourceStateOf(input: {
  hasData: boolean
  fetchedAt: number | null
  ttlMs: number
  pending: boolean
  error: string | null
  now: number
}): AsyncResourceState
```

`freshnessAt` returns `unknown` only for `null`, `fresh` while `now - fetchedAt < ttlMs`, and `stale` at the exact `>= ttlMs` boundary. `now` is required: producers capture `Date.now()` exactly once per derivation/render and pass that value through. A non-finite `fetchedAt`, non-finite `now`, non-finite `ttlMs`, or negative `ttlMs` throws `RangeError`; tests name each invalid input. `resourceStateOf` sets `operation` to `pending` when work is in flight, otherwise `error` when an error exists, otherwise `success` when data exists, otherwise `idle`; it never erases the independently derived freshness.

`PoliteStatus` accepts literal React content plus optional `id` and `className`; it keeps one visible `role="status"`, `aria-live="polite"`, `aria-atomic="true"` region mounted even when its content is empty. `AssertiveAlert` accepts literal React content plus optional `id` and `className`; it renders one visible `role="alert"`, `aria-atomic="true"` only when content exists. These small render-only pieces may be placed separately in an existing layout, so Notes can retain its header status and body-level failure. They never duplicate content or add nested live regions.

`ResourceFeedback` accepts `state`, literal `loading`/`refreshing`/`stale`/`offline`/`unavailable` content, optional `id`, and class name. It selects: pending without data -> loading; pending with data -> refreshing; error without data -> unavailable alert; error with data -> offline polite status; idle/success plus stale -> stale polite status; fresh/unknown quiet states -> empty polite status. It does not invent copy or inspect caught errors.

- [ ] **Step 1: Author and witness the built-extension acceptance RED on the plan base**

Before any production module is created or any consumer is migrated, add the exact final W2-P1 aggregate assertion to `scripts/preview.mjs` at the existing deterministic Notes/Home Assistant/Weather fixture seams. It must test the browser behaviors enumerated in Task 4 Step 1 and emit exactly one named `FAIL: W2-P1 shared async and freshness semantics` while all older assertions retain their baseline result.

```powershell
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w2-p1-harness-red.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w2-p1-harness-red.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w2-p1-harness-red.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w2-p1-harness-red.log -Pattern '^SKIP:').Count
$namedFail = (Select-String -Path w2-p1-harness-red.log -Pattern '^FAIL: W2-P1 shared async and freshness semantics$').Count
if ($pass -ne 451 -or $fail -ne 1 -or $skip -ne 3) { throw "Expected RED PASS=451 FAIL=1 SKIP=3, got PASS=$pass FAIL=$fail SKIP=$skip" }
if ($namedFail -ne 1) { throw "Expected exactly one named W2-P1 RED line, got $namedFail" }
Remove-Item -LiteralPath w2-p1-harness-red.log
```

Expected: the process itself remains healthy, the one new assertion fails for the named missing W2-P1 contract, all 451 older assertions still pass, and the three established manual SKIPs are unchanged. Record the output in the W2-P1 SDD ledger. Do not use an inverted expectation or a marker produced by the test itself.

- [ ] **Step 2: Write failing pure and DOM behavior tests**

Write literal table tests for every boundary and combination, including:

```ts
expect(freshnessAt(1_000, 5_000, 5_999)).toBe('fresh')
expect(freshnessAt(1_000, 5_000, 6_000)).toBe('stale')
expect(resourceStateOf({ hasData: true, fetchedAt: 1_000, ttlMs: 5_000, pending: true, error: 'offline', now: 6_000 }))
  .toEqual({ operation: 'pending', freshness: 'stale', hasData: true })
```

Also prove every invalid clock/TTL case throws `RangeError`, and that required `now` makes every table deterministic.

Render real components and assert:

- pending/success text supplied to `PoliteStatus` appears in one `role="status"` with `aria-live="polite"` and `aria-atomic="true"`;
- idle clears text but keeps the same live-region element after rerender;
- error supplied separately to `AssertiveAlert` yields exactly one `role="alert"`, preserves the supplied `id`, and is not duplicated in the status region;
- cached failure uses polite offline content while no-data failure uses an alert;
- stale and refreshing are visible statuses; ready/fresh is quiet;
- a real Retry button supplied inside error content remains named, enabled, and keyboard-clickable.

- [ ] **Step 3: Run unit RED**

```powershell
npx vitest run src/lib/asyncState.test.ts src/components/StateFeedback.test.tsx
```

Expected: FAIL because neither module exists. Preserve the output in the W2-P1 SDD ledger as the primitive RED witness.

- [ ] **Step 4: Implement the minimal pure algebra and renderers**

Use exhaustive `switch`/branching with no timers or internal state. Keep rendered roles native and content visible; do not add `aria-live` to `role="alert"` or create nested live regions. Forward no arbitrary HTML attributes except the documented `id` and class names. Keep `OperationFeedbackState` as pure data: renderers do not infer away `retainedError` when `operation` is pending.

- [ ] **Step 5: Run primitive GREEN and commit the acceptance contract**

```powershell
npx vitest run src/lib/asyncState.test.ts src/components/StateFeedback.test.tsx
npx tsc --noEmit
git diff --check
git add src/lib/asyncState.ts src/lib/asyncState.test.ts src/components/StateFeedback.tsx src/components/StateFeedback.test.tsx scripts/preview.mjs
git diff --cached --check
git commit -m "feat(a11y): add shared async state feedback"
```

The focused primitive suite is GREEN at this commit. The new built-extension aggregate remains the intentional packet-level RED until Tasks 2 and 3 migrate the real consumers; reviewers must not reinterpret that single named acceptance failure as an older regression.

---

### Task 2: Export semantic state from connector and Weather authorities

**Files:**

- Modify: `src/lib/hooks/useConnectorSnapshot.ts`
- Modify: `src/lib/hooks/useConnectorSnapshot.test.tsx`
- Modify: `src/newtab/widgets/weather/useWeather.ts`
- Modify: `src/newtab/widgets/weather/useWeather.test.tsx`
- Modify: `src/newtab/widgets/weather/WeatherWidget.tsx`
- Modify: `src/newtab/widgets/weather/WeatherWidget.test.tsx`

**Interfaces:**

- `useConnectorSnapshot` preserves `data`, `fetchedAt`, `refreshing`, and `lastError`, and adds `state: AsyncResourceState` derived with the hook's exact `ttlMs` and current render time.
- `useWeather` preserves `snapshot`, `stale`, `loading`, `error`, and `refresh`, and adds `state: AsyncResourceState` derived with `MAX_AGE_MS`.
- Weather renders one `ResourceFeedback` using exact existing copy: `Loading weather…`, `Refreshing…`, `Updated a while ago`, `Offline — showing cached`, and `Weather unavailable. Try again.` It does not render raw provider errors. A stable `useId()` feedback ID associates the real Refresh control with current feedback. The no-snapshot error state gains a named Refresh control; the existing expanded cached Refresh control remains in place. During either retry, that control stays rendered, disabled, `aria-busy="true"`, and described by the single pending status until completion. Expansion geometry and request ownership remain unchanged.

- [ ] **Step 1: Add failing producer-state and Weather accessibility tests**

Extend the connector probe to print `operation`, `freshness`, and `hasData`. Prove no snapshot/pending, fresh success, exact-boundary stale refresh, cached-data rejection, no-data rejection, and retry-pending-after-error without deriving expectations from `resourceStateOf`.

Extend `useWeather.test.tsx` with literal assertions for initial loading, fresh success, exact-boundary stale, cached offline, no-data error, and refresh retry. Extend `WeatherWidget.test.tsx` to prove the visible shared status/alert copy, polite versus assertive roles, exact one status line inside the whole collapsed toggle, and the following two complete keyboard paths without raw error disclosure:

1. no-data failure -> named enabled Refresh -> keyboard activation -> same control pending/busy/disabled and described by one polite loading status -> success;
2. cached failure -> expanded named enabled Refresh -> keyboard activation -> same control pending/busy/disabled and described by one polite refreshing status while cached content remains -> success.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run src/lib/hooks/useConnectorSnapshot.test.tsx src/newtab/widgets/weather/useWeather.test.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx
```

Expected: FAIL because producers expose no semantic `state`, Weather uses local branching, pending cached refresh is not announced, and a no-cache provider failure exposes the caught message rather than the bounded unavailable copy.

- [ ] **Step 3: Implement semantic derivation and the Weather consumer**

Derive state after the existing current-scope/matching-identity filters so previous-account/location data cannot influence it. Capture one finite `Date.now()` value immediately before each semantic derivation and pass it as required `now`; do not let the helper read the clock. Do not move effects, clear/retain errors differently, change TTL math, add requests, or change storage writes. Place Weather resource feedback inside the existing whole-chip toggle when data exists so hit-target structure stays one button; use the existing no-snapshot surface plus its new Refresh control when data is absent.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npx vitest run src/lib/asyncState.test.ts src/components/StateFeedback.test.tsx src/lib/hooks/useConnectorSnapshot.test.tsx src/newtab/widgets/weather/useWeather.test.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx
npx tsc --noEmit
git diff --check
git add src/lib/hooks/useConnectorSnapshot.ts src/lib/hooks/useConnectorSnapshot.test.tsx src/newtab/widgets/weather/useWeather.ts src/newtab/widgets/weather/useWeather.test.tsx src/newtab/widgets/weather/WeatherWidget.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx
git diff --cached --check
git commit -m "feat(a11y): expose shared resource freshness"
```

---

### Task 3: Migrate verified Notes and Home Assistant operation feedback

**Files:**

- Modify: `src/newtab/widgets/notes/useNotesPersistence.ts`
- Modify: `src/newtab/widgets/notes/useNotesPersistence.test.tsx`
- Modify: `src/newtab/widgets/notes/NotesPanel.tsx`
- Modify: `src/newtab/widgets/notes/NotesPanel.test.tsx`
- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx`
- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx`

**Interfaces:**

- Notes exposes shared `OperationFeedbackState`: `operation` reports the current write (`idle | pending | success | error`) and `retainedError` independently preserves the W1-P8 failure latch. Its user copy remains `Saving…`, `Saved`, and `Couldn’t save. Your note is still here.`. After an initial failure, retry pending is exactly `{ operation: 'pending', retainedError: true }`; success clears the retained error.
- Home Assistant `ActionState` becomes shared `OperationState`; the visual class map uses all four exact keys. `ActionButton` keeps synchronous per-action pending exclusion and generation ownership.
- Both surfaces use `PoliteStatus` and `AssertiveAlert` in their existing layout positions. Notes keeps the real Retry button inside the retained alert, gives only the fixed error-message span a stable ID, and points Retry's `aria-describedby` to that span so its description does not repeat its own name. While retry is pending, the alert and button remain mounted, the button becomes disabled plus `aria-busy="true"`, and that association remains stable. Home Assistant supplies its existing action-specific messages and preserves its button busy/disabled/described-by behavior.

- [ ] **Step 1: Write failing integration tests for the shared renderer contract**

Before production edits, strengthen real integration tests to require:

- Notes reuses one stable polite atomic status element from Saving through Saved to idle, exposes exactly one atomic alert on rejection, retains a keyboard-clickable 36px Retry button, and never duplicates failure into status text;
- after rejection, a deferred retry proves the alert remains visible while the stable Retry button is pending/busy/disabled, its exact accessible name is `Retry save`, and its exact description is only `Couldn’t save. Your note is still here.`; success then clears the alert and announces Saved;
- Home Assistant pending and success reuse one polite atomic status, error replaces it with exactly one atomic alert, the button description points at current feedback, pending exposes busy/disabled, and retry plus configuration-generation races remain unchanged;
- after a stale completion, the still-mounted polite region is empty; after unmount, no status or alert remains in the document.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run src/newtab/widgets/notes/useNotesPersistence.test.tsx src/newtab/widgets/notes/NotesPanel.test.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx
```

Expected: FAIL on the new stable/shared atomic contract before the migration; existing persistence and generation tests remain green.

- [ ] **Step 3: Migrate presentation only**

Map Notes' `saving`/`saved` internal names to shared `pending`/`success`, but keep the retained failure latch independent throughout retry. Do not change debounce, revision, error retention, close, unload, or flush behavior. Replace Home Assistant's local state type/presenter only; do not touch `handlePress` ownership or service calls.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npx vitest run src/components/StateFeedback.test.tsx src/newtab/widgets/notes/useNotesPersistence.test.tsx src/newtab/widgets/notes/NotesPanel.test.tsx src/newtab/widgets/notes/NotesWidget.test.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx src/services/connectors/homeassistant.test.ts
npx tsc --noEmit
git diff --check
git add src/newtab/widgets/notes/useNotesPersistence.ts src/newtab/widgets/notes/useNotesPersistence.test.tsx src/newtab/widgets/notes/NotesPanel.tsx src/newtab/widgets/notes/NotesPanel.test.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx
git diff --cached --check
git commit -m "refactor(a11y): share operation feedback semantics"
```

---

### Task 4: Built-extension evidence, packet review, verification, checkpoint, push, and continuation

**Files:**

- Review: `scripts/preview.mjs`
- Generate/inspect, do not commit: `screenshots/w2-p1-async-feedback-800x600.png`
- Generate/inspect, do not commit: `screenshots/w2-p1-async-feedback-1600x1100.png`
- Generate/inspect, do not commit: `screenshots/w2-p1-async-feedback-2560x1440.png`
- Generate/inspect, do not commit: `screenshots/w2-p1-weather-freshness-800x600.png`
- Generate/inspect, do not commit: `screenshots/w2-p1-weather-freshness-1600x900.png`
- Generate/inspect, do not commit: `screenshots/w2-p1-weather-freshness-2560x1440.png`
- Review: `W2_P1_PLAN_BASE..HEAD`
- Modify after fresh verification: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after fresh verification: `docs/superpowers/aurora-2/STATUS.md`
- Modify after fresh verification: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Adds exactly one W2-P1 aggregate harness assertion, moving full expected totals from `451 PASS / 0 FAIL / 3 SKIP` to `452 PASS / 0 FAIL / 3 SKIP`.
- Produces reviewed W2-P1 implementation commits plus dedicated `docs: checkpoint W2-P1`, pushed local/upstream equality, clean target/protected-original proof, and immediate transition to W2-P2 with no combined plan or implementation.

- [ ] **Step 1: Complete and inspect the pre-authored built-extension contract**

At the existing deterministic Notes/Home Assistant/Weather fixture points, capture one aggregate result only after proving in the built page:

- Notes pending/success share a polite atomic status; rejection is an atomic alert with named enabled Retry and no duplicate polite failure;
- one Home Assistant action is genuinely pending/busy/disabled with associated polite text while its sibling shows a persistent associated alert and remains retryable;
- a seeded stale Weather snapshot with its request held exposes visible polite `Refreshing…`, then a routed failure exposes polite `Offline — showing cached`; no raw provider error appears.

Capture both relevant states at compact 800x600, standard 1600x1100 (Weather may use 1600x900), and large-display 2560x1440 using the six exact filenames above. Inspect all six at original resolution for readable non-color-only text, visible focus, no clipping, and unchanged panel/chip geometry. Query `Accessibility.getFullAXTree` for named status/alert/button/busy semantics and state explicitly that this is Chromium AX evidence, not a real screen-reader run.

Task 1 already authored this exact assertion and recorded its named 451/1/3 RED result against the plan-base preview build. Do not invert or regenerate that witness. Complete the real consumer behavior until the same unchanged assertion passes.

- [ ] **Step 2: Run focused built-extension GREEN**

```powershell
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w2-p1-harness-focused.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w2-p1-harness-focused.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w2-p1-harness-focused.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w2-p1-harness-focused.log -Pattern '^SKIP:').Count
$namedPass = (Select-String -Path w2-p1-harness-focused.log -Pattern '^PASS: W2-P1 shared async and freshness semantics$').Count
if ($pass -ne 452 -or $fail -ne 0 -or $skip -ne 3) { throw "Expected PASS=452 FAIL=0 SKIP=3, got PASS=$pass FAIL=$fail SKIP=$skip" }
if ($namedPass -ne 1) { throw "Expected exactly one named W2-P1 GREEN line, got $namedPass" }
Remove-Item -LiteralPath w2-p1-harness-focused.log
git diff --check
```

Expected: the exact pre-authored assertion moves from the witnessed named RED to GREEN because the real browser-visible Notes, Home Assistant, and Weather contracts now hold; no harness-only fallback or self-produced marker is accepted.

- [ ] **Step 3: Request bounded whole-packet review and fix confirmed findings**

Dispatch a fresh read-only reviewer over `W2_P1_PLAN_BASE..HEAD` with this plan, master spec sections 5.5/6/7/10/12/13/16, ROADMAP W2-P1 boundaries, relevant decisions, complete diff, RED/GREEN reports, screenshot paths, AX output, and test/build/harness results. Require exact file/line references and Critical/Important/Minor severity. Inspect:

- state algebra truth tables, timestamp/TTL edge cases, cached error/retry combinations, scope/location isolation, and quiet fresh state;
- stable/deduplicated live regions, correct politeness, atomicity, visible meaning, control association/busy/disabled/retry behavior, and no raw error leakage;
- preservation of W1 connector/Weather/Notes/Home Assistant ownership, no effect dependency/race regression, and no W2-P2/W2-P3/W3 scope entry;
- reusable component boundaries suitable for BoardItem/Signal Dock without coupling to current layout;
- real behavior tests, built-extension/AX truth, screenshot inspection, production isolation, ledger evidence, V1 protection, and A2-D019 continuation.

Reproduce confirmed code defects with the smallest failing test before fixes. Fix confirmed Critical/Important and packet-local Minor correctness findings in one bounded wave, commit as `fix(a11y): address W2-P1 review`, and request one focused rereview. No Critical/Important or packet-local correctness finding may remain. After any fix, rerun Step 4 completely.

- [ ] **Step 4: Run the complete fresh W2-P1 verification gate**

```powershell
npx vitest run src/lib/asyncState.test.ts src/components/StateFeedback.test.tsx src/lib/hooks/useConnectorSnapshot.test.tsx src/newtab/widgets/weather/useWeather.test.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx src/newtab/widgets/notes/useNotesPersistence.test.tsx src/newtab/widgets/notes/NotesPanel.test.tsx src/newtab/widgets/notes/NotesWidget.test.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx src/services/connectors/homeassistant.test.ts
npx tsc --noEmit
npm test
npm run build
rg -n "__auroraStorageHarness|__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist
if ($LASTEXITCODE -ne 1) { throw 'Preview-only Aurora bridge leaked into production dist' }
npm audit --omit=dev
npm audit --include=dev
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w2-p1-harness.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w2-p1-harness.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w2-p1-harness.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w2-p1-harness.log -Pattern '^SKIP:').Count
$namedPass = (Select-String -Path w2-p1-harness.log -Pattern '^PASS: W2-P1 shared async and freshness semantics$').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
if ($pass -ne 452 -or $fail -ne 0 -or $skip -ne 3) { throw "Expected PASS=452 FAIL=0 SKIP=3, got PASS=$pass FAIL=$fail SKIP=$skip" }
if ($namedPass -ne 1) { throw "Expected exactly one named W2-P1 GREEN line, got $namedPass" }
Remove-Item -LiteralPath w2-p1-harness.log
git diff --check
git status --short
```

Requirements: targeted/full Vitest, TypeScript, production/preview builds, audits, and the built-extension harness have zero failures; production bridge search exits 1; exactly 452/0/3 harness totals; screenshots and AX tree are personally inspected; W1-P1/W1-P5/W1-P6/W1-P8/W1-P9 behavior is unchanged; the three SKIPs remain the existing live Home Assistant/native NASA ceilings; no W2-P2 behavior enters the diff.

- [ ] **Step 5: Update durable ledgers and commit the checkpoint**

Update `ROADMAP.md` to mark W2-P1 Verified with this plan, implementation SHA(s), semantic/accessibility/visual/harness evidence, review disposition, and checkpoint subject while leaving W2-P2 Not started/no plan. Update `STATUS.md` to make W2-P1 the last verified packet, record exact tests/build/audit/harness/screenshot/AX/manual-ceiling evidence, clear dirty-file expectations, and name W2-P2 next. Append A2-D020 to `DECISIONS.md`: async outcome and freshness are orthogonal, state derivation is pure, feedback semantics are shared/render-only, healthy state is quiet, retained stale/offline data stays honest, and request/storage/generation authorities remain unchanged.

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git diff --cached --check
git commit -m "docs: checkpoint W2-P1"
```

- [ ] **Step 6: Push, prove clean state, and immediately begin W2-P2**

```powershell
git push origin feat/aurora-2-observatory
git status --short --branch
git rev-parse HEAD
git rev-parse '@{upstream}'
git rev-list --left-right --count 'HEAD...@{upstream}'
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' branch --show-current
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
git -C 'D:\DEV\Chrome plugin' rev-parse '@{upstream}'
```

Require target/upstream equality, no target entries, and protected original clean on `main` at `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Then re-read the master specification and durable ledgers, reverify provenance/cleanliness, create and independently review only the W2-P2 just-in-time plan, and continue automatically under A2-D019. Do not create a continuation prompt or combine W2-P2 with this packet.
