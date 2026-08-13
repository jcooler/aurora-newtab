# Aurora 2 Status

**Updated:** 2026-08-13<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Worktree:** `D:\DEV\Chrome plugin-aurora-2`<br>
**Current wave:** Wave 1 — Trust and correctness foundation<br>
**Last verified packet:** `W1-P1` — Connector snapshot identity and freshness<br>
**Next packet:** `W1-P2` — Cross-context storage authority; plan not yet created

## Packet envelope

- **Acceptance:** Scope every connector cache to hashed config/account identity; rotate identical token reconnects; suppress stale data on the config-changing render; prevent prior generations from writing; recheck TTL on timers/visibility/focus without overlap; retain only matching stale data after rejected hook refreshes; preserve connector-specific anti-staleness sentinels.
- **Expected files:** Snapshot identity/type modules and tests; shared snapshot hook and tests; all nine connector widget call sites/tests; token-connect and Home Assistant settings writes/tests. The storage authority, permission lifecycle, HA data minimization/actions, layout, CSS, manifest, and Store copy remain outside this packet.
- **Test scope:** Pure identity, hook lifecycle/generation/fake timers, RSS preserved-mount mutation, HA stale ordering and epoch preservation, all connector widget tests, full TypeScript/Vitest/build.
- **Visual scope:** None expected. Stop and route any unplanned visible change instead of absorbing it.

## Last completed commits

- `eb1354b6a5b041fb6d494655c3dae1862572bc51` — audited V1.14.0 base (`test(ha): the drawer sits for its portrait`).
- `0ae676905fd54d3acf3aaf2cdcb79d13e4b47f7e` — reviewed master specification and executable W1-P1 plan (`docs: establish Aurora 2 observatory program`).
- `87a8aa93dfd5544322daf855d10e780f64d1e882` — isolated Wave 0 ledger checkpoint (`docs: checkpoint A2-W0`).
- `b2256f2a13f00e0e987593fdd9b83b839f401394` — scoped connector snapshot identity (`feat(connectors): scope snapshot identity`).
- `0e93944116281cf95fe6b444398f7aa30730353d` — generation-safe lifecycle, nine call sites, and reconnect epochs (`fix(connectors): refresh scoped snapshots safely`).
- `cd511f06c3758ce9b237f6a493087376e34886f8` — bounded-review fix for queued stale-owner writes (`fix(connectors): guard queued snapshot writes`).

## Latest verification

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

- The permission-removal browser probe fails reproducibly; routed to `W1-P3`, not dismissed as a flake.
- Three headed/user-instance checks remain unavailable in baseline automation.
- Live Store version/dashboard answers require user/dashboard access in Wave 6.
- Mixed-DPI monitor moves and real Home Assistant hardware/service behavior require later environment/user evidence.
- The indirect development-only nanoid advisory remains open for the scoped hygiene packet; production dependency audit is clean.
- Cross-context read/modify/write remains last-write-wins until W1-P2 establishes and verifies one mutation authority; W1-P1 intentionally did not enter that subsystem.

## Files intentionally dirty

- None expected after `docs: checkpoint W1-P1`. If `git status --short` is non-empty at continuation, stop and reconcile before planning W1-P2.

## Single next packet

- **Packet:** `W1-P2` — Cross-context storage authority
- **Plan:** Not yet created; create it just in time from the master specification, verified W1-P1 evidence, A2-D009, and the current storage implementation.
- **State:** Not started. The next fresh task should write and independently review the executable W1-P2 plan before any W1-P2 implementation; this W1-P1 task stops at the packet boundary.

## Continuation seed

```text
Worktree: D:\DEV\Chrome plugin-aurora-2
Branch: feat/aurora-2-observatory
Next plan: create just-in-time W1-P2 cross-context storage authority plan
Packet ID: W1-P2
Verified W1-P1 implementation SHA: cd511f06c3758ce9b237f6a493087376e34886f8
Expected next checkpoint subject: docs: checkpoint W1-P2
```
