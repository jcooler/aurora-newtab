# Aurora Widget Redesign Catalog V1

Source commit: `2f667d2a9be3bdab823baed9d4a4c43dae930965`

## Inventory

36 live source identities map to 34 target designs. Calendar consolidates ICS, Month, and Public Holidays.

| Target | Sources | Presentations | States |
| --- | --- | --- | --- |
| Clock | clock | docked, compact, standard, full | Ready only |
| Greeting | greeting | compact, standard | Ready only |
| World Clocks | worldClocks | docked, compact, standard, full | Ready only |
| Countdown | countdown | docked, compact, standard | empty |
| Search | search | compact, standard | Ready only |
| Focus | focus | docked, compact, standard | empty |
| Quick Links | links | compact, standard | empty |
| Quote | quote | compact, standard | loading, error |
| Timer | timer | docked, compact | empty |
| Tasks | tasks | docked, compact | empty |
| Notes | notes | docked, compact | empty |
| Bookmarks | bookmarks | docked, compact, standard | empty, partial |
| Habits | habits | docked, compact | empty |
| Calendar | ics, monthCal, publicHolidays | docked, compact, standard, full | loading, empty, stale, partial, setup, error |
| Weather | weather | docked, compact, standard, full | loading, empty, stale, partial, setup, error |
| Sun | sun | docked, compact, standard | Ready only |
| Moon | moon | docked, compact | Ready only |
| On This Day | onThisDay | docked, compact, standard, full | loading, empty, stale, partial, error |
| Aurora & Kp | auroraKp | docked, compact, standard, full | loading, empty, stale, partial, error |
| GitHub | github | docked, compact, standard, full | loading, empty, stale, partial, setup, error |
| GitLab | gitlab | docked, compact, standard, full | loading, empty, stale, partial, setup, error |
| Jira | jira | docked, compact, standard, full | loading, empty, stale, partial, setup, error |
| Vercel | vercel | docked, compact, standard, full | loading, empty, stale, partial, setup, error |
| Service Status | status | docked, compact, standard | loading, empty, stale, partial, error |
| Linear | linear | docked, compact, standard, full | loading, empty, stale, partial, setup, error |
| Sentry | sentry | docked, compact, standard, full | loading, empty, stale, partial, setup, error |
| Todoist | todoist | docked, compact, standard, full | loading, empty, stale, partial, setup, error |
| Reading List | readingList | docked, compact, standard, full | loading, empty, stale, partial, permission, error |
| Recently Closed | recentlyClosed | docked, compact, standard, full | loading, empty, partial, permission, error |
| Downloads | downloads | docked, compact, standard, full | loading, empty, partial, permission, error |
| Tab Groups | tabGroups | docked, compact, standard, full | loading, empty, partial, permission, error |
| Home Assistant | homeassistant | docked, compact, standard, full | loading, empty, stale, partial, setup, error |
| Headlines | rss | docked, compact, standard, full | loading, empty, stale, partial, setup, error |
| Crypto | crypto | docked, compact, standard | loading, empty, stale, partial, setup, error |

## Per-tier information budgets

| Target | Tier | Purpose | Essential | Signature |
| --- | --- | --- | --- | --- |
| Clock | docked | Immediate time | time, date | precision-aligned time |
| Clock | compact | Time at a glance | time | dominant numerals |
| Clock | standard | Time and date | time, long date | dominant numerals |
| Clock | full | Time across context | time, long date | expanded numerals |
| Greeting | compact | Personal welcome | greeting | human-scale type |
| Greeting | standard | Welcome and briefing | greeting | human-scale type |
| World Clocks | docked | Primary remote time | city, time | day offset |
| World Clocks | compact | Primary remote time | city, time | large remote time |
| World Clocks | standard | Selected remote times | city, time | aligned clock list |
| World Clocks | full | Global working hours | city, time | time-band comparison |
| Countdown | docked | Next target | remaining time, label | countdown value |
| Countdown | compact | Next target | remaining time, label | dominant remaining value |
| Countdown | standard | Target progress | remaining time, label, date | dominant remaining value |
| Search | compact | Start a search | search action | clear prompt |
| Search | standard | Start a search | search action, keyboard hint | wide input rhythm |
| Focus | docked | Current focus | focus text | completion control |
| Focus | compact | Current focus | focus text | single intentional action |
| Focus | standard | Focus progress | focus text, completion | progress line |
| Quick Links | compact | Primary destinations | link marks | recognizable destinations |
| Quick Links | standard | Named destinations | link names | balanced link field |
| Quote | compact | One thought | quote | balanced quotation |
| Quote | standard | Readable quotation | quote, author | editorial type measure |
| Timer | docked | Timer state | remaining time, action | aligned timer value |
| Timer | compact | Run a timer | remaining time, action | dominant timer value |
| Tasks | docked | Task progress | open count, action | progress |
| Tasks | compact | Next tasks | task text, completion | bounded task queue |
| Notes | docked | Notes access | note status, action | note cue |
| Notes | compact | Recent note | note text | paper-like text field |
| Bookmarks | docked | Readable bookmark bar | bookmark names | linear launch rail |
| Bookmarks | compact | Bookmark marks | one-letter marks | dense launch grid |
| Bookmarks | standard | Named bookmarks | bookmark names | dense launch rail |
| Habits | docked | Daily habit progress | completed count | progress |
| Habits | compact | Daily habit progress | habit names, completion | progress arc |
| Calendar | docked | Next relevant date item | event or holiday, time or date | chronological next item |
| Calendar | compact | Next date items | local date, next item | agenda lead |
| Calendar | standard | Agenda or complete month | view switch, selected view content | agenda list or seven-column grid |
| Calendar | full | Month and agenda together | complete month, agenda | two-region date composition |
| Weather | docked | Current conditions | temperature, location, condition | large temperature |
| Weather | compact | Current weather | temperature, condition | large temperature |
| Weather | standard | Weather outlook | temperature, condition, location | forecast curve |
| Weather | full | Detailed forecast | temperature, condition, location | hourly forecast |
| Sun | docked | Next sun event | event, time | sun event glyph |
| Sun | compact | Next sun event | event, time | sun event glyph |
| Sun | standard | Sunrise and sunset | sunrise, sunset | sun path |
| Moon | docked | Current phase | phase | phase glyph |
| Moon | compact | Current moon phase | phase, illumination | large phase glyph |
| On This Day | docked | One historic moment | year, event | year marker |
| On This Day | compact | One historic moment | date, year, event | year marker |
| On This Day | standard | Historic moments | date, years, events | timeline |
| On This Day | full | Events, births, and deaths | date, years, events | multi-lane timeline |
| Aurora & Kp | docked | Current space weather | current Kp, next peak | Kp value |
| Aurora & Kp | compact | Current Kp and peak | current Kp, next peak | Kp gauge |
| Aurora & Kp | standard | Short Kp forecast | current Kp, forecast | forecast plot |
| Aurora & Kp | full | Three-day Kp outlook | current Kp, forecast | three-day plot |
| GitHub | docked | Development pulse | contributions, reviews | activity count |
| GitHub | compact | Contribution pulse | graph, count, streak | contribution graph |
| GitHub | standard | Contribution and review pulse | graph, count, streak | large contribution graph |
| GitHub | full | Complete development pulse | graph, count, streak | expanded contribution graph |
| GitLab | docked | Development pulse | activity, reviews | activity count |
| GitLab | compact | Activity pulse | graph, count, streak | activity graph |
| GitLab | standard | Activity and review pulse | graph, count, streak | large activity graph |
| GitLab | full | Complete GitLab pulse | graph, count, streak | expanded activity graph |
| Jira | docked | Issue pressure | assigned, due | status counts |
| Jira | compact | Issue pressure | assigned, due | status distribution |
| Jira | standard | Prioritized issues | issue key, summary, status | priority lane |
| Jira | full | Issue workload | issue key, summary, status | status distribution |
| Vercel | docked | Deployment health | state, project | health mark |
| Vercel | compact | Latest deployment | state, project | deployment state |
| Vercel | standard | Deployment timeline | project, state, age | deployment rail |
| Vercel | full | Deployment portfolio | project, state, age | multi-project timeline |
| Service Status | docked | Service health | service state | named status |
| Service Status | compact | Service health | service names, states | status line |
| Service Status | standard | Named service health | service names, states | service matrix |
| Linear | docked | Assigned work | assigned, due | cycle count |
| Linear | compact | Assigned work | assigned, due | cycle progress |
| Linear | standard | Prioritized work | issue id, title, state | cycle lane |
| Linear | full | Team workload | issue id, title, state | cycle progress |
| Sentry | docked | Error pressure | unresolved, top issue | severity count |
| Sentry | compact | Error pressure | unresolved, top issue | severity mark |
| Sentry | standard | Unresolved issues | issue, events, age | severity lane |
| Sentry | full | Error workload | issue, events, age | severity distribution |
| Todoist | docked | Due work | due, overdue | task count |
| Todoist | compact | Due work | due, overdue | completion progress |
| Todoist | standard | Due task sections | task, due state | today and overdue lanes |
| Todoist | full | Task workload | task, due state | project lanes |
| Reading List | docked | Reading queue | unread count, newest title | queue count |
| Reading List | compact | Reading queue | unread count, newest title | queue lead |
| Reading List | standard | Unread queue | title, domain | bounded reading list |
| Reading List | full | Reading library | title, domain, state | unread and recent lanes |
| Recently Closed | docked | Restore recent work | count, latest type | restore cue |
| Recently Closed | compact | Latest closed item | title, type, age | restore cue |
| Recently Closed | standard | Recent sessions | title, type, age | session list |
| Recently Closed | full | Restorable sessions | title, type, age | tab, group, and window lanes |
| Downloads | docked | Download activity | active count, latest file | progress |
| Downloads | compact | Current download | filename, state | progress bar |
| Downloads | standard | Download activity | filename, state, progress | active and recent lanes |
| Downloads | full | Download history | filename, state, progress | state timeline |
| Tab Groups | docked | Browser workspaces | group count, first group | group mark |
| Tab Groups | compact | Browser workspaces | group count, first group | group mark |
| Tab Groups | standard | Open workspaces | group name, tab count | group lanes |
| Tab Groups | full | Window workspaces | window, group name, tab count | window map |
| Home Assistant | docked | Home state | entity, state | entity state |
| Home Assistant | compact | Primary home state | entity, state | large entity value |
| Home Assistant | standard | Selected home states | entity, state | room strip |
| Home Assistant | full | Home control overview | entity, state | room composition |
| Headlines | docked | Top headline | headline, source | headline lead |
| Headlines | compact | Top headline | headline, source | headline lead |
| Headlines | standard | Selected headlines | headline, source | editorial list |
| Headlines | full | Headline briefing | headline, source | lead and supporting stories |
| Crypto | docked | Primary quote | symbol, price, change | quote movement |
| Crypto | compact | Primary quote | symbol, price, change | price movement |
| Crypto | standard | Selected market board | symbol, price, change | dense quote tape |

## Theme and state coverage

Every target has dark, light, and bright-pink evidence at its primary tier. Declared loading, empty, stale, partial, setup, permission, and error states are captured where applicable.

## Captures

| Capture | Kind | Evidence |
| --- | --- | --- |
| clock-docked-ready-dark | docked | [PNG](./clock-docked-ready-dark.png) |
| clock-compact-ready-dark | free | [PNG](./clock-compact-ready-dark.png) |
| clock-standard-ready-dark | free | [PNG](./clock-standard-ready-dark.png) |
| clock-full-ready-dark | free | [PNG](./clock-full-ready-dark.png) |
| clock-standard-ready-light | theme | [PNG](./clock-standard-ready-light.png) |
| clock-standard-ready-pink | theme | [PNG](./clock-standard-ready-pink.png) |
| clock-compact-stack-ready-dark | stack-face | [PNG](./clock-compact-stack-ready-dark.png) |
| clock-standard-stack-ready-dark | stack-face | [PNG](./clock-standard-stack-ready-dark.png) |
| clock-full-stack-ready-dark | stack-face | [PNG](./clock-full-stack-ready-dark.png) |
| greeting-compact-ready-dark | free | [PNG](./greeting-compact-ready-dark.png) |
| greeting-standard-ready-dark | free | [PNG](./greeting-standard-ready-dark.png) |
| greeting-standard-ready-light | theme | [PNG](./greeting-standard-ready-light.png) |
| greeting-standard-ready-pink | theme | [PNG](./greeting-standard-ready-pink.png) |
| greeting-compact-stack-ready-dark | stack-face | [PNG](./greeting-compact-stack-ready-dark.png) |
| greeting-standard-stack-ready-dark | stack-face | [PNG](./greeting-standard-stack-ready-dark.png) |
| worldClocks-docked-ready-dark | docked | [PNG](./world-clocks-docked-ready-dark.png) |
| worldClocks-compact-ready-dark | free | [PNG](./world-clocks-compact-ready-dark.png) |
| worldClocks-standard-ready-dark | free | [PNG](./world-clocks-standard-ready-dark.png) |
| worldClocks-full-ready-dark | free | [PNG](./world-clocks-full-ready-dark.png) |
| worldClocks-standard-ready-light | theme | [PNG](./world-clocks-standard-ready-light.png) |
| worldClocks-standard-ready-pink | theme | [PNG](./world-clocks-standard-ready-pink.png) |
| worldClocks-compact-stack-ready-dark | stack-face | [PNG](./world-clocks-compact-stack-ready-dark.png) |
| worldClocks-standard-stack-ready-dark | stack-face | [PNG](./world-clocks-standard-stack-ready-dark.png) |
| worldClocks-full-stack-ready-dark | stack-face | [PNG](./world-clocks-full-stack-ready-dark.png) |
| countdown-docked-ready-dark | docked | [PNG](./countdown-docked-ready-dark.png) |
| countdown-compact-ready-dark | free | [PNG](./countdown-compact-ready-dark.png) |
| countdown-standard-ready-dark | free | [PNG](./countdown-standard-ready-dark.png) |
| countdown-standard-ready-light | theme | [PNG](./countdown-standard-ready-light.png) |
| countdown-standard-ready-pink | theme | [PNG](./countdown-standard-ready-pink.png) |
| countdown-standard-empty-dark | state | [PNG](./countdown-standard-empty-dark.png) |
| countdown-compact-stack-ready-dark | stack-face | [PNG](./countdown-compact-stack-ready-dark.png) |
| countdown-standard-stack-ready-dark | stack-face | [PNG](./countdown-standard-stack-ready-dark.png) |
| search-compact-ready-dark | free | [PNG](./search-compact-ready-dark.png) |
| search-standard-ready-dark | free | [PNG](./search-standard-ready-dark.png) |
| search-standard-ready-light | theme | [PNG](./search-standard-ready-light.png) |
| search-standard-ready-pink | theme | [PNG](./search-standard-ready-pink.png) |
| search-compact-stack-ready-dark | stack-face | [PNG](./search-compact-stack-ready-dark.png) |
| search-standard-stack-ready-dark | stack-face | [PNG](./search-standard-stack-ready-dark.png) |
| focus-docked-ready-dark | docked | [PNG](./focus-docked-ready-dark.png) |
| focus-compact-ready-dark | free | [PNG](./focus-compact-ready-dark.png) |
| focus-standard-ready-dark | free | [PNG](./focus-standard-ready-dark.png) |
| focus-standard-ready-light | theme | [PNG](./focus-standard-ready-light.png) |
| focus-standard-ready-pink | theme | [PNG](./focus-standard-ready-pink.png) |
| focus-standard-empty-dark | state | [PNG](./focus-standard-empty-dark.png) |
| focus-compact-stack-ready-dark | stack-face | [PNG](./focus-compact-stack-ready-dark.png) |
| focus-standard-stack-ready-dark | stack-face | [PNG](./focus-standard-stack-ready-dark.png) |
| links-compact-ready-dark | free | [PNG](./links-compact-ready-dark.png) |
| links-standard-ready-dark | free | [PNG](./links-standard-ready-dark.png) |
| links-standard-ready-light | theme | [PNG](./links-standard-ready-light.png) |
| links-standard-ready-pink | theme | [PNG](./links-standard-ready-pink.png) |
| links-standard-empty-dark | state | [PNG](./links-standard-empty-dark.png) |
| links-compact-stack-ready-dark | stack-face | [PNG](./links-compact-stack-ready-dark.png) |
| links-standard-stack-ready-dark | stack-face | [PNG](./links-standard-stack-ready-dark.png) |
| quote-compact-ready-dark | free | [PNG](./quote-compact-ready-dark.png) |
| quote-standard-ready-dark | free | [PNG](./quote-standard-ready-dark.png) |
| quote-standard-ready-light | theme | [PNG](./quote-standard-ready-light.png) |
| quote-standard-ready-pink | theme | [PNG](./quote-standard-ready-pink.png) |
| quote-standard-loading-dark | state | [PNG](./quote-standard-loading-dark.png) |
| quote-standard-error-dark | state | [PNG](./quote-standard-error-dark.png) |
| quote-compact-stack-ready-dark | stack-face | [PNG](./quote-compact-stack-ready-dark.png) |
| quote-standard-stack-ready-dark | stack-face | [PNG](./quote-standard-stack-ready-dark.png) |
| timer-docked-ready-dark | docked | [PNG](./timer-docked-ready-dark.png) |
| timer-compact-ready-dark | free | [PNG](./timer-compact-ready-dark.png) |
| timer-compact-ready-light | theme | [PNG](./timer-compact-ready-light.png) |
| timer-compact-ready-pink | theme | [PNG](./timer-compact-ready-pink.png) |
| timer-compact-empty-dark | state | [PNG](./timer-compact-empty-dark.png) |
| timer-compact-stack-ready-dark | stack-face | [PNG](./timer-compact-stack-ready-dark.png) |
| tasks-docked-ready-dark | docked | [PNG](./tasks-docked-ready-dark.png) |
| tasks-compact-ready-dark | free | [PNG](./tasks-compact-ready-dark.png) |
| tasks-compact-ready-light | theme | [PNG](./tasks-compact-ready-light.png) |
| tasks-compact-ready-pink | theme | [PNG](./tasks-compact-ready-pink.png) |
| tasks-compact-empty-dark | state | [PNG](./tasks-compact-empty-dark.png) |
| tasks-compact-stack-ready-dark | stack-face | [PNG](./tasks-compact-stack-ready-dark.png) |
| notes-docked-ready-dark | docked | [PNG](./notes-docked-ready-dark.png) |
| notes-compact-ready-dark | free | [PNG](./notes-compact-ready-dark.png) |
| notes-compact-ready-light | theme | [PNG](./notes-compact-ready-light.png) |
| notes-compact-ready-pink | theme | [PNG](./notes-compact-ready-pink.png) |
| notes-compact-empty-dark | state | [PNG](./notes-compact-empty-dark.png) |
| notes-compact-stack-ready-dark | stack-face | [PNG](./notes-compact-stack-ready-dark.png) |
| bookmarks-docked-ready-dark | docked | [PNG](./bookmarks-docked-ready-dark.png) |
| bookmarks-compact-ready-dark | free | [PNG](./bookmarks-compact-ready-dark.png) |
| bookmarks-standard-ready-dark | free | [PNG](./bookmarks-standard-ready-dark.png) |
| bookmarks-standard-ready-light | theme | [PNG](./bookmarks-standard-ready-light.png) |
| bookmarks-standard-ready-pink | theme | [PNG](./bookmarks-standard-ready-pink.png) |
| bookmarks-standard-empty-dark | state | [PNG](./bookmarks-standard-empty-dark.png) |
| bookmarks-standard-partial-dark | state | [PNG](./bookmarks-standard-partial-dark.png) |
| bookmarks-compact-stack-ready-dark | stack-face | [PNG](./bookmarks-compact-stack-ready-dark.png) |
| bookmarks-standard-stack-ready-dark | stack-face | [PNG](./bookmarks-standard-stack-ready-dark.png) |
| habits-docked-ready-dark | docked | [PNG](./habits-docked-ready-dark.png) |
| habits-compact-ready-dark | free | [PNG](./habits-compact-ready-dark.png) |
| habits-compact-ready-light | theme | [PNG](./habits-compact-ready-light.png) |
| habits-compact-ready-pink | theme | [PNG](./habits-compact-ready-pink.png) |
| habits-compact-empty-dark | state | [PNG](./habits-compact-empty-dark.png) |
| habits-compact-stack-ready-dark | stack-face | [PNG](./habits-compact-stack-ready-dark.png) |
| calendar-docked-ready-dark | docked | [PNG](./calendar-docked-ready-dark.png) |
| calendar-compact-ready-dark | free | [PNG](./calendar-compact-ready-dark.png) |
| calendar-standard-ready-dark | free | [PNG](./calendar-standard-ready-dark.png) |
| calendar-full-ready-dark | free | [PNG](./calendar-full-ready-dark.png) |
| calendar-standard-ready-light | theme | [PNG](./calendar-standard-ready-light.png) |
| calendar-standard-ready-pink | theme | [PNG](./calendar-standard-ready-pink.png) |
| calendar-standard-loading-dark | state | [PNG](./calendar-standard-loading-dark.png) |
| calendar-standard-empty-dark | state | [PNG](./calendar-standard-empty-dark.png) |
| calendar-standard-stale-dark | state | [PNG](./calendar-standard-stale-dark.png) |
| calendar-standard-partial-dark | state | [PNG](./calendar-standard-partial-dark.png) |
| calendar-standard-setup-dark | state | [PNG](./calendar-standard-setup-dark.png) |
| calendar-standard-error-dark | state | [PNG](./calendar-standard-error-dark.png) |
| calendar-compact-stack-ready-dark | stack-face | [PNG](./calendar-compact-stack-ready-dark.png) |
| calendar-standard-stack-ready-dark | stack-face | [PNG](./calendar-standard-stack-ready-dark.png) |
| calendar-full-stack-ready-dark | stack-face | [PNG](./calendar-full-stack-ready-dark.png) |
| weather-docked-ready-dark | docked | [PNG](./weather-docked-ready-dark.png) |
| weather-compact-ready-dark | free | [PNG](./weather-compact-ready-dark.png) |
| weather-standard-ready-dark | free | [PNG](./weather-standard-ready-dark.png) |
| weather-full-ready-dark | free | [PNG](./weather-full-ready-dark.png) |
| weather-standard-ready-light | theme | [PNG](./weather-standard-ready-light.png) |
| weather-standard-ready-pink | theme | [PNG](./weather-standard-ready-pink.png) |
| weather-standard-loading-dark | state | [PNG](./weather-standard-loading-dark.png) |
| weather-standard-empty-dark | state | [PNG](./weather-standard-empty-dark.png) |
| weather-standard-stale-dark | state | [PNG](./weather-standard-stale-dark.png) |
| weather-standard-partial-dark | state | [PNG](./weather-standard-partial-dark.png) |
| weather-standard-setup-dark | state | [PNG](./weather-standard-setup-dark.png) |
| weather-standard-error-dark | state | [PNG](./weather-standard-error-dark.png) |
| weather-compact-stack-ready-dark | stack-face | [PNG](./weather-compact-stack-ready-dark.png) |
| weather-standard-stack-ready-dark | stack-face | [PNG](./weather-standard-stack-ready-dark.png) |
| weather-full-stack-ready-dark | stack-face | [PNG](./weather-full-stack-ready-dark.png) |
| sun-docked-ready-dark | docked | [PNG](./sun-docked-ready-dark.png) |
| sun-compact-ready-dark | free | [PNG](./sun-compact-ready-dark.png) |
| sun-standard-ready-dark | free | [PNG](./sun-standard-ready-dark.png) |
| sun-standard-ready-light | theme | [PNG](./sun-standard-ready-light.png) |
| sun-standard-ready-pink | theme | [PNG](./sun-standard-ready-pink.png) |
| sun-compact-stack-ready-dark | stack-face | [PNG](./sun-compact-stack-ready-dark.png) |
| sun-standard-stack-ready-dark | stack-face | [PNG](./sun-standard-stack-ready-dark.png) |
| moon-docked-ready-dark | docked | [PNG](./moon-docked-ready-dark.png) |
| moon-compact-ready-dark | free | [PNG](./moon-compact-ready-dark.png) |
| moon-compact-ready-light | theme | [PNG](./moon-compact-ready-light.png) |
| moon-compact-ready-pink | theme | [PNG](./moon-compact-ready-pink.png) |
| moon-compact-stack-ready-dark | stack-face | [PNG](./moon-compact-stack-ready-dark.png) |
| onThisDay-docked-ready-dark | docked | [PNG](./on-this-day-docked-ready-dark.png) |
| onThisDay-compact-ready-dark | free | [PNG](./on-this-day-compact-ready-dark.png) |
| onThisDay-standard-ready-dark | free | [PNG](./on-this-day-standard-ready-dark.png) |
| onThisDay-full-ready-dark | free | [PNG](./on-this-day-full-ready-dark.png) |
| onThisDay-standard-ready-light | theme | [PNG](./on-this-day-standard-ready-light.png) |
| onThisDay-standard-ready-pink | theme | [PNG](./on-this-day-standard-ready-pink.png) |
| onThisDay-standard-loading-dark | state | [PNG](./on-this-day-standard-loading-dark.png) |
| onThisDay-standard-empty-dark | state | [PNG](./on-this-day-standard-empty-dark.png) |
| onThisDay-standard-stale-dark | state | [PNG](./on-this-day-standard-stale-dark.png) |
| onThisDay-standard-partial-dark | state | [PNG](./on-this-day-standard-partial-dark.png) |
| onThisDay-standard-error-dark | state | [PNG](./on-this-day-standard-error-dark.png) |
| onThisDay-compact-stack-ready-dark | stack-face | [PNG](./on-this-day-compact-stack-ready-dark.png) |
| onThisDay-standard-stack-ready-dark | stack-face | [PNG](./on-this-day-standard-stack-ready-dark.png) |
| onThisDay-full-stack-ready-dark | stack-face | [PNG](./on-this-day-full-stack-ready-dark.png) |
| auroraKp-docked-ready-dark | docked | [PNG](./aurora-kp-docked-ready-dark.png) |
| auroraKp-compact-ready-dark | free | [PNG](./aurora-kp-compact-ready-dark.png) |
| auroraKp-standard-ready-dark | free | [PNG](./aurora-kp-standard-ready-dark.png) |
| auroraKp-full-ready-dark | free | [PNG](./aurora-kp-full-ready-dark.png) |
| auroraKp-standard-ready-light | theme | [PNG](./aurora-kp-standard-ready-light.png) |
| auroraKp-standard-ready-pink | theme | [PNG](./aurora-kp-standard-ready-pink.png) |
| auroraKp-standard-loading-dark | state | [PNG](./aurora-kp-standard-loading-dark.png) |
| auroraKp-standard-empty-dark | state | [PNG](./aurora-kp-standard-empty-dark.png) |
| auroraKp-standard-stale-dark | state | [PNG](./aurora-kp-standard-stale-dark.png) |
| auroraKp-standard-partial-dark | state | [PNG](./aurora-kp-standard-partial-dark.png) |
| auroraKp-standard-error-dark | state | [PNG](./aurora-kp-standard-error-dark.png) |
| auroraKp-compact-stack-ready-dark | stack-face | [PNG](./aurora-kp-compact-stack-ready-dark.png) |
| auroraKp-standard-stack-ready-dark | stack-face | [PNG](./aurora-kp-standard-stack-ready-dark.png) |
| auroraKp-full-stack-ready-dark | stack-face | [PNG](./aurora-kp-full-stack-ready-dark.png) |
| github-docked-ready-dark | docked | [PNG](./github-docked-ready-dark.png) |
| github-compact-ready-dark | free | [PNG](./github-compact-ready-dark.png) |
| github-standard-ready-dark | free | [PNG](./github-standard-ready-dark.png) |
| github-full-ready-dark | free | [PNG](./github-full-ready-dark.png) |
| github-standard-ready-light | theme | [PNG](./github-standard-ready-light.png) |
| github-standard-ready-pink | theme | [PNG](./github-standard-ready-pink.png) |
| github-standard-loading-dark | state | [PNG](./github-standard-loading-dark.png) |
| github-standard-empty-dark | state | [PNG](./github-standard-empty-dark.png) |
| github-standard-stale-dark | state | [PNG](./github-standard-stale-dark.png) |
| github-standard-partial-dark | state | [PNG](./github-standard-partial-dark.png) |
| github-standard-setup-dark | state | [PNG](./github-standard-setup-dark.png) |
| github-standard-error-dark | state | [PNG](./github-standard-error-dark.png) |
| github-compact-stack-ready-dark | stack-face | [PNG](./github-compact-stack-ready-dark.png) |
| github-standard-stack-ready-dark | stack-face | [PNG](./github-standard-stack-ready-dark.png) |
| github-full-stack-ready-dark | stack-face | [PNG](./github-full-stack-ready-dark.png) |
| gitlab-docked-ready-dark | docked | [PNG](./gitlab-docked-ready-dark.png) |
| gitlab-compact-ready-dark | free | [PNG](./gitlab-compact-ready-dark.png) |
| gitlab-standard-ready-dark | free | [PNG](./gitlab-standard-ready-dark.png) |
| gitlab-full-ready-dark | free | [PNG](./gitlab-full-ready-dark.png) |
| gitlab-standard-ready-light | theme | [PNG](./gitlab-standard-ready-light.png) |
| gitlab-standard-ready-pink | theme | [PNG](./gitlab-standard-ready-pink.png) |
| gitlab-standard-loading-dark | state | [PNG](./gitlab-standard-loading-dark.png) |
| gitlab-standard-empty-dark | state | [PNG](./gitlab-standard-empty-dark.png) |
| gitlab-standard-stale-dark | state | [PNG](./gitlab-standard-stale-dark.png) |
| gitlab-standard-partial-dark | state | [PNG](./gitlab-standard-partial-dark.png) |
| gitlab-standard-setup-dark | state | [PNG](./gitlab-standard-setup-dark.png) |
| gitlab-standard-error-dark | state | [PNG](./gitlab-standard-error-dark.png) |
| gitlab-compact-stack-ready-dark | stack-face | [PNG](./gitlab-compact-stack-ready-dark.png) |
| gitlab-standard-stack-ready-dark | stack-face | [PNG](./gitlab-standard-stack-ready-dark.png) |
| gitlab-full-stack-ready-dark | stack-face | [PNG](./gitlab-full-stack-ready-dark.png) |
| jira-docked-ready-dark | docked | [PNG](./jira-docked-ready-dark.png) |
| jira-compact-ready-dark | free | [PNG](./jira-compact-ready-dark.png) |
| jira-standard-ready-dark | free | [PNG](./jira-standard-ready-dark.png) |
| jira-full-ready-dark | free | [PNG](./jira-full-ready-dark.png) |
| jira-standard-ready-light | theme | [PNG](./jira-standard-ready-light.png) |
| jira-standard-ready-pink | theme | [PNG](./jira-standard-ready-pink.png) |
| jira-standard-loading-dark | state | [PNG](./jira-standard-loading-dark.png) |
| jira-standard-empty-dark | state | [PNG](./jira-standard-empty-dark.png) |
| jira-standard-stale-dark | state | [PNG](./jira-standard-stale-dark.png) |
| jira-standard-partial-dark | state | [PNG](./jira-standard-partial-dark.png) |
| jira-standard-setup-dark | state | [PNG](./jira-standard-setup-dark.png) |
| jira-standard-error-dark | state | [PNG](./jira-standard-error-dark.png) |
| jira-compact-stack-ready-dark | stack-face | [PNG](./jira-compact-stack-ready-dark.png) |
| jira-standard-stack-ready-dark | stack-face | [PNG](./jira-standard-stack-ready-dark.png) |
| jira-full-stack-ready-dark | stack-face | [PNG](./jira-full-stack-ready-dark.png) |
| vercel-docked-ready-dark | docked | [PNG](./vercel-docked-ready-dark.png) |
| vercel-compact-ready-dark | free | [PNG](./vercel-compact-ready-dark.png) |
| vercel-standard-ready-dark | free | [PNG](./vercel-standard-ready-dark.png) |
| vercel-full-ready-dark | free | [PNG](./vercel-full-ready-dark.png) |
| vercel-standard-ready-light | theme | [PNG](./vercel-standard-ready-light.png) |
| vercel-standard-ready-pink | theme | [PNG](./vercel-standard-ready-pink.png) |
| vercel-standard-loading-dark | state | [PNG](./vercel-standard-loading-dark.png) |
| vercel-standard-empty-dark | state | [PNG](./vercel-standard-empty-dark.png) |
| vercel-standard-stale-dark | state | [PNG](./vercel-standard-stale-dark.png) |
| vercel-standard-partial-dark | state | [PNG](./vercel-standard-partial-dark.png) |
| vercel-standard-setup-dark | state | [PNG](./vercel-standard-setup-dark.png) |
| vercel-standard-error-dark | state | [PNG](./vercel-standard-error-dark.png) |
| vercel-compact-stack-ready-dark | stack-face | [PNG](./vercel-compact-stack-ready-dark.png) |
| vercel-standard-stack-ready-dark | stack-face | [PNG](./vercel-standard-stack-ready-dark.png) |
| vercel-full-stack-ready-dark | stack-face | [PNG](./vercel-full-stack-ready-dark.png) |
| status-docked-ready-dark | docked | [PNG](./status-docked-ready-dark.png) |
| status-compact-ready-dark | free | [PNG](./status-compact-ready-dark.png) |
| status-standard-ready-dark | free | [PNG](./status-standard-ready-dark.png) |
| status-standard-ready-light | theme | [PNG](./status-standard-ready-light.png) |
| status-standard-ready-pink | theme | [PNG](./status-standard-ready-pink.png) |
| status-standard-loading-dark | state | [PNG](./status-standard-loading-dark.png) |
| status-standard-empty-dark | state | [PNG](./status-standard-empty-dark.png) |
| status-standard-stale-dark | state | [PNG](./status-standard-stale-dark.png) |
| status-standard-partial-dark | state | [PNG](./status-standard-partial-dark.png) |
| status-standard-error-dark | state | [PNG](./status-standard-error-dark.png) |
| status-compact-stack-ready-dark | stack-face | [PNG](./status-compact-stack-ready-dark.png) |
| status-standard-stack-ready-dark | stack-face | [PNG](./status-standard-stack-ready-dark.png) |
| linear-docked-ready-dark | docked | [PNG](./linear-docked-ready-dark.png) |
| linear-compact-ready-dark | free | [PNG](./linear-compact-ready-dark.png) |
| linear-standard-ready-dark | free | [PNG](./linear-standard-ready-dark.png) |
| linear-full-ready-dark | free | [PNG](./linear-full-ready-dark.png) |
| linear-standard-ready-light | theme | [PNG](./linear-standard-ready-light.png) |
| linear-standard-ready-pink | theme | [PNG](./linear-standard-ready-pink.png) |
| linear-standard-loading-dark | state | [PNG](./linear-standard-loading-dark.png) |
| linear-standard-empty-dark | state | [PNG](./linear-standard-empty-dark.png) |
| linear-standard-stale-dark | state | [PNG](./linear-standard-stale-dark.png) |
| linear-standard-partial-dark | state | [PNG](./linear-standard-partial-dark.png) |
| linear-standard-setup-dark | state | [PNG](./linear-standard-setup-dark.png) |
| linear-standard-error-dark | state | [PNG](./linear-standard-error-dark.png) |
| linear-compact-stack-ready-dark | stack-face | [PNG](./linear-compact-stack-ready-dark.png) |
| linear-standard-stack-ready-dark | stack-face | [PNG](./linear-standard-stack-ready-dark.png) |
| linear-full-stack-ready-dark | stack-face | [PNG](./linear-full-stack-ready-dark.png) |
| sentry-docked-ready-dark | docked | [PNG](./sentry-docked-ready-dark.png) |
| sentry-compact-ready-dark | free | [PNG](./sentry-compact-ready-dark.png) |
| sentry-standard-ready-dark | free | [PNG](./sentry-standard-ready-dark.png) |
| sentry-full-ready-dark | free | [PNG](./sentry-full-ready-dark.png) |
| sentry-standard-ready-light | theme | [PNG](./sentry-standard-ready-light.png) |
| sentry-standard-ready-pink | theme | [PNG](./sentry-standard-ready-pink.png) |
| sentry-standard-loading-dark | state | [PNG](./sentry-standard-loading-dark.png) |
| sentry-standard-empty-dark | state | [PNG](./sentry-standard-empty-dark.png) |
| sentry-standard-stale-dark | state | [PNG](./sentry-standard-stale-dark.png) |
| sentry-standard-partial-dark | state | [PNG](./sentry-standard-partial-dark.png) |
| sentry-standard-setup-dark | state | [PNG](./sentry-standard-setup-dark.png) |
| sentry-standard-error-dark | state | [PNG](./sentry-standard-error-dark.png) |
| sentry-compact-stack-ready-dark | stack-face | [PNG](./sentry-compact-stack-ready-dark.png) |
| sentry-standard-stack-ready-dark | stack-face | [PNG](./sentry-standard-stack-ready-dark.png) |
| sentry-full-stack-ready-dark | stack-face | [PNG](./sentry-full-stack-ready-dark.png) |
| todoist-docked-ready-dark | docked | [PNG](./todoist-docked-ready-dark.png) |
| todoist-compact-ready-dark | free | [PNG](./todoist-compact-ready-dark.png) |
| todoist-standard-ready-dark | free | [PNG](./todoist-standard-ready-dark.png) |
| todoist-full-ready-dark | free | [PNG](./todoist-full-ready-dark.png) |
| todoist-standard-ready-light | theme | [PNG](./todoist-standard-ready-light.png) |
| todoist-standard-ready-pink | theme | [PNG](./todoist-standard-ready-pink.png) |
| todoist-standard-loading-dark | state | [PNG](./todoist-standard-loading-dark.png) |
| todoist-standard-empty-dark | state | [PNG](./todoist-standard-empty-dark.png) |
| todoist-standard-stale-dark | state | [PNG](./todoist-standard-stale-dark.png) |
| todoist-standard-partial-dark | state | [PNG](./todoist-standard-partial-dark.png) |
| todoist-standard-setup-dark | state | [PNG](./todoist-standard-setup-dark.png) |
| todoist-standard-error-dark | state | [PNG](./todoist-standard-error-dark.png) |
| todoist-compact-stack-ready-dark | stack-face | [PNG](./todoist-compact-stack-ready-dark.png) |
| todoist-standard-stack-ready-dark | stack-face | [PNG](./todoist-standard-stack-ready-dark.png) |
| todoist-full-stack-ready-dark | stack-face | [PNG](./todoist-full-stack-ready-dark.png) |
| readingList-docked-ready-dark | docked | [PNG](./reading-list-docked-ready-dark.png) |
| readingList-compact-ready-dark | free | [PNG](./reading-list-compact-ready-dark.png) |
| readingList-standard-ready-dark | free | [PNG](./reading-list-standard-ready-dark.png) |
| readingList-full-ready-dark | free | [PNG](./reading-list-full-ready-dark.png) |
| readingList-standard-ready-light | theme | [PNG](./reading-list-standard-ready-light.png) |
| readingList-standard-ready-pink | theme | [PNG](./reading-list-standard-ready-pink.png) |
| readingList-standard-loading-dark | state | [PNG](./reading-list-standard-loading-dark.png) |
| readingList-standard-empty-dark | state | [PNG](./reading-list-standard-empty-dark.png) |
| readingList-standard-stale-dark | state | [PNG](./reading-list-standard-stale-dark.png) |
| readingList-standard-partial-dark | state | [PNG](./reading-list-standard-partial-dark.png) |
| readingList-standard-permission-dark | state | [PNG](./reading-list-standard-permission-dark.png) |
| readingList-standard-error-dark | state | [PNG](./reading-list-standard-error-dark.png) |
| readingList-compact-stack-ready-dark | stack-face | [PNG](./reading-list-compact-stack-ready-dark.png) |
| readingList-standard-stack-ready-dark | stack-face | [PNG](./reading-list-standard-stack-ready-dark.png) |
| readingList-full-stack-ready-dark | stack-face | [PNG](./reading-list-full-stack-ready-dark.png) |
| recentlyClosed-docked-ready-dark | docked | [PNG](./recently-closed-docked-ready-dark.png) |
| recentlyClosed-compact-ready-dark | free | [PNG](./recently-closed-compact-ready-dark.png) |
| recentlyClosed-standard-ready-dark | free | [PNG](./recently-closed-standard-ready-dark.png) |
| recentlyClosed-full-ready-dark | free | [PNG](./recently-closed-full-ready-dark.png) |
| recentlyClosed-standard-ready-light | theme | [PNG](./recently-closed-standard-ready-light.png) |
| recentlyClosed-standard-ready-pink | theme | [PNG](./recently-closed-standard-ready-pink.png) |
| recentlyClosed-standard-loading-dark | state | [PNG](./recently-closed-standard-loading-dark.png) |
| recentlyClosed-standard-empty-dark | state | [PNG](./recently-closed-standard-empty-dark.png) |
| recentlyClosed-standard-partial-dark | state | [PNG](./recently-closed-standard-partial-dark.png) |
| recentlyClosed-standard-permission-dark | state | [PNG](./recently-closed-standard-permission-dark.png) |
| recentlyClosed-standard-error-dark | state | [PNG](./recently-closed-standard-error-dark.png) |
| recentlyClosed-compact-stack-ready-dark | stack-face | [PNG](./recently-closed-compact-stack-ready-dark.png) |
| recentlyClosed-standard-stack-ready-dark | stack-face | [PNG](./recently-closed-standard-stack-ready-dark.png) |
| recentlyClosed-full-stack-ready-dark | stack-face | [PNG](./recently-closed-full-stack-ready-dark.png) |
| downloads-docked-ready-dark | docked | [PNG](./downloads-docked-ready-dark.png) |
| downloads-compact-ready-dark | free | [PNG](./downloads-compact-ready-dark.png) |
| downloads-standard-ready-dark | free | [PNG](./downloads-standard-ready-dark.png) |
| downloads-full-ready-dark | free | [PNG](./downloads-full-ready-dark.png) |
| downloads-standard-ready-light | theme | [PNG](./downloads-standard-ready-light.png) |
| downloads-standard-ready-pink | theme | [PNG](./downloads-standard-ready-pink.png) |
| downloads-standard-loading-dark | state | [PNG](./downloads-standard-loading-dark.png) |
| downloads-standard-empty-dark | state | [PNG](./downloads-standard-empty-dark.png) |
| downloads-standard-partial-dark | state | [PNG](./downloads-standard-partial-dark.png) |
| downloads-standard-permission-dark | state | [PNG](./downloads-standard-permission-dark.png) |
| downloads-standard-error-dark | state | [PNG](./downloads-standard-error-dark.png) |
| downloads-compact-stack-ready-dark | stack-face | [PNG](./downloads-compact-stack-ready-dark.png) |
| downloads-standard-stack-ready-dark | stack-face | [PNG](./downloads-standard-stack-ready-dark.png) |
| downloads-full-stack-ready-dark | stack-face | [PNG](./downloads-full-stack-ready-dark.png) |
| tabGroups-docked-ready-dark | docked | [PNG](./tab-groups-docked-ready-dark.png) |
| tabGroups-compact-ready-dark | free | [PNG](./tab-groups-compact-ready-dark.png) |
| tabGroups-standard-ready-dark | free | [PNG](./tab-groups-standard-ready-dark.png) |
| tabGroups-full-ready-dark | free | [PNG](./tab-groups-full-ready-dark.png) |
| tabGroups-standard-ready-light | theme | [PNG](./tab-groups-standard-ready-light.png) |
| tabGroups-standard-ready-pink | theme | [PNG](./tab-groups-standard-ready-pink.png) |
| tabGroups-standard-loading-dark | state | [PNG](./tab-groups-standard-loading-dark.png) |
| tabGroups-standard-empty-dark | state | [PNG](./tab-groups-standard-empty-dark.png) |
| tabGroups-standard-partial-dark | state | [PNG](./tab-groups-standard-partial-dark.png) |
| tabGroups-standard-permission-dark | state | [PNG](./tab-groups-standard-permission-dark.png) |
| tabGroups-standard-error-dark | state | [PNG](./tab-groups-standard-error-dark.png) |
| tabGroups-compact-stack-ready-dark | stack-face | [PNG](./tab-groups-compact-stack-ready-dark.png) |
| tabGroups-standard-stack-ready-dark | stack-face | [PNG](./tab-groups-standard-stack-ready-dark.png) |
| tabGroups-full-stack-ready-dark | stack-face | [PNG](./tab-groups-full-stack-ready-dark.png) |
| homeassistant-docked-ready-dark | docked | [PNG](./homeassistant-docked-ready-dark.png) |
| homeassistant-compact-ready-dark | free | [PNG](./homeassistant-compact-ready-dark.png) |
| homeassistant-standard-ready-dark | free | [PNG](./homeassistant-standard-ready-dark.png) |
| homeassistant-full-ready-dark | free | [PNG](./homeassistant-full-ready-dark.png) |
| homeassistant-standard-ready-light | theme | [PNG](./homeassistant-standard-ready-light.png) |
| homeassistant-standard-ready-pink | theme | [PNG](./homeassistant-standard-ready-pink.png) |
| homeassistant-standard-loading-dark | state | [PNG](./homeassistant-standard-loading-dark.png) |
| homeassistant-standard-empty-dark | state | [PNG](./homeassistant-standard-empty-dark.png) |
| homeassistant-standard-stale-dark | state | [PNG](./homeassistant-standard-stale-dark.png) |
| homeassistant-standard-partial-dark | state | [PNG](./homeassistant-standard-partial-dark.png) |
| homeassistant-standard-setup-dark | state | [PNG](./homeassistant-standard-setup-dark.png) |
| homeassistant-standard-error-dark | state | [PNG](./homeassistant-standard-error-dark.png) |
| homeassistant-compact-stack-ready-dark | stack-face | [PNG](./homeassistant-compact-stack-ready-dark.png) |
| homeassistant-standard-stack-ready-dark | stack-face | [PNG](./homeassistant-standard-stack-ready-dark.png) |
| homeassistant-full-stack-ready-dark | stack-face | [PNG](./homeassistant-full-stack-ready-dark.png) |
| rss-docked-ready-dark | docked | [PNG](./rss-docked-ready-dark.png) |
| rss-compact-ready-dark | free | [PNG](./rss-compact-ready-dark.png) |
| rss-standard-ready-dark | free | [PNG](./rss-standard-ready-dark.png) |
| rss-full-ready-dark | free | [PNG](./rss-full-ready-dark.png) |
| rss-standard-ready-light | theme | [PNG](./rss-standard-ready-light.png) |
| rss-standard-ready-pink | theme | [PNG](./rss-standard-ready-pink.png) |
| rss-standard-loading-dark | state | [PNG](./rss-standard-loading-dark.png) |
| rss-standard-empty-dark | state | [PNG](./rss-standard-empty-dark.png) |
| rss-standard-stale-dark | state | [PNG](./rss-standard-stale-dark.png) |
| rss-standard-partial-dark | state | [PNG](./rss-standard-partial-dark.png) |
| rss-standard-setup-dark | state | [PNG](./rss-standard-setup-dark.png) |
| rss-standard-error-dark | state | [PNG](./rss-standard-error-dark.png) |
| rss-compact-stack-ready-dark | stack-face | [PNG](./rss-compact-stack-ready-dark.png) |
| rss-standard-stack-ready-dark | stack-face | [PNG](./rss-standard-stack-ready-dark.png) |
| rss-full-stack-ready-dark | stack-face | [PNG](./rss-full-stack-ready-dark.png) |
| crypto-docked-ready-dark | docked | [PNG](./crypto-docked-ready-dark.png) |
| crypto-compact-ready-dark | free | [PNG](./crypto-compact-ready-dark.png) |
| crypto-standard-ready-dark | free | [PNG](./crypto-standard-ready-dark.png) |
| crypto-standard-ready-light | theme | [PNG](./crypto-standard-ready-light.png) |
| crypto-standard-ready-pink | theme | [PNG](./crypto-standard-ready-pink.png) |
| crypto-standard-loading-dark | state | [PNG](./crypto-standard-loading-dark.png) |
| crypto-standard-empty-dark | state | [PNG](./crypto-standard-empty-dark.png) |
| crypto-standard-stale-dark | state | [PNG](./crypto-standard-stale-dark.png) |
| crypto-standard-partial-dark | state | [PNG](./crypto-standard-partial-dark.png) |
| crypto-standard-setup-dark | state | [PNG](./crypto-standard-setup-dark.png) |
| crypto-standard-error-dark | state | [PNG](./crypto-standard-error-dark.png) |
| crypto-compact-stack-ready-dark | stack-face | [PNG](./crypto-compact-stack-ready-dark.png) |
| crypto-standard-stack-ready-dark | stack-face | [PNG](./crypto-standard-stack-ready-dark.png) |
| mixed-stack-weather-on-this-day | mixed-stack | [PNG](./mixed-stack-weather-on-this-day.png) |
| mixed-stack-github-calendar | mixed-stack | [PNG](./mixed-stack-github-calendar.png) |
| mixed-stack-tasks-notes | mixed-stack | [PNG](./mixed-stack-tasks-notes.png) |
| mixed-stack-clock-quote | mixed-stack | [PNG](./mixed-stack-clock-quote.png) |
| mixed-stack-jira-sentry | mixed-stack | [PNG](./mixed-stack-jira-sentry.png) |
| comparison-calendar-standard-agenda-month | comparison | [PNG](./comparison-calendar-standard-agenda-month.png) |
| migration-calendar-consolidation | migration | [PNG](./migration-calendar-consolidation.png) |
| interaction-clock-compact-hover | interaction | [PNG](./interaction-clock-compact-hover.png) |
| interaction-clock-compact-focus | interaction | [PNG](./interaction-clock-compact-focus.png) |
| interaction-clock-compact-plain-click | interaction | [PNG](./interaction-clock-compact-plain-click.png) |
| interaction-clock-compact-swipe | interaction | [PNG](./interaction-clock-compact-swipe.png) |

## Mixed stacks

- weather + onThisDay at standard
- github + calendar at full
- tasks + notes at compact
- clock + quote at standard
- jira + sentry at full

## Unresolved owner decisions

None
