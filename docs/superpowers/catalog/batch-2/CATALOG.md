# NL-P5 Tier Catalog — Batch 2

Owner review per the named-layouts spec §2.3: the nine connector widgets
plus the remaining small widgets, each at every supported tier. Docked
lines are one dense text-first row (middle dots separate facts), built
from the SAME snapshot each widget already renders — no second fetch.
Captures were taken from the production preview build at 1600x900 with
the authoritative nine-connector fixture data.

Batch-2 notes for the review:
- Connector dock lines are non-interactive readouts: their free forms offer no panel or expansion, so a readout IS click parity (spec 2.4). Overrule here if a docked connector should open something.
- worldClocks and countdown declare Docked with their existing compact single-line compositions (declared, not rebuilt); judge them in the strip captures.
- sun and moon now render bare dense DockLines at the shared strip density (no panel), per the batch-2 owner review.
- monthCal and links declare NO Docked tier (a month grid and a launcher grid have no honest one-line form); overrule here if wanted.
- The batch-2 owner review removed the compact Month tier ("takes up way too much space, just remove it") — the complete month is Month's only tier.
- The GitHub line follows the spec's own example shape (PRs · issues · unread). Quiet states read "All clear".
- Bookmarks are a batch-1 widget: reviewed and approved in the batch-1 catalog (full readable bar, single-letter compact marks).

## GitHub

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Selected primary count or graph | ![github compact](github-compact.png) | Approved with refinement (2026-08-18): match GitLab compact — graph with streak and contributions. Applied. |
| standard | Selected graph or rows | ![github standard](github-standard.png) | Approved (owner review 2026-08-18) |
| full | Graph, stats, and all selected row families | ![github full](github-full.png) | Approved with refinement (2026-08-18): full looked exactly like standard — now a wider card (25rem) with a larger graph (18px cells). Applied. |
| docked | Selected activity counts | ![github docked](github-docked.png) | Approved (owner review 2026-08-18) |

## GitLab

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Selected primary count or graph | ![gitlab compact](gitlab-compact.png) | Approved (owner review 2026-08-18) |
| standard | Selected graph or rows | ![gitlab standard](gitlab-standard.png) | Approved (owner review 2026-08-18) |
| full | All selected GitLab sections | ![gitlab full](gitlab-full.png) | Approved with refinement (2026-08-18): full looked exactly like standard — now a wider card (25rem) with a larger graph (18px cells). Applied. |
| docked | Selected activity counts | ![gitlab docked](gitlab-docked.png) | Approved (owner review 2026-08-18) |

## Jira

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Selected-view count | ![jira compact](jira-compact.png) | Approved (owner review 2026-08-18) |
| standard | Prioritized issue rows | ![jira standard](jira-standard.png) | Approved (owner review 2026-08-18) |
| full | All selected Jira sections | ![jira full](jira-full.png) | Approved (owner review 2026-08-18) |
| docked | Selected issue counts | ![jira docked](jira-docked.png) | Approved (owner review 2026-08-18) |

## Vercel

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Deployment health | ![vercel compact](vercel-compact.png) | Approved (owner review 2026-08-18) |
| standard | Selected deployment rows or summary | ![vercel standard](vercel-standard.png) | Approved (owner review 2026-08-18) |
| full | All selected deployment sections | ![vercel full](vercel-full.png) | Approved (owner review 2026-08-18) |
| docked | Deployment health | ![vercel docked](vercel-docked.png) | Approved (owner review 2026-08-18) |

## Status

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Service health | ![status compact](status-compact.png) | Approved with refinement (2026-08-18): dots without names were not intuitive — compact stays dots-only with hover titles naming each service. Applied. |
| standard | Service dots and active issues | ![status standard](status-standard.png) | Approved with refinement (2026-08-18): dots without names were not intuitive — service names now shown beside each dot. Applied. |
| docked | Service health | ![status docked](status-docked.png) | Approved (owner review 2026-08-18) |

## Headlines

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Top headline | ![rss compact](rss-compact.png) | Approved (owner review 2026-08-18) |
| standard | Selected headlines | ![rss standard](rss-standard.png) | Approved (owner review 2026-08-18) |
| full | All selected headlines that fit | ![rss full](rss-full.png) | Approved (owner review 2026-08-18) |
| docked | Top headline | ![rss docked](rss-docked.png) | Approved (owner review 2026-08-18) |

## Crypto

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Primary coin price | ![crypto compact](crypto-compact.png) | Approved (owner review 2026-08-18) |
| standard | Selected coin prices | ![crypto standard](crypto-standard.png) | Approved (owner review 2026-08-18) |
| docked | Primary coin price | ![crypto docked](crypto-docked.png) | Approved (owner review 2026-08-18) |

## Home Assistant

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Selected entity or action | ![homeassistant compact](homeassistant-compact.png) | Approved (owner review 2026-08-18) |
| standard | Selected entities and actions | ![homeassistant standard](homeassistant-standard.png) | Approved (owner review 2026-08-18) |
| full | Complete selected home composition | ![homeassistant full](homeassistant-full.png) | Approved (owner review 2026-08-18) |
| docked | Selected entity state | ![homeassistant docked](homeassistant-docked.png) | Approved (owner review 2026-08-18) |

## Calendar

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Next event | ![ics compact](ics-compact.png) | Approved (owner review 2026-08-18) |
| standard | Selected calendar view | ![ics standard](ics-standard.png) | Approved (owner review 2026-08-18) |
| docked | Next event | ![ics docked](ics-docked.png) | Approved (owner review 2026-08-18) |

## Habits

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Habit action | ![habits compact](habits-compact.png) | Approved (owner review 2026-08-18) |
| docked | Habits done today | ![habits docked](habits-docked.png) | Approved (owner review 2026-08-18) |

## World clocks

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Primary world clock | ![worldClocks compact](worldClocks-compact.png) | Approved (owner review 2026-08-18) |
| standard | Selected clocks<br>_Currently renders identically to compact — tier differentiation pending owner direction_ | ![worldClocks standard](worldClocks-standard.png) | Approved (owner review 2026-08-18) |
| full | All selected clocks<br>_Currently renders identically to compact — tier differentiation pending owner direction_ | ![worldClocks full](worldClocks-full.png) | Approved (owner review 2026-08-18) |
| docked | Primary world clock | ![worldClocks docked](worldClocks-docked.png) | Approved (owner review 2026-08-18) |

## Countdown

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Countdown | ![countdown compact](countdown-compact.png) | Approved (owner review 2026-08-18) |
| standard | Countdown detail<br>_Currently renders identically to compact — tier differentiation pending owner direction_ | ![countdown standard](countdown-standard.png) | Approved (owner review 2026-08-18) |
| docked | Next countdown | ![countdown docked](countdown-docked.png) | Approved (owner review 2026-08-18) |

## Sun

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Next sun event | ![sun compact](sun-compact.png) | Approved (owner review 2026-08-18) |
| standard | Sunrise and sunset | ![sun standard](sun-standard.png) | Approved (owner review 2026-08-18) |
| docked | Next sun event | ![sun docked](sun-docked.png) | Approved with refinement (2026-08-18): docked previously rendered the padded card and out-sized compact — now a bare dense line at the shared strip density, no panel. Applied. |

## Moon

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Current phase | ![moon compact](moon-compact.png) | Approved (owner review 2026-08-18) |
| docked | Current phase | ![moon docked](moon-docked.png) | Approved with refinement (2026-08-18): docked previously rendered the padded card and out-sized compact — now a bare dense line at the shared strip density, no panel. Applied. |

## Month

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| standard | Complete month | ![monthCal standard](monthCal-standard.png) | Approved (owner review 2026-08-18) |

## Quick Links

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Primary link action | ![links compact](links-compact.png) | Approved (owner review 2026-08-18) |
| standard | Selected quick links<br>_Currently renders identically to compact — tier differentiation pending owner direction_ | ![links standard](links-standard.png) | Approved (owner review 2026-08-18) |
