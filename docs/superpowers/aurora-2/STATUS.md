# Aurora 2 Status

**Updated:** 2026-08-17<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Worktree:** `D:\DEV\Chrome plugin-aurora-2`<br>
**Current wave:** Wave 6 - Full product QA and Store release candidate<br>
**Last verified packet:** `W6-P4` - 2.0.0 package and release dossier<br>
**Current packet:** `W6-P5` - Explicit Store approval gate

## Packet envelope

- **Acceptance:** Restore Aurora's approved V1 photo-first composition and direct free placement while retaining Aurora 2's security, privacy, storage, migration, connector, accessibility, and recovery foundation. Every visible widget must be movable; Bookmarks return to the top; tools return to direct launchers; Focus stays centered; widget sizes must be materially distinct; rich connector content and complete calendars must be restored.
- **Written design:** The owner approved `docs/superpowers/specs/2026-08-16-aurora-v1-canvas-adaptive-safety-rails-design.md` on 2026-08-16. Internal profile keys remain compatible while the user-facing canvas uses Small, Desktop, Large, and Wide layouts with direct drag, safety rails, and non-occluding editing.
- **Executable plan:** `docs/superpowers/plans/2026-08-16-aurora-v1-canvas-adaptive-safety-rails.md` defines eight bounded packets, two owner visual gates, one review/fix cycle per packet, checkpoint pushes, and the single post-approval final gate.
- **Rejected candidate:** Calm Canvas commits through `3c5015a` remain recoverable historical evidence but are not visually accepted, release-ready, or a foundation to continue polishing. Their full gates were correctly withheld.
- **Canvas-P1 evidence:** Schema v12 and the additive V1/V2/V3 union are implemented without eager layout rewrite. V1/V2 recovery is exact, V3 Save is explicit, active block corruption falls back per block, backup validation remains strict, and legacy Settings/Arrange paths cannot destroy V3. The final focused gate passed 9 files / 609 tests, TypeScript, and diff hygiene. One review/fix/rereview cycle closed all blocking findings; repeated Settings test `act(...)` warnings remain Minor harness noise.
- **Canvas-P2 evidence:** One normalized Canvas now renders V1, V2, and V3 profiles with source-owned V1 anchors, Small/Desktop/Large/Wide selection, safe fitted geometry, optional Bottom bar ownership, preserved compact presentations, and no semantic Day/Now/Work Pulse/Signal Dock presentation regions. Custom saved blocks remain exact while newly enabled identities find a safe snapped position. `Use Desktop layout everywhere` is an in-memory fitted preview with no write. The final focused gate passed 8 files / 71 tests, TypeScript, and diff hygiene; the bounded rereview returned Ready with no findings open.
- **Canvas-P3 evidence:** Direct Arrange now owns one explicit-save draft with measured Canvas-local pointer geometry, grid and magnetic guides, 8px-bounded keyboard and size changes, collision/layer feedback, undo/reset, four real profile previews, draft visibility, a non-occluding inspector/Small sheet, exact Cancel, one authority-backed Save, real-invoker focus restoration, and durable terminal announcements. The final focused gate passed 6 files / 79 tests, TypeScript, and diff hygiene. The one review/fix/rereview cycle closed five Important findings; the rereview's remaining restored-size branch was reproduced and fixed under the exhausted cycle. No Minor issue was reported.
- **Canvas-P4 evidence:** The V1 hierarchy now keeps Bookmarks at the top, Clock and one stable Focus footprint centered, movable Timer/Tasks/Notes launchers opening direct contained panels, and Briefing absent unless explicitly enabled with real signals. The optional Utility Tray exposes only working Home Assistant and Refresh commands. The exact focused gate passed 7 files / 332 tests, TypeScript, and diff hygiene. The focused real-Chromium probe exercised direct panels, pointer drag, guides, keyboard movement, selection, inspector, exact Cancel, Small sheet containment, overflow, focus restoration, and Timer continuation with no runtime errors or failed requests. One review/fix/rereview cycle closed the blank Utility Tray regression. Minor observations remain for the exercised Clock overlap warning and existing Settings test `act(...)` hydration warnings.
- **Canvas-P5 evidence:** The owner approved the Canvas-P4 direction and refined compact Weather, bookmark marks, Small Search clearance, and connector-size expectations. Each registry identity now declares only materially distinct sizes with explicit content contracts. Canvas size reaches GitHub, GitLab, Jira, Vercel, Status, RSS, Crypto, and Home Assistant without changing connector settings; Compact preserves truthful primary state, Standard preserves selected rows or visuals, and Full preserves complete selected compositions. Inspector conflicts are derived from actual selected sections, including conditional Jira and RSS requirements. Compact Weather retains icon, temperature, condition/location, and chevron; named folders gain one- or two-character marks; Small Search reserves utility-control clearance. The final focused gate passed 15 files / 317 tests, TypeScript, and diff hygiene. One review/fix/rereview cycle closed three Important issues; its two residual Important branches were closed with focused evidence under the exhausted cycle and no second rereview. Minor: a Compact Canvas folder may paint both glyph and monogram when viewport and Canvas size disagree. Exact Small clearance remains a Packet 7 real-browser witness.
- **Canvas-P6 evidence:** Month now offers only Compact and Standard. Its default and Today Compact state is one complete Sunday-to-Saturday week, navigation remains coherent with complete seven-day rows, and Standard renders the natural complete four-, five-, or six-row month without the rejected CSS fragment. ICS feeds have optional identity-owned colors, exact legacy Auto ordering, one closed palette, matching Settings and event dots, and accessible named controls. Color-only edits preserve URLs, permissions, cached events, omitted optional fields, and in-flight refresh ownership. The final packet gate passed 7 files / 445 tests, the focused snapshot gate passed 3 files / 76 tests, TypeScript and diff hygiene passed, and the single review/fix/rereview cycle plus exact residual legacy-default closure left no Critical or Important issue open. Existing Settings test `act(...)` warnings remain Minor harness noise; visual proof is assigned to Packet 7.
- **Canvas-P7 evidence:** The focused real-Chromium gate produced three separate DSF-1 owner captures at 1600x900, 2560x1440, and 3440x1440. Desktop shows top Bookmarks plus rich GitHub/Jira content; independent Large and Wide profiles show all nine connector families, visibly named multi-calendar sources, and a complete Month. Direct evidence covers all visible Arrange identities, long press, active pointer capture, guides, keyboard movement, overlap/layers, Undo/Cancel/Save, profile previews, nested local scrolling, cursor semantics, Small containment/clearance, Focus lifecycle, and cache-neutral persisted ICS color changes. The Calendar attribution and incomplete-evidence review findings were closed in the single fix/rereview cycle; rereview returned Ready. The owner then correctly rejected the submitted Desktop capture because Compact Month dates were vertically stacked. `01f5076` removed the Compact table-cell layout override and added an exact Chromium row-geometry regression. The regenerated Desktop capture now shows `16 17 18 19 20 21 22` left to right, Large/Wide remain complete, and all three corrected captures have zero intersections, clipped blocks, missing images, runtime errors, and failed requests. The compact folder glyph/monogram duplication remains Minor, and the documented native/live-service ceilings remain manual.
- **Canvas-P8 evidence:** The owner approved the corrected Packet 7 captures. The one full unit run exposed only an obsolete source-text assertion for the retired Day presentation; the affected behavior family passed 2 files / 29 tests after its removal and the full suite was not repeated. Production and preview builds each transformed 193 modules, and the production bridge scan was clean. The canonical harness run and its one permitted rerun both stopped in the same stale Utility Tray/direct Timer harness family; the rerun passed its first six product assertions before a leftover `timerDialog` reference stopped traversal. The corrected W1-P7-only Chromium family then passed all seven reported checks, including exact restoration and a real advancing clock. No third canonical run occurred. Final original-resolution inspection reconfirmed the accepted captures and `errors: []`; one final review returned Ready with no Critical or Important blocker. The incomplete later canonical traversal is Minor procedural evidence debt under the explicit no-third-run limit.
- **W6-P3 evidence:** Current official Chrome Web Store policy is mapped to Aurora's executable data-flow inventory. Canonical privacy/listing/Data Usage source was reconciled after two Important disclosure fixes and a Ready rereview. The signed-in live dashboard was then transcribed read-only: publisher `jcooler`, Aurora item `akjalbmacojpmebkgohhcaaiacicpgkh`, live/draft version `1.2.1`, status `Published - public`, five V1 screenshots, and five live 2.0 Data Usage category changes. The privacy URL, remote-code answer, and all three current certifications match. Exact differences are assigned to W6-P4 preparation or W6-P5 action; no dashboard field, package, draft, submission, publication, or rollout changed.
- **W6-P4 evidence:** Version 2.0.0 is synchronized. `release/aurora-2.0.0.zip` was built once from clean source commit `6fae415`, is 60,443,024 bytes with 59 entries and SHA-256 `31930FEC4A288992EC74FD3173F08FE444D132A00FA7EF51C0900B629F356116`, and passed production manifest/root/leakage guards. Five current 1280x800 Store screenshots passed the real-extension capture gate with zero console/page/request errors and were inspected separately. Listing, release/reviewer notes, checklist, exact field map, and dossier are staged. One Important routable Jira fixture namespace was changed to `.invalid` in `f6d0b6f`; regenerated evidence and the single rereview are Ready with no Critical/Important issue. The live Store remains unchanged.
- **Remaining gate:** W6-P5 is the hard external-action approval boundary. Stop before upload, field typing/save, submission, publication, distribution, or rollout until the owner explicitly approves the exact action at that moment.

## Previous packet envelope

- **Acceptance:** One selected Tray tool exposes Tasks, Notes, Timer, Home Assistant actions, or background refresh. A running timer remains represented after detail closure and the tools remain coherent in the accepted responsive shell.
- **Implemented files:** Added controlled tool navigation/host and existing-owner portals for all five written families. Notes save guards now cover close, switching, Settings, Arrange, and external disable. No registry, schema, planner, storage, migration, privacy, permission, connector identity, or Store contract changed.
- **Test scope:** Focused development passed 9 files / 133 tests plus the protected-disable regression and TypeScript. The focused built-extension replay passed representative Tasks/Notes/Timer/refresh operations, single-detail selection, timer survival, responsive modality, focus restoration, cleanup, and zero runtime errors. One review found one Important Notes guard edge; the fix/rereview returned Ready. Final unit evidence passed 137 files / 2,254 tests; production/preview builds transformed 189 modules; bridge scan was clean.
- **Visual scope:** Compact 800x600 and Standard 1600x900 working-tool captures were inspected once. The full harness and its one rerun were exhausted by stale standalone-tool selectors; the remaining implicit-region selector was source-corrected without a third run and is Minor evidence debt only.

## Last completed commits

- `2e194bc` - synchronized Aurora 2.0.0 version metadata.
- `6fae415` - current five-image Store capture source and real-interaction harness.
- `c564687` - audited 2.0 release dossier, notes, and checklist.
- `f6d0b6f` - review fix moving the Jira capture fixture to the non-routable `.invalid` namespace.
- `19771f0` - current-policy/source reconciliation and bounded disclosure review fixes; W6-P3 checkpoint subject is `docs: checkpoint W6-P3`.
- `01f5076` - owner-reported Compact Month row-geometry correction and real Chromium regression witness.
- `cb58bd2db35557e884008e683d64687548e1d146` and `73b279431fb868f5d31ec628a5d8c2b6579052b2` - integrated Canvas Chromium evidence, visible calendar-source attribution, and the bounded review fix/rereview closure.
- `c774b57` - Packet 8 stale semantic/source assertions and direct-panel canonical harness alignment.
- Final ledger checkpoint subject: `docs: checkpoint V1 Canvas recovery`.
- `45bcf45a4a30f8d05f78abf02ac4cb913d54c64a`, `8ce4fb824e78e6abac29b8422321b0fc3d32b926`, and `f6c35af` - complete Month sizes, identity-owned ICS colors, cache-neutral refresh ownership, and backward-compatible color saves.
- `10ff5334567664965eae7518c9c34f88b2c9ce35`, `484cd633958f3a739affd8c7617ef7cf3b152239`, and `121da8d8658c55d6898f70173ad705b97f8cefa7` - truthful Canvas size contracts, review fixes, and configuration-aware residual closure.
- `6403b26198dd3f94742316850ae1a1564c1492ee` and `045ed09` - restored V1 interactions and the bounded Utility Tray rereview fix.
- `5aa01e532b3e286195407d2a8cbd6dfb0b7f80b8`, `96482b8495c5da50206cd39a4492d68a5eb09558`, and `8996b15a3f2084d21b41f4dab9db10c7b00e8f63` - direct Canvas editing, bounded review fixes, and the restored-size safe-margin regression.
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
- `b51674f9b356363790c4ec83f72f67bba9c62610` - independently reviewed executable W2-P3 plan (`docs: plan W2-P3 narrow reflow`).
- `461319d1c52b96bdc8271b61f86f3d5f27210557` - narrow Settings reflow, complete packet browser contract, exact target inventory, and reviewed lifecycle evidence.
- `135d1305f4042878c81e84d33ed6da803efdf560` - 8px viewport-fit math, current rendered-panel resize ownership, and bounded Notes/Tasks/Timer surfaces.
- `ce285f0de67ab2feeb6ad60fd29f7573e8af6aac` - bounded picker, Palette, Location, Folder, Reset, and reviewed body-portalled Tasks overflow behavior.
- `ced5e1cfc068426a8856b40bca8c22bd544b7e17` - whole-review fixes for the General endpoint, complete 320x180 evidence matrix, and non-occluded Location/Weather composite.
- `64675d245df08d126ab5610b807931ac47320b8e` - final resize/active-descendant ownership race fix; verified W2-P3 implementation head.
- `b9ec83296c9854de9449b6b1d2657ffed962ddad` - independently reviewed executable W3-P1 plan (`docs: plan W3-P1 layout migration`).
- `4d8aae1e5a5c0c423b326bbf53c8f6ddabaf281f` - pure versioned Layout V2 schema, deterministic mapper/normalizer, compatibility helpers, and immutable browser aggregate.
- `0f4ce3915078c785d7303a8dc3780070d8d16b99` - schema v10 migration and verified rollback-safe startup transaction.
- `a760fff8714bc0ac044448c39f38988d3635689b` - App, Arrange, reset, and old/current backup compatibility seams.
- `255a05f442900aac3cd10c1adc6408dc1bbab38c` and `be6ae5dc26da713c1bb7dd4c1dde906f12c76c0e` - separate full-suite timing fixes found only by controller-owned closeout attempts.
- `925438f890de62d5540221b86b53330f2dd0a5a1` - reviewed v10/V2 browser-fixture alignment; verified W3-P1 implementation head.
- `d77717c2f3662aabda0811d2e10be6d22f03660d` - reviewed executable W3-P2 Adaptive Stage registry plan.
- `ef26d73`, `cdaf9f6`, `170d05a`, and `648b7b2` - pure profile engine, schema-v11 density persistence, source registry/BoardItem, and semantic Adaptive Stage rendering.
- `b29ec6c`, `9952f7f`, and `ad79a523c81e51b593b7b57b9ba5cd45492873aa` - bounded review fixes and final accessibility/geometry/calibration gate fixes; verified W3-P2 implementation head.
- `c6a22cb`, `dc022b2`, and `088cf71` - executable W3-P3 plan, immutable semantic draft model, and production Arrange/profile editor with live Adaptive Stage preview.
- `eab1bfe` - bounded review fixes preserving disabled-widget placements during profile copy and preventing Escape from cancelling an in-flight Save.
- `8bc420d`, `672e136`, and `314bcbd` - focused semantic browser coverage, stale Arrange predecessor alignment, deterministic Weather recovery convergence, and the standalone W3-P3 replay; verified W3-P3 implementation head.
- `108ac59` - executable W3-P4 legacy-retirement plan preserving the frozen rollback-provenance boundary.
- `1951eb2` and `f5132fc` - retired live percentage placement/editing machinery, dead rail CSS, and whole-widget height-hide paths while retaining exact migration/backup provenance.
- `e4cebe4` - causal W3-P3 focus-restoration harness wait plus the focused W3-P4 semantic parity, representation, rollback, runtime, and capture proof; verified W3-P4 implementation head.
- `9f206da` - executable W4-P1 Day/Now plan with frozen schema, registry, capacity, storage, privacy, permission, and Store boundaries.
- `6d87137`, `9561074`, and `05669b8` - responsive sparse Day context, calm photo-forward Now presentation, expanded date detail, and the bounded-review accessibility fix.
- `089886e`, `5c33afb`, and `7acb851` - focused W4-P1 browser proof, frozen Compact-capacity evidence alignment, and causal full-harness Clock selector correction; verified W4-P1 implementation head.
- `8277845` - executable W4-P2 Aurora Briefing plan with local-only synthesis and frozen schema/registry/allocation/network boundaries.
- `5ec2f4a` and `4a66a50` - pure deterministic Calendar/Tasks/Rain synthesis and render-only Greeting integration.
- `c6c95c2`, `5258e2a`, and `e656263` - responsive text fitting, focused Chromium evidence, and bounded Compact Greeting containment corrections; verified W4-P2 implementation head.
- `793af31` - executable W4-P3 Work Pulse variants plan with frozen schema, registry, allocation, storage, privacy, network, permission, and Store boundaries.
- `ce23c04`, `fc258c0`, and `13a0b4a` - shared render-only attention summary, connector prioritization, and responsive Work Pulse hierarchy.
- `3248890` and `1ab0fa6` - reviewed Status detail progression plus causal global geometry and Vercel Compact containment corrections; verified W4-P3 implementation head.
- `5227110` - executable W4-P4 Signal Dock and connector-survival plan with frozen schema, registry, allocation, storage, privacy, permission, network, and Store boundaries.
- `4481358`, `c90fd94`, and `f441149` - one shared Dock-only connector disclosure, condensed connector geometry/presentation, and exact nine-connector built-extension survival/operation proof.
- `049be58` - bounded fix/rereview correction that yields the legacy Compact Vercel detail line and aligns stale fencepost reporting with Signal Dock survival; verified W4-P4 implementation head.
- `e1167ca`, `58d3d1a`, and `a1ee6d7` - adjacent launcher shelf composition plus Calendar/RSS/Home Assistant/Weather content variants.
- `4b8c714` and `250c1c3` - content-sized launcher surface and the bounded-review Weather variant-transition fix.
- `6656182` - full-harness alignment for render-only launcher ancestry and exact content-variant fixtures; verified W4-P5 implementation head.
- `e762699` and `8b36bac` - responsive Utility Tray shell plus the exact backdrop-dismissal focus-restoration fix and focused browser proof.
- `e7b3c5f` - final harness alignment for the W5-P1 persistent control and accepted Compact Calendar content budget; verified W5-P1 implementation head.
- `44e05c0` - existing-owner Tasks, Notes, Timer, Home Assistant action, and background-refresh integration with guarded Notes lifecycle and focused browser proof.

## Latest verification

- W6-P2 covered every named viewport/state plus 100/125/150/200/400% CSS-space reflow once and inspected the required captures in three bounded batches. The packaged replay passed overflow, 36/44px targets, keyboard focus/restoration, reduced motion, Chromium AX naming, touch taps, cleanup, and zero runtime errors.
- One Important compact Weather setup collision at 200/400% was fixed in `7c51e78`; focused evidence passed 3 files / 78 tests and the final source contract passed 21/21. One implementation review/rereview returned Ready with 0 Critical / 0 Important open.
- Final evidence passed 137 files / 2,264 tests, clean 189-module production/preview builds, and a clean production bridge scan. The full pass and its one permitted rerun printed 455 PASS / 2 FAIL / 3 SKIP because the legacy W2-P3 generic point-scanner could not discover the intentional Compact modal backdrop and aborted before cleanup, cascading into W3-P2. Direct focused backdrop evidence and component tests remain green; `cf3d212` source-corrected the selector without a prohibited third run. This is Minor evidence debt, not a product failure. Native zoom, mixed-DPI, real screen readers, physical hardware, native permission prompts, and live services remain explicit manual ceilings in `W6-P2-QA-MATRIX.md`.

- W6-P1 completed four first-run focused matrices: migration/stored-data 7 files / 317 tests; permission/secret recovery 7 / 219; offline/stale/error/persistence 13 / 190; civil-time/open-tab recovery 6 / 94. This is 820 executed assertions and 690 unique assertions because backup validation intentionally belongs to two families.
- The unchanged W5-P4 full gate was reused instead of repeated. The bounded W6-P1 review returned Ready with no Critical, Important, or Minor product finding; no fix/rereview and no product/test code change was required. Exact results and retained manual ceilings are in `W6-P1-QA-MATRIX.md`.

- W5-P4 focused development passed 6 files / 280 tests. The packaged Chromium replay proved an opaque local Focus prompt surface at 18.04:1 across bright, dark, and detailed packaged photos, 44px spacious persistent controls, 36px Settings controls, 14px ordinary and 12px metadata type floors, opaque Settings/Tray work surfaces, reduced-motion convergence, exact cleanup, and zero runtime errors. All three required captures were inspected once.
- One implementation review returned Ready with 0 Critical / 0 Important findings. The final unit gate passed 137 files / 2,262 tests; production and preview builds transformed 189 modules; TypeScript and the production bridge scan were clean.
- The first full browser run exposed two actual families: the Utility Tray invoker stayed at 36px under the spacious 44px Stage token, and a W2-P3 320x180 panel-level outside-point probe demanded empty space that the accepted fitted Tasks surface legitimately did not have. `a83f6ad` added the persistent target and retained 320x180 menu/geometry coverage while moving only the panel-level outside-pointer check to 320x568. The single permitted full rerun completed at 457 PASS / 0 FAIL / 3 SKIP. No third run or documentation-triggered gate was performed.

- W5-P1 focused development passed 2 files / 30 tests plus TypeScript. `scripts/preview-w5-p1.mjs` passed Standard 1600x900 modeless and Compact 800x600 modal behavior with free/trapped focus as appropriate, outside/Escape/backdrop dismissal, exact restoration, containment, dashboard isolation only in Compact, clean teardown, and zero runtime errors. Both captures were inspected once.
- The focused replay's first run found one genuine backdrop focus-restoration failure. `8b36bac` moved dismissal to the completed click and added its failing regression; the single focused rerun passed. One implementation review then returned Ready with 0 Critical / 0 Important findings, so no additional review was launched.
- The final `npm test` run passed 137 files / 2,250 tests. TypeScript, production, and preview builds exited 0 with 189 modules transformed; the production bridge scan found no forbidden preview symbols.
- The full harness ran once and reran once after adding the W5-P1 invoker to its persistent-target family. The rerun cleared W3-P2 and exposed one unrelated W2-P2 Calendar assertion that still required hidden agenda rows from a Compact variant. `e7b3c5f` made that assertion variant-aware; no third full run was performed. This is Minor legacy evidence debt, not a W5-P1 acceptance, security/privacy, stored-data, migration, core-functionality, or accessibility failure.

- W4-P5 focused development and rereview gates passed: the stabilized component/App set passed 5 files / 140 tests plus TypeScript; the focused built-extension replay passed Compact 800x600, Standard 1600x900, and Display 2560x1440 with one content-sized shelf where eligible, exact launcher identities, exact Calendar/RSS/Home Assistant budgets, Expanded Weather trend, safe links, keyboard focus restoration, no page clip, exact cleanup, zero external requests, and zero runtime errors.
- The one final `npm test` run passed 136 files / 2,244 tests. Final TypeScript, production build, and preview build exited 0; both builds transformed 188 modules. The production preview-bridge scan returned the expected no-match result.
- The full browser harness was run once, then rerun once after its actual stale content-variant/direct-parent family was corrected. The permitted rerun confirmed the corrected rollover, RSS, launcher-aware semantic ownership, Home Assistant expanded action fixture, and downstream interaction flows. Later failures were additional stale detailed-Calendar fixtures, hidden Status pixel coordinates, and the same direct-parent assumption in the frozen W3-P2 aggregate; `6656182` corrected those harness assertions without a third full run. They are Minor evidence debt pending the next scheduled harness and do not demonstrate security/privacy risk, stored-data loss, broken core functionality, or failure of a W4-P5 acceptance criterion.
- Required captures under `C:\Users\SickT\Documents\Codex\2026-08-16\change-aurora-execution-to-pragmatic-delivery\outputs\w4-p5\` were inspected once. The initial oversized shelf was the only focused visual acceptance failure; `4b8c714` made Standard and Display shelves content-sized, and the focused replay passed after the correction.
- One implementation review found one Important issue: Weather remained expanded after a Display-to-Standard/Compact variant transition. `250c1c3` added the failing transition regression and fixed it; the single focused rereview returned Ready with 0 Critical / 0 Important open. No schema, registry, profile threshold, capacity, migration, stored-data, permission, privacy, production-network, protected-checkout, or Store contract changed.

- W4-P4 focused development gates passed: the stabilized component/App/sizing/presentation set passed 5 files / 47 tests plus TypeScript; the final Vercel cascade regression test passed 1 file / 3 tests. `node --check scripts/preview.mjs` exited 0.
- The one final `npm test` run passed 135 files / 2,235 tests. Final `npx tsc --noEmit`, production build, and preview build exited 0; both builds transformed 187 modules. The production bridge scan returned the expected clean no-match result.
- Focused `node scripts/preview-w4-p4.mjs` exited 0 with `PASS: W4-P4 Signal Dock connector survival`. All nine frozen connector IDs were present exactly once in Dock across Compact 800x600, Standard 1600x900, and Display 2560x1440; identity/current value, inert closed state, 36px disclosure, containment, safe links, open detail, Escape/focus restoration, keyboard reveal, exact teardown, zero external requests, and zero runtime errors were green. All three captures were inspected once.
- The first full browser run found one genuine Compact Vercel paint escape and stopped later on a stale legacy fencepost log that dereferenced a Dock-condensed connector. The causal fix removed the high-specificity supporting detail, and the exact compact-density/six-deployment focused diagnosis reported no escaping box or text. The one permitted full rerun exited 0 and the Vercel family passed.
- The full rerun retained two historical Status pixel-sampling FAIL logs and one stale W3-P2 aggregate FAIL label. These are Minor evidence/report debt: Status meaning remains explicit in text and the W3-P2 observations reported empty runtime/captured-error, paint-escape, duplicate, and collision arrays with exact ownership/cleanup. They do not demonstrate security/privacy risk, data loss, broken core functionality, or failure of W4-P4 acceptance, so the packet was not reopened.
- One bounded implementation review plus one fix/rereview cycle ended Ready with no Critical or Important issue open. No schema, registry, profile threshold, capacity, allocation, migration, stored-data, permission, privacy, production-network, Aurora V1, or Store contract changed.

- W4-P3 focused development gates passed: the broad stabilized set was 9 files / 184 tests; the final causal Vercel set was 2 files / 26 tests. TypeScript and both harness syntax checks exited 0.
- The one final `npm test` run completed at 132 files with 2,225 / 2,226 tests passing. Its only failure was an unrelated untouched Settings color-write timing case; the exact one-test rerun passed 1 / 1. The full unit suite was not repeated.
- Final production and preview builds exited 0 with 186 modules transformed; the production bridge scan returned the expected clean no-match result.
- Focused `node scripts/preview-w4-p3.mjs` exited 0 with `PASS: W4-P3 Work Pulse variants`. Compact/Standard/Display expose exact progressive anatomy; healthy and attention Status states are explicit; Vercel Compact is contained; links are safe; teardown restores storage; and external requests/runtime errors are empty.
- The full browser harness was run once, then rerun once after its actual W4-P3 assertion/geometry family was corrected. The permitted rerun cleared the global geometry and obsolete variant-expectation families, leaving one genuine Vercel Compact paint-containment failure and two obsolete Status pixel-sampling assertions. The Vercel family passed its bounded focused fix; the two cosmetic pixel probes are Minor ledger items and did not reopen the packet. No third full harness run was performed.
- Required captures under `C:\Users\SickT\Documents\Codex\2026-08-16\change-aurora-execution-to-pragmatic-delivery\outputs\w4-p3\` were inspected once at Compact 800x600, Standard 1600x900, and Display 2560x1440.
- One bounded implementation review plus one fix/rereview cycle ended Ready with no Critical or Important issue open. No schema, registry, profile threshold, capacity, allocation, migration, stored-data, permission, privacy, production-network, Aurora V1, or Store contract changed.

- W4-P2 focused pure/component/source development gates passed: final combined set 3 files / 15 tests plus the final source guard 1 file / 4 tests; TypeScript exited 0.
- Final `npm test` after implementation stabilized - exit 0; 131 files / 2,218 tests passed. Final `npx tsc --noEmit` also exited 0.
- Final `npm run build` and `npm run build:preview` - exit 0; both transformed 185 modules. The production bridge scan returned the expected no-match result with no forbidden preview symbol output.
- Focused `node scripts/preview-w4-p2.mjs` - exit 0 with `PASS: W4-P2 Aurora Briefing semantics`; Compact/Standard/Display expose exact 1/2/3-signal text, one visible sentence, current local cache use, existing Greeting ownership, no clipping, no Briefing network request, restored teardown, and `runtimeErrors: []`. The final actual-failure replay also proves Greeting/Briefing containment at 600x800 and 320x800.
- The full browser harness first run reached 455 PASS / 2 FAIL / 3 SKIP. Both failures belonged to one Compact Greeting paint-containment family introduced by the new wrapper. After the causal selector fix, the single permitted rerun reached 456 PASS / 1 FAIL / 3 SKIP and exposed the same family at the adjacent 600px edge. The final bounded typography correction passed the focused 600x800 and 320x800 replay; the full harness was not run a third time, per pragmatic-delivery policy.
- Required captures under `C:\Users\SickT\Documents\Codex\2026-08-16\change-aurora-execution-to-pragmatic-delivery\outputs\w4-p2\` were inspected. The corrected 600x800 and 320x800 Compact captures were also inspected after the causal fix.
- One bounded implementation review plus its related fix/rereview cycle found and corrected the Display summary's second CSS truncation and Compact Greeting selector regression. No Critical or Important issue remains open. Minor/cosmetic observations did not reopen the packet.
- No schema, registry, profile threshold, capacity, allocation, migration, stored-data, permission, privacy, production-network, Aurora V1, or Store contract changed.

- W4-P1 focused development gates passed after RED: final focused set 6 files / 46 tests, the accessibility fix set 4 files / 37 tests, and TypeScript exited 0.
- Final `npm test` after implementation stabilized - exit 0; 129 files / 2,206 tests passed. `npx tsc --noEmit` also exited 0.
- Final `npm run build` and `npm run build:preview` - exit 0; both transformed 183 modules. The production bridge scan returned the expected no-match result with no forbidden preview symbol output.
- Focused `node scripts/preview-w4-p1.mjs` - exit 0 with `PASS: W4-P1 Day and Now zone semantics`; Compact/Standard/Display preserve the exact Clock/Greeting/Search/Focus order, every BoardItem is singly represented without percentage positioning, sparse/populated Day ownership is correct, expanded date detail is visible only where intended, targets are operable, page clipping is absent, teardown restored state, and `runtimeErrors: []`.
- The final full harness first run reached 453 PASS / 4 FAIL / 3 SKIP. All four failures were one selector family reading the new secondary date through the Clock block's aggregate `textContent`; measured geometry was already non-overlapping. Three probes were corrected to target the established Clock `<time>`, and the single permitted rerun exited 0 at exactly 457 PASS / 0 FAIL / 3 SKIP.
- Captures under `C:\Users\SickT\Documents\Codex\2026-08-16\change-aurora-execution-to-pragmatic-delivery\outputs\w4-p1\`: `w4-p1-compact-sparse-800x600.png`, `w4-p1-standard-populated-1600x900.png`, and `w4-p1-display-populated-2560x1440.png`. All three passed original-resolution inspection.
- One implementation review found one Important issue: the visible expanded date was hidden from assistive technology. `05669b8` fixed it; the focused rereview returned Ready with 0 Critical / 0 Important open. Minor ledger only: the first focused browser assertion incorrectly assumed Compact could hold all four items inside Now despite frozen capacity; evidence now checks the exact hierarchy across Now then Dock without changing product contracts.
- No schema, registry, profile threshold, capacity, migration, stored-data, permission, privacy, Aurora V1, or Store contract changed.

- W3-P4 focused source/layout/App/Arrange/backup/migration/widget development gates passed: 10 files / 346 tests, with the final narrowed source/widget gate at 5 files / 113 tests. TypeScript exited 0.
- Final `npm test` after implementation stabilized - exit 0; 127 files / 2,197 tests passed.
- Final `npm run build` and `npm run build:preview` - exit 0; both transformed 182 modules. The production bridge scan returned expected exit 1 with no forbidden preview symbol output.
- The final full harness first run reached 456 PASS / 1 FAIL / 3 SKIP. Its sole failure sampled Cancel focus one React effect before the already-tested Settings restoration completed; no product failure was present. The focused W3-P3 family passed after the causal wait, and the single permitted full rerun exited 0 at exactly 457 PASS / 0 FAIL / 3 SKIP, including the named W3-P2 and W3-P3 aggregates.
- Focused `node scripts/preview-w3-p4.mjs` - exit 0 with `PASS: W3-P4 legacy retirement and rollback semantics`; GitHub, GitLab, and Vercel are each represented once in Compact/Standard/Display, all omit inline percentage positioning, allocation is identical with and without extreme legacy provenance, legacy data is exact, teardown restored the preimage, and `runtimeErrors: []`.
- Captures under `C:\Users\SickT\Documents\Codex\2026-08-16\change-aurora-execution-to-pragmatic-delivery\outputs\w3-p4\`: `w3-p4-compact-800x600.png`, `w3-p4-standard-1600x900.png`, and `w3-p4-display-2560x1440.png`. All three passed original-resolution inspection.
- One implementation review against only the explicit packet criteria found 0 Critical / 0 Important issues. Minor follow-up only: historical percentage-era evidence names/comments and internal content-detail tiers owned by W4; neither reopens W3-P4.
- No schema, registry, migration, stored-data, permission, privacy, Aurora V1, or Store contract changed. The optional frozen `layout.legacy` member remains exact rollback provenance but has no live rendering/editing authority.

- W3-P3 focused red/green coverage exercises reorder, move, variant, priority, spans, lock, preview, Undo, Cancel, reset-one, copy-profile, Save-only persistence, sibling-profile/legacy preservation, and pending-Save lifecycle.
- Final `npm test` after implementation stabilized - exit 0; 130 files / 2,232 tests passed. `npx tsc --noEmit` also exited 0.
- Final `npm run build` and `npm run build:preview` - exit 0; both transformed 182 modules. The production bridge scan returned expected exit 1 with no forbidden preview symbol output.
- The first full browser attempt stopped after 66 PASS / 0 FAIL on stale legacy Arrange selectors. After that actual predecessor family was updated, the single allowed rerun reached 261 PASS / 0 FAIL / 3 SKIP and passed the legacy and semantic Arrange families before stopping on an unrelated W2-P1 Weather fixture that swallowed its offline-convergence timeout. The fixture now waits causally; no third full run was made.
- Focused `node scripts/preview-w3-p3.mjs` - exit 0 with `PASS: W3-P3 semantic Arrange/profile editor semantics`, three captures, exact draft-only/Cancel/Save evidence, preserved Compact/Display/legacy data, bounded Compact/Display geometry, and `runtimeErrors: []`.
- Captures under `C:\Users\SickT\Documents\Codex\2026-08-16\change-aurora-execution-to-pragmatic-delivery\outputs\w3-p3\`: `w3-p3-standard-editor-1600x900.png`, `w3-p3-compact-editor-800x600.png`, and `w3-p3-display-editor-2560x1440.png`. All three passed visual inspection.
- One implementation review found two Important issues; the single fix/rereview cycle addressed both and returned Ready with 0 Critical / 0 Important open. Minor follow-up only: historical percentage-era browser result names/comments and cosmetic evidence naming can be rationalized with their owning packet and do not reopen W3-P3.
- No schema, registry, migration, permission, privacy, Aurora V1, or Store action occurred. Percentage rendering/provenance remains only for the W3-P4 retirement gate.

- W3-P2 focused red/green tests covered the final Timer Dock boundary, Month compact labelling/rows, Quote clamping, Sun compact content, Vercel finite geometry, and exact full-composition regressions.
- Final `npm test` after implementation stabilized - exit 0; 129 files / 2,254 tests passed.
- Final `npm run build` and `npm run build:preview` - exit 0; both transformed 186 modules. The production bridge scan returned the expected exact `rg` exit 1 with no forbidden preview symbol output.
- The 234-profile Dock calibration completed successfully. One canonical final browser run identified three genuine geometry/timing families; their bounded fixes were followed by the single permitted full rerun.
- Final `node scripts/preview.mjs` rerun - harness process exit 0; exactly 456 `PASS:` / 0 `FAIL:` / 3 `SKIP:`, including `PASS: W3-P2 profile engine, registry, BoardItem, and semantic grid semantics`. Cleanup restored page, viewport, storage, and locks; captured page/console errors are empty.
- Fresh durable captures are under `C:\Users\SickT\Documents\Codex\2026-08-14\continue-aurora-2-continuously-through-all\outputs\w3-p2\`: `w3-p2-compact-800x600.png`, `w3-p2-compact-320x800-keyboard.png`, `w3-p2-standard-1600x900.png`, `w3-p2-display-2560x1440.png`, `w3-p2-ultrawide-3440x1440.png`, and `w3-p2-compact-dense-dock.png`. All six passed original-resolution inspection.
- One bounded implementation review and one fix/rereview cycle ended Ready with 0 Critical and 0 Important findings open. Minor follow-up only: rationalize stale pre-Adaptive-Stage evidence naming/explanatory comments and cosmetic edge cases when their owning packet is scheduled; they do not fail a W3-P2 acceptance criterion.
- The temporary multi-entry legacy Arrange bridge remains deliberately present for W3-P3 and is not a W3-P2 defect. The three SKIPs remain the existing live Home Assistant/user-instance and native NASA permission ceilings. Native zoom, mixed-DPI, and real screen-reader evidence remain W6-P2/manual. No Store or Aurora V1 action occurred.

- W3-P1 literal targeted gate at `925438f` - exit 0; 11 files / 590 tests passed.
- `npx tsc --noEmit` at `925438f` - exit 0.
- `npm test` at `925438f` - exit 0; 120 files / 2,085 tests passed.
- `npm run build` and `npm run build:preview` at `925438f` - exit 0; both transformed 180 modules.
- Production scan for `__auroraStorageHarness`, `__auroraPermissionsHarnessApi`, `__auroraBackupHarness`, and `__auroraRestoreHarness` - expected exit 1; no forbidden preview bridge matched in `dist`.
- `npm audit --omit=dev` and `npm audit --include=dev` - exit 0; zero vulnerabilities.
- Fresh controller-owned foreground `node scripts/preview.mjs` at exact `925438f` - process exit 0; exactly 455 PASS / 0 FAIL / 3 SKIP, exactly one `PASS: W3-P1 layout v2 migration and compatibility semantics`, and zero named FAIL.
- W3 evidence reports exact deterministic migration into all four profiles, unknown-ID removal, unchanged representative percentage-render centers, current-V2 backup prepared and committed with exact layout/version, complete preimage restoration, disposable page closure, shared-lock crossing, and `errors: []`.
- The bounded whole-packet review returned Ready. Three later independent gate-fix reviews addressed full-suite timing, old v9/current v10 harness fixture separation, V2 Arrange fixtures, and bounded backup preparation timing without weakening product assertions; the final rereview found 0 new Critical / 0 new Important issues.
- W3-P1 adds no intended visual change or packet-specific screenshot. `newtab.png` and `rails-1280.png` were inspected at original resolution after the final run; board/rail geometry remained intact. The generated tracked Notes screenshot was restored to HEAD.
- The three harness SKIPs remain the existing live Home Assistant/user-instance and native NASA permission ceilings. Native zoom, mixed-DPI, and real screen-reader evidence remain W6-P2/manual. No Store, release, manifest-version, W3-P2, or V1 action occurred.

- W2-P3 literal plan-focused gate at `64675d2` - exit 0; 21 files / 475 tests passed. The reviewed plan command contains 21 literal paths.
- `npx tsc --noEmit` at `64675d2` - exit 0.
- `npm test` at `64675d2` - exit 0; 119 files / 1,998 tests passed.
- `npm run build` and `npm run build:preview` at `64675d2` - exit 0; both transformed 179 modules.
- Production scan for `__auroraStorageHarness`, `__auroraPermissionsHarnessApi`, `__auroraBackupHarness`, and `__auroraRestoreHarness` - expected exit 1; no forbidden preview bridge matched in `dist`.
- `npm audit --omit=dev` and `npm audit --include=dev` - exit 0; zero vulnerabilities.
- Fresh clean-isolated foreground `node scripts/preview.mjs` at exact `64675d2` - process exit 0; exactly 454 PASS / 0 FAIL / 3 SKIP, exactly one `PASS: W2-P3 settings and tool reflow semantics`, zero named FAIL, exact 15 captures, and evidence errors `[]`.
- All fifteen W2-P3 captures were inspected at original resolution. Narrow Settings, Notes recovery, Tasks/Todo, Timer, picker, Palette, Location, and Folder states are contained and legible; corrected Location active option is visible/topmost inside its single scrollport; ordinary Settings is exactly 896,0-1280,720 and large Tasks exactly 2160,894-2544,1378.
- Initial whole review found 0 Critical / 3 Important gaps: the General Remove endpoint was focused but offscreen, the Location composite was occluded, and the 320x180 evidence matrix was incomplete. Separate RED-first fixes plus a final causal Location resize/active-descendant race fix ended with the same reviewer `Ready`, I1-I3 Addressed, and 0 new Critical / 0 new Important.
- The user's exploratory global `--canvas-fg-muted` white override was discarded with approval because it affected unrelated muted UI and broke a Focus appearance contract. W5-P4 now owns a targeted Focus-prompt contrast treatment over arbitrary photo backgrounds with representative contrast/screenshot evidence.
- Native Chrome 400% zoom, Windows scaling/mixed-DPI moves, and real screen-reader behavior remain explicit W6-P2/manual ceilings. No Store, release, manifest-version, or V1 action occurred.

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
- Tracked release files now include `release/RELEASE-DOSSIER-2.0.0.md`, `release/RELEASE-NOTES-2.0.0.md`, `release/LAUNCH-CHECKLIST.md`, the historical `release/RESUBMISSION-NOTES.md`, and `release/store-listing.md`.
- Local 2.0 candidate: ignored `release/aurora-2.0.0.zip`, 60,443,024 bytes, 59 entries, SHA-256 `31930FEC4A288992EC74FD3173F08FE444D132A00FA7EF51C0900B629F356116`.
- Current ignored Store evidence: five exact 1280x800 PNGs in `release/store-shots/`, generated from non-personal fixtures and inspected separately at original resolution.
- Historical local release inventory still includes ZIPs 1.2.0, 1.2.1, and 1.3.0 through 1.14.0 plus the replaced v1.2-era screenshot set in history.
- Live Chrome Web Store item: Aurora `1.2.1`, item ID `akjalbmacojpmebkgohhcaaiacicpgkh`, `Published - public`; signed-in dashboard values were transcribed read-only on 2026-08-17.
- No Store dashboard field, listing, package, draft, submission, publication, or rollout state has been changed.

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
- Store-side upload and dashboard changes require contemporaneous W6-P5 owner approval; the current signed-in session does not itself grant that authority.
- Mixed-DPI monitor moves and real Home Assistant hardware/service behavior require later environment/user evidence.
- The indirect development-only nanoid advisory is resolved by the exact `3.3.18` override; production and full audits are clean and no production dependency changed.
- A native hidden-to-visible browser transition is unavailable in the current headless harness; W1-P6 records modeled built-extension convergence plus exact fake-time listener coverage without overstating that boundary.
- Genuine operating-system timezone changes and machine sleep/wake cannot be induced by the deterministic extension harness; W1-P7 proves their production event paths and clock discontinuities with exact unit/component coverage and retains the real-environment checks as manual gates.
- Browser beforeunload is intentionally best-effort: W1-P8 starts the authority flush and warns only while dirty, but cannot promise an async write finishes after a user explicitly confirms navigation.

## Files intentionally dirty

- None expected after `docs: checkpoint W6-P4`.

## Continuous remaining-work protocol

- **Packet:** `W6-P5` - Explicit Store approval gate
- **Plan:** Create only after contemporaneous explicit approval names the authorized Store action.
- **State:** Canvas-P1 through Canvas-P8 and W6-P3/W6-P4 are verified. The exact local package, screenshots, copy, checklist, and dossier are staged. Do not mutate Store state without W6-P5 approval.
- After each packet's dedicated checkpoint, push, local/upstream equality proof, and clean target/protected-original proof, proceed directly to the next Not started `ROADMAP.md` packet without a new chat handoff or continuation prompt.
- Before each just-in-time plan, re-read the master specification, `STATUS.md`, `ROADMAP.md`, and `DECISIONS.md`, and revalidate repository provenance and cleanliness.
- Keep one written packet envelope, one review/fix round, one focused verification set, and one checkpoint per packet. Do not combine packets or skip their gates.
- Pause only for a genuine blocker, a material decision requiring new authority, either written owner visual gate, an explicit handoff request, or the W6-P5 Store approval boundary. W6-P5 must stop before any upload, submission, publication, rollout, or live-listing change unless contemporaneous explicit approval is received.
- Historical packet plans remain evidence; their previous handoff wording does not override the newer continuous-run protocol.

## Single continuous-run seed

```text
Worktree: D:\DEV\Chrome plugin-aurora-2
Branch: feat/aurora-2-observatory
Starting packet: W6-P5
Verified release checkpoint: W6-P4
Expected next checkpoint subject: create only after explicit W6-P5 authority
Execution: remain stopped at the Store boundary until the owner explicitly names the authorized external action.
Hard stop: no Chrome Web Store upload, edit/save, submission, publication, distribution, or rollout without contemporaneous explicit approval.
```
