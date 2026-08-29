# Tab Two V2 Product and Visual Design

**Status:** Owner-approved direction, visual checkpoint pending

**Date:** 2026-08-29

**Product name:** Tab Two

**Positioning:** The first tab for your second screen.

## Product thesis

Tab Two is a beautiful, connected operating surface designed to remain open on a second screen. It should be striking at rest, legible at a glance, and actionable on demand without becoming a dense dashboard.

The product is not Momentum with more widgets. It combines calm photography and focus rituals with flexible layouts, useful live context, and connectors that help people act.

## Problem statement

Aurora has substantial capability, but its UI does not yet package that capability with the visual consistency, progressive disclosure, onboarding, and feature education expected from a production subscription product. Connector setup especially feels like configuration inventory instead of customer value.

Without a cohesive V2 experience, adding more features will increase clutter and support burden while leaving the competitive gap unchanged.

## Audience and primary job

Tab Two serves people who keep a browser tab visible on a second monitor during work, study, planning, or personal time.

The primary job is: **Help me orient myself in three seconds without opening several apps.**

Secondary jobs:

- Make an otherwise empty display beautiful.
- Show what matters now without demanding attention.
- Let me act when something genuinely needs me.
- Let me arrange the experience around how I work.

## Experience model

| Depth | Promise | Examples |
|---|---|---|
| At rest | Beautiful | Original-resolution landscape, time, greeting, quote |
| At a glance | Informed | Agenda, weather, Progress, service state, attention |
| On demand | Actionable | Complete task, join call, start Flow, inspect incident |
| In control | Personal | Layouts, stacks, photo lock, connector visibility |

## Goals

1. Make a new installation feel complete and intentional within three minutes.
2. Let a returning user understand the day and any true attention item within three seconds.
3. Give every connector a clear value proposition, preview, permission explanation, setup flow, and recovery state.
4. Make free local-only use excellent while making automatic sync and managed integrations understandable paid value.
5. Make every approved desktop composition look deliberate at 1440p, 4K, 5K, and common ultrawide aspect ratios.

## Non-goals

- Do not reproduce every Momentum feature before launch.
- Do not add Ask AI, arbitrary URL metrics, live workshops, or a mobile companion in this phase.
- Do not retroactively paywall capabilities already available in Aurora V1.
- Do not automatically rearrange named layouts by viewport.
- Do not change production UI before the complete V2 visual checkpoint is owner-approved.
- Do not publish, merge, or alter the Chrome Web Store listing in this phase.

## Product architecture

### Beautiful at rest

The photograph is the canvas, not decoration behind the interface. Time, greeting, quote, Search, Quick Links, Focus, Notes, and compact Service Status retain their approved intrinsic or text-led presentation when free on the canvas.

Cards appear only where information genuinely needs a bounded surface. At rest, controls remain quiet and reveal themselves through hover, focus, or direct intent.

### Attention

Attention contains only new or time-sensitive items that may require action. Examples include an approaching meeting, a newly assigned issue, a failed deployment, an incident, or an overdue task.

Every item must explain its source, why it is appearing, when it changed, and what action is available. Attention is not a count of everything unfinished.

### Progress

Progress is distinct from Attention. It presents goal-directed values such as water, reading, habits, meditation, workouts, Strava activity, or Fitbit steps.

Progress supports:

- Manual values with a unit, target, cadence, and increment action.
- Existing Tab Two data such as Habits.
- Connected values from approved providers.
- Optional history and trends for paid accounts.

Progress does not use surveillance language such as "track everything." The customer-facing promise is: **Keep what matters moving.**

### Connectors

Connectors are organized by customer purpose:

- Everyday: Calendar, Todoist, Google Tasks, Microsoft To Do.
- Health: Strava and future fitness providers.
- Work: Asana, Trello, ClickUp, Notion, Jira, Linear.
- Developer: GitHub, GitLab, Vercel, Sentry, service status.
- Home: Home Assistant and future home integrations.

The underlying registry remains authoritative. Categories are presentation metadata, not new storage owners.

## Connector experience requirements

Every connector detail view must contain:

1. Name, recognizable mark, category, and entitlement.
2. One sentence explaining the customer outcome.
3. A representative sample preview.
4. A short "What you will see" list.
5. Plain-language permissions and data-handling disclosure.
6. A primary Connect or Manage action.
7. Connected, refreshing, stale, needs-attention, error, disabled, and disconnected states as applicable.
8. A link to focused help without requiring the customer to leave the setup flow.

Premium education must explain value before price. A locked experience shows the real feature with sample data, states what Plus adds, and offers "Not now" without a dark pattern.

## Account and entitlement direction

- Free use remains local-first and requires no account.
- Existing V1 capability remains free.
- Free users receive manual backup and a clear one-time device-transfer path.
- Paid accounts receive automatic encrypted sync, cross-device continuity, managed OAuth connectors, history, and future paid enhancements.
- Connector credentials and capability URLs must never be exposed in UI copy, logs, backup exports, or preview fixtures.
- Pricing and trial duration remain commercial decisions to validate, not visual-spec authority.

## Visual direction

### Subject

The subject is an ambient second-screen instrument. Its visual material comes from high-resolution landscape photography, optical controls, calendar notation, progress marks, and quiet status indicators.

### Signature

The memorable element is **the living horizon**: the photograph remains uninterrupted across the canvas while information collects in small, precise constellations around it. Opening a deeper surface should feel like focusing a lens, with the background dimmed but still spatially present.

This is not generic glassmorphism. Panels are near-solid optical black with restrained translucency only where the photograph must remain perceptible.

### Tokens

| Role | Value |
|---|---|
| Optical black | `#0B0D0F` |
| Deep panel | `#101317` |
| Canvas ink | `#F6F7F4` |
| Mist | `#A9B1B4` |
| Hairline | `rgba(255,255,255,0.13)` |
| Sky | `#67C7F2` |
| Fuchsia | `#E879F9` |
| Good | `#4ADEA3` |
| Warning | `#F7C75B` |
| Critical | `#FF6B6B` |

Typography:

- Display: Space Grotesk variable, restrained to time, greeting, major values, and modal titles.
- Body: Inter variable.
- Utility: system monospace for timestamps, units, and provider metadata only.

Geometry:

- Controls: 10px to 12px radius.
- Information panels: 18px radius.
- Major settings and explanation surfaces: 24px radius.
- Minimum pointer target: 44px.
- Desktop canvas edge: 8px where existing placement authority allows.

### Motion

- Use one coordinated reveal when opening Settings or a feature explanation.
- Hover motion is limited to opacity, color, and at most 2px translation.
- Progress completion may use a short restrained celebration.
- Respect reduced motion by removing translation and particle motion.
- No continuously floating panels or decorative pulsing.

## Photography quality contract

The background library must feel premium on large displays.

- Prefer untouched licensed originals with a long edge of at least 6000 pixels.
- Never upscale, pre-crop, sharpen, or generate lower-resolution display copies for new catalog entries.
- Retain small local previews only for Settings thumbnails and LQIP first paint.
- Reject visible compression, heavy noise, missed focus, oversharpening halos, crushed detail, or AI artifacts.
- Test each candidate at 2560x1440, 3840x2160, 5120x2880, and 5120x1440 display geometry.
- Test center, top, and subject-aware positioning without mutating the source asset.
- Select compositions whose important subject survives common aspect-ratio cover behavior.
- Record photographer, source, license, pixel dimensions, bytes, and visual-review status.
- Existing bundled images that do not meet the quality bar are flagged for owner keep/remove review rather than removed automatically.

## Core V2 surfaces

### Canvas

- Original-resolution photo remains dominant.
- Time, greeting, quote, Focus, Search, and Quick Links remain text-led or intrinsic.
- Attention appears as one concise summary and expands only on intent.
- Progress appears as compact goal values and expands to history or controls.
- Framed widgets retain authored, data-dense compositions.
- Layout and stack controls remain absent at rest and usable through hover, keyboard, and touch.

### Onboarding

Onboarding asks only what is needed for first value:

1. Name and preferred clock format.
2. Choose a visual starting point.
3. Choose a simple starter layout: Calm, Everyday, Work, or Blank.
4. Optionally connect Calendar or Tasks.
5. Finish on the real canvas with controls explained in place.

Account creation is optional and never blocks local use.

### Settings

Settings uses a stable left navigation and one scroll owner. Proposed sections:

- Home
- Appearance
- Canvas
- Connectors
- Progress
- Flow
- Account & sync
- Privacy & data
- About

Each section begins with its outcome and current state. Rare controls sit behind labelled disclosures. Connector setup no longer expands inside a long card list.

### Feature explanation

Feature explanation surfaces include:

- A clear title and customer outcome.
- One representative visual.
- At most three useful benefits.
- Entitlement and privacy information.
- One primary action and one quiet dismissal.

## User stories

- As a new user, I want a beautiful useful canvas immediately so that setup does not feel like work.
- As a second-screen user, I want important information to remain glanceable so that I do not repeatedly open other apps.
- As a privacy-conscious free user, I want local use without an account so that I control whether data leaves my browser.
- As a multi-device customer, I want automatic sync so that my layouts and personal data follow me.
- As a customer considering Plus, I want to understand a feature before upgrading so that the purchase feels informed.
- As a connector user, I want clear permissions, previews, and recovery guidance so that connecting an account feels safe.
- As a fitness user, I want progress visible without a full analytics dashboard so that I receive a useful reminder instead of more work.

## P0 requirements for the first implementation wave

- Shared V2 typography, spacing, color, motion, focus, modal, sheet, status, and empty-state primitives.
- Canvas resting hierarchy matching the approved mockup.
- Settings information architecture and responsive shell.
- Connector gallery and connector detail surface using existing registry entries.
- Connected, disconnected, locked, needs-attention, stale, and error component states.
- Premium explanation pattern without final pricing dependency.
- Onboarding concept and first-value path.
- Photo quality manifest and owner review report for the existing library.
- Real Chromium visual proof at desktop, ultrawide, short-height, and touch-narrow sizes.

## P1 requirements

- Account and sync experience.
- Progress manual metrics and existing Habits bridge.
- Strava integration after provider review.
- Calendar and task connectors with actions where provider APIs allow them.
- Starter layout presets that remain explicitly user-selected.

## Deferred considerations

- Fitbit, pending provider and scope review.
- Additional consumer connectors.
- Teams, shared layouts, or organization administration.
- AI-assisted notes or search.
- Mobile companion and Apple Health.
- Arbitrary URL metrics.

## Acceptance criteria

- The owner approves every core mockup before production presentation changes.
- The dashboard remains recognizable and beautiful with all optional widgets hidden.
- The first meaningful content appears without an account or connector.
- No intrinsic text-led identity becomes a generic card on the free canvas.
- Connector setup never requires reading raw API terminology without a plain-language explanation.
- Every visible interactive element has an action, hover and focus state, and a truthful accessible name.
- No approved viewport has horizontal overflow, clipped controls, hidden actions, or unintended widget overlap.
- Every bundled photograph used for acceptance is rendered from its highest-quality local source.
- Reduced-motion mode preserves meaning and completion feedback.

## Success measures

These are launch hypotheses and require privacy-respecting measurement design before collection.

- At least 70% of new users reach a populated canvas within three minutes.
- At least 60% of connector setup attempts reach a connected state.
- At least 80% of usability participants can explain a premium feature before seeing price.
- At least 90% of tested users can identify why an Attention item appeared.
- Zero Critical or Important visual, accessibility, privacy, or data-ownership defects at release gate.

## Visual checkpoint

The design-only gallery must show:

1. Resting canvas.
2. Settings home and connector gallery.
3. Connector detail with sample preview and permissions.
4. Premium feature explanation.
5. Progress overview.
6. Account and sync direction.
7. Background library quality treatment.

Approval of this specification does not authorize production implementation, merge, publication, or Store changes. Production work begins only after the owner approves the rendered visual checkpoint.
