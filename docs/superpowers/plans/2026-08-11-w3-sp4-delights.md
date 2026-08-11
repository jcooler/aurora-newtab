# W3-SP4: Delights — Sun Times, Moon Phase, APOD Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two zero-permission local widgets — sun times (NOAA sunrise/sunset/golden hour) and moon phase (synodic) — each behind its own Widgets-tab toggle, plus an opt-in "NASA photo of the day" background source that fetches once a day, credits the image, and falls back to the curated set on any failure.

**Architecture:** Pure sky math in `src/lib/sun.ts` and `src/lib/moon.ts` (no network, ephemeris-fixture-tested); two gate/inner widgets in left-rail column 2 below habits; `WidgetToggles` grows `sun` + `moon` which triggers the in-code schema law (CURRENT_VERSION 8 → 9 + generic `migrations[8]`). APOD is a fourth `PhotoPrefs.mode` value `'apod'` — a fourth option in the Background section's existing Source select — with a day-stamped cache key `apodCache` (export-excluded like `connectorSnapshots`), a new `ensureOrigins` plural gesture helper, and release-on-switch-away that is share-aware against connector-held origins.

**Tech Stack:** unchanged. No new deps. NASA APOD via `DEMO_KEY` (keyless for the user; one cached call/day sits far under its rate limits; any 429 is just another quiet-fallback day).

**Spec:** `docs/superpowers/specs/2026-08-10-wave3-design.md` (W3-SP4 section — binding, with three pinned deviations recorded here-vs-there: (1) the "Background-settings toggle" ships as a fourth option in the section's existing Source `<select>` — that select IS the background chooser and a second competing control beside it would be worse UI; the select-onChange gesture path for `chrome.permissions.request` is the one SP2's curated status pick proved in the real browser; (2) "the image host" is pinned to `apod.nasa.gov` — an APOD entry whose image lives anywhere else is treated as a failure day (we will not hold a grant for arbitrary third-party hosts); (3) polar day/night — a date with no sunrise or no sunset at the saved latitude — renders nothing for the sun widget that day, per the no-husk law; (4) the "existing photo-credits idiom" is in fact a tooltip on the auto-mode refresh button (Background.tsx:221) — APOD mode has no refresh button (nothing to cycle), so the credit ships as a small VISIBLE `text-photo` caption in the refresh button's corner instead, which honors the spec's "credit line" more literally than the idiom it named.)

## Global Constraints

- Copy exact — sun line: `☀ {rise} → {set} · golden hour {gh}`; the `· golden hour {gh}` segment is omitted when the +6° descent doesn't occur that date. Moon line: `{glyph} {name}` (e.g. `🌔 Waxing gibbous`). Times via the house `formatClock(date, settings.use24Hour)` (`src/lib/clock.ts:1`) — never a hand-rolled formatter.
- Widgets-tab labels: `sun: 'Sun times'`, `moon: 'Moon phase'` (WIDGET_LABELS, sentence case). Both toggles DEFAULT OFF (the habits/monthCal precedent). Control ids `#w-sun`, `#w-moon`.
- Both widgets gate on `settings.widgets.<key>` AND `location != null` (the weather widget's `StoredLocation`, storage key `location`, null = unset). Zero-hooks-in-the-gate split (MonthCalWidget's documented idiom). No location → render nothing; the Widgets tab says why (Task 94's pinned hint copy). The weather TOGGLE is irrelevant — `location` is a top-level key that outlives the widget.
- Moon glyphs are the eight standard emoji (🌑🌒🌓🌔🌕🌖🌗🌘); southern hemisphere (`lat < 0`) mirrors the waxing/waning glyphs (names unchanged). Phase names pinned: New moon, Waxing crescent, First quarter, Waxing gibbous, Full moon, Waning gibbous, Last quarter, Waning crescent.
- Schema law (schema.ts:6-21, verbatim standing rule): `WidgetToggles` growth requires, in the SAME change, CURRENT_VERSION 8 → 9 AND a `migrations[8]` step copying `migrations[6]`'s generic nested-widgets shape. ONE bump covers this whole SP (`apodCache` is a new TOP-LEVEL key — the default-merge backfills those; the migration contract comment says so).
- `apodCache` is cache, not user data: excluded from backup exports and hard-reset on import, exactly the `connectorSnapshots` mechanism (backup.ts `Omit`, the serialize destructure, the `VALIDATORS` `Exclude`, the import reset branch — reset value `null`).
- APOD network law: at most ONE fetch per local day (`todayKey()` day-stamp; a failed day writes `photo: null` and does not retry until tomorrow — spec-literal "one fetch per day"). Fetch via `getJson` (`src/services/connectors/http.ts` — 8s abort, typed errors). `media_type !== 'image'` is a failure day. The chosen url must be https on host `apod.nasa.gov` (prefer `hdurl`, fall back to `url`, else failure day).
- Gesture chain (permissions.ts law): picking the NASA source runs `ensureOrigins([...])` as the FIRST await with zero awaits ahead; denial reverts the select to the prior mode and explains inline (`role="alert"`). Switching away from `'apod'` releases `https://api.nasa.gov/*` and `https://apod.nasa.gov/*` EXCEPT any origin an enabled connector still derives (`heldOrigins` — Task 95), and clears `apodCache`.
- No connectors-drawer entry, no manifest change (`optional_host_permissions: ['https://*/*']` already covers requestability), no new install-time permissions.
- House laws: no-husk; quiet degradation (background NEVER breaks — every APOD failure lands on the curated set via the existing `effectiveMode` cascade); never data-gate what CSS tier-gates; monotonic visibility; danger/alert copy states consequence + recovery in sentence case.
- Verification per task: `npx tsc --noEmit` + `npx vitest run` + `npm run build` ALL PASS 0 FAIL; Tasks 96-97 add `npm run build:preview` + FULL FOREGROUND `node scripts/preview.mjs` (backgrounding it has killed agents). Harness baseline: last harness-touching commit recorded 386 PASS (`d7edb60`); the SP3 close-out note said 388 — the controller's pre-flight foreground run at main pins the real number BEFORE Task 92 dispatch, and every gate thereafter uses exact counts from it.
- Version stays 1.12.0 until Task 98 bumps 1.13.0 (STAGED; v1.2.1 repo-evidence check first, STOP if landed).
- Commit trailer on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: ccd://5028e406-b4dd-4dea-8365-fccae04a8e59`

## Interfaces consumed (main at `c9f1536`)

```
src/lib/storage/schema.ts — CURRENT_VERSION=8 (:4) + the standing rule (:6-21); WidgetToggles (:22-35, 12 members); Settings.use24Hour (:39); PhotoPrefs (:94-101, mode: 'auto'|'upload'|'gradient'); StoredLocation (:103-108, { lat, lon, label, manual }); AuroraData (:165-181); defaults() (:185-223, widgets block :193-206, photoPrefs :212, location: null :213)
src/lib/storage/migrations.ts — migrations[6] generic nested-widgets shape (:87-99, copy for [8]); migrate() (:120-137); migrations.test.ts per-version describe blocks (v6→v7 at :258 is the model)
src/lib/backup.ts — isWidgetToggles strict validator (:149, auto-derives from defaults()); isPhotoPrefs (:205-213 — CHECK whether mode is membership-validated; if so add 'apod'); connectorSnapshots exclusion mechanism (:25 Omit, :67 destructure, :305 VALIDATORS Exclude, :394-397 import reset)
src/lib/clock.ts — formatClock(d: Date, use24Hour: boolean): string (:1)
src/lib/dates.ts — todayKey() (:1), dayHash (:9)
src/lib/hooks/useStoredKey.ts — useStoredKey<K extends DataKey>(key) (:5); src/lib/hooks/useNow.ts — useNow(intervalMs)
src/newtab/widgets/monthcal/MonthCalWidget.tsx — the gate/inner split + its zero-hooks doc comment (:19-28)
src/newtab/App.tsx — left rail col2 members (:486-518, monthCal + habits with className="rail-col2 tier-fade"); WidgetBoundary/PositionedBlock idiom (:506-510)
src/lib/layout/types.ts — BLOCK_IDS (:1-8, 23 members, grows 'sun','moon'); src/newtab/arrange/ArrangeController.tsx — BLOCK_LABELS (:20-44, exhaustive Record)
src/settings/sections/Widgets.tsx — WIDGET_LABELS (:9-22); row idiom (:101-122); the bookmarks describedBy + role="alert" precedent (:76-97, :116-128); handleWidgetToggle
src/settings/sections/Background.tsx — Source select (:70-87, id="set-bg-mode", options auto/'Daily photo', upload/'My photo', gradient/'Gradient'); props (:14-30); write idioms (:44-45, :59-60)
src/settings/Switch.tsx — Switch props (:20-40); "Do not make this handler async." (:56)
src/newtab/components/Background.tsx — effectiveMode cascade (:56-64, upload-with-empty-gallery → auto — the fallback seam); derived block (:130-143); <img key={src}> fade (:196-205); LQIP-null gradient-gap behavior (:154-186); refresh button + credit title (:217-229)
src/services/photos/index.ts — BUNDLED, bundledUrl(index, tier) (:19)
src/services/permissions.ts — originPattern (:84, throws on non-https), ensureOrigin (:108) + the gesture law (:99-107), removeOrigin (:121, swallows)
src/services/connectors/registry.ts — releasableOrigins (:96) + originsOf defensive wrapper (:72); CONNECTORS
src/services/connectors/http.ts — getJson<T>(url, headers, fetchFn?) → JsonResult<T> | JsonError (:59), FETCH_TIMEOUT_MS 8s
scripts/preview.mjs — waitForPhotoSettle (:1111-1119); openSettingsTab (:488-491); fixture seeding idiom (page.evaluate + spread + reload + waitForSelector('time') + 800ms); combined-defaults gate (:8385+, PAGE_ELEMENTS :8802-8817, pairwise :8876-8913, mid-left gap floors :9437); rails resize sweep (:9974-9988, col2 shows at steps 1 and 9); fresh-install DEFAULT state block (:13145-13230); Switch-drive idiom via aria-checked (:7660-7695); page.selectOption('#set-bg-mode', …) (:1519, restore :1542)
```

---

### Task 92: The sky math — sun.ts and moon.ts

**Files:**
- Create: `src/lib/sun.ts`, `src/lib/sun.test.ts`, `src/lib/moon.ts`, `src/lib/moon.test.ts`

**Interfaces produced (later tasks rely on EXACT names):**
- `sun.ts`:
  - `export interface SunTimes { sunrise: Date; sunset: Date; goldenHour: Date | null }` — `goldenHour` = the evening moment the sun's center descends through +6° elevation; `null` when that elevation crossing doesn't occur that date.
  - `export function sunTimes(date: Date, lat: number, lon: number): SunTimes | null` — NOAA solar calculation (fractional year → equation of time + declination → hour angle at zenith 90.833° for rise/set, zenith 84° for golden hour), solved in UTC for the LOCAL calendar day of `date`, returned as local `Date`s. Returns `null` for polar day/night (no rise or no set). PURE — no `Date.now()`; the caller passes `date`.
- `moon.ts`:
  - `export interface MoonPhase { name: string; glyph: string; age: number; fraction: number }` — `age` in days since new moon, `fraction` = `age / SYNODIC_DAYS` in [0,1).
  - `export const SYNODIC_DAYS = 29.530588853`
  - `export function moonPhase(date: Date, southern = false): MoonPhase` — age from the reference new moon `2000-01-06T18:14:00Z`, modulo `SYNODIC_DAYS` (negative-safe). Eight equal segments centered on the principal phases: fraction within 1/16 of 0 (or ≥ 15/16) → New moon; within 1/16 of 0.25 → First quarter; of 0.5 → Full moon; of 0.75 → Last quarter; the four gaps between are Waxing crescent / Waxing gibbous / Waning gibbous / Waning crescent. `southern` mirrors glyphs for the four non-principal + two quarter phases (🌒↔🌘, 🌓↔🌗, 🌔↔🌖; 🌑/🌕 are symmetric). PURE.

- [ ] **Step 1: Gather ephemeris fixtures (build-time verification — the SP2 curated-list discipline).** Sun: from the NOAA solar calculator (gml.noaa.gov/grad/solcalc/), record sunrise/sunset for at least: New York 40.7128,-74.0060 on 2026-06-21 and 2026-12-21; Sydney -33.8688,151.2093 on 2026-06-21; London 51.5074,-0.1278 on 2026-03-20. Record source + retrieval date + values in test-file comments. Moon: from a published 2026 phase table (timeanddate.com or USNO), record ≥4 principal-phase instants across 2026 plus 2000-01-21 (full moon, the lunar-eclipse anchor near the epoch). Same evidence discipline.
- [ ] **Step 2: Failing tests** — sun: each fixture within ±2 minutes for rise and set; golden hour precedes sunset by a plausible margin (30-80 min at the mid-latitude fixtures) and is itself fixture-checked where the NOAA table gives a +6° time; Tromsø 69.6492,18.9553 on 2026-06-21 → `null` (polar day) and on 2026-12-21 → `null` (polar night); longitude sign sanity (NYC rise is morning LOCAL time); pure (same inputs → identical output, no clock reads). Moon: each principal-phase fixture date lands the right `name`; a date 4 days after a fixture new moon → Waxing crescent; segment boundaries fenceposted (fraction 1/16 ± epsilon flips New moon ↔ Waxing crescent); `southern: true` mirrors 🌒→🌘 and 🌓→🌗 but keeps names; age stays in [0, SYNODIC_DAYS). RED → implement → GREEN.
- [ ] **Step 3: Full gates. Commit + push** — `feat(lib): the sky does math — noaa sun times and the synodic moon`.

---

### Task 93: Schema v9 — the toggles exist and the law is obeyed

**Files:**
- Modify: `src/lib/storage/schema.ts`, `src/lib/storage/migrations.ts`, `src/lib/storage/migrations.test.ts`
- Test: extend `src/lib/backup.test.ts` only if a case there enumerates widget keys explicitly (grep first; `isWidgetToggles` auto-derives)

**Interfaces produced:** `WidgetToggles` gains `sun: boolean; moon: boolean` (members 13-14); `defaults().settings.widgets` gains `sun: false, moon: false`; `CURRENT_VERSION = 9`; `migrations[8]` = byte-identical copy of `migrations[6]`'s generic shape (the rule's own instruction).

- [ ] **Step 1: Failing tests** — a `describe('v8 -> v9')` block modeled on v6→v7's (:258): a stored v8 snapshot missing both keys gains `sun: false, moon: false` with every pre-existing widget value preserved; a v1 snapshot chains through ALL migrations to v9 with both keys present; array/garbage `settings` guard; `defaults()` round-trips `isWidgetToggles` (backup.ts). RED → implement (schema members + defaults + version + step) → GREEN.
- [ ] **Step 2: Full gates. Commit + push** — `feat(schema): v9 — sun and moon are real toggles, backfilled the lawful way`.

---

### Task 94: The widgets — sun and moon join the board

**Files:**
- Create: `src/newtab/widgets/sun/SunWidget.tsx`, `src/newtab/widgets/sun/SunWidget.test.tsx`, `src/newtab/widgets/moon/MoonWidget.tsx`, `src/newtab/widgets/moon/MoonWidget.test.tsx`
- Modify: `src/lib/layout/types.ts` (BLOCK_IDS + 'sun','moon'), `src/newtab/arrange/ArrangeController.tsx` (BLOCK_LABELS `sun: 'Sun times'`, `moon: 'Moon phase'`), `src/newtab/App.tsx` (rail col2), `src/settings/sections/Widgets.tsx` (WIDGET_LABELS + the location hint)
- Test: `src/settings/SettingsPanel.test.tsx` (Widgets-tab rows + hint)

**Interfaces:** consumes Task 92's `sunTimes`/`moonPhase` and Task 93's toggles. DOM contract for Task 97: `section[aria-label="Sun times"]` and `section[aria-label="Moon phase"]`, each a single `text-sm` line; block ids `sun` / `moon`.

- [ ] **Step 1: Widget failing tests** — the house trio for EACH widget: renders nothing while its toggle is off (and never starts `useNow`'s interval — the gate bug); toggle on + `location: null` → nothing; toggle on + location set → renders. Sun specifics (seed a pinned location + mock the date): line text matches `☀ {formatClock(rise)} → {formatClock(set)} · golden hour {formatClock(gh)}` exactly, `use24Hour` respected both ways, goldenHour-null date drops the trailing segment, polar-day date renders nothing (the gate, not the data, decides is Task 97's phrasing — here assert `container.firstChild === null`). Moon specifics: glyph + name text; a southern-latitude location mirrors the glyph, keeps the name. RED → implement → GREEN.
- [ ] **Step 2: Implement placement** — gate/inner split verbatim from MonthCalWidget's doc comment (gate reads `settings` + `location` via `useStoredKey`, zero other hooks; inner owns `useNow(60_000)`). App wiring: both join left-rail column 2 BELOW habits, order monthCal → habits → sun → moon, each `<WidgetBoundary name="…"><PositionedBlock id="…" pos={layout?.…} className="rail-col2 tier-fade">` (the siblings' exact classes).
- [ ] **Step 3: Settings failing tests** — WIDGET_LABELS rows render (`#w-sun`, `#w-moon`) and toggle through `patch` like every neighbor; when `location` is null a single hint paragraph `id="w-sky-location-hint"` renders once below the moon row with EXACT copy `Sun times and moon phase use the weather location. Turn on the weather widget and set a location first.`, class `text-xs text-fg-muted`, and BOTH switches carry `describedBy="w-sky-location-hint"`; with a location set the hint is absent. RED → implement → GREEN.
- [ ] **Step 4: Full gates. Commit + push** — `feat(widgets): sun and moon join the board — golden hour included`.

---

### Task 95: APOD plumbing — service, cache key, plural gesture helper, held origins

**Files:**
- Create: `src/services/apod.ts`, `src/services/apod.test.ts`
- Modify: `src/services/permissions.ts` (+`ensureOrigins`), `src/services/connectors/registry.ts` (+`heldOrigins`, refactor `releasableOrigins` onto it), `src/lib/storage/schema.ts` (+`apodCache`), `src/lib/backup.ts` (exclusion), `src/lib/backup.test.ts`, `src/services/connectors/registry.test.ts`

**Interfaces produced:**
- `schema.ts`: `export interface ApodPhoto { url: string; title: string; copyright?: string }`; `export interface ApodCache { date: string; photo: ApodPhoto | null }` (`photo: null` = attempted today, failed — fallback day); `AuroraData.apodCache: ApodCache | null`, default `null`. NO version bump beyond Task 93's (top-level key, default-merge backfills — cite the migrate() contract comment in a code comment).
- `apod.ts`:
  - `export const APOD_ORIGINS = ['https://api.nasa.gov/', 'https://apod.nasa.gov/'] as const` (URL form — `originPattern` derives the patterns)
  - `export const APOD_ENDPOINT = 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY'` (keyless-for-the-user; comment the rate-limit-is-a-fallback-day ruling)
  - `export async function fetchApod(fetchFn: typeof fetch = fetch): Promise<ApodPhoto | null>` — `getJson` → validate `media_type === 'image'` → prefer `hdurl` else `url` → accept only https + host exactly `apod.nasa.gov` → `{ url, title, copyright? }` (copyright whitespace-trimmed, omitted when absent/empty); ANY other shape/error → `null`. Never throws.
- `permissions.ts`: `export async function ensureOrigins(urls: readonly string[]): Promise<boolean>` — patterns via `originPattern` synchronously (throw → false BEFORE any await), then ONE `chrome.permissions.request({ origins })` as the first await; all-or-nothing; carries the same gesture-law doc comment as `ensureOrigin` (and says why plural: two origins, one prompt, one gesture).
- `registry.ts`: `export function heldOrigins(configs: Partial<Record<ConnectorId, ConnectorConfig>>): string[]` — the union of every ENABLED connector's `originsOf` patterns, deduped; `releasableOrigins` reimplemented as `own minus heldOrigins(others)` with behavior byte-identical (existing tests are the lock).

- [ ] **Step 1: Failing tests** — fetchApod: happy path (hdurl preferred); url-only entry; `media_type: 'video'` → null; non-apod-host image → null; http url → null; non-OK / network throw / parse garbage → null; copyright trimmed, absent stays absent. ensureOrigins: both patterns in ONE request call (spy); denial → false; a non-https member → false with ZERO request calls. heldOrigins: enabled-only, deduped, malformed-config degradation (originsOf's filter-don't-throw); releasableOrigins unchanged on its existing suite. backup: `apodCache` absent from a serialized export; import with a forged `apodCache` resets it to `null`; existing backups still validate. RED → implement → GREEN.
- [ ] **Step 2: Full gates. Commit + push** — `feat(apod): one photo a day from nasa — cached, keyless, quiet on failure`.

---

### Task 96: APOD in the UI — the fourth source and the sky on the board

**Files:**
- Modify: `src/lib/storage/schema.ts` (`PhotoPrefs.mode` union + `'apod'`), `src/lib/backup.ts` (ONLY if `isPhotoPrefs` membership-validates mode — check first), `src/settings/sections/Background.tsx`, `src/newtab/components/Background.tsx`
- Test: `src/settings/SettingsPanel.test.tsx`, `src/newtab/components/Background.test.tsx`

**Interfaces:** consumes Task 95's exports. Select option: `<option value="apod">NASA photo of the day</option>` after Gradient. Settings-side alert copy pinned: `Permission to reach NASA was denied, so the background is unchanged.` (id `bg-apod-error`, `role="alert"`, `text-xs text-fg-muted`, cleared on the next successful source change).

- [ ] **Step 1: Settings failing tests** — selecting `apod`: `ensureOrigins(APOD_ORIGINS)` is called with ZERO awaits ahead (the select's onChange handler stays synchronous up to it — the Switch.tsx discipline, same reason); granted → `savePhotoPrefs({ ...prefs, mode: 'apod' })`; denied/rejected → prefs UNWRITTEN, select shows the prior mode, alert renders with the pinned copy. Switching AWAY from `'apod'` (to any of the three): writes the new mode, clears `apodCache` (storage.update to null), and calls `removeOrigin` for each APOD origin pattern NOT in `heldOrigins(connectors)` — two cases: nothing held → both released; a fixture RSS feed on `apod.nasa.gov` enabled → that one origin survives, `api.nasa.gov` still released. RED → implement → GREEN.
- [ ] **Step 2: Background component failing tests** — mode `'apod'` + fresh `apodCache` (today, photo) → the `<img>` renders the cached url through the SAME `key={src}` fade path, LQIP underlay absent (documented gradient-gap behavior — cite Background.tsx:154-186 in a comment), credit caption `<p>` present with EXACT text `{title} © {copyright} · NASA APOD` (or `{title} · NASA APOD` when no copyright), classes `text-photo text-xs text-canvas-fg-muted`, positioned bottom-left where auto-mode's refresh button sits (the two never co-render: refresh stays auto-only via the existing `showRefresh`/`credit` derivations); mode `'apod'` + `photo: null` cache → curated set renders (effectiveMode cascade extended: `apod` without a usable today-photo → `'auto'`, exactly the upload-with-empty-gallery seam); mode `'apod'` + stale/absent cache → ONE fetch fires (mock), result written as `{ date: todayKey(), photo }`, failure written as `{ date, photo: null }` (and no second fetch that day — assert single call across a re-render); non-apod modes never fetch. RED → implement → GREEN. In-flight dedupe: a module-level promise ref (the useWeather `inFlight` idiom), and the write happens only when the stored cache is still stale (fresh-read update — the section's own stale-spread comment law).
- [ ] **Step 3: Full gates. Commit + push** — `feat(background): the universe as your wallpaper — nasa's photo of the day`.

---

### Task 97: Harness — the sky proves itself

**Files:**
- Modify: `scripts/preview.mjs`; `src/newtab/index.css`/`App.tsx` tier classes ONLY where measurement demands (derivation comments).

- [ ] **Step 1: Sun/moon probes** — new block after the Join-link block: seed `location` (the global seed already sets one — verify) + `settings.widgets.{sun,moon}: true`, reload, both `section[aria-label]`s present in col2 with non-empty single-line text matching the pinned shapes (regex `^☀ .+ → .+` and one of the eight glyphs); clear `location` to null + reload → both absent (`the location gate, not the toggle, decides`); restore. Fresh-install DEFAULT block gains two absence probes (`sun strip absent…`, `moon strip absent…` — default OFF).
- [ ] **Step 2: Combined-defaults + sweeps** — PAGE_ELEMENTS gains both (22 elements, C(22,2)=231 pairs — update the interpolated claim text); mid-left column gap floors re-derived WITH sun+moon on at monthCal's 6-row + habits' 6-chip worst case (order monthCal → habits → sun → moon; floors hold or col2's tier math is re-derived by measurement with derivation comments — sun/moon yield first as the newest members); rails resize sweep steps 1 and 9 add sun+moon to the expected col2 visibility list; capture `sky-strips.png` at 1600×900 with both visible.
- [ ] **Step 3: APOD probes** — settings side through the real drawer (General tab): `page.selectOption('#set-bg-mode', 'apod')` — headless Chromium cannot grant the prompt (the bookmarks-SKIP precedent), so assert the HONEST deny path: prefs unwritten (re-read storage), select back on the prior mode, `#bg-apod-error` alert with the pinned copy; log a `SKIP:` naming the headed spot-check the controller owes the grant path. Render side is permission-free: seed `photoPrefs.mode: 'apod'` + `apodCache` whose `photo.url` is a BUNDLED photo url (`bundledUrl(0,'2560x1600')` — same-origin, no grant needed, proves the real `<img key={src}>` path) + a title/copyright fixture → photo settles (waitForPhotoSettle), credit caption exact-text probe, refresh button ABSENT; then `photo: null` cache → curated background renders + refresh button present (the fallback probe); capture `apod-background.png` (credit visible). Restore `auto` + clear cache.
- [ ] **Step 4: Full gates incl. FULL FOREGROUND preview, exact counts (pre-flight baseline + new probes, every one named). Commit + push** — `test(sky): sun, moon, and the universe prove themselves`.

---

### Task 98: Wrap — docs + v1.13.0 staged

- [ ] **Step 1: Docs** — README: widgets list gains Sun times + Moon phase lines (each one sentence, location-sourced, zero-network); Background section gains the NASA sentence; the stale "Adding a widget" checklist step 3 fixed (`WIDGET_LABELS` lives in `src/settings/sections/Widgets.tsx`, not SettingsPanel — and the checklist gains the schema-law step). PRIVACY.md: "Network calls" reworded — the fixed-endpoint count sentence now says three fixed endpoints plus two OPT-IN sources (connectors, and NASA's photo of the day when you choose it); new numbered item for APOD (host `api.nasa.gov` + image host `apod.nasa.gov`, fires at most once per local day, sends only the DEMO_KEY query — no account, no user data; granted at selection time, released when you switch away); the Permissions per-origin bullet's trigger list gains the Background source picker; sun/moon get one sentence in the local-widgets story (pure math, no network). Store listing: STAGED v1.13.0 addendum (two local widgets + opt-in NASA background, user-granted origins, no install-time changes).
- [ ] **Step 2: v1.2.1 repo-evidence check (STOP if landed) → bump 1.13.0 (package.json + src/manifest.ts together — the package guard checks the pair) → `npm run package` → aurora-1.13.0.zip guards green.**
- [ ] **Step 3: Full verify (all gates, exact counts). Commit + push** — `feat: v1.13.0 — delights from the sky`.

## After Task 98

Whole-SP review (sonnet; escalate on structural doubt): charges — ephemeris fixtures traceable to recorded sources and tolerances honest; the schema law obeyed in one bump with the generic step; the location gate identical across both widgets and the hint truthful; gesture integrity of the select-onChange grant (zero awaits ahead) and the deny-revert; release-on-switch-away share-aware BOTH ways it claims (heldOrigins subtraction tested); one-fetch-per-day literal (failure days don't retry); apodCache export-excluded and import-reset; the credit caption exact and the refresh button never co-rendering with it; col2 floors re-derived honestly. ONE fix wave + ONE scoped re-review. Report to Jon with `sky-strips.png` + `apod-background.png`. Atlassian + memory + delete workspace.

## Out of scope

Golden-hour morning twin; civil/nautical/astronomical twilight lines; moon rise/set times or illumination percent; APOD history browsing, HD toggle, or user API keys; hemisphere-aware GLYPH art beyond mirroring; connector-side awareness of APOD-held origins on connector removal (over-revoke is the privacy-safe direction; APOD's mandated fallback + re-select recovers — documented in code); SP5.
