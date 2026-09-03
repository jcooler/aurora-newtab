# Tab Two PM-P6 Multi-account & Google Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable account-scoped premium-connector foundation and a polished read-only Google Calendar connection that discovers calendars, preserves their colors, combines multiple Google accounts with the free ICS source in the existing Calendar, updates incrementally, feeds aggregate-only calendar metrics, and cleanly disconnects without ever sending event content through Tab Two's backend.

**Architecture:** Tab Two uses a separate Google OAuth web client and a Supabase Edge broker for authorization-code exchange, refresh-token custody, revocation, and account-scoped connection metadata. The broker stores each refresh token encrypted with a versioned provider-token key and returns short-lived Google access tokens only to an authenticated entitled extension. The extension holds an access token in memory, calls `www.googleapis.com` directly after a user-granted optional origin permission, and stores only a local rebuildable response cache plus local incremental cursors. The existing `ics`, `monthCal`, and `publicHolidays` authorities remain independent and free; a provider-neutral calendar composition layer merges display rows without merging source ownership.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Testing Library, Playwright Chromium, Chrome MV3 `identity.launchWebAuthFlow`, existing optional per-origin permissions, Vite production/account-local/preview builds, Supabase Auth/Postgres/Edge Functions, Web Crypto/AES-256-GCM, Google OAuth 2.0, and Google Calendar API v3.

**Product spec:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`

**Threat model:** `docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`. Preserve `artifacts/` and `docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md` exactly, and keep `D:\DEV\Chrome plugin` untouched.
- All 15 current connectors, including ICS Calendar, and every current local feature remain free. Google Calendar is additive premium convenience and must not replace, rename, disable, migrate, or share storage ownership with `ics`, `monthCal`, or `publicHolidays`.
- Google Calendar is read-only. Never request event, calendar, ACL, settings, or free/busy write authority. Do not add Gmail, Contacts, Drive, or profile scopes beyond `openid` and `email` for stable connection identity.
- Exact requested scopes are `openid`, `email`, `https://www.googleapis.com/auth/calendar.calendarlist.readonly`, and `https://www.googleapis.com/auth/calendar.events.readonly`. Do not substitute broader `calendar.readonly` or any write scope.
- Account sign-in and connector authorization remain separate. A customer explicitly starts each Google Calendar connection and deliberately selects the Google account in Google's own system browser flow.
- True Stable Chrome multi-account support uses a separate OAuth web client and server-side refresh-token custody. Do not use `chrome.identity.getAccounts()` because it is not available on Stable. Do not reuse the Tab Two account-sign-in OAuth client.
- Store provider client secrets and refresh tokens only in protected hosted authority. Encrypt refresh tokens at rest with a separately versioned provider-token KEK. Never put a provider client secret, refresh token, token ciphertext, or service-role secret in the extension, source-controlled environment, logs, diagnostics, screenshots, sync, or JSON backup.
- The extension may receive a short-lived provider access token only after authenticated account binding and current `multi_account` plus `google_calendar` capabilities. Hold it in memory, never persist it, and send it only to `https://www.googleapis.com/calendar/v3/*`.
- Raw Google event, calendar, attendee, location, conference, description, recurrence, and response payloads never pass through Supabase. The extension requests a minimized field set directly from Google and stores normalized rebuildable snapshots in the existing local cache authority, which is excluded from backup and sync.
- Local Google calendar IDs, selected calendar metadata, sync tokens, and account labels are private provider metadata. Exclude them from JSON backup, encrypted product sync, diagnostics, and logs in PM-P6. Cross-device users may reuse server-held account connections after sign-in, but each installation chooses its own displayed calendars until a later separately approved encrypted preference design.
- Metrics receive only daily event count and merged busy minutes with the opaque provider connection UUID as `sourceInstanceId`. Never emit titles, attendees, locations, calendar IDs, account labels, URLs, or raw provider data.
- Provider refresh uses one visible-document Web Lock owner, existing refresh preference semantics, bounded retry with jitter, and truthful retained-data/offline/reconnect states. No service-worker polling, push channels, invisible background sync, or backend event ingestion.
- Subscription expiry keeps the last normalized local result visible but stops provider token issuance and refresh. Free ICS continues refreshing under its own policy. Restoring entitlement resumes only after a valid connection session is obtained.
- Disconnect revokes the exact Google grant when possible, always deletes the exact account-owned provider connection and token ciphertext, clears only that connection's local snapshot and cursors, and offers a separate explicit deletion of that connection's aggregate Metrics history. Disconnect never deletes Google events or free ICS data.
- Owner hands-on QA remains deferred to the final cumulative checklist. Developer RED/GREEN tests, local Supabase tests, exact builds, scans, and automated real-extension Chromium continue normally.
- Perform one bounded complete-diff review. Only Critical or Important findings block. Apply at most one focused fix and rereview cycle, then run one stabilized full gate.
- Do not create or edit a production Google OAuth client, consent screen, secret, test-user roster, verified domain, or Calendar API activation; do not set a hosted provider-token KEK; do not deploy a provider function or migration; and do not request the Google API optional host origin in the owner's installation until the exact PM-P6 activation gate is approved.
- Do not provision Supabase Pro, enable live Stripe, add install-time Chrome permissions, merge, package, release, distribute, or mutate the Chrome Web Store without their own explicit gates.
- Create and attach original-resolution PM-P6 mockups, then stop for owner approval of the architecture, scopes, consent copy, privacy copy, and visual contract before production Google Calendar React or CSS changes.

## Frozen Product & Security Contract

### Customer promise

Use this pre-consent copy exactly unless the visual gate approves a replacement:

> See the calendars you choose from one or more Google accounts. Tab Two reads calendar names, colors, and selected events so your agenda and private calendar-load metrics stay current. Your calendar stays yours: Tab Two only displays what you select and never changes events or sends invitations.

Use this privacy disclosure immediately beside the connection action:

> Google sends calendar data directly to this browser. Tab Two's service keeps an encrypted connection token so this installation can reconnect, but it does not receive your event details. No Gmail, Drive, or Contacts access is requested. Event details and sync cursors stay on this device and are never included in Tab Two backup, encrypted sync, diagnostics, or logs.

### Approved OAuth topology, pending owner gate

1. The signed-in entitled extension calls `google-calendar-oauth-start` with a random client nonce and the exact `chrome.identity.getRedirectURL('google-calendar')` final return origin.
2. The start function validates the Tab Two session, current `multi_account` plus `google_calendar` capabilities, exact production extension ID, rate limit, and redirect allowlist. It writes one hashed, ten-minute, single-use transaction containing account ID, state hash, PKCE verifier ciphertext, client nonce hash, and exact final redirect. It returns only Google's authorization URL.
3. The extension starts `chrome.identity.launchWebAuthFlow({ interactive: true })` from the customer's click. Google owns account selection and consent.
4. Google redirects to the exact hosted `google-calendar-oauth-callback` URI. The callback consumes state once, checks expiry and redirect binding, exchanges the code with PKCE and the server-held web-client secret, validates issuer/audience/nonce of the returned ID token, encrypts any refresh token, upserts one `(account_id, provider, provider_subject)` connection, and redirects to the exact pre-bound `chromiumapp.org` result URL with only a success or stable error code.
5. The extension discards the returned browser URL after checking origin/path/nonce and calls the authenticated connection-list endpoint. No provider token or customer identity travels in the final redirect.
6. `google-calendar-session` authenticates the Tab Two account, checks current capability and exact connection ownership, refreshes server-side when necessary, and returns a short-lived Google access token with its expiry plus the opaque connection ID. The access token is never cached by Supabase responses, logs, or the extension's persistent storage.
7. From the explicit Connect gesture, the extension first requests the already-declared optional origin `https://www.googleapis.com/*` and explains Chrome's broad native host-permission wording before opening Google OAuth. After grant, it calls Calendar API v3 directly and removes the origin permission when the last Google Calendar connection is removed and no other approved connector owns it.

### Hosted schema, pending owner gate

- `private.provider_connections`: UUID primary key, internal account UUID, provider enum, provider subject, email, display name, status, exact granted-scope array, token key version, refresh-token nonce/ciphertext, refresh-token fingerprint, created/updated/revoked timestamps, and last successful token refresh timestamp. Unique `(account_id, provider, provider_subject)`. No client grants or direct public-table access.
- `private.provider_oauth_transactions`: UUID primary key, account UUID, provider, state hash, nonce hash, encrypted PKCE verifier, exact final redirect, expiry, consumed timestamp, and stable correlation ID. Ten-minute retention, one use, service-role only.
- `private.provider_rate_limits`: bounded per-account/per-IP operation windows for start, callback failure, session, and disconnect. Cleanup is explicit and tested.
- Provider token encryption uses AES-256-GCM with random 96-bit nonce and authenticated metadata containing schema version, provider, connection UUID, account UUID, and key version. `TAB_TWO_PROVIDER_TOKEN_KEK_V1` is independent from the encrypted-sync KEK.
- Hosted functions: `google-calendar-oauth-start` JWT-protected, `google-calendar-oauth-callback` public only for the exact provider redirect and state transaction, `google-calendar-connections` JWT-protected, `google-calendar-session` JWT-protected, and `google-calendar-disconnect` JWT-protected with explicit confirmation and exact authenticated ownership for token revocation and deletion.

### Google Calendar request contract

- Calendar discovery: `GET /calendar/v3/users/me/calendarList?maxResults=250&showDeleted=false&showHidden=false`, paginated. Request only `nextPageToken,nextSyncToken,items(id,summary,summaryOverride,backgroundColor,foregroundColor,colorId,primary,selected,hidden,deleted,accessRole,timeZone)`.
- Present readable calendars with `accessRole` of `reader`, `writerWithoutPrivateAccess`, `writer`, or `owner`. Disabled entries remain discoverable but not selectable when Google exposes no event-read access.
- Prefer `backgroundColor` and `foregroundColor`; use `colorId` through `GET /calendar/v3/colors` only when direct colors are absent. Preserve Google colors for source identification but enforce Tab Two contrast for text and focus.
- Initial events request per selected calendar uses `singleEvents=true`, `showDeleted=true`, `maxResults=2500`, a bounded `timeMin` of 31 local days before today and `timeMax` of 61 local days after today, and a minimized field set: `nextPageToken,nextSyncToken,timeZone,items(id,status,summary,start,end,htmlLink,hangoutLink,conferenceData(entryPoints(entryPointType,uri)),recurringEventId,originalStartTime,updated,transparency)`.
- Persist the final `nextSyncToken` and exact initial window bounds only in the local rebuildable cache. Incremental requests use the same parameters Google permits with the exact prior token, include deleted entries, paginate before committing the replacement token, and atomically apply additions/updates/deletions. Do not combine `syncToken` with `timeMin`, `timeMax`, or `orderBy`. When the local-day rolling window advances beyond the stored initial bounds, perform a new bounded full sync instead of reusing a cursor for a different query window.
- A Google `410 Gone` clears only that selected calendar's local event cache and cursor, then performs a new bounded full sync. An interrupted page sequence keeps the previous complete snapshot and token.
- Cap one connection at 250 calendars discovered and 10 selected calendars, with 20 selected calendars across all Google accounts, 10,000 normalized retained event instances, a 5 MiB decoded-response budget per refresh, and four simultaneous Google requests. Exceeding a cap yields a stable visible partial/error state rather than silently truncating success.
- Normalize provider events into provider-neutral local `CalendarEvent` records with an opaque composite source key, start/end, all-day, safe display title, safe Google event URL, optional safe Google Meet URL, calendar color, and source label. Ignore descriptions, locations, attendees, attachments, organizer identities, reminders, ACLs, and arbitrary conference entry points.

---

### Task 1: Record the PM-P6 design authority and visual approval packet

**Files:**
- Create: `docs/superpowers/plans/2026-09-01-tab-two-google-calendar.md`
- Create: `docs/superpowers/reports/TAB-TWO-GOOGLE-CALENDAR-VISUAL-SPEC.md`
- Create: `scripts/qa-google-calendar-mockups.mjs`
- Preserve generated PNGs under: `artifacts/qa-google-calendar-mockups/<source-sha>/`

**Interfaces:**
- Consumes: current source, architecture spec, threat model, Google OAuth and Calendar API primary documentation, approved Tab Two brand tokens, and the current Connector detail/Calendar composition.
- Produces: one exact architecture/scope/consent/privacy proposal plus original-resolution locked, pre-consent, single-account selection, two-account connected, reconnect, disconnect/history, composed Calendar, and touch-narrow states.

- [x] **Step 1: Freeze the separate-provider OAuth architecture**

Document why Stable Chrome multi-account requires a web-client broker, why refresh tokens remain server-side, why access tokens are memory-only, and why direct extension-to-Google requests keep raw event content out of Supabase.

- [x] **Step 2: Build the deterministic non-production visual harness**

Use static fixtures only, no Google/Supabase request and no production React/CSS. Preserve the restrained cyan brand accent, Space Grotesk display hierarchy, Inter body copy, calm dark surfaces, 44 px coarse-pointer actions, visible keyboard focus, reduced-motion behavior, and information-first progressive disclosure. Avoid a generic card grid, excessive pills, ornamental gradients, or disabled controls that look actionable.

- [x] **Step 3: Render and inspect every PNG at original resolution**

Run: `node scripts/qa-google-calendar-mockups.mjs`

Reject clipped disclosure copy, ambiguous account ownership, invisible provider failure, color-only calendar distinction, missing read-only limits, touch actions below 44 CSS px, page/root overflow, external requests, console/page errors, or a disconnect control that can be mistaken for deleting Google data.

- [x] **Step 4: Attach the PNGs and stop for the owner gate**

Request one explicit approval covering the four scopes, brokered token custody exception, consent/privacy copy, optional Google API host request, and all visual states. This visual/product approval does not authorize a Google Cloud mutation, hosted Supabase mutation, secret, function deployment, or provider activation.

- [x] **Step 5: Commit and push only after approval**

```powershell
git add docs/superpowers/plans/2026-09-01-tab-two-google-calendar.md docs/superpowers/reports/TAB-TWO-GOOGLE-CALENDAR-VISUAL-SPEC.md scripts/qa-google-calendar-mockups.mjs
git commit -m "docs: approve Google Calendar connector contract"
git push
```

---

### Task 2: Add the provider-neutral multi-account domain

**Files:**
- Create: `src/providers/types.ts`
- Create: `src/providers/connections.ts`
- Test: `src/providers/connections.test.ts`
- Modify: `src/account/capabilities.ts`
- Test: `src/account/capabilities.test.ts`

**Interfaces:**
- Produces: `ProviderId`, `ProviderConnection`, `ProviderConnectionStatus`, `ProviderSession`, strict exact-key validators, account-scoped reducers, connection limits, and capability guards.
- Consumes: internal account UUID, opaque connection UUID, current `multi_account` plus `google_calendar` lease capabilities, and stable provider error codes.

- [x] **Step 1: Write the failing domain tests**

Cover exact-key parsing; malformed UUIDs; duplicate connection identities; cross-account replacement; unknown provider/status/scope; secret-looking extra keys; expired access-token sessions; connection add/update/revoke; one broken account while another stays usable; and deterministic display ordering. Enforce duplicate provider-subject uniqueness in the private hosted schema and pgTAP coverage in Task 4 because provider subjects never enter the public extension shape.

- [x] **Step 2: Run focused tests and observe RED**

Run: `npm test -- --run src/providers/connections.test.ts src/account/capabilities.test.ts`

- [x] **Step 3: Implement the closed multi-account domain**

The public extension shape contains only connection UUID, provider, display email/name, status, exact granted scopes, and timestamps. It contains no provider subject, refresh token, access token, token fingerprint, nonce, PKCE verifier, or hosted encryption metadata. Enforce five Google Calendar accounts per Tab Two account for MVP and preserve other providers as a closed future enum entry only when their packet adds them.

- [x] **Step 4: Run focused tests and observe GREEN**

- [x] **Step 5: Commit the domain checkpoint**

---

### Task 3: Add the local Google Calendar authority without touching free ICS

**Files:**
- Modify: `src/services/connectors/types.ts`
- Modify: `src/services/connectors/registry.ts`
- Create: `src/services/connectors/googleCalendar.ts`
- Test: `src/services/connectors/googleCalendar.test.ts`
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/index.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/lib/storage/migrations.test.ts`
- Modify: `src/privacy/dataFlows.ts`
- Modify: `src/privacy/dataFlows.test.ts`
- Modify: `src/sync/connectorProjection.ts`
- Modify: `src/sync/connectorProjection.test.ts`

**Interfaces:**
- Produces: append-only `googleCalendar` connector identity, `GoogleCalendarConfig`, selected-account/calendar refs, `GoogleCalendarSnapshot`, per-calendar cursor/cache ownership, strict request/response normalization, and deny-by-default backup/sync/privacy classification.
- Consumes: provider connection UUIDs, local selected calendar metadata, source colors, current refresh policy, and short-lived access tokens supplied by Task 6.

- [x] **Step 1: Write failing registry/storage/privacy tests**

Assert `googleCalendar` is appended after all 15 existing IDs; prior connectors, layouts, layers, and schemas are byte-equivalent; the new connector defaults absent/off; full Google config and cache are excluded from backup/sync; local free mode has no Google/account request; and secret/token/cursor/raw-payload hostile fixtures cannot serialize.

- [x] **Step 2: Observe RED**

- [x] **Step 3: Implement strict discovery, event normalization, and cursors**

Use injected fetch and clock dependencies. Validate HTTPS Google endpoints, content type, response byte limits, pagination loops, duplicate pages, exact colors, dates/times, cancellation tombstones, stable event identity, safe `https://calendar.google.com/*` links, safe `https://meet.google.com/*` join links, four-request concurrency, and atomic snapshot replacement. Keep direct API JSON inside function scope and discard unused fields immediately.

- [x] **Step 4: Implement the append-only local schema migration**

Increment the storage version once. Backfill no enabled connection and no layout placement. Preserve every prior top-level key and nested connector config. Derived provider cache/cursors remain in `connectorSnapshots.googleCalendar`, never a new sync entity.

Implementation note: `src/lib/storage/index.ts` was reviewed and intentionally remains unchanged. Its generic metadata-only migration path already advances the identity-only v22 to v23 transition without a data rewrite; the existing storage regression suite proves that behavior.

- [x] **Step 5: Run focused tests and observe GREEN**

- [x] **Step 6: Commit the local authority checkpoint**

---

### Task 4: Build and prove the provider OAuth broker locally

**Files:**
- Create: `supabase/migrations/20260903000700_provider_connections.sql`
- Create: `supabase/functions/_shared/providerTypes.ts`
- Create: `supabase/functions/_shared/providerCrypto.ts`
- Create: `supabase/functions/_shared/providerAuth.ts`
- Create: `supabase/functions/_shared/providerGoogle.ts`
- Create: `supabase/functions/google-calendar-oauth-start/index.ts`
- Create: `supabase/functions/google-calendar-oauth-start/config.toml`
- Create: `supabase/functions/google-calendar-oauth-callback/index.ts`
- Create: `supabase/functions/google-calendar-oauth-callback/config.toml`
- Create: `supabase/functions/google-calendar-connections/index.ts`
- Create: `supabase/functions/google-calendar-connections/config.toml`
- Create: `supabase/functions/google-calendar-session/index.ts`
- Create: `supabase/functions/google-calendar-session/config.toml`
- Create: `supabase/functions/google-calendar-disconnect/index.ts`
- Create: `supabase/functions/google-calendar-disconnect/config.toml`
- Create: `supabase/tests/database/provider_connections.test.sql`
- Create: `supabase/functions/tests/provider-functions.test.ts`
- Create: `supabase/functions/tests/provider-crypto.test.ts`

**Interfaces:**
- Produces: the five frozen hosted contracts and default-deny private schema.
- Consumes: verified Supabase Google session, capability authority, exact extension redirect allowlist, local-only placeholder Google client values, and injected Google token/revocation transport in tests.

- [x] **Step 1: Write failing pgTAP and Edge adversary tests**

Cover RLS invisibility, service-role-only mutation, cross-account reads/deletes, duplicate subject races, scope widening, state/nonce/PKCE mismatch, callback replay, expired transaction, redirect substitution, issuer/audience mismatch, absent refresh token on first connect, refresh rotation, revoke failure cleanup, stale entitlement, session theft, access-token expiry, rate limits, cipher AAD mismatch, key-version mismatch, and log/body redaction.

- [x] **Step 2: Run local database/Edge tests and observe RED**

- [x] **Step 3: Implement the migration and cryptographic authority**

Use private tables, security-definer functions with pinned search path and revoked public execution, exact constraints, advisory locks for duplicate connection/token rotation, authenticated metadata, and bounded retention cleanup. Never return or log provider subject or token fields outside the shared private repository.

- [x] **Step 4: Implement the OAuth and lifecycle handlers**

Require JWT on all functions except callback. The callback accepts only GET, consumes one exact transaction, and emits an HTML-free 302 to the pre-bound chromiumapp result. Use stable public error codes; keep provider response bodies private and redacted. Disconnect always removes local server authority after best-effort Google revocation, returning whether revocation was confirmed.

- [x] **Step 5: Run local database reset, pgTAP, lint, and Edge tests**

- [x] **Step 6: Stop before hosted mutation**

Migration 00700, provider KEK, Google web-client secret, and every provider function remain local-only until Task 9 receives an exact owner activation approval.

- [x] **Step 7: Commit the local broker checkpoint**

---

### Task 5: Add the typed extension provider gateway and interactive OAuth flow

**Files:**
- Create: `src/providers/gateway.ts`
- Test: `src/providers/gateway.test.ts`
- Create: `src/providers/googleOAuth.ts`
- Test: `src/providers/googleOAuth.test.ts`
- Modify: `src/services/permissions.ts`
- Test: `src/services/permissions.test.ts`
- Modify: `src/account/productionAccountServiceConfig.ts`
- Modify: `src/account/previewAccountService.ts`
- Modify: `src/manifest.ts`
- Test: `src/privacy/dataFlows.test.ts`

**Interfaces:**
- Produces: build-mode provider gateway, exact OAuth return validator, in-memory token session cache, single-flight token refresh, and ownership-aware optional Google API origin grant/remove helpers.
- Consumes: current account session/capability, existing Supabase host boundary, `chrome.identity.launchWebAuthFlow`, and existing `https://*/*` optional host declaration.

- [x] **Step 1: Write gateway/OAuth RED tests**

Prove local/free/preview/production separation, no silent connect, exact final redirect and nonce, cancel vs provider denial vs backend failure, no token persistence, stale session refresh, concurrent request coalescing, entitlement expiry, sign-out cleanup, account switch cleanup, optional-origin denial, and last-owner-only permission removal.

- [x] **Step 2: Implement with no new install-time permission**

`identity` is already present in account-local and production builds. Keep the existing wildcard optional-host declaration and request only `https://www.googleapis.com/*` at the connection gesture. Preview uses deterministic fake connection/session data and never compiles a Google secret or production callback.

- [x] **Step 3: Run focused tests and observe GREEN**

- [x] **Step 4: Commit the client gateway checkpoint**

Implementation note: the existing preview account implementation is
`src/account/previewAccountClient.ts`, so that file supplies the deterministic
provider fixture named above as `previewAccountService.ts`. Production remains
configured with `googleCalendarEnabled: false` until the separate Task 9 hosted
activation gate is explicitly approved.

---

### Task 6: Add visible-tab refresh ownership, multi-account aggregation & Metrics

**Files:**
- Create: `src/providers/GoogleCalendarProvider.tsx`
- Test: `src/providers/GoogleCalendarProvider.test.tsx`
- Modify: `src/services/refreshPolicy.ts`
- Modify: `src/metrics/collectors.ts`
- Modify: `src/metrics/collectors.test.ts`
- Modify: `src/metrics/MetricsProvider.tsx`
- Modify: `src/metrics/MetricsProvider.test.tsx`
- Modify: `src/newtab/widgets/calendar/calendarComposition.ts`
- Modify: `src/newtab/widgets/calendar/calendarComposition.test.ts`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.test.tsx`

**Interfaces:**
- Produces: one visible-tab Google refresh owner; per-connection partial success; provider-neutral ordered Calendar items; distinct source color/label; and aggregate-only calendar Metrics buckets by opaque connection UUID.
- Consumes: the existing Calendar widget instead of adding a second calendar widget, existing `useConnectorSnapshot` concepts, ICS/public-holiday composition, and `collectCalendarSeries`.

- [x] **Step 1: Write failing ownership/composition/metrics tests**

Cover two Google accounts plus ICS, identical event titles across authorities, recurring instances, all-day and DST bounds, partial account failure, retained complete snapshots during pagination failure, offline behavior, Manual mode, entitlement expiry, 410 resync, source removal, busy-time interval merging within one connection, and separate metrics series across connections.

- [x] **Step 2: Implement provider-neutral composition**

Do not change ICS event IDs or cache shape. Map ICS and Google normalized events into an ephemeral `CalendarAgendaItem` input with explicit authority and source identity. Sort by start with deterministic source tie-breaks. Never deduplicate across accounts/calendars because duplicate placement can be intentional.

- [x] **Step 3: Implement refresh ownership and metrics emission**

Refresh only selected calendars for active entitled connections. A connection error cannot blank another account or ICS. Commit a connection snapshot only after every required page validates. Feed only normalized start/end/all-day values to `collectCalendarSeries` and use connection UUID as the allowed source instance ID.

- [x] **Step 4: Run focused tests and observe GREEN**

- [x] **Step 5: Commit the refresh/composition checkpoint**

Implementation note: `GoogleCalendarProvider` reuses the shared visible-document
snapshot owner and adds a bounded jittered retry path for valid partial snapshots.
The existing Calendar renderer now composes free ICS, public holidays, and selected
Google sources without cross-authority deduplication. Google event metrics are grouped
only by opaque connection UUID, while provider labels, calendar IDs, event IDs, titles,
URLs, and cursors remain outside metric history. The focused gate covers Manual mode,
entitlement expiry, offline retention, partial account success, pagination atomicity,
source removal, recurrence, all-day/DST behavior, resource caps, and Google-only
Calendar availability.

---

### Task 7: Implement the owner-approved Google Calendar UI

**Files:**
- Modify: `src/settings/connectors/connectorExperience.ts`
- Modify: `src/settings/connectors/connectorCardState.ts`
- Modify: `src/settings/sections/Connectors.tsx`
- Modify: `src/settings/sections/Connectors.test.tsx`
- Create: `src/settings/connectors/GoogleCalendarConnection.tsx`
- Test: `src/settings/connectors/GoogleCalendarConnection.test.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.test.tsx`
- Modify: `src/index.css`
- Modify when verified behavior changes: `README.md`
- Modify when verified behavior changes: `PRIVACY.md`

**Interfaces:**
- Consumes: the exact approved Task 1 visual/copy contract and Tasks 2 through 6 domain/runtime.
- Produces: locked premium entry, explicit read-only pre-consent, account connection progress, calendar discovery/selection, add-account, per-account reconnect and remove, separate history deletion choice, truthful partial/offline/expired states, and composed Calendar source context.

- [x] **Step 1: Write failing component tests**

Cover pointer/keyboard/touch connect, cancel, popup closed, native optional-origin denial, discovery loading, default selected calendars, save, add account, duplicate account, reconnect, one-account failure, disconnect cancel/confirm, separate history choice, focus restoration, live announcements, reduced motion, sign-out/account switch, entitlement expiry, and no free-ICS mutation.

- [x] **Step 2: Observe RED**

- [x] **Step 3: Implement only the approved visual contract**

Use stable reserved geometry, a reduced-motion-safe spinner during connection/discovery, non-color labels beside calendar colors, plain-language scope and privacy copy, and distinct button hierarchy. Never imitate Google's consent screen. Never say disconnected event data was deleted from Google.

- [x] **Step 4: Run focused tests and observe GREEN**

- [x] **Step 5: Commit the production UI checkpoint**

Implementation note: the approved UI is integrated into the existing connector
detail dialog with premium entry, explicit pre-consent, distinct OAuth and
calendar-discovery progress, local calendar selection, multi-account summary,
per-account recovery, and an exact-account disconnect confirmation. Success is
announced once and focuses the resulting account summary. The nested destructive
dialog owns Escape and keyboard focus while open, and all progress animation
uses the existing reduced-motion-safe utility classes, so no new global CSS was
needed. Calendar source composition was already completed in Task 6. README and
the public privacy policy remain unchanged at this local checkpoint because the
production provider flag and every hosted Google authority are still disabled.

---

### Task 8: Stabilize locally and run exact installed-extension QA

**Files:**
- Create: `scripts/qa-google-calendar.mjs`
- Create: `scripts/qa-google-calendar.test.mjs`
- Create: `docs/superpowers/reports/TAB-TWO-GOOGLE-CALENDAR-QA.md`
- Modify: `docs/superpowers/reports/TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`

**Interfaces:**
- Consumes: complete PM-P6 diff, deterministic preview provider, local Supabase provider broker, exact production/account-local/preview builds, and current free-product regression harnesses.
- Produces: one exact-provenance request/storage/interaction/geometry record and cumulative owner-QA additions.

- [x] **Step 1: Perform the one bounded complete-diff review**

Inspect account isolation, token custody, OAuth CSRF/replay/redirect, scope exactness, secret leakage, permission ownership, incremental cursor correctness, paging atomicity, 410 recovery, quota/rate limits, disconnect/revocation, entitlement expiry, metrics privacy, backup/sync denial, accessibility, and existing ICS/Calendar regression. Apply at most one focused Critical/Important fix and rereview cycle.

- [x] **Step 2: Run the stabilized developer gate**

Run affected provider/calendar/storage/sync/metrics/settings suites, then one full `npm test -- --run`, `npx tsc --noEmit`, `git diff --check`, dependency audit, secret/fixture/artifact scans, local Supabase reset/pgTAP/lint/Edge tests, exact account-local build, exact production build, exact preview build, and restore the production build last.

- [x] **Step 3: Run exact Chromium QA**

At 1600x900, 1408x600, 3440x1440, and touch-enabled 390x844, cover all approved states; account add/reconnect/remove; calendar selection and colors; spinner/reduced motion; keyboard focus and restoration; optional-origin request adapters; offline/expired/partial failures; composed ICS plus two Google accounts; Calendar compact/standard/full/docked/stacked geometry; Metrics aggregation; reload persistence; and zero unexpected request, storage, console, page, or failed-request entries.

- [x] **Step 4: Maintain the cumulative owner checklist without requesting it yet**

Add only owner-only ceilings: real Google account selection/consent, native optional-host prompt, real Calendar discovery and color match, account add/reconnect/remove, cross-installation connection reuse, Google grant revocation, stable Chrome popup behavior, real assistive technology, and MacBook smoke testing. Do not ask the owner to run these during PM-P6 development.

- [x] **Step 5: Commit the local QA checkpoint**

---

### Task 9: Request the exact Google/Supabase sandbox activation gate

Do not execute this task without a new explicit owner approval that lists every item below:

1. Enable Google Calendar API on the dedicated Tab Two Google Cloud project.
2. Configure the external OAuth consent screen with the approved app name, support/contact addresses, owned homepage, Privacy Policy, Terms, exact four scopes, and owner-approved test users only.
3. Create one separate Google OAuth Web application client with only the exact hosted callback redirect. Do not modify or reuse the account-sign-in client.
4. Store the Google client ID, Google client secret, and one random 32-byte `TAB_TWO_PROVIDER_TOKEN_KEK_V1` only in Supabase hosted secret storage.
5. Apply only migration `20260903000700_provider_connections.sql`.
6. Deploy only the five provider functions with JWT verification on start/connections/session/disconnect and callback JWT disabled only because Google owns that redirect.
7. Use only disposable synthetic Tab Two accounts plus specifically approved Google OAuth test users. Do not inspect event content or use the owner's production calendar unless separately approved.
8. Exercise state replay, redirect substitution, cross-account access, entitlement denial, one multi-account connection sequence, token refresh/rotation, minimized discovery/events, 410 cursor reset, revoke/disconnect, per-account history deletion, rate limits, and complete cleanup.
9. Perform read-only post-deploy inspection of function version/JWT settings, migration/constraint presence, row counts, and residual test identities. Never read refresh-token ciphertext, event cache, access tokens, or event content.
10. Roll back by disabling the five functions, revoking/removing the Google test client secret, deleting residual synthetic connection/transaction/rate-limit rows, and leaving all free connector/calendar authorities intact.

- [x] **Step 1: Present the exact gate and stop**

- [x] **Step 2: If approved, activate only the listed sandbox scope**

- [x] **Step 3: Run the bounded hosted matrix and cleanup**

- [x] **Step 4: Record redacted evidence and separately track Google verification**

Google sensitive-scope verification, production audience publication, branding review, production customer availability, Store permission/listing changes, merge, package, release, and rollout remain separate later gates even if the sandbox matrix passes.

---

### Task 10: Reconcile, push, and continue to PM-P7

**Files:**
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `docs/superpowers/reports/TAB-TWO-GOOGLE-CALENDAR-QA.md`
- Modify: `docs/superpowers/reports/TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`
- Modify when verified behavior changes: `README.md`
- Modify when verified behavior changes: `PRIVACY.md`

- [ ] **Step 1: Reconcile only verified facts**

Distinguish visual approval, local implementation, hosted sandbox activation, Google verification, and owner manual ceilings. Never mark provider production-ready from deterministic fixtures or sandbox test users.

- [ ] **Step 2: Stage only intended PM-P6 files and commit**

- [ ] **Step 3: Push and prove local/upstream/remote equality**

- [ ] **Step 4: Confirm the protected original and protected untracked paths**

- [ ] **Step 5: Continue to PM-P7 unless a hard gate remains**

Do not merge, package, release, enable live Stripe, provision Supabase Pro, publish the Google OAuth app to production, or perform a Chrome Web Store action.
