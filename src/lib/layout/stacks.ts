import {
  ANCHOR_POINTS,
  freePlacementFromPoint,
  type NamedLayout,
  type WidgetStack,
} from './namedLayouts'
import type { BlockId } from './types'

export type StackDropTarget =
  | Readonly<{ kind: 'widget'; id: BlockId }>
  | Readonly<{ kind: 'stack'; id: string }>

function stackIndex(layout: NamedLayout, stackId: string): number {
  return layout.stacks?.findIndex((stack) => stack.id === stackId) ?? -1
}

function withoutStacksProperty(
  layout: NamedLayout,
  widgets: NamedLayout['widgets'],
  stacks: readonly WidgetStack[],
): NamedLayout {
  const { stacks: _removed, ...rest } = layout
  return stacks.length > 0 ? { ...rest, widgets, stacks } : { ...rest, widgets }
}

function replaceStack(
  layout: NamedLayout,
  stackId: string,
  update: (stack: WidgetStack) => WidgetStack | null,
): NamedLayout {
  const index = stackIndex(layout, stackId)
  if (index < 0 || !layout.stacks) return layout
  const current = layout.stacks[index]
  const replacement = update(current)
  if (replacement === current) return layout
  const stacks = replacement
    ? layout.stacks.map((stack, candidate) => candidate === index ? replacement : stack)
    : layout.stacks.filter((_, candidate) => candidate !== index)
  return withoutStacksProperty(layout, { ...layout.widgets }, stacks)
}

export function createOrAppendStack(
  layout: NamedLayout,
  sourceId: BlockId,
  target: StackDropTarget,
  newStackId: string,
): NamedLayout {
  const source = layout.widgets[sourceId]
  if (source?.kind !== 'free') return layout
  if (target.kind === 'widget') {
    if (target.id === sourceId || layout.stacks?.some((stack) => stack.id === newStackId)) return layout
    const targetPlacement = layout.widgets[target.id]
    if (targetPlacement?.kind !== 'free') return layout
    const widgets = { ...layout.widgets }
    delete widgets[sourceId]
    delete widgets[target.id]
    const stack: WidgetStack = {
      id: newStackId,
      members: [target.id, sourceId],
      facing: sourceId,
      anchor: targetPlacement.anchor,
      offsetX: targetPlacement.offsetX,
      offsetY: targetPlacement.offsetY,
      tier: targetPlacement.tier,
      layer: targetPlacement.layer,
    }
    return withoutStacksProperty(layout, widgets, [...(layout.stacks ?? []), stack])
  }

  const index = stackIndex(layout, target.id)
  if (index < 0 || !layout.stacks) return layout
  const widgets = { ...layout.widgets }
  delete widgets[sourceId]
  const stacks = layout.stacks.map((stack, candidate) => candidate === index
    ? { ...stack, members: [...stack.members, sourceId], facing: sourceId }
    : stack)
  return withoutStacksProperty(layout, widgets, stacks)
}

export function setStackFacing(layout: NamedLayout, stackId: string, face: BlockId): NamedLayout {
  return replaceStack(layout, stackId, (stack) => (
    !stack.members.includes(face) || stack.facing === face ? stack : { ...stack, facing: face }
  ))
}

export function stepStackFacing(layout: NamedLayout, stackId: string, direction: -1 | 1): NamedLayout {
  return replaceStack(layout, stackId, (stack) => {
    const current = stack.members.indexOf(stack.facing)
    const next = (current + direction + stack.members.length) % stack.members.length
    return { ...stack, facing: stack.members[next] }
  })
}

export function reorderStackMember(
  layout: NamedLayout,
  stackId: string,
  memberId: BlockId,
  direction: -1 | 1,
): NamedLayout {
  return replaceStack(layout, stackId, (stack) => {
    const from = stack.members.indexOf(memberId)
    const to = from + direction
    if (from < 0 || to < 0 || to >= stack.members.length) return stack
    const members = [...stack.members]
    const [moved] = members.splice(from, 1)
    members.splice(to, 0, moved)
    return { ...stack, members }
  })
}

function detachPlacement(
  stack: WidgetStack,
  point: { xPct: number; yPct: number },
) {
  return freePlacementFromPoint({
    x: point.xPct,
    y: point.yPct,
    tier: stack.tier,
    layer: stack.layer + 1,
  })
}

function removeMemberAt(
  layout: NamedLayout,
  stackId: string,
  memberId: BlockId,
  point: { xPct: number; yPct: number },
): NamedLayout {
  const index = stackIndex(layout, stackId)
  if (index < 0 || !layout.stacks) return layout
  const stack = layout.stacks[index]
  if (!stack.members.includes(memberId)) return layout
  const survivors = stack.members.filter((member) => member !== memberId)
  const widgets = {
    ...layout.widgets,
    [memberId]: detachPlacement(stack, point),
  }
  const stacks = [...layout.stacks]
  if (survivors.length >= 2) {
    stacks[index] = {
      ...stack,
      members: survivors,
      facing: survivors.includes(stack.facing) ? stack.facing : survivors[0],
    }
  } else {
    stacks.splice(index, 1)
    const survivor = survivors[0]
    if (survivor) {
      widgets[survivor] = {
        kind: 'free',
        anchor: stack.anchor,
        offsetX: stack.offsetX,
        offsetY: stack.offsetY,
        tier: stack.tier,
        layer: stack.layer,
      }
    }
  }
  return withoutStacksProperty(layout, widgets, stacks)
}

export function removeStackMember(layout: NamedLayout, stackId: string, memberId: BlockId): NamedLayout {
  const index = stackIndex(layout, stackId)
  if (index < 0 || !layout.stacks) return layout
  const stack = layout.stacks[index]
  const origin = ANCHOR_POINTS[stack.anchor]
  const x = origin.x + stack.offsetX
  const y = origin.y + stack.offsetY
  return removeMemberAt(layout, stackId, memberId, {
    xPct: Math.min(100, Math.max(0, x + (x <= 50 ? 4 : -4))),
    yPct: Math.min(100, Math.max(0, y + (y <= 50 ? 4 : -4))),
  })
}

export function detachStackMember(
  layout: NamedLayout,
  stackId: string,
  memberId: BlockId,
  point: { xPct: number; yPct: number },
): NamedLayout {
  return removeMemberAt(layout, stackId, memberId, point)
}

export function hideStack(layout: NamedLayout, stackId: string): NamedLayout {
  const index = stackIndex(layout, stackId)
  if (index < 0 || !layout.stacks) return layout
  const stack = layout.stacks[index]
  const widgets = { ...layout.widgets }
  for (const member of stack.members) widgets[member] = { kind: 'hidden' }
  const stacks = layout.stacks.filter((_, candidate) => candidate !== index)
  return withoutStacksProperty(layout, widgets, stacks)
}
