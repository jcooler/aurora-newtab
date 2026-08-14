# Optional-Permission Transactions and Shared-Origin Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every W1-P3 host-permission acquisition and release recoverable, preserve pre-existing grants, coordinate ownership across connectors and APOD, and replace the misleading `remove revokes live` evidence with a truthful adapter-driven production-path proof plus an explicit native headless disposition.

**Architecture:** Initialize one permission mirror before React renders: `getAll()` seeds its held-pattern set and long-lived `onAdded`/`onRemoved` listeners keep it current. A user gesture reads that mirror synchronously, queues a cross-context permission-lifecycle Web Lock, and requests only snapshot-absent patterns in the same turn before resolving the lock callback's start gate. Snapshot-present patterns are never re-requested, so an already-running release can only make the locked access check abort, not create an untracked reacquisition. The lock then covers validation/persistence, rollback, and releases. A pure owner registry derives current claims from every configured connector descriptor plus APOD; stable Settings-level cleanup state exposes failed revokes with a bounded Retry action.

**Tech Stack:** TypeScript 5.9 strict, React 19, Chrome Manifest V3 `chrome.permissions`, Aurora cross-context storage authority, Vitest 3 + Testing Library, Playwright real-extension preview harness.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` section 10.2, `docs/superpowers/aurora-2/ROADMAP.md` W1-P3, and decisions A2-D009/A2-D011 in `docs/superpowers/aurora-2/DECISIONS.md`.

## Global Constraints

- Execute only W1-P3. Do not implement backup/restore permission reconciliation (W1-P4), Home Assistant polling/action changes (W1-P5), layout/CSS redesign, manifest permission expansion, privacy/Store copy, dependency upgrades, packaging, release staging, or Store actions.
- Preserve `D:\DEV\Chrome plugin` and every V1 artifact. Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`.
- `initializePermissionMirror()` runs before React renders. It awaits one `chrome.permissions.getAll()`, then maintains a synchronous set through `onAdded` and `onRemoved`. Initialization failure leaves the mirror explicitly unavailable while the app still renders; permission actions fail visibly without calling `request`. The listeners are registered before the seed read and events observed during initialization win over the seed, matching Aurora storage's subscribe-before-read discipline.
- When any click-time snapshot pattern is absent, one `chrome.permissions.request` for only that absent subset must be invoked in the initiating event turn with no awaited work before it. Synchronous validation, reading the initialized mirror, and synchronously queueing the lifecycle Web Lock are allowed; awaiting a lock, `contains`, storage, network, or any other promise before `request` is forbidden. The lock callback waits on a gate resolved only after `request` has been called. An all-pre-existing set queues the same locked body without making a redundant request.
- The acquisition record is per canonical `https://host[:port]/*` pattern. Duplicate input URLs collapse to one pattern. Patterns present in the synchronous mirror snapshot are pre-existing and are excluded from the request; absent patterns are acquired if their already-started batched request resolves true. If an already-running release removes a snapshot-present pattern, the transaction does not reacquire it and the locked `contains` check returns `access-lost`. A later `onAdded` event updates the shared mirror but is not needed for classification, so no event/promise timing is inferred. If the mirror is unavailable, no request is made.
- One stable Web Lock name, `aurora:origin-permission-lifecycle:v1`, serializes acquisition bodies, owner-changing writes, ownership reads, rollback, and release across extension contexts. Public releases acquire it; transaction rollback uses a private already-held variant to avoid nested-lock deadlock. Before a body writes an owner, `contains({ origins: requested })` must prove all requested access is still held. A request queued behind an earlier transaction that rolled the same origin back aborts explicitly and asks the user to retry; it never persists an owner without permission. No unsafe in-process production fallback is allowed.
- Transaction bodies cover synchronous input validation, post-grant network validation where present, and the authoritative storage write. Denial stores nothing. Validation or storage failure leaves no newly acquired unowned grant. A pre-existing grant is never rolled back.
- The shared owner registry is the only release authority. It must derive every configured connector origin through the real connector registry (token connectors, RSS, Crypto, ICS/calendar, Status, and Home Assistant) regardless of the card's `enabled` flag, because disabling preserves config and re-enable performs no request. Every descriptor supplies an explicit `ownsOrigins(config)` readiness predicate so enabled-but-unconfigured constant-origin cards do not become owners. APOD claims its two origins only while `photoPrefs.mode === 'apod'`. Providers dedupe patterns, tolerate malformed stored config, and extend by registration rather than caller edits.
- Releasing an origin happens after the owner write and inside the lifecycle lock. The release helper reads `connectors` and `photoPrefs` while that lock excludes other W1-P3 owner-body/release changes, so same-connector duplicates, cross-connector sharing, APOD sharing, and owner writes queued ahead of release withhold revocation. Simultaneous request calls may overlap because neither can await the lock without losing the gesture; the held-access recheck makes an origin removed by an earlier rollback an explicit retry instead of an inconsistent persisted owner. W1-P4 must use the same authority when restore later changes owners.
- `chrome.permissions.remove` resolving `true` is success. On `false`, immediately call `contains` inside the lifecycle lock: absent is terminal success; still held or an unverifiable check remains pending. Rejection is explicit and retryable.
- Retry UI must be a visible `role="alert"` with a real `Retry permission cleanup` button. One Settings-level cleanup controller merges/dedupes concurrent failures, retries only failed still-unowned patterns, clears after success, and survives token/Crypto config deletion, row removal, connector body unmount, and tab changes while Settings remains mounted.
- Preserve connector snapshot identity and THE PACT. List-changing ICS and Status writes still clear only their own snapshot; token reconnect epochs remain; no W1-P1/W1-P2 behavior may regress.
- Unit/component tests use real transaction/ownership code and a complete fake `chrome.permissions` boundary. Do not assert only that a mocked helper was called where a state/permission outcome can be asserted.
- The preview harness may inject a preview-only permissions adapter, including `getAll`, `onAdded`, and `onRemoved`, before a page reload so the mirror initializes against it; production builds must contain neither the adapter global name nor a callable bridge. The real-extension probe must drive actual Settings controls and production transaction code.
- The native Chrome host-permission prompt remains non-automatable headlessly. The harness must retain honest native prompt SKIPs while separately proving transaction semantics through the preview-only boundary adapter. Do not claim a synthetic Allow/Block click occurred.
- The old `remove revokes live` baseline item is not considered resolved merely because its live row/dot assertion passes. Record that it now passes at W1-P2 HEAD but never asserted a held native grant; rename it as a live storage/UI assertion. Adapter held-set checks prove transaction behavior only. A2-D011's native host-grant revoke leg remains explicitly unautomated headlessly unless a genuine native grant becomes available.
- Every production change follows RED -> verify expected failure -> minimal GREEN -> refactor while green. Commit task-sized implementation increments. Final closeout uses a dedicated `docs: checkpoint W1-P3` commit and stops before creating a W1-P4 plan.

---

### Task 0: Commit the independently reviewed execution base

**Files:**

- Review/fix: `docs/superpowers/plans/2026-08-13-w1-p3-optional-permission-transactions.md`

**Interfaces:**

- Produces: one immutable plan-base SHA for all W1-P3 implementation/review ranges.

- [ ] **Step 1: Apply the independent plan review**

Before production edits, dispatch a read-only reviewer against this plan, the master spec section 10.2, ROADMAP W1-P3, current `src/services/permissions.ts`, connector/APOD call sites, and the current-head harness reproduction. Require Critical/Important/Minor findings with file/line references and explicit coverage of gesture ordering, pre-existing-grant races, partial persistence, cross-feature ownership, retry lifetime, harness truthfulness, and W1-P4 scope exclusion.

Verify every finding against repository evidence. Fix confirmed Critical/Important findings and packet-local Minor correctness gaps in this plan. Reject unsupported suggestions with exact code/spec evidence.

- [ ] **Step 2: Self-review and commit the plan base**

Run:

```powershell
rg -n "TB[D]|TO[D]O|implement late[r]|similar t[o]|appropriate error handlin[g]|write tests fo[r]" docs/superpowers/plans/2026-08-13-w1-p3-optional-permission-transactions.md
git diff --check
git diff -- docs/superpowers/plans/2026-08-13-w1-p3-optional-permission-transactions.md
```

Require no placeholder hits and no whitespace errors. Then commit only the plan:

```powershell
git add docs/superpowers/plans/2026-08-13-w1-p3-optional-permission-transactions.md
git commit -m "docs: plan W1-P3 optional permission transactions"
git rev-parse HEAD
```

Record that SHA as `W1_P3_PLAN_BASE`.

---

### Task 1: Gesture-safe acquisition records, owner registry, and retryable release

**Files:**

- Modify: `src/services/permissions.ts`
- Modify: `src/services/permissions.test.ts`
- Create: `src/services/permissionMirror.ts`
- Create: `src/services/permissionMirror.test.ts`
- Create: `src/services/originOwnership.ts`
- Create: `src/services/originOwnership.test.ts`
- Create: `src/services/permissionTransactions.ts`
- Create: `src/services/permissionTransactions.test.ts`
- Modify: `src/services/connectors/types.ts`
- Modify: `src/services/connectors/registry.ts`
- Modify: `src/services/connectors/registry.test.ts`
- Modify: `src/services/connectors/rss.ts`
- Modify: `src/services/connectors/rss.test.ts`
- Modify: `src/services/connectors/github.ts`
- Modify: `src/services/connectors/github.test.ts`
- Modify: `src/services/connectors/gitlab.ts`
- Modify: `src/services/connectors/gitlab.test.ts`
- Modify: `src/services/connectors/jira.ts`
- Modify: `src/services/connectors/jira.test.ts`
- Modify: `src/services/connectors/vercel.ts`
- Modify: `src/services/connectors/vercel.test.ts`
- Modify: `src/services/connectors/crypto.ts`
- Modify: `src/services/connectors/crypto.test.ts`
- Modify: `src/services/connectors/ics.ts`
- Modify: `src/services/connectors/ics.test.ts`
- Modify: `src/services/connectors/status.ts`
- Modify: `src/services/connectors/status.test.ts`
- Modify: `src/services/connectors/homeassistant.ts`
- Modify: `src/services/connectors/homeassistant.test.ts`
- Modify: `src/newtab/main.tsx`

**Interfaces:**

- `canonicalOriginPatterns(urls: readonly string[]): string[]` returns stable, deduped HTTPS match patterns or throws before any Chrome call.
- `initializePermissionMirror(): Promise<void>` registers long-lived `permissions.onAdded` and `permissions.onRemoved` listeners before its single `permissions.getAll()` seed read. Per-pattern events observed during initialization override the seed. Initialization settles before React renders; failure records an explicit unavailable state without preventing render.
- `permissionMirror.snapshot(patterns): PermissionMirrorSnapshot` is synchronous and returns exact canonical `preExisting` and `absent` sets only when ready. It never performs a Chrome call. The production singleton remains subscribed for the page lifetime.
- `removeOrigin(patternOrUrl: string): Promise<boolean>` returns Chrome's boolean and propagates rejection.
- `ConnectorDescriptor.ownsOrigins(config): boolean` is required and pure; every real descriptor defines its own configured/readiness boundary independently from `enabled`.
- `ORIGIN_OWNER_PROVIDERS` registers connector and APOD providers; `ownedOriginPatterns(state: OriginOwnershipState): string[]` is pure, defensive, deduped, and counts configured disabled connectors.
- `readOwnedOriginPatterns(storage: AuroraStorage): Promise<string[]>` reads `connectors` and `photoPrefs` and feeds the pure registry.
- `OriginPermissionAuthority.runExclusive` uses the stable Web Lock in production and an injected in-process authority in tests. `beginOriginTransaction` queues it before the request and has no production fallback when Web Locks are absent.
- `releaseUnownedOrigins(storage, candidates, authority?): Promise<OriginReleaseResult>` holds the lifecycle authority across ownership reads, remove, and false-result verification, returning `{ released: string[]; pending: string[] }` without swallowing failures.
- `retryOriginRelease(storage, pending, authority?): Promise<OriginReleaseResult>` is the same locked ownership-aware operation over only the prior pending set.
- `runOriginTransaction<T>(storage, urls, body, authority?): Promise<OriginTransactionResult<T>>` synchronously snapshots the ready mirror, queues the lifecycle lock behind a local start gate, and, when needed, calls one batched `permissions.request` for only the absent subset before opening that gate. It classifies `preExisting` from the excluded present set and, only when request returns true, `acquired` from the requested absent set. It then holds the lifecycle lock across full-set access verification, `body`, and rollback. The body returns success only when the owner actually landed; concurrent duplicate/cap no-ops return an abort and trigger ownership-aware rollback.

- [ ] **Step 1: Write the failing wrapper, ownership, and transaction tests**

Add literal, behavior-focused tests for:

1. Mirror initialization subscribes before `getAll`; `onAdded`/`onRemoved` events that arrive while the seed is pending win per pattern, later events update the ready mirror, and initialization rejection makes the mirror unavailable while allowing application startup to finish.
2. `runOriginTransaction` canonicalizes/dedupes inputs, synchronously snapshots the mirror, queues the lifecycle lock, and invokes one batched `request` for only snapshot-absent patterns in the original event turn without waiting for the lock callback. No `getAll`, event drain, or other promise precedes `request`; an all-present set makes no redundant request.
3. Mixed pre-existence (`a` present and `b` absent in the click-time mirror snapshot) records only `b` as acquired after a successful request. An unavailable mirror never calls `request` or runs the body and returns an explicit unavailable result.
4. Denial/rejection never runs the transaction body and never writes storage.
5. Body validation failure removes only newly acquired origins; a pre-existing origin remains held.
6. An injected `storage.update` rejection produces an explicit failed result and rolls back the new unowned grant.
7. If the body partially persisted an owner before throwing, the fresh owner read withholds rollback for that now-configured origin.
8. The lifecycle authority blocks release between acquisition classification and owner commit, and blocks a second context's owner-changing body between ownership read and remove; deterministic deferred tests force both interleavings. If a release already owns the lock when a transaction snapshots a held pattern, that pattern is excluded from request; after the release removes it, the queued transaction fails its full-set `contains` recheck with `access-lost` and never persists or reacquires it. A second request queued while a first failing transaction holds the lock likewise aborts if the first rollback removed access.
9. RSS + Status, ICS/calendar + Home Assistant, token + APOD, and same-connector duplicate rows sharing an origin all dedupe to one active claim.
10. Configured-but-disabled connectors remain owners; enabled-but-unconfigured GitHub/Vercel/Crypto entries do not. Every real descriptor's readiness predicate is covered.
11. Removing one owner with another still configured makes no `remove` call; removing the final owner does.
12. `remove(false)` followed by `contains(false)` is terminal success; `remove(false)` plus `contains(true)`, a rejecting remove, or a rejecting verification appears in `pending`; retry attempts only pending origins, rechecks ownership, and clears on success.
13. Malformed connector configs and malformed provider output cannot throw out of the ownership sweep.

Name the realistic mutation each test catches in a short comment or test name: request delayed past the gesture turn, seed overwriting an initialization event, blanket rollback, connector-only ownership, swallowed revoke, duplicate remove, or stale-owner removal.

- [ ] **Step 2: Run the new core tests and verify RED**

Run:

```powershell
npx vitest run src/services/permissions.test.ts src/services/permissionMirror.test.ts src/services/originOwnership.test.ts src/services/permissionTransactions.test.ts
```

Expected: FAIL because the new modules/exports do not exist and current `removeOrigin` swallows rejection/returns `void`. Fix only test setup errors until failures name missing transaction/ownership behavior.

- [ ] **Step 3: Implement the minimal permission core**

Implement the interfaces above. `main.tsx` awaits mirror initialization before `createRoot`; it catches initialization failure through the mirror's explicit unavailable state so the app still renders. The mirror resolves the Chrome-or-preview boundary once at initialization, registers both listeners before `getAll`, and reconciles seed-versus-event races per pattern.

After synchronous canonicalization, `runOriginTransaction` synchronously snapshots that mirror and invokes `authority.runExclusive` with a callback blocked on a local start gate; it then calls `chrome.permissions.request({ origins: snapshot.absent })` when that set is nonempty and resolves the gate, all without awaiting. The callback awaits the already-started request when present, derives acquired patterns only from that absent-at-click set after success, verifies the full canonical requested set is still held, runs the body, and performs ownership-aware rollback before releasing the lock. Keep `permissions.ts` free of storage/React imports.

The transaction body result is exactly:

```ts
type TransactionBodyResult<T> =
  | { ok: true; value: T; ownerCommitted: true }
  | { ok: false; message: string }
```

The outer result must distinguish `permission-unavailable`, `denied`, `access-lost`, `aborted`, `failed`, and `committed`; failure variants carry `pendingCleanup: string[]` where applicable. Do not convert unknown exceptions into logs-only success.

The ownership provider input is exactly the persisted state needed by W1-P3:

```ts
interface OriginOwnershipState {
  connectors: Partial<Record<ConnectorId, ConnectorConfig>>
  photoPrefs: PhotoPrefs
}
```

The APOD provider claims `APOD_ORIGINS` only in `mode: 'apod'`. The connector provider delegates through the actual descriptor registry and each descriptor's `ownsOrigins`; no connector IDs or hostnames are copied into the ownership service. Descriptor tests must prove incomplete backup/generic-toggle shapes do not own constant origins and complete disabled configs do.

- [ ] **Step 4: Verify GREEN and commit Task 1**

Run:

```powershell
npx vitest run src/services/permissions.test.ts src/services/permissionMirror.test.ts src/services/connectors/registry.test.ts src/services/originOwnership.test.ts src/services/permissionTransactions.test.ts
npx tsc --noEmit
git diff --check
```

Require all green, then commit only Task 1 files:

```powershell
git add src/services/permissions.ts src/services/permissions.test.ts src/services/permissionMirror.ts src/services/permissionMirror.test.ts src/services/originOwnership.ts src/services/originOwnership.test.ts src/services/permissionTransactions.ts src/services/permissionTransactions.test.ts src/services/connectors/types.ts src/services/connectors/registry.ts src/services/connectors/registry.test.ts src/services/connectors/rss.ts src/services/connectors/rss.test.ts src/services/connectors/github.ts src/services/connectors/github.test.ts src/services/connectors/gitlab.ts src/services/connectors/gitlab.test.ts src/services/connectors/jira.ts src/services/connectors/jira.test.ts src/services/connectors/vercel.ts src/services/connectors/vercel.test.ts src/services/connectors/crypto.ts src/services/connectors/crypto.test.ts src/services/connectors/ics.ts src/services/connectors/ics.test.ts src/services/connectors/status.ts src/services/connectors/status.test.ts src/services/connectors/homeassistant.ts src/services/connectors/homeassistant.test.ts src/newtab/main.tsx
git commit -m "feat(permissions): add recoverable origin transactions"
```

---

### Task 2: Token connector transactions and persistent cleanup retry

**Files:**

- Modify: `src/settings/sections/TokenConnectForm.tsx`
- Modify: `src/settings/sections/TokenConnectForm.test.tsx`
- Modify: `src/settings/sections/Connectors.tsx`
- Modify: `src/settings/SettingsPanel.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Create: `src/settings/PermissionCleanupAlert.tsx`
- Create: `src/settings/PermissionCleanupAlert.test.tsx`
- Create: `src/settings/usePermissionCleanup.ts`
- Create: `src/settings/usePermissionCleanup.test.tsx`

**Interfaces:**

- `TokenConnectForm` receives the real `AuroraStorage` instance and runs `runOriginTransaction` around its existing `validate -> onConnected` chain.
- Token `onDisconnect` callbacks return the actual canonical candidate origins captured from the configuration removed by the authoritative `storage.update`.
- `PermissionCleanupAlert` renders only when pending patterns exist, uses `role="alert"`, and exposes `Retry permission cleanup`.
- `usePermissionCleanup(storage)` lives in `SettingsPanel`, merges/dedupes pending patterns from Background and Connectors, calls `retryOriginRelease`, and retains pending state across connector body/card unmount and Settings tab changes.
- `SettingsPanel` renders one `PermissionCleanupAlert` outside the active-tab subtree and passes `reportPendingCleanup(patterns)` to Background and Connectors; bodies/forms never own the durable pending set.

- [ ] **Step 1: Write failing token transaction and retry tests**

Replace the `ensureOrigin`-call-only tests with real transaction tests against a complete fake Chrome permission boundary and memory/rejecting storage drivers. Prove:

1. Clicking Connect calls `request` in the same event turn after the lifecycle lock is queued but before its callback starts work; the click-time mirror snapshot distinguishes the pre-existing and newly acquired patterns before validation/persistence continue.
2. Invalid credentials after a newly granted origin leave no connector and remove that origin.
3. Invalid credentials with a pre-existing grant leave the grant intact.
4. Injected `onConnected`/storage rejection leaves no connector, rolls back a new grant, and shows a recoverable alert rather than an unhandled rejection.
5. Rollback rejection reports pending patterns to Settings; the cleanup alert and Retry button survive switching tabs, retry succeeds, and the merged set clears only after every pending pattern is terminal.
6. Disconnect captures the removed connector's actual descriptor origins, preserves an origin owned by any other provider, removes a final-owner grant, and retains retry UI after the connector config/body disappears entirely.
7. GitHub, GitLab (including port), Jira, Vercel, and Home Assistant continue to pass their real descriptor-derived single origin and preserve reconnect epochs/config fields.

- [ ] **Step 2: Run token/component tests and verify RED**

Run:

```powershell
npx vitest run src/settings/sections/TokenConnectForm.test.tsx src/settings/PermissionCleanupAlert.test.tsx src/settings/SettingsPanel.test.tsx
```

Expected: FAIL because TokenConnectForm still calls `ensureOrigin`, persistence failures escape, disconnect returns no candidates, and no stable Settings-level cleanup controller/UI exists.

- [ ] **Step 3: Implement token integration**

Keep synchronous field/origin validation ahead of `runOriginTransaction`, with no awaited call in between. Inside the transaction body, convert `validate`'s `{ ok: false, message }` to the body abort result; only successful validation calls `onConnected`, which returns `ownerCommitted: true` only after the storage write settles. Map outcomes to the existing connector-specific denial/validation copy plus one storage failure message. Forward rollback/revoke pending patterns to the Settings-level cleanup controller.

Consolidate repeated token disconnect bookkeeping through one local helper that captures descriptor origins from the value removed inside `storage.update`; do not compute candidates from stale render props or a separate pre-read. The helper runs owner mutation and release under the lifecycle authority and forwards pending patterns to Settings before the body unmounts.

- [ ] **Step 4: Verify GREEN and commit Task 2**

Run:

```powershell
npx vitest run src/settings/sections/TokenConnectForm.test.tsx src/settings/PermissionCleanupAlert.test.tsx src/settings/usePermissionCleanup.test.tsx src/settings/SettingsPanel.test.tsx src/services/permissionTransactions.test.ts
npx tsc --noEmit
git diff --check
```

Commit only token/shared-UI files:

```powershell
git add src/settings/sections/TokenConnectForm.tsx src/settings/sections/TokenConnectForm.test.tsx src/settings/sections/Connectors.tsx src/settings/SettingsPanel.tsx src/settings/SettingsPanel.test.tsx src/settings/PermissionCleanupAlert.tsx src/settings/PermissionCleanupAlert.test.tsx src/settings/usePermissionCleanup.ts src/settings/usePermissionCleanup.test.tsx
git commit -m "fix(connectors): transact token origin grants"
```

---

### Task 3: RSS, Crypto, ICS, and Status acquisition/release transactions

**Files:**

- Modify: `src/settings/sections/Connectors.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Reuse: `src/settings/PermissionCleanupAlert.tsx`
- Reuse: `src/services/permissionTransactions.ts`

**Interfaces:**

- RSS, Crypto, ICS, and Status acquisition paths call `runOriginTransaction(storage, urls, body)` as the first asynchronous permission operation after their existing synchronous validation/duplicate/cap checks.
- Each item removal writes survivors first and calls `releaseUnownedOrigins` for the removed item's canonical origin under the lifecycle authority; ICS/Status snapshot clearing is ancillary and cannot skip release if it rejects.
- Crypto Clear uses the same descriptor-candidate disconnect helper as token connectors.
- Every body forwards pending cleanup to the Settings-level controller; Crypto/body unmount and row removal cannot remove the Retry surface.

- [ ] **Step 1: Add failing multi-entry transaction tests**

Extend the existing real SettingsPanel connector tests to cover:

1. RSS/ICS/Status add storage rejection rolls back a newly acquired origin; Crypto save rejection does the same.
2. A pre-existing origin survives each rejected persistence path.
3. A concurrent duplicate/cap change that makes the authoritative updater a no-op reports `ownerCommitted: false`, does not report transaction success, and rolls back only when the fresh ownership state does not already claim the origin.
4. Two RSS feeds, two ICS calendars, or two Status services on one host retain the grant until the final same-connector row is removed.
5. Cross-type sharing (RSS + Status, ICS + Home Assistant, Crypto/token descriptor where a test descriptor supplies the same origin) withholds revoke until the final configured owner disappears, including when that owner is disabled but still configured.
6. APOD sharing with a connector on `api.nasa.gov` withholds the API origin while APOD is selected; APOD's image origin remains independently owned.
7. Final-owner removal invokes Chrome remove; `false` is terminal only after `contains` proves absence.
8. Revoke rejection leaves the config/item removed, reports to the stable cleanup alert, retries only the failed origin, and clears after success.
9. Status curated `<select>` and custom form both reach `request` before the lifecycle lock callback or any other promise settles, preserving user-gesture order.
10. ICS/Status list changes still clear only `connectorSnapshots.ics` / `.status`; failed acquisition/persistence does not clear a snapshot for a change that never committed.
11. Injected ICS/Status snapshot-clear rejection after removal still attempts final-owner release and reports the ancillary cache error separately.

- [ ] **Step 2: Run the connector tests and verify RED**

Run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx src/services/originOwnership.test.ts src/services/permissionTransactions.test.ts
```

Expected: FAIL on leaked grants, swallowed revoke errors, connector-only ownership, missing Retry UI, or gesture-order assertions.

- [ ] **Step 3: Implement the four connector flows**

Replace `ensureOrigin` and manual `releasableOrigins`/same-host checks only in the W1-P3 flows. The transaction body owns the authoritative connector update and returns committed only when its updater actually adds/saves the requested owner; concurrent duplicate/cap no-ops return the abort form. Perform snapshot clearing after a successful owner write; if snapshot cleanup rejects, report it without revoking a permission that the now-persisted owner still needs. On removal, capture the candidate from the removed row/config, write survivors, then use the locked global ownership registry. For ICS/Status removal, run snapshot cleanup and permission release as independently awaited results (or `try/finally`) so either failure cannot suppress the other.

Do not change connector enable toggles, network fetchers, descriptors, widget rendering, caps, labels, or view settings.

- [ ] **Step 4: Verify GREEN and commit Task 3**

Run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx src/settings/sections/TokenConnectForm.test.tsx src/settings/PermissionCleanupAlert.test.tsx src/services/permissions.test.ts src/services/connectors/registry.test.ts src/services/originOwnership.test.ts src/services/permissionTransactions.test.ts
npx tsc --noEmit
git diff --check
```

Commit only the connector integration/test delta:

```powershell
git add src/settings/sections/Connectors.tsx src/settings/SettingsPanel.test.tsx
git commit -m "fix(connectors): coordinate shared origin ownership"
```

---

### Task 4: APOD transaction, cross-feature final ownership, and retry

**Files:**

- Modify: `src/settings/sections/Background.tsx`
- Modify: `src/settings/SettingsPanel.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Reuse: `src/settings/PermissionCleanupAlert.tsx`
- Reuse: `src/services/permissionTransactions.ts`

**Interfaces:**

- Background receives/uses `AuroraStorage` for an awaitable authoritative `photoPrefs` write; it does not use the fire-and-forget `useStoredKey` saver for the APOD transaction.
- Selecting APOD runs one two-origin `runOriginTransaction` call and commits `photoPrefs.mode = 'apod'` only after grant.
- Leaving APOD writes the new mode first, clears `apodCache`, and calls `releaseUnownedOrigins` for both APOD patterns. Connector-owned origins are withheld independently.
- Background forwards pending cleanup to the Settings-level controller; the shared Retry alert survives mode and tab transitions.

- [ ] **Step 1: Add failing APOD transaction tests**

Prove with real transaction/ownership code:

1. The two-origin batch request fires in the initiating select change after the lifecycle lock is queued but before its callback starts; the synchronous mirror snapshot classifies the new origins after request succeeds.
2. Denial/rejection leaves the prior mode and cache untouched.
3. Injected `photoPrefs` persistence failure rolls back only newly acquired APOD origins.
4. With one APOD origin pre-existing and one newly acquired, persistence failure keeps the former and removes only the latter.
5. Leaving APOD preserves `api.nasa.gov` when any configured connector claims it (enabled or disabled), removes the unshared image origin, then removes the API origin only after the connector's final owner disappears.
6. Revoke rejection leaves the selected non-APOD mode committed, shows the retry alert, and a successful retry clears it.
7. Switching between two non-APOD modes makes no permission call.

- [ ] **Step 2: Run the Background tests and verify RED**

Run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx src/services/permissionTransactions.test.ts src/services/originOwnership.test.ts
```

Expected: FAIL because APOD uses `ensureOrigins` plus a void saver and current release logic can neither roll back persistence failure nor expose retry.

- [ ] **Step 3: Implement the APOD flow**

Use `storage.update('photoPrefs', ...)` inside the acquisition body and on ordinary source changes so persistence can be awaited and rejected explicitly. Keep the existing controlled-select denial copy. Clear `apodCache` only after leaving APOD is persisted. Always attempt ownership-aware release even if cache clearing fails; report storage/cache failure separately from permission cleanup failure.

Remove connector-only `heldOrigins` decisions from Background. The shared owner registry is the sole release authority.

- [ ] **Step 4: Verify GREEN and commit Task 4**

Run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx src/services/permissions.test.ts src/services/originOwnership.test.ts src/services/permissionTransactions.test.ts
npx tsc --noEmit
git diff --check
```

Commit only APOD integration/test files:

```powershell
git add src/settings/sections/Background.tsx src/settings/SettingsPanel.tsx src/settings/SettingsPanel.test.tsx
git commit -m "fix(permissions): transact APOD origin ownership"
```

---

### Task 5: Deterministic real-extension transaction matrix and full verification

**Files:**

- Modify: `src/services/permissions.ts`
- Modify: `src/services/permissionMirror.ts`
- Modify: `scripts/preview.mjs`
- Modify tests only if the harness bridge contract needs compile-time declarations: the narrowest existing test file covering that module

**Interfaces:**

- Preview-only global `__auroraPermissionsHarnessApi` (exact name) may supply only `getAll`, `contains`, `request`, `remove`, and `onAdded`/`onRemoved` listener surfaces to the permission boundary.
- Production mode always calls `chrome.permissions`; constant folding removes the preview adapter branch and exact global name.
- The harness registers one conditional init script, sets a same-tab `sessionStorage` enable flag, and reloads the extension page so startup mirror initialization observes the fake. The script installs the fake only while that flag is present. The fake maintains an explicit held-pattern set, both event surfaces, per-operation event log, deferred lifecycle-lock controls, and configured one-shot revoke failures entirely inside the real MV3 extension page.

- [ ] **Step 1: Add the failing real-extension probe before the adapter**

Add one isolated harness block that drives actual Settings controls and prints individually countable assertions for:

1. Request is observed in the initiating control event before the lifecycle lock callback starts transaction work (user-gesture ordering), while the initialized mirror reflects exact adapter `onAdded`/`onRemoved` patterns.
2. Newly acquired Home Assistant origin rolls back after its real validation failure; no HA config persists.
3. The same validation failure preserves a pre-existing HA grant.
4. RSS + Status sharing one host: removing one row keeps the grant; removing the final owner revokes it.
5. APOD + RSS sharing `api.nasa.gov`: leaving APOD removes only the image-host grant; final RSS removal revokes the API grant.
6. A one-shot revoke rejection renders `Retry permission cleanup`; the alert survives a Settings tab round trip, clicking Retry removes the adapter-held pattern, and the alert clears.
7. The existing status live-state removal still changes two dots/rows to one, but is renamed to describe only UI/storage state.
8. A separate preview-adapter held-pattern assertion proves production-code final-owner removal semantics without claiming a native Chrome host grant.

The block snapshots and restores `connectors`, `connectorSnapshots`, `photoPrefs`, and `apodCache`. In `finally` it clears the same-tab enable flag and global fake, then reloads; the persistent init script observes the missing flag and does not reinstall the adapter, so the native boundary and mirror are restored for downstream checks. It leaves the drawer/viewport/default state expected downstream and uses condition-based waits for storage/UI/held-set changes, not fixed sleeps.

- [ ] **Step 2: Build preview and verify the new probe is RED**

Run:

```powershell
npm run build:preview
node scripts/preview.mjs
```

Expected: the probe installs the fake before reload, detects that product code did not initialize against it, and emits a bounded FAIL before driving any request. Existing native APOD Allow/Block checks remain honest SKIPs; the RED run must not hang waiting on browser chrome.

- [ ] **Step 3: Add the narrow preview-only adapter and make the probe GREEN**

In preview builds only, resolve the permission boundary once during mirror initialization so the adapter installed by the conditional harness init script is used by both mirror events and later permission calls. Do not expose transaction internals or storage mutation shortcuts through this bridge. No preview adapter is installed by product code; after the harness clears its session flag and deletes the fake, it reloads the same page, and the still-registered init script deliberately performs no installation.

Rebuild preview and run the full harness until every new assertion passes and no existing assertion regresses. The harness process may be long-running; give it a timeout above the established full-run duration.

- [ ] **Step 4: Run the complete W1-P3 verification gate**

Run the exact targeted suite:

```powershell
npx vitest run src/services/permissions.test.ts src/services/permissionMirror.test.ts src/services/originOwnership.test.ts src/services/permissionTransactions.test.ts src/services/connectors/registry.test.ts src/services/connectors/rss.test.ts src/services/connectors/github.test.ts src/services/connectors/gitlab.test.ts src/services/connectors/jira.test.ts src/services/connectors/vercel.test.ts src/services/connectors/crypto.test.ts src/services/connectors/ics.test.ts src/services/connectors/status.test.ts src/services/connectors/homeassistant.test.ts src/settings/PermissionCleanupAlert.test.tsx src/settings/usePermissionCleanup.test.tsx src/settings/sections/TokenConnectForm.test.tsx src/settings/SettingsPanel.test.tsx
```

Then run:

```powershell
npx tsc --noEmit
npm test
npm run build
rg -n "__auroraPermissionsHarnessApi" dist
npm run build:preview
node scripts/preview.mjs
git diff --check
git status --short
```

Requirements:

- targeted and full Vitest have zero failures;
- TypeScript, production build, and preview build exit 0;
- the production `dist` search returns no matches (exit 1 is expected for `rg`);
- the full harness has zero FAIL lines; record exact PASS/FAIL/SKIP counts by counting lines, not by inference;
- the native Home Assistant instance and NASA prompt ceilings remain explicit SKIPs unless the environment genuinely supplies them;
- the new transaction assertions cover rollback, pre-existing grants, shared ownership, final-owner removal, revoke failure/retry, gesture ordering, and preview-adapter held-pattern state;
- no output or ledger sentence calls the adapter set a native Chrome grant; A2-D011 records the current live-state PASS separately from the still-unautomated native host-grant revoke leg;
- no W1-P4 files/behavior enter the diff.

- [ ] **Step 5: Commit the verified harness integration**

```powershell
git add src/services/permissions.ts src/services/permissionMirror.ts scripts/preview.mjs
git commit -m "test(permissions): prove origin transactions in extension"
```

If Task 5 required additional test/type files, add only those exact packet-local files. Record this commit as the verified implementation head before independent review.

---

### Task 6: Bounded implementation review, fix round, checkpoint, push, and stop

**Files:**

- Review: `W1_P3_PLAN_BASE..HEAD`
- Modify after final verification: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after final verification: `docs/superpowers/aurora-2/STATUS.md`
- Modify after final verification: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Produces: reviewed W1-P3 implementation commits.
- Produces: dedicated `docs: checkpoint W1-P3` handoff commit.
- Produces: pushed `origin/feat/aurora-2-observatory`, clean worktree, and a W1-P4 continuation prompt without a W1-P4 plan.

- [ ] **Step 1: Request the bounded independent implementation review**

Dispatch a read-only reviewer with the plan-base SHA, implementation HEAD, this plan, master spec section 10.2, ROADMAP W1-P3, and A2-D011. Require exact file/line references and Critical/Important/Minor severity. The reviewer must inspect:

- no awaited operation precedes any permission request; the lifecycle lock is queued and gated without moving request out of the initiating turn;
- permission-mirror initialization subscribes before seeding, initialization events win per pattern, unavailable state fails visibly, and absent-at-click acquisitions alone are rollback candidates after a successful request;
- the cross-context lifecycle authority covers in-flight acquisition, owner writes, ownership reads, remove/verification, and retry without nested-lock deadlock;
- validation/storage/partial-persistence failure behavior;
- fresh global ownership across every configured connector descriptor (including disabled configured and excluding enabled unconfigured) plus APOD;
- same-owner, cross-connector, cross-feature, concurrent-owner, and final-owner release;
- no-op owner writes and ancillary snapshot failures are distinct from owner commit;
- rejection/false-plus-contains semantics, Settings-level merged retry lifetime, and retry ownership recheck;
- production output has no preview adapter;
- harness state restoration, condition waits, truthful native-prompt SKIPs, and preview-adapter held-pattern wording replacing the misnamed baseline probe without claiming native grant coverage;
- W1-P1/W1-P2 behavior preserved and no W1-P4 or later scope creep.

- [ ] **Step 2: Verify and fix confirmed findings with TDD**

For each finding, inspect the cited code and reproduce every confirmed defect with the smallest failing unit/component/harness probe before production edits. Fix confirmed Critical/Important and packet-local Minor correctness issues. Reject unsupported or out-of-scope suggestions with code/test evidence. Commit fixes separately:

```powershell
git add <only-confirmed-fix-files>
git commit -m "fix(permissions): address W1-P3 review"
```

Request one scoped rereview over the fix range. No Critical/Important or packet-local correctness finding may remain open. After any fix, rerun Task 5 Step 4 completely.

- [ ] **Step 3: Update durable ledgers only after fresh final verification**

Update:

- `ROADMAP.md`: W1-P3 `Verified`, plan link, exact acceptance evidence, final implementation SHA, review disposition, and checkpoint subject; leave W1-P4 `Not started` with no plan.
- `STATUS.md`: packet envelope, plan/implementation/review commits, exact targeted/full/type/build/harness counts, native prompt/user-instance SKIPs, evidence-backed `remove revokes live` disposition, clean state, and W1-P4 as the single next packet.
- `DECISIONS.md`: append one W1-P3 decision recording the startup permission mirror, click-time acquisition snapshot, cross-context lifecycle lock, configured-owner registry, explicit retry, preview adapter production exclusion, and the old probe disposition. State that live UI removal now passes, adapter-driven transaction semantics pass separately, and native headless host-grant revoke remains unautomated rather than fixed.

Commit only the ledger handoff:

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git commit -m "docs: checkpoint W1-P3"
```

- [ ] **Step 4: Push, prove clean state, prepare the next prompt, and stop**

```powershell
git push origin feat/aurora-2-observatory
git status --short --branch
git rev-parse HEAD
git log -8 --oneline
```

Require the branch to match its upstream with no working-tree entries. Provide a ready-to-paste next-session prompt naming the literal worktree, branch, checkpoint HEAD, verified W1-P3 implementation SHA, Packet `W1-P4`, required documents, and instruction to create/review its plan just in time. Stop before creating that plan or modifying any W1-P4 file.
