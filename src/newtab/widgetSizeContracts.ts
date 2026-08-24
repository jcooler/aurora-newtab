import type { CanvasSize } from '../lib/layout/canvasTypes'
import type { BlockId } from '../lib/layout/types'

export interface WidgetSizeContract {
  sizes: readonly CanvasSize[]
  /** Optional since the batch-2 owner review removed Month's compact tier —
   *  a widget's smallest tier need not be compact. */
  compact?: string
  standard?: string
  full?: string
  /** The Docked tier's one-line content contract (named-layouts spec 2.3:
   *  one dense text-first line, middle dots separating facts). Present only
   *  for widgets that support the Docked tier; owner-gated per batch. */
  docked?: string
}

export type WidgetPresentationClass = 'framed' | 'intrinsic' | 'bar'
export type WidgetPresentationState =
  | 'loading' | 'ready' | 'empty' | 'stale' | 'partial'
  | 'permission-required' | 'hard-error'

export interface TierCompositionContract {
  purpose: string
  essential: readonly string[]
  signature: readonly string[]
  supporting: readonly string[]
  narrowSafety: readonly string[]
  overflow: Readonly<{ kind: 'none' | 'details' | 'settings' | 'provider'; label?: string }>
}

export interface WidgetPresentationContract extends WidgetSizeContract {
  presentationClass: WidgetPresentationClass
  stackSizes: readonly CanvasSize[]
  states: readonly WidgetPresentationState[]
  tiers: Readonly<Partial<Record<CanvasSize, TierCompositionContract>>>
}

export interface SelectedCanvasContent {
  label: string
  minimumSize: CanvasSize
}

const READY_STATES = ['ready'] as const
const RESOURCE_STATES = ['loading', 'ready', 'empty', 'stale', 'hard-error'] as const
const NON_REJECTING_RESOURCE_STATES = ['loading', 'ready', 'empty', 'stale'] as const
const PARTIAL_RESOURCE_STATES = ['loading', 'ready', 'empty', 'stale', 'partial', 'hard-error'] as const
const PERMISSION_RESOURCE_STATES = ['loading', 'ready', 'empty', 'stale', 'partial', 'permission-required', 'hard-error'] as const
const SETUP_RESOURCE_STATES = ['loading', 'ready', 'empty', 'stale', 'permission-required', 'hard-error'] as const
const WEATHER_STATES = ['loading', 'ready', 'empty', 'stale', 'partial', 'permission-required', 'hard-error'] as const

function freezeTier(tier: TierCompositionContract): TierCompositionContract {
  return Object.freeze({
    ...tier,
    essential: Object.freeze([...tier.essential]),
    signature: Object.freeze([...tier.signature]),
    supporting: Object.freeze([...tier.supporting]),
    narrowSafety: Object.freeze([...tier.narrowSafety]),
    overflow: Object.freeze({ ...tier.overflow }),
  })
}

function contract(
  presentationClass: WidgetPresentationClass,
  sizes: readonly CanvasSize[],
  states: readonly WidgetPresentationState[],
  compact?: string,
  standard?: string,
  full?: string,
  docked?: string,
  tiers: Partial<Record<CanvasSize, TierCompositionContract>> = {},
  stackSizes: readonly CanvasSize[] = sizes,
): WidgetPresentationContract {
  return Object.freeze({
    presentationClass,
    sizes: Object.freeze([...sizes]),
    stackSizes: Object.freeze([...stackSizes]),
    states: Object.freeze([...states]),
    compact,
    standard,
    full,
    docked,
    tiers: Object.freeze(Object.fromEntries(
      Object.entries(tiers).map(([size, tier]) => [size, freezeTier(tier)]),
    )) as Readonly<Partial<Record<CanvasSize, TierCompositionContract>>>,
  })
}

function framedContract(
  sizes: readonly CanvasSize[],
  stackSizes: readonly CanvasSize[],
  states: readonly WidgetPresentationState[],
  compact?: string,
  standard?: string,
  full?: string,
  docked?: string,
  tiers: Partial<Record<CanvasSize, TierCompositionContract>> = {},
): WidgetPresentationContract {
  return contract('framed', sizes, states, compact, standard, full, docked, tiers, stackSizes)
}

function tier(
  purpose: string,
  essential: readonly string[],
  signature: readonly string[],
  supporting: readonly string[],
  narrowSafety: readonly string[],
  overflow: TierCompositionContract['overflow'],
): TierCompositionContract {
  return { purpose, essential, signature, supporting, narrowSafety, overflow }
}

/** Canvas sizes are a content promise, not a request to stretch the same card. */
export const WIDGET_PRESENTATION_CONTRACTS: Readonly<Record<BlockId, WidgetPresentationContract>> = Object.freeze({
  weather: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], WEATHER_STATES, 'Current temperature and condition', 'Forecast context', 'Detailed forecast', 'Temperature · location · condition', {
    compact: {
      purpose: 'Current conditions at a glance',
      essential: ['temperature', 'condition', 'location'],
      signature: ['current conditions'],
      supporting: ['freshness'],
      narrowSafety: ['tighten spacing', 'shorten location', 'truncate condition'],
      overflow: { kind: 'details', label: 'Weather details' },
    },
    standard: {
      purpose: 'Current conditions and forecast context',
      essential: ['temperature', 'condition', 'location'],
      signature: ['forecast trend'],
      supporting: ['feels like', 'wind', 'humidity'],
      narrowSafety: ['tighten spacing', 'shorten location', 'truncate condition'],
      overflow: { kind: 'details', label: 'Weather details' },
    },
    full: {
      purpose: 'Detailed forecast context',
      essential: ['temperature', 'condition', 'location'],
      signature: ['hourly forecast'],
      supporting: ['forecast trend', 'feels like', 'wind', 'humidity'],
      narrowSafety: ['tighten spacing', 'shorten location', 'truncate condition'],
      overflow: { kind: 'details', label: 'Weather details' },
    },
  }),
  ics: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PERMISSION_RESOURCE_STATES, 'Next date items', 'Agenda or complete month', 'Month and agenda together', 'Next relevant date item', {
    compact: tier('Next date items', ['local date', 'next event or holiday', 'time or relative date'], ['agenda lead'], ['one additional date item'], ['tighten spacing', 'clamp titles'], { kind: 'details', label: 'Calendar details' }),
    standard: tier('Agenda or complete month', ['labelled view switch', 'selected view content'], ['agenda list or seven-column grid'], ['calendar identity', 'holiday marker explanation'], ['tighten spacing', 'bound agenda rows', 'keep 42 month cells'], { kind: 'details', label: 'Calendar details' }),
    full: tier('Month and agenda together', ['complete month', 'agenda'], ['two-region date composition'], ['calendar identity', 'holiday names', 'additional rows'], ['tighten spacing', 'bound agenda rows', 'keep 42 month cells'], { kind: 'details', label: 'Calendar details' }),
  }),
  // Batch-2 owner review: the compact Month ("takes up way too much space,
  // just remove it") is gone — the complete month is Month's only tier.
  monthCal: framedContract(['standard'], ['standard'], READY_STATES, undefined, 'Complete month', undefined, undefined, {
    standard: tier('Complete current month', ['month label', 'weekday labels', 'all calendar days'], ['month grid'], ['today marker'], ['tighten cells', 'shorten weekday labels'], { kind: 'none' }),
  }),
  sun: framedContract(['compact', 'standard'], ['compact', 'standard'], READY_STATES, 'Next sun event', 'Sunrise and sunset', undefined, 'Next sun event', {
    compact: tier('Next sun event', ['event name', 'event time'], ['sun event icon'], [], ['tighten spacing', 'shorten event label'], { kind: 'none' }),
    standard: tier('Sunrise and sunset', ['sunrise time', 'sunset time'], ['sun path'], ['day length'], ['tighten spacing', 'shorten supporting copy'], { kind: 'none' }),
  }),
  moon: framedContract(['compact'], ['compact'], READY_STATES, 'Current phase', undefined, undefined, 'Current phase', {
    compact: tier('Current moon phase', ['phase name'], ['moon phase icon'], ['illumination'], ['tighten spacing', 'shorten phase detail'], { kind: 'none' }),
  }),
  quote: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Quote', 'Readable full quote'),
  clock: contract('intrinsic', ['compact', 'standard', 'full'], READY_STATES, 'Current time', 'Time and date', 'Large, legible time and date', 'Time · date'),
  greeting: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Greeting', 'More legible greeting'),
  worldClocks: contract('intrinsic', ['compact', 'standard', 'full'], READY_STATES, 'Primary world clock', 'Selected clocks', 'All selected clocks', 'Primary world clock'),
  countdown: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Countdown', 'Countdown detail', undefined, 'Next countdown'),
  search: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Search action', 'More legible search action'),
  focus: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Focus action', 'Focus detail', undefined, 'Focus text and completion'),
  links: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Primary link action', 'Selected quick links'),
  habits: framedContract(['compact'], ['compact'], READY_STATES, 'Habit action', undefined, undefined, 'Habits done today', {
    compact: tier('Complete today habits', ['habit names', 'completion action'], ['daily completion state'], ['completed count'], ['tighten spacing', 'bound habit rows'], { kind: 'details', label: 'Habits details' }),
  }),
  bookmarks: contract('bar', ['compact', 'standard'], READY_STATES, 'Bookmark marks', 'Named bookmark bar', undefined, 'Full readable bookmark bar'),
  status: contract('intrinsic', ['compact', 'standard'], NON_REJECTING_RESOURCE_STATES, 'Service health', 'Service dots and active issues', undefined, 'Service health', {
    compact: tier('Service health at a glance', ['service names', 'service states'], ['named status dots'], [], ['tighten spacing', 'bound service names'], { kind: 'details', label: 'Service status details' }),
    standard: tier('Service health and active issues', ['service names', 'service states'], ['named status dots'], ['active issue context'], ['tighten spacing', 'bound issue rows'], { kind: 'details', label: 'Service status details' }),
  }, ['compact', 'standard']),
  github: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Selected primary count or graph', 'Selected graph or rows', 'Graph, stats, and all selected row families', 'Selected activity counts', {
    compact: tier('Contribution activity at a glance', ['identity', 'contribution count', 'streak'], ['contribution graph'], [], ['shrink graph cells', 'tighten spacing'], { kind: 'provider', label: 'Open GitHub' }),
    standard: tier('Contribution activity and selected work', ['identity', 'selected counts'], ['contribution graph'], ['pull requests', 'issues', 'notifications'], ['shrink graph cells', 'bound selected rows'], { kind: 'provider', label: 'Open GitHub' }),
    full: tier('Rich GitHub activity', ['identity', 'selected counts'], ['large contribution graph'], ['pull requests', 'issues', 'notifications'], ['shrink graph cells', 'bound selected rows'], { kind: 'provider', label: 'Open GitHub' }),
  }),
  gitlab: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Selected primary count or graph', 'Selected graph or rows', 'All selected GitLab sections', 'Selected activity counts', {
    compact: tier('Contribution activity at a glance', ['identity', 'contribution count', 'streak'], ['contribution graph'], [], ['shrink graph cells', 'tighten spacing'], { kind: 'provider', label: 'Open GitLab' }),
    standard: tier('Contribution activity and selected work', ['identity', 'selected counts'], ['contribution graph'], ['merge requests', 'reviews', 'to-dos'], ['shrink graph cells', 'bound selected rows'], { kind: 'provider', label: 'Open GitLab' }),
    full: tier('Rich GitLab activity', ['identity', 'selected counts'], ['large contribution graph'], ['merge requests', 'reviews', 'to-dos'], ['shrink graph cells', 'bound selected rows'], { kind: 'provider', label: 'Open GitLab' }),
  }),
  jira: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Selected-view count', 'Prioritized issue rows', 'All selected Jira sections', 'Selected issue counts', {
    compact: tier('Selected Jira work count', ['selected view', 'issue count'], ['priority signal'], [], ['tighten spacing', 'shorten selected view'], { kind: 'provider', label: 'Open Jira' }),
    standard: tier('Prioritized Jira work', ['selected view', 'issue keys'], ['priority rows'], ['summary', 'status'], ['tighten spacing', 'bound issue rows'], { kind: 'provider', label: 'Open Jira' }),
    full: tier('All selected Jira sections that fit', ['selected view', 'issue keys'], ['priority rows'], ['summary', 'status', 'assignee'], ['tighten spacing', 'bound section rows'], { kind: 'provider', label: 'Open Jira' }),
  }),
  vercel: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Deployment health', 'Selected deployment rows or summary', 'All selected deployment sections', 'Deployment health', {
    compact: tier('Deployment health', ['health summary', 'deployment count'], ['deployment state'], [], ['tighten spacing', 'shorten project name'], { kind: 'provider', label: 'Open Vercel' }),
    standard: tier('Recent deployment health', ['health summary', 'deployment names'], ['deployment states'], ['project', 'age'], ['tighten spacing', 'bound deployment rows'], { kind: 'provider', label: 'Open Vercel' }),
    full: tier('All selected deployment sections', ['health summary', 'deployment names'], ['deployment states'], ['project', 'age', 'branch'], ['tighten spacing', 'bound deployment sections'], { kind: 'provider', label: 'Open Vercel' }),
  }),
  homeassistant: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Selected entity or action', 'Selected entities and actions', 'Complete selected home composition', 'Selected entity state', {
    compact: tier('Primary home state or action', ['selected name', 'selected state or action'], ['entity state'], [], ['tighten spacing', 'shorten entity name'], { kind: 'settings', label: 'Home Assistant settings' }),
    standard: tier('Selected home entities and actions', ['selected names', 'states or actions'], ['entity states'], ['action controls'], ['tighten spacing', 'bound selected rows'], { kind: 'settings', label: 'Home Assistant settings' }),
    full: tier('Complete selected home composition', ['selected names', 'states or actions'], ['entity states'], ['action controls', 'areas'], ['tighten spacing', 'bound selected sections'], { kind: 'settings', label: 'Home Assistant settings' }),
  }),
  rss: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Top headline', 'Selected headlines', 'All selected headlines that fit', 'Top headline', {
    compact: tier('Top selected headline', ['feed identity', 'headline'], ['headline link'], [], ['tighten spacing', 'clamp headline'], { kind: 'provider', label: 'Open article' }),
    standard: tier('Selected headlines', ['feed identity', 'headline titles'], ['headline links'], ['source', 'age'], ['tighten spacing', 'bound headline rows'], { kind: 'provider', label: 'Open article' }),
    full: tier('All selected headlines that fit', ['feed identity', 'headline titles'], ['headline links'], ['source', 'age', 'summary'], ['tighten spacing', 'bound headline rows'], { kind: 'provider', label: 'Open article' }),
  }),
  crypto: framedContract(['compact', 'standard'], ['compact', 'standard'], PARTIAL_RESOURCE_STATES, 'Primary coin price', 'Selected coin prices', undefined, 'Primary coin price', {
    compact: tier('Primary selected coin', ['symbol', 'price'], ['market movement'], [], ['tighten spacing', 'shorten price'], { kind: 'settings', label: 'Crypto settings' }),
    standard: tier('Selected coin prices', ['symbols', 'prices'], ['market movement'], ['change'], ['tighten spacing', 'bound coin rows'], { kind: 'settings', label: 'Crypto settings' }),
  }),
  readingList: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PERMISSION_RESOURCE_STATES, 'Unread count and newest title', 'Unread reading queue', 'Unread and recently read pages', 'Unread count and newest title', {
    compact: tier('Unread reading count and newest page', ['unread count', 'newest title'], ['reading queue'], [], ['tighten spacing', 'clamp title'], { kind: 'settings', label: 'Reading List settings' }),
    standard: tier('Unread reading queue', ['unread count', 'page titles'], ['reading queue'], ['age'], ['tighten spacing', 'bound page rows'], { kind: 'settings', label: 'Reading List settings' }),
    full: tier('Unread and recently read pages', ['queue counts', 'page titles'], ['reading queue'], ['age', 'read state'], ['tighten spacing', 'bound page sections'], { kind: 'settings', label: 'Reading List settings' }),
  }),
  recentlyClosed: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PERMISSION_RESOURCE_STATES, 'Latest closed type and age', 'Recently closed session types', 'All restorable session types by kind', 'Closed count and latest type', {
    compact: tier('Latest closed session', ['session type', 'age'], ['restore action'], [], ['tighten spacing', 'shorten session label'], { kind: 'settings', label: 'Recently Closed settings' }),
    standard: tier('Recently closed session types', ['session types', 'ages'], ['restore actions'], ['window tab count'], ['tighten spacing', 'bound session rows'], { kind: 'settings', label: 'Recently Closed settings' }),
    full: tier('All restorable sessions by kind', ['session types', 'ages'], ['restore actions'], ['window tab count', 'row position'], ['tighten spacing', 'bound session rows'], { kind: 'settings', label: 'Recently Closed settings' }),
  }),
  downloads: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PERMISSION_RESOURCE_STATES, 'Active count and newest filename', 'Active and recent downloads', 'All recent download states', 'Active count and newest filename', {
    compact: tier('Active downloads and newest file', ['active count', 'filename'], ['download state'], [], ['tighten spacing', 'clamp filename'], { kind: 'settings', label: 'Downloads settings' }),
    standard: tier('Active and recent downloads', ['filenames', 'states'], ['download progress'], ['age'], ['tighten spacing', 'bound download rows'], { kind: 'settings', label: 'Downloads settings' }),
    full: tier('All recent download states', ['filenames', 'states'], ['download progress'], ['age', 'size'], ['tighten spacing', 'bound download rows'], { kind: 'settings', label: 'Downloads settings' }),
  }),
  tabGroups: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PERMISSION_RESOURCE_STATES, 'Group count and first group', 'Open browser workspaces', 'All groups by window', 'Group count and first group', {
    compact: tier('Open group count and first group', ['group count', 'group name'], ['group color'], [], ['tighten spacing', 'clamp group name'], { kind: 'settings', label: 'Tab Groups settings' }),
    standard: tier('Open browser workspaces', ['group names', 'tab counts'], ['group colors'], ['window'], ['tighten spacing', 'bound group rows'], { kind: 'settings', label: 'Tab Groups settings' }),
    full: tier('All groups by window', ['group names', 'tab counts'], ['group colors'], ['window', 'collapsed state'], ['tighten spacing', 'bound group rows'], { kind: 'settings', label: 'Tab Groups settings' }),
  }),
  timer: framedContract(['compact'], ['compact'], READY_STATES, 'Timer action', undefined, undefined, 'Timer state', {
    compact: tier('Current timer and primary action', ['timer state', 'time remaining', 'primary action'], ['countdown'], ['mode'], ['tighten spacing', 'shorten mode label'], { kind: 'details', label: 'Timer details' }),
  }),
  tasks: framedContract(['compact'], ['compact'], READY_STATES, 'Tasks action', undefined, undefined, 'Tasks action', {
    compact: tier('Today tasks and direct action', ['task state', 'open action'], ['next task'], ['remaining count'], ['tighten spacing', 'clamp task title'], { kind: 'details', label: 'Tasks details' }),
  }),
  notes: framedContract(['compact'], ['compact'], READY_STATES, 'Notes action', undefined, undefined, 'Notes action', {
    compact: tier('Current note and direct action', ['note state', 'open action'], ['note preview'], ['updated state'], ['tighten spacing', 'clamp note preview'], { kind: 'details', label: 'Notes details' }),
  }),
  linear: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PERMISSION_RESOURCE_STATES, 'Assigned and due counts', 'Prioritized assigned work', 'All assigned work that fits', 'Assigned and due counts', {
    compact: tier('Assigned and due Linear work', ['assigned count', 'due count'], ['priority signal'], [], ['tighten spacing', 'shorten team name'], { kind: 'provider', label: 'Open Linear' }),
    standard: tier('Prioritized assigned Linear work', ['issue identifiers', 'titles'], ['priority rows'], ['due state'], ['tighten spacing', 'bound issue rows'], { kind: 'provider', label: 'Open Linear' }),
    full: tier('All assigned Linear work that fits', ['issue identifiers', 'titles'], ['priority rows'], ['due state', 'team'], ['tighten spacing', 'bound issue rows'], { kind: 'provider', label: 'Open Linear' }),
  }),
  sentry: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PERMISSION_RESOURCE_STATES, 'Unresolved count and top issue', 'Named unresolved issues', 'All unresolved issues that fit', 'Unresolved count and top issue', {
    compact: tier('Unresolved Sentry count and top issue', ['unresolved count', 'issue title'], ['severity signal'], [], ['tighten spacing', 'clamp issue title'], { kind: 'provider', label: 'Open Sentry' }),
    standard: tier('Named unresolved Sentry issues', ['issue titles', 'event counts'], ['severity rows'], ['last seen'], ['tighten spacing', 'bound issue rows'], { kind: 'provider', label: 'Open Sentry' }),
    full: tier('All unresolved Sentry issues that fit', ['issue titles', 'event counts'], ['severity rows'], ['last seen', 'project'], ['tighten spacing', 'bound issue rows'], { kind: 'provider', label: 'Open Sentry' }),
  }),
  todoist: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], PERMISSION_RESOURCE_STATES, 'Due and overdue counts', 'Due task sections', 'All due tasks that fit', 'Due and overdue counts', {
    compact: tier('Due and overdue Todoist counts', ['due count', 'overdue count'], ['urgency signal'], [], ['tighten spacing', 'shorten project name'], { kind: 'provider', label: 'Open Todoist' }),
    standard: tier('Due Todoist task sections', ['task names', 'due state'], ['completion actions'], ['project'], ['tighten spacing', 'bound task rows'], { kind: 'provider', label: 'Open Todoist' }),
    full: tier('All due Todoist tasks that fit', ['task names', 'due state'], ['completion actions'], ['project', 'priority'], ['tighten spacing', 'bound task rows'], { kind: 'provider', label: 'Open Todoist' }),
  }),
  onThisDay: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], RESOURCE_STATES, 'One historical event', 'Three historical events', 'Events, births, and deaths', 'Year and event', {
    compact: {
      purpose: 'One historical event for the local date',
      essential: ['title', 'local date', 'event year', 'event summary'],
      signature: ['historical event'],
      supporting: ['provider attribution'],
      narrowSafety: ['tighten spacing', 'clamp event summary'],
      overflow: { kind: 'provider', label: 'Read more on Wikipedia' },
    },
    standard: {
      purpose: 'Three historical events for the local date',
      essential: ['title', 'local date', 'event year', 'event summary'],
      signature: ['historical event list'],
      supporting: ['provider attribution'],
      narrowSafety: ['tighten spacing', 'clamp event summaries'],
      overflow: { kind: 'provider', label: 'Read more on Wikipedia' },
    },
    full: {
      purpose: 'Historical events, births, and deaths for the local date',
      essential: ['title', 'local date', 'event year', 'event summary'],
      signature: ['historical event list'],
      supporting: ['births', 'deaths', 'provider attribution'],
      narrowSafety: ['tighten spacing', 'clamp event summaries', 'clamp birth and death summaries'],
      overflow: { kind: 'provider', label: 'Read more on Wikipedia' },
    },
  }),
  publicHolidays: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], SETUP_RESOURCE_STATES, 'Next national holiday', 'Next three national holidays', 'Current and next-year national holidays', 'Next holiday and date', {
    compact: tier('Next national holiday', ['holiday name', 'holiday date'], ['days-until context'], [], ['tighten spacing', 'clamp holiday name'], { kind: 'provider', label: 'Open Nager.Date' }),
    standard: tier('Next three national holidays', ['holiday names', 'holiday dates'], ['days-until context'], ['local names'], ['tighten spacing', 'bound holiday rows'], { kind: 'provider', label: 'Open Nager.Date' }),
    full: tier('Current and next-year national holidays', ['holiday names', 'holiday dates'], ['month groups'], ['local names', 'country'], ['tighten spacing', 'bound holiday groups'], { kind: 'provider', label: 'Open Nager.Date' }),
  }),
  auroraKp: framedContract(['compact', 'standard', 'full'], ['compact', 'standard', 'full'], RESOURCE_STATES, 'Current Kp and next peak', 'Current Kp and next four intervals', 'Bounded three-day Kp forecast', 'Current Kp and next peak', {
    compact: tier('Current Kp and next peak', ['current Kp', 'next peak'], ['activity level'], [], ['tighten spacing', 'shorten activity label'], { kind: 'provider', label: 'Open NOAA Space Weather' }),
    standard: tier('Current Kp and next four intervals', ['current Kp', 'forecast values'], ['forecast trend'], ['peak time'], ['tighten spacing', 'bound forecast rows'], { kind: 'provider', label: 'Open NOAA Space Weather' }),
    full: tier('Bounded three-day Kp forecast', ['current Kp', 'forecast values'], ['day groups'], ['peak time', 'storm scale'], ['tighten spacing', 'bound forecast groups'], { kind: 'provider', label: 'Open NOAA Space Weather' }),
  }),
})

/** Compatibility name for existing content-contract consumers. */
export const WIDGET_SIZE_CONTRACTS = WIDGET_PRESENTATION_CONTRACTS

function joinNames(items: readonly SelectedCanvasContent[]): string {
  const labels = items.map((item) => item.label)
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`
}

/** Returns the truthful inspector explanation when selected content exceeds a size. */
export function contentConflictFor(id: BlockId, size: CanvasSize, selectedContent: readonly SelectedCanvasContent[]): string | null {
  const current = WIDGET_SIZE_CONTRACTS[id]
  const rank: Record<CanvasSize, number> = { compact: 0, standard: 1, full: 2 }
  const hidden = selectedContent.filter((item) => rank[item.minimumSize] > rank[size])
  if (hidden.length === 0) return null
  return (['standard', 'full'] as const)
    .map((minimum) => {
      const items = hidden.filter((item) => item.minimumSize === minimum)
      if (items.length === 0) return null
      const larger = minimum === 'full' ? 'Full' : current.sizes.includes('full') ? 'Standard or Full' : 'Standard'
      const singular = items.length === 1 && !items[0].label.endsWith('s')
      return `${joinNames(items)} ${singular ? 'needs' : 'need'} ${larger}.`
    })
    .filter((message): message is string => message !== null)
    .join(' ')
}
