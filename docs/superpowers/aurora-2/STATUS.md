# Aurora 2 Status

**Updated:** 2026-08-15<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Worktree:** `D:\DEV\Chrome plugin-aurora-2`<br>
**Current wave:** Wave 2 — Accessibility, recovery states, and narrow reflow<br>
**Last verified packet:** `W2-P2` - Focus, naming, boundary, and error recovery<br>
**Next packet:** `W2-P3` - Settings and tool reflow; Not started, no plan

## Packet envelope

- **Acceptance:** Focus and Quick Link editors preserve committed state, cancel without writes, expose associated errors, and restore focus; repeated Calendar content is source-named programmatically; the Home Assistant picker exposes named domain relationships and restores its invoker across every close path; DrawerBoundary retries only after reopen; backup/restore transitions are announced without moving async ownership.
- **Implemented files:** Focus/Quick Link editor semantics and geometry, Calendar source naming, Home Assistant picker relationships and invoker-owned restoration, DrawerBoundary reopen reset, Data operation feedback, and causal built-extension target/AX/screenshot evidence. W2-P3 narrow reflow remains outside the packet.
- **Test scope:** Exact editor write/focus paths, source relationships, picker naming/focus, boundary reopen recovery, Data status/alert/pending semantics, 36px targets and collision-free Focus geometry, targeted/full Vitest, TypeScript, production/preview builds, bridge isolation, audits, and the complete foreground harness.
- **Visual scope:** Six exact Focus/Quick Link, Calendar, Home Assistant picker, and Data feedback captures inspected at original resolution for readable non-color-only feedback, focus, clipping, target geometry, and stable rendered state. Chromium AX evidence is not a real screen-reader session.

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
- `6a7e949adba78a5ef7266fea88d0e6577bea74cb` - independently reviewed executable W1-P6 plan (`docs: plan W1-P6 Weather races`).
- `e4b32030e95432adcebac0545c62f527dd035437` - normalized Weather request identity, provider signal forwarding, cache schema/backup validation, and multi-key storage updater.
- `7459124a6ff125900dab25a0a5c25822a6895723` - generation-safe Weather hook plus atomic location/cache mutation and retry handling.
- `ce74954777d961ecb31db9eafd385280de06a74a` - six-line built-extension Weather identity/race/visibility harness proof.
- `e29aa53cb346773753028a716a85423a33fe5129` - bounded review fixes for truthful modeled visibility evidence, updater-time ownership, fresh mismatch, rejection, and complete teardown.
- `f4ed9335dcbb74aa35b685eb0149667daaefd31e` - red/green remount hydration-race fix; verified W1-P6 implementation head.
- `ba12f028ba920c912439fdd27338e850e576f252` - independently reviewed executable W1-P7 plan (`docs: plan W1-P7 local-day rollover`).
- `578c8e483ba0ce1aee74f60127d3b9131b9d45ed` - IANA-zone day boundaries and generation-safe local-day/restoration clocks.
- `a537fa9ef598f6aa36a0a5d34c278d711c258f2c` - open-tab rollover across the named date-driven surfaces and APOD ownership.
- `f66c9345e1aef89f1eb0914fbc7d6a3a0019c74a` - explicit all-day Calendar/ICS semantics and timezone-scoped snapshots.
- `32ffb8bbc703ea498ad1de6ab13f1d31ebfd2def` - deterministic built-extension rollover, Timer wake, and Calendar semantics proof.
- `2fcb4438b0857500db1e5fb0785e1da45e9eacd8` - bounded-review fix for skipped-midnight/skipped-day inverse conversion and expired-boundary rescheduling; verified W1-P7 implementation head.
- `5f2b32f863f1ec4c479e4216de673c18a3b9eb0b` - independently reviewed executable W1-P8 plan.
- `4915f2f5320cdd1e235ea471d7140a795b7b7304` and `8f101c22d352af04cf8dbba6e8c26a37223a082b` - revision-owned recoverable Notes persistence plus awaited close, disable, arrange, and navigation boundaries.
- `58a3e7992c1422e879b58e9d66df5fe476128fca` - preview-only authority-preserving failure controller, built-extension navigation/AX proof, and error screenshot.
- `5c570f7087d8d6e41b73db9e271339c75c93f62c` - bounded-review fixes for a 36px Retry target and close-before-restore teardown quiescence; verified W1-P8 implementation head.
- `3864ba7ee5f9f349f393ac555ecbf6d5791970df` - independently reviewed executable W1-P9 plan.
- `db94a73f0c56139f4d4ebbed4de1ad00ac3ae1f7` - typed privacy inventory, shared Quick Link trust boundary, manifest copy, and local plaintext disclosure.
- `9e1d43937c5ec4f1a9523a709cea46928dd628e0` - behavior-aligned source privacy/listing copy and exact dev-only `nanoid` override.
- `1cefce7d8b498737c1e1c28264963210a1bd9c1a` - bounded-review fixes for malformed HTTP(S), exhaustive transmitted/received flow fields, APOD truth, and interim listing contradictions; final focused rereview Ready.
- `34f89600f24c7be203854bdbaf348932ab1831f0` - development harness alignment to an intercepted safe HTTPS Notes navigation target; verified W1-P9 implementation head.
- `a13f5b1b6a619f99d48e095d564677cd1c4acdef` - independently reviewed executable W2-P1 plan (`docs: plan W2-P1 shared async state`).
- `7dc510ac55f0f0175d517027b762510b889bdf1b`, `0d71e1f12d34a69d2d7ad31b6f71aa323114844f`, and `3505b13a825bf3684f1e566675f256cc79daf092` - pure operation/freshness algebra, shared render-only feedback, and hardened browser truth inputs.
- `76dddaeae3f0947d694bfc611ff115989d0b7467` and `6d930685ba9fb86629d0b4f5363afcd868a46779` - connector/Weather semantic resource state and Notes/Home Assistant shared operation feedback.
- `0b2db71f26c1686b2c0cd5528303ebe19756945f` - six exact built-extension state captures and Chromium AX evidence without adding another counted W2-P1 result.
- `f2c1b788d6f341eb0137a05f270e7a531a4db9af` - bounded whole-packet review fixes for Notes retry/edit ownership, 36px Weather recovery targets, causal Chromium Enter retries, and exact Unicode primitive tests; verified W2-P1 implementation head.
- `e59e929de0884126c7a7c493607dfcb027c29b1b` - independently reviewed executable W2-P2 plan (`docs: plan W2-P2 recovery semantics`).
- `dd958894a7ebaafa49c0402d0f041b53e2a3e42b` - stable Focus and Quick Link editor focus, cancel, commit, error, and target semantics.
- `914ac4b17dcaf2870524f3b7cf1ffea490fb32c3` - Calendar source relationships and Home Assistant picker naming/group semantics.
- `5449fc7cde652cca6a8ffeaa3880321e9ebfd791` - DrawerBoundary reopen recovery and Data export/import/restore feedback.
- `5db8dc44121fd9bece4cf670d8d04d9d337de3c3` - bounded whole-packet review fixes for async picker focus restoration and causal/stable browser evidence.
- `1fdaf0c9c8192b10b53d732b552aa656f1ca23a3` - packet-local Focus prompt geometry regression fix; verified W2-P2 implementation head.

## Latest verification

- W2-P2 exact targeted suite at `1fdaf0c` - exit 0; 16 files / 661 tests passed.
- `npx tsc --noEmit` at `1fdaf0c` - exit 0.
- `npm test` at `1fdaf0c` - exit 0; 117 files / 1,962 tests passed.
- `npm run build` and `npm run build:preview` at `1fdaf0c` - exit 0; both transformed 178 modules.
- Production scan for `__auroraStorageHarness`, `__auroraPermissionsHarnessApi`, `__auroraBackupHarness`, and `__auroraRestoreHarness` - expected exit 1; no forbidden preview bridge matched in `dist`.
- `npm audit --omit=dev` and `npm audit --include=dev` - exit 0; zero vulnerabilities.
- Fresh foreground `node scripts/preview.mjs` at `1fdaf0c` - process exit 0; exactly 453 PASS / 0 FAIL / 3 SKIP, exactly one `PASS: W2-P2 focus, naming, boundary, and recovery semantics`, and zero named FAIL. Focus completion/Edit and prompt input remain at least 36 CSS px with no interactive collisions; bottom-member clearances are 8.7, 8.5, 13.5, 24.5, and 84.5 CSS px at the five exact geometry viewports.
- The six exact W2-P2 captures (`w2-p2-focus-link-800x600.png`, both Calendar source captures, both Home Assistant picker captures, and `w2-p2-data-feedback-2560x1440.png`) were inspected at original resolution: the Quick Link alert and pending restore status are visible and non-color-only; Calendar rows are stable and legible; picker content, focus, and controls are unclipped; and the pending restore controls visibly remain disabled.
- Chromium `Accessibility.getFullAXTree` exposes the named/associated Focus, Quick Link, Calendar, Home Assistant picker, and Data status/alert/button/disabled/busy relationships. This is supporting Chromium AX evidence, not a real screen-reader run.
- The bounded whole-packet review found 0 Critical and 3 Important findings. Real async picker focus loss plus non-causal/unstable browser evidence were fixed with red/green coverage in `5db8dc4`; the same reviewer rereviewed every finding and returned Ready. Controller verification then exposed six packet-local bottom-band failures caused by the new 36px Focus prompt input increasing centered flow height; an independent causal audit, literal unit/browser RED, and exact margin-box compensation fixed them in `1fdaf0c`. Final rereview returned Ready with no Critical/Important issue open.
- The three harness SKIPs remain the existing live Home Assistant/user-instance and native NASA permission ceilings. Real screen-reader behavior remains manual; no Store action occurred.

- W2-P1 exact targeted suite at `f2c1b78` - exit 0; 10 files / 187 tests passed.
- `npx tsc --noEmit` at `f2c1b78` - exit 0.
- `npm test` at `f2c1b78` - exit 0; 116 files / 1,929 tests passed.
- `npm run build` and `npm run build:preview` at `f2c1b78` - exit 0; both transformed 178 modules.
- Production scan for `__auroraStorageHarness`, `__auroraPermissionsHarnessApi`, `__auroraBackupHarness`, and `__auroraRestoreHarness` - expected exit 1; no forbidden preview bridge matched in `dist`.
- `npm audit --omit=dev` and `npm audit --include=dev` - exit 0; zero vulnerabilities.
- Fresh foreground `node scripts/preview.mjs` at `f2c1b78` - process exit 0; exactly 452 PASS / 0 FAIL / 3 SKIP, exactly one `PASS: W2-P1 shared async and freshness semantics`, and zero named FAIL. One prior unchanged run was rejected at 451 / 1 / 3 for the unrelated legacy Status removal timing flake; the accepted rerun changed no source.
- The six exact W2-P1 compact/standard/large Notes and Weather captures plus `w2-p1-weather-cached-recovery-1600x900.png` and `w2-p1-weather-no-data-recovery-800x600.png` were inspected at original resolution: feedback is readable and non-color-only, focus is visible, controls/panels are unclipped, both recovery targets are at least 36 CSS px, and geometry is unchanged.
- Chromium `Accessibility.getFullAXTree` exposes the named Notes/Home Assistant/Weather status, alert, button, description, disabled, and busy semantics, including both Weather recovery paths. This is Chromium AX evidence, not a real screen-reader run.
- The bounded whole-packet review found 0 Critical, 3 Important, and 1 packet-local Minor finding. All were fixed with red/green coverage in `f2c1b78`; focused rereview found no new Critical/Important breakage. The three harness SKIPs remain the existing live Home Assistant/user-instance and native NASA permission ceilings; W2-P1 added none.

- W1-P9 exact targeted suite - exit 0; 6 files / 362 tests passed.
- `npx tsc --noEmit` - exit 0.
- `npm test` - exit 0; photo manifest 23 entries / 46 tier files; 114 files / 1,890 tests passed.
- `npm run build` and `npm run build:preview` - exit 0; both transformed 176 modules. Production and preview descriptions are exactly `A calm, local-first new-tab dashboard. No Aurora account, no tracking, no backend.`; permission arrays preserve their exact existing split and `https://*/*` optional-host boundary.
- Production search for `__auroraStorageHarness`, `__auroraPermissionsHarnessApi`, `__auroraBackupHarness`, and `__auroraRestoreHarness` - expected exit 1; no forbidden preview symbol matched in `dist`.
- `npm audit --omit=dev` and `npm audit --include=dev` - zero vulnerabilities. `npm ls nanoid --all` resolves only `vite@6.4.3 -> postcss@8.5.23 -> nanoid@3.3.18 overridden`; the lock diff changes only nanoid 3.3.16 to 3.3.18 metadata.
- `node scripts/preview.mjs` final W1-P9 run - process exit 0; exactly 451 PASS / 0 FAIL / 3 SKIP. The W1-P8 Notes navigation probe now uses a routed HTTPS Quick Link compatible with W1-P9 policy and still proves warning, retained dismissed draft, Retry, navigation, and exact teardown.
- Independent plan review fixed two Important Quick Link/cache-contract gaps plus inventory/copy/dependency/preview-check precision. Independent implementation review found three Important malformed-HTTP(S), inventory-depth/APOD, and listing-truth gaps; red/green fixes plus two focused rereviews ended `ADDRESSED — Ready` with no Critical issue open.
- The three SKIPs remain unchanged manual ceilings: live Home Assistant picker/successful action against the user's instance, native NASA Block, and native NASA Allow. No W1-P9 SKIP was added.

- W1-P8 exact targeted suite at `5c570f7` - exit 0; 13 files / 173 tests passed.
- `npx tsc --noEmit` at `5c570f7` - exit 0.
- `npm test` at `5c570f7` - exit 0; photo manifest 23 entries / 46 tier files; 112 files / 1,848 tests passed.
- `npm run build` and `npm run build:preview` at `5c570f7` - exit 0; both transformed 174 modules.
- Production search for `__auroraStorageHarness`, `__auroraPermissionsHarnessApi`, `__auroraBackupHarness`, and `__auroraRestoreHarness` - expected exit 1; no forbidden preview symbol matched in `dist`.
- `node scripts/preview.mjs` final reviewed W1-P8 run at `5c570f7` - harness process exit 0; exactly 451 PASS / 0 FAIL / 3 SKIP. Its four W1-P8 lines prove deferred Saving-to-Saved truth, rejected-write draft/alert/Retry/AX behavior, awaited Escape and arrange entry, current-tab Quick Link beforeunload retention/unblock, and exact close-before-restore teardown.
- `screenshots/w1-p8-notes-error.png` was inspected at original 1600×900; the fixed 320×256 panel is unclipped, the alert is visible and not color-only, and Retry owns a 36px target. Built checks also passed at 800×600 and 2560×1440. Chromium's accessibility snapshot contains the alert and named Retry button; this is not a real screen-reader run.
- The independent implementation review found two Important gaps: the recovery target was approximately 16px high and assertion-failure teardown could restore before dirty-editor unmount cleanup. Red target coverage plus close/reset/lock-barrier teardown fixed both in `5c570f7`; focused rereview found no remaining Critical, Important, or packet-local Minor issue.
- The first and third W1-P8-capable full harness attempts each hit only the known unrelated Status row/dot UI timing race after the W1-P8 lines passed; a fresh post-review run produced the required 451 / 0 / 3 total without changing Status behavior. The three SKIPs remain the unchanged Home Assistant/native NASA permission ceilings; W1-P8 added none.
- W1-P7 exact targeted suite at `2fcb443` - exit 0; 23 files / 563 tests passed.
- `npx tsc --noEmit` at `2fcb443` - exit 0.
- `npm test` at `2fcb443` - exit 0; photo manifest 23 entries / 46 tier files; 110 files / 1,831 tests passed.
- `npm run build` and `npm run build:preview` at `2fcb443` - exit 0; both transformed 173 modules.
- Production search for `__auroraStorageHarness`, `__auroraPermissionsHarnessApi`, `__auroraBackupHarness`, and `__auroraRestoreHarness` - expected exit 1; no forbidden preview symbol matched in `dist`.
- `node scripts/preview.mjs` final W1-P7 run at `2fcb443` - harness process exit 0; exactly 447 PASS / 0 FAIL / 3 SKIP. All four W1-P7 lines passed: Focus/Countdown/Quote/Background crossed midnight in an already-open extension page; Timer completed exactly once after wake; explicit all-day, timed-midnight, and Join semantics remained distinct; request dedupe, exact storage, and an advancing restored main-page clock proved deterministic teardown.
- Unit/component evidence covers New York and Berlin 23-hour/25-hour days; Havana, Santiago, and Azores skipped-midnight first-valid boundaries; Apia's skipped civil day; earlier overlap and least-after gap resolution; calendar distances; no expired-boundary one-millisecond loop; stale generations; Strict Mode/unmount; restoration signals; every named surface; APOD stale resolve/reject/finally ownership; ICS v2 timezone scope and exact payload validation; Calendar tokens/windows; and Timer exactly-once wake completion.
- The independent implementation review found one Critical midnight-transition inverse defect that could stamp the previous civil day and drive a one-millisecond resample loop. Red tests reproduced all cited zones before `2fcb443`; the scoped rereview found no remaining Critical, Important, or packet-local correctness finding.
- Final harness SKIPs remain the unchanged manual ceilings: real Home Assistant picker/action behavior against the user's instance, native NASA Block, and native NASA Allow. W1-P7 added no SKIP. Genuine operating-system timezone changes and real sleep/wake remain additional manual environment gates rather than skipped automated assertions.
- W1-P6 exact targeted suite at `f4ed933` - exit 0; 17 files / 532 tests passed.
- `npx tsc --noEmit` at `f4ed933` - exit 0.
- `npm test` at `f4ed933` - exit 0; photo manifest 23 entries / 46 tier files; 106 files / 1,751 tests passed.
- `npm run build` and `npm run build:preview` at `f4ed933` - exit 0; both transformed 172 modules.
- Production search for `__auroraStorageHarness`, `__auroraPermissionsHarnessApi`, `__auroraBackupHarness`, and `__auroraRestoreHarness` - expected exit 1; no forbidden preview symbol matched in `dist`.
- `node scripts/preview.mjs` final controller-owned run at `f4ed933` - harness process exit 0; exactly 443 PASS / 0 FAIL / 3 SKIP. All six W1-P6 assertions passed: fresh same-label/different-coordinate mismatch suppression; complete normalized B request while A is held; B render/persist identity; late A fulfillment rejection; fresh-cache no-fetch plus exact-boundary modeled visibility refresh; repeated modeled visibility dedupe and quiescent exact-state teardown.
- The first fresh full harness run after review was an intentional red record at 441 PASS / 2 FAIL / 3 SKIP: independent storage hydration let `location` resolve before `weatherCache` on reload and started a needless request. A delayed-read regression reproduced it before `f4ed933`; the final full rerun above is green.
- Independent W1-P6 plan review fixed seven Important and two Minor gaps. The bounded implementation review fixed two Important and two Minor evidence/test gaps in `e29aa53`; controller verification then exposed the hydration race fixed in `f4ed933`. Final scoped rereviews found no Critical, Important, or packet-local Minor issue open.
- Headless visibility evidence is deliberately limited: production-listener convergence is exercised with a modeled `visibilityState` signal and standard event, while fake-time unit tests prove the exact `MAX_AGE_MS - 1` to boundary transition and listener semantics. No native headless tab-visibility transition is claimed.
- Final harness SKIPs remain the unchanged manual ceilings: real Home Assistant picker/action behavior against the user's instance, native NASA Block, and native NASA Allow. W1-P6 added no SKIP.
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
- Chromium AX trees support W2-P1/W2-P2 semantic inspection but do not establish real assistive-technology speech, timing, or interaction behavior.
- Live Store version/dashboard answers require user/dashboard access in Wave 6.
- Mixed-DPI monitor moves and real Home Assistant hardware/service behavior require later environment/user evidence.
- The indirect development-only nanoid advisory is resolved by the exact `3.3.18` override; production and full audits are clean and no production dependency changed.
- A native hidden-to-visible browser transition is unavailable in the current headless harness; W1-P6 records modeled built-extension convergence plus exact fake-time listener coverage without overstating that boundary.
- Genuine operating-system timezone changes and machine sleep/wake cannot be induced by the deterministic extension harness; W1-P7 proves their production event paths and clock discontinuities with exact unit/component coverage and retains the real-environment checks as manual gates.
- Browser beforeunload is intentionally best-effort: W1-P8 starts the authority flush and warns only while dirty, but cannot promise an async write finishes after a user explicitly confirms navigation.

## Files intentionally dirty

- None expected after `docs: checkpoint W2-P2`. If `git status --short` is non-empty at continuation, stop and reconcile before planning W2-P3.

## Continuous remaining-work protocol

- **Packet:** `W2-P3` - Settings and tool reflow
- **Plan:** None. Create it just in time from the master specification, verified W2-P2 semantics, current Settings/tool/dialog/popover layout seams, and the W2-P3 320 CSS px / 400% zoom acceptance boundary.
- **State:** Not started. Write and independently review the executable W2-P3 plan before any W2-P3 implementation.
- After each packet's dedicated checkpoint, push, local/upstream equality proof, and clean target/protected-original proof, proceed directly to the next Not started `ROADMAP.md` packet without a new chat handoff or continuation prompt.
- Before each just-in-time plan, re-read the master specification, `STATUS.md`, `ROADMAP.md`, and `DECISIONS.md`, and revalidate repository provenance and cleanliness.
- Keep one plan, implementation envelope, independent review/fix round, verification set, and checkpoint per packet. Do not combine packets or skip their gates.
- Pause only for a genuine blocker, a material decision requiring new authority, required user/manual evidence, an explicit handoff request, or the W6-P5 Store approval boundary. W6-P5 must stop before any upload, submission, publication, rollout, or live-listing change unless contemporaneous explicit approval is received.
- Historical packet plans remain evidence; their previous handoff wording does not override the newer continuous-run protocol.

## Single continuous-run seed

```text
Worktree: D:\DEV\Chrome plugin-aurora-2
Branch: feat/aurora-2-observatory
Starting packet: W2-P3
Verified W2-P2 implementation SHA: 1fdaf0c9c8192b10b53d732b552aa656f1ca23a3
Expected next checkpoint subject: docs: checkpoint W2-P3
Execution: continue sequentially through all remaining ROADMAP packets, preserving one just-in-time plan and one checkpoint at a time; do not create per-packet continuation prompts.
Hard stop: W6-P5 before any Chrome Web Store external action unless explicit approval is given at that time.
```
