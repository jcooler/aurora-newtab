# Aurora — New-Tab Dashboard Extension: Design

**Date:** 2026-07-26
**Status:** Approved by Jon (with amendment: Tide is archived locally, never committed)

## Overview

Aurora is a Manifest V3 Chrome extension that replaces the new-tab page with a calm,
local-first personal dashboard — Momentum-inspired, free, no accounts, no telemetry.
It is a ground-up React rewrite of the existing vanilla-JS "Tide" extension that
previously lived in this directory.

## Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Existing Tide project | Move to `legacy/`, git-ignored, **never committed** | Jon keeps it local as reference; Aurora history starts clean |
| Tide user data | Fresh start, no migration | Jon has no data worth keeping; export/import backup is backlog |
| Weather provider | **Open-Meteo** (no API key) | Zero-setup fits local-first; sits behind a `WeatherProvider` interface so OpenWeather can be added later |
| Search bar | Toggleable center search bar **plus** Ctrl/Cmd+K palette | Preserves a Tide feature; off/on like every widget |
| State management | Custom hooks over the typed storage wrapper | Zero deps; `chrome.storage.onChanged` gives multi-tab sync for free |
| Styling | Tailwind **v4** (CSS-first) | `@theme` is CSS variables — exactly how the theme engine works |
| Background photos | ~10 curated Unsplash-license/CC0 photos, fetched at dev time, compressed to ~1920px WebP, committed with `photos.json` credits | Runtime never touches the network for photos |
| Quotes | Harvest Tide's `quote.js` set into `assets/quotes.json`, expand | Local JSON only, no external call |

## Hard constraints (from the brief)

- Manifest V3, `chrome_url_overrides.newtab` → `newtab.html` (crxjs manages paths).
- Local-first: all user data in `chrome.storage.local` / IndexedDB. No backend, no
  account, no telemetry, no analytics. Outbound network = weather only (Open-Meteo),
  isolated in `src/services/`.
- Stack: React + TypeScript + Vite + `@crxjs/vite-plugin` (MV3 HMR) + Tailwind v4.
  No heavy UI kit.
- No secrets in the repo (Open-Meteo needs none; if a keyed provider is added later,
  the key lives in `chrome.storage.local` with a clear empty state).
- Lean bundle: widgets lazy-loaded via `React.lazy`.
- Accessibility from the start: keyboard navigable, visible focus states,
  `prefers-reduced-motion` respected, WCAG AA contrast in every theme.

## Architecture

### File structure

```
<repo root>
├── legacy/                           ← archived Tide (git-ignored, local only)
├── public/
│   ├── icons/                        ← 16/48/128 extension icons
│   └── photos/                       ← bundled backgrounds + photos.json (credits)
├── src/
│   ├── manifest.ts                   ← crxjs manifest source
│   ├── newtab/
│   │   ├── index.html / main.tsx / App.tsx
│   │   ├── components/               ← Clock, Greeting, FocusLine, SearchBar,
│   │   │                                Background, Scrim
│   │   └── widgets/                  ← weather/ links/ todo/ timer/ quote/ palette/
│   │                                    one folder per widget; lazy-loaded; reducer +
│   │                                    tests colocated where logic is real
│   ├── settings/                     ← slide-over drawer + per-section forms
│   ├── services/
│   │   ├── weather/                  ← types.ts (WeatherProvider interface),
│   │   │                                openMeteo.ts, geocode.ts
│   │   └── photos/                   ← daily rotation, IndexedDB uploads,
│   │                                    gradient fallback
│   ├── lib/
│   │   ├── storage/                  ← typed wrapper, schema v1, version + migrations
│   │   ├── hooks/                    ← useStoredKey, useClock, useReducedMotion,
│   │   │                                useHotkey
│   │   └── fuzzy.ts                  ← tiny fuzzy matcher (no dependency)
│   ├── theme/                        ← themes.css (variable sets), registry
│   └── assets/quotes.json
├── docs/superpowers/specs/           ← this document
└── vite.config.ts, tailwind, tsconfig, vitest.config.ts, README.md
```

### Storage

One versioned envelope in `chrome.storage.local`, accessed only through the typed
wrapper in `src/lib/storage/`:

- `version: 1`
- `settings` — name, 12/24h, theme id, units (°C/°F), widget toggles, mute,
  search engine
- `focus` — `{ text, date, done }`; resets when the stored date ≠ today
- `todoLists` — `[{ id, name, items: [{ id, text, done, order }] }]`
- `links` — `[{ id, title, url, order }]` (favicon via Chrome's local `_favicon/`
  API with the `favicon` permission — Chrome's own cache, no external favicon service)
- `timerConfig` — work/break minutes, mute override
- `photoPrefs` — source mode, current index, last-rotated date
- `weatherCache` — last good response + timestamp (stale-while-revalidate)
- `location` — `{ lat, lon, cityLabel, manual: boolean }`

The wrapper checks `version` on boot and runs migrations (stub for v1→v2 shipped
now so future changes never wipe data). User-uploaded background images go to
IndexedDB (too large for `chrome.storage`).

### Data flow

Component → `useStoredKey(key)` hook → typed wrapper → `chrome.storage.local`.
The wrapper broadcasts via `chrome.storage.onChanged`, so every open new-tab stays
in sync. Tests inject a fake in-memory `chrome.storage` double.

### Services

- **Weather:** `WeatherProvider` interface (`getCurrentAndHourly(lat, lon)`);
  Open-Meteo implementation. Geolocation via `navigator.geolocation` (manifest
  `geolocation` permission) with manual city fallback through Open-Meteo's free
  geocoding endpoint. Offline → render cached data with an "offline" note.
  The "Rain likely around 3 PM" callout is a pure function over hourly
  precipitation probabilities (unit-tested).
- **Photos:** source order = user upload (IndexedDB) → bundled set rotating daily →
  gradient fallback. "New photo" control advances the rotation.

### Error handling

Every widget renders one of: content, empty state (e.g. no location set), or a quiet
degraded state (e.g. cached weather + offline note). No widget failure may break the
page — widgets are wrapped in an error boundary that collapses the failed widget.

## Theme engine

Three themes as CSS-variable sets scoped by `[data-theme]`: **Glass** (glassmorphism,
soft blur), **Mono** (minimal monochrome, typographic), **Aurora** (rich gradients).
System light/dark respected via `prefers-color-scheme` with per-theme dark variants.
Adding a theme = one CSS block + one registry entry. Each theme must pass WCAG AA
contrast over the darkest and lightest bundled photos (the scrim guarantees a floor).

## Testing

Vitest units for: storage wrapper (fake `chrome.storage`), to-do reducer, timer
reducer, fuzzy matcher, Open-Meteo service (mocked fetch), rain-callout summarizer,
focus-date rollover. TDD for storage/reducers/services; UI verified manually at each
milestone pause. Playwright deferred.

## Milestones (⏸ = Jon reviews the running extension)

- **M0 — Archive.** Move Tide + old docs + backups into `legacy/`; delete stray
  `tmpclaude-*` files; `git init`; `.gitignore` covers `legacy/`, `node_modules/`,
  `dist/`, `.claude/settings.local.json`. First commit = spec + gitignore only.
- **M1 — Scaffold.** Vite + React + TS + crxjs + Tailwind 4 + Vitest; blank dark
  page loads via `chrome://extensions` → Load unpacked → `dist/`. **⏸ Pause 1.**
- **M2 — Storage layer (TDD).** Wrapper, schema, migration stub, `useStoredKey`,
  fake storage double. Tests green before any UI consumes it.
- **M3 — Core layout.** Background system + scrim + refresh control, clock +
  greeting + name, focus line with done state, search bar, settings drawer with
  widget toggles, theme engine (all three themes), reduced-motion + focus states.
  **⏸ Pause 2.**
- **M4–M9 — Widgets**, one per milestone, one commit each, ⏸ after each:
  weather → quick links (drag-reorder) → to-do (multi-list) → focus timer →
  quote → command palette (Ctrl/Cmd+K: fuzzy-jump to link, web search, add to-do).
- **M10 — Polish.** Keyboard-nav audit, contrast check per theme, README (features,
  dev commands, add-a-theme, add-a-widget, load steps).

One commit per working milestone; a commit message notes each pause point.

## Backlog (explicitly out of v1)

World clocks + countdown, JSON export/import backup, quote favorites, bookmarks-bar
toggle (Chrome bookmarks API), Pomodoro daily stats, `?` shortcut cheat-sheet
overlay, OpenWeather as an alternate keyed provider.

v1.0.0 shipped deviations & polish backlog (from the final whole-phase review):
the per-timer mute override was dropped (global mute covers it); Escape closes
the oldest floating panel first when Tasks + Timer are both open (a shared
dialog stack would fix ordering); weather/timer controls sit after the gear in
tab order; a new-tab left open for hours shows stale weather until interaction;
ArrowUp/Down aliases in the theme radiogroup.
