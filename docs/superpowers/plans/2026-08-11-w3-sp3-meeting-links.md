# W3-SP3: Meeting Links in the Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The ICS parser reads LOCATION and DESCRIPTION for known meeting URLs; when the headline event carries one and starts within 15 minutes (or is running), an accent "Join" link appears at the end of the headline row. A "Meeting links" toggle on the calendar card (default ON) gates it.

**Architecture:** `ParsedEvent` gains the two raw text fields; a pure `extractMeetUrl` picks the first known-provider URL (LOCATION before DESCRIPTION); `IcsEvent.meetUrl?` threads through `expand` so every RRULE occurrence shares its base event's link. The toggle is render-only — meetUrl already lives in the snapshot, so flipping it never needs a refetch (no snapshot-clear pact here; comment says why). Cached URLs stay on-device (snapshots are excluded from exports already).

**Tech Stack:** unchanged. No new deps, no schema bump (`meetLinks?: boolean` is an optional sparse field, absent → ON).

**Spec:** `docs/superpowers/specs/2026-08-10-wave3-design.md` (W3-SP3 — binding).

## Global Constraints

- Providers (pinned): a URL whose host/path matches `zoom.us` (any subdomain), `meet.google.com`, `teams.microsoft.com` with `/l/meetup-join` in the path, `webex.com` (any subdomain), `whereby.com`. First match wins; LOCATION checked before DESCRIPTION; https only.
- The Join affordance: visible only when ALL hold — `meetLinks` resolves ON, the HEADLINE event has `meetUrl`, and `start − now ≤ 15min && now < end` (imminent or running). Never on agenda rows. Copy exact: the link text is `Join`.
- Link semantics: `<a href={meetUrl} target="_blank" rel="noopener noreferrer">`, accent tone (`text-accent`), pointer cursor.
- `parseIcs` stays PURE (no Date.now()); the 15-minute window math lives in the widget with the render-time `now`.
- PROCESS LAW (adopted at SP2 close): Task 89 touches the settings drawer, so its OWN gate includes the FULL preview harness run, not just vitest.
- House laws: zero-hooks-in-the-gate; copy exact; falsifiable probes; monotonicity untouched (the Join link adds width, not height — the headline row already truncates; prove it in the harness).
- Verification per task: `npx tsc --noEmit` + `npx vitest run` + `npm run build` ALL PASS 0 FAIL; Tasks 89–90 add `npm run build:preview` + FULL FOREGROUND `node scripts/preview.mjs` (baseline 382).
- Version stays 1.11.0 until Task 91 bumps 1.12.0 (STAGED; v1.2.1 repo-evidence check, STOP if landed).
- Commit trailer on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_019jmj3LhjmyuYThCNXwS1kX`

## Interfaces consumed (main at `1602e46`)

```
src/services/connectors/ics.ts — ParsedEvent (line ~84: summary/start/end/duration/rrule/exdates), buildEvent (collects VEVENT props incl. unescapeText), expand (emits occurrences via push), IcsEvent {summary,start,end,cal}, parseIcs return Omit<IcsEvent,'cal'>[], fetchIcs tags cal, icsViewOf (~583), icsCalendarsOf, IcsConfig
src/newtab/widgets/calendar/CalendarWidget.tsx — headline render (~line 150-160: dot + "Next: {summary} · {relative}" inside flex row w/ truncating span), selectAgenda, NOW-pinned test fixtures (Fri 2026-08-07 09:00)
src/settings/sections/Connectors.tsx — IcsBody (view controls "Show" select region — the toggle lands beside it), Switch component (src/settings/Switch.tsx)
scripts/preview.mjs — ics fixture blocks (5-calendar seeds, relative-to-Date.now() events), drawer probes
```

---

### Task 88: The parser learns meeting URLs

**Files:**
- Modify: `src/services/connectors/ics.ts`
- Test: `src/services/connectors/ics.test.ts`

**Interfaces produced:**
- `IcsEvent` gains `meetUrl?: string`; `ParsedEvent` gains `location: string` and `description: string` (unescaped, '' when absent).
- `export function extractMeetUrl(location: string, description: string): string | undefined` — PURE, exported for direct testing. Scans LOCATION then DESCRIPTION for the first https URL matching the provider list (regex over URL candidates: match `https://[^\s<>"]+`, then test host/path rules via `new URL`; unparseable candidates skipped).
- `buildEvent` collects `LOCATION`/`DESCRIPTION` (first instance each, `unescapeText`-decoded); `expand` computes `meetUrl` ONCE per ParsedEvent and stamps it on every emitted occurrence (absent — not `undefined`-valued — when no match: use conditional spread so JSON shapes stay clean).

- [ ] **Step 1: Failing tests** — extractMeetUrl direct: each provider matches (subdomain zoom `https://us02web.zoom.us/j/123`, meet.google.com, teams with `/l/meetup-join/...`, webex subdomain, whereby); teams WITHOUT the meetup-join path does NOT match; http:// does not match; a non-provider URL does not match; LOCATION wins over DESCRIPTION when both carry providers; a DESCRIPTION-only match works; text around the URL tolerated ("Join here: {url} — agenda…"); ICS-escaped commas/newlines in DESCRIPTION decode before scanning. Pipeline: a VEVENT with LOCATION zoom link → every parseIcs occurrence (incl. a COUNT=3 daily RRULE — all three) carries meetUrl; a VEVENT without → occurrences have NO meetUrl key; fetchIcs passes it through with cal tagging intact. RED → implement → GREEN.
- [ ] **Step 2: Full gates. Commit + push** — `feat(ics): the parser finds the meeting link — zoom, meet, teams, webex, whereby`.

---

### Task 89: The Join link + the toggle

**Files:**
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx`, `src/services/connectors/ics.ts` (icsViewOf return gains the flag — or a sibling reader, implementer's call stated in the report), `src/services/connectors/types.ts` (`IcsConfig.meetLinks?: boolean`), `src/settings/sections/Connectors.tsx` (IcsBody toggle row)
- Test: `CalendarWidget.test.tsx`, `SettingsPanel.test.tsx`

**Interfaces:** `meetLinks` absent/non-boolean → `true` (default ON, read-time — the icsViewOf discipline). Settings row: the house `row`/`label` idiom + `Switch` with `aria-label="Meeting links"`, label text `Meeting links`, placed with the view controls; writes `{ ...ics, meetLinks: next }` through the normalized rebuild (updateIcs's patch param). NO snapshot clear (render-only — the why-comment).

- [ ] **Step 1: Widget failing tests** (NOW = Fri 2026-08-07 09:00 pinned): headline event at 09:10 with meetUrl → `Join` link present, `href` exact, `target="_blank"`, `rel` contains noopener; at 09:30 (16+ min out) → absent; running event (08:50–09:30) → present; ended → absent (it can't be headline anyway — assert via the next-in-line case); agenda-row events with meetUrl → no link in rows; `meetLinks: false` → absent even when imminent; absent flag → ON. RED → implement (the anchor sits AFTER the truncating span inside the headline flex row, `shrink-0` so truncation eats the title, never the link) → GREEN.
- [ ] **Step 2: Settings failing tests** — toggle renders checked by default (absent flag); flipping writes `meetLinks: false` preserving calendars/view/upcomingCount; flipping back writes true; no `connectorSnapshots.ics` write on toggle (assert the snapshot survives). RED → implement → GREEN.
- [ ] **Step 3: Full gates INCLUDING the full preview harness (PROCESS LAW — this task touches the drawer; baseline 382, expect no drawer probe changes; if a catalog probe legitimately needs the new toggle in an exact-membership expectation, update it here, named in the report). Commit + push** — `feat(calendar): one click to the meeting — join appears when it matters`.

---

### Task 90: Harness — the link proves itself

**Files:**
- Modify: `scripts/preview.mjs`

- [ ] **Step 1: Probes** — seed the ics fixture with an imminent meeting (start = now + 10min, zoom URL in LOCATION): Join link present in the real DOM, href exact, cursor pointer, `rel` correct; the headline still truncates (probe with a long summary at the card's width — the link keeps its full width, `shrink-0`); a variant with the meeting 30min out → no link; toggle OFF through the real drawer → link vanishes live, back ON → returns (the chips-probe idiom); agenda rows never carry links.
- [ ] **Step 2: Captures** — `calendar-join-link.png` (the card with the Join link visible). Controller views it.
- [ ] **Step 3: Full gates incl. FULL FOREGROUND preview, exact counts (baseline 382 + new). Commit + push** — `test(calendar): join appears when it matters — and only then`.

---

### Task 91: Wrap — docs + v1.12.0 staged

- [ ] **Step 1: Docs** — README calendar line gains the meeting-link sentence; PRIVACY.md calendar bullet notes meeting URLs are parsed locally from your calendar feed and never fetched/sent anywhere (a link only opens when you click it); store-listing STAGED v1.12.0 addendum (feature-only, no new hosts/permissions).
- [ ] **Step 2: v1.2.1 repo-evidence check (STOP if landed) → bump 1.12.0 → `npm run package` → aurora-1.12.0.zip guards green.**
- [ ] **Step 3: Full verify (all gates, exact counts). Commit + push** — `feat: v1.12.0 — join the meeting from the board`.

## After Task 91

Whole-SP review (sonnet; escalate on doubt): charges — parser purity held (no Date.now() in ics.ts); provider matrix complete incl. the teams path constraint; the 15-minute window math boundary-tested; default-ON resolution; the render-only/no-snapshot-clear ruling sound; truncation never eats the link. ONE fix wave + ONE scoped re-review. Report to Jon with the capture. Atlassian + memory + delete workspace.

## Out of scope

Meeting links on agenda rows; countdown-to-meeting text; providers beyond the pinned five; parsing ATTACH/URL properties; SP4/SP5.
