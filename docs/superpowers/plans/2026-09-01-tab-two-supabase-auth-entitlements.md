# Tab Two Supabase Auth and Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not use subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a locally testable Supabase account foundation, explicit Google PKCE client flow, isolated session persistence, and Ed25519-signed account-bound entitlements while production remains Local until its named permission, provisioning, OAuth, and secret gates are separately approved.

**Architecture:** Versioned SQL owns provider-neutral accounts, Google identity links, server-only grants, and audit records behind default-deny grants and Row Level Security. Local Edge Functions authenticate the Supabase user, calculate effective grants, and sign a canonical capability lease with an injected Ed25519 private key; the extension stores only the minimum Supabase session through one dedicated adapter and trusts capabilities only after verifying the envelope with an injected public key. The authenticated client is compiled only into an `account-local` build until the production project origin, Google registration, Chrome `identity` permission, and production signing key are explicitly approved.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Testing Library, Playwright Chromium, Chrome MV3, Vite, `@supabase/supabase-js` 2.112.4, Supabase CLI 2.116.0, local Supabase/Postgres, pgTAP, Deno Edge Functions, Web Crypto Ed25519.

**Spec:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`

**Threat model:** `docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; preserve the protected original and the two protected untracked paths exactly.
- Keep every current local feature and all 15 current connectors free and independent of account or capability state.
- Free Local mode performs no Supabase, entitlement, billing, or sync request and creates no account row.
- PM-P2 adds no sync engine, billing, Metrics, premium connector, analytics, onboarding, deployment, release, merge, or Store behavior.
- Never run `supabase login`, `supabase link`, `supabase db push`, or `supabase functions deploy` in this packet.
- Never create a paid Supabase project, production Google OAuth registration, production secret, real owner grant, or production signing key without a new exact approval.
- Before the local installed-extension auth witness, stop and obtain explicit approval to add `identity` and `http://127.0.0.1/*` only to the `account-local` manifest. Production and preview manifests must remain permission-identical to PM-P1. Local Docker/Supabase and ephemeral test keys do not create production authority and may be used before that gate.
- Store Supabase access and refresh tokens only under `tab-two:account-session:v1` through the typed account session adapter. The key stays outside `AuroraData`, JSON backup, sync, diagnostics, logs, screenshots, and UI.
- The only grant sources accepted from a production-capable signed lease are `stripe` and `complimentary_owner`. `preview_fixture` never enters the signed wire format.
- A real owner grant is created later only after the exact provider-neutral account UUID is confirmed. No email, build-user, local flag, preview symbol, or Stripe state grants owner access.
- Use the existing Account & Sync visual treatment. No new visual gate is needed unless implementation changes layout, copy hierarchy, or interaction design.
- This packet ends with one bounded Critical/Important review, at most one focused fix/rereview, one stabilized full gate, exact production/account-local builds, artifact scans, local Supabase tests, installed Chromium after its permission gate, original-resolution inspection, ledger reconciliation, a scoped push, and SHA equality proof.

---

### Task 1: Pin the local Supabase toolchain and fail-closed build boundary

**Files:**

- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `supabase/config.toml`
- Create: `scripts/account-auth-build-contract.test.mjs`

**Interfaces:**

- Consumes: Node 24 and Docker Desktop already installed on the workstation.
- Produces: reproducible local CLI commands and an `account-local` build mode that has no production effect.

- [x] **Step 1: Write the failing build-boundary contract**

Create `scripts/account-auth-build-contract.test.mjs` with Node tests that read source files and require all of the following:

```js
assert.match(packageJson.scripts['build:account-local'], /--mode=account-local/)
assert.equal(packageJson.dependencies['@supabase/supabase-js'], '2.112.4')
assert.equal(packageJson.devDependencies.supabase, '2.116.0')
assert.match(gitignore, /^\.env\.account-local$/m)
assert.match(gitignore, /^supabase\/\.temp\/$/m)
assert.doesNotMatch(manifestSource, /supabase\.co/)
assert.doesNotMatch(manifestSource, /sb_secret_/)
```

Also require `supabase/config.toml` to use project id `tab-two-local`, ports 54321/54322, Postgres 17, Google external auth disabled, sign-up disabled, and no remote project reference.

- [x] **Step 2: Run RED**

```powershell
node --test scripts/account-auth-build-contract.test.mjs
```

Expected: FAIL because the dependencies, script, ignore rules, and local configuration do not exist.

- [x] **Step 3: Add exact dependencies and local configuration**

Run:

```powershell
npm install --save-exact @supabase/supabase-js@2.112.4
npm install --save-dev --save-exact supabase@2.116.0
```

Add these scripts:

```json
"build:account-local": "node scripts/build.mjs --mode=account-local",
"test:supabase-local": "supabase test db",
"qa:account-auth-local": "node scripts/qa-account-auth-local.mjs"
```

Append these ignore rules:

```gitignore
.env.account-local
supabase/.temp/
supabase/.branches/
```

Create `supabase/config.toml` with this security-relevant configuration:

```toml
project_id = "tab-two-local"

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]

[db]
port = 54322
shadow_port = 54320
major_version = 17

[auth]
enabled = true
site_url = "https://tab-two.invalid"
additional_redirect_urls = []
enable_signup = false

[auth.external.google]
enabled = false
client_id = ""
secret = ""
```

The committed local configuration never contains a Google client id, Google secret, project ref, service-role key, signing key, or owner identity.

- [x] **Step 4: Audit the dependency change and run GREEN**

```powershell
npm audit
npm ls @supabase/supabase-js supabase
node --test scripts/account-auth-build-contract.test.mjs
```

Expected: dependency tree is valid, the audit has no unresolved supported high/critical finding, and the contract passes.

- [x] **Step 5: Commit**

```powershell
git add .gitignore package.json package-lock.json supabase/config.toml scripts/account-auth-build-contract.test.mjs
git commit -m 'build: add local Supabase account toolchain'
```

### Task 2: Create provider-neutral accounts, server-only grants, and audited owner mutation

**Files:**

- Create: `supabase/migrations/20260901000100_account_entitlement_foundation.sql`
- Create: `supabase/tests/database/account_entitlements_rls.test.sql`

**Interfaces:**

- Consumes: local Supabase Postgres and `auth.users`.
- Produces: `public.tab_two_accounts`, `public.tab_two_identities`, private grants/audits, `private.current_account_id()`, `private.effective_entitlement()`, and `private.set_complimentary_owner_grant()`.

- [x] **Step 1: Write the failing pgTAP adversary matrix**

Create tests that begin a transaction, set `request.jwt.claim.sub` for two Google-auth test users, and prove:

```sql
select plan(34);
select ok((select relrowsecurity from pg_class where oid = 'public.tab_two_accounts'::regclass), 'accounts has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.tab_two_identities'::regclass), 'identities has RLS');
select throws_ok('select * from private.account_grants', '42501', null, 'authenticated cannot read grants');
select throws_ok('select private.set_complimentary_owner_grant(gen_random_uuid(), true, ''test'', ''test'')', '42501', null, 'authenticated cannot mutate owner grants');
```

Cover anonymous and authenticated select/insert/update/delete, same-account reads, cross-account reads, provider constraints, duplicate identity subjects, direct grant mutation, privileged-function execution, expired/revoked grants, capability union, idempotent owner enable/disable, and one audit row per effective mutation.

- [x] **Step 2: Start local Supabase and observe RED**

Start Docker Desktop if its engine is not running, then run:

```powershell
npx supabase start
npx supabase db reset
npx supabase test db
```

Expected: the database tests fail because the migration objects do not exist. Do not log in, link a project, or contact a hosted Supabase project.

- [x] **Step 3: Implement the migration**

Create these enum domains in schema `private`:

```sql
create type private.premium_capability as enum (
  'encrypted_sync', 'multi_account', 'metrics_history',
  'google_calendar', 'microsoft_calendar', 'strava'
);
create type private.grant_source as enum ('stripe', 'complimentary_owner');
```

Create provider-neutral `public.tab_two_accounts` and a separate `public.tab_two_identities` mapping with `auth_user_id`, provider constrained to `google`, provider subject, email, and display name. A security-definer trigger on `auth.users` creates one account and identity only when `raw_app_meta_data.provider = 'google'`. The account id is generated independently from `auth.users.id`.

Create private tables:

```sql
private.account_grants(
  id uuid primary key,
  account_id uuid not null,
  source private.grant_source not null,
  capabilities private.premium_capability[] not null,
  starts_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  unique(account_id, source)
)

private.entitlement_audit_events(
  id uuid primary key,
  account_id uuid not null,
  event_type text not null,
  actor text not null,
  reason text not null,
  occurred_at timestamptz not null,
  details jsonb not null
)
```

Enable RLS on both public tables, revoke all from `anon` and `authenticated`, then grant only `select` to `authenticated` with policies bound directly to `auth.uid()`. Keep `private.current_account_id()` as a service-role helper so client roles retain no schema or function access to `private`. Revoke all schema/table/function access to `private` from client roles. `private.set_complimentary_owner_grant(target uuid, enabled boolean, actor text, reason text)` is security definer, executable only by `service_role`, rejects blank actor/reason, uses the exact account UUID, grants all six capabilities, and writes an audit event only when effective state changes. It never accepts email.

- [x] **Step 4: Run GREEN and local restore rehearsal**

```powershell
npx supabase db reset
npx supabase test db
npx supabase db lint --local --level error
npx supabase db dump --local --schema public,private --file .superpowers/pm-p2-schema.sql
```

Reset the local database once more and rerun the tests to prove migrations recreate the schema from zero. The schema dump is local scratch and is never staged.

- [x] **Step 5: Commit**

```powershell
git add supabase/migrations/20260901000100_account_entitlement_foundation.sql supabase/tests/database/account_entitlements_rls.test.sql
git commit -m 'feat: add default-deny account entitlement schema'
```

### Task 3: Define and verify canonical Ed25519 capability leases

**Files:**

- Create: `supabase/functions/_shared/lease.ts`
- Create: `src/account/entitlementLease.ts`
- Create: `src/account/entitlementLease.test.ts`
- Modify: `src/account/types.ts`
- Modify: `src/account/capabilities.test.ts`
- Modify: `src/account/previewAccountClient.ts`

**Interfaces:**

- Consumes: Web Crypto `Ed25519` and the PM-P1 capability vocabulary.
- Produces: `SignedEntitlementLeaseV1`, `signLeaseV1()`, and `verifyEntitlementLeaseV1()` returning `VerifiedEntitlementLease | null`.

- [x] **Step 1: Write failing tamper and account-binding tests**

Generate an Ed25519 key pair in each test and cover valid verification, payload mutation, signature mutation, unknown key id, wrong account, future issue time, expiry boundary, duplicate/unknown capabilities, unsupported version/algorithm, invalid base64url, non-canonical payload, and a `preview_fixture` grant source. Include this acceptance shape:

```ts
const verified = await verifyEntitlementLeaseV1(envelope, {
  expectedAccountId: 'account-a',
  now,
  trustedKeys: { 'local-test-key': publicKey },
})
expect(verified).toEqual(expect.objectContaining({
  verification: 'verified',
  leaseVersion: 1,
  accountId: 'account-a',
  grantSources: ['complimentary_owner'],
}))
```

- [x] **Step 2: Run RED**

```powershell
npx vitest run src/account/entitlementLease.test.ts src/account/capabilities.test.ts
```

- [x] **Step 3: Implement the exact wire contract**

Use a base64url UTF-8 canonical payload and signature envelope:

```ts
export interface LeasePayloadV1 {
  version: 1
  leaseId: string
  accountId: string
  capabilities: readonly PremiumCapability[]
  grantSources: readonly ('stripe' | 'complimentary_owner')[]
  issuedAt: number
  expiresAt: number
}

export interface SignedEntitlementLeaseV1 {
  algorithm: 'Ed25519'
  keyId: string
  payload: string
  signature: string
}
```

Canonical JSON uses this exact property order, lexically sorted unique capability and grant arrays, integer epoch milliseconds, and no unknown property. Verification imports an SPKI public key, verifies before trusting fields, reparses and canonicalizes the payload byte-for-byte, checks account binding and time bounds, and only then returns the existing verified lease plus `leaseVersion: 1` and `keyId`. Never accept `preview_fixture` on the signed wire.

- [x] **Step 4: Run GREEN and commit**

```powershell
npx vitest run src/account/entitlementLease.test.ts src/account/capabilities.test.ts
git add supabase/functions/_shared/lease.ts src/account/entitlementLease.ts src/account/entitlementLease.test.ts src/account/types.ts src/account/capabilities.test.ts src/account/previewAccountClient.ts
git commit -m 'feat: verify signed account entitlement leases'
```

### Task 4: Issue local account snapshots and signed leases from Edge Functions

**Files:**

- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/_shared/requestAuth.ts`
- Create: `supabase/functions/_shared/accountHandlers.ts`
- Create: `supabase/functions/account-snapshot/index.ts`
- Create: `supabase/functions/entitlement-lease/index.ts`
- Create: `supabase/functions/tests/account-functions.test.ts`

**Interfaces:**

- Consumes: Supabase user JWT, service-role access confined to the function runtime, `private.effective_entitlement()`, and an injected PKCS8 Ed25519 key.
- Produces: authenticated `GET /account-snapshot` and `POST /entitlement-lease` local function responses with bounded safe errors.

- [ ] **Step 1: Write failing Deno function-core tests**

Test exported request handlers with injected auth, repository, clock, UUID, and signer boundaries. Require 401 for missing/invalid bearer tokens; 403 for an auth user without a Google-linked Tab Two account; 405 for wrong methods; bounded JSON and no reflected token/payload on failures; an account snapshot containing only account id, email, display name, and subscription summary; a 30-day lease; sorted capability union; `complimentary_owner` independent of missing/expired Stripe state; and no lease when no active grant exists.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run supabase/functions/tests/account-functions.test.ts
```

Expected: FAIL because the pure request handlers do not exist. The tests import `accountHandlers.ts` and inject every environment, auth, repository, clock, UUID, and signer dependency, so no function server or secret is required for this unit boundary.

- [ ] **Step 3: Implement narrow handlers**

`requestAuth.ts` extracts one bearer token, calls Supabase Auth `getUser(token)`, rejects non-Google identity metadata, and returns only the auth user id. It never logs authorization headers or error bodies. The account repository maps that auth id to the provider-neutral account id and never accepts a client-supplied account id. `accountHandlers.ts` contains the runtime-neutral injected handlers; each `index.ts` is only the Deno environment and `Deno.serve` adapter.

`entitlement-lease` obtains effective grants for the mapped account, sets `issuedAt` from the server clock, caps `expiresAt` at 30 days and the earliest active grant expiry, creates a random lease id, signs with `TAB_TWO_LEASE_SIGNING_KEY_PKCS8_B64`, and returns the envelope. The key id comes from `TAB_TWO_LEASE_SIGNING_KEY_ID`. Both are required environment values and never receive defaults.

Every response uses fixed error codes only:

```ts
type AccountFunctionError =
  | 'method_not_allowed'
  | 'authentication_required'
  | 'account_not_found'
  | 'entitlement_unavailable'
  | 'service_unavailable'
```

- [ ] **Step 4: Run GREEN and secret scans**

```powershell
npx vitest run supabase/functions/tests/account-functions.test.ts
rg -n 'BEGIN PRIVATE KEY|sb_secret_|service_role.*=' supabase src scripts
```

Expected: tests pass and the scan finds no committed secret material or assigned service-role value.

- [ ] **Step 5: Commit**

```powershell
git add supabase/functions/_shared/http.ts supabase/functions/_shared/requestAuth.ts supabase/functions/_shared/accountHandlers.ts supabase/functions/account-snapshot/index.ts supabase/functions/entitlement-lease/index.ts supabase/functions/tests/account-functions.test.ts
git commit -m 'feat: issue local signed entitlement leases'
```

### Task 5: Isolate the minimum Supabase session from product storage and exports

**Files:**

- Create: `src/account/sessionStorage.ts`
- Create: `src/account/sessionStorage.test.ts`
- Modify: `src/privacy/dataFlows.ts`
- Modify: `src/privacy/dataFlows.test.ts`
- Modify: `src/lib/backup.test.ts`

**Interfaces:**

- Consumes: `chrome.storage.local` directly through an injected four-method boundary.
- Produces: `AccountSessionStore` for `tab-two:account-session:v1`; it never touches `AuroraStorage`.

- [ ] **Step 1: Write failing storage and redaction tests**

Require absent, valid, malformed, expired, and unknown-version reads; write-then-read; clear; fail-closed cleanup; no token text in thrown errors; subscription propagation through `chrome.storage.onChanged`; and exact exclusion from `serializeBackup`, privacy backup inventory, preview fixtures, and diagnostic-safe values.

Use this stored shape only:

```ts
export interface StoredAccountSessionV1 {
  version: 1
  accessToken: string
  refreshToken: string
  expiresAt: number
  tokenType: 'bearer'
}
```

- [ ] **Step 2: Run RED**

```powershell
npx vitest run src/account/sessionStorage.test.ts src/privacy/dataFlows.test.ts src/lib/backup.test.ts
```

- [ ] **Step 3: Implement the typed adapter**

The adapter validates every field and length, rejects unknown keys, clears malformed/expired state, serializes only the exact v1 object, and emits fixed error codes. Extend `TransmissionBoundary` with `tab-two-account-service`, then add an `OTHER_LOCAL_DATA_FLOWS.accountSession` entry classified as authentication, excluded from JSON backup/sync/diagnostics, and transmitted only to Tab Two's configured Supabase Auth boundary when the user signs in or refreshes an existing session. Do not add the key to `AuroraData`, `defaults()`, migrations, or backup envelopes.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npx vitest run src/account/sessionStorage.test.ts src/privacy/dataFlows.test.ts src/lib/backup.test.ts
git add src/account/sessionStorage.ts src/account/sessionStorage.test.ts src/privacy/dataFlows.ts src/privacy/dataFlows.test.ts src/lib/backup.test.ts
git commit -m 'feat: isolate paid account sessions'
```

### Task 6: Build the explicit Google PKCE launcher behind injection

**Files:**

- Create: `src/account/googlePkceAuth.ts`
- Create: `src/account/googlePkceAuth.test.ts`
- Modify: `src/vite-env.d.ts`

**Interfaces:**

- Consumes: an injected Supabase auth client, `chrome.identity.getRedirectURL`, and `chrome.identity.launchWebAuthFlow`.
- Produces: `GooglePkceAuth.begin()` and `GooglePkceAuth.reauthenticate()` without changing the manifest yet.

- [ ] **Step 1: Write failing PKCE/state/callback tests**

Require one user click to initiate Google only, `flowType: 'pkce'`, `skipBrowserRedirect: true`, exact redirect origin/path, cryptographically generated per-attempt correlation, the Supabase flow id passed to `exchangeCodeForSession`, single-use callback consumption, cancellation, provider error, redirect substitution, missing/duplicate code, replay, overlapping-flow isolation, and bounded errors with no URL/query/token rendering.

The injected browser boundary is exact:

```ts
export interface IdentityWebAuth {
  getRedirectURL(path: string): string
  launchWebAuthFlow(details: { url: string; interactive: true }): Promise<string | undefined>
}
```

- [ ] **Step 2: Run RED**

```powershell
npx vitest run src/account/googlePkceAuth.test.ts
```

- [ ] **Step 3: Implement the minimal launcher**

Create Supabase with `flowType: 'pkce'`, `persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false`, `experimental.appendPkceFlowIdToRedirects: true`, and an in-memory PKCE verifier store. Call only provider `google`. Retain the returned flow id in a per-attempt map, require the callback URL to exactly match `getRedirectURL('account-auth')` by origin and pathname, require its single `sb_flow_id` to match the retained flow id, accept one `code`, pass `{ flowId }` to `exchangeCodeForSession`, and delete the attempt before returning. Supabase Auth owns provider-state validation and the PKCE code verifier; Tab Two adds exact callback validation and single-use flow correlation.

- [ ] **Step 4: Run GREEN without adding a permission**

```powershell
npx vitest run src/account/googlePkceAuth.test.ts
git diff -- src/manifest.ts
```

Expected: tests pass and the manifest has no change.

- [ ] **Step 5: Commit**

```powershell
git add src/account/googlePkceAuth.ts src/account/googlePkceAuth.test.ts src/vite-env.d.ts
git commit -m 'feat: define explicit Google PKCE account flow'
```

### Task 7: Replace Local mode only in the account-local build

**Files:**

- Create: `src/account/accountServiceConfig.ts`
- Create: `src/account/supabaseAccountClient.ts`
- Create: `src/account/supabaseAccountClient.test.ts`
- Modify: `src/account/createAccountClient.ts`
- Modify: `src/account/createAccountClient.test.ts`
- Modify: `src/account/types.ts`
- Modify: `src/settings/sections/AccountSync.test.tsx`

**Interfaces:**

- Consumes: `AccountSessionStore`, `GooglePkceAuth`, local account/lease functions, and trusted Ed25519 public keys.
- Produces: an `AccountClient` that is reachable only when `MODE === 'account-local'` and its complete non-secret configuration validates.

- [ ] **Step 1: Write failing authenticated-client tests**

Cover: no session means zero network until Sign in; sign-in stores only the validated Supabase session; sign-in alone leaves sync disabled and uploads no product data; hydration validates the current user, fetches account snapshot and signed lease, verifies account binding before publishing signed-in state, refreshes an expiring session under one Web Lock, handles offline with the last still-valid verified lease, rejects tampered/expired/wrong-account leases, clears invalid/revoked sessions, signs out remotely then clears locally even if remote logout fails, and never calls any `AuroraStorage` or current-free capability path.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run src/account/supabaseAccountClient.test.ts src/account/createAccountClient.test.ts src/settings/sections/AccountSync.test.tsx
```

- [ ] **Step 3: Implement fail-closed configuration and client state**

`readAccountServiceConfig()` accepts only:

```ts
interface AccountServiceConfig {
  supabaseUrl: 'http://127.0.0.1:54321'
  publishableKey: string
  trustedLeaseKeys: Readonly<Record<string, string>>
}
```

It returns `null` outside `account-local` or when any value is missing/malformed. `createAccountClient()` keeps preview behavior first, dynamically imports `supabaseAccountClient` only for a valid `account-local` configuration, and otherwise returns the frozen Local client. Production must tree-shake the Supabase client and authenticated adapter.

Only `beginSignIn` and `signOut` become active in PM-P2. Sync, billing, device, vault, and account-deletion actions remain fixed unavailable operations for their later packets and must make no request. Subscription is `complimentary` only for a verified complimentary lease, otherwise `none`; no Stripe lifecycle is inferred in PM-P2.

- [ ] **Step 4: Run GREEN and production isolation scan**

```powershell
npx vitest run src/account/supabaseAccountClient.test.ts src/account/createAccountClient.test.ts src/settings/sections/AccountSync.test.tsx src/account/AccountContext.test.tsx
npm run build
rg -n 'tab-two:account-session:v1|launchWebAuthFlow|127\.0\.0\.1:54321|TAB_TWO_LEASE_SIGNING|sb_secret_|preview_fixture' dist
```

Expected: tests/build pass and `rg` exits 1. Production remains the PM-P1 Local client with zero account request or storage access.

- [ ] **Step 5: Commit**

```powershell
git add src/account/accountServiceConfig.ts src/account/supabaseAccountClient.ts src/account/supabaseAccountClient.test.ts src/account/createAccountClient.ts src/account/createAccountClient.test.ts src/account/types.ts src/settings/sections/AccountSync.test.tsx
git commit -m 'feat: connect the local account client boundary'
```

### Task 8: Obtain the local-only Chrome permission gate and add exact Chromium proof

**Files:**

- Modify after approval only: `src/manifest.ts`
- Create after approval only: `scripts/qa-account-auth-local.mjs`
- Create after approval only: `scripts/qa-account-auth-local.test.mjs`
- Create after approval only: `docs/superpowers/reports/TAB-TWO-SUPABASE-AUTH-ENTITLEMENTS-QA.md`

**Interfaces:**

- Consumes: local Supabase, an ephemeral test signing key, the `account-local` build, and a local mock OAuth redirect server.
- Produces: installed-extension evidence without a hosted project, production permission, production OAuth registration, or committed secret.

- [ ] **Step 1: Stop and request exact owner approval**

Request approval for only these local development changes:

1. Add `identity` to the `account-local` manifest only.
2. Add `http://127.0.0.1/*` host access to the `account-local` manifest only.

Explicitly state that production and preview manifests remain unchanged; no paid project, production Google application, real owner UUID/grant, production secret, deployment, merge, release, or Store action is included. Do not edit `src/manifest.ts` until approval is received.

- [ ] **Step 2: Write the failing harness contract after approval**

Require `--exact`, exact source/build provenance, production and account-local builds, local Supabase health, database/RLS tests, Edge Function tests, installed Chromium at 1600x900 and touch-enabled 768x812, one explicit sign-in action through `launchWebAuthFlow`, exact callback/replay rejection, signed owner-fixture lease bound to a generated local account UUID, sign-out cleanup, zero AuroraData writes, production fixture/secret/permission exclusion, bounded request allowlists, zero console/page/failed-request errors, and original-resolution judgments.

- [ ] **Step 3: Add the local-only manifest branch and QA harness**

In `src/manifest.ts`, add `identity` and `http://127.0.0.1/*` only when `env.mode === 'account-local'`. Production and preview arrays remain byte-for-byte at their PM-P1 authority. The harness generates the Ed25519 key pair in memory, writes any process bridge only under a temporary directory, obtains local publishable/service values from `npx supabase status -o json`, never prints them, and deletes the temporary directory on success or failure.

- [ ] **Step 4: Run contract GREEN and exact local proof**

```powershell
node --test scripts/qa-account-auth-local.test.mjs
npm run qa:account-auth-local -- --exact
```

Expected: local SQL, function, client, and browser gates pass; the production artifact contains neither `identity`, localhost host access, session/auth code, Supabase endpoints, private/test key material, nor preview fixtures.

- [ ] **Step 5: Inspect every final PNG at original resolution and commit**

Record PASS/FAIL for copy, focus, dialog restoration, overflow, clipping, overlap, and touch containment. Commit only after every retained screenshot passes:

```powershell
git add src/manifest.ts scripts/qa-account-auth-local.mjs scripts/qa-account-auth-local.test.mjs docs/superpowers/reports/TAB-TWO-SUPABASE-AUTH-ENTITLEMENTS-QA.md
git commit -m 'test: add local account authentication QA'
```

### Task 9: Review, stabilize, document, push, and stop before production authority

**Files:** All PM-P2 files only, plus `STATUS.md`, `ROADMAP.md`, `DECISIONS.md`, `PRIVACY.md`, `README.md`, and the PM-P2 QA report where verified behavior changes their truth.

**Interfaces:**

- Consumes: Tasks 1 through 8.
- Produces: one reviewed and pushed local PM-P2 checkpoint with production still Local and all hosted/production gates closed.

- [ ] **Step 1: Perform one bounded review**

Review the complete PM-P2 diff against account identity separation, Google-only entry, PKCE/callback/replay handling, session exclusion, signed-lease verification, owner-grant privilege/audit, RLS/grants, local-only manifest branching, production tree shaking, free-path isolation, safe errors/logs, and rollback. Only Critical or Important findings block. Apply at most one focused fix and rereview cycle.

- [ ] **Step 2: Run the single stabilized gate**

```powershell
npm test
npx tsc --noEmit
node --test scripts/account-auth-build-contract.test.mjs scripts/qa-account-auth-local.test.mjs
npx supabase db reset
npx supabase test db
npx supabase db lint --local --level error
npx vitest run supabase/functions/tests/account-functions.test.ts
git diff --check
```

- [ ] **Step 3: Build and scan exact provenance**

```powershell
npm run build
rg -n 'tab-two:account-session:v1|launchWebAuthFlow|127\.0\.0\.1:54321|TAB_TWO_LEASE_SIGNING|BEGIN PRIVATE KEY|sb_secret_|preview_fixture' dist
npm run qa:account-auth-local -- --exact
```

Expected: the production scan exits 1 and exact local evidence passes. Do not claim a real Google provider, hosted Supabase project, production owner grant, production permission, or deployment.

- [ ] **Step 4: Reconcile durable documentation**

Record exact test/build/evidence provenance. Update PRIVACY and README only to distinguish the locally implemented, production-disabled account foundation from shipped production behavior. Mark PM-P2 verified only as a local foundation; keep hosted Supabase, production Google OAuth, exact Supabase host authority, production signing key, real owner account UUID/grant, deployment, merge, release, and Store action as explicit gates before PM-P3.

- [ ] **Step 5: Commit, push, and prove boundaries**

```powershell
git add docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/DECISIONS.md docs/superpowers/reports/TAB-TWO-SUPABASE-AUTH-ENTITLEMENTS-QA.md PRIVACY.md README.md
git commit -m 'docs: checkpoint Tab Two PM-P2 local foundation'
git push origin feat/aurora-2-observatory
git rev-parse HEAD
git rev-parse '@{upstream}'
git ls-remote origin refs/heads/feat/aurora-2-observatory
git -C 'D:\DEV\Chrome plugin' status --short --branch
```

Expected: local, upstream, and remote SHAs match; only the two protected untracked paths remain; the protected original is clean. Stop before PM-P3 until the PM-P2 hosted/production gates are explicitly dispositioned. Do not merge or perform any Store action.
