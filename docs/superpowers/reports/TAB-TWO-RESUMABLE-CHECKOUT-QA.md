# Tab Two Resumable Checkout QA

**Date:** 2026-09-02<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Implementation range:** `004696a` through `9715cfb`<br>
**Result:** PASS for repository, local database, Edge handler, Stripe normalization, hosted migration/function deployment, contract QA, and the real signed-account sandbox lifecycle. A paid-status convergence defect found during the manual witness was repaired and deployed to `account-snapshot` version 9.

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

## Signed-account sandbox witness and paid-status repair

The owner completed the signed-account hosted Checkout lifecycle in Stripe test mode. The hosted webhook produced one active Annual subscription, while `complimentary_owner` remained an independent entitlement source. A later plan click returned the generic unavailable message because duplicate Checkout creation was correctly rejected with HTTP 409.

Read-only hosted inspection then confirmed:

- the current Checkout function was healthy and returned bounded 409 conflicts rather than 5xx failures;
- one completed Checkout reservation was bound to the account and subscription;
- one Annual billing subscription was active; and
- the extension was presenting `complimentary` because both the Edge snapshot and client reducer incorrectly allowed the independent owner grant to overwrite non-`none` Stripe billing state.

Two observed-RED regressions now require active paid billing to remain visible when the verified entitlement lease also includes `complimentary_owner`. The server uses the complimentary presentation only when billing state is `none`; the client independently enforces the same fail-closed policy and still refuses an unverified complimentary claim. The focused gate passed 3 files / 65 tests, and the repository gate passed 237 files / 3,779 tests plus TypeScript. Only `account-snapshot` was deployed, as version 9 with JWT verification enabled. No Stripe catalog, Checkout, webhook, subscription, entitlement grant, secret, permission, or return-site state changed during the repair.

The remaining manual display check is to reload the exact corrected account-enabled build, open Account & Sync, and refresh billing. The expected state is `Active subscription`; the purchase actions are disabled by the existing single-subscription guard and `Manage billing` remains available.

## Rollback

- Disable Checkout creation first if hosted recovery violates any binding or single-subscription rule.
- Restore the prior Checkout function in a reviewed forward deployment.
- Revoke and remove the two public service-role RPC wrappers through a reviewed forward migration.
- Preserve completed billing history, subscription state, Stripe grants, audit events, and `complimentary_owner`.
- Do not delete local Tab Two data or change Chrome Web Store state.

## Explicit stop

No live Stripe mode, live payment, Supabase Pro change, merge, release, Chrome Web Store action, or PM-P4 work was performed.
