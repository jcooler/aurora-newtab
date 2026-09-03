# Tab Two PM-P7 Microsoft Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independently disableable read-only Microsoft Calendar support for personal Outlook.com and Microsoft 365 accounts, with multi-account calendar discovery, preserved colors, incremental local reads, provider-neutral Calendar composition, aggregate-only Metrics, and polished recovery states.

**Architecture:** A Microsoft-specific Supabase Edge broker owns confidential-client exchange, encrypted refresh-token custody, rotation, and account-scoped connection metadata. The extension receives only short-lived memory-held access tokens, reads Microsoft Graph directly through an exact-host gateway, normalizes a closed basic-event shape into a separate device-local cache, and composes those rows with Google Calendar and the existing free Calendar authorities. Microsoft receives separate endpoints, secrets, key material, feature flag, local namespace, tests, activation gate, and rollback while reusing only closed provider-neutral primitives.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Testing Library, Playwright Chromium, Chrome MV3 `identity.launchWebAuthFlow`, existing optional per-origin permissions, Vite production/account-local/preview builds, Supabase Auth/Postgres/Edge Functions, Web Crypto/AES-256-GCM, Microsoft identity platform v2, and Microsoft Graph v1.0.

**Spec:** `docs/superpowers/specs/2026-09-03-tab-two-microsoft-calendar-design.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`. Preserve `artifacts/`, `docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md`, every existing untracked Google Calendar QA directory, and `D:\DEV\Chrome plugin`.
- All current local capabilities and all fifteen original connectors remain free. Microsoft Calendar is additive premium convenience and cannot replace, rename, disable, migrate, or share storage ownership with `ics`, `monthCal`, `publicHolidays`, or `googleCalendar`.
- Request exactly `openid`, `offline_access`, `https://graph.microsoft.com/User.Read`, and `https://graph.microsoft.com/Calendars.ReadBasic`. Do not request broader Calendar, shared Calendar, write, application, Mail, Contacts, Files, Teams, Directory, or administrative permission.
- Use the Microsoft identity platform v2 `common` authority for organizational and personal Microsoft accounts, authorization code with PKCE, a server-held confidential-client secret, tenant-aware OIDC validation, explicit account selection, and an exact hosted callback.
- Store Microsoft refresh tokens only in protected hosted authority and encrypt them under a separately versioned `TAB_TWO_MICROSOFT_TOKEN_KEK_V1`. Never reuse the Google provider KEK or encrypted-sync KEK.
- The extension may receive a short-lived Microsoft access token only after authenticated account binding and current `multi_account` plus `microsoft_calendar` capabilities. Hold it in memory and send it only to exact `https://graph.microsoft.com/v1.0/*` routes.
- Raw Microsoft calendar responses never pass through Supabase. Persist only the approved normalized local allowlist and discard bodies, previews, locations, attendees, organizers, response status, categories, recurrence rules, meeting data, attachments, extensions, and web links.
- Exclude Microsoft account labels, calendar IDs, selected-calendar metadata, delta links, caches, provider errors, and every token or capability from backup, encrypted sync, diagnostics, and logs.
- Metrics receive only daily event counts and merged busy minutes with the opaque connection UUID as `sourceInstanceId`.
- Keep the last complete local snapshot visible through offline, entitlement-expired, rate-limited, partial-account, and reconnect-required states. Free Calendar sources keep refreshing independently.
- Disconnect deletes Tab Two's encrypted Microsoft refresh token, connection metadata, memory token, local cache, and cursors for the exact connection. It never claims to sign the customer out of Microsoft or delete Microsoft events.
- Owner hands-on QA remains deferred to the final PM-P9 cumulative checklist. Developer RED/GREEN tests, deterministic fixtures, local Supabase tests, builds, scans, and automated real-extension Chromium continue normally.
- Use one bounded complete-diff Critical/Important review, at most one focused fix and rereview cycle, and one stabilized full gate. Do not repeat green gates without a material source change.
- Do not create or edit a Microsoft Entra application, redirect, delegated permission, client secret, publisher-verification record, tenant consent, hosted provider secret, migration, Edge deployment, production feature flag, or owner-installation Graph permission before the exact activation gate is approved.
- Do not provision Supabase Pro, enable live Stripe, add install-time Chrome permissions, merge, package, release, distribute, or mutate the Chrome Web Store without their separate explicit gates.
- Create and attach every original-resolution PM-P7 mockup and stop for owner approval before production Microsoft Calendar React or CSS changes.

---

### Task 1: Freeze the Microsoft visual and interaction contract

**Files:**
- Create: `docs/superpowers/reports/TAB-TWO-MICROSOFT-CALENDAR-VISUAL-SPEC.md`
- Create: `scripts/qa-microsoft-calendar-mockups.mjs`
- Preserve generated captures under: `artifacts/qa-microsoft-calendar-mockups/<source-sha>/`

**Interfaces:**
- Consumes: the approved PM-P7 design spec, current Tab Two brand tokens, Google Calendar's accepted visual language, current Connector detail layout, and provider-neutral Calendar composition.
- Produces: deterministic original-resolution locked, pre-consent, connecting, selection, personal-plus-work, organization-approval, reconnect, disconnect/history, composed Calendar, and touch-width captures with a machine-readable evidence ledger.

- [x] **Step 1: Write the visual authority**

Record the exact approved primary promise, privacy disclosure, Chrome Graph-origin explanation, disconnect consequence, organization-approval recovery copy, account ownership hierarchy, provider-color behavior, focus contract, pending-state motion, 44 px coarse-pointer floor, and reduced-motion behavior.

- [x] **Step 2: Create the static mockup harness**

Use only embedded local fonts, the existing local background, CSS-drawn Microsoft and Tab Two marks, static customer-safe fixtures, and Playwright `page.setContent`. The scenario list is:

```js
const SCENARIOS = Object.freeze([
  { id: '01-premium-locked', viewport: DESKTOP, body: premiumLocked },
  { id: '02-read-only-consent', viewport: DESKTOP, body: readOnlyConsent },
  { id: '03-connecting', viewport: DESKTOP, body: connecting },
  { id: '04-calendar-selection', viewport: DESKTOP, body: calendarSelection },
  { id: '05-personal-and-work', viewport: DESKTOP, body: personalAndWork },
  { id: '06-organization-approval', viewport: DESKTOP, body: organizationApproval },
  { id: '07-reconnect-retained', viewport: DESKTOP, body: reconnectRetained },
  { id: '08-disconnect-and-history', viewport: DESKTOP, body: disconnectDialog },
  { id: '09-composed-calendar', viewport: CALENDAR, body: composedCalendar, canvas: true },
  { id: '10-touch-calendar-selection', viewport: TOUCH, body: touchCalendarSelection, touch: true },
])
```

- [x] **Step 3: Render and inspect all original-resolution captures**

Run:

```powershell
node scripts/qa-microsoft-calendar-mockups.mjs
```

Expected: ten PNGs plus `evidence.json`; zero external requests, failed requests, console errors, page errors, root horizontal overflow, viewport escape, clipped content, sub-10 px visible text, color-only state, or sub-44 px touch control.

- [x] **Step 4: Attach the ten PNGs and stop for owner approval**

Request one explicit approval for the complete visual set, exact four scopes, customer copy, provider-specific broker, optional `https://graph.microsoft.com/*` request, organization-policy recovery, truthful disconnect behavior, and independent rollback. This approval authorizes local TDD implementation only.

- [x] **Step 5: Commit the approved visual checkpoint**

```powershell
git add docs/superpowers/plans/2026-09-01-tab-two-microsoft-calendar.md docs/superpowers/reports/TAB-TWO-MICROSOFT-CALENDAR-VISUAL-SPEC.md scripts/qa-microsoft-calendar-mockups.mjs
git commit -m "docs: approve Microsoft Calendar visual contract"
git push
```

---

### Task 2: Extend the closed provider-neutral connection domain

**Files:**
- Modify: `src/providers/types.ts`
- Modify: `src/providers/connections.ts`
- Modify: `src/providers/connections.test.ts`
- Modify: `src/providers/gateway.ts` (Google normalization compatibility only)
- Modify: `src/providers/gateway.test.ts` (Google normalization compatibility only)
- Modify: `src/account/capabilities.ts`
- Modify: `src/account/capabilities.test.ts`
- Modify: `src/settings/connectors/GoogleCalendarConnection.tsx` (Google fixture compatibility only)
- Modify: `src/settings/connectors/GoogleCalendarConnection.test.tsx` (Google fixture compatibility only)

**Interfaces:**
- Consumes: the existing provider connection/session contracts and signed `microsoft_calendar` capability.
- Produces: `MicrosoftCalendarScope`, `ProviderScope`, `ProviderAccountKind`, `MICROSOFT_CALENDAR_SCOPES`, provider-specific scope parsing, validated Personal / Work or school metadata, five-connections-per-provider enforcement, ten-connections-overall enforcement, and deterministic cross-provider ordering.

- [x] **Step 1: Write the failing connection-domain tests**

Add fixtures with the exact types:

```ts
export type MicrosoftCalendarScope =
  | 'openid'
  | 'offline_access'
  | 'https://graph.microsoft.com/User.Read'
  | 'https://graph.microsoft.com/Calendars.ReadBasic'

export type ProviderScope = GoogleCalendarScope | MicrosoftCalendarScope

export type ProviderAccountKind = 'personal' | 'work_or_school'

export const MICROSOFT_CALENDAR_SCOPES = [
  'openid',
  'offline_access',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Calendars.ReadBasic',
] as const satisfies readonly MicrosoftCalendarScope[]
```

Add `accountKind: ProviderAccountKind | null` to `ProviderConnection`. Cover `microsoft_calendar` exact-scope acceptance, required Microsoft account kind, Google requiring null account kind, unknown account kind, wrong scope order, missing scope, broader scope, Google scopes attached to Microsoft, Microsoft scopes attached to Google, six connections for one provider, five Google plus five Microsoft, eleven total, duplicate UUIDs across providers, provider ordering, session/provider mismatch, and unknown properties.

- [x] **Step 2: Run the focused tests and observe RED**

```powershell
npm test -- --run src/providers/connections.test.ts src/account/capabilities.test.ts
```

Expected: failures because `microsoft_calendar`, provider-specific scopes, and per-provider limits are not implemented.

- [x] **Step 3: Implement the closed provider extension**

Set:

```ts
export const PROVIDER_IDS = ['google_calendar', 'microsoft_calendar'] as const
export const MAX_PROVIDER_CONNECTIONS_PER_PROVIDER = 5
export const MAX_PROVIDER_CONNECTIONS_TOTAL = 10
```

Replace the single `validScopes` branch with an exact ordered lookup keyed by `ProviderId`. Require `accountKind === null` for Google and `personal | work_or_school` for Microsoft. Keep the public shape free of provider subject, tenant ID, object ID, access token, refresh token, fingerprint, nonce, PKCE, ciphertext, and key metadata.

- [x] **Step 4: Run the focused tests and observe GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [x] **Step 5: Commit the provider-domain checkpoint**

```powershell
git add src/providers/types.ts src/providers/connections.ts src/providers/connections.test.ts src/account/capabilities.test.ts
git commit -m "feat: extend provider connections for Microsoft"
```

---

### Task 3: Add the Microsoft browser OAuth boundary and provider gateway seam

**Files:**
- Create: `src/providers/microsoftOAuth.ts`
- Create: `src/providers/microsoftOAuth.test.ts`
- Create: `src/providers/gatewayCore.ts`
- Create: `src/providers/gatewayCore.test.ts`
- Modify: `src/providers/gateway.ts`
- Modify: `src/providers/gateway.test.ts`
- Create: `src/providers/microsoftGateway.ts`
- Create: `src/providers/microsoftGateway.test.ts`
- Modify: `src/account/client.ts`
- Modify: `src/account/localAccountClient.ts`
- Modify: `src/account/previewAccountClient.ts`
- Modify: `src/account/supabaseAccountClient.ts`
- Modify: `src/account/supabaseAccountClient.test.ts`
- Modify: `src/account/AccountContext.test.tsx`
- Modify: `src/settings/sections/AccountSync.test.tsx`
- Modify: `src/newtab/widgets/timer/TimerSessionProvider.test.tsx`
- Modify: `src/providers/GoogleCalendarProvider.tsx`
- Modify: `src/providers/GoogleCalendarProvider.test.tsx`
- Modify: `src/settings/connectors/GoogleCalendarConnection.tsx`
- Modify: `src/settings/connectors/GoogleCalendarConnection.test.tsx`

**Interfaces:**
- Consumes: `ProviderId`, exact provider scopes, account snapshots, `chrome.identity`, authenticated Supabase access tokens, and provider-specific optional-origin functions.
- Produces: `createProviderGatewayCore(config, deps)`, backward-compatible Google wrapper behavior, `createMicrosoftCalendarGateway`, `AccountClient.providerGateways`, and exact Microsoft OAuth return validation.

- [x] **Step 1: Write failing Microsoft OAuth and gateway-core tests**

Define the core seam:

```ts
export interface ProviderIdentityBoundary {
  getRedirectURL(path?: string): string
  launchWebAuthFlow(details: { url: string; interactive: boolean }): Promise<string | undefined>
}

export interface ProviderOAuthAttempt {
  clientNonce: string
  baseRedirect: string
  finalRedirect: string
}

export type ProviderOAuthResult =
  | { ok: true }
  | { ok: false; code:
      | 'invalid_authorization_url'
      | 'invalid_return'
      | 'popup_closed'
      | 'provider_denied'
      | 'provider_unavailable'
      | 'entitlement_required'
      | 'reconnect_required'
      | 'organization_approval_required' }

export interface ProviderGatewayConfig {
  provider: ProviderId
  capability: 'google_calendar' | 'microsoft_calendar'
  functionPrefix: 'google-calendar' | 'microsoft-calendar'
  scopes: readonly ProviderScope[]
  createAttempt(): ProviderOAuthAttempt | null
  launch(authorizationUrl: string, attempt: ProviderOAuthAttempt): Promise<ProviderOAuthResult>
}

export interface ProviderOriginBoundary {
  request(): Promise<boolean>
  remove(): Promise<boolean>
}

export interface ProviderGatewayCoreDependencies {
  enabled: boolean
  origin: string
  allowedOrigins: readonly string[]
  fetch: typeof fetch
  now(): number
  randomBytes(size: number): Uint8Array
  getAccount(): ProviderGatewayAccount | null
  getAccessToken(): Promise<string | null>
  invalidateAuthentication(): Promise<void> | void
  identity: ProviderIdentityBoundary
  originPermission: ProviderOriginBoundary
}
```

Test Google compatibility and Microsoft isolation: disabled gateway, absent account, expired lease, missing `multi_account`, missing provider capability, exact function paths, origin request before the first await that is not permission work, popup close, denial, organization approval, malformed authorization host, malformed return, Personal / Work or school metadata parsing, session deduplication, account-switch memory clearing, provider mismatch, one provider disconnect not removing the other provider origin, and no request after failed preparation.

For Microsoft OAuth, accept authorization URLs only at `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` and final extension returns only at the exact `/microsoft-calendar` path with one `nonce` and one known `result`.

- [x] **Step 2: Run the focused tests and observe RED**

```powershell
npm test -- --run src/providers/microsoftOAuth.test.ts src/providers/gatewayCore.test.ts src/providers/gateway.test.ts src/providers/microsoftGateway.test.ts src/account/supabaseAccountClient.test.ts
```

Expected: new modules and `providerGateways` do not exist.

- [x] **Step 3: Implement the pure OAuth boundary**

Export:

```ts
export interface MicrosoftCalendarOAuthAttempt {
  clientNonce: string
  baseRedirect: string
  finalRedirect: string
}

export function createMicrosoftCalendarOAuthAttempt(
  identity: ProviderIdentityBoundary,
  randomBytes: (size: number) => Uint8Array,
): MicrosoftCalendarOAuthAttempt | null

export function validateMicrosoftCalendarOAuthReturn(
  value: string,
  attempt: MicrosoftCalendarOAuthAttempt,
): ProviderOAuthResult
```

Map `organization_approval_required` to a distinct provider-gateway error. Treat cancellation as `provider_denied`; treat state, identity, redirect, and unknown-result problems as invalid or unavailable without exposing provider payloads.

- [x] **Step 4: Extract and implement the provider gateway core**

Keep `src/providers/gateway.ts` as the Google-specific public wrapper so current imports remain stable during the refactor. Add `src/providers/microsoftGateway.ts` as a provider-specific wrapper. Change the account client contract to:

```ts
export interface AccountClient {
  getSnapshot(): Promise<AccountSnapshot>
  subscribe(listener: (snapshot: AccountSnapshot) => void): () => void
  actions: AccountActions
  syncGateway: SyncGateway | null
  providerGateways: Readonly<Partial<Record<ProviderId, ProviderGateway>>>
}
```

On sign-out, invalid account authority, or account switch, call `clearMemory()` for every gateway. Preserve Google request paths, exact response parsing, origin lifecycle, preview fixtures, and session behavior.

- [x] **Step 5: Run the focused tests and observe GREEN**

Run the Step 2 command plus:

```powershell
npm test -- --run src/providers/GoogleCalendarProvider.test.tsx src/settings/connectors/GoogleCalendarConnection.test.tsx src/account/AccountContext.test.tsx src/settings/sections/AccountSync.test.tsx src/newtab/widgets/timer/TimerSessionProvider.test.tsx
```

Expected: Microsoft behavior passes and all affected Google/account compatibility tests remain green.

- [x] **Step 6: Commit the gateway checkpoint**

```powershell
git add src/providers src/account src/settings/connectors/GoogleCalendarConnection.tsx src/settings/connectors/GoogleCalendarConnection.test.tsx src/settings/sections/AccountSync.test.tsx src/newtab/widgets/timer/TimerSessionProvider.test.tsx
git commit -m "feat: add Microsoft provider gateway boundary"
```

---

### Task 4: Add the local Microsoft Calendar authority and privacy exclusions

**Files:**
- Modify: `src/services/connectors/types.ts`
- Create: `src/services/connectors/microsoftCalendar.ts`
- Create: `src/services/connectors/microsoftCalendar.test.ts`
- Modify: `src/services/connectors/registry.ts`
- Modify: `src/services/connectors/registry.test.ts`
- Modify: `src/services/connectors/expansionConnectorContracts.test.ts`
- Modify: `src/services/refreshPolicy.ts`
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/storage/schema.test.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/migrations.test.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/sync/types.ts`
- Modify: `src/sync/connectorProjection.ts`
- Modify: `src/sync/connectorProjection.test.ts`
- Modify: `src/privacy/dataFlows.ts`
- Modify: `src/privacy/dataFlows.test.ts`
- Modify: `src/test/connectorContractFixtures.ts`

**Interfaces:**
- Consumes: connector registry/storage contracts, opaque provider connection UUIDs, approved calendar selections, and the exact Graph origin.
- Produces: `MicrosoftCalendarConfig`, normalized snapshot types, `parseMicrosoftCalendarConfig`, `isMicrosoftCalendarSnapshot`, `microsoftCalendarDescriptor`, append-only storage schema version, and explicit backup/sync/privacy exclusions.

- [x] **Step 1: Write the failing local-authority tests**

Define:

```ts
export interface MicrosoftCalendarSelection {
  calendarId: string
  name: string
  color: string
  isDefault: boolean
}

export interface MicrosoftCalendarAccountSelection {
  connectionId: string
  displayEmail: string
  accountKind: 'personal' | 'work_or_school'
  calendars: MicrosoftCalendarSelection[]
}

export interface MicrosoftCalendarConfig extends ConnectorCacheIdentity {
  enabled: boolean
  accountId: string
  accounts: MicrosoftCalendarAccountSelection[]
}

export interface MicrosoftCalendarEvent {
  eventId: string
  title: string
  start: number
  end: number
  allDay: boolean
  startDate: string | null
  endDate: string | null
  cancelled: boolean
  showAs: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown'
  sensitivity: 'normal' | 'personal' | 'private' | 'confidential'
  eventType: 'singleInstance' | 'occurrence' | 'exception' | 'seriesMaster'
  seriesMasterId: string | null
  updatedAt: number
}

export interface MicrosoftCalendarSourceSnapshot {
  connectionId: string
  calendarId: string
  color: string
  windowStart: number
  windowEnd: number
  deltaLink: string
  events: MicrosoftCalendarEvent[]
}

export type MicrosoftCalendarConnectionIssueCode =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'offline'
  | 'organization_approval_required'
  | 'provider_error'
  | 'invalid_response'
  | 'response_too_large'
  | 'limit_exceeded'
  | 'cursor_expired'
  | 'entitlement_required'
  | 'reconnect_required'

export interface MicrosoftCalendarSnapshot {
  version: 1
  fetchedAt: number
  calendars: MicrosoftCalendarSourceSnapshot[]
  connectionIssues?: Array<{
    connectionId: string
    code: MicrosoftCalendarConnectionIssueCode
  }>
}
```

Test exact-key parsing, UUID ownership, personal/work kind, five-account cap, ten calendars per account, twenty calendars total, duplicate IDs, safe text, hex/fallback colors, bounded delta links, time bounds, event ordering, event cap, issue isolation, unknown fields, and immutability. Prove export strips `microsoftCalendar`, import discards injected state, sync projection rejects it, defaults do not create it, and privacy inventory names only local Graph transmission plus account-metadata broker traffic.

- [x] **Step 2: Run the focused tests and observe RED**

```powershell
npm test -- --run src/services/connectors/microsoftCalendar.test.ts src/services/connectors/registry.test.ts src/services/connectors/expansionConnectorContracts.test.ts src/lib/storage/schema.test.ts src/lib/storage/migrations.test.ts src/lib/backup.test.ts src/sync/connectorProjection.test.ts src/privacy/dataFlows.test.ts
```

Expected: Microsoft connector ID, types, parser, storage version, and exclusions are absent.

- [x] **Step 3: Implement the local schema and descriptor**

Append `microsoftCalendar` after `googleCalendar` in `CONNECTOR_IDS`; add its config to `ConnectorConfig`; set `auth: 'oauth'`, `category: 'calendar-tasks'`, `excludeFromBackup: true`, TTL 15 minutes, origin `https://graph.microsoft.com/*`, and `ownsOrigins` only for a complete account-bound configuration. Add one append-only storage migration that strips malformed Microsoft state and never writes a default enabled connector.

- [x] **Step 4: Implement explicit privacy exclusions**

Add `microsoftCalendar: never` to sync connector vocabulary, remove it during backup preparation/restoration, and document:

```ts
microsoftCalendar: {
  destinations: [
    'https://ovlobmvxtryitupxwylg.supabase.co',
    'https://graph.microsoft.com',
  ],
  storesLocally: [
    'selected calendar metadata',
    'normalized rebuildable event snapshots',
    'bounded delta links and refresh state',
  ],
  authority: 'Supabase stores encrypted connection credentials; access tokens are memory-only; raw calendar data travels directly from Microsoft Graph to this browser.',
}
```

- [x] **Step 5: Run the focused tests and observe GREEN**

Run the Step 2 command. Expected: all selected tests pass with Google and ICS fixtures unchanged.

- [x] **Step 6: Commit the local-authority checkpoint**

```powershell
git add src/services src/lib src/sync src/privacy src/test
git commit -m "feat: add local Microsoft Calendar authority"
```

---

### Task 5: Implement exact-host Microsoft Graph discovery and delta refresh

**Files:**
- Modify: `src/services/connectors/microsoftCalendar.ts`
- Modify: `src/services/connectors/microsoftCalendar.test.ts`

**Interfaces:**
- Consumes: `MicrosoftCalendarConfig`, prior complete snapshot, requested window, memory-only token callback, and injected `fetch`.
- Produces: `fetchMicrosoftCalendarList`, `refreshMicrosoftCalendarSnapshot`, exact Graph URL validation, paginated discovery, atomic per-calendar delta, bounded normalization, and stable issue codes.

- [x] **Step 1: Write failing hostile-response and refresh tests**

Cover exact `graph.microsoft.com` HTTPS origin, `/v1.0/me/calendars` discovery, allowed query keys, `$select` value, `@odata.nextLink` validation, response media type, content length, decoded budget, page limit, calendar limit, malformed colors, duplicate calendars, and account-bound errors.

For delta, cover `/v1.0/me/calendars/{encoded-id}/calendarView/delta`, exact `startDateTime` and `endDateTime`, absence of `$select`, validated `@odata.nextLink`/`@odata.deltaLink`, UTC and all-day normalization, safe title handling, cancellation deletion, `showAs`, sensitivity, event type, series ID, unknown-field discard, 410/invalid-cursor rebuild, interrupted pagination retaining the old snapshot, changed window full rebuild, 10,000-event cap, 5 MiB refresh cap, four-request concurrency, one failed connection with another preserved, and no token in URL or retained object.

- [x] **Step 2: Run the connector test and observe RED**

```powershell
npm test -- --run src/services/connectors/microsoftCalendar.test.ts
```

Expected: discovery and refresh exports are missing.

- [x] **Step 3: Implement the request gateway and discovery**

Use these exported signatures:

```ts
export interface DiscoveredMicrosoftCalendar extends MicrosoftCalendarSelection {
  canViewPrivateItems: boolean
  readable: boolean
}

export async function fetchMicrosoftCalendarList(
  accessToken: string,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<readonly DiscoveredMicrosoftCalendar[]>

export async function refreshMicrosoftCalendarSnapshot(input: {
  config: MicrosoftCalendarConfig
  previous: MicrosoftCalendarSnapshot | null
  windowStart: number
  windowEnd: number
  now: () => number
  fetchFn: typeof fetch
  getAccessToken(connectionId: string): Promise<string>
}): Promise<MicrosoftCalendarSnapshot>
```

Every request uses `redirect: 'error'`, `credentials: 'omit'`, `cache: 'no-store'`, a bounded timeout, bearer header, acceptable JSON media type, and atomic response parsing. Reject provider links outside the exact allowlist before fetching them.

- [x] **Step 4: Implement atomic delta normalization**

Request basic event fields only through `Calendars.ReadBasic`; do not use unsupported `$select` on delta. Accumulate pages in memory under the total byte and event budgets, normalize only the approved event allowlist, then atomically replace the source snapshot and final delta link. Keep the previous source on every interrupted or malformed sequence.

- [x] **Step 5: Run the connector test and observe GREEN**

Run the Step 2 command. Expected: all Microsoft connector tests pass.

- [x] **Step 6: Commit the Graph checkpoint**

```powershell
git add src/services/connectors/microsoftCalendar.ts src/services/connectors/microsoftCalendar.test.ts
git commit -m "feat: add Microsoft Calendar Graph refresh"
```

---

### Task 6: Add visible-document refresh ownership, Calendar composition, and Metrics

**Files:**
- Create: `src/providers/MicrosoftCalendarProvider.tsx`
- Create: `src/providers/MicrosoftCalendarProvider.test.tsx`
- Modify: `src/newtab/main.tsx`
- Modify: `src/newtab/main.test.tsx`
- Modify: `src/newtab/widgets/calendar/calendarComposition.ts`
- Modify: `src/newtab/widgets/calendar/calendarComposition.test.ts`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.test.tsx`
- Modify: `src/metrics/collectors.ts`
- Modify: `src/metrics/collectors.test.ts`
- Modify: `src/metrics/MetricsProvider.test.tsx`

**Interfaces:**
- Consumes: local Microsoft config/cache, `AccountClient.providerGateways.microsoft_calendar`, current capability lease, local timezone/day, provider-neutral Calendar composition, and the existing aggregate Calendar collector.
- Produces: `MicrosoftCalendarProvider`, `useMicrosoftCalendar`, provider-aware composed agenda rows, partial-account refresh state, and UUID-scoped aggregate-only Microsoft Calendar Metrics.

- [x] **Step 1: Write failing runtime, composition, and Metrics tests**

Test no provider call when disabled, account mismatch, hydration incomplete, capability absent, or entitlement expired; one visible-document Web Lock owner; 31-day-before/61-day-after DST-safe window; manual preference; pending and retry state; bounded 20 percent jitter; retained snapshot when inactive; partial-account retry; and no service-worker or alarm path.

Extend composition input:

```ts
export function composeCalendarItems(input: {
  events: readonly IcsEvent[]
  icsCalendars?: readonly IcsCalendar[]
  googleConfig?: GoogleCalendarConfig | null
  googleSnapshot?: GoogleCalendarSnapshot | null
  microsoftConfig?: MicrosoftCalendarConfig | null
  microsoftSnapshot?: MicrosoftCalendarSnapshot | null
  holidays: readonly PublicHoliday[]
  includeHolidays: boolean
  now: number | Date
  timeZone: string
}): CalendarAgendaItem[]
```

Test `authority: 'microsoft_calendar'`, opaque source identity, account-qualified source label, preserved colors, safe ordering, expired-event filtering, all-day local date behavior, same-title coexistence across non-holiday authorities, and Google/ICS/Public Holidays unchanged. Test Metrics output contains only connection UUID, date, event count, and merged busy minutes.

- [x] **Step 2: Run focused tests and observe RED**

```powershell
npm test -- --run src/providers/MicrosoftCalendarProvider.test.tsx src/newtab/main.test.tsx src/newtab/widgets/calendar/calendarComposition.test.ts src/newtab/widgets/calendar/CalendarWidget.test.tsx src/metrics/collectors.test.ts src/metrics/MetricsProvider.test.tsx
```

Expected: Microsoft runtime/context/composition fields are missing.

- [x] **Step 3: Implement the Microsoft runtime provider**

Mirror the verified visible-document ownership policy without sharing Google cache state. Provide:

```ts
export interface MicrosoftCalendarRuntimeState {
  entitled: boolean
  snapshot: MicrosoftCalendarSnapshot | null
  refreshing: boolean
  lastError: string | null
}

export function useMicrosoftCalendar(): MicrosoftCalendarRuntimeState
```

Nest `MicrosoftCalendarProvider` beside `GoogleCalendarProvider` under the same Account and Storage authorities. Do not make either provider depend on the other's availability.

- [x] **Step 4: Implement composition and aggregate-only collection**

Add Microsoft rows to `CalendarAgendaItem` and the unified Calendar. Keep account-qualified text labels so color is never the only source indicator. Pass each connection's normalized events to the existing calendar collector, which clips local days and merges overlaps. Do not add a Microsoft-only widget.

- [x] **Step 5: Run focused tests and observe GREEN**

Run the Step 2 command. Expected: all runtime/composition/Metrics tests pass.

- [x] **Step 6: Commit the runtime checkpoint**

```powershell
git add src/providers/MicrosoftCalendarProvider.tsx src/providers/MicrosoftCalendarProvider.test.tsx src/newtab src/metrics
git commit -m "feat: compose Microsoft Calendar locally"
```

---

### Task 7: Build the owner-approved Microsoft connection experience

**Files:**
- Create: `src/settings/connectors/MicrosoftCalendarConnection.tsx`
- Create: `src/settings/connectors/MicrosoftCalendarConnection.test.tsx`
- Modify: `src/settings/sections/Connectors.tsx`
- Modify: `src/settings/connectors/connectorExperience.ts`
- Modify: `src/settings/connectors/connectorExperience.test.ts`
- Modify: `src/settings/connectors/connectorCardState.ts`
- Modify: `src/settings/connectors/connectorCardState.test.ts`
- Modify: `src/settings/connectors/ConnectorCardShell.test.tsx`
- Modify: `src/newtab/widgetRegistry.ts`
- Modify: `src/newtab/widgetRegistry.test.ts`

**Interfaces:**
- Consumes: approved visual spec, Microsoft provider gateway, connection metadata, discovery, local config/cache, runtime state, account capabilities, Metrics deletion callback, and Settings focus/dialog primitives.
- Produces: premium locked state, benefits-first consent, pending account window, calendar picker, personal/work multi-account summary, organization-approval recovery, per-account reconnect, retained-data truth, and two-step disconnect/history behavior.

- [x] **Step 1: Write failing interaction and accessibility tests**

Cover the exact approved copy, one primary action, no fake disabled Connect control, Connect permission as the first asynchronous boundary, `Opening Microsoft...` progress, Cancel, popup close, account-policy message, discovery loading, default-calendar selection, ten-per-account and twenty-total selection caps, save spinner, storage failure retaining prior state, two account kinds, one-account partial failure, reconnect isolation, retained-data copy, focus restoration, Escape behavior, keyboard selection, non-color labels, 44 px touch classes, reduced-motion spinner, disconnect confirmation, default keep-history choice, scoped Metrics deletion, local-cache cleanup, origin removal after the last Microsoft connection, and Google/ICS preservation.

- [x] **Step 2: Run focused UI tests and observe RED**

```powershell
npm test -- --run src/settings/connectors/MicrosoftCalendarConnection.test.tsx src/settings/connectors/connectorExperience.test.ts src/settings/connectors/connectorCardState.test.ts src/settings/connectors/ConnectorCardShell.test.tsx src/newtab/widgetRegistry.test.ts
```

Expected: Microsoft detail component and registry experience are absent.

- [x] **Step 3: Implement the approved production UI**

Use the visual authority exactly. Reuse the accepted Tab Two cyan accent, quiet separators, provider source rail, Space Grotesk/Inter hierarchy, and stable inline spinner geometry. Microsoft color identifies the provider only where useful; calendar colors remain provider-owned with text labels. Use `aria-live="polite"` for pending/success state and role-appropriate alert copy for blocking errors.

Do not add a general Account & Sync refresh button. Connection, selection, reconnect, and retry actions own their exact operation and update state automatically.

- [x] **Step 4: Run focused UI tests and observe GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [x] **Step 5: Commit the Settings checkpoint**

```powershell
git add src/settings src/newtab/widgetRegistry.ts src/newtab/widgetRegistry.test.ts
git commit -m "feat: add Microsoft Calendar connection UI"
```

---

### Task 8: Add Microsoft-specific account configuration and optional-origin lifecycle

**Files:**
- Modify: `src/account/accountServiceConfig.ts`
- Modify: `src/account/accountServiceConfig.test.ts`
- Modify: `src/account/productionAccountServiceConfig.ts`
- Modify: `src/account/supabaseAccountClient.ts`
- Modify: `src/account/supabaseAccountClient.test.ts`
- Modify: `src/services/permissions.ts`
- Modify: `src/services/permissions.test.ts`
- Modify: `src/privacy/dataFlows.test.ts`

**Interfaces:**
- Consumes: production/account-local config descriptors, Chrome optional permissions, `AccountClient.providerGateways`, and Microsoft connector ownership.
- Produces: `microsoftCalendarEnabled`, `MICROSOFT_GRAPH_ORIGIN`, provider-specific permission helpers, and a production-locked default until hosted activation approval.

- [x] **Step 1: Write failing configuration and permission tests**

Require:

```ts
export const MICROSOFT_GRAPH_ORIGIN = 'https://graph.microsoft.com/*' as const
export async function ensureMicrosoftGraphOrigin(): Promise<boolean>
export async function hasMicrosoftGraphOrigin(): Promise<boolean>
export async function removeMicrosoftGraphOrigin(): Promise<boolean>
```

Test exact origin, one permission request, rejection handling, provider ownership, no Google-origin mutation, malformed production descriptors, account-local enablement, production `microsoftCalendarEnabled: false`, and zero Microsoft hosted request when disabled.

- [x] **Step 2: Run focused tests and observe RED**

```powershell
npm test -- --run src/account/accountServiceConfig.test.ts src/account/supabaseAccountClient.test.ts src/services/permissions.test.ts src/privacy/dataFlows.test.ts
```

Expected: Microsoft flag and permission helpers are absent.

- [x] **Step 3: Implement configuration and permissions**

Add the boolean to both validated config descriptors. Enable it only in account-local and deterministic preview modes. Keep production false until Task 11's hosted gate succeeds. Use the existing broad optional-host manifest authority only through an explicit Connect gesture; do not add an install-time permission or new manifest pattern.

- [x] **Step 4: Run focused tests and observe GREEN**

Run the Step 2 command. Expected: all tests pass and Google configuration remains unchanged.

- [x] **Step 5: Commit the configuration checkpoint**

```powershell
git add src/account src/services/permissions.ts src/services/permissions.test.ts src/privacy/dataFlows.test.ts
git commit -m "feat: gate Microsoft Calendar activation"
```

---

### Task 9: Extend the private provider schema without rewriting Google history

**Files:**
- Create: `supabase/migrations/20260903000800_microsoft_calendar_provider.sql`
- Create: `supabase/tests/database/microsoft_calendar_provider.test.sql`
- Modify: `supabase/tests/database/provider_connections.test.sql`

**Interfaces:**
- Consumes: migration 00700's private enum/tables/security-definer repository procedures and the exact Microsoft scope/redirect contracts.
- Produces: additive `microsoft_calendar` provider value, provider-specific scope and redirect constraints, generalized provider RPC validation, per-provider limits, and default-deny Microsoft rows.

- [x] **Step 1: Write the failing pgTAP tests**

Test one Microsoft transaction and connection with the exact scopes, tenant-qualified subject, required `personal | work_or_school` account kind, `/microsoft-calendar` return path, encrypted envelope bounds, and current account capabilities. Reject a missing or unknown Microsoft account kind, non-null Google account kind, wrong provider scopes, broader scopes, wrong return path, cross-account access, duplicate account/provider/subject, six Microsoft connections, malformed labels, malformed token envelopes, expired/replayed transactions, missing capabilities, and direct authenticated table access. Rerun all Google provider tests unchanged.

- [x] **Step 2: Run local database tests and observe RED**

```powershell
npx supabase start
npx supabase db reset --local
npm run test:supabase-local
```

Expected: new Microsoft pgTAP assertions fail because provider enum and constraints remain Google-only.

- [x] **Step 3: Write the append-only migration**

Use `alter type private.provider_id add value if not exists 'microsoft_calendar'`. Add nullable `account_kind` with a provider-specific constraint requiring null for Google and `personal | work_or_school` for Microsoft. Replace exact-scope and return-path constraints with provider-specific predicates using `provider::text` so the new enum value is not unsafely cast inside the same migration transaction. Replace only the public provider repository functions that currently reject non-Google provider names. Preserve security definer, empty `search_path`, explicit account ownership, service-role execution, bounds, uniqueness, and revocation/deletion behavior.

The Microsoft exact scope array is:

```sql
array[
  'openid',
  'offline_access',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Calendars.ReadBasic'
]::text[]
```

- [x] **Step 4: Reset and run pgTAP GREEN**

Run the Step 2 reset/test sequence. Expected: all database test files pass, including every Google regression assertion.

- [x] **Step 5: Run database lint**

```powershell
npx supabase db lint --local --level error
```

Expected: zero errors.

- [x] **Step 6: Commit the schema checkpoint**

```powershell
git add supabase/migrations/20260903000800_microsoft_calendar_provider.sql supabase/tests/database/microsoft_calendar_provider.test.sql supabase/tests/database/provider_connections.test.sql
git commit -m "feat: add Microsoft provider schema"
```

---

### Task 10: Implement the isolated Microsoft hosted OAuth broker

**Files:**
- Create: `supabase/functions/_shared/providerMicrosoft.ts`
- Create: `supabase/functions/_shared/providerMicrosoftAuth.ts`
- Create: `supabase/functions/_shared/providerMicrosoftRuntime.ts`
- Modify: `supabase/functions/_shared/providerTypes.ts`
- Modify: `supabase/functions/_shared/providerCrypto.ts`
- Modify: `supabase/functions/_shared/providerRepository.ts`
- Modify: `supabase/functions/tests/provider-crypto.test.ts`
- Modify: `supabase/functions/tests/provider-functions.test.ts`
- Create: `supabase/functions/tests/provider-microsoft.test.ts`
- Create: `supabase/functions/microsoft-calendar-oauth-start/index.ts`
- Create: `supabase/functions/microsoft-calendar-oauth-start/config.toml`
- Create: `supabase/functions/microsoft-calendar-oauth-callback/index.ts`
- Create: `supabase/functions/microsoft-calendar-oauth-callback/config.toml`
- Create: `supabase/functions/microsoft-calendar-connections/index.ts`
- Create: `supabase/functions/microsoft-calendar-connections/config.toml`
- Create: `supabase/functions/microsoft-calendar-session/index.ts`
- Create: `supabase/functions/microsoft-calendar-session/config.toml`
- Create: `supabase/functions/microsoft-calendar-disconnect/index.ts`
- Create: `supabase/functions/microsoft-calendar-disconnect/config.toml`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: authenticated Tab Two requests, exact capabilities, private provider repository, Microsoft-specific KEK/client credentials, Microsoft v2 endpoints/JWKS, and single-use transactions.
- Produces: five isolated Microsoft functions, exact OIDC/token validation, encrypted refresh-token rotation, short-lived session issuance, metadata-only connection listing, and truthful disconnect response.

- [x] **Step 1: Write failing hosted unit tests**

Define:

```ts
export interface MicrosoftIdentity {
  tenantId: string
  objectId: string
  accountKind: 'personal' | 'work_or_school'
  email: string
  displayName: string | null
}

export interface MicrosoftTokenResult {
  accessToken: string
  expiresAt: number
  grantedScopes: readonly string[]
  refreshToken: string | null
}

export interface MicrosoftAuthorizationResult extends MicrosoftTokenResult {
  identity: MicrosoftIdentity
}

export interface ProviderMicrosoftGateway {
  authorizationUrl(input: {
    state: string
    nonce: string
    codeChallenge: string
    redirectUri: string
  }): string
  exchangeCode(input: {
    code: string
    verifier: string
    redirectUri: string
    expectedNonce: string
  }): Promise<MicrosoftAuthorizationResult>
  refresh(refreshToken: string): Promise<MicrosoftTokenResult>
  profile(accessToken: string): Promise<MicrosoftIdentity>
}
```

Cover exact `common/oauth2/v2.0/authorize` and token endpoints, PKCE S256, `prompt=select_account`, exact scopes, state/nonce, no token logging, bounded JSON/JWKS/profile responses, no redirects, key rotation, tenant-specific issuer resolution, JWKS algorithm/key ID, signature, audience, nonce, issued/expiry times, tenant/object identity, personal/work classification, exact Graph permissions, missing refresh token, retained existing refresh token on exact-subject reconsent, cross-subject refusal, refresh rotation, invalid grant reconnect state, rate limits, metadata redaction, and disconnect returning `revocationConfirmed: false` without claiming provider revocation.

- [x] **Step 2: Run Edge tests and observe RED**

```powershell
npx vitest run --config supabase/functions/vitest.config.ts supabase/functions/tests/provider-microsoft.test.ts supabase/functions/tests/provider-crypto.test.ts supabase/functions/tests/provider-functions.test.ts
```

Expected: Microsoft gateway/runtime/handlers do not exist.

- [x] **Step 3: Implement the Microsoft gateway and handlers**

Use only:

```text
https://login.microsoftonline.com/common/oauth2/v2.0/authorize
https://login.microsoftonline.com/common/oauth2/v2.0/token
https://login.microsoftonline.com/{validated-tenant}/v2.0/.well-known/openid-configuration
https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName
```

Validate discovered issuer and JWKS URLs against exact Microsoft HTTPS host/path rules before fetching. Classify only tenant `9188040d-6c67-4c5b-b112-36a304b66dad` as `personal` and every other validated supported tenant as `work_or_school`; never infer account kind from the email address. Store only tenant-qualified subject, chosen display email, display name, account kind, exact canonical scopes, encrypted refresh token, key version, and lifecycle timestamps. Never store an access token or raw ID token.

- [x] **Step 4: Wire the five exact functions**

Each index creates Microsoft runtime handlers only. Use JWT verification for start, connections, session, and disconnect; callback alone is public and protected by exact single-use state. Add all five explicit entries to `supabase/config.toml`.

- [x] **Step 5: Run Edge tests and observe GREEN**

Run the Step 2 command and the complete Edge function suite:

```powershell
npx vitest run --config supabase/functions/vitest.config.ts
```

Expected: Microsoft and every Google/account/billing/sync Edge test pass.

- [x] **Step 6: Scan the hosted source for forbidden values**

```powershell
rg -n "access_token|refresh_token|id_token|client_secret|Authorization" supabase/functions/_shared supabase/functions/microsoft-calendar-* supabase/functions/tests/provider-microsoft.test.ts
```

Inspect every match. Expected: only typed parsing, fixed header construction, redacted test fixtures, and explicit rejection assertions; no logging, response leakage, URL credential, or source-controlled secret.

- [x] **Step 7: Commit the broker checkpoint**

```powershell
git add supabase/functions supabase/config.toml
git commit -m "feat: add Microsoft Calendar OAuth broker"
```

---

### Task 11: Complete local QA, review, and exact-provenance builds

**Files:**
- Create: `scripts/qa-microsoft-calendar.mjs`
- Create: `scripts/qa-microsoft-calendar.test.mjs`
- Create: `docs/superpowers/reports/TAB-TWO-MICROSOFT-CALENDAR-QA.md`
- Modify: `package.json`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `docs/superpowers/reports/TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`

**Interfaces:**
- Consumes: complete local PM-P7 implementation, deterministic preview/account-local fixtures, approved visuals, all repository tests, and exact-provenance build tooling.
- Produces: installed MV3 Chromium evidence, privacy/request/storage ledgers, one bounded review result, stabilized full gate, durable QA report, deferred owner checklist, and pushed local implementation checkpoint.

- [x] **Step 1: Write the failing QA contract test**

Require the harness to prove:

```js
const REQUIRED_STATES = [
  'production-locked',
  'read-only-consent',
  'connecting',
  'calendar-selection',
  'personal-and-work',
  'organization-approval',
  'partial-account',
  'reconnect-retained',
  'disconnect-history',
  'composed-calendar-full',
  'composed-calendar-stacked',
  'composed-calendar-docked',
  'touch-selection',
]
```

The evidence schema records source SHA, build provenance, extension ID, viewport, interactions, storage keys, request hosts/paths, console errors, page errors, failed requests, overflow, focus restoration, touch target sizes, reduced-motion result, and screenshot paths. It must reject missing states, owner data, secret-looking values, unexpected origins, or a non-exact build.

- [x] **Step 2: Run the harness test and observe RED**

```powershell
node --test scripts/qa-microsoft-calendar.test.mjs
```

Expected: harness or required evidence contract is absent.

- [x] **Step 3: Implement installed-extension QA**

Use deterministic fixtures only. Load the exact unpacked production or preview build as required per state, drive real controls, and capture original-resolution evidence at desktop `1600x900`, short `1408x600`, ultrawide `3440x1440`, and touch `390x844` with `hasTouch: true`. Production-locked proof must make no Microsoft request. Preview requests may target only fixture-owned local routes; no real Microsoft, Supabase, Google, Stripe, or customer data.

- [ ] **Step 4: Run the harness test and QA GREEN**

```powershell
node --test scripts/qa-microsoft-calendar.test.mjs
npm run qa:microsoft-calendar -- --exact
```

Expected: contract test passes and the installed MV3 evidence matrix is green.

- [ ] **Step 5: Run the bounded complete-diff review**

Review the diff from the Task 1 approved visual checkpoint through current HEAD against the PM-P7 spec and plan. Classify only Critical, Important, Minor, or no finding. Block only Critical/Important. If a blocking issue exists, apply one focused fix and one focused rereview; otherwise proceed without review churn.

- [ ] **Step 6: Run the stabilized full gate once**

```powershell
npm test -- --run
npm run test:supabase-local
npx supabase db lint --local --level error
npx vitest run --config supabase/functions/vitest.config.ts
npm audit --audit-level=high
npm run build
npm run build:account-local
npm run build:preview
node --test scripts/qa-microsoft-calendar.test.mjs
npm run qa:microsoft-calendar -- --exact
```

Expected: all tests pass, database lint has zero errors, audit has zero high-or-higher findings, builds succeed, fixture/credential scans are clean, build metadata equals final source HEAD, and installed Chromium QA passes.

- [ ] **Step 7: Record the local implementation checkpoint**

Write exact counts, SHA, request/storage ledgers, screenshot paths, review result, known non-blocking warnings, manual ceilings, and protected-path status in the QA report and Aurora ledgers. Add the real Microsoft sign-in, organizational-account consent, native Chrome permission prompt, live Graph data, provider-side revocation expectations, physical MacBook, and assistive-technology checks to the final deferred owner list.

- [ ] **Step 8: Commit and push the local implementation**

```powershell
git add package.json scripts/qa-microsoft-calendar.mjs scripts/qa-microsoft-calendar.test.mjs docs/superpowers/reports/TAB-TWO-MICROSOFT-CALENDAR-QA.md docs/superpowers/reports/TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/DECISIONS.md
git commit -m "test: verify Microsoft Calendar locally"
git push
git rev-parse HEAD
git rev-parse '@{upstream}'
git ls-remote origin refs/heads/feat/aurora-2-observatory
```

Expected: local HEAD, upstream, and remote branch SHA are identical. Protected untracked paths remain present and the original checkout remains clean.

---

### Task 12: Obtain the Microsoft and hosted sandbox activation gate

**Files:**
- Create after approval: `scripts/qa-microsoft-calendar-hosted.mjs`
- Create after approval: `scripts/qa-microsoft-calendar-hosted.test.mjs`
- Modify after approval: `src/account/productionAccountServiceConfig.ts`
- Modify after approval: `src/account/accountServiceConfig.test.ts`
- Modify after approval: `docs/superpowers/reports/TAB-TWO-MICROSOFT-CALENDAR-QA.md`
- Modify after approval: `docs/superpowers/aurora-2/STATUS.md`
- Modify after approval: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after approval: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**
- Consumes: owner-approved exact mutation checklist, dedicated Entra application, exact callback/scopes, three secret values, migration 00800, five reviewed functions, synthetic test identities, and the local implementation checkpoint.
- Produces: bounded hosted OAuth-policy proof, exact cleanup, enabled production feature flag for the approved cohort only, and durable evidence without real calendar content.

- [ ] **Step 1: Present the exact activation checklist and stop**

List before approval:

1. Microsoft account/tenant that will own the app registration.
2. Supported audience: organizational directories plus personal Microsoft accounts.
3. Exact hosted callback URI and no other new redirect.
4. Exact four delegated scopes and zero application permissions.
5. Whether the app is unverified and the resulting organizational-policy ceiling.
6. Client secret creation and direct secret-storage path without printing or local files.
7. New independent 32-byte Microsoft KEK and secret-storage path.
8. Exact migration and five functions to apply/deploy.
9. Synthetic account shapes and metadata-only test categories.
10. Maximum test invocations/egress and Supabase Free / Entra cost expectation.
11. Exact cleanup queries and rollback commands.
12. Explicit exclusions: no owner calendar content, general publication, verified publisher, tenant-wide consent, Supabase Pro, live Stripe, merge, release, package, or Store action.

- [ ] **Step 2: Proceed only after explicit owner approval**

The approval text must authorize the listed Entra and hosted sandbox mutations. Design, visual, or local-code approval is insufficient.

- [ ] **Step 3: Write the hosted harness tests before mutation**

The harness accepts values only from process memory or direct secure prompts, redacts every credential/token, caps traffic, creates disposable synthetic Tab Two accounts, never requests Microsoft calendar data, and proves exact cleanup. Test JWT enforcement, redirect binding, entitlement denial, exact authorization parameters, state replay, personal/work metadata shapes, cross-account rejection, scope rejection, token rotation metadata, rate limits, disconnect deletion with `revocationConfirmed: false`, and account-history deletion.

- [ ] **Step 4: Apply only the approved hosted delta**

Create the dedicated Entra application/configuration, store the three secrets directly, apply only migration 00800, deploy only the five Microsoft functions with the intended JWT split, and enable only `microsoftCalendarEnabled` in production source. Do not change Google configuration or any unrelated hosted object.

- [ ] **Step 5: Run the bounded hosted matrix and clean up**

```powershell
node --test scripts/qa-microsoft-calendar-hosted.test.mjs
npm run qa:microsoft-calendar-hosted -- --exact
```

Expected: all synthetic policy checks pass within caps, then exact cleanup leaves zero PM-P7 QA Auth users, identities, provider connections, OAuth transactions, or provider rate-limit rows.

- [ ] **Step 6: Perform independent metadata-only inspection**

Verify migration 00800, provider-specific constraints, exact five active function versions and JWT split, required secret names without values, production flag, and zero residual fixtures. Do not read ciphertext, customer rows, owner data, or secret values.

- [ ] **Step 7: Run the activation-delta gate and push**

Run focused config, hosted harness, provider Edge, pgTAP, lint, audit, exact production build, credential scan, and production-locked/feature-enabled fixture checks. Record evidence, commit only the approved activation delta, push, and prove local/upstream/remote equality.

- [ ] **Step 8: Stop at the real-provider manual ceiling**

Do not claim real Microsoft exchange, Graph refresh, organizational consent, publisher verification, physical-device behavior, or general production readiness from synthetic hosted proof. Add those checks to PM-P9's cumulative owner list. Do not merge, package, release, or perform a Store action.

## Definition of done

PM-P7 is complete only when Tasks 1 through 12 are checked, every approved visual and privacy contract is preserved, the local and hosted matrices are green, Microsoft can be disabled independently, Google and every free Calendar authority remain verified, all synthetic state is removed, owner-only real-provider checks are recorded for PM-P9, the branch is pushed with exact local/upstream/remote equality, and no separate infrastructure, publication, release, merge, or Store gate has been crossed.
