# Tab Two Privacy Policy

**Effective date:** September 1, 2026

Tab Two is a new-tab dashboard extension for Chrome. This policy describes,
completely, what Tab Two stores, what it sends over the network, and to whom.
If something isn't listed here, Tab Two doesn't do it.

## Summary

The production Tab Two build includes an optional Google sign-in for Account &
Sync. You can continue using Local mode without an account; Local mode makes no
Tab Two account-service request. If you explicitly sign in, Tab Two uses the
production Supabase account service only for Google authentication, a
provider-neutral Tab Two account snapshot, and a signed capability lease. PM-P3
billing is hosted only against Stripe sandbox/test mode; no live Stripe catalog,
live payment, or paid launch is active. A static Cloudflare Pages return surface
has no analytics, cookies, storage, remote assets, account data, or billing
authority.
Signing in does not enable sync and does not upload dashboard product data.
Encrypted sync is optional and starts only after you turn it on with a verified
`encrypted_sync` capability. When it is on, Tab Two sends only the reviewed
encrypted records described below; connector credentials, capability URLs,
provider responses, uploaded images, and device-local operational state remain
on the device. The hosted production sync authority is active, but no device,
key release, or product-data transfer begins on an installation until you
explicitly enable it.
Tab Two does not collect data for its developer, sell or rent your data, or
transfer it for advertising, profiling, lending, or any unrelated purpose.
There is no analytics and no tracking of any kind. Dashboard product data
remains on your own device. The outbound network calls
Tab Two makes on its own, with no action from you beyond turning a widget
on, are five read-only, keyless weather/location lookups described in full
below. Beyond those, Tab Two's **Connectors** framework lets you point it at
outside sites yourself or enable a built-in public source. Fifteen connectors
ship today: RSS, GitHub, GitLab, Jira, Vercel, Crypto, Calendar, Status,
Home Assistant, Linear, Sentry, Todoist, On This Day, Public Holidays, and
Aurora & Kp. Every such request goes
directly from your browser to the site you configured, never through the Tab
Two account service. Thirteen only read. Home Assistant
sends a configured command to your own instance only when you click its
action, and Todoist closes a task only after you confirm it. Eight connectors
(GitHub, GitLab, Jira, Vercel, Home Assistant, Linear, Sentry, and Todoist)
need a credential stored locally and sent only to its provider. The other
seven need no credential. See "Connectors" below for the complete disclosure.

Connector credentials and RSS/Calendar capability URLs are stored as local
plaintext in `chrome.storage.local`, protected by your Chrome/OS profile.
They are not encrypted, obfuscated, or vault-grade. On a shared or untrusted
profile, disconnect connectors or clear Tab Two's extension data after use.

## What Tab Two stores, and where

All of the following is stored locally in the extension's
`chrome.storage.local`, on your device only, and is never transmitted
anywhere except as explicitly described under "Network calls" below:

- Your settings (name/greeting text, widget color, units, sound, and which
  widgets are turned on)
- Quick links (the tiles you add)
- To-do lists and their items
- Focus timer configuration and session state
- Today's focus text
- Background photo preferences (which mode — bundled rotation, your own
  upload, a flat gradient, or NASA's photo of the day — and, in rotation
  mode, which photo)
- Weather cache (the last forecast and environmental context fetched)
- NASA photo-of-the-day cache (the single photo fetched for the current
  local day, if you've chosen that background source — see "Network calls"
  below), so it isn't refetched on every new tab
- Your saved location and display label. Device location is rounded to two
  decimal places (roughly 1 km precision). A city you select keeps the
  coordinates returned by Open-Meteo; each Weather request normalizes either
  source to at most four decimal places (roughly 11 m at the equator).
- Notes (the scratchpad text)
- World clocks and countdowns you've configured
- Habits (the habit names you've added and which days you've marked each
  one done)
- Manual Progress goals (the names, units, daily targets, and current
  local-day values you've entered)
- If you hold a current Metrics capability: at most 13 calendar months of
  daily numeric aggregate buckets. A bucket contains a date, a closed source
  category, a closed source-instance identifier, random installation and bucket
  identifiers, a sequence number, and numeric totals such as completions,
  sessions, minutes, counts, or distances. It never contains task, habit,
  event, repository, project, provider, or activity names or descriptions;
  URLs; tokens; credentials; session data; raw records; or provider payloads.
  Existing local Metrics history remains readable offline and after capability
  expiry, but new collection requires a current capability.
- Widget layout (the on-screen position of each widget, if you've used
  "Arrange layout" to move anything from its default spot)
- Connector configuration (e.g., for RSS: which feed URLs you've added; for
  GitHub/GitLab/Jira/Vercel/Linear/Sentry/Todoist: the token or email+token
  you connected with;
  for Calendar: the calendar addresses you added, up to 5; for Crypto: the
  coins you chose; for Status: the services you've added — curated picks
  or custom status page URLs — up to 8; for Home Assistant: the instance
  URL and long-lived access token you connected with, plus up to 6
  entities and 3 actions you picked from your instance, each one's
  display name cached at the moment you picked it; and each public connector's
  selected display options)
- Your per-source refresh-frequency choices
- A local cache of what each connector last fetched, so a widget
  doesn't need to refetch every time you open a new tab. See "Connectors"
  below.
- If you explicitly sign in: one isolated Supabase access/refresh session under
  `tab-two:account-session:v1`. It is not part of `AuroraData`, JSON backup,
  diagnostics, screenshots, or the visible UI, and Sign out removes it.
- If you explicitly enable encrypted sync: a random installation identifier,
  friendly device name, enable/registration state, accepted server revisions,
  canonical record digests, and up to five local conflict-recovery copies. This
  operational state is excluded from JSON backup and diagnostics. Recovery-copy
  contents remain local and are never uploaded as backups.

The production account service stores a provider-neutral Tab Two account UUID
and the Google identity needed to maintain that mapping: Google's provider
subject, authentication-user UUID, email address, display name when provided,
and creation/update timestamps. It also stores server-side entitlement grants
and append-only entitlement audit events. It does not receive dashboard
settings, notes, connector credentials, location, layout, backup, or sync data
through the account-only functions. The separate sync functions receive only
the encrypted records and bounded metadata described below after explicit
enablement.

The hosted sandbox PM-P3 billing schema stores only the provider-neutral Tab
Two account UUID, sandbox Stripe customer/subscription/Checkout identifiers,
normalized plan and subscription boundaries, one-use introductory-offer state,
webhook id/type/object/time/hash/outcome metadata, bounded rate-limit state, and
append-only billing transitions. It never stores raw webhook bodies, hosted
Checkout or Portal URLs, card data, billing addresses, receipts, payment-method
details, or customer email as billing authority.
Its Stripe functions reject live-mode objects and are not a live billing launch.

When encrypted sync is enabled, the Tab Two Supabase service stores AES-256-GCM
encrypted record envelopes for approved settings, layouts, tasks, notes, habits,
goals, links, and non-secret connector preferences. Source support for the same
aggregate-only Metrics buckets is active when both Metrics and encrypted sync
are entitled and sync is explicitly enabled. The service also stores the
provider-neutral account UUID, random device identifiers and friendly names,
last-seen/acknowledgement metadata, record type/id/revision/tombstone/size data,
bounded idempotency receipts, rate-limit counters, and append-only sync audit
events. The encrypted vault is limited to 2,097,152 bytes per account and five
active installations. It is retained for 90 days after encrypted-sync entitlement ends
unless you delete it first. Deleting synced data removes the
cloud vault but not local dashboard data; deleting the Tab Two account removes
the account and cloud vault but still does not erase local dashboard data on an
installation.

Each account data key is wrapped at rest by a server-held AES-256 key-encryption
key and released only to an authenticated, entitled, active installation. The
released key is imported into non-extractable in-memory Web Crypto authority.
Because the Tab Two service can technically unwrap and release the account data
key, this is encrypted sync, not end-to-end encrypted or zero knowledge.

**Uploaded background photos** are the one exception to `chrome.storage.local`:
if you choose "My photo" and upload your own image(s), each image is stored
locally in the browser's IndexedDB, as a blob, on your device only. It is
never uploaded anywhere, never included in the JSON backup described below,
and never leaves your machine.

**Backup export/import.** Settings → Data lets you export everything above
— except uploaded photos (per the previous paragraph), connector cache
data (e.g. cached RSS headlines), and the NASA photo-of-the-day cache,
all of which are disposable and rebuilt automatically rather than
something you entered — to a JSON file you choose to
save, and re-import it later. Importing a backup also resets the NASA
photo-of-the-day cache to empty, the same "rebuilds on next use" treatment
every other excluded cache gets, rather than carrying an old day's photo
forward. Connector configuration itself is included in the export, minus
any field that connector
declares as secret — every GitHub/GitLab/Jira/Vercel/Home Assistant/Linear/
Sentry/Todoist
token, every calendar address you've added to the Calendar connector, and
every RSS feed URL,
is stripped from the exported file automatically, before it's ever
written to disk (see "Connectors" below for
the full per-connector list and the mechanism that enforces it). This file
is created and read entirely on your device — Tab Two never
uploads it anywhere on its own. Where that file goes afterward (cloud
drive, email, USB stick, etc.) is entirely up to you and outside Tab Two's
control.

Metrics history also has a dedicated user-initiated JSON download containing
only the bounded aggregate history and export metadata described above. That
file is created locally through the browser's native download flow and is not
uploaded by Tab Two.

Tab Two never uploads the local store or a backup file wholesale to the
developer, analytics, or any outside service. Individual values leave the
device only through the specific functionality-necessary network calls
disclosed below. Dashboard storage and backups never pass through the Tab Two
account service.

## Network calls

Tab Two makes network requests to exactly five **fixed** weather/location
endpoints, all operated by third-party services, all read-only and keyless,
and all sent no more data than described below - plus four **opt-in** sources: a
Connector, if and only if you've configured or enabled one (item 6 below),
NASA's Astronomy Picture of the Day, if and only if you've chosen it as your
background (item 7 below), the Tab Two account service only after an existing
session or explicit Account & Sync action (item 8 below), and the static billing
return surface only after a sandbox billing action (item 9 below):

1. **Weather forecast** — `api.open-meteo.com`, once the Weather widget is
   turned on and a location is set. Sends only your saved latitude/longitude
   normalized to at most four decimal places. Device-derived coordinates were
   already rounded to two decimal places; a selected city's provider
   coordinates can retain up to four. Refreshed periodically while the widget
   is visible, according to the selected safe preset, and on demand when you
   click refresh. Manual mode disables forecast timers.
2. **Weather environmental context** - `air-quality-api.open-meteo.com`, once
   the Weather widget is turned on and a location is set. Sends only the same
   normalized coordinates as the forecast request and receives current
   US AQI, UV index, and provider-available pollen values. The result is
   stored inside the included weather cache and follows the selected forecast
   refresh preset and manual refresh control. Severe-weather alerts keep their
   separate five-minute visible-tab check. Open-Meteo currently provides
   pollen values only in Europe during pollen season, so Tab Two shows them as
   unavailable when the provider does not return them.
3. **Severe-weather alerts** - `api.weather.gov`, once the Weather widget is
   turned on and a location is set. Sends only the same normalized coordinates
   and receives active NWS watches, warnings, and advisories. This safety data
   retains a separate five-minute visible-tab check even when forecast refresh
   is Manual.
4. **City search (geocoding)** — `geocoding-api.open-meteo.com`, only while
   the Weather widget is on and you're actively typing into its city search
   box (debounced ~300ms, and only once you've typed at least 2 characters —
   not on every keystroke, and not at all unless you open that search box).
   Sends only the text you've typed so far.
5. **One-time reverse geocode** — `api.bigdatacloud.net`, only at the exact
   moment you click "Use my location" in the Weather widget, so Tab Two can
   label the forecast with a real place name instead of "My location." Sends
   the device coordinates after Tab Two rounds them to two decimal places
   (roughly 1 km). This
   call happens once per click of that button, never on a schedule.
6. **Connector fetches** — only to a connector you've configured or a built-in
   public source you've enabled in Settings → Connectors. Each fetch is sent
   directly from your browser to that connector's own host — nothing is
   sent but the request itself and, for the eight credentialed connectors,
   the provider credential and scoped request data. Configurable sources use
   source-safe presets, Manual mode, and Refresh now while visible tabs
   coordinate one refresh owner. On This Day and Public Holidays retain a
   fixed daily cadence. Home Assistant and Todoist have the only connector
   write paths, both explicitly user-triggered. See "Connectors"
   below for the full, per-connector disclosure, including the permission
   model that gates which sites Tab Two is even allowed to reach.
7. **NASA's Astronomy Picture of the Day** — `api.nasa.gov` (the daily photo
   lookup) and `apod.nasa.gov` (the separate host that actually serves the
   image), only once you've chosen "NASA photo of the day" as your
   background in Settings → General → Background. Sends only NASA's shared,
   keyless `DEMO_KEY` query parameter — no account, no API key of your own
   to configure, and no user data of any kind (not your location, not
   anything else Tab Two stores). Fires at most once per local day: the
   result (photo or a quiet failure) is cached against that day, so it's
   never refetched again until the calendar date changes, and a day where
   it fails simply gets tried again the next day rather than retried on a
   timer. Both hosts' permission is requested together, in the same click
   that selects this source (see "Permissions" below), and is released
   automatically the moment you switch to a different background source —
   unless a Connector you've separately configured happens to still need
   that same host, in which case only your no-longer-needed portion is
   released and the Connector's own access is left untouched.
8. **Optional Tab Two account service** —
   `ovlobmvxtryitupxwylg.supabase.co`, only when an account session already
   exists or you explicitly use Account & Sync. "Sign in with Google" opens
   Google's OAuth flow with `openid`, email, and profile scopes. Google returns
   the authentication result to Supabase, which creates or refreshes the
   provider-neutral account mapping described above. Tab Two then requests an
   account snapshot and a short-lived, signed capability lease bound to that
   account UUID. Requests include the Supabase session credential and standard
   HTTPS request metadata. No dashboard product data or connector credential is
   sent. Sign out removes the local account session. Supabase and Google process
   authentication data under their own privacy terms.
   Explicit plan and Manage billing actions use that same Supabase session.
   While signed in with Account & Sync open, Tab Two also revalidates billing
   automatically when the section opens and when its tab regains focus or
   becomes visible. Short, bounded retries after a hosted billing handoff allow
   webhook processing to converge; Tab Two does not continuously poll. The
   sandbox implementation can ask the server to select a
   semantic test price and return a short-lived Stripe-hosted URL. If an exact
   same-plan Checkout reservation is still open and valid, the server can return
   that same URL instead of creating another Session.
   Tab Two accepts only exact HTTPS `checkout.stripe.com` Checkout URLs or
   `billing.stripe.com` Customer Portal URLs and opens one in a normal browser
   tab. Stripe and Link collect and process payment and billing details on their
   hosted pages; Tab Two never handles or stores card data. A signed lease
   refreshed from Supabase is the only capability authority. Checkout success,
   cancel, Portal return state, URL parameters, and the return page never grant
   access. These Stripe paths reject live-mode objects and remain test-only.
   If you explicitly enable encrypted sync and hold a verified capability, the
   same exact Supabase origin receives authenticated bootstrap, device, pull,
   push, and deletion requests. Eligible local changes are projected into the
   reviewed categories and encrypted in the extension before transmission.
   Requests contain encrypted envelopes plus account/device, revision,
   idempotency, quota, and acknowledgement metadata. Visible installations may
   pull on startup, focus restoration, an interval, or **Sync now**; offline
   edits remain local and retry with bounded backoff. Passwords, tokens,
   sessions, RSS/Calendar URLs, provider caches/responses, uploaded images, and
   recovery-copy contents are never included. Eligible aggregate-only Metrics
   buckets may use the same encrypted transport. Their ciphertext contains only the bounded
   numeric bucket described above; the request exposes only the existing
   account/device/revision metadata plus the `metric_bucket` type and a random
   UUID record identifier.
9. **Static billing return surface** -
   `tab-two-billing-return.pages.dev`, reached when Stripe redirects the browser
   after sandbox Checkout or Customer Portal. The page receives ordinary HTTPS
   request metadata from the browser, sets no cookie, uses no analytics or
   remote asset, and receives no Tab Two account id, billing id, card data, or
   subscription authority. Its local extension message contains only the fixed
   page result needed to focus an already-open Tab Two tab. The extension then
   refreshes server-verified status separately through item 8.

Tab Two makes no other network calls. In particular: no analytics, no
telemetry, no crash reporting, no ad networks, no remote fonts or scripts,
and no "phone home" of any kind.

The **Sun times** and **Moon phase** widgets make no network call of any
kind — both compute entirely on your device from your saved location using
local astronomical math (`src/lib/sun.ts`, `src/lib/moon.ts`), the same
location item 1's forecast call already reads; nothing about either
computation is ever sent anywhere. The extension's own UI (HTML/CSS/JS,
bundled fonts if any, and the bundled background photos) ships inside the
extension package and loads from your local install, not from the network.

Favicons shown next to your quick links and bookmarks are fetched through
Chrome's own built-in local favicon cache (the `_favicon` API, gated by the
`favicon` permission below) — not from any external favicon service, and
not a request Tab Two itself makes over the network.

Clicking a quick link or a bookmark navigates your browser to that page the
same way clicking any other link would — that's ordinary browsing, not a
network call Tab Two makes on your behalf, and it isn't logged or recorded by
Tab Two anywhere.

**The search bar and the command palette's "Search the web" don't make a
network request either.** Tab Two hands whatever text you typed straight to
Chrome's own `chrome.search.query()` API (the `search` permission below) and
stops there — Chrome decides which search engine to use (whichever one is
set as your default in Chrome's own settings, at `chrome://settings/search`)
and sends the request itself. Tab Two never builds a search-provider URL, has
no opinion about which engine you use, and never sees or learns where the
query actually goes. (An earlier version shipped an in-extension
Google/DuckDuckGo/Bing picker that built the query URL itself instead of
using this API — that's gone; every search now goes through Chrome.)

## Permissions

The production Tab Two build requests the following Chrome permissions and the
single fixed host authority `https://ovlobmvxtryitupxwylg.supabase.co/*` for the
optional account service. Preview does not receive that production authority;
the separate unshipped `account-local` development manifest uses loopback
instead.

- **`storage`** (installed automatically, no prompt) — used for everything
  under "What Tab Two stores" above.
- **`favicon`** (installed automatically, no prompt) — used only to show
  small site icons next to quick links and bookmarks, via Chrome's local
  favicon cache. No browsing history is read beyond the single URL needed
  to look up each icon.
- **`search`** (installed automatically, no prompt) — used only to send
  what you type into the search bar or the command palette's "Search the
  web" to `chrome.search.query()`, so Chrome can route it to your own
  default search engine (see "Network calls" above). Held from install
  rather than requested on first use because the search bar is a
  default-on widget shown from the very first new tab — Chrome does allow
  `search` to be requested at runtime instead, but doing so here would put
  a permission prompt between you and the first thing on the page.
- **`identity`** (installed automatically) — used only after you click the
  Account & Sync Google sign-in or fresh-verification action. It opens the
  Google/Supabase OAuth flow and returns to Tab Two's fixed extension callback.
  It is not used to silently sign in, enable sync, inspect other Chrome
  profiles, or read browsing history.
- **`bookmarks`** (optional — requested at runtime, never at install).
  Tab Two's Bookmarks bar widget is off by default. Turning it on in Settings
  triggers Chrome's own native permission prompt; declining leaves the
  widget off with an inline explanation, and you can try again later.
  Granted, Tab Two reads your bookmarks tree (`chrome.bookmarks.getTree()`)
  to render it as a row of chips — that read stays on your device and is
  never transmitted anywhere. Tab Two only ever reads your bookmarks; it
  never creates, edits, moves, or deletes any bookmark or folder.
- **`geolocation`** (installed automatically, no prompt — Chrome does not
  permit this specific permission to be requested at runtime; it maintains
  a fixed list of permissions that may be optional, and geolocation isn't
  on it). Holding the permission is not the same as using it: Tab Two never
  reads your device location in the background, and searching for a city
  by name never touches it at all. Your coordinates are read only in the
  instant you click "Use my location" in the Weather widget — that click
  is the only moment this permission is ever exercised. If the browser's
  own location prompt is declined at that point, the manual city search
  remains available (see "Network calls" above for what happens with the
  location once it's read).
- **Per-origin host access** (`https://*/*` declared as
  `optional_host_permissions` — optional, requested at runtime, one origin
  at a time, never at install). This is what lets the Connectors framework
  reach a site you point it at, and also what the Background source picker
  uses for NASA's photo of the day. Declaring the wildcard makes every
  `https://` origin *eligible* to be requested; it grants none of them, and
  none is held until you act. Adding a feed, or clicking "Connect" on a
  token-based connector, in Settings → Connectors requests exactly that
  connector's origin (e.g. `https://example.com/*`, or `https://
  api.github.com/*`) via Chrome's own native per-site permission prompt —
  the same kind of prompt `bookmarks` above uses, just scoped to one site
  instead of one API. Choosing "NASA photo of the day" in Settings →
  General → Background requests both `api.nasa.gov` and `apod.nasa.gov`
  together, in that same click (see "Network calls" above). Declining
  leaves the connector un-added, or the background unchanged. Removing the
  last feed/connection pointed at a given origin, or switching the
  background away from NASA's photo of the day, revokes that origin's
  permission automatically (`chrome.permissions.remove`) — unless another
  still-enabled Connector independently needs the same origin, in which
  case its grant is left in place; other origins you've granted are
  unaffected either way. See "Connectors" below for the full model.

## Connectors

Connectors are Tab Two's framework for reaching a source you configure or a
built-in public source you enable. Thirteen of the fifteen only read.
**Home Assistant and Todoist are the two exceptions, disclosed plainly:**
clicking one of Home Assistant's action buttons sends a single
command — `scene.turn_on`, `script.turn_on`, or `switch.toggle`, whichever
matches the action you picked — to **your own Home Assistant instance**,
the same one you typed the URL for when you connected it. That command
fires only in the instant you click the button: never on a timer, never
bundled with the widget's own state poll, never anywhere else in the
app. Todoist sends a task-close request only after you explicitly confirm
that task. Nothing else is ever written to any connector. Every other
request, including Home Assistant's own `/api/states` poll, is a plain read.
Apart from those two write paths,
the pattern holds exactly as it always has — **direct client → provider**:
every connector request, read or write, goes straight from your browser to
the site you configured, never through any server Tab Two operates (it has
none) and never past any other third party. Nothing about the request —
not its contents, not the fact that it happened — is visible to Tab Two's
developer or anyone else.

**Per-origin grants, on your action only.** A user-configured external source
gets no network access until you explicitly configure its site. Adding a feed
URL, or clicking "Connect" on a token-based connector,
triggers Chrome's native permission prompt for that one origin the instant
you act — see "Permissions" above for the mechanism. Nothing is
pre-granted at install, nothing is granted in the background, and removing
the last thing pointed at a given origin releases that origin's permission
automatically. The three built-in public connectors use only their disclosed
fixed public hosts, need no credential, and do not ask for a per-origin grant.

**Authentication and capability secrets.** RSS, Crypto, Calendar, Status,
On This Day, Public Holidays, and Aurora & Kp
need no credential (`auth: 'none'`). RSS feed URLs and Calendar addresses are
still capability secrets: possession of the full URL may grant read access,
even though it is not an account sign-in. GitHub, GitLab, Jira, Vercel,
Home Assistant, Linear, Sentry, and Todoist do require a credential to read
your own data. Home Assistant can also send a configured command, and Todoist
can close a confirmed task. Each stores its credential only in
`chrome.storage.local`, on your device, exactly like
everything else Tab Two stores — never sent anywhere except to the one
provider it authenticates to. This is enforced mechanically, not just
promised: every connector declares, in Tab Two's connector registry, which
of its config fields (if any) are secret; the backup exporter reads that
declaration and strips every field so listed before a backup file is ever
written, for every connector, automatically — there is no separate list to
remember to update. GitHub/GitLab/Vercel/Home Assistant each declare their
token secret; Linear, Sentry, and Todoist also declare their tokens secret;
Jira declares its API token secret (the email address
travels with the rest of the config, unstripped — it identifies you to
Jira, the same way a username would, and isn't itself a bearer
credential); RSS uses its descriptor's backup redactor to remove every feed
URL; Calendar declares its whole `calendars` list (every entry's
own address) secret, since each address alone is what grants read access
to that calendar — up to 5 per the connector's own cap; Crypto, Status,
On This Day, Public Holidays, and Aurora & Kp declare no secret fields
because they have none — a status page
URL, curated or custom, grants no access to anything and identifies no
one.

**RSS, concretely.** Tab Two fetches only the feed URLs you've added in
Settings → Connectors — nothing else. The Balanced preset refreshes about
once every 30 minutes per feed while Tab Two is visible; you can choose
another listed preset, Manual only, or refresh on demand.
Each fetch is a single HTTP GET straight to that feed's own host; nothing
is sent but the request itself. Each full feed URL is treated as a capability
secret and removed from backup exports. The response — headline titles, links,
source names, and publish dates — is parsed on your device and cached
locally (as part of "What Tab Two stores," above) purely so the widget
doesn't need to refetch on every new tab; that cache is excluded from
backup exports entirely, same as uploaded photos, because it's disposable
and rebuilds itself rather than being data you entered. Open Tab Two tabs
coordinate refresh ownership so they do not intentionally multiply the same
request.

**The remaining connectors, concretely** — each fetch is a single HTTP request sent
directly from your browser to the named host, cached locally the same way
RSS is (and excluded from backup exports the same way), and refreshed on
its own interval or sooner on demand. Home Assistant and Todoist below also
cover the only two write paths in this list:

- **GitHub** — talks only to api.github.com; sends only your token (as the
  Authorization header) and the queries for your own PRs, issues,
  notifications, and (opt-in, off by default) your contribution calendar
  via GitHub's GraphQL endpoint. The Balanced preset is 5 minutes.
- **GitLab** — talks only to your configured GitLab instance (gitlab.com
  unless you've pointed it at your own); sends only your token (as the
  Authorization header) and the queries for your own merge requests and
  to-dos, plus, opt-in and off by default: merge requests where you're the
  requested reviewer, and your contribution calendar (fetched from
  `/users/{username}/calendar.json` on that same configured instance — no
  new host). The Balanced preset is 5 minutes.
- **Jira** — talks only to your own Jira Cloud site
  (`yoursite.atlassian.net`); sends only your email and API token (as
  HTTP Basic auth) and the query for issues assigned to you. The Balanced
  preset is 10 minutes.
- **Vercel** — talks only to api.vercel.com; sends only your token (as the
  Authorization header) and the query for your own recent deployments. The
  Balanced preset is 5 minutes.
- **Crypto** — talks only to api.coingecko.com; sends only the coin ids
  you chose — no account, no token. The Balanced preset is 5 minutes.
- **Calendar** — fetches only the secret calendar addresses you've added,
  up to 5; each address itself is treated as a secret (see "Token
  connectors" above) and never leaves your device except to its own
  calendar host. The Balanced preset is 15 minutes. Meeting URLs (Zoom,
  Meet, Teams, Webex, Whereby) are parsed locally out of whatever your
  calendar feed already sent — no separate fetch, and Tab Two never sends
  the URL anywhere; a link only opens when you click it.
- **Status** — talks only to the public status endpoint(s) you've added,
  up to 8: six curated picks (GitHub, Cloudflare, OpenAI, npm, Vercel,
  Discord's own statuspage.io status pages) or any statuspage.io-style URL
  you paste in yourself. No account, no token — sends nothing but the
  request itself. A service that fails to respond reads as unknown (a gray
  dot), never as a stale "healthy" reading carried over from an earlier
  check — the one connector where a failed fetch is deliberately shown
  rather than papered over, since a status widget that could show a stale
  green during a real outage would be actively misleading. The Balanced
  preset is 5 minutes.
- **Home Assistant** — talks only to **your own Home Assistant instance**,
  at the `https://` URL you typed in when connecting; plain
  `http://homeassistant.local:8123` cannot be granted, because Chrome's
  host-permission request itself is https-only for every connector, and
  Home Assistant is no exception (Nabu Casa cloud URLs and
  reverse-proxied instances work fine). Sends your long-lived access
  token as the Authorization header, stored locally and stripped from
  backup exports exactly like the four other credentialed connectors
  above. Reads `/api/config` once (a one-time
  check, at the moment you connect, that resolves the location name your
  card is labeled with). The entity picker makes one bulk `/api/states`
  request only when you click "Choose entities"; regular widget refreshes
  request `/api/states/{entity_id}` separately for only the selected
  entities. Because Home Assistant lets you select arbitrary entities, a
  selected value can reflect personal, location, or health information,
  depending on what you choose; Tab Two treats it only as dashboard data and
  sends it nowhere except in requests to that same connected instance. The
  action controller checks `/api/` for health and does not use that endpoint
  for ordinary state polling. The Balanced preset polls selected entities at
  most once every 60 seconds, and only while a tab with the widget open is
  on-screen; you can choose a slower listed preset or Manual only. There is no
  background timer of its own. A chip's text
  (the name and the value both) comes from that live poll, so renaming or
  changing an entity inside Home Assistant is reflected the next time it
  refreshes; only an action button's label is fixed at the moment you
  pick it, since an action is never re-fetched — it's static config, not
  polled state. **The one write path:** up to 3 of your picked entities can
  be one-tap actions (a scene, script, or switch); clicking that action's
  button on the board sends a single POST —
  `/api/services/scene/turn_on`, `/api/services/script/turn_on`, or
  `/api/services/switch/toggle`, matching what you picked — carrying
  nothing but that one entity's id, to that same instance, only in the
  instant you click, never on a schedule and never bundled with the poll
  above. This is the only place in Tab Two that sends a command to Home
  Assistant rather than a request for data.
- **Linear** - talks only to `api.linear.app`; sends your personal API key,
  an assigned-work GraphQL query, and selected team identifiers. It receives
  account identity, team names, assigned issues, workflow state, priority,
  due date, and cycle context. The Balanced preset is 15 minutes.
- **Sentry** - talks only to the official `sentry.io`, `us.sentry.io`, or
  `de.sentry.io` region you select; sends your bearer token, organization slug,
  unresolved query, and selected project slugs. It receives unresolved issue
  details and provider links. The Balanced preset is 5 minutes.
- **Todoist** - talks only to `api.todoist.com`; sends your bearer token,
  selected project identifiers, pagination cursors, and task queries. It
  receives project names and due task content. The only write is a POST to
  close one task, sent only after you explicitly confirm that task. The
  Balanced preset is 5 minutes.
- **On This Day** - talks only to `en.wikipedia.org`; sends the local month
  and day and receives public historical events, births, deaths, and article
  links. It has a fixed daily cadence and no frequency control.
- **Public Holidays** - talks only to `date.nager.at`; sends the selected
  country code and current or next local year and receives public country and
  national-holiday facts. It has a fixed daily cadence and no frequency
  control. Empty months remain silent.
- **Aurora & Kp** - talks only to `services.swpc.noaa.gov`; sends no user data
  and receives the public planetary K-index forecast. The Balanced preset is
  15 minutes.

## Data collection, sale, and sharing

Tab Two's account service processes only the account identity, session,
entitlement, and audit data described above. Dashboard product data is not
collected by that service. Other transfers occur only when necessary to
provide the user-requested feature described in this policy: directly to
Chrome or to the weather, NASA, cloud, feed, calendar, status, or self-hosted
provider the user selected. Tab Two does not
sell, rent, or trade user data; transfer it to advertising platforms, data
brokers, or information resellers; use it for personalized advertising or
profiling; use or transfer it for a purpose unrelated to the extension's
single disclosed purpose; or use
or transfer it to determine creditworthiness or for lending.

Tab Two's use of information received from Chrome APIs complies with the
Chrome Web Store User Data Policy, including its Limited Use requirements.
Tab Two uses that information only to provide or improve its single purpose as
a local-first new-tab dashboard, and only makes the functionality-necessary
transfers disclosed above.

## Children's privacy

Tab Two is not directed at children and does not knowingly collect information
from children. See "What Tab Two stores" above: dashboard values are generated
by your own use and remain on your device, while optional account identity and
entitlement data and functionality-necessary direct requests are limited to
the disclosures under "Network calls."

## Changes to this policy

If this policy changes, the updated version will be published at the same
location with a new effective date above. Tab Two does not use account email
for marketing or product announcements; checking this page is the way to learn
of policy changes.

## Contact

Questions about this policy or Tab Two's data practices: open an issue on
the project's GitHub repository issue tracker —
[github.com/jcooler/aurora-newtab/issues](https://github.com/jcooler/aurora-newtab/issues).
