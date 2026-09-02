# Tab Two Resumable Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents.

**Goal:** Reopen the same safe, unexpired Stripe Checkout Session when a customer closes its tab and chooses the same plan again, without permitting duplicate subscriptions or introductory redemptions.

**Architecture:** A service-role-only repository query exposes the minimum active reservation binding and a separate guarded operation expires an invalid reservation. The Stripe gateway retrieves an expanded sandbox Checkout Session and normalizes only the fields required to validate its account, customer, plan, catalog, status, expiry, and hosted URL. The authenticated Checkout handler resumes a matching session or creates a replacement only after the old binding is invalidated safely.

**Tech Stack:** Supabase Postgres, pgTAP, Supabase Edge Functions, TypeScript, Vitest, pinned server-only Stripe SDK, Stripe sandbox.

**Spec:** `docs/superpowers/specs/2026-09-01-tab-two-billing-return-and-checkout-recovery-design.md`

## Global Constraints

- Resume only the same semantic plan for the same provider-neutral account and mapped sandbox customer.
- Never accept a Checkout Session id, URL, customer, account, plan, price, coupon, expiry, or return URL from the extension.
- Return only HTTPS URLs on exact host `checkout.stripe.com`, with no credentials or non-default port.
- An active, canceling, or past-due subscription still blocks every new Checkout.
- Introductory annual remains the reviewed annual recurring price plus the server-owned once-only USD 10 coupon.
- Stripe webhooks and signed leases remain the only billing and entitlement authorities.
- Keep all objects in sandbox/test mode and reject `livemode: true`.
- Preserve all free behavior, `complimentary_owner`, protected paths, and existing secrets.
- Do not merge, release, publish, change the Chrome Web Store, create live Stripe state, or begin PM-P4.

---

### Task 1: Add minimum service-role reservation recovery authority

**Files:**

- Create: `supabase/migrations/20260901000400_resumable_billing_checkout.sql`
- Modify: `supabase/tests/database/stripe_billing_rls.test.sql`

**Interfaces:**

- Produces: `public.tab_two_active_billing_checkout(uuid, timestamptz)` returning at most one reservation row and `public.tab_two_expire_billing_checkout(uuid, text, timestamptz)` returning boolean.
- Consumes: existing `private.billing_checkout_sessions`, `private.introductory_claims`, `private.billing_subscriptions`, and service-role boundary.

- [ ] **Step 1: Write pgTAP RED**

Require anonymous and authenticated roles to have no execute authority. Service role receives only `checkout_session_id`, `customer_id`, `plan`, and `reserved_until` for an incomplete future reservation. Completed, expired, and active-subscription accounts return no active reservation.

Require guarded expiry to succeed only when account id and Checkout Session id match an incomplete row. It must shorten both the checkout reservation and a matching reserved introductory claim, preserve redeemed claims, completed rows, subscriptions, grants, audits, and `complimentary_owner`, and be idempotent.

- [ ] **Step 2: Run database RED**

```powershell
npx supabase db reset
npx supabase test db
```

Expected: new function and privilege assertions fail.

- [ ] **Step 3: Implement active reservation lookup**

Create a stable security-definer SQL function with fixed empty search path. Join the account's billing subscription under the same conditions used by `reserve_billing_checkout`; return no row when subscription state is `active`, `past_due`, or `canceling`.

```sql
returns table (
  checkout_session_id text,
  customer_id text,
  plan text,
  reserved_until timestamptz
)
```

- [ ] **Step 4: Implement guarded reservation expiry**

Lock the account's checkout row. Require exact incomplete sandbox session binding and `effective_at > reserved_at`. Shorten `reserved_until` to `effective_at` when it is later. Apply the same bound to a matching `introductory_claims.state = 'reserved'` row. Never delete the rows, rewrite ids, alter completed/redemption timestamps, or touch grants.

- [ ] **Step 5: Lock privileges**

Revoke both public wrappers from `public`, `anon`, and `authenticated`; grant execute only to `service_role`. Keep all private table grants unchanged.

- [ ] **Step 6: Run database GREEN**

```powershell
npx supabase db reset
npx supabase test db
npx supabase db lint --local --level error
```

Expected: the complete pgTAP suite passes and lint reports zero errors.

- [ ] **Step 7: Commit reservation authority**

```powershell
git add supabase/migrations/20260901000400_resumable_billing_checkout.sql supabase/tests/database/stripe_billing_rls.test.sql
git commit -m "feat(billing): expose safe checkout recovery binding"
```

### Task 2: Normalize a retrievable Checkout Session

**Files:**

- Modify: `supabase/functions/_shared/stripeTypes.ts`
- Modify: `supabase/functions/_shared/stripeGateway.ts`
- Modify: `supabase/functions/tests/billing-functions.test.ts`

**Interfaces:**

- Produces: `StripeCheckoutRecovery` and `StripeGateway.retrieveCheckoutSession(checkoutSessionId)`.
- Consumes: pinned Stripe SDK and existing server-owned catalog.

- [ ] **Step 1: Write gateway RED**

Mock Stripe retrieval with expanded line items and discounts. Require normalized primitive values only and rejection of string/object ambiguity, missing URL, multiple prices, multiple discounts, incomplete expansion, malformed metadata, live objects, and non-subscription mode.

```ts
export interface StripeCheckoutRecovery {
  id: string
  url: string | null
  livemode: boolean
  status: 'open' | 'complete' | 'expired' | null
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required' | null
  mode: 'subscription' | 'payment' | 'setup' | null
  customerId: string | null
  clientReferenceId: string | null
  accountId: string | null
  plan: StripePlan | null
  priceIds: readonly string[]
  couponIds: readonly string[]
  expiresAt: number | null
}
```

- [ ] **Step 2: Run focused RED**

Run: `npx vitest run supabase/functions/tests/billing-functions.test.ts`

Expected: missing gateway method and normalization cases fail.

- [ ] **Step 3: Implement retrieval and normalization**

Retrieve exactly one session with:

```ts
await stripe.checkout.sessions.retrieve(checkoutSessionId, {
  expand: ['line_items.data.price', 'discounts.coupon'],
})
```

Normalize ids from allowed string or expanded object shapes without returning the raw Stripe object. Convert Stripe epoch seconds to milliseconds exactly once. Do not log the object or URL.

- [ ] **Step 4: Run gateway GREEN**

Run: `npx vitest run supabase/functions/tests/billing-functions.test.ts`

Expected: all gateway normalization tests pass.

- [ ] **Step 5: Commit gateway recovery**

```powershell
git add supabase/functions/_shared/stripeTypes.ts supabase/functions/_shared/stripeGateway.ts supabase/functions/tests/billing-functions.test.ts
git commit -m "feat(billing): retrieve open checkout sessions"
```

### Task 3: Resume or safely replace Checkout in the authenticated handler

**Files:**

- Modify: `supabase/functions/_shared/billingHandlers.ts`
- Modify: `supabase/functions/_shared/billingRuntime.ts`
- Modify: `supabase/functions/tests/billing-functions.test.ts`

**Interfaces:**

- Consumes: `repository.findActiveCheckout(accountId, effectiveAt)`, `repository.expireCheckout(accountId, checkoutSessionId, effectiveAt)`, `gateway.retrieveCheckoutSession(id)`, and the loaded server catalog.
- Produces: `{ url, resumed: true }` for a valid existing Session or `{ url, resumed: false }` for a new Session.

- [ ] **Step 1: Write handler RED for the complete decision table**

Cover:

- same plan plus exact open binding returns the existing safe URL and never calls create/reserve;
- different active plan returns 409 `{ error: 'checkout_already_open' }`;
- expired, complete, paid, missing, live, wrong-account, wrong-customer, wrong-plan, wrong-price, wrong-coupon, wrong-mode, unsafe-URL, or mismatched-expiry Session is expired before one replacement is created;
- failure to expire returns 409 without creating a replacement;
- a standard plan has no coupon; introductory annual has exactly the reviewed once-only coupon;
- existing active/canceling/past-due subscription remains blocked by the repository reservation path;
- concurrent same-account calls can produce at most one accepted reservation.

- [ ] **Step 2: Run focused RED**

Run: `npx vitest run supabase/functions/tests/billing-functions.test.ts`

Expected: resume decision cases fail.

- [ ] **Step 3: Add runtime repository methods**

Map `tab_two_active_billing_checkout` to the exact four-field `ActiveCheckoutReservation`, parse the timestamp to a finite millisecond number, and reject malformed rows. Map `tab_two_expire_billing_checkout` to a boolean. Keep both behind the existing service-role client.

- [ ] **Step 4: Implement exact resume validation**

Create one pure predicate that compares the retrieved Session to account, customer, requested plan, reservation, catalog, current time, and expected coupon. Require `status === 'open'`, `paymentStatus !== 'paid'`, `mode === 'subscription'`, exact one price, the correct zero-or-one coupon, and `now < expiresAt <= reservedUntil`.

- [ ] **Step 5: Implement resume-first Checkout behavior**

After authentication, rate limit, customer mapping, and catalog load:

1. Read the active reservation.
2. Return a typed conflict for a different plan.
3. Retrieve and validate the same-plan Session.
4. Return its URL with `resumed: true` when valid.
5. Otherwise expire the exact binding.
6. Create and reserve one new Session through the existing path and return `resumed: false`.

Every returned URL still passes `safeHostedUrl` immediately before response.

- [ ] **Step 6: Run focused GREEN**

Run: `npx vitest run supabase/functions/tests/billing-functions.test.ts`

Expected: complete billing handler/gateway suite passes.

- [ ] **Step 7: Prove client compatibility**

Run:

```powershell
npx vitest run src/account/supabaseAccountClient.test.ts src/settings/sections/AccountSync.test.tsx
```

The client ignores the additive `resumed` evidence field, validates the URL exactly as before, opens one hosted tab, and displays no low-level distinction.

- [ ] **Step 8: Commit handler recovery**

```powershell
git add supabase/functions/_shared/billingHandlers.ts supabase/functions/_shared/billingRuntime.ts supabase/functions/tests/billing-functions.test.ts
git commit -m "fix(billing): resume an open checkout"
```

### Task 4: Deploy and prove the closed-tab recovery lifecycle

**Files:**

- Modify: `scripts/qa-stripe-billing.mjs`
- Modify: `scripts/qa-stripe-billing.test.mjs`
- Create: `docs/superpowers/reports/TAB-TWO-RESUMABLE-CHECKOUT-QA.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Consumes: approved Supabase project, existing Stripe sandbox catalog/webhook, exact production extension build, and branded return surface.
- Produces: deployed forward migration/function, one real sandbox recovery lifecycle, exact ledgers, and checkpoint evidence.

- [ ] **Step 1: Deploy only the forward recovery change**

Apply migration `20260901000400_resumable_billing_checkout.sql` to project `ovlobmvxtryitupxwylg` and deploy only `billing-checkout-session`. Confirm the project remains Free, Stripe remains sandbox, existing secret names are unchanged, and no value is read back or printed.

- [ ] **Step 2: Exercise a real closed-tab recovery**

Using a signed-in sandbox account with no active Stripe subscription:

1. Choose the introductory annual plan and record only a redacted Session fingerprint and timestamp.
2. Close the Stripe tab without canceling.
3. Choose the same annual offer again.
4. Prove the reopened Stripe page corresponds to the same Session fingerprint and no second Session was created.
5. Complete the sandbox payment once.
6. Return through the branded success page and focus Tab Two.
7. Refresh Account & Sync through the signed server path.

- [ ] **Step 3: Prove authoritative database and Stripe outcomes**

Record counts and redacted bindings proving one customer mapping, one completed Checkout reservation, one subscription, one effective Stripe grant, processed webhook idempotency, correct introductory redemption, and unchanged `complimentary_owner`. Never include the Checkout URL, customer email, card data, access token, secret, or raw webhook body.

- [ ] **Step 4: Prove negative hosted cases**

Use fake/local tests for unsafe URL and cross-account cases. In hosted sandbox, prove only the safe cases that create no unnecessary state: selecting another plan while one remains open yields contained guidance, and retrying after completion does not create a second subscription.

- [ ] **Step 5: Run the stabilized gate**

```powershell
npm test
npx tsc --noEmit
node --test scripts/qa-stripe-billing.test.mjs
npx supabase db reset
npx supabase test db
npx supabase db lint --local --level error
npx vitest run supabase/functions/tests/account-functions.test.ts supabase/functions/tests/billing-functions.test.ts
npm run qa:stripe-billing
npm run build
npm run build:preview
npm run build:account-local
git diff --check
```

Run production/preview/repository scans for Stripe secrets, webhook secrets, Checkout URLs, card data, raw webhooks, service-role material, private keys, and preview entitlement symbols.

- [ ] **Step 6: Review, document, checkpoint, and push**

Perform one bounded Critical/Important review of reservation lookup/expiry, Stripe retrieval normalization, exact binding, catalog/coupon match, race behavior, URL safety, active-subscription block, logs, secrets, owner-grant survival, and rollback. Apply at most one focused fix and rereview cycle. Reconcile reports and ledgers, stage only intended files, push only `feat/aurora-2-observatory`, prove local/upstream/remote equality, and confirm protected paths. Stop before live Stripe, PM-P4, merge, release, or Store action.

