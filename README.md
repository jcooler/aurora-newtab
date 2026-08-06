# Aurora

A calm, local-first new-tab dashboard for Chrome. No accounts, no tracking,
no backend — everything lives on your machine.

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
  temperature, wind, humidity, and sunrise/sunset. No API key needed.
- **Background photos** — a bundled, hand-curated set of landscape photos
  that rotates daily, or upload your own as a gallery (add several at once,
  remove any one from a thumbnail strip, rotates through the rest), or use
  a flat gradient.
- **Bookmarks bar** — your browser's actual bookmarks bar, rendered as a row
  of folder and favicon chips; click a folder to drill into it (with a
  breadcrumb back button for nested subfolders). Off by default; reads your
  existing bookmarks, never creates or modifies any.
- **To-do lists** — a lightweight panel for day-to-day tasks.
- **Focus timer** — a Pomodoro-style work/break timer with a chime.
- **Notes** — a small autosaving scratchpad pinned to the corner, for
  jotting anything down; saves locally as you type.
- **Daily quote** — one quote a day from a small bundled set.
- **Command palette** — `Ctrl+K` / `Cmd+K` to jump to a link, switch theme,
  search the web, or quick-add a to-do (`todo: buy milk`).
- **Three themes** — Aurora, Glass, and Mono, each a small set of CSS custom
  properties layered over the chosen background.
- **Keyboard accessible** — every widget is reachable and operable from the
  keyboard; the theme picker is a proper APG radiogroup (arrow keys move and
  apply the selection, roving tabindex).
- **Rearrange the layout** — press and hold an empty spot on a widget (its
  non-interactive surface, not a button/link/input — those keep their own
  click behavior) to drag it anywhere on the page, with snap guides toward
  the viewport center and other widgets; or open Settings → Layout →
  "Arrange layout" to enter the same mode without long-pressing anything.
  Once a widget is selected, arrow keys nudge it a step at a time (Shift for
  a finer step) instead of the mouse. "Reset layout" puts everything back to
  its default position, with a two-step confirm so it can't happen by
  accident. Positions are stored locally, same as everything else.

Every widget can be turned on or off from Settings, and every setting is
optional — the dashboard is fully usable with nothing configured beyond the
defaults.

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

## Adding a theme

1. Add a CSS block to `src/theme/themes.css` keyed on `[data-theme='yourid']`
   defining the same custom properties the existing themes use: `--fg`,
   `--fg-muted`, `--accent`, `--panel`, `--panel-border`, `--panel-blur`,
   `--radius`, `--scrim`, `--bg-fallback`. Optionally add a matching override
   under the `@media (prefers-color-scheme: light)` block at the bottom.
2. Add `{ id: 'yourid', label: 'Your Label' }` to the `THEMES` array in
   `src/theme/index.ts`.
3. Add `'yourid'` to the `ThemeId` union in `src/lib/storage/schema.ts`.

The settings radiogroup and command palette both pick up new themes
automatically from `THEMES`.

## Adding a widget

1. Create a folder under `src/newtab/widgets/<name>/` with a
   `<Name>Widget.tsx` default export. Gate its rendering on
   `settings.widgets.<key>` at the top of the component (return `null` when
   off) — this keeps disabled widgets from mounting any effects, timers, or
   network calls at all.
2. Add a `<key>: boolean` to `WidgetToggles` in
   `src/lib/storage/schema.ts`, and a default value in that file's
   `defaults()`.
3. Add a label to `WIDGET_LABELS` in `src/settings/SettingsPanel.tsx` so it
   shows up in the Settings → Widgets list.
4. Mount it in `src/newtab/App.tsx`, wrapped in
   `<WidgetBoundary name="...">` — a widget that throws must never take the
   rest of the page down with it.

## Data

Settings → **Data** lets you back up and restore everything Aurora stores,
as a single JSON file:

- **Export** downloads `aurora-backup-YYYY-MM-DD.json` — a pretty-printed
  envelope (`app`, `version`, `exportedAt`, and `data`) containing every
  stored key: settings, quick links, to-do lists, the focus timer config,
  today's focus text, background preferences, weather cache, location,
  notes, world clocks, and countdowns.
- **Background photo uploads are not included.** They live in IndexedDB as
  a blob, not in the JSON-serializable data the backup covers; re-select
  your image after restoring if you were using an uploaded background.
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

Aurora has no backend and no accounts. All of your data — settings, quick
links, to-do lists, focus timer config, today's focus text, background
preferences, weather cache, location, notes, world clocks, countdowns, and
widget layout —
is stored locally in `chrome.storage.local`. The one exception is an
uploaded background photo, which is stored locally in IndexedDB (as a blob,
never uploaded anywhere).

The **only** outbound network calls Aurora ever makes are to Open-Meteo: the
forecast endpoint (`api.open-meteo.com`), only once the weather widget is
enabled and a location is set, and the geocoder (`geocoding-api.open-meteo.com`),
only while the widget is enabled and you're actively searching for a city —
queried as you type (debounced by ~300ms, at least 2 characters), not only
when you press Enter — plus a single keyless reverse-geocode lookup
(`api.bigdatacloud.net`) at the
moment you click "Use my location", so the widget can label your weather with
a real place name. That lookup happens once, only for device location, and
sends the same ~1 km-rounded coordinates the forecast call already uses.
There is no analytics, no telemetry, and no tracking of any kind.

The **Bookmarks bar** widget is off by default, and the `bookmarks`
permission it needs is requested only when you turn it on — not at install.
Flipping it on in Settings prompts Chrome to ask whether Aurora may read your
bookmarks; decline, and the widget simply stays off (with a note explaining
why) until you try again. Grant it, and Aurora reads your browser's
bookmarks tree with `chrome.bookmarks.getTree()` to render it — that read
happens locally, is rendered locally, and is never transmitted anywhere.
Aurora only reads your bookmarks, it never creates, edits, or deletes any.

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
