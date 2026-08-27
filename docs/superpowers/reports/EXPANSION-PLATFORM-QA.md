# Aurora Expansion Platform QA

Date: 2026-08-22

## Scope

This report records the Program E scratch-catalog proof for the developer-facing
Expansion Platform. It does not approve a Chrome Web Store action, alter runtime
storage authority, or make the catalog a runtime source of truth.

The initial proof used the Task 6 working tree based on pushed checkpoint
`4a9f787`. The bounded review then required one fix cycle, including a stronger
painted-content check. Both batches were rebuilt and rerun after those fixes.
The final reviewed range is recorded in the Aurora ledgers.

## Guarded output proof

The catalog accepts an explicit `.qa-expansion-platform-*` direct child of the
active repository. Before any directory is created it rejects the active root,
the protected checkout, production directories, traversal, the wrong scratch
family, non-empty roots, files, symlinks, junctions, and planned-child
collisions. Scratch PNGs, Markdown, evidence JSON, preview build, and Playwright
profile all remain below the accepted root. Canonical catalog evidence is not
read, removed, or rewritten in this mode.

The focused safety contract passed 11 tests across the catalog and shared output
guards. `node --check scripts/catalog-nl-p5.mjs` and `git diff --check` were
clean.

## Chromium proof

The exact working source was first built with `npm run build:preview`:

- TypeScript passed.
- Vite preview build passed with 218 transformed modules.
- Batch 1 produced 26 declared tier captures.
- Batch 2 produced 50 declared tier captures.
- All 76 captures had nondegenerate geometry and useful content: visible text,
  a semantic image, or an enabled interactive control.
- Both batches reported zero assertion failures, runtime errors, failed
  requests, and unexpected external requests.

The successful post-review scratch roots were
`.qa-expansion-platform-review-fix-batch-1` and
`.qa-expansion-platform-review-fix-batch-2`. Earlier suffixed batch-2 roots
record the expected isolation failure and its pre-review correction; they are
not the final evidence source.

The harness allowed only the exact Dallas forecast and environmental request
identities and fulfilled both locally. No live Open-Meteo response was needed.
An initial batch-2 run correctly failed when the shared connector fixture
briefly exposed a different Weather identity. The fixture was corrected to
install the complete forecast and environment cache atomically; the final run
then passed without broadening the allowlist.

The final batch-2 fixture uses 17 complete contribution weeks. This exercises
the designed width of both Standard and Full graphs rather than introducing
artificial whitespace with the former five-column fixture.

## Representative original-resolution judgments

| Capture | Geometry | Judgment |
| --- | ---: | --- |
| `weather-full.png` | 281 x 204 | Useful current conditions, alert, measurements, and hourly row fill a content-tight card. Text and icon hierarchy remain legible. |
| `bookmarks-standard.png` | 241 x 30 | The full readable News, Docs, and Music bar is present with no forced one-letter reduction. Bounds follow the three controls. |
| `notes-compact.png` | 64 x 38 | A single clear Notes launcher fills the promised compact composition without padding masquerading as content. |
| `github-full.png` | 400 x 428 | The 17-week graph uses the wider tier, with unread state, totals, streak, and work items occupying the remaining vertical area. |
| `status-docked.png` | 48 x 26 | Two status indicators form a clean one-line dock readout; the enabled detail interaction supplies context without inflating the strip. |
| `monthCal-standard.png` | 200 x 247 | One complete readable month fills the only supported Month tier. The removed Compact and Docked tiers do not reappear. |

All six captures have content-tight bounds, readable foreground contrast, no
visible scrollbar, and no whitespace-only tier. The Docked Status capture stays
within one-line strip geometry.

## Manual ceilings

Automation does not replace:

- a real screen reader pass for dynamic widget and dock announcements;
- live credential and provider combinations for every connector;
- native Chrome permission prompts and account-specific bookmark trees;
- provider outages, rate limits, and long-duration cache expiry behavior;
- owner judgment of future candidate widgets before they enter a delivery
  packet.

Chrome Web Store upload, listing edits, saves, submission, publication,
distribution, and rollout remain blocked until the owner gives a new,
action-specific W6-P5 approval.
