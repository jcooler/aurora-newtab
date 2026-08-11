# Wave 3: drawer rework, status chips, meeting links, delights, Home Assistant

**Date:** 2026-08-10
**Status:** Approved by Jon (five design sections approved in conversation; decomposition and order ratified)
**Motivation:** Jon's direct asks: Home Assistant, meeting links, status chips, the zero-permission delights, "give people a choice for what they want to see," and a searchable/scrollable Connectors tab as the catalog grows past what a flat column can hold.

## Decomposition (ratified order — each sub-project gets its own plan → build → review cycle when its turn comes)

1. **W3-SP1 — Connectors drawer rework** (foundation: every later connector lands in the new home)
2. **W3-SP2 — Status chips connector** (smallest; proves the drawer + curated-menu pattern)
3. **W3-SP3 — Meeting links in the calendar**
4. **W3-SP4 — Delights: sun times, moon phase, APOD background**
5. **W3-SP5 — Home Assistant** (largest: connect + entity picker + actions + widget)

Wave 3 starts only after wave 2 lands (Task 78 wrap + fable whole-plan review). No
version numbers pinned here — each sub-project stages its own bump per the house
release discipline (v1.2.1 CWS verdict still gates all shipping).

---

## W3-SP1: Connectors drawer rework

**Categories on the descriptor.** `ConnectorDescriptor` gains
`category: 'development' | 'calendar-tasks' | 'home' | 'news-markets' | 'fun'`
(display labels: Development / Calendar & tasks / Home / News & markets / Fun).
The registry stays the single source of truth for naming and now grouping.
Initial mapping: github/gitlab/jira/vercel → development; ics → calendar-tasks;
rss/crypto → news-markets. Wave-3 arrivals to the drawer: status → development,
homeassistant → home. (Sun/moon are Widgets-tab locals and APOD is a
Background-settings toggle — none of the three appears in the connectors
drawer; the 'fun' category exists for future arrivals.)

**Tab layout.** A search field fixed at the top of the Connectors tab; the cards
in their own scrollable region below it (the search never scrolls away — the
point of Jon's ask). Cards group under quiet category eyebrows.
**Connected-or-enabled cards pin to an "On your board" group above the
categories.** Search filters as-you-type over label + blurb via the existing
`src/lib/fuzzy.ts` matcher (no new dependency); while a query is active,
grouping flattens to results. Empty result: one-line "No connector matches."

**"Popularity" ruling:** Aurora has no telemetry (the privacy story), so
popularity cannot be measured — category grouping IS the "sort by purpose" ask,
and no fake ranking ships.

**Unchanged:** every card body, connect flow, chips row, permission mechanic —
byte-identical; this is a re-homing, not a rebuild. Probes: focus-trap and
drawer-scroll extend to the inner scroll region; live search filtering; a
default-path probe pins the pre-wave presentation when nothing is connected.

## W3-SP2: Status chips

**Connector.** id `status`, auth `'none'`, `secretFields: []` (status URLs are
public — the RSS shape exactly: per-feed origins, nothing secret). Config:
`services: Array<{ key?: CuratedKey; name: string; url: string }>`, cap 8.
Curated menu ships as a build-time-verified constant — GitHub, Cloudflare,
Stripe, OpenAI, Slack, npm, Vercel, Discord — all statuspage.io-compatible
(`/api/v2/status.json`). AWS deliberately absent (no compatible endpoint); the
custom-URL field covers the long tail. Per-service origin grant/release,
RSS-style.

**Fetch.** statuspage v2 shape: `{ status: { indicator: 'none'|'minor'|'major'|'critical', description } }`.
Per-service quiet degradation: unreachable/invalid → gray "unknown" carrying
prev; one service never blanks another.

**Card.** One dot row: green (none) / amber (minor) / red (major|critical) /
gray (unknown), service name on `title`. Below, text lines appear ONLY when
something is wrong: "{Service} — {description}" in the danger tone, worst
first. All-green renders just the dot row (the quiet day stays quiet).
No-husk: no services → null. Views ruling: the service list IS the choice —
no separate chips row.

## W3-SP3: Meeting links in the calendar

**Parser.** `ics.ts` reads `LOCATION` and `DESCRIPTION` (today: SUMMARY only).
`IcsEvent` gains `meetUrl?: string` — first URL matching known providers
(zoom.us, meet.google.com, teams.microsoft.com/l/meetup-join, webex.com,
whereby.com), LOCATION checked before DESCRIPTION. Pure parser change; cached
URLs stay on-device (snapshots already excluded from exports).

**Widget.** When the HEADLINE event carries `meetUrl` and starts within
**15 minutes** (or is running: start ≤ now < end), a small accent **"Join"**
link renders at the end of the headline row, opening in a new tab. Never
renders otherwise. Setting: a **"Meeting links" toggle on the calendar card,
default ON** (it only manifests when a joinable meeting is imminent; the
toggle exists for whoever wants it gone).

## W3-SP4: Delights

**Sun times + moon phase:** two widgets, each with its own Widgets-tab toggle —
`WidgetToggles` grows two members, which REQUIRES the in-code law: schema
CURRENT_VERSION bump + nested-key migration step. Pure local math in
`src/lib/sun.ts` (NOAA sunrise/sunset/golden hour) and `src/lib/moon.ts`
(synodic phase), both fully unit-tested against known ephemeris fixtures.
Location comes from the weather widget's saved location; no location → the
widget renders nothing and the Widgets tab row says why. Sun line:
`☀ 6:12 → 20:31 · golden hour 19:48`. Moon: phase glyph + name
("Waxing gibbous").

**APOD background:** a Background-settings toggle — "NASA astronomy photo of
the day" — added beside the curated set. One fetch per day, cached; on any
failure (network, rate limit, video-media day) the background quietly falls
back to the curated set — the background never breaks. Credit line (title +
copyright) via the existing photo-credits idiom. Origin granted on toggle
(api.nasa.gov + the image host), released on toggle-off.

## W3-SP5: Home Assistant

**Connect.** GitLab-shaped: instance URL + long-lived access token; identity
probe `/api/config`, card shows "Connected to {location_name}".
**LIMITATION (Jon informed and approved): https-only.** Nabu Casa cloud URLs
and reverse-proxied instances work; plain `http://homeassistant.local:8123`
cannot be granted (permission machinery is https-only; loosening to http is a
CWS + security regression we refuse). Helper text states this plainly.

**Entity picker** (Jon's pick over typed IDs): on the connected card, "Choose
entities" fetches `/api/states` ONCE and opens a searchable, domain-grouped
checklist (fuzzy matcher again), capturing `friendly_name` at pick time.
Caps: **6 state chips + 3 action buttons**. Eligible actions: scenes, scripts,
switches.

**Card.** State chips: `{friendly_name} {value}{unit}`. Action buttons call
the service API (`scene.turn_on` / `script.turn_on` / `switch.toggle`) with a
pressed-state flash and a brief error tint on failure — no dialogs, no error
UI. TTL **60s** (home state goes stale faster than PRs); poll-on-tab-open
only, per the privacy story. Token is the secret (`secretFields: ['token']`);
identityField carries the location name. House laws throughout: quiet
degradation, no-husk, glance caps, interaction probes at the visual gate.

## Cross-cutting rulings

- "Give people a choice": SP2's service list, SP5's picker, SP3's toggle, and
  SP4's widget toggles ARE the choice surfaces — no gratuitous chips rows
  where the list itself already composes the card.
- Every sub-project inherits the standing gates: TDD, task reviews, preview
  sweeps at true display maxes, interaction probes, controller-viewed
  captures, per-task commit+push, staged zips behind the v1.2.1 verdict.
- New origins summary (for PRIVACY.md updates as each SP lands): statuspage
  domains per service (SP2), api.nasa.gov/apod hosts (SP4), the user's own HA
  instance (SP5). No new install-time permissions anywhere.

## Out of scope

HA over plain-http LAN; HA camera/media entities; a Todoist/Linear/stocks
connector (listed as candidates, not chosen); RSS/crypto view chips; SP3 OAuth
(unchanged, blocked on Jon's registrations); any telemetry-based ranking.
