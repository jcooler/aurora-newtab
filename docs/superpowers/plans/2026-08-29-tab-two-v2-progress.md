# Tab Two V2 Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Use superpowers:test-driven-development for every behavior change and superpowers:verification-before-completion before any completion claim.

**Goal:** Ship the owner-approved local-first Progress experience: manual daily goals, an existing-Habits bridge, a dedicated Settings tab, and an optional intrinsic canvas rail.

**Architecture:** Add one validated top-level `progressGoals` authority and one off-by-default widget toggle. Keep all mutations as intent-based `storage.update` operations against the freshest stored array and current local-day key. Settings owns manual-goal configuration; `habits` remains the only Habit authority. The canvas renderer derives a maximum three-item rail and routes configuration back to Settings without adding network, account, permission, Attention, Briefing, or notification authority.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Chrome MV3 storage, Vitest, Testing Library, Playwright Chromium, Vite build provenance.

**Spec:** `docs/superpowers/specs/2026-08-29-tab-two-v2-progress-design.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`.
- Preserve `artifacts/` and `docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md` as untouched pre-existing untracked paths.
- Do not merge, release, publish, package for the Store, or change the Store listing.
- Do not paywall Habits or any existing connector or widget behavior.
- Do not add an account, sync, remote provider, host permission, background poll, analytics event, Attention signal, Briefing source, notification, sound, confetti, or custom-image storage behavior.
- Do not rewrite or auto-populate existing named layouts. The `progress` identity is available only after the user explicitly enables or places it.
- Keep Progress intrinsic and photo-first on the canvas. Do not introduce a generic opaque Standard or Full card.
- Use `useLocalDay()` for the rendered day. Never derive a daily key with UTC conversion.
- Use `storage.update(key, updater)` for every Progress or Habit mutation. Never persist a captured whole array.
- A failed write must retain the last stored value, announce `Progress was not saved. Try again.`, and retry the same intent against fresh storage.
- Every task starts with a failing focused test, reaches green with the smallest production change, and commits only its intended files.
- Before the final push, build exact `dist`, run the full stabilized gate once, run exact Chromium QA, and prove local/upstream commit equality.

---

## Task 1: Add the Progress domain, schema v20, backup, and privacy inventory

**Files:**

- Create: `src/lib/progress.ts`
- Create: `src/lib/progress.test.ts`
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/migrations.test.ts`
- Modify: `src/lib/storage/index.test.ts`
- Modify: `src/lib/storage/widgetToggleVersions.ts`
- Modify: `src/lib/storage/widgetToggleVersions.test.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/lib/backupRestore.test.ts`
- Modify: `src/privacy/dataFlows.ts`
- Modify: `src/privacy/dataFlows.test.ts`

### 1.1 Write failing domain tests

- [ ] Add pure tests for normalization, validation, daily value projection, add, increment, complete, reset, edit, reorder, delete, missing-row no-op, cap enforcement, and corrupted-row filtering.
- [ ] Include a stale-day case proving `displayValue(goal, nextDay) === 0` without mutating the input.
- [ ] Include delayed-intent cases proving a deleted goal is not recreated and an edit preserves the freshest order and current value.

Use this public domain shape:

```ts
export const MAX_PROGRESS_GOALS = 6
export const MAX_PROGRESS_NAME = 40
export const MAX_PROGRESS_UNIT = 16
export const MAX_PROGRESS_TARGET = 999_999

export type ProgressIntent =
  | { kind: 'increment'; id: string }
  | { kind: 'complete'; id: string }
  | { kind: 'reset'; id: string }
  | { kind: 'remove'; id: string }
  | { kind: 'move'; id: string; direction: -1 | 1 }
  | { kind: 'edit'; id: string; name: string; unit: string; target: number }
  | { kind: 'add'; id: string; name: string; unit: string; target: number; createdAt: number }

export function progressValueForDay(goal: ProgressGoal, todayKey: string): number
export function validateProgressDraft(input: { name: string; unit: string; target: number }): ProgressDraftResult
export function applyProgressIntent(goals: readonly ProgressGoal[], intent: ProgressIntent, todayKey: string): ProgressGoal[]
export function validProgressGoals(value: unknown): ProgressGoal[]
```

- [ ] Run `npx vitest run src/lib/progress.test.ts` and confirm RED because the module does not exist.

### 1.2 Implement the pure domain

- [ ] Add `ProgressGoal` to `src/lib/storage/schema.ts` exactly as approved.
- [ ] In `src/lib/progress.ts`, trim names and units, enforce the approved limits, clamp daily values to `0..target`, and return new arrays without mutating inputs.
- [ ] For `edit`, clamp the freshest current-day value if the new target is lower.
- [ ] For stale stored dates, `increment` starts from zero and atomically writes `{ date: todayKey, value: 1 }`; `complete` writes the new target; `reset` writes zero.
- [ ] For a missing id, every row-targeted intent returns the current rows unchanged.
- [ ] For `add`, enforce the six-goal UI boundary inside the updater as well as in the UI.
- [ ] Run `npx vitest run src/lib/progress.test.ts` and confirm GREEN.

### 1.3 Write failing schema and migration tests

- [ ] Assert `CURRENT_VERSION === 20`.
- [ ] Assert defaults contain `progressGoals: []` and `settings.widgets.progress === false`.
- [ ] Add a v19 snapshot with customized settings, all existing widget toggles, Habits, and layouts. Assert migration 19 preserves them and adds only the two new defaults.
- [ ] Extend the historical migration-chain test through v20.
- [ ] Run `npx vitest run src/lib/storage/migrations.test.ts src/lib/storage/index.test.ts src/lib/storage/widgetToggleVersions.test.ts` and confirm RED.

### 1.4 Implement schema v20

- [ ] Change `CURRENT_VERSION` from 19 to 20.
- [ ] Add `progress: boolean` to `WidgetToggles` and `progress: false` to defaults.
- [ ] Add `progressGoals: ProgressGoal[]` to `AuroraData` and `progressGoals: []` to defaults.
- [ ] Add migration `19` using both top-level and nested backfills:

```ts
19: (data) => {
  const d = defaults()
  const settings = data.settings
  if (!isPlainObject(settings)) return { ...data, progressGoals: [] }
  if (!isPlainObject(settings.widgets)) throw new Error('Invalid settings.widgets in schema v19')
  return {
    ...data,
    progressGoals: Object.prototype.hasOwnProperty.call(data, 'progressGoals')
      ? data.progressGoals
      : [],
    settings: {
      ...settings,
      widgets: { ...d.settings.widgets, ...settings.widgets },
    },
  }
},
```

- [ ] Extend the widget-toggle version registry for `progress` at v20.
- [ ] Run the focused schema tests and confirm GREEN.

### 1.5 Write failing backup and privacy tests

- [ ] Assert valid goals export verbatim, survive prepare/restore, and participate in rollback recovery.
- [ ] Assert a non-array `progressGoals` key rejects the import before confirmation.
- [ ] Assert malformed rows, malformed dates, non-integer values, invalid targets, overlong names, and overlong units are rejected for current-schema backups.
- [ ] Assert over-cap but otherwise valid arrays remain readable and round-trip.
- [ ] Assert the data-flow inventory classifies `progressGoals` as local user content with no secret, URL, network, permission, analytics, Attention, or notification authority.
- [ ] Run `npx vitest run src/lib/backup.test.ts src/lib/backupRestore.test.ts src/privacy/dataFlows.test.ts` and confirm RED.

### 1.6 Implement backup and privacy coverage

- [ ] Add strict current-schema `isProgressGoals` validation in `src/lib/backup.ts`; do not silently normalize malformed goal rows during import.
- [ ] Add `progressGoals: isProgressGoals` to `VALIDATORS`. Leave the existing backup redaction set unchanged so goals export as normal user content.
- [ ] Add the non-secret local storage flow to `src/privacy/dataFlows.ts`.
- [ ] Run all Task 1 tests and confirm GREEN.

### 1.7 Commit Task 1

```powershell
git add src/lib/progress.ts src/lib/progress.test.ts src/lib/storage/schema.ts src/lib/storage/migrations.ts src/lib/storage/migrations.test.ts src/lib/storage/index.test.ts src/lib/storage/widgetToggleVersions.ts src/lib/storage/widgetToggleVersions.test.ts src/lib/backup.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts src/privacy/dataFlows.ts src/privacy/dataFlows.test.ts
git commit -m "feat: add local progress goal authority"
```

---

## Task 2: Build the Progress Settings tab and manual-goal dialog

**Files:**

- Create: `src/components/ProgressRing.tsx`
- Create: `src/components/ProgressRing.test.tsx`
- Create: `src/settings/sections/Progress.tsx`
- Create: `src/settings/sections/Progress.test.tsx`
- Create: `src/settings/sections/ProgressGoalDialog.tsx`
- Create: `src/settings/sections/ProgressGoalDialog.test.tsx`
- Modify: `src/settings/SettingsPanel.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/settings/sections/Widgets.tsx`
- Modify: `src/settings/sections/Widgets.test.tsx` if present; otherwise keep integration assertions in `src/settings/SettingsPanel.test.tsx`

### 2.1 Write failing tab and overview tests

- [ ] Assert the Settings rail order is General, Progress, Widgets, Connectors, Data when Connectors is available, and General, Progress, Widgets, Data otherwise.
- [ ] Assert Progress renders the approved eyebrow, heading, support copy, empty state, and `Add progress` action.
- [ ] Seed two manual goals and two Habits. Assert manual goals render first in stored order and Habits follow in Habit order with visible `Habit` labels.
- [ ] Assert stale-day manual values render as zero without a storage write.
- [ ] Assert a seventh goal cannot be started and `Maximum of 6 manual goals.` appears.
- [ ] Run `npx vitest run src/settings/sections/Progress.test.tsx src/settings/SettingsPanel.test.tsx` and confirm RED.

### 2.2 Implement the tab shell and overview

- [ ] Extend `TabId` with `progress` and insert it after General in `tabsFor`.
- [ ] Read `progressGoals` in `SettingsPanel` and mount `<Progress>` only on the active Progress tab.
- [ ] Build `ProgressRing` with a conic gradient, a text equivalent such as `5 of 8 glasses complete`, and reduced-motion-safe transitions.
- [ ] In `Progress`, call `useLocalDay()` only while the Progress tab is mounted, derive Habit completion and streak from `habits`, and render manual rows before Habit rows.
- [ ] Keep every button at least 36px and use text plus color for source, value, completion, and action.
- [ ] Run the focused tests and confirm GREEN.

### 2.3 Write failing dialog and mutation tests

- [ ] Cover Add and Edit opening from exact invokers, initial focus, Tab wrapping, Shift+Tab wrapping, Escape, Cancel, backdrop close, Save, and exact focus restoration.
- [ ] Cover the three exact validation messages from the spec and prove invalid submissions write nothing.
- [ ] Cover increment, complete, reset, reorder, two-step delete, and delete disarming after close.
- [ ] Mock a same-id cross-tab refresh before an action and prove the updater preserves the fresh target, order, and value.
- [ ] Delete the goal in storage while the dialog remains open and prove Save cannot recreate it.
- [ ] Reject a storage update and assert the last stored value remains visible, the live region announces `Progress was not saved. Try again.`, and Retry reapplies the intent against fresh storage.
- [ ] Run `npx vitest run src/settings/sections/Progress.test.tsx src/settings/sections/ProgressGoalDialog.test.tsx` and confirm RED.

### 2.4 Implement the accessible dialog and fresh mutation boundary

- [ ] Build `ProgressGoalDialog` as a body portal using `useFocusTrap`, `useDialogEscape`, `role="dialog"`, `aria-modal="true"`, stable labelled/described ids, and an explicit invoker ref for focus return.
- [ ] Reseed form fields only on the closed-to-open transition. Do not overwrite in-progress edits when storage props refresh.
- [ ] Save Add/Edit by validating local fields and then calling `storage.update('progressGoals', goals => applyProgressIntent(goals, intent, readLocalDay().key))`.
- [ ] For every row action, create an intent object and execute it through the same fresh updater. Store only the failed intent for Retry, never a captured goal array.
- [ ] Use an `aria-live="polite"` status region for failure copy and Retry.
- [ ] Keep the delete button armed only in the current open dialog session.
- [ ] Run focused tests and confirm GREEN.

### 2.5 Preserve the Habits authority and settings route

- [ ] Add Habit `Done` and `Reopen` actions that call `storage.update('habits', list => list.map(...toggleDay(log, readLocalDay().key)))`.
- [ ] Refactor `SettingsPanel` to use one `focusSettingsTarget(tab, anchor)` helper for external deep links and internal navigation.
- [ ] `Manage habits` must switch to Widgets and focus `[data-settings-anchor="habits"]`; it must not add a Habit editor to Progress.
- [ ] Add `progress` to the Personal widget-toggle group. Enabling it changes only `settings.widgets.progress`; it does not create a layout placement.
- [ ] Run `npx vitest run src/settings/SettingsPanel.test.tsx src/settings/sections/Progress.test.tsx` and confirm GREEN.

### 2.6 Commit Task 2

```powershell
git add src/components/ProgressRing.tsx src/components/ProgressRing.test.tsx src/settings/sections/Progress.tsx src/settings/sections/Progress.test.tsx src/settings/sections/ProgressGoalDialog.tsx src/settings/sections/ProgressGoalDialog.test.tsx src/settings/SettingsPanel.tsx src/settings/SettingsPanel.test.tsx src/settings/sections/Widgets.tsx
git commit -m "feat: add progress settings experience"
```

---

## Task 3: Register the optional intrinsic Progress canvas identity

**Files:**

- Modify: `src/lib/layout/types.ts`
- Modify: `src/lib/layout/defaultPlacements.ts`
- Modify: `src/lib/layout/defaultPlacements.test.ts`
- Modify: `src/newtab/widgetSizeContracts.ts`
- Modify: `src/newtab/widgetSizeContracts.test.ts`
- Modify: `src/newtab/widgetRegistry.ts`
- Modify: `src/newtab/widgetRegistry.test.ts`
- Modify: `src/newtab/widgetRenderers.tsx`
- Modify: `src/newtab/widgetRenderers.test.tsx`
- Modify: `src/newtab/expansionWidgetContracts.test.ts`

### 3.1 Write failing identity contract tests

- [ ] Assert `progress` is a complete `BlockId`, appears once in the registry, uses `availability: { kind: 'widget', key: 'progress' }`, and selects only when the toggle is true.
- [ ] Assert its presentation contract is intrinsic, supports only Compact, supports a compact stack face, and does not declare Standard, Full, expanded footprint, network state, or provider overflow.
- [ ] Assert a pre-existing named layout without `progress` remains byte-for-byte unchanged when the toggle becomes true.
- [ ] Assert default placement lookup is complete but is consulted only by the existing explicit add/enable flow.
- [ ] Run `npx vitest run src/lib/layout/defaultPlacements.test.ts src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRegistry.test.ts src/newtab/widgetRenderers.test.tsx src/newtab/expansionWidgetContracts.test.ts` and confirm RED.

### 3.2 Implement the identity and presentation contract

- [ ] Append `progress` to `BLOCK_IDS` so legacy source order and existing default layers do not renumber.
- [ ] Add a fixed starting point near the personal column without moving another literal:

```ts
progress: { x: 13, y: 70 },
```

- [ ] Add an intrinsic Compact-only presentation contract:

```ts
progress: contract(
  'intrinsic',
  ['compact'],
  READY_STATES,
  'Daily progress rail',
  undefined,
  undefined,
  'Daily progress values',
),
```

- [ ] Append a registry source with `zone: 'now'`, `priority: 'automatic'`, eligible zones `['now', 'day', 'dock']`, compact footprint `[1, 1]`, and widget-toggle availability.
- [ ] Add `ProgressWidget` to the renderer map in Task 4; for this task, first add the renderer-key test expectation and let Task 4 supply the component before committing both tasks if TypeScript completeness requires it.
- [ ] Run focused identity tests and confirm GREEN.

### 3.3 Commit Task 3

If the renderer map cannot typecheck without Task 4, defer this commit until Task 4 and keep the diff limited to the listed identity files plus the new renderer.

```powershell
git add src/lib/layout/types.ts src/lib/layout/defaultPlacements.ts src/lib/layout/defaultPlacements.test.ts src/newtab/widgetSizeContracts.ts src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRegistry.ts src/newtab/widgetRegistry.test.ts src/newtab/widgetRenderers.tsx src/newtab/widgetRenderers.test.tsx src/newtab/expansionWidgetContracts.test.ts
git commit -m "feat: register progress canvas identity"
```

---

## Task 4: Build the quiet three-item Progress canvas rail

**Files:**

- Create: `src/newtab/widgets/progress/ProgressWidget.tsx`
- Create: `src/newtab/widgets/progress/ProgressWidget.test.tsx`
- Modify: `src/newtab/widgetRenderers.tsx`
- Modify: `src/newtab/widgetRenderers.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/settings/SettingsPanel.tsx`
- Modify: `src/newtab/index.css` only if existing utilities cannot express the approved rail without a broad selector

### 4.1 Write failing renderer tests

- [ ] With the Progress toggle off, assert the renderer returns nothing and starts no local-day scheduler.
- [ ] With the toggle on but no goals or Habits, assert the renderer returns nothing and starts no timer or listener.
- [ ] With data, assert manual goals appear first, Habits follow, and only three entries render.
- [ ] With four or more entries, assert the final quiet line says the exact remaining count, such as `2 more`, and exposes `Open Progress`.
- [ ] Assert manual activation increments one, Habit activation toggles today, and a completed manual item remains complete without exceeding its target.
- [ ] Assert accessible names include source, name, current value, target, unit, completion, and truthful action.
- [ ] Assert the compact stack face fits and uses no generic `TierFrame` opaque card.
- [ ] Assert no mutation touches `attentionLedger`, connector snapshots, focus, settings briefing fields, or browser notifications.
- [ ] Run `npx vitest run src/newtab/widgets/progress/ProgressWidget.test.tsx` and confirm RED.

### 4.2 Implement the no-data gate and rail

- [ ] In the outer component, read `settings`, `progressGoals`, and `habits` unconditionally. Return `null` before mounting an inner component when the toggle is off, data is invalid, or both valid lists are empty.
- [ ] In the inner component, call `useLocalDay()`, derive the combined manual-first list, and render no more than three visible rows.
- [ ] Reuse `ProgressRing`; use transparent/photo-safe text treatment and only a restrained local backdrop behind each small row when contrast needs it.
- [ ] Use opacity and ring-fill completion transitions with `motion-reduce:transition-none`.
- [ ] Execute manual and Habit actions through fresh `storage.update` updaters. Handle failure with the same live-region and retry-intent contract as Settings.
- [ ] Render a quiet `Open Progress` control only on rail hover or keyboard focus, while keeping it reachable and visible on coarse-pointer devices.

### 4.3 Route overflow and gear directly to Progress Settings

- [ ] Extend the Settings focus target type to include `progress`.
- [ ] Add `onOpenProgress?: () => void` to `WidgetRendererProps` and pass it from `App` through `rendererProps`.
- [ ] Implement `openProgressSettings` as a fresh deep link with `{ tab: 'progress', anchor: 'progress-overview', nonce }` and open the Drawer.
- [ ] Make `openSettingsForWidget('progress')` call the same route so the hover gear does not land on the generic Widgets row.
- [ ] Make the overflow line and `Open Progress` control call `onOpenProgress`. Do not synthesize a click on the Settings gear.
- [ ] Assert the Drawer opens on Progress, focus lands at `data-settings-anchor="progress-overview"`, and Escape/focus restoration remain owned by the existing Drawer.

### 4.4 Verify the component and commit

- [ ] Run `npx vitest run src/newtab/widgets/progress/ProgressWidget.test.tsx src/newtab/widgetRenderers.test.tsx src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx` and confirm GREEN.
- [ ] Run `npx tsc --noEmit` and confirm GREEN.

```powershell
git add src/newtab/widgets/progress/ProgressWidget.tsx src/newtab/widgets/progress/ProgressWidget.test.tsx src/newtab/widgetRenderers.tsx src/newtab/widgetRenderers.test.tsx src/newtab/App.tsx src/newtab/App.test.tsx src/settings/SettingsPanel.tsx src/newtab/index.css
git commit -m "feat: add quiet progress canvas rail"
```

---

## Task 5: Add deterministic exact Chromium acceptance coverage

**Files:**

- Create: `scripts/qa-tab-two-v2-progress.mjs`
- Create: `scripts/qa-tab-two-v2-progress.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json` only if the package script update changes it through the repository's normal package tooling
- Create generated evidence under: `artifacts/qa-tab-two-v2-progress/` during execution, but do not stage the pre-existing `artifacts/` tree unless the repository's evidence policy explicitly requires selected files

### 5.1 Write failing QA contract tests

- [ ] Require `--exact` for acceptance mode and reject stale or missing `dist/build-provenance.json`.
- [ ] Assert the harness uses deterministic local storage fixtures and aborts on any unexpected network request.
- [ ] Assert required viewports are present: 1600x900, 1408x600, 3440x1440, and touch-enabled 375x812.
- [ ] Assert the script checks pairwise widget-frame collisions, viewport containment, horizontal overflow, nested Settings scroll ownership, closed-surface hit targets, console errors, and page errors.
- [ ] Assert the interaction manifest includes Settings navigation, empty/add/edit/validation/increment/complete/reset/reorder/delete, Habit bridge, reload persistence, cross-tab freshness, stack face, overflow route, local-midnight rollover, keyboard access, and reduced motion.
- [ ] Run `node --test scripts/qa-tab-two-v2-progress.test.mjs` and confirm RED.

### 5.2 Implement the exact browser harness

- [ ] Follow the provenance and preview-server structure in `scripts/qa-tab-two-v2-connectors.mjs`, but keep fixtures local and requests blocked.
- [ ] Add `qa:tab-two-v2-progress` to `package.json` as `node scripts/qa-tab-two-v2-progress.mjs --exact`.
- [ ] Record the exact commit, viewport, storage assertions, focus target, bounds, collision pairs, request ledger, console ledger, and screenshot path in a machine-readable result.
- [ ] Use the highest-resolution bundled background source in every photo-dominance witness. Do not generate reduced image tiers.
- [ ] For cross-tab coverage, open two pages in the same persistent context, mutate one, observe the other, then activate an old control and prove it does not overwrite the fresh value.
- [ ] For midnight, use a controlled clock and prove the UI reads zero before storage changes, then prove the first action writes the new local day and value.

### 5.3 Run focused acceptance

```powershell
node --test scripts/qa-tab-two-v2-progress.test.mjs
npm run build
npm run qa:tab-two-v2-progress
```

- [ ] Confirm all three commands pass and the harness prints the exact `dist` commit.
- [ ] Inspect all screenshots, not only the machine-readable bounds. Reject overlap, clipped rings, large opaque surfaces, unreadable photo text, hidden focus, or a mobile control below 36px.

### 5.4 Commit Task 5

```powershell
git add scripts/qa-tab-two-v2-progress.mjs scripts/qa-tab-two-v2-progress.test.mjs package.json package-lock.json
git commit -m "test: add exact progress browser acceptance"
```

---

## Task 6: Stabilize, document, review, and push

**Files:**

- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `PRIVACY.md` only if the user-facing local data list is maintained there
- Modify: `README.md` only if its current feature inventory names every available widget

### 6.1 Run one bounded review and fix only confirmed blockers

- [ ] Review the complete diff against the approved Progress spec, storage authority, named-layout authority, accessibility, privacy, and exact-QA provenance.
- [ ] Classify findings as Critical, Important, or Minor. Fix Critical and Important findings in one bounded pass. Record Minor recommendations without reopening implementation churn.
- [ ] Pay particular attention to stale updater closures, missing-row recreation, v19 backup compatibility, over-cap imports, no-data timers, dialog focus restoration, direct Progress routing, and pairwise canvas collisions.

### 6.2 Run the stabilized final gate once

```powershell
npx vitest run
npx tsc --noEmit
npm run test:expansion-contract
npm run test:information-first-contract
npm run test:widget-redesign-catalog
node --test scripts/qa-tab-two-v2-progress.test.mjs
npm run build
npm run qa:tab-two-v2-progress
npm run qa:widget-redesign-production
git diff --check
```

- [ ] Confirm every command exits 0.
- [ ] Confirm `dist/build-provenance.json` names the reviewed code commit used by both exact browser runs.
- [ ] Confirm browser evidence shows no unexpected request, console error, page error, overflow, clipped control, collision, stale overwrite, or credential rendering.

### 6.3 Update durable project records

- [ ] Mark the Progress packet complete in `STATUS.md` with exact unit, TypeScript, build, and Chromium results.
- [ ] Update `ROADMAP.md` without changing deferred Strava, account, sync, payment, premium, or history sequencing.
- [ ] Add a `DECISIONS.md` entry recording `progressGoals` as local user content, Habits as the sole Habit authority, Progress exclusion from Attention/Briefing, and explicit layout placement only.
- [ ] If applicable, add Progress to the user-facing local-data inventory in `PRIVACY.md` with no claim of encryption or sync.

### 6.4 Commit records and push

```powershell
git add docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/DECISIONS.md PRIVACY.md README.md
git commit -m "docs: checkpoint local progress delivery"
git status --short
git push
git rev-parse HEAD
git rev-parse '@{u}'
```

- [ ] Stage only files that actually changed. Do not stage the two protected untracked paths.
- [ ] Confirm `HEAD` and `@{u}` are identical after push.
- [ ] Report the code commit, documentation commit, exact Chromium evidence path, tests run, and the unchanged Store/manual-device boundary.

---

## Plan Self-Review Checklist

- [ ] Every approved manual-goal operation has a pure-domain test and a Settings interaction test.
- [ ] Habits remain stored only in `habits`; Progress only derives and toggles them.
- [ ] Migration 19 backfills both the top-level key and nested widget toggle.
- [ ] Backup export, prepare, restore, rollback, malformed data, and over-cap behavior are covered.
- [ ] No current feature is gated or moved to premium.
- [ ] The canvas identity is intrinsic, Compact-only, empty-suppressing, and absent from existing layouts.
- [ ] Midnight is render-only until action, and every intent revalidates fresh storage.
- [ ] Settings and canvas failures keep stored values visible and Retry uses fresh state.
- [ ] Direct Progress routing and Manage Habits routing each preserve one configuration authority.
- [ ] Focus trap, Escape, exact focus return, accessible ring text, reduced motion, and 36px controls are tested.
- [ ] Exact Chromium checks all four required viewports, pairwise collisions, photo dominance, cross-tab freshness, and request/error ledgers.
- [ ] No placeholder markers or long dash characters remain in this plan.
