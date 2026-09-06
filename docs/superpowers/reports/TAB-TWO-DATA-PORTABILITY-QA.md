# Tab Two Data Portability QA

**Date:** 2026-09-05<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Runtime and automated-evidence source:** `5f2417f268aa4faea83c5dd225b7073d63cf2061`<br>
**Result:** **HOSTED PASS; AUTOMATED_PASS_OWNER_QA_PENDING**

## Approved UI refinement regression follow-up (2026-09-05)

Final exact source `86a963fb1626e416c02afe0653559e54f2787710` preserves enabled production account export and the prior Task 7 hosted evidence below. The approved subscriber presentation now orders membership, encrypted sync, and Your data while retaining verification, export, recovery, and deletion handlers. The portability specialist and all 12 automated composed specialists passed; production authentication remains in the cumulative owner checklist. No hosted deployment, migration, synthetic service traffic, secret, or permission change occurred in this UI packet. See [the widget refinement QA report](TAB-TWO-APPROVED-WIDGET-REFINEMENTS-QA.md) for current runtime provenance and verification.

## Task 7 hosted activation and current verification

Task 7 hosted activation passed after explicit owner approval on 2026-09-05. Only migration 00900 and the account-export function were deployed. Three export POSTs proved populated export (200), cross-account denial (403), and real stale-authentication denial (401); one existing sync-bootstrap invocation provisioned only the synthetic encryption key. Hosted snapshots and service privileges, transaction-rolled-back account/IP rate limits, and client replay checks cover the remaining boundaries without extra export POSTs. Two synthetic accounts, two encrypted records including one tombstone, two provider metadata rows, and all associated state were removed; IP rate rows were restored and supplemental Auth audit/session/refresh/identity counts are zero. Rollback actually undeployed account-export (GET 404), proved disabled-client zero requests, retained migration 00900, and restored the same JWT-verified bundle. All other function metadata stayed unchanged. Production accountDataExportEnabled was set true only after this proof and cleanup.

- Hosted evidence: `artifacts/qa-data-portability-hosted/4c61c621af2045a74a3bec76920c01ac6b046474/mtohabqx/evidence.json`; supplemental `auth-cleanup-verification.json` in the same directory.
- 19 checks passed. Export responses were 200 / 2,307 bytes, 403 / 29 bytes, and 401 / 41 bytes. The existing synthetic-key bootstrap returned 324 bytes and was not redeployed. No other export POST was made, including during rollback.
- No-vault/no-device/no-entitlement and service-role execution boundaries were checked in the hosted database. The successful HTTP export independently proves no entitlement or active device is required. Rate-policy assertions run inside a rolled-back synthetic transaction; they do not create extra export traffic.
- Missing/wrong key, altered ciphertext, foreign-record identity, prohibited fields, and declared/actual response-size rejection were checked by the production client using replayed hosted data. These are client checks, not additional live endpoint requests. The in-memory readable file was 2,766 bytes; it was not written to an artifact.
- Cleanup proved zero accounts, identities, grants, provider connections, vaults, account keys, devices, records, account rate rows, sync audit rows, Auth users, Auth identities, sessions, refresh records, and Auth audit rows. IP rate rows were restored to their prior state.
- Rollback removed the function and observed GET 404, exercised the disabled client with zero requests, retained migration 00900, and redeployed the same JWT-verified version 1 bundle. Other function metadata was unchanged. No prior migration was reversed.
- Fresh affected verification: 160 client/UI cases across the final runs, 73 Edge cases, 31 documentation/QA tests, TypeScript, and exact production/preview builds. The first client run exposed an outdated disabled-export assertion; the failed file was corrected and passed all six cases. No production contract was weakened.
- Composed gate: all 12 automated specialists passed at `5f2417f268aa4faea83c5dd225b7073d63cf2061`; only production account authentication is deferred. Ledger totals: {"requests":16,"storageWrites":18,"consoleErrors":0,"pageErrors":0,"failedRequests":0}. Evidence: `artifacts/qa-paid-mvp-stabilization/5f2417f268aa4faea83c5dd225b7073d63cf2061/evidence.json`.
- The original composed invocation paused on missing screenshot judgments. New captures were inspected, their original evidence contracts validated, and the remaining exact specialist matrix resumed without rerendering completed candidate evidence. The final index passed the repository composed-gate validator. The existing large-chunk build advisory remains. The historical whole-repository and local pgTAP results below were preserved rather than rerun for this activation.

## Retained local implementation evidence (2026-09-04)

The following local implementation results and captures belong to source `7173960095132c19ea03c4992cb23bd54a080b17`. The Task 7 record above supersedes their pre-activation status.

### Delivered local boundary

- Account & Sync has one calm `Your data` section for a readable account-data download. The action requires a confirmation and fresh Google verification before any account-export request starts.
- The service contract is account-bound, limited to three attempts per account and privacy-preserving IP fingerprint per hour, requires authentication no more than five minutes old, accepts a maximum 2 KiB request, and rejects a response larger than 4 MiB.
- One service-role-only database snapshot returns account, connected-account, subscription, entitlement, device, and encrypted-vault metadata from one statement snapshot. It excludes provider credentials, Stripe object identifiers, audit rows, and security logs.
- The Edge boundary unwraps the existing encrypted-sync data key only in memory, returns ciphertext plus one ephemeral key to the authenticated extension, and clears the raw key buffer. The server never decrypts a synced record and never receives synced plaintext.
- The extension strictly validates the response, decrypts and authenticates each record in memory, reapplies the closed sync entity policy, removes tombstone values, builds one immutable version 1 readable object, and excludes every raw or wrapped key, nonce, ciphertext, token, session, provider subject, payment identifier, provider cache or response, private URL, image, audit row, and log from the downloaded file.
- Conflict-recovery download is a separate local-only version 1 file for exactly one account-bound recovery copy. It performs no network request, storage write, restore, or discard action.
- The existing Settings > Data backup remains the only importable installation backup. Account-data and conflict-recovery files are not presented as restorable backups.
- No dependency or Chrome permission was added. At the local closeout, production retained `accountDataExportEnabled: false`; Task 7 above records its later approved activation. Preview and account-local modes retain deterministic authority.

## Download contracts

The readable account file is named `tab-two-account-data-YYYY-MM-DD.json` and has exact top-level keys `app`, `kind`, `version`, `exportedAt`, `account`, `connectedAccounts`, `subscription`, `entitlement`, `devices`, and `syncedData`. Its discriminator is `tab-two` / `account-data` / version `1`. Connected accounts, capabilities, grant sources, devices, and records use deterministic ordering, timestamps are ISO UTC strings, and deleted records omit `value`.

The local recovery file is named `tab-two-recovery-<entity>-YYYY-MM-DDTHHMMSSZ.json` and has exact top-level keys `app`, `kind`, `version`, `exportedAt`, `accountId`, and `recovery`. Its discriminator is `tab-two` / `sync-conflict-recovery` / version `1`. The selected recovery is cloned and immutable and remains available after download.

## Security and privacy proof

- Database coverage proves migration objects, service-role-only execution, public/authenticated/anonymous denial, exact account isolation, no-vault behavior, deterministic record order, export audit outcomes, and the three-per-hour account plus IP rate limit.
- Edge coverage proves method, CORS, JWT, fresh-authentication, account binding, exact request shape, request and response size limits, rate limiting, snapshot failure, malformed rows, key unwrap, no-record behavior, response minimization, audit behavior, and raw-key cleanup.
- Client coverage proves exact endpoint ownership, response bounds and schemas, authenticated decryption, tamper and account-substitution rejection, policy rejection, tombstones, deterministic serialization, immediate Blob URL revocation, safe failure, and late-work cancellation.
- Production artifact scans found no preview fixture marker, local Supabase endpoint, service-role environment name, sync/provider secret name, private-key marker, or Stripe secret prefix. The only `sb_secret_` strings are negative key-validation/library guards, not a key value.
- The deterministic browser evidence is synthetic only and contains no owner data or secret-looking value.

## Bounded review and focused correction

One complete-diff review covered export authorization, fresh authentication, cross-account isolation, snapshot consistency, rate and size limits, key lifetime, authenticated decryption, prohibited fields, entity-policy revalidation, download lifecycle, recovery immutability, local and idle request isolation, UI truth, documentation, build isolation, and rollback. No Critical or Important product defect remained open.

The stabilized replay exposed one stale Help QA locator after the approved customer wording changed from `a local backup` to `the local backup`. The observed failing contract was aligned to the customer copy, a source-level regression was added, and the affected support QA plus complete composed gate passed. This correction changed no production behavior.

## Stabilized verification

| Gate | Result |
|---|---|
| Whole repository | `npm test`: 279 files, 4,420 tests passed |
| TypeScript | `npx tsc --noEmit`: exit 0 |
| Focused client, sync, and Settings contracts | 12 files, 160 tests passed |
| Focused account-export and sync Edge contracts | 3 files, 73 tests passed |
| Documentation, QA, and composed-gate contracts | 22 tests passed |
| Local database | `npx supabase test db`: 6 files, 348 pgTAP tests passed |
| Production build | 367 modules transformed; exact provenance restored after preview/specialist runs |
| Preview build | 317 modules transformed |
| Exact data-portability QA | PASS for five installed-extension states and both viewports |
| Full paid-MVP stabilization | `AUTOMATED_PASS_OWNER_QA_PENDING`; every automated specialist passed and only production account authentication remained `DEFERRED_OWNER_QA` |
| Diff hygiene | `git diff --check`: passed |

Vite retains its existing large-chunk advisory. The repository-wide suite retains its pre-existing unrelated React `act(...)` warning. Neither is a data-portability failure.

## Exact installed-extension evidence

Evidence directory: `artifacts/qa-data-portability/7173960095132c19ea03c4992cb23bd54a080b17/`

| Capture | Pixels | Bytes | Observed judgment |
|---|---:|---:|---|
| `desktop-idle.png` | 1600 x 900 | 668,940 | PASS: clear hierarchy, balanced flat section, legible copy, no clipping or overflow |
| `desktop-verification.png` | 1600 x 900 | 125,890 | PASS: contained confirmation, understandable fresh-verification promise, visible cancel path |
| `desktop-preparing.png` | 1600 x 900 | 667,661 | PASS: stable inline progress, no layout shift, reduced-motion fallback active |
| `desktop-safe-failure.png` | 1600 x 900 | 671,481 | PASS: restrained actionable failure, explicit no-change reassurance, retry remains reachable |
| `touch-recovery.png` | 390 x 844 | 56,968 | PASS: recovery actions wrap coherently, remain ordered Download then Restore then Discard, and stay contained |

All five PNGs, totaling 2,190,940 bytes, were inspected at original resolution. Geometry recorded zero root horizontal overflow and zero escaped controls in every state. The interaction ledger proves confirmation before request, cancel focus restoration, one account download, one local recovery download, and recovery action order. Idle state recorded zero requests, writes, console errors, and page errors. The complete run recorded exactly one fixture-fulfilled account-export intent, zero wire requests, zero storage writes, zero console errors, zero page errors, and zero failed requests.

Final restored production artifacts are source-bound to `7173960095132c19ea03c4992cb23bd54a080b17`:

- `dist/manifest.json`: 1,377 bytes, SHA-256 `887E3C6A1D8B09EE0524FF8458C796CD8062EE10C5AB64715EA2A14BC81FF989`
- `dist/build-provenance.json`: SHA-256 `CB021448B31DD0E01737F311C55199759F48884B5DC5C4ADB48FF02330322A28`

## Remaining owner QA

The cumulative checklist in `TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md` remains authoritative. With Task 7 hosted activation verified, its portability checks use the final production candidate: cancel and complete fresh Google verification, inspect exactly one readable account file, verify required and prohibited fields, download one real local conflict recovery without changing it, and prove Settings > Data rejects account-data and recovery files as backups.

The six existing honest ceilings also remain manual: native permission prompts, real provider consent and revocation, assistive-technology speech and interaction, physical touch and trackpad behavior, mixed-DPI hardware, and MacBook behavior.

## Pre-activation boundary (historical, 2026-09-04)

At the September 4 local closeout, hosted activation was not authorized: migration 00900 and account-export were unhosted and the production descriptor was disabled. The approved September 5 Task 7 execution above supersedes that status. Merge, package, release, live Stripe, provider publication, rollout, and Chrome Web Store authority remain closed.

The exercised rollback is to disable accountDataExportEnabled and undeploy only account-export. Migration 00900 remains applied; any database correction must be a separately scoped forward migration. Do not alter local product data, customer vault contents, billing grants, provider authorities, or earlier migration history. The current approved state has the proven function restored and production export enabled.
