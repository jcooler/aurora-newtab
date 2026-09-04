# Tab Two

*The best tab for your second screen.*

A calm, local-first new-tab dashboard for Chrome. Local mode requires no Tab
Two account and makes no Tab Two backend request. The production build also
offers explicit, optional Google sign-in backed by Supabase for account identity
and signed capability leases; signing in does not enable sync or upload local
dashboard data. Encrypted sync is a separate explicit control for entitled
accounts and encrypts only reviewed product records in the extension before
sending them to the exact Tab Two Supabase origin. Premium Metrics keeps a
bounded local history of daily numeric aggregates and never acts as analytics
or telemetry. There is no analytics or tracking. Selected features make only
the direct provider requests disclosed below.

PM-P3 billing is active only in Stripe sandbox/test mode. Its hosted Supabase
boundary owns the reviewed catalog, Checkout, Portal, webhook, and resumable
same-plan Checkout logic. No live Stripe catalog, live payment, or paid launch
is active.

PM-P6 Google Calendar is limited to approved OAuth test users during hosted
sandbox validation. It is a separate, explicit, read-only connection. Tab Two's
service stores the encrypted refresh token needed to reconnect, while calendar
lists and selected event details travel directly from Google to the browser and
stay out of the Tab Two service. No Gmail, Drive, Contacts, calendar write, or
invitation access is requested.

PM-P7 Microsoft Calendar is likewise a separate, explicit, read-only sandbox
connection for supported personal and Microsoft 365 work or school accounts.
The service stores its encrypted refresh token and minimum connection metadata;
calendar lists and selected event details travel directly between Microsoft
Graph and the browser. Tab Two requests only basic profile and read-only basic
calendar access, never mail, contacts, files, calendar write, or invitation
authority.

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
  sunrise/sunset facts. The expanded briefing also shows current US AQI, UV,
  and provider-available pollen with visible meaning and source attribution.
  Forecast remains useful when that optional environmental data is unavailable.
  No API key needed.
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
- **Progress** - manual daily goals plus a derived view of your existing
  Habits, managed in a dedicated Settings tab. Its optional photo-first
  canvas rail is off by default and appears only when you explicitly enable
  or place it; Progress adds no account, sync, network request, or alert.
- **Metrics** - an off-by-default premium trend widget with Compact, Standard,
  Full, docked, and stacked views plus 7, 30, 90, and 365 day ranges. It stores
  only daily numeric aggregates in the closed Habits, Focus, Tasks, Calendar,
  and Development categories, retains at most 13 calendar months, and never
  stores task,
  habit, event, repository, project, or provider text. Existing history remains
  readable offline or after entitlement expiry. Settings > Progress provides a
  native JSON export and explicit scoped or complete deletion.
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
  with user-configured external sources asking Chrome for access to exactly
  the site you add and nothing more. Fifteen free connectors ship today: **RSS**, **GitHub**, **GitLab**,
  **Jira**, **Vercel**, **Crypto**, **Calendar**, **Status**,
  **Home Assistant**, **Linear**, **Sentry**, **Todoist**,
  **On This Day**, **Public Holidays**, and **Aurora & Kp**. A separate premium
  **Google Calendar** and **Microsoft Calendar** connectors are presently
  available only to approved sandbox users during provider validation. See
  [Connectors](#connectors) below for what each one shows, what it reads,
  the two explicit write actions, and how the permission model works.
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
- **Widget color** — one default surface (a Tab Two accent glow over a deep
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
  restores the exact stored layout. Tab Two never changes layouts or
  rearranges authored positions on its own.
- **Widget stacks:** while editing, hold one free widget over another for
  half a second to create one card with several ordered widgets. Page it with
  arrows, dots, a horizontal swipe, or Left/Right keys; drag the whole card,
  reorder or remove members, and Undo or Cancel exactly. Every member keeps
  its one existing data owner, and the card never auto-rotates or moves itself.

Settings is organized into seven tabs: **General** (name/greeting, 24-hour
clock, widget color, units, mute, background), **Progress** (manual daily
goals, the existing Habits view, and Metrics history controls), **Widgets**
(per-widget on/off toggles, weather location, world clocks, countdowns, and
named layouts),
**Connectors** (outside data sources — see [Connectors](#connectors) below),
**Data** (backup/restore, plus the About footer), **Account & Sync**
(optional Google identity, sandbox billing, encrypted sync, and devices), and
**Help** (live account, billing, and sync status; recovery guidance; and a local
diagnostic report you review before downloading).
Every widget can be
turned on or off from Settings, and every setting is optional — the
dashboard is fully usable with nothing configured beyond the defaults.

## Install (from source)

Tab Two isn't on the Chrome Web Store; load it as an unpacked extension:

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
that needs no API key and no sign-up. Tab Two sends it only a latitude and
longitude. Device location is rounded to two decimals; a selected city keeps
Open-Meteo's returned coordinates, and forecast/environment requests normalize
either source to at most four decimals. City suggestions filter the text you
type after a short debounce, not on every keystroke. Forecast uses
`api.open-meteo.com`; current AQI, UV, and available pollen use
`air-quality-api.open-meteo.com`. Both results are stored in the included local
Weather cache. Environmental failure never suppresses forecast.

## Connectors

Connectors are Tab Two's framework for pulling data from a source you point
it at, instead of a fixed built-in service (contrast with Weather, above,
which always talks to Open-Meteo). Each connector is a small, self-contained
package — a config card in Settings → Connectors, a widget, and a service
module — but the generic plumbing around all of them (caching what was last
fetched, asking Chrome for permission to reach a site, and keeping anything
sensitive out of backup exports) is written once and shared. **RSS** was the
first connector; the framework was built so adding another source meant
writing that connector's own card/widget/service, not re-solving caching,
  permissions, or backups again. Every connector reads. Home Assistant can
  send a command to your instance when you click a configured action, and
  Todoist can close a task only after you confirm it; all other connector
  operations are read-only.

Find connectors by name or purpose — the catalog is searchable, and
anything on your board stays pinned on top.

**RSS**, concretely: turn it on in Settings → Connectors, add up to 5
`https://` feed URLs, and pick how many headlines to show (3–8). Tab Two
fetches each feed directly from your browser — there's no Tab Two server in
the middle relaying the request — merges the results newest-first, and
caches them locally so the widget doesn't refetch on every new tab. Its
Balanced setting refreshes about every 30 minutes while Tab Two is visible,
or you can choose another safe preset or Manual only. Treat each full feed URL
as a capability secret: it can contain an unguessable token that grants read
access, so Tab Two redacts it from JSON backups and requires re-entry after
restore.

The remaining connectors, briefly, show what Tab Two reads and the two explicit
write actions. Every connector card is composable —
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
  `webcal://` links (Apple Calendar's own format — Tab Two converts them
  automatically). Pick how you want to see them in Settings → Connectors:
  **Today** (next event + today's remaining agenda), **Upcoming** (the
  next few events across days), or **One per calendar** (each calendar's
  soonest event). When the headline event carries a Zoom, Meet, Teams,
  Webex, or Whereby link, an accent **Join** link appears starting 15
  minutes before it (or while it's running) — a **Meeting links** toggle
  on the card turns this off. No account, no token — just paste each
  feed's URL, which Tab Two treats as a secret (see [Privacy](#privacy)).
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
  state poll included, only ever reads. Its Balanced setting polls at most
  once a minute while Tab Two is visible, since home state goes stale faster
  than anything else here; you can choose a slower safe preset or Manual only.
  The bulk `/api/states` request runs only when you open
  the entity picker; regular refreshes request each selected
  `/api/states/{entity_id}`. Tab Two uses `/api/config` once while connecting,
  `/api/` only for action health, and posts to the selected service endpoint
  only on an action click.
- **Linear** - assigned issues with workflow state, priority, due date, and
  cycle context from `api.linear.app`. Connect with a personal API key and
  optionally filter to selected teams. The Balanced preset is 15 minutes.
- **Sentry** - unresolved issues for an organization and selected projects,
  read from the official Sentry region you choose. Connect with a bearer
  token. The Balanced preset is 5 minutes.
- **Todoist** - due tasks and project names from `api.todoist.com`. Connect
  with a bearer token. Closing a task is the second and only other connector
  write path, and happens only after you explicitly confirm it. The Balanced
  preset is 5 minutes.
- **On This Day** - public historical events from Wikipedia for the current
  local month and day. It has no account or credential and refreshes on a
  fixed daily cadence.
- **Public Holidays** - public national holiday names from Nager.Date for the
  selected country and current or next year. It has no account or credential
  and stays on a fixed daily cadence without a frequency control.
- **Aurora & Kp** - the public NOAA planetary K-index forecast. It sends no
  user data and uses a 15-minute Balanced preset.

Each configurable connector offers source-safe refresh presets, Manual mode,
and **Refresh now**. Automatic refreshes run only while Tab Two is visible;
visible tabs coordinate through a Web Lock so they do not intentionally repeat
the same source request. On This Day and Public Holidays remain fixed daily
sources. Weather uses its own matching control, while severe-weather alerts
retain a separate five-minute safety check.

**The permission model** for user-configured external sources is per-site,
not all-or-nothing. Tab Two's manifest
lists every `https://` origin as *requestable*, but none is granted until
you act: the moment you click "Add" on a feed URL or "Connect" on a
token-based connector, Chrome shows its own native permission prompt scoped
to that one site only (the same kind of prompt Bookmarks bar uses) —
decline it, and the connector simply isn't added. Remove the last
feed/connection pointed at a given site, and Tab Two releases that site's
permission automatically; other sites are unaffected. The three built-in
public connectors use only their fixed disclosed hosts and need no credential
or per-origin prompt.

## Photo credits

The bundled background set is 27 hand-curated landscape and aurora/night-sky
photos. Twenty legacy entries ship as two AVIF resolution tiers (2560x1600 and
3840x2400; see [`src/services/photos/tier.ts`](src/services/photos/tier.ts) for
how the tier is picked), while six newer Unsplash entries retain their approved
native originals. 26 are used under the
[Unsplash License](https://unsplash.com/license) (free to use, no
attribution legally required, credited here anyway); 1 is a Public Domain
NASA U.S. government work. Full curation
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
- [Andrew Svk](https://unsplash.com/photos/a-group-of-sand-dunes-with-a-blue-sky-in-the-background-0s9oD70F-l4) — Unsplash License
- [Ze Paulo Galveias](https://unsplash.com/photos/brown-sand-dunes-under-white-sky-during-daytime-GeReAnOMiZ8) — Unsplash License
- Image credit: NASA / Expedition 72 crew, International Space Station — [details](https://images.nasa.gov/details/iss072e159172) — Public Domain (U.S. government work)
- [Venti Views](https://unsplash.com/photos/milky-way-shines-over-mountain-peaks-qNXhVgRfU0E) — Unsplash License
- [Oleg Demakov](https://unsplash.com/photos/milky-way-over-a-snow-capped-mountain-peak-0hU6r-vMtao) — Unsplash License
- [Troy Olson](https://unsplash.com/photos/milky-way-over-a-dark-mountain-landscape-P-wAARoptz8) — Unsplash License
- [Roberto Shumski](https://unsplash.com/photos/misty-forest-valley-with-mountains-in-background-oYEGPZebzGw) — Unsplash License
- [Patrick Untersee](https://unsplash.com/photos/dramatic-sunset-over-a-dark-mountain-valley-j3f1lwXBuAI) — Unsplash License
- [Pascal Debrunner](https://unsplash.com/photos/santis-peak-in-alpstein-region-V7EgUtCnvLY) — Unsplash License

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

There's one default surface — a Tab Two accent glow (`--accent: #7dd3fc`)
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

Tab Two's verified Expansion Platform should be the starting point for new
identities. It keeps research and starter output deterministic while production
registries, renderers, storage, permissions, and provider code remain the
authorities:

```powershell
npm run test:expansion-contract
node scripts/expansion/scaffold.mjs --id=<catalog-id> --label="<Label>" --kind=<builtin|connector|provider> --out-dir=.aurora-expansion-<identity>
```

The scaffold writes only to a new guarded `.aurora-expansion-*` scratch directory. It
does not install a feature or modify production source. Review
[`docs/superpowers/catalog/expansion/CATALOG.md`](docs/superpowers/catalog/expansion/CATALOG.md)
and the generated checklist before following the production steps below.

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

Settings → **Data** lets you back up and restore everything Tab Two stores,
as a single JSON file:

- **Export** downloads `aurora-backup-YYYY-MM-DD.json` — a pretty-printed
  envelope (`app`, `version`, `exportedAt`, and `data`) containing every
  stored key: settings, quick links, to-do lists, the focus timer config,
  today's focus text, background preferences, weather cache, location,
  notes, world clocks, countdowns, habits, manual Progress goals, aggregate
  Metrics history, per-source refresh preferences, and connector configuration
  — with any
  field a connector marks as secret (a GitHub/
  GitLab/Jira/Vercel/Home Assistant token, or the Calendar connector's
  saved calendar addresses, or an RSS feed list) stripped out first (see
  [Connectors](#connectors)).
- **Background photo uploads are not included**, and neither is connectors'
  cached data (e.g. fetched RSS headlines). Photos live in IndexedDB as a
  blob and connector caches are disposable, re-fetched automatically —
  neither is the JSON-serializable data the backup covers; re-select your
  image after restoring if you were using an uploaded background.
- **Import** reads a backup file you choose, checks that it's a real Tab Two
  backup, and — if it is — shows a one-line summary of what it contains and
  asks you to confirm before it replaces anything. Nothing is overwritten
  until you click **Confirm**. Backups from older versions remain
  migrated forward automatically before that summary is shown.
- If the chosen file isn't a valid Tab Two backup (wrong format, wrong app, a
  version newer than this build understands, or a field that doesn't match
  what Tab Two expects — e.g. a hand-edited or corrupted value), Import shows
  why, names the field, and leaves your current data untouched.

### Data portability

Settings > Account & Sync can download readable account and synced data after fresh Google verification.
This is separate from the local backup in Settings > Data, which restores this
installation. Recovery copies can be downloaded locally before restore or discard.
Tab Two does not import account-data or recovery-copy files.

The account-data download excludes passwords, sign-in sessions, payment
identifiers, provider tokens, encryption keys, raw provider caches, uploaded
images, logs, and audit records. Recovery-copy downloads use only the selected
account-bound copy already stored on this installation. The production
account-data control remains disabled until its separately approved hosted
activation and proof are complete.

## Support

Settings → **Help** shows the current account, billing, and encrypted-sync state
alongside focused recovery guidance. Its local diagnostic report is assembled
on your device from a fixed, non-identifying status schema, shown to you for
review, and downloaded only when you choose. Tab Two never uploads or sends it
automatically. Do not post a diagnostic report or personal information publicly.
Product assistance is best-effort and has no guaranteed
response time.

If Tab Two is useful to you, there's also a quiet "☕ Buy me a coffee" link in
Settings' footer — or go straight to [buymeacoffee.com/joncooler](https://buymeacoffee.com/joncooler).

Product use is governed by the public [Tab Two Terms of Service](TERMS.md).

## Privacy

The full, standalone privacy policy (Chrome Web Store submission copy,
audited line-by-line against this codebase) lives in
[`PRIVACY.md`](PRIVACY.md). Summary:

Local mode has no Tab Two account requirement and makes no Tab Two account
request. If you explicitly use Account & Sync, production opens Google OAuth and
uses the single disclosed Supabase project for a provider-neutral account
snapshot and a signed, account-bound capability lease. The isolated
`tab-two:account-session:v1` session is excluded from AuroraData, JSON backup,
diagnostics, screenshots, and UI, and Sign out removes it. Sign-in alone never
enables sync or uploads product data. All dashboard product data — settings, quick
links, to-do lists, focus timer config, today's focus text, background
preferences, weather cache, location, notes, world clocks, countdowns,
habits, manual Progress goals, aggregate Metrics history, widget layout, and connector configuration (e.g. your RSS feed
list) — is stored locally in `chrome.storage.local`. The one exception is an
uploaded background photo, which is stored locally in IndexedDB (as a blob,
never uploaded anywhere).

The sandbox billing path sends only an authenticated account request and
semantic plan to the Tab Two Supabase service. The server selects the reviewed
test price and may return an exact Stripe-hosted Checkout or Customer Portal URL
for a normal browser tab. An open same-plan Checkout can return the same safe
URL instead of creating a competing Session. Stripe/Link, not Tab Two, handle
card and billing details. Tab Two stores no hosted URL or payment-method data,
ignores browser return state as authority, and enables capabilities only after
refreshing an account-bound signed lease. Subscription state revalidates
automatically when Account & Sync opens or regains focus and through short,
bounded retries after a hosted handoff; there is no manual Refresh billing
control. Stripe returns through the static
`tab-two-billing-return.pages.dev` surface, which has no analytics, cookies,
remote assets, account data, or billing authority. Live billing is not active.

Encrypted sync includes settings and layouts; tasks, notes, habits, goals, and
links; approved non-secret connector preferences; and aggregate-only Metrics
buckets when both Metrics and sync are entitled and enabled. Passwords, tokens,
sessions, feed/calendar URLs, provider caches and responses, uploaded images,
and device-local operational state always stay on the device. The service keeps
only encrypted record envelopes and bounded account/device/revision metadata,
with a 2 MB account quota, five active installations, and 90-day retention after
the encrypted-sync entitlement ends. Deleting the cloud vault or account never
deletes local dashboard data. The account data key is wrapped by a server-held
key-encryption key, so the service can technically release it to an authenticated
entitled installation; this is encrypted sync, not end-to-end encrypted or zero
knowledge. Hosted production sync authority is active, but it remains off for
each signed-in installation until the customer explicitly enables it.


The **fixed** outbound network calls Tab Two makes on its own are to
Open-Meteo: the forecast endpoint (`api.open-meteo.com`) and environmental
endpoint (`air-quality-api.open-meteo.com`), only once the Weather widget is
enabled and a location is set, and the geocoder
(`geocoding-api.open-meteo.com`), only while the widget is enabled and
you're actively searching for a city — queried as you type (debounced by
~300ms, at least 2 characters), not only when you press Enter — plus a
single keyless reverse-geocode lookup (`api.bigdatacloud.net`) at the
moment you click "Use my location", so the widget can label your weather
with a real place name. That lookup happens once, only for device location,
and sends the same two-decimal device coordinates. Weather provider requests
normalize a selected city's returned coordinates to at most four decimals.
Beyond those fixed calls, the **Connectors** framework lets you point
  Tab Two at outside sites yourself or enable a built-in public source: RSS,
  GitHub, GitLab, Jira, Vercel, Crypto, Calendar, Status, Home Assistant,
  Linear, Sentry, Todoist, On This Day, Public Holidays, and Aurora & Kp.
  Every connector fetch
goes directly from your browser to that connector's own host, never through
the Tab Two account service, and only for connectors you've actually configured.
  GitHub/GitLab/Jira/Vercel/Home Assistant/Linear/Sentry/Todoist send only
  the credentials and scoped request data described in the privacy policy;
  the other connectors need no third-party account. RSS and Calendar URLs are capability secrets even
without an account and are redacted from backups. Home Assistant is the one connector that also writes:
its action buttons send a single command to your own instance, only when
you click one, never on a schedule (see [Connectors](#connectors) and
[`PRIVACY.md`](PRIVACY.md) for the full disclosure). There is no
analytics, no telemetry, and no tracking of any kind.

Connector credentials and RSS/Calendar capability URLs remain local
  plaintext in `chrome.storage.local`, protected by the Chrome/OS profile, not
encrypted or vault-grade. On a shared or untrusted profile, disconnect
connectors or clear Tab Two's extension data after use. Provider responses are
cached locally after direct receipt; Tab Two never relays them through its
account service.

The **Bookmarks bar** widget is off by default, and the `bookmarks`
permission it needs is requested only when you turn it on — not at install.
Flipping it on in Settings prompts Chrome to ask whether Tab Two may read your
bookmarks; decline, and the widget simply stays off (with a note explaining
why) until you try again. Grant it, and Tab Two reads your browser's
bookmarks tree with `chrome.bookmarks.getTree()` to render it — that read
happens locally, is rendered locally, and is never transmitted anywhere.
Tab Two only reads your bookmarks; it never creates, edits, or deletes any.

**Connectors** work similarly, but per-site rather than as one on/off
switch: Tab Two's manifest lists every `https://` origin as *requestable*
(`optional_host_permissions`), but none is granted at install. Adding a
feed or clicking "Connect" on a token-based connector in Settings →
Connectors triggers Chrome's native permission prompt for that one origin
only — decline, and the connector isn't added; grant, and Tab Two can fetch
just that site. Removing the last feed/connection on a site revokes that
site's permission automatically.

The `geolocation` permission works differently: Chrome does not allow
geolocation to be requested as an optional, runtime permission (only a
fixed list of permissions qualify, and geolocation isn't on it), so Tab Two
holds it from install — the same as `storage` and `favicon` above. Holding
it is not the same as using it, though: Tab Two never reads your device
location in the background, and searching for a city by name never touches
it at all. Your coordinates are read only in the instant you click "Use my
location" in the weather widget; if the browser's own location prompt is
declined at that moment, an inline note explains that the manual city
search still works.
