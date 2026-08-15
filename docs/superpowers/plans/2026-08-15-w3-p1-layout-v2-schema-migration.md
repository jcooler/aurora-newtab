# W3-P1 Layout V2 Schema and Migration Implementation Plan

> Execute this packet only. Use subagent-driven development, TDD, independent review, and verification-before-completion. Preserve Aurora V1 and every verified Wave 1/Wave 2 authority.

**Goal:** Introduce the versioned Layout V2 storage contract, migrate every valid legacy percentage layout without loss, keep the existing page and arrange UI behavior compatible, and make startup migration plus old/current backup restore verifiable and rollback-safe.

**Architecture:** Advance storage schema v9 to v10. Store a source-default-free `LayoutV2` envelope containing per-profile user overrides and an optional exact legacy map. A pure mapper derives deterministic pinned placements for all four profiles from explicit legacy positions. Current `App`, legacy Arrange, and Settings reset use narrow compatibility helpers; W3-P2 owns profile selection, registry rendering, BoardItem, capacity, density, and Dock behavior.

**Starting checkpoint:** `562ec0adb12dc994634d600b5868abb23fd43f12`

**Expected browser baseline:** 454 PASS / 0 FAIL / 3 SKIP.

**Expected final browser result:** 455 PASS / 0 FAIL / 3 SKIP, exactly one `PASS: W3-P1 layout v2 migration and compatibility semantics`, and zero named W3-P1 FAIL.

## Frozen packet contract

### Layout V2 types and storage meaning

- Add the exact semantic domains required by the master specification:

```ts
type LayoutProfile = 'compact' | 'standard' | 'display' | 'ultrawide'
type WidgetVariant = 'compact' | 'standard' | 'expanded'
type Zone = 'day' | 'now' | 'pulse' | 'dock'
type Priority = 'pinned' | 'automatic' | 'dock'

interface Placement {
  zone: Zone
  order: number
  colSpan: number
  rowSpan: number
  variant: WidgetVariant
  priority: Priority
  locked?: boolean
}

interface LayoutV2 {
  version: 2
  profiles: Partial<Record<LayoutProfile, Partial<Record<BlockId, Placement>>>>
  legacy?: LegacyLayout
}
```

- Rename the current percentage-position shape to `LegacyLayout`; retain `Layout` only as a documented compatibility alias if required to avoid unrelated churn.
- `AuroraData.layout` becomes `LayoutV2`; `CURRENT_VERSION` becomes 10.
- Fresh defaults are exactly `{ version: 2, profiles: {} }`. Product placement defaults remain in source and are not frozen into storage.
- A migrated v9 store includes `legacy`, even when the old map is empty. A fresh v10 store omits it. This preserves migration provenance without another data key.
- The preserved `legacy` object is an exact immutable copy of every valid known legacy position. Mapping may clamp coordinates for calculation but never mutates/clamps that preserved copy.
- Valid current placements require a known profile, block, zone, variant, and priority; a nonnegative integer `order`; positive integer spans; and an omitted or boolean `locked`. W3-P1 does not invent profile capacity or maximum span rules.

### Deterministic legacy mapping and collision normalization

- Explicit legacy positions are user overrides. Map them into each of `compact`, `standard`, `display`, and `ultrawide`; mapping only `standard` would discard customization on the first future profile transition.
- Clamp x/y to `[0, 100]` for distance and ordering calculations only.
- Use versioned semantic anchors:
  - `day`: `(16.667, 50)`
  - `now`: `(50, 50)`
  - `pulse`: `(83.333, 50)`
  - `dock`: `(50, 91.667)`
- Choose the smallest squared distance. Resolve exact ties by fixed zone order `day`, `now`, `pulse`, `dock`.
- Within each zone sort by clamped y, clamped x, then binary stable block ID; emit dense zero-based orders.
- Every migrated placement is `colSpan: 1`, `rowSpan: 1`, `variant: 'standard'`, and `priority: 'pinned'`.
- Provide a generic profile collision normalizer that sorts by fixed zone order, configured nonnegative integer order, then stable block ID and rewrites each zone to dense unique orders. It must be deterministic regardless of object insertion order and must not implement capacity, variant reduction, or docking.
- Before mapping, validate that the raw legacy container is a plain object and every known block row has finite numeric x/y. A malformed container or known row raises a typed fixed-message legacy-layout validation failure; storage aborts before any write, while backup preparation maps that exact failure to the existing safe `That backup's "layout" data is invalid.` result.
- Unknown legacy block IDs, whether their rows are valid or malformed, are dropped from both the preserved known legacy map and generated profiles only after every known row validates. They never become placements and never mask/reclassify a malformed known override.

### Current-UI compatibility and scope boundary

- `legacyLayoutOf(layoutV2)` returns the legacy percentage map used by `App`, `PositionedBlock`, and legacy Arrange. An omitted legacy map means `{}`.
- `layoutV2FromLegacy(legacy)` builds the exact new envelope used only by v9->v10 migration and pure migration tests.
- A separate `withLegacyBlockPosition(layoutV2, blockId, pos)` compatibility helper is used inside the authority-owned `storage.update`. It preserves every untouched placement already present in an imported/current V2 envelope, updates only the moved block in the exact legacy map, maps that block into all four profiles, and deterministically normalizes only the affected profiles/zones. It must work when `legacy` is absent and must not replace profile-only or semantic overrides for other blocks.
- Legacy Arrange uses that merge helper for each drag/nudge. The moved legacy position remains globally applicable until W3-P3 replaces percentage editing, while unrelated current-V2 customization survives.
- Existing full `Reset layout` writes the fresh empty V2 envelope and therefore clears both compatibility positions and user overrides after the current explicit confirmation.
- Draft positions remain `LegacyLayout`; `PositionedBlock` remains percentage-based in this packet.
- Do not add profile selection, viewport thresholds, density, source product defaults, registry metadata, `BoardItem`, semantic grid rendering, capacity, connector survival, Dock UI, V2 arrange editing, or legacy retirement. Those belong to W3-P2 through W3-P4.
- Preserve W2-P3 reflow/focus/lifecycle/ordinary-placement behavior. No visible surface redesign is authorized.

### Startup migration authority and rollback

- Compute and validate the complete v10 migration target before the first existing-store write. A pure migration or legacy-validation exception performs no write and exposes only fixed safe text.
- Keep startup initialization within the existing shared storage authority. No second context may mutate storage between the migration read, target write/readback, or rollback readback.
- Classify a store as truly fresh only when `aurora:version` is absent and no known Aurora data key exists. If known Aurora keys exist with an absent version, accept only the exact all-known-key defaults image as an interrupted fresh-seed state; any partial/non-default known data with an absent version fails safely with no write. A string, non-finite, non-integer, negative, or otherwise invalid stored version also fails safely with no write.
- For a truly fresh store, write and structurally verify all known defaults first, then stamp `aurora:version: 10` and read it back. The driver has no removal primitive: a reject-before-apply defaults write leaves the store empty/retryable; an apply-then-reject defaults write may continue only after exact defaults readback; a reject-before-apply version stamp leaves the exact interrupted-seed image that a later init may resume; an apply-then-reject version stamp succeeds only after exact version readback. Partial/mismatched state is never overwritten on a later init.
- For an existing older schema, capture the prior logical known-key snapshot, the exact old legacy layout, and the exact prior schema version; unknown driver keys remain outside Aurora state and untouched.
- Write every known migrated key plus `aurora:version: 10`, reread those exact keys, and require structural equality before releasing the authority.
- If the target write applies then rejects, target read rejects, or target readback mismatches, restore every prior logical known key plus the prior version and verify that rollback. Missing prior known keys may be materialized at their prior-version logical defaults because the driver has no removal primitive; user values and the legacy layout must be exact.
- A rollback write/read/mismatch raises a distinct fatal migration rollback error containing primary/rollback causes as fields but only fixed safe public message text. Never interpolate raw stored data, URLs, tokens, or error messages.
- A successful retry after a safe rollback migrates once. A queued second-context mutation begins only after success or complete rollback.
- Future integer versions warn safely and remain untouched. Invalid versions are not treated as future or fresh.

### Backup compatibility

- New exports are version 10 and carry V2 layout only. Existing secret redaction, cache exclusion, optional-origin reconciliation, and shared restore authority remain unchanged.
- Envelope versions 1 through 9 remain accepted and migrate before current-schema validation; a valid v9 legacy layout becomes V2 with exact known `legacy` preservation and four deterministic profiles. The typed legacy-layout validation failure is the one narrow migration precondition: backup preparation converts it to the existing safe `layout` rejection rather than silently dropping a known row or returning a generic migration failure.
- Version 10 backups require valid V2 layout. Future versions remain rejected.
- V2 cleanup drops unknown profile and block IDs consistently with current unknown-key import policy, while a malformed known placement rejects the whole `layout` field.
- Optional `legacy` uses the legacy validator and unknown block IDs are dropped only after every known row is valid.
- Imported V2 profiles and legacy state survive prepare/restore exactly after cleanup. Injected restore failure proves exact V2 profile/legacy rollback.
- No backup carries source product defaults, connector snapshots, bearer tokens, or capability URLs.

### Browser evidence and manual boundary

- Pre-author exactly one immutable W3-P1 aggregate before production edits. Use a disposable extension page and raw native extension storage to seed schema v9 with known multi-zone, tie/collision, and out-of-range-but-finite legacy coordinates.
- Reload through real extension initialization and prove schema v10, exact legacy preservation, exact deterministic four-profile overrides, and unchanged current percentage-render centers for representative visible blocks.
- Exercise a current V2 backup prepare/restore path and prove the complete disposable preimage is restored in `finally`; close the disposable page and cross the shared storage lock before later probes.
- The aggregate must isolate failures and still clean up when a locator, migration, or backup assertion fails. No production preview bridge may ship.
- W3-P1 changes no intended pixels, so no new screenshot is required. Existing W2-P3 narrow/ordinary geometry remains authoritative and the complete existing harness must remain green.
- No native zoom, mixed-DPI, real screen-reader, Store, release, manifest-version, or V1 claim/action enters this packet.

## Verified preflight

- Target `feat/aurora-2-observatory` at `562ec0adb12dc994634d600b5868abb23fd43f12`, equal upstream, divergence 0/0, clean.
- Protected original on clean/equal `main` at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- Focused read-only baseline: 9 files / 498 tests passing.
- Full accepted W2-P3 baseline: 119 files / 1,998 tests; TypeScript; 179-module production/preview builds; bridge scan exit 1; both audits zero; foreground browser 454/0/3.
- Discovery confirmed schema v9, direct legacy layout consumers, a source-version migration registry, unverified startup migration writes, migration-before-validation backup flow, and an already atomic restore authority.

## Task 0: Independent plan review and plan commit

**Files:**
- Create: `docs/superpowers/plans/2026-08-15-w3-p1-layout-v2-schema-migration.md`
- Track progress only under ignored `.superpowers/sdd/2026-08-15-w3-p1-layout-v2-schema-migration/`

1. Dispatch a read-only independent reviewer against the master spec, ledgers, W2-P3 evidence, current schema/migrations/storage/backup/consumers/tests/harness, and this plan.
2. Require severity-ranked findings over all-four-profile legacy preservation, deterministic zone/collision rules, storage-only-overrides, strict V2 validation, startup authority/readback/rollback/contention, backup old/current compatibility, compatibility seams, immutable browser causality/cleanup, W3-P2/W3-P3 exclusions, V1, and exact gates.
3. Fix every confirmed plan finding and obtain `Ready` before implementation.
4. Commit only the reviewed plan:

```powershell
git add docs/superpowers/plans/2026-08-15-w3-p1-layout-v2-schema-migration.md
git diff --cached --check
git commit -m "docs: plan W3-P1 layout migration"
```

## Task 1: Freeze the browser aggregate and define pure Layout V2 semantics

**Files:**
- Modify: `scripts/preview.mjs`
- Modify: `src/lib/layout/types.ts`
- Create: `src/lib/layout/v2.ts`
- Create: `src/lib/layout/v2.test.ts`

### Step 1: Pre-author and accept the complete causal browser RED

Add the complete named aggregate and its final result line before production changes. Freeze its fixture, predicates, copy, and cleanup after an unchanged-production run proves:

```text
454 PASS / 1 FAIL / 3 SKIP
0 PASS and exactly 1 FAIL for W3-P1 layout v2 migration and compatibility semantics
process exit 0
```

Reject any run with a pre-existing FAIL, missing cleanup fact, partial aggregate, or failure caused only by malformed harness input. Use an absolute ignored log and machine-parse exact totals. Preserve current 454 assertions byte-for-byte except for any truthful selector adjustment causally required by the new fixture.

### Step 2: Write focused pure RED tests

Prove before implementation:

1. exact enum/type constants, fresh empty envelope, and no persisted product defaults;
2. exact legacy copy including `{}`, no input mutation, omitted legacy compatibility fallback;
3. all-four-profile equality for one legacy map;
4. anchor-nearest mapping, exact-distance fixed-zone tie break, finite out-of-range calculation clamping without legacy mutation;
5. per-zone y/x/stable-ID order and object-insertion-order independence;
6. default migrated span/variant/priority fields;
7. duplicate configured-order collision normalization by zone/configured order/stable ID into dense per-zone order;
8. merging one moved block into an envelope with no legacy but profile-only overrides, and into an envelope with legacy plus extra semantic overrides, preserves every untouched override while updating/normalizing the moved block in all four profiles;
9. primitive/array legacy containers and malformed/non-finite known rows produce the typed safe validation failure, while valid or malformed unknown IDs are dropped only after known-row validation;
10. positive integer spans only and optional boolean `locked`, without invented capacity maxima.

### Step 3: Implement only the pure schema/mapping layer

Keep every exported helper pure and deterministic. Freeze anchor/zone/profile order as readonly source constants. Use binary string comparison for stable IDs rather than locale-sensitive ordering. Do not import React, storage, registry, viewport, or current component code.

### Step 4: Verify, independently review, fix, rereview, commit Task 1

Run the pure focused suite, TypeScript, preview syntax, and diff checks. Review Task 1 for mapping determinism, immutability, locale independence, invalid-row handling, browser RED causality, and W3-P2 exclusions. A separate RED-first fixer handles confirmed findings; the same reviewer must return `Ready`.

```powershell
git add scripts/preview.mjs src/lib/layout/types.ts src/lib/layout/v2.ts src/lib/layout/v2.test.ts
git diff --cached --check
git commit -m "feat(layout): define W3-P1 layout schema"
```

The aggregate intentionally remains the sole packet RED until Tasks 2 and 3 complete. Do not push.

## Task 2: Migrate v9 storage under verified rollback-safe authority

**Files:**
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/migrations.test.ts`
- Modify: `src/lib/storage/index.ts`
- Modify: `src/lib/storage/index.test.ts`

### Step 1: Write migration RED tests

Prove v9->v10 maps a populated/empty valid legacy layout to V2, preserves every other key, keeps the exact known legacy copy, emits all four profiles, never mutates input, and remains deterministic across repeat runs/insertion orders. Prove primitive/array layout, malformed known rows, and non-finite coordinates raise the typed fixed-message validation failure before any write; valid and malformed unknown IDs are dropped consistently after known-row validation. Prove every older migration chain reaches the same v10 defaults and that a missing v9 step rejects before storage write.

### Step 2: Write startup atomicity RED tests

Using controllable drivers and two storage instances sharing one authority, prove:

1. truly empty first install writes/verifies all known defaults before a separate version stamp/readback;
2. absent version plus partial/non-default known data and string/non-finite/fractional/negative versions fail safely with no write, while exact all-defaults/no-version resumes only as an interrupted seed;
3. fresh defaults write/readback reject-before-apply, apply-then-reject, mismatch, and later retry semantics; version-stamp reject-before-apply and apply-then-reject/readback semantics;
4. existing migration target write followed by exact known-key+version readback under one acquisition;
5. existing target write reject-before-apply/apply-then-reject, target read rejection, and target mismatch each restore exact prior logical user values/legacy/version and verify rollback;
6. rollback write/read/mismatch yields the distinct fixed-message fatal migration rollback error with both causes retained but no secret-bearing message expansion;
7. unknown driver sentinel keys survive target and rollback;
8. a second-context mutation remains queued through verification and rollback, then applies afterward;
9. safe rollback permits a later successful init retry;
10. a current version is a no-op and a future integer version warns and performs no write.

### Step 3: Implement minimal migration and startup transaction

Add only migration v9->v10 and the internal startup transaction needed to verify/rollback. Reuse the structural comparison and shared authority without routing through public storage methods that would reacquire the lock. Preserve current restore semantics and error type. Never log raw errors or state.

### Step 4: Verify, independently review, fix, rereview, commit Task 2

Run migration/storage suites, TypeScript, preview syntax, and diff checks. Review for write-before-validate, partial rollback, version rollback, missing-key semantics, unknown-key deletion, lock release races, retry behavior, unsafe logs, and interference with W1 authorities. Use a separate RED-first fixer for confirmed findings and the same reviewer for `Ready`.

```powershell
git add src/lib/storage/schema.ts src/lib/storage/migrations.ts src/lib/storage/migrations.test.ts src/lib/storage/index.ts src/lib/storage/index.test.ts
git diff --cached --check
git commit -m "fix(storage): migrate W3-P1 layout atomically"
```

Do not push.

## Task 3: Bridge legacy consumers and old/current backups

**Files:**
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/arrange/ArrangeController.tsx`
- Modify: `src/newtab/arrange/ArrangeController.test.tsx`
- Modify if needed for type clarity: `src/newtab/arrange/draftLayout.ts`
- Modify: `src/settings/sections/Layout.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify test-only as required: `src/lib/backupRestore.test.ts`
- Review/modify wording only if contract changed: `src/privacy/dataFlows.ts`
- Modify test-only if wording changed: `src/privacy/dataFlows.test.ts`

### Step 1: Write current-consumer RED tests

Prove App renders from `legacy`; a fresh/no-legacy V2 envelope keeps default flow; legacy Arrange reads current compatibility positions and one drag/nudge atomically updates the moved block in the exact legacy map and all four profiles while preserving every untouched profile-only/semantic override; exercise both an imported no-legacy envelope and a legacy-plus-extra-overrides envelope, insertion-order variance, and concurrent authority-safe updates; reset confirmation writes exactly the fresh empty envelope; cancel/Escape never writes. Freeze current `PositionedBlock`, reflow, focus, and ordinary center behavior.

### Step 2: Write backup RED tests

Prove:

1. serialization exports schema 10 V2 layout and no source defaults;
2. v1-v9 backups migrate before validation, with exact v9 legacy preservation and deterministic profiles;
3. valid v10 profiles/placements/optional legacy round-trip;
4. future versions reject;
5. primitive/array old layout and malformed/non-finite known legacy rows return the existing safe layout reason through the typed migration precondition; valid or malformed unknown legacy IDs are dropped after known rows validate;
6. unknown current profile/block IDs are dropped, while malformed known profile/placement/legacy rows reject with the existing safe layout reason;
7. missing/invalid enums, negative/fractional order, zero/fractional spans, and nonboolean `locked` reject;
8. current redaction/cache/permission behavior is unchanged;
9. injected restore failure restores the exact pre-import V2 profiles and legacy map; rollback failure remains fatal and safe.

### Step 3: Implement only compatibility and validation seams

Use the pure V2 helpers at every legacy caller; do not scatter envelope shape checks through components. Extend backup validation/cleanup without accepting partial malformed known placements. Preserve current all-key atomic restore implementation. Do not create profile rendering or new UI.

### Step 4: Make the frozen browser aggregate GREEN

Build preview and run the unchanged aggregate. Require exact 455/0/3, one named W3-P1 PASS, zero named FAIL, exact disposable cleanup, correct migration/backup facts, and unchanged representative rendered centers. Restore the tracked generated screenshot if the legacy harness overwrites it.

### Step 5: Verify, independently review, fix, rereview, commit Task 3

Run all Task 3 focused tests, TypeScript, preview syntax/build, the machine-gated browser aggregate, and diff checks. Review for lost legacy entries, profile override loss, compatibility drift, backup sanitizer ordering, restore rollback, test-only bridges in production, and any W3-P2/W3-P3 leakage. A separate RED-first fixer handles confirmed findings; the same reviewer must return `Ready`.

```powershell
git add src/newtab/App.tsx src/newtab/App.test.tsx src/newtab/arrange/ArrangeController.tsx src/newtab/arrange/ArrangeController.test.tsx src/newtab/arrange/draftLayout.ts src/settings/sections/Layout.tsx src/settings/SettingsPanel.test.tsx src/lib/backup.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts src/privacy/dataFlows.ts src/privacy/dataFlows.test.ts
git diff --cached --check
git commit -m "feat(layout): bridge W3-P1 legacy consumers"
```

Stage only files actually changed. Do not push.

## Task 4: Whole review, complete verification, checkpoint, push, continue

### Step 1: Independent bounded whole-packet review and fix

Review plan-base-to-HEAD, task reports, causal browser RED/GREEN, migration/collision fixtures, storage fault injection, backup old/current matrices, and preserved visual behavior. Require severity-ranked findings over:

- exact legacy preservation and all-four-profile mapping;
- deterministic anchors/ties/order/collisions without locale/insertion drift;
- source-default-free storage and strict V2 validation;
- startup target verification, rollback/version/readback/contention/retry;
- backup migration-before-validation, cleanup, redaction, restore rollback;
- App/Arrange/reset compatibility and W2-P3 parity;
- immutable aggregate causality/cleanup and exact totals;
- W3-P2/W3-P3/W3-P4, V1, Store, and manual-evidence boundaries.

Confirmed findings require one separate RED-first fixer and a dedicated fix commit. The same reviewer marks every finding Addressed/Not addressed and reports new Critical/Important issues. The controller does not patch implementation-review findings.

### Step 2: Complete fresh verification gate

```powershell
npx vitest run src/lib/layout/v2.test.ts src/lib/storage/migrations.test.ts src/lib/storage/index.test.ts src/lib/backup.test.ts src/lib/backupRestore.test.ts src/lib/layout/clamp.test.ts src/newtab/components/PositionedBlock.test.tsx src/newtab/arrange/ArrangeController.test.tsx src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx src/privacy/dataFlows.test.ts
npx tsc --noEmit
npm test
npm run build
rg -n "__auroraStorageHarness|__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist
if ($LASTEXITCODE -ne 1) { throw "Production preview-bridge scan expected rg exit 1, got $LASTEXITCODE" }
npm audit --omit=dev
npm audit --include=dev
npm run build:preview
$log = 'D:\DEV\Chrome plugin-aurora-2\.superpowers\sdd\2026-08-15-w3-p1-layout-v2-schema-migration\browser-green.log'
try {
  node scripts/preview.mjs 2>&1 | Tee-Object -FilePath $log
  $nodeExit = $LASTEXITCODE
  $lines = Get-Content -LiteralPath $log
  $pass = @($lines | Where-Object { $_ -match '^PASS:' }).Count
  $fail = @($lines | Where-Object { $_ -match '^FAIL:' }).Count
  $skip = @($lines | Where-Object { $_ -match '^SKIP:' }).Count
  $namedPass = @($lines | Where-Object { $_ -eq 'PASS: W3-P1 layout v2 migration and compatibility semantics' }).Count
  $namedFail = @($lines | Where-Object { $_ -eq 'FAIL: W3-P1 layout v2 migration and compatibility semantics' }).Count
  if ($nodeExit -ne 0 -or $pass -ne 455 -or $fail -ne 0 -or $skip -ne 3 -or $namedPass -ne 1 -or $namedFail -ne 0) {
    throw "Unexpected W3-P1 GREEN: exit=$nodeExit pass=$pass fail=$fail skip=$skip namedPass=$namedPass namedFail=$namedFail"
  }
} finally {
  if (Test-Path -LiteralPath 'D:\DEV\Chrome plugin-aurora-2\.superpowers\sdd\2026-08-15-w3-p1-layout-v2-schema-migration\browser-green.log') {
    Remove-Item -LiteralPath 'D:\DEV\Chrome plugin-aurora-2\.superpowers\sdd\2026-08-15-w3-p1-layout-v2-schema-migration\browser-green.log' -Force
  }
}
git diff --check
git status --short
```

All targeted/full tests, TypeScript, builds, audits, and diff checks pass; bridge scan exits exactly 1; browser is machine-gated exact 455/0/3; the W3-P1 evidence reports exact cleanup and no unintended visible geometry change.

### Step 3: Checkpoint and push

Mark W3-P1 Verified with exact evidence. Leave W3-P2 Not started with no plan. Append the next durable decision for versioned Layout V2 overrides, non-destructive all-profile legacy mapping, explicit compatibility seams, and verified startup rollback.

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git diff --cached --check
git commit -m "docs: checkpoint W3-P1"
git push origin feat/aurora-2-observatory
git fetch origin
$targetHead = git rev-parse HEAD
$targetUpstream = git rev-parse '@{upstream}'
$targetDivergence = ((git rev-list --left-right --count 'HEAD...@{upstream}') -replace '\s+', ' ').Trim()
$targetStatus = git status --short
if ($targetHead -ne $targetUpstream -or $targetDivergence -ne '0 0' -or $targetStatus) { throw 'Target is not clean/equal after push' }
$original = 'D:\DEV\Chrome plugin'
$originalBranch = git -C $original branch --show-current
$originalHead = git -C $original rev-parse HEAD
$originalUpstream = git -C $original rev-parse '@{upstream}'
$originalDivergence = ((git -C $original rev-list --left-right --count 'HEAD...@{upstream}') -replace '\s+', ' ').Trim()
$originalStatus = git -C $original status --short
if ($originalBranch -ne 'main' -or $originalHead -ne 'eb1354b6a5b041fb6d494655c3dae1862572bc51' -or $originalUpstream -ne $originalHead -or $originalDivergence -ne '0 0' -or $originalStatus) { throw 'Protected original changed' }
```

Then re-read the master spec and durable ledgers, reverify both worktrees, create and independently review only W3-P2, and continue automatically under A2-D019. Do not combine W3-P2 work into W3-P1.
