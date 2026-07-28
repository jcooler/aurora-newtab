# Aurora

A calm, local-first new-tab dashboard for Chrome. No accounts, no tracking,
no backend — everything lives on your machine.

## Features

- **Clock & greeting** — large local time, time-of-day greeting.
- **World clocks & countdown** — up to four extra time zones shown under
  the local clock, plus a countdown line for the nearest upcoming date
  you've added — both configured from Settings.
- **Daily focus** — one thing you're focusing on today; resets each morning.
- **Search bar** — Google, DuckDuckGo, or Bing, your choice.
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
node scripts/fetch-photos.mjs # dev-only: refreshes the bundled background set from
                               # picsum.photos into public/photos/ and rewrites
                               # src/services/photos/photos.json with credits
node scripts/make-icons.mjs   # dev-only: regenerates public/icons/icon{16,48,128}.png
                               # from an inline SVG via Playwright
```

Pass `--headed` to `scripts/preview.mjs` (`node scripts/preview.mjs --headed`)
to watch the run in a visible browser window instead of headless.

## Weather note

Weather is powered by [Open-Meteo](https://open-meteo.com/), a free service
that needs no API key and no sign-up. Aurora sends it only a latitude and
longitude (rounded to ~1km) and, for city search, whatever you type into the
city search box. Your location is stored locally and is never sent anywhere
else.

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

## Privacy

Aurora has no backend and no accounts. All of your data — settings, quick
links, to-do lists, focus timer config, today's focus text, background
preferences, weather cache, location, notes, world clocks, and countdowns —
is stored locally in `chrome.storage.local`. The one exception is an
uploaded background photo, which is stored locally in IndexedDB (as a blob,
never uploaded anywhere).

The **only** outbound network calls Aurora ever makes are to Open-Meteo
(`api.open-meteo.com` for forecasts, `geocoding-api.open-meteo.com` for city
search), and only when the weather widget is enabled and a location is set —
plus a single keyless reverse-geocode lookup (`api.bigdatacloud.net`) at the
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
