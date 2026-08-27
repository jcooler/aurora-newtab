# Aurora Shared Widget Frames and Stack Composition Design

**Status:** Owner approved in visual and sectioned design review on 2026-08-22. Implementation pending.
**Date:** 2026-08-22
**Authority:** Owner review of the live Standard Weather and On This Day stack, followed by visual comparison of exact frames, content composition, and laptop-scale tier geometry.
**Extends:** `2026-08-17-aurora-named-layouts-live-canvas-design.md`, `2026-08-19-aurora-widget-stacks-design.md`, and the developer-facing Expansion Platform.

## 1. Purpose

Aurora has one stable user-authored layout system but does not yet have one stable widget geometry system. A Standard Weather face and a Standard On This Day face can occupy visibly different cards inside the same stack. The stack reserves an invisible tallest footprint, but the painted faces remain unrelated sizes. That is not the Apple-style stack the owner intended.

This design makes each display tier a real shared frame and makes every widget compose its information deliberately inside that frame.

The governing law remains:

> The user owns placement; the system owns safety. Nothing auto-swaps, derives, guesses, or re-flows.

The frame system never chooses a tier, changes a layout, rotates a stack, or moves another object. It standardizes the visible geometry of the tier the user selected.

## 2. Supersession and preserved boundaries

This design supersedes only the following presentation rules where they conflict:

- Named-layout spec section 2.2's content-tight geometry and section 2.3's "shrink to what it has" rule for **framed Compact, Standard, and Full presentations**. Intrinsic free forms, bars, Docked presentations, and real-content editing outlines remain content-tight.
- Widget-stack spec section 3's reserve-the-tallest intrinsic sizing. A stack now receives its footprint from the selected shared tier frame.
- Widget-stack spec section 5's nearest-supported fallback. A stack exposes only tiers supported by every member's stack presentation contract and never silently substitutes another tier.
- Existing Full-card local scrolling where it conflicts with the no-internal-scroll rule. The underlying data limits, privacy boundaries, and actions remain unchanged; overflow moves to an explicit details surface or trusted destination.

Everything else remains in force, including:

- one mounted data owner per widget identity;
- manual stack paging only, with no Smart Rotate or smart surfacing;
- exact named-layout Save, Cancel, Undo, backup, and recovery behavior;
- connector identities, request contracts, credentials, permissions, cache ownership, and redaction;
- Notes, Tasks, Timer, Calendar, ICS, Weather, browser-native, and Flow authorities;
- CSP, dependency, privacy, and protected-checkout boundaries;
- the Chrome Web Store W6-P5 approval gate.

No Store action is authorized by this design.

## 3. Exact shared frame catalog

Aurora has three canvas frames:

| Tier | Width | Height | Intended role |
| --- | ---: | ---: | --- |
| Compact | 216 CSS px | 132 CSS px | Identity plus the primary value, action, or signature glance |
| Standard | 320 CSS px | 200 CSS px | Primary value plus useful supporting facts, rows, or visualization |
| Full | 460 CSS px | 284 CSS px | The richest bounded composition the widget can honestly support |

These dimensions are fixed on desktop. Aurora does not enlarge them on wide or high-resolution displays. The user chooses Full when they want a larger object. This preserves the photograph and leaves room for several independently positioned stacks on laptop screens.

At the narrow safety floor, if `viewportWidth - 24px` is less than the selected frame width, the outer frame scales down proportionally to fit that available width. It never scales above `1`. The internal composition responds to the resulting container without changing the stored tier, moving the object, or dropping below the standing 11px text floor. Safety may tighten spacing and reduce supporting rows according to the widget's declared narrow-safety order; it must preserve essential information and the signature visualization whenever physically possible.

Every painted framed surface uses `box-sizing: border-box`. Two widgets at the same tier and viewport must measure to the same outer width and height within 0.5 CSS px.

## 4. Presentation classes

Every widget declares one free-form presentation class:

1. **Framed:** The free Compact, Standard, and Full presentation uses the shared frame directly. Weather, On This Day, GitHub, GitLab, work connectors, browser-native lists, and similar cards belong here.
2. **Intrinsic:** The free presentation follows its content. Clock, Greeting, Quote, Search, and similar photograph-first elements belong here.
3. **Bar:** The free presentation is intentionally linear. Bookmarks is the primary example.

Presentation class does not control Docked rendering. Docked remains an independent dense contract.

Framed widgets use the same authored tier presentation free-floating and in a stack. Intrinsic and bar widgets remain unchanged while free-floating but gain purpose-built framed stack presentations. Aurora never wraps an intrinsic widget in a generic empty panel and calls that a stack face.

## 5. Widget presentation contract

The registry gains an authoritative presentation contract for each widget. The implementation shape may differ in naming, but it must express all of these facts:

- free presentation class;
- free tiers supported;
- stack tiers supported;
- Docked contract, when any;
- the tier's primary purpose;
- essential facts that cannot be removed;
- signature information or visualization;
- ordered supporting facts or rows;
- the narrow-safety reduction order;
- the overflow destination;
- applicable loading, empty, stale, partial, permission, and hard-error states.

This is runtime presentation metadata, not runtime data authority. It cannot fetch, store, configure, or mutate widget data. Existing widget renderers and hooks remain the data owners.

The contract is also an admission gate. A new widget cannot join the production registry with an undeclared tier, a missing state, a placeholder stack face, or a catalog capture that merely proves something painted.

## 6. Content composition law

Shared geometry does not mean generic composition. Every widget owns an authored internal layout.

Content priority is:

1. identity and primary purpose;
2. essential current value or action;
3. signature information or visualization;
4. ordered supporting facts;
5. a meaningful overflow destination.

The following rules are mandatory:

- Resize charts, graph cells, type hierarchy, spacing, and row density before removing useful information.
- Preserve signature information whenever the tier can present it legibly. GitHub and GitLab keep contribution graphs; Weather keeps forecast intelligence; History keeps event years and summaries.
- Do not repeat a label or date to fill space. On This Day renders the title once, the date once beneath it, then the events.
- Avoid cards inside cards unless the inner surface represents a real interactive object. Weather supporting facts use a flat hierarchy rather than a grid of decorative mini-cards.
- A larger frame does not need invented data. It may enlarge a useful graph, visual, typography, or spacing, but vacant filler is still a defect.
- Deliberate rhythm is not whitespace debt. Empty areas must support hierarchy or visualization rather than reveal an unfinished composition.
- A framed canvas or stack face never contains an internal scrollbar.
- If all useful data cannot fit, render the best bounded subset and expose a truthful details action, focused settings destination, or trusted provider link.
- Text truncation must retain an accessible full name and must not make sibling actions indistinguishable.

## 7. Stack behavior

A stack stores one tier exactly as it does today. That tier selects the stack's outer frame.

Every member paints into the same frame. Non-facing members remain mounted once, hidden, and non-interactive, preserving the current warm-face and one-data-owner rules. The fixed frame replaces intrinsic tallest-member measurement; no ResizeObserver or content measurement decides stack size.

The stack's available size controls are the intersection of its members' declared stack tiers. Aurora never resolves a member to a different tier behind the user's back.

- Creating a stack is allowed only when the target's current tier is supported by both source and target stack contracts.
- Adding to an existing stack is allowed only when the incoming member supports the stack's stored tier.
- An incompatible target never arms the 500ms stack gesture and exposes a named reason in edit UI.
- Changing a stack's tier offers only the current member intersection.
- Removing a member may make additional tiers available but never changes the stored tier automatically.

An already-saved stack may predate these contracts and carry a tier outside the new member intersection. Aurora preserves its membership, facing value, tier, and geometry without rewriting storage. It renders the selected exact outer frame with a named compatibility face that identifies the incompatible member and lists the valid common tiers. The inspector offers those valid tiers and member removal; the user chooses the recovery. Aurora does not silently resize the stack, drop the member, or substitute content from another tier.

The current paging contract remains:

- no automatic face changes;
- arrows invisible and non-interactive at rest, visible on hover or keyboard focus;
- dots remain the direct face selector;
- swipe suppresses text selection and never starts from an editable control;
- plain click reaches the widget's own action;
- paging never moves or resizes the stack.

Docked stacks remain out of scope.

## 8. Theming and accessibility

`TierFrame` consumes Aurora's panel, border, ink, muted-ink, accent, radius, and contrast tokens. It does not derive the panel background from the accent or text selection. A user may choose black, white, bright pink, or another valid panel color without receiving a destructive color fill or unreadable text.

Primary and secondary ink retain the approved soft-at-rest and bright-on-hover relationship where the surface is interactive. Meaning is never conveyed by color alone.

Requirements:

- routine text stays at or above 14px when the frame can support it;
- metadata stays at or above 11px;
- targets meet the active 36px desktop floor or use a larger shared target;
- focus indicators remain visible against dark, light, and saturated panels;
- loading, empty, stale, permission, and error states retain the same outer frame;
- reduced motion disables nonessential face animation without changing paging;
- screen-reader order follows visible hierarchy, not hidden members.

## 9. Loading, empty, stale, partial, and error states

The frame never collapses while data changes.

- **Loading:** Show a recognizable static header and bounded skeleton matching the final hierarchy.
- **Empty:** Explain the truthful empty condition and offer the relevant setup, refresh, or details action when one exists.
- **Stale:** Keep the saved useful data visible and mark it stale without replacing the whole card with an error.
- **Partial:** Render independently valid sections and name the unavailable section.
- **Permission required:** Name the capability and provide the existing permission path.
- **Hard error:** Name the failed widget, preserve any safe cached facts, and expose a bounded retry.

State copy and actions remain widget-owned. `TierFrame` provides structure and semantics only.

## 10. Migration packets

Implementation is divided so visual judgment is made before the whole catalog changes:

1. **SF-P1 Frame foundation and reference pair:** presentation contract, shared frame, and Weather plus On This Day at all applicable tiers and states. The owner sees this in the real extension before migration continues.
2. **SF-P2 Framed catalog migration:** information, connector, work/developer, browser-native, and local-productivity card families in bounded sub-batches.
3. **SF-P3 Intrinsic and bar stack faces:** Clock, Greeting, Quote, Search, Bookmarks, and every other eligible non-card free form.
4. **SF-P4 Stabilized catalog and product gate:** complete catalog, short-height and narrow safety, stack interactions, themed surfaces, and exact reviewed build provenance.

Existing stored tiers, anchors, offsets, layers, dock placements, stack membership, and facing values do not change. A new frame may reveal an overlap in an existing user-authored layout. Aurora warns and leaves it for the user; it never repositions or rewrites the layout.

## 11. Catalog and automated acceptance

The current catalog contains 30 widget contracts and is expected to grow to dozens more. The evidence system must scale from registry data rather than a manually mirrored list.

For every declared free tier:

- render a content-rich ready fixture;
- measure the exact frame;
- assert no horizontal or vertical content escape;
- assert no internal scrollbar;
- assert the tier's essential and signature content;
- capture the original-resolution presentation.

For every declared stack tier:

- pair the widget with another member at the same tier;
- page both directions and through a dot;
- assert identical frame geometry before and after every face change;
- assert no selected text after swipe;
- assert plain-click parity and editable-control exclusions.

State coverage includes every applicable ready, loading, empty, stale, partial, permission, and hard-error contract. Theme coverage measures dark, light, and strongly saturated panels. Viewport coverage includes 1366x768, exact 1408x445, 1600x900, and the 599px narrow-floor boundary, plus one real non-emulated Chrome window witness.

Every run fails on:

- missing catalog declarations or captures;
- wrong frame dimensions;
- clipping, overflow, internal scrolling, duplicate accessible names, or illegible text;
- missing essential or signature content;
- unexpected storage writes, runtime exceptions, failed requests, or unapproved external requests;
- a capture left without a per-image usefulness verdict.

Before any owner-facing review, `dist` is rebuilt from the exact reviewed commit and build provenance is verified.

## 12. Acceptance criteria

1. Every framed widget at a given tier has the same measured outer bounds.
2. A stack never moves or changes dimensions when its face changes.
3. Weather and On This Day use the approved flat, non-repetitive Standard compositions.
4. Signature data survives whenever the selected tier can present it legibly.
5. Intrinsic and bar widgets keep their approved free forms and gain authored stack faces.
6. No framed canvas or stack presentation contains an internal scrollbar.
7. Existing layouts preserve all stored geometry and membership without automatic correction.
8. New widgets fail the admission gate when any supported tier, state, or evidence row is missing.
9. Frozen storage, connector, permission, privacy, CSP, dependency, protected-checkout, and Store boundaries remain unchanged.

## 13. Deferred

- Smart Rotate, recommendations, and automatic face surfacing remain deferred.
- Docked stacks remain deferred.
- A user-created arbitrary frame-size editor is not part of this system.
- New stocks work remains under its separate provider and key-model decision.
