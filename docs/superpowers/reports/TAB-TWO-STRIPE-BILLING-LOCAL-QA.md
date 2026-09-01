# Tab Two PM-P3 Stripe Billing Local QA

**Date:** 2026-09-01  
**Branch:** `feat/aurora-2-observatory`  
**Implementation commit:** `95df3a206d80ceebe52b11bd0dcf74630408f789`  
**Visual containment fix:** `db83c38`  
**Result:** PASS for local source, database, fake-gateway, Edge runtime loading, extension integration, and installed Chromium preview. The Stripe sandbox external-state gate remains closed.

## Delivered local boundary

- Typed monthly, annual, introductory annual, complimentary, active, canceling, past-due, and expired billing states in Account & Sync.
- Exact approved copy: `$1.99 monthly`, `$19.99 annually`, and `$9.99 for your first year, then renews at $19.99 annually`.
- Server-owned Checkout and Customer Portal session handlers, exact Stripe-host URL validation, fixed return URLs, and a static non-authoritative return page.
- Stripe SDK pinned only in the Edge Function tree as `npm:stripe@22.6.0` with API version `2026-08-26.dahlia`.
- A reviewed catalog with two recurring prices and one USD 10 `duration=once` introductory coupon. `intro_annual` renews on the USD 19.99 annual price and cannot become a perpetual USD 9.99 subscription.
- Default-deny private billing, Checkout reservation, introductory claim, webhook idempotency, transition audit, and rate-limit tables.
- Atomic Checkout binding, introductory redemption, normalized subscription application, and `stripe` grant mutation under the provider-neutral account lock.
- Exact account, customer, Checkout, subscription, semantic plan, and reviewed-price binding. Active, canceling, and past-due accounts cannot start a second Checkout.
- Signature-first raw-byte webhook verification, sandbox rejection, payload hashing, duplicate resume, current-object retrieval, deterministic same-second precedence, confirmed full-refund and dispute handling, bounded courtesy, and transition-only billing audits.
- `complimentary_owner` remains independent of every Stripe state. Browser returns and mutable extension state never grant access.
- Public disclosure updates for Stripe/Link hosted payment handling, minimal identifiers, retention, non-authoritative returns, and the local/test-only state.

## Bounded review closure

The single Critical/Important review found and closed these blocking defects:

- a recurring USD 9.99 intro price that would have renewed forever;
- production webhook normalization that did not safely cover ordinary expandable string references;
- mismatched 30-minute database and 24-hour Stripe Checkout lifetimes;
- introductory redemption separated from entitlement application;
- refund/dispute traversal and status interpretation gaps;
- metadata accepted without the server-reviewed subscription price;
- simultaneous subscriptions overwriting one account row;
- delivery-order dependence for events with the same Stripe timestamp.

The same pass also closed stale-refresh success reporting, preserved the payload-hash hard-failure signal through the repository adapter, and restricted billing audits to effective transitions. Installed Chromium then exposed and closed a second document scrollbar behind the narrow Settings drawer.

## Verification evidence

| Gate | Evidence |
|---|---|
| Whole repository | `npm test -- --reporter=dot`: 235 files, 3,722 tests passed |
| TypeScript | `npx tsc --noEmit`: exit 0 |
| Node contracts | 25 account/auth/billing contracts passed |
| Fresh database | `npx supabase db reset`: all three migrations applied |
| Database adversary matrix | 2 pgTAP files, 101 tests passed |
| Database lint | zero schema errors |
| Edge Function units | 2 files, 73 tests passed; billing includes real-object normalization fixtures |
| Dependency audit | `npm audit --audit-level=high`: zero vulnerabilities; Stripe 22.6.0 has zero package dependencies |
| Edge runtime loading | Supabase Edge runtime 1.74.3 loaded all PM-P3 functions and pinned SDK; return page 200 with restrictive CSP, unauthenticated Checkout 401, invalid webhook signature 400 |
| Production build | 327 modules; exact build provenance; no Stripe SDK, secret/config marker, local origin, Managed Payments marker, or preview fixture in `dist` |
| Preview build | 280 modules; deterministic preview fixture only; no Stripe SDK or secret/config marker |
| Account-local build | 327 modules; no Stripe SDK, secret/config marker, Managed Payments marker, or preview fixture |
| Manifest | no new production Chrome permission or Stripe host authority; production retains only the approved Supabase host |
| Chromium desktop | installed preview at 1600x900; exact copy, controls contained, one Settings scroll owner, no runtime/request failures |
| Chromium touch-narrow | installed preview at 390x844 with touch; plan rows stacked, no horizontal overflow or viewport escape, one Settings scroll owner, no runtime/request failures |
| Hygiene | `git diff --check` clean; temporary local Edge environment deleted; protected untracked paths preserved |

The full suite still emits one pre-existing React `act(...)` warning in an unrelated Progress rail test. It is not a PM-P3 failure. The repository also has no project-level `.npmrc`, dependency-review workflow, or Dependabot configuration; those are pre-existing repository-wide hardening recommendations, not unreviewed additions to this packet.

## Exact external sandbox gate, not executed

The next approval would authorize only the following test-mode state:

1. Sign in to the owner's Stripe account and confirm an eligible sandbox, supported business location, Managed Payments availability, and the currently required terms. Stop if Managed Payments is unavailable or ineligible.
2. Create one sandbox product named `Tab Two Premium` with tax behavior exclusive, a reviewed tax code, and metadata `tab_two_managed_payments_eligible=true`.
3. Create two active sandbox recurring prices on that product:
   - `Tab Two Monthly`: USD 1.99 every month;
   - `Tab Two Annual`: USD 19.99 every year.
4. Create one sandbox coupon named `Tab Two Introductory First Year`: USD 10.00 off, USD currency, duration once, limited to the reviewed premium product, with no promotion code or client-selectable authority.
5. Configure sandbox Customer Portal for payment-method updates, invoice history, and cancellation at period end. Disable plan switching, quantity changes, promotion codes, and unrelated products.
6. Create one sandbox webhook destination for the approved Supabase `stripe-webhook` function with only:
   - `checkout.session.completed`;
   - `checkout.session.async_payment_succeeded`;
   - `checkout.session.async_payment_failed`;
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`;
   - `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`;
   - `charge.refunded`, `refund.created`, `refund.updated`;
   - `charge.dispute.created`, `charge.dispute.closed`.
7. Save values only in Supabase secret storage under `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TAB_TWO_STRIPE_MONTHLY_PRICE_ID`, `TAB_TWO_STRIPE_ANNUAL_PRICE_ID`, `TAB_TWO_STRIPE_INTRO_COUPON_ID`, and the public fixed return origin `TAB_TWO_PUBLIC_SUPABASE_URL`. Verify names without reading values back.
8. Deploy only migration `20260901000300_stripe_billing_foundation.sql`, `billing-checkout-session`, `billing-portal-session`, `billing-return`, `stripe-webhook`, and the updated `account-snapshot` function to project `ovlobmvxtryitupxwylg`.
9. Exercise only legitimate sandbox Checkout, Portal, redelivery, retry, canceling, courtesy, refund, dispute, deletion, and test-clock lifecycles. Capture redacted identifiers and never card numbers, emails, hosted URLs, tokens, signatures, or secrets.

## Rollback for that future gate

- Revoke/delete the sandbox webhook endpoint and Supabase Stripe secrets first.
- Delete the four new billing functions and restore the prior `account-snapshot` function bundle.
- Archive the sandbox coupon and prices and disable the sandbox Portal configuration.
- Apply a reviewed rollback migration that revokes/drops the public billing RPC bridge and private billing functions/tables/types. Do not modify `complimentary_owner` or the PM-P2 account tables/functions.
- Rebuild and verify the extension; no Chrome manifest rollback is expected because PM-P3 added no permission or Stripe host authority.

## Explicit stop

No Stripe login, agreement, account mutation, product, price, coupon, Portal configuration, webhook destination, secret, Supabase PM-P3 deployment, Checkout, card, charge, refund, dispute, subscription, test clock, live object, merge, release, paid infrastructure, or Chrome Web Store action was performed. Supabase Pro and all live Stripe work remain separate gates.
