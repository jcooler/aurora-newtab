# Tab Two Metrics QA

**Date:** 2026-09-03<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Runtime evidence source:** `13e5f7df2c082944048cbb99bdea9d19fe97358f`<br>
**Result:** PASS for the local Metrics implementation, aggregate-only storage and export, source-complete encrypted bucket support, exact build isolation, and installed-extension Chromium QA. Hosted migration `00600` and the affected sync function deployments remain separately gated and were not applied.

## Delivered boundary

- Metrics is a premium, off-by-default widget with Compact, Standard, Full, docked, and stacked presentations.
- A current `metrics_history` capability permits collection of daily numeric aggregates from local Habits, Tasks, completed Focus sessions, and already-cached ICS, GitHub, GitLab, and Vercel data. It creates no provider request.
- The history model stores dates, closed source categories, closed source-instance identifiers, random installation and bucket identifiers, monotonic per-bucket sequence numbers, and numeric totals only.
- Titles, names, descriptions, URLs, tokens, sessions, credentials, event text, task text, habit text, repository names, project names, provider payloads, and raw activity records are never copied into Metrics history.
- History is pruned to the first local calendar day 12 months before the current month, giving at most 13 calendar months of retained buckets.
- Capability expiry stops new collection but does not hide or delete existing local history. Offline state also preserves the last local history.
- Settings > Progress owns a native JSON download and explicit scoped or complete deletion. Deletion requires a two-step confirmation and never follows connector disablement implicitly.
- Schema v22 appends the Metrics widget toggle without enabling, placing, or rearranging it in an existing layout.
- Encrypted sync projection admits only canonical `metric_bucket` records with UUID identities. The local database migration and Edge validation are source-complete, but hosted activation remains closed.

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

No Critical or Important finding remains open at the local and source-only ceiling.

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

## Hosted activation still closed

The existing hosted authority accepts the PM-P4 vocabulary through `progress_goal`; it does not yet accept `metric_bucket`. Migration `20260902000600_metrics_sync_entity.sql` exists only in source and the local database.

The separately gated hosted delta is limited to:

1. Apply migration `00600`, which replaces the private `sync_records` type check and the private `apply_sync_mutations` implementation to admit only `metric_bucket` UUID identities. It adds no table, column, index, role grant, public API, secret, permission, or paid service.
2. Redeploy only `sync-push` and `sync-pull` with JWT verification so their shared closed vocabulary can validate the new type in request, response, and stale-winner paths.
3. Exercise one disposable synthetic account with one aggregate-only encrypted bucket, malformed-id rejection, pull, tombstone, isolation, and cleanup. Do not use owner product data and do not inspect ciphertext.
4. Perform read-only post-deploy checks of migration history, function name/version/JWT state, record type counts, and zero residual synthetic rows.

Expected Supabase Free impact is negligible: two function deployments, one private constraint/function replacement, a bounded handful of function invokes, and temporary encrypted rows removed by the same run. No payment method, plan change, new secret, OAuth change, storage bucket, realtime subscription, or additional service is required.

Rollback before any customer build reload is: remove all synthetic rows; redeploy the prior `sync-push` and `sync-pull` source; apply a reviewed forward rollback migration restoring the prior closed vocabulary and private RPC body; verify no `metric_bucket` rows remain. Installation-local Metrics history remains intact throughout.

## Remaining manual ceilings

Owner hands-on QA is intentionally deferred until the end of development. The cumulative list is maintained in `TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`. Real stable Chrome, native download presentation, real assistive technology, and MacBook behavior are not claimed from automation.

## Explicit stop

No hosted migration, function deployment, hosted test identity or row, Supabase plan change, production secret, OAuth change, Chrome permission, live Stripe action, package, release, merge, or Chrome Web Store action was performed for PM-P5.
