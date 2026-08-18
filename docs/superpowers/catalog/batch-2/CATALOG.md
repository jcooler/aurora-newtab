# NL-P5 Tier Catalog — Batch 2

Owner review per the named-layouts spec §2.3: the nine connector widgets
plus the remaining small widgets, each at every supported tier. Docked
lines are one dense text-first row (middle dots separate facts), built
from the SAME snapshot each widget already renders — no second fetch.
Captures were taken from the production preview build at 1600x900 with
the authoritative nine-connector fixture data.

Batch-2 notes for the review:
- Connector dock lines are non-interactive readouts: their free forms offer no panel or expansion, so a readout IS click parity (spec 2.4). Overrule here if a docked connector should open something.
- worldClocks, countdown, sun, and moon declare Docked with their existing compact single-line compositions (declared, not rebuilt); judge them in the strip captures.
- monthCal and links declare NO Docked tier (a month grid and a launcher grid have no honest one-line form); overrule here if wanted.
- The GitHub line follows the spec's own example shape (PRs · issues · unread). Quiet states read "All clear".

## GitHub

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Selected primary count or graph | ![github compact](github-compact.png) | _pending_ |
| standard | Selected graph or rows | ![github standard](github-standard.png) | _pending_ |
| full | Graph, stats, and all selected row families | ![github full](github-full.png) | _pending_ |
| docked | Selected activity counts | ![github docked](github-docked.png) | _pending_ |

## GitLab

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Selected primary count or graph | ![gitlab compact](gitlab-compact.png) | _pending_ |
| standard | Selected graph or rows | ![gitlab standard](gitlab-standard.png) | _pending_ |
| full | All selected GitLab sections | ![gitlab full](gitlab-full.png) | _pending_ |
| docked | Selected activity counts | ![gitlab docked](gitlab-docked.png) | _pending_ |

## Jira

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Selected-view count | ![jira compact](jira-compact.png) | _pending_ |
| standard | Prioritized issue rows | ![jira standard](jira-standard.png) | _pending_ |
| full | All selected Jira sections | ![jira full](jira-full.png) | _pending_ |
| docked | Selected issue counts | ![jira docked](jira-docked.png) | _pending_ |

## Vercel

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Deployment health | ![vercel compact](vercel-compact.png) | _pending_ |
| standard | Selected deployment rows or summary | ![vercel standard](vercel-standard.png) | _pending_ |
| full | All selected deployment sections | ![vercel full](vercel-full.png) | _pending_ |
| docked | Deployment health | ![vercel docked](vercel-docked.png) | _pending_ |

## Status

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Service health | ![status compact](status-compact.png) | _pending_ |
| standard | Service dots and active issues | ![status standard](status-standard.png) | _pending_ |
| docked | Service health | ![status docked](status-docked.png) | _pending_ |

## Headlines

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Top headline | ![rss compact](rss-compact.png) | _pending_ |
| standard | Selected headlines | ![rss standard](rss-standard.png) | _pending_ |
| full | All selected headlines that fit | ![rss full](rss-full.png) | _pending_ |
| docked | Top headline | ![rss docked](rss-docked.png) | _pending_ |

## Crypto

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Primary coin price | ![crypto compact](crypto-compact.png) | _pending_ |
| standard | Selected coin prices | ![crypto standard](crypto-standard.png) | _pending_ |
| docked | Primary coin price | ![crypto docked](crypto-docked.png) | _pending_ |

## Home Assistant

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Selected entity or action | ![homeassistant compact](homeassistant-compact.png) | _pending_ |
| standard | Selected entities and actions | ![homeassistant standard](homeassistant-standard.png) | _pending_ |
| full | Complete selected home composition | ![homeassistant full](homeassistant-full.png) | _pending_ |
| docked | Selected entity state | ![homeassistant docked](homeassistant-docked.png) | _pending_ |

## Calendar

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Next event | ![ics compact](ics-compact.png) | _pending_ |
| standard | Selected calendar view | ![ics standard](ics-standard.png) | _pending_ |
| docked | Next event | ![ics docked](ics-docked.png) | _pending_ |

## Habits

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Habit action | ![habits compact](habits-compact.png) | _pending_ |
| docked | Habits done today | ![habits docked](habits-docked.png) | _pending_ |

## World clocks

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Primary world clock | ![worldClocks compact](worldClocks-compact.png) | _pending_ |
| standard | Selected clocks<br>_Currently renders identically to compact — tier differentiation pending owner direction_ | ![worldClocks standard](worldClocks-standard.png) | _pending_ |
| full | All selected clocks<br>_Currently renders identically to compact — tier differentiation pending owner direction_ | ![worldClocks full](worldClocks-full.png) | _pending_ |
| docked | Primary world clock | ![worldClocks docked](worldClocks-docked.png) | _pending_ |

## Countdown

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Countdown | ![countdown compact](countdown-compact.png) | _pending_ |
| standard | Countdown detail<br>_Currently renders identically to compact — tier differentiation pending owner direction_ | ![countdown standard](countdown-standard.png) | _pending_ |
| docked | Next countdown | ![countdown docked](countdown-docked.png) | _pending_ |

## Sun

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Next sun event | ![sun compact](sun-compact.png) | _pending_ |
| standard | Sunrise and sunset | ![sun standard](sun-standard.png) | _pending_ |
| docked | Next sun event | ![sun docked](sun-docked.png) | _pending_ |

## Moon

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Current phase | ![moon compact](moon-compact.png) | _pending_ |
| docked | Current phase | ![moon docked](moon-docked.png) | _pending_ |

## Month

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Current week | ![monthCal compact](monthCal-compact.png) | _pending_ |
| standard | Complete month | ![monthCal standard](monthCal-standard.png) | _pending_ |

## Quick Links

| Tier | Content contract | Capture | Owner verdict |
| --- | --- | --- | --- |
| compact | Primary link action | ![links compact](links-compact.png) | _pending_ |
| standard | Selected quick links<br>_Currently renders identically to compact — tier differentiation pending owner direction_ | ![links standard](links-standard.png) | _pending_ |
