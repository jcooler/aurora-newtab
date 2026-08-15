# W1-P9 Privacy Classification and Secret-Handling Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Aurora's stored, transmitted, browser-mediated, secret, permission, and backup boundaries exhaustive in code; correct unsafe Quick Link scheme handling and misleading privacy source copy; disclose local plaintext credential risk; and remove the one indirect development-only `nanoid` advisory without a broad dependency upgrade.

**Architecture:** Add one pure typed privacy inventory whose `Record<DataKey, ...>` and `Record<ConnectorId, ...>` shapes fail TypeScript when storage or connector coverage drifts. Reuse inventory-owned copy in the production manifest and Connectors settings surface, while leaving final Chrome Web Store policy/dashboard reconciliation to Wave 6. Harden the existing Quick Link normalizer at its input boundary and pin only the vulnerable indirect `nanoid` package to the first safe patch.

**Tech Stack:** TypeScript 5.9 strict, React 19, Chrome Manifest V3, connector registry/backup contracts from W1-P3/W1-P4, Vitest 3, Testing Library, npm lockfile overrides, Playwright built-extension regression harness.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 1, 2, 10, 11, 13, 14, 15, and 16; `docs/superpowers/aurora-2/ROADMAP.md` W1-P9; A2-D007, A2-D008, A2-D010, A2-D012, A2-D013, A2-D014, A2-D015, and A2-D017 in `docs/superpowers/aurora-2/DECISIONS.md`; verified W1-P3 through W1-P8 plans/checkpoints; current manifest, storage schema, connector registry/services, backup code, Quick Link normalizer, `PRIVACY.md`, `README.md`, `release/store-listing.md`, and npm dependency graph at checkpoint `3452bec0b73b6d4c2bc1a1a08da606b19277b3da`.

## Global Constraints

- Execute only W1-P9. Stop before W2-P1. Do not create shared Wave 2 async/freshness primitives, change Adaptive Stage/layout, redesign Settings, bump Aurora's version, package a release, refresh Store screenshots, or perform any Chrome Web Store/dashboard mutation.
- Preserve `D:\DEV\Chrome plugin` and every V1 artifact. Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory` from checkpoint `3452bec0b73b6d4c2bc1a1a08da606b19277b3da`; verified W1-P8 implementation is `5c570f7087d8d6e41b73db9e271339c75c93f62c`.
- W1-P9 corrects repository source truth only. The live Store version/dashboard remain `user/dashboard verification required`; current official Chrome/Google policy verification and final Limited Use/Data Usage wording remain W6-P3 work.
- Aurora has no Aurora account, backend, analytics, telemetry, or developer data receiver. It may connect to user-selected third-party cloud/self-hosted accounts and sends requested data directly to those providers only for the requested feature.
- Connector credentials remain plaintext in `chrome.storage.local`, protected by the Chrome/OS profile, not encrypted, obfuscated, or vault-grade. The product and source copy must advise disconnecting connectors or clearing extension data on shared/untrusted profiles. Do not add an encryption key, passphrase/session mode, credential migration, or new storage location.
- Authentication secrets are GitHub/GitLab/Vercel/Home Assistant tokens and Jira's API token. RSS feed URLs and legacy/multi-calendar ICS URLs are capability secrets even though their descriptors use `auth: 'none'`; their W1-P4 export redaction/re-entry behavior remains authoritative. Public Status URLs, GitLab instance URL, Jira site, Home Assistant instance URL, usernames/display names, and Crypto coin IDs are not credentials.
- Raw credentials, RSS/ICS capability URLs, connector response payloads, and backup secrets may not enter logs, manifest copy, snapshot scope strings, backup output, re-entry UI, or controller evidence. Existing opaque SHA-256 snapshot scopes and W1-P4 redaction contracts must not change.
- Quick Links accept only HTTP(S), reject every explicit non-HTTP(S) URI scheme (including forms without `//`), reject embedded URL username/password credentials, retain bare-domain/localhost normalization, and make no layout/navigation-target change. One pure policy guards new input, backup import, and the final rendered-anchor boundary so legacy/hand-edited storage cannot bypass it.
- No production dependency is added or upgraded. The only authorized dependency resolution is an exact `overrides.nanoid = "3.3.18"` plus the corresponding lockfile/node_modules update, and only if the resulting diff changes no unrelated dependency version. `npm audit --omit=dev` must remain zero; full `npm audit` must move from the witnessed one high indirect dev advisory to zero.
- Human-facing prose does not get source-text unit tests. Validate it against the code-backed inventory and current source behavior, then inspect diffs/search results. Tests must exercise inventory coverage, manifest output, rendered Settings behavior, Quick Link normalization, and backup behavior.
- Every production behavior begins with a witnessed failing test. Final closeout runs targeted/full Vitest, TypeScript, production/preview builds, built-manifest inspection, production preview-symbol search, production and full dependency audits, exact `nanoid` tree inspection, the full real-extension regression harness, bounded independent review/fix/rereview, a dedicated `docs: checkpoint W1-P9` commit, push, clean-state proof, and then stops before W2-P1.

---

### Task 0: Independently review and commit the executable plan

**Files:**

- Review/fix: `docs/superpowers/plans/2026-08-14-w1-p9-privacy-classification-secret-handling.md`

**Interfaces:**

- Produces: one immutable `W1_P9_PLAN_BASE` SHA for all implementation and review ranges.

- [ ] **Step 1: Request the bounded independent plan review**

Dispatch a fresh read-only reviewer against this plan, the complete master specification, ROADMAP W1-P9, A2-D007/A2-D008/A2-D010/A2-D012 through A2-D017, W1-P3 through W1-P8 checkpoint evidence, and the current storage schema/defaults, connector descriptors/services, backup/export/import, permission ownership, manifest, Quick Link input/rendering, Settings copy/tests, `README.md`, `PRIVACY.md`, `release/store-listing.md`, package graph/audit, and preview harness. Require Critical/Important/Minor findings with exact plan/code references and inspect specifically:

1. exhaustive classification of all `AuroraData` keys, IndexedDB upload storage, fixed service calls, browser-mediated search/bookmark/favicon/geolocation behavior, all nine connectors, Home Assistant's selected/picker/action endpoint boundaries, permissions, and backup disposition;
2. authentication versus capability-secret classification, local plaintext/shared-profile disclosure, no raw secret or full-payload logging, and consistency with W1-P1/W1-P4 opaque scope/redaction behavior;
3. unsafe Quick Link scheme and credential ambiguity without rejecting valid HTTP(S), bare domains, localhost, or ports;
4. manifest/README/privacy/listing/Data Usage source truth, explicit `No Aurora account`, direct-to-selected-provider transmission, and no live-dashboard/final-policy claim;
5. exact transitive `nanoid@3.3.18` override safety, production-audit preservation, lockfile narrowness, and no dependency/version/package/release scope creep;
6. TDD seams, built-artifact verification, full harness regression, durable checkpoint evidence, original-checkout preservation, and the W2-P1 stop boundary.

Verify every finding against source/spec evidence. Fix confirmed Critical/Important and packet-local Minor correctness gaps in this plan. Reject unsupported or out-of-scope suggestions with exact evidence.

- [ ] **Step 2: Self-review and commit the plan**

Run:

```powershell
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
git add --intent-to-add -- docs/superpowers/plans/2026-08-14-w1-p9-privacy-classification-secret-handling.md
rg -n "TB[D]|TO[D]O|implement late[r]|fill in detail[s]|similar t[o]|appropriate error handlin[g]|write tests fo[r]" docs/superpowers/plans/2026-08-14-w1-p9-privacy-classification-secret-handling.md
git diff --check
git diff -- docs/superpowers/plans/2026-08-14-w1-p9-privacy-classification-secret-handling.md
git add docs/superpowers/plans/2026-08-14-w1-p9-privacy-classification-secret-handling.md
git commit -m "docs: plan W1-P9 privacy classification"
git rev-parse HEAD
```

Expected: protected original clean at `eb1354b6a5b041fb6d494655c3dae1862572bc51`; placeholder search exit 1/no matches; diff check clean; one plan-only commit. Record its full SHA as `W1_P9_PLAN_BASE`.

---

### Task 1: Exhaustive code-backed privacy inventory and local-secret disclosure

**Files:**

- Create: `src/privacy/dataFlows.ts`
- Create: `src/privacy/dataFlows.test.ts`
- Create: `src/lib/quickLinkUrl.ts`
- Create: `src/lib/quickLinkUrl.test.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/manifest.ts`
- Modify: `src/settings/sections/Connectors.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/widgets/links/linksLogic.ts`
- Modify: `src/newtab/widgets/links/linksLogic.test.ts`
- Modify: `src/newtab/widgets/links/LinkTile.tsx`
- Modify: `src/newtab/widgets/links/LinkTile.test.tsx`

**Interfaces:**

- `type DataSensitivity = 'preferences' | 'personal-identifier' | 'user-content' | 'approximate-location' | 'authentication' | 'capability-url' | 'provider-content' | 'public-selection'`.
- `type ExportDisposition = 'included' | 'redacted' | 'excluded' | 'outside-json-backup'`.
- `type TransmissionBoundary = 'none' | 'browser-mediated' | 'provider-direct'`.
- `STORED_DATA_FLOWS` is a `satisfies Record<DataKey, StoredDataFlow>` literal covering all 16 current `AuroraData` keys. It classifies `connectors` as mixed user configuration/authentication/capability data; `connectorSnapshots`, `weatherCache`, and `apodCache` as provider caches; `location` as approximate location; locally-authored fields as preferences/personal/user content; and records each key's JSON export disposition and whether its stored value is ever transmitted.
- `OTHER_LOCAL_DATA_FLOWS` records uploaded photo blobs in IndexedDB as local-only/outside the JSON backup and the `aurora:version` schema metadata in `chrome.storage.local` as non-user, local-only, and outside the JSON backup.
- `FIXED_DATA_FLOWS` records Open-Meteo forecast, Open-Meteo geocoding, BigDataCloud reverse geocode, and NASA APOD lookup/image flows with exact trigger, sent data, received data, permission boundary, storage/cache behavior, and no Aurora backend.
- `BROWSER_DATA_FLOWS` records `chrome.search.query`, `chrome.bookmarks.getTree`, `_favicon`, ordinary link navigation, and `navigator.geolocation` distinctly; it must not call browser-mediated search/favicon/navigation an Aurora backend call or claim bookmark contents are transmitted.
- `CONNECTOR_DATA_FLOWS` is a `satisfies Record<ConnectorId, ConnectorDataFlow>` literal covering all nine IDs. Each row names third-party-account use, destination kind, transmitted/received data, GET/POST capability, authentication-secret fields, capability-secret fields, cache/export disposition, and per-origin optional permission. Home Assistant distinguishes `/api/config`, picker-only bulk `/api/states`, regular selected `/api/states/{entity_id}`, action-only health `/api/`, and click-only service POSTs.
- `MANIFEST_PRIVACY_DESCRIPTION` is exactly `A calm, local-first new-tab dashboard. No Aurora account, no tracking, no backend.` and is consumed by `src/manifest.ts`.
- `LOCAL_SECRET_STORAGE_NOTICE` is exactly `Connector credentials and RSS feed/calendar URLs are stored as local plaintext protected by this Chrome/OS profile—not encrypted or vault-grade. On a shared or untrusted profile, disconnect connectors or clear Aurora’s extension data after use.` and is rendered once below the Connectors heading, before the search field.
- `normalizeQuickLinkUrl(raw: string): string | null` and `isSafeQuickLinkUrl(raw: string): boolean` live in `src/lib/quickLinkUrl.ts`. `linksLogic.normalizeUrl` delegates/re-exports the normalizer for source compatibility, backup validation uses the predicate, and `LinkTile` refuses to render an anchor for an unsafe legacy/stored value.

- [ ] **Step 1: Write the failing inventory, manifest, Settings, and Quick Link tests**

Add tests that fail before production edits:

1. importing `dataFlows.ts` succeeds and both `Object.keys(STORED_DATA_FLOWS)` and `Object.keys(defaults())` equal the independently written literal list `settings, focus, todoLists, links, timerConfig, photoPrefs, location, weatherCache, notes, worldClocks, countdowns, layout, connectors, connectorSnapshots, habits, apodCache`; every key records `chrome.storage.local`; `OTHER_LOCAL_DATA_FLOWS` independently proves the IndexedDB upload and `aurora:version` metadata rows;
2. `CONNECTOR_DATA_FLOWS` keys equal `CONNECTOR_IDS`; every `auth: 'token'` descriptor is classified with its exact authentication field(s); RSS `feeds` and ICS `url`/`calendars` are capability secrets with redaction/re-entry, while Crypto/Status have no secret; every connector is provider-direct behind optional per-origin access;
3. the exact cache contract holds through real serialize/import paths: `connectorSnapshots` and `apodCache` are excluded, `weatherCache` is included and validated, recognized secrets redact, and locally authored data remains included; tests use the real `serializeBackup`/registry/validator behavior rather than duplicating it;
4. fixed/browser rows distinguish Aurora fetches from Chrome-mediated APIs and ordinary navigation; manifest production/preview factories both emit `MANIFEST_PRIVACY_DESCRIPTION`, preserve their existing permission split, and declare the same optional host boundary;
5. the rendered Connectors region contains `LOCAL_SECRET_STORAGE_NOTICE` once, before any credential form, while no token/capability value is interpolated into it;
6. `normalizeQuickLinkUrl`/`normalizeUrl` return `null` for `mailto:user@example.com`, `javascript:payload@example.com`, `data:text/plain,hello`, `vbscript:payload`, `chrome://settings`, `file:///private.txt`, and `https://user:password@example.com/private`; `addLink` leaves the list unchanged for each; existing `https://`, `http://`, bare domain, `localhost`, and host-with-port cases remain valid;
7. a backup containing any unsafe/userinfo Quick Link URL is rejected before mutation, while safe Quick Links still import; a `LinkTile` receiving an unsafe legacy/stored URL renders no anchor or navigable fallback, while safe/current-tab rendering is unchanged.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
npx vitest run src/privacy/dataFlows.test.ts src/lib/quickLinkUrl.test.ts src/lib/backup.test.ts src/settings/SettingsPanel.test.tsx src/newtab/widgets/links/linksLogic.test.ts src/newtab/widgets/links/LinkTile.test.tsx
```

Expected: FAIL because the inventory/copy/policy module does not exist, the manifest and Settings do not consume it, scheme-like strings without `//` can be reinterpreted as credential-bearing HTTPS URLs, backup validation accepts arbitrary string URLs, and `LinkTile` assigns stored values directly to `href`.

- [ ] **Step 3: Implement the minimal typed inventory and consumers**

Keep the inventory pure: type-only imports from the storage/connector types, no React, no `chrome.*`, no fetch, no storage reads, and no secrets or example tokens. Import only the two copy constants at runtime in manifest/Settings. Keep the Quick Link policy in the independent pure `src/lib` module so backup code never imports a new-tab component. Detect an explicit URI scheme before adding `https://`, reject any explicit scheme other than HTTP(S), parse once, require HTTP(S) plus the current hostname rule, and reject non-empty `username` or `password`. Preserve the existing returned string shape for accepted inputs. Apply the predicate in backup's real Quick Link validator and at `LinkTile`'s last render boundary; do not silently rewrite an imported URL or render a disabled-but-navigable substitute.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npx vitest run src/privacy/dataFlows.test.ts src/lib/quickLinkUrl.test.ts src/settings/SettingsPanel.test.tsx src/newtab/widgets/links/linksLogic.test.ts src/newtab/widgets/links/LinkTile.test.tsx src/lib/backup.test.ts src/services/connectors/registry.test.ts src/services/connectors/snapshotIdentity.test.ts
npx tsc --noEmit
git diff --check
git add src/privacy/dataFlows.ts src/privacy/dataFlows.test.ts src/lib/quickLinkUrl.ts src/lib/quickLinkUrl.test.ts src/lib/backup.ts src/lib/backup.test.ts src/manifest.ts src/settings/sections/Connectors.tsx src/settings/SettingsPanel.test.tsx src/newtab/widgets/links/linksLogic.ts src/newtab/widgets/links/linksLogic.test.ts src/newtab/widgets/links/LinkTile.tsx src/newtab/widgets/links/LinkTile.test.tsx
git diff --cached --check
git diff --cached
git commit -m "fix(privacy): classify data and secret boundaries"
```

---

### Task 2: Correct tracked privacy source copy and the dev-only advisory

**Files:**

- Modify: `README.md`
- Modify: `PRIVACY.md`
- Modify: `release/store-listing.md`
- Modify: `src/lib/backup.ts` only for stale explanatory comments
- Modify: `src/services/connectors/types.ts` only for stale explanatory comments
- Modify: `src/services/connectors/ics.ts` only for stale explanatory comments
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- README/privacy/listing language consistently says `No Aurora account`, distinguishes third-party accounts, states direct provider transmission, names local plaintext/shared-profile risk, and treats RSS plus Calendar addresses as capability secrets.
- `PRIVACY.md` remains the full behavior statement. Correct Home Assistant text to picker-only bulk `/api/states`, selected-entity regular polling, `/api/` action-only health, `/api/config` connect identity, and click-only service POSTs. Correct backup text so RSS/ICS capability URLs, token fields, connector snapshots, and APOD cache are excluded/redacted with re-entry guidance.
- `release/store-listing.md` remains tracked source/staging material only. Add an unmissable W1-P9 interim-source banner: no live dashboard/listing update is claimed; current official category/Limited Use reconciliation remains W6-P3. Replace known-false `No accounts exist`/authentication facts and stale Home Assistant endpoint prose, but do not invent a final dashboard state.
- `overrides.nanoid` is exactly `3.3.18`. No direct dependency is added, no root version changes, and the only transitive package version changed in the lock is `nanoid` `3.3.16` to `3.3.18` with its matching resolved URL/integrity.

- [ ] **Step 1: Record the dependency RED evidence**

```powershell
npm audit --omit=dev
npm audit --include=dev
npm explain nanoid
```

Expected: production audit 0; full audit 1 high advisory `GHSA-2v37-7h3g-55p8`, range `<3.3.18`; installed path `vite@6.4.3 -> postcss@8.5.23 -> nanoid@3.3.16`, all development-only.

- [ ] **Step 2: Correct human/source copy against the inventory**

Update the named documents and stale comments. Preserve historical release warnings and add stronger source-only/W6 gates; do not imply that a live listing, Data Usage checkbox, policy URL, screenshot, version, or package changed. Explicitly state that connector response payloads/caches stay local after direct receipt, except Home Assistant action bodies go only to the selected instance on click.

Manually reconcile every row of `STORED_DATA_FLOWS`, `FIXED_DATA_FLOWS`, `BROWSER_DATA_FLOWS`, and `CONNECTOR_DATA_FLOWS` against the prose. Correct at least these known stale statements:

- broad `No accounts` claims -> `No Aurora account`, with optional third-party accounts named;
- RSS feed lists are not exported; they are capability secrets redacted with Calendar addresses;
- credentials are local plaintext, not encrypted/vault-grade, with shared/untrusted-profile cleanup guidance;
- Home Assistant regular polling is selected-entity, not bulk; bulk `/api/states` is picker-only; action-only configurations use narrow authenticated `/api/` health;
- the base Data Usage authentication row may not say `No accounts exist`; tracked source must describe actual direct credential transmission while deferring current official form mapping/live reconciliation to W6-P3.

- [ ] **Step 3: Apply the exact advisory override and inspect narrowness**

Use `apply_patch` to add:

```json
"overrides": {
  "nanoid": "3.3.18"
}
```

Then run:

```powershell
npm install
git diff -- package.json package-lock.json
npm ls nanoid --all
npm audit --omit=dev
npm audit --include=dev
```

Expected: `nanoid@3.3.18` only; both audits report zero vulnerabilities; lock/package diff contains the root override and only the exact indirect nanoid patch metadata. If npm changes any unrelated dependency version, restore only those unrelated lock hunks with `apply_patch` and rerun, or leave the advisory documented/open rather than broadening the upgrade.

- [ ] **Step 4: Inspect copy consistency and commit**

```powershell
rg -n -i "No accounts exist|Aurora has no accounts|RSS declares no secret|RSS feed list.*included|chips poll /api/states|widget.*poll.*api/states" README.md PRIVACY.md release/store-listing.md src/lib/backup.ts src/services/connectors/types.ts src/services/connectors/ics.ts
rg -n -i "No Aurora account|local plaintext|vault-grade|shared or untrusted|capability|picker-only|selected entit|user/dashboard verification required|W6-P3" README.md PRIVACY.md release/store-listing.md
git diff --check
npx vitest run src/privacy/dataFlows.test.ts src/lib/backup.test.ts src/services/connectors/registry.test.ts src/services/connectors/homeassistant.test.ts src/newtab/widgets/links/linksLogic.test.ts
npx tsc --noEmit
git add README.md PRIVACY.md release/store-listing.md src/lib/backup.ts src/services/connectors/types.ts src/services/connectors/ics.ts package.json package-lock.json
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m "docs(privacy): align source copy and advisory"
```

Expected: first stale-copy search has no active false claim; every remaining match, if any, is an explicitly labeled historical quote with a nearby superseding warning. No version, release artifact, screenshot, dashboard, or Store file outside tracked source changes.

---

### Task 3: Bounded whole-packet review, fix round, verification, checkpoint, push, and stop

**Files:**

- Review: `W1_P9_PLAN_BASE..HEAD`
- Modify after fresh verification: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after fresh verification: `docs/superpowers/aurora-2/STATUS.md`
- Modify after fresh verification: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Produces: reviewed W1-P9 implementation commits and dedicated `docs: checkpoint W1-P9`.
- Produces: pushed `origin/feat/aurora-2-observatory`, clean target/original worktrees, and a W2-P1 continuation prompt without a W2-P1 plan.

- [ ] **Step 1: Request the bounded independent implementation review**

Dispatch a fresh read-only reviewer with plan-base SHA, implementation HEAD, this plan, master spec sections 10/11/13/14/15/16, ROADMAP W1-P9, A2-D007/A2-D008/A2-D010/A2-D012 through A2-D017, complete diff, red/green evidence, audit/tree evidence, built-manifest output, and verification output. Require exact file/line references and Critical/Important/Minor severity. Inspect the six plan-review domains plus:

- exhaustiveness/type honesty when storage/connector IDs grow, without a tautological test computing expected values from the inventory under test;
- exact distinction among local storage, IndexedDB, direct provider fetch/POST, Chrome-mediated APIs, ordinary navigation, permission grants, and backup export;
- no secret examples, raw payload logging, snapshot/export regression, copy overclaim, or accidental runtime network/storage side effect from importing the inventory;
- Quick Link parsing of explicit schemes, userinfo, bare domains, localhost/ports, whitespace/case, and current-tab behavior;
- manifest production/preview output and permission split; Settings copy reachability and no secret interpolation;
- README/privacy/listing current behavior, Home Assistant W1-P5 endpoint truth, RSS/ICS W1-P4 behavior, explicit W6/live-dashboard gates, and no policy-memory masquerading as current verification;
- exact lockfile override, no production/advisory regression, and no version/package/release/Store mutation.

- [ ] **Step 2: Verify and fix confirmed findings with TDD**

Inspect every cited finding. Reproduce confirmed code defects with the smallest failing test before production changes. Fix confirmed Critical/Important and packet-local Minor correctness findings in one bounded fix wave; correct confirmed prose/audit gaps directly. Commit fixes separately:

```powershell
git status --short
git add -- src/privacy src/lib/quickLinkUrl.ts src/lib/quickLinkUrl.test.ts src/lib/backup.ts src/lib/backup.test.ts src/manifest.ts src/settings/sections/Connectors.tsx src/settings/SettingsPanel.test.tsx src/newtab/widgets/links/linksLogic.ts src/newtab/widgets/links/linksLogic.test.ts src/newtab/widgets/links/LinkTile.tsx src/newtab/widgets/links/LinkTile.test.tsx README.md PRIVACY.md release/store-listing.md src/services/connectors/types.ts src/services/connectors/ics.ts package.json package-lock.json
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m "fix(privacy): address W1-P9 review"
```

Request one focused rereview over the fix range. No Critical/Important or packet-local correctness finding may remain. After any fix, rerun Step 3 completely.

- [ ] **Step 3: Run the complete fresh W1-P9 verification gate**

```powershell
npx vitest run src/privacy/dataFlows.test.ts src/lib/quickLinkUrl.test.ts src/newtab/widgets/links/linksLogic.test.ts src/newtab/widgets/links/LinkTile.test.tsx src/settings/SettingsPanel.test.tsx src/lib/backup.test.ts src/lib/backupRestore.test.ts src/services/connectors/registry.test.ts src/services/connectors/snapshotIdentity.test.ts src/services/connectors/homeassistant.test.ts src/services/originOwnership.test.ts src/services/permissionTransactions.test.ts
npx tsc --noEmit
npm test
npm run build
$manifest = Get-Content -Raw -LiteralPath dist/manifest.json | ConvertFrom-Json
if ($manifest.description -ne 'A calm, local-first new-tab dashboard. No Aurora account, no tracking, no backend.') { throw "Unexpected production manifest description: $($manifest.description)" }
if (($manifest.permissions -join ',') -ne 'storage,favicon,geolocation,search') { throw "Unexpected production permissions: $($manifest.permissions -join ',')" }
if (($manifest.optional_permissions -join ',') -ne 'bookmarks') { throw "Unexpected optional permissions: $($manifest.optional_permissions -join ',')" }
if (($manifest.optional_host_permissions -join ',') -ne 'https://*/*') { throw "Unexpected optional hosts: $($manifest.optional_host_permissions -join ',')" }
rg -n "__auroraStorageHarness|__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist
if ($LASTEXITCODE -ne 1) { throw 'Preview-only Aurora bridge leaked into production dist' }
npm audit --omit=dev
npm audit --include=dev
npm ls nanoid --all
npm run build:preview
$previewManifest = Get-Content -Raw -LiteralPath dist/manifest.json | ConvertFrom-Json
if ($previewManifest.description -ne 'A calm, local-first new-tab dashboard. No Aurora account, no tracking, no backend.') { throw "Unexpected preview manifest description: $($previewManifest.description)" }
if (($previewManifest.permissions -join ',') -ne 'storage,favicon,bookmarks,geolocation,search') { throw "Unexpected preview permissions: $($previewManifest.permissions -join ',')" }
if (@($previewManifest.optional_permissions).Count -ne 0) { throw "Unexpected preview optional permissions: $($previewManifest.optional_permissions -join ',')" }
if (($previewManifest.optional_host_permissions -join ',') -ne 'https://*/*') { throw "Unexpected preview optional hosts: $($previewManifest.optional_host_permissions -join ',')" }
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p9-harness.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w1-p9-harness.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w1-p9-harness.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w1-p9-harness.log -Pattern '^SKIP:').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
if ($fail -ne 0) { throw "Preview harness logged $fail FAIL lines" }
if ($pass -ne 451 -or $skip -ne 3) { throw "Expected unchanged W1-P9 regression totals PASS=451 SKIP=3, got PASS=$pass SKIP=$skip" }
git diff --check
git status --short
```

Requirements: targeted/full Vitest, TypeScript, production/preview builds, and harness have zero failures; production bridge search exits 1; production/full audits are zero; `npm ls` resolves only `nanoid@3.3.18`; built manifest copy/permissions are exact; W1-P1 through W1-P8 evidence does not regress; the three existing SKIPs remain honest; no W2-P1 behavior enters the diff. Delete the untracked harness log after recording counts.

- [ ] **Step 4: Update durable ledgers and commit the checkpoint**

Update:

- `ROADMAP.md`: mark W1-P9 `Verified`, link this plan, record inventory/Quick Link/manifest/Settings/copy/audit evidence, implementation SHA, review disposition, full verification counts, and checkpoint subject; leave W2-P1 Not started with no plan.
- `STATUS.md`: replace the W1-P8 envelope with W1-P9's exact boundaries, plan/implementation/review commits, targeted/full/type/build/audit/harness counts, local plaintext and live-dashboard/W6 gates, clean state, and W2-P1 as the single next packet.
- `DECISIONS.md`: append A2-D018 recording the exhaustive typed inventory, authentication/capability distinction, local plaintext/shared-profile disclosure, Quick Link URI/userinfo rejection, source-only interim copy/W6 policy gate, and exact dev-only nanoid override.

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git diff --cached --check
git diff --cached
git commit -m "docs: checkpoint W1-P9"
```

- [ ] **Step 5: Push, prove clean state, prepare the next prompt, and stop**

```powershell
git push origin feat/aurora-2-observatory
git status --short --branch
git rev-parse HEAD
git rev-parse '@{upstream}'
git rev-list --left-right --count 'HEAD...@{upstream}'
git log -16 --oneline
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
```

Require local/upstream equality, no target-worktree entries, and protected original clean at `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Provide a ready-to-paste next-session prompt naming the literal worktree, branch, checkpoint HEAD, verified W1-P9 implementation SHA, Packet `W2-P1`, required documents, and instruction to create/review its shared async/freshness-state plan just in time. Stop before creating a W2-P1 plan or changing Wave 2 behavior.
