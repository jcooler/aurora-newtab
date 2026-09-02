# Tab Two Encrypted Sync Hosted QA

**Date:** 2026-09-02<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Hosted matrix source:** `e2ec380134c0c062b770a2ec2821c9f9ecae7044`<br>
**Production-enable source:** `6317fedf35a0aadf2cf9ed5c9afe16f9d7b12616`<br>
**Result:** PASS for the approved hosted sandbox matrix and cleanup. The owner's explicit installed-extension enable, local-data, and disable witness remains the only open PM-P4 manual ceiling.

## Approved hosted authority

- Supabase project `ovlobmvxtryitupxwylg` remains on the Free plan. No payment method, Pro upgrade, or paid add-on was created.
- Remote migration history is aligned through only `20260902000500_encrypted_sync_foundation.sql` for this packet.
- One 32-byte random `TAB_TWO_SYNC_KEK_V1` value was generated in process memory, written directly to Supabase secret storage, never displayed, and never retained in the repository or build.
- `sync-bootstrap`, `sync-deactivate-device`, `sync-rename-device`, `sync-revoke-device`, `sync-pull`, `sync-push`, `sync-delete-vault`, and `account-delete` are ACTIVE at version 3 with `verify_jwt = true`.
- The existing account and billing function hashes and update timestamps were unchanged by PM-P4 deployment.
- Production now compiles the reviewed sync gateway on through `encryptedSyncEnabled: true`. Sign-in alone still creates no device, key, pull, push, or product-data request; the customer must explicitly turn on Enable sync.
- No Chrome permission, host permission, OAuth scope, live Stripe object, live payment, release, package, merge, or Chrome Web Store state changed.

## Hosted corrections found by real service behavior

The dedicated hosted matrix found two production integration defects that local fakes could not expose:

1. Supabase access tokens do not carry the previously assumed `auth_time` claim. Fresh authentication now derives from the newest verified interactive `amr` timestamp. `token_refresh`, malformed claims, and unverified tokens do not satisfy the five-minute boundary.
2. Revoked-device database sentinels were being collapsed into a retryable service failure. Only the exact private `sync_device_not_active`, `sync_device_revoked`, and `sync_device_not_found` sentinels now normalize to the same public `device_not_found` response. All other repository failures remain a fixed secret-safe service error.

Both changes were implemented RED first, passed focused tests, and were deployed only to the eight approved PM-P4 functions. The remaining observed stops were harness defects: a synthetic magic-link provider label, omitted writer acknowledgement before tombstone compaction, and excess QA bootstrap calls. Their fixes changed no customer authentication setting, database contract, rate limit, or deployed function behavior.

## Dedicated sandbox matrix

Three temporary aliases were used only for this run: `sync-matrix`, `vault-delete`, and `account-delete`. They created Matrix Studio, Matrix Laptop, Matrix Office, Matrix Tablet, Matrix Phone, one rejected Matrix Sixth installation, Vault Source, Vault Peer, and Deletion Device. Every account, identity, grant, device, record, receipt, rate-limit row, and Auth user was removed in cleanup.

The final redacted evidence records all 15 required lifecycle groups as true:

- JWT rejection before account access;
- first device, five-device concurrency, and sixth-device rejection;
- one shared wrapped account key across admitted devices;
- rename, deactivate, reactivate, revoke, and revoked-device rejection;
- independent encrypted records and identical idempotent retry;
- same-record stale resolution with successful client decryption;
- idempotency digest mismatch rejection;
- bounded pull pagination;
- tombstone acknowledgement, compaction, and non-resurrection;
- exact 2,097,152-byte quota acceptance and over-quota rejection;
- cloud-vault deletion while local proof data remains intact; and
- interrupted then resumed account deletion.

The run made 48 function calls, received 13,939 response bytes, and peaked at exactly 2,097,152 encrypted vault bytes. This stayed below the approved ceilings of 1,000 invokes, 100 MiB egress, 16 MiB database usage, and three monthly active test users.

Evidence: `artifacts/qa-encrypted-sync-hosted/e2ec380134c0c062b770a2ec2821c9f9ecae7044/evidence.json`

The retained artifact contains only short irreversible identifier fingerprints, aliases, boolean outcomes, status codes, byte counts, limits, and cleanup counts. It contains no email address, token, link, key material, ciphertext, service-role value, KEK, password, or account UUID.

## Cleanup proof

The PASS artifact reports zero residual sync vaults, devices, and records. A separate hosted query after process exit confirmed:

| Hosted fixture state | Residual count |
|---|---:|
| Sync vaults | 0 |
| Sync devices | 0 |
| Sync records | 0 |
| Sync rate limits | 0 |
| PM-P4 QA identities | 0 |

The cleanup assertions are part of the PASS result rather than an operator-only follow-up.

## Production build boundary

Production source `6317fedf35a0aadf2cf9ed5c9afe16f9d7b12616` built successfully with 339 modules. The reconciled source at `6ba72a7b25786d8a6f21990d2a23a6a2fe190401` then passed the exact production, preview, account-local, and restored-production build sequence with 339, 289, 337, and 339 modules. Every artifact carries exact source provenance.

The production manifest retains the existing production identity permission, exact Supabase host permission, and exact static return-site connection. Preview contains no account backend or sync marker and has no host permission or external connection. Account-local retains only its loopback host. Production contains the reviewed typed sync gateway. A value-shaped scan found no KEK, service-role value, secret key value, private key, QA identity, or example email. Literal `sb_secret_`, localhost, and loopback strings remain only inside fail-closed configuration validators or the pinned Supabase client library, not as configured production authority.

## Stabilized verification

| Gate | Result |
|---|---|
| Whole repository | 250 files, 3,944 tests passed |
| Supabase Edge functions | 4 files, 156 tests passed |
| Focused Node authority contracts | 16 tests passed |
| TypeScript | `npx tsc --noEmit` passed |
| Database adversary matrix | 4 pgTAP files, 219 tests passed |
| Database lint | No schema errors at error level |
| Dependency audit | 0 vulnerabilities at high threshold |
| Exact builds | Production 339, preview 289, account-local 337, restored production 339 modules |
| Diff hygiene | Passed; only the two protected untracked paths remain outside committed work |

The repository-wide suite retains its pre-existing unrelated React `act(...)` warning, and Vite retains its large-chunk advisory. Neither is a PM-P4 failure.

## Owner manual ceiling

The signed-in owner's stable-Chrome new-tab page cannot be automated through the available browser-control security boundary because `chrome://newtab/` is protected. The remaining witness therefore requires the owner to reload the exact unpacked production build, explicitly enable sync, observe Protected and up to date with existing local content intact, disable sync, reopen Tab Two with local content still present, and report the final off state. Hosted inspection will read only record types/counts, device state, and audit metadata. It will not read ciphertext or invoke revoke, vault deletion, account deletion, billing, or sign-out.

## Rollback

- Set production `encryptedSyncEnabled` false first so no new client sync lifecycle starts.
- Disable bootstrap and push before pull or key release if account binding, ciphertext validation, or device authorization becomes unsafe.
- Preserve installation-local AuroraData as product authority and preserve valid ciphertext for reviewed forward repair or explicit customer deletion.
- Rotate or revoke only the versioned PM-P4 KEK through the owner runbook. Never display prior key material.
- Reverse schema only through a reviewed forward migration or isolated restore.
- Do not delete local product data, alter billing grants, merge, release, package, or mutate the Chrome Web Store as rollback.

## Explicit stop

PM-P4 does not authorize Supabase Pro, PM-P5, live Stripe, a production payment, new permissions or secrets, merge, release, packaging, upload, publication, rollout, or any Chrome Web Store action.
