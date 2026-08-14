# Atomic Backup Restore and Permission Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Aurora backup export consistent and secret-safe, and make restore a validated, rollback-capable storage transaction that requests required optional origins in the confirmation gesture and reconciles obsolete grants through the verified W1-P3 lifecycle authority.

**Architecture:** Export reads one authority-held snapshot and serializes a redacted envelope with explicit re-entry metadata. Restore is prepared completely before confirmation: parse, version check, migration, structural validation, redaction metadata validation, and pure required-origin derivation all finish without touching live state. The confirmation click calls the existing gesture-safe origin transaction synchronously; its lifecycle lock encloses an authority-held all-key storage replace, rollback to the exact prior Aurora snapshot on failure, and ownership-aware release of origins the restored state no longer needs. Permission cleanup failures follow the W1-P3 committed-owner rule: restored data stays committed, failed revokes remain visible in the Settings-level Retry alert, and the file is never described as containing or restoring Chrome grants.

**Tech Stack:** TypeScript 5.9 strict, React 19, Chrome Manifest V3 `chrome.storage.local`, Web Locks, `chrome.permissions`, Vitest 3 with Testing Library, and the Playwright real-extension preview harness.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 10.2, 10.3, and 10.5; `docs/superpowers/aurora-2/ROADMAP.md` W1-P4; decisions A2-D009 and A2-D012 in `docs/superpowers/aurora-2/DECISIONS.md`.

## Global Constraints

- Execute only W1-P4. Do not implement Home Assistant polling/actions (W1-P5), weather/day/notes packets, schema V2 layout, CSS redesign, manifest expansion, final privacy/Store copy, dependency upgrades, packaging, release staging, or Store actions.
- Preserve `D:\DEV\Chrome plugin` and all V1 artifacts. Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory` from checkpoint `5384c5b4091eb063b2c9e53a01370688eafd1ba8`.
- Preserve the verified lock order: `aurora:origin-permission-lifecycle:v1` is acquired before `aurora:storage:mutation:v1` for every restore that changes origin owners. Never acquire the origin lifecycle lock from inside a storage-authority callback unless it was already acquired outside that callback. Ordinary storage mutations never acquire the origin lock.
- The complete backup is parsed, version-checked, migrated, structurally validated, cleaned to recognized data keys/connector IDs, and reduced to pure permission requirements before the Confirm button is offered. A malformed, unsupported-future, migration-failing, or shape-invalid file performs no storage or permission mutation.
- The Confirm click calls the restore coordinator directly with no awaited operation before it. The coordinator synchronously snapshots the initialized permission mirror, queues the lifecycle Web Lock, and invokes at most one `chrome.permissions.request` for only missing restored-state origins in that initiating event turn. No file read, migration, storage read, lock await, or `contains` call may move ahead of the request.
- The backup file never supplies Chrome permissions. User-facing and harness wording says Aurora requested, retained, released, or still needs browser grants during restore; it never says the file contained, imported, or restored a permission.
- Every export excludes `connectorSnapshots` and `apodCache`, every descriptor-declared bearer/API token field, both ICS capability-URL shapes, and all RSS feed URLs. All RSS URLs are conservatively redacted because Aurora cannot reliably distinguish public feed URLs from capability-bearing feed URLs. Status URLs and ordinary quick links remain because W1-P4 does not classify them as capabilities.
- A new backup includes machine-readable recognized connector IDs plus literal human-readable notice text that secrets/capability URLs were omitted and must be re-entered. Older valid envelopes without this metadata still import. They infer exact labels only for unambiguous token reconnect shapes and use a trusted generic legacy warning when an official redacted ICS shape is indistinguishable from an enabled-but-never-configured shell. Metadata, when present, is validated against the cleaned connector configs and never displays raw field values, URLs, tokens, or untrusted connector labels.
- Restored redacted configs remain safe for existing readers: RSS restores with `feeds: []`; ICS omits legacy `url` and restores `calendars: []`; token configs omit descriptor-declared secret fields. Caches always restore as `connectorSnapshots: {}` and `apodCache: null`.
- Storage export snapshots and restore pre-images cover every current `DataKey` under the verified storage authority. "Exact" means exact logical `AuroraData` values through the existing public storage contract, where an absent known key equals its schema default. Physical absent-vs-present key representation, unknown driver keys, and the internal schema version key are not backup state. Restore writes all current `DataKey`s in one driver patch and may materialize a previously absent key at its identical default value.
- If target write, post-write verification, or a restore finalizer throws, the storage primitive writes the exact prior logical known-key snapshot, rereads every known key, and deep-compares rollback state before rejecting. A rollback write rejection, rollback read rejection, or rollback mismatch returns a distinct fatal error carrying the primary and rollback failures; never report success or exact restoration without readback evidence.
- Newly acquired grants roll back through the existing fresh ownership sweep if storage restore fails. Pre-existing grants remain. Every transaction outcome, including failure/access-loss/lifecycle rejection after a successful request, forwards any `pendingCleanup` patterns to the durable Settings-level cleanup controller. After a committed restore, origins no longer owned by any restored connector/APOD owner are released under the already-held lifecycle lock. `remove(false)`, rejection, or unverifiable release follows W1-P3 semantics and is reported for Retry without rolling back the committed owner state.
- A restored required-origin set comes only from the real `ORIGIN_OWNER_PROVIDERS`/descriptor registry and the fully validated restored state. No backup-specific connector/origin list may duplicate registry knowledge.
- Atomicity tests inject failures before mutation, after an applied target write, during post-write verification/finalization, and during rollback. They assert exact literal pre-import data after every recoverable failure and explicit fatal status when rollback itself is injected to fail.
- Tests exercise real backup, storage, ownership, permission transaction, and Settings code. Mocks/fakes stop at the Chrome/storage-driver/file/download boundaries. Every new behavior starts RED, fails for the intended missing behavior, then receives minimal GREEN code.
- The preview harness reuses the existing preview-only permission adapter and real Settings controls. Production builds must contain neither `__auroraPermissionsHarnessApi` nor any new backup fault/bridge global. Native prompt Allow/Block remains an honest headless ceiling.
- Final closeout runs targeted tests, `npx tsc --noEmit`, full Vitest, production and preview builds, production adapter-leak searches, the full real-extension harness, bounded whole-packet review/fix/rereview, a dedicated `docs: checkpoint W1-P4` commit, push, clean-state proof, and then stops before W1-P5.

---

### Task 0: Commit the independently reviewed execution base

**Files:**

- Review/fix: `docs/superpowers/plans/2026-08-14-w1-p4-atomic-backup-restore-permission-reconciliation.md`

**Interfaces:**

- Produces: one immutable plan-base SHA for all W1-P4 implementation and review ranges.

- [ ] **Step 1: Run the independent plan review**

Dispatch a read-only reviewer against this plan, master spec sections 10.2/10.3/10.5, ROADMAP W1-P4, A2-D009/A2-D012, the verified W1-P2/W1-P3 plans and checkpoint evidence, and current `backup.ts`, storage, Data, permission-transaction, ownership, cleanup-controller, and harness code. Require Critical/Important/Minor findings with exact plan/code references and explicit coverage of validation order, lock order/deadlock, gesture timing, exact rollback, partial driver failure, secret/capability redaction, old/current/future envelope handling, ownership derivation, failed revoke retry, user-facing truthfulness, harness restoration, and W1-P5 exclusion.

Verify every finding against repository evidence. Fix confirmed Critical/Important findings and packet-local Minor correctness gaps in this plan. Reject unsupported or out-of-scope suggestions with exact spec/code evidence.

- [ ] **Step 2: Self-review and commit the plan**

Run:

```powershell
rg -n "TB[D]|TO[D]O|implement late[r]|fill in detail[s]|similar t[o]|appropriate error handlin[g]|write tests fo[r]" docs/superpowers/plans/2026-08-14-w1-p4-atomic-backup-restore-permission-reconciliation.md
git diff --check
git diff -- docs/superpowers/plans/2026-08-14-w1-p4-atomic-backup-restore-permission-reconciliation.md
```

Require no placeholder hits and no whitespace errors. Commit only the reviewed plan:

```powershell
git add docs/superpowers/plans/2026-08-14-w1-p4-atomic-backup-restore-permission-reconciliation.md
git commit -m "docs: plan W1-P4 atomic backup restore"
git rev-parse HEAD
```

Record that SHA as `W1_P4_PLAN_BASE`.

---

### Task 1: Secret-safe backup envelope and fully prepared import

**Files:**

- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/services/connectors/types.ts`
- Modify: `src/services/connectors/rss.ts`
- Modify: `src/services/connectors/rss.test.ts`
- Modify: `src/services/connectors/ics.ts`
- Modify: `src/services/connectors/ics.test.ts`
- Modify: `src/services/connectors/registry.test.ts`

**Interfaces:**

- `ConnectorDescriptor.redactForBackup?(config: C): Partial<C>` is pure and optional. Generic descriptor `secretFields` removal runs first; a descriptor hook then performs nested/conservative redaction without mutating storage.
- `ConnectorDescriptor.backupReentryRequired?(config: C): boolean` is pure and optional. Generic token descriptors infer reconnect need from a non-empty `identityField` plus a missing descriptor secret. RSS/ICS hooks identify an enabled redacted/incomplete config without embedding connector-specific rules in backup code.
- RSS defines `redactForBackup(config)` and returns `{ ...config, feeds: [] }`. ICS continues to remove both `url` and `calendars` through `secretFields`, then its own descriptor hook returns `{ ...config, calendars: [] }` so existing readers receive a valid empty list. Backup code contains no connector-ID switch.
- `BackupRedactions` has exact shape `{ reentryRequired: ConnectorId[]; notice: 'Connector secrets and capability URLs were not included. Re-enter them after restore.' }`.
- `BackupEnvelope` adds `redactions: BackupRedactions` while keeping `app`, `version`, `exportedAt`, and `data`. New export always writes the field; old envelopes may omit it.
- `redactBackupData(data): { data: BackupEnvelope['data']; redactions: BackupRedactions }` replaces ad hoc export assembly and never mutates its input.
- `ParseBackupResult` success adds `exportedAt?: string`, `redactionsPresent: boolean`, and `redactions: BackupRedactions`. It accepts missing metadata as legacy input. A present `exportedAt` is valid only when `new Date(value).toISOString() === value`, matching Aurora's own exporter; malformed metadata/timestamps reject, and untrusted display labels are never returned.
- `requiredReentryConnectorIds(connectors, declaredIds?, metadataPresent?)` derives trusted IDs from cleaned configs plus descriptor policy. For legacy metadata absence, it recognizes unambiguous official token reconnect shapes. It never assigns the Calendar label to an enabled-only legacy ICS config because that shape is ambiguous. For present metadata, every declared ID must have a matching cleaned config that descriptor policy identifies as incomplete/redacted; otherwise preparation rejects the inconsistent envelope. New serialization derives IDs from the redacted output so already-redacted reconnect configs remain honestly labeled.
- `prepareBackup(raw): PrepareBackupResult` performs `parseBackup -> migrate -> validateBackupShape -> redaction reconciliation` inside one pure function, catches missing migration steps, returns exact rejection copy, and on success returns `{ data, exportedAt, redactions, legacyReentryMayBeRequired, requiredOrigins }`. `legacyReentryMayBeRequired` is true only for metadata-free legacy input containing an ambiguous secret-bearing config such as enabled-only ICS. `requiredOrigins` comes from `ownedOriginPatterns({ connectors: data.connectors, photoPrefs: data.photoPrefs })`.

- [ ] **Step 1: Write the failing redaction and preparation tests**

Add behavior tests that catch these concrete mutations:

1. A stored RSS config with two unique capability-bearing URLs serializes with `feeds: []`; neither URL nor its query token appears anywhere in JSON; the original stored config remains byte-for-byte unchanged.
2. GitHub/GitLab/Jira/Vercel/Home Assistant bearer/API tokens and both legacy/multi-calendar ICS URLs remain absent. Non-secret identities, view settings, RSS `shownCount`, and calendar view settings remain.
3. `connectorSnapshots` and `apodCache` remain absent regardless of forged values.
4. The envelope contains the exact notice literal and stable deduped registry connector IDs for every redacted or already-incomplete config that requires re-entry. A generic enabled-only shell with no prior identity/config signal is not falsely listed.
5. Official legacy token and ICS envelopes without `redactions` still prepare. Token reconnect shapes infer trusted connector IDs; ambiguous enabled-only ICS sets `legacyReentryMayBeRequired` and does not claim the exact Calendar label. A present malformed metadata object, unknown ID, duplicate ID, ID inconsistent with its cleaned config, notice unequal to the exact literal, or non-ISO present `exportedAt` is rejected before any consumer can offer Confirm.
6. Version 1 migrates then validates; current version validates directly; missing migration is returned as a preparation rejection; a future version is rejected with the existing update-first copy.
7. Malformed shape never yields a prepared backup. Unknown top-level data, layout IDs, and connector IDs retain the existing cleaning rules.
8. A prepared APOD + Status/Crypto backup derives literal canonical required origins through the real owner registry. A redacted token/RSS/ICS config derives no origin because its secret/capability is absent.
9. No returned summary/redaction field contains a raw token, URL, or untrusted connector-provided label.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx vitest run src/lib/backup.test.ts src/services/connectors/rss.test.ts src/services/connectors/ics.test.ts src/services/connectors/registry.test.ts
```

Expected: FAIL because RSS export still includes feeds, the envelope has no redaction metadata, parsing does not validate metadata, and import preparation/required-origin derivation is still split across Data.

- [ ] **Step 3: Implement minimal pure redaction and preparation**

Implement descriptor-driven redaction without a backup-local connector switch. Preserve `stripSecrets` as a compatibility wrapper if existing tests/callers need it, but route production serialization through `redactBackupData`. Determine `reentryRequired` from the redacted output and descriptor policy, not merely from descriptor registration. When metadata-free legacy shapes are indistinguishable, set the generic legacy flag rather than guessing a connector label.

Keep `prepareBackup` free of storage, Chrome, React, dates, and logs. Catch `migrate` exceptions and return `That backup cannot be migrated by this Aurora version.`. Validate redaction metadata without weakening the existing envelope/version/shape rejections. Derive origin requirements only after migration and shape cleaning.

- [ ] **Step 4: Verify GREEN and commit Task 1**

```powershell
npx vitest run src/lib/backup.test.ts src/services/connectors/rss.test.ts src/services/connectors/ics.test.ts src/services/connectors/registry.test.ts src/services/originOwnership.test.ts
npx tsc --noEmit
git diff --check
```

Commit only Task 1 files:

```powershell
git add src/lib/backup.ts src/lib/backup.test.ts src/services/connectors/types.ts src/services/connectors/rss.ts src/services/connectors/rss.test.ts src/services/connectors/ics.ts src/services/connectors/ics.test.ts src/services/connectors/registry.test.ts
git commit -m "fix(backup): redact capability URLs"
```

---

### Task 2: Authority-held snapshots and rollback-capable all-key replace

**Files:**

- Modify: `src/lib/storage/index.ts`
- Modify: `src/lib/storage/index.test.ts`
- Modify only if required for a deterministic partial-write double: `src/lib/storage/driver.ts`

**Interfaces:**

- `AuroraStorage.snapshot(): Promise<AuroraData>` acquires the existing storage authority once, reads all current `DataKey`s in one driver read, fills absent keys from `defaults()`, and returns only known keys.
- `AuroraStorage.replaceAllWithRollback<T>(next: AuroraData, finalize: (previous: AuroraData) => Promise<T>): Promise<{ previous: AuroraData; value: T }>` acquires the storage authority once; reads the exact known-key pre-image; writes every current `DataKey` in one patch; rereads and deep-compares every current key; awaits `finalize(previous)` without reacquiring storage; and returns only after verification/finalization succeed.
- `AtomicRestoreRollbackError` exposes `primaryError` and `rollbackError` when writing the pre-image also fails. Its message contains no user data.
- On any target-write rejection, readback mismatch/rejection, or finalizer rejection, `replaceAllWithRollback` attempts one full known-key pre-image write and a complete rollback readback/deep comparison before rejecting. If rollback write/readback/compare succeeds, the original error propagates. Any rollback write rejection, read rejection, or mismatch becomes the distinct fatal error.
- `finalize` is documented as already inside the storage critical section and may not call an `AuroraStorage` mutation. W1-P4 passes only the already-held permission cleanup function, whose storage reads use the private current-state path described in Task 3.

- [ ] **Step 1: Add failing atomic snapshot/replace tests**

Use literal fixtures and controllable drivers/authorities to prove:

1. `snapshot` uses one authority acquisition and one `read(DATA_KEYS)`; an independent same-authority mutation cannot interleave to produce a hybrid export snapshot.
2. Missing known keys are defaulted; unknown driver keys and `aurora:version` do not appear. A rollback may materialize an absent known key at its identical default because exactness is logical `AuroraData`, not physical key presence.
3. Successful replace writes exactly one all-key target patch, verifies it, passes the literal pre-image to `finalize`, and notifies existing subscribers through the driver.
4. Authority rejection occurs before any read, finalize, or write, and a later call can retry.
5. Target write rejects before applying: rollback runs and exact pre-image remains.
6. Target write applies then rejects: rollback runs and exact pre-image remains.
7. Readback returns one wrong key or rejects: finalize does not run, rollback runs, and exact pre-image remains.
8. Finalize throws after a successful verified target write: rollback runs and exact pre-image remains.
9. Rollback write rejects, rollback read rejects, or rollback readback differs after any primary failure: result is `AtomicRestoreRollbackError` containing both errors and no success is reported.
10. Two independent `AuroraStorage` instances sharing one authority cannot mutate a key between pre-image read, target write, verification, finalizer, and rollback/commit.

- [ ] **Step 2: Run storage tests and verify RED**

```powershell
npx vitest run src/lib/storage/authority.test.ts src/lib/storage/index.test.ts src/lib/storage/migrations.test.ts
```

Expected: FAIL because `snapshot`, `replaceAllWithRollback`, and `AtomicRestoreRollbackError` do not exist.

- [ ] **Step 3: Implement the minimal storage primitives**

Build a module-local `DATA_KEYS` from `defaults()`, an already-held `readSnapshot()` helper, and one structural deep-equality helper consistent with the existing driver's JSON-compatible data contract. Do not implement replace as public `get`/`setMany` calls and do not nest the storage authority. Always attempt rollback after a target write call has begun, even when that call rejects, because a driver can apply then reject. Verify rollback with a fresh already-held read of every known key before classifying the primary failure as safely recovered.

Keep ordinary `get`, `set`, `setMany`, `update`, `init`, subscription, migration, and preview bridge signatures/behavior unchanged.

- [ ] **Step 4: Verify GREEN and commit Task 2**

```powershell
npx vitest run src/lib/storage/authority.test.ts src/lib/storage/index.test.ts src/lib/storage/migrations.test.ts src/newtab/widgets/notes/NotesPanel.test.tsx
npx tsc --noEmit
git diff --check
```

Commit only Task 2 files:

```powershell
git add src/lib/storage/index.ts src/lib/storage/index.test.ts
git diff --quiet -- src/lib/storage/driver.ts
if ($LASTEXITCODE -ne 0) { git add src/lib/storage/driver.ts }
git commit -m "fix(storage): support atomic restore rollback"
```

---

### Task 3: Gesture-safe restore coordinator and accessible Data recovery

**Files:**

- Create: `src/lib/backupRestore.ts`
- Create: `src/lib/backupRestore.test.ts`
- Modify: `src/services/permissionTransactions.ts`
- Modify: `src/services/permissionTransactions.test.ts`
- Modify: `src/services/originOwnership.ts`
- Modify: `src/services/originOwnership.test.ts`
- Modify: `src/settings/sections/Data.tsx`
- Modify: `src/settings/SettingsPanel.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Reuse: `src/settings/usePermissionCleanup.ts`
- Reuse: `src/settings/PermissionCleanupAlert.tsx`

**Interfaces:**

- `OriginTransactionContext.releaseUnownedOrigins(candidates: readonly string[], ownershipState?: OriginOwnershipState): Promise<OriginReleaseResult>` calls the existing already-held release implementation without reacquiring the lifecycle lock. Existing transaction bodies may ignore the new context argument.
- When `ownershipState` is supplied, release derives ownership purely from it and performs no `storage.get` while `replaceAllWithRollback` holds the storage authority. Ordinary W1-P3 calls retain the current fresh storage-read path.
- `RestoreBackupResult` distinguishes `committed`, `permission-unavailable`, `denied`, `access-lost`, `failed`, and `rollback-failed`. Every applicable variant carries `pendingCleanup`; `committed` also carries `reentryRequired`. Failure variants carry safe user copy and never raw error values.
- `restorePreparedBackup(storage, prepared, authority?): Promise<RestoreBackupResult>` must synchronously call `runOriginTransaction(storage, prepared.requiredOrigins, body, authority)` before returning its promise.
- The transaction body calls `storage.replaceAllWithRollback(prepared.data, finalize)`. `finalize(previous)` computes previous-owned minus restored-owned patterns through `ownedOriginPatterns`, then calls `context.releaseUnownedOrigins(candidates, restoredState)`. It returns pending cleanup without throwing. The body returns `ownerCommitted: true` only after storage verification/finalization completes.
- `Data` receives `{ storage, reportPendingCleanup }`. Export uses `storage.snapshot()`. Import file change calls pure `prepareBackup`; Confirm/Retry calls `restorePreparedBackup` directly with no preceding await.
- Data renders one inline `role="alert"` for export/import/restore failure and keeps the prepared import plus enabled `Retry restore` button after recoverable failure. While pending, the button is disabled and reads `Restoring...`. Before mapping any result to UI, Data forwards non-empty `pendingCleanup` from success or failure to the durable Settings controller. A successful restore closes confirmation and renders `role="status"`.
- Confirmation and success copy list only trusted registry labels resolved from `reentryRequired` IDs and says `Re-enter connection details after restore: <labels>.` When `legacyReentryMayBeRequired` is true, copy instead adds `This older backup may omit connection details. Review connector settings and re-enter anything missing.` without naming an ambiguous connector. Confirmation also reports `This restore needs access to N configured sites. Chrome will ask for any missing access when you confirm.` using only the required-origin count, never raw patterns or URLs. The static Data copy names RSS/calendar capability URLs alongside sign-in secrets and caches as excluded.

- [ ] **Step 1: Add failing coordinator and component tests**

Cover these behaviors with the real storage, backup, ownership, and permission transaction code:

1. Preparing a file, then clicking Confirm, records one missing-origin permission request before the lifecycle callback, any storage read, or other promise continuation. Required patterns are deduped from restored APOD/Status/Crypto ownership.
2. Denial, mirror unavailable, and lifecycle authority rejection perform no storage write, retain the confirmation, show an accessible failure, and allow a later click to retry. Lifecycle rejection after a successful request forwards the acquired pattern to durable cleanup rather than dropping it.
3. A valid old/current backup that requires no missing origins makes no permission request but still runs under the lifecycle authority.
4. Successful restore writes the fully validated/cleaned data, resets both caches, requests only absent restored requirements, and reports success without saying the file restored permissions.
5. Injected target-write-before-apply, target-write-after-apply, verification, and finalizer failures leave every known key exactly equal to the literal pre-import snapshot. Newly acquired unowned origins are rolled back; pre-existing origins remain. Rollback remove rejection and `remove(false)` plus `contains(true)` both reach durable cleanup Retry.
6. Injected rollback failure returns `rollback-failed`, shows a distinct fatal alert, retains Retry, and never claims exact restoration.
7. Old owners removed by restore are released only after target storage is verified. An origin still owned by restored RSS/Status/APOD or a configured disabled connector is retained.
8. Revoke rejection/false-still-held commits restored data, reports only that origin to `reportPendingCleanup`, renders the stable Settings alert across a tab round trip, and Retry rechecks current ownership before removing it.
9. A restored state requiring a newly acquired origin followed by a partial/failed storage mutation uses the fresh post-rollback ownership sweep so it never removes a grant the pre-import state owned.
10. File read, parse, future version, migration, metadata/re-entry inconsistency, and shape failures offer no Confirm and call neither permissions nor storage mutation. Official legacy token envelopes show inferred exact labels; ambiguous official legacy ICS envelopes show only the trusted generic legacy warning.
11. Export waits for one authority-held `snapshot`; on success the Blob contains no token/RSS/ICS capability value and does contain the exact re-entry notice. Export failure renders an alert and creates no object URL/download.
12. Confirmation and post-success copy use trusted labels only, explicitly say re-entry is required, report the required configured-site count without raw origins, keep retry reachable, and expose pending/success/error semantics programmatically.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx vitest run src/lib/backupRestore.test.ts src/services/permissionTransactions.test.ts src/services/originOwnership.test.ts src/settings/SettingsPanel.test.tsx -t "backup|restore|permission reconciliation"
```

Expected: FAIL because the coordinator/context-aware already-held release do not exist and Data still performs direct `setMany` with no permission, rollback, or recovery state.

- [ ] **Step 3: Implement the coordinator and UI integration**

Keep all file work and migration in `prepareBackup`, completed before Confirm. In the click handler, set synchronous UI pending state and call `restorePreparedBackup` immediately; do not introduce an `await` before the coordinator call. It is acceptable to await the already-created promise afterward.

Map unknown errors to fixed safe copy. Do not log backup contents, URLs, connector configs, Chrome permission details, or raw errors. Preserve the W1-P3 cleanup controller as the single durable revoke-retry owner; Data only reports pending canonical patterns.

- [ ] **Step 4: Verify GREEN and commit Task 3**

```powershell
npx vitest run src/lib/backup.test.ts src/lib/backupRestore.test.ts src/lib/storage/index.test.ts src/services/permissions.test.ts src/services/permissionMirror.test.ts src/services/originOwnership.test.ts src/services/permissionTransactions.test.ts src/settings/PermissionCleanupAlert.test.tsx src/settings/usePermissionCleanup.test.tsx src/settings/SettingsPanel.test.tsx
npx tsc --noEmit
git diff --check
```

Commit only Task 3 files:

```powershell
git add src/lib/backupRestore.ts src/lib/backupRestore.test.ts src/services/permissionTransactions.ts src/services/permissionTransactions.test.ts src/services/originOwnership.ts src/services/originOwnership.test.ts src/settings/sections/Data.tsx src/settings/SettingsPanel.tsx src/settings/SettingsPanel.test.tsx
git commit -m "fix(backup): restore atomically with permissions"
```

---

### Task 4: Real-extension backup/restore and reconciliation proof

**Files:**

- Modify: `scripts/preview.mjs`
- Modify production/test files only if the RED harness exposes a real packet-local defect; follow TDD and keep any fix in a separate commit.

**Interfaces:**

- The W1-P4 harness block reuses the existing `__auroraPermissionsHarnessApi` and `__auroraPermissionsHarnessControl` installed before permission-mirror initialization. It adds no storage mutation bridge and no backup fault global.
- The block drives the real Data tab Export control, file input, confirmation/retry buttons, durable cleanup alert, and production backup/restore coordinator in an MV3 extension page.
- It snapshots and restores every current Data key plus the adapter-held permission set in `finally`, closes Settings, restores the launch viewport, removes the session adapter flag, reloads, and proves the native permission boundary is back.

- [ ] **Step 1: Add the W1-P4 acceptance harness block**

Within the existing deterministic permission-adapter lifetime, add countable assertions that:

1. Clicking real Export produces a download whose JSON is a valid Aurora envelope, excludes unique seeded GitHub/Home Assistant tokens and RSS/ICS capability URLs, excludes both caches, includes `feeds: []`, and includes the exact re-entry notice/recognized IDs.
2. Importing a literal validated backup through `input[type=file]` and clicking Confirm requests only adapter-missing APOD/Status/Crypto origins, then stores the exact cleaned target and reset caches. The assertion wording says the confirmation gesture requested adapter-held origins; it never says the file restored grants.
3. A seeded pre-import RSS/APOD shared origin is retained or released according to the restored owner registry, with one old-only origin configured to fail its first remove.
4. The failed revoke leaves the imported state committed, renders `Retry permission cleanup`, survives a Data/General tab round trip, and Retry removes the now-unowned adapter pattern and clears the alert.
5. The re-entry message names trusted connector labels and contains none of the seeded URL/token strings.
6. Teardown restores every named storage key, held-pattern set, closed drawer, default viewport, and native boundary using condition waits rather than sleeps.

- [ ] **Step 2: Build preview and run the new acceptance probe**

```powershell
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p4-harness-first.log
```

Expected after Tasks 1-3: the new W1-P4 acceptance lines PASS and existing counts do not regress. Production behavior already received RED evidence in Tasks 1-3 unit/component tests; this step is real-extension verification, not a second TDD origin. If a W1-P4 line fails, preserve its exact evidence, reproduce the confirmed defect with the smallest focused failing unit/component or harness assertion, and apply the systematic-debugging/TDD loop before proceeding. The process must complete without hanging on browser chrome. Remove the untracked first-run log after recording results.

- [ ] **Step 3: Make only packet-local harness/production fixes**

After Tasks 1-3, rebuild and run the full harness. Fix only confirmed W1-P4 defects with the smallest failing unit/component or harness assertion before production edits. Do not add a production bridge or weaken existing native prompt SKIPs.

- [ ] **Step 4: Run the complete W1-P4 verification gate**

Run the exact targeted suite:

```powershell
npx vitest run src/lib/backup.test.ts src/lib/backupRestore.test.ts src/lib/storage/authority.test.ts src/lib/storage/index.test.ts src/lib/storage/migrations.test.ts src/services/permissions.test.ts src/services/permissionMirror.test.ts src/services/originOwnership.test.ts src/services/permissionTransactions.test.ts src/services/connectors/registry.test.ts src/services/connectors/rss.test.ts src/services/connectors/ics.test.ts src/settings/PermissionCleanupAlert.test.tsx src/settings/usePermissionCleanup.test.tsx src/settings/SettingsPanel.test.tsx
```

Then run fresh:

```powershell
npx tsc --noEmit
npm test
npm run build
rg -n "__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist
if ($LASTEXITCODE -ne 1) { throw 'Preview-only backup/permission adapter leaked into production dist' }
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p4-harness.log
$pass = (Select-String -Path w1-p4-harness.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w1-p4-harness.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w1-p4-harness.log -Pattern '^SKIP:').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
git diff --check
git status --short
```

Requirements:

- targeted and full Vitest have zero failures;
- TypeScript, production build, and preview build exit 0;
- production adapter search exits 1 with no match;
- full harness exits 0 with zero `FAIL:` lines and exact counted PASS/FAIL/SKIP totals;
- W1-P4 PASS lines cover export redaction, gesture-safe restored-origin request, exact restored data/cache reset, old-origin reconciliation, revoke Retry, trusted re-entry copy, and full teardown;
- native Home Assistant instance and NASA prompt checks remain honest SKIPs unless the environment genuinely supplies them;
- no harness sentence claims adapter-held patterns are native grants or came from a backup file;
- no W1-P5 behavior enters the diff.

Delete the untracked harness log after recording counts.

- [ ] **Step 5: Commit the verified harness integration**

```powershell
git add scripts/preview.mjs
git commit -m "test(backup): prove atomic restore in extension"
```

If Task 4 exposed and fixed production/test defects, add only those exact packet-local files in a separate `fix(backup): address extension restore proof` commit. Record the resulting HEAD as the verified implementation head before broad review.

---

### Task 5: Bounded whole-packet review, fix round, checkpoint, push, and stop

**Files:**

- Review: `W1_P4_PLAN_BASE..HEAD`
- Modify after final verification: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after final verification: `docs/superpowers/aurora-2/STATUS.md`
- Modify after final verification: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Produces: reviewed W1-P4 implementation commits.
- Produces: dedicated `docs: checkpoint W1-P4` handoff commit.
- Produces: pushed `origin/feat/aurora-2-observatory`, clean worktree, and a W1-P5 continuation prompt without a W1-P5 plan.

- [ ] **Step 1: Request the bounded independent implementation review**

Dispatch a read-only reviewer with plan-base SHA, implementation HEAD, this plan, master spec sections 10.2/10.3/10.5, ROADMAP W1-P4, A2-D009/A2-D012, and the complete diff package. Require exact file/line references and Critical/Important/Minor severity. Inspect specifically:

- validation/migration/shape/redaction metadata complete before Confirm and before any live mutation;
- token, ICS, RSS capability, cache, log, display, and original-object secret safety;
- export consistency and all-key pre-image coverage under the storage authority;
- exact lock order and absence of nested authority deadlock across every restore/failure/retry path;
- confirmation-turn request timing and absent/pre-existing classification reuse from W1-P3;
- target write, applied-then-rejected write, verification, finalizer, and rollback-failure semantics;
- fresh ownership after rollback, registry-derived restored requirements, disabled/shared/APOD ownership, and final-owner release;
- committed restore plus durable failed-revoke Retry semantics;
- accessible recoverable/fatal/success states and truthful re-entry/permission copy;
- old/current/future/malformed backup behavior and cache reset;
- preview adapter absence from production and deterministic real-extension teardown;
- W1-P2/W1-P3 preservation and no W1-P5 or later scope creep.

- [ ] **Step 2: Verify and fix confirmed findings with TDD**

For each finding, inspect cited evidence and reproduce every confirmed defect with the smallest failing test/harness probe before production edits. Fix confirmed Critical/Important and packet-local Minor correctness issues in one bounded fix wave. Reject unsupported/out-of-scope suggestions with code/spec evidence. Commit fixes separately:

The fix implementer stages only the literal packet-local files it changed, confirms them with `git diff --cached --name-only`, and commits:

```powershell
git commit -m "fix(backup): address W1-P4 review"
```

Request one scoped rereview over the fix range. No Critical/Important or packet-local correctness finding may remain. After any fix, rerun Task 4 Step 4 completely.

- [ ] **Step 3: Update durable ledgers after fresh final verification**

Update:

- `ROADMAP.md`: mark W1-P4 `Verified`, link this plan, record exact acceptance evidence, final implementation SHA, review disposition, and checkpoint subject; leave W1-P5 `Not started` with no plan.
- `STATUS.md`: record the W1-P4 envelope, plan/implementation/review commits, exact targeted/full/type/build/harness counts, native prompt/user-instance ceilings, redaction/re-entry policy, clean state, and W1-P5 as the single next packet.
- `DECISIONS.md`: append A2-D013 recording conservative RSS/ICS capability redaction, explicit re-entry metadata, origin-before-storage lock order, gesture-safe restore acquisition, exact storage rollback boundary, committed failed-revoke Retry semantics, and preview/native evidence boundaries.

Commit only the ledger handoff:

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git commit -m "docs: checkpoint W1-P4"
```

- [ ] **Step 4: Push, prove clean state, prepare next prompt, and stop**

```powershell
git push origin feat/aurora-2-observatory
git status --short --branch
git rev-parse HEAD
git log -10 --oneline
```

Require branch/upstream agreement and no working-tree entries. Provide a ready-to-paste next-session prompt naming the literal worktree, branch, checkpoint HEAD, verified W1-P4 implementation SHA, Packet `W1-P5`, required documents, and instruction to create/review its plan just in time. Stop before creating a W1-P5 plan or changing Home Assistant polling/actions.
