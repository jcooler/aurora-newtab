# Tab Two Resumable Checkout QA

**Date:** 2026-09-01  
**Branch:** `feat/aurora-2-observatory`  
**Implementation range:** `004696a` through `9715cfb`  
**Result:** PASS for repository, local database, Edge handler, Stripe normalization, hosted migration/function deployment, and contract QA. The real signed-account close-and-resume lifecycle remains a manual sandbox ceiling.

## Delivered boundary

- A service-role-only active Checkout lookup returns only session id, customer id, semantic plan, and reservation expiry.
- A separately guarded expiry operation shortens only the exact incomplete reservation and its matching unredeemed introductory claim. It preserves completed rows, redeemed claims, subscriptions, grants, audits, and `complimentary_owner`.
- Stripe recovery retrieves one sandbox Checkout Session with exact line-item price and coupon expansion.
- Same-plan recovery requires exact account, customer, client reference, semantic plan, reviewed catalog price/coupon, subscription mode, open status, acceptable payment state, sandbox mode, safe hosted URL, and bounded future expiry.
- A valid same-plan Session returns its existing URL with `resumed: true`.
- A different active plan returns `checkout_already_open` rather than silently changing the customer's choice.
- Missing, expired, complete, malformed, unsafe, or mismatched same-plan Sessions are invalidated before one replacement may be created.
- A failed exact expiry returns a conflict and does not create another Session.
- The extension intentionally maps new and resumed URLs to the same customer-facing opened state. Neither is entitlement authority.

## Hosted evidence

- Supabase project: `ovlobmvxtryitupxwylg`
- Hosted migration `20260901000400_resumable_billing_checkout.sql` matches the local migration list after migrations 00100 through 00300.
- `billing-checkout-session` version 8 contains the recovery behavior.
- The catalog, webhook secret, Stripe secret, signing key, Google OAuth configuration, and complimentary owner grant were not changed by this follow-up.
- The webhook remained at version 7 because recovery changes only authenticated Checkout creation.

## Verification evidence

| Gate | Evidence |
|---|---|
| Whole repository | `npm test`: 237 files, 3,776 tests passed |
| TypeScript | `npx tsc --noEmit`: exit 0 |
| Combined Node contracts | 23 tests passed after the final hosted-header tightening |
| Fresh local database | Migrations 00100 through 00400 applied successfully |
| Database adversary matrix | 3 pgTAP files, 120 tests passed |
| Database lint | Zero schema errors |
| Focused account and billing tests | 4 files, 140 tests passed |
| Stripe billing QA contract | Recovery function/RPC names, exact retrieval expansions, same-plan resume, typed response, and no URL persistence pinned |
| Exact builds | Production 329 modules, preview 280 modules, account-local 327 modules |
| Leakage scan | No secret values or concrete hosted Checkout/Portal URLs in production, preview, or account-local output |
| Bounded review | One real installed-bridge defect was found in the adjacent return path, fixed without permission expansion, and rereview left no Critical or Important defect open |

The repository-wide suite still emits the existing unrelated React `act(...)` warning and Vite's existing large-chunk advisory. Neither is a PM-P3 failure.

## Manual sandbox witness still required

The current desktop Chrome profile was in Local mode when the unattended QA pass reached the signed-account boundary. The remaining customer-level witness is:

1. Load the exact latest production build and sign in.
2. Start the Annual introductory sandbox Checkout.
3. Close the Stripe Checkout tab without paying.
4. Select the same Annual plan again.
5. Confirm that Stripe Checkout reopens instead of showing `Billing is unavailable right now`.
6. Complete at most one sandbox payment only if the owner wants to finish the lifecycle witness.
7. Refresh billing and confirm that server-verified status, not the return page, controls the subscription display.

This report does not claim that those signed-in steps or a sandbox payment were completed.

## Rollback

- Disable Checkout creation first if hosted recovery violates any binding or single-subscription rule.
- Restore the prior Checkout function in a reviewed forward deployment.
- Revoke and remove the two public service-role RPC wrappers through a reviewed forward migration.
- Preserve completed billing history, subscription state, Stripe grants, audit events, and `complimentary_owner`.
- Do not delete local Tab Two data or change Chrome Web Store state.

## Explicit stop

No live Stripe mode, live payment, Supabase Pro change, merge, release, Chrome Web Store action, or PM-P4 work was performed.
