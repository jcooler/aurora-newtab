# Tab Two PM-P3 Stripe Sandbox Billing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task. Do not use subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe sandbox-only Checkout, Customer Portal, webhook, billing-state, and Stripe-grant behavior without weakening the verified PM-P2 account boundary, changing any free feature, depending on browser return URLs for entitlement, or creating live Stripe state.

**Architecture:** The authenticated extension asks the existing Supabase account service for a server-selected Checkout or Customer Portal URL and opens Stripe's hosted surface in a normal browser tab. A signature-required, JWT-disabled webhook receives the unmodified request body, verifies the sandbox endpoint signature before parsing, retrieves the current authoritative Stripe object when event order could matter, and applies one normalized billing snapshot transactionally. Postgres records minimal sandbox customer/subscription identifiers, introductory-offer claims, and webhook idempotency metadata. The existing `private.account_grants` row for source `stripe` is the only billing-derived capability authority. The effective lease remains the union of `stripe` and `complimentary_owner`, so billing changes cannot remove owner access. Checkout and return pages never grant access; the extension refreshes the signed lease from Supabase.

**Current production boundary:** PM-P2 uses Supabase Free project `ovlobmvxtryitupxwylg`, Google-only explicit sign-in, the fixed extension identity `akjalbmacojpmebkgohhcaaiacicpgkh`, signing key id `production-2026-09-01`, and one audited complimentary owner grant. Free Local mode performs no account-service request. Supabase Pro remains a separate pre-launch approval gate.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Node test runner, Chrome MV3, Supabase Postgres/Edge Functions, Stripe Checkout, Stripe Customer Portal, Stripe webhooks, Stripe sandbox/test clocks, and a pinned server-only Stripe SDK selected during implementation review.

**Program:** `docs/superpowers/plans/2026-09-01-tab-two-paid-mvp-program.md`

**Spec:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`

**Threat model:** `docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md`

## Authority and hard stops

- This file is a planning deliverable only. Creating it authorizes no PM-P3 code, Stripe account or sandbox, product, price, portal configuration, webhook destination, secret, Supabase deployment, or payment.
- Begin implementation with local Supabase, fake Stripe gateways, and checked-in fixtures. Stop for explicit owner approval before authenticating Stripe CLI, accepting Managed Payments terms, creating sandbox catalog objects, saving any Stripe secret, deploying PM-P3 migrations/functions, or running a hosted Checkout.
- Stripe must remain sandbox/test mode. Reject every `livemode: true` object and event. Live products, prices, portal configuration, webhook destinations, API keys, Checkout, charges, refunds, disputes, and subscriptions require a separate live-catalog approval after PM-P3 is verified.
- Managed Payments remains public preview as of this plan. At implementation time, revalidate product eligibility, supported business location, API-version requirements, tax code, portal behavior, and account access using current official Stripe documentation. If Managed Payments is unavailable or ineligible, stop. Do not silently substitute standard Stripe, Lemon Squeezy, or another merchant-of-record model.
- Keep every current local feature and all 15 current connectors free. Billing failure must never gate or alter existing free behavior.
- Use only the existing production Supabase host authority. Add no Chrome permission, optional host, external domain, analytics, advertising, telemetry, or tracking.
- Never put a Stripe secret, webhook secret, card detail, session URL, payment method, raw webhook body, customer email, access token, or refresh token in the extension bundle, repository, logs, diagnostics, screenshots, prompts, or evidence.
- Keep the real owner grant independent of Stripe. Never create an owner email comparison, client flag, local premium switch, or special Stripe customer.
- Do not merge, release, package, publish, or mutate the Chrome Web Store.

## Frozen product and catalog contract

- Plans: `monthly` at USD 1.99, `annual` at USD 19.99, and `intro_annual` at USD 9.99 for the first year with a clearly disclosed USD 19.99 annual renewal. The introductory plan uses the standard USD 19.99 annual recurring price plus a server-owned USD 10.00 `duration=once` coupon; it is not a perpetual USD 9.99 recurring price.
- Monthly and annual plans grant the same six capabilities already defined by PM-P2.
- No free trial, lifetime plan, client-supplied price id, promotion-code authority, quantity, currency, tax behavior, customer id, redirect URL, entitlement, or grant source.
- The extension may request only the semantic plan key. A server-only catalog maps that key to reviewed sandbox price ids.
- Introductory annual is limited to one completed redemption per provider-neutral Tab Two account and one associated Stripe customer. Concurrent and abandoned Checkout sessions must not permit two redemptions or permanently consume an uncompleted offer.
- Hosted Checkout and Portal are the only payment-management surfaces. Tab Two never renders card fields or handles card data.
- Success, cancel, and portal return URLs are fixed server-side to a non-authoritative Supabase billing-return page. No return parameter changes billing state. Account & Sync refreshes the account snapshot and signed lease after focus/return.

---

### Task 1: Add billing domain contracts and observed RED

**Files:**

- Create: `src/account/billing.ts`
- Create: `src/account/billing.test.ts`
- Modify: `src/account/types.ts`
- Modify: `src/account/client.ts`
- Modify: `src/account/localAccountClient.ts`
- Modify: `src/account/previewAccountClient.ts`
- Modify: `src/account/supabaseAccountClient.ts`
- Modify: `src/account/supabaseAccountClient.test.ts`
- Modify: `src/settings/sections/AccountSync.tsx`
- Modify: `src/settings/sections/AccountSync.test.tsx`

- [x] **Step 1: Write RED for typed billing state**

Add a frozen `BillingSummary` with `state: 'none' | 'active' | 'past_due' | 'canceling' | 'expired' | 'complimentary'`, semantic plan, current-period end, courtesy end, cancel-at-period-end, and introductory eligibility. Do not expose Stripe ids in `AccountSnapshot`.

Require `openPlans(plan)` and `openBilling()` to return typed outcomes such as `opened`, `authentication_required`, `not_configured`, and `unavailable`. Local mode remains request-free. Preview uses deterministic URLs that compile out of production.

- [x] **Step 2: Write RED for UI behavior**

Account & Sync must show exact monthly, annual, and first-year renewal copy, disabled/pending/error states, and one normal-tab handoff. Checkout return never sets subscription state locally. Signed-in focus or an explicit Refresh billing action must re-read the account snapshot and signed lease.

- [x] **Step 3: Run observed RED**

```powershell
npx vitest run src/account/billing.test.ts src/account/supabaseAccountClient.test.ts src/settings/sections/AccountSync.test.tsx
```

Expected: failures identify only the missing PM-P3 contracts and actions.

### Task 2: Add the default-deny billing schema

**Files:**

- Create: `supabase/migrations/20260901000300_stripe_billing_foundation.sql`
- Create: `supabase/tests/stripe_billing_rls.sql`
- Modify: `supabase/tests/account_entitlements.sql`

- [x] **Step 1: Write pgTAP RED for private tables and grants**

Require private, service-only tables for:

- account to sandbox Stripe customer mapping;
- normalized subscription state and current billing period;
- introductory Checkout reservation/redemption with unique account, customer, and Checkout-session constraints;
- webhook event idempotency with event id, type, object id, Stripe creation time, payload SHA-256, outcome code, received time, and processed time;
- minimal billing audit events or a constrained extension of the existing entitlement audit authority.

Do not persist raw webhook JSON, Checkout/Portal URLs, card data, billing addresses, receipts, or payment-method details.

- [x] **Step 2: Implement transactional service-role functions**

Create narrowly scoped private functions that:

- acquire or reuse exactly one customer mapping for an account;
- reserve, expire, and redeem an introductory claim without double redemption;
- claim a webhook event id exactly once and reject the same id with a different payload hash;
- apply a normalized sandbox subscription snapshot under an account row lock;
- upsert or revoke only the `stripe` grant while preserving `complimentary_owner`;
- append an audit record only for an effective billing/grant transition.

The `stripe` grant must contain the exact six capabilities. Its `expires_at` is bounded to the authoritative paid-through or courtesy boundary so a newly issued lease cannot outlive billing authority. `private.effective_entitlement` remains the union across active grants.

- [x] **Step 3: Prove the adversary matrix**

Anonymous and authenticated roles cannot select or mutate billing, webhook, introductory, grant, or audit tables and cannot execute private billing functions. Cross-account reads and mutations fail. Service-role fixtures prove duplicate delivery, payload-hash mismatch, concurrent introductory reservation, completed redemption, expired reservation reuse, stale event, canceling, courtesy, refund, chargeback, and owner-grant survival.

```powershell
npx supabase db reset
npx supabase test db
npx supabase db lint --local --level error
```

### Task 3: Build a server-only Stripe gateway with no external state

**Files:**

- Create: `supabase/functions/_shared/stripeTypes.ts`
- Create: `supabase/functions/_shared/stripeCatalog.ts`
- Create: `supabase/functions/_shared/stripeGateway.ts`
- Create: `supabase/functions/_shared/billingHandlers.ts`
- Create: `supabase/functions/tests/billing-functions.test.ts`
- Modify: `supabase/functions/_shared/http.ts`

- [x] **Step 1: Write fake-gateway RED**

Test all handlers with an injected fake gateway before adding a Stripe SDK. Require sandbox objects, bounded strings, exact object ownership, stable error codes, no secret reflection, and zero email-based account selection.

- [x] **Step 2: Freeze the server-owned catalog**

Map `monthly` and `annual` to environment-supplied sandbox price ids. Map `intro_annual` to the reviewed annual price plus an environment-supplied one-use USD 10 coupon. Validate exact currency, recurring interval, amount, tax behavior, coupon amount/duration, product eligibility metadata, and `livemode: false` by retrieving the catalog objects before first use and caching only in function memory. The client can never send a raw price or coupon id.

- [x] **Step 3: Pin and audit the server-only SDK**

At implementation time, choose a current supported Stripe SDK and API version compatible with Managed Payments, pin them exactly, trace the dependency path, run the JS security audit, and prove neither enters the extension production chunk. If Managed Payments still requires a preview API version, record it explicitly and keep the live gate closed.

### Task 4: Implement authenticated Checkout and Portal functions

**Files:**

- Create: `supabase/functions/billing-checkout-session/index.ts`
- Create: `supabase/functions/billing-portal-session/index.ts`
- Create: `supabase/functions/billing-return/index.ts`
- Create: `supabase/functions/billing-checkout-session/config.toml`
- Create: `supabase/functions/billing-portal-session/config.toml`
- Create: `supabase/functions/billing-return/config.toml`
- Modify: `supabase/config.toml`
- Modify: `supabase/functions/tests/billing-functions.test.ts`

- [x] **Step 1: Require an authenticated provider-neutral account**

Checkout and Portal accept POST only, verify the Supabase user JWT, resolve the exact account UUID through the PM-P2 service boundary, and rate-limit per account. Portal requires an existing server-owned customer mapping. Neither accepts account id, customer id, price id, return URL, capability, or entitlement from the client.

- [x] **Step 2: Create hosted sessions server-side**

Checkout uses subscription mode, quantity one, server-selected price, the existing or newly created sandbox customer, `client_reference_id` set to the internal account UUID, minimal metadata with the same UUID and semantic plan, and fixed success/cancel URLs. Store only identifiers required for reconciliation. Portal creates a fresh short-lived sandbox URL for the server-owned customer and uses a fixed return URL.

- [x] **Step 3: Keep the return page non-authoritative**

`billing-return` serves static success/cancel/return guidance, contains no account data or token, performs no mutation, and tells the customer to return to Tab Two. It may not read a Checkout session, issue a lease, or claim payment success.

### Task 5: Implement signature-first, reorder-safe webhooks

**Files:**

- Create: `supabase/functions/stripe-webhook/index.ts`
- Create: `supabase/functions/stripe-webhook/config.toml`
- Modify: `supabase/config.toml`
- Modify: `supabase/functions/_shared/billingHandlers.ts`
- Modify: `supabase/functions/tests/billing-functions.test.ts`

- [x] **Step 1: Verify before parsing**

The webhook is the only mutation-capable PM-P3 function with Supabase JWT verification disabled; the static, non-authoritative billing-return page is also public. Read the webhook request as raw bytes exactly once, enforce a small maximum body size, require the Stripe signature header, verify it with the sandbox endpoint secret and bounded timestamp tolerance, and only then parse the event. Reject `livemode: true` before database work. Never log the body or signature.

- [x] **Step 2: Make duplicates identity and order irrelevant**

Hash the verified raw body. Claim `event.id` transactionally. An exact duplicate returns success without replaying effects; the same id with a different hash is a hard failure and audit signal. Because Stripe does not guarantee event order, retrieve the current Checkout Session, Subscription, Invoice, Refund, Charge, or Dispute object when necessary and derive the normalized state from that authoritative object plus the server-owned catalog. Do not apply an older snapshot over a newer stored billing boundary.

- [x] **Step 3: Cover the lifecycle**

Handle only the minimum reviewed event set needed for Checkout completion, subscription create/update/delete, invoice paid/payment failed/action required, refund, and chargeback/dispute. Unknown valid events are recorded as ignored and return success. Prove:

- successful monthly, standard annual, and introductory annual activation;
- cancel-at-period-end access through the paid-through boundary;
- seven-day payment-failure courtesy after the paid-through boundary;
- successful retry recovery;
- subscription expiry/deletion;
- refund, confirmed fraud, and chargeback early revocation without local-data deletion;
- duplicate and reordered delivery;
- introductory redemption once per account and customer;
- no `stripe` grant outlives its authoritative boundary;
- `complimentary_owner` remains active through every Stripe failure state.

### Task 6: Connect Account & Sync without expanding authority

**Files:**

- Modify: `src/account/supabaseAccountClient.ts`
- Modify: `src/account/supabaseAccountClient.test.ts`
- Modify: `src/settings/sections/AccountSync.tsx`
- Modify: `src/settings/sections/AccountSync.test.tsx`
- Modify: `src/privacy/dataFlows.ts`
- Modify: `PRIVACY.md`
- Modify: `README.md`

- [x] **Step 1: Add bounded API calls**

Use the existing Supabase session and origin for Checkout and Portal session creation. Accept only an HTTPS URL with no user information, no non-default port, and the exact host `checkout.stripe.com` for Checkout or `billing.stripe.com` for Portal. Reject every other host, including lookalike suffixes and custom domains, then open the accepted URL in a normal tab with `noopener`. Do not store the URL. Authentication failures clear account authority through the PM-P2 path; service failures leave free behavior intact.

- [x] **Step 2: Refresh signed authority after billing**

On explicit Refresh billing and the next Account & Sync focus after a hosted handoff, fetch the account snapshot and signed lease. Ignore URL query strings and browser return state as entitlement input. Show subscription and error/courtesy/canceling copy from the server snapshot only. Capabilities still come only from a verified lease bound to the signed-in account.

- [x] **Step 3: Reconcile public disclosure**

Disclose Stripe/Link hosted Checkout and Portal, account/billing identifiers retained by Supabase and Stripe, no card handling by Tab Two, webhook authority, retention/deletion behavior, and the test-mode-only implementation state. Do not update a live Store listing without its separate gate.

### Task 7: Request the sandbox gate and run hosted evidence

**External state, separately approved at execution time:** Stripe sandbox, two recurring test prices, one one-use introductory coupon, Customer Portal sandbox configuration, webhook endpoint, test secrets, and deployment of PM-P3 functions/migration to the approved Supabase project.

- [ ] **Step 1: Stop for explicit approval**

Present the exact objects, names, amounts, renewal copy, tax behavior, API version, enabled portal actions, webhook event allowlist, secret names, Supabase functions/migration, and rollback. Do not open Stripe or create state until approved.

- [ ] **Step 2: Provision sandbox only**

After approval, authenticate through owner handoff, confirm the Dashboard is in a sandbox, create only the reviewed test product/prices/configuration, store `sk_test_...` and `whsec_...` only in Supabase secret storage, verify secret names without reading values back, deploy only PM-P3 migration/functions, and prove every Stripe object has `livemode: false`. Do not accept live-mode prompts or Managed Payments terms without a separate action-time confirmation.

- [ ] **Step 3: Exercise real sandbox lifecycles**

Use Stripe-hosted test Checkout and Portal, documented test cards, legitimate sandbox subscriptions, webhook redelivery, and test clocks. Prefer actual correlated sandbox objects over synthetic CLI events for lifecycle proof. Capture redacted request/event ledgers, never card numbers, emails, URLs, tokens, or secrets.

### Task 8: Review, stabilize, document, and stop

**Files:**

- Create: `scripts/qa-stripe-billing.mjs`
- Create: `scripts/qa-stripe-billing.test.mjs`
- Create: `docs/superpowers/reports/TAB-TWO-STRIPE-BILLING-LOCAL-QA.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `PRIVACY.md`
- Modify: `README.md`

- [x] **Step 1: Run one bounded Critical/Important review**

Review raw-body signature ordering, secret separation, sandbox enforcement, exact account/customer binding, catalog authority, idempotency, object retrieval, stale-event rejection, paid-through/courtesy expiry, intro races, owner-grant union, local/free isolation, URLs, CORS, rate limits, RLS, logs, privacy, and rollback. Apply at most one focused fix/rereview cycle.

- [x] **Step 2: Run the stabilized gate**

```powershell
npm test
npx tsc --noEmit
node --test scripts/account-auth-build-contract.test.mjs scripts/account-auth-production-contract.test.mjs scripts/qa-account-auth-local.test.mjs scripts/qa-account-auth-production.test.mjs scripts/qa-stripe-billing.test.mjs
npx supabase db reset
npx supabase test db
npx supabase db lint --local --level error
npx vitest run supabase/functions/tests/account-functions.test.ts supabase/functions/tests/billing-functions.test.ts
npm run build
npm run build:preview
npm run build:account-local
git diff --check
```

Scan production, preview, tracked files, and git objects for `sk_test_`, `sk_live_`, `whsec_`, raw webhook fixtures, session URLs, card numbers, private keys, service-role material, and preview entitlement symbols. Public sandbox ids may appear only in the server-side reviewed configuration/evidence locations approved by the packet.

- [ ] **Step 3: Complete exact browser evidence**

At desktop and touch-narrow geometry, prove Local mode makes zero billing requests; signed-in plan selection opens the correct hosted test Checkout; cancel and success returns do not grant locally; refreshed signed leases reflect webhook state; Portal opens only for the bound customer; billing errors remain contained; owner complimentary access survives all test billing failures; sign-out clears only the account session; and no `AuroraData` write occurs from billing-only actions. Inspect every retained PNG at original resolution.

- [ ] **Step 4: Checkpoint without crossing live gates**

Record exact SHAs, test counts, sandbox object ids redacted where appropriate, event matrix, test-clock results, recurring cost, manual ceilings, rollback, and explicit proof that every Stripe object is test mode. Stage only intended files, push only `feat/aurora-2-observatory`, prove local/upstream/remote equality, and confirm the protected original and protected untracked paths. Stop before live catalog creation, live keys/webhooks, PM-P4, merge, release, or Store action.

## Rollback

- Disable `billing-checkout-session` first so no new Checkout can start.
- Disable `billing-portal-session` if customer binding or portal configuration is unsafe.
- Keep `stripe-webhook` available long enough to reconcile already-created sandbox subscriptions unless signature or mutation safety is in doubt; in that case disable it and freeze the last valid signed leases for manual reconciliation.
- Revoke sandbox secrets and webhook destination, never live secrets because none are authorized.
- Revoke only the `stripe` grant through a reviewed forward operation. Never alter or delete `complimentary_owner` and never erase audit history.
- Reverse schema only through a reviewed forward migration or isolated restore. Do not edit hosted migration history.
- Local product data remains authoritative and unchanged. A billing rollback never deletes local data.

## Current official Stripe references

- Managed Payments public preview and eligibility: <https://docs.stripe.com/payments/managed-payments>
- Managed Payments setup and API-version gate: <https://docs.stripe.com/payments/managed-payments/set-up>
- Checkout subscriptions: <https://docs.stripe.com/payments/checkout/build-subscriptions>
- Customer Portal API integration: <https://docs.stripe.com/customer-management/integrate-customer-portal>
- Webhook signatures and raw request bodies: <https://docs.stripe.com/webhooks/signature>
- Webhook duplicates and event ordering: <https://docs.stripe.com/webhooks>
- Billing sandbox and test clocks: <https://docs.stripe.com/billing/testing>
