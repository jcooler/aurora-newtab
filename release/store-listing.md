# Chrome Web Store listing — Aurora v1.2.0

Prepared for Jon to paste into the CWS Developer Dashboard. Nothing here is
final until he's read it — voice/tone calls are flagged inline where marked
**[Jon: ...]**.

## Item name

    Aurora

## Summary (132-character max, shown in search results)

    A calm, local-first new-tab dashboard. No accounts, no tracking, no backend — everything stays on your device.

Length: 110/132 characters. Deliberately echoes `src/manifest.ts`'s own
`description` field (also updated this release, 76/132 chars) so the
manifest and the store summary read as the same voice, not two different
pitches.

## Category

**Productivity.** Aurora replaces the new-tab page with a dashboard (clock,
weather, to-dos, quick links, focus timer, notes) — it's a workflow/utility
tool, not e.g. "Tools" (too generic) or "Photos" (backgrounds are one
feature among many, not the point of the extension).

## Single purpose statement

> Aurora replaces the new-tab page with a local-first personal dashboard —
> clock, weather, quick links, to-dos, a focus timer, notes, and an optional
> bookmarks bar — with no accounts, no backend, and no data collection.

Every permission below exists to serve this one page. There's no secondary
feature (e.g. no unrelated "also blocks ads" or "also tracks prices") that
would need its own justification.

## Detailed description

    Aurora is a calm, local-first new-tab dashboard. No accounts, no
    backend, no tracking of any kind — everything it stores lives only on
    your device, and the developer never sees any of it. See
    aurora-newtab's PRIVACY.md for the complete, audited policy.

    FEATURES

    - Clock & greeting, with world clocks and a countdown to whatever
      date you're counting down to.
    - Weather — current conditions and a next-12-hours forecast, from
      your device location or a searched city, powered by the free,
      keyless Open-Meteo API. No API key to configure, no sign-up.
    - A search bar (Google, DuckDuckGo, or Bing — your choice) and a
      small drag-to-reorder grid of quick links with favicons.
    - Background photos: a bundled, hand-curated set of landscape and
      aurora photos that rotates daily, your own uploaded photo gallery,
      or a flat gradient.
    - An optional bookmarks bar — your browser's actual bookmarks,
      rendered as folder and favicon chips. Off by default; reads your
      bookmarks, never modifies them.
    - To-do lists, a Pomodoro-style focus timer with a chime, and a
      small autosaving notes scratchpad.
    - A command palette (Ctrl+K / Cmd+K) to jump to a link, switch
      theme, search the web, or quick-add a to-do.
    - Three themes — Aurora, Glass, and Mono — and a rearrange mode
      (press and hold, or Settings → Layout) to move any widget wherever
      you want it on the page.
    - Full keyboard accessibility throughout.
    - Back up everything to a JSON file from Settings → Data, and
      restore it later — a local export/import, not a cloud sync.

    PRIVACY, THE ACTUAL DIFFERENTIATOR

    Most new-tab extensions are free because they sell your browsing
    data or your default search traffic. Aurora doesn't have a business
    model that needs your data, because it doesn't have a business model
    at all — it's a dashboard, not a data pipeline. Concretely:

    - No account, no sign-up, no login, ever.
    - No analytics, no telemetry, no crash reporting, no ad network.
    - No backend server of any kind — there is nothing for your data to
      be collected BY, even if we wanted to.
    - Everything you configure (settings, links, to-dos, notes, focus
      timer, world clocks, countdowns, your saved location, layout)
      stays in Chrome's local storage on your device. Uploaded
      background photos stay in local IndexedDB, as blobs, never
      uploaded anywhere.
    - The only network calls Aurora ever makes are to Open-Meteo (for
      weather and city search) and, once, to BigDataCloud (to label
      "Use my location" with a real place name) — both free, keyless
      services, sent only the coordinates or search text needed for
      that one lookup. Full detail in PRIVACY.md.
    - Bookmarks and location are both OPTIONAL permissions, requested
      only when you turn on that specific feature — never at install.

    Read the full privacy policy: [PRIVACY.md URL — Jon fills in once
    hosting is decided, see release/LAUNCH-CHECKLIST.md]

**[Jon: the tone above avoids "best," "revolutionary," "must-have" — deliberately, per your no-growth-hack-superlatives instruction. Read it once end to end before it goes live; it's your name on the listing, not mine.]**

## Per-permission justifications (for the CWS "Permission justification" fields)

**`storage`** (install-time, no prompt)
- *Why:* Aurora has no backend — every setting, quick link, to-do, note,
  timer config, saved location, and widget layout has to live somewhere,
  and `chrome.storage.local` is that somewhere.
- *When prompted:* Never — Chrome grants install-time permissions
  automatically as part of loading the extension.
- *What's read/written:* Only Aurora's own data, described in full in
  PRIVACY.md's "What Aurora stores" section. No access to any other
  extension's or website's storage.

**`favicon`** (install-time, no prompt)
- *Why:* Quick links and bookmark chips show the site's favicon next to
  its title, via Chrome's own local favicon cache — this permission is
  what unlocks that internal `chrome-extension://…/_favicon/` endpoint.
- *When prompted:* Never — install-time, automatic.
- *What's read:* Only the URL of each quick link/bookmark you've already
  added, passed to Chrome's local favicon cache — not a network request
  Aurora makes itself, and no browsing-history access beyond that.

**`bookmarks`** (optional — requested at runtime)
- *Why:* Powers the Bookmarks bar widget, which renders your actual
  bookmarks bar as folder/favicon chips on the dashboard.
- *When prompted:* Only if and when you turn the Bookmarks bar widget on
  in Settings — never at install, and never for anyone who leaves it off.
- *What's read:* `chrome.bookmarks.getTree()` — your full bookmarks tree,
  read locally to render the bar. Aurora never creates, edits, moves, or
  deletes a bookmark, and never transmits the tree anywhere.

**`geolocation`** (optional — requested at runtime)
- *Why:* Lets the Weather widget use your device's exact position instead
  of a manually searched city.
- *When prompted:* Only at the moment you click "Use my location" inside
  the Weather widget — never at install, and never just for typing a city
  name into the search box.
- *What's read:* Your device coordinates, once per click of that button,
  rounded to ~1 km before Aurora stores or sends them anywhere (see
  "Network calls" in PRIVACY.md).

## Data Usage disclosure (CWS Developer Dashboard → Privacy practices tab)

**[Jon: read this section carefully before you tick anything — see the flag at the bottom.]**

CWS's Data Usage form asks which categories of user data the item
*collects* — Google defines "collect" as transmitting data off the user's
device by any means, which includes calls to a third-party API, not only
calls to the developer's own server. Aurora has no server of its own, but
it does make three third-party network calls (Open-Meteo ×2, BigDataCloud
×1 — see PRIVACY.md). Answering the categories accordingly:

| Category | Collected? | Notes |
|---|---|---|
| Personally identifiable information | No | The "name" field (used only for the greeting) never leaves `chrome.storage.local`. |
| Health information | No | — |
| Financial and payment information | No | — |
| Authentication information | No | No accounts exist. |
| Personal communications | No | — |
| **Location** | **Yes — approximate location** | Only when geolocation is granted (optional, on-click). Rounded to ~1 km and sent to Open-Meteo (forecast) and, once per click, BigDataCloud (place-name lookup). Never sold, never used for advertising, used only to show weather for that location. |
| Web history | No | Bookmarks are read via `chrome.bookmarks.getTree()` but never transmitted anywhere — they stay on-device, so this is a local *read*, not a *collection* under Google's definition. |
| User activity | No | No clicks, keystrokes, or usage are logged or transmitted. |
| Website content | No | — |

Certifications (all true, tick all three):
- [x] I do not sell or transfer user data to third parties outside of the
      approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated
      to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or
      for lending purposes.

**Flag for Jon:** the task brief for this listing said to write these
answers as "collects: nothing." That's not accurate once geolocation is in
play — the coordinates genuinely leave the device (to Open-Meteo and
BigDataCloud) whenever a user grants that optional permission and clicks
"Use my location." "Collects: nothing" would be true for a build with no
weather widget, but Aurora ships one. I've written the table above as the
honest answer (Location: yes, single-purpose, not sold) instead of the
literal instruction, because an inaccurate Data Usage disclosure is a CWS
policy violation, not just a wording nitpick. Please confirm you agree
before submitting — if you'd rather not disclose Location at all, the only
compliant way to get to "collects: nothing" is to remove the
`geolocation` optional permission and the "Use my location" button
entirely, which is a product change, not just a form change.
