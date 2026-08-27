# W6-P3 Official Policy and Dashboard Reconciliation

**Policy check date:** 2026-08-16

**Live dashboard evidence date:** 2026-08-17

**Status:** Ready after one implementation review and one fix/rereview cycle. Two Important source-disclosure issues were fixed, the signed-in live dashboard was transcribed read-only, every material difference is assigned to W6-P4 or W6-P5, and no product, permission, schema, package, or Store state changed.

**Store boundary:** Nothing in this report authorizes a live dashboard edit. No field was typed into, no draft was saved, and no package was uploaded, submitted, published, or rolled out. All listed changes remain blocked until W6-P5 and contemporaneous explicit approval.

## Current official sources

- [Chrome Web Store policy update, published 2026-07-01](https://developer.chrome.com/blog/cws-policy-updates-2026): data collected by an extension must be necessary for its disclosed single purpose; all collection must be prominently disclosed; changed practices must be proactively disclosed. Enforcement began 2026-08-01.
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies): current privacy policy, Limited Use, permission, disclosure, handling, listing, and dashboard-accuracy requirements.
- [Quality guidelines](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines/) and [quality FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq/): an extension must have one narrow, understandable purpose; a new-tab page is a valid narrow browser function; NTP web search must use Chrome's Search API and respect the user's search settings.
- [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq): local processing/storage is still user-data handling that must be disclosed; personal/sensitive data and Limited Use requirements are defined here.
- [Privacy practices dashboard guide](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/): the dashboard requires a single-purpose description, permission justifications, remote-code declaration, data-type selections, Limited Use certifications, and privacy-policy URL; dashboard answers must match behavior and the policy.
- [Store listing guide](https://developer.chrome.com/docs/webstore/cws-dashboard-listing/) and [listing quality guide](https://developer.chrome.com/docs/webstore/best-listing): listing metadata and current screenshots must accurately describe the shipped experience.
- [Package preparation](https://developer.chrome.com/docs/webstore/prepare): the manifest description is limited to 132 characters and a new uploaded version must exceed the live version. Package/version evidence belongs to W6-P4 after the live version is known.

## Policy map

| Requirement | Aurora status | Evidence/action |
|---|---|---|
| One narrow purpose | Compliant in source | Canonical statement defines one browser function: a local-first new-tab dashboard. All widgets, connectors, Settings, and tools feed that workspace. |
| Search respects Chrome choice | Compliant | Production uses `chrome.search.query()` and has no provider picker or provider URL construction. |
| Collected/handled data is necessary | Compliant in behavior | Executable inventory maps every stored/transmitted value to a visible dashboard, connector, search, navigation, backup, or background feature. No analytics, profiling, ads, telemetry, or developer backend exists. |
| Prominent accurate disclosure | Source ready; live change deferred | Canonical detailed description discloses local data, approximate location, credentials/capability URLs, provider-direct requests, connector response data, and Home Assistant's click-only write path. The live 1.2.1 description is stale; replace it only at W6-P5. |
| Accurate privacy policy | Match | `PRIVACY.md` distinguishes functionality-necessary provider transfers from prohibited/unrelated transfers. The live dashboard already points to the canonical GitHub privacy-policy URL. |
| Affirmative Limited Use statement | Source change completed | `PRIVACY.md` expressly affirms compliance with the Chrome Web Store User Data Policy and Limited Use requirements. |
| Narrowest permissions | Compliant; one deferred 2.0 dashboard field | Live 1.2.1 has `storage`, `favicon`, `geolocation`, `search`, and optional `bookmarks`. The 2.0 package adds request-only `https://*/*`; W6-P5 must add its justification after upload exposes that field. |
| Remote code declaration | Match | Live `No, I am not using Remote code` matches packaged Manifest V3 behavior and the canonical answer. |
| Data Usage selections/certifications | Deferred category changes; certifications match | Five live categories are under-disclosed for 2.0. All three currently visible Limited Use certifications are checked and match the recommendation. |
| Listing accuracy/current assets | Copy/assets changes deferred | Final 2.0 copy is staged. The live listing and five screenshots describe V1; W6-P4 prepares current assets and W6-P5 is the only packet allowed to change the dashboard. |
| Version monotonicity | Match | Live and draft package version is `1.2.1`; staged `2.0.0` is greater. |

## Repository reconciliation

### Important findings fixed

1. `PRIVACY.md` previously said Aurora never transferred user data to any third party for any purpose, while the same policy correctly documented direct Weather, NASA, connector, credential, calendar, status, and Home Assistant requests. Current Limited Use policy permits functionality-necessary transfers but requires accurate disclosure. The policy now says exactly that: Aurora transfers only the data necessary for the requested feature, directly to Chrome or the selected provider, and prohibits advertising, profiling, unrelated, reseller, lending, and human-access uses.
2. The initial Data Usage reconciliation marked Health information `No`, but Home Assistant accepts arbitrary user-selected entity states that can contain health-related values. The review fix changed Health information to `Yes` and added the matching public-policy disclosure. The rereview found no remaining Critical or Important repository-side defect.

### Canonical sources after reconciliation

- `src/privacy/dataFlows.ts`: unchanged executable authority for local storage, secrets/capability URLs, destinations, triggers, methods, sent/received data, permission, cache, and backend boundaries.
- `PRIVACY.md`: complete public disclosure and affirmative Limited Use statement.
- `README.md`: homepage summary no longer implies that provider-request data never leaves the machine; it points to the complete policy.
- `release/store-listing.md`: one canonical Aurora 2.0 source with final summary, single purpose, detailed description, permission justifications, remote-code answer, Data Usage recommendation, certifications, and URLs. The 1,000+ line historical staged addenda were removed.
- `src/manifest.ts`: unchanged behavior; its 82-character description exactly matches the Store summary.

No executable disclosure constant changed, so the plan's conditional Vitest gate was not triggered. No full product gate was run for policy/prose-only edits.

## Recommended Data Usage answers

These recommendations deliberately disclose local handling as well as provider-direct transmission. They must be compared to the live form's exact labels before submission.

| Category | Recommendation | Principal reason |
|---|---|---|
| Personally identifiable information | Yes | Optional greeting name, Jira email, and provider-returned account/user names. |
| Health information | Yes | An arbitrary user-selected Home Assistant entity can contain health-related state, even though Aurora has no dedicated health feature. |
| Financial and payment information | No | Public market prices are not the user's financial/payment data. |
| Authentication information | Yes | Five credentialed connectors store local secrets and send them only to their provider. |
| Personal communications | No | No email, chat, or text-message access. Local notes/tasks are separately disclosed. |
| Location | Yes | Rounded coordinates support Weather/place labels. |
| Web history | Yes | Quick Link/bookmark URLs and configured feed/calendar/provider destinations are handled; bookmarks remain local. |
| User activity | No | No click, keystroke, scrolling, browsing, or analytics logging. |
| Website content | Yes | Selected providers return feeds, work items, deployments, calendar events, status, market data, and Home Assistant state. |

## Read-only live dashboard evidence

The signed-in dashboard was navigated and transcribed without typing into a field or invoking Upload, Save draft, Submit for review, Publish, or rollout controls.

### Item, package, status, and distribution

- Publisher: `jcooler`.
- Item: `Aurora`; item ID `akjalbmacojpmebkgohhcaaiacicpgkh`.
- Live version: `1.2.1`; created 2026-08-01; last updated 2026-08-07; three users.
- Status: `Published - public`. The Published panel says, `This draft is published and available to the public.` The Distribution page has `Public` selected and shows all regions/countries enabled.
- Draft and Published package panels both show version `1.2.1`, extension type, and permissions `storage`, `favicon`, `geolocation`, `search`, and `bookmarks`. No host permission is present in the live 1.2.1 package.

### Store listing

- Title: `Aurora`.
- Summary: `A calm, local-first new-tab dashboard. No accounts, no tracking, no backend.`
- Category: `Functionality & UI`; language: English; mature-content control off.
- Official URL: None. Homepage and support URLs: empty.
- Detailed description: 3,252 of 16,000 characters. It is the V1 description and materially says Aurora offers a Google/DuckDuckGo/Bing provider choice, three themes, no data collection, and only Open-Meteo/BigDataCloud network calls. It does not disclose Aurora 2 connectors, local credentials/capability URLs, provider-returned content, or Home Assistant's user-triggered write path.
- Assets: one 128x128 Store icon and five screenshots in the visible order `Screenshot 1` through `Screenshot 5`. The small promo tile, marquee promo tile, and global promo video are absent. W6-P4 owns inspection/replacement asset preparation.

### Privacy practices

Live single-purpose text:

> Aurora replaces the new-tab page with a local-first personal dashboard — clock, weather, quick links, to-dos, a focus timer, notes, and an optional bookmarks bar — with no accounts, no backend, and no data collection.

The live statement describes V1's feature scope but is not suitable for 2.0: it omits connectors and its `no data collection` claim conflicts with the current policy definition and disclosed local/provider handling.

| Permission | Live justification outcome | Reconciliation |
|---|---|---|
| `storage` | Says settings, links, to-dos, notes, and layout stay in `chrome.storage.local`, with no backend. | Change at W6-P5. Replace with canonical 2.0 copy covering all current local dashboard/configuration data without the stale `never reads ... sites' data` implication. |
| `favicon` | Local Chrome favicon cache for the user's Quick Links/bookmarks; no external favicon request. | Match in substance. Canonical copy may replace it with no policy-changing claim. |
| `geolocation` | Click-only `Use my location`; install-time because Chrome does not permit it as optional; manual city search does not use it. | Match in substance. Canonical copy adds rounding/storage/transmission detail. |
| `search` | `chrome.search.query()` respects Chrome's selected engine; Aurora offers no provider choice and does not build provider URLs. | Match. |
| `bookmarks` | Optional runtime request, read-only rendering, never modified or transmitted. | Match. |
| `https://*/*` host access | Not present in the live 1.2.1 package/form. | Not applicable to live 1.2.1. Add the canonical request-only exact-origin justification at W6-P5 after the 2.0 package exposes it. |

Remote code is `No, I am not using Remote code`; its explanation field is disabled and empty. This matches 2.0 behavior.

| Data Usage category | Live | Canonical 2.0 | Result |
|---|---:|---:|---|
| Personally identifiable information | No | Yes | Change at W6-P5 |
| Health information | No | Yes | Change at W6-P5 |
| Financial and payment information | No | No | Match |
| Authentication information | No | Yes | Change at W6-P5 |
| Personal communications | No | No | Match |
| Location | Yes | Yes | Match |
| Web history | No | Yes | Change at W6-P5 |
| User activity | No | No | Match |
| Website content | No | Yes | Change at W6-P5 |

All three certifications currently visible in the dashboard are checked:

1. `I do not sell or transfer user data to third parties, outside of approved use cases`.
2. `I do not use or transfer user data for purposes unrelated to single purpose`.
3. `I do not use or transfer user data to determine creditworthiness/lending`.

Privacy policy URL: `https://github.com/jcooler/aurora-newtab/blob/main/PRIVACY.md`.

## Dashboard comparison worksheet

| Field | Live value | Canonical/recommended value | Result |
|---|---|---|---|
| Published version | `1.2.1` | Staged `2.0.0` | Match; monotonic package version proved |
| Item identity/name | `Aurora`; `akjalbmacojpmebkgohhcaaiacicpgkh` | Preserve existing item / `Aurora` | Match |
| Status/distribution | `Published - public`; Public; all regions/countries enabled | Preserve until explicitly approved release action | Match; no W6-P3 action |
| Summary | `A calm, local-first new-tab dashboard. No accounts, no tracking, no backend.` | `A calm, local-first new-tab dashboard. No Aurora account, no tracking, no backend.` | Change at W6-P5 |
| Detailed description | 3,252-character V1 description with stale provider/theme/network claims | Canonical `release/store-listing.md` description | Change at W6-P5 |
| Category | `Functionality & UI` | `Productivity` | Change at W6-P5 |
| Screenshot assets | Five V1 screenshots; no promo tiles/video | Current W6-P4 release captures | W6-P4 prepares; change at W6-P5 |
| Single purpose | V1-only statement ending `no data collection` | Canonical 2.0 new-tab-dashboard statement | Change at W6-P5 |
| Permission justifications | Five live-package justifications; no host-access field | Canonical per-permission blocks including request-only host access | Four match in substance; storage and future host field change at W6-P5 |
| Remote code | `No` | `No` | Match |
| Data Usage categories | Yes: location. No: all other eight. | Yes: PII, health, authentication, location, web history, website content. No: financial/payment, personal communications, user activity. | Five changes at W6-P5 |
| Limited Use certifications | All three currently visible statements checked | All three current statements checked | Match |
| Privacy policy URL | `https://github.com/jcooler/aurora-newtab/blob/main/PRIVACY.md` | Same | Match |
| Homepage/support URLs | Empty / empty | Repository root / issue tracker | Change at W6-P5 |

## Acceptance review

The bounded acceptance review covered only current official-policy coverage, exact live-dashboard evidence, mutual source consistency, Store non-mutation, and protected-contract preservation.

- Current official policy and the executable data-flow inventory support the canonical privacy, listing, permission, and Data Usage recommendations.
- The live worksheet assigns every material mismatch to W6-P4 preparation or a W6-P5 dashboard action. None is hidden as a current match.
- `PRIVACY.md`, `release/store-listing.md`, and `src/privacy/dataFlows.ts` consistently disclose the no-Aurora-account/backend/tracking posture, local data and backup exclusions, credentials/capability URLs, provider-direct transfers and returned content, permissions, and Home Assistant's click-only action.
- Dashboard/package/listing navigation was read-only. The active item remains 1.2.1, public, and unchanged.
- The earlier repository review fixed two Important disclosure issues and its rereview returned Ready. This final evidence review found no Critical or Important W6-P3 defect. No Minor issue is being promoted into a blocker.

Chrome Web Store upload, listing edit, submission, rollout, and publication remain blocked until W6-P5 and contemporaneous explicit approval.
