# Widget production parity repair

The owner rejected the production presentation after the v2 gallery review. Their screenshots supersede the prior visual-pass assessment. They approved repairs to match the overview compositions for every supported widget size, free/stacked/docked placement, and existing setting, while retaining functionality and color controls.

## Confirmed causes

- Both production forge connectors still limited activity to 112 days while the overview used 365-day fixtures. Full graphs capped their width against the short dataset, independently of their month axis.
- Quiet Compact GitHub/GitLab cards added an empty work row beneath an already full graph composition.
- Calendar reserved a 24px month header for a 28px view switch. Increasing the header requires reducing date-row height within the fixed Standard frame.
- The prior overhaul changed the default surface to a tinted mineral color and forced bookmark icons to a brown accent. The owner wants the original neutral near-black surface and original bookmark color.

## Delivery checks

- [x] Reconcile branch and protected checkout; retain previous artifacts and galleries.
- [x] Reproduce the short-history/quiet graph failure in the exact built extension.
- [x] Add failing coverage for the actual provider window, partial-cache truthfulness, and Compact quiet composition.
- [ ] Repair the causes and verify the complete rendered catalog, including free/stack parity, text bounds, short history, empty work, and Calendar month lengths.
- [ ] Verify custom surface/text/graph colors and existing affected interactions.
- [ ] Run affected gates and the composed stabilization gate against the clean runtime checkpoint.
- [ ] Publish a review using actual corrected extension captures; update QA/ledgers, commit, push, and prove equality and protected-path preservation.

The GitHub request uses the existing GraphQL calendar query with a 365-day range. GitLab retains its existing calendar request and uses the available year. No additional requests, scopes, permissions, credentials, or hosted changes are introduced. Old/partial snapshots reserve the selected range with explicitly unavailable cells rather than invented zero counts; totals and streaks continue to use actual data. Empty work remains an empty state, never fabricated rows.

Provider references: [GitHub contributions collection](https://docs.github.com/en/graphql/reference/users#user), [GitLab contribution calendar](https://docs.gitlab.com/user/profile/contributions_calendar/).

All earlier hosted, paid infrastructure, release, merge, rollout, OAuth publication, and Chrome Web Store approval boundaries remain in force. Fitness remains on hold. No subagents.
