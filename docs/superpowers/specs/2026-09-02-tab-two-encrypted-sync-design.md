# Tab Two PM-P4 Five-Device Encrypted Sync Design

**Date:** 2026-09-02<br>
**Status:** Owner-approved architecture; written-spec review pending<br>
**Program packet:** PM-P4<br>
**Product architecture:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`<br>
**Threat model:** `docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md`

## Problem statement

Tab Two customers need their approved settings and text data to follow them across Chrome installations without weakening the complete local-first free product. Sync must remain explicitly optional, must not upload credentials or device-local operational state, and must prevent stale or revoked devices from silently overwriting or resurrecting newer data.

PM-P4 introduces a new cryptographic, storage, device, conflict, deletion, and backend boundary. A whole-vault last-write-wins blob would lose independent changes, while a general CRDT would exceed the approved MVP conflict policy and solo-maintainer support budget. The packet therefore uses typed record-level envelopes with optimistic server revisions.

## Goals

1. Let an entitled signed-in customer explicitly enable encrypted sync on no more than five active installations.
2. Encrypt every admitted record in the extension with AES-256-GCM before upload and keep ordinary backend operation plaintext-free.
3. Merge independent entities while resolving same-record conflicts only by server-accepted revision, never device time.
4. Preserve local data through outages, revocation, quota failures, malformed remote data, and conflicts.
5. Make device, quota, recovery, vault deletion, and account deletion behavior understandable and self-service.

## Non-goals

- End-to-end encrypted or zero-knowledge claims. Google-authenticated recovery requires privileged server key release.
- Syncing connector credentials, capability URLs, provider payloads, caches, custom images, timer sessions, or browser-local operational state.
- Background sync for signed-out, Local-mode, unentitled, or sync-disabled users.
- Supabase Realtime, WebSockets, CRDTs, cloud conflict copies, automatic conflict retries, or device fingerprinting.
- Metrics history, premium provider connectors, onboarding, analytics, telemetry, notifications, live billing, release packaging, merge, or Chrome Web Store work.
- Provisioning Supabase Pro or changing hosted schema, functions, or secrets before a separate owner gate.

## User stories

- As a premium customer, I want to enable sync explicitly so my approved settings and text data follow me without uploading local secrets.
- As an offline customer, I want local Tab Two behavior to continue normally so a service outage cannot block my dashboard.
- As a customer with several installations, I want to see and rename devices and choose which one to revoke when I reach the limit.
- As a customer whose local edit loses a server conflict, I want a recoverable local copy so adopting the server version does not destroy my work.
- As a privacy-conscious customer, I want clear included and excluded data lists so I know that passwords, tokens, sessions, and feed URLs remain local.
- As a departing customer, I want to delete the cloud vault or account without erasing local data from any installation.

## Chosen architecture

### Record-level envelopes

Tab Two syncs independently addressable records rather than one encrypted `AuroraData` document. Every record has one stable entity type and entity id. The server stores only routing metadata, ciphertext, a per-record revision, and a global vault version used by conditional pulls.

A mutation supplies the last server revision the device observed. The server accepts it only when that revision still matches, assigns the next per-record revision and next global vault version, and records the device acknowledgement. Concurrent changes to different records both succeed. Concurrent changes to the same record produce one accepted write and one stale rejection.

The alternatives are rejected as follows:

- One encrypted vault blob makes unrelated edits overwrite one another and cannot satisfy independent entity merging.
- A CRDT or append-only event log adds schema, compaction, recovery, and support complexity without matching the approved latest-server-accepted-revision policy.

### Cryptography and key lifecycle

- Each account has one random 256-bit data-encryption key, or DEK.
- Each record uses Web Crypto AES-256-GCM with a new cryptographically random 96-bit nonce for every encryption. A nonce is never reused with the same DEK.
- Canonical UTF-8 JSON additional authenticated data contains exactly: envelope version, account UUID, entity type, entity id, record revision, and tombstone Boolean.
- Ciphertext plaintext contains exactly `{ schemaVersion, entityType, entityId, value }`. A decrypted identity mismatch is rejected before local mutation.
- The backend stores the DEK wrapped with AES-256-KW under a versioned 256-bit key-encryption key, or KEK, held only in Supabase secret storage. The initial secret name is `TAB_TWO_SYNC_KEK_V1`; checked-in code contains only its name and key version, never material.
- Routine KEK rotation unwraps and rewraps the DEK without decrypting vault records. Suspected DEK compromise creates a new DEK and uses a privileged, audited re-encryption job before any later production rollout.
- A privileged Edge Function releases raw DEK material only after validating a Google-authenticated session, the provider-neutral account UUID, the `encrypted_sync` entitlement, and an active non-revoked device.
- The extension keeps the raw DEK in memory only. It is never written to Chrome storage, `AuroraData`, backup files, diagnostics, logs, screenshots, errors, or test evidence.
- Local product data remains readable from the existing plaintext Chrome storage authority. If the DEK is unavailable, sync pauses but local behavior remains unchanged.

Cryptographic tests use published AES-GCM and AES-KW vectors plus injected deterministic randomness. Production randomness always comes from `crypto.getRandomValues`.

## Exact sync entity map

The serializer is a central tagged union. Every current `AuroraData` top-level key is either projected into the following allowlist or explicitly excluded. A new key or field has no default sync behavior and fails the classification contract until reviewed.

| Entity type | Stable id | Admitted value |
|---|---|---|
| `settings` | `singleton` | Name, time format, briefing choices, semantic color preferences, units, mute, Flow ambience/volume, layout density, and widget toggles |
| `focus` | local `YYYY-MM-DD` | Focus text and completion for that date |
| `todo_list` | existing list id | List name and its typed item ids, text, and completion state |
| `quick_link` | existing link id | Title and safe HTTP(S) URL accepted by the current Quick Link validator |
| `timer_config` | `singleton` | Work and break minute preferences only |
| `location` | `singleton` | Validated latitude, longitude, label, and manual-selection flag |
| `notes` | `singleton` | Notes text; the existing local timestamp is data metadata only and never ordering authority |
| `world_clock` | canonical IANA zone | Zone and label; the existing UI prevents duplicate zones |
| `countdown` | existing countdown id | Name and validated local calendar date |
| `legacy_layout` | `singleton` | The existing legacy recovery layout, preserved as a separate authority |
| `layout_manifest` | `singleton` | Named-layout document version and active layout id only |
| `named_layout` | existing layout id | Name, placements, stacks, tiers, layers, dock state, and hidden state for one named layout |
| `calendar_preference` | named layout id | Default Agenda/Month view and public-holiday inclusion for that layout |
| `calendar_week_start` | `singleton` | Locale, Sunday, or Monday |
| `connector_preference` | existing connector id | Only fields explicitly admitted by that connector's sync projection; projections apply as preferences and never create an enabled connection when required local authority is absent |
| `habit` | existing habit id | Name and creation metadata without the completion log |
| `habit_completion` | `<habit-id>:<YYYY-MM-DD>` | One completion Boolean per habit and date |
| `progress_goal` | existing goal id | Name, unit, target, creation metadata, and current dated value |

Connector projection rules are exhaustive across all 15 existing connectors:

- Always exclude tokens, passwords, email credentials, `snapshotEpoch`, capability URLs, user-supplied service origins, feed/calendar URLs, provider caches, and raw responses.
- Public no-secret choices such as coin ids, country code, view selection, item count, and section toggles may sync.
- Account labels, repository/project/team selections, entity ids, and action ids may sync only where their connector projection names them explicitly.
- A projected preference overlays an already configured local connector. It cannot create a usable token- or URL-backed connection on another device and cannot silently enable an incomplete connector.
- RSS, ICS, Status, and Home Assistant URL-bearing connection material remains local even when adjacent display preferences sync.

The following are excluded in full: `timerSession`, `photoPrefs`, `weatherCache`, `weatherAlertCache`, `connectorSnapshots`, `refreshPreferences`, `attentionLedger`, `apodCache`, uploaded photo bytes and device-local image references, the separately stored Supabase session, the signed entitlement lease, sync device metadata, sync revision metadata, sync conflict backups, and all future unclassified keys. Excluding `photoPrefs` prevents another installation from selecting an uploaded-image mode when that image exists only on the originating device.

Manual JSON backup remains an independent feature and retains its existing redaction policy.

## Local sync state

PM-P4 adds three isolated, versioned Chrome-storage records outside `AuroraData`:

- `tab-two:sync-device:v1`: random 128-bit base64url device id, validated friendly name, enabled Boolean, and registration state.
- `tab-two:sync-index:v1`: account UUID, last global vault version, and the last accepted revision and content digest for each admitted entity.
- `tab-two:sync-conflict-backups:v1`: at most five local displaced-record backups, each retained for 30 days.

These records are excluded from manual JSON backup, cloud sync, diagnostics, and account export. They are accessed through typed adapters under the existing cross-context storage authority. Account mismatch, malformed content, or unsupported versions fail closed without modifying `AuroraData`.

A conflict backup contains the entity type/id, validated displaced local value, observed remote revision, creation time, and reason code. It contains no connector secret because the value passed through the sync serializer before backup. The backup is local plaintext under the same Chrome/OS profile boundary as ordinary local product data.

Before a remote conflict winner replaces a local value, one storage-authority transaction appends the backup and applies the remote value plus revision metadata. If backup persistence fails, the remote value is not applied and sync enters `Needs attention`.

Customers may review, restore, export, or delete a conflict backup. Restore is explicit: it adopts the current server revision as its base and creates a new local mutation. No conflict backup retries itself automatically.

## Device lifecycle

- Enabling sync asks for a friendly name between 1 and 48 trimmed characters. The default is `My device`; Tab Two does not derive or store a hardware fingerprint.
- A device id is generated only with `crypto.getRandomValues`. Clearing extension storage loses the id and a later registration counts as a new device.
- The server counts only `active` devices against the five-device limit. `inactive` and `revoked` devices cannot call key, pull, or push functions.
- A first-time enable registers or reactivates the current device, obtains the DEK, and pulls the complete current vault before any local push.
- Turning sync off disables local coordination immediately and makes one authenticated best-effort deactivation request. A successful request releases the active slot. If offline, the server may continue showing the slot until the customer removes it from another active installation; Tab Two performs no hidden retry while sync is off.
- Remote removal requires fresh Google authentication, the exact selected device id, and a server account-ownership check. It marks the target revoked and makes future key/pull/push calls fail.
- A revoked installation keeps local data. On its next request it disables local sync, clears its in-memory key and sync index, and explains that the device was removed. Rejoining requires a new explicit enable and a new device id.
- A sixth installation may sign in and use every free local feature. Enable sync remains blocked until the customer explicitly deactivates or revokes an active device.
- Friendly-name changes are explicit authenticated mutations and do not change device identity.

## Sync coordinator and request behavior

One visible Tab Two document per browser profile owns `tab-two:encrypted-sync:v1` through the existing Web Lock pattern. Other tabs observe ordinary local storage changes but do not duplicate network work.

- Eligible local changes push after 750 ms of quiet time, with a 5-second maximum wait during sustained edits.
- A push contains no more than 50 mutations or 256 KiB of encoded request data. Larger queues are split deterministically.
- Every mutation has a random idempotency id. A retry of the same id returns the original result and cannot increment a revision twice.
- The coordinator performs a conditional pull on enable, on visible startup, after focus/visibility restoration when the prior pull is at least 15 seconds old, every 60 seconds while a Tab Two document remains visible, after an accepted push, and on explicit `Sync now`.
- Pulls use `afterVaultVersion`, a 100-record page limit, and a 256 KiB response limit. Pagination completes before any resulting local apply is announced as successful.
- `Sync now` requests one immediate pull and flushes pending local mutations. It still respects one in-flight operation and server abuse limits.
- Network failures use visible-only backoff of 5 seconds, 30 seconds, 2 minutes, then 5 minutes. Focus or `Sync now` may retry immediately. Hidden or sync-disabled documents do not poll.
- Remote-applied storage changes carry coordinator provenance and revision digests so they do not echo as new local mutations.
- Sign-out, entitlement loss, revocation, sync disable, unmount, or account change aborts in-flight work, clears the in-memory DEK, and prevents late completion from mutating local state.

## Server model and functions

All tables are private with explicit service-role access only unless an authenticated RPC is narrowly required. Authenticated users never select raw billing, key, mutation-idempotency, or cross-account device rows directly.

Minimum private data model:

- Account sync key: account UUID, wrapped DEK, KEK version, created time, rotated time, and vault retention boundary.
- Device: account UUID, random device id, friendly name, `active | inactive | revoked`, created time, last sync time, last acknowledged vault version, and revocation time.
- Sync record: account UUID, entity type/id, record revision, global vault version, tombstone Boolean, nonce, ciphertext, encoded size, creating device id, and accepted time.
- Mutation receipt: account UUID, device id, idempotency id, request digest, stable outcome, and bounded expiry.
- Sync audit: stable event code, account/device ids, correlation id, and time. It never contains ciphertext, plaintext, keys, values, URLs, or user text.

Functions:

- `sync-bootstrap`: authenticate, enforce entitlement/device limit, create or reactivate the selected device, create or unwrap the account DEK, and return key material plus vault/device metadata.
- `sync-pull`: authenticate active device ownership and return bounded ciphertext records after a conditional vault version.
- `sync-push`: authenticate active device ownership, validate every envelope and quota boundary, apply idempotent optimistic mutations, and return accepted or stale outcomes with authoritative encrypted winners.
- `sync-deactivate-device`: make the current device inactive.
- `sync-rename-device`: rename the exact owned device.
- `sync-revoke-device`: require fresh authentication and revoke one exact owned non-current device.
- `sync-delete-vault`: require fresh authentication plus typed confirmation, delete ciphertext/key material and deactivate devices while preserving the account, billing, and local data.
- `account-delete`: require fresh authentication plus typed confirmation and execute the deletion saga below.

Per-account and per-IP limits are enforced in the same database-backed style as PM-P2 and PM-P3. Initial ceilings are: bootstrap/key release 10 per 10 minutes; pull 120 per 10 minutes; push 120 per 10 minutes; rename/deactivate/revoke 20 per 10 minutes; vault/account deletion 5 per day. A request exceeding its limit returns a stable retryable code without revealing account existence.

The server enforces a 2,097,152-byte total across ciphertext and persistent envelope metadata. Tombstones count until compacted. The client repeats the check only for early feedback. The server remains authoritative.

## Tombstones and compaction

- A deletion is a normal optimistic mutation with `tombstone: true`, `value: null`, and the next record revision.
- A stale device cannot overwrite a tombstone because its expected revision no longer matches.
- Each successful pull advances the active device's acknowledged global vault version only after the client validates, decrypts, backs up if required, and atomically applies the page.
- A tombstone is eligible for deletion only when every active device has acknowledged at least its global vault version. Inactive and revoked devices do not block compaction.
- Compaction is a service operation with a bounded batch size and audit count. It never changes live records or local device data.

## Account deletion saga

Account deletion crosses Stripe and Postgres and cannot be one transaction. The safe idempotent order is:

1. Verify a fresh Google-authenticated session, exact account UUID, and typed `DELETE` confirmation.
2. Mark the account `deletion_pending`, block new Checkout and sync mutations, and issue one deletion operation id.
3. If an active Stripe sandbox subscription exists, cancel future billing through the existing server-owned Stripe binding. No client-supplied subscription id is accepted.
4. In one database transaction, revoke grants and sessions, delete the encrypted vault/key, device and sync records, identities, and account-scoped application data, and retain only the minimum audit/tombstone required to make retries idempotent.
5. Delete or invalidate the Supabase Auth user through privileged admin authority and return a completed state.

If Stripe cancellation fails, account data is not deleted and the operation remains retryable. If Stripe succeeds but a later step fails, retry resumes after the completed Stripe step. Local data on every installation remains untouched. The owner's real account is never used for destructive hosted evidence; a dedicated sandbox account is required after the external gate.

## UI and interaction design

PM-P4 keeps the approved Account & Sync visual language: semantic accent edge, restrained accent tint, strong primary action, quiet secondary controls, hairlines, readable muted copy, and theme-derived colors rather than hard-coded cyan.

The current misleading `What sync can include` list is replaced by two explicit groups:

- `Encrypted when sync is on`: settings and layouts; tasks, notes, habits, goals, and links; approved non-secret connector preferences.
- `Always stays on this device`: passwords, tokens, sessions, feed/calendar URLs; provider caches and responses; uploaded images and device-local operational state.

Required owner-approved original-resolution mockups before production React or CSS changes:

1. Signed in, entitled, sync off, with truthful included/excluded disclosure.
2. Name-device and first-pull flow.
3. Up to date with quota, last success, and device management.
4. Offline while local data remains available.
5. Needs attention with a recoverable conflict backup.
6. Five-device limit with explicit selected-device removal and fresh verification.
7. Vault deletion and account deletion confirmation/final states.

Status behavior:

- `Syncing`: active pull, push, bootstrap, or remote apply.
- `Up to date`: no pending mutation and the last complete pull/push succeeded.
- `Offline`: network unavailable; local state remains usable and no destructive action occurred.
- `Needs attention`: quota, malformed ciphertext/schema, failed conflict backup, revoked device, incomplete disable, or non-retryable server response. Copy identifies the safe next action without exposing internals.

The switch and actions use associated status/alert text, minimum 36 px settings targets, keyboard-visible focus, focus restoration after dialogs, one Settings scroll owner, and no horizontal overflow at 320 px. Ordinary billing revalidation remains automatic and independent of sync status.

## Error and recovery policy

- Authentication invalidation clears account and sync authority but never local product data.
- Entitlement expiry stops new sync traffic and preserves the cloud vault for 90 days. The last verified local state remains available.
- Network/service failure never replaces local data and reports `Offline`.
- Invalid key material, authentication failure, ciphertext, AAD, schema, entity identity, revision, or server response fails closed as `Needs attention`.
- Quota rejection leaves local mutations queued and offers export/delete guidance; it never deletes records automatically.
- A stale upload produces the local backup transaction and adopts the verified server winner. It never retries the displaced value automatically.
- Vault deletion success disables sync and clears only sync metadata/key material locally. Account and billing remain.
- Account deletion success signs out and clears account/sync metadata only. Local `AuroraData` remains.

## Privacy and public copy

Public documentation must disclose the exact Supabase sync destination, encrypted record categories, excluded secrets and URLs, device metadata, account-recoverable key model, 2 MB quota, five-device limit, 90-day post-entitlement vault retention, deletion behavior, and the fact that Tab Two's service can technically release the key. It must use `encrypted sync`, never `end-to-end encrypted` or `zero knowledge`.

No behavioral analytics or telemetry is added to measure adoption. Success is established through deterministic repository, database, Edge Function, exact-build, and installed-extension evidence.

## Acceptance criteria

- Local and signed-in sync-off modes make zero sync/key/device requests.
- Only a verified `encrypted_sync` capability and explicit enable action can start sync.
- The production bundle contains no KEK, DEK, deterministic crypto fixture, service-role material, or preview entitlement authority.
- Every admitted entity round-trips through canonical serialization, AES-GCM encryption, server persistence, decryption, validation, and atomic local application.
- Exhaustive fixtures prove every credential, token, session, lease, capability URL, provider cache/response, custom image, and device-local state is excluded.
- Independent record edits merge; same-record stale writes are rejected; the losing local value is recoverable; device clocks never decide.
- Duplicate mutation retries are idempotent, tombstones cannot be resurrected, and compaction waits for all active acknowledgements.
- The sixth device cannot activate sync and no device is auto-evicted.
- Revocation, sync disable, entitlement loss, sign-out, account change, and late async completions cannot mutate local state or continue requests.
- The server and client both enforce the exact 2 MB boundary.
- Vault and account deletion are fresh-authenticated, idempotent, auditable, and never erase installation-local product data.
- All seven UI states pass desktop and touch-narrow visual, keyboard, focus, alert/status, overflow, request, storage-write, and runtime-error inspection.
- The protected original checkout and protected untracked paths remain untouched; merge, live billing, release, and Store state remain unchanged.

## Verification strategy

- Pure unit tests for entity classification, canonical encoding, crypto vectors, unique nonces, AAD binding, key wrapping, revision algebra, tombstones, queueing, backoff, and abort ownership.
- Storage tests for versioned sync metadata, account binding, corruption, conflict-backup atomicity, retention, review, restore, and exclusion from backup/diagnostics.
- pgTAP adversary tests for cross-account/device access, private keys/records, five-device races, exact quota boundaries, stale updates, idempotency mismatch, tombstone acknowledgement, deletion, and rate limits.
- Edge Function tests with injected key, repository, auth, entitlement, and Stripe gateways before any hosted use.
- Production artifact scans for keys, secrets, fixtures, plaintext test payloads, sessions, capability URLs, and service-role symbols.
- Exact production, preview, and account-local builds plus installed-extension Chromium at desktop and touch-narrow sizes.
- A two-installation local harness for independent edits, same-record conflicts, network loss, revocation, quota, tombstones, restart, and zero-echo remote apply.
- After a separate hosted gate, use only dedicated sandbox accounts for destructive and five-device evidence. Never delete or revoke the owner's production account.

## Delivery phases and approval gates

1. Commit this design after owner review.
2. Write the executable PM-P4 plan with exact files, interfaces, RED/GREEN tests, reviews, rollback, and build/browser gates.
3. Create the seven original-resolution UI mockups and stop for owner visual approval before production React or CSS.
4. Implement the serializer, crypto, coordinator, storage adapters, local database/functions, UI, and tests against local/fake infrastructure.
5. Complete one bounded Critical/Important review and one stabilized local gate.
6. Stop and request a new explicit gate before applying hosted migrations, creating the KEK secret, deploying sync/key/deletion functions, registering real devices, or sending any product data to Supabase.
7. After approval, use dedicated sandbox data for hosted evidence, reconcile ledgers, commit, and push. Stop before Supabase Pro, PM-P5, merge, release, or Chrome Web Store action.

## Rollback

- Disable sync bootstrap and push first so no new cloud writes occur.
- Disable pull/key release if account binding, ciphertext validation, or device authorization is unsafe.
- Turn the extension adapter off and leave `AuroraData` as local authority.
- Preserve the encrypted vault until a reviewed forward repair or explicit customer deletion. Never guess-decrypt, rewrite, or erase ciphertext during rollback.
- Rotate or revoke only the PM-P4 KEK through the owner runbook; never expose prior key material.
- Reverse schema only through a reviewed forward migration or isolated restore.
- Do not delete local product data, alter billing grants, merge, release, or mutate the Chrome Web Store.

## Open questions

No blocking product question remains. The exact hosted project mutation list, KEK creation procedure, deployed function versions, rate-limit verification method, and rollback commands must be frozen in the later external-gate request after local implementation is reviewed. Supabase Pro remains a separate pre-launch decision and is not required for local PM-P4 work.
