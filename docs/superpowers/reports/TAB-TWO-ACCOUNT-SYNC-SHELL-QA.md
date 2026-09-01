# Tab Two Account & Sync Shell QA

Date: 2026-09-01

## Scope

PM-P1 adds the production-safe Account & Sync client shell and pure capability
contracts. Production remains truthful Local mode. This packet does not add an
account backend, authentication, billing, sync, permissions, storage authority,
provider integration, analytics, deployment, release, merge, or Store action.

## Exact proof contract

`npm run qa:account-sync-shell -- --exact` requires:

- exact HEAD provenance for production and preview builds;
- installed-extension Chromium at 1600x900 and touch-enabled 768x812;
- the permanent six-tab Settings sequence and keyboard traversal;
- production Local mode with zero external requests and zero storage writes;
- deterministic preview coverage for signed-in, active, past-due, device-limit,
  syncing, offline, and needs-attention states;
- fresh Google verification plus typed confirmation for synced-data and account
  deletion, including focus restoration;
- production exclusion and preview inclusion of the deterministic fixture;
- zero console errors, page errors, failed requests, clipping, control overlap,
  viewport escape, or multiple Settings scroll owners; and
- an explicit original-resolution judgment for every retained PNG.

## Current result

Verified at exact runtime source
`448cbd5ffb2647a8bac8d204a97195406a380464`.

The owner approved all five original-resolution mockups before production React
or CSS changed. The bounded review then closed account-identity and
future-issued lease validation, fresh Google verification plus explicit device
targeting for revocation, and nested-dialog QA measurement. No Critical or
Important finding remains open. Final branch verification also exposed a
test-only timing assertion that yielded to the zero-delay toolbar unlock before
checking the release boundary; the assertion now checks the synchronous
release state first and then proves the scheduled unlock.

Verification results:

- focused PM-P1 coverage: 6 files / 374 tests passed;
- stabilized full product gate: 227 files / 3,544 tests passed at final
  test-only stabilization source `68a6ee17f57f7dd7747167a2a42cdaa82526aeb6`;
- `npx tsc --noEmit`: passed;
- `node --test scripts/qa-account-sync-shell.test.mjs`: 6/6 passed;
- exact production build: 278 modules;
- exact preview build: 279 modules;
- production scan for `TAB_TWO_PREVIEW_ACCOUNT_FIXTURE` and `preview_fixture`:
  no matches; and
- `npm run qa:account-sync-shell -- --exact`: passed at runtime source
  `448cbd5ffb2647a8bac8d204a97195406a380464`.

Installed-extension Chromium covered production Local mode at 1600x900,
preview signed-in, active, past-due, device-limit, syncing, offline, and
needs-attention states, both freshly verified typed destructive confirmations,
and active subscription at touch-enabled 768x812. All required keyboard,
pointer, and direct touch interactions passed. Ledgers contain zero storage
writes, external requests, console errors, page errors, and failed requests.
Geometry records zero horizontal overflow, viewport escape, and control
overlap, with exactly one contained Settings scroll owner.

All 11 final PNGs were inspected at original resolution and retain explicit
PASS judgments. Evidence is recorded under
`artifacts/qa-account-sync-shell/448cbd5ffb2647a8bac8d204a97195406a380464/`
in `evidence.json`, `judgments.json`, and the retained PNGs.

README and PRIVACY remain accurate without edits because the production client
stays Local, sends no request, writes no account state, and adds no permission
or data flow. This verification does not claim a real account backend,
authentication, owner grant, entitlement service, billing, sync transport,
storage schema, analytics, provider integration, deployment, release, merge,
or Store action.
