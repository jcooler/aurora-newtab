# W6-P3 Official Policy and Dashboard Reconciliation

**Policy check date:** 2026-08-16

**Repository-side status:** Ready after one implementation review and one fix/rereview cycle. Two Important disclosure issues were fixed. Current official-policy requirements are mapped, canonical Store source is staged, and no product/permission/schema/Store behavior changed.

**Acceptance gate still open:** The current live Aurora item version and dashboard field values require the user's read-only signed-in evidence. Nothing in this report authorizes a live dashboard edit.

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
| Prominent accurate disclosure | Source change completed; dashboard evidence required | Canonical detailed description now discloses local data, approximate location, credentials/capability URLs, provider-direct requests, connector response data, and Home Assistant's click-only write path. Current live text remains unknown. |
| Accurate privacy policy | Source change completed; dashboard URL evidence required | `PRIVACY.md` now distinguishes functionality-necessary provider transfers from prohibited/unrelated transfers and has an effective date of 2026-08-16. |
| Affirmative Limited Use statement | Source change completed | `PRIVACY.md` expressly affirms compliance with the Chrome Web Store User Data Policy and Limited Use requirements. |
| Narrowest permissions | Compliant in source; dashboard evidence required | Install-time `storage`, `favicon`, `geolocation`, and `search`; runtime `bookmarks`; per-origin grants through request-only `https://*/*`. Canonical justifications explain why each is required now. |
| Remote code declaration | Compliant recommendation; dashboard evidence required | Aurora executes packaged Manifest V3 code only. Recommended dashboard answer: `No, I am not using remote code.` |
| Data Usage selections/certifications | Canonical recommendation ready; dashboard evidence required | `release/store-listing.md` maps each current dashboard category and four Limited Use statements to final behavior. |
| Listing accuracy/current assets | Canonical copy ready; live values/assets require dashboard evidence | Final 2.0 source replaces the historical additive v1.x staging document. W6-P4 owns new package/screenshots/dossier. |
| Version monotonicity | Dashboard evidence required | The repository cannot reveal the currently published Store version. W6-P4 cannot prove `2.0.0` is greater until the user confirms it. |

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

## Read-only live dashboard evidence required from the user

Please provide screenshots or exact transcriptions of these current fields. Do not change or save anything in the dashboard for W6-P3.

1. **Item/package overview**
   - Current published/live version.
   - Current item status and item ID/name sufficient to confirm this is the preserved Aurora V1 listing.

2. **Store listing tab**
   - Item name, summary, detailed description, category, homepage URL, support URL, and privacy policy URL if shown there.
   - The current screenshot/promo asset thumbnails and their order. Asset quality is evaluated in W6-P4; W6-P3 only records current state.

3. **Privacy practices tab**
   - Single-purpose description.
   - Exact visible permission list and every current justification (`storage`, `favicon`, `geolocation`, `search`, `bookmarks`, and host access if present).
   - Remote-code selection and explanation, if any.
   - All data-type checkbox labels and selected/unselected values.
   - Every Limited Use certification's exact text and checked/unchecked value.
   - Privacy policy URL.

## Dashboard comparison worksheet

| Field | Live value | Canonical/recommended value | Result |
|---|---|---|---|
| Published version | Manual evidence required | Must be lower than staged `2.0.0` | Dashboard evidence required |
| Item identity/name | Manual evidence required | Existing Aurora V1 item / `Aurora` | Dashboard evidence required |
| Summary | Manual evidence required | `A calm, local-first new-tab dashboard. No Aurora account, no tracking, no backend.` | Dashboard evidence required |
| Detailed description | Manual evidence required | Canonical `release/store-listing.md` description | Dashboard evidence required |
| Category | Manual evidence required | `Productivity` | Dashboard evidence required |
| Single purpose | Manual evidence required | Canonical new-tab-dashboard statement | Dashboard evidence required |
| Permission justifications | Manual evidence required | Canonical per-permission blocks | Dashboard evidence required |
| Remote code | Manual evidence required | `No` | Dashboard evidence required |
| Data Usage categories | Manual evidence required | Yes: PII, health, authentication, location, web history, website content; No: financial/payment, personal communications, user activity | Dashboard evidence required |
| Limited Use certifications | Manual evidence required | All applicable current certifications true | Dashboard evidence required |
| Privacy policy URL | Manual evidence required | `https://github.com/jcooler/aurora-newtab/blob/main/PRIVACY.md` | Dashboard evidence required |
| Homepage/support URLs | Manual evidence required | Repository root / issue tracker recommendations | Dashboard evidence required |

Chrome Web Store upload, listing edit, submission, rollout, and publication remain blocked until W6-P5 and contemporaneous explicit approval.
