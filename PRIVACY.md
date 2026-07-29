# Aurora Privacy Policy

**Effective date:** July 29, 2026

Aurora is a new-tab dashboard extension for Chrome. This policy describes,
completely, what Aurora stores, what it sends over the network, and to whom.
If something isn't listed here, Aurora doesn't do it.

## Summary

Aurora has no backend and no accounts. It does not collect, sell, rent, or
transfer any of your data to anyone, for any purpose — including to the
developer. There is no analytics and no tracking of any kind. Everything
Aurora stores lives only on your own device. The only outbound network
calls it ever makes are three read-only, keyless weather/location lookups
described in full below.

## What Aurora stores, and where

All of the following is stored locally in the extension's
`chrome.storage.local`, on your device only, and is never transmitted
anywhere except as explicitly described under "Network calls" below:

- Your settings (name/greeting text, theme, units, search engine, sound,
  and which widgets are turned on)
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
- Widget layout (the on-screen position of each widget, if you've used
  "Arrange layout" to move anything from its default spot)

**Uploaded background photos** are the one exception to `chrome.storage.local`:
if you choose "My photo" and upload your own image(s), each image is stored
locally in the browser's IndexedDB, as a blob, on your device only. It is
never uploaded anywhere, never included in the JSON backup described below,
and never leaves your machine.

**Backup export/import.** Settings → Data lets you export everything above
(except uploaded photos, per the previous paragraph) to a JSON file you
choose to save, and re-import it later. This file is created and read
entirely on your device — Aurora never uploads it anywhere on its own. Where
that file goes afterward (cloud drive, email, USB stick, etc.) is entirely
up to you and outside Aurora's control.

None of the above is ever sent to the developer, to analytics services, or
to any third party. There is no server that Aurora's storage or backups
pass through.

## Network calls

Aurora makes network requests to exactly three endpoints, all operated by
third-party services (Aurora itself has no server), all read-only, all
keyless (no account, sign-in, or API key involved), and all sent no more
data than described below:

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

Aurora makes no other network calls. In particular: no analytics, no
telemetry, no crash reporting, no ad networks, no remote fonts or scripts,
and no "phone home" of any kind. The extension's own UI (HTML/CSS/JS,
bundled fonts if any, and the bundled background photos) ships inside the
extension package and loads from your local install, not from the network.

Favicons shown next to your quick links and bookmarks are fetched through
Chrome's own built-in local favicon cache (the `_favicon` API, gated by the
`favicon` permission below) — not from any external favicon service, and
not a request Aurora itself makes over the network.

Clicking a quick link, a bookmark, or typing into the search bar navigates
your browser to that page the same way clicking any other link would —
that's ordinary browsing, not a network call Aurora makes on your behalf,
and it isn't logged or recorded by Aurora anywhere.

## Permissions

Aurora requests the following Chrome permissions:

- **`storage`** (installed automatically, no prompt) — used for everything
  under "What Aurora stores" above.
- **`favicon`** (installed automatically, no prompt) — used only to show
  small site icons next to quick links and bookmarks, via Chrome's local
  favicon cache. No browsing history is read beyond the single URL needed
  to look up each icon.
- **`bookmarks`** (optional — requested at runtime, never at install).
  Aurora's Bookmarks bar widget is off by default. Turning it on in Settings
  triggers Chrome's own native permission prompt; declining leaves the
  widget off with an inline explanation, and you can try again later.
  Granted, Aurora reads your bookmarks tree (`chrome.bookmarks.getTree()`)
  to render it as a row of chips — that read stays on your device and is
  never transmitted anywhere. Aurora only ever reads your bookmarks; it
  never creates, edits, moves, or deletes any bookmark or folder.
- **`geolocation`** (optional — requested at runtime, never at install).
  Aurora never asks for this permission just to load, and searching for a
  city by name never touches it at all. It's requested only at the moment
  you click "Use my location" in the Weather widget, via Chrome's own
  permission prompt. Declining leaves the manual city search available;
  granting it reads your device's coordinates once per click to set your
  weather location (see "Network calls" above for what happens with that
  location next).

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
