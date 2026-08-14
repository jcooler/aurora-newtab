# Aurora 2 Status

**Updated:** 2026-08-14<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Worktree:** `D:\DEV\Chrome plugin-aurora-2`<br>
**Current wave:** Wave 1 — Trust and correctness foundation<br>
**Last verified packet:** `W1-P5` - Home Assistant data minimization, health, and action safety<br>
**Next packet:** `W1-P6` - Weather identity and request races; plan not yet created

## Packet envelope

- **Acceptance:** Normal polling requests only deduped selected Home Assistant entities; bulk state fetch stays picker-only and disclosed; action-only visibility requires authenticated narrow health; legacy action-only snapshots cannot bypass that health check; per-action guards exclude duplicate activation; committed configuration generations reject stale action completions; persistent visible and announced pending/success/error states remain retryable.
- **Expected files:** Home Assistant service/widget/Settings tests and production code, shared opaque snapshot identity only for the Home Assistant polling-contract version, and the preview-only real-extension harness. W1-P3 permission ownership and W1-P4 restore/finalizer contracts are preserved. Weather, day rollover, Notes, privacy/Store copy, layout/CSS redesign, manifests, dependencies, packaging, and release actions remain outside this packet.
- **Test scope:** Selected endpoint ordering/dedupe/encoding, 404 omission and poll-wide fail-closed behavior, picker-only bulk access, authenticated action-only health, legacy-snapshot invalidation, same-turn duplicate activation, sibling independence, snapshot-epoch action generation, Strict Mode/unmount, storage-backed stale polls, exact disclosure, targeted/full Vitest, TypeScript, production/preview builds, preview-symbol isolation, keyboard/error/retry/quiescence, Chromium AX tree, and full MV3 teardown.
- **Visual scope:** No redesign. The existing action controls gain visible persistent status/alert copy and pending/busy/disabled semantics. `screenshots/ha-action-error.png` was inspected at 1600x1100 with a real pending sibling, focused retry, complete error text, and no clipping or color-only meaning.

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
- `206e1b8bbc18d306ec3089496eb32456109d4e56` - independently reviewed executable W1-P4 plan (`docs: plan W1-P4 atomic backup restore`).
- `110b483b78d08a148036661b55b9729973d91722` and `3234796608bdece5196650679ecdc8a3a6d9fdf4` - descriptor-driven secret/capability redaction, prepared import, and legacy Calendar review fix.
- `6c561a8b32ea532242d43c9b6a8b25da3011627e` and `1bf2f2e0165b8a92408e1064609f882a33e74f10` - authority-held snapshots, verified rollback-capable all-key replace, and hardened contention proof.
- `0dcdbdca32eb2f5bbb670411905da7a8bf2e246c` and `5d57dcab9da45292e22312b3f933c79d3da293ec` - gesture-safe restore coordinator, accessible Data recovery, and failed-restore cleanup coverage.
- `5daa5ac4b3f7c9cc038715df1ca8fd5a31f0dd24`, `768f1c47d1037ca2fc67d9e0adf5ac1b9b72bce1`, and `6f30b915719586cb519aa0f8f2b4418b0724debe` - real-extension restore proof, exact predicates/failure-isolated teardown, and post-reload locked teardown quiescence.
- `d28d6f53d6ffa87444646caa39816310d8cd6b00` - bounded whole-packet review fix that moves irreversible permission cleanup after atomic storage commit; verified W1-P4 implementation head is `6f30b915719586cb519aa0f8f2b4418b0724debe` including its reviewed harness proof.
- `4b5a9b5e55172a5e393f47f972716eebeedd5590` - independently reviewed executable W1-P5 plan (`docs: plan W1-P5 Home Assistant safety`).
- `ea95db06d301e11d77fd945b6bab665a87e3948e` and `e74cf4b7450dba2797c14c165e4f8034969bbf53` - selected-entity polling, narrow action-only health, and task-review mutation guards.
- `cd90c3d4fbec391fd46e5743833360c03cd164e0` - generation-safe per-action exclusion and persistent accessible feedback.
- `3d4ef14a759c331b494120d0f73429a9a6e96c21` and `6f17fefd4396dae8117604a26e2abf7e5844cc42` - real-extension action/AX proof and reviewed screenshot/manual-ceiling strengthening.
- `2ab1139730d4677f4b015002f3a1f9adcd2e0d0d` - bounded whole-packet review fix that versions Home Assistant opaque snapshot identity and rejects fresh legacy action-only snapshots.
- `74d4e27a6fa1262416ac8aa0149020a0ef02918e` - preview fixture scope alignment; verified W1-P5 implementation head.

## Latest verification

- W1-P5 expanded exact targeted suite at `74d4e27` - exit 0; 10 files / 378 tests passed.
- `npx tsc --noEmit` at `74d4e27` - exit 0.
- `npm test` at `74d4e27` - exit 0; photo manifest 23 entries / 46 tier files; 104 files / 1,709 tests passed.
- `npm run build` and `npm run build:preview` at `74d4e27` - exit 0; both transformed 171 modules.
- Production search for `__auroraPermissionsHarnessApi`, `__auroraBackupHarness`, and `__auroraRestoreHarness` - expected exit 1; no forbidden preview symbol matched in `dist`.
- `node scripts/preview.mjs` final controller-owned run at `74d4e27` - process exit 0 in 276.5 seconds; 437 PASS / 0 FAIL / 3 SKIP. Home Assistant evidence covers selected fixture scope v2, real Enter/Space activation, synchronous disabled/busy pending, same-action no-op input, sibling isolation, persistent natural failure, genuine pending/focused/error screenshot state, retry quiescence, `entities:null` hiding the whole card, exact Settings disclosure, and `Accessibility.getFullAXTree` status/alert semantics. The preserved W1-P3/W1-P4 permission, all-key restore, locked teardown, and native-boundary evidence also passed.
- Official endpoint boundary: regular polling uses authenticated single-entity `GET /api/states/{entity_id}`; picker-only discovery uses bulk `GET /api/states`; action-only health uses authenticated `GET /api/`; actions retain service POSTs without new permissions. Tokens remain in headers and opaque SHA-256 scopes only.
- `screenshots/ha-action-error.png` was inspected at original 1600x1100: six chips and three actions are unclipped; Movie night is genuinely pending; Porch plug is focused with complete persistent error text; meaning is independent of red.
- Chromium AX evidence exposes `Run Porch plug` as disabled/busy and described by `Running Porch plug…`, then enabled and described by the complete retry alert. This is screen-reader-oriented accessibility-tree evidence, not a real assistive-technology run.
- Final harness SKIPs remain honest ceilings: real Home Assistant picker contents plus a successful real service action against the user's instance, native NASA Block, and native NASA Allow. A real screen reader remains a separate manual ceiling.
- Independent W1-P5 plan review fixed all confirmed Critical/Important and packet-local Minor gaps; final verdict Ready. Task reviews fixed missing service mutation guards and harness evidence gaps. The bounded whole-packet review found one Important legacy action-only snapshot bypass, fixed in `2ab1139`; controller verification then exposed the preview v1/v2 fixture mismatch, fixed in `74d4e27`. Scoped rereviews found no Critical, Important, or packet-local correctness issue open.
- W1-P4 exact targeted suite at `6f30b91` - exit 0; 15 files / 600 tests passed.
- `npx tsc --noEmit` at `6f30b91` - exit 0.
- `npm test` at `6f30b91` - exit 0; photo manifest 23 entries / 46 tier files; 104 files / 1,694 tests passed.
- `npm run build` and `npm run build:preview` at `6f30b91` - exit 0; both transformed 171 modules.
- Production search for `__auroraPermissionsHarnessApi`, `__auroraBackupHarness`, and `__auroraRestoreHarness` - expected exit 1; no forbidden preview symbol matched in `dist`.
- `node scripts/preview.mjs` final controller-owned run - process exit 0 in 274.9 seconds; 432 PASS / 0 FAIL / 3 SKIP. All eight W1-P4 lines passed: secret-safe real export, confirmation-turn adapter request, exact cleaned atomic commit/cache reset, exact restored-owned set and old-only revoke, committed revoke failure with durable tab-round-trip Retry, exact trusted re-entry copy, exact old-only retry removal, and post-reload locked all-key/native-boundary teardown. The permission-matrix outer fallback also passed its all-key locked restore proof.
- Final harness SKIPs remain honest ceilings: real Home Assistant entity-picker behavior against a live user instance, native NASA Block, and native NASA Allow. Headless automation cannot settle the browser permission prompt.
- Independent W1-P4 plan review - four Important contract gaps and one Minor timestamp ambiguity were fixed; final verdict Ready.
- Independent W1-P4 implementation review - task reviews fixed all findings; bounded whole-packet review found one Important rollback/revoked-old-grant defect, fixed in `d28d6f5`; fresh rereview marked it addressed. Controller verification then exposed an in-flight connector-snapshot teardown race, fixed in `6f30b91`; fresh scoped review found no Critical, Important, or packet-local correctness issue open.
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

- Native Chrome optional-permission Block/Allow interaction remains unavailable in headless automation; W1-P4 does not claim a synthetic click, a grant restored from a backup file, or native-grant revocation.
- Real Home Assistant entity-picker contents, successful service execution, and real screen-reader behavior still require the user's live instance/manual session.
- Live Store version/dashboard answers require user/dashboard access in Wave 6.
- Mixed-DPI monitor moves and real Home Assistant hardware/service behavior require later environment/user evidence.
- The indirect development-only nanoid advisory remains open for the scoped hygiene packet; production dependency audit is clean.
- W1-P6 weather cache identity and request-race behavior remain unstarted; W1-P5 made no weather change.

## Files intentionally dirty

- None expected after `docs: checkpoint W1-P5`. If `git status --short` is non-empty at continuation, stop and reconcile before planning W1-P6.

## Single next packet

- **Packet:** `W1-P6` - Weather identity and request races
- **Plan:** Not yet created; create it just in time from the master specification, verified W1-P2/W1-P5 evidence, and the current weather cache identity, geocode/forecast request, visibility refresh, storage, and race contracts.
- **State:** Not started. The next fresh task should write and independently review the executable W1-P6 plan before any W1-P6 implementation; this W1-P5 task stops at the packet boundary.

## Continuation seed

```text
Worktree: D:\DEV\Chrome plugin-aurora-2
Branch: feat/aurora-2-observatory
Next plan: create just-in-time W1-P6 Weather identity and request races plan
Packet ID: W1-P6
Verified W1-P5 implementation SHA: 74d4e27a6fa1262416ac8aa0149020a0ef02918e
Expected next checkpoint subject: docs: checkpoint W1-P6
```
