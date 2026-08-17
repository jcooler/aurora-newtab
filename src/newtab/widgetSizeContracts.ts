import type { CanvasSize } from '../lib/layout/canvasTypes'
import type { BlockId } from '../lib/layout/types'

export interface WidgetSizeContract {
  sizes: readonly CanvasSize[]
  compact: string
  standard?: string
  full?: string
}

const contract = (sizes: readonly CanvasSize[], compact: string, standard?: string, full?: string): WidgetSizeContract =>
  Object.freeze({ sizes: Object.freeze([...sizes]), compact, standard, full })

/** Canvas sizes are a content promise, not a request to stretch the same card. */
export const WIDGET_SIZE_CONTRACTS: Readonly<Record<BlockId, WidgetSizeContract>> = Object.freeze({
  weather: contract(['compact', 'standard', 'full'], 'Current temperature and condition', 'Forecast context', 'Detailed forecast'),
  ics: contract(['compact', 'standard'], 'Next event', 'Selected calendar view'),
  monthCal: contract(['compact', 'standard'], 'Current week', 'Complete month'),
  sun: contract(['compact', 'standard'], 'Next sun event', 'Sunrise and sunset'), moon: contract(['compact'], 'Current phase'),
  quote: contract(['compact', 'standard'], 'Quote', 'Readable full quote'),
  clock: contract(['compact', 'standard', 'full'], 'Current time', 'Time and date', 'Large, legible time and date'),
  greeting: contract(['compact', 'standard'], 'Greeting', 'More legible greeting'),
  worldClocks: contract(['compact', 'standard', 'full'], 'Primary world clock', 'Selected clocks', 'All selected clocks'),
  countdown: contract(['compact', 'standard'], 'Countdown', 'Countdown detail'), search: contract(['compact', 'standard'], 'Search action', 'More legible search action'),
  focus: contract(['compact', 'standard'], 'Focus action', 'Focus detail'), links: contract(['compact', 'standard'], 'Primary link action', 'Selected quick links'),
  habits: contract(['compact'], 'Habit action'), bookmarks: contract(['compact', 'standard'], 'Bookmark marks', 'Named bookmark bar'),
  status: contract(['compact', 'standard'], 'Service health', 'Service dots and active issues'),
  github: contract(['compact', 'standard', 'full'], 'Selected primary count or graph', 'Selected graph or rows', 'Graph, stats, and all selected row families'),
  gitlab: contract(['compact', 'standard', 'full'], 'Selected primary count or graph', 'Selected graph or rows', 'All selected GitLab sections'),
  jira: contract(['compact', 'standard', 'full'], 'Selected-view count', 'Prioritized issue rows', 'All selected Jira sections'),
  vercel: contract(['compact', 'standard', 'full'], 'Deployment health', 'Selected deployment rows or summary', 'All selected deployment sections'),
  homeassistant: contract(['compact', 'standard', 'full'], 'Selected entity or action', 'Selected entities and actions', 'Complete selected home composition'),
  rss: contract(['compact', 'standard', 'full'], 'Top headline', 'Selected headlines', 'All selected headlines that fit'),
  crypto: contract(['compact', 'standard'], 'Primary coin price', 'Selected coin prices'),
  timer: contract(['compact'], 'Timer action'), tasks: contract(['compact'], 'Tasks action'), notes: contract(['compact'], 'Notes action'),
})

function joinNames(items: readonly string[]): string {
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

/** Returns the truthful inspector explanation when selected content exceeds a size. */
export function contentConflictFor(id: BlockId, size: CanvasSize, selectedContent: readonly string[]): string | null {
  const current = WIDGET_SIZE_CONTRACTS[id]
  const needsStandard = selectedContent.length > 1 && size === 'compact'
  const needsFull = selectedContent.length > 1 && size === 'standard' && current.sizes.includes('full')
  if (!needsStandard && !needsFull) return null
  const larger = needsFull ? 'Full' : current.sizes.includes('full') ? 'Standard or Full' : 'Standard'
  return `${joinNames(selectedContent)} need ${larger}.`
}
