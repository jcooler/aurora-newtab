# Aurora

A calm, local-first new-tab dashboard for Chrome. No Aurora account, no tracking,
no backend — stored data stays on your machine, with selected features making
direct provider requests only as disclosed below.

## Features

- **Clock & greeting** — large local time, time-of-day greeting.
- **World clocks & countdown** — up to four extra time zones shown under
  the local clock, plus a countdown line for the nearest upcoming date
  you've added — both configured from Settings.
- **Daily focus** — one thing you're focusing on today; resets each morning.
- **Search bar** — searches with your browser's default search engine, via
  Chrome's own Search API (`chrome.search`).
- **Quick links** — a small drag-to-reorder tile grid with favicons.
- **Weather** — current conditions + next-12-hours forecast via Open-Meteo,
  from your device location or a searched city; expand it for feels-like
  temperature, humidity, rain probability with an unambiguous hour, wind
  speed with a compass label and matching direction arrow, and distinct
  sunrise/sunset facts. No API key needed.
- **Background photos** — a bundled, hand-curated set of landscape photos
  that rotates daily, or upload your own as a gallery (add several at once,
  remove any one from a thumbnail strip, rotates through the rest), or use
  a flat gradient. A fourth, opt-in source — NASA's Astronomy Picture of the
  Day — fetches one new photo a day from NASA's public API once you switch
  to it in Settings → General → Background, and asks Chrome for permission
  to reach NASA's two hosts the moment you do; see
  [Privacy](#privacy) for what that call sends.
- **Bookmarks bar** — your browser's actual bookmarks bar, rendered as a row
  of folder and favicon chips; click a folder to drill into it (with a
  breadcrumb back button for nested subfolders). Off by default; reads your
  existing bookmarks, never creates or modifies any.
- **Habit streaks** — a small set of daily habits as tap-to-mark chips, each
  showing its current streak; yesterday keeps a streak alive until you mark
  today, so one slow morning doesn't cost you the count. Off by default.
- **Month calendar** — a glance-sized month grid for "what date is the 3rd
  Friday" questions, with today ringed and a dot on any date you've added a
  countdown for. Off by default.
- **Sun times** — today's sunrise, sunset, and (when the sun climbs high
  enough that day) evening golden hour, computed locally from your saved
  location with no network call at all. Off by default; needs a location set
  in Weather first.
- **Moon phase** — today's moon phase name and glyph, computed locally with
  no network call at all; the glyph mirrors for a southern-hemisphere
  location. Off by default; needs a location set in Weather first.
- **Connectors** — an extensible framework for reaching outside sources
  from the dashboard, one card per source under Settings → Connectors,
  each asking Chrome for access to exactly the site you add and nothing
  more. Nine connectors ship today: **RSS**, **GitHub**, **GitLab**,
  **Jira**, **Vercel**, **Crypto**, **Calendar** (any ICS/iCal feed),
  **Status** (a quiet dot row for services you depend on), and
  **Home Assistant** (state chips and one-tap action buttons for your own
  smart home — the one connector that can also send a command, not just
  read). See [Connectors](#connectors) below for what each one shows,
  what it reads (and, for Home Assistant, sends), and how the permission
  model works.
- **To-do lists** — a lightweight panel for day-to-day tasks.
- **Focus timer & Flow:** A Pomodoro-style work/break timer with a chime.
  Start Flow to clear the page down to today's focus, the live timer, and the
  first unfinished task over the current photograph. The same session and
  absolute deadline stay synchronized across new tabs; Pause and End flow do
  not alter the active named layout.
- **Notes** — a small autosaving scratchpad pinned to the corner, for
  jotting anything down; saves locally as you type.
- **Daily quote** — one quote a day from a small bundled set.
- **Command palette** — `Ctrl+K` / `Cmd+K` to jump to a link, open Settings,
  search the web, or quick-add a to-do (`todo: buy milk`).
- **Widget color** — one default surface (an Aurora-accent glow over a deep
  neutral panel); open Settings → General → Appearance and pick any color
  instead — every panel's text adapts automatically to stay readable against
  it, light pick or dark. "Reset" returns to the default surface. Switches,
  inputs, and every other control in Settings use one modernized, consistent
  kit.
- **Keyboard accessible** — every widget is reachable and operable from the
  keyboard; Settings' own tab bar is a proper APG tabs pattern (arrow keys
  move and apply the selection, roving tabindex), and every switch is a
  native `<button role="switch">` (Space/Enter, platform focus/disabled
  semantics) rather than a styled checkbox.
- **Named layouts & live editing** — create and switch layouts, hover a
  widget for Move and Settings, drag it anywhere on the live page, choose
  its Compact/Standard/Full presentation, layer or hide it, and create
  precisely positioned top or bottom docks. Save commits the draft; Cancel
  restores the exact stored layout. Aurora never changes layouts or
  rearranges authored positions on its own.

Settings is organized into four tabs: **General** (name/greeting, 24-hour
clock, widget color, units, mute, background), **Widgets** (per-widget on/off
toggles, weather location, world clocks, countdowns, and named layouts),
**Connectors** (outside data sources — see [Connectors](#connectors) below),
and **Data** (backup/restore, plus the About footer). Every widget can be
turned on or off from Settings, and every setting is optional — the
dashboard is fully usable with nothing configured beyond the defaults.

## Install (from source)

Aurora isn't on the Chrome Web Store; load it as an unpacked extension:

```bash
npm install
npm run build
```

Then in Chrome: go to `chrome://extensions`, enable **Developer mode** (top
right), click **Load unpacked**, and select the `dist/` folder. Open a new
tab to see it.

## Development

```bash
npm run dev              # Vite dev server with HMR; load unpacked the same way as above
npm test                 # unit tests (Vitest)
npm run test:information-first-contract # Node-only information-first matrix contract
npm run build            # type-check (tsc --noEmit) + production build into dist/
node scripts/preview.mjs # builds nothing itself — run `npm run build` first — then
                          # loads dist/ in real Chromium via Playwright and captures
                          # screenshots of every screen/state into screenshots/
npm run package           # production build, verified (version match, no bookmarks-
                           # permission leak, no sourcemaps, icons/photos present), then
                           # zipped (contents at root) to release/aurora-<version>.zip
node scripts/store-shots.mjs           # requires `npm run build:preview` first (same
                                        # reason as scripts/preview.mjs above): captures
                                        # the 5 Chrome Web Store listing screenshots, each
                                        # exactly 1280x800, into release/store-shots/
node scripts/build-candidates.mjs      # dev-only: downloads native-res background photo
                                        # candidates (Unsplash + NASA/Commons CC0/PD) into
                                        # .photo-work/candidates/ and writes
                                        # scripts/photo-candidates.json
node scripts/contact-sheet.mjs         # dev-only: builds numbered contact sheets from the
                                        # downloaded candidates for visual review/culling
node scripts/encode-photos.mjs         # dev-only: encodes every non-excluded candidate into
                                        # dual AVIF tiers (2560x1600 + 3840x2400) into
                                        # public/photos/ and writes
                                        # src/services/photos/photos.json with credits
node scripts/verify-photo-manifest.mjs # dev-only: checks the photo manifest and its AVIF
                                        # files are consistent (npm run verify:photos — also
                                        # runs automatically as `npm test`'s pretest hook, so
                                        # a broken/incomplete photo manifest fails CI too)
node scripts/make-icons.mjs            # dev-only: regenerates public/icons/icon{16,48,128}.png
                                        # from an inline SVG via Playwright
```

Pass `--headed` to `scripts/preview.mjs` (`node scripts/preview.mjs --headed`)
to watch the run in a visible browser window instead of headless.

## Weather note

Weather is powered by [Open-Meteo](https://open-meteo.com/), a free service
that needs no API key and no sign-up. Aurora sends it only a latitude and
longitude (rounded to ~1km) and, for city search, whatever you've typed into
the city search box so far — suggestions filter as you type (debounced, so
it's not a call per keystroke), not only after you press Enter. Your location
is stored locally and is never sent anywhere else.

## Connectors

Connectors are Aurora's framework for pulling data from a source you point
it at, instead of a fixed built-in service (contrast with Weather, above,
which always talks to Open-Meteo). Each connector is a small, self-contained
package — a config card in Settings → Connectors, a widget, and a service
module — but the generic plumbing around all of them (caching what was last
fetched, asking Chrome for permission to reach a site, and keeping anything
sensitive out of backup exports) is written once and shared. **RSS** was the
first connector; the framework was built so adding another source meant
writing that connector's own card/widget/service, not re-solving caching,
permissions, or backups again — the other eight below are exactly that.
Every connector reads; one, Home Assistant, can also send a command back
to the source you connected — see its own entry below for exactly what
that means.

Find connectors by name or purpose — the catalog is searchable, and
anything on your board stays pinned on top.

**RSS**, concretely: turn it on in Settings → Connectors, add up to 5
`https://` feed URLs, and pick how many headlines to show (3–8). Aurora
fetches each feed directly from your browser — there's no Aurora server in
the middle relaying the request — merges the results newest-first, and
caches them locally so the widget doesn't refetch on every new tab (about
once every 30 minutes, or sooner if you refresh). Treat each full feed URL
as a capability secret: it can contain an unguessable token that grants read
access, so Aurora redacts it from JSON backups and requires re-entry after
restore.

The other eight, briefly — what you see, and what Aurora reads (and, for
one connector, writes) to show it. Every connector card is composable —
choose what each shows in Settings → Connectors:

- **GitHub** — your open PRs waiting on your review, issues assigned to
  you, an unread-notifications count, and a 16-week commit-activity graph;
  choose which of the four appear. Connect with a personal access token;
  reads `api.github.com`.
- **GitLab** — merge requests assigned to you, merge requests waiting on
  your review, a to-dos count, and an activity graph; choose which of the
  four appear. Connect with a personal access token against your instance
  (`gitlab.com` unless you point it at your own).
- **Jira** — issues assigned to you (unresolved, newest first), a
  status-count line, and issues due soon; choose which of the three
  appear. Connect with your email and an API token against your own Jira
  Cloud site (`yoursite.atlassian.net`).
- **Vercel** — your most recent deployments (failed ones surfaced first,
  then newest to oldest) and a status summary; choose which of the two
  appear. Connect with a personal access token; reads `api.vercel.com`.

For all four of the above, turning a section off can only reduce what its
card fetches, never add to it. Most sections gate their own request
independently; two ride along with a sibling instead — Jira's
status-count line reads off the assigned-issues request rather than
firing one of its own, and Vercel's deployments and status summary share
a single request that keeps firing as long as either section is on.

- **Crypto** — live price and 24-hour change for up to 5 coins you choose.
  No account, no token — reads the public `api.coingecko.com` markets
  endpoint.
- **Calendar** — up to 5 named calendars in one card, each with its own
  colored dot; paste any calendar app's ICS/iCal feed URL, including
  `webcal://` links (Apple Calendar's own format — Aurora converts them
  automatically). Pick how you want to see them in Settings → Connectors:
  **Today** (next event + today's remaining agenda), **Upcoming** (the
  next few events across days), or **One per calendar** (each calendar's
  soonest event). When the headline event carries a Zoom, Meet, Teams,
  Webex, or Whereby link, an accent **Join** link appears starting 15
  minutes before it (or while it's running) — a **Meeting links** toggle
  on the card turns this off. No account, no token — just paste each
  feed's URL, which Aurora treats as a secret (see [Privacy](#privacy)).
- **Status** — a quiet dot row for up to 8 services you depend on: green
  and silent on a normal day, with trouble text appearing only for a
  service that's actually down (worst first). Pick from seven curated
  status pages (GitHub, Cloudflare, OpenAI, npm, Vercel, Claude, Discord) or
  add any statuspage.io-style URL yourself. No account, no token — reads only
  the public status endpoint each entry points to.
- **Home Assistant** — up to 6 state chips (`Kitchen 21.5°C`, `Porch light
  on`, …) and up to 3 one-tap action buttons (a scene, script, or switch),
  picked from your own instance in a searchable entity picker. Connect
  with your instance URL and a long-lived access token; **https only** —
  a plain `http://homeassistant.local:8123` URL cannot be granted, only a
  Nabu Casa cloud URL or a reverse-proxied `https://` one. This is the one
  connector that writes as well as reads: pressing an action button sends
  that one command to your own instance, only on that click, never on a
  schedule — every other connector on this page, Home Assistant's own
  state poll included, only ever reads. Polled at most once a minute,
  Aurora's shortest interval, since home state goes stale faster than
  anything else here. The bulk `/api/states` request runs only when you open
  the entity picker; regular refreshes request each selected
  `/api/states/{entity_id}`. Aurora uses `/api/config` once while connecting,
  `/api/` only for action health, and posts to the selected service endpoint
  only on an action click.

**The permission model** is per-site, not all-or-nothing. Aurora's manifest
lists every `https://` origin as *requestable*, but none is granted until
you act: the moment you click "Add" on a feed URL or "Connect" on a
token-based connector, Chrome shows its own native permission prompt scoped
to that one site only (the same kind of prompt Bookmarks bar uses) —
decline it, and the connector simply isn't added. Remove the last
feed/connection pointed at a given site, and Aurora releases that site's
permission automatically; other sites are unaffected. Every connector added
or removed follows the same site-by-site rule.

## Photo credits

The bundled background set is 23 hand-curated landscape and aurora/night-sky
photos, shipped as two AVIF resolution tiers each (2560x1600 and 3840x2400 —
see [`src/services/photos/tier.ts`](src/services/photos/tier.ts) for how the
tier is picked). 21 are used under the
[Unsplash License](https://unsplash.com/license) (free to use, no
attribution legally required — credited here anyway); 2 are Public Domain
U.S. government works (NASA and the National Park Service). Full curation
notes, including every candidate that was reviewed and rejected and why,
live in [`scripts/photo-candidates.json`](scripts/photo-candidates.json).

- [v2osk](https://unsplash.com/photos/aurora-borealis-Ovn1hyBge38) — Unsplash License
- [Serey Kim](https://unsplash.com/photos/aurora-borealis-vUePu7hAYAQ) — Unsplash License
- [Jussi Hellsten](https://unsplash.com/photos/a-mountain-covered-in-snow-under-a-green-and-purple-sky-1uwLmA5LFfg) — Unsplash License
- [Jon Anders Dalan](https://unsplash.com/photos/green-aurora-lights-over-lake-DmA484UHAzw) — Unsplash License
- [Robson Hatsukami Morgan](https://unsplash.com/photos/silhouette-of-mountains-under-milky-way-galaxy--wEFdRCG4IU) — Unsplash License
- [Condor Wei](https://unsplash.com/photos/blue-and-black-sky-with-stars-oMcTmNHclZI) — Unsplash License
- [Sami Matias Breilin](https://unsplash.com/photos/aurora-borealis-UZOpP-YHe9Q) — Unsplash License
- [Federico Di Dio photography](https://unsplash.com/photos/green-aurora-lights-during-night-time-JWHSIG1kM2c) — Unsplash License
- [Pinal Jain](https://unsplash.com/photos/silhouette-of-mountains-during-daytime-x-XwnC7FgFM) — Unsplash License
- [Renato Muolo](https://unsplash.com/photos/snow-covered-mountain-under-blue-sky-during-night-time-evJh_sTH0b8) — Unsplash License
- [Simon Lohmann](https://unsplash.com/photos/green-mountains-under-blue-sky-during-daytime-I_n_b44cqhk) — Unsplash License
- [Toan Chu](https://unsplash.com/photos/green-and-brown-mountains-under-white-clouds-and-blue-sky-during-daytime-YKN_G9L9nMA) — Unsplash License
- [Siru Zhou](https://unsplash.com/photos/a-forest-covered-in-fog-and-low-lying-clouds-iOvuSPwZLFY) — Unsplash License
- [pine watt](https://unsplash.com/photos/aerial-shot-of-forest-2Hzmz15wGik) — Unsplash License
- [Nadjib Bouarar](https://unsplash.com/photos/green-trees-on-brown-field-during-daytime-ljDlHHMqHRg) — Unsplash License
- [Sebastian Unrau](https://unsplash.com/photos/trees-on-forest-with-sun-rays-sp-p7uuT0tw) — Unsplash License
- [Luca Bravo](https://unsplash.com/photos/body-of-water-surrounded-by-pine-trees-during-daytime-ESkw2ayO2As) — Unsplash License
- [Oleksii Piekhov](https://unsplash.com/photos/a-large-body-of-water-surrounded-by-mountains-meFvVI-mz0k) — Unsplash License
- [Reed Naliboff](https://unsplash.com/photos/a-large-sand-dune-in-the-middle-of-a-desert-23tpftFIAD0) — Unsplash License
- [Andrew Svk](https://unsplash.com/photos/a-group-of-sand-dunes-with-a-blue-sky-in-the-background-0s9oD70F-l4) — Unsplash License
- [Ze Paulo Galveias](https://unsplash.com/photos/brown-sand-dunes-under-white-sky-during-daytime-GeReAnOMiZ8) — Unsplash License
- Image credit: NASA / Expedition 72 crew, International Space Station — [details](https://images.nasa.gov/details/iss072e159172) — Public Domain (U.S. government work)
- Mary Lewandowski / National Park Service, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Aurora_in_Denali_(7c1dff32-ca2f-41f1-bbc1-65cf123bc3cf).jpg) — Public Domain

## Font credits

The type system uses two locally-bundled variable fonts (woff2, latin subset,
under [`public/fonts/`](public/fonts)) — no runtime font requests, per
[PRIVACY.md](PRIVACY.md). Both are licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org/):

- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) by
  Florian Karsten — display type (clock, greeting).
- [Inter](https://fonts.google.com/specimen/Inter) by Rasmus Andersson —
  body/UI type (everything else).

## Widget color

There's one default surface — an Aurora-accent glow (`--accent: #7dd3fc`)
over a deep neutral panel — defined once in `src/theme/themes.css`'s `:root`
block (the collapse of an earlier three-theme system into a single surface).
Settings → General → Appearance lets you pick any color instead:
`settings.panelColor` (a `#rrggbb` hex, or `null` for the default) re-tints
`--panel`/`--panel-solid` at runtime via `applyPanelColor` in
[`src/theme/index.ts`](src/theme/index.ts), deriving `--fg`/`--fg-muted` and
the `color-scheme` flip from the pick's own relative luminance
([`src/lib/color.ts`](src/lib/color.ts)) so panel text stays readable
against whatever you choose, light or dark. Text that floats directly on the
background photo (the clock, greeting, quote, and similar) keeps its own
fixed light ink (`--canvas-fg`/`--canvas-fg-muted`) regardless of your pick,
since the photo behind it never changes color. "Reset" clears `panelColor`
back to `null`, restoring the default surface.

## Adding a widget

1. Create a folder under `src/newtab/widgets/<name>/` with a
   `<Name>Widget.tsx` default export. Gate its rendering on
   `settings.widgets.<key>` at the top of the component (return `null` when
   off) — this keeps disabled widgets from mounting any effects, timers, or
   network calls at all.
2. Add a `<key>: boolean` to `WidgetToggles` in
   `src/lib/storage/schema.ts`, and a default value in that file's
   `defaults()`.
3. In the SAME change as step 2: bump `CURRENT_VERSION` in
   `src/lib/storage/schema.ts` and add a matching step to
   `src/lib/storage/migrations.ts`, keyed to the version upgraded FROM, that
   backfills the new key (see schema.ts's own STANDING RULE comment above
   `WidgetToggles`). `defaults()`'s merge only backfills missing top-level
   keys, never a new field nested inside an already-present
   `settings.widgets` object, so skipping this leaves existing users'
   stored settings without the new key — and `backup.ts`'s strict
   `isWidgetToggles` validator then rejects any pre-existing backup file
   wholesale on import, not partially.
4. Add a label to `WIDGET_LABELS` in `src/settings/sections/Widgets.tsx` so
   it shows up in the Settings → Widgets list.
5. Mount it in `src/newtab/App.tsx`, wrapped in
   `<WidgetBoundary name="...">` — a widget that throws must never take the
   rest of the page down with it.

## Data

Settings → **Data** lets you back up and restore everything Aurora stores,
as a single JSON file:

- **Export** downloads `aurora-backup-YYYY-MM-DD.json` — a pretty-printed
  envelope (`app`, `version`, `exportedAt`, and `data`) containing every
  stored key: settings, quick links, to-do lists, the focus timer config,
  today's focus text, background preferences, weather cache, location,
  notes, world clocks, countdowns, and connector configuration — with any
  field a connector marks as secret (a GitHub/
  GitLab/Jira/Vercel/Home Assistant token, or the Calendar connector's
  saved calendar addresses, or an RSS feed list) stripped out first (see
  [Connectors](#connectors)).
- **Background photo uploads are not included**, and neither is connectors'
  cached data (e.g. fetched RSS headlines). Photos live in IndexedDB as a
  blob and connector caches are disposable, re-fetched automatically —
  neither is the JSON-serializable data the backup covers; re-select your
  image after restoring if you were using an uploaded background.
- **Import** reads a backup file you choose, checks that it's a real Aurora
  backup, and — if it is — shows a one-line summary of what it contains and
  asks you to confirm before it replaces anything. Nothing is overwritten
  until you click **Confirm**. Backups from older versions of Aurora are
  migrated forward automatically before that summary is shown.
- If the chosen file isn't a valid Aurora backup (wrong format, wrong app, a
  version newer than this build understands, or a field that doesn't match
  what Aurora expects — e.g. a hand-edited or corrupted value), Import shows
  why, names the field, and leaves your current data untouched.

## Support

If Aurora's useful to you, there's a quiet "☕ Buy me a coffee" link in
Settings' footer — or go straight to [buymeacoffee.com/joncooler](https://buymeacoffee.com/joncooler).

## Privacy

The full, standalone privacy policy (Chrome Web Store submission copy,
audited line-by-line against this codebase) lives in
[`PRIVACY.md`](PRIVACY.md). Summary:

Aurora has no backend and requires no Aurora account. Third-party accounts
are used only when you choose a credentialed connector. All of your data — settings, quick
links, to-do lists, focus timer config, today's focus text, background
preferences, weather cache, location, notes, world clocks, countdowns,
habits, widget layout, and connector configuration (e.g. your RSS feed
list) — is stored locally in `chrome.storage.local`. The one exception is an
uploaded background photo, which is stored locally in IndexedDB (as a blob,
never uploaded anywhere).


The **fixed** outbound network calls Aurora makes on its own are to
Open-Meteo: the forecast endpoint (`api.open-meteo.com`), only once the
weather widget is enabled and a location is set, and the geocoder
(`geocoding-api.open-meteo.com`), only while the widget is enabled and
you're actively searching for a city — queried as you type (debounced by
~300ms, at least 2 characters), not only when you press Enter — plus a
single keyless reverse-geocode lookup (`api.bigdatacloud.net`) at the
moment you click "Use my location", so the widget can label your weather
with a real place name. That lookup happens once, only for device location,
and sends the same ~1 km-rounded coordinates the forecast call already
uses. Beyond those fixed calls, the **Connectors** framework lets you point
Aurora at outside sites yourself — RSS, GitHub, GitLab, Jira, Vercel,
Crypto, Calendar, Status, and Home Assistant today: every connector fetch
goes directly from your browser to that connector's own host, with no
Aurora server in between, only for connectors you've actually configured.
GitHub/GitLab/Jira/Vercel/Home Assistant send only the token (or, for
Jira, email + token) you connected with; Crypto, Calendar, and Status need
no third-party account. RSS and Calendar URLs are capability secrets even
without an account and are redacted from backups. Home Assistant is the one connector that also writes:
its action buttons send a single command to your own instance, only when
you click one, never on a schedule (see [Connectors](#connectors) and
[`PRIVACY.md`](PRIVACY.md) for the full disclosure). There is no
analytics, no telemetry, and no tracking of any kind.

Connector credentials and RSS/Calendar capability URLs remain local
plaintext in `chrome.storage.local`, protected by the Chrome/OS profile—not
encrypted or vault-grade. On a shared or untrusted profile, disconnect
connectors or clear Aurora's extension data after use. Provider responses are
cached locally after direct receipt; Aurora never relays them through a
backend.

The **Bookmarks bar** widget is off by default, and the `bookmarks`
permission it needs is requested only when you turn it on — not at install.
Flipping it on in Settings prompts Chrome to ask whether Aurora may read your
bookmarks; decline, and the widget simply stays off (with a note explaining
why) until you try again. Grant it, and Aurora reads your browser's
bookmarks tree with `chrome.bookmarks.getTree()` to render it — that read
happens locally, is rendered locally, and is never transmitted anywhere.
Aurora only reads your bookmarks, it never creates, edits, or deletes any.

**Connectors** work similarly, but per-site rather than as one on/off
switch: Aurora's manifest lists every `https://` origin as *requestable*
(`optional_host_permissions`), but none is granted at install. Adding a
feed or clicking "Connect" on a token-based connector in Settings →
Connectors triggers Chrome's native permission prompt for that one origin
only — decline, and the connector isn't added; grant, and Aurora can fetch
just that site. Removing the last feed/connection on a site revokes that
site's permission automatically.

The `geolocation` permission works differently: Chrome does not allow
geolocation to be requested as an optional, runtime permission (only a
fixed list of permissions qualify, and geolocation isn't on it), so Aurora
holds it from install — the same as `storage` and `favicon` above. Holding
it is not the same as using it, though: Aurora never reads your device
location in the background, and searching for a city by name never touches
it at all. Your coordinates are read only in the instant you click "Use my
location" in the weather widget; if the browser's own location prompt is
declined at that moment, an inline note explains that the manual city
search still works.
