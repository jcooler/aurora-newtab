# Tab Two Branded Billing Return QA

**Date:** 2026-09-01<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Implementation range:** `bfde9b3` through `a21561b`<br>
**Result:** PASS for the static hosted return surface, production-only extension handoff, security and privacy contract, responsive browser QA, and installed production-extension integration. A signed-in customer lifecycle remains a manual ceiling.

## Delivered boundary

- One static Cloudflare Pages project at `https://tab-two-billing-return.pages.dev` with neutral, success, cancel, and billing routes.
- A polished Tab Two handoff surface using the approved paid-product accent language, local SVG artwork, local CSS, and local JavaScript only.
- No Cloudflare Function, Worker script, KV store, database, analytics integration, custom domain, paid service, cookie, storage, remote font, or third-party asset.
- Fixed Supabase Checkout, cancel, and Portal return URLs. The older Supabase `billing-return` endpoint remains a neutral plain-text fallback and never claims payment success.
- A production-only MV3 background bridge and exact `externally_connectable` match for the single Pages origin. Preview and account-local builds omit both.
- No content script, new Chrome permission, new host permission, account identifier, billing identifier, hosted URL, or entitlement authority in the bridge message.
- Exact origin, URL, route, query, fragment, message shape, and result validation. The return page can focus an existing Tab Two new-tab document but cannot grant access or mutate billing state.

## Hosted evidence

- Cloudflare Pages project: `tab-two-billing-return`
- Production deployment id: `e47b8369-7050-46b9-a00b-5574b469c31c`
- Production alias: `https://tab-two-billing-return.pages.dev`
- Immutable deployment URL: `https://e47b8369.tab-two-billing-return.pages.dev`
- Supabase project: `ovlobmvxtryitupxwylg` on the Free tier
- `TAB_TWO_BILLING_RETURN_ORIGIN` is the exact Pages origin.
- Hosted function versions after the bounded deployment: `billing-checkout-session` 8, `billing-portal-session` 8, and neutral `billing-return` 8. `stripe-webhook` remained unchanged at 7.

All four live routes returned HTTP 200 directly with UTF-8 HTML, the exact restrictive content-security policy, `no-referrer`, `nosniff`, frame denial, `Cross-Origin-Opener-Policy: same-origin`, a deny-oriented Permissions Policy, no-store caching, and no `Set-Cookie` header. Response sizes were 2,037 bytes for `/`, 1,987 bytes for `/success/`, 2,031 bytes for `/cancel/`, and 1,983 bytes for `/billing/`.

## Browser and visual evidence

The live Pages origin passed Playwright coverage for:

- all four routes at 1440 x 900;
- success at 390 x 844 and the 320 x 700 minimum;
- a 720 x 450, 2x-density scenario;
- reduced motion;
- keyboard focus and a visible focus indicator;
- a minimum 44 px primary action;
- missing-extension fallback copy;
- no horizontal overflow or nested scroll owner; and
- one network origin with zero console, page, or failed-request errors.

Original-resolution inspection covered desktop success, desktop cancel, mobile success, and the 320 px success state. The result is visually consistent with the approved Account & Sync annual treatment and remains readable without implying that a browser return is subscription authority.

## Installed extension defect and closure

The first exact production-build integration returned `not_found` even while Tab Two was open. The original implementation queried tabs by URL. Without the `tabs` permission Chrome withholds that URL-matching authority, so the bridge could not discover the extension document.

The focused fix uses `chrome.runtime.getContexts` to discover only Tab Two's own exact TAB document contexts, then reads non-sensitive tab activity for target selection. It adds no permission. The installed production build subsequently passed all four live routes: each external message returned `focused`, the existing Tab Two tab received focus, and the script-opened return tab closed.

## Verification evidence

| Gate | Evidence |
|---|---|
| Whole repository | `npm test`: 237 files, 3,776 tests passed |
| TypeScript | `npx tsc --noEmit`: exit 0 |
| Combined Node contracts | 23 tests passed, including the tightened opener-isolation regression |
| Hosted route probe | Four direct HTTP 200 responses, exact headers, no cookies, and bounded byte counts |
| Production build | 329 modules; exact background bridge and Pages origin present |
| Preview build | 280 modules; no background bridge or external match |
| Account-local build | 327 modules; no background bridge or external match |
| Installed production extension | All four live routes focused Tab Two and closed the return tab |
| Visual QA | Eight responsive/accessibility scenarios passed with zero browser failures |
| Leakage scan | No live/test secret, webhook secret, private-key value, test-card number, session id, or concrete hosted Checkout/Portal URL in any final build |
| Privacy inventory | Code-backed hosted sandbox and static-return disclosure passed 9/9 focused tests |
| Hygiene | `git diff --check` clean at the implementation checkpoint; protected untracked paths preserved |

## Manual ceiling

The available desktop Chrome profile showed Account & Sync in Local mode. Authentication cannot be automated or completed on the user's behalf. Therefore this report does not claim a real signed-in Stripe return from Checkout through lease refresh. The user should perform that short sandbox witness after returning.

## Rollback

- Change the server return origin back only through a reviewed forward deployment.
- Remove the exact manifest external match and background bridge in a forward commit.
- Delete or disable the Cloudflare Pages project only after hosted Checkout and Portal return URLs no longer point to it.
- Keep the neutral Supabase fallback during rollback so older sandbox Sessions cannot imply access.
- Do not change entitlement grants, billing history, the complimentary owner grant, local dashboard data, or Chrome Web Store state.

## Explicit stop

No live Stripe object, live payment, Supabase Pro change, paid Cloudflare service, extension permission, merge, release, Chrome Web Store action, or PM-P4 work was performed.
