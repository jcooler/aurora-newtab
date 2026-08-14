# Aurora 2 Decision Log

ADR-lite entries record settled implementation direction without replaying conversation history. A later decision may supersede an entry, but must name it and explain migration/release consequences.

## A2-D001 — Isolate Aurora 2 from the approved V1 checkout

- **Date:** 2026-08-13
- **Decision:** Develop on `feat/aurora-2-observatory` in `D:\DEV\Chrome plugin-aurora-2`, linked from the `eb1354b` base. Keep `D:\DEV\Chrome plugin` on clean `main` and preserve its local V1 packages.
- **Reason:** Aurora 2 is a major multi-packet release; isolation protects approved V1 source/artifacts and any future user work.
- **Rejected:** Working directly on `main`; creating an unignored project-local `.worktrees/` directory; replacing the staged V1 ZIP.
- **Consequence:** Every handoff names the literal worktree/branch. No push to `main`, Store change, or V1 artifact replacement is implied.

## A2-D002 — Use semantic profiles and zones, never canvas scaling

- **Date:** 2026-08-13
- **Decision:** Implement Compact, Standard, Display, and Ultrawide profiles over Day, Now, Work Pulse, and Signal Dock zones, selected from CSS viewport width/height/aspect ratio. Density is a bounded token/variant choice, separate from profile selection.
- **Reason:** The current percentage-position/fixed-pixel-size model spreads content without increasing hierarchy or detail.
- **Rejected:** Root transform/zoom; one canonical bitmap canvas; more exact height tiers; freeform percentages as the V2 source of truth.
- **Consequence:** Legacy x/y data is migrated and preserved, while new UI uses semantic grid placements and container queries.

## A2-D003 — Store overrides over versioned product defaults

- **Date:** 2026-08-13
- **Decision:** Keep profile defaults in source and persist only user overrides plus a legacy copy. Do not freeze every release default into every user's storage.
- **Reason:** Product defaults can improve across releases without erasing user intent.
- **Rejected:** Full per-user copies of all defaults; destructive one-time replacement of legacy layout.
- **Consequence:** Migration, backup, reset-one-profile, and copy-profile behavior must distinguish defaults, overrides, drafts, and legacy data.

## A2-D004 — Every enabled connector has one active representation

- **Date:** 2026-08-13
- **Decision:** An enabled connector is either placed on the board or represented in the Signal Dock in every active profile. Automatic items reduce variant before docking; Dock priority is explicit; Pinned items remain in their zone after deterministic collision resolution.
- **Reason:** Height-based disappearance is a correctness failure, not a density feature.
- **Rejected:** Silent whole-widget hiding; “newest connector loses”; scroll-only off-canvas placement.
- **Consequence:** Profile and QA tests count configured connectors against board-plus-Dock representations.

## A2-D005 — Utility Tray changes modality with available space

- **Date:** 2026-08-13
- **Decision:** Desktop Tray is modeless/anchored and does not trap focus; narrow Tray may become a true modal bottom sheet with backdrop, inert background, focus trap, Escape, and restoration.
- **Reason:** Desktop tools should remain glanceable beside the dashboard, while narrow screens need one safe focused surface.
- **Rejected:** Always-modal desktop drawer; always-modeless narrow overflow; multiple expanded tools.
- **Consequence:** Responsive mode is behaviorally tested, not just styled. Running timer state remains visible when details close.

## A2-D006 — Aurora Briefing is deterministic and local

- **Date:** 2026-08-13
- **Decision:** Build the Briefing from data Aurora already holds using deterministic priority, freshness, and truncation rules.
- **Reason:** A three-second glance line is the signature product element; an LLM would add privacy, latency, cost, availability, and disclosure burdens without necessity.
- **Rejected:** Remote LLM, new Aurora backend, generated prose from raw external payloads.
- **Consequence:** Briefing has pure-function tests, makes no network request, and suppresses stale/unsafe claims.

## A2-D007 — Keep local plaintext credentials with explicit risk disclosure

- **Date:** 2026-08-13
- **Decision:** Aurora 2 retains connector credentials in `chrome.storage.local` for convenience and describes them as local plaintext protected by the Chrome/OS profile—not encrypted or vault-grade. Capability URLs are secrets. Shared/untrusted profile guidance is mandatory.
- **Reason:** A shipped extension cannot safely hide an embedded encryption key; session/passphrase modes require a separate usability, recovery, and threat-model design.
- **Rejected:** Claiming encryption; cosmetic obfuscation; silently expanding 2.0 with an unplanned passphrase system.
- **Consequence:** Privacy, Settings, backup/export, logs, Store copy, and support guidance use the same honest posture. Session-only/passphrase behavior is outside 2.0 unless separately approved.

## A2-D008 — Scope snapshots with a cryptographic config/account fingerprint

- **Date:** 2026-08-13
- **Decision:** A connector snapshot stores connector ID plus a SHA-256 fingerprint of stable canonical fetch-relevant configuration. Successful token connections also stamp a new non-secret lifecycle epoch so an identical reconnect has a new scope. Raw tokens and capability URLs never appear in the stored scope string. Legacy unscoped snapshots are ignored as cache and need no schema migration.
- **Reason:** Config/account identity must change cache usability immediately and safely, including RSS/ICS URLs whose full values can be credentials.
- **Rejected:** Connector ID alone; raw config in cache keys; username-only identity; manual invalidation at a growing list of settings call sites.
- **Consequence:** The first Wave 1 packet updates the shared hook and all connector call sites, adds commit-time generation invalidation plus generation/TTL/visibility behavior, preserves the epoch through ordinary Home Assistant config edits, and tests stale completion order. A rejected hook refresh may keep only matching stale data; existing Status/Home Assistant anti-staleness sentinels remain authoritative.
- **Verification:** Implemented through `cd511f06c3758ce9b237f6a493087376e34886f8`. The bounded review found one queued-update race; W1-P1 added an updater-time generation guard and a red/green blocked-queue regression. Final evidence is 12 targeted files / 409 tests, 97 total files / 1,531 tests, clean TypeScript, and a clean production build, with no review findings left open.

## A2-D009 — Prefer a global Web Lock as the cross-context write authority

- **Date:** 2026-08-13
- **Decision:** The storage-integrity packet first verifies and uses a global Web Lock around Aurora storage mutations and restore transactions. If MV3 extension-page verification fails, stop and checkpoint before adopting a background service-worker authority.
- **Reason:** Current per-context promise chains cannot prevent lost updates. A global lock preserves the existing updater API and allows multi-key restore coordination without inventing fake compare-and-set semantics over `chrome.storage.local`.
- **Rejected:** Context-local queues; unproven revision retries without atomic CAS; granular keys alone; silently falling back to last-write-wins.
- **Consequence:** The packet includes two simulated contexts and real extension-page evidence. Platform failure materially changes architecture and therefore triggers a decision checkpoint.
- **Verification:** Implemented through `fac883ba4cccf6f567a8460188a84902d219730c`; the service-worker fallback was not taken. Timing-free simulated tests prove the unlocked lost-update control and the shared-authority success path. Two exact-path MV3 extension pages both exposed Web Locks and retained all 50 concurrent mutations. Final evidence is 7 targeted files / 312 tests, 98 total files / 1,544 tests, clean TypeScript, clean 165-module production/preview builds, no production harness bridge, and a 412 PASS / 0 FAIL / 3 SKIP real-extension run. The bounded implementation rereview found no Critical, Important, or packet-local Minor findings.

## A2-D010 — Correct behavior before final Store prose

- **Date:** 2026-08-13
- **Decision:** Wave 1 creates a code-backed data classification and fixes misleading source copy, but Wave 6 performs current official-policy verification, live dashboard reconciliation, final listing/Data Usage copy, screenshots, and submission checklist.
- **Reason:** Disclosures must describe the final network, storage, permission, and backup behavior; the repository cannot reveal the live Store version or dashboard answers.
- **Rejected:** Guessing the live version; relying on remembered policy text; changing the live listing during development.
- **Consequence:** Live Store version stays “user/dashboard verification required,” V1 stays live, and external mutations remain explicit approval gates.

## A2-D011 — Treat the repeatable permission harness failure as open baseline evidence

- **Date:** 2026-08-13
- **Decision:** Record both 408 PASS / 1 FAIL / 3 SKIP runs and route `remove revokes live` to W1-P3 instead of patching it inside Wave 0.
- **Reason:** The failure repeated identically, but Wave 0 is documentation/isolation/baseline only and the defect belongs to the accepted permission-lifecycle subsystem.
- **Rejected:** Calling the run green because the probe was historically flaky; expanding Wave 0 into permission implementation.
- **Consequence:** W1-P3 cannot be Verified until the real-browser probe passes or the user approves an evidence-backed disposition.
- **W1-P3 resolution:** The old row/dot probe now passes and is renamed to state exactly what it proves: live Status storage/UI removal. It never seeded a held native permission, so it cannot prove native revocation. A separate preview-adapter matrix drives production transaction code and proves adapter-held rollback, shared/final ownership, revoke failure/retry, and final removal. Revoking an actually held native Chrome host grant remains unautomated headlessly and is not claimed fixed. Final harness evidence is 424 PASS / 0 FAIL / 3 SKIP.

## A2-D012 - Coordinate optional-permission ownership with a startup mirror and one lifecycle lock

- **Date:** 2026-08-14
- **Decision:** Initialize a page-lifetime permission mirror before React by subscribing to `onAdded`/`onRemoved` before one `getAll` seed. A user gesture synchronously snapshots held origins, queues `aurora:origin-permission-lifecycle:v1`, and requests only snapshot-absent patterns before the first await. The same lock covers validation/persistence, every owner-changing write, fresh global owner reads, rollback, remove verification, and retry. Connector descriptors plus APOD form the extensible owner registry; configured disabled connectors remain owners while incomplete configs do not. Revoke failure persists in one Settings-level accessible Retry surface.
- **Reason:** Per-click asynchronous classification can lose the Chrome user gesture, blanket rollback can remove pre-existing grants, and connector-local release checks cannot safely handle same-host, cross-connector, APOD, or cross-context ownership.
- **Rejected:** Awaiting `getAll`/storage/the lock before request; requesting already-held patterns; fixed-delay `onAdded` classification; connector-local `releasableOrigins`; swallowed remove failures; a context-local production lock fallback; body-local retry state that unmounts with the connector.
- **Consequence:** W1-P4 restore must use the same lifecycle authority and ownership registry when it later changes owners. Preview automation may inject only the six-surface permission adapter before mirror initialization; production builds exclude its exact global name. Adapter-held evidence is never described as a native Chrome grant.
- **Verification:** Implemented through `a8d62367db97ba42b2b70047b7d0414df6019a90`. Final evidence is 18 targeted files / 631 tests, 103 total files / 1,631 tests, clean TypeScript, clean 170-module production/preview builds, no production adapter-name match, and a 424 PASS / 0 FAIL / 3 SKIP real-extension run. The bounded whole-packet rereview found no Critical, Important, or packet-local correctness issue open.

## A2-D013 - Make backup restore secret-safe, gesture-safe, and atomically recoverable

- **Date:** 2026-08-14
- **Decision:** Export strips registered token fields, every RSS feed URL, legacy and multi-calendar ICS URLs, connector snapshots, and APOD cache; it records only trusted connector IDs that need re-entry plus fixed guidance. Import fully parses, migrates, cleans, validates, reconciles metadata, and derives restored origins before Confirm. Confirm enters the existing origin lifecycle transaction synchronously, then performs one authority-held all-key storage replacement with target and rollback readback verification. Irreversible old-owner permission cleanup runs only after storage commits, while the lifecycle lock remains held. Cleanup failure commits data and becomes durable Settings Retry; it never reopens storage rollback.
- **Reason:** Capability URLs are credentials, a backup file cannot grant Chrome permissions, and storage exactness alone is insufficient if rollback or cleanup can lose a pre-existing grant. Gesture timing, storage atomicity, and permission ownership must compose under one explicit lock order.
- **Rejected:** Exporting RSS/ICS URLs; connector-ID switches in backup code; requesting permissions after an awaited preparation step; direct `setMany` restore; best-effort rollback without readback; revoking old owners inside a rollback-participating finalizer; claiming adapter-held patterns are native grants; swallowing cleanup failure.
- **Consequence:** Lock order is origin lifecycle then storage authority. Exact backup/rollback state is logical current `AuroraData`; unknown driver keys and the schema-version key remain outside the backup boundary. Legacy metadata-free token shapes may receive trusted exact reconnect labels, while ambiguous legacy Calendar shapes receive only generic guidance. Preview automation uses the existing permission adapter and real Data controls, then destroys the old document and performs a named-lock all-key final restore so late connector-cache writes cannot contaminate downstream tests. Native Chrome Allow/Block and a live Home Assistant picker remain explicit headed ceilings.
- **Verification:** Implemented through `6f30b915719586cb519aa0f8f2b4418b0724debe`. Final evidence is 15 targeted files / 600 tests, 104 total files / 1,694 tests, clean TypeScript, clean 171-module production/preview builds, no production preview-symbol match, and a controller-owned 432 PASS / 0 FAIL / 3 SKIP real-extension run. The bounded whole-packet review fix `d28d6f5` preserved old grants across rollback-triggering failure; controller verification fix `6f30b91` quiesced late connector writes during teardown. Final scoped reviews found no Critical, Important, or packet-local correctness issue open.
