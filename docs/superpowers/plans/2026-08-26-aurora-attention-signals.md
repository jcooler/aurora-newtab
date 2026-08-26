# Aurora Attention Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading unfinished-task greeting count with timely Calendar, newly observed assigned-work, recent Vercel-failure, and rain signals that explain themselves through a text-led context panel.

**Architecture:** A pure attention domain owns ledger reconciliation, six-hour windows, ordering, and summary copy. A new top-level device-local ledger stores only stable work-item IDs and timestamps, while an attention-aware connector fetch policy lets the helper and visible widgets share one scope and one coalesced refresh. `AuroraBriefing` composes scope-valid snapshots into inline text and delegates hover, focus, tap, Escape, outside-pointer, and viewport-clamped presentation to a focused context-panel component.

**Tech Stack:** React 19, TypeScript 5.9, Chrome MV3 local storage, Vitest, Testing Library, Playwright, Vite, existing Aurora connector snapshot and storage authorities

**Spec:** `docs/superpowers/specs/2026-08-26-aurora-attention-signals-design.md`

## Global Constraints

- Work only in `D:/DEV/Chrome plugin-aurora-2`; do not modify `D:/DEV/Chrome plugin`.
- Ordinary unfinished Aurora tasks never create attention signals.
- Newly observed assigned work and failed Vercel deployments expire after exactly six hours.
- Existing assigned work silently baselines on first valid observation.
- The ledger stores only stable IDs, nullable first-seen timestamps, and observation timestamps.
- The ledger is excluded from backup export and reset on restore.
- The helper remains inline photo text; the context surface is non-modal and has no backdrop, focus trap, or scroll lock.
- No new dependency, provider API, credential, origin permission, remote write, operating-system notification, account system, payment system, premium tier, or Chrome Web Store action.
- Connector refresh must preserve configuration scope, stale retention, aborts, conditional requests, Web Locks, and cross-tab ownership.
- Use literal `&` in product copy and ASCII punctuation in documentation and product strings.
- Use test-driven development for every production change.
- Run one bounded implementation review, fix every Critical or Important finding, then run one stabilized full gate.
- Push only `feat/aurora-2-observatory`; do not merge or publish.

## File structure

- `src/lib/storage/schema.ts`: persisted source settings and device-local attention-ledger shapes/defaults.
- `src/lib/storage/migrations.ts`: v18 to v19 nested Settings backfill.
- `src/lib/storage/index.ts`: metadata-only migration floor after the non-identity v19 migration.
- `src/lib/backup.ts`: strict source-settings validation and explicit ledger export/import exclusion.
- `src/privacy/dataFlows.ts`: declared local derived-state privacy classification.
- `src/services/connectors/github.ts`: stable GitHub search-item IDs.
- `src/services/connectors/gitlab.ts`: stable GitLab merge-request IDs.
- `src/services/connectors/attentionPolicy.ts`: one source of truth for effective views and connector runtime scope.
- `src/lib/attention.ts`: pure ledger reconciliation, projections, timing, ordering, and summary copy.
- `src/newtab/components/AttentionRefreshOwners.tsx`: hidden refresh owners for enabled attention sources.
- `src/newtab/components/useAttentionSignals.ts`: scope validation, ledger reconciliation, snapshot projection, and signal aggregation.
- `src/newtab/components/AttentionContextPanel.tsx`: anchored non-modal context interaction and rendering.
- `src/newtab/components/AuroraBriefing.tsx`: hydration gate, refresh-owner mount, inline summary trigger, and context-panel composition.
- `src/newtab/index.css`: text trigger, non-modal surface, rows, focus, and clamped-size presentation.
- `src/settings/sections/General.tsx`: master switch copy and four subordinate source switches.
- `scripts/qa-attention-signals.mjs`: exact-build browser witness.
- `scripts/qa-attention-signals.test.mjs`: QA contract that requires provenance, interaction, and geometry assertions.

---

### Task 1: Persist source settings and the device-local ledger safely

**Files:**
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/index.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/privacy/dataFlows.ts`
- Modify: `src/lib/storage/migrations.test.ts`
- Modify: `src/lib/storage/index.test.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/lib/backupRestore.test.ts`
- Modify: `src/privacy/dataFlows.test.ts`

**Interfaces:**
- Produces: `BriefingSources`, `DEFAULT_BRIEFING_SOURCES`, `AttentionAssignmentSource`, `AttentionLedgerItem`, `AttentionLedgerSource`, `AttentionLedger`, `Settings.briefingSources`, and `AuroraData.attentionLedger`.
- Consumes: existing `defaults()`, `migrate()`, `serializeBackup()`, `prepareBackup()`, and strict Settings validation.

- [ ] **Step 1: Write failing schema, migration, backup, and privacy tests**

Add exact assertions that establish the storage contract:

```ts
it('defaults every explainable Greeting helper source on', () => {
  expect(defaults().settings.briefingSources).toEqual({
    calendar: true,
    assignments: true,
    deployments: true,
    rain: true,
  })
  expect(defaults().attentionLedger).toEqual({ version: 1, sources: {} })
})

it('migrates v18 Settings without replacing existing values', () => {
  const settings = { ...defaults().settings, name: 'Jon' } as Record<string, unknown>
  delete settings.briefingSources
  const out = migrate({ ...defaults(), settings }, 18)
  expect(out.settings.name).toBe('Jon')
  expect(out.settings.briefingSources).toEqual(DEFAULT_BRIEFING_SOURCES)
})

it('excludes and resets device-local attention history', () => {
  const input = defaults()
  input.attentionLedger.sources.github = {
    observedAt: 100,
    items: { '123': { firstSeenAt: 100 } },
  }
  const envelope = JSON.parse(serializeBackup(input))
  expect(envelope.data).not.toHaveProperty('attentionLedger')
  const prepared = prepareBackup(JSON.stringify(envelope))
  expect(prepared.ok && prepared.data.attentionLedger).toEqual({ version: 1, sources: {} })
})
```

Extend `KNOWN_KEYS` and the privacy key set with `attentionLedger`. Assert its privacy record is local, derived, excluded, and never transmitted.

- [ ] **Step 2: Run the focused tests and verify the red state**

Run:

```powershell
npx vitest run src/lib/storage/migrations.test.ts src/lib/storage/index.test.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts src/privacy/dataFlows.test.ts
```

Expected: compile or assertion failures for the missing settings, ledger key, v19 migration, and backup exclusion.

- [ ] **Step 3: Add the schema and migration implementation**

Add the exact persisted shapes:

```ts
export const DEFAULT_BRIEFING_SOURCES = {
  calendar: true,
  assignments: true,
  deployments: true,
  rain: true,
} as const

export interface BriefingSources {
  calendar: boolean
  assignments: boolean
  deployments: boolean
  rain: boolean
}

export type AttentionAssignmentSource = 'github' | 'gitlab' | 'jira' | 'linear'

export interface AttentionLedgerItem {
  firstSeenAt: number | null
}

export interface AttentionLedgerSource {
  observedAt: number
  items: Record<string, AttentionLedgerItem>
}

export interface AttentionLedger {
  version: 1
  sources: Partial<Record<AttentionAssignmentSource, AttentionLedgerSource>>
}
```

Set `CURRENT_VERSION` to `19`, add `briefingSources: BriefingSources` to `Settings`, add `attentionLedger: AttentionLedger` to `AuroraData`, and add both defaults.

Add migration `18`:

```ts
18: (data) => {
  const settings = data.settings
  if (!isPlainObject(settings)) return data
  const stored = isPlainObject(settings.briefingSources) ? settings.briefingSources : {}
  return {
    ...data,
    settings: {
      ...settings,
      briefingSources: { ...DEFAULT_BRIEFING_SOURCES, ...stored },
    },
  }
},
```

Move `METADATA_ONLY_FLOOR` to `19` because v18 requires a full migration transaction.

- [ ] **Step 4: Exclude the ledger and strictly validate source settings**

Extend `BackupEnvelope['data']`, `redactBackupData`, the validator exclusion union, and `validateBackupShape` so `attentionLedger` follows the same excluded/reset pattern as `connectorSnapshots`:

```ts
const isBriefingSources = (value: unknown): boolean => (
  isPlainObject(value)
  && isBoolean(value.calendar)
  && isBoolean(value.assignments)
  && isBoolean(value.deployments)
  && isBoolean(value.rain)
)
```

Require `isBriefingSources(v.briefingSources)` in `isSettings`. Strip `attentionLedger` during export and restore `{ version: 1, sources: {} }` during import. Add the matching `STORED_DATA_FLOWS.attentionLedger` record with `export: 'excluded'` and `transmission: 'none'`.

- [ ] **Step 5: Run the focused tests and verify green**

Run the Step 2 command.

Expected: all focused storage, backup, restore, and privacy tests pass.

- [ ] **Step 6: Commit the storage boundary**

```powershell
git add -- src/lib/storage/schema.ts src/lib/storage/migrations.ts src/lib/storage/index.ts src/lib/backup.ts src/privacy/dataFlows.ts src/lib/storage/migrations.test.ts src/lib/storage/index.test.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts src/privacy/dataFlows.test.ts
git commit -m "feat: persist attention source preferences"
```

---

### Task 2: Preserve stable connector item IDs

**Files:**
- Modify: `src/services/connectors/github.ts`
- Modify: `src/services/connectors/github.test.ts`
- Modify: `src/services/connectors/gitlab.ts`
- Modify: `src/services/connectors/gitlab.test.ts`
- Modify: connector widget fixture files that construct `GithubItem` or `GitlabMr`

**Interfaces:**
- Produces: required `GithubItem.id: string` and `GitlabMr.id: string` values from provider-native IDs.
- Consumes: GitHub search-result `id` and GitLab merge-request `id` fields.

- [ ] **Step 1: Write failing connector parser tests**

Add provider fixtures with numeric IDs and assert normalized strings:

```ts
expect(result.issues[0]).toMatchObject({
  id: '101',
  title: 'Assigned issue',
})

expect(result.mrs[0]).toMatchObject({
  id: '202',
  title: 'Assigned merge request',
})
```

Add one malformed-ID case per connector and assert the unusable row is skipped. Update typed fixtures to include stable IDs instead of using casts.

- [ ] **Step 2: Run parser and widget tests and verify red**

Run:

```powershell
npx vitest run src/services/connectors/github.test.ts src/services/connectors/gitlab.test.ts src/newtab/widgets/github/GithubWidget.test.tsx src/newtab/widgets/gitlab/GitlabWidget.test.tsx
```

Expected: type and assertion failures because the item interfaces and parsers do not expose IDs.

- [ ] **Step 3: Parse only provider-native stable IDs**

Change the interfaces and parser body shapes:

```ts
export interface GithubItem {
  id: string
  title: string
  url: string
  repo: string
}

export interface GitlabMr {
  id: string
  title: string
  url: string
  project: string
}
```

Accept finite integer numbers and non-empty strings, normalize with `String(value)`, and skip rows without a valid ID, title, or URL. Do not derive a ledger ID from a URL, title, array index, or repository name.

- [ ] **Step 4: Run the parser and widget tests and verify green**

Run the Step 2 command.

Expected: all connector and widget tests pass with stable IDs in every fixture.

- [ ] **Step 5: Commit stable item identity**

```powershell
git add -- src/services/connectors/github.ts src/services/connectors/github.test.ts src/services/connectors/gitlab.ts src/services/connectors/gitlab.test.ts src/newtab/widgets/github/GithubWidget.test.tsx src/newtab/widgets/gitlab/GitlabWidget.test.tsx
git commit -m "feat: retain stable work item ids"
```

---

### Task 3: Build the pure attention and ledger domain

**Files:**
- Create: `src/lib/attention.ts`
- Create: `src/lib/attention.test.ts`
- Retire or reduce: `src/lib/briefing.ts`
- Modify: `src/lib/briefing.test.ts`

**Interfaces:**
- Consumes: `AttentionLedger`, `AttentionAssignmentSource`, Calendar events, assigned-item projections, Vercel deployments, and weather hours.
- Produces: `reconcileAssignmentSource`, `collectAttentionSignals`, `summarizeAttention`, `AttentionSignal`, `AttentionAssignment`, and `AttentionInputs`.

- [ ] **Step 1: Write failing ledger reconciliation tests**

Cover silent baseline, subsequent arrival, idempotency, stale observation rejection, removal, reappearance, and six-hour expiry:

```ts
const baseline = reconcileAssignmentSource(emptyLedger(), 'github', ['old'], 1_000)
expect(baseline.sources.github?.items.old.firstSeenAt).toBeNull()

const arrived = reconcileAssignmentSource(baseline, 'github', ['old', 'new'], 2_000)
expect(arrived.sources.github?.items.new.firstSeenAt).toBe(2_000)
expect(reconcileAssignmentSource(arrived, 'github', ['old'], 1_500)).toEqual(arrived)

const removed = reconcileAssignmentSource(arrived, 'github', ['new'], 3_000)
const reappeared = reconcileAssignmentSource(removed, 'github', ['old', 'new'], 4_000)
expect(reappeared.sources.github?.items.old.firstSeenAt).toBe(4_000)
```

Assert `JSON.stringify(ledger)` contains neither a title nor an `https://` value.

- [ ] **Step 2: Write failing signal and summary tests**

Use fixed timestamps and assert:

```ts
expect(summarizeAttention([githubAssignment])).toBe('1 task needs attention')
expect(summarizeAttention([vercelFailure])).toBe('Vercel build failed')
expect(summarizeAttention([githubAssignment, vercelFailure])).toBe('2 items need attention')
expect(collectAttentionSignals(inputs({ now: SIX_HOURS + 1, deployments: [oldFailure] }))).toEqual([])
```

Also assert Calendar's 24 hour selection, timed-event preference, rain threshold, 12 and 24 hour copy, future timestamp rejection, deterministic Vercel-first ordering, whitespace cleanup, and title length bounds.

- [ ] **Step 3: Run the pure tests and verify red**

Run:

```powershell
npx vitest run src/lib/attention.test.ts src/lib/briefing.test.ts
```

Expected: missing-module and old unfinished-task behavior failures.

- [ ] **Step 4: Implement the pure domain**

Use these public contracts:

```ts
export const ATTENTION_WINDOW_MS = 6 * 60 * 60 * 1_000

export interface AttentionAssignment {
  id: string
  source: AttentionAssignmentSource
  sourceLabel: string
  title: string
  context: string
  url?: string
  firstSeenAt: number | null
}

export interface AttentionSignal {
  key: string
  kind: 'calendar' | 'assignment' | 'deployment' | 'rain'
  source: string
  title: string
  detail: string
  timestamp: number
  url?: string
}

export interface AttentionEvent {
  summary: string
  start: number
  end: number
  allDay: boolean
}

export interface AttentionDeployment {
  id: string
  project: string
  state: string
  url?: string
  createdAt: number
}

export interface AttentionHour {
  time: string
  precipProb: number
}

export interface AttentionInputs {
  now: number
  use24Hour: boolean
  events: readonly AttentionEvent[]
  assignments: readonly AttentionAssignment[]
  deployments: readonly AttentionDeployment[]
  hourly: readonly AttentionHour[]
}

export function reconcileAssignmentSource(
  ledger: AttentionLedger,
  source: AttentionAssignmentSource,
  currentIds: readonly string[],
  observedAt: number,
): AttentionLedger

export function collectAttentionSignals(inputs: AttentionInputs): AttentionSignal[]
export function summarizeAttention(signals: readonly AttentionSignal[]): string
```

`reconcileAssignmentSource` must return the original object for an equal or older observation, baseline all first-observation IDs with `firstSeenAt: null`, retain timestamps for still-present IDs, drop absent IDs, and timestamp later arrivals with `observedAt`.

`collectAttentionSignals` must exclude null-baseline and expired assignments, exclude local todo lists entirely, reject Vercel timestamps after `now`, and sort deployments, assignments, Calendar, then rain with stable timestamp and key tie-breakers.

- [ ] **Step 5: Run the pure tests and verify green**

Run the Step 3 command.

Expected: all pure-domain tests pass.

- [ ] **Step 6: Commit the pure domain**

```powershell
git add -- src/lib/attention.ts src/lib/attention.test.ts src/lib/briefing.ts src/lib/briefing.test.ts
git commit -m "feat: model explainable attention signals"
```

---

### Task 4: Coalesce attention-aware connector refreshes

**Files:**
- Create: `src/services/connectors/attentionPolicy.ts`
- Create: `src/services/connectors/attentionPolicy.test.ts`
- Create: `src/newtab/components/AttentionRefreshOwners.tsx`
- Create: `src/newtab/components/AttentionRefreshOwners.test.tsx`
- Modify: `src/newtab/widgets/github/GithubWidget.tsx`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.tsx`
- Modify: `src/newtab/widgets/jira/JiraWidget.tsx`
- Modify: `src/newtab/widgets/vercel/VercelWidget.tsx`
- Modify: relevant widget tests

**Interfaces:**
- Consumes: `BriefingSources`, connector configs, connector view resolvers, connector fetch functions, and `useConnectorSnapshot`.
- Produces: `attentionRuntimeScope`, `effectiveGithubViews`, `effectiveGitlabViews`, `effectiveJiraViews`, `effectiveVercelViews`, and `AttentionRefreshOwners`.

- [ ] **Step 1: Write failing policy tests**

Assert the helper source settings union with widget views without changing renderer preferences:

```ts
expect(effectiveGithubViews(configWithEverythingOff, enabledSources)).toEqual({
  commitGraph: false,
  pulls: true,
  issues: true,
  notifications: false,
})
expect(effectiveGitlabViews(gitlabOff, enabledSources)).toMatchObject({ mergeRequests: true, reviewAsks: true })
expect(effectiveJiraViews(jiraOff, enabledSources).assigned).toBe(true)
expect(effectiveVercelViews(vercelOff, enabledSources).deployments).toBe(true)
expect(attentionRuntimeScope(enabledSources)).toEqual({ assignments: true, deployments: true })
```

Assert all functions return the user's original resolved views and a false/false scope when the helper or matching source is off.

- [ ] **Step 2: Write failing refresh-owner tests**

Render with connected fixture configs and assert:

- Master off produces zero fetches.
- Assigned work off produces no GitHub, GitLab, Jira, or Linear request.
- Deployment failures off produces no Vercel request.
- A connected source with its source enabled mounts exactly one effective refresh per connector scope.
- A visible widget and hidden owner with identical runtime scope share the existing in-flight request.
- No new permission request API is invoked.

- [ ] **Step 3: Run policy, owner, and connector-widget tests and verify red**

Run:

```powershell
npx vitest run src/services/connectors/attentionPolicy.test.ts src/newtab/components/AttentionRefreshOwners.test.tsx src/newtab/widgets/github/GithubWidget.test.tsx src/newtab/widgets/gitlab/GitlabWidget.test.tsx src/newtab/widgets/jira/JiraWidget.test.tsx src/newtab/widgets/vercel/VercelWidget.test.tsx
```

Expected: missing policy and refresh-owner modules, followed by fetch/scope mismatches.

- [ ] **Step 4: Implement one effective policy for owners and widgets**

Use a shared runtime identity:

```ts
export interface AttentionRuntimeScope {
  assignments: boolean
  deployments: boolean
}

export function attentionRuntimeScope(
  briefingEnabled: boolean,
  sources: BriefingSources,
): AttentionRuntimeScope {
  return {
    assignments: briefingEnabled && sources.assignments,
    deployments: briefingEnabled && sources.deployments,
  }
}
```

The effective-view functions return a fresh view object whose assigned/deployment fields are the logical OR of the widget view and matching attention source. Pass the same runtime scope as `useConnectorSnapshot`'s fifth argument in both visible widgets and refresh owners. Visible widget rendering continues to use the original user-resolved views, not effective fetch views.

`AttentionRefreshOwners` mounts null-rendering per-connector child components only for fully connected configs and enabled sources. Each child calls the existing fetcher with effective views. Linear uses `fetchLinearWork`, `linearTeamIds`, and `isLinearWorkData`. Do not duplicate request, permission, scope, or storage-write machinery.

- [ ] **Step 5: Run policy, owner, and widget tests and verify green**

Run the Step 3 command.

Expected: policy, refresh ownership, coalescing, and visible-widget regressions all pass.

- [ ] **Step 6: Commit shared refresh ownership**

```powershell
git add -- src/services/connectors/attentionPolicy.ts src/services/connectors/attentionPolicy.test.ts src/newtab/components/AttentionRefreshOwners.tsx src/newtab/components/AttentionRefreshOwners.test.tsx src/newtab/widgets/github/GithubWidget.tsx src/newtab/widgets/gitlab/GitlabWidget.tsx src/newtab/widgets/jira/JiraWidget.tsx src/newtab/widgets/vercel/VercelWidget.tsx src/newtab/widgets/github/GithubWidget.test.tsx src/newtab/widgets/gitlab/GitlabWidget.test.tsx src/newtab/widgets/jira/JiraWidget.test.tsx src/newtab/widgets/vercel/VercelWidget.test.tsx
git commit -m "feat: refresh attention connector sources"
```

---

### Task 5: Project scoped snapshots into shared attention state

**Files:**
- Create: `src/newtab/components/useAttentionSignals.ts`
- Create: `src/newtab/components/useAttentionSignals.test.tsx`
- Modify: `src/services/connectors/linear.ts` only if a reusable validator/export is required

**Interfaces:**
- Consumes: hydrated Settings, connectors, snapshots, Calendar data, weather cache, attention ledger, `connectorSnapshotScope`, `reconcileAssignmentSource`, and `collectAttentionSignals`.
- Produces: `useAttentionSignals(): { signals: AttentionSignal[]; ready: boolean }`.

- [ ] **Step 1: Write failing hook tests**

Create a storage-backed hook harness and cover:

```ts
expect(result.current.signals).toEqual([]) // first valid GitHub snapshot baselines

await storage.set('connectorSnapshots', nextGithubSnapshotWithNewId)
await waitFor(() => expect(result.current.signals).toEqual([
  expect.objectContaining({ kind: 'assignment', source: 'GitHub', title: 'New issue' }),
]))
```

Also assert:

- Wrong-scope snapshots neither signal nor modify the ledger.
- Older fetched snapshots cannot roll the ledger backward.
- Disabled connectors and source switches contribute nothing.
- Old GitHub or GitLab cached rows without stable IDs are skipped safely.
- Jira uses `key`, Linear uses `id`, GitHub uses `id`, and GitLab uses `id`.
- URLs are admitted only when their origin matches GitHub, the configured GitLab instance, the configured Jira site, Linear, or a valid Vercel HTTPS destination.
- Titles, repositories, projects, and URLs do not appear in the ledger.
- Two hook instances subscribed to one storage authority converge on one ledger result.
- Calendar and weather continue to obey request identity, timezone scope, and freshness.

- [ ] **Step 2: Run the hook tests and verify red**

Run:

```powershell
npx vitest run src/newtab/components/useAttentionSignals.test.tsx
```

Expected: missing-hook failure.

- [ ] **Step 3: Implement scoped projection and queued ledger reconciliation**

The hook must:

1. Read `settings`, `connectors`, `connectorSnapshots`, `attentionLedger`, `location`, and `weatherCache` through `useStoredKey`.
2. Compute the same attention runtime scope used by refresh owners.
3. Resolve expected connector scopes asynchronously and ignore mismatches.
4. Reconcile each valid assigned-work snapshot in an effect through `storage.update('attentionLedger', updater)`.
5. Recheck `observedAt` inside the updater through `reconcileAssignmentSource`.
6. Join current snapshot rows to ledger IDs only at render time.
7. Validate link origins before exposing URLs.
8. Pass projections to `collectAttentionSignals`.

Use an explicit URL gate:

```ts
function allowedHttpsUrl(value: string, allowedOrigin: string): string | undefined {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.origin === allowedOrigin ? parsed.href : undefined
  } catch {
    return undefined
  }
}
```

For Vercel, admit only `https:` URLs and retain the exact existing connector-provided destination. Do not persist admitted URLs in the ledger.

- [ ] **Step 4: Run the hook tests and verify green**

Run the Step 2 command.

Expected: all scope, ledger, privacy, URL, freshness, and multi-instance tests pass.

- [ ] **Step 5: Commit scoped attention projection**

```powershell
git add -- src/newtab/components/useAttentionSignals.ts src/newtab/components/useAttentionSignals.test.tsx src/services/connectors/linear.ts
git commit -m "feat: project scoped attention snapshots"
```

---

### Task 6: Render the text trigger and non-modal context panel

**Files:**
- Create: `src/newtab/components/AttentionContextPanel.tsx`
- Create: `src/newtab/components/AttentionContextPanel.test.tsx`
- Modify: `src/newtab/components/AuroraBriefing.tsx`
- Modify: `src/newtab/components/AuroraBriefing.test.tsx`
- Modify: `src/newtab/index.css`
- Modify: `src/newtab/dayNowPresentation.test.ts`

**Interfaces:**
- Consumes: `useAttentionSignals`, `AttentionRefreshOwners`, `AttentionSignal[]`, and `summarizeAttention`.
- Produces: a text-only trigger and viewport-clamped labelled context region.

- [ ] **Step 1: Write failing interaction and presentation tests**

Test the context panel directly:

```ts
await user.hover(screen.getByRole('button', { name: /task needs attention/i }))
expect(screen.getByRole('region', { name: 'Attention details' })).toBeVisible()
expect(screen.getByText('First seen by Aurora 2h ago')).toBeVisible()

await user.keyboard('{Escape}')
expect(screen.queryByRole('region', { name: 'Attention details' })).toBeNull()
```

Cover pointer movement from trigger to panel, focus opening, Enter/Space/tap toggling, outside-pointer closing, focus transfer, Escape focus return, link keyboard reachability, `aria-expanded`, `aria-controls`, and unmount cleanup. Mock edge rectangles and assert the fixed panel stays within an 8px viewport margin.

Update the briefing component tests to assert:

- No unfinished local-task copy appears.
- Refresh owners mount while the master switch is on even when there is no visible signal.
- The trigger has no widget/card class, icon, or preview wrapper.
- Mixed signals use the approved summary copy.
- The exact source detail rows appear when opened.
- Master-off state renders neither owner nor trigger.

- [ ] **Step 2: Run component tests and verify red**

Run:

```powershell
npx vitest run src/newtab/components/AttentionContextPanel.test.tsx src/newtab/components/AuroraBriefing.test.tsx src/newtab/dayNowPresentation.test.ts
```

Expected: missing component and old plain-paragraph behavior failures.

- [ ] **Step 3: Implement the context panel interaction**

`AttentionContextPanel` owns one trigger ref, one panel ref, local open state, a short close timer, outside-pointer and Escape listeners, and a `useLayoutEffect` measurement. Render the panel through `createPortal(document.body)` with fixed `left` and `top` clamped against its measured dimensions and an 8px margin.

Use this semantic outline:

```tsx
<button
  ref={triggerRef}
  type="button"
  aria-expanded={open}
  aria-controls={open ? panelId : undefined}
  className="aurora-briefing__trigger"
>
  {summary}
</button>
{open && createPortal(
  <section id={panelId} ref={panelRef} aria-label="Attention details" className="aurora-attention-panel">
    <ul>{signals.map(renderSignalRow)}</ul>
  </section>,
  document.body,
)}
```

The panel has no `aria-modal`, backdrop, focus trap, or scroll lock. Links receive visible focus styling and safe `rel="noreferrer"` behavior.

- [ ] **Step 4: Integrate the hook and refresh owners into AuroraBriefing**

Render `AttentionRefreshOwners` whenever Settings and connectors are hydrated and the master switch is on. Render `AttentionContextPanel` only when `useAttentionSignals` is ready and has signals. Remove `todoLists` reads and the three duplicate profile paragraphs.

Style a plain text trigger with transparent background, inherited photo ink, underline or tone change only on hover/focus, and no permanent panel chrome. Style the portaled surface with the existing solid panel token, bounded width, maximum viewport height, and no page-level scrollbar changes.

- [ ] **Step 5: Run component tests and verify green**

Run the Step 2 command.

Expected: all context interactions, accessibility semantics, helper composition, and text-only presentation tests pass.

- [ ] **Step 6: Commit the interaction**

```powershell
git add -- src/newtab/components/AttentionContextPanel.tsx src/newtab/components/AttentionContextPanel.test.tsx src/newtab/components/AuroraBriefing.tsx src/newtab/components/AuroraBriefing.test.tsx src/newtab/index.css src/newtab/dayNowPresentation.test.ts
git commit -m "feat: explain greeting attention context"
```

---

### Task 7: Add independent source settings

**Files:**
- Modify: `src/settings/sections/General.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `Settings.briefingEnabled`, `Settings.briefingSources`, and the existing `patch(Partial<Settings>)` authority.
- Produces: four subordinate switches with preserved sibling values.

- [ ] **Step 1: Write failing Settings tests**

Assert the approved copy and persistence:

```ts
expect(screen.getByText(/newly observed GitHub, GitLab, Jira, and Linear items/i)).toBeVisible()
await user.click(screen.getByRole('switch', { name: 'Assigned work' }))
expect((await storage.get('settings')).briefingSources).toEqual({
  calendar: true,
  assignments: false,
  deployments: true,
  rain: true,
})
```

Assert all four controls are hidden or disabled when the master is off, every switch has description text, changing one preserves the other three, and external cross-tab Settings updates replace the displayed switch states.

- [ ] **Step 2: Run Settings tests and verify red**

Run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx
```

Expected: missing source controls and outdated unfinished-task copy.

- [ ] **Step 3: Implement subordinate controls**

Replace the old description with truthful copy and render four rows while the master is enabled. Use a source-specific patch helper that reads the current `settings.briefingSources` prop on every render:

```ts
const patchBriefingSource = (key: keyof BriefingSources, checked: boolean) => {
  patch({
    briefingSources: {
      ...settings.briefingSources,
      [key]: checked,
    },
  })
}
```

Labels are exactly `Upcoming calendar`, `Assigned work`, `Deployment failures`, and `Rain`. Copy states that Assigned work means newly observed connector items and that undated Aurora tasks are not counted.

- [ ] **Step 4: Run Settings tests and verify green**

Run the Step 2 command.

Expected: Settings persistence, descriptions, and cross-tab rendering pass.

- [ ] **Step 5: Commit source controls**

```powershell
git add -- src/settings/sections/General.tsx src/settings/SettingsPanel.test.tsx
git commit -m "feat: control greeting attention sources"
```

---

### Task 8: Add exact browser QA and deliver the branch

**Files:**
- Create: `scripts/qa-attention-signals.mjs`
- Create: `scripts/qa-attention-signals.test.mjs`
- Modify: `package.json`
- Create: `artifacts/qa-attention-signals/<commit>/` through the QA script only

**Interfaces:**
- Consumes: exact `dist/build-provenance.json`, the extension build, Playwright, controlled storage fixtures, and the implemented attention UI.
- Produces: screenshots, geometry JSON, interaction assertions, console/page-error logs, and a pushed commit matching local HEAD.

- [ ] **Step 1: Write the failing QA contract test**

The script contract must assert source text for every required gate:

```js
assert.match(source, /process\.argv\.includes\('--exact'\)/)
assert.match(source, /build-provenance\.json/)
assert.match(source, /aria-expanded/)
assert.match(source, /Attention details/)
assert.match(source, /1600/)
assert.match(source, /900/)
assert.match(source, /two-tab/i)
assert.match(source, /console/i)
assert.match(source, /pageerror/i)
assert.match(source, /overlap|intersection/i)
```

- [ ] **Step 2: Run the contract test and verify red**

Run:

```powershell
node --test scripts/qa-attention-signals.test.mjs
```

Expected: missing-script failure.

- [ ] **Step 3: Implement the exact Playwright witness**

`qa-attention-signals.mjs` must:

1. Require `--exact` unconditionally.
2. Read HEAD and assert `dist/build-provenance.json` matches it.
3. Launch the unpacked extension in Chromium.
4. Seed an existing-layout-shaped 1600x900 fixture with Greeting, Clock, Calendar, GitHub, and Vercel data.
5. Baseline one existing assignment, then commit a later fixture snapshot with one new stable ID.
6. Assert the summary, hover open, keyboard open, tap toggle, Escape, outside pointer, detail copy, and links.
7. Assert the context panel is inside the viewport and has no pairwise overlap with the Clock or Settings controls.
8. Open a second extension tab, assert both tabs converge on the same attention result, and verify panel-open state remains local.
9. Toggle every source and the master setting through real Settings controls.
10. Capture 1600x900, compact-width, edge-clamped, and touch-context screenshots.
11. Fail on console errors, page errors, unexpected scrollbar, stuck panel, overflow, or pointer interception.
12. Write commit, provenance, geometry, and interaction results under `artifacts/qa-attention-signals/<commit>/`.

Add `"qa:attention-signals": "node scripts/qa-attention-signals.mjs --exact"` to `package.json`.

- [ ] **Step 4: Run focused and full automated verification**

Run:

```powershell
node --test scripts/qa-attention-signals.test.mjs
npx vitest run src/lib/attention.test.ts src/newtab/components/useAttentionSignals.test.tsx src/newtab/components/AttentionRefreshOwners.test.tsx src/newtab/components/AttentionContextPanel.test.tsx src/newtab/components/AuroraBriefing.test.tsx src/settings/SettingsPanel.test.tsx src/lib/storage/migrations.test.ts src/lib/backup.test.ts src/privacy/dataFlows.test.ts
npm test
npm run build
```

Expected: every command exits 0 and the build writes HEAD to `dist/build-provenance.json`.

- [ ] **Step 5: Commit the QA harness against the feature commit**

```powershell
git add -- scripts/qa-attention-signals.mjs scripts/qa-attention-signals.test.mjs package.json
git commit -m "test: verify attention signals in chromium"
npm run build
npm run qa:attention-signals
```

Expected: exact browser QA exits 0 and writes evidence under the final commit directory.

- [ ] **Step 6: Run one bounded implementation review and fix blockers**

Review only the range `88b66eb..HEAD` for Critical or Important correctness, data-loss, privacy, accessibility, and false-PASS defects. Record each finding with exact file and line evidence. Fix every Critical or Important finding with a focused failing test, rerun its focused tests, and commit once as:

```powershell
git commit -m "fix: address attention signal review"
```

If the review produces no Critical or Important finding, do not create an empty fix commit.

- [ ] **Step 7: Run the stabilized final gate once**

After the last code commit, run exactly:

```powershell
npm test
npm run build
node --test scripts/qa-attention-signals.test.mjs
npm run qa:attention-signals
git diff --check
git status --short --branch
```

Expected: tests, build, QA contract, exact browser QA, and whitespace check all exit 0. Only pre-existing untracked `artifacts/` and `docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md` may remain outside the committed change.

- [ ] **Step 8: Push and verify exact remote equality**

```powershell
git push origin feat/aurora-2-observatory
$localCommit = git rev-parse HEAD
$remoteCommit = (git ls-remote origin refs/heads/feat/aurora-2-observatory).Split()[0]
if ($localCommit -ne $remoteCommit) { throw "Remote commit does not match local HEAD" }
git rev-list --left-right --count HEAD...origin/feat/aurora-2-observatory
```

Expected: local and remote commit hashes match and divergence is `0 0`.

- [ ] **Step 9: Hand off MacBook validation and premium discussion**

Provide the exact pushed commit and these Mac commands:

```bash
git fetch origin
git switch feat/aurora-2-observatory
git pull --ff-only
npm ci
npm run build
```

Then instruct the owner to load the repository's `dist` directory through `chrome://extensions` in Developer mode. State that merge, release, Store activity, and premium implementation remain unperformed. Begin the separate premium-subscription product conversation only after the attention feature handoff is complete.
