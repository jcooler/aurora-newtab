# W6-P4 2.0.0 Package and Release Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage and audit Aurora 2.0.0 locally as an update to the existing Chrome Web Store item, with five current Store screenshots, exact submission copy, and a release dossier, without changing Store state.

**Architecture:** Treat the committed production build as the only package input and `release/aurora-2.0.0.zip` as an ignored local artifact. Keep Store screenshot fixtures isolated in a release-only script that seeds representative non-personal data through the real extension storage surface, then drives the built preview extension with actual pointer, keyboard, panel, and bookmark interactions. Record every artifact and dashboard field in tracked release documents; W6-P5 alone may authorize an upload or dashboard edit.

**Tech Stack:** TypeScript, Vite, Manifest V3, Node.js ZIP tooling, Playwright/Chromium, Sharp, PowerShell, Markdown.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 14 and 16; `docs/superpowers/aurora-2/ROADMAP.md` W6-P4; `docs/superpowers/aurora-2/W6-P3-POLICY-DASHBOARD-RECONCILIATION.md`.

## Global Constraints

- Preserve the existing public item `akjalbmacojpmebkgohhcaaiacicpgkh`; live version `1.2.1` remains public throughout this packet.
- Stage exactly version `2.0.0` in `package.json`, the root package-lock records, and `src/manifest.ts`.
- Do not upload a package, save a dashboard draft, edit a live listing, submit, publish, or change rollout/distribution.
- Package only a fresh production `dist/`; preview-only bookmarks permission and harness symbols must not enter the ZIP.
- Keep `bookmarks` optional in production, `geolocation` and `search` install-time, and `https://*/*` request-only under `optional_host_permissions`.
- Store screenshots must be exactly five 1280x800 PNGs, generated from the built extension, free of console/page/request errors, directly inspected one at a time at original resolution, and visibly current for the approved V1 Canvas.
- Use representative fixtures only. Never place a real token, capability URL, account payload, personal bookmark, or live connector response in a screenshot or tracked artifact.
- Reuse the accepted Canvas-P8 product gate. Do not rerun the full unit suite or canonical browser harness for release metadata, capture-harness, or report-only changes.
- Apply one W6-P4 acceptance review and at most one fix/rereview cycle. Only Critical or Important security/privacy, data-loss, core-function, or explicit-acceptance failures block.
- Keep `release/aurora-2.0.0.zip` and `release/store-shots/` ignored and local. Track the commands, exact source commit, bytes, SHA-256, entry count, manifest, screenshots, and manual fields in the dossier.

---

### Task 1: Freeze 2.0.0 release metadata

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/manifest.ts`

**Interfaces:**
- Consumes: live `1.2.1` version evidence and the existing package script's manifest/package equality guard.
- Produces: one synchronized `2.0.0` source version consumed by Vite and `scripts/package.mjs`.

- [x] **Step 1: Prove the current version sources**

Run:

```powershell
rg -n '"version": "1\.14\.0"|version: ''1\.14\.0''' package.json package-lock.json src/manifest.ts
```

Expected: exactly the package version, two root lockfile records, and manifest source version are `1.14.0`; dependency versions are out of scope.

- [x] **Step 2: Set only release metadata to 2.0.0**

Apply these exact replacements:

```text
package.json                 top-level version -> 2.0.0
package-lock.json            top-level version -> 2.0.0
package-lock.json packages   root package version -> 2.0.0
src/manifest.ts              manifest version -> 2.0.0
```

Do not change dependencies, permissions, description, schema, or product code.

- [x] **Step 3: Verify version consistency and production build**

Run:

```powershell
rg -n '"version": "2\.0\.0"|version: ''2\.0\.0''' package.json package-lock.json src/manifest.ts
npm run build
Get-Content -Raw dist/manifest.json
```

Expected: four source records and the built manifest say `2.0.0`; production permissions are `storage`, `favicon`, `geolocation`, and `search`; `bookmarks` is optional; `https://*/*` is optional host access.

- [x] **Step 4: Commit the synchronized version**

```powershell
git add package.json package-lock.json src/manifest.ts
git commit -m "build: stage Aurora 2.0.0"
```

### Task 2: Replace stale V1 Store captures with current Canvas evidence

**Files:**
- Create: `scripts/store-shot-fixtures.mjs`
- Modify: `scripts/store-shots.mjs`
- Produces ignored: `release/store-shots/1-hero.png`
- Produces ignored: `release/store-shots/2-arrange-mode.png`
- Produces ignored: `release/store-shots/3-calendar-connectors.png`
- Produces ignored: `release/store-shots/4-direct-tools.png`
- Produces ignored: `release/store-shots/5-bookmarks-popover.png`

**Interfaces:**
- Consumes: the preview build, Chrome extension storage, the accepted Canvas V3 placement shape, connector snapshot scope rules, and the real bookmarks API.
- Produces: `seedStoreShotHero(page)`, `seedStoreShotCalendar(page)`, and five deterministic current-product captures.

- [x] **Step 1: Run the stale capture flow and record the focused RED**

Run:

```powershell
npm run build:preview
npm run store-shots
```

Expected: FAIL in the retired semantic Arrange/reset or another directly adjacent stale V1 selector/state. Do not broaden the failure into a product regression; the existing script predates Canvas V3.

- [x] **Step 2: Add a release-only representative fixture**

Create `scripts/store-shot-fixtures.mjs` with public seeders for the distinct hero, Arrange, calendar, and tool compositions:

```js
export async function seedStoreShotHero(page) { /* representative hero state */ }
export async function seedStoreShotArrange(page) { /* uncluttered Arrange state */ }
export async function seedStoreShotCalendar(page) { /* calendar/connector state */ }
export async function seedStoreShotTools(page) { /* unobstructed direct-tool state */ }
```

The fixture must:

- derive connector snapshot scopes with the same canonical SHA-256 algorithm and ICS timezone scope used by production;
- use only `.invalid` provider URLs and obvious fixture tokens inside the ephemeral profile;
- pin a bundled photo and a fresh local Weather cache so capture generation makes no external request;
- create named bookmark folders and links through `chrome.bookmarks` only when preview permission is held;
- write Canvas V3 profiles without changing schema/migration code or exporting any fixture to production.

- [x] **Step 3: Update the five real interaction captures**

Modify `scripts/store-shots.mjs` so the exact numbered set is:

1. `1-hero.png`: photo-first Desktop with top Bookmarks, centered Clock/Focus/Search, Weather with condition/location, Month, GitHub/Jira content, and movable Timer/Tasks/Notes launchers.
2. `2-arrange-mode.png`: enter Arrange by real long press, drag with real pointer events until a guide and non-occluding inspector are visible, capture before pointer-up, then Cancel and prove the stored layout is unchanged.
3. `3-calendar-connectors.png`: apply the calendar fixture, reload, and show named ICS sources, complete Month content, and representative connector rows at truthful sizes.
4. `4-direct-tools.png`: open Notes through its Canvas launcher, show its contained representative local content, and keep the independent Tasks and Timer launchers visible and unobstructed. Concurrently stacking all three panels is not a valid presentation composition.
5. `5-bookmarks-popover.png`: close the tools and open a named folder through the real Bookmarks bar.

Replace all retired `Done`, reset-confirmation, semantic-zone, weather-geocoder, and text-only launcher assumptions. Add failing exit status for any console error, page error, failed request, missing image, horizontal overflow, clipped capture-owned Canvas block, missing expected witness, or wrong PNG dimension.

- [x] **Step 4: Run the focused GREEN capture gate**

Run:

```powershell
npm run build:preview
npm run store-shots
```

Expected: exit 0; five named 1280x800 PNGs; no console/page/request errors; exact hero, Arrange, calendar/connector, direct-tool, and bookmark witnesses; the temporary browser profile is removed.

- [x] **Step 5: Inspect every PNG separately at original resolution**

Open each of the five PNGs directly, not as a contact sheet. Reject unreadable text, malformed calendar rows, clipped/overlapping product blocks, empty connector states, stale Calm Canvas concepts, missing images, weak contrast, or accidental personal data. Cosmetic observations may be ledgered Minor without reopening accepted product packets.

- [x] **Step 6: Commit the reproducible capture source**

```powershell
git add scripts/store-shot-fixtures.mjs scripts/store-shots.mjs
git commit -m "test(release): refresh Store screenshot evidence"
```

The ignored PNGs remain local and unstaged.

### Task 3: Build, audit, and document the exact release candidate

**Files:**
- Create: `release/RELEASE-DOSSIER-2.0.0.md`
- Create: `release/RELEASE-NOTES-2.0.0.md`
- Modify: `release/LAUNCH-CHECKLIST.md`
- Modify: `release/RESUBMISSION-NOTES.md`
- Verify: `release/store-listing.md`
- Produces ignored: `release/aurora-2.0.0.zip`

**Interfaces:**
- Consumes: a clean committed Task 2 HEAD, the package guard, five inspected PNGs, and W6-P3's exact dashboard worksheet.
- Produces: a local audited ZIP and tracked dossier/checklist/reviewer copy sufficient for a later explicitly approved W6-P5 action.

- [ ] **Step 1: Freeze the package source commit**

Run:

```powershell
git status --short
git rev-parse HEAD
```

Expected: clean worktree. Save the full HEAD as the dossier's `Source commit`; do not package an uncommitted tree.

- [ ] **Step 2: Build the production ZIP once**

Run:

```powershell
npm run package
```

Expected: `release/aurora-2.0.0.zip`; version guard green; production bookmarks guard green; no source maps; three icons; all bundled photo tiers; ZIP contents rooted at `manifest.json` rather than nested under `dist/`.

- [ ] **Step 3: Audit the actual ZIP, not only `dist/`**

Run:

```powershell
$zip = 'release/aurora-2.0.0.zip'
Get-Item $zip | Select-Object FullName,Length,LastWriteTimeUtc
Get-FileHash -Algorithm SHA256 $zip
tar -tf $zip
tar -xOf $zip manifest.json
```

Record the exact filename, bytes, SHA-256, entry count, root entries, manifest version, permissions, optional permissions, optional host permissions, icon paths, new-tab override, source commit, and command result. Confirm the archive has no `.map`, source/test/harness file, nested `dist/`, or preview-only install-time `bookmarks` permission.

- [ ] **Step 4: Replace stale release instructions with exact 2.0 copy**

Create `release/RELEASE-DOSSIER-2.0.0.md` with sections for artifact identity, package audit, accepted product gates, screenshot inventory/inspection, W6-P3 disclosure differences, exact dashboard field map, external manual ceilings, and the W6-P5 stop boundary.

Create `release/RELEASE-NOTES-2.0.0.md` with:

- a user-facing summary of V1 Canvas, direct Arrange, independent layouts, complete calendars/colors, connectors, tools, accessibility/recovery, and local-first privacy;
- an under-1,000-character reviewer note explaining Chrome Search API use, request-only exact-origin connectors, local credential/capability handling and backup redaction, eight read-only connectors, and Home Assistant's click-only action;
- exact reviewer-test steps using non-secret visible controls only.

Replace `release/LAUNCH-CHECKLIST.md` with a 2.0 checklist that maps every manual dashboard field to `release/store-listing.md`, lists the five PNGs in order, names the exact ZIP/hash/dossier, and stops before its first Store mutation pending W6-P5 approval.

Keep `release/RESUBMISSION-NOTES.md` as historical 1.2.1 evidence, but add a top warning that it is not 2.0 submission copy and point to the new dossier/release notes.

- [ ] **Step 5: Verify submission-copy consistency**

Run focused searches across `PRIVACY.md`, `release/store-listing.md`, the new dossier/notes/checklist, `src/privacy/dataFlows.ts`, and `src/manifest.ts` for:

```text
No Aurora account; no Aurora backend/tracking; chrome.search.query;
credentials; capability URLs; backup redaction; provider-direct transfer;
Home Assistant click-only write; request-only host access;
PII/health/authentication/location/web history/website content = Yes;
financial/personal communications/user activity = No;
three current certifications; privacy/homepage/support URLs.
```

Expected: no V1 engine picker, `no data collection`, four-certification, 1.2.0 upload, new-item, or pre-approval mutation instruction survives in active 2.0 copy. Historical 1.2.1 prose remains explicitly labeled historical.

- [ ] **Step 6: Commit the release dossier**

```powershell
git add release/RELEASE-DOSSIER-2.0.0.md release/RELEASE-NOTES-2.0.0.md release/LAUNCH-CHECKLIST.md release/RESUBMISSION-NOTES.md release/store-listing.md
git commit -m "docs: stage Aurora 2.0 release dossier"
```

### Task 4: Bounded acceptance review and checkpoint

**Files:**
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `docs/superpowers/plans/2026-08-17-w6-p4-package-release-dossier.md`
- Modify only if a blocking review defect requires it: Task 1 through Task 3 files

**Interfaces:**
- Consumes: exact local ZIP/screenshots/dossier evidence.
- Produces: a clean pushed W6-P4 checkpoint and a hard stop before W6-P5 external action.

- [ ] **Step 1: Perform the one W6-P4 acceptance review**

Review only:

- synchronized 2.0.0 metadata and version monotonicity over live 1.2.1;
- production ZIP root/contents/permissions/hash and absence of preview/source/test leakage;
- five current, accurate, legible, non-personal 1280x800 captures inspected separately;
- exact consistency among package behavior, privacy/listing/Data Usage/reviewer copy;
- no Store mutation and no weakening of frozen security/privacy/storage/connector/recovery contracts.

Only a demonstrated Critical or Important failure gets one fix and one scoped rereview. If a fix changes package inputs, rebuild the ZIP once and replace every derived byte/hash/manifest/source-commit fact. If it changes screenshot inputs, regenerate and reinspect only the affected capture family. Ledger Minor/cosmetic issues without reopening the packet.

- [ ] **Step 2: Run final focused hygiene**

Run:

```powershell
git diff --check
git status --short
git check-ignore -v release/aurora-2.0.0.zip release/store-shots/1-hero.png
```

Expected: tracked changes are only the W6-P4 ledger checkpoint; ZIP and screenshots remain ignored; no full unit or canonical browser gate is repeated.

- [ ] **Step 3: Update ledgers and checkpoint**

Mark W6-P4 Verified with exact artifact and screenshot evidence, acceptance-review verdict, manual ceilings, and unchanged Store state. Set W6-P5 as the current packet and hard approval boundary.

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md docs/superpowers/plans/2026-08-17-w6-p4-package-release-dossier.md
git commit -m "docs: checkpoint W6-P4"
git push
```

- [ ] **Step 4: Prove both repositories and stop**

Run:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse '@{u}'
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
git -C 'D:\DEV\Chrome plugin' rev-parse '@{u}'
```

Expected: active branch clean and upstream-equal; protected original clean, read-only, and upstream-equal at `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Stop before any W6-P5 upload, dashboard edit/save, submission, publication, or rollout and ask for explicit approval at that moment.
