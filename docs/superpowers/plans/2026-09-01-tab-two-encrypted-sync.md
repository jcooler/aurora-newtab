# Tab Two PM-P4 Five-Device Encrypted Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Do not use subagents.

**Goal:** Deliver explicit, five-device, record-level encrypted sync while preserving local data as the always-available product authority and excluding every secret, capability URL, cache, custom image, and operational record.

**Architecture:** One visible Tab Two document coordinates typed local records through the existing Web Lock pattern. The extension projects only reviewed entities, encrypts each with an in-memory account DEK using AES-256-GCM, and sends optimistic idempotent mutations to private Supabase storage. Server revisions resolve same-record conflicts while a local recovery backup precedes every conflicting remote overwrite. A versioned server-held AES-256-KW KEK protects each account DEK, and authenticated Edge Functions enforce entitlement, device ownership, quota, deletion, and account boundaries.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Testing Library, Playwright Chromium, Chrome MV3, Web Crypto, Web Locks, Vite, Supabase Postgres, pgTAP, Edge Functions, and the existing Stripe sandbox gateway for account-deletion cancellation.

**Spec:** docs/superpowers/specs/2026-09-02-tab-two-encrypted-sync-design.md

## Global constraints

- Obey docs/superpowers/plans/2026-09-01-tab-two-paid-mvp-program.md and the PM-P4 spec.
- Work only in D:\DEV\Chrome plugin-aurora-2 on feat/aurora-2-observatory.
- Preserve artifacts/ and docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md exactly.
- Keep D:\DEV\Chrome plugin clean and untouched.
- All current local capabilities and all 15 current connectors remain free and functional without sync.
- Local mode and signed-in sync-off mode make zero sync, key, or device requests.
- Do not sync credentials, tokens, sessions, signed leases, capability URLs, provider caches or raw responses, custom images, device-local image references, or browser-local operational state.
- Do not persist a raw DEK. Never log or capture DEK, KEK, session, plaintext vault, secret-shaped fixture, or customer data.
- Add no Chrome permission, external host, dependency, analytics, telemetry, automatic layout behavior, or Store state.
- Begin with seven original-resolution mockups and stop for explicit owner visual approval before production React or CSS.
- Implement and verify locally before requesting a separately itemized gate for hosted migration, KEK secret creation, function deployment, device registration, or product-data upload.
- Do not use the owner's real account for destructive, device-limit, conflict, quota, or account-deletion evidence.
- Do not provision Supabase Pro, enable live Stripe, merge, release, package, publish, or perform any Chrome Web Store action.

---

### Task 1: Obtain the encrypted-sync visual gate

**Files:**

- Create: docs/superpowers/qa/paid-encrypted-sync/mockup.html
- Create: scripts/capture-paid-encrypted-sync-mockups.mjs
- Create: docs/superpowers/qa/paid-encrypted-sync/sync-off-desktop.png
- Create: docs/superpowers/qa/paid-encrypted-sync/first-sync-desktop.png
- Create: docs/superpowers/qa/paid-encrypted-sync/up-to-date-desktop.png
- Create: docs/superpowers/qa/paid-encrypted-sync/offline-touch.png
- Create: docs/superpowers/qa/paid-encrypted-sync/conflict-recovery-desktop.png
- Create: docs/superpowers/qa/paid-encrypted-sync/device-limit-desktop.png
- Create: docs/superpowers/qa/paid-encrypted-sync/deletion-desktop.png
- Create: docs/superpowers/qa/paid-encrypted-sync/README.md

**Interfaces:**

- Consumes: The approved Account & Sync theme-token treatment and PM-P4 UI state contract.
- Produces: Seven original-resolution PNGs and recorded owner acceptance.

- [ ] **Step 1: Inspect the established visual authority**

Read src/settings/sections/AccountSync.tsx, src/settings/Section.tsx, src/settings/sections/shared.ts, src/newtab/index.css, docs/superpowers/qa/paid-account-shell/mockup.html, and A2-D100. Reuse the current Settings rail, typography, semantic accent, quiet actions, hairlines, disclosure contrast, dialog behavior, and one-scroll-owner geometry.

- [ ] **Step 2: Build a static state renderer**

Create one self-contained HTML document selected by a state query parameter. It must not import production React or make any request. Render these exact customer states:

~~~js
const captures = [
  ['sync-off', 1600, 900, 'sync-off-desktop.png'],
  ['first-sync', 1600, 900, 'first-sync-desktop.png'],
  ['up-to-date', 1600, 900, 'up-to-date-desktop.png'],
  ['offline', 390, 844, 'offline-touch.png'],
  ['conflict', 1600, 900, 'conflict-recovery-desktop.png'],
  ['device-limit', 1600, 900, 'device-limit-desktop.png'],
  ['deletion', 1600, 900, 'deletion-desktop.png'],
]
~~~

The sync-off state must present two truthful lists:

~~~text
Encrypted when sync is on
Settings and layouts
Tasks, notes, habits, goals, and links
Approved non-secret connector preferences

Always stays on this device
Passwords, tokens, sessions, and feed or calendar URLs
Provider caches and responses
Uploaded images and device-local operational state
~~~

The remaining states must show friendly device naming and first pull, Up to date with quota and last success, Offline with local availability, Needs attention with one recoverable local backup, five-device replacement without auto-eviction, and distinct vault/account deletion consequences.

- [ ] **Step 3: Capture and validate all seven PNGs**

Implement a Playwright capture script that serves only the static mockup. Fail on a dimension mismatch, horizontal overflow, multiple scroll owners, clipped controls, less than 36 px settings actions, page error, console error, or failed request.

Run:

~~~powershell
node scripts/capture-paid-encrypted-sync-mockups.mjs
~~~

Expected: seven PASS captures with exact matrix dimensions and zero runtime/request failures.

- [ ] **Step 4: Inspect at original resolution**

Use the local image viewer for every PNG. Record dimensions and PASS/FAIL judgments for hierarchy, disclosure, status clarity, target size, overlap, clipping, scroll ownership, destructive separation, and touch containment in the README.

- [ ] **Step 5: Stop for owner approval**

Attach all seven PNGs directly in the conversation with absolute paths. Do not edit production React or CSS until the owner explicitly approves the complete visual set.

- [ ] **Step 6: Record the visual decision**

After approval, update docs/superpowers/aurora-2/DECISIONS.md with the accepted state matrix and visual constraints. Commit only the mockup source, capture script, PNGs, README, and decision.

---

### Task 2: Define the deny-by-default entity policy

**Files:**

- Create: src/sync/types.ts
- Create: src/sync/entityPolicy.ts
- Create: src/sync/entityPolicy.test.ts
- Create: src/sync/connectorProjection.ts
- Create: src/sync/connectorProjection.test.ts
- Modify: src/lib/storage/schema.ts
- Modify: src/lib/storage/schema.test.ts

**Interfaces:**

- Consumes: AuroraData and all 15 ConnectorConfig variants.
- Produces: SyncEntityV1, SyncEntityType, projectSyncEntities(data), applySyncEntity(data, entity), and projectConnectorPreference(id, config).

- [ ] **Step 1: Write exhaustive classification RED**

Require every key returned by Object.keys(defaults()) to appear in exactly one of SYNCED_AURORA_KEYS or EXCLUDED_AURORA_KEYS. Pin the approved entity types and prove unknown top-level keys, entity types, nested fields, unsafe URLs, malformed stable ids, and connector fields fail closed.

~~~ts
expect(new Set([...SYNCED_AURORA_KEYS, ...EXCLUDED_AURORA_KEYS]))
  .toEqual(new Set(Object.keys(defaults())))
expect(() => classifyAuroraKey('futureSecret')).toThrow('sync_key_unclassified')
expect(projectSyncEntities(secretFixture)).not.toContainEqual(
  expect.objectContaining({ value: expect.stringContaining('token_') }),
)
~~~

Run:

~~~powershell
npx vitest run src/sync/entityPolicy.test.ts src/sync/connectorProjection.test.ts
~~~

Expected: RED because the sync policy does not exist.

- [ ] **Step 2: Add the tagged entity union**

Define exact versioned records for settings, dated focus, task list, quick link, timer config, location, notes, world clock, countdown, legacy layout, layout manifest, named layout, calendar preference, calendar week start, connector preference, habit, habit completion, and Progress goal.

~~~ts
export interface SyncEntityV1<T = unknown> {
  schemaVersion: 1
  entityType: SyncEntityType
  entityId: string
  value: T
}

export type SyncMutationV1 =
  | { kind: 'put'; entity: SyncEntityV1 }
  | { kind: 'delete'; entityType: SyncEntityType; entityId: string }
~~~

Use existing validators rather than permissive casts. Preserve legacy layout and named layouts as separate authorities. Habit completion uses one habit-id plus date record and is removed from the habit definition record.

- [ ] **Step 3: Implement connector projections**

Give every connector id an explicit projection function. Always remove token, apiToken, password, email credential, snapshotEpoch, URL/origin, feed/calendar URL, cache, and provider response fields. Apply a remote connector preference only as an overlay onto an existing valid local config; never construct or enable a missing token- or URL-backed connection.

- [ ] **Step 4: Prove realistic secret exclusion**

Add nested fixtures for Google/Supabase sessions and leases, GitHub/GitLab/Jira/Vercel/Linear/Sentry/Todoist/Home Assistant secrets, RSS/ICS URLs, Status/Home Assistant origins, provider responses, photo blobs/references, caches, and future unknown members. Recursively scan keys and values and prove none can reach serialized entities.

- [ ] **Step 5: Run GREEN and commit**

~~~powershell
npx vitest run src/sync/entityPolicy.test.ts src/sync/connectorProjection.test.ts src/lib/storage/schema.test.ts
git add src/sync src/lib/storage/schema.ts src/lib/storage/schema.test.ts
git commit -m "feat(sync): define encrypted entity policy"
~~~

---

### Task 3: Implement canonical record encryption and key wrapping

**Files:**

- Create: src/sync/canonical.ts
- Create: src/sync/canonical.test.ts
- Create: src/sync/crypto.ts
- Create: src/sync/crypto.test.ts
- Create: supabase/functions/_shared/syncKeyring.ts
- Create: supabase/functions/tests/sync-keyring.test.ts

**Interfaces:**

- Consumes: SyncEntityV1 and injected Web Crypto.
- Produces: encryptSyncRecord, decryptSyncRecord, importDataKey, generateDataKey, wrapDataKey, and unwrapDataKey.

- [ ] **Step 1: Write crypto-vector and misuse RED**

Require published AES-256-GCM and AES-256-KW vectors, exact canonical UTF-8 encoding, unique 96-bit nonces, authentication of account/entity/revision/tombstone metadata, and rejection of altered ciphertext, AAD, account, entity, revision, nonce length, schema, or live fixture material.

~~~ts
await expect(decryptSyncRecord(key, { ...record, accountId: otherAccount }))
  .rejects.toThrow('sync_record_authentication_failed')
expect(nonceA).not.toEqual(nonceB)
expect(exportedKeyMaterialWrittenToStorage).toBe(false)
~~~

Run:

~~~powershell
npx vitest run src/sync/canonical.test.ts src/sync/crypto.test.ts supabase/functions/tests/sync-keyring.test.ts
~~~

Expected: RED because crypto modules do not exist.

- [ ] **Step 2: Implement canonical AAD and AES-GCM**

Encode exactly envelopeVersion, accountId, entityType, entityId, revision, and tombstone in sorted-key canonical JSON. Use crypto.getRandomValues for production nonces and an injected nonce source only in tests. Decryption must validate the plaintext entity identity before returning a value.

- [ ] **Step 3: Implement AES-KW key handling**

Generate a non-extractable encryption key in the client where possible, import released raw material only into memory, and expose no logging representation. In Edge code, load a 32-byte base64url KEK from TAB_TWO_SYNC_KEK_V1, bind it to key version 1, and wrap or unwrap only 32-byte DEKs with AES-256-KW.

- [ ] **Step 4: Run GREEN and commit**

~~~powershell
npx vitest run src/sync/canonical.test.ts src/sync/crypto.test.ts supabase/functions/tests/sync-keyring.test.ts
git add src/sync/canonical.ts src/sync/canonical.test.ts src/sync/crypto.ts src/sync/crypto.test.ts supabase/functions/_shared/syncKeyring.ts supabase/functions/tests/sync-keyring.test.ts
git commit -m "feat(sync): add record encryption boundary"
~~~

---

### Task 4: Add isolated local device, revision, and recovery state

**Files:**

- Create: src/sync/localState.ts
- Create: src/sync/localState.test.ts
- Create: src/sync/conflictBackups.ts
- Create: src/sync/conflictBackups.test.ts
- Modify: src/lib/backup.test.ts
- Modify: src/account/sessionStorage.test.ts

**Interfaces:**

- Consumes: ChromeStorageLike and the existing storage authority.
- Produces: SyncLocalStateStore, appendConflictBackup, restoreConflictBackup, deleteConflictBackup, and pruneConflictBackups.

- [ ] **Step 1: Write storage-isolation RED**

Pin the three versioned keys from the spec, account binding, 128-bit random device ids, 1-48 character names, malformed-version rejection, atomic revision updates, five-backup cap, 30-day retention, and absence from AuroraData, JSON backup, account session, cloud entities, and diagnostics.

- [ ] **Step 2: Implement typed local adapters**

Use exact validators and immutable return values. Device state stores id/name/enabled/registration only. Revision state stores account id, last vault version, accepted revisions, and content digests. Neither stores key material or plaintext remote payloads.

- [ ] **Step 3: Implement conflict-backup transactions**

Before a remote winner replaces local data, append a validated redacted displaced entity and apply the remote entity plus new revision under one storage-authority lock. Abort the remote apply if backup persistence fails. Explicit restore rebases on the current remote revision and queues a new local mutation; it does not auto-push.

- [ ] **Step 4: Run GREEN and commit**

~~~powershell
npx vitest run src/sync/localState.test.ts src/sync/conflictBackups.test.ts src/lib/backup.test.ts src/account/sessionStorage.test.ts
git add src/sync/localState.ts src/sync/localState.test.ts src/sync/conflictBackups.ts src/sync/conflictBackups.test.ts src/lib/backup.test.ts src/account/sessionStorage.test.ts
git commit -m "feat(sync): protect local revision and recovery state"
~~~

---

### Task 5: Add the default-deny sync database

**Files:**

- Create: supabase/migrations/20260902000500_encrypted_sync_foundation.sql
- Create: supabase/tests/encrypted_sync_rls.sql
- Modify: supabase/tests/account_entitlements.sql
- Modify: supabase/config.toml

**Interfaces:**

- Consumes: Existing private accounts, grants, and authenticated account resolution.
- Produces: Private sync vault/key/device/record/mutation/audit tables and service-role-only transactional functions.

- [ ] **Step 1: Write pgTAP adversary RED**

Require anonymous and authenticated roles to fail cross-account and same-account direct select, insert, update, delete, and private-function execution for keys, records, devices, mutation receipts, and audits. Require service-role fixtures for device races, quota boundaries, stale revisions, idempotent replay, hash mismatch, tombstone acknowledgement, compaction, entitlement expiry retention, vault deletion, and owner-grant survival.

Run:

~~~powershell
npx supabase db reset
npx supabase test db
~~~

Expected: RED because migration 00500 is absent.

- [ ] **Step 2: Create the private schema**

Create private.sync_vaults, private.sync_account_keys, private.sync_devices, private.sync_records, private.sync_mutation_receipts, and private.sync_audit_events. Use composite account/entity uniqueness, bounded text/byte checks, active/inactive/revoked device state, positive revisions and vault versions, and foreign keys that cannot cross accounts.

No table stores plaintext values, raw keys, session data, connector authority, user email, provider payloads, or raw request bodies.

- [ ] **Step 3: Add transactional service functions**

Implement service-role-only functions that:

- create/reactivate at most five active devices under an account lock;
- acquire one wrapped account key;
- return bounded records after a global vault version;
- apply up to 50 optimistic mutations with per-mutation idempotency;
- reject one idempotency id with a different request digest;
- enforce the exact 2,097,152-byte persistent vault boundary;
- acknowledge pulls only after client confirmation;
- deactivate, rename, or fresh-auth revoke one exact device;
- compact only tombstones acknowledged by all active devices;
- delete the vault without deleting local or billing data.

- [ ] **Step 4: Run database GREEN and commit**

~~~powershell
npx supabase db reset
npx supabase test db
npx supabase db lint --local --level error
git add supabase/migrations/20260902000500_encrypted_sync_foundation.sql supabase/tests/encrypted_sync_rls.sql supabase/tests/account_entitlements.sql supabase/config.toml
git commit -m "feat(sync): add default-deny vault schema"
~~~

Expected: migrations through 00500 apply, all pgTAP tests pass, and lint reports zero errors.

---

### Task 6: Implement key and device Edge boundaries

**Files:**

- Create: supabase/functions/_shared/syncTypes.ts
- Create: supabase/functions/_shared/syncRepository.ts
- Create: supabase/functions/_shared/syncHandlers.ts
- Create: supabase/functions/tests/sync-functions.test.ts
- Create: supabase/functions/sync-bootstrap/index.ts
- Create: supabase/functions/sync-bootstrap/config.toml
- Create: supabase/functions/sync-deactivate-device/index.ts
- Create: supabase/functions/sync-deactivate-device/config.toml
- Create: supabase/functions/sync-rename-device/index.ts
- Create: supabase/functions/sync-rename-device/config.toml
- Create: supabase/functions/sync-revoke-device/index.ts
- Create: supabase/functions/sync-revoke-device/config.toml
- Modify: supabase/config.toml

**Interfaces:**

- Consumes: PM-P2 JWT/account resolution, effective encrypted_sync entitlement, migration 00500, and SyncKeyring.
- Produces: Authenticated bootstrap, deactivate, rename, and fresh-auth revoke handlers.

- [ ] **Step 1: Write injected-handler RED**

Use fake auth, repository, clock, randomness, and keyring dependencies. Require POST-only exact-origin CORS, bounded JSON, provider-neutral account binding, entitlement checks, five-device concurrency, active-device key release, non-enumerating errors, fresh-auth revocation, exact target ownership, and secret-safe failures.

- [ ] **Step 2: Implement bootstrap and key release**

Accept only:

~~~ts
interface SyncBootstrapRequest {
  deviceId: string
  friendlyName: string
}
~~~

Resolve account from JWT, check server grants, register/reactivate under the database limit, create or unwrap one account DEK, and return raw key material only in the successful authenticated response with vault and device summaries. Set Cache-Control: no-store and never pass key material to logger/error helpers.

- [ ] **Step 3: Implement device mutations**

Deactivate only the current device. Rename only an owned device with a 1-48 character name. Revoke only an exact owned non-current device after a JWT auth_time no older than five minutes. Unknown or foreign ids return the same stable failure.

- [ ] **Step 4: Run GREEN and commit**

~~~powershell
npx vitest run supabase/functions/tests/account-functions.test.ts supabase/functions/tests/sync-functions.test.ts
git add supabase/functions/_shared/syncTypes.ts supabase/functions/_shared/syncRepository.ts supabase/functions/_shared/syncHandlers.ts supabase/functions/tests/sync-functions.test.ts supabase/functions/sync-bootstrap supabase/functions/sync-deactivate-device supabase/functions/sync-rename-device supabase/functions/sync-revoke-device supabase/config.toml
git commit -m "feat(sync): add key and device services"
~~~

---

### Task 7: Implement pull, push, vault deletion, and account deletion

**Files:**

- Create: supabase/functions/sync-pull/index.ts
- Create: supabase/functions/sync-pull/config.toml
- Create: supabase/functions/sync-push/index.ts
- Create: supabase/functions/sync-push/config.toml
- Create: supabase/functions/sync-delete-vault/index.ts
- Create: supabase/functions/sync-delete-vault/config.toml
- Create: supabase/functions/account-delete/index.ts
- Create: supabase/functions/account-delete/config.toml
- Modify: supabase/functions/_shared/syncHandlers.ts
- Modify: supabase/functions/_shared/syncRepository.ts
- Modify: supabase/functions/_shared/stripeGateway.ts
- Modify: supabase/functions/tests/sync-functions.test.ts
- Modify: supabase/config.toml

**Interfaces:**

- Consumes: Active device/account binding, private sync transactions, fresh auth, and server-owned Stripe customer/subscription binding.
- Produces: Bounded conditional pull, idempotent optimistic push, vault deletion, and account-deletion saga.

- [ ] **Step 1: Write lifecycle RED**

Require exact envelope validation, sandbox/live rejection where Stripe is touched, 50-mutation and 256 KiB request limits, 100-record and 256 KiB pull limits, idempotent unknown-outcome retry, stale winners, quota boundary, tombstone acknowledgement, malformed ciphertext opacity, owner account protection in fixtures, and deletion resumption after every injected failure point.

- [ ] **Step 2: Implement pull and acknowledgement**

Accept only deviceId, afterVaultVersion, cursor, and limit. Return ciphertext envelopes and a next cursor. A separate acknowledgement in the final page request advances the device version only after the client confirms prior pages applied. Never return another account's record or key.

- [ ] **Step 3: Implement optimistic push**

Accept only the reviewed encrypted envelope fields, expected revision, and idempotency id. Hash the normalized request before the database call. Return accepted revision/vault version or stale plus the authoritative encrypted winner. Never decrypt in the handler.

- [ ] **Step 4: Implement vault deletion**

Require recent auth plus exact DELETE confirmation. Delete ciphertext and wrapped key, deactivate all devices, audit one idempotent outcome, preserve account/billing/grants, and return a signed-in sync-disabled summary.

- [ ] **Step 5: Implement the account deletion saga**

Add a gateway method that cancels only the server-bound Stripe sandbox subscription. Mark deletion_pending before external cancellation, resume idempotently, then revoke app grants and account-scoped data, delete the Supabase Auth user through admin authority, and return a completed outcome. If Stripe fails, preserve account data and return retryable status. Tests must never target the owner's account.

- [ ] **Step 6: Run GREEN and commit**

~~~powershell
npx vitest run supabase/functions/tests/billing-functions.test.ts supabase/functions/tests/sync-functions.test.ts
npx supabase db reset
npx supabase test db
npx supabase db lint --local --level error
git add supabase/functions/sync-pull supabase/functions/sync-push supabase/functions/sync-delete-vault supabase/functions/account-delete supabase/functions/_shared/syncHandlers.ts supabase/functions/_shared/syncRepository.ts supabase/functions/_shared/stripeGateway.ts supabase/functions/tests/sync-functions.test.ts supabase/config.toml
git commit -m "feat(sync): add vault lifecycle services"
~~~

---

### Task 8: Add the authenticated extension sync gateway

**Files:**

- Create: src/sync/gateway.ts
- Create: src/sync/gateway.test.ts
- Modify: src/account/accountServiceConfig.ts
- Modify: src/account/supabaseAccountClient.ts
- Modify: src/account/supabaseAccountClient.test.ts
- Modify: src/account/types.ts

**Interfaces:**

- Consumes: Existing Supabase session refresh and exact account origin.
- Produces: SyncGateway plus typed AccountActions outcomes for enable, disable, sync now, rename/revoke device, conflict backup, vault deletion, and account deletion.

- [ ] **Step 1: Write client boundary RED**

Require the exact existing Supabase origin, authenticated POST, no-store responses, bounded JSON, timeouts, AbortSignal forwarding, auth invalidation, stable typed errors, no URL/key reflection, and zero calls in Local, signed-in sync-off, unentitled, or production-disabled states.

- [ ] **Step 2: Implement the gateway**

Keep keyMaterial private to bootstrap return handling and import it immediately into a CryptoKey. Do not publish it through AccountSnapshot, React state, devtools-friendly objects, storage, or errors. Map server summaries to existing sync/device presentation types without exposing ciphertext or revisions.

- [ ] **Step 3: Extend AccountActions**

Replace void sync placeholders with typed outcomes while keeping existing call sites source-compatible:

~~~ts
type SyncActionOutcome =
  | { status: 'completed' }
  | { status: 'authentication_required' | 'entitlement_required' | 'device_limit' | 'offline' | 'needs_attention' }
~~~

No free feature consults this outcome or capability state.

- [ ] **Step 4: Run GREEN and commit**

~~~powershell
npx vitest run src/sync/gateway.test.ts src/account/supabaseAccountClient.test.ts src/account/AccountContext.test.tsx
npx tsc --noEmit
git add src/sync/gateway.ts src/sync/gateway.test.ts src/account/accountServiceConfig.ts src/account/supabaseAccountClient.ts src/account/supabaseAccountClient.test.ts src/account/types.ts
git commit -m "feat(sync): connect authenticated vault gateway"
~~~

---

### Task 9: Build the single-owner sync coordinator

**Files:**

- Create: src/sync/coordinator.ts
- Create: src/sync/coordinator.test.ts
- Create: src/sync/SyncProvider.tsx
- Create: src/sync/SyncProvider.test.tsx
- Modify: src/newtab/main.tsx
- Modify: src/lib/storage/context.tsx
- Modify: src/lib/storage/context.test.tsx

**Interfaces:**

- Consumes: Storage authority, entity policy, crypto, local state, conflict backups, SyncGateway, account snapshot, visibility, focus, timers, and Web Locks.
- Produces: One lifecycle-owned coordinator and render-safe SyncProvider state.

- [ ] **Step 1: Write scheduling and race RED**

Cover 750 ms debounce, 5-second maximum wait, one Web Lock owner, conditional 60-second visible pulls, 15-second focus threshold, Sync now, 50-record batching, pagination, remote-apply echo suppression, 5/30/120/300-second backoff, offline local edits, abort on disable/sign-out/revocation/account change/unmount, and rejection of late completions.

- [ ] **Step 2: Implement pure queue and revision algebra**

Separate change projection, digest comparison, mutation batching, pull-page reduction, accepted revision updates, stale-winner handling, tombstone generation, and phase derivation from effects. Keep timers/network/storage outside the reducer.

- [ ] **Step 3: Implement the lifecycle owner**

Acquire tab-two:encrypted-sync:v1 only while signed in, entitled, enabled, and visible. Subscribe to eligible storage changes, schedule debounced push, pull at approved activations, import/clear the DEK in memory, and publish only safe AccountSnapshot sync summaries.

- [ ] **Step 4: Prove conflict safety**

Under one storage lock, require backup success before applying a stale server winner. After remote apply, store the accepted digest so the storage subscription does not echo it. A failed page or backup leaves the prior local value and last acknowledged server version unchanged.

- [ ] **Step 5: Run GREEN and commit**

~~~powershell
npx vitest run src/sync/coordinator.test.ts src/sync/SyncProvider.test.tsx src/lib/storage/context.test.tsx
npx tsc --noEmit
git add src/sync/coordinator.ts src/sync/coordinator.test.ts src/sync/SyncProvider.tsx src/sync/SyncProvider.test.tsx src/newtab/main.tsx src/lib/storage/context.tsx src/lib/storage/context.test.tsx
git commit -m "feat(sync): coordinate encrypted records"
~~~

---

### Task 10: Implement the approved Account & Sync experience

**Files:**

- Modify: src/settings/sections/AccountSync.tsx
- Modify: src/settings/sections/AccountSync.test.tsx
- Modify: src/account/previewAccountClient.ts
- Modify: src/newtab/index.css
- Modify: src/privacy/dataFlows.ts
- Modify: src/privacy/dataFlows.test.ts
- Modify: PRIVACY.md
- Modify: README.md

**Interfaces:**

- Consumes: Owner-approved Task 1 mockups and typed account/sync actions.
- Produces: Sync disclosure, device naming/management, four phases, quota, recovery backup controls, and truthful deletion outcomes.

- [ ] **Step 1: Write UI RED**

Require the two included/excluded lists, entitlement-aware explicit enable flow, device name validation, first-pull pending state, automatic safe phase updates, Sync now, quota copy, Offline local-availability copy, Needs attention recovery actions, device limit, rename/revoke, fresh verification, vault/account deletion distinctions, focus restoration, and no manual maintenance control for ordinary state convergence.

- [ ] **Step 2: Implement only the approved visual states**

Reuse Section, Switch, StateFeedback, dialog stack, focus trap, semantic theme tokens, and existing action classes. Do not add a canvas account control or a second scroll owner. Keep billing and sync status independent.

- [ ] **Step 3: Update disclosure**

Document exact encrypted categories and exclusions, device metadata, recoverable server key model, 2 MB quota, five devices, 90-day post-entitlement retention, deletion behavior, and the exact Supabase destination. Use encrypted sync only, never end-to-end encrypted or zero knowledge.

- [ ] **Step 4: Run GREEN and commit**

~~~powershell
npx vitest run src/settings/sections/AccountSync.test.tsx src/privacy/dataFlows.test.ts src/account/previewAccountClient.test.ts
npx tsc --noEmit
git add src/settings/sections/AccountSync.tsx src/settings/sections/AccountSync.test.tsx src/account/previewAccountClient.ts src/newtab/index.css src/privacy/dataFlows.ts src/privacy/dataFlows.test.ts PRIVACY.md README.md
git commit -m "feat(sync): add encrypted sync controls"
~~~

---

### Task 11: Review and stabilize the local packet

**Files:**

- Create: scripts/qa-encrypted-sync.mjs
- Create: scripts/qa-encrypted-sync.test.mjs
- Create: docs/superpowers/reports/TAB-TWO-ENCRYPTED-SYNC-LOCAL-QA.md
- Modify: docs/superpowers/aurora-2/STATUS.md
- Modify: docs/superpowers/aurora-2/ROADMAP.md
- Modify: docs/superpowers/aurora-2/DECISIONS.md

**Interfaces:**

- Consumes: The complete PM-P4 local diff.
- Produces: One bounded review, stabilized gates, exact builds, browser evidence, and the hosted gate request.

- [ ] **Step 1: Run one bounded Critical/Important review**

Review entity classification, secret smuggling, nonce uniqueness, canonical AAD, key persistence/logging, account/device binding, RLS, quota math, idempotency, stale ordering, backup-before-overwrite, tombstones, revocation, deletion saga, late async work, local/off isolation, UI truth, privacy, and rollback. Apply at most one focused fix/rereview cycle.

- [ ] **Step 2: Run the stabilized source gate**

~~~powershell
npm test
npx tsc --noEmit
node --test scripts/account-auth-build-contract.test.mjs scripts/account-auth-production-contract.test.mjs scripts/qa-account-auth-local.test.mjs scripts/qa-account-auth-production.test.mjs scripts/qa-stripe-billing.test.mjs scripts/qa-encrypted-sync.test.mjs
npx supabase db reset
npx supabase test db
npx supabase db lint --local --level error
npx vitest run supabase/functions/tests/account-functions.test.ts supabase/functions/tests/billing-functions.test.ts supabase/functions/tests/sync-keyring.test.ts supabase/functions/tests/sync-functions.test.ts
npm audit --audit-level=high
git diff --check
~~~

- [ ] **Step 3: Checkpoint before builds**

Stage only intended PM-P4 files, preserve the protected paths, commit the reviewed source, and require a clean tracked worktree before attributable builds.

- [ ] **Step 4: Run exact builds and artifact scans**

~~~powershell
npm run build
npm run build:preview
npm run build:account-local
npm run build
~~~

Scan all artifacts and tracked files for KEK/DEK material, secret patterns, deterministic crypto fixtures, plaintext vault values, service-role material, preview entitlement symbols, and unexpected permissions. Production must remain the final dist.

- [ ] **Step 5: Run local two-installation and installed-extension QA**

At 1600x900 and touch-enabled 390x844, prove explicit enable, first pull, independent edits, same-record conflict backup, manual restore, offline local edit, recovery, quota, device limit, exact revocation, tombstone non-resurrection, disable, sign-out, deletion copy, focus/keyboard behavior, storage/request allowlists, and zero unexpected runtime errors. Inspect every retained PNG at original resolution.

- [ ] **Step 6: Reconcile and commit evidence**

Record exact SHAs, counts, screenshots, request/storage ledgers, accepted manual ceilings, rollback, and the still-closed hosted gate. Push only feat/aurora-2-observatory and prove local HEAD equals upstream and remote.

---

### Task 12: Request and execute the hosted PM-P4 gate

**External state:** One versioned sync KEK secret, migration 00500, reviewed sync/account-deletion Edge Functions, dedicated sandbox accounts/devices, encrypted test records, and audit rows in the existing approved Supabase project.

- [ ] **Step 1: Present the exact gate and stop**

List every migration, function, secret name, function JWT setting, table/RPC, rate limit, test account/device, product-data category, expected storage/egress, rollback command, and destructive test. Confirm Supabase Free remains selected and explain any capacity limitation. Do not create or deploy anything until the owner explicitly approves this exact list.

- [ ] **Step 2: Provision only approved test authority**

After approval, generate the KEK locally without displaying or retaining its value, save it only to Supabase secret storage, verify the secret name without reading it back, apply only migration 00500, deploy only the listed functions, and confirm JWT protection and versions. Do not add a payment method, paid tier, permission, live Stripe state, or owner-account destructive fixture.

- [ ] **Step 3: Exercise real hosted lifecycles**

Use dedicated sandbox accounts to prove first device, five-device concurrency, sixth-device rejection, rename/deactivate/reactivate/revoke, encrypted put/pull, independent merge, same-record stale rejection, idempotent retry, exact 2 MB boundary, conflict backup, tombstone acknowledgement/compaction, vault deletion, and resumable account-deletion failure. Retain only redacted ids, metadata, ciphertext sizes, status codes, and event counts.

- [ ] **Step 4: Verify the owner's non-destructive path**

Only after the destructive matrix passes, let the owner's installed extension enable sync explicitly. Prove no excluded field uploads, the key remains memory-only, local data remains available offline, disable stops traffic, and billing/complimentary authority remains independent. Do not delete or revoke the owner's account.

- [ ] **Step 5: Close PM-P4 and stop**

Run the stabilized focused checks affected by hosted corrections, reconcile the QA report, STATUS, ROADMAP, DECISIONS, PRIVACY, and README, commit and push, prove local/upstream/remote equality, and confirm the protected original and untracked paths. Stop before Supabase Pro, PM-P5, merge, release, package, or Chrome Web Store action.

## Rollback

- Disable sync bootstrap and push first so no new cloud writes occur.
- Disable pull/key release if account binding, ciphertext validation, or device authorization is unsafe.
- Turn off the extension sync adapter and retain AuroraData as local authority.
- Preserve ciphertext until a reviewed forward repair or explicit customer deletion.
- Rotate or revoke only the PM-P4 KEK through the owner runbook; never expose prior material.
- Reverse schema only through a reviewed forward migration or isolated restore.
- Never delete installation-local product data, alter billing grants, merge, release, or mutate the Chrome Web Store.
