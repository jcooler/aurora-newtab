import type {
  BlockId,
  LayoutProfile,
  LayoutV2,
  Placement,
  Priority,
  WidgetVariant,
  Zone,
} from '../../lib/layout/types'
import type { WidgetRegistryEntry } from '../widgetRegistry'

export type ProfileOverrides = Partial<Record<BlockId, Placement>>

export interface ProfileDraft {
  overrides: ProfileOverrides
  history: readonly ProfileOverrides[]
}

export type ArrangeEdit =
  | Readonly<{ kind: 'set-zone'; id: BlockId; zone: Zone }>
  | Readonly<{ kind: 'move-order'; id: BlockId; delta: -1 | 1 }>
  | Readonly<{ kind: 'set-variant'; id: BlockId; variant: WidgetVariant }>
  | Readonly<{ kind: 'set-priority'; id: BlockId; priority: Priority }>
  | Readonly<{ kind: 'resize'; id: BlockId; colSpan?: number; rowSpan?: number }>
  | Readonly<{ kind: 'set-locked'; id: BlockId; locked: boolean }>

function clonePlacement(placement: Placement): Placement {
  return placement.locked === undefined ? { ...placement } : { ...placement, locked: placement.locked }
}

export function cloneProfileOverrides(overrides: ProfileOverrides | undefined): ProfileOverrides {
  const result: ProfileOverrides = {}
  if (!overrides) return result
  for (const [id, placement] of Object.entries(overrides) as [BlockId, Placement][]) {
    result[id] = clonePlacement(placement)
  }
  return result
}

function samePlacement(a: Placement | undefined, b: Placement | undefined): boolean {
  if (!a || !b) return a === b
  return a.zone === b.zone && a.order === b.order && a.colSpan === b.colSpan &&
    a.rowSpan === b.rowSpan && a.variant === b.variant && a.priority === b.priority &&
    a.locked === b.locked
}

function sameOverrides(a: ProfileOverrides, b: ProfileOverrides): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)] as BlockId[])
  for (const id of ids) if (!samePlacement(a[id], b[id])) return false
  return true
}

export function createProfileDraft(layout: LayoutV2, profile: LayoutProfile): ProfileDraft {
  return { overrides: cloneProfileOverrides(layout.profiles[profile]), history: [] }
}

export function effectiveEditablePlacement(
  profile: LayoutProfile,
  entry: WidgetRegistryEntry,
  overrides: ProfileOverrides,
): Placement {
  return clonePlacement(overrides[entry.id] ?? entry.defaultPlacements[profile])
}

function commitDraft(state: ProfileDraft, next: ProfileOverrides): ProfileDraft {
  if (sameOverrides(state.overrides, next)) return state
  return {
    overrides: cloneProfileOverrides(next),
    history: [...state.history, cloneProfileOverrides(state.overrides)],
  }
}

function nextOrder(
  profile: LayoutProfile,
  zone: Zone,
  entries: readonly WidgetRegistryEntry[],
  overrides: ProfileOverrides,
  exclude?: BlockId,
): number {
  return entries.reduce((maximum, entry) => {
    if (entry.id === exclude) return maximum
    const placement = effectiveEditablePlacement(profile, entry, overrides)
    return placement.zone === zone ? Math.max(maximum, placement.order) : maximum
  }, -1) + 1
}

function validSpan(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0
}

export function applyArrangeEdit(
  state: ProfileDraft,
  profile: LayoutProfile,
  entries: readonly WidgetRegistryEntry[],
  edit: ArrangeEdit,
): ProfileDraft {
  const entry = entries.find((candidate) => candidate.id === edit.id)
  if (!entry) return state
  const current = effectiveEditablePlacement(profile, entry, state.overrides)
  if (current.locked && !(edit.kind === 'set-locked' && edit.locked === false)) return state

  const next = cloneProfileOverrides(state.overrides)
  if (edit.kind === 'move-order') {
    const rows = entries
      .map((candidate) => ({
        entry: candidate,
        placement: effectiveEditablePlacement(profile, candidate, state.overrides),
      }))
      .filter((row) => row.placement.zone === current.zone)
      .sort((a, b) => a.placement.order - b.placement.order || (a.entry.id < b.entry.id ? -1 : 1))
    const index = rows.findIndex((row) => row.entry.id === edit.id)
    const target = rows[index + edit.delta]
    if (index < 0 || !target) return state
    next[edit.id] = { ...current, order: target.placement.order }
    next[target.entry.id] = { ...target.placement, order: current.order }
    return commitDraft(state, next)
  }

  let updated = current
  switch (edit.kind) {
    case 'set-zone':
      if (!entry.eligibleZones.includes(edit.zone) || edit.zone === current.zone) return state
      updated = { ...current, zone: edit.zone, order: nextOrder(profile, edit.zone, entries, state.overrides, edit.id) }
      break
    case 'set-variant': {
      if (!entry.allowedVariants.includes(edit.variant) || edit.variant === current.variant) return state
      const footprint = entry.footprints[edit.variant]
      if (!footprint) return state
      updated = { ...current, variant: edit.variant, colSpan: footprint.colSpan, rowSpan: footprint.rowSpan }
      break
    }
    case 'set-priority':
      if (edit.priority === current.priority) return state
      if (edit.priority === 'dock') {
        if (!entry.eligibleZones.includes('dock')) return state
        updated = {
          ...current,
          priority: 'dock',
          zone: 'dock',
          order: nextOrder(profile, 'dock', entries, state.overrides, edit.id),
        }
      } else updated = { ...current, priority: edit.priority }
      break
    case 'resize':
      if (edit.colSpan !== undefined && !validSpan(edit.colSpan)) return state
      if (edit.rowSpan !== undefined && !validSpan(edit.rowSpan)) return state
      updated = {
        ...current,
        ...(edit.colSpan === undefined ? {} : { colSpan: edit.colSpan }),
        ...(edit.rowSpan === undefined ? {} : { rowSpan: edit.rowSpan }),
      }
      break
    case 'set-locked':
      if (edit.locked === current.locked) return state
      updated = { ...current, locked: edit.locked }
      break
  }
  next[edit.id] = updated
  return commitDraft(state, next)
}

export function undoArrangeEdit(state: ProfileDraft): ProfileDraft {
  const previous = state.history.at(-1)
  if (!previous) return state
  return {
    overrides: cloneProfileOverrides(previous),
    history: state.history.slice(0, -1).map(cloneProfileOverrides),
  }
}

export function resetProfileDraft(state: ProfileDraft): ProfileDraft {
  return commitDraft(state, {})
}

export function copyProfileDraft(
  state: ProfileDraft,
  layout: LayoutV2,
  sourceProfile: LayoutProfile,
  entries: readonly WidgetRegistryEntry[],
): ProfileDraft {
  const source = layout.profiles[sourceProfile]
  const next: ProfileOverrides = {}
  for (const entry of entries) {
    next[entry.id] = effectiveEditablePlacement(sourceProfile, entry, source ?? {})
  }
  return commitDraft(state, next)
}
