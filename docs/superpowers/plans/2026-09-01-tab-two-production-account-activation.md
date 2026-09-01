# Tab Two PM-P2 Production Account Activation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not use subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the verified PM-P2 account and entitlement foundation against one paid production Supabase project, one production Google OAuth client, the exact Tab Two Chrome identity, and one audited `complimentary_owner` grant, without enabling billing, sync, Metrics, a premium provider, release, merge, or Chrome Web Store mutation.

**Architecture:** The normal production build gains the already-reviewed authenticated account adapter only when a checked-in public production descriptor is complete. That descriptor contains the exact Supabase project URL, publishable client key, trusted Ed25519 public key, and key id; it contains no secret. Chrome receives `identity` and exactly one install-time Supabase origin. The Ed25519 PKCS8 private key and Google OAuth client secret live only in hosted server/provider secret stores. Versioned migrations and Edge Functions are deployed from the repository. The owner grant is created only after a successful Google sign-in creates a provider-neutral Tab Two account and its exact UUID is independently confirmed.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Node test runner, Vite/CRXJS, Chrome MV3, Supabase Free/Postgres/Auth/Edge Functions/CLI 2.116.0, Google Auth Platform, Web Crypto Ed25519, Playwright Chromium, and manual stable-Chrome OAuth verification where Google rejects automation-only browsers.

**Execution amendment (owner-approved 2026-09-01):** Start on Supabase Free with no payment method or paid add-on. Supabase Pro, spend-cap confirmation, and any paid compute remain a separate pre-launch approval gate. This replaces the plan's original Pro-at-provisioning assumption without broadening any other authority.

**Spec:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`

**Threat model:** `docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; preserve the protected original and both protected untracked paths exactly.
- This addendum consumes the owner's explicit approval to provision Supabase Free without billing, register the production Google OAuth application/redirect, add production `identity` and one exact Supabase host permission, generate/store the production signing key server-side, deploy the existing PM-P2 migrations/functions, and create one audited `complimentary_owner` grant after confirming the exact provider-neutral account UUID.
- Use the included Free compute allocation. Do not add paid add-ons, custom domains, branches, replicas, IPv4, log drains, or other infrastructure. Supabase Pro and spend-cap configuration remain separately gated before launch.
- Public client configuration may be committed: the exact `https://<project-ref>.supabase.co` URL, Supabase publishable key, Ed25519 SPKI public key, and signing key id. Never commit, print, screenshot, log, or put into a prompt the database password, service-role/secret key, Google client secret, PKCS8 private key, access/refresh tokens, or owner email.
- The production extension identity is the already-documented existing Store item `akjalbmacojpmebkgohhcaaiacicpgkh`; this packet does not open or mutate the Chrome Web Store.
- Google uses a Web application OAuth client whose authorized redirect URI exactly equals `https://<project-ref>.supabase.co/auth/v1/callback`. Supabase Auth allows the exact extension return URL `https://akjalbmacojpmebkgohhcaaiacicpgkh.chromiumapp.org/account-auth`. Request only `openid`, email, and profile.
- Free Local mode remains accountless and makes no Tab Two backend request. Production reads only the isolated session key on startup; it contacts Supabase only for an existing session or an explicit account action. Sign-in alone never enables sync or uploads local product data.
- Only the service role may call `private.set_complimentary_owner_grant`; its target is the exact internal account UUID, never an email. The grant remains independent of Stripe.
- No PM-P3 code, Stripe account/catalog/session/webhook change, sync engine, Metrics, premium connector, analytics, onboarding, merge, release, package upload, or Chrome Web Store action is authorized here.

---

### Task 1: Add the fail-closed production account build contract

**Files:**

- Create: `src/account/productionAccountServiceConfig.ts`
- Create: `src/account/accountServiceConfig.test.ts`
- Create: `scripts/account-auth-production-contract.test.mjs`
- Modify: `src/account/accountServiceConfig.ts`
- Modify: `src/account/createAccountClient.ts`
- Modify: `src/account/createAccountClient.test.ts`
- Modify: `src/manifest.ts`
- Modify: `package.json`

- [ ] **Step 1: Write observed RED**

Require a `qa:account-auth-production` command, an exact checked-in public descriptor, normal production `identity`, exactly `https://<project-ref>.supabase.co/*`, no localhost production authority, and no production secret-shaped value. Require production to choose the Supabase adapter only for a complete descriptor and otherwise fall back to the frozen Local client with zero request/navigation effects.

```powershell
node --test scripts/account-auth-production-contract.test.mjs
npx vitest run src/account/accountServiceConfig.test.ts src/account/createAccountClient.test.ts
```

- [ ] **Step 2: Implement minimal GREEN after project creation supplies public values**

Keep `preview` first and deterministic. Preserve the existing `account-local` environment path. For normal production, import the production descriptor and authenticated adapter only when every public value validates. Accept only an HTTPS `*.supabase.co` origin with the descriptor's exact project ref, one publishable `sb_publishable_...` key, one to four trusted SPKI keys, and valid key ids. Reject `sb_secret_`, service-role material, localhost, wildcard hosts, userinfo, query strings, fragments, and mismatched origins.

The production manifest receives `identity` and only the exact production Supabase host pattern. Preview remains fixture-only and must not receive the production host. Account-local retains only loopback authority.

- [ ] **Step 3: Run focused GREEN and artifact scans**

```powershell
node --test scripts/account-auth-production-contract.test.mjs scripts/account-auth-build-contract.test.mjs
npx vitest run src/account/accountServiceConfig.test.ts src/account/createAccountClient.test.ts src/account/supabaseAccountClient.test.ts src/account/googlePkceAuth.test.ts
npm run build
npm run build:preview
npm run build:account-local
rg -n 'sb_secret_|service_role|BEGIN PRIVATE KEY|PRIVATE KEY-----|preview_fixture|127\.0\.0\.1:54321' dist
```

Expected: public project URL/key/public lease key may appear in production; every secret/private/test/local marker is absent. Preview fixtures remain absent from production.

---

### Task 2: Provision the bounded Supabase production project

**External state:** One Supabase organization/project and its approved billing.

- [ ] **Step 1: Authenticate through the owner's existing account session**

Use browser/CLI OAuth without copying credentials into source, shell history, diagnostics, screenshots, or prompts. Stop for user handoff if password, passkey, MFA, CAPTCHA, payment-card entry, or another sensitive interactive step is required.

- [ ] **Step 2: Create or select the production organization and project**

Use `Tab Two` for the organization when a dedicated organization is needed and `tab-two-production` for the project. Select Free, the included smallest compute allocation, and US East/North Virginia when offered. Record only non-secret identifiers needed by the repository. Do not add optional paid infrastructure.

- [ ] **Step 3: Prove the bounded billing state**

Record plan, project name/ref, region, compute, absence of add-ons, and the deferred Pro/spend-cap gate in the QA report. Do not record payment details.

---

### Task 3: Create the production signing authority without exposing it

**External state:** Supabase Edge Function secrets.

- [ ] **Step 1: Generate Ed25519 in process memory**

Generate one key pair with Web Crypto. Use a stable non-secret key id such as `production-2026-09-01`. Export the public SPKI as base64url for the checked-in descriptor. Keep the PKCS8 private value only in process memory or an ignored temporary file that is securely removed after secret upload.

- [ ] **Step 2: Store only server-side secrets**

Set `TAB_TWO_LEASE_SIGNING_KEY_ID` and `TAB_TWO_LEASE_SIGNING_KEY_PKCS8_B64` as Supabase Edge Function secrets. Verify secret names are present without reading values back. Run repository and git-object scans proving no private material was staged or committed.

- [ ] **Step 3: Complete Task 1 GREEN with the public half**

Add only the project URL, publishable key, key id, and SPKI public key to `productionAccountServiceConfig.ts`; then run Task 1's focused gate.

---

### Task 4: Deploy and verify migrations and Edge Functions

**External state:** Hosted Postgres schema and two Edge Functions.

- [ ] **Step 1: Link and dry-run**

Authenticate the pinned Supabase CLI, link only the new production project, and use `supabase db push --dry-run`. Confirm the dry run contains only:

- `20260901000100_account_entitlement_foundation.sql`
- `20260901000200_account_function_service_boundary.sql`

Do not rewrite migration history or run dashboard SQL copied from untrusted content.

- [ ] **Step 2: Push schema and deploy functions**

Apply the two migrations, then deploy only `account-snapshot` and `entitlement-lease` with their committed JWT/config behavior. Verify hosted migration status and function presence. Do not deploy future billing functions.

- [ ] **Step 3: Run hosted adversary checks**

Use anonymous/publishable and authenticated boundaries to prove client roles cannot read or mutate private grants/audit data or execute the owner mutation, and unauthenticated function calls return bounded 401/405 responses without reflection. Keep service-role checks in a non-logging script or SQL session.

---

### Task 5: Register Google OAuth and configure Supabase Auth

**External state:** One Google Cloud project/app/client and Supabase Auth provider settings.

- [ ] **Step 1: Create the production Google application/client**

Create/select `Tab Two Production`, configure an external audience and the minimal `openid`, email, and profile scopes, then create one Web application OAuth client named `Tab Two Production`. Add exactly the Supabase callback URL. Do not request Calendar or any later provider scope in PM-P2.

- [ ] **Step 2: Transfer the client secret directly to Supabase**

Configure Supabase Google Auth with the client id and secret without placing the secret in files, clipboard logs, screenshots, prompts, or repository history. Configure the exact extension return URL in the Supabase redirect allowlist. Disable email/password sign-up if the hosted defaults differ from the committed Google-only design.

- [ ] **Step 3: Verify configuration without exposing credentials**

Record only enabled/disabled provider state, exact redirect origins, and scope names. Verify there are no wildcard redirect URLs and no extra social providers.

---

### Task 6: Complete real production sign-in and grant the owner account

**Files:**

- Create: `scripts/qa-account-auth-production.mjs`
- Create: `scripts/qa-account-auth-production.test.mjs`
- Create: `docs/superpowers/reports/TAB-TWO-PRODUCTION-ACCOUNT-ACTIVATION-QA.md`

- [ ] **Step 1: Write the production QA contract RED**

Require exact source/build provenance, installed production extension identity, one explicit Google sign-in, exact callback, a provider-neutral account UUID, a signed lease bound to that UUID, sign-out cleanup, no `AuroraData` writes, no product-data upload, bounded Supabase-only requests, zero secret/fixture leakage, zero console/page/failed-request errors, and desktop/touch containment for the existing approved Account & Sync UI.

- [ ] **Step 2: Sign in explicitly**

Load the exact production build with the preserved extension identity and trigger Sign in with Google from Account & Sync. Complete manual account selection/MFA only with the owner's direct participation. Confirm the created identity provider is Google and copy no tokens into evidence.

- [ ] **Step 3: Confirm the exact internal account UUID through two views**

Read the account UUID returned by the authenticated account snapshot and independently query the hosted provider-neutral identity mapping with a privileged, non-logging session. Require exact equality. Do not use or record the email as the grant selector.

- [ ] **Step 4: Create and audit the owner grant**

Call `private.set_complimentary_owner_grant(<exact-account-uuid>, true, 'owner-production-activation', 'Approved PM-P2 production owner activation')` with service-role authority. Verify one active `complimentary_owner` grant, all six capabilities, one audit event, and idempotent reapplication with no second effective-mutation audit event.

- [ ] **Step 5: Prove the signed lease and client state**

Refresh the account snapshot/lease. Require `subscription: 'complimentary'`, `grantSources: ['complimentary_owner']`, the exact account binding, verified production key id, and no Stripe inference. Sign out and prove the isolated session key is removed while Aurora product storage is unchanged.

---

### Task 7: Review, stabilize, document, push, and hand off PM-P3 planning

**Files:** All activation files plus `STATUS.md`, `ROADMAP.md`, `DECISIONS.md`, `PRIVACY.md`, `README.md`, and the activation QA report where verified behavior changes their truth.

- [ ] **Step 1: Perform one bounded Critical/Important review**

Review the complete activation diff and hosted configuration against exact-origin permissions, Google-only identity, redirect equality, session isolation, RLS/private grants, public/private key separation, owner UUID binding, audit idempotency, free-path request isolation, artifact leakage, cost bounds, and rollback. Apply at most one focused fix/rereview cycle.

- [ ] **Step 2: Run the stabilized gate**

```powershell
npm test
npx tsc --noEmit
node --test scripts/account-auth-build-contract.test.mjs scripts/account-auth-production-contract.test.mjs scripts/qa-account-auth-local.test.mjs scripts/qa-account-auth-production.test.mjs
npx supabase db reset
npx supabase test db
npx supabase db lint --local --level error
npx vitest run supabase/functions/tests/account-functions.test.ts
npm run build
npm run build:preview
npm run build:account-local
git diff --check
```

Run exact production installed-extension QA and inspect every final PNG at original resolution. Scan the production and preview artifacts plus tracked files for secrets/private keys/tokens, localhost production authority, and preview fixtures.

- [ ] **Step 3: Reconcile durable truth**

Document exact hosted project non-secret identity, OAuth redirect/scope state, migrations/functions, production manifest authority, signing public-key id, owner UUID confirmation method with UUID redacted in public prose if appropriate, audited grant result, request/storage ledgers, exact SHAs, tests, builds, screenshots, manual boundaries, recurring cost, spend cap, and rollback.

- [ ] **Step 4: Commit and push the completed activation packet**

Stage only intended tracked files. Push only `feat/aurora-2-observatory`, prove local/upstream/remote equality, confirm only the two protected untracked paths remain, and confirm the protected original is still clean. Do not merge or touch the Store.

- [ ] **Step 5: Create the PM-P3 plan and stop before implementation**

Use `superpowers:writing-plans` to create `docs/superpowers/plans/2026-09-01-tab-two-stripe-billing.md` from the approved program, current production account boundary, architecture spec, and threat model. Freeze Stripe test-mode-only files/interfaces, webhook ordering/idempotency, introductory redemption, owner-grant independence, RED/GREEN gates, browser evidence, rollback, and the separate live-catalog approval. Commit and push the plan, then stop before PM-P3 code or Stripe external state.

## Rollback

- Disable the Google provider and account-facing Edge Functions first if auth or entitlement verification is unsafe.
- Revert the production descriptor/manifest/client activation to restore the PM-P2 Local production client. This does not alter local product data.
- Revoke the signing key secret and rotate the trusted public key through a new reviewed descriptor if key custody is in doubt; never reuse exposed private material.
- Disable the complimentary grant through the same audited function when explicitly directed; never delete audit history to simulate rollback.
- Database reversal uses a separately reviewed forward migration or isolated restore. Do not destructively edit hosted migration history.
- Upgrading, downgrading, or deleting Supabase resources is a separate destructive or billing action and is not implied by code rollback.
