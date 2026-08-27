# W6-P1 Migration, Regression, and Recovery QA Plan

**Goal:** Complete Aurora 2's automated migration and recovery matrix once, track every accepted result or finding, and correct only demonstrated Critical/Important product failures.

**Architecture:** This is a verification packet, not a new product subsystem. Reuse the frozen migration, storage authority, backup, permission, request-generation, stale/offline/error, persistence, civil-time, and error-boundary tests. The exact W5-P4 checkpoint already supplies the unchanged full-unit, production/preview build, bridge-scan, and full-browser baseline; do not repeat those gates merely because this packet adds reports.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 5.6, 10, 11, 13, and 16; `docs/superpowers/aurora-2/ROADMAP.md` W6-P1.

## Frozen acceptance

- Complete the automated migration, regression, offline/stale/error, and recovery matrix.
- Preserve frozen schema/registry contracts, exact stored data, rollback behavior, credentials/capability secrecy, and the protected original checkout.
- Track every accepted finding. Minor evidence/cosmetic issues remain ledger items and do not reopen verified packets.
- Do not add viewport/zoom/mixed-DPI coverage retained by W6-P2, policy/dashboard work retained by W6-P3, packaging retained by W6-P4, or any Store action retained by W6-P5.

## Matrix

### 1. Migration and stored-data recovery

- [x] Run the focused schema v11, Layout V2/legacy-retirement, storage authority/index, backup validation, and atomic restore tests once.
- [x] Require non-destructive legacy preservation, deterministic normalization, exact rollback after injected failure, no lost updates, and old/current backup compatibility.

### 2. Permission and secret-safe recovery

- [x] Run permission mirror, transaction, cleanup, backup redaction, and Home Assistant service tests once.
- [x] Require pre-existing permission preservation, acquired-grant rollback, shared/final ownership, retryable revoke failure, no raw credentials/capability URLs in backup or surfaced errors, and narrow Home Assistant health/action behavior.

### 3. Offline, stale, error, and persistence recovery

- [x] Run connector snapshot identity/consumer, async feedback, Weather, Notes, Timer, DrawerBoundary, and Home Assistant widget tests once.
- [x] Require scope/generation-safe stale rejection, matching-cache retention only, explicit pending/stale/offline/error semantics, retry recovery, revision-owned Notes persistence, timer continuity, and boundary reopen recovery.

### 4. Civil-time and open-tab recovery

- [x] Run local-day, Focus, Countdown, Calendar, and Background rollover tests once.
- [x] Require IANA calendar boundaries, skipped/repeated-hour safety, open-tab date refresh, and generation-safe restoration behavior.

### 5. Findings, review, and checkpoint

- [x] Record the matrix commands/results and classify findings as Critical, Important, or Minor against the written acceptance only.
- [x] Perform one implementation review. If a Critical/Important product defect is demonstrated, use one focused fix/rereview cycle; otherwise do not modify product code.
- [x] Reuse the exact unchanged W5-P4 full gate (137 files / 2,262 tests, 189-module production/preview builds, clean bridge scan, 457 PASS / 0 FAIL / 3 SKIP); do not rerun it for report-only changes.
- [x] Update the ledgers, checkpoint/push, prove clean/upstream equality and protected checkout integrity, then begin W6-P2 automatically.
