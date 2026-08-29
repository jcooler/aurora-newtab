# Tab Two V2 Connector Experience QA

**Date:** 2026-08-29<br>
**Branch:** `feat/aurora-2-observatory`<br>
**Exact QA commit:** `2d74afd3898f59c5a2057937016af91f8088369b`<br>
**Result:** PASS

## Accepted scope

This is the first bounded production packet from the owner-approved Tab Two V2 visual direction. It changes connector discovery and setup presentation only.

- A 60rem roomy Settings workspace with an 11rem navigation rail.
- A full-width connector discovery column while ordinary Settings tabs retain a 38rem reading measure.
- Outcome-led connector cards with compact identity marks, category, truthful connection state, Canvas visibility, and setup or edit action.
- Category filters, full-catalog search, connected count, and responsive two-column or one-column galleries.
- A shared connector detail dialog with benefits, privacy context, existing connector controls, Escape, focus trapping, and exact focus return.
- No connector schema, registry, storage, credential, permission, backup, provider, or Canvas ownership change.
- Every existing connector remains included. No freemium entitlement or payment behavior was introduced.

## Automated verification

- `npm test`: PASS, 214 files and 3,424 tests.
- `npx tsc --noEmit`: PASS.
- `node --test scripts/qa-tab-two-v2-connectors.test.mjs`: PASS, 5 contracts.
- `npm run build`: PASS, 265 transformed modules with exact provenance.
- `npm run qa:tab-two-v2-connectors`: PASS against exact commit `2d74afd`.
- `git diff --check`: PASS.

The dedicated browser gate proved:

- Settings measured exactly 960px wide at both 1600x900 and 1408x600.
- Settings measured exactly 375px wide at 375x812.
- The closed 960px Settings surface was prepainted exactly outside the 1600px viewport while remaining inert, aria-hidden, and pointer-inactive. Opening movement began in 14.6ms and the slowest sampled frame was 16.8ms.
- Desktop and short-height galleries rendered two columns; narrow rendered one column.
- Every viewport had one Settings vertical scroll owner and no page or Settings horizontal overflow.
- Category filtering returned Calendar and Todoist; search still found GitHub across the full catalog.
- The sticky connector header remained fully transparent with a 40px backdrop blur, eliminating the opaque black slab without losing scroll separation.
- Calendar details stayed inside the viewport and Escape restored focus to the exact Edit Calendar action.
- RSS headline count persisted as 7 without changing its two configured feeds.
- RSS visibility persisted false, then true, without changing its feeds or count.
- No fixture credential value appeared in rendered text.
- The active background loaded the real 2560x1600 AVIF, not a preview or placeholder.
- Console errors and page errors were empty.
- The only external attempts were the deterministic blocked Weather alert and RSS fixture refreshes recorded in evidence.

## Original-resolution visual inspection

All final captures were inspected at original resolution after the selected-filter contrast correction.

- [`connectors-1600x900.png`](../qa/tab-two-v2-connectors/acceptance/connectors-1600x900.png)
- [`calendar-detail-1600x900.png`](../qa/tab-two-v2-connectors/acceptance/calendar-detail-1600x900.png)
- [`connectors-1408x600.png`](../qa/tab-two-v2-connectors/acceptance/connectors-1408x600.png)
- [`connectors-375x812.png`](../qa/tab-two-v2-connectors/acceptance/connectors-375x812.png)
- [`evidence.json`](../qa/tab-two-v2-connectors/acceptance/evidence.json)

The final views show a clear hierarchy, readable selected filter, balanced desktop cards, a contained two-column Calendar dialog, and a clean mobile reflow with the full filter set and card actions visible. No clipping, nested scrollbar, dead control, or photo degradation was accepted.

## Boundaries

- Account sync, payments, premium entitlements, new providers, Store naming, and Chrome Web Store changes are not part of this packet.
- Native permission prompts and real third-party accounts remain separate live-service gates.
- The product is still on the existing feature branch. No merge or Store action is implied.
