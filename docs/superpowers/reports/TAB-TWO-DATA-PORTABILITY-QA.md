# Tab Two Data Portability QA

**Date:** 2026-09-04<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Runtime and automated-evidence source:** `7173960095132c19ea03c4992cb23bd54a080b17`<br>
**Result:** **LOCAL AUTOMATED PASS, HOSTED ACTIVATION AND OWNER QA PENDING**

## Delivered local boundary

- Account & Sync has one calm `Your data` section for a readable account-data download. The action requires a confirmation and fresh Google verification before any account-export request starts.
- The service contract is account-bound, limited to three attempts per account and privacy-preserving IP fingerprint per hour, requires authentication no more than five minutes old, accepts a maximum 2 KiB request, and rejects a response larger than 4 MiB.
- One service-role-only database snapshot returns account, connected-account, subscription, entitlement, device, and encrypted-vault metadata from one statement snapshot. It excludes provider credentials, Stripe object identifiers, audit rows, and security logs.
- The Edge boundary unwraps the existing encrypted-sync data key only in memory, returns ciphertext plus one ephemeral key to the authenticated extension, and clears the raw key buffer. The server never decrypts a synced record and never receives synced plaintext.
- The extension strictly validates the response, decrypts and authenticates each record in memory, reapplies the closed sync entity policy, removes tombstone values, builds one immutable version 1 readable object, and excludes every raw or wrapped key, nonce, ciphertext, token, session, provider subject, payment identifier, provider cache or response, private URL, image, audit row, and log from the downloaded file.
- Conflict-recovery download is a separate local-only version 1 file for exactly one account-bound recovery copy. It performs no network request, storage write, restore, or discard action.
- The existing Settings > Data backup remains the only importable installation backup. Account-data and conflict-recovery files are not presented as restorable backups.
- No dependency or Chrome permission was added. Production retains `accountDataExportEnabled: false`; preview and account-local modes alone expose deterministic authority.

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

The cumulative checklist in `TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md` remains authoritative. Its new portability checks require the final production build after separately approved hosted activation: cancel and complete fresh Google verification, inspect exactly one readable account file, verify required and prohibited fields, download one real local conflict recovery without changing it, and prove Settings > Data rejects account-data and recovery files as backups.

The six existing honest ceilings also remain manual: native permission prompts, real provider consent and revocation, assistive-technology speech and interaction, physical touch and trackpad behavior, mixed-DPI hardware, and MacBook behavior.

## Hosted activation and rollback boundary

No hosted action was authorized or performed. Migration `20260904000900_account_data_export.sql` is not applied, `account-export` is not deployed, no production secret or permission changed, and the production descriptor remains disabled. No merge, package, release, live Stripe action, provider publication, rollout, or Chrome Web Store action occurred.

The safe pre-activation state is the current rollback: keep `accountDataExportEnabled` false. A later separately approved gate must apply only migration 00900, deploy only `account-export`, use existing secret names without exposing values, run only bounded synthetic records, verify cleanup and limits, and enable the production descriptor only after hosted proof. If that proof fails, keep or restore the descriptor to false and remove only the new function; do not alter local product data, encrypted vault contents, billing grants, provider authorities, or existing migrations.
