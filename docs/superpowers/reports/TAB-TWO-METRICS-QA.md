# Tab Two Metrics QA

**Date:** 2026-09-03<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Local runtime evidence source:** `13e5f7df2c082944048cbb99bdea9d19fe97358f`<br>
**Hosted matrix source:** `c772838586eae9f7dbe922981134366ab36bb845`<br>
**Result:** PASS for the local Metrics implementation, aggregate-only storage and export, encrypted bucket sync, exact build isolation, installed-extension Chromium QA, approved hosted activation, and complete synthetic-fixture cleanup.

## Delivered boundary

- Metrics is a premium, off-by-default widget with Compact, Standard, Full, docked, and stacked presentations.
- A current `metrics_history` capability permits collection of daily numeric aggregates from local Habits, Tasks, completed Focus sessions, and already-cached ICS, GitHub, GitLab, and Vercel data. It creates no provider request.
- The history model stores dates, closed source categories, closed source-instance identifiers, random installation and bucket identifiers, monotonic per-bucket sequence numbers, and numeric totals only.
- Titles, names, descriptions, URLs, tokens, sessions, credentials, event text, task text, habit text, repository names, project names, provider payloads, and raw activity records are never copied into Metrics history.
- History is pruned to the first local calendar day 12 months before the current month, giving at most 13 calendar months of retained buckets.
- Capability expiry stops new collection but does not hide or delete existing local history. Offline state also preserves the last local history.
- Settings > Progress owns a native JSON download and explicit scoped or complete deletion. Deletion requires a two-step confirmation and never follows connector disablement implicitly.
- Schema v22 appends the Metrics widget toggle without enabling, placing, or rearranging it in an existing layout.
- Encrypted sync projection admits only canonical `metric_bucket` records with UUID identities. Hosted migration 00600 and version 5 of `sync-push` and `sync-pull` now accept that same closed contract.

## Review and focused repairs

One bounded Critical and Important review covered privacy leakage, duplicate aggregation, retention drift, capability bypass, storage migration loss, sync identity validation, cross-account access, destructive-action ambiguity, accessibility, and layout regression.

The review and exact browser pass closed these Important defects:

1. Entitlement expiry now preserves readable history while preventing new collection.
2. Storage hydration and collection failures render distinct recoverable states without discarding prior data.
3. Aggregate export and deletion remain serialized through the storage authority.
4. The Metrics identity is present exactly once across production registries and catalogs.
5. Progress test setup now waits for persisted rows instead of racing asynchronous storage hydration.
6. The Standard `View history` action retains a 44 px target at touch-narrow width even when Chromium does not expose `pointer: coarse` as the primary pointer.
7. The installed-extension harness waits for the responsive drawer to settle before measuring geometry.

No Critical or Important finding remains open at the verified PM-P5 ceiling.

## Stabilized verification

| Gate | Result |
|---|---|
| Focused Metrics, storage, sync, widget, Settings, and App suites | Passed at each TDD checkpoint; final widget focus passed 14 tests |
| Whole repository | `npm test -- --run`: 256 files, 4,046 tests passed at `5946bdd` before the later preview-only fixture and touch-style changes |
| Repeated hydration regression | The exact Progress test passed 20 consecutive runs; its full file passed 16 tests |
| TypeScript | `npx tsc --noEmit`: exit 0 |
| Fresh local database | `npx supabase db reset --local`: migrations through `20260902000600_metrics_sync_entity.sql` applied locally |
| Database adversary matrix | `npm run test:supabase-local`: 4 pgTAP files, 225 tests passed |
| Database lint | Private and public schema lint returned zero error-level findings |
| Edge functions | 4 files, 47 tests passed for the final focused sync function run |
| Encrypted sync size contract | `node scripts/qa-encrypted-sync.mjs`: PASS at 2,097,152 bytes |
| Dependency audit | `npm audit --audit-level=high`: 0 vulnerabilities |
| Exact build isolation | Production 348 modules, preview 299 modules, and restored production 348 modules |
| Production fixture scan | No preview account, preview Metrics, storage harness, permissions harness, backup harness, or restore harness marker in production output |
| Diff hygiene | `git diff --check`: passed |

The repository-wide suite retains its pre-existing unrelated React `act(...)` warning, and Vite retains its existing large-chunk advisory. Neither is a PM-P5 failure.

## Installed-extension evidence

Evidence directory: `artifacts/qa-tab-two-metrics/13e5f7df2c082944048cbb99bdea9d19fe97358f/`

Production and preview both ran as installed MV3 extensions from the exact tracked source. The final production build was restored after preview QA.

- Production locked state passed with preview fixtures absent.
- Preview loading, error and retry, first-use empty, populated, expired retained, and offline retained states passed.
- All 7, 30, 90, and 365 day controls passed.
- Settings routing, native Blob export, delete cancel, scoped delete, visible keyboard focus and order, reduced motion, layout editing, docking, stacking, and reload persistence passed.
- Desktop 1600x900, short 1408x600, ultrawide 3440x1440, and touch-enabled 390x844 had no horizontal overflow or escaped controls.
- Thirteen original-resolution PNGs were retained and inspected.
- The downloaded fixture contained seven aggregate-only buckets and passed the raw or sensitive key scan.
- Request, console-error, page-error, and failed-request ledgers were empty.

## Hosted activation

The owner approved the exact hosted gate. Supabase project `ovlobmvxtryitupxwylg` remains on Free with no payment method or paid add-on.

- The dry run found exactly one pending migration and no seed or role change.
- Migration `20260902000600_metrics_sync_entity.sql` replaced only the private `sync_records` closed-type constraint and private `apply_sync_mutations` implementation to admit UUID-identified `metric_bucket` records.
- Only `sync-push` and `sync-pull` were redeployed. Both are ACTIVE at version 5 with JWT verification enabled.
- The first parallel deployment response claimed both succeeded, but metadata showed only `sync-pull` advanced. No matrix ran in that partial state. A sequential `sync-push` redeploy advanced it to version 5 before testing.
- No table, column, index, role grant, public API, secret, OAuth setting, permission, storage bucket, realtime subscription, plan, or other function changed.

### Hosted matrix

One disposable Google-shaped synthetic identity and account held only `encrypted_sync` and `metrics_history` capabilities. The matrix used one random device and one aggregate-only Tasks bucket. It did not use owner product data or retain ciphertext in evidence.

- Bootstrap succeeded.
- The aggregate bucket push succeeded.
- A non-UUID Metrics record identifier was rejected with 400 `invalid_request`.
- An unregistered random device was rejected with 404 `device_not_found`.
- Pull returned the expected type, UUID, revision, and tombstone metadata.
- The revision 2 tombstone succeeded.
- Six function invocations returned 1,351 response bytes.
- Cleanup removed the synthetic vault, device, record, account, identity, grant, audit state, rate-limit state, and Auth user.

Evidence: `artifacts/qa-metrics-sync-hosted/c772838586eae9f7dbe922981134366ab36bb845/evidence.json`

Independent read-only inspection found migration count 1, both private validators admitting `metric_bucket`, zero hosted Metrics records, zero PM-P5 QA identities, and zero PM-P5 QA Auth users. It read no ciphertext or customer content.

The approved Free-tier budget was respected. Rollback remains: disable client Metrics projection first, preserve installation-local history, remove only verified synthetic state, redeploy the prior two function sources, apply a reviewed forward rollback migration restoring the prior vocabulary and private RPC body, and verify no `metric_bucket` rows remain.

## Remaining manual ceilings

Owner hands-on QA is intentionally deferred until the end of development. The cumulative list is maintained in `TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`. Real stable Chrome, native download presentation, real assistive technology, and MacBook behavior are not claimed from automation.

## Explicit stop

Only migration 00600, `sync-push`, `sync-pull`, and the cleaned disposable synthetic matrix changed hosted state. No Supabase plan change, payment method, paid add-on, production secret, OAuth change, Chrome permission, live Stripe action, package, release, merge, or Chrome Web Store action was performed.
