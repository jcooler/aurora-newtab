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
const PARTIAL_RESOURCE_STATES = ['loading', 'ready', 'empty', 'stale', 'partial', 'hard-error'] as const
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
): WidgetPresentationContract {
  return Object.freeze({
    presentationClass,
    sizes: Object.freeze([...sizes]),
    stackSizes: Object.freeze([...sizes]),
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

/** Canvas sizes are a content promise, not a request to stretch the same card. */
export const WIDGET_PRESENTATION_CONTRACTS: Readonly<Record<BlockId, WidgetPresentationContract>> = Object.freeze({
  weather: contract('framed', ['compact', 'standard', 'full'], WEATHER_STATES, 'Current temperature and condition', 'Forecast context', 'Detailed forecast', 'Temperature · location · condition', {
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
  ics: contract('framed', ['compact', 'standard'], RESOURCE_STATES, 'Next event', 'Selected calendar view', undefined, 'Next event'),
  // Batch-2 owner review: the compact Month ("takes up way too much space,
  // just remove it") is gone — the complete month is Month's only tier.
  monthCal: contract('framed', ['standard'], RESOURCE_STATES, undefined, 'Complete month'),
  sun: contract('framed', ['compact', 'standard'], RESOURCE_STATES, 'Next sun event', 'Sunrise and sunset', undefined, 'Next sun event'),
  moon: contract('framed', ['compact'], RESOURCE_STATES, 'Current phase', undefined, undefined, 'Current phase'),
  quote: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Quote', 'Readable full quote'),
  clock: contract('intrinsic', ['compact', 'standard', 'full'], READY_STATES, 'Current time', 'Time and date', 'Large, legible time and date', 'Time · date'),
  greeting: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Greeting', 'More legible greeting'),
  worldClocks: contract('intrinsic', ['compact', 'standard', 'full'], READY_STATES, 'Primary world clock', 'Selected clocks', 'All selected clocks', 'Primary world clock'),
  countdown: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Countdown', 'Countdown detail', undefined, 'Next countdown'),
  search: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Search action', 'More legible search action'),
  focus: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Focus action', 'Focus detail', undefined, 'Focus text and completion'),
  links: contract('intrinsic', ['compact', 'standard'], READY_STATES, 'Primary link action', 'Selected quick links'),
  habits: contract('framed', ['compact'], READY_STATES, 'Habit action', undefined, undefined, 'Habits done today'),
  bookmarks: contract('bar', ['compact', 'standard'], READY_STATES, 'Bookmark marks', 'Named bookmark bar', undefined, 'Full readable bookmark bar'),
  status: contract('framed', ['compact', 'standard'], PARTIAL_RESOURCE_STATES, 'Service health', 'Service dots and active issues', undefined, 'Service health'),
  github: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Selected primary count or graph', 'Selected graph or rows', 'Graph, stats, and all selected row families', 'Selected activity counts'),
  gitlab: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Selected primary count or graph', 'Selected graph or rows', 'All selected GitLab sections', 'Selected activity counts'),
  jira: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Selected-view count', 'Prioritized issue rows', 'All selected Jira sections', 'Selected issue counts'),
  vercel: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Deployment health', 'Selected deployment rows or summary', 'All selected deployment sections', 'Deployment health'),
  homeassistant: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Selected entity or action', 'Selected entities and actions', 'Complete selected home composition', 'Selected entity state'),
  rss: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Top headline', 'Selected headlines', 'All selected headlines that fit', 'Top headline'),
  crypto: contract('framed', ['compact', 'standard'], PARTIAL_RESOURCE_STATES, 'Primary coin price', 'Selected coin prices', undefined, 'Primary coin price'),
  readingList: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Unread count and newest title', 'Unread reading queue', 'Unread and recently read pages', 'Unread count and newest title'),
  recentlyClosed: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Latest closed type and age', 'Recently closed session types', 'All restorable session types by kind', 'Closed count and latest type'),
  downloads: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Active count and newest filename', 'Active and recent downloads', 'All recent download states', 'Active count and newest filename'),
  tabGroups: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Group count and first group', 'Open browser workspaces', 'All groups by window', 'Group count and first group'),
  timer: contract('framed', ['compact'], READY_STATES, 'Timer action', undefined, undefined, 'Timer state'),
  tasks: contract('framed', ['compact'], READY_STATES, 'Tasks action', undefined, undefined, 'Tasks action'),
  notes: contract('framed', ['compact'], READY_STATES, 'Notes action', undefined, undefined, 'Notes action'),
  linear: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Assigned and due counts', 'Prioritized assigned work', 'All assigned work that fits', 'Assigned and due counts'),
  sentry: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Unresolved count and top issue', 'Named unresolved issues', 'All unresolved issues that fit', 'Unresolved count and top issue'),
  todoist: contract('framed', ['compact', 'standard', 'full'], PARTIAL_RESOURCE_STATES, 'Due and overdue counts', 'Due task sections', 'All due tasks that fit', 'Due and overdue counts'),
  onThisDay: contract('framed', ['compact', 'standard', 'full'], RESOURCE_STATES, 'One historical event', 'Three historical events', 'Events, births, and deaths', 'Year and event', {
    compact: {
      purpose: 'One historical event for the local date',
      essential: ['title', 'local date', 'event year', 'event summary'],
      signature: ['historical event'],
      supporting: ['provider attribution'],
      narrowSafety: ['tighten spacing', 'clamp event summary'],
      overflow: { kind: 'provider', label: 'More on Wikipedia' },
    },
    standard: {
      purpose: 'Three historical events for the local date',
      essential: ['title', 'local date', 'event year', 'event summary'],
      signature: ['historical event list'],
      supporting: ['provider attribution'],
      narrowSafety: ['tighten spacing', 'clamp event summaries'],
      overflow: { kind: 'provider', label: 'More on Wikipedia' },
    },
    full: {
      purpose: 'Historical events, births, and deaths for the local date',
      essential: ['title', 'local date', 'event year', 'event summary'],
      signature: ['historical event list'],
      supporting: ['births', 'deaths', 'provider attribution'],
      narrowSafety: ['tighten spacing', 'clamp event summaries', 'clamp birth and death summaries'],
      overflow: { kind: 'provider', label: 'More on Wikipedia' },
    },
  }),
  publicHolidays: contract('framed', ['compact', 'standard', 'full'], RESOURCE_STATES, 'Next national holiday', 'Next three national holidays', 'Current and next-year national holidays', 'Next holiday and date'),
  auroraKp: contract('framed', ['compact', 'standard', 'full'], RESOURCE_STATES, 'Current Kp and next peak', 'Current Kp and next four intervals', 'Bounded three-day Kp forecast', 'Current Kp and next peak'),
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
