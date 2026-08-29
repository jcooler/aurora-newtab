# Aurora Privacy Policy

**Effective date:** August 22, 2026

Aurora is a new-tab dashboard extension for Chrome. This policy describes,
completely, what Aurora stores, what it sends over the network, and to whom.
If something isn't listed here, Aurora doesn't do it.

## Summary

Aurora has no backend and requires no Aurora account. Optional credentialed
connectors can use accounts you already have with their third-party providers.
Aurora does not collect data for its developer, sell or rent your data, or
transfer it for advertising, profiling, lending, or any unrelated purpose.
There is no analytics and no tracking of any kind. Everything
Aurora stores lives only on your own device. The outbound network calls
Aurora makes on its own, with no action from you beyond turning a widget
on, are four read-only, keyless weather/location lookups described in full
below. Beyond those, Aurora's **Connectors** framework lets you point it at
outside sites yourself — RSS, GitHub, GitLab, Jira, Vercel, Crypto,
Calendar, Status, and Home Assistant today — and every such request goes
directly from your browser to the site you configured, never through any
server Aurora operates (it has none). Eight of those nine only ever read;
Home Assistant is the one exception — its action buttons also send a
command to **your own instance**, and only in the instant you click one
(see "Connectors" below for the full write-path disclosure). Five of
those nine (GitHub, GitLab, Jira, Vercel, Home Assistant) need a
credential — a personal access token, or for Jira, an email + API token —
which is stored locally like everything else and sent only to the one
service it authenticates to; the other four (RSS, Crypto, Calendar,
Status) need no credential at all. See "Connectors" below for the complete
disclosure.

Connector credentials and RSS/Calendar capability URLs are stored as local
plaintext in `chrome.storage.local`, protected by your Chrome/OS profile.
They are not encrypted, obfuscated, or vault-grade. On a shared or untrusted
profile, disconnect connectors or clear Aurora's extension data after use.

## What Aurora stores, and where

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
- Widget layout (the on-screen position of each widget, if you've used
  "Arrange layout" to move anything from its default spot)
- Connector configuration (e.g., for RSS: which feed URLs you've added; for
  GitHub/GitLab/Jira/Vercel: the token or email+token you connected with;
  for Calendar: the calendar addresses you added, up to 5; for Crypto: the
  coins you chose; for Status: the services you've added — curated picks
  or custom status page URLs — up to 8; for Home Assistant: the instance
  URL and long-lived access token you connected with, plus up to 6
  entities and 3 actions you picked from your instance, each one's
  display name cached at the moment you picked it)
  and a local cache of what each connector last fetched, so a widget
  doesn't need to refetch every time you open a new tab. See "Connectors"
  below.

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
declares as secret — every GitHub/GitLab/Jira/Vercel/Home Assistant
token, every calendar address you've added to the Calendar connector, and
every RSS feed URL,
is stripped from the exported file automatically, before it's ever
written to disk (see "Connectors" below for
the full per-connector list and the mechanism that enforces it). This file
is created and read entirely on your device — Aurora never
uploads it anywhere on its own. Where that file goes afterward (cloud
drive, email, USB stick, etc.) is entirely up to you and outside Aurora's
control.

Aurora never uploads the local store or a backup file wholesale to the
developer, analytics, or any outside service. Individual values leave the
device only through the specific functionality-necessary network calls
disclosed below. There is no Aurora server that storage or backups pass
through.

## Network calls

Aurora makes network requests to exactly four **fixed** endpoints, all
operated by third-party services (Aurora itself has no server), all
read-only, all keyless (no account, sign-in, or API key involved), and all
sent no more data than described below — plus two **opt-in** sources: a
Connector, if and only if you've configured one (the site(s) you configured,
item 5 below), and NASA's Astronomy Picture of the Day, if and only if
you've chosen it as your background (item 6 below):

1. **Weather forecast** — `api.open-meteo.com`, once the Weather widget is
   turned on and a location is set. Sends only your saved latitude/longitude
   normalized to at most four decimal places. Device-derived coordinates were
   already rounded to two decimal places; a selected city's provider
   coordinates can retain up to four. Refreshed periodically while the widget
   is visible and on demand when you click refresh.
2. **Weather environmental context** - `air-quality-api.open-meteo.com`, once
   the Weather widget is turned on and a location is set. Sends only the same
   normalized coordinates as the forecast request and receives current
   US AQI, UV index, and provider-available pollen values. The result is
   stored inside the included weather cache and follows the same 30-minute freshness window
   and manual refresh control as the forecast. Open-Meteo currently provides
   pollen values only in Europe during pollen season, so Aurora shows them as
   unavailable when the provider does not return them.
3. **City search (geocoding)** — `geocoding-api.open-meteo.com`, only while
   the Weather widget is on and you're actively typing into its city search
   box (debounced ~300ms, and only once you've typed at least 2 characters —
   not on every keystroke, and not at all unless you open that search box).
   Sends only the text you've typed so far.
4. **One-time reverse geocode** — `api.bigdatacloud.net`, only at the exact
   moment you click "Use my location" in the Weather widget, so Aurora can
   label the forecast with a real place name instead of "My location." Sends
   the device coordinates after Aurora rounds them to two decimal places
   (roughly 1 km). This
   call happens once per click of that button, never on a schedule.
5. **Connector fetches** — only to the connector(s) you've actually
   configured yourself in Settings → Connectors (RSS, GitHub, GitLab, Jira,
   Vercel, Crypto, Calendar, Status, Home Assistant); there are none until
   you add or connect one. Each fetch is a single HTTP request sent
   directly from your browser to that connector's own host — nothing is
   sent but the request itself (plus a token/credential for the five that
   need one), and no Aurora server sees or relays it, because Aurora has
   none. Refreshed on a per-connector interval (5 minutes for GitHub/
   GitLab/Vercel/Crypto/Status, 10 for Jira, 15 for Calendar, 30 for RSS,
   60 seconds for Home Assistant — the shortest in the fleet, because home
   state goes stale far faster than a PR list or a coin price), or sooner
   if you open a widget with a stale cache. Home Assistant is also the
   only connector that ever writes, not just reads: see "Connectors"
   below for the full disclosure of that write path. See "Connectors"
   below for the full, per-connector disclosure, including the permission
   model that gates which sites Aurora is even allowed to reach.
6. **NASA's Astronomy Picture of the Day** — `api.nasa.gov` (the daily photo
   lookup) and `apod.nasa.gov` (the separate host that actually serves the
   image), only once you've chosen "NASA photo of the day" as your
   background in Settings → General → Background. Sends only NASA's shared,
   keyless `DEMO_KEY` query parameter — no account, no API key of your own
   to configure, and no user data of any kind (not your location, not
   anything else Aurora stores). Fires at most once per local day: the
   result (photo or a quiet failure) is cached against that day, so it's
   never refetched again until the calendar date changes, and a day where
   it fails simply gets tried again the next day rather than retried on a
   timer. Both hosts' permission is requested together, in the same click
   that selects this source (see "Permissions" below), and is released
   automatically the moment you switch to a different background source —
   unless a Connector you've separately configured happens to still need
   that same host, in which case only your no-longer-needed portion is
   released and the Connector's own access is left untouched.

Aurora makes no other network calls. In particular: no analytics, no
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
not a request Aurora itself makes over the network.

Clicking a quick link or a bookmark navigates your browser to that page the
same way clicking any other link would — that's ordinary browsing, not a
network call Aurora makes on your behalf, and it isn't logged or recorded by
Aurora anywhere.

**The search bar and the command palette's "Search the web" don't make a
network request either.** Aurora hands whatever text you typed straight to
Chrome's own `chrome.search.query()` API (the `search` permission below) and
stops there — Chrome decides which search engine to use (whichever one is
set as your default in Chrome's own settings, at `chrome://settings/search`)
and sends the request itself. Aurora never builds a search-provider URL, has
no opinion about which engine you use, and never sees or learns where the
query actually goes. (An earlier version shipped an in-extension
Google/DuckDuckGo/Bing picker that built the query URL itself instead of
using this API — that's gone; every search now goes through Chrome.)

## Permissions

Aurora requests the following Chrome permissions:

- **`storage`** (installed automatically, no prompt) — used for everything
  under "What Aurora stores" above.
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
- **`bookmarks`** (optional — requested at runtime, never at install).
  Aurora's Bookmarks bar widget is off by default. Turning it on in Settings
  triggers Chrome's own native permission prompt; declining leaves the
  widget off with an inline explanation, and you can try again later.
  Granted, Aurora reads your bookmarks tree (`chrome.bookmarks.getTree()`)
  to render it as a row of chips — that read stays on your device and is
  never transmitted anywhere. Aurora only ever reads your bookmarks; it
  never creates, edits, moves, or deletes any bookmark or folder.
- **`geolocation`** (installed automatically, no prompt — Chrome does not
  permit this specific permission to be requested at runtime; it maintains
  a fixed list of permissions that may be optional, and geolocation isn't
  on it). Holding the permission is not the same as using it: Aurora never
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

Connectors are Aurora's framework for reaching a source you configure
yourself, rather than a fixed built-in service. Eight of the nine
connectors only ever read. **Home Assistant is the one exception, and this
is disclosed plainly:** clicking one of its action buttons sends a single
command — `scene.turn_on`, `script.turn_on`, or `switch.toggle`, whichever
matches the action you picked — to **your own Home Assistant instance**,
the same one you typed the URL for when you connected it. That command
fires only in the instant you click the button: never on a timer, never
bundled with the widget's own state poll, never anywhere else in the
app. Nothing else is ever written to any connector, Home Assistant
included — every other request any connector makes, and Home Assistant's
own `/api/states` poll, is a plain read. Apart from that one write path,
the pattern holds exactly as it always has — **direct client → provider**:
every connector request, read or write, goes straight from your browser to
the site you configured, never through any server Aurora operates (it has
none) and never past any other third party. Nothing about the request —
not its contents, not the fact that it happened — is visible to Aurora's
developer or anyone else.

**Per-origin grants, on your action only.** A connector gets no network
access to anything until you explicitly configure it to reach a specific
site. Adding a feed URL, or clicking "Connect" on a token-based connector,
triggers Chrome's native permission prompt for that one origin the instant
you act — see "Permissions" above for the mechanism. Nothing is
pre-granted at install, nothing is granted in the background, and removing
the last thing pointed at a given origin releases that origin's permission
automatically.

**Authentication and capability secrets.** RSS, Crypto, Calendar, and Status
need no credential (`auth: 'none'`). RSS feed URLs and Calendar addresses are
still capability secrets: possession of the full URL may grant read access,
even though it is not an account sign-in. GitHub, GitLab, Jira, Vercel, and
Home Assistant do require a credential — to read your own data, and for
Home Assistant alone, to also send it a command — and each one stores that
credential only in `chrome.storage.local`, on your device, exactly like
everything else Aurora stores — never sent anywhere except to the one
provider it authenticates to. This is enforced mechanically, not just
promised: every connector declares, in Aurora's connector registry, which
of its config fields (if any) are secret; the backup exporter reads that
declaration and strips every field so listed before a backup file is ever
written, for every connector, automatically — there is no separate list to
remember to update. GitHub/GitLab/Vercel/Home Assistant each declare their
token secret; Jira declares its API token secret (the email address
travels with the rest of the config, unstripped — it identifies you to
Jira, the same way a username would, and isn't itself a bearer
credential); RSS uses its descriptor's backup redactor to remove every feed
URL; Calendar declares its whole `calendars` list (every entry's
own address) secret, since each address alone is what grants read access
to that calendar — up to 5 per the connector's own cap; Crypto and Status
declare no secret fields because they have none — a status page
URL, curated or custom, grants no access to anything and identifies no
one.

**RSS, concretely.** Aurora fetches only the feed URLs you've added in
Settings → Connectors — nothing else — at most about once every 30 minutes
per feed (or sooner, on demand, if you open the widget with a stale cache).
Each fetch is a single HTTP GET straight to that feed's own host; nothing
is sent but the request itself. Each full feed URL is treated as a capability
secret and removed from backup exports. The response — headline titles, links,
source names, and publish dates — is parsed on your device and cached
locally (as part of "What Aurora stores," above) purely so the widget
doesn't need to refetch on every new tab; that cache is excluded from
backup exports entirely, same as uploaded photos, because it's disposable
and rebuilds itself rather than being data you entered.

**The other eight, concretely** — each fetch is a single HTTP request sent
directly from your browser to the named host, cached locally the same way
RSS is (and excluded from backup exports the same way), and refreshed on
its own interval or sooner on demand (Home Assistant's bullet below also
covers its one write path, the only one in this whole list):

- **GitHub** — talks only to api.github.com; sends only your token (as the
  Authorization header) and the queries for your own PRs, issues,
  notifications, and (opt-in, off by default) your contribution calendar
  via GitHub's GraphQL endpoint. Refreshed roughly every 5 minutes.
- **GitLab** — talks only to your configured GitLab instance (gitlab.com
  unless you've pointed it at your own); sends only your token (as the
  Authorization header) and the queries for your own merge requests and
  to-dos, plus, opt-in and off by default: merge requests where you're the
  requested reviewer, and your contribution calendar (fetched from
  `/users/{username}/calendar.json` on that same configured instance — no
  new host). Refreshed roughly every 5 minutes.
- **Jira** — talks only to your own Jira Cloud site
  (`yoursite.atlassian.net`); sends only your email and API token (as
  HTTP Basic auth) and the query for issues assigned to you. Refreshed
  roughly every 10 minutes.
- **Vercel** — talks only to api.vercel.com; sends only your token (as the
  Authorization header) and the query for your own recent deployments.
  Refreshed roughly every 5 minutes.
- **Crypto** — talks only to api.coingecko.com; sends only the coin ids
  you chose — no account, no token. Refreshed roughly every 5 minutes.
- **Calendar** — fetches only the secret calendar addresses you've added,
  up to 5; each address itself is treated as a secret (see "Token
  connectors" above) and never leaves your device except to its own
  calendar host. Refreshed roughly every 15 minutes. Meeting URLs (Zoom,
  Meet, Teams, Webex, Whereby) are parsed locally out of whatever your
  calendar feed already sent — no separate fetch, and Aurora never sends
  the URL anywhere; a link only opens when you click it.
- **Status** — talks only to the public status endpoint(s) you've added,
  up to 8: six curated picks (GitHub, Cloudflare, OpenAI, npm, Vercel,
  Discord's own statuspage.io status pages) or any statuspage.io-style URL
  you paste in yourself. No account, no token — sends nothing but the
  request itself. A service that fails to respond reads as unknown (a gray
  dot), never as a stale "healthy" reading carried over from an earlier
  check — the one connector where a failed fetch is deliberately shown
  rather than papered over, since a status widget that could show a stale
  green during a real outage would be actively misleading. Refreshed
  roughly every 5 minutes.
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
  depending on what you choose; Aurora treats it only as dashboard data and
  sends it nowhere except in requests to that same connected instance. The
  action controller checks `/api/` for health and does not use that endpoint
  for ordinary state polling. Selected entities are polled at most once
  every 60 seconds, and only while a tab with the widget open is
  on-screen — there's no background timer of its own. A chip's text
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
  above. This is the only place in Aurora that ever sends a command
  rather than a request for data.

## Data collection, sale, and sharing

Aurora does not collect any data on the developer's behalf, in any form —
there is no server for it to be collected to. Aurora transfers data only
when necessary to provide the user-requested dashboard feature described in
this policy: directly to Chrome or to the weather, NASA, cloud, feed,
calendar, status, or self-hosted provider the user selected. Aurora does not
sell, rent, or trade user data; transfer it to advertising platforms, data
brokers, or information resellers; use it for personalized advertising or
profiling; allow the developer or other humans to read it; use or transfer it
for a purpose unrelated to the extension's single disclosed purpose; or use
or transfer it to determine creditworthiness or for lending.

Aurora's use of information received from Chrome APIs complies with the
Chrome Web Store User Data Policy, including its Limited Use requirements.
Aurora uses that information only to provide or improve its single purpose as
a local-first new-tab dashboard, and only makes the functionality-necessary
transfers disclosed above.

## Children's privacy

Aurora is not directed at children and does not knowingly collect information
on the developer's behalf from anyone, of any age. See "What Aurora stores"
above: every value listed there is generated by your own use of the dashboard
and stored only on your device, except for the functionality-necessary direct
requests disclosed under "Network calls."

## Changes to this policy

If this policy changes, the updated version will be published at the same
location with a new effective date above. Because Aurora has no Aurora account
and no way to contact users directly, checking this page is the only way to
learn of changes.

## Contact

Questions about this policy or Aurora's data practices: open an issue on
the project's GitHub repository issue tracker —
[github.com/jcooler/aurora-newtab/issues](https://github.com/jcooler/aurora-newtab/issues).
