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

Pending the exact post-review commit, production/preview builds, Chromium run,
and original-resolution inspection. Final provenance and judgments are recorded
in Task 8 without claiming that any real paid service exists.
