# Chrome Web Store listing — Aurora v1.2.1

Prepared for Jon to paste into the CWS Developer Dashboard. Nothing here is
final until he's read it — voice/tone calls are flagged inline where marked
**[Jon: ...]**.

**Updated for v1.2.1 (Red Argon remediation):** v1.2.0 was rejected for
Single Purpose violation "Red Argon" — the in-extension Google/DuckDuckGo/
Bing search-engine picker changed the user's search experience without
going through the Chrome Search API. That picker is gone; every search now
routes through `chrome.search.query()`, which respects whatever engine the
user has actually set as their Chrome default. This revision removes the
"your choice" line from the description below (it described the very
feature that got rejected) and adds a permission-justification block for
the new `search` permission. See `release/RESUBMISSION-NOTES.md` for the
reviewer-facing note and Jon's resubmission steps.

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
    - A search bar that searches with your browser's own default search
      engine (via Chrome's Search API) and a small drag-to-reorder grid
      of quick links with favicons.
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
    - Bookmarks is an OPTIONAL permission, requested only when you turn
      that widget on — never at install. Location is granted at install
      (Chrome doesn't allow it to be requested any other way) but only
      ever READ the instant you click "Use my location" — never in the
      background, and never just for typing a city name.

    Read the full privacy policy: https://github.com/jcooler/aurora-newtab/blob/main/PRIVACY.md

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

**`search`** (install-time, no prompt — Chrome's optional-permissions
allow-list does NOT exclude `search`, unlike `geolocation` below; installing
it at install-time here is a deliberate product choice, not a Chrome
requirement)
- *Why:* Red Argon remediation. The search bar and the command palette's
  "Search the web" fallback both need to route queries through
  `chrome.search.query()` — the platform API that respects the user's own
  default search engine — instead of Aurora building a provider URL itself
  (the exact thing v1.2.0 was rejected for).
- *When prompted:* Never — install-time, automatic. Chosen over an
  on-first-search runtime prompt because the search bar is a default-on,
  flagship widget visible on every new tab from first launch; gating it
  behind a permission dialog would interrupt the first thing most users try.
- *What's read/written:* Only the text you type into the search bar or
  palette, handed straight to `chrome.search.query()`. Aurora never
  constructs a search URL, never learns which engine Chrome used, and never
  sees the results.

**`geolocation`** (install-time, no prompt — Chrome does not permit this
specific permission to be requested at runtime; it maintains a fixed list
of permissions that may be declared optional, and geolocation is not on
it, so it has to be installed the same way `storage` and `favicon` are)
- *Why:* Lets the Weather widget use your device's exact position instead
  of a manually searched city.
- *When prompted:* Never — install-time, automatic, same as `storage` and
  `favicon` above. Holding the permission is not the same as using it,
  though: Aurora never reads your device location in the background, and
  typing a city name into the search box never touches it at all.
- *What's read:* Your device coordinates, read only in the instant you
  click "Use my location" inside the Weather widget — that click is the
  only moment this permission is ever exercised — rounded to ~1 km before
  Aurora stores or sends them anywhere (see "Network calls" in PRIVACY.md).

**`bookmarks`** (optional — requested at runtime)
- *Why:* Powers the Bookmarks bar widget, which renders your actual
  bookmarks bar as folder/favicon chips on the dashboard.
- *When prompted:* Only if and when you turn the Bookmarks bar widget on
  in Settings — never at install, and never for anyone who leaves it off.
- *What's read:* `chrome.bookmarks.getTree()` — your full bookmarks tree,
  read locally to render the bar. Aurora never creates, edits, moves, or
  deletes a bookmark, and never transmits the tree anywhere.

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
| **Location** | **Yes — approximate location** | The `geolocation` permission is held from install (Chrome requires that — see the permission justification above), but coordinates are only ever read and sent at the moment you click "Use my location," never in the background. Rounded to ~1 km and sent to Open-Meteo (forecast) and, once per click, BigDataCloud (place-name lookup). Never sold, never used for advertising, used only to show weather for that location. |
| Web history | No | Bookmarks are read via `chrome.bookmarks.getTree()` but never transmitted anywhere — they stay on-device, so this is a local *read*, not a *collection* under Google's definition. Same reasoning covers search: text typed into the search bar/palette is handed to `chrome.search.query()`, a browser-mediated API call, not a network request Aurora itself makes — Aurora never builds or sends the request and never learns the result. |
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
BigDataCloud) whenever a user clicks "Use my location." (The `geolocation`
permission itself is held from install, per Chrome's rules, but that's a
separate question from whether the coordinates ever leave the device — they
only do on that click.) "Collects: nothing" would be true for a build with
no weather widget, but Aurora ships one. I've written the table above as
the honest answer (Location: yes, single-purpose, not sold) instead of the
literal instruction, because an inaccurate Data Usage disclosure is a CWS
policy violation, not just a wording nitpick. Please confirm you agree
before submitting — if you'd rather not disclose Location at all, the only
compliant way to get to "collects: nothing" is to remove the `geolocation`
permission and the "Use my location" button entirely, which is a product
change, not just a form change.

---

## STAGED — NOT YET SUBMITTED, DO NOT PASTE INTO CWS YET (v1.3.0 + v1.4.0 deltas)

Everything above this line is the live v1.2.1 listing (Red Argon
remediation), which is **still awaiting Google's review** as of this
writing — see `release/RESUBMISSION-NOTES.md`. This section is prepared
ahead of v1.3.0's own listing update so the delta doesn't have to be
reconstructed later; it is not itself a submission, and nothing below
should be pasted into the CWS Developer Dashboard until v1.2.1's review has
concluded. **If v1.2.1 comes back REJECTED, stop and get Jon's sign-off
before acting on any of this** — submitting a second, unrelated change
while the first is still unresolved would compound the review backlog, not
fix it.

v1.3.0 adds a Connectors framework to the dashboard: Settings gains a
fourth tab (Connectors), and RSS ships as the first connector — up to 5
feed URLs per user, merged into a new headlines widget. Two changes to the
store listing follow from that; the Summary, Category, and Single purpose
statement above are unaffected (Connectors is one more dashboard feature
inside the existing single purpose, not a second purpose needing its own
statement).

### New permission justification: `optional_host_permissions` (`https://*/*`)

- *Why:* Connectors fetch data directly from whatever site the user points
  them at — RSS feeds today, more connector types potentially later. Rather
  than bundling a fixed allow-list of hosts (which would force a listing
  update every time a new site is supported) or requesting `<all_urls>` at
  install (asking for the entire internet up front, for a feature most
  users may never touch), Aurora declares every `https://` origin
  *requestable* via this manifest key and pre-grants none of them.
- *When prompted:* Never at install — `optional_host_permissions` grants
  nothing on its own; it only makes origins eligible to be requested later.
  A real Chrome permission prompt, scoped to exactly one origin (e.g.
  `https://example.com/*`), appears only when a user clicks "Add" on a feed
  URL in Settings → Connectors. Declining leaves that feed un-added; the
  rest of the dashboard is unaffected.
- *What's read/written:* Nothing beyond ordinary HTTP GET requests to the
  origins a user has explicitly granted, one at a time, sent straight from
  the browser to that origin — no Aurora server sits in between (Aurora has
  none). Removing the last feed pointed at a given site revokes that site's
  grant automatically (`chrome.permissions.remove`); Aurora does not
  accumulate standing access to sites no longer in use. Full detail in
  `PRIVACY.md`'s "Connectors" section.
- *Data Usage disclosure impact:* **[Jon: needs your read before
  submission.]** The existing table's "Web history: No — stays on-device"
  reasoning (used above for bookmarks and search) plausibly extends to RSS
  fetches too, since Aurora itself never sees or retains the response — but
  a connector request does leave the device, to a host the user chose, the
  same structural fact that made Location a "Yes" above. Rather than assume
  silently, call it out explicitly in the Data Usage form when this ships,
  the same way Location was — Google's reviewers weigh "leaves the device"
  over "who benefits from it."

### Detailed description delta

Add to the FEATURES list, after the bookmarks-bar bullet:

    - Connectors: an extensible framework for pulling in outside data,
      one card per source in Settings → Connectors, each one asking
      permission for exactly the site you add, nothing more. The first
      connector is RSS — add up to 5 feed URLs and see the latest
      headlines from all of them in one widget.

Add to the PRIVACY, THE ACTUAL DIFFERENTIATOR list, after the bookmarks
bullet:

    - Connectors ask for host access one site at a time, only when you
      add that site yourself, and only for that one site — never a
      blanket grant, never at install. Every connector's configuration
      is included in your backup export; anything a connector marks as
      a secret (e.g. a future connector's API token) is automatically
      stripped from that export before it's written to disk.

---

### v1.4.0 addendum — six more connectors (STILL staged; v1.2.1 verdict still gates ALL of this)

Everything in this addendum is prepared ahead of time the same way the rest
of this STAGED section is — **do not paste any of it into the CWS Developer
Dashboard.** It doesn't change which review this section waits behind: the
v1.2.1 verdict above is still the gate for all store motion, staged v1.3.0
material included. If a verdict has landed since this was written, stop and
consult Jon per `HANDOFF.md` before acting on anything below.

v1.4.0 keeps the Connectors framework's tab/permission model exactly as
v1.3.0 introduced it and adds six more connectors to the one RSS shipped
with: **GitHub**, **GitLab**, **Jira**, and **Vercel** (each token-based —
a personal access token, or for Jira, an email + API token, entered through
a "Connect" form and stored the same way RSS's config already is), plus
**Crypto** and **Calendar** (no account or token — a chosen coin list and a
pasted ICS/iCal URL, respectively). No new permission is added: all six
reach their sites through the SAME `optional_host_permissions` grant
v1.3.0's addendum above already justifies, one origin at a time, on the
same "Add"/"Connect" gesture. The Summary, Category, and Single purpose
statement remain unaffected for the same reason v1.3.0's own addendum gave
— six more sources inside the existing single purpose, not a new one.

#### Detailed description delta

Extend the Connectors bullet added by the v1.3.0 addendum above (replacing
it, since it now describes seven connectors, not one):

    - Connectors: an extensible framework for pulling in outside data,
      one card per source in Settings → Connectors, each one asking
      permission for exactly the site you add, nothing more. Seven ship
      today — RSS, GitHub, GitLab, Jira, Vercel, Crypto, and Calendar —
      covering your feeds, your PRs/issues/MRs/tickets/deployments, coin
      prices, and your next calendar events, each reading only what its
      own card describes.

#### Data Usage disclosure update

**[Jon: needs your read before submission, same as the Location and Web
history flags above.]** Four of the six new connectors (GitHub, GitLab,
Jira, Vercel) ask the user for a credential to authenticate to their own
account on that service — the Data Usage table's existing "Authentication
information: No — No accounts exist" row (line ~192, live section above)
stops being accurate once this ships and needs updating to:

| Category | Collected? | Notes |
|---|---|---|
| **Authentication information** | **Yes — stored locally, never transmitted except to the service it belongs to.** | A personal access token (GitHub, GitLab, Vercel) or an email + API token (Jira), entered by the user through each connector's own "Connect" form. Stored only in `chrome.storage.local`, stripped from backup exports automatically (see PRIVACY.md's "Connectors" section), and sent only as an Authorization header (Bearer, or Basic for Jira) on requests to that one service — never to Aurora's developer, and there is no Aurora server for it to pass through. Crypto and Calendar need no such credential (Calendar's ICS URL is itself treated as a secret, disclosed separately in PRIVACY.md, but it authenticates nothing — it's a capability URL, not a sign-in). |

The "Web history: No — stays on-device" reasoning used for bookmarks/search/
RSS above extends the same way to the six new connectors' own read-only
fetches (issues, PRs, deployments, prices, calendar events) — none of it is
retained or transmitted by Aurora beyond the request itself.

---

### v1.5.0 addendum — habit streaks + month calendar (STILL staged; v1.2.1 verdict still gates ALL of this)

Everything in this addendum is prepared ahead of time the same way the rest
of this STAGED section is — **do not paste any of it into the CWS Developer
Dashboard.** It doesn't change which review this section waits behind: the
v1.2.1 verdict above is still the gate for all store motion, every earlier
staged addendum included. If a verdict has landed since this was written,
stop and consult Jon per `HANDOFF.md` before acting on anything below.

v1.5.0 adds two local-only widgets to the dashboard: habit streaks and a
month calendar. Both read and write only `chrome.storage.local` — no new
permission, no new network call, nothing reaching outside the device — so
unlike the v1.3.0/v1.4.0 connector additions above, neither needs its own
permission justification or Data Usage disclosure update. The Summary,
Category, and Single purpose statement remain unaffected for the same
reason those additions' own addenda gave — two more dashboard features
inside the existing single purpose, not a new one.

#### Detailed description delta

Add to the FEATURES list, after the Connectors bullet (as extended by the
v1.4.0 addendum above):

    - Habit streaks: a small set of daily habits as tap-to-mark chips,
      each showing its current streak — yesterday keeps a streak alive
      until you mark today, so one slow morning doesn't cost you the
      count. Off by default.
    - Month calendar: a glance-sized month grid for "what date is the
      3rd Friday" questions, with today ringed and a dot on any date
      you've added a countdown for. Off by default.

---

### v1.6.0 addendum — widget color + a real control kit (STILL staged; v1.2.1 verdict still gates ALL of this)

Everything in this addendum is prepared ahead of time the same way the rest
of this STAGED section is — **do not paste any of it into the CWS Developer
Dashboard.** It doesn't change which review this section waits behind: the
v1.2.1 verdict above is still the gate for all store motion, every earlier
staged addendum included. If a verdict has landed since this was written,
stop and consult Jon per `HANDOFF.md` before acting on anything below.

v1.6.0 retires the three-theme system (Aurora/Glass/Mono) that the LIVE
v1.2.1 listing above still describes, replacing it with one default surface
— an Aurora-accent glow over a deep neutral panel — plus a widget-color
customizer: Settings → General → Appearance now offers a single color
picker (any color, not a fixed list of named themes) that re-tints every
panel, with panel text adapting automatically to stay readable against
whatever's chosen, and a "Reset" back to the default. Every switch, input,
and other control in Settings was also rebuilt onto one consistent control
kit (native button-role switches, not styled checkboxes). No new permission
and no new network call: `panelColor` is a local setting, stored and read
the same way every other Settings field already is (see PRIVACY.md's "What
Aurora stores"), so neither the Summary, Category, Single purpose
statement, nor the Data Usage disclosure table above need any change.

#### Detailed description delta

REPLACE the existing bullet (added for v1.2.1 and still live above, under
FEATURES):

    - Three themes — Aurora, Glass, and Mono — and a rearrange mode
      (press and hold, or Settings → Layout) to move any widget wherever
      you want it on the page.

with two bullets — the named-theme claim is gone; rearrange mode is
unrelated to color and keeps its own line:

    - One default look, or pick any color for the widgets yourself —
      panel text adapts automatically to stay readable against whatever
      you choose, and "Reset" always brings the default back.
    - A rearrange mode (press and hold, or Settings → Layout) to move
      any widget wherever you want it on the page.

**[Jon: this is a REPLACE, not an ADD, unlike the v1.3.0/v1.4.0 addenda
above — the feature the old bullet described (named themes) no longer
exists in the product, so leaving it in the listing copy would describe
something Aurora can no longer do.]**

---

### v1.7.0 addendum — the board reflows (STILL staged; v1.2.1 verdict still gates ALL of this)

Everything in this addendum is prepared ahead of time the same way the rest
of this STAGED section is — **do not paste any of it into the CWS Developer
Dashboard.** It doesn't change which review this section waits behind: the
v1.2.1 verdict above is still the gate for all store motion, every earlier
staged addendum included. If a verdict has landed since this was written,
stop and consult Jon per `HANDOFF.md` before acting on anything below.

v1.7.0 replaces the dashboard's fixed default layout with one that reflows:
widgets in their default spots now settle into left/right rails sized off
the actual window, at any window size, instead of a handful of pixel-pinned
breakpoints. A widget you've dragged with rearrange mode is unaffected — it
still stays exactly where you put it regardless of window size, until
"Reset layout" puts it back into the flow. No new permission and no new
network call: this is a rendering change over the same locally-stored
layout data already described in PRIVACY.md's "What Aurora stores," so
neither the Summary, Category, Single purpose statement, nor the Data Usage
disclosure table above need any change.

#### Detailed description delta

REPLACE the rearrange-mode bullet (added by the v1.6.0 addendum above, under
FEATURES):

    - A rearrange mode (press and hold, or Settings → Layout) to move
      any widget wherever you want it on the page.

with:

    - The board adapts to any window size — resize it and the default
      layout reflows to fit. A rearrange mode (press and hold, or
      Settings → Layout) lets you drag any widget wherever you want it
      instead; that spot is yours until "Reset layout" puts it back into
      the flow.

---

### v1.8.0 addendum — the card you composed (STILL staged; v1.2.1 verdict still gates ALL of this)

Everything in this addendum is prepared ahead of time the same way the rest
of this STAGED section is — **do not paste any of it into the CWS Developer
Dashboard.** It doesn't change which review this section waits behind: the
v1.2.1 verdict above is still the gate for all store motion, every earlier
staged addendum included. If a verdict has landed since this was written,
stop and consult Jon per `HANDOFF.md` before acting on anything below.

v1.8.0 makes the GitHub connector's card composable: Settings → Connectors
gains four "Show on your board" toggle chips on the GitHub card — commit
graph, pull requests, issues, notifications — so the card shows only the
sections a user actually wants, in any combination, with the rest simply
never fetched. The commit graph itself is new too, a 16-week contribution
heatmap plus a "N contributions · M day streak" line. No new permission and
no new network call beyond what the existing GitHub connector already
justifies: the graph reads the same `api.github.com` token-scoped access
(via GitHub's GraphQL endpoint, not a new host) already covered by the
`optional_host_permissions` justification above, and disabled sections are
simply never requested — turning a section off can only reduce what's
fetched, never add to it. The Summary, Category, Single purpose statement,
and Data Usage disclosure table remain unaffected for the same reason every
earlier connector addendum gave — one more shape for an existing connector
to show data in, not a new source or a new kind of data.

#### Detailed description delta

Extend the GitHub bullet in the Connectors section (added by the v1.4.0
addendum above, under FEATURES):

    - Connectors: an extensible framework for pulling in outside data,
      one card per source in Settings → Connectors, each one asking
      permission for exactly the site you add, nothing more. Seven ship
      today — RSS, GitHub, GitLab, Jira, Vercel, Crypto, and Calendar —
      covering your feeds, your PRs/issues/MRs/tickets/deployments, coin
      prices, and your next calendar events, each reading only what its
      own card describes.

with:

    - Connectors: an extensible framework for pulling in outside data,
      one card per source in Settings → Connectors, each one asking
      permission for exactly the site you add, nothing more. Seven ship
      today — RSS, GitHub, GitLab, Jira, Vercel, Crypto, and Calendar —
      covering your feeds, your PRs/issues/MRs/tickets/deployments, coin
      prices, and your next calendar events, each reading only what its
      own card describes. GitHub's card is composable — choose what it
      shows (commit graph, pull requests, issues, notifications) in
      Settings → Connectors.

---

### v1.9.0 addendum — every card you compose, and the weather says its unit (STILL staged; v1.2.1 verdict still gates ALL of this)

Everything in this addendum is prepared ahead of time the same way the rest
of this STAGED section is — **do not paste any of it into the CWS Developer
Dashboard.** It doesn't change which review this section waits behind: the
v1.2.1 verdict above is still the gate for all store motion, every earlier
staged addendum included. If a verdict has landed since this was written,
stop and consult Jon per `HANDOFF.md` before acting on anything below.

v1.9.0 carries two changes, in the order they shipped:

1. **GitLab, Jira, and Vercel go composable**, the same "Show on your
   board" pattern v1.8.0 gave GitHub: each card's Settings → Connectors
   entry gains toggle chips for its own sections, so it shows only what a
   user actually wants. GitLab gains an activity graph (matching GitHub's
   commit graph) alongside its existing merge-requests/to-dos sections,
   plus a new "review asks" list (merge requests waiting on the user's own
   review). Jira gains a "due soon" list alongside its existing assigned-
   issues/status-chips sections. Vercel's existing deployments/status-
   summary split becomes two independent toggles instead of one bundled
   view — independent as a UI choice, though the two still ride the SAME
   single deployments request (Vercel's API doesn't expose them
   separately), so that request fires as long as either one is on. In
   every case, turning a section off can only reduce what a card fetches,
   never add to it (the same guarantee v1.8.0's addendum stated for
   GitHub) — most sections gate an independent request of their own; the
   two exceptions are Vercel's pair above and Jira's status-count line,
   which rides along with the assigned-issues request rather than firing
   one of its own. No new permission and no new host: every section reads
   through the SAME per-connector access
   already justified above — including GitLab's new activity graph, which
   reads `calendar.json` on the user's own configured GitLab instance
   (`instanceUrl`, already covered by that connector's origin grant), not
   a new host. The Summary, Category, Single purpose statement, and Data
   Usage disclosure table remain unaffected for the same reason v1.8.0's
   addendum gave — more shapes for existing connectors to show data in,
   not a new source or a new kind of data.
2. **Calendar goes multi-feed.** The Calendar connector now holds up to 5
   named calendars in one card instead of one anonymous feed, each with
   its own colored dot, and accepts `webcal://` links (Apple Calendar's
   native format) by converting them to `https://` before they're saved —
   everything downstream of that conversion stays https-only, so the
   existing origin-permission mechanics are untouched. Three view modes
   are selectable in Settings → Connectors: Today (unchanged), Upcoming
   (the next several events across days), and One per calendar (each
   calendar's soonest event). No new permission and no new network host:
   every calendar fetch goes through the SAME `optional_host_permissions`
   grant already justified above, one origin per calendar URL, on the same
   "Add" gesture. Every calendar address is still treated as a secret and
   stripped from backup exports, exactly as the single URL was before —
   now as a list instead of one field. The Summary, Category, Single
   purpose statement, and Data Usage disclosure table remain unaffected
   for the same reason the v1.4.0 Calendar entry gave when it first
   shipped — one connector reading more addresses of the same kind, not a
   new source or a new kind of data.

A small third change ships in the same release: the Weather widget's big
temperature number now shows its unit letter (°F or °C) directly, in place
of the plain number. Purely a display change over data already fetched and
disclosed — no listing text depends on it.

#### Detailed description delta

REPLACE the Connectors bullet (as it stands after the v1.8.0 addendum
above, under FEATURES):

    - Connectors: an extensible framework for pulling in outside data,
      one card per source in Settings → Connectors, each one asking
      permission for exactly the site you add, nothing more. Seven ship
      today — RSS, GitHub, GitLab, Jira, Vercel, Crypto, and Calendar —
      covering your feeds, your PRs/issues/MRs/tickets/deployments, coin
      prices, and your next calendar events, each reading only what its
      own card describes. GitHub's card is composable — choose what it
      shows (commit graph, pull requests, issues, notifications) in
      Settings → Connectors.

with:

    - Connectors: an extensible framework for pulling in outside data,
      one card per source in Settings → Connectors, each one asking
      permission for exactly the site you add, nothing more. Seven ship
      today — RSS, GitHub, GitLab, Jira, Vercel, Crypto, and Calendar —
      covering your feeds, your PRs/issues/MRs/tickets/deployments, coin
      prices, and your calendar events, each reading only what its own
      card describes. Every connector card is composable — choose what
      each shows in Settings → Connectors: GitHub (commit graph, pull
      requests, issues, notifications), GitLab (merge requests, review
      asks, to-dos, activity graph), Jira (assigned issues, status chips,
      due soon), and Vercel (deployments, status summary — sharing one
      request, so turning either off alone doesn't stop it). Turning a
      section off can only reduce what a card fetches, never add to it.
      Calendar now holds up to 5 named calendars in one card — paste any
      ICS/iCal feed, including Apple Calendar's webcal links — with a
      Today, Upcoming, or One-per-calendar view.

---

### v1.10.0 addendum — find your connectors (STILL staged; v1.2.1 verdict still gates ALL of this)

Everything in this addendum is prepared ahead of time the same way the rest
of this STAGED section is — **do not paste any of it into the CWS Developer
Dashboard.** It doesn't change which review this section waits behind: the
v1.2.1 verdict above is still the gate for all store motion, every earlier
staged addendum included. If a verdict has landed since this was written,
stop and consult Jon per `HANDOFF.md` before acting on anything below.

v1.10.0 is a drawer-only release: Settings → Connectors now groups its seven
cards into categories, with a pinned "On your board" group holding whatever
you've already turned on, and a live search box that filters the whole
catalog by name or purpose. No new connector, no new permission, and no new
host — this is a browsing/discovery change over the same seven cards and the
same per-site grants already justified above. The Summary, Category, Single
purpose statement, and Data Usage disclosure table remain unaffected for the
same reason every earlier UI-only addendum gave — the tab is easier to
navigate, not doing anything new with data.

#### Detailed description delta

Extend the Connectors bullet (as it stands after the v1.9.0 addendum above,
under FEATURES), appending one sentence to its end:

    - Connectors: an extensible framework for pulling in outside data,
      one card per source in Settings → Connectors, each one asking
      permission for exactly the site you add, nothing more. Seven ship
      today — RSS, GitHub, GitLab, Jira, Vercel, Crypto, and Calendar —
      covering your feeds, your PRs/issues/MRs/tickets/deployments, coin
      prices, and your calendar events, each reading only what its own
      card describes. Every connector card is composable — choose what
      each shows in Settings → Connectors: GitHub (commit graph, pull
      requests, issues, notifications), GitLab (merge requests, review
      asks, to-dos, activity graph), Jira (assigned issues, status chips,
      due soon), and Vercel (deployments, status summary — sharing one
      request, so turning either off alone doesn't stop it). Turning a
      section off can only reduce what a card fetches, never add to it.
      Calendar now holds up to 5 named calendars in one card — paste any
      ICS/iCal feed, including Apple Calendar's webcal links — with a
      Today, Upcoming, or One-per-calendar view. Find connectors by name
      or purpose — the catalog is searchable, and anything on your board
      stays pinned on top.

---

### v1.11.0 addendum — green dots until they aren't (STILL staged; v1.2.1 verdict still gates ALL of this)

Everything in this addendum is prepared ahead of time the same way the rest
of this STAGED section is — **do not paste any of it into the CWS Developer
Dashboard.** It doesn't change which review this section waits behind: the
v1.2.1 verdict above is still the gate for all store motion, every earlier
staged addendum included. If a verdict has landed since this was written,
stop and consult Jon per `HANDOFF.md` before acting on anything below.

v1.11.0 adds an eighth connector: **Status**, a quiet dot row for the
services a user depends on — green and silent on a normal day, with
trouble text appearing only for a service that's actually down (worst
first, capped at three lines). Users pick from six curated status pages
(GitHub, Cloudflare, OpenAI, npm, Vercel, Discord) or add any
statuspage.io-style URL themselves, up to 8 services total. No credential
of any kind — Status is `auth: 'none'`, the same as Crypto and Calendar,
and declares no secret fields, since a public status-page URL grants no
access to anything and identifies no one. No new permission and no new
install-time host: every service Status fetches reaches its own host
through the SAME per-origin `optional_host_permissions` grant already
justified above, requested one origin at a time on the same "Add" gesture
RSS and Calendar already use — declining leaves that service un-added,
same as every other connector; removing the last service on a given host
revokes that host's grant automatically, same as every other connector. A
service that fails to respond reads as unknown rather than carrying
forward a stale "healthy" reading from an earlier check. The Summary,
Category, Single purpose statement, and Data Usage disclosure table remain
unaffected for the same reason every earlier no-credential connector
addendum gave (Crypto and Calendar in particular) — one more source
reading a public endpoint the user chose, not a new kind of data or a new
permission.

#### Detailed description delta

REPLACE the Connectors bullet (as it stands after the v1.10.0 addendum
above, under FEATURES):

    - Connectors: an extensible framework for pulling in outside data,
      one card per source in Settings → Connectors, each one asking
      permission for exactly the site you add, nothing more. Seven ship
      today — RSS, GitHub, GitLab, Jira, Vercel, Crypto, and Calendar —
      covering your feeds, your PRs/issues/MRs/tickets/deployments, coin
      prices, and your calendar events, each reading only what its own
      card describes. Every connector card is composable — choose what
      each shows in Settings → Connectors: GitHub (commit graph, pull
      requests, issues, notifications), GitLab (merge requests, review
      asks, to-dos, activity graph), Jira (assigned issues, status chips,
      due soon), and Vercel (deployments, status summary — sharing one
      request, so turning either off alone doesn't stop it). Turning a
      section off can only reduce what a card fetches, never add to it.
      Calendar now holds up to 5 named calendars in one card — paste any
      ICS/iCal feed, including Apple Calendar's webcal links — with a
      Today, Upcoming, or One-per-calendar view. Find connectors by name
      or purpose — the catalog is searchable, and anything on your board
      stays pinned on top.

with:

    - Connectors: an extensible framework for pulling in outside data,
      one card per source in Settings → Connectors, each one asking
      permission for exactly the site you add, nothing more. Eight ship
      today — RSS, GitHub, GitLab, Jira, Vercel, Crypto, Calendar, and
      Status — covering your feeds, your PRs/issues/MRs/tickets/
      deployments, coin prices, your calendar events, and the health of
      the services you depend on, each reading only what its own card
      describes. Every connector card is composable — choose what each
      shows in Settings → Connectors: GitHub (commit graph, pull
      requests, issues, notifications), GitLab (merge requests, review
      asks, to-dos, activity graph), Jira (assigned issues, status chips,
      due soon), and Vercel (deployments, status summary — sharing one
      request, so turning either off alone doesn't stop it). Turning a
      section off can only reduce what a card fetches, never add to it.
      Calendar now holds up to 5 named calendars in one card — paste any
      ICS/iCal feed, including Apple Calendar's webcal links — with a
      Today, Upcoming, or One-per-calendar view. Status shows a quiet dot
      row for up to 8 services — six curated status pages, or any
      statuspage.io-style URL you add yourself — that stays green and
      silent until something's actually down. Find connectors by name or
      purpose — the catalog is searchable, and anything on your board
      stays pinned on top.

---

### v1.12.0 addendum — join the meeting from the board (STILL staged; v1.2.1 verdict still gates ALL of this)

Everything in this addendum is prepared ahead of time the same way the rest
of this STAGED section is — **do not paste any of it into the CWS Developer
Dashboard.** It doesn't change which review this section waits behind: the
v1.2.1 verdict above is still the gate for all store motion, every earlier
staged addendum included. If a verdict has landed since this was written,
stop and consult Jon per `HANDOFF.md` before acting on anything below.

v1.12.0 adds one feature to the existing Calendar connector — no new
connector, no new host, no new permission. When the calendar card's
headline event carries a Zoom, Meet, Teams, Webex, or Whereby link, an
accent **Join** link appears starting 15 minutes before it (or while it's
running), so a meeting already on the board is one click away. The link is
found by scanning the LOCATION/DESCRIPTION text your calendar feed already
sent — the same fetch Calendar always made, nothing new requested and
nothing sent anywhere; the URL only leaves the device when you click it
yourself, opening it the same way any link does. A **Meeting links** toggle
on the card (default on) turns the feature off entirely. The Summary,
Category, Single purpose statement, and Data Usage disclosure table remain
unaffected for the same reason every feature-only addendum has given
before — no new kind of data, no new host, no new permission, just more
use made of a feed the user already pointed Aurora at.

#### Detailed description delta

REPLACE the Connectors bullet (as it stands after the v1.11.0 addendum
above, under FEATURES):

    - Connectors: an extensible framework for pulling in outside data,
      one card per source in Settings → Connectors, each one asking
      permission for exactly the site you add, nothing more. Eight ship
      today — RSS, GitHub, GitLab, Jira, Vercel, Crypto, Calendar, and
      Status — covering your feeds, your PRs/issues/MRs/tickets/
      deployments, coin prices, your calendar events, and the health of
      the services you depend on, each reading only what its own card
      describes. Every connector card is composable — choose what each
      shows in Settings → Connectors: GitHub (commit graph, pull
      requests, issues, notifications), GitLab (merge requests, review
      asks, to-dos, activity graph), Jira (assigned issues, status chips,
      due soon), and Vercel (deployments, status summary — sharing one
      request, so turning either off alone doesn't stop it). Turning a
      section off can only reduce what a card fetches, never add to it.
      Calendar now holds up to 5 named calendars in one card — paste any
      ICS/iCal feed, including Apple Calendar's webcal links — with a
      Today, Upcoming, or One-per-calendar view. Status shows a quiet dot
      row for up to 8 services — six curated status pages, or any
      statuspage.io-style URL you add yourself — that stays green and
      silent until something's actually down. Find connectors by name or
      purpose — the catalog is searchable, and anything on your board
      stays pinned on top.

with:

    - Connectors: an extensible framework for pulling in outside data,
      one card per source in Settings → Connectors, each one asking
      permission for exactly the site you add, nothing more. Eight ship
      today — RSS, GitHub, GitLab, Jira, Vercel, Crypto, Calendar, and
      Status — covering your feeds, your PRs/issues/MRs/tickets/
      deployments, coin prices, your calendar events, and the health of
      the services you depend on, each reading only what its own card
      describes. Every connector card is composable — choose what each
      shows in Settings → Connectors: GitHub (commit graph, pull
      requests, issues, notifications), GitLab (merge requests, review
      asks, to-dos, activity graph), Jira (assigned issues, status chips,
      due soon), and Vercel (deployments, status summary — sharing one
      request, so turning either off alone doesn't stop it). Turning a
      section off can only reduce what a card fetches, never add to it.
      Calendar now holds up to 5 named calendars in one card — paste any
      ICS/iCal feed, including Apple Calendar's webcal links — with a
      Today, Upcoming, or One-per-calendar view, and a one-click **Join**
      link that appears next to the headline event starting 15 minutes
      before a Zoom, Meet, Teams, Webex, or Whereby meeting (a toggle
      turns it off). Status shows a quiet dot row for up to 8 services —
      six curated status pages, or any statuspage.io-style URL you add
      yourself — that stays green and silent until something's actually
      down. Find connectors by name or purpose — the catalog is
      searchable, and anything on your board stays pinned on top.
