# Tab Two Metrics Visual Contract

Status: owner visual approval required before production React or CSS

## Product intent

Metrics is a private reflection surface, not an operations dashboard. It should answer one calm question at a glance: "How has my rhythm changed?" The design uses the established Tab Two near-black panel, cyan accent, Inter body type, and Space Grotesk display type. Richer history appears only as the widget grows.

The signature element is the activity rhythm: a thin cyan trace and a row of daily marks. It represents the count of active metric categories on each day, from zero to six. This avoids combining unlike units such as tasks and minutes into a misleading total.

## Information model

- Active day: a day with at least one non-zero aggregate in Habits, Focus, Tasks, Calendar, Development, or Fitness.
- Activity rhythm: the number of those six categories with activity on a day.
- Habit rate: completed habit checks divided by tracked habit checks. If nothing was tracked, show an em dash rather than zero percent.
- Comparisons: compare with the immediately preceding period of the same duration. Omit the comparison when the prior period is unavailable.
- Category values retain their native units. Focus uses hours and minutes, Tasks uses completed count, Habits uses a completion rate, Calendar uses busy hours, Development uses commits, and Fitness uses activities.
- No score, streak, or comparison may imply precision that is not present in the aggregate history.

## Brand tokens

| Role | Contract |
| --- | --- |
| Surface | `rgb(10 10 10 / 0.92)` with the existing panel blur and shadow |
| Primary ink | `#f5f5f4` |
| Muted ink | `rgb(245 245 244 / 0.68)` |
| Accent | `#7dd3fc` |
| Hairline | `rgb(245 245 244 / 0.09)` |
| Display type | Space Grotesk variable |
| Body type | Inter variable |
| Radius | Existing `1rem` widget radius |

The accent is reserved for the activity rhythm, current range, focus treatment, and the primary conversion action. Statuses also use a plain-language label so color is never the sole distinction.

## Tier contracts

### Compact: 216 by 132 CSS pixels

- Header: Metrics and the 7 day period.
- Primary: active days as a whole-number fraction, never a fabricated composite score.
- Signature: seven daily rhythm bars with visible current-day emphasis.
- Support: completed tasks and Focus minutes.
- No navigation control, category grid, axis, or comparison paragraph.

### Standard: 320 by 200 CSS pixels

- Header: Metrics and one `View history` action.
- Primary: active days in the last 30 days and an honest same-period comparison when available.
- Signature: a restrained 30-day rhythm trace.
- Support: Focus time, completed tasks, and habit rate in one balanced baseline row.
- `View history` is at least 44 CSS pixels tall for coarse pointers.

### Expanded: 460 by 284 CSS pixels

- Header: Metrics and the 7, 30, 90, and 365 day range control.
- Main region: one readable activity-rhythm chart with active-day total and same-period comparison.
- Supporting region: six category rows with native units and direction-aware comparisons.
- The current range is distinguished by background, weight, and `aria-pressed`, not color alone.
- Keyboard focus uses the existing two-pixel cyan outline.

### Touch-narrow

- The standard widget remains 320 by 200 inside a 390 pixel viewport.
- The `View history` action remains at least 44 by 44 CSS pixels.
- No text, trace, or focus affordance clips or creates horizontal page overflow.

## State contracts

### Locked

Show the premium promise without a disabled or fabricated chart. Copy focuses on value and privacy: understand patterns across focus, habits, tasks, calendar load, development, and fitness without syncing raw activity. Provide one `See premium plans` action.

### First use

Reserve normal geometry and show a truthful seven-mark empty rhythm. Explain that the first real habit check, completed task, or Focus session starts the history. Do not show zero totals as if collection already ran.

### Populated

Use the tier contracts above. The chart is descriptive, not decorative: visible text names the measure and an accessible summary states the active-day count and direction.

### Expired

Keep retained history readable. Add the plain-language `History paused` status and one `Renew` action. Do not blur, mask, or replace the existing chart and category values.

### Unavailable

Keep the last useful history visible. A quiet status line explains that new activity is not updating and offers `Try again`. It must not imply that retained history was lost.

### Loading

Reserve final geometry. A subtle opacity pulse may be used only when motion is allowed. With `prefers-reduced-motion: reduce`, animation is disabled and the static reserved shape remains.

## Motion & interaction

- Range changes may crossfade the trace and values in 160 milliseconds with a standard ease-out curve.
- Hover may lift the actionable label by color or surface only. The widget itself does not float or scale.
- Loading uses a restrained pulse; no looping decorative motion is allowed.
- All animation and transition effects are removed or reduced to an immediate state change when reduced motion is requested.
- Chart points are not individual pointer targets. The textual summary and category rows carry the meaning.

## Visual rejection criteria

- Clipped axes, labels, values, or focus rings.
- Text smaller than 11 CSS pixels for metadata or 12 CSS pixels for routine values.
- Generic KPI-card grids, excessive pills, gradient decoration, or more than one primary action.
- A chart that adds unlike units into one number.
- Error treatment that removes retained data.
- Touch controls below 44 CSS pixels, horizontal overflow, or hover-only meaning.
- Color-only state, trend, or range distinctions.

## Mockup inventory

The deterministic harness captures these original-resolution states:

1. Locked standard.
2. First-use standard.
3. Populated compact.
4. Populated standard.
5. Populated expanded at 7 days.
6. Populated expanded at 30 days.
7. Populated expanded at 90 days.
8. Populated expanded at 365 days.
9. Expired history readable.
10. Unavailable with retained history.
11. Touch-narrow standard.

Production implementation remains blocked until the owner approves this visual contract and the attached original-resolution PNGs.
