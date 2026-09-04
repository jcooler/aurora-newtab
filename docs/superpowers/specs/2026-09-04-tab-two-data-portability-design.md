# Tab Two Account & Sync Data Portability Design

**Status:** Draft for owner approval

**Date:** 2026-09-04

**Product:** Tab Two

**Scope:** Important paid-MVP follow-up identified by PM-P9

## Decision summary

Tab Two will add a customer-controlled, readable account-data export without
weakening its encrypted-sync or local-first boundaries.

A signed-in customer can choose **Download account data** in Account & Sync.
Tab Two then requires fresh Google verification, requests one bounded account
export from the service, decrypts eligible vault records only in extension
memory, validates every record through the existing deny-by-default sync
schema, and downloads one readable JSON file. The service never assembles or
receives plaintext synced content.

Each local conflict recovery row gains its own **Download copy** action. That
download is created entirely on the current installation and does not contact
Tab Two, Google, a calendar provider, or Stripe.

The existing Settings > Data backup remains separate. It is a local dashboard
backup intended for restore. The new account-data file is a portable customer
record and is not presented as an importable backup.

## Problem statement

Tab Two promises that customers can export their account metadata and encrypted
vault, and the conflict-recovery design promises that each displaced local copy
can be exported. PM-P9 confirmed that the stabilized product exposes none of
those controls. The existing local dashboard backup cannot satisfy the promise
because it deliberately excludes service metadata, encrypted-vault state, and
local conflict recoveries.

Without this follow-up, customers cannot independently retain a usable copy of
the paid service data associated with their account. That is an Important trust
and release-readiness gap for a product that asks customers to sign in, sync
personal content, and pay for ongoing service.

## Goals

1. Give every signed-in account owner a readable, self-service export of the
   customer-facing metadata and synced content held for that account.
2. Keep synced plaintext outside the backend by decrypting and validating vault
   records only in extension memory after fresh authentication.
3. Let a customer download any local conflict recovery without restoring,
   discarding, syncing, or mutating it.
4. Preserve the local-first free product, existing local backup, sync opt-in,
   all free capabilities, and all current connector boundaries.
5. Close the PM-P9 export-control blocker with deterministic security tests,
   installed-extension evidence, and an explicit hosted activation gate.

## Non-goals

- Importing an account-data export is not part of this version. A portability
  file is not labeled or treated as a restore backup.
- Replacing or changing the existing local backup and restore format is out of
  scope. It continues to cover local dashboard data under its current rules.
- Exporting raw access tokens, refresh tokens, session tokens, signing keys,
  wrapped or raw data keys, Stripe object identifiers, provider subjects,
  provider caches, raw provider responses, custom images, private capability
  URLs, audit logs, security logs, or anti-abuse state is prohibited.
- A formal legal data-subject-request workflow is not created here. The export
  is the product's customer portability control.
- Password-protected archives, ZIP generation, scheduled exports, email
  delivery, cloud storage delivery, bulk conflict-recovery export, and account
  export import are future considerations.
- This design does not authorize a hosted migration, Edge Function deployment,
  paid infrastructure, live Stripe, OAuth publication, new Chrome permission,
  merge, package, release, rollout, or Chrome Web Store action.

## Users and stories

### Signed-in customer

- As a signed-in customer, I want one understandable download of my Tab Two
  account and synced data so that I can retain and inspect my information.
- As a customer whose subscription or sync is inactive, I want to export data
  that remains in my account so that portability is not conditioned on paying
  again or re-enabling sync.
- As a customer with no encrypted vault, I want an account-only export rather
  than an unexplained failure.
- As a privacy-conscious customer, I want an explicit warning that the
  downloaded file is readable and should be kept private.

### Customer with a conflict recovery

- As a customer reviewing a displaced local edit, I want to download that one
  recovery before deciding whether to restore or discard it.
- As a customer, I want downloading a recovery to leave both the recovery and
  my current data unchanged.

### Free local user

- As a local-only user, I want Account & Sync and Settings > Data to remain
  request-free unless I explicitly sign in or invoke an existing local backup.

## Approaches considered

### 1. Export ciphertext and a wrapped key

This preserves the server representation but does not give the customer a
meaningfully readable or independently useful export. It is rejected for the
primary customer control.

### 2. Decrypt in the Edge Function and return plaintext

This would make the backend a plaintext processor during every export and
expand logging, memory, and incident-response exposure. It is rejected.

### 3. Return a fresh-authenticated encrypted snapshot and decrypt locally

This is the selected approach. The backend returns only the customer's bounded
metadata, encrypted vault records, and an ephemeral raw data-key response over
the authenticated TLS request. The extension imports the key as non-extractable,
clears the temporary byte buffer, decrypts and validates each record in memory,
and excludes all key material from the downloaded file.

The account-data export and local recovery export remain separate because they
have different authorities. A recovery exists only on the installation that
created it and should not be uploaded merely to combine two downloads.

## Customer experience

### Account-data surface

Account & Sync adds a dedicated **Your data** section between Devices and
Account actions. It is not placed in the destructive-actions group.

The section contains:

- Heading: `Your data`
- Supporting copy: `Download a readable copy of your Tab Two account and synced data.`
- Privacy copy: `The file may contain notes, tasks, links, and other synced content. Keep it private.`
- Action: `Download account data`

Selecting the action opens an accessible confirmation dialog. The dialog makes
the readable-file consequence explicit and offers `Cancel` and
`Verify with Google & download`.

The confirmation action runs one continuous flow:

1. Open fresh Google verification using the existing explicit reauthentication
   path.
2. If verification succeeds, immediately begin preparing the export. Do not
   require a second confirmation click.
3. Show a visible spinner and `Preparing download...` while the service request,
   decryption, validation, and file creation run.
4. Close the dialog after the browser accepts the download and show the polite
   section status `Account data downloaded.`

Closing or failing Google verification produces no service export request and
no file. A blocked popup, offline response, malformed response, oversized
response, missing key, failed decryption, invalid entity, account mismatch, or
download failure shows one specific inline error and a `Try again` action. No
partial file is downloaded.

Account export is available to any signed-in account owner. It does not require
an active subscription, entitlement, enabled sync installation, or active
device. An account with no vault downloads valid account metadata with an empty
synced-data section.

### Conflict-recovery surface

Each row in **Recovery copies** shows three actions in this order:

1. `Restore`
2. `Download copy`
3. `Discard`

On narrow layouts the actions wrap as a deliberate group without horizontal
overflow. Downloading creates the file immediately and reports
`Recovery copy downloaded.` through a polite status. Failure reports an inline
error and changes only that row's download action to `Try again`.

Recovery download does not require Google verification because the data is
already local plaintext under the current Chrome and operating-system profile.
It performs no request and no storage write, and it does not remove or restore
the recovery.

### Motion and accessibility

- Pending work uses the established Tab Two inline spinner and restrained
  state transition, not a blocking page-level loader.
- Motion respects `prefers-reduced-motion`.
- The dialog traps focus, closes with Escape only while idle, restores focus to
  its invoker, and prevents accidental backdrop close while work is pending.
- Status and error copy use the existing polite-status and assertive-alert
  primitives. The pending button uses `aria-busy` and remains disabled against
  duplicate activation.
- Keyboard, 200 percent zoom, and supported touch layouts keep every action
  reachable with a minimum 44 by 44 CSS pixel target where the current design
  system requires touch sizing.

## Account export file contract

The browser downloads UTF-8, pretty-printed JSON named:

`tab-two-account-data-YYYY-MM-DD.json`

The top-level format is versioned and exact-key validated:

```json
{
  "app": "tab-two",
  "kind": "account-data",
  "version": 1,
  "exportedAt": "2026-09-04T12:00:00.000Z",
  "account": {},
  "connectedAccounts": [],
  "subscription": {},
  "entitlement": {},
  "devices": [],
  "syncedData": {}
}
```

### `account`

- `accountId`: provider-neutral Tab Two account UUID
- `email`: current Tab Two sign-in email
- `displayName`: current display name or `null`
- `createdAt`: account creation time as UTC ISO 8601
- `identityCreatedAt`: Google identity-link creation time as UTC ISO 8601
- `identityUpdatedAt`: last identity-link update time as UTC ISO 8601

The Google provider subject and Supabase authentication-user UUID are excluded.

### `connectedAccounts`

One entry per current Google Calendar or Microsoft Calendar connection:

- `connectionId`
- `provider`
- `accountKind`
- `email`
- `displayName`
- `status`
- `grantedScopes`
- `createdAt`
- `updatedAt`

Refresh tokens, encrypted token envelopes, provider subjects, token-refresh
times, OAuth transactions, PKCE values, state, nonce, caches, calendar lists,
events, delta links, and raw provider responses are excluded.

### `subscription`

- `state`
- `plan`
- `currentPeriodStart`
- `currentPeriodEnd`
- `courtesyEnd`
- `cancelAtPeriodEnd`
- `createdAt`
- `updatedAt`

Fields that do not apply are `null`. Stripe customer, subscription, Checkout
Session, event, and webhook identifiers are excluded.

### `entitlement`

- `capabilities`: sorted current capability names
- `grantSources`: sorted current grant-source names
- `expiresAt`: earliest current expiry or `null`

Signed-lease payloads, lease IDs, key IDs, signatures, and revoked or historical
grant records are excluded.

### `devices`

One entry per active, inactive, or revoked sync installation:

- `deviceId`
- `friendlyName`
- `state`
- `lastSeenAt`
- `createdAt`
- `updatedAt`
- `revokedAt`

The IDs are Tab Two's random installation identifiers, not hardware
fingerprints. A null time is represented as `null`.

### `syncedData`

- `status`: `not_created`, `empty`, or `available`
- `vaultVersion`
- `storedBytes`
- `records`: records sorted by `entityType` and then `entityId`

Each record contains:

- `entityType`
- `entityId`
- `revision`
- `vaultVersion`
- `deleted`
- `value`, present only when `deleted` is `false`

For live records, `value` is the canonical value produced by the existing
deny-by-default sync entity schema. Tombstones are included as metadata with no
value. Nonce, ciphertext, stored size, creating device, accepted time, data key,
wrapped key, key version, and mutation receipt data are excluded from the file.

The account export is all or nothing. Every server record must match the
authenticated account, pass header validation, authenticate under AES-256-GCM,
match its plaintext identity, and pass the current sync-entity validator. One
failure prevents file creation and leaves all local and service state unchanged.

## Conflict-recovery file contract

The browser downloads UTF-8, pretty-printed JSON named with a sanitized entity
type and UTC timestamp:

`tab-two-recovery-ENTITY-YYYY-MM-DDTHHMMSSZ.json`

The exact version 1 structure is:

```json
{
  "app": "tab-two",
  "kind": "sync-conflict-recovery",
  "version": 1,
  "exportedAt": "2026-09-04T12:00:00.000Z",
  "accountId": "00000000-0000-4000-8000-000000000000",
  "recovery": {
    "id": "example",
    "entity": {},
    "observedRemoteRevision": 2,
    "createdAt": "2026-09-04T11:55:00.000Z",
    "reason": "stale_remote_winner"
  }
}
```

The existing conflict-backup parser and sync-entity validator must accept the
record immediately before serialization. The export contains only the selected
recovery, never the complete local recovery store or sync index.

## Service architecture

### Endpoint

Add one extension-origin-only Edge Function:

`POST /functions/v1/account-export`

The request body has exactly one field, `accountId`. The function requires a
valid Supabase bearer token, resolves the provider-neutral account from the
verified authentication user, requires the body account ID to match, and
requires an interactive authentication time no more than five minutes old.
Client state never satisfies freshness by itself.

The function deliberately does not require a paid entitlement, active sync
device, or enabled local sync state. It rate-limits export attempts by both
account and privacy-preserving IP fingerprint to three requests per hour.

### Consistent snapshot

A service-role-only database function reads one statement-level snapshot of:

- account and identity metadata
- current customer-visible billing summary and timestamps
- current effective entitlement
- current provider-connection metadata
- all sync-device metadata
- current vault summary, wrapped data key, and encrypted current records

The RPC is revoked from `public`, `anon`, and `authenticated` and granted only
to `service_role`. No new direct browser table access or row-level-security
exception is added.

The vault remains capped at 2 MiB stored size. The Edge Function and client
enforce an independent 4 MiB serialized response ceiling and bounded collection
lengths. Any impossible shape or size fails closed.

### Key handling

If a vault contains records, the Edge Function unwraps the account data key
with the existing server keyring and returns the 32-byte raw key as base64url in
the authenticated response. The raw key is never logged, persisted, included in
an error, or placed in the customer file.

The extension decodes the raw key into an owned byte buffer, imports a
non-extractable AES-GCM `CryptoKey`, clears the raw byte buffer immediately, and
retains the key only for the duration of the export operation. There is no new
Chrome-storage key, IndexedDB record, cache, object-store item, or diagnostic
field.

If no vault exists, the response contains an empty record list and no data key.
A key without records or records without a valid key is rejected.

### Server plaintext boundary

The Edge Function does not decrypt a sync record. It may access the raw data key
only long enough to return the fresh-authenticated export response. Plaintext
record values exist only inside the extension process while the explicit
download is being prepared.

### Mutation and observability boundary

Export is read-only except for its rate-limit counters and one minimal audit
event containing only account ID, success or failure code, record count, byte
count, and timestamp. Logs contain stable error codes and a correlation ID,
never metadata payloads, ciphertext, plaintext, tokens, keys, names, email
addresses, entity types, entity IDs, or provider details.

The request must not acknowledge vault versions, update device last-seen time,
change subscription state, enable sync, consume an introductory offer, alter a
provider connection, or touch local product storage.

## Client architecture

### Pure formatters

Add pure, versioned serializers for account-data and conflict-recovery exports.
They own exact-key output, deterministic record ordering, ISO timestamps,
filename generation, pretty JSON, and Blob download construction. They accept
already validated typed values and never read global storage or network state.

### Account gateway

Add a typed account-export gateway separate from the sync coordinator. It:

- obtains the current account-bound access token through the existing session
  authority
- sends the exact POST request with the production origin allowlist
- caps time and response bytes
- exact-key validates all service metadata, key material, record headers,
  collection sizes, identifiers, enums, and timestamps
- imports and clears the raw key material
- decrypts and validates every record
- returns a complete immutable export model or one bounded failure kind

It never updates the sync index, registers a device, pulls through the normal
coordinator, or applies remote records to local dashboard data.

### Account action

Expose one account action that prepares the validated export after the UI has
completed fresh Google reauthentication. Local and preview clients implement
the same typed contract with deterministic outcomes. Production configuration
must keep the action unavailable if the endpoint is not explicitly enabled.

### Recovery export

Expose a local typed operation that reads the requested recovery through the
existing account-bound local-state adapter, revalidates it, and returns the
single immutable recovery export. It does not expose the raw recovery store to
the Settings component.

## Failure model

Customer-facing failures are bounded to:

- `authentication_required`: sign in again
- `verification_required`: complete fresh Google verification
- `offline`: reconnect and try again
- `rate_limited`: wait and try later
- `data_unavailable`: Tab Two could not prepare a safe complete export
- `download_failed`: the browser could not save the prepared file
- `recovery_not_found`: the local recovery expired or was already removed

Internal cryptographic, schema, repository, and provider details never reach UI
copy. Authentication failure clears invalid authority through the existing
account boundary. Other failures do not sign the customer out or alter local
data.

## Privacy and security requirements

- Account export starts only after an explicit customer action and fresh Google
  verification. No background, focus, visibility, billing, sync, or provider
  event starts it.
- Local mode, sign-in, ordinary account hydration, sync enablement, Sync now,
  and conflict detection do not create an export or export request.
- The service derives account ownership from the verified bearer token and
  rejects cross-account IDs before reading export data.
- The response and final file use deny-by-default exact schemas. Unknown fields
  fail closed instead of being copied forward.
- The existing secret-bearing corpus must be tested against both server
  response normalization and final JSON serialization.
- The final file may contain sensitive customer-authored plaintext. The UI must
  state this before reauthentication and must not place file contents in logs,
  diagnostics, telemetry, clipboard, or screenshots.
- Tab Two adds no analytics for export use. Success is measured through QA and
  support outcomes, not behavioral tracking.
- The implementation adds no dependency and no Chrome permission, including no
  `downloads` permission. It uses the established user-initiated Blob download
  pattern.

## Acceptance criteria

### P0 account export

- [ ] Given a signed-in account, selecting `Download account data` opens the
  readable-file confirmation dialog without making an export request.
- [ ] Given successful fresh Google verification, the dialog automatically
  enters a visible pending state and exactly one account-export request runs.
- [ ] Given valid account metadata and vault records, exactly one version 1 JSON
  file downloads with the specified filename, shape, ordering, and readable
  values.
- [ ] Given no vault, the account-only file downloads with `not_created`, zero
  bytes, and an empty record list.
- [ ] Given an expired subscription, disabled sync, inactive device, revoked
  current device, or no registered device, the authenticated owner can still
  export retained account data.
- [ ] Given canceled verification, stale authentication, an account mismatch,
  malformed metadata, an invalid key, failed AES-GCM authentication, an invalid
  sync entity, an oversized response, offline state, timeout, rate limit, or
  download failure, no partial file is created and the UI gives a safe retry or
  recovery message.
- [ ] The server never receives or produces plaintext synced values.
- [ ] The final file contains none of the prohibited secret, key, session,
  Stripe-identifier, provider-subject, cache, raw-response, image, URL, log, or
  audit fields.

### P0 recovery export

- [ ] Every visible recovery row exposes `Restore`, `Download copy`, and
  `Discard` in that order.
- [ ] Downloading one recovery produces exactly one valid version 1 JSON file
  containing only that account-bound recovery.
- [ ] Download success and failure do not change the recovery store, current
  local product data, sync index, server state, or network ledger.
- [ ] A missing, expired, malformed, or account-mismatched recovery produces no
  file and safe inline feedback.

### P0 regression and presentation

- [ ] Local mode and signed-in idle mode add zero requests and zero storage
  writes.
- [ ] Existing local backup export and restore remain byte-contract compatible.
- [ ] Sync enable, disable, push, pull, conflict restore, conflict discard,
  device management, billing, deletion, Google Calendar, and Microsoft Calendar
  remain unchanged outside the new explicit actions.
- [ ] Desktop and supported touch layouts have no clipping, horizontal overflow,
  obscured content, duplicate activation, focus loss, or unreadable state.
- [ ] Spinner and state transitions are restrained, stable, and suppressed under
  reduced motion.
- [ ] Production builds contain no preview data, secret marker, raw key, local
  endpoint, or unauthorized configuration.

## Success measures

Tab Two does not add analytics for this feature. Release evidence must show:

- 100 percent pass across the exact account-export contract matrix, including
  fresh authentication, cross-account denial, schema rejection, cryptographic
  rejection, no-vault behavior, and entitlement-independent access.
- 100 percent pass across the recovery export immutability and no-request matrix.
- Zero prohibited corpus values in final export fixtures and production build
  scans.
- Zero unexpected requests, storage writes, console errors, page errors, failed
  requests, clipping, or overflow in the installed-extension fixture run.
- All retained desktop and touch screenshots inspected at original resolution.

Post-launch support may track whether customers can complete exports without
assistance, but no target depends on adding behavioral telemetry.

## Implementation phases and gates

### Phase 1: Local contracts and deterministic UI

Implement pure export contracts, local recovery download, typed client and Edge
interfaces, deterministic preview fixtures, UI states, unit and integration
tests, database tests, Edge tests, production and preview builds, scans, and
installed-extension Chromium evidence. Production code may target a disabled
endpoint configuration, but no hosted object is changed.

Before production React or CSS edits, generate original-resolution Account &
Sync captures for the idle data section, verification dialog, preparing state,
safe failure state, and recovery actions at desktop and supported touch sizes.
Use the established Tab Two cyan accent, typography, spacing, focus, and motion
system. Because owner hands-on QA is deferred, the implementation packet may
continue after documented internal original-resolution inspection; the owner
receives the cumulative manual checklist at the end.

### Phase 2: Bounded hosted sandbox activation

Requires a new explicit owner gate naming the exact migration, function,
configuration flag, invocation ceiling, data classes, rollback, and cleanup.
Only the sandbox Supabase account authority is in scope. No paid plan, live
Stripe, provider publication, new OAuth app, or Store action is implied.

### Phase 3: Stabilization and cumulative owner QA

After hosted proof, rerun the affected specialist gate and one stabilized full
gate. Add the final account-export and recovery-export checks to the already
deferred owner checklist rather than interrupting implementation with ad hoc
manual testing.

## Test and evidence strategy

Use observed RED, minimal GREEN, and focused tests for:

- exact file schemas, ordering, filenames, and immutable serialization
- all entity types, tombstones, empty vault, maximum vault, Unicode, and UTC
  timestamps
- secret-bearing and malformed corpora
- raw-key decode, import, buffer clearing, record authentication, identity
  binding, and entity validation
- fresh-auth success, cancellation, staleness, cross-account denial, rate limit,
  no-entitlement, no-device, timeout, size, and repository failure
- per-recovery success, missing recovery, account mismatch, immutability, no
  request, and no storage write
- dialog focus, Escape, backdrop, duplicate activation, pending states, status
  announcements, retry labels, reduced motion, and touch sizing
- existing local backup, account, billing, sync, provider, and deletion
  regression contracts

The installed-extension fixture run retains original-resolution desktop and
touch PNGs plus request, storage, console, page-error, failed-request, focus,
geometry, and download ledgers. Export fixtures use synthetic data only and are
deleted or retained solely under the existing protected untracked evidence
policy.

## Documentation impact

After verified implementation, reconcile:

- `PRIVACY.md` with the exact customer-data and exclusion lists
- `README.md` with the two distinct export purposes
- Account & Sync Help copy with fresh verification and readable-file handling
- PM-P9 release dossier with the Important export blocker closed only to the
  extent actually verified
- `STATUS.md`, `ROADMAP.md`, and `DECISIONS.md` with exact source and gate state
- the deferred owner checklist with account export and recovery export checks

Documentation must not call the account-data file encrypted, importable, or a
complete legal data-subject response. It must not imply hosted activation,
production readiness, or release authority before those facts are verified.

## Rollback

- Revert local UI, formatters, gateways, fixtures, and disabled configuration
  with targeted reviewed commits.
- If the hosted sandbox is later activated, disable the client configuration
  first, then undeploy only the new `account-export` function if required.
- Never delete a customer vault, data key, account, provider connection,
  subscription, recovery, or local dashboard value during rollback.
- Reverse database changes only through a reviewed forward migration. Do not
  rewrite hosted migration history.
- Preserve the existing local backup, account, billing, sync, and provider
  authorities throughout.

## Open questions

No blocking product question remains if the owner approves this written design.
The implementation plan must freeze exact file ownership, response field guards,
SQL signatures, rate-limit migration, visual-fixture identifiers, commands,
hosted mutation list, and rollback commands before work begins.
