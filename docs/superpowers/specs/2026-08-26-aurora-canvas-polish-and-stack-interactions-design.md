# Aurora Canvas Polish & Stack Interactions Design

**Date:** 2026-08-26

**Status:** Owner approved on 2026-08-26

**Scope:** Restore photo-first Search and Quick Links, improve Weather and Focus copy, make compact Status explainable, correct stack controls and edge geometry, reduce dock depth, and close two Important attention-signal review findings

## 1. Context

Several recent presentation changes made intrinsic Canvas content read like generic cards and exposed control geometry as layout whitespace. Search and Quick Links need to return to lightweight photo-first treatments. Focus must keep its prompt visible after a value is saved. Compact Service Status needs to remain quiet while still explaining every dot. Stack controls need to behave according to their visual language and stop preventing symmetric edge placement.

The current stack inspector grip is labelled and implemented as a drag-out control even though its six-dot appearance conventionally means reorder. The transparent 40px side and 36px bottom stack gutters keep paging controls hit-testable, but also enlarge the saved object footprint. Both behaviors conflict with the owner's expectations.

The prior attention-signal bounded review also found two Important correctness gaps: context placement can still overlap Greeting, and cached ICS attention is admitted after host permission is revoked. These must be fixed before the next stabilized gate.

## 2. Approved behavior

### 2.1 Search and Quick Links

- Free Search is a transparent, centered search line with a search icon and a restrained bottom rule.
- Free Search has no filled panel, rounded card, border box, backdrop blur, or drop shadow.
- Free Quick Links render favicon and label directly over the photograph.
- Free Quick Links have no containing card and no individual tile card.
- Add and remove controls remain keyboard reachable and appear without creating a persistent card surface.
- Stack presentations retain their authored shared frame and tier dimensions so paging never resizes the stack.

### 2.2 Weather location

- A selected United States city is stored and displayed as `City, ST`, for example `Dallas, GA`.
- City suggestions use commas rather than em dashes.
- Settings show the location label and a separate `Clear` button. The button's accessible name includes the location.
- New manual selections preserve their region. Existing labels remain valid and are not guessed from coordinates without a provider result.
- No global geocoding request is added merely by opening Settings.

### 2.3 Focus

- `What's your main focus today?` remains visible in empty, editing, committed, and completed states.
- The input or saved focus appears beneath the prompt.
- Completing a focus never renders `Nice.`.
- Completion triggers a contained confetti burst around the focus row for less than one second.
- Confetti is decorative, adds no dependency, does not block input, and is disabled by `prefers-reduced-motion`.
- Assistive technology receives a concise `Focus completed` status.

### 2.4 Compact Service Status

- Compact shows only configured service names and their status dots.
- Compact does not show a `Service status` heading or incident lines.
- Each service exposes an accessible tooltip on hover and keyboard focus.
- Tooltip copy contains the normalized state and provider detail, such as `Vercel: Partial outage. Elevated build latency`.
- Unknown remains distinct from a confirmed outage and reads `Unreachable`.
- Standard and Full retain their useful detail hierarchy, with touched copy using ASCII punctuation.

### 2.5 Stack ordering and controls

- The six-dot grip reorders members within the stack. It never ejects a member onto the Canvas.
- Up and down arrow buttons remain as explicit accessible reorder alternatives.
- Removing a member requires the existing explicit Remove button.
- On-canvas paging arrows and dots overlay the active member inside its exact frame footprint.
- The stack wrapper adds no transparent outer gutters.
- Controls appear on hover or focus, remain keyboard reachable, stop pointer propagation, and do not change the stored placement.
- Stack and normal widgets can therefore reach the same 8px Canvas safety inset.

### 2.6 Dock depth

- Top and bottom dock bands use `clamp(60px, 10vh, 78px)`.
- Painted placement, fallback geometry, snapping, keyboard nudging, and drag drop zones use the same depth contract.
- The existing 5px viewport perimeter remains unchanged.

### 2.7 Attention review closure

- Attention context placement treats Greeting as a collision obstacle at desktop and compact widths.
- Acceptance QA rejects overlap with any visible widget owner, including Greeting.
- ICS attention requires the current connector permission mirror. Revoking host permission removes cached Calendar attention without deleting the snapshot.

## 3. Considered approaches

### 3.1 CSS-only cleanup

This would remove card backgrounds and shrink docks quickly, but it would preserve the misleading stack grip, lost Weather region data, stale Calendar attention, and collision gaps. It is rejected.

### 3.2 Cohesive presentation and interaction correction

This is the selected approach. Visual changes remain presentation-specific, pure formatters preserve location meaning, the stack inspector owns reorder semantics, stack navigation controls overlay the shared frame, and geometry constants stay synchronized between CSS and TypeScript.

### 3.3 Full Canvas interaction redesign

A broader redesign could replace inspectors, stacks, and docks together. It would reopen approved named-layout behavior and create unnecessary migration risk. It is outside this checkpoint.

## 4. Data and compatibility

- No storage schema version change is required.
- `StoredLocation.label` remains the persisted display authority. New selections write the richer formatted label.
- Existing locations, layouts, stack membership, tiers, layers, and dock coordinates remain valid.
- No connector credential, capability URL, snapshot, or permission contract changes.
- No new package dependency or remote service is added.

## 5. Accessibility and motion

- Search, Quick Links, Focus, Status tooltips, stack controls, and Weather Clear remain keyboard reachable with visible focus.
- Status tooltip content is available on hover and focus and is associated with its service row.
- The stack grip supports pointer reorder while arrow buttons provide deterministic keyboard reorder.
- Confetti is `aria-hidden`, pointer transparent, short-lived, and absent for reduced-motion users.
- Focus completion has a text status that does not depend on animation.

## 6. Verification

- Focused Vitest coverage starts red for every behavior change.
- CSS contract tests cover frameless Search and Quick Links, stack footprint equality, and the new dock depth.
- Real Chromium covers free Search and Quick Links, Focus entry and completion, compact Status tooltip, stack grip reorder, equal edge reach, and top and bottom dock geometry.
- Attention QA covers collision-free placement at desktop and compact widths and ICS permission revocation.
- One bounded review cycle may report Critical or Important findings. Those findings block the stabilized full unit, build, and browser gate.
- Only the feature branch may be pushed. No merge, release, publication, premium implementation, or Chrome Web Store action is authorized.

## 7. Follow-up conversations

After this checkpoint, discuss improving the quality and breadth of Aurora's background image catalog. Discuss premium features and subscription structure only after the image conversation.
