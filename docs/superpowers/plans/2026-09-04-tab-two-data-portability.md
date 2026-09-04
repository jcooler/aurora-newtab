# Tab Two Data Portability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The owner explicitly prohibited subagent use for this program.

**Goal:** Add a fresh-authenticated readable account-data export and a request-free per-conflict-recovery export while preserving Tab Two's encrypted-sync, local-first, and release gates.

**Architecture:** One new extension-origin-only `account-export` Edge Function returns an exact, bounded metadata and ciphertext snapshot plus an ephemeral raw account data key after server-verified fresh authentication. The extension decrypts and validates records only in memory, creates a versioned readable JSON download, and excludes all key material. Conflict recoveries use a separate local serializer and never contact the service.

**Tech Stack:** TypeScript 5.9, React 19, Vitest, Tailwind CSS 4, Web Crypto AES-256-GCM, Supabase Edge Functions, PostgreSQL and pgTAP, Playwright Chromium, existing Blob download pattern.

**Spec:** `docs/superpowers/specs/2026-09-04-tab-two-data-portability-design.md`

## Global constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`.
- Preserve `D:\DEV\Chrome plugin`, existing untracked evidence, and the protected takeover document.
- Do not use subagents.
- Use observed RED, minimal GREEN, focused tests, one bounded review, at most one Important/Critical fix cycle, then one stabilized full gate.
- The backend never decrypts a sync record and never receives synced plaintext.
- The final customer file never contains a raw or wrapped key, nonce, ciphertext, token, session, provider subject, Stripe object identifier, provider cache, raw provider response, private capability URL, custom image, audit log, or security log.
- Local mode and signed-in idle mode make zero new requests and zero new storage writes.
- The account export is available without entitlement, active subscription, enabled sync, or active device after fresh Google verification.
- A recovery export is local, single-record, immutable, request-free, and storage-write-free.
- Add no runtime dependency and no Chrome permission, including no `downloads` permission.
- Production account export stays disabled until the separately approved hosted activation gate. Preview and account-local modes may enable deterministic/local authority.
- Owner hands-on QA remains deferred to the cumulative final checklist. Automated unit, integration, database, build, scan, and installed-extension QA continue normally.
- Do not deploy, merge, package, release, publish, roll out, modify the Chrome Web Store, enable live Stripe, buy infrastructure, or mutate provider authority in this plan.
- Use literal `&` in prose and headings. Do not use em or en dashes.

## Design direction

The subject is a privacy-first second-screen dashboard. The new surface has one job: let a signed-in customer keep a usable copy of their paid-service data without making the account page feel technical or alarming.

- **Palette:** `Aurora ink #f5f5f4`, `muted ink rgb(245 245 244 / 0.68)`, `Tab Two cyan #7dd3fc`, `panel rgb(10 10 10 / 0.92)`, and fg-derived hairlines and controls from `src/theme/themes.css`.
- **Type:** Space Grotesk for the section title and dialog headline; Inter for actions, explanations, metadata, and statuses.
- **Layout:** A flat `Your data` section with a left-aligned headline and two short copy lines, balanced by one explicit action. It sits between Devices and Account actions. Recovery actions remain attached to their row and wrap as one group on narrow screens.
- **Signature:** The single primary action changes continuously from `Verify with Google & download` to the existing cyan inline spinner plus `Preparing download...`, then resolves to a restrained polite confirmation. No extra progress card, gradient, illustration, or decorative icon is added.
- **Self-critique:** A generic privacy card with shield icon, gradient, and badges would duplicate the sync status surface and make the settings drawer look templated. The revised direction uses Tab Two's established flat section rhythm, one accent action, exact copy, and purposeful motion.

---

### Task 1: Versioned customer export contracts

**Files:**

- Create: `src/account/dataExport.ts`
- Create: `src/account/dataExport.test.ts`
- Create: `src/sync/recoveryExport.ts`
- Create: `src/sync/recoveryExport.test.ts`
- Read: `src/sync/crypto.ts`
- Read: `src/sync/entityPolicy.ts`
- Read: `src/sync/localState.ts`

**Interfaces:**

- Produces `AccountDataExportV1`, `AccountDataExportSourceV1`, `createAccountDataExportV1(source, exportedAt)`, `serializeAccountDataExport(exportValue)`, `accountDataExportFilename(exportedAt)`, and `downloadJsonFile(serialized, filename, document, url)`.
- Produces `SyncConflictRecoveryExportV1`, `createConflictRecoveryExportV1(accountId, recovery, exportedAt)`, and `conflictRecoveryFilename(recovery, exportedAt)`.
- Consumes only fully validated typed input. These modules do not read storage, session state, or network state.

- [ ] **Step 1: Write the failing account export contract tests**

Add fixtures with account, connected account, subscription, entitlement,
device, live synced entity, and tombstone data. Assert exact top-level keys,
deterministic `entityType` then `entityId` ordering, ISO UTC conversion,
`value` absence on tombstones, pretty JSON, and
`tab-two-account-data-2026-09-04.json`.

```ts
const value = createAccountDataExportV1(source, Date.parse('2026-09-04T12:00:00.000Z'))
expect(Object.keys(value)).toEqual([
  'app', 'kind', 'version', 'exportedAt', 'account', 'connectedAccounts',
  'subscription', 'entitlement', 'devices', 'syncedData',
])
expect(value.syncedData.records.map(({ entityType, entityId }) => `${entityType}:${entityId}`))
  .toEqual(['notes:singleton', 'todo_list:list-a'])
expect(value.syncedData.records[1]).not.toHaveProperty('value')
```

- [ ] **Step 2: Write the failing prohibited-field and download tests**

Prove the resulting string omits raw/wrapped keys, nonce, ciphertext, tokens,
provider subjects, Stripe IDs, cache/raw response values, capability URLs,
images, logs, and fixture secrets. Stub `URL.createObjectURL`, anchor click,
anchor removal, and `URL.revokeObjectURL`; assert exactly one JSON Blob and
immediate URL revocation.

- [ ] **Step 3: Run the account contract test and observe RED**

Run:

```powershell
npx vitest run src/account/dataExport.test.ts
```

Expected: FAIL because `src/account/dataExport.ts` does not exist.

- [ ] **Step 4: Implement the minimal account contract**

Use exact readonly types. `createAccountDataExportV1` clones every nested value,
sorts connected accounts by provider/email/id, sorts devices by friendly name/id,
sorts capabilities and grant sources, sorts synced records by type/id, converts
milliseconds to ISO, and freezes the complete return value. `downloadJsonFile`
uses `application/json`, appends and clicks one anchor, removes it in the same
turn, and revokes the Blob URL in `finally`.

```ts
export function serializeAccountDataExport(value: AccountDataExportV1): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function accountDataExportFilename(exportedAt: number): string {
  return `tab-two-account-data-${new Date(exportedAt).toISOString().slice(0, 10)}.json`
}
```

- [ ] **Step 5: Write the failing recovery export tests**

Assert the exact version 1 file shape, account binding, immutable clone,
selected recovery only, sanitized filename, no key/ciphertext fields, and no
mutation to the source object.

```ts
const value = createConflictRecoveryExportV1(accountId, recovery, exportedAt)
expect(Object.keys(value)).toEqual([
  'app', 'kind', 'version', 'exportedAt', 'accountId', 'recovery',
])
expect(value.recovery.entity).toEqual(recovery.entity)
expect(conflictRecoveryFilename(recovery, exportedAt))
  .toBe('tab-two-recovery-notes-2026-09-04T120000Z.json')
```

- [ ] **Step 6: Run the recovery test and observe RED**

Run:

```powershell
npx vitest run src/sync/recoveryExport.test.ts
```

Expected: FAIL because `src/sync/recoveryExport.ts` does not exist.

- [ ] **Step 7: Implement the minimal recovery serializer and rerun focused tests**

Validate account UUID, timestamp, and recovery through the existing local-state
parser and sync-entity application guard before building the immutable value.

Run:

```powershell
npx vitest run src/account/dataExport.test.ts src/sync/recoveryExport.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```powershell
git add -- src/account/dataExport.ts src/account/dataExport.test.ts src/sync/recoveryExport.ts src/sync/recoveryExport.test.ts
git commit -m "feat: add portable data export contracts"
```

---

### Task 2: Fresh-authenticated database and Edge export boundary

**Files:**

- Create: `supabase/migrations/20260904000900_account_data_export.sql`
- Create: `supabase/functions/_shared/accountExportTypes.ts`
- Create: `supabase/functions/_shared/accountExportRepository.ts`
- Create: `supabase/functions/_shared/accountExportHandlers.ts`
- Create: `supabase/functions/_shared/accountExportRuntime.ts`
- Create: `supabase/functions/account-export/index.ts`
- Create: `supabase/functions/tests/account-export.test.ts`
- Modify: `supabase/functions/_shared/syncTypes.ts`
- Modify: `supabase/functions/_shared/syncRepository.ts`
- Test: `supabase/tests/database/encrypted_sync_rls.test.sql`

**Interfaces:**

- Produces `AccountExportServiceSnapshot`, `AccountExportRepository.getSnapshot(accountId, effectiveAt)`, `AccountExportRepository.recordAudit(input)`, and `createAccountExportHandler(dependencies)`.
- Extends `SyncRateLimitAction` with `export_account` and the existing rate-limit RPC with three attempts per one-hour window for account and IP scope.
- Produces service-role RPC `public.tab_two_account_data_export(uuid, timestamptz)` returning one exact JSON object from a single SQL statement snapshot.
- Uses `authenticateSyncBearerRequest`, the existing five-minute freshness rule, the existing `SyncKeyring`, extension CORS, and the existing privacy-preserving request fingerprint.

- [ ] **Step 1: Add database RED assertions**

Extend pgTAP coverage to assert migration objects, service-role-only execute,
authenticated/anon/public denial, exact account isolation, no provider secret
columns, no Stripe object IDs, no audit/log rows, current record ordering,
no-vault output, and `export_account` rate-limit behavior.

```sql
select function_privs_are(
  'public', 'tab_two_account_data_export', array['uuid', 'timestamp with time zone'],
  'service_role', array['EXECUTE'],
  'account export RPC is service role only'
);
```

- [ ] **Step 2: Run the database test and observe RED**

Run:

```powershell
supabase test db
```

Expected: FAIL because migration `00900` and the export RPC do not exist.

- [ ] **Step 3: Add the bounded migration**

The migration must:

1. Extend `sync_rate_action_known` to include `export_account`.
2. Replace `private.consume_sync_rate_limit` with the existing cases plus:
   `when 'export_account' then window_seconds := 3600; maximum_requests := 3;`.
3. Create `public.tab_two_account_data_export(target_account_id uuid,
   effective_at timestamptz) returns jsonb` as `stable security definer set
   search_path = ''`.
4. Build exact `account`, `connectedAccounts`, `subscription`, `entitlement`,
   `devices`, and `vault` keys. Select only approved columns. Use `jsonb_agg`
   with deterministic ordering. Include wrapped key and encrypted record fields
   only inside the private service response.
5. Create `public.tab_two_record_account_export_event(target_account_id uuid,
   outcome_code text, record_count integer, byte_count integer, occurred_at
   timestamptz) returns void` as `security definer set search_path = ''`. It
   accepts only bounded known outcome codes, nonnegative counts, and inserts one
   `account_export` event with exactly `outcome`, `recordCount`, and `byteCount`
   in `private.sync_audit_events.details`.
6. Revoke both RPCs from `public`, `anon`, and `authenticated`; grant only to
   `service_role`.

The RPC returns null for unknown/deleted accounts and uses:

```sql
jsonb_build_object(
  'accountId', account.id,
  'email', identity_link.email,
  'displayName', identity_link.display_name,
  'accountCreatedAt', account.created_at,
  'identityCreatedAt', identity_link.created_at,
  'identityUpdatedAt', identity_link.updated_at
)
```

Do not select provider subject, refresh-token columns, Stripe customer or
subscription IDs, OAuth transactions, receipts, or audit tables.

- [ ] **Step 4: Rerun database tests**

Run:

```powershell
supabase test db
```

Expected: PASS with the new assertion count recorded.

- [ ] **Step 5: Write Edge handler RED tests**

Cover method denial, CORS wrapper ownership, missing/invalid bearer, missing
interactive auth time, auth older than five minutes, exact request body,
cross-account ID, rate limit, no entitlement, no device, no vault, wrapped-key
unwrap, 2 MiB maximum vault, 4 MiB response ceiling, malformed repository
shape, key-without-record and record-without-key rejection, raw-key zeroing,
safe errors, minimal success/failure audit calls, audit failure not masking the
customer outcome, and no sensitive values in errors/logs.

```ts
const response = await handler(request({ accountId }, freshAuthentication))
expect(response.status).toBe(200)
expect(await response.json()).toMatchObject({
  version: 1,
  account: { accountId },
  vault: { records: [] },
})
expect(deps.repository.getEffectiveCapabilities).not.toHaveBeenCalled()
```

- [ ] **Step 6: Run the Edge test and observe RED**

Run:

```powershell
npx vitest run --config supabase/functions/vitest.config.ts supabase/functions/tests/account-export.test.ts
```

Expected: FAIL because the handler modules do not exist.

- [ ] **Step 7: Implement types, repository, handler, runtime, and entry point**

Use exact-key validators at repository and handler boundaries. Authenticate,
resolve account from the verified auth user, compare the body account UUID,
require fresh authentication, consume the dual-scope rate limit, read one
snapshot, unwrap the key only when records exist, base64url encode it, and clear
the raw bytes in `finally`.

```ts
let rawKey: Uint8Array | null = null
try {
  rawKey = await dependencies.keyring.unwrapDataKey(snapshot.vault.wrappedDataKey)
  return jsonResponse({ version: 1, ...publicSnapshot, dataKey: encodeBase64Url(rawKey) })
} finally {
  rawKey?.fill(0)
}
```

The runtime reuses `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`TAB_TWO_SYNC_KEK_V1`. No new secret is introduced.

- [ ] **Step 8: Run focused Edge and existing sync tests**

Run:

```powershell
npx vitest run --config supabase/functions/vitest.config.ts supabase/functions/tests/account-export.test.ts supabase/functions/tests/sync-functions.test.ts supabase/functions/tests/sync-keyring.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```powershell
git add -- supabase/migrations/20260904000900_account_data_export.sql supabase/functions/_shared/accountExportTypes.ts supabase/functions/_shared/accountExportRepository.ts supabase/functions/_shared/accountExportHandlers.ts supabase/functions/_shared/accountExportRuntime.ts supabase/functions/account-export/index.ts supabase/functions/tests/account-export.test.ts supabase/functions/_shared/syncTypes.ts supabase/functions/_shared/syncRepository.ts supabase/tests/database/encrypted_sync_rls.test.sql
git commit -m "feat: add account export service boundary"
```

Do not deploy the migration or function.

---

### Task 3: Typed client transport and in-memory decryption

**Files:**

- Create: `src/account/dataExportGateway.ts`
- Create: `src/account/dataExportGateway.test.ts`
- Modify: `src/account/types.ts`
- Modify: `src/account/client.ts`
- Modify: `src/account/accountServiceConfig.ts`
- Modify: `src/account/accountServiceConfig.test.ts`
- Modify: `src/account/productionAccountServiceConfig.ts`
- Modify: `src/account/supabaseAccountClient.ts`
- Modify: `src/account/supabaseAccountClient.test.ts`
- Modify: `src/account/localAccountClient.ts`
- Modify: `src/account/previewAccountClient.ts`
- Modify: `src/account/createAccountClient.test.ts`

**Interfaces:**

- Produces `AccountDataExportOutcome` with `ready`, `authentication_required`,
  `verification_required`, `offline`, `rate_limited`, and `data_unavailable`.
- Adds `AccountActions.prepareAccountDataExport()` and the optional feature flag
  `AccountClient.accountDataExportEnabled`, where absent is safely disabled for
  legacy test fixtures.
- Adds `accountDataExportEnabled` to `AccountServiceConfig` and production
  descriptor validation. It is `true` in preview and account-local, `false` in
  production until hosted activation.
- `createAccountDataExportGateway` consumes account-bound token access, exact
  origin allowlist, `fetch`, timeout, and optional `Crypto`.

- [ ] **Step 1: Write gateway RED tests**

Test exact POST URL/body/headers, timeout, response byte ceiling before parsing,
exact-key validation, account binding, sorted bounded collections, key decode,
non-extractable key import, raw byte clearing, AES-GCM authentication, tombstone
handling, entity identity validation, current entity-schema validation, complete
failure on one bad record, and safe failure mapping.

```ts
const result = await gateway.prepare({ accountId })
expect(result).toMatchObject({ ok: true, value: { syncedData: { status: 'available' } } })
expect(fetch).toHaveBeenCalledWith(
  `${origin}/functions/v1/account-export`,
  expect.objectContaining({ method: 'POST' }),
)
```

- [ ] **Step 2: Run gateway test and observe RED**

Run:

```powershell
npx vitest run src/account/dataExportGateway.test.ts
```

Expected: FAIL because the gateway does not exist.

- [ ] **Step 3: Implement the gateway minimally**

Reuse `importDataKey` and `decryptSyncRecord`. Add or export one entity guard
from `src/sync/entityPolicy.ts` that validates a decrypted `SyncEntityV1`
without applying it to customer storage. The gateway returns an immutable
`AccountDataExportSourceV1`; it does not download, apply, acknowledge, or store
anything.

```ts
export interface AccountDataExportGateway {
  prepare(input: { accountId: string }, signal?: AbortSignal):
    Promise<AccountDataExportGatewayResult<AccountDataExportSourceV1>>
}
```

- [ ] **Step 4: Add account/client RED tests**

Assert local client disabled behavior, preview deterministic ready behavior,
account-local enablement, production disablement, current account binding,
fresh session use after `beginSignIn`, unauthorized authority clearing, no
request when disabled, and no new request during hydration.

- [ ] **Step 5: Extend the client contracts and implementations**

`prepareAccountDataExport` checks signed-in state and the feature flag, obtains
the current usable account-bound token, delegates to the gateway, and maps
failures without logging payloads. It does not itself call `beginSignIn`; the UI
owns the explicit verification sequence.

- [ ] **Step 6: Run focused client tests**

Run:

```powershell
npx vitest run src/account/dataExportGateway.test.ts src/account/accountServiceConfig.test.ts src/account/createAccountClient.test.ts src/account/supabaseAccountClient.test.ts src/account/AccountContext.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- src/account/dataExportGateway.ts src/account/dataExportGateway.test.ts src/account/types.ts src/account/client.ts src/account/accountServiceConfig.ts src/account/accountServiceConfig.test.ts src/account/productionAccountServiceConfig.ts src/account/supabaseAccountClient.ts src/account/supabaseAccountClient.test.ts src/account/localAccountClient.ts src/account/previewAccountClient.ts src/account/createAccountClient.test.ts src/sync/entityPolicy.ts src/sync/entityPolicy.test.ts
git commit -m "feat: prepare readable account exports locally"
```

---

### Task 4: Preview-first visual states and Account & Sync UX

**Files:**

- Create: `src/settings/sections/AccountDataExport.tsx`
- Create: `src/settings/sections/AccountDataExport.test.tsx`
- Modify: `src/settings/sections/AccountSync.tsx`
- Modify: `src/settings/sections/AccountSync.test.tsx`
- Modify: `src/sync/SyncProvider.tsx`
- Modify: `src/sync/SyncProvider.test.tsx`
- Modify: `src/newtab/index.css`
- Modify: `src/account/previewAccountClient.ts`
- Create or modify: `scripts/qa-data-portability.mjs`
- Create: `scripts/qa-data-portability.test.mjs`
- Modify: `package.json`

**Interfaces:**

- `AccountDataExport` consumes `accountId`, `enabled`, `actions`, a clock, and
  injected download boundary for tests.
- `SyncProvider` adds `prepareRecoveryExport(backupId)` that reads one recovery
  via the account-bound local adapter, revalidates it, and returns its immutable
  export model without changing state. The Settings UI owns the Blob download.
- The QA script owns the exact fixture states and evidence schema for this
  packet.

- [ ] **Step 1: Create and inspect preview-only mockups before production UI edits**

Create temporary fixture-only markup outside production React/CSS for these
original-resolution captures:

- desktop idle Your data section, 1600 by 900
- desktop fresh-verification dialog, 1600 by 900
- desktop preparing state, 1600 by 900
- desktop safe failure state, 1600 by 900
- touch recovery actions, 390 by 844

Use only existing theme tokens and typefaces. Record judgments for hierarchy,
balanced whitespace, restrained accent, copy, no extra card, no overlap, no
horizontal overflow, and visible focus. Retain under a new untracked
`artifacts/qa-data-portability-mockups/<source-sha>/` directory. Do not stage it.

- [ ] **Step 2: Write component RED tests**

Cover hidden section when disabled, flat Your data content when enabled,
confirmation before request, Cancel and Escape focus restoration, fresh Google
verification, automatic preparation after verification, spinner and
`Preparing download...`, duplicate-action prevention, blocked/canceled auth,
offline/rate-limit/data/download failures, success status, and retry behavior.

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Download account data' }))
expect(actions.prepareAccountDataExport).not.toHaveBeenCalled()
fireEvent.click(screen.getByRole('button', { name: 'Verify with Google & download' }))
await screen.findByRole('button', { name: 'Preparing download...' })
expect(actions.beginSignIn).toHaveBeenCalledOnce()
```

- [ ] **Step 3: Write recovery-row RED tests**

Assert action order `Restore`, `Download copy`, `Discard`; one-row download;
row-scoped spinner/status/error; `Try again` only after a download failure;
local store immutability; no sync coordinator call; no fetch; no Chrome-storage
write; and narrow-layout action grouping.

- [ ] **Step 4: Run component tests and observe RED**

Run:

```powershell
npx vitest run src/settings/sections/AccountDataExport.test.tsx src/settings/sections/AccountSync.test.tsx src/sync/SyncProvider.test.tsx
```

Expected: FAIL for missing section/action and recovery download behavior.

- [ ] **Step 5: Implement the UI and local recovery operation**

Follow the approved design and preview captures. Reuse `btnPrimary`, `btnQuiet`,
`AssertiveAlert`, `PoliteStatus`, `useFocusTrap`, `useDialogEscape`, and the
existing `.account-sync-status__spinner`. Keep the section flat. Add only
purpose-specific CSS for the balanced data row, dialog progress, and recovery
action wrap.

The primary flow is:

```ts
const verified = await actions.beginSignIn()
if (!verified.ok) return setPhase('verification_failed')
setPhase('preparing')
const outcome = await actions.prepareAccountDataExport()
if (outcome.status !== 'ready') return setFailure(outcome.status)
const exportedAt = now()
downloadJsonFile(
  serializeAccountDataExport(createAccountDataExportV1(outcome.value, exportedAt)),
  accountDataExportFilename(exportedAt),
  document,
  URL,
)
```

Capture `now()` once so filename and `exportedAt` cannot disagree.

- [ ] **Step 6: Run focused UI tests**

Run:

```powershell
npx vitest run src/settings/sections/AccountDataExport.test.tsx src/settings/sections/AccountSync.test.tsx src/sync/SyncProvider.test.tsx src/account/dataExport.test.ts src/sync/recoveryExport.test.ts
```

Expected: PASS.

- [ ] **Step 7: Add QA script contract RED/GREEN**

The script contract requires `--exact`, exact production and preview provenance,
no preview marker in production, installed-extension execution, five design
states at desktop/touch sizes, successful account and recovery downloads in
preview, zero idle requests/writes/errors, exactly one fixture-fulfilled export
request after explicit confirmation, zero request for recovery download, exact
download filename/JSON schema, geometry, focus, reduced motion, and original
pixel dimensions.

Run:

```powershell
node --test scripts/qa-data-portability.test.mjs
```

Expected: PASS after the minimal runner and `qa:data-portability` package script
exist.

- [ ] **Step 8: Commit Task 4**

```powershell
git add -- src/settings/sections/AccountDataExport.tsx src/settings/sections/AccountDataExport.test.tsx src/settings/sections/AccountSync.tsx src/settings/sections/AccountSync.test.tsx src/sync/SyncProvider.tsx src/sync/SyncProvider.test.tsx src/newtab/index.css src/account/previewAccountClient.ts scripts/qa-data-portability.mjs scripts/qa-data-portability.test.mjs package.json
git commit -m "feat: add polished data portability controls"
```

---

### Task 5: Privacy, help, matrix, and documentation contracts

**Files:**

- Modify: `PRIVACY.md`
- Modify: `README.md`
- Modify: `src/settings/sections/HelpSupport.tsx`
- Modify: `src/settings/sections/HelpSupport.test.tsx`
- Modify: `scripts/paid-mvp-documentation.test.mjs`
- Modify: `scripts/paid-mvp-qa-matrix.mjs`
- Modify: `scripts/qa-paid-mvp-stabilization.mjs`
- Modify: `scripts/qa-paid-mvp-stabilization.test.mjs`
- Modify: `docs/superpowers/reports/TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`

**Interfaces:**

- Adds `qa:data-portability` to the composed paid-MVP gate after Account & Sync
  and before account-auth production.
- Documents local backup, account-data export, and recovery export as three
  distinct controls.

- [ ] **Step 1: Write documentation and matrix RED assertions**

Require exact customer wording for readable account export, fresh Google
verification, local-only recovery export, prohibited fields, no server
plaintext, no import promise, and no claim that the still-disabled production
endpoint is hosted.

- [ ] **Step 2: Run documentation/matrix tests and observe RED**

Run:

```powershell
node --test scripts/paid-mvp-documentation.test.mjs scripts/qa-paid-mvp-stabilization.test.mjs
```

Expected: FAIL for missing portability documentation and composed gate.

- [ ] **Step 3: Update customer documentation and Help**

Use plain customer language. Help explains:

`Data creates the local backup used to restore this installation. Account & Sync can download readable account and synced data after Google verification. Recovery copies can be downloaded locally before restore or discard.`

Do not call the account-data file encrypted, importable, or a complete legal
data-subject response.

- [ ] **Step 4: Update the exact matrix and rerun focused tests**

Run:

```powershell
node --test scripts/paid-mvp-documentation.test.mjs scripts/qa-paid-mvp-stabilization.test.mjs
npx vitest run src/settings/sections/HelpSupport.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```powershell
git add -- PRIVACY.md README.md src/settings/sections/HelpSupport.tsx src/settings/sections/HelpSupport.test.tsx scripts/paid-mvp-documentation.test.mjs scripts/paid-mvp-qa-matrix.mjs scripts/qa-paid-mvp-stabilization.mjs scripts/qa-paid-mvp-stabilization.test.mjs docs/superpowers/reports/TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md
git commit -m "docs: explain customer data portability"
```

---

### Task 6: Exact automated QA, bounded review, and local packet closeout

**Files:**

- Create: `docs/superpowers/reports/TAB-TWO-DATA-PORTABILITY-QA.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `docs/superpowers/plans/2026-09-04-tab-two-data-portability.md`

**Interfaces:**

- Produces one source-bound local implementation candidate and exact automated
  evidence. It does not authorize hosted activation or release.

- [ ] **Step 1: Run focused contract tests**

Run:

```powershell
npx vitest run src/account/dataExport.test.ts src/account/dataExportGateway.test.ts src/account/accountServiceConfig.test.ts src/account/createAccountClient.test.ts src/account/supabaseAccountClient.test.ts src/account/AccountContext.test.tsx src/sync/recoveryExport.test.ts src/sync/entityPolicy.test.ts src/sync/SyncProvider.test.tsx src/settings/sections/AccountDataExport.test.tsx src/settings/sections/AccountSync.test.tsx src/settings/sections/HelpSupport.test.tsx
npx vitest run --config supabase/functions/vitest.config.ts supabase/functions/tests/account-export.test.ts supabase/functions/tests/sync-functions.test.ts supabase/functions/tests/sync-keyring.test.ts
node --test scripts/qa-data-portability.test.mjs scripts/paid-mvp-documentation.test.mjs scripts/qa-paid-mvp-stabilization.test.mjs
supabase test db
```

Expected: all PASS.

- [ ] **Step 2: Run TypeScript and production/preview builds**

Run:

```powershell
npx tsc --noEmit
npm run build
npm run build:preview
```

Expected: PASS. Record exact module counts and provenance. Scan production for
preview markers, local endpoints, private credentials, raw-key fixture values,
and service-role or provider secret values.

- [ ] **Step 3: Run exact installed-extension portability QA**

Build the exact mode requested by the runner, then run:

```powershell
npm run qa:data-portability -- --exact
```

Expected: PASS with source/build equality, original-resolution captures, exact
downloads, allowed fixture request only after explicit confirmation, zero idle
requests, zero recovery requests, zero unexpected writes, and zero runtime
errors.

- [ ] **Step 4: Inspect every retained screenshot at original resolution**

Use the local image viewer for each PNG. Record only observed judgments for
hierarchy, balance, readable copy, dialog containment, spinner stability,
recovery action grouping, focus, touch sizing, clipping, overflow, and the
existing Tab Two visual system. Tests alone do not satisfy this step.

- [ ] **Step 5: Perform one bounded complete-diff review**

Compare the complete implementation with the approved spec and threat model.
Classify findings as Critical, Important, or Recommendation. Fix only Critical
or Important findings. Add an observed RED regression, apply the smallest fix,
rerun the affected focused gate, and rereview once. Do not restart green work or
perform recommendation-driven churn.

- [ ] **Step 6: Run one stabilized full local gate**

Run:

```powershell
npm test
npx tsc --noEmit
supabase test db
npm run build
npm run qa:data-portability -- --exact
```

Then run the composed PM-P9 gate only after committing the runtime candidate so
its evidence can bind to an exact clean source:

```powershell
npm run qa:paid-mvp-stabilization -- --exact
```

Expected: all automated entries PASS and owner-assisted entries remain
`DEFERRED_OWNER_QA`.

- [ ] **Step 7: Reconcile ledgers and report**

Record exact SHA, test counts, module counts, build provenance/hashes,
screenshot paths and pixel sizes, download schema/filenames, request/write/error
ledgers, secret scans, database assertion count, review disposition, six honest
manual ceilings plus the new export owner checks, and hosted/rollback boundaries.

Mark the local implementation `LOCAL AUTOMATED PASS, HOSTED ACTIVATION AND OWNER QA PENDING`.

- [ ] **Step 8: Update program documents and plan checkboxes**

Record that the export blocker is locally implemented but not hosted. Do not
remove the launch blocker until the separately gated hosted proof and cumulative
owner QA are complete.

- [ ] **Step 9: Commit and push the local closeout**

```powershell
git add -- docs/superpowers/reports/TAB-TWO-DATA-PORTABILITY-QA.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/DECISIONS.md docs/superpowers/plans/2026-09-04-tab-two-data-portability.md
git commit -m "docs: record data portability local proof"
git push origin feat/aurora-2-observatory
```

Prove local HEAD, configured upstream, and remote branch equality. Confirm the
protected original and protected untracked paths remain intact.

---

### Task 7: Separate hosted sandbox activation gate

Do not execute this task under the current approval.

After local implementation and review are green, present one exact owner gate
that names:

1. Migration `20260904000900_account_data_export.sql` only.
2. Edge Function `account-export` only.
3. Existing secret names consumed, with no value displayed or copied.
4. Production descriptor change from `accountDataExportEnabled: false` to
   `true` only after hosted proof.
5. Maximum three export requests per test account and IP per hour.
6. Synthetic account metadata, provider metadata, devices, encrypted records,
   tombstones, and no-vault cases only.
7. Zero owner-authored notes, tasks, links, calendar content, or provider data
   in automated hosted fixtures.
8. Cross-account, stale-auth, no-entitlement, no-device, key, ciphertext,
   response-size, and secret-exclusion checks.
9. Cleanup of synthetic Auth users, accounts, provider connections, vaults,
   devices, records, rate limits, and audit events.
10. Function disable/undeploy and client-flag rollback sequence.
11. Forward-migration-only database rollback boundary.
12. No Supabase Pro, live Stripe, OAuth publication, merge, package, release,
    rollout, or Chrome Web Store authority.

After explicit owner approval, execute only that list, retain redacted hosted
evidence, enable the production descriptor, rerun the affected and composed
gates, update the QA report, commit, push, and leave owner manual QA in the
cumulative final checklist.
