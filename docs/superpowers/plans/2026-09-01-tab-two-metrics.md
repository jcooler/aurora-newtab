# Tab Two PM-P5 Aggregate Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-preserving daily metrics engine, 13-calendar-month local and encrypted-sync history, explicit history controls, and an owner-approved Metrics widget for Habits, Focus, Tasks, calendar load, development activity, and fitness.

**Architecture:** `metricsHistory` is one typed local storage authority containing small, tagged daily aggregate buckets with random opaque IDs. A bucket belongs to one installation and one allowlisted source; focus is additive across installations, while mirrored habit, task, calendar, development, and fitness series collapse field-by-field to the most complete daily aggregate so the same provider snapshot is not double-counted. Each bucket is projected as an independently encrypted `metric_bucket` sync entity, so dates, categories, and measurements remain inside ciphertext and concurrent installations do not overwrite one shared history document.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Testing Library, Playwright Chromium, Chrome MV3 storage, the existing Web Crypto encrypted-sync pipeline, Vite production/preview builds, local Supabase CLI migrations and pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`

**Threat model:** `docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory` and preserve `artifacts/` plus `docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md` exactly.
- Keep `D:\DEV\Chrome plugin` untouched and confirm its status at each checkpoint.
- PM-P4 owner interaction QA is deferred by explicit owner instruction on 2026-09-02. Keep that witness open and add it to the cumulative owner-QA checklist; do not claim PM-P4 manually closed.
- Developer-side RED/GREEN tests, focused tests, TypeScript, local database tests, builds, scans, and browser automation continue normally. Only owner-operated manual QA is deferred.
- A valid, current `metrics_history` capability is required to create or update aggregate history. Existing local history remains readable, exportable, and erasable after entitlement expiry.
- Free local mode and signed-in accounts without `metrics_history` create no metrics history, account request, sync request, or provider request.
- Store only allowlisted numeric aggregates and restricted activity-type counts. Never store meeting titles, attendees, locations, task text, repository names, issue text, GPS routes, media titles, URLs, connector credentials, sessions, signed leases, source payloads, or custom images.
- Retention is the current local calendar month plus the previous 12 calendar months. The approximately-365-day view is a trailing 365-day query over that retained set.
- Random UUID bucket IDs are the only server-visible sync identities. Date, source, installation identifier, source-instance identifier, and values stay inside the encrypted entity value.
- `focus` buckets are summed across distinct installation IDs. `habits`, `tasks`, `calendar`, `development`, and `fitness` buckets are mirrored series: collapse duplicate logical source/day contributions by the maximum value for each non-negative measure rather than summing repeated provider snapshots.
- Disconnecting or disabling a source preserves history. Only a separately confirmed delete-history action removes source or complete metrics history.
- Do not deploy a PM-P5 migration or function to hosted Supabase, provision Supabase Pro, enable live Stripe, add permissions or OAuth registrations, merge, package, release, or mutate the Chrome Web Store without the applicable explicit gate.
- Create and attach original-resolution Metrics mockups, then stop for owner visual approval before editing production Metrics React or CSS. Non-visual domain, storage, collector, and encrypted-sync work may proceed before that visual gate.
- Perform one bounded complete-diff review. Only Critical or Important findings block. Apply at most one focused fix and rereview cycle, then run one stabilized full gate.

---

### Task 1: Freeze the aggregate domain and calendar-window math

**Files:**
- Create: `src/metrics/types.ts`
- Create: `src/metrics/history.ts`
- Test: `src/metrics/history.test.ts`

**Interfaces:**
- Produces: `MetricSource`, `MetricValues`, `MetricBucketV1`, `MetricsHistoryV1`, `METRICS_HISTORY_VERSION`, `emptyMetricsHistory(deviceId)`, `metricsRetentionStart(today)`, `pruneMetricsHistory(history, today)`, `upsertLocalMetricBucket(history, input)`, `mergeMetricHistories(local, incoming, today)`, and `summarizeMetrics(history, range, today)`.
- Consumes: local `YYYY-MM-DD` date keys and `crypto.randomUUID()` supplied through an injectable `createId` function in tests.

- [x] **Step 1: Write the failing domain tests**

Cover exact tagged shapes and rejection of unknown fields, negative/fractional counts, non-finite values, invalid dates, malformed UUIDs, arbitrary activity types, oversized histories, and raw/private-looking keys. Prove the calendar cutoff from 2026-09-02 is 2025-09-01 and that the 365-day view begins 364 local days earlier without UTC day drift.

```ts
expect(metricsRetentionStart('2026-09-02')).toBe('2025-09-01')
expect(metricRangeStart('365d', '2026-09-02')).toBe('2025-09-03')
expect(() => assertMetricBucket({ ...bucket, values: { kind: 'tasks', completed: 1, taskText: 'secret' } })).toThrow('metric_bucket_invalid')
```

- [x] **Step 2: Run the focused test and observe RED**

Run: `npm test -- --run src/metrics/history.test.ts`

Expected: FAIL because the metrics modules do not exist.

- [x] **Step 3: Implement the closed tagged union**

Use these exact public shapes:

```ts
export const METRIC_SOURCES = ['habits', 'focus', 'tasks', 'calendar', 'development', 'fitness'] as const
export type MetricSource = typeof METRIC_SOURCES[number]
export type MetricRange = '7d' | '30d' | '90d' | '365d'

export type MetricValues =
  | { kind: 'habits'; completed: number; tracked: number; streak: number }
  | { kind: 'focus'; sessions: number; minutes: number }
  | { kind: 'tasks'; completed: number; carriedForward: number }
  | { kind: 'calendar'; events: number; busyMinutes: number }
  | { kind: 'development'; commits: number; reviews: number; issues: number; deployments: number; failures: number }
  | { kind: 'fitness'; activities: number; durationMinutes: number; distanceMeters: number; elevationMeters: number; types: { run: number; ride: number; walk: number; hike: number; swim: number; other: number } }

export interface MetricBucketV1 {
  schemaVersion: 1
  id: string
  date: string
  source: MetricSource
  sourceInstanceId: string
  installationId: string
  sequence: number
  values: MetricValues
}

export interface MetricsHistoryV1 {
  version: 1
  installationId: string
  buckets: MetricBucketV1[]
}
```

Limit a history to 8,192 buckets, use exact-key validators, cap each integer at `Number.MAX_SAFE_INTEGER`, and cap `distanceMeters` and `elevationMeters` the same way. `installationId` is always a random UUID. `sourceInstanceId` is a random UUID or one of the fixed allowlisted local source IDs `local-habits`, `local-tasks`, `ics`, `github`, `gitlab`, `jira`, `linear`, `vercel`, and `strava`; no user-controlled label is admitted.

- [x] **Step 4: Implement deterministic update and merge rules**

`upsertLocalMetricBucket` may mutate only a bucket whose `installationId` equals the history installation. It retains the existing opaque bucket ID for the same `(date, source, sourceInstanceId, installationId)` tuple and increments `sequence`. Incoming sync buckets merge by opaque ID; equal IDs keep the higher sequence, and an equal sequence with unequal content throws `metric_history_conflict` instead of trusting a device clock. Summary queries sum focus buckets by installation and collapse mirrored logical source/day buckets field-by-field with maximum non-negative values.

- [x] **Step 5: Run focused tests and observe GREEN**

Run: `npm test -- --run src/metrics/history.test.ts`

Expected: PASS.

- [x] **Step 6: Commit the domain checkpoint**

```powershell
git add src/metrics/types.ts src/metrics/history.ts src/metrics/history.test.ts
git commit -m "feat: add private aggregate metrics domain"
```

---

### Task 2: Add the local storage, migration, backup, privacy, and export authority

**Files:**
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/index.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/lib/storage/migrations.test.ts`
- Modify: `src/lib/storage/schema.test.ts`
- Modify: `src/privacy/dataFlows.ts`
- Modify: `src/privacy/dataFlows.test.ts`
- Create: `src/metrics/export.ts`
- Test: `src/metrics/export.test.ts`

**Interfaces:**
- Consumes: `MetricsHistoryV1`, `assertMetricsHistory`, and `emptyMetricsHistory` from Task 1.
- Produces: `AuroraData.metricsHistory`, schema version 21, strict backup validation, `serializeMetricsExport(history, exportedAt)`, and a privacy inventory entry.

- [x] **Step 1: Write failing storage and migration tests**

Assert that v20 data receives `metricsHistory: null` without rewriting unrelated keys, current-schema backups accept a valid metrics history, malformed buckets reject the complete import, unknown metric keys fail closed, and export contains aggregates but none of a realistic secret/private corpus.

- [x] **Step 2: Run focused tests and observe RED**

Run: `npm test -- --run src/lib/storage/schema.test.ts src/lib/storage/migrations.test.ts src/lib/backup.test.ts src/privacy/dataFlows.test.ts src/metrics/export.test.ts`

Expected: FAIL because `metricsHistory` is not a data key.

- [x] **Step 3: Add the v20 to v21 top-level authority**

Set `CURRENT_VERSION = 21`, add `metricsHistory: MetricsHistoryV1 | null` to `AuroraData`, return `metricsHistory: null` from `defaults()`, and add migration `20: (data) => data`. Keep `METADATA_ONLY_FLOOR` at or below the correct last non-identity boundary; initialization may stamp v21 without eagerly writing a missing top-level history key.

- [x] **Step 4: Add strict backup and privacy handling**

Include valid aggregate history in manual backup and restore. Add this exact data-flow intent:

```ts
metricsHistory: {
  storage: 'chrome.storage.local',
  sensitivity: ['user-content'],
  export: 'included',
  transmission: 'tab-two-encrypted-sync',
  description: 'Daily numeric aggregates for habits, focus, tasks, calendar load, development activity, and fitness; no titles, names, routes, or raw provider data.',
}
```

The dedicated export envelope is `{ product: 'Tab Two', kind: 'metrics-history', version: 1, exportedAt, history }`; parsing is not added in PM-P5 because normal backup restore already owns import.

- [x] **Step 5: Run focused tests and observe GREEN**

Run: `npm test -- --run src/lib/storage/schema.test.ts src/lib/storage/migrations.test.ts src/lib/backup.test.ts src/privacy/dataFlows.test.ts src/metrics/export.test.ts`

Expected: PASS.

- [x] **Step 6: Commit the storage checkpoint**

```powershell
git add src/lib/storage/schema.ts src/lib/storage/migrations.ts src/lib/storage/index.ts src/lib/backup.ts src/lib/backup.test.ts src/lib/storage/migrations.test.ts src/lib/storage/schema.test.ts src/privacy/dataFlows.ts src/privacy/dataFlows.test.ts src/metrics/export.ts src/metrics/export.test.ts
git commit -m "feat: persist aggregate metrics history"
```

---

### Task 3: Build aggregate-only collectors and entitlement-gated ownership

**Files:**
- Create: `src/metrics/collectors.ts`
- Test: `src/metrics/collectors.test.ts`
- Create: `src/metrics/MetricsProvider.tsx`
- Test: `src/metrics/MetricsProvider.test.tsx`
- Modify: `src/newtab/main.tsx`
- Modify: `src/newtab/main.test.tsx`

**Interfaces:**
- Consumes: `AuroraStorage`, `useAccount()`, `hasCapability(snapshot, 'metrics_history')`, local habits/todos, and existing typed connector snapshots.
- Produces: `collectHabitSeries`, `collectTaskSeries`, `collectCalendarSeries`, `collectDevelopmentSeries`, `MetricsProvider`, `useMetrics()`, `recordFocusCompletion(minutes, date)`, `deleteMetricsHistory(filter)`, and `exportMetricsHistory()`.

- [x] **Step 1: Write failing collector tests with a hostile corpus**

Use fixtures containing habit names, task text, calendar titles/attendees/locations/URLs, repository names, issue titles, deployment URLs, connector tokens, and GPS-like fields. Assert outputs contain only the Task 1 tagged numeric shapes and allowlisted source IDs. Prove invalid/stale connector payloads are ignored rather than recorded as zeros.

- [x] **Step 2: Run collector tests and observe RED**

Run: `npm test -- --run src/metrics/collectors.test.ts`

Expected: FAIL because collectors do not exist.

- [x] **Step 3: Implement pure source adapters**

- Habits: group valid completion-day keys and calculate completed, tracked, and streak without persisting habit names or IDs.
- Tasks: count items with a valid `completedOn` day and compute `carriedForward` from unfinished items created before the requested day.
- Calendar: clip event spans to local calendar days, merge overlaps before calculating busy minutes, and never copy event metadata.
- Development: GitHub/GitLab contribution days become commit counts; current review/issue/deployment items count only when a validated timestamp exists. Vercel `ERROR` becomes failures. Absence of a timestamp is not assigned to the fetch day.
- Fitness: expose a strict `collectFitnessSeries` contract for PM-P8 using only allowlisted activity class, duration, distance, elevation, and day.

- [x] **Step 4: Write failing provider ownership tests**

Prove local mode, signed-in without capability, expired lease, and unverified lease never write `metricsHistory`. Prove a current lease bootstraps one installation ID, coalesces storage changes, prunes before writing, performs no network request, and stops writing immediately when the lease expires. Existing history remains readable and deletable in every state.

- [x] **Step 5: Implement `MetricsProvider`**

Mount it beneath `AccountProvider` and above `SyncProvider`/`App`. Subscribe to `habits`, `todoLists`, `connectorSnapshots`, and `metricsHistory`. Derive only while `hasCapability(snapshot, 'metrics_history')` is true. Serialize one update through `AuroraStorage.update('metricsHistory', ...)`, retain bucket IDs for stable tuples, and never trigger a connector refresh.

```tsx
<StorageProvider storage={storage} syncRuntime={{ driver, authority: storageAuthority }}>
  <AccountProvider>
    <MetricsProvider>
      <SyncProvider><App /></SyncProvider>
    </MetricsProvider>
  </AccountProvider>
</StorageProvider>
```

- [x] **Step 6: Run focused tests and observe GREEN**

Run: `npm test -- --run src/metrics/collectors.test.ts src/metrics/MetricsProvider.test.tsx src/newtab/main.test.tsx`

Expected: PASS.

- [x] **Step 7: Commit the collector checkpoint**

```powershell
git add src/metrics/collectors.ts src/metrics/collectors.test.ts src/metrics/MetricsProvider.tsx src/metrics/MetricsProvider.test.tsx src/newtab/main.tsx src/newtab/main.test.tsx
git commit -m "feat: collect entitlement-gated daily metrics"
```

---

### Task 4: Record task and Focus completions without rewriting existing history

**Files:**
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/newtab/widgets/todo/todoReducer.ts`
- Modify: `src/newtab/widgets/todo/todoReducer.test.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/sync/entityPolicy.ts`
- Modify: `src/sync/entityPolicy.test.ts`
- Modify: `src/newtab/widgets/timer/TimerSessionProvider.tsx`
- Modify: `src/newtab/widgets/timer/TimerSessionProvider.test.tsx`
- Modify: `src/metrics/MetricsProvider.tsx`
- Modify: `src/metrics/MetricsProvider.test.tsx`

**Interfaces:**
- Consumes: `recordFocusCompletion(minutes, date)` from Task 3.
- Produces: optional `TodoItem.createdOn` and `TodoItem.completedOn` local date keys, time-injected `toggleItem`, and one atomic metrics increment for a naturally completed work phase.

- [ ] **Step 1: Write failing todo provenance tests**

Change `TodoAction` to accept an explicit date for state-changing operations:

```ts
| { type: 'addItem'; listId: string; text: string; today: string }
| { type: 'toggleItem'; listId: string; itemId: string; today: string }
```

Assert new items store `createdOn`, incomplete to complete sets `completedOn`, complete to incomplete removes `completedOn`, old items without dates remain valid, backup/sync round trips both optional fields, and invalid dates fail closed.

- [ ] **Step 2: Run todo/storage/sync tests and observe RED**

Run: `npm test -- --run src/newtab/widgets/todo/todoReducer.test.ts src/lib/backup.test.ts src/sync/entityPolicy.test.ts`

Expected: FAIL on the new provenance assertions.

- [ ] **Step 3: Implement task provenance minimally**

Keep text and identifiers in the existing todo authority only. Metrics collectors receive only counts and date keys. Do not fabricate dates for existing tasks and do not rewrite them during migration.

- [ ] **Step 4: Write failing Focus completion tests**

Assert crossing an overdue work deadline records exactly one session with the configured work minutes and completion local day, while break completion, reset, remount, a second timer owner, inactive entitlement, and a failed timer write record nothing. Prove the timer transition and metrics write share one `updateMany` authority so a partial failure cannot claim a completed metric.

- [ ] **Step 5: Implement the atomic Focus path**

`TimerSessionProvider` reads the current metrics action from context and includes `metricsHistory` in the same storage transaction only for a committed work-to-break transition. Deduplication uses the completed timer cycle and installation-owned bucket sequence, not a React effect count.

- [ ] **Step 6: Run focused tests and observe GREEN**

Run: `npm test -- --run src/newtab/widgets/todo/todoReducer.test.ts src/lib/backup.test.ts src/sync/entityPolicy.test.ts src/newtab/widgets/timer/TimerSessionProvider.test.tsx src/metrics/MetricsProvider.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the action checkpoint**

```powershell
git add src/lib/storage/schema.ts src/newtab/widgets/todo src/lib/backup.ts src/lib/backup.test.ts src/sync/entityPolicy.ts src/sync/entityPolicy.test.ts src/newtab/widgets/timer/TimerSessionProvider.tsx src/newtab/widgets/timer/TimerSessionProvider.test.tsx src/metrics/MetricsProvider.tsx src/metrics/MetricsProvider.test.tsx
git commit -m "feat: record task and focus aggregates"
```

---

### Task 5: Carry metrics through the encrypted vault and local Supabase contract

**Files:**
- Modify: `src/sync/types.ts`
- Modify: `src/sync/entityPolicy.ts`
- Modify: `src/sync/entityPolicy.test.ts`
- Modify: `src/sync/coordinator.test.ts`
- Create: `supabase/migrations/20260902000600_metrics_sync_entity.sql`
- Modify: `supabase/functions/_shared/syncHandlers.ts`
- Modify: `supabase/tests/database/encrypted_sync_rls.test.sql`
- Modify: `supabase/functions/tests/sync-functions.test.ts`

**Interfaces:**
- Consumes: `MetricBucketV1`, `MetricsHistoryV1`, existing `SyncEntityV1`, and AES-256-GCM sync envelopes.
- Produces: `metric_bucket` as the only new `SyncEntityType`; its server-visible `entityId` is exactly the random bucket UUID.

- [ ] **Step 1: Write failing deny-by-default sync tests**

Assert `metricsHistory` is classified as synced, every bucket becomes one `metric_bucket`, entity IDs expose neither date nor source, values are exact-key validated before encryption and after decryption, unknown metric fields reject, and applying/removing a bucket preserves unrelated local history. Expand the exhaustive secret corpus with metric-shaped attempts containing task text, event titles, repository names, routes, URLs, sessions, and provider payloads.

- [ ] **Step 2: Run client sync tests and observe RED**

Run: `npm test -- --run src/sync/entityPolicy.test.ts src/sync/coordinator.test.ts`

Expected: FAIL because `metricsHistory` is unclassified and `metric_bucket` is unknown.

- [ ] **Step 3: Implement the encrypted entity projection**

Add `metric_bucket` to `SYNC_ENTITY_TYPES` and `SyncEntityValueByType`. Keep `metricsHistory` in `SYNCED_AURORA_KEYS`. `projectSyncEntities` emits only validated buckets. `applySyncEntity` initializes a missing local history with a local installation ID, unions incoming buckets by opaque ID, prunes retention, and never changes the local installation ID to a foreign one. `removeSyncEntity` removes only the matching opaque bucket.

- [ ] **Step 4: Write the local SQL and Edge RED tests**

Assert the migration extends the exact sync entity-type constraint to `metric_bucket` without widening grants or RLS. Prove authenticated users can exchange encrypted metric records only through the existing account-bound functions, cross-account attempts fail, plaintext metric keys never appear in stored ciphertext, and quota/revision/tombstone behavior remains identical.

- [ ] **Step 5: Implement migration 00600 and function allowlists**

Use a forward migration that drops and recreates only the existing entity-type check constraint with the prior values plus `metric_bucket`. Do not add a plaintext metrics table or a new Edge Function. Extend only the shared allowlist used by the already-deployed sync handlers.

- [ ] **Step 6: Run local database and function tests**

Run:

```powershell
npx supabase db reset --local
npm run test:supabase-local
npx supabase db lint --local --level error
npx vitest run --config supabase/functions/tests/vitest.config.ts supabase/functions/tests/sync-functions.test.ts
```

Expected: migration reset succeeds, pgTAP passes, lint reports zero errors, and Edge tests pass.

- [ ] **Step 7: Commit the encrypted-sync checkpoint**

```powershell
git add src/sync/types.ts src/sync/entityPolicy.ts src/sync/entityPolicy.test.ts src/sync/coordinator.test.ts supabase/migrations/20260902000600_metrics_sync_entity.sql supabase/functions/_shared/syncHandlers.ts supabase/tests/database/encrypted_sync_rls.test.sql supabase/functions/tests/sync-functions.test.ts
git commit -m "feat: sync encrypted metric buckets"
```

- [ ] **Step 8: Stop before hosted mutation**

Record local proof and leave migration 00600 undeployed. Hosted Supabase mutation requires a concise exact owner gate after the complete PM-P5 diff passes review.

---

### Task 6: Produce original-resolution Metrics visual states and request approval

**Files:**
- Create: `scripts/qa-metrics-mockups.mjs`
- Create: `docs/superpowers/reports/TAB-TWO-METRICS-VISUAL-SPEC.md`
- Preserve generated PNGs under: `artifacts/qa-metrics-mockups/<source-sha>/`

**Interfaces:**
- Consumes: the approved Tab Two accent, typography, spacing, focus, card-density, and reduced-motion tokens; PM-P1 Account & Sync brand treatment; Task 1 summary contracts.
- Produces: original-resolution locked, first-use empty, populated compact, populated standard, populated expanded 7/30/90/365-day, expired-history-readable, and unavailable/error PNG states at desktop plus touch-narrow geometry.

- [ ] **Step 1: Read the UI skills before visual work**

Use `frontend-design` and `design-workflow`. Preserve the brand colors already approved for Account & Sync. No Emil Kowalski-specific skill is installed in this workspace; apply the available motion/design-system guidance without adding a dependency.

- [ ] **Step 2: Build a deterministic non-production mockup harness**

Use static aggregate fixtures only. The proposed widget has:

- compact: one primary weekly score, a restrained seven-day sparkline, and two supporting totals;
- standard: a 30-day overview with three balanced metric groups and one clear `View history` action;
- expanded: 7/30/90/365-day segmented range, a single readable trend chart, category rows, comparison copy, and explicit empty/error treatment;
- locked: the premium promise and one `See premium plans` action, never a disabled fake chart;
- expired: retained history remains visible with `History paused` and a resubscribe action;
- loading: stable reserved geometry and reduced-motion-safe shimmer/spinner; error: useful retained data stays visible while collection status is explained.

- [ ] **Step 3: Render and inspect every PNG at original resolution**

Run: `node scripts/qa-metrics-mockups.mjs`

Reject clipped axes, tiny labels, generic dashboard grids, excessive pills, color-only category distinctions, touch targets below 44 CSS px where coarse-pointer interaction is expected, or movement that ignores `prefers-reduced-motion`.

- [ ] **Step 4: Attach PNGs directly and stop for owner visual approval**

Do not edit production Metrics React or CSS until the owner explicitly approves these states. This is a product design approval gate, distinct from the cumulative end-of-development hands-on QA checklist.

- [ ] **Step 5: Commit the approved visual spec and harness**

```powershell
git add scripts/qa-metrics-mockups.mjs docs/superpowers/reports/TAB-TWO-METRICS-VISUAL-SPEC.md
git commit -m "docs: approve metrics visual contract"
```

---

### Task 7: Implement the approved Metrics widget and history controls

**Files:**
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/lib/layout/types.ts`
- Modify: `src/lib/layout/defaultPlacements.ts`
- Modify: `src/newtab/widgetRegistry.ts`
- Modify: `src/newtab/widgetRegistry.test.ts`
- Modify: `src/newtab/widgetSizeContracts.ts`
- Modify: `src/newtab/widgetSizeContracts.test.ts`
- Modify: `src/newtab/widgetRenderers.tsx`
- Create: `src/newtab/widgets/metrics/MetricsWidget.tsx`
- Test: `src/newtab/widgets/metrics/MetricsWidget.test.tsx`
- Create: `src/settings/sections/MetricsHistory.tsx`
- Test: `src/settings/sections/MetricsHistory.test.tsx`
- Modify: `src/settings/sections/Progress.tsx`
- Modify: `src/settings/sections/Progress.test.tsx`
- Modify: `src/settings/sections/Widgets.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`

**Interfaces:**
- Consumes: `useMetrics()`, `summarizeMetrics`, `PremiumPrompt`, approved Task 6 visual contract, and existing widget registry/layout primitives.
- Produces: a new `metrics` widget toggle and `BlockId`, compact/standard/full/docked presentation contracts, keyboard-accessible history range selection, export, scoped delete, and complete delete controls.

- [ ] **Step 1: Write failing registry/migration/widget tests**

Assert `metrics` is appended after every existing widget identity so legacy layer order is unchanged, v21 to v22 backfills only the new nested toggle, old layouts remain byte-equivalent, and all widget contracts/catalog inventories contain exactly one Metrics entry. Add locked, empty, populated, expired, offline, loading, and error render assertions for each approved tier.

- [ ] **Step 2: Run focused UI tests and observe RED**

Run: `npm test -- --run src/newtab/widgetRegistry.test.ts src/newtab/widgetSizeContracts.test.ts src/newtab/widgets/metrics/MetricsWidget.test.tsx src/settings/sections/MetricsHistory.test.tsx src/settings/sections/Progress.test.tsx src/settings/SettingsPanel.test.tsx src/newtab/App.test.tsx`

Expected: FAIL because the production widget and controls do not exist.

- [ ] **Step 3: Add the append-only widget identity and schema v22**

Add `metrics: false` after `progress` in `WidgetToggles`, set `CURRENT_VERSION = 22`, and add migration 21 using the existing generic nested-widget merge. Append `metrics` after `progress` in `BLOCK_IDS`, registry source order, default placement identities, renderers, and size contracts. Do not auto-place or auto-enable it in existing named layouts.

- [ ] **Step 4: Implement the approved production widget**

Use semantic SVG or CSS for the trend, an accessible textual summary, non-color category labels, and stable geometry. The range control updates component state only and makes no request. The widget reads local history even after entitlement expiry; without history and without capability it renders the locked state. A current capability with no history renders first-use empty state.

- [ ] **Step 5: Implement export and destructive history controls**

Place `Metrics history` in the existing Progress Settings tab. Export uses a user-initiated Blob download. `Delete history` uses the established two-step destructive confirmation, identifies the scope in copy, serializes through the storage authority, and triggers normal encrypted-sync tombstones only when sync is already enabled. Disabling a connector never calls deletion implicitly.

- [ ] **Step 6: Run focused tests and observe GREEN**

Run: `npm test -- --run src/newtab/widgetRegistry.test.ts src/newtab/widgetSizeContracts.test.ts src/newtab/widgets/metrics/MetricsWidget.test.tsx src/settings/sections/MetricsHistory.test.tsx src/settings/sections/Progress.test.tsx src/settings/SettingsPanel.test.tsx src/newtab/App.test.tsx src/lib/storage/migrations.test.ts src/lib/backup.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the production UI checkpoint**

```powershell
git add src/lib/storage src/lib/layout src/newtab src/settings src/metrics
git commit -m "feat: add unified metrics history UI"
```

---

### Task 8: Review, stabilize, request hosted gate, and accumulate owner QA

**Files:**
- Create: `scripts/qa-tab-two-metrics.mjs`
- Create: `docs/superpowers/reports/TAB-TWO-METRICS-QA.md`
- Create or update: `docs/superpowers/reports/TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify when verified behavior changes: `PRIVACY.md`
- Modify when verified behavior changes: `README.md`

**Interfaces:**
- Consumes: the complete PM-P5 diff, exact source commit, production/preview builds, and deferred PM-P4 witness.
- Produces: one redacted exact-provenance QA report, one cumulative owner checklist, and a separately requested hosted migration gate.

- [ ] **Step 1: Review the complete packet once**

Inspect all PM-P5 commits for Critical/Important privacy leakage, duplicate aggregation, retention drift, entitlement bypass, storage migration loss, sync identity leakage, cross-account access, destructive-action ambiguity, accessibility, and existing widget/layout regression. Apply at most one focused repair/rereview cycle.

- [ ] **Step 2: Run the stabilized developer gate**

Run the affected metrics/storage/sync/widget suites, then one full `npm test -- --run`, `npx tsc --noEmit`, `git diff --check`, dependency audit, production fixture/secret scans, local Supabase reset/pgTAP/lint/Edge tests, exact production build, exact preview build, and the production build restored last. Do not repeat already-green gates unless the review repair touches their authority.

- [ ] **Step 3: Run exact Chromium metrics QA**

At desktop, short-height, ultrawide, and touch-narrow sizes, cover locked, empty, populated, expired, loading, offline, error, export, delete-confirm/cancel, focus order, visible focus, reduced motion, range controls, Settings route, layout edit, dock/stack, reload persistence, and no overflow. Capture storage writes, backend/provider requests, console errors, page errors, and failed requests against explicit allowlists.

- [ ] **Step 4: Request the hosted migration gate**

Present the exact local migration/function delta, rollback, expected Supabase Free impact, and read-only post-deploy inspection. Stop before applying migration 00600 until explicit owner approval. Never read ciphertext during hosted inspection.

- [ ] **Step 5: Maintain the cumulative owner-QA checklist**

At minimum retain:

1. PM-P4: disable encrypted sync, close/reopen Tab Two, verify local content remains, and verify final sync-off state.
2. PM-P5: enable Metrics after entitlement, complete one task and one Focus session, verify the correct day totals, switch 7/30/90/365-day ranges, export history, cancel one delete confirmation, confirm one scoped deletion only when the owner is ready, and verify retained history remains readable in the modeled expired state.
3. Final device ceilings: stable Chrome extension behavior, native download affordance, real assistive technology, and MacBook smoke testing remain honestly manual.

Do not ask the owner to execute this list during ordinary PM-P5 development. Present the consolidated list at the end requested by the owner or when no safe implementation work remains before a hard external gate.

- [ ] **Step 6: Reconcile, commit, push, and prove equality**

Stage only intended PM-P5 files. Push the feature branch and prove local HEAD equals upstream and remote. Confirm the protected original and protected untracked paths remain unchanged. Do not merge, package, release, enable live Stripe, provision Supabase Pro, or perform a Chrome Web Store action.
