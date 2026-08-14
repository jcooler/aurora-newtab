# Aurora 2 Status

**Updated:** 2026-08-14<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Worktree:** `D:\DEV\Chrome plugin-aurora-2`<br>
**Current wave:** Wave 1 — Trust and correctness foundation<br>
**Last verified packet:** `W1-P3` - Optional-permission transactions and shared-origin ownership<br>
**Next packet:** `W1-P4` - Atomic backup/restore and permission reconciliation; plan not yet created

## Packet envelope

- **Acceptance:** Optional-origin acquisition is gesture-safe and transactional; validation/storage failure rolls back only newly acquired unowned grants; pre-existing grants remain; every configured connector plus APOD participates in shared ownership; final-owner removal is verified; revoke failure is explicit and retryable; `remove revokes live` receives a truthful evidence-backed disposition.
- **Expected files:** Permission mirror/wrappers/transactions, connector ownership descriptors/registry, Settings token/list/APOD integration, cleanup alert/controller, focused tests, and the real-extension harness. Backup/restore reconciliation, Home Assistant polling/actions, layout, CSS redesign, manifest expansion, privacy/Store copy, packaging, and release actions remain outside this packet.
- **Test scope:** Acquisition rollback, pre-existing grants, partial persistence, disabled and shared owners, final owner, remove false/rejection/retry, fresh ownership recheck, trusted event-turn ordering, targeted/full Vitest, TypeScript, production/preview builds, production adapter-leak search, and the real MV3 harness.
- **Visual scope:** No redesign. The only visible addition is an accessible permission-cleanup failure/Retry alert; verification is behavioral through component and extension harness checks.

## Last completed commits

- `eb1354b6a5b041fb6d494655c3dae1862572bc51` — audited V1.14.0 base (`test(ha): the drawer sits for its portrait`).
- `0ae676905fd54d3acf3aaf2cdcb79d13e4b47f7e` — reviewed master specification and executable W1-P1 plan (`docs: establish Aurora 2 observatory program`).
- `87a8aa93dfd5544322daf855d10e780f64d1e882` — isolated Wave 0 ledger checkpoint (`docs: checkpoint A2-W0`).
- `b2256f2a13f00e0e987593fdd9b83b839f401394` — scoped connector snapshot identity (`feat(connectors): scope snapshot identity`).
- `0e93944116281cf95fe6b444398f7aa30730353d` — generation-safe lifecycle, nine call sites, and reconnect epochs (`fix(connectors): refresh scoped snapshots safely`).
- `cd511f06c3758ce9b237f6a493087376e34886f8` — bounded-review fix for queued stale-owner writes (`fix(connectors): guard queued snapshot writes`).
- `aa7648817aa3c076e3e960bcd0ed6bff8d6f14b0` — independently reviewed executable W1-P2 plan (`docs: plan W1-P2 cross-context storage authority`).
- `8efbb0a3b9be4787dff1924da128321901c28217` — Web Lock mutation authority, atomic restore, and two-page harness proof (`fix(storage): serialize cross-context mutations`).
- `fac883ba4cccf6f567a8460188a84902d219730c` — bounded-review fixes for explicit harness fixtures and timing-free concurrency tests (`fix(storage): address W1-P2 review`).
- `2a7abdf2b6db6f70e0a383453a79bbf852bdb977` - independently reviewed executable W1-P3 plan (`docs: plan W1-P3 optional permission transactions`).
- `64af77ecf4caf3606e889f632d48951eb5e0c854` and `49819c477254cfa0d259b4990bde9ba6a28a62e4` - permission mirror, lifecycle transactions, owner registry, and Task 1 review fixes.
- `e9dce0c3847e981c793c591e95eb179b219077c6` and `03f56b3af31d09560ddc1ce5cdf5839f279c6ea8` - token connector transactions, durable cleanup UI, and restored form regressions.
- `9a6f0c7200444034cba4d724a9fef2162e62fec2`, `8e8867023a5b45411d02df96accbd0ec78678215`, and `ccf478126126fe87b22ca1a8db9e71e400602aa8` - RSS/Crypto/ICS/Status ownership, review fixes, and fresh retry ownership proof.
- `c054a66f1e04d1742f8ca9b9ff37ae341e25295d` and `a576921f7d6e08462d052bade8d3ec760020ed5c` - APOD two-origin transactions and authoritative stale-render exit fix.
- `79f6d37f334e20440e4357f6e269c1810450c774` and `75efc1160fcd3e58bc5f17656960bbbb8536b4e1` - preview-only extension transaction matrix and strengthened gesture/pre-existing proof.
- `a8d62367db97ba42b2b70047b7d0414df6019a90` - bounded whole-packet review fixes (`fix(permissions): address W1-P3 review`); verified W1-P3 implementation head.

## Latest verification

- W1-P3 exact targeted suite after final review fix - exit 0; 18 files / 631 tests passed.
- `npx tsc --noEmit` at `a8d6236` - exit 0.
- `npm test` at `a8d6236` - exit 0; photo manifest 23 entries / 46 tier files; 103 files / 1,631 tests passed.
- `npm run build` and `npm run build:preview` at `a8d6236` - exit 0; both transformed 170 modules.
- `rg -n "__auroraPermissionsHarnessApi" dist` after the production build - expected exit 1; no adapter-name match in production output.
- `node scripts/preview.mjs` final reviewed W1-P3 run - process exit 0 in 277.1 seconds; 424 PASS / 0 FAIL / 3 SKIP. PASS evidence covers trusted event-turn request ordering, Home Assistant newly acquired rollback, post-validation pre-existing preservation, RSS + Status shared/final ownership, APOD + RSS partial/final ownership, one-shot revoke failure with durable Retry, and exact storage/UI/native-boundary restoration.
- Final harness SKIPs remain honest ceilings: real Home Assistant entity-picker behavior against a live user instance, native NASA Block, and native NASA Allow. Headless automation cannot settle the browser permission prompt.
- `remove revokes live` disposition: the renamed live Status row/dot assertion passes but never held a native grant; adapter-held production transaction final-owner removal passes separately; revoking an actually held native Chrome host grant remains unautomated headlessly and is not claimed fixed.
- Independent W1-P3 plan review - initial acquisition-classification, cross-context, owner-readiness, retry-lifetime, and harness-truthfulness findings fixed; final verdict Ready.
- Independent W1-P3 implementation review - per-task reviews fixed all findings; bounded whole-packet review found three Important issues, fixed in `a8d6236`; scoped rereview found no Critical, Important, or packet-local correctness issue open.
- W1-P2 exact targeted suite — exit 0; 7 files / 312 tests passed.
- `npx tsc --noEmit` after the review fix — exit 0.
- `npm test` after the review fix — exit 0; photo manifest clean; 98 files / 1,544 tests passed.
- `npm run build` after the review fix — exit 0; production build passed, 165 modules transformed; `__auroraStorageHarness` absent from `dist`.
- `npm run build:preview` after the review fix — exit 0; preview build passed, 165 modules transformed.
- `node scripts/preview.mjs` final W1-P2 run — harness process exit 0; 412 PASS / 0 FAIL / 3 SKIP. Both exact MV3 extension pages exposed Web Locks and the preview-only authority probe; all 50 concurrent mutations were retained.
- Independent W1-P2 plan review — initial one Critical and six Important findings fixed; a follow-up NotesPanel fixture finding fixed; final verdict Ready with no Critical or Important findings.
- Independent W1-P2 implementation review — one Important global harness monkey-patch and two Minor determinism/path findings confirmed and fixed in `fac883b`; bounded rereview found no Critical, Important, or packet-local Minor findings.
- W1-P1 exact targeted suite — exit 0; 12 files / 409 tests passed.
- `npx tsc --noEmit` after the review fix — exit 0.
- `npx vitest run` after the review fix — exit 0; 97 files / 1,531 tests passed.
- `npm run build` after the review fix — exit 0; TypeScript and Vite production build passed, 164 modules transformed.
- Independent W1-P1 review — one Important queued-update stale-write race confirmed; red/green regression added and fixed in `cd511f0`; no other actionable findings and none left open.
- `npm ci` — exit 0; 199 packages installed; 200 audited.
- `npm test` — exit 0; photo manifest 23 entries / 46 tier files; Vitest 96 files / 1,515 tests passed.
- `npm run build` — exit 0; TypeScript and Vite production build passed, 163 modules transformed.
- `npm run build:preview` — exit 0; preview build passed, 163 modules transformed.
- `node scripts/preview.mjs` full run 1 — harness process exit 0; 408 PASS / 1 FAIL / 3 SKIP. Sole failure: `remove revokes live`.
- `node scripts/preview.mjs` full run 2 — harness process exit 0; 408 PASS / 1 FAIL / 3 SKIP. Identical sole failure: `remove revokes live`.
- Harness skips: real Home Assistant picker against user instance; NASA optional-permission Block path; NASA optional-permission Allow path. Headless prompt does not settle.
- `npm run package` — exit 0; guards passed; 59 files; 60,400,065 bytes; no source maps; 46 photos; 3 icons.
- `npm audit --omit=dev --json` — exit 0; zero production advisories.
- `npm audit --json` — exit 1; one indirect high advisory: `nanoid <3.3.18` custom generator loop with size zero; development tree only.
- Independent Wave 0 review — initial With fixes; one Critical and three Important plan findings fixed; scoped re-review Ready with no unresolved Critical/Important or new issues.

## Release and Store inventory

- Original V1 checkout remains clean on `main` at `eb1354b`.
- Preserved original `release/aurora-1.14.0.zip`: 60,400,065 bytes; SHA-256 `4da05f9763dfddd529695dcc5c41f7e8d73b53090740bb5d330166b1aec2f1fa`.
- Isolated baseline rebuild: same byte size; SHA-256 `0c46ecbaab9329e9933cc96d3edbb2eb4eb988e6e797a5dbc251702ba4fff9b7`; baseline-only and not a replacement artifact.
- Tracked release files: `release/LAUNCH-CHECKLIST.md`, `release/RESUBMISSION-NOTES.md`, `release/store-listing.md`.
- Local original release inventory includes ZIPs 1.2.0, 1.2.1, and 1.3.0 through 1.14.0 plus five stale v1.2-era Store screenshots.
- Exact live Chrome Web Store V1.x version and dashboard answers: **user/dashboard verification required**.
- No Store dashboard, listing, upload, submission, or rollout action has occurred.

## Visual artifacts inspected

- `D:\DEV\Chrome plugin\output\product-concepts\aurora-arrange-mode-future.png`
- `D:\DEV\Chrome plugin\output\product-concepts\aurora-layout-quiet-column.png`
- `D:\DEV\Chrome plugin\output\product-concepts\aurora-connected-command-center.png`
- Recorded cues: protected centered Now anchor, coherent Day rail, shared Work Pulse surface, launcher shelf, direct preview/reset arrange affordances.
- Explicit non-proof: static concepts do not validate responsive, accessibility, collision, focus, or real-data behavior.

## Known blockers and residual risks

- Native Chrome optional-permission Block/Allow interaction remains unavailable in headless automation; W1-P3 does not claim a synthetic click or a native-grant revoke.
- Real Home Assistant entity-picker behavior still requires the user's live instance.
- Live Store version/dashboard answers require user/dashboard access in Wave 6.
- Mixed-DPI monitor moves and real Home Assistant hardware/service behavior require later environment/user evidence.
- The indirect development-only nanoid advisory remains open for the scoped hygiene packet; production dependency audit is clean.
- Atomic backup/restore and permission reconciliation remain W1-P4 work; W1-P3 intentionally made no restore behavior change.

## Files intentionally dirty

- None expected after `docs: checkpoint W1-P3`. If `git status --short` is non-empty at continuation, stop and reconcile before planning W1-P4.

## Single next packet

- **Packet:** `W1-P4` - Atomic backup/restore and permission reconciliation
- **Plan:** Not yet created; create it just in time from the master specification, verified W1-P2/W1-P3 evidence, the current backup/restore implementation, and the new permission ownership/lifecycle contracts.
- **State:** Not started. The next fresh task should write and independently review the executable W1-P4 plan before any W1-P4 implementation; this W1-P3 task stops at the packet boundary.

## Continuation seed

```text
Worktree: D:\DEV\Chrome plugin-aurora-2
Branch: feat/aurora-2-observatory
Next plan: create just-in-time W1-P4 atomic backup/restore and permission reconciliation plan
Packet ID: W1-P4
Verified W1-P3 implementation SHA: a8d62367db97ba42b2b70047b7d0414df6019a90
Expected next checkpoint subject: docs: checkpoint W1-P4
```
