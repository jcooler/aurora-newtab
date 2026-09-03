# Tab Two Google Calendar QA

**Date:** 2026-09-03<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Installed-extension evidence source:** `bacf83980f1a8a383190d537270ad9d210fa3e97`<br>
**Stabilized developer-gate source:** `e3c2eb6`<br>
**Hosted sandbox boundary source:** `c29092ca741205ad3dbe70b17cad82526ae25024`<br>
**Result:** PASS for the local PM-P6 implementation, account isolation, aggregate-only Metrics projection, exact build isolation, installed-extension Chromium QA, and the approved hosted Google/Supabase sandbox boundary. Real Google account consent, token exchange/refresh, Calendar reads, and Google-side revocation remain deferred owner/test-user ceilings and are not represented as production-ready.

## Delivered boundary

- Google Calendar is an additive premium connector. All existing local features and all 15 existing connectors, including ICS Calendar, remain free and retain their existing storage ownership.
- Tab Two account sign-in and Google Calendar authorization are separate. Provider connections are scoped to a Tab Two account and expose only connection identity, display identity, status, exact granted scopes, and timestamps to the extension.
- Refresh tokens remain only in the hosted broker and are encrypted there with AES-256-GCM; access tokens remain memory-only in the extension. The broker stores no Calendar content.
- Google Calendar requests use only `openid`, `email`, `calendar.calendarlist.readonly`, and `calendar.events.readonly`. Calendar discovery and event requests go directly from the extension to `www.googleapis.com` after the optional origin is granted.
- The local Calendar keeps Google, ICS, month-grid, and public-holiday authorities separate while composing selected Google and ICS events into one existing Calendar presentation.
- Multiple Google accounts retain independent selected calendars, colors, refresh issues, reconnect actions, and disconnect actions.
- Calendar-load Metrics contain daily numeric event and busy-minute aggregates only. Titles, event IDs, calendar IDs, email addresses, URLs, tokens, cursors, and provider records are excluded.
- Google selections, account labels, calendar metadata, event snapshots, and cursors remain installation-local and are excluded from backup, encrypted product sync, diagnostics, and logs.

## Review and focused repairs

One bounded complete-diff review covered account isolation, token custody, OAuth state, nonce, PKCE, redirect validation, exact scopes, secret leakage, optional-origin ownership, paging atomicity, 410 recovery, caps, rate limits, disconnect and revocation, entitlement expiry, Metrics privacy, backup and sync denial, accessibility, and ICS/Calendar regression.

The review and exact browser pass closed two Important defects:

1. All-day Google events now use their exclusive local date range for Metrics collection, avoiding a false prior-day bucket in western time zones.
2. Enabling Google Calendar no longer changes the provider tree shape and remounts the application. Settings therefore remains on the connector and preserves the visible success state after save.

The registry contract fixture was also corrected to include its required Tab Two account ID. No Critical or Important finding remains open at the local PM-P6 ceiling.

## Stabilized verification

| Gate | Result |
|---|---|
| Affected PM-P6 suites | 34 files, 1,047 tests passed |
| Whole repository | `npm test`: 265 files, 4,195 tests passed |
| TypeScript | `npx tsc --noEmit`: exit 0 |
| Dependency audit | `npm audit --audit-level=high`: 0 vulnerabilities |
| Fresh local database | `npx supabase db reset --local`: migrations through `20260903000700_provider_connections.sql` applied locally |
| Database adversary matrix | `npm run test:supabase-local`: 5 pgTAP files, 272 tests passed |
| Database lint | `npx supabase db lint --local --level error`: zero schema errors |
| Provider Edge functions | 2 files, 29 tests passed |
| Hosted harness contract | 2 Node tests passed |
| Hosted boundary matrix | 10 function invocations, 1,779 response bytes, and exact cleanup passed from `c29092c` |
| Linked database lint | Zero schema errors |
| Exact build isolation | Preview 305 modules, account-local 352 modules, production 354 modules; production restored last |
| Production fixture scan | No preview account or Google Calendar token fixture marker in production output |
| Secret and evidence scans | No production secret material in the PM-P6 diff; no token or secret fixture material in retained QA evidence |
| Diff hygiene | `git diff --check`: passed |

The repository-wide suite retains its pre-existing unrelated React `act(...)` warning in `App.test.tsx`, and Vite retains its existing large-chunk advisory. Neither is a PM-P6 failure.

## Installed-extension evidence

Evidence directory: `docs/superpowers/qa/google-calendar/bacf83980f1a8a383190d537270ad9d210fa3e97/`

Production, account-local, and preview all ran as installed MV3 extensions from exact tracked source. The harness retained 13 original-resolution PNGs plus one machine-readable evidence record.

- Production and account-local builds showed the premium-locked state with preview fixtures absent.
- Preview covered pre-consent, delayed discovery, default primary-calendar selection, explicit multi-calendar save, live success announcement and focus, a second Google account, reload persistence, disconnect cancel and focus restoration, confirmed disconnect, and per-account Metrics-history deletion.
- Composed ICS plus two Google accounts rendered in the existing Calendar with preserved source colors in full, docked, and stacked layouts.
- Partial reconnect, offline retained-data, and expired-capability retained-selection states passed.
- Keyboard focus, reduced motion, touch interaction, and 44 px touch controls passed.
- Desktop 1600x900, short 1408x600, ultrawide 3440x1440, and touch-enabled 390x844 had no horizontal overflow or escaped controls.
- The fault-injection ledger records the expected synthetic 401 and three offline request failures separately. Unexpected request, console-error, page-error, and failed-request ledgers are empty.

## Hosted sandbox activation

The owner approved the exact ten-item Task 9 gate. Google Calendar API is enabled on the dedicated project. The external OAuth application remains in Testing with the approved owner test user, exact identity plus read-only Calendar scopes, and sandbox GitHub legal links. A separate Web OAuth client contains only the exact Supabase callback; the existing account-sign-in client was not changed. The generated client ID, client secret, and random 32-byte provider KEK were transmitted directly to Supabase secret storage and were never printed, copied into a file, or committed.

Only migration `20260903000700_provider_connections.sql` was applied. Only `google-calendar-oauth-start`, `google-calendar-oauth-callback`, `google-calendar-connections`, `google-calendar-session`, and `google-calendar-disconnect` were deployed. All are active at version 1; JWT verification is enabled for the four extension-authenticated endpoints and disabled only for Google's callback endpoint. The production descriptor now enables Google Calendar for the bounded OAuth-testing cohort. This does not publish the OAuth app or make the connector generally available.

The hosted boundary matrix used three disposable synthetic Tab Two accounts and no Google account or Calendar content. In ten function invocations and 1,779 response bytes it proved the gateway JWT boundary, exact Google authorization URL and scopes, redirect binding, entitlement denial, single-use state/replay rejection, two-account metadata isolation, cross-account rejection, hosted rotation metadata, rate limiting, disconnect after synthetic revocation failure, and per-account provider-history deletion. Direct Calendar request minimization, atomic paging, and 410 cursor reset remain covered by local transport tests because raw Calendar traffic deliberately bypasses Supabase.

Independent metadata-only inspection found migration count 1, all six selected security constraints present, the three required hosted secret names present, and zero residual provider connections, OAuth transactions, provider rate-limit rows, or PM-P6 Auth users. Evidence: `artifacts/qa-google-calendar-hosted/c29092ca741205ad3dbe70b17cad82526ae25024/evidence.json`.

Owner hands-on QA remains deferred in `TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`. The matrix does not claim a real Google authorization-code exchange, renewable token lifecycle against Google, live Calendar discovery/event reads, cross-installation connection reuse, Google-side revocation, stable Chrome popup behavior, real assistive technology, or MacBook behavior.

## Explicit stop

Google sensitive-scope verification, production audience publication, branding review, customer rollout, package, release, merge, Supabase Pro, live Stripe, and every Chrome Web Store action remain separately gated. PM-P6 may reconcile and continue to PM-P7 planning without asking the owner to perform the deferred cumulative manual checklist.
