# Tab Two Resumable Checkout QA

**Date:** 2026-09-02<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Implementation range:** `004696a` through `bc0206e`<br>
**Result:** PASS for repository, local database, Edge handler, Stripe normalization, hosted migration/function deployment, contract QA, exact builds, and the real signed-account sandbox lifecycle through cancellation and restoration to active. Paid-status presentation is deployed in `account-snapshot` version 9 and flexible-billing cancellation normalization is deployed in `stripe-webhook` version 8. The owner-confirmed rebuilt extension removes manual billing refresh and uses bounded automatic convergence.

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
- The webhook was later advanced to version 8 to normalize Stripe flexible-billing cancellation scheduled exactly at the current-period boundary.

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

The owner reloaded the exact corrected account-enabled build, signed back in, and confirmed `Active subscription` in Account & Sync. A direct read-only installed-extension inspection independently confirmed the same server-derived state, both purchase actions exposed as disabled controls, and `Manage billing` available. Chrome retained the fixed extension id `akjalbmacojpmebkgohhcaaiacicpgkh`; the browser restart cleared its transient `DISABLE_RELOAD` state without reinstalling the extension or changing its stored product data. This closes the corrected installed-build display ceiling. It does not by itself prove the remaining Portal, cancellation, retry, refund, dispute, deletion, or test-clock lifecycle matrix.

The same installed-build session then opened `Manage billing` into Stripe's hosted Customer Portal in test mode. The portal showed the bound active annual subscription and offered its configured self-service controls. No billing detail, customer identifier, hosted URL, payment method, address, or portal screenshot was retained in repository evidence. The safe portal return reached the branded `/billing/` surface, its `Return to Tab Two` action focused the existing fixed-id extension tab, and Account & Sync still displayed `Active subscription`. No subscription, payment method, billing information, grant, or local product data was changed during this witness.

A reversible cancellation-at-period-end witness then exposed one Stripe API normalization mismatch. Stripe delivered both Customer Portal subscription updates to the configured webhook with HTTP 200, but the pinned `2026-08-26.dahlia` flexible-billing object represented the scheduled period-end cancellation as `cancel_at` equal to `current_period_end` while `cancel_at_period_end` remained `false`. The previous normalizer inspected only the Boolean field, so the hosted billing row remained `active` with event priority 30 and the extension truthfully rendered that stale server state. No transport, signature, account binding, or client refresh failure was involved.

An observed-RED real-object regression now requires that exact flexible-billing representation to normalize to `canceling` with the paid-through boundary preserved. The minimal fix accepts `cancel_at_period_end = true` or the equivalent exact `cancel_at = current_period_end`; it does not treat an arbitrary cancellation timestamp as period-end cancellation. Only the already-approved sandbox `stripe-webhook` function was deployed, as version 8. A fresh Portal cancellation then produced a server-normalized `canceling` state with `cancel_at_period_end = true`; the owner confirmed `Subscription canceling` and the paid-through date in Account & Sync. The cancellation was reversed in the Customer Portal, and a fresh hosted read confirmed the final subscription state is `active` with cancellation disabled. No migration, secret, permission, paid tier, live Stripe mode, release, or Store state changed.

The owner rejected a customer-facing `Refresh billing` control because subscription lifecycle state should converge like ordinary production application state. Account & Sync now silently revalidates signed-in billing when the section mounts and when the document regains focus or becomes visible. After Checkout or Portal opens, two delayed retries cover ordinary webhook lag. Concurrent triggers coalesce; timers stop on unmount; a transient failure retains the last verified state and waits for the next activation. There is no continuous polling, Supabase Realtime exposure, new permission, local entitlement inference, or return-URL authority. Focused account/privacy coverage passes 4 files / 53 tests. Source checkpoint `bc0206e` passes the stabilized repository run at 237 files / 3,782 tests; 27 account/auth/billing contracts, TypeScript, Stripe source QA, and `npm audit --audit-level=high` also pass. Exact builds transformed 329 production, 280 preview, and 327 account-local modules, then restored production `dist`. The owner reloaded that rebuilt extension and confirmed the expected signed-in billing presentation with no `Refresh billing` button, closing the manual display ceiling.

## Rollback

- Disable Checkout creation first if hosted recovery violates any binding or single-subscription rule.
- Restore the prior Checkout function in a reviewed forward deployment.
- Revoke and remove the two public service-role RPC wrappers through a reviewed forward migration.
- Preserve completed billing history, subscription state, Stripe grants, audit events, and `complimentary_owner`.
- Do not delete local Tab Two data or change Chrome Web Store state.

## Explicit stop

No live Stripe mode, live payment, Supabase Pro change, merge, release, Chrome Web Store action, or PM-P4 work was performed.
