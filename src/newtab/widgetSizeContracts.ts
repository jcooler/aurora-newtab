import type { CanvasSize } from '../lib/layout/canvasTypes'
import type { BlockId } from '../lib/layout/types'

export interface WidgetSizeContract {
  sizes: readonly CanvasSize[]
  compact: string
  standard?: string
  full?: string
  /** The Docked tier's one-line content contract (named-layouts spec 2.3:
   *  one dense text-first line, middle dots separating facts). Present only
   *  for widgets that support the Docked tier; owner-gated per batch. */
  docked?: string
}

export interface SelectedCanvasContent {
  label: string
  minimumSize: CanvasSize
}

const contract = (sizes: readonly CanvasSize[], compact: string, standard?: string, full?: string, docked?: string): WidgetSizeContract =>
  Object.freeze({ sizes: Object.freeze([...sizes]), compact, standard, full, docked })

/** Canvas sizes are a content promise, not a request to stretch the same card. */
export const WIDGET_SIZE_CONTRACTS: Readonly<Record<BlockId, WidgetSizeContract>> = Object.freeze({
  weather: contract(['compact', 'standard', 'full'], 'Current temperature and condition', 'Forecast context', 'Detailed forecast', 'Temperature · location · condition'),
  ics: contract(['compact', 'standard'], 'Next event', 'Selected calendar view'),
  monthCal: contract(['compact', 'standard'], 'Current week', 'Complete month'),
  sun: contract(['compact', 'standard'], 'Next sun event', 'Sunrise and sunset'), moon: contract(['compact'], 'Current phase'),
  quote: contract(['compact', 'standard'], 'Quote', 'Readable full quote'),
  clock: contract(['compact', 'standard', 'full'], 'Current time', 'Time and date', 'Large, legible time and date', 'Time · date'),
  greeting: contract(['compact', 'standard'], 'Greeting', 'More legible greeting'),
  worldClocks: contract(['compact', 'standard', 'full'], 'Primary world clock', 'Selected clocks', 'All selected clocks'),
  countdown: contract(['compact', 'standard'], 'Countdown', 'Countdown detail'), search: contract(['compact', 'standard'], 'Search action', 'More legible search action'),
  focus: contract(['compact', 'standard'], 'Focus action', 'Focus detail', undefined, 'Focus text and completion'), links: contract(['compact', 'standard'], 'Primary link action', 'Selected quick links'),
  habits: contract(['compact'], 'Habit action'), bookmarks: contract(['compact', 'standard'], 'Bookmark marks', 'Named bookmark bar', undefined, 'Full readable bookmark bar'),
  status: contract(['compact', 'standard'], 'Service health', 'Service dots and active issues'),
  github: contract(['compact', 'standard', 'full'], 'Selected primary count or graph', 'Selected graph or rows', 'Graph, stats, and all selected row families'),
  gitlab: contract(['compact', 'standard', 'full'], 'Selected primary count or graph', 'Selected graph or rows', 'All selected GitLab sections'),
  jira: contract(['compact', 'standard', 'full'], 'Selected-view count', 'Prioritized issue rows', 'All selected Jira sections'),
  vercel: contract(['compact', 'standard', 'full'], 'Deployment health', 'Selected deployment rows or summary', 'All selected deployment sections'),
  homeassistant: contract(['compact', 'standard', 'full'], 'Selected entity or action', 'Selected entities and actions', 'Complete selected home composition'),
  rss: contract(['compact', 'standard', 'full'], 'Top headline', 'Selected headlines', 'All selected headlines that fit'),
  crypto: contract(['compact', 'standard'], 'Primary coin price', 'Selected coin prices'),
  timer: contract(['compact'], 'Timer action', undefined, undefined, 'Timer state'), tasks: contract(['compact'], 'Tasks action', undefined, undefined, 'Tasks action'), notes: contract(['compact'], 'Notes action', undefined, undefined, 'Notes action'),
})

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
