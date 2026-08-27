import type { BlockId } from './types'
import type { AuroraStorage } from '../storage/index'
import {
  cleanLayoutsDocument,
  DEFAULT_CALENDAR_LAYOUT_PREFERENCE,
  type CalendarLayoutPreference,
  type CalendarLayoutPreferences,
  type NamedLayout,
  type NamedLayoutPlacement,
  type WidgetStack,
} from './namedLayouts'

export const LEGACY_CALENDAR_IDS = ['ics', 'monthCal', 'publicHolidays'] as const
export type LegacyCalendarId = (typeof LEGACY_CALENDAR_IDS)[number]

export type LegacyCalendarPlacement =
  | { id: LegacyCalendarId; kind: 'standalone'; placement: NamedLayoutPlacement }
  | { id: LegacyCalendarId; kind: 'stack'; stackId: string; index: number; facing: boolean; tier: WidgetStack['tier'] }

const LEGACY_SET: ReadonlySet<BlockId> = new Set(LEGACY_CALENDAR_IDS)

export function layoutRevision(layout: NamedLayout): string {
  const source = JSON.stringify(layout)
  let hash = 2_166_136_261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return `calendar:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function detectLegacyCalendarPlacements(layout: NamedLayout): LegacyCalendarPlacement[] {
  const placements: LegacyCalendarPlacement[] = []
  for (const id of LEGACY_CALENDAR_IDS) {
    const stack = layout.stacks?.find((candidate) => candidate.members.includes(id))
    if (stack) {
      placements.push({
        id,
        kind: 'stack',
        stackId: stack.id,
        index: stack.members.indexOf(id),
        facing: stack.facing === id,
        tier: stack.tier,
      })
      continue
    }
    const placement = layout.widgets[id]
    if (placement && placement.kind !== 'hidden') placements.push({ id, kind: 'standalone', placement })
  }
  return placements
}

function stackPlacement(stack: WidgetStack): NamedLayoutPlacement {
  return {
    kind: 'free',
    anchor: stack.anchor,
    offsetX: stack.offsetX,
    offsetY: stack.offsetY,
    tier: stack.tier,
    layer: stack.layer,
  }
}

export function consolidateCalendarLayout(
  layout: NamedLayout,
  options: { expectedRevision: string; keep: LegacyCalendarId },
): NamedLayout {
  if (layoutRevision(layout) !== options.expectedRevision) {
    throw new Error('This layout changed in another tab. Review it again before saving Calendar.')
  }
  const placements = detectLegacyCalendarPlacements(layout)
  const selected = placements.find((placement) => placement.id === options.keep)
  if (!selected) throw new Error('The selected Calendar placement is no longer available.')

  const widgets = { ...layout.widgets }
  const nextStacks: WidgetStack[] = []
  for (const stack of layout.stacks ?? []) {
    const members: BlockId[] = []
    for (let index = 0; index < stack.members.length; index += 1) {
      const member = stack.members[index]!
      if (!LEGACY_SET.has(member)) {
        members.push(member)
        continue
      }
      if (selected.kind === 'stack' && selected.stackId === stack.id && selected.index === index) {
        if (!members.includes('ics')) members.push('ics')
      }
    }
    if (members.length >= 2) {
      const selectedWasFacing = selected.kind === 'stack'
        && selected.stackId === stack.id
        && stack.facing === options.keep
      nextStacks.push({
        ...stack,
        members,
        facing: selectedWasFacing
          ? 'ics'
          : members.includes(stack.facing) ? stack.facing : members[0]!,
      })
    } else if (members.length === 1) {
      widgets[members[0]!] = stackPlacement(stack)
    }
  }

  if (selected.kind === 'standalone') widgets.ics = { ...selected.placement }
  else if (nextStacks.some((stack) => stack.id === selected.stackId)) delete widgets.ics
  widgets.monthCal = { kind: 'hidden' }
  widgets.publicHolidays = { kind: 'hidden' }

  return {
    ...layout,
    widgets,
    ...(layout.stacks || nextStacks.length > 0 ? { stacks: nextStacks } : {}),
  }
}

export function calendarPreferenceFor(
  preferences: CalendarLayoutPreferences | null | undefined,
  layoutId: string | null | undefined,
): CalendarLayoutPreference {
  if (!layoutId) return { ...DEFAULT_CALENDAR_LAYOUT_PREFERENCE }
  const preference = preferences?.[layoutId]
  return preference
    ? { ...preference }
    : { ...DEFAULT_CALENDAR_LAYOUT_PREFERENCE }
}

export async function updateCalendarLayoutPreference(
  storage: AuroraStorage,
  layoutId: string,
  patch: Partial<CalendarLayoutPreference>,
): Promise<void> {
  if (!layoutId.trim()) throw new Error('Calendar requires a stable layout id.')
  await storage.update('calendarPreferences', (current) => {
    const previous = calendarPreferenceFor(current, layoutId)
    const next: CalendarLayoutPreference = {
      defaultView: patch.defaultView ?? previous.defaultView,
      includePublicHolidays: patch.includePublicHolidays ?? previous.includePublicHolidays,
    }
    if (previous.defaultView === next.defaultView
      && previous.includePublicHolidays === next.includePublicHolidays
      && current[layoutId]) return current
    return { ...current, [layoutId]: next }
  })
}

export async function saveCalendarConsolidation(
  storage: AuroraStorage,
  options: {
    layoutId: string
    expectedRevision: string
    expectedPreference: CalendarLayoutPreference
    keep: LegacyCalendarId
    defaultView: CalendarLayoutPreference['defaultView']
    includePublicHolidays: boolean
  },
): Promise<void> {
  await storage.updateMany(['layouts', 'calendarPreferences'] as const, (current) => {
    if (!current.layouts) throw new Error('This layout changed in another tab. Review it again before saving Calendar.')
    const index = current.layouts.layouts.findIndex((layout) => layout.id === options.layoutId)
    if (index < 0) throw new Error('This layout changed in another tab. Review it again before saving Calendar.')
    const source = current.layouts.layouts[index]!
    const currentPreference = calendarPreferenceFor(current.calendarPreferences, options.layoutId)
    if (currentPreference.defaultView !== options.expectedPreference.defaultView
      || currentPreference.includePublicHolidays !== options.expectedPreference.includePublicHolidays) {
      throw new Error('This Calendar preference changed in another tab. Review it again before saving Calendar.')
    }
    const nextLayout = consolidateCalendarLayout(source, options)
    const layouts = current.layouts.layouts.map((layout, candidateIndex) => (
      candidateIndex === index ? nextLayout : layout
    ))
    return {
      layouts: cleanLayoutsDocument({ ...current.layouts, layouts }),
      calendarPreferences: {
        ...current.calendarPreferences,
        [options.layoutId]: {
          defaultView: options.defaultView,
          includePublicHolidays: options.includePublicHolidays,
        },
      },
    }
  })
}
