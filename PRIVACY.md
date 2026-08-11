# Aurora Privacy Policy

**Effective date:** August 8, 2026

Aurora is a new-tab dashboard extension for Chrome. This policy describes,
completely, what Aurora stores, what it sends over the network, and to whom.
If something isn't listed here, Aurora doesn't do it.

## Summary

Aurora has no backend and no accounts. It does not collect, sell, rent, or
transfer any of your data to anyone, for any purpose — including to the
developer. There is no analytics and no tracking of any kind. Everything
Aurora stores lives only on your own device. The outbound network calls
Aurora makes on its own, with no action from you beyond turning a widget
on, are three read-only, keyless weather/location lookups described in full
below. Beyond those, Aurora's **Connectors** framework lets you point it at
outside sites yourself — RSS, GitHub, GitLab, Jira, Vercel, Crypto,
Calendar, and Status today — and every such request goes directly from
your browser to the site you configured, never through any server Aurora
operates (it has none). Four of those eight (GitHub, GitLab, Jira, Vercel)
need a credential — a personal access token, or for Jira, an email + API
token — which is stored locally like everything else and sent only to the
one service it authenticates to; the other four (RSS, Crypto, Calendar,
Status) need no credential at all. See "Connectors" below for the complete
disclosure.

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
  upload, or a flat gradient — and, in rotation mode, which photo)
- Weather cache (the last forecast fetched)
- Your saved location (latitude/longitude rounded to two decimal places,
  i.e. roughly 1 km precision, plus a display label)
- Notes (the scratchpad text)
- World clocks and countdowns you've configured
- Habits (the habit names you've added and which days you've marked each
  one done)
- Widget layout (the on-screen position of each widget, if you've used
  "Arrange layout" to move anything from its default spot)
- Connector configuration (e.g., for RSS: which feed URLs you've added; for
  GitHub/GitLab/Jira/Vercel: the token or email+token you connected with;
  for Calendar: the calendar addresses you added, up to 5; for Crypto: the
  coins you chose; for Status: the services you've added — curated picks
  or custom status page URLs — up to 8)
  and a local cache of what each connector last fetched, so a widget
  doesn't need to refetch every time you open a new tab. See "Connectors"
  below.

**Uploaded background photos** are the one exception to `chrome.storage.local`:
if you choose "My photo" and upload your own image(s), each image is stored
locally in the browser's IndexedDB, as a blob, on your device only. It is
never uploaded anywhere, never included in the JSON backup described below,
and never leaves your machine.

**Backup export/import.** Settings → Data lets you export everything above
— except uploaded photos (per the previous paragraph) and connector cache
data (e.g. cached RSS headlines, which is disposable and rebuilt
automatically, not something you entered) — to a JSON file you choose to
save, and re-import it later. Connector configuration itself (e.g. your RSS
feed list) IS included in the export, minus any field that connector
declares as secret — every GitHub/GitLab/Jira/Vercel token, and every
calendar address you've added to the Calendar connector, is stripped from
the exported file automatically, before it's ever written to disk (see "Connectors" below for
the full per-connector list and the mechanism that enforces it). This file
is created and read entirely on your device — Aurora never
uploads it anywhere on its own. Where that file goes afterward (cloud
drive, email, USB stick, etc.) is entirely up to you and outside Aurora's
control.

None of the above is ever sent to the developer, to analytics services, or
to any third party. There is no server that Aurora's storage or backups
pass through.

## Network calls

Aurora makes network requests to exactly three **fixed** endpoints, all
operated by third-party services (Aurora itself has no server), all
read-only, all keyless (no account, sign-in, or API key involved), and all
sent no more data than described below — plus, if and only if you've
configured a Connector, requests to the site(s) you configured (item 4
below):

1. **Weather forecast** — `api.open-meteo.com`, once the Weather widget is
   turned on and a location is set. Sends only your saved latitude/longitude
   (rounded to ~1 km, as stored). Refreshed periodically while the widget is
   visible and on demand when you click refresh.
2. **City search (geocoding)** — `geocoding-api.open-meteo.com`, only while
   the Weather widget is on and you're actively typing into its city search
   box (debounced ~300ms, and only once you've typed at least 2 characters —
   not on every keystroke, and not at all unless you open that search box).
   Sends only the text you've typed so far.
3. **One-time reverse geocode** — `api.bigdatacloud.net`, only at the exact
   moment you click "Use my location" in the Weather widget, so Aurora can
   label the forecast with a real place name instead of "My location." Sends
   the same ~1 km-rounded coordinates the forecast call already uses. This
   call happens once per click of that button, never on a schedule.
4. **Connector fetches** — only to the connector(s) you've actually
   configured yourself in Settings → Connectors (RSS, GitHub, GitLab, Jira,
   Vercel, Crypto, Calendar, Status); there are none until you add or
   connect one. Each fetch is a single HTTP request sent directly from your
   browser to that connector's own host — nothing is sent but the request
   itself (plus a token/credential for the four that need one), and no
   Aurora server sees or relays it, because Aurora has none. Refreshed on a
   per-connector interval (5 minutes for GitHub/GitLab/Vercel/Crypto/
   Status, 10 for Jira, 15 for Calendar, 30 for RSS), or sooner if you open
   a widget with a stale cache. See "Connectors" below for the full,
   per-connector disclosure, including the permission model that gates
   which sites Aurora is even allowed to reach.

Aurora makes no other network calls. In particular: no analytics, no
telemetry, no crash reporting, no ad networks, no remote fonts or scripts,
and no "phone home" of any kind. The extension's own UI (HTML/CSS/JS,
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
  reach a site you point it at. Declaring the wildcard makes every
  `https://` origin *eligible* to be requested; it grants none of them, and
  none is held until you act. Adding a feed, or clicking "Connect" on a
  token-based connector, in Settings → Connectors requests exactly that
  connector's origin (e.g. `https://example.com/*`, or `https://
  api.github.com/*`) via Chrome's own native per-site permission prompt —
  the same kind of prompt `bookmarks` above uses, just scoped to one site
  instead of one API. Declining leaves the connector un-added. Removing the
  last feed/connection pointed at a given origin revokes that origin's
  permission automatically (`chrome.permissions.remove`); other origins
  you've granted are unaffected. See "Connectors" below for the full model.

## Connectors

Connectors are Aurora's framework for fetching data from a source you
configure yourself, rather than a fixed built-in service. The pattern is
always **direct client → provider**: every connector request goes straight
from your browser to the site you configured, never through any server
Aurora operates (it has none) and never past any other third party. Nothing
about the request — not its contents, not the fact that it happened — is
visible to Aurora's developer or anyone else.

**Per-origin grants, on your action only.** A connector gets no network
access to anything until you explicitly configure it to reach a specific
site. Adding a feed URL, or clicking "Connect" on a token-based connector,
triggers Chrome's native permission prompt for that one origin the instant
you act — see "Permissions" above for the mechanism. Nothing is
pre-granted at install, nothing is granted in the background, and removing
the last thing pointed at a given origin releases that origin's permission
automatically.

**Token connectors.** RSS, Crypto, Calendar, and Status need no credential
(`auth: 'none'`) — there's nothing to keep secret beyond, for Calendar,
each calendar address itself (see below). GitHub, GitLab, Jira, and Vercel do
require a credential to read your own data, and each one stores it only in
`chrome.storage.local`, on your device, exactly like everything else
Aurora stores — never sent anywhere except to the one provider it
authenticates to. This is enforced mechanically, not just promised: every
connector declares, in Aurora's connector registry, which of its config
fields (if any) are secret; the backup exporter reads that declaration and
strips every field so listed before a backup file is ever written, for
every connector, automatically — there is no separate list to remember to
update. GitHub/GitLab/Vercel each declare their token secret; Jira declares
its API token secret (the email address travels with the rest of the
config, unstripped — it identifies you to Jira, the same way a username
would, and isn't itself a bearer credential); Calendar declares its whole
`calendars` list (every entry's own address) secret, since each address
alone is what grants read access to that calendar — up to 5 per the
connector's own cap; RSS, Crypto, and Status declare no secret fields,
because they have none — a status page URL, curated or custom, grants no
access to anything and identifies no one.

**RSS, concretely.** Aurora fetches only the feed URLs you've added in
Settings → Connectors — nothing else — at most about once every 30 minutes
per feed (or sooner, on demand, if you open the widget with a stale cache).
Each fetch is a single HTTP GET straight to that feed's own host; nothing
is sent but the request itself. The response — headline titles, links,
source names, and publish dates — is parsed on your device and cached
locally (as part of "What Aurora stores," above) purely so the widget
doesn't need to refetch on every new tab; that cache is excluded from
backup exports entirely, same as uploaded photos, because it's disposable
and rebuilds itself rather than being data you entered.

**The other seven, concretely** — each fetch is a single HTTP request sent
directly from your browser to the named host, cached locally the same way
RSS is (and excluded from backup exports the same way), and refreshed on
its own interval or sooner on demand:

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
  calendar host. Refreshed roughly every 15 minutes.
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

## Data collection, sale, and sharing

Aurora does not collect any data on the developer's behalf, in any form —
there is no server for it to be collected to. Aurora does not sell, rent,
trade, or otherwise transfer any user data to any third party for any
purpose, including advertising. Aurora does not use or transfer data for
purposes unrelated to the extension's single, disclosed purpose (a local
new-tab dashboard), and does not use or transfer data to determine
creditworthiness or for lending purposes.

## Children's privacy

Aurora is not directed at children and does not knowingly collect
information from anyone, of any age — see "What Aurora stores" above: every
value listed there is generated by your own use of the dashboard and stored
only on your device.

## Changes to this policy

If this policy changes, the updated version will be published at the same
location with a new effective date above. Because Aurora has no accounts
and no way to contact users directly, checking this page is the only way to
learn of changes.

## Contact

Questions about this policy or Aurora's data practices: open an issue on
the project's GitHub repository issue tracker —
[github.com/jcooler/aurora-newtab/issues](https://github.com/jcooler/aurora-newtab/issues).
