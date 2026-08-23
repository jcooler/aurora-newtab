# Aurora Unified Calendar Widget Design

**Date:** 2026-08-23

**Status:** Written from owner-approved direction; production implementation remains blocked pending written review and complete mockup-catalog approval

**Scope:** Unify the user-facing Calendar/ICS, Month, and Public Holidays experience without merging their data authorities or weakening named-layout, stack, storage, recovery, privacy, or Store boundaries

## 1. Context

Aurora currently registers three separate user-facing identities for closely related date information:

- `ics`, labelled Calendar, owns configured ICS feeds and event snapshots.
- `monthCal`, labelled Month, owns the local month grid and navigation.
- `publicHolidays`, labelled Public Holidays, owns country selection and public holiday snapshots.

The complete widget-system redesign must account for all 36 live registry identities. The owner has now approved treating these three source identities as one target user-facing Calendar candidate. The redesigned catalog therefore contains 34 target identities while its inventory explicitly maps and accounts for all 36 current source identities: 33 unchanged identity families plus one unified Calendar candidate derived from the three legacy date identities.

This design does not authorize production code changes. The complete all-widget HTML/CSS mockup catalog and its owner visual gate remain mandatory before implementation.

## 2. Governing decisions

1. Aurora exposes one user-facing **Calendar** widget.
2. Agenda and Month are user-controlled views of that widget.
3. Public Holidays is optional enrichment inside Calendar, not a separate visible card.
4. ICS events, local month generation, and public holiday fetching remain separate internal authorities.
5. Existing named layouts are never silently consolidated, moved, resized, or rewritten.
6. A user-controlled, per-layout consolidation flow owns migration when more than one legacy date widget is present.
7. No production consolidation occurs before the complete redesigned widget catalog is owner approved.

## 3. Goals

- Present related date information through one coherent widget identity.
- Preserve a complete, unclipped month grid.
- Give Agenda enough room for useful event titles, times, calendar identity, and truthful bounded row counts.
- Allow users to include or exclude public holidays.
- Keep Compact and Docked useful without compressing the month grid into an illegible form.
- Make Standard and Full materially different.
- Preserve exact shared frame dimensions and stack stability.
- Preserve all existing ICS secrets, feed colors, event identity, snapshots, country selection, holiday cache behavior, backup redaction, and permissions.
- Provide a reversible and explicit migration path for every named layout.

## 4. Non-goals

- No new calendar provider or account integration.
- No event creation, editing, deletion, RSVP, or remote calendar write.
- No automatic layout movement, collision correction, reflow, or placement selection.
- No Compact month grid.
- No docked month grid.
- No internal widget scrollbar.
- No provider branding, provider URL, country code, or implementation detail in primary widget content.
- No production migration during the mockup phase.
- No Chrome Web Store action.

## 5. User-facing identity

The catalog and eventual product label the unified widget **Calendar**. Agenda and Month are views, not registry peers. Public Holidays is a Calendar source option.

The implementation should retain the existing internal `ics` identity as the canonical registry and layout identity unless implementation planning finds a correctness blocker. Reusing `ics` minimizes schema and recovery churn while allowing the public label and renderer to become Calendar. The legacy `monthCal` and `publicHolidays` placement identities remain readable until each named layout is explicitly consolidated.

The public label must never expose `ICS` unless the user is configuring an ICS feed in Settings.

## 6. Presentation contracts

Shared external dimensions remain exact:

- Compact: 216x132 CSS px
- Standard: 320x200 CSS px
- Full: 460x284 CSS px

### 6.1 Docked

Docked Calendar is one dense, clickable line. It shows the next relevant event or included holiday with its time or date. It never renders a month grid and never grows to Month height.

Selection order is chronological. A currently active timed event may lead. An all-day holiday does not hide the next timed appointment when both are useful; the composition may retain the appointment as primary and the holiday as short supporting context.

### 6.2 Compact

Compact is agenda-led and never shows a compressed month grid.

Information budget:

- Essential: local date, next event or included holiday, time or relative date.
- Signature: one clear next-item composition.
- Supporting: at most one additional useful item when space and state permit.
- Omitted: month grid, provider detail, country label, setup prose, long source lists.

If no ICS feed is configured but public holidays are included, Compact may lead with the next holiday. If neither source has useful content, it uses a content-tight empty or setup state rather than filler.

### 6.3 Standard

Standard provides a visible **Agenda / Month** switch inside the widget. The switch is user-controlled and never changes automatically because of viewport, content density, time of day, or stack position.

Agenda information budget:

- Essential: next event title, time or all-day status, and calendar identity when multiple calendars exist.
- Signature: a bounded chronological agenda.
- Supporting: additional rows up to the measured tier budget, included holidays, and a truthful Join action where already supported.
- Overflow: a truthful details action or configured calendar destination when available; never an internal scrollbar.

Month information budget:

- Essential: month and year, weekday headings, every required day cell, and today state.
- Signature: the complete seven-column month grid.
- Supporting: event markers, holiday markers, countdown markers where retained, and the nearest holiday named in visible text.
- Overflow: none inside the frame. Dense date detail belongs in Agenda or a truthful details surface.

The selected Standard view is remembered for the active named layout. This presentation preference must not modify layout geometry or bypass the edit-mode Save/Cancel authority. Implementation planning must place it in a companion preference boundary keyed by stable layout identity, or an equivalent authority that cannot mutate the layout document outside its one Save path.

### 6.4 Full

Full shows Month and Agenda together when both are useful:

- The complete month grid occupies one deliberate region.
- Agenda occupies the other region with materially more rows and context than Standard.
- Public holidays appear in both forms without duplicate visible labels.
- Sparse data enlarges and balances the primary content; it does not leave an empty lower half.

Full must not be a stretched Standard face. It requires a visibly richer two-region composition and a documented row budget measured against 460x284.

### 6.5 Free-floating and stacks

The authored face for a tier is the same whether Calendar is free-floating or a stack member. Stack paging never resizes the outer frame. Navigation chrome remains non-occluding and appears only under the existing hover, focus, or active-interaction rules.

One mounted Calendar face owns the unified presentation. Its ICS and Public Holidays data hooks each remain single owners. A stack must not create a second fetch or timer owner for either source.

## 7. Calendar preferences

The intentionally small preference set is:

1. **Default Standard view:** Agenda or Month.
2. **Include public holidays:** On or Off.
3. **Week starts:** Locale default, Sunday, or Monday.

Default Standard view and holiday inclusion are presentation choices scoped to one named layout. Week start is one global calendar convention. The visible Standard switch updates the active layout's companion Calendar preference without changing layout geometry or entering edit mode; the same choice is also available in that widget's edit inspector. A newly added Calendar defaults to Agenda until the user chooses otherwise.

Today highlighting, weekday headings, complete grid geometry, source colors, accessible labels, and safe truncation are product behavior, not user settings.

Calendar feed management, feed color, agenda selection mode, upcoming count, and Join-link behavior retain their existing Settings authority. Public Holidays country selection remains a source setting and is requested only when holiday inclusion is enabled.

The view and inclusion choices may differ by named layout. Data configuration, capability URLs, country, fetched data, credentials, and cache ownership remain global and never switch with layout presentation.

## 8. Public Holidays integration

### 8.1 Agenda

Included holidays enter the chronological agenda as all-day items with a distinct, accessible holiday treatment. They show localized holiday name, date, and useful relative timing where the tier permits.

Holiday rows must not repeat provider names or country labels. A holiday does not replace a useful next timed event merely because its all-day start sorts earlier.

### 8.2 Month

Holiday dates receive a visually distinct marker that remains legible on dark, light, and strongly saturated panel colors. Standard Month also names the nearest relevant holiday in visible text, so markers are never unexplained or hover-only. Full exposes holiday names in the adjacent Agenda region.

### 8.3 Deduplication

The unified presentation deduplicates repeated public-source holidays by normalized date and name before rendering. It also collapses an ICS all-day event and public holiday when both have the same local date and normalized name.

Normalization may case-fold, trim punctuation and whitespace, and normalize known localized aliases only when evidence supports a stable mapping. It must not merge unrelated same-day events or hide two differently named holidays merely because their dates match.

The source records remain unchanged. Deduplication is a render-time projection, not a cache rewrite.

## 9. Internal authorities and data flow

Calendar composes three independently testable units:

1. **Agenda source adapter**
   - Reads configured ICS feeds through the existing ICS owner.
   - Preserves capability URL secrecy, feed colors, event identity, snapshot lifecycle, timezone semantics, and Join-link rules.
   - Produces normalized agenda items for presentation.

2. **Month grid source**
   - Generates the complete local month grid without a network request.
   - Owns month navigation and Today behavior.
   - Supports locale, Sunday, or Monday week origin without clipping or dropping cells.

3. **Public holiday source adapter**
   - Reads the existing country configuration and public-data snapshot owner.
   - Preserves cache scope, stale retention, retry, ownership revalidation, and no-auth privacy behavior.
   - Produces normalized all-day holiday items and month markers.

A pure Calendar composition layer combines these projections for the selected tier and view. It owns no remote request and writes no source cache.

## 10. Partial, loading, empty, stale, setup, and error behavior

Each source fails independently:

- Month remains usable when ICS or Public Holidays is loading or unavailable.
- Cached ICS events remain visible with stale treatment while refresh is pending or retained after failure.
- Cached holiday names and dates remain visible with stale treatment when still truthful.
- A Public Holidays failure never turns the whole Calendar into an error if Month or Agenda remains useful.
- An ICS failure never removes a useful Month or holiday view.
- Missing country setup appears only when the user has enabled holiday inclusion.
- Missing ICS feeds allows Month and Public Holidays to remain useful; it does not force the widget to disappear.
- A fully empty Agenda provides concise truthful copy and keeps the explicit Month switch available in Standard.
- Retry actions target only the failed source authority.

Error, setup, and stale controls must remain keyboard operable, must not cover content, and must not introduce an internal scrollport.

## 11. User-controlled legacy consolidation

### 11.1 Detection

Aurora detects, without writing, which of `ics`, `monthCal`, and `publicHolidays` is present in each named layout, dock, or stack. A layout with more than one legacy date identity requires explicit consolidation. A single-identity layout may also be offered the same preview so no public identity changes silently.

### 11.2 Consolidation prompt

The one-time prompt is scoped to one named layout and shows:

- Every current date-widget placement.
- Its current tier, layer, dock membership, or stack membership.
- A preview of the resulting unified Calendar at each candidate placement.
- Which sources and presentation choices will carry forward.
- **Save** and **Later** actions.

The owner chooses which existing placement becomes Calendar. Aurora never chooses based on screen space, source priority, creation time, viewport, or collision score.

### 11.3 Save behavior

Save performs one atomic, recovery-covered transaction for that layout:

- The chosen placement becomes canonical Calendar while retaining its exact anchored position, layer, and compatible tier.
- If the chosen member belongs to a stack, its exact stack position and current-face semantics carry forward.
- Other legacy date placements are removed from that layout only.
- ICS feeds, colors, secrets, snapshots, Public Holidays country, and source caches are not rewritten.
- Holiday inclusion and Standard default view carry forward according to the preview. Choosing the legacy Month placement proposes Month as the default; every proposal remains editable before Save.
- Backup and recovery retain enough legacy information to restore or replay the transition safely.

The transaction revalidates layout ownership inside the queued updater. A stale prompt cannot overwrite a layout changed in another tab.

### 11.4 Later and rollback

**Later** performs zero writes and leaves all legacy widgets intact. Until a layout is consolidated, it continues rendering through the current legacy compatibility path.

The migration is idempotent. Reload, backup restore, Cancel, interruption, or a second tab cannot create duplicate Calendar identities, drop a stack member, or partially remove legacy placements.

Legacy storage fields remain readable for the full compatibility window. Their physical removal, if ever desired, requires a later separately approved cleanup after rollback evidence exists.

## 12. Settings

Settings presents one Calendar entry with focused source and convention subsections:

- **Calendars:** existing named ICS feed add/remove, color, view, count, and Join-link controls.
- **Month:** global week-start preference.
- **Public holidays:** country selection and source status.

The selected widget's edit inspector owns the named-layout-specific **Default view** and **Include public holidays** controls. The visible Standard Agenda/Month switch owns the same per-layout view preference during ordinary use.

The interface keeps one editor body open at a time and preserves existing capability-URL privacy and backup guidance. Turning off holiday inclusion does not delete the configured country or cache. Disconnecting ICS feeds does not delete Month or Public Holidays preferences.

## 13. Accessibility and interaction

- Agenda/Month is a real labelled control with selected-state semantics and a 36px minimum target.
- The month remains a semantic table while date cells are non-interactive.
- If a future design makes date cells actionable, that requires a separately specified keyboard grid pattern.
- Every holiday or event marker has an accessible name tied to its date.
- Essential source identity and state are visible or programmatically named, never hover-only.
- Foreground hierarchy uses the shared panel-color contrast authority across black, white, bright pink, and other saturated colors.
- Ordinary clicks do not select the widget. Edit selection remains edit-mode only.
- Swipe and stack navigation preserve text-selection suppression and fixed footprint behavior.
- Reduced motion removes non-essential transitions without hiding state changes.

## 14. Mockup-catalog requirements

The complete redesigned catalog must:

- List all 36 live registry identities and map the three date identities to the one unified Calendar candidate.
- Show Calendar Docked, Compact, Standard Agenda, Standard Month, and Full combined faces.
- Show free-floating and stack presentations at every supported tier.
- Include dense, sparse, long-title, multi-calendar, no-feed, no-country, loading, stale ICS, stale holidays, partial-source, empty, and hard-error fixtures.
- Include dark, light, and strongly saturated Calendar colors.
- Include a mixed GitHub + Calendar stack at identical dimensions.
- Show the consolidation prompt with multiple free placements, a docked Calendar, a Month placement, and a date widget inside a stack.
- Prove Standard Month has a complete seven-column grid with no clipping.
- Prove Standard Agenda does not waste space while truncating important text.
- Prove Full is materially richer than Standard.
- Use real rendered HTML/CSS plus Playwright screenshots and manual original-resolution inspection.

The full catalog still redesigns every non-calendar widget required by the takeover. This design does not reduce GitHub, GitLab, Weather, Tasks, Notes, browser-native, connector, intrinsic, dock, stack, state, color, or mixed-stack coverage.

## 15. Verification requirements for eventual implementation

### 15.1 Focused programmatic checks

- Registry inventory and legacy-to-target mapping.
- Exact tier and dock contracts.
- Agenda selection with timed, all-day, multi-day, duplicate, and holiday items.
- Sunday, Monday, and locale-default complete month grids.
- DST, timezone change, local midnight, and stale timer behavior.
- Independent source loading, partial, stale, retained-error, setup, empty, and hard-error algebra.
- Render-only holiday deduplication without source mutation.
- Per-layout preference isolation.
- Atomic consolidation, ownership revalidation, idempotence, backup, restore, Cancel, and two-tab conflicts.
- Stack order, current face, mounted-once data ownership, and exact footprint.
- No capability URL, provider detail, or raw credential exposure.

### 15.2 Real Chromium checks

- Exact 216x132, 320x200, and 460x284 outer geometry.
- Complete Standard Month grid at every supported row count.
- Agenda row budgets with dense and long fixtures.
- Dock containment and click-through details.
- Free-floating, stack, and edit-mode behavior.
- Dark, light, bright pink, and additional saturated panel colors.
- Keyboard operation, focus visibility, switch semantics, no ordinary-click selection, and non-occluding controls.
- No internal scrollbar, clipping, unexpected overflow, runtime error, failed local request, or layout write during presentation-only probes.
- Exact 1408x445 real-window witness during the stabilized product gate.

Automation does not claim live private calendar permissions, real provider availability, native Chrome permission UI, physical touch, real screen-reader speech, OS timezone changes, or genuine sleep/wake behavior.

## 16. Delivery sequence

1. Include this approved direction in the complete all-widget mockup inventory.
2. Build and inspect the entire owner-reviewable mockup catalog without changing production widget code.
3. Stop at the complete widget-by-widget visual gate.
4. After owner approval, write a just-in-time implementation plan.
5. Implement the Calendar family as one bounded packet with strict TDD and focused real-browser evidence.
6. Preserve one bounded review plus at most one fix/rereview cycle.
7. Finish with the stabilized cross-widget and mixed-stack gate.

## 17. Acceptance criteria

The design is satisfied only when:

- Users see one Calendar identity rather than three competing date widgets.
- Standard offers an explicit Agenda/Month switch and never squeezes both into 320x200.
- Full uses Month and Agenda together without clipping or wasted space.
- Compact and Docked remain useful without a month grid.
- Public Holidays can be included or excluded and are integrated without provider or country clutter.
- Every holiday marker is explained in visible or accessible content.
- ICS, Month, and Public Holidays retain independent source and storage authority.
- Existing named layouts change only after an explicit preview and Save.
- Save preserves the chosen placement, tier, layer, dock or stack membership, and source configuration.
- Later and Cancel perform zero writes.
- The complete catalog accounts for all 36 live identities and does not narrow the all-widget redesign.
- No production implementation or Store action occurs before the required owner gates.
