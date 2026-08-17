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
import type { ConnectorConfig, ConnectorId } from '../services/connectors/types'
import type { CanvasSize } from '../lib/layout/canvasTypes'

export type WidgetAvailability =
  | Readonly<{ kind: 'always' }>
  | Readonly<{ kind: 'widget'; key: keyof WidgetToggles }>
  | Readonly<{ kind: 'connector'; id: ConnectorId }>

export interface WidgetRegistryEntry extends AdaptiveStageEntry {
  label: string
  rendererKey: BlockId
  availability: WidgetAvailability
  canvasSizes: readonly CanvasSize[]
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
}

const always = (): WidgetAvailability => Object.freeze({ kind: 'always' })
const widget = (key: keyof WidgetToggles): WidgetAvailability => Object.freeze({ kind: 'widget', key })
const connector = (id: ConnectorId): WidgetAvailability => Object.freeze({ kind: 'connector', id })

const SOURCES: readonly RegistrySource[] = [
  { id: 'weather', label: 'Weather', zone: 'day', order: 0, priority: 'automatic', eligibleZones: ['day'], defaultVariant: 'standard', footprints: { compact: [1, 1], standard: [2, 2], expanded: [3, 2] }, availability: widget('weather') },
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
  { id: 'timer', label: 'Timer', zone: 'dock', order: 0, priority: 'dock', eligibleZones: ['dock'], defaultVariant: 'compact', footprints: { compact: [1, 1] }, availability: widget('timer') },
  { id: 'tasks', label: 'Tasks', zone: 'dock', order: 1, priority: 'dock', eligibleZones: ['dock'], defaultVariant: 'compact', footprints: { compact: [1, 1] }, availability: widget('todo') },
  { id: 'notes', label: 'Notes', zone: 'dock', order: 2, priority: 'dock', eligibleZones: ['dock'], defaultVariant: 'compact', footprints: { compact: [1, 1] }, availability: widget('notes') },
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
  const canvasSizes = Object.freeze(
    VARIANT_ORDER
      .filter((variant) => footprints[variant] !== undefined)
      .map((variant): CanvasSize => variant === 'expanded' ? 'full' : variant),
  )
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
    eligibleZones: Object.freeze([...source.eligibleZones]),
    allowedVariants: Object.freeze(VARIANT_ORDER.filter((variant) => footprints[variant] !== undefined)),
    footprints,
    defaultPlacements: Object.freeze(defaultPlacements),
    ...(source.protectedClock ? { protectedClock: true } : {}),
  })
}

export const WIDGET_REGISTRY: readonly WidgetRegistryEntry[] = Object.freeze(SOURCES.map(registryEntry))

export const WIDGET_REGISTRY_BY_ID: Readonly<Record<BlockId, WidgetRegistryEntry>> = Object.freeze(
  Object.fromEntries(WIDGET_REGISTRY.map((entry) => [entry.id, entry])) as Record<BlockId, WidgetRegistryEntry>,
)

export type WidgetRendererKey = WidgetRegistryEntry['rendererKey']

export function selectActiveWidgetRegistry(
  settings: Settings,
  connectors: Partial<Record<ConnectorId, ConnectorConfig>>,
): WidgetRegistryEntry[] {
  return WIDGET_REGISTRY.filter((entry) => {
    const availability = entry.availability
    if (availability.kind === 'always') return true
    if (availability.kind === 'widget') return settings.widgets[availability.key]
    return connectors[availability.id]?.enabled === true
  })
}
