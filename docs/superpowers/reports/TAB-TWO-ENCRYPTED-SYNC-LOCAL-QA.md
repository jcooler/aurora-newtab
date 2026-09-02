# Tab Two Encrypted Sync Local QA

**Date:** 2026-09-02<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Runtime evidence source:** `bb2385a27b5556b4ec1c627b49ad9740b892be5b`<br>
**Result:** PASS for the local implementation, default-deny database and Edge contracts, exact build boundaries, installed-extension interaction and visual QA, and the approved no-hosted-state ceiling at this historical checkpoint. The later approved hosted execution is recorded separately in `TAB-TWO-ENCRYPTED-SYNC-HOSTED-QA.md`.

## Delivered local boundary

- Encrypted sync is an explicit Account & Sync switch and never starts from sign-in alone.
- A closed entity policy admits only reviewed settings, layouts, widget configuration, tasks, notes, habits, goals, custom links, and approved non-secret connector preferences.
- Passwords, OAuth tokens, sessions, entitlement leases, signed grants, capability URLs, feed/calendar URLs, provider caches or responses, uploaded images, and device-local operational state are excluded.
- Canonical records use AES-256-GCM with a fresh 96-bit nonce and authenticated account/entity metadata. The account DEK is non-extractable and remains memory-only.
- The account DEK is wrapped through a versioned AES-256-KW server key contract. No KEK value or service-role material exists in the client tree, build output, repository evidence, or logs.
- Local sync metadata is isolated from `AuroraData`, local export, and diagnostics. It tracks accepted revisions, digests, pending mutations, device identity, and recoverable conflict backups without becoming product-data authority.
- The database design is private-schema, default-deny, service-role-only, account/device-bound, idempotent, server-sequenced, limited to five active installations, and limited to 2,097,152 encrypted bytes per account.
- The extension gateway accepts one build-validated Supabase origin, bounds every response and mutation batch to 256 KiB, rejects authentication failures, and never accepts provider URLs from runtime data.
- One visible signed-in, entitled, enabled document owns `tab-two:encrypted-sync:v1`. Local mode and signed-in sync-off mode issue no key, device, pull, or push request.
- Pull applies valid records under the storage lock. A stale remote winner cannot overwrite local data unless a conflict backup succeeds first. Applied remote digests do not echo into a new push.
- Offline changes remain local and retry with bounded 5, 30, 120, and 300 second backoff. Device-limit rejection rolls the local switch back off and gives actionable removal guidance.
- Vault deletion, account deletion, device revocation, and device naming are separate, freshly verified flows. Remote deletion never claims to erase installation-local product data.
- At this local-only checkpoint, production kept `encryptedSyncEnabled: false` pending the separate hosted gate.

## Bounded Critical and Important review

One bounded review covered entity classification, secret-shaped smuggling, random nonces, canonical AAD, key extraction and persistence, account/device binding, RLS, quota arithmetic, idempotency, ordering, backup-before-overwrite, tombstones, revocation, deletion, late async work, local/off isolation, UI truth, disclosure, and rollback.

The single focused fix and rereview cycle closed four Important defects:

1. A failed first bootstrap now retries while the lifecycle remains eligible instead of remaining idle until a later activation.
2. Sixth-device rejection now rolls back local enablement and points the customer to an already-synced installation where a device can be removed.
3. One mutation larger than 256 KiB now fails before the gateway receives any request.
4. Each build now injects one validated account-service origin. Production no longer embeds or accepts the account-local loopback origin.

No Critical or Important finding remains open at the local ceiling.

## Stabilized verification

| Gate | Evidence |
|---|---|
| Whole repository | `npm test`: 250 files, 3,939 tests passed |
| TypeScript | `npx tsc --noEmit`: exit 0 |
| Account, auth, billing, and encrypted-sync Node contracts | 34 tests passed |
| Fresh local database | Migrations through `20260902000500_encrypted_sync_foundation.sql` applied successfully |
| Database adversary matrix | 4 pgTAP files, 219 tests passed |
| Database lint | Zero schema errors at error level |
| Edge functions | 4 files, 151 tests passed |
| Dependency audit | `npm audit --audit-level=high`: 0 vulnerabilities |
| Exact builds | Production, preview, account-local, and final restored production builds passed provenance and manifest contracts |
| Artifact scans | No KEK/DEK material, service-role material, deterministic fixture secret, plaintext vault fixture, preview entitlement marker, account-local origin, or unexpected permission in production output |
| Installed extension | Exact source `bb2385a27b5556b4ec1c627b49ad9740b892be5b` passed the Account & Sync shell harness at 1600x900 and touch-enabled 390x844 |

The repository-wide suite emits the pre-existing unrelated React `act(...)` warning, and Vite emits the existing large-chunk advisory. Neither is a PM-P4 failure.

## Local lifecycle coverage

The local matrix divides proof by the layer that owns the behavior:

- Entity and connector projection tests cover every admitted category, secret-shaped fixtures, deny-by-default unknown keys, URL-bearing connector fields, canonicalization, and deterministic digest comparison.
- Crypto tests cover random nonce ownership, canonical AAD, tamper rejection, account/entity substitution rejection, non-extractable keys, wrapping, and unwrapping.
- Coordinator and storage tests cover independent record edits, same-record stale rejection, idempotent retry, page reduction, accepted revisions, pre-overwrite backup, manual restore, offline local mutation, failed backup preservation, tombstones, non-resurrection, batching, and exact 256 KiB preflight rejection.
- Provider tests cover explicit enablement, first download before upload, one visible-document lock owner, eligibility loss, bounded retry, device limit rollback, disable, sign-out, late-work cancellation, and safe AccountSnapshot projection.
- pgTAP and Edge tests cover exact account/device binding, five-device concurrency, sixth-device rejection, rename, deactivate, reactivate, revoke, quota races and exact boundary, idempotency, stale mutation rejection, pull pagination, tombstone acknowledgement/compaction, vault deletion, account-deletion resume state, JWT, CORS, method, payload, and rate-limit boundaries.
- Installed preview interaction covers signed-in, active, past-due, device-limit, syncing, offline, needs-attention, device removal with fresh verification, device-name validation, vault deletion, account deletion, focus restoration, keyboard navigation, and native touch activation.

No hosted network lifecycle or real cross-installation propagation is claimed. Those proofs require the separately gated Supabase sandbox authority in Task 12.

## Installed-extension evidence

Evidence directory: `artifacts/qa-account-sync-shell/bb2385a27b5556b4ec1c627b49ad9740b892be5b/`

- Production and preview both ran as installed extensions from the same exact tracked source.
- Production proved the local-only Account & Sync state while sync remained compiled off.
- Preview exercised 12 retained states and interactions without contacting a backend.
- Storage-write ledger: empty.
- Request ledger: empty.
- Console-error ledger: empty.
- Page-error ledger: empty.
- Failed-request ledger: empty.
- Every screenshot reports no root horizontal overflow, no viewport escape, no control overlap, and exactly one visible Settings scroll owner.
- All 12 PNGs were inspected at original resolution or, for one inspection-render artifact, against the stored full PNG plus its measured bounds. All 12 retained judgments are PASS.

## Privacy and customer truth

`PRIVACY.md`, `README.md`, and the executable privacy map document the exact encrypted categories and exclusions, non-secret device metadata, recoverable server-wrapped key model, five-installation and 2 MB limits, 90-day post-entitlement retention, deletion semantics, and the exact Supabase destination. Copy consistently says encrypted sync, not end-to-end encrypted or zero knowledge.

## Rollback

- Keep production `encryptedSyncEnabled` false or turn it off first so no new sync request can start.
- Disable push/bootstrap before pull/key release if a hosted binding or ciphertext defect appears.
- Preserve local `AuroraData` as product authority and preserve valid ciphertext for a reviewed forward repair or explicit customer deletion.
- Rotate or revoke only the versioned PM-P4 KEK through the owner runbook and never display prior key material.
- Reverse schema only through a reviewed forward migration or isolated restore.
- Never delete installation-local product data, alter billing grants, merge, release, or mutate the Chrome Web Store as rollback.

## Explicit stop

At this report's local-only checkpoint, no hosted migration, sync function deployment, KEK secret, sandbox sync account/device, encrypted hosted record, owner product-data upload, Supabase Pro change, new permission, live Stripe change, merge, release, package, or Chrome Web Store action was performed. The later approved Task 12 execution is documented in `TAB-TWO-ENCRYPTED-SYNC-HOSTED-QA.md`.
