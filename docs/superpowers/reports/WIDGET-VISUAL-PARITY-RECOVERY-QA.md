# Widget Visual Parity Recovery QA

**Date:** 2026-08-24

**Source commit:** `a64f916648c03b44c736302dd1d401faed3d07bb`, recorded in `docs/superpowers/qa/ui-recovery/github-tiers/evidence.json`

**Build provenance:** `npm run build:preview` passed and `dist/build-provenance.json` exactly matched source commit `a64f916648c03b44c736302dd1d401faed3d07bb`

**Store state:** Untouched

This is exact preview evidence. The production catalog records `preview evidence; production adapters remain compiled out`. It verifies the reviewed presentation code, fixtures, interactions, geometry, screenshots, and harness behavior without claiming live private-connector behavior. This report commit changes HEAD after the evidence run, so the final production rebuild will follow this documentation commit.

## Focused packets

- Intrinsic Focus and Service Status
- GitHub and GitLab graph centering and scale
- Calendar vertical balance
- Exact-browser acceptance strengthening

## Automated evidence

- Full Vitest gate: 204 files, 3,307 tests passed, 0 failures.
- TypeScript: `npx tsc --noEmit` passed.
- Node catalog and provenance contracts: 35/35 passed, 0 skipped.
- Exact preview build: `npm run build:preview` passed; dist provenance exactly matched `a64f916648c03b44c736302dd1d401faed3d07bb`.
- Production catalog: 31 captures passed with all 34 approved targets covered. Two approved requests were observed, with 0 runtime errors, 0 failed requests, and 0 unexpected requests.
- GitHub and GitLab contribution tiers: 6/6 close card captures passed. Both connectors produced the same exact tier measurements:

| Tier | Frame | Graph | Width coverage | Area coverage | Center delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| Compact | 216x132 | 186x55 | 0.861111 | 0.358796 | 0 |
| Standard | 320x200 | 288x76 | 0.9 | 0.342 | 0 |
| Full | 460x284 | 423x131 | 0.919565 | 0.424166 | 0 |

  Every contribution capture had 0 internal scroll owners and no unexplained text clips. Graph width and height increased Compact to Standard to Full; Full added month context and parallel row families.
- UI recovery: modal removal, intrinsic typography, Calendar Settings, the atomic save, 1600x900, and 1408x445 passed. The Calendar transaction changed exactly `calendarPreferences` and `layouts`; the saved preference was Month with Public Holidays enabled.
- Canvas containment: document width was exactly 1600 at 1600x900 and exactly 1408 at 1408x445. Both witnesses had 0 collisions and 0 internal frame scroll owners.
- Owner-visible canvas: Bookmarks remained the existing 282.328125x30 bar. Clock, Greeting, Quote, Focus, and Service Status each had 0 tier frames. Six Standard panels measured exactly 320x200 and four Compact panels measured exactly 216x132; all ten had 0 internal scroll owners.

## Original-resolution inspection

All 11 minimum images were opened at original resolution: the six GitHub and GitLab tier cards, both UI recovery canvases, the owner-visible production canvas, and the dark GitHub and Calendar close captures.

- Free text surfaces: Clock, Greeting, Quote, Focus, and Service Status remained intrinsic, with no painted tier card.
- Bookmark bar preservation: the existing readable single-line bar remained visible and content-tight.
- Contribution graph hierarchy: GitHub and GitLab graphs were centered and dominant at every tier, with visibly richer Full compositions.
- Calendar balance: the Full Month and Agenda composition was vertically balanced, and the complete month remained readable.
- Whole-canvas collisions and control coverage: no visible clipping, collision, or scrollbar was found in the 1600x900 or 1408x445 witnesses.
- Dark, light, and saturated themes: inspected captures retained readable hierarchy and bounded content.

These observations establish readiness for owner review of the actual captures. They do not establish owner visual acceptance.

## Manual ceilings

- Native Chrome permission prompts
- Live private connectors
- Real screen-reader speech
- Physical touch
- OS timezone transitions
- Chrome Web Store state

No Chrome Web Store upload, edit, save, submission, publication, distribution, or rollout occurred.

## Result

`READY FOR OWNER VISUAL REVIEW`
