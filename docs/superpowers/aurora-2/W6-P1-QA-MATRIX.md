# W6-P1 Migration, Regression, and Recovery QA Matrix

**Date:** 2026-08-16  
**Branch:** `feat/aurora-2-observatory`  
**Product baseline:** `a83f6ad` with W5-P4 checkpoint `57dbbe2`  
**Plan:** `docs/superpowers/plans/2026-08-16-w6-p1-migration-regression-recovery-qa.md`

## Outcome

Ready. All four focused recovery families passed on their first run. They executed 820 assertions across 33 family entries (690 unique assertions because the 130 backup-validation assertions intentionally serve both stored-data and permission/secret matrices). No Critical, Important, or Minor product defect was demonstrated, so W6-P1 changed no production or test code and opened no fix/rereview cycle.

The product baseline was unchanged after W5-P4. Its final full gate is therefore reused rather than repeated: 137 files / 2,262 tests, TypeScript, 189-module production and preview builds, clean production bridge scan, and 457 PASS / 0 FAIL / 3 SKIP in the built-extension harness.

## Automated matrix

| Family | Command scope | Result | Accepted recovery evidence |
|---|---|---:|---|
| Migration and stored data | schema v11 migrations; Layout V2; legacy retirement; storage authority/index; backup validation/restore | 7 files / 317 tests | Non-destructive legacy preservation, deterministic normalization, serialized mutation, complete validation before write, exact injected-failure rollback, old/current backup compatibility |
| Permission and secret safety | permission mirror/transactions; cleanup UI/hook; backup redaction; Home Assistant service | 7 files / 219 tests | Pre-existing grant preservation, newly acquired rollback, shared/final ownership, retryable revoke cleanup, secret/capability redaction, narrow health/action behavior |
| Offline, stale, error, persistence | snapshot identity/consumer; async feedback; Weather; Notes; Timer; DrawerBoundary; Home Assistant widget | 13 files / 190 tests | Scope/generation-safe stale rejection, matching-cache retention only, pending/stale/offline/error semantics, Retry recovery, revision-owned Notes writes, timer continuity, boundary reopen recovery |
| Civil-time and open-tab recovery | local-day; Focus; Countdown; Calendar; Background | 6 files / 94 tests | IANA calendar boundaries, skipped/repeated-hour safety, date-driven refresh, generation-safe restoration |

All commands exited 0. No focused rerun was required.

## Finding ledger

- Critical: 0 new.
- Important: 0 new.
- Minor: 0 new.
- Existing explicit manual ceilings remain tracked in `STATUS.md`: native optional-permission prompt choices, live Home Assistant picker/action behavior, real screen-reader behavior, OS timezone/sleep, Windows scaling/mixed-DPI, and Store dashboard state. They are not W6-P1 automated acceptance failures.
- The three built-extension SKIPs remain the same honest external/manual ceilings: live Home Assistant instance success, native NASA Block, and native NASA Allow.

## Bounded implementation review

Verdict: Ready.

The review checked the written W6-P1 acceptance only: migration non-destruction, data/rollback integrity, permission/secret recovery, stale/offline/error semantics, Notes/timer/error-boundary recovery, civil-time restoration, finding tracking, and preservation of frozen contracts. The matrix covers every accepted automated family with causal tests and the unchanged full product baseline. No product file changed, no stronger acceptance criterion was invented, and no Critical/Important issue remains open. No rereview was launched.

## Exclusions retained by later packets

- W6-P2: named viewport/state/zoom, Windows scaling/mixed-DPI, keyboard, accessibility, screenshot inspection, and explicit hardware/manual ceilings.
- W6-P3: current official policy and live dashboard reconciliation.
- W6-P4: 2.0.0 package and release dossier.
- W6-P5: explicit approval before any Chrome Web Store mutation.
