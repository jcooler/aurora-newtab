# Tab Two Google Calendar QA

**Date:** 2026-09-03<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Installed-extension evidence source:** `bacf83980f1a8a383190d537270ad9d210fa3e97`<br>
**Stabilized developer-gate source:** `e3c2eb6`<br>
**Result:** PASS for the local PM-P6 implementation, account isolation, aggregate-only Metrics projection, exact build isolation, and installed-extension Chromium QA. Hosted Google OAuth and Supabase provider activation remain disabled behind the separate Task 9 gate.

## Delivered boundary

- Google Calendar is an additive premium connector. All existing local features and all 15 existing connectors, including ICS Calendar, remain free and retain their existing storage ownership.
- Tab Two account sign-in and Google Calendar authorization are separate. Provider connections are scoped to a Tab Two account and expose only connection identity, display identity, status, exact granted scopes, and timestamps to the extension.
- Refresh and access tokens remain memory-only in the extension. The local provider broker stores only AES-256-GCM refresh-token ciphertext and associated encryption metadata; it stores no event content.
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
| Whole repository | `npm test -- --run`: 265 files, 4,194 tests passed |
| TypeScript | `npx tsc --noEmit`: exit 0 |
| Dependency audit | `npm audit --audit-level=high`: 0 vulnerabilities |
| Fresh local database | `npx supabase db reset --local`: migrations through `20260903000700_provider_connections.sql` applied locally |
| Database adversary matrix | `npm run test:supabase-local`: 5 pgTAP files, 272 tests passed |
| Database lint | `npx supabase db lint --local --level error`: zero schema errors |
| Provider Edge functions | 2 files, 29 tests passed |
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

## Hosted state and remaining ceilings

Migration 00700 and the five provider functions were exercised locally only. The production client remains configured with `googleCalendarEnabled: false`; no Google API activation, OAuth consent-screen change, Google OAuth client, hosted provider secret, hosted migration, hosted function deployment, optional-origin request in the owner's installation, package, release, merge, or Chrome Web Store action was performed.

Owner hands-on QA remains deferred in `TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`. Deterministic fixtures do not claim real Google account selection, real consent, cross-installation connection reuse, Google-side revocation, stable Chrome popup behavior, real assistive technology, or MacBook behavior.

## Explicit stop

The next action is Task 9's exact ten-item Google and Supabase sandbox activation gate. It requires a new explicit owner approval listing every item before any hosted or Google Cloud mutation occurs.
