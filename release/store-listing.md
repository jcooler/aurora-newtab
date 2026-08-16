# Chrome Web Store listing source — Aurora 2.0.0

> **STAGED SOURCE ONLY — DO NOT PASTE OR MUTATE THE LIVE STORE BEFORE W6-P5 APPROVAL.**
>
> W6-P3 verified this source against official Chrome Web Store policy current
> on 2026-08-16. The current live version and dashboard values still require
> the user's read-only dashboard evidence before this file is submission-ready.

## Item name

Aurora

## Summary

A calm, local-first new-tab dashboard. No Aurora account, no tracking, no backend.

The summary is 82 characters and is within the manifest/dashboard 132-character limit.

## Category

Productivity

## Single purpose

Aurora replaces Chrome's new-tab page with one local-first personal dashboard for time, planning, search, weather, optional user-configured data sources, and customizable layout. Every feature appears in or configures that one new-tab workspace. Search uses Chrome's Search API and respects the user's current default search engine.

## Detailed description

Aurora is a calm, local-first dashboard that replaces Chrome's new-tab page. It combines the information and tools you choose into one responsive workspace, with no Aurora account, no Aurora-operated backend, no analytics, and no tracking.

CORE DASHBOARD

- Time, greeting, world clocks, countdowns, weather, sun times, and moon phase.
- Quick links, Chrome-default web search, and an optional read-only bookmarks bar.
- To-do lists, daily focus, a focus timer, notes, habits, and a month calendar.
- Bundled backgrounds, local uploaded photos, gradients, and optional NASA Astronomy Picture of the Day.
- Responsive semantic layouts, keyboard operation, reduced-motion support, and per-profile Arrange controls.

OPTIONAL CONNECTORS

Aurora can show RSS, GitHub, GitLab, Jira, Vercel, Crypto, Calendar, Status, and Home Assistant data. A connector requests Chrome access only to the HTTPS origin you configure. Requests go directly from your browser to that provider or self-hosted instance and never through an Aurora server. Eight connectors read only. Home Assistant can also send one scene, script, or switch command to your own instance only when you press its action button.

DATA & PRIVACY

Aurora handles data only to provide this new-tab dashboard. Settings, links, to-dos, focus text/timer state, notes, habits, locations, layout, connector configuration, and caches are stored locally in Chrome extension storage. Uploaded photos remain in local IndexedDB. Connector credentials and RSS/Calendar capability URLs are local plaintext protected by the Chrome/OS profile, not encrypted or vault-grade, and are stripped from JSON backups. On shared or untrusted profiles, disconnect connectors or clear Aurora's extension data after use.

When a selected feature needs outside data, Aurora sends only the necessary request directly to Chrome or to the selected weather, NASA, feed, cloud, calendar, status, or self-hosted provider. Approximate coordinates are sent to Open-Meteo for Weather and, after a Use my location click, to BigDataCloud for a place label. Credentialed connector tokens are sent only to the service they authenticate to. Aurora does not sell data, use it for advertising or profiling, allow the developer to read it, or transfer it for unrelated purposes.

Read the complete privacy policy:
https://github.com/jcooler/aurora-newtab/blob/main/PRIVACY.md

## Permission justifications

### `storage`

Stores Aurora's settings and dashboard data locally in `chrome.storage.local`. Aurora has no backend or cloud sync. This permission accesses only Aurora's extension storage, not website storage or another extension's data.

### `favicon`

Shows site icons for Quick Links and bookmarks through Chrome's local `_favicon` extension API. Aurora provides only the URL already present in the user's Quick Link/bookmark data and does not use an external favicon service.

### `geolocation`

Lets Weather read device coordinates only when the user presses `Use my location`. Aurora rounds the coordinates to about 1 km before storage/transmission. Chrome does not permit this permission in `optional_permissions`, so it is install-time even though use remains click-only; manual city search works without reading device location.

### `search`

Hands text from the default-on search bar or command palette to `chrome.search.query()`, preserving Chrome's current default search engine. Aurora does not construct provider URLs, select a provider, read results, or learn which provider Chrome used.

### `bookmarks` (optional)

Reads the bookmarks tree to render the off-by-default Bookmarks widget. Requested only when the user enables that widget. Aurora never creates, edits, moves, deletes, or transmits bookmarks.

### `optional_host_permissions: https://*/*`

Makes arbitrary HTTPS origins requestable because RSS, Calendar, custom Status, Home Assistant, and other connectors accept a user-selected HTTPS host. It grants no host at install. Aurora requests one exact origin through Chrome's native prompt only when the user adds/connects it and removes the grant when its final owner is removed. The wildcard is request eligibility, not standing access.

## Remote code

Select `No, I am not using remote code.` Aurora executes only code packaged with the Manifest V3 extension. Provider responses are data, not executable code.

## Privacy practices / Data Usage recommendation

These are W6-P3 source recommendations. The user's current live dashboard selections must be transcribed and compared before W6-P3 can close.

| Dashboard category | Recommended answer | Behavior basis |
|---|---|---|
| Personally identifiable information | Yes | Optional greeting name; Jira email; user/account names received from configured providers. Used only in the dashboard/connector feature. |
| Health information | Yes | A user-selected Home Assistant entity can contain health-related state. Aurora has no dedicated health feature and uses the value only in the requested dashboard connector. |
| Financial and payment information | No | Public coin market prices are not the user's financial/payment information. |
| Authentication information | Yes | GitHub, GitLab, Jira, Vercel, and Home Assistant credentials are stored locally, redacted from backups, and sent only to their own provider. |
| Personal communications | No | Aurora does not access email, text messages, or chats. User-written notes/tasks remain local and are separately disclosed in the privacy policy. |
| Location | Yes | Rounded coordinates are stored locally and sent only for the user-selected Weather/place-label feature. |
| Web history | Yes | Aurora handles user-saved Quick Link/bookmark URLs and user-configured provider/feed/calendar URLs. Bookmarks stay local; configured request destinations are contacted only for their feature. |
| User activity | No | Aurora does not log or transmit clicks, keystrokes, scrolling, browsing behavior, or usage analytics. |
| Website content | Yes | Configured feeds/providers return headlines, repository work, tickets, deployments, calendar events, status, coin prices, and Home Assistant state directly to the dashboard and local cache. |

Certify the current Limited Use statements only if the live form text matches current official policy and the answers above:

- Aurora does not sell or transfer user data outside functionality-necessary, user-requested provider/Chrome transfers and other policy-approved cases.
- Aurora does not use or transfer user data for a purpose unrelated to its disclosed single purpose.
- Aurora does not use or transfer user data to determine creditworthiness or for lending.
- Aurora's use of data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## URLs and support

- Privacy policy: `https://github.com/jcooler/aurora-newtab/blob/main/PRIVACY.md`
- Homepage recommendation: `https://github.com/jcooler/aurora-newtab`
- Support recommendation: `https://github.com/jcooler/aurora-newtab/issues`

The live values for these fields are dashboard evidence, not inferred facts. Do not edit them before W6-P5 approval.
