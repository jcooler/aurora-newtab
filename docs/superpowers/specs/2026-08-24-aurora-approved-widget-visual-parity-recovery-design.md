# Aurora Approved Widget Visual Parity Recovery Design

**Date:** 2026-08-24

**Status:** Owner approved in chat on 2026-08-24. Production implementation remains blocked pending review of this written specification and a just-in-time implementation plan.

**Authority:** The owner-provided canvas screenshot, the rendered gallery at `mockups/widget-redesign/index.html?view=gallery`, and the owner's written exceptions in this document.

## 1. Context

The production widget system is functionally complete, but the latest owner review rejected its visual result. Several production faces retained the correct data and frame geometry while losing the composition, density, hierarchy, or intrinsic presentation shown by the approved gallery. The clearest failures are the small upper-left GitHub contribution graph inside a mostly empty card, the equivalent risk in GitLab, and a Full Calendar composition that sits too high and leaves unused space below.

This owner rejection supersedes the visual-acceptance conclusion in A2-D081. It does not discard the verified storage, connector, permission, data ownership, Calendar consolidation, named-layout, stack, dock, or recovery work. The recovery changes presentation where production diverges from the approved reference and preserves correct underlying behavior.

## 2. Governing visual authority

The rendered gallery is the production composition authority for widget hierarchy, density, signature scale, spacing rhythm, tier differentiation, and framed versus intrinsic treatment. It is a design reference, not proof that production matches it. Final acceptance comes only from the actual built extension in real Chromium.

The owner-provided screenshot is a whole-canvas reference for the intended relationship between quiet intrinsic text and dense framed instruments. It does not authorize Aurora to overwrite a named layout, copy screenshot coordinates, move widgets automatically, or change the user's selected tiers.

When the gallery, older specifications, or current production conflict with the written rules below, these rules win.

## 3. Goals

- Make production widgets look like their approved gallery compositions rather than generic content placed inside shared cards.
- Restore a quiet canvas hierarchy where text-only rituals sit directly on the photograph and framed instruments use their space deliberately.
- Make every signature visualization dominant enough to identify its widget at a glance.
- Preserve exact shared frame dimensions and all existing user-owned placement.
- Ensure real production data fits without clipping, internal scrolling, overlapping controls, or large unfinished areas.
- Retain existing data, interaction, connector, persistence, privacy, and recovery authorities.
- Produce close owner-reviewable browser evidence for each corrected widget and tier.

## 4. Non-goals

- No automatic layout movement, collision repair, tier selection, stack reordering, dock movement, or screenshot-coordinate migration.
- No connector, provider, permission, credential, cache, backup, schema, or request-contract redesign.
- No invented data, decorative filler, or nested mini-cards used to occupy space.
- No generic widget template that erases each widget's identity.
- No internal framed-widget scrollbar.
- No reopening already-correct behavior solely to create code churn.
- No Chrome Web Store upload, submission, publication, rollout, or listing change.

## 5. Presentation classes and explicit owner exceptions

### 5.1 Text-only free presentations

The following free-floating Canvas widgets are intrinsic text, not cards:

- Clock
- Greeting
- Quote
- Focus
- Service Status

Their visible bounds follow their real content. They have no opaque panel, decorative wash, card header, or oversized invisible selection footprint. Edit outlines hug the visible content. Ordinary clicks never paint edit chrome.

Clock remains dominated by the time. Greeting remains the original `Good morning`, `Good afternoon`, or `Good evening` sentence. Quote remains an editorial line with attribution. Focus remains a concise question or current-focus line with its real completion action. Service Status becomes a compact text composition with named services and readable state, including incident context only when useful.

When one of these identities is placed in a stack, the stack keeps its exact selected frame. The member receives an authored bounded composition without adding a decorative card inside the stack frame or creating a second data owner.

### 5.2 Bookmarks

Bookmarks remains the existing readable single-line folder and bookmark bar. Its current folder behavior, names, Chrome ownership, actions, and free-canvas geometry remain unchanged. It must not become a spacious card or a grid of generic chips.

### 5.3 Framed instruments

Every other widget uses the approved gallery composition appropriate to its identity and selected tier. Search, Countdown, Quick Links, World Clocks, Tasks, Notes, Timer, Habits, Calendar, Weather, work connectors, browser-native resources, and other framed instruments retain deliberate panel compositions where shown by the approved reference.

Already-matching framed widgets are verified and left alone. A family is changed only when a focused comparison demonstrates production drift in hierarchy, density, signature scale, spacing, state treatment, or tier differentiation.

## 6. Shared frame and content-fit law

External framed geometry remains exact:

| Tier | Width | Height |
| --- | ---: | ---: |
| Compact | 216 CSS px | 132 CSS px |
| Standard | 320 CSS px | 200 CSS px |
| Full | 460 CSS px | 284 CSS px |

Each framed interior follows this order:

1. identity and essential current state;
2. the widget's signature value or visualization;
3. useful supporting facts or actions;
4. a truthful details destination when the complete data set cannot fit.

Text, row counts, graph geometry, and spacing adapt within the selected tier. The implementation may clamp supporting rows or safely truncate long text with an accessible full value. It may not shrink the signature into a corner, hide essential content behind hover, introduce an internal scrollport, or leave a large empty region that makes the composition look unfinished.

Compact, Standard, and Full must be visibly distinct. Larger tiers either show materially richer information or give the signature visualization materially more useful scale. They do not merely enlarge the outer card.

## 7. GitHub and GitLab

GitHub and GitLab are evaluated independently, even when they share a contribution-grid primitive.

### Compact

- Show a coherent contribution graph, contribution count, and streak.
- Center the graph composition within the available body.
- Keep cells large enough to read as a contribution pattern rather than unexplained dots.
- Omit lower-priority rows before compressing the signature beyond usefulness.

### Standard

- The graph is the dominant signature visual and uses most of the available card width.
- The complete count and streak remain legible without forcing the graph into the upper-left corner.
- Review and pull-request or merge-request context is subordinate and bounded.
- There is no large unused right or lower region.

### Full

- The graph is materially larger or richer than Standard and remains centered.
- Supporting review, pull-request or merge-request, issue, and notification context uses the remaining budget without nested cards.
- Long repository or task text truncates truthfully and retains an accessible full value.
- Full is visibly richer than Standard at a glance.

Dark, light, bright, and saturated panels retain legible cells, labels, focus states, and state messaging.

## 8. Calendar

Calendar remains one combined widget backed by the existing Calendar, Month, and optional Public Holidays authorities.

- Opening a new tab never shows a Calendar consolidation modal and never makes the Canvas inert for consolidation.
- Consolidation remains an explicit Settings action for qualifying layouts.
- Standard keeps the user-controlled Agenda or Month view.
- Full keeps Month and Agenda together.
- The complete month grid remains readable and unclipped.
- Public Holidays stays optional and provider implementation names stay out of primary UI.
- The Full two-region composition is vertically balanced inside 460x284 instead of being compressed against the top edge.
- Sparse data enlarges or balances the useful regions without inventing filler.
- Calendar view changes remain presentation preferences and do not write the layout document.

The existing atomic consolidation, revision protection, selected-placement preservation, preference preservation, stale-write rejection, and source-data preservation remain unchanged.

## 9. Data and interaction boundaries

This is a render and styling recovery. Existing widget hooks, reducers, services, timers, connectors, caches, panels, permissions, and storage keys remain the only data owners.

The renderer continues to receive explicit `free`, `stack`, or `docked` presentation context. A presentation may change structure and visual hierarchy, but it may not mount another data owner, start another request, persist visual measurements, or infer stack state from the DOM.

The following remain unchanged:

- named-layout Save, Cancel, Undo, backup, restore, and revision authority;
- user-authored anchors, offsets, layers, tiers, docks, stacks, and stack-facing values;
- Flow mode and ordinary Canvas interactions;
- connector authentication, permission, request, cache, stale-data, and redaction contracts;
- details panels and trusted external destinations;
- Calendar Settings consolidation and preference ownership;
- Chrome Web Store W6-P5 approval boundary.

## 10. State, accessibility, and theme behavior

Ready, loading, empty, setup, permission, stale, partial, retained-error, and hard-error states preserve the selected outer geometry and the widget's recognizable identity.

- Useful retained data remains visible when truthful.
- State copy is concise and names the affected source or action.
- Retry and details controls remain keyboard operable and do not cover content.
- Routine text, metadata, and graph cells remain readable at the exact tier geometry.
- Color is never the only service, contribution, incident, or completion signal.
- Focus indicators remain visible on dark, light, bright, and saturated surfaces.
- Hidden stack members remain non-interactive and do not create duplicate accessible content.
- Reduced motion preserves every state and action.

## 11. Implementation strategy

The implementation proceeds as a visual-parity audit followed by focused correction packets:

1. Build a production-to-gallery comparison matrix for all target identities and every supported tier.
2. Mark each presentation as matching or divergent using original-resolution evidence.
3. Lock focused failing contracts for each confirmed divergence before production edits.
4. Correct intrinsic presentation boundaries first because they define whole-canvas hierarchy.
5. Correct GitHub, GitLab, and Calendar signature geometry next.
6. Correct any additional confirmed framed-widget divergences by family while preserving existing owners.
7. Rebuild the exact reviewed commit and run the complete production catalog and whole-canvas gates once after focused packets are green.

This sequence audits the full catalog but avoids restyling widgets that already match the approved reference.

## 12. Verification

### 12.1 Focused automated checks

- Free Clock, Greeting, Quote, Focus, and Service Status have no painted card surface or generic header.
- Their edit outlines follow visible content rather than a shared-frame rectangle.
- Bookmarks retains its existing free bar and folder behavior.
- Every framed tier keeps exact external geometry.
- GitHub and GitLab graph containers are centered and meet tier-specific dominance and differentiation contracts.
- Calendar Full uses a vertically balanced two-region composition while Standard preserves its explicit single view.
- All affected ready and non-ready states preserve essential content, safe truncation, and actions.
- No implementation changes storage, request, connector, permission, cache, or data-owner counts.

### 12.2 Real Chromium checks

- Capture close card-level screenshots for GitHub and GitLab at Compact, Standard, and Full.
- Capture Calendar Standard Agenda, Standard Month, and Full at card-level scale.
- Capture free Clock, Greeting, Quote, Focus, Service Status, and Bookmarks in the real Canvas.
- Capture the complete owner-visible 1600x900 canvas with existing-layout-shaped storage.
- Capture the exact 1408x445 existing-layout witness.
- Exercise edit outlines, hover controls, keyboard focus, stack paging, Calendar Settings, and ordinary clicks.
- Check clipping, internal scroll ownership, pairwise widget collisions, hit targets, console errors, page errors, failed requests, unexpected requests, and storage writes.
- Require exact build provenance for every acceptance script.
- Inspect every final screenshot at original resolution. Aggregate PASS counts do not establish visual acceptance.

### 12.3 Owner visual gate

The implementation is not visually accepted until the owner receives close production screenshots that allow direct comparison with the approved gallery and confirms the result. Mockup captures alone cannot close the gate.

## 13. Delivery and review discipline

- Work only in `D:\DEV\Chrome plugin-aurora-2`.
- Keep the protected original checkout untouched.
- Preserve unrelated user files and changes.
- Use focused TDD for every production correction.
- Use one bounded implementation review and at most one fix and rereview cycle.
- Do not repeatedly rerun already-green broad suites during packets.
- Run one stabilized full gate after the focused work and review cycle are complete.
- Do not push, merge, or perform any Store action without explicit owner authority.

## 14. Acceptance criteria

This design is satisfied only when:

1. Production visibly follows the approved image and gallery compositions.
2. Clock, Greeting, Quote, Focus, and Service Status are text-only on the free Canvas.
3. Bookmarks remains the existing readable folder and bookmark bar.
4. GitHub and GitLab graphs are centered, dominant, legible, and materially differentiated across tiers.
5. Calendar is vertically balanced, readable, unified, Settings-controlled, and modal-free.
6. Every framed widget uses its area deliberately without filler, clipping, internal scrolling, or large unfinished regions.
7. Existing production data and actions fit safely inside the selected tier.
8. Named layouts and all data, connector, storage, permission, privacy, recovery, and Store boundaries remain unchanged.
9. Exact-build real Chromium evidence passes and is inspected at original resolution.
10. The owner approves the final production screenshots.
