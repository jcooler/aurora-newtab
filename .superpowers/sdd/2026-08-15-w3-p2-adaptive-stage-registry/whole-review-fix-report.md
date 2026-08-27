# W3-P2 whole-review fix report

Date: 2026-08-16
Baseline: `b29ec6ce64163f12ad5441f4b7f1c449f198ea11`

## Disposition

All confirmed whole-packet findings are addressed in one bounded correction
wave: Critical C1; Important I1, I2, and I3; Minor M1 and M2; and the C2/C3
Task 4 finding-2 extensions. The frozen widget registry remains byte-identical.

### Root diagnostics (C1)

The real `createRoot` RED captured React 19's default raw caught-error console
arguments, including a unique fake token and capability URL, before the safe
WidgetBoundary diagnostic. Root options now define all three React reporters:
caught errors are suppressed at the root because the boundary owns the single
fixed diagnostic; uncaught and recoverable errors emit fixed constant
diagnostics without forwarding `error` or `errorInfo`. Tests prove raw Error,
message, URL, payload, stack, and component data are absent, the boundary's
safe label occurs exactly once, siblings survive caught failures, and uncaught
failures are still surfaced by a safe root diagnostic.

### Dock content, geometry, and Auto Fit (C2/C3/I2)

Dock Crypto selector RED showed cells 2-5 hidden in compact and cells 3-5
hidden in standard. Both condensation selectors are now Board-only. Source-
measured inline floors contain complete populated ICS, GitHub, GitLab, Jira,
Home Assistant, and all five Crypto cells without wrapper or paint collision.

Auto Fit no longer treats every Dock renderer as a one-track row. A separate
typed compatibility contract feeds both resolver calls and the rendered Dock
CSS custom property. The isolated max-content calibrator measured all 234
schema-valid combinations: 26 IDs x compact/standard/expanded x
compact/balanced/spacious density. This includes preserved pinned variants
outside registry `allowedVariants`. `src/newtab/dockBlockSizes.test.ts` records
every raw outer height and proves every taller renderer has positive rounded
headroom; unlisted one-line renderers deliberately fall back to the track.

Exceptional raw -> chosen contract groups (px):

- Clock 240->248; Focus 108->112; Search 68->72; Countdown 76->80.
- World Clocks 292->296, 220->224, 148->152, 100->104.
- Links 286.625->288, 183.969->192, 161.313->168, 121.313->128,
  408->416, 268->272; Quote 72->80, 168->176, 120->128.
- RSS 92->96/336->344; GitHub 93->96/411->416; GitLab
  93->96/479.5->488; Jira 303.5->312; Vercel 78->80/216->224.
- Weather 74->80; ICS 96->104 where needed; Habits 116->120,
  140->144, 244->248; Month 87.657->96/247->256; Home Assistant 82->88.

The causal 1200x700 Month-expanded Dock fixture produces three truthful failed
attempts, keeps the expanded 3x1 allocation unchanged, reports compact/no-fit,
and uses a Stage-owned `700/1262` vertical scroll range. Board paint ends above
the Dock; documentElement/body do not become scroll owners; keyboard focus
reveals the offscreen Dock control.

### Legibility and aggregate truth (I1/I3)

Quick Links, Home Assistant action labels, Crypto values, Month label, and
Month days are 14px in compact renderers. Month navigation and compact Habits
controls are at least the resolved 36px target. The aggregate seeds each cited
surface and derives applicability from the expected fixture inventory; it
does not pass missing nodes. Its binding result now includes
`finiteBoardContained`, `noPageHorizontalScroll`, and `noVerticalScroll`, and
the four-test helper suite proves any one false predicate rejects the row.

The compact 1420x550 Clock RED was item 145.328px with scrollHeight149 even
though glyph paint was contained. The local 17vh cap yields a 93.5px font and
145/145 scroll containment, with continuous 549/550/551 results. The compact
960x1010 Month RED was 67.344x141 with scroll 68x151; its under-72px container
query places the two 36px controls in one column and label/Today beside them,
yielding header72 + table34 and scrollHeight141 without clipping or hiding.

### Focus, Tasks, and stale restore completion

Dock focus uses `{ block: 'nearest', inline: 'nearest' }`; visible focus is
stable, offscreen focus is minimally fully revealed, keyboard traversal is
exact-once/none-hidden, and pointer focus does not pan. Tasks consumes the live
Dock top as a lower viewport boundary: a 226px tall-Dock panel retains its
scrolling list and fixed controls above the Dock, while ordinary short-Dock
behavior remains 434px.

The W1-P4 focused release proof held an old RSS request through restore,
observed the restored disabled RSS state, then released (not aborted) the old
response. The queued updater revalidates current enabled/config scope under
the storage lock, so `connectorSnapshots.rss` stays absent while legitimate
restored owners remain free to refresh.

## Final evidence

- Focused source/browser REDs were retained in test names and the focused
  script; final focused browser: exit 0, 234 calibration profiles, acceptance
  PASS.
- Full Vitest: 129 files, 2247 tests, all passed.
- TypeScript plus production and preview builds: exit 0, 186 modules each.
- Photo manifest, script syntax, diff check, frozen-registry diff: exit 0.
- `npm audit` all dependencies and production-only: zero vulnerabilities;
  `nanoid@3.3.18` override resolved.
- Canonical browser: actual Node exit 0, stderr 0 bytes, 459/459 unique result
  lines, 456 PASS / 0 FAIL / 3 SKIP, W3 exactly once, errors and capturedErrors
  empty, cleanup four-for-four true. All 19 sparse rows plus dense, manual, and
  override rows have all three I3 geometry/scroll predicates true.
- Six captures regenerated at 06:54:58-06:55:02 -04:00 and accepted at
  original resolution: compact 800x600, keyboard 320x800, standard 1600x900,
  display 2560x1440, ultrawide 3440x1440, and compact dense Dock 800x600.

## Manual ceilings

Automation does not replace: native Chrome 400% zoom; Windows scaling, mixed
DPI, and OS font rendering; a real screen reader; live Home Assistant
discovery/actions; native Chrome, NASA, and native-host permission prompts; or
unload-time asynchronous persistence.
