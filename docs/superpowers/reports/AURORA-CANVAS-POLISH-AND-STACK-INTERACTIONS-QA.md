# Aurora Canvas Polish & Stack Interactions QA

**Date:** 2026-08-26  
**Branch:** `feat/aurora-2-observatory`  
**Verdict:** Verified  
**Store state:** Untouched

## Outcome

The approved canvas polish is implemented without changing layout, connector, credential, permission, or cache authority. Free Search and Quick Links are intrinsic photo-first controls rather than cards. Weather stores and displays a city plus region label such as `Dallas, GA`, with a separate Clear action. Focus keeps its prompt above the saved item and uses a short reduced-motion-safe celebration instead of the old completion message. Compact Status shows only service names and dots, with service-specific hover and keyboard context.

Stack grip movement now reorders members in place and cannot eject a member onto the canvas. Arrow ordering and explicit removal remain available. Stack paging controls overlay the fixed member footprint, so stacks and ordinary widgets share the same 8px edge reach. Top and bottom dock bands use `clamp(60px, 10vh, 78px)`.

The previously reported attention-signal blockers are closed. Calendar attention is permission-current, the attention ledger resets when a source is disabled or its identity changes, and the context panel avoids visible canvas and fixed-control owners.

## Automated evidence

- Full Vitest gate at product commit `c815108b89cd82d3f639d3577b7e73ceaad3d455`: 212 files and 3,396 tests passed.
- Focused review-fix gate: 7 files and 381 tests passed, covering Settings, Focus, Status, stack inspector, canvas geometry, and renderer ownership.
- Production build: 263 modules transformed successfully with exact tracked provenance.
- Exact preview build: 263 modules transformed successfully with browser permissions enabled only for disposable evidence.
- Production widget catalog at `d6643429674f9962349059f3b404771b948dcac9`: 31 captures passed and all 34 approved targets remained pinned. The owner-visible canvas now asserts intrinsic free Search and Quick Links while retaining their authored stack faces.
- Canvas polish Chromium witness at `098dde3a86f20641bcd665c91de446793ff066fa`: frameless utilities, `Dallas, GA`, persistent Focus prompt, completion celebration, compact Status context, grip reorder, arrow reorder, and 8px stack edge reach passed with zero console or page errors.
- Attention Chromium witness at `d6643429674f9962349059f3b404771b948dcac9`: hover, keyboard, touch, Settings, multi-tab, desktop, compact, collision, and permission behavior passed.
- Dock Chromium witness at `098dde3a86f20641bcd665c91de446793ff066fa`: 2 captures, 0 writes, 0 runtime errors, 0 failed requests, and 0 failures.
- UI recovery Chromium witness at `098dde3a86f20641bcd665c91de446793ff066fa`: modal removal, intrinsic typography, Calendar Settings consolidation, one atomic save, 1600x900, and 1408x445 passed.

Accepted canvas polish evidence is in [`canvas-polish/acceptance`](../qa/canvas-polish/acceptance). The refreshed owner-visible production image is [`owner-visible-canvas.png`](../catalog/widget-redesign/production/owner-visible-canvas.png).

## Bounded review

The one bounded Critical and Important review found one interaction regression in the new stack row CSS: pointer input on the arrow and Remove controls was disabled while making rows valid grip targets. The fix restored those controls and added a real Chromium arrow-order assertion. The same fix made compact Status tooltips choose an above-trigger position when the below-trigger position would cross the viewport edge. Rereview found no remaining Critical or Important issue in this packet.

The production catalog initially failed because its previous owner-visible contract still required free Search and Quick Links to be tier cards. The harness was corrected to assert the approved intrinsic presentations, including Search's accessible label and repeated Quick Link marks. This was an evidence-authority correction, not a product rollback.

## Manual ceilings

Automation does not claim native Chrome optional-permission prompt interaction, live private connector data, real screen-reader speech, physical touch behavior, operating-system timezone changes, or genuine sleep and wake transitions. MacBook testing remains the next owner-visible environment check after the feature branch is fetched. No merge, Chrome Web Store upload, edit, save, submission, publication, distribution, or rollout occurred.
