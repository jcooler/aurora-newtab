import type { AdaptiveStageEntry, Span } from '../lib/layout/adaptiveStage'
import type {
  BlockId,
  LayoutProfile,
  Placement,
  Priority,
  WidgetVariant,
  Zone,
} from '../lib/layout/types'
import type { Settings, WidgetToggles } from '../lib/storage/schema'
import type { ConnectorConfig, ConnectorId, GitlabConfig, GithubConfig, JiraConfig, RssConfig, VercelConfig } from '../services/connectors/types'
import type { CanvasSize } from '../lib/layout/canvasTypes'
import type { WidgetTier } from '../lib/layout/namedLayouts'
import { resolveDockedTier } from '../lib/layout/renderLayout'
import { WIDGET_SIZE_CONTRACTS, type SelectedCanvasContent, type WidgetSizeContract } from './widgetSizeContracts'
import { resolveGithubViews } from '../services/connectors/github'
import { DEFAULT_GITLAB_VIEWS } from '../services/connectors/gitlab'
import { DEFAULT_JIRA_VIEWS } from '../services/connectors/jira'
import { DEFAULT_VERCEL_VIEWS } from '../services/connectors/vercel'
import { resolveViews } from '../services/connectors/views'
import { haActionsOf, haEntitiesOf, type HomeAssistantConfig } from '../services/connectors/homeassistant'

export type WidgetAvailability =
  | Readonly<{ kind: 'always' }>
  | Readonly<{ kind: 'widget'; key: keyof WidgetToggles }>
  | Readonly<{ kind: 'connector'; id: ConnectorId }>

export interface WidgetRegistryEntry extends AdaptiveStageEntry {
  label: string
  rendererKey: BlockId
  availability: WidgetAvailability
  canvasSizes: readonly CanvasSize[]
  /** Whether the widget declares a Docked-tier line (named-layouts spec 2.3),
   *  derived from its size contract's `docked` member. */
  supportsDocked: boolean
  contentContract: WidgetSizeContract
  selectedContent?: readonly SelectedCanvasContent[]
  /** Nominal expansion box for expandable widgets (named-layouts spec 2.6):
   *  edit mode shows this as a dashed footprint outline so placement
   *  decisions account for it. Advisory chrome, never geometry authority,
   *  and never a placement restriction. */
  expandedFootprint?: Readonly<{ width: number; height: number }>
}

interface RegistrySource {
  id: BlockId
  label: string
  zone: Zone
  order: number
  priority: Priority
  eligibleZones: readonly Zone[]
  defaultVariant: WidgetVariant
  footprints: Readonly<Partial<Record<WidgetVariant, readonly [number, number]>>>
  availability: WidgetAvailability
  protectedClock?: boolean
  expandedFootprint?: Readonly<{ width: number; height: number }>
}

const always = (): WidgetAvailability => Object.freeze({ kind: 'always' })
const widget = (key: keyof WidgetToggles): WidgetAvailability => Object.freeze({ kind: 'widget', key })
const connector = (id: ConnectorId): WidgetAvailability => Object.freeze({ kind: 'connector', id })

const SOURCES: readonly RegistrySource[] = [
  // expandedFootprint: the Weather details panel's nominal box (22rem wide,
  // its typical clamped height) for the edit-mode dashed outline (spec 2.6).
  { id: 'weather', label: 'Weather', zone: 'day', order: 0, priority: 'automatic', eligibleZones: ['day'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: widget('weather'), expandedFootprint: Object.freeze({ width: 352, height: 430 }) },
  { id: 'ics', label: 'Calendar', zone: 'day', order: 1, priority: 'automatic', eligibleZones: ['day', 'dock'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('ics') },
  { id: 'monthCal', label: 'Month', zone: 'day', order: 2, priority: 'automatic', eligibleZones: ['day', 'dock'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: widget('monthCal') },
  { id: 'sun', label: 'Sun times', zone: 'day', order: 3, priority: 'automatic', eligibleZones: ['day', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 1] }, availability: widget('sun') },
  { id: 'moon', label: 'Moon phase', zone: 'day', order: 4, priority: 'automatic', eligibleZones: ['day', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 1] }, availability: widget('moon') },
  { id: 'quote', label: 'Quote', zone: 'day', order: 5, priority: 'automatic', eligibleZones: ['day', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 1] }, availability: widget('quote') },
  { id: 'clock', label: 'Clock', zone: 'now', order: 0, priority: 'pinned', eligibleZones: ['now'], defaultVariant: 'expanded', footprints: { compact: [2, 2], standard: [2, 2], expanded: [3, 2] }, availability: always(), protectedClock: true },
  { id: 'greeting', label: 'Greeting', zone: 'now', order: 1, priority: 'automatic', eligibleZones: ['now'], defaultVariant: 'standard', footprints: { compact: [2, 1], standard: [2, 1], expanded: [2, 2] }, availability: always() },
  { id: 'worldClocks', label: 'World clocks', zone: 'now', order: 2, priority: 'automatic', eligibleZones: ['now', 'day'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 1], expanded: [2, 2] }, availability: widget('clocks') },
  { id: 'countdown', label: 'Countdown', zone: 'now', order: 3, priority: 'automatic', eligibleZones: ['now', 'day'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 1] }, availability: widget('countdown') },
  { id: 'search', label: 'Search', zone: 'now', order: 4, priority: 'automatic', eligibleZones: ['now'], defaultVariant: 'standard', footprints: { compact: [2, 1], standard: [2, 1] }, availability: widget('search') },
  { id: 'focus', label: 'Focus', zone: 'now', order: 5, priority: 'automatic', eligibleZones: ['now'], defaultVariant: 'standard', footprints: { compact: [2, 1], standard: [2, 1] }, availability: always() },
  { id: 'links', label: 'Links', zone: 'now', order: 6, priority: 'automatic', eligibleZones: ['now', 'dock'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 1] }, availability: widget('links') },
  { id: 'habits', label: 'Habits', zone: 'now', order: 7, priority: 'automatic', eligibleZones: ['now', 'day', 'dock'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: widget('habits') },
  { id: 'bookmarks', label: 'Bookmarks', zone: 'now', order: 8, priority: 'automatic', eligibleZones: ['now', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 1] }, availability: widget('bookmarks') },
  { id: 'status', label: 'Service status', zone: 'pulse', order: 0, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 1] }, availability: connector('status') },
  { id: 'github', label: 'GitHub', zone: 'pulse', order: 1, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('github') },
  { id: 'gitlab', label: 'GitLab', zone: 'pulse', order: 2, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('gitlab') },
  { id: 'jira', label: 'Jira', zone: 'pulse', order: 3, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('jira') },
  { id: 'vercel', label: 'Deploys', zone: 'pulse', order: 4, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('vercel') },
  { id: 'homeassistant', label: 'Home Assistant', zone: 'pulse', order: 5, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('homeassistant') },
  { id: 'rss', label: 'Headlines', zone: 'pulse', order: 6, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('rss') },
  { id: 'crypto', label: 'Crypto', zone: 'pulse', order: 7, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 1] }, availability: connector('crypto') },
  { id: 'readingList', label: 'Reading List', zone: 'pulse', order: 8, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: widget('readingList') },
  { id: 'recentlyClosed', label: 'Recently Closed', zone: 'pulse', order: 9, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: widget('recentlyClosed') },
  { id: 'downloads', label: 'Downloads', zone: 'pulse', order: 10, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: widget('downloads') },
  { id: 'tabGroups', label: 'Tab Groups', zone: 'pulse', order: 11, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: widget('tabGroups') },
  { id: 'timer', label: 'Timer', zone: 'dock', order: 0, priority: 'dock', eligibleZones: ['dock'], defaultVariant: 'compact', footprints: { compact: [1, 1] }, availability: widget('timer') },
  { id: 'tasks', label: 'Tasks', zone: 'dock', order: 1, priority: 'dock', eligibleZones: ['dock'], defaultVariant: 'compact', footprints: { compact: [1, 1] }, availability: widget('todo') },
  { id: 'notes', label: 'Notes', zone: 'dock', order: 2, priority: 'dock', eligibleZones: ['dock'], defaultVariant: 'compact', footprints: { compact: [1, 1] }, availability: widget('notes') },
  // Appended after every existing identity so adding Work connectors cannot
  // renumber legacy default layers. Their pulse orders are additive too.
  { id: 'linear', label: 'Linear', zone: 'pulse', order: 12, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('linear') },
  { id: 'sentry', label: 'Sentry', zone: 'pulse', order: 13, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('sentry') },
  { id: 'todoist', label: 'Todoist', zone: 'pulse', order: 14, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('todoist') },
  { id: 'onThisDay', label: 'On This Day', zone: 'pulse', order: 15, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('onThisDay') },
  { id: 'publicHolidays', label: 'Public Holidays', zone: 'pulse', order: 16, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('publicHolidays') },
  { id: 'auroraKp', label: 'Aurora & Kp', zone: 'pulse', order: 17, priority: 'automatic', eligibleZones: ['pulse', 'dock'], defaultVariant: 'compact', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: connector('auroraKp') },
] as const

const PROFILE_ORDER: readonly LayoutProfile[] = ['compact', 'standard', 'display', 'ultrawide']
const VARIANT_ORDER: readonly WidgetVariant[] = ['compact', 'standard', 'expanded']

function freezeFootprints(source: RegistrySource['footprints']): WidgetRegistryEntry['footprints'] {
  const footprints: Partial<Record<WidgetVariant, Readonly<Span>>> = {}
  for (const variant of VARIANT_ORDER) {
    const tuple = source[variant]
    if (tuple) footprints[variant] = Object.freeze({ colSpan: tuple[0], rowSpan: tuple[1] })
  }
  return Object.freeze(footprints)
}

function profileVariant(source: RegistrySource, profile: LayoutProfile): WidgetVariant {
  const target = profile === 'compact' ? 'compact' : profile === 'standard' ? source.defaultVariant : 'expanded'
  const allowed = VARIANT_ORDER.filter((variant) => source.footprints[variant] !== undefined)
  if (allowed.includes(target)) return target
  const targetRank = VARIANT_ORDER.indexOf(target)
  return [...allowed].reverse().find((variant) => VARIANT_ORDER.indexOf(variant) <= targetRank) ?? allowed[0]
}

function registryEntry(source: RegistrySource, sourceOrder: number): WidgetRegistryEntry {
  const footprints = freezeFootprints(source.footprints)
  const contentContract = WIDGET_SIZE_CONTRACTS[source.id]
  const canvasSizes = contentContract.sizes
  const defaultPlacements = {} as Record<LayoutProfile, Placement>
  for (const profile of PROFILE_ORDER) {
    const variant = profileVariant(source, profile)
    const span = footprints[variant]!
    defaultPlacements[profile] = Object.freeze({
      zone: source.zone,
      order: source.order,
      colSpan: span.colSpan,
      rowSpan: span.rowSpan,
      variant,
      priority: source.priority,
    })
  }
  return Object.freeze({
    id: source.id,
    label: source.label,
    rendererKey: source.id,
    availability: source.availability,
    sourceOrder,
    canvasSizes,
    supportsDocked: contentContract.docked !== undefined,
    contentContract,
    eligibleZones: Object.freeze([...source.eligibleZones]),
    allowedVariants: Object.freeze(VARIANT_ORDER.filter((variant) => footprints[variant] !== undefined)),
    footprints,
    defaultPlacements: Object.freeze(defaultPlacements),
    ...(source.protectedClock ? { protectedClock: true } : {}),
    ...(source.expandedFootprint ? { expandedFootprint: source.expandedFootprint } : {}),
  })
}

export const WIDGET_REGISTRY: readonly WidgetRegistryEntry[] = Object.freeze(SOURCES.map(registryEntry))

export const WIDGET_REGISTRY_BY_ID: Readonly<Record<BlockId, WidgetRegistryEntry>> = Object.freeze(
  Object.fromEntries(WIDGET_REGISTRY.map((entry) => [entry.id, entry])) as Record<BlockId, WidgetRegistryEntry>,
)

function selectedConnectorContent(id: ConnectorId, config: ConnectorConfig | undefined): readonly SelectedCanvasContent[] {
  const selected = (label: string, minimumSize: CanvasSize): SelectedCanvasContent => ({ label, minimumSize })
  const headlines = (count: number, qualifier: string) => `${count} ${qualifier} configured headline${count === 1 ? '' : 's'}`
  switch (id) {
    case 'github': {
      const views = resolveGithubViews(config as GithubConfig | undefined)
      return [views.commitGraph && selected('Contribution graph', 'standard'), views.pulls && selected('Pull requests', 'standard'), views.issues && selected('Issues', 'standard'), views.notifications && selected('Notifications', 'compact')].filter(Boolean) as SelectedCanvasContent[]
    }
    case 'gitlab': {
      const views = resolveViews(DEFAULT_GITLAB_VIEWS, (config as GitlabConfig | undefined)?.views)
      return [views.activityGraph && selected('Activity graph', 'standard'), views.mergeRequests && selected('Merge requests', 'standard'), views.reviewAsks && selected('Review asks', 'standard'), views.todos && selected('To-dos', 'compact')].filter(Boolean) as SelectedCanvasContent[]
    }
    case 'jira': {
      const views = resolveViews(DEFAULT_JIRA_VIEWS, (config as JiraConfig | undefined)?.views)
      return [
        views.assigned && selected('Assigned', 'standard'),
        views.dueSoon && selected('Due soon', views.assigned ? 'full' : 'standard'),
        views.statusChips && selected('Status counts', 'compact'),
      ].filter(Boolean) as SelectedCanvasContent[]
    }
    case 'vercel': {
      const views = resolveViews(DEFAULT_VERCEL_VIEWS, (config as VercelConfig | undefined)?.views)
      return [views.deployments && selected('Deployments', 'compact'), views.statusSummary && selected('Status summary', 'compact')].filter(Boolean) as SelectedCanvasContent[]
    }
    case 'rss': {
      const shownCount = Math.max(0, Math.floor((config as RssConfig | undefined)?.shownCount ?? 0))
      return [
        selected('Headlines', 'compact'),
        shownCount > 2 && selected(headlines(shownCount - 2, 'additional'), 'standard'),
        shownCount > 6 && selected(headlines(shownCount - 6, 'remaining'), 'full'),
      ].filter(Boolean) as SelectedCanvasContent[]
    }
    case 'crypto': return [selected('Selected coins', 'compact')]
    case 'status': return [selected('Service status', 'compact')]
    case 'homeassistant': {
      const home = config as HomeAssistantConfig | undefined
      return [
        haEntitiesOf(home ?? { enabled: false }).length > 0 && selected('Entity states', 'compact'),
        haActionsOf(home ?? { enabled: false }).length > 0 && selected('Actions', 'standard'),
      ].filter(Boolean) as SelectedCanvasContent[]
    }
    case 'ics': return [selected('Selected calendar view', 'compact')]
    case 'linear': return [selected('Assigned work', 'compact')]
    case 'sentry': return [selected('Unresolved issues', 'compact')]
    case 'todoist': return [selected('Due tasks', 'compact')]
    case 'onThisDay': return [selected('Historical events', 'compact')]
    case 'publicHolidays': return [selected('National holidays', 'compact')]
    case 'auroraKp': return [selected('Geomagnetic forecast', 'compact')]
  }
}

/** The size a docked member renders at (and the inspector reflects): the
 *  user's stored choice, else the widget's docked default — Bookmarks' full
 *  readable bar (spec 2.3 exemption) is its 'standard' form; every other
 *  widget docks as its compact composition. */
export function dockedRenderSize(entry: WidgetRegistryEntry, dockTier?: WidgetTier): CanvasSize {
  return resolveDockedTier(entry.canvasSizes, dockTier, entry.id === 'bookmarks' ? 'standard' : 'compact')
}

/** Whether a widget's STRIP rendering actually changes with the chosen size
 *  (owner-reported 2026-08-18: controls that do nothing are lying UI). Only
 *  Bookmarks today — full readable bar vs the one-letter mark bar; every
 *  other docked widget renders its one dense line regardless of size, so
 *  the inspector must not offer a dead Size control for them. */
export function dockSizeVaries(entry: WidgetRegistryEntry): boolean {
  return entry.id === 'bookmarks'
}

export type WidgetRendererKey = WidgetRegistryEntry['rendererKey']

export function selectActiveWidgetRegistry(
  settings: Settings,
  connectors: Partial<Record<ConnectorId, ConnectorConfig>>,
): WidgetRegistryEntry[] {
  return WIDGET_REGISTRY.flatMap((entry) => {
    const availability = entry.availability
    if (availability.kind === 'always') return [entry]
    if (availability.kind === 'widget') return settings.widgets[availability.key] ? [entry] : []
    const config = connectors[availability.id]
    if (config?.enabled !== true) return []
    return [Object.freeze({ ...entry, selectedContent: Object.freeze([...selectedConnectorContent(availability.id, config)]) })]
  })
}
