# Tab Two Microsoft Calendar QA

**Date:** 2026-09-03<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Installed-extension evidence source:** `6087d131a3fbb641d392d8a123ea87fa707c3d5f`<br>
**Stabilized developer-gate source:** `c4dd03625c50d0e0cf7c7cb8f34dcc5e0e3e9efc`<br>
**Hosted activation source:** `191eb88629a5f750d2e8bd8fe338aaeec8299138`<br>
**Result:** PASS for the local PM-P7 implementation, hosted Microsoft OAuth policy boundary, exact cleanup, source isolation, privacy boundaries, aggregate-only Metrics projection, exact build isolation, and installed-extension Chromium QA. Real Microsoft consent, live Graph data, organizational policy, and provider-side revocation remain deferred.

## Delivered boundary

- Microsoft Calendar is an additive premium connector. Every current local capability and all 15 original connectors remain free. ICS Calendar, Google Calendar, Month Calendar, and Public Holidays retain independent configuration, refresh, storage, permission, and rollback authority.
- The approved scopes are exactly `openid`, `offline_access`, `https://graph.microsoft.com/User.Read`, and `https://graph.microsoft.com/Calendars.ReadBasic`. No write, shared Calendar, Mail, Contacts, Files, Teams, Directory, application, or administrative permission is admitted.
- Personal Outlook.com and Microsoft 365 work or school accounts remain visibly distinct. Up to five Microsoft accounts, ten calendars per account, and twenty selected Microsoft calendars in total are bounded by closed schemas.
- The extension stores only selected account/calendar metadata, minimized normalized event fields, bounded delta links, and stable recovery codes locally. Raw Microsoft responses never pass through Supabase.
- Refresh tokens are designed for hosted encrypted custody. Short-lived access tokens remain memory-only and travel only to exact Microsoft Graph calendar routes. The Microsoft runtime now requires the independent `TAB_TWO_MICROSOFT_TOKEN_KEK_V1`; it cannot start from Google's provider key.
- Calendar composition preserves Microsoft, Google, and free ICS source colors and account/provider labels in the existing Calendar surface. No Microsoft-only widget or migration of free Calendar data exists.
- Metrics receives only daily numeric event counts and merged busy minutes keyed by an opaque connection UUID. Microsoft account labels, event text, calendar identifiers, URLs, cursors, provider responses, tokens, and credentials are excluded from Metrics, backup, encrypted sync, diagnostics, and logs.
- Partial-account, offline, rate-limit, entitlement, and reconnect paths retain the last complete local schedule. Disconnect removes the exact local connection and hosted authority contract without claiming to sign the customer out of Microsoft or revoke the Microsoft grant.

## Hosted sandbox activation

- The owner approved the exact 12-item Microsoft Entra and hosted Supabase checklist before mutation. The registered `Tab Two Calendar` application supports organizational directories and personal Microsoft accounts, uses only `https://ovlobmvxtryitupxwylg.supabase.co/functions/v1/microsoft-calendar-oauth-callback`, and remains an unverified publisher application.
- Microsoft Graph has exactly four delegated permissions: `openid`, `offline_access`, `User.Read`, and `Calendars.ReadBasic`. Each portal row reports that admin consent is not required by default. No application permission or tenant-wide admin consent was added.
- The 180-day `Tab Two Supabase sandbox` client credential expires on 2027-03-02. Its one-time value was copied directly into Supabase secret storage without being printed or written to a file, then removed from the system clipboard. Only the names `MICROSOFT_CALENDAR_OAUTH_CLIENT_ID`, `MICROSOFT_CALENDAR_OAUTH_CLIENT_SECRET`, and `TAB_TWO_MICROSOFT_TOKEN_KEK_V1` were inspected afterward.
- Only migration `20260903000800_microsoft_calendar_provider.sql` was applied. Only `microsoft-calendar-oauth-start`, `microsoft-calendar-oauth-callback`, `microsoft-calendar-connections`, `microsoft-calendar-session`, and `microsoft-calendar-disconnect` were deployed. The callback is the sole JWT-disabled endpoint; the other four require JWT verification.
- Production source `191eb88629a5f750d2e8bd8fe338aaeec8299138` enables `microsoftCalendarEnabled`. This exposes the connector to entitled customers but does not grant Graph access, connect an account, publish the Entra app, or turn on a customer setting automatically.
- The exact synthetic hosted matrix passed 13 policy and isolation interactions in 9 function invocations and 1,695 response bytes. It used no owner data. Cleanup left zero synthetic accounts, Auth users, provider connections, OAuth transactions, and rate-limit rows. Evidence: `artifacts/qa-microsoft-calendar-hosted/191eb88629a5f750d2e8bd8fe338aaeec8299138/evidence.json`.
- Independent metadata-only inspection found migration count 1, all four provider constraints, exactly five ACTIVE version 1 functions with the intended JWT split, all three required secret names, and zero PM-P7 QA Auth users, identities, or rate-limit rows. No ciphertext, customer row, secret value, or calendar content was read.

## Review and focused repair

One bounded complete-diff review covered provider/account isolation, exact scopes, PKCE and nonce binding, callback validation, tenant-aware OIDC verification, token custody, refresh rotation, Graph route allowlists, bounded parsing, delta atomicity, optional-origin ownership, backup/sync exclusion, aggregate-only Metrics, disconnect behavior, accessibility, Calendar composition, and production/preview isolation.

The review found one Important security issue before activation: the Microsoft runtime selected the existing Google provider KEK. The focused repair introduced a direct selected-key crypto boundary, requires `TAB_TWO_MICROSOFT_TOKEN_KEK_V1` in the Microsoft runtime, and added a regression test that rejects the Google key name there. The focused rereview found no remaining Critical or Important issue at the local PM-P7 ceiling.

The first full-suite pass then exposed three stale expected-value assertions for schema version 24 and the newly complete Microsoft Settings registry. Those contract assertions were aligned and their focused 307-test set passed. No production behavior changed in that correction.

## Stabilized verification

| Gate | Result |
|---|---|
| Whole repository | `npm test -- --run`: 272 files, 4,333 tests passed |
| Local database | `npm run test:supabase-local`: 6 pgTAP files, 311 tests passed |
| Database lint | `npx supabase db lint --local --level error`: zero schema errors |
| Provider and account Edge functions | 7 files, 214 tests passed |
| Dependency audit | Cache-backed `npm audit --offline --audit-level=high`: 0 vulnerabilities; the live npm advisory bulk endpoint stalled twice after registry ping succeeded |
| Exact build isolation | Preview 312 modules, account-local 359 modules, production 361 modules; production restored by the harness |
| QA contract | 7 Node tests passed |
| Installed-extension QA | 13 named states, 4 viewports, 14 PNGs, and exact source/build provenance passed |
| Diff hygiene | `git diff --check`: passed |

The repository-wide suite retains its pre-existing React `act(...)` warning in `App.test.tsx`, and Vite retains its existing large-chunk advisory. The live npm audit did not return after posting its advisory request under either npm 10.5.0 or npm 12.0.2; the same lockfile passed the cache-backed audit with zero findings, and no dependency or lockfile changed in PM-P7. These are recorded warnings, not hidden green claims.

## Installed-extension evidence

Evidence directory: `docs/superpowers/qa/microsoft-calendar/6087d131a3fbb641d392d8a123ea87fa707c3d5f/`

The exact installed MV3 matrix used synthetic data only before hosted activation. It captured:

- the pre-activation production lock with Microsoft compiled off and no provider request;
- read-only consent, opening progress, calendar selection, separate personal/work accounts, organization approval, partial-account recovery, reconnect with retained events, disconnect plus optional Metrics-history deletion, and touch selection;
- composed Microsoft, Google, and ICS events in full, stacked, and docked Calendar presentations;
- desktop `1600x900`, short `1408x600`, ultrawide `3440x1440`, and touch-enabled `390x844` with no horizontal overflow or escaped surface;
- keyboard focus, focus restoration, visible permission disclosure, reduced-motion fallback, a 44 px primary touch action, and a 57 px calendar selection row.

The request ledger contains eleven fixture-fulfilled calls, all to `graph.microsoft.com` under `/v1.0/me/calendars`: two calendar-list calls from desktop, one from touch, two desktop delta calls, and six short-viewport delta calls. The composed Calendar uses a fresh scoped Google snapshot and manual refresh preference; its visible `Google focus` event is asserted while the request ledger proves zero Google traffic. The short profile intentionally returned one synthetic 403 and one synthetic 401 for the work account while the personal account remained current. Chromium's two expected resource-status console messages are retained separately as fixture evidence. Wire requests, unexpected origins, application console errors, page errors, failed requests, unexpected storage keys, and secret-looking stored values are all zero.

The retained screenshots are:

- `production-locked.png`
- `read-only-consent.png`
- `connecting.png`
- `calendar-selection.png`
- `personal-and-work.png`
- `disconnect-history.png`
- `composed-calendar-full.png`
- `composed-calendar-stacked.png`
- `composed-calendar-docked.png`
- `organization-approval.png`
- `partial-account.png`
- `reconnect-retained.png`
- `personal-and-work-ultrawide.png`
- `touch-selection.png`

## Remaining manual ceilings

The local and synthetic hosted matrices do not claim a real Microsoft authorization-code exchange, renewable-token lifecycle, live Calendar discovery/delta response, organizational tenant policy, provider-side grant revocation, native Chrome optional-host prompt, stable Chrome popup lifecycle, physical MacBook behavior, or real assistive-technology speech and interaction. Those owner checks remain in `TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md` for the final cumulative handoff.

PM-P7 Task 12 is complete at the hosted sandbox boundary. General provider publication, verified publisher status, tenant-wide consent, Supabase Pro, live Stripe, merge, package, release, and every Chrome Web Store action remain separately gated.

## Repository integrity

The protected untracked `artifacts/`, `docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md`, and every pre-existing `docs/superpowers/qa/google-calendar/<sha>/` directory remained present and unstaged. The new Microsoft Calendar evidence directory is intentionally untracked. The protected original checkout at `D:\DEV\Chrome plugin` remained clean. Local HEAD, upstream, and the remote branch are required to match at the final checkpoint.
