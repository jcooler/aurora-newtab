# Aurora 2.0.0 Release Dossier

> **LOCAL RELEASE CANDIDATE ONLY.** This dossier does not authorize a Chrome Web Store upload, listing edit, draft save, submission, publication, or rollout. W6-P5 and contemporaneous explicit owner approval are required before the first Store mutation.

## Artifact identity

| Field | Exact value |
|---|---|
| Existing Store item | Aurora, `akjalbmacojpmebkgohhcaaiacicpgkh` |
| Publisher | `jcooler` |
| Live public version | `1.2.1` |
| Candidate version | `2.0.0` |
| Source commit | `6fae415803a1e4ec18f1f3d0b54afe7f7be05f9b` |
| Local artifact | `release/aurora-2.0.0.zip` |
| Artifact bytes | `60,443,024` |
| SHA-256 | `31930FEC4A288992EC74FD3173F08FE444D132A00FA7EF51C0900B629F356116` |
| ZIP entries | `59` |
| Built at (UTC) | `2026-08-17T13:43:03.9457563Z` |

The ignored ZIP was produced once from the clean source commit above with `npm run package`. It updates the existing item.

## Production package audit

`npm run package` completed successfully. TypeScript and the production Vite build passed with 193 modules transformed. The package guard confirmed:

- manifest and package version both equal `2.0.0`;
- `bookmarks` is not install-time in production;
- no `.map` files are present;
- the 16, 48, and 128 pixel icons are present;
- all 46 bundled photo tiers are present.

The actual ZIP, not only `dist/`, was enumerated and inspected. Its root entries are `assets`, `fonts`, `icons`, `manifest.json`, `photos`, and `src`. It contains no nested `dist/`, source, test, screenshot-harness, script, or sourcemap entry.

The archived manifest declares:

- Manifest V3, name `Aurora`, version `2.0.0`;
- description `A calm, local-first new-tab dashboard. No Aurora account, no tracking, no backend.`;
- install-time permissions `storage`, `favicon`, `geolocation`, and `search`;
- optional permission `bookmarks`;
- request eligibility `optional_host_permissions: ["https://*/*"]`;
- icons at `icons/icon16.png`, `icons/icon48.png`, and `icons/icon128.png`;
- new-tab override `src/newtab/index.html`.

## Accepted product evidence reused

Canvas-P8 remains the stabilized product gate and was not repeated for release-only metadata or capture-source changes. Its recorded evidence is:

- the one full unit run found one obsolete retired-Day source assertion; the corrected affected family passed 2 files / 29 tests;
- production and preview builds each transformed 193 modules, and the production bridge scan was clean;
- the canonical browser run and its one permitted rerun exposed stale direct-Timer harness references; the corrected bounded family passed all seven reported checks;
- accepted original-resolution captures and `errors: []` were reconfirmed;
- final review returned Ready with no Critical or Important defect;
- the incomplete later canonical traversal remains Minor procedural evidence debt under the explicit no-third-run limit.

The release package performed its own fresh TypeScript and production build through `npm run package`. No full unit suite or canonical harness was repeated for W6-P4.

## Current Store screenshot inventory

All five ignored PNGs were generated from the built preview extension with representative non-personal `.invalid` connector fixtures and real extension storage/bookmark interactions. Each is exactly 1280x800, and the focused capture run reported zero console, page, or request errors and removed its temporary browser profile.

| Order | File | Bytes | SHA-256 | Direct original-resolution inspection |
|---:|---|---:|---|---|
| 1 | `release/store-shots/1-hero.png` | 1,676,745 | `F88DD54AC9AF4FAFE0B31423F70235FD1E436C5E945C043307DCE72DC06E3097` | Photo-first hierarchy is clear; Weather shows `Mostly clear · Atlanta` and an expansion chevron; Clock/Focus are centered; GitHub/Jira and all three tool launchers are legible. |
| 2 | `release/store-shots/2-arrange-mode.png` | 1,469,915 | `306732CDDB768FDC5AC420EFBA24153A15244B853B1173423C3A05C52126316C` | Real long press and pointer drag show a snap guide, selected Clock, slim toolbar, and non-occluding inspector. Cancel preserves the stored layout exactly. |
| 3 | `release/store-shots/3-calendar-connectors.png` | 1,739,032 | `D2E6FD9EC35CA3DFCFCAECC49FB4703424BE0BEB831086632878A973D632E31B` | Standard Month is complete, calendar sources `Studio` and `Family` are visible, and ICS/RSS/Status render truthful content at distinct sizes. |
| 4 | `release/store-shots/4-direct-tools.png` | 1,643,334 | `1C8044828D9762554A05455301F79D7559F5594E2B6CE9834F1076EC9644D600` | Notes opens directly with representative local content while independent Timer and Tasks launchers remain visible and unobstructed. |
| 5 | `release/store-shots/5-bookmarks-popover.png` | 1,742,959 | `65513D438B7B08800FBC2888894C34421F26FC00FBF8D08F57F1ED44828DB85F` | A named folder opens through the real Bookmarks API; its items are legible and the popover clears the Clock. |

No image contains a real token, capability URL, account payload, personal bookmark, or live connector response.

## Read-only live dashboard baseline

W6-P3 transcribed the signed-in Store dashboard without typing, saving, uploading, submitting, publishing, or changing rollout:

- Aurora `1.2.1` is `Published - public`, with draft and published panels both at `1.2.1`;
- the item has five V1 screenshots, no promo tiles/video, category `Functionality & UI`, and empty homepage/support URLs;
- the live summary and detailed description are stale V1 copy;
- live permissions are `storage`, `favicon`, `geolocation`, `search`, and `bookmarks`, with no 1.2.1 host-access field;
- remote code is `No`;
- Data Usage is currently Yes only for Location and No for the other eight categories;
- all three currently visible Limited Use certifications are checked;
- the privacy-policy URL already matches the canonical source.

## Exact W6-P5 field map

The source of truth for pasteable copy is `release/store-listing.md`. At W6-P5, and only after explicit approval, preserve the existing item and apply this map:

| Dashboard field | Staged 2.0 value/action |
|---|---|
| Package | Upload the audited `aurora-2.0.0.zip` whose hash appears above. |
| Item/name | Preserve existing Aurora item and name. |
| Summary | Replace with the canonical `No Aurora account` summary. |
| Detailed description | Replace with the canonical 2.0 description. |
| Category | Change to `Productivity`. |
| Screenshots | Replace the five V1 images with the five numbered current images above, in order. |
| Single purpose | Use the canonical local-first new-tab-dashboard statement. |
| Permission justifications | Use each canonical block, including request-only exact-origin host access after the uploaded package exposes it. |
| Remote code | Keep `No`. |
| Data Usage Yes | Personally identifiable information, Health information, Authentication information, Location, Web history, Website content. |
| Data Usage No | Financial and payment information, Personal communications, User activity. |
| Certifications | Keep all three currently visible statements checked only while behavior and answers remain reconciled. |
| Privacy policy | Keep `https://github.com/jcooler/aurora-newtab/blob/main/PRIVACY.md`. |
| Homepage | Set `https://github.com/jcooler/aurora-newtab`. |
| Support | Set `https://github.com/jcooler/aurora-newtab/issues`. |
| Distribution/rollout | Preserve public/all-regions state unless a later explicitly approved action says otherwise. |

## Disclosure consistency

`PRIVACY.md`, `release/store-listing.md`, `src/privacy/dataFlows.ts`, and the packaged manifest consistently describe:

- no Aurora account, Aurora-operated backend, analytics, or tracking;
- `chrome.search.query()` with no search-provider picker or provider URL construction;
- local plaintext connector credentials and RSS/Calendar capability URLs, protected by the Chrome/OS profile and stripped from JSON backups;
- provider-direct functionality requests and local caches;
- request-only exact HTTPS origin access with no host granted at install;
- eight read-only connectors and one Home Assistant action path that writes only after a user click;
- Data Usage Yes for PII, health, authentication, location, web history, and website content, and No for financial/payment, personal communications, and user activity;
- three current certifications, the canonical privacy URL, and staged homepage/support URLs.

## Manual ceilings

Automation does not claim native Chrome zoom behavior, Windows scaling or mixed-DPI movement, real screen-reader speech, physical touch/pen hardware, native permission prompts, live provider accounts or Home Assistant picker/actions, genuine sleep/wake, OS timezone changes, or unload-time persistence. These remain explicit manual observations; they do not authorize Store mutation.

## W6-P5 hard stop

The package, captures, copy, and checklist are staged locally. The live item remains 1.2.1 and unchanged. Stop before Upload, field typing, Save draft, Submit for review, Publish, distribution, or rollout until the owner explicitly approves W6-P5 at that moment.
