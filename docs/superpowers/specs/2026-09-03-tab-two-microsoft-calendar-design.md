# Tab Two PM-P7 Microsoft Calendar Design

**Status:** Owner-approved architecture and copy contract. Documentation authority only. Local implementation, Microsoft Entra registration, hosted changes, permissions, secrets, deployment, release, merge, and Chrome Web Store actions remain separately gated.

**Approved:** 2026-09-03

**Program:** `docs/superpowers/plans/2026-09-01-tab-two-paid-mvp-program.md`

**Product architecture:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`

**Threat model:** `docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md`

## Goal

Add a polished premium Microsoft Calendar connector for personal Outlook.com and Microsoft 365 work or school accounts. Customers can connect multiple Microsoft identities, choose calendars, preserve provider colors, view normalized events alongside Google Calendar and the existing free Calendar authorities, and contribute aggregate-only calendar-load Metrics without Tab Two receiving raw calendar content.

## Customer outcomes

- Connect personal and organizational Microsoft accounts through Microsoft's own account-selection and consent experience.
- Choose calendars from each connection and recognize them by their Microsoft color and account ownership.
- See Microsoft events in the existing provider-neutral Calendar composition without changing Google Calendar, ICS, Month Calendar, or Public Holidays ownership.
- Keep the last complete local schedule visible during transient provider, network, entitlement, or reconnect failures.
- Disconnect one Microsoft account without affecting another account, Google Calendar, free Calendar sources, local data, or unrelated Metrics history.
- Understand organization-policy failures through concise, actionable copy rather than a customer-facing limitations list.

## Non-goals

- Creating, changing, deleting, accepting, declining, or sending calendar events or invitations.
- Reading mail, contacts, files, Teams data, event bodies, attachments, extensions, attendees, organizers, locations, descriptions, or meeting links.
- Proxying Microsoft calendar payloads through Supabase.
- Background service-worker polling, push subscriptions, webhooks, server-side calendar ingestion, or analytics.
- Syncing provider tokens, access capabilities, account labels, calendar IDs, delta links, provider caches, or raw provider responses.
- Replacing or coupling the existing free `ics`, `monthCal`, or `publicHolidays` authorities.
- General customer availability, verified-publisher status, production provider publication, packaging, release, merge, or Chrome Web Store work in PM-P7 local implementation.

## Approved approach

Use the provider-neutral domain established in PM-P6 with a Microsoft-specific adapter and independently named OAuth functions. Do not convert the proven Google functions into one dynamic provider endpoint. Shared code may be extracted only where behavior remains closed, typed, provider-bound, and covered by compatibility tests.

This approach was selected over:

1. A fully generic hosted OAuth service, because changing the verified Google path would couple provider rollback and increase regression impact.
2. Browser-only public-client OAuth, because renewable Microsoft credentials would need to persist in the extension and would violate Tab Two's existing token-custody boundary.

Microsoft Calendar has its own runtime feature flag, OAuth registration, callback, secrets, versioned token-encryption key, local storage namespace, request gateway, refresh ownership, error state, and rollback path.

## Authorization contract

### Supported accounts

The future dedicated Microsoft Entra application uses the supported account type for accounts in any organizational directory and personal Microsoft accounts. Authorization uses the Microsoft identity platform v2 `common` authority and authorization-code flow with PKCE.

### Exact scopes

Request exactly:

```text
openid
offline_access
https://graph.microsoft.com/User.Read
https://graph.microsoft.com/Calendars.ReadBasic
```

- `openid` establishes the OIDC identity boundary and nonce validation.
- `offline_access` permits the hosted broker to receive a renewable credential when Microsoft grants one.
- `User.Read` supplies reliable account identity and display labeling across personal and organizational accounts.
- `Calendars.ReadBasic` supplies calendar discovery and basic event properties while excluding event bodies, attachments, and extensions.

Do not request `Calendars.Read`, `Calendars.ReadWrite`, `Calendars.Read.Shared`, application permissions, mail, contacts, files, Teams, directory, or administrative scopes.

The callback accepts a connection only when the token response proves both required Microsoft Graph delegated scopes. Store the canonical approved four-scope array after validation rather than trusting provider response ordering. Missing required authority fails closed. Unexpected broader Microsoft Graph calendar authority fails closed and does not create or update a connection.

### Consent posture

The initial customer gesture deliberately requests the optional `https://graph.microsoft.com/*` origin and explains Chrome's native host wording before opening Microsoft OAuth. Account selection remains explicit for every new connection. Account sign-in and connector consent remain separate.

Organization-specific consent policy can still require administrator approval even though the selected delegated scopes do not ordinarily require it. That state must remain actionable and must not be reported as a generic network or password failure.

## Customer-facing copy contract

Primary promise:

> Bring the Outlook and Microsoft 365 calendars you choose into one calm schedule. Tab Two keeps your agenda and private calendar-load trends current, while every event remains read-only.

Quiet privacy disclosure adjacent to the connection action:

> Microsoft sends calendar data directly to this browser. Tab Two's service keeps an encrypted connection token so this installation can reconnect, but it never receives your event details. Calendar details and sync cursors stay on this device and are excluded from backup, encrypted sync, diagnostics, and logs.

Short permission reassurance:

> Tab Two requests basic read access for the calendars you choose. It cannot change events or send invitations.

Approved recovery labels:

- `Reconnect Microsoft`
- `Your organization needs to approve Tab Two before this account can connect.`
- `Your saved schedule is still available. Tab Two will update it when Microsoft reconnects.`

Do not place a red limitations column or an exhaustive list of inaccessible Microsoft data on the conversion surface. Lead with the benefit and read-only promise, then present privacy details quietly and accurately.

## OAuth topology

1. The signed-in extension verifies a current `multi_account` plus `microsoft_calendar` capability and an enabled Microsoft Calendar runtime flag.
2. From the customer's Connect gesture, the extension requests the optional Graph origin and calls `microsoft-calendar-oauth-start` with a random client nonce and the exact `chrome.identity.getRedirectURL('microsoft-calendar')` final return URL.
3. The start function authenticates the Tab Two session, resolves the account, verifies current capabilities, exact production extension ID, redirect allowlist, connection limit, and rate limits, then writes a ten-minute single-use transaction. The transaction binds the account, provider, state hash, nonce hash, encrypted PKCE verifier, exact final redirect, correlation ID, and expiry.
4. The function returns only a Microsoft v2 authorization URL for the `common` authority with the exact approved scopes, PKCE challenge, state, nonce, callback URI, and explicit account selection.
5. The extension opens `chrome.identity.launchWebAuthFlow({ interactive: true })`. Microsoft owns credential entry, account selection, organization policy, and consent.
6. Microsoft redirects only to the dedicated hosted `microsoft-calendar-oauth-callback` URI. The callback atomically consumes state, checks expiry and redirect binding, exchanges the code with PKCE and the hosted confidential-client secret, and validates audience, nonce, tenant-aware issuer, token time bounds, and supported account type.
7. The callback obtains only stable account identity and display metadata under `User.Read`. The private provider subject is the validated tenant ID plus Microsoft object ID. The validated tenant classification supplies the non-secret `personal` or `work_or_school` account-kind label; it is never guessed from an email domain. Missing or inconsistent identity claims fail closed.
8. The callback encrypts a new refresh token with the Microsoft-specific versioned key. Reconsent without a new refresh token may preserve the existing encrypted token only for the exact same account-owned connection.
9. The callback upserts one `(account_id, provider, provider_subject)` connection and redirects to the pre-bound `chromiumapp.org` result URL with only a stable success or error code and the client nonce. No token or customer identity appears in that redirect.
10. The extension validates the returned origin, path, nonce, and result, discards the URL, and fetches the authenticated Microsoft connection list.
11. `microsoft-calendar-session` verifies the Tab Two session, current capabilities, feature flag, connection ownership, status, and rate limits. It refreshes server-side if necessary and returns only a short-lived Microsoft access token, its expiry, provider ID, and opaque connection UUID.
12. The extension holds the access token in memory and sends it only to exact HTTPS Microsoft Graph v1.0 paths. It is never placed in local storage, sync, backup, diagnostics, logs, URLs, DOM attributes, or screenshots.

## Hosted authority

### Proposed migration

Create one append-only PM-P7 migration after local design and visual approval. It may:

- add `microsoft_calendar` to the private provider ID enum;
- add nullable account-kind metadata constrained to null for Google and `personal` or `work_or_school` for Microsoft;
- replace the Google-only scope constraint with a provider-specific exact-scope constraint;
- extend OAuth final-redirect validation with the exact `/microsoft-calendar` return path;
- generalize the closed provider repository procedures only as required for the new provider;
- retain default-deny access, service-role-only private tables, account ownership, uniqueness, size bounds, expiry bounds, rate limits, and deletion behavior;
- add pgTAP tests proving Google constraints remain unchanged and Microsoft rows cannot cross provider or account boundaries.

Do not rewrite migration 00700 or mutate existing Google rows.

### Proposed functions

- `microsoft-calendar-oauth-start`, JWT protected
- `microsoft-calendar-oauth-callback`, public only for the exact Microsoft redirect and single-use state transaction
- `microsoft-calendar-connections`, JWT protected
- `microsoft-calendar-session`, JWT protected
- `microsoft-calendar-disconnect`, JWT protected

The functions use Microsoft-specific configuration and may reuse provider-neutral repository, validation, rate-limit, and cryptographic primitives only through explicit dependency injection.

### Proposed hosted secrets

- `MICROSOFT_CALENDAR_OAUTH_CLIENT_ID`
- `MICROSOFT_CALENDAR_OAUTH_CLIENT_SECRET`
- `TAB_TWO_MICROSOFT_TOKEN_KEK_V1`

The Microsoft KEK is random, independently versioned, and not reused for Google provider tokens or encrypted sync. Secret values must never be printed, copied into source-controlled files, returned by a function, embedded in evidence, or inspected after creation.

## Connection and storage domain

- Extend `ProviderId` to the closed union `google_calendar | microsoft_calendar` only in PM-P7.
- Validate provider-specific exact scopes and reject unknown providers, statuses, properties, or secret-looking extra keys.
- Add `accountKind: 'personal' | 'work_or_school' | null` to public connection metadata. It is null for Google and required for Microsoft.
- Allow at most five active or reconnect-required connections per provider and ten provider connections overall while the two providers exist.
- Preserve deterministic ordering by provider, status, display email, creation time, and opaque connection UUID.
- Keep private provider subject, tenant ID, object ID, token ciphertext, token fingerprint, encryption metadata, PKCE material, and refresh timestamps out of the public extension connection shape.
- Use a separate append-only local `microsoftCalendar` authority. Never place Microsoft state under `ics`, `googleCalendar`, `monthCal`, or `publicHolidays` keys.
- Store only rebuildable normalized event snapshots, selected calendar metadata, bounded delta links, window bounds, refresh timestamps, and stable local error state.
- Exclude every Microsoft provider storage key from JSON backup, encrypted product sync, diagnostics, and logs.

Each installation chooses its own Microsoft calendars. Server-held connections may be rediscovered after Tab Two sign-in, but calendar selections do not silently propagate to another device.

## Microsoft Graph request contract

### Gateway

The production gateway permits only `https://graph.microsoft.com/v1.0/*` and rejects credentials in URLs, redirects, non-HTTPS schemes, unknown hosts, non-v1.0 roots, encoded path confusion, and unbounded responses. Send the bearer token only in the `Authorization` header.

Follow `@odata.nextLink` and `@odata.deltaLink` only after validating the exact HTTPS Graph host, allowed v1.0 route family, expected connection and calendar operation, URL length, and response budget. Never follow an arbitrary redirect or provider-supplied non-Graph URL.

### Calendar discovery

Use a paginated request equivalent to:

```text
GET /v1.0/me/calendars?$select=id,name,color,hexColor,isDefaultCalendar,canViewPrivateItems
```

Normalize only:

- opaque calendar ID;
- safe display name;
- valid `#RRGGBB` `hexColor` when supplied;
- Microsoft color enum for deterministic fallback mapping;
- default-calendar state;
- whether basic event reads are usable.

Prefer a valid Microsoft hex color. Map `auto`, missing, malformed, or low-contrast colors to the deterministic Tab Two provider palette while preserving a non-color source label and accessible contrast.

Cap discovery at 250 calendars per connection, selection at ten calendars per Microsoft account, and selection at twenty Microsoft calendars across all Microsoft connections.

### Incremental events

Use a separate bounded `calendarView/delta` series per selected calendar and local time window. The initial window is 31 local days before today through 61 local days after today. Persist only the final validated delta link after every page succeeds and the replacement snapshot passes all bounds.

Microsoft does not support `$select` on this delta operation. `Calendars.ReadBasic` therefore provides the upstream privacy boundary, and the extension must immediately discard every field outside the normalized allowlist:

- event ID;
- subject rendered through the existing safe-text rules;
- start and end;
- all-day state;
- cancellation state;
- `showAs` availability;
- sensitivity;
- event type and series-master ID;
- last-modified timestamp;
- calendar ID only until the provider-neutral source key is created.

Do not persist or render raw provider JSON. Do not retain bodies, previews, locations, attendees, organizers, response status, categories, recurrence rules, online-meeting data, attachments, extensions, or web links.

Paginate atomically. An interrupted or invalid page sequence keeps the prior complete snapshot and cursor. A provider response indicating an invalid or expired delta capability resets only the affected calendar and performs a bounded full rebuild. A rolling-window change starts a new initial query rather than reusing a cursor bound to different dates.

Per Microsoft connection, cap retained normalized instances at 10,000, decoded response traffic at 5 MiB per refresh, and concurrent Microsoft requests at four. Exceeding a cap produces a visible partial or error state and never silently reports complete success.

## Calendar composition

Translate Microsoft events into the existing provider-neutral `CalendarEvent` contract with an opaque composite source key, safe title, normalized time bounds, all-day state, calendar color, source label, and connection ownership. Do not add Microsoft-only fields to free Calendar authorities.

Composition must:

- preserve free ICS, Month Calendar, Public Holidays, and Google Calendar source ownership;
- show account and calendar identity without relying on color alone;
- tolerate one failed account while retaining usable results from every other source;
- remove only the disconnected connection's Microsoft rows and cursors;
- retain the last complete Microsoft snapshot during offline, entitlement-expired, rate-limited, or reconnect-required states;
- stop new provider sessions and refresh when entitlement is absent while leaving free sources fully operational.

## Refresh ownership

Reuse the visible-document refresh model and existing refresh preference semantics. One Web Lock owner coordinates Microsoft refresh work. Refresh on connection completion, saved selection, visible Calendar activation, explicit connector retry, and the bounded visible-document interval. Do not add a customer-facing general refresh control to Account & Sync, invisible background polling, alarms, push channels, or service-worker ownership.

The connector action may show an inline progress indicator with reduced-motion behavior while a requested operation is active. Do not let the enable or connection control become stuck because a provider refresh failed.

## Metrics contract

For each Microsoft provider connection, emit only closed-schema daily Calendar Metrics with the opaque connection UUID as `sourceInstanceId`:

- event count;
- merged busy minutes.

Reuse the existing collector semantics that clip spans to local calendar days and merge overlapping intervals before calculating busy minutes. Never copy titles, account labels, calendar IDs, provider URLs, tenant IDs, event IDs, or raw Microsoft values into Metrics. Metrics collection remains capability-gated and follows the existing 13-calendar-month retention and deletion rules.

Disconnect offers a separate explicit deletion choice for that connection's aggregate history. Disconnecting never deletes Microsoft events.

## Failure and recovery contract

Stable states include:

- provider unavailable or not configured;
- pre-consent;
- connecting;
- discovering calendars;
- active;
- active with a partial account failure;
- offline with retained schedule;
- entitlement expired with retained schedule;
- reconnect required;
- organization approval required;
- rate limited;
- local save failed;
- disconnect confirmation;
- disconnected with optional aggregate-history deletion.

Errors must preserve account ownership, the last successful refresh time, and retained-data truth. A Microsoft organization-policy denial receives the approved organization-approval message. Consent cancellation is neutral and does not create an error connection. OAuth state, issuer, nonce, scope, identity, ownership, or redirect validation failures are security failures with stable non-sensitive codes and no connection mutation.

Microsoft does not expose a safe narrowly scoped token-revocation operation under the approved permissions. Disconnect therefore deletes the encrypted refresh token and connection record, discards the memory-held access token, clears that connection's local cache and cursors, and truthfully stops future Tab Two access. Do not claim that disconnect signs the customer out of Microsoft or deletes Microsoft calendar data.

## Visual contract

Use the approved Tab Two dark surfaces, restrained cyan accent, Space Grotesk display hierarchy, Inter body copy, calm borders, visible keyboard focus, 44 CSS px coarse-pointer targets, and reduced-motion behavior. Microsoft branding identifies the provider but does not replace the Tab Two design system.

Avoid generic card grids, ornamental gradients, excessive pills, decorative motion, inaccessible provider colors, or disabled controls that look actionable. Use concise progressive disclosure and keep the benefit visible before technical privacy detail.

Before production Microsoft Calendar React or CSS changes, create and attach original-resolution static mockups for:

1. provider unavailable or locked;
2. pre-consent benefit and privacy disclosure;
3. connecting and discovery progress;
4. single-account calendar selection;
5. personal plus work multi-account summary;
6. organization approval required;
7. reconnect with retained schedule;
8. disconnect and aggregate-history choice;
9. composed Calendar with Microsoft, Google, and free sources;
10. touch-width interaction and overflow behavior.

The mockup harness must use deterministic fixtures, make zero external requests, inspect every PNG at original resolution, and prove no console errors, failed requests, viewport escape, root horizontal overflow, clipped copy, color-only meaning, or sub-44 px coarse-pointer actions.

## Verification strategy

Implementation planning must use observed RED/GREEN for each bounded unit and preserve the program's one-review, one-stabilized-gate rule.

Required automated coverage includes:

- provider-specific exact parsing, limits, ordering, and Google compatibility;
- authorization URL, PKCE, state, nonce, redirect, issuer, audience, account type, identity, and exact-scope validation;
- encrypted token custody, Microsoft-specific key context, refresh rotation, reconnect state, ownership, rate limits, and deletion;
- exact Graph host and route allowlists, bearer handling, pagination, next-link and delta-link validation, response caps, atomic cursors, invalid-delta recovery, and malicious payload rejection;
- calendar discovery, color fallback, selection limits, local migration, backup/sync/privacy exclusions, cache isolation, and disconnect cleanup;
- provider-neutral Calendar composition with free ICS, Month Calendar, Public Holidays, and Google Calendar unchanged;
- aggregate-only Metrics output and scoped history deletion;
- UI keyboard, touch, reduced-motion, focus, error, retained-data, organization-policy, multi-account, and partial-failure states;
- production fixture exclusion, credential-value scans, exact-provenance builds, and installed-extension Chromium evidence.

Owner hands-on testing remains deferred to the cumulative PM-P9 checklist. Automated tests and local installed-extension fixtures continue during PM-P7.

## Approval and activation gates

### Gate 1: This design authority

Owner approval authorizes writing this specification only.

### Gate 2: Implementation plan and original-resolution visual packet

After this written authority is reviewed, create `docs/superpowers/plans/2026-09-01-tab-two-microsoft-calendar.md` and deterministic mockups. Owner approval of the scopes, consent copy, privacy copy, OAuth topology, optional Graph origin request, and every visual state authorizes local TDD implementation only.

### Gate 3: Local implementation review

Complete focused tests, the bounded Critical/Important review, one permitted fix and rereview cycle, the stabilized full gate, exact builds, scans, and installed-extension fixture proof. This does not activate Microsoft OAuth.

### Gate 4: Microsoft and hosted sandbox activation

Require a fresh exact owner approval before:

- creating or editing a Microsoft Entra application;
- selecting the multitenant plus personal-account audience;
- adding the exact callback URI or delegated Graph permissions;
- creating a client secret;
- storing the three hosted secrets;
- applying the PM-P7 database migration;
- deploying the five Microsoft functions;
- enabling the production feature flag;
- requesting the Graph optional origin in the owner's installation;
- using any named sandbox identity or data category.

The activation checklist must identify cost, account scope, redirect, exact permissions, test identities, data categories, mutation list, deletion plan, and rollback before approval.

### Gate 5: Production provider readiness

Verified publisher status, general organizational consent readiness, privacy/legal updates, broader audience availability, and any production publication remain separate from sandbox activation. Microsoft notes that tenant consent policies can block unverified multitenant applications, so automated or owner sandbox success must not be presented as broad enterprise readiness.

Supabase Pro, live Stripe, package, release, merge, and every Chrome Web Store action remain separately gated throughout PM-P7.

## Rollback

Disable `microsoftCalendarEnabled`, stop deploying or route access to only the Microsoft functions, remove the optional Graph origin after the last Microsoft connection when no other approved connector owns it, delete Microsoft provider connections and token ciphertext when explicitly required, and clear only Microsoft local caches and cursors.

Rollback must preserve:

- Google Calendar connections and local data;
- free ICS, Month Calendar, and Public Holidays;
- local settings and all fifteen existing free connectors;
- unrelated encrypted-sync data and Metrics history;
- Tab Two account sign-in and Stripe sandbox billing.

Do not roll back or edit migration 00700, the Google OAuth client, Google secrets, Google functions, existing provider rows, or any free Calendar authority to disable Microsoft Calendar.

## Primary references

- [Microsoft identity platform OAuth 2.0 authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Microsoft identity platform supported account types](https://learn.microsoft.com/en-us/entra/identity-platform/supported-accounts-validation)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [List calendars](https://learn.microsoft.com/en-us/graph/api/user-list-calendars?view=graph-rest-1.0)
- [Calendar resource](https://learn.microsoft.com/en-us/graph/api/resources/calendar?view=graph-rest-1.0)
- [Calendar view](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0)
- [Event delta query](https://learn.microsoft.com/en-us/graph/delta-query-events)
- [Microsoft identity platform publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)
