# Calendar connector: multiple calendars, webcal links, upcoming views

**Date:** 2026-08-10
**Status:** Approved by Jon (design sections 1–3 approved in conversation)
**Motivation:** Jon's primary use case for the calendar widget is his Apple
calendars — a personal calendar (published as a `webcal://` link) and a
calendar privately shared with his wife (published via Apple's owner-only
"Public Calendar" toggle). Today the connector accepts exactly one `https://`
ICS URL, so neither goal is reachable: `webcal://` links are rejected by the
https-only validation, and there is no second slot. Apple publishes one feed
per calendar (no combined feed), so multi-feed support is required, not nice
to have.

## Scope

1. Accept `webcal://` links by converting them to `https://` at save time.
2. Support up to **5 named calendars** in the one `ics` connector, merged
   into the existing compact agenda widget with per-calendar colored dots.
3. Add view options beyond today: **Today** (current behavior), **Upcoming**
   (next 2–4 events across days), **One per calendar** (each calendar's
   soonest event).

Out of scope: cross-calendar event dedup (an event genuinely on two
calendars shows twice — same as every calendar app), CalDAV/auth'd Apple
access, month-grid or expanded calendar layouts.

## Config schema (`src/services/connectors/types.ts`)

```ts
export interface IcsCalendar {
  name: string // display name, e.g. "Personal", "Family"
  url: string // https-only at rest — webcal:// is converted before persist
}
export interface IcsConfig {
  enabled: boolean
  calendars: IcsCalendar[] // max 5 (MAX_CALENDARS, mirrors RSS's MAX_FEEDS)
  view: 'today' | 'upcoming' | 'per-calendar' // default 'today'
  upcomingCount: number // 2–4, default 3; meaningful only when view='upcoming'
}
```

### Migration: read-time, not a storage migration

One shared helper (exported from `ics.ts`):

```ts
icsCalendarsOf(config: IcsConfig | undefined): IcsCalendar[]
```

- `calendars` is a structurally valid array → return it (entries failing
  `typeof name === 'string' && typeof url === 'string' && url.length > 0`
  are filtered out, not fatal).
- Otherwise, legacy shape `{ url: string }` with a non-empty string url →
  `[{ name: 'Calendar', url }]`.
- Otherwise `[]`.

Callers: the widget gate, `IcsBody` in settings, and the descriptor's
`origins()`. The first save from the new settings card writes the new shape;
no storage-layer migration step exists. `view`/`upcomingCount` similarly
default at read time (`'today'` / 3) when absent or invalid — a
backup-restored or hand-edited config can hold anything (import validates
only `enabled`, per the existing discipline).

## Service layer (`src/services/connectors/ics.ts`)

- `IcsEvent` gains `cal: number` — the event's index into the calendars
  array. `parseIcs` stays pure and untouched; tagging happens in `fetchIcs`
  after parse.
- `fetchIcs(calendars: IcsCalendar[], windowStart, prev, fetchFn?)` fetches
  all feeds **in parallel**, each with the existing 8s abort, then merges
  and sorts ascending.
- **Per-feed quiet failure:** a feed whose fetch errors (network, abort,
  non-OK) contributes `prev.events.filter(e => e.cal === i)` instead of
  blanking; the other feeds still refresh. The whole-result fallback (`prev
  ?? { events: [] }`) remains for the degenerate no-calendars case.
  Accepted edge: the fallback keys by index, so a snapshot taken under a
  differently-ordered calendar list can transiently mis-tag a failed feed's
  carried-over events until the next successful refresh (add/remove clears
  the cached snapshot, so the remounted widget fetches immediately).
- Descriptor changes: `secretFields: ['url', 'calendars']` — the whole
  list strips on backup export (every URL is a secret; names without URLs
  are useless), and the legacy `url` field strips too: migration is
  read-time only, so a config that's never re-saved still carries the old
  `url` secret at rest and must not leak it through an export. `origins(config)` maps `icsCalendarsOf(config)` through
  `originPattern`, swallowing per-entry throws to fewer origins (degrade,
  never throw out of a registry sweep).

## Settings card (`IcsBody` in `src/settings/sections/Connectors.tsx`)

RSS-style list + add form, keeping ics's derived-origin mechanics:

- **List row per calendar:** colored dot (see palette below), name, feed
  **host** (e.g. `p57-caldav.icloud.com` — the path is the secret, the host
  is safe and disambiguates same-provider feeds), Remove button. Removal
  follows RSS's write-result-based survivor accounting: survivors come from
  the storage write's return value, and an origin still derived by any
  surviving calendar (or another connector, via `releasableOrigins`) is
  never revoked.
- **Add form:** name field (plain text; empty → `Calendar N`) + URL field
  (`type="password"`) + Add. Submit order: trim → **`webcal://` →
  `https://` prefix conversion** → synchronous `originPattern` validation
  (unchanged error copy) → duplicate-URL rejection → `ensureOrigin` as the
  FIRST await (gesture chain, zero awaits ahead) → persist. At 5 entries
  the form disables.
- **Helper text** adds an Apple line alongside the existing Google/Outlook
  one: In Apple Calendar, make the calendar Public (owner only — a
  participant of a shared calendar never sees the toggle) and paste the
  webcal link; it works as-is.
- **View controls:** a three-way "Show" select (Today / Upcoming / One per
  calendar) and, when Upcoming is selected, a count select (2–4). Both
  write immediately on change (RSS `shownCount` idiom), no Save button.
- The legacy single-URL form (Save/Clear over one field) is replaced
  entirely; a legacy config surfaces through `icsCalendarsOf` as one list
  entry named "Calendar".

### Dot palette

Fixed by list position, 5 theme-tuned colors; position 1 is the accent
color, 2–5 are distinct hues chosen against both themes at implementation
time (visual gate verifies). The settings row's dot is the widget's legend.

## Widget (`src/newtab/widgets/calendar/CalendarWidget.tsx`)

- **Gate:** `enabled` && `icsCalendarsOf(ics).length > 0`.
- **Headline** ("Next: {summary} · {relative}") stays in every mode —
  soonest upcoming **timed** event across all calendars, all-day fallback
  unchanged — and gains its calendar's dot.
- **Single-calendar rule:** when exactly one calendar is configured, no
  dots render anywhere.
- **Rows by mode**, always excluding the headline event:
  - `today`: unchanged — up to 2 (`MAX_AGENDA_ROWS`) remaining events
    overlapping today's local day.
  - `upcoming`: the next `upcomingCount` (2–4) events across days.
  - `per-calendar`: for each calendar in list order, its soonest
    not-already-shown upcoming event; a calendar with nothing upcoming
    contributes no row. Max 5 rows.
- **Row formats** (day token only when needed):
  - Today: `09:30 Standup` / `All day · Holiday` (unchanged).
  - Tomorrow through 6 days out: `Tue 09:30 Standup` / `Tue · Holiday`.
  - Further (within the 60-day window): `Aug 18 09:30 Standup` /
    `Aug 18 · Holiday`.
  - Day boundaries computed via the existing `localDayRange` local-midnight
    math (DST-safe), not raw ms division.
- **Empty states:** `today` keeps "No more events today."; `upcoming` and
  `per-calendar` say "No upcoming events."

### Layout risk — measured, not assumed

The card's default band was collision-measured for 3 text lines;
`per-calendar` can reach 6 (headline + 5 rows). The preview sweep fixture
runs at **true display max** — 5 calendars in per-calendar mode, and the
4-row upcoming case — and `scripts/preview.mjs`'s collision probe must pass.
If the band can't take the height, the **default position moves; the
feature is never data-capped to fit** (the fixture law and the
"never data-gate what CSS tier-gates" law both apply). Arrange-mode drag is
unaffected.

## Testing

Unit (vitest, existing harnesses):

- `icsCalendarsOf`: new shape, legacy shape, malformed entries filtered,
  garbage → `[]`.
- `fetchIcs`: parallel multi-feed merge + `cal` tagging; one feed failing
  keeps its previous events while others refresh; all failing → prev.
- Selection: headline exclusion per mode, all-day ordering, per-calendar
  skip when a calendar is exhausted, upcoming count bounds.
- Backup: legacy `url` AND `calendars` both stripped on export (see
  descriptor changes above).
- Formatting: day-token boundaries (today / tomorrow / 6 days / 7+ days),
  all-day variants.
- Settings: webcal conversion (`webcal://x/y` saves as `https://x/y`),
  https rejection unchanged, duplicate rejection, cap at 5, share-aware
  origin release on remove (same-origin two-calendar case), gesture-chain
  order preserved.
- Descriptor: `secretFields: ['calendars']` strip in backup export;
  restored config renders nothing until re-added; `origins()` multi-entry +
  per-entry degradation.

Visual gate (per the widget quality bar): screenshots at the true-max
fixtures in both themes and all density tiers, **interaction probes**
included, and the settings card exercised end-to-end in the real extension
with a real iCloud public feed.

## Decisions log

- Approach: named calendar list inside the one `ics` connector (rejected:
  multi-URL single field; per-calendar connector instances — fights the
  fixed `CONNECTOR_IDS` union).
- Attribution: colored dots (rejected: name prefixes — eats row width; no
  attribution).
- View modes: all three, user-selectable (Jon explicitly wants "next
  upcoming for each calendar, or the next 2–3").
- No event dedup across calendars — matches calendar-app behavior.
- webcal normalization at save time only — everything downstream stays
  https-only and the permissions machinery is untouched.
