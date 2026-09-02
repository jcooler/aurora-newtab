# Tab Two Billing Return and Checkout Recovery Design

**Status:** Owner-approved architecture; implementation authorized on the existing Stripe sandbox and approved Supabase Free project

**Date:** 2026-09-01

**Product:** Tab Two

**Positioning:** The best tab for your second screen.

## Summary

Tab Two must surround Stripe-hosted Checkout with a payment experience that feels intentional, trustworthy, and complete. The current Supabase Edge Function return page cannot meet that bar because hosted Supabase rewrites HTML to plain text unless a paid custom domain is attached, and Supabase does not recommend Edge Functions as frontend hosting.

This design replaces the raw return page with a small branded HTTPS surface on Cloudflare's free static hosting, adds a narrowly scoped path back to the installed production extension, and lets a customer reopen the same unexpired Checkout after closing its tab. Stripe webhooks and signed leases remain the only billing and entitlement authorities.

The work is divided into two independently testable packets:

1. **PM-P3A: Branded billing return and re-entry.** Build, host, and connect the customer-facing success, cancel, and billing-management return states.
2. **PM-P3B: Resumable Checkout.** Return the same safe Stripe URL for the same plan while its existing reservation and Checkout Session remain open and unexpired.

## Goals

1. Make every return from Stripe look and behave like a deliberate Tab Two product surface.
2. Bring the customer back to an existing Tab Two tab with one clear action.
3. Refresh server-verified billing after the hosted handoff without trusting URL state.
4. Recover cleanly when a customer accidentally closes an open Checkout tab.
5. Keep the return surface free to host, static, private by default, accessible, and free of analytics or account data.
6. Preserve the complete local-first free product and all existing PM-P3 security boundaries.

## Non-goals

- Do not render payment fields, collect card data, or replace Stripe-hosted Checkout or Customer Portal.
- Do not make the return page an entitlement, payment, fulfillment, or subscription authority.
- Do not read Stripe objects, Supabase sessions, customer details, email addresses, prices, or order details from the public return surface.
- Do not expose Checkout URLs, secrets, session ids, account ids, access tokens, signed leases, or webhook data to the return surface.
- Do not add analytics, tracking, cookies, local storage, advertising, chat, support widgets, or third-party fonts.
- Do not create live Stripe state, live catalog objects, production charges, or live secrets.
- Do not add a Chrome permission, optional permission, host permission, or content script for the return site.
- Do not merge, release, publish, or change the Chrome Web Store.

## Approved architecture

### Public return surface

Create a static site at the Cloudflare Pages project name `tab-two-billing-return`, using its HTTPS `pages.dev` origin. The deployable artifact contains four routes:

- `/success/` for a completed Stripe Checkout redirect;
- `/cancel/` for a canceled or abandoned Checkout redirect;
- `/billing/` for a Customer Portal return;
- `/` as a safe neutral fallback that does not infer a billing result.

Each route is a static HTML document sharing one local stylesheet, one local script, the existing Tab Two SVG mark, and local favicon assets. It makes no network request after load. Cloudflare serves static assets only; no Pages Function, Worker code, KV, database, secret, or dynamic rendering is required.

The Stripe session creator owns the three exact return URLs. It does not accept any return URL from the extension. Query strings and fragments never select entitlement state.

### Extension re-entry bridge

The production extension already has a stable id derived from its manifest key. Add an `externally_connectable.matches` entry for only the exact hosted HTTPS origin and a minimal MV3 background service worker.

The public page may send only this frozen message shape:

```ts
interface BillingReturnMessageV1 {
  type: 'tab-two.billing-return.v1'
  result: 'success' | 'cancel' | 'billing' | 'neutral'
}
```

The background listener accepts the message only when all of these are true:

- `sender.origin` is the exact configured return-site origin;
- `sender.url` uses HTTPS, the exact host, no credentials, and one of the four approved paths;
- the message has exactly the two allowed keys and an allowed result matching the path;
- the sender includes a real tab id;
- no data from the message is used as account, billing, entitlement, or navigation authority.

On an accepted message, the listener locates an existing Tab Two new-tab page, focuses its window and tab, and then closes the hosted return tab if Chrome permits it. It returns a small `focused`, `not_found`, or `unavailable` status. It does not read or write account storage, `AuroraData`, Stripe state, Supabase state, or the signed lease.

The return page's primary button uses the bridge. If Tab Two cannot be reached, the page keeps the button available, changes the supporting instruction to `Open a new tab, then open Settings > Account & Sync`, and never displays a technical error.

The existing Account & Sync focus behavior remains responsible for fetching a fresh account snapshot and signed lease after a hosted handoff. The bridge merely returns focus; it cannot grant access.

### Resumable Checkout

Before creating a new Checkout Session, the authenticated billing function asks the service-role repository for the account's active reservation. The returned record is limited to:

```ts
interface ActiveCheckoutReservation {
  checkoutSessionId: string
  customerId: string
  plan: 'monthly' | 'annual' | 'intro_annual'
  reservedUntil: number
}
```

If a reservation exists for the requested plan, the server retrieves that Checkout Session from Stripe and returns its existing URL only when every binding still matches:

- sandbox object and `livemode: false`;
- `status === 'open'` and payment status is not complete;
- exact Checkout Session id, Stripe customer, provider-neutral account metadata, semantic plan, mode `subscription`, and server-reviewed price/coupon behavior;
- expiration strictly in the future and no later than the database reservation;
- safe URL using HTTPS, exact host `checkout.stripe.com`, no credentials, and no non-default port.

If the same-plan reservation is stale, expired, complete, malformed, or missing at Stripe, the server expires it transactionally and may create one new reviewed Checkout Session. If a different-plan reservation remains active, the server returns a typed `checkout_already_open` conflict rather than opening or replacing it. Existing active, canceling, or past-due subscriptions remain blocked from starting a second subscription.

The extension maps `resumed: true` and a newly created Checkout to the same user-facing `opened` result. The distinction is server evidence only and does not change entitlement.

## Visual direction

### Subject and job

The subject is a private second-screen workspace returning from a sensitive payment handoff. The page has one job: confirm where the customer is in the flow and return them to Tab Two without doubt.

### Palette

The return surface fixes the approved paid-surface language into a small standalone brand palette:

- **Night:** `#081016` for the page field;
- **Ink:** `#0E1820` for the main surface;
- **Raised ink:** `#14232D` for inset status elements;
- **Tab Two cyan:** `#68D7FF` for the signature edge, focus, and primary action;
- **Signal blue:** `#27A8E8` for restrained depth and the Tab Two mark;
- **Paper:** `#F4FAFD` for primary text;
- **Mist:** `#A9BAC4` for secondary copy;
- **Hairline:** `#29404E` for quiet structure.

Success may use `#7FE0B5`, cancel may use `#F4C777`, and unavailable fallback may use Mist. These colors are status accents only; cyan remains the brand and action authority.

### Typography

No external font request is allowed. Display copy uses `ui-rounded, "Segoe UI", system-ui, sans-serif` at 700 weight with compact tracking. Body and controls use `"Segoe UI", system-ui, sans-serif`. Small trust and state labels use the same body face at 600 weight with deliberate letter spacing. The hierarchy comes from scale, width, and spacing, not decorative type.

### Layout and signature

The page uses one centered, responsive shell up to 640 px wide with the Tab Two wordmark above the state content. A cyan edge enters from the left and resolves into a two-pane handoff rail: `Stripe checkout -> secure verification -> Tab Two`. This rail is the page's single signature element and makes the transition specific to Tab Two's second-screen identity.

The success page hierarchy is:

```text
+----------------------------------------------------+
| [Tab Two mark]  TAB TWO                 SECURE     |
|                                                    |
|  [status icon]  PAYMENT RECEIVED                   |
|                 Your first year is ready.          |
|                 Tab Two verifies access securely.  |
|                                                    |
|  Checkout -------- verification -------- Tab Two   |
|                                                    |
|  [ Return to Tab Two ]                             |
|  Account & Sync refreshes when you return.         |
+----------------------------------------------------+
```

The annual introductory copy does not repeat or alter the transaction amount. Stripe remains the transaction detail surface. The return page says only what it can know from its fixed route.

### Route copy

**Success**

- Eyebrow: `Payment received`
- Heading: `Your first year is ready.`
- Body: `Tab Two is verifying your subscription securely. Return to Account & Sync and your access will refresh automatically.`
- Primary action: `Return to Tab Two`
- Trust note: `Payment details stay with Stripe.`

**Cancel**

- Eyebrow: `Checkout closed`
- Heading: `Nothing changed.`
- Body: `You were not upgraded from this return. Your Tab Two data and free features are exactly where you left them.`
- Primary action: `Return to Tab Two`
- Secondary note: `Choose the same plan again to continue an open checkout.`

**Billing**

- Eyebrow: `Billing updated`
- Heading: `Back to your second screen.`
- Body: `Return to Account & Sync to refresh the latest server-verified subscription status.`
- Primary action: `Return to Tab Two`
- Trust note: `Tab Two never handles your card details.`

**Neutral**

- Eyebrow: `Tab Two billing`
- Heading: `Return to your second screen.`
- Body: `Open Account & Sync to view your server-verified subscription status.`
- Primary action: `Return to Tab Two`

### Motion and accessibility

On first paint, the cyan edge and state content settle in once over 320 ms. The handoff rail progresses once on success but never loops. `prefers-reduced-motion: reduce` removes all movement. The experience preserves a logical heading order, 44 px minimum target size, visible cyan focus rings, WCAG AA text contrast, semantic status text, no color-only meaning, 200% zoom support, and no horizontal overflow from 320 px upward.

## Security and privacy

- Apply `default-src 'self'`, disallow frames, objects, forms, and embedding, and use local assets only.
- Set `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`, and a restrictive `Permissions-Policy` through static host headers.
- Use `Cache-Control: no-cache` for HTML and immutable caching only for versioned local assets.
- Add `noindex, nofollow` metadata and a `robots.txt` that disallows crawling.
- Do not include account data, session ids, Stripe ids, amounts, customer names, email, receipts, query-derived copy, or secrets in HTML, JavaScript, CSS, logs, or screenshots.
- Do not use cookies, web storage, service workers, beacons, analytics, telemetry, error reporting, or external asset hosts.
- Treat every browser message as untrusted. Exact origin, URL, path, key, and enum validation is required before any tab action.
- The return page and bridge never alter subscription or entitlement state. Stripe webhooks, Postgres billing state, and signed account-bound leases remain authoritative.

## Error handling

- A missing extension or missing Tab Two tab keeps the page intact and gives one plain instruction; it never suggests that payment failed.
- A rejected bridge message produces no privileged action and no account-state change.
- A failed billing refresh leaves existing free behavior and local data unchanged and shows the existing contained Account & Sync error.
- A missing or invalid active Checkout Session is expired server-side and replaced only when the normal single-subscription and introductory-offer rules permit it.
- Stripe or repository unavailability returns the existing generic billing-unavailable outcome without exposing provider details.

## Testing and evidence

### Return site

- Node contract tests parse every HTML route and verify exact copy, headings, actions, local-only assets, CSP and security headers, no tracking/storage/network APIs, no secrets, and no result inference from query strings.
- Browser QA at 1440x900, 390x844, 320x700, 200% zoom, keyboard-only, and reduced-motion captures each route at original resolution.
- Runtime ledgers must show zero requests after initial same-origin asset load, zero cookies or web-storage entries, zero console errors, zero page errors, no horizontal overflow, and no clipped controls.

### Extension bridge

- Unit tests cover exact origin/path/result validation, malformed and extra-key messages, absent sender tab, no Tab Two tab, successful focus, and safe close ordering.
- Manifest/build contracts prove the exact `externally_connectable` origin, no new permission or host permission, no content script, and no bridge in preview/account-local builds unless explicitly required for QA.
- Installed production Chromium proves the return page can focus an existing Tab Two tab and that Account & Sync refreshes only through its existing signed server path.

### Checkout recovery

- Handler and repository tests cover same-plan resume, different-plan conflict, expired/missing/complete/malformed session replacement, catalog mismatch, wrong customer/account/plan, unsafe URL, active-subscription block, one-use introductory protection, and concurrent retry.
- Hosted sandbox evidence closes a Checkout tab, selects the same plan, confirms the original open Session resumes, completes it once, and verifies one subscription, one completed reservation, one effective Stripe grant, and unchanged complimentary owner authority.
- Secret and fixture scans remain mandatory. No Checkout URL, Stripe secret, webhook secret, card detail, or raw webhook body may enter repository evidence.

## Deployment and rollback

### Deployment

1. Build and verify the static artifact locally.
2. Create only the reviewed free Cloudflare Pages project and deploy the static artifact.
3. Verify HTTPS, headers, assets, routes, accessibility, and zero dynamic functions.
4. Add the exact deployed origin to the production manifest bridge.
5. Deploy the Supabase migration and billing Checkout function update to the already approved project.
6. Update only sandbox Checkout and Portal return URLs through server-owned configuration.
7. Run the hosted sandbox lifecycle and installed-extension evidence.

### Rollback

- First restore the existing non-authoritative Supabase return URLs in the Checkout function and redeploy it so no new session points at the public site.
- Disable or delete the Cloudflare project only after no new sandbox Checkout or Portal session uses it.
- Remove the `externally_connectable` entry and background bridge in a forward commit; no user data migration is involved.
- Disable Checkout session creation if reservation recovery violates binding or single-subscription rules.
- Expire only invalid open reservations through a reviewed forward migration or RPC. Never alter completed billing history, Stripe grants, or `complimentary_owner`.
- Local data, free features, account identity, and signed entitlement authority remain intact throughout rollback.

## Explicit retained gates

This approval authorizes the free Cloudflare return project, exact sandbox return-URL change, production-extension bridge without new permissions, hosted PM-P3 function/migration update, and sandbox verification described above. It does not authorize:

- Cloudflare paid services, a purchased domain, a paid Supabase plan, or any other recurring cost;
- live Stripe products, prices, coupons, webhooks, keys, Checkout, Portal, charges, refunds, disputes, or subscriptions;
- a new Chrome permission, optional permission, host permission, content script, or Store disclosure change;
- merge, release, packaging, publication, rollout, or any Chrome Web Store action;
- PM-P4 or later paid-MVP packets.

