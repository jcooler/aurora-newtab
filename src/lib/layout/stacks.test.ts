import { describe, expect, it } from 'vitest'
import type { NamedLayout } from './namedLayouts'
import {
  createOrAppendStack,
  detachStackMember,
  hideStack,
  removeStackMember,
  reorderStackMember,
  setStackFacing,
  stepStackFacing,
} from './stacks'

function layout(): NamedLayout {
  return {
    id: 'a',
    name: 'Desktop',
    widgets: {
      clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -20, tier: 'full', layer: 0 },
      weather: { kind: 'free', anchor: 'top-right', offsetX: -7, offsetY: 13, tier: 'standard', layer: 2 },
      quote: { kind: 'free', anchor: 'bottom', offsetX: 0, offsetY: -12, tier: 'compact', layer: 3 },
      monthCal: { kind: 'free', anchor: 'left', offsetX: 9, offsetY: 0, tier: 'standard', layer: 1 },
    },
  }
}

function stacked(): NamedLayout {
  const created = createOrAppendStack(layout(), 'clock', { kind: 'widget', id: 'weather' }, 'stack-day')
  return createOrAppendStack(created, 'quote', { kind: 'stack', id: 'stack-day' }, 'unused')
}

describe('pure widget stack operations', () => {
  it('creates a target-owned stack with the dragged widget second and facing', () => {
    const input = layout()
    const before = structuredClone(input)

    const next = createOrAppendStack(input, 'clock', { kind: 'widget', id: 'weather' }, 'stack-day')

    expect(next.stacks).toEqual([{
      id: 'stack-day',
      members: ['weather', 'clock'],
      facing: 'clock',
      anchor: 'top-right',
      offsetX: -7,
      offsetY: 13,
      tier: 'standard',
      layer: 2,
    }])
    expect(next.widgets.clock).toBeUndefined()
    expect(next.widgets.weather).toBeUndefined()
    expect(next.widgets.quote).toEqual(input.widgets.quote)
    expect(input).toEqual(before)
  })

  it('appends to an existing stack without changing its geometry and faces the appended member', () => {
    const two = createOrAppendStack(layout(), 'clock', { kind: 'widget', id: 'weather' }, 'stack-day')
    const next = createOrAppendStack(two, 'quote', { kind: 'stack', id: 'stack-day' }, 'ignored')

    expect(next.stacks).toEqual([expect.objectContaining({
      id: 'stack-day',
      members: ['weather', 'clock', 'quote'],
      facing: 'quote',
      anchor: 'top-right',
      offsetX: -7,
      offsetY: 13,
      tier: 'standard',
      layer: 2,
    })])
    expect(next.widgets.quote).toBeUndefined()
  })

  it('jumps to an explicit member and wraps previous/next without changing membership', () => {
    const input = stacked()
    const weather = setStackFacing(input, 'stack-day', 'weather')
    expect(weather.stacks?.[0].facing).toBe('weather')
    expect(stepStackFacing(weather, 'stack-day', -1).stacks?.[0].facing).toBe('quote')
    expect(stepStackFacing(weather, 'stack-day', 1).stacks?.[0].facing).toBe('clock')
    expect(stepStackFacing(weather, 'missing', 1)).toBe(weather)
    expect(setStackFacing(weather, 'stack-day', 'moon')).toBe(weather)
  })

  it('reorders one member within boundaries while keeping the same facing member', () => {
    const input = stacked()
    const moved = reorderStackMember(input, 'stack-day', 'quote', -1)
    expect(moved.stacks?.[0].members).toEqual(['weather', 'quote', 'clock'])
    expect(moved.stacks?.[0].facing).toBe('quote')
    expect(reorderStackMember(moved, 'stack-day', 'weather', -1)).toBe(moved)
  })

  it('removes one member from a larger stack into a visible centerward free placement', () => {
    const input = stacked()
    const next = removeStackMember(input, 'stack-day', 'clock')
    expect(next.stacks?.[0].members).toEqual(['weather', 'quote'])
    expect(next.stacks?.[0].facing).toBe('quote')
    expect(next.widgets.clock).toEqual({
      kind: 'free',
      anchor: 'top-right',
      offsetX: -11,
      offsetY: 17,
      tier: 'standard',
      layer: 3,
    })
  })

  it('dissolves a two-member stack with the survivor at exact card geometry', () => {
    const input = createOrAppendStack(layout(), 'clock', { kind: 'widget', id: 'weather' }, 'stack-day')
    const next = removeStackMember(input, 'stack-day', 'clock')

    expect(next.stacks).toBeUndefined()
    expect(next.widgets.weather).toEqual({
      kind: 'free', anchor: 'top-right', offsetX: -7, offsetY: 13, tier: 'standard', layer: 2,
    })
    expect(next.widgets.clock).toEqual({
      kind: 'free', anchor: 'top-right', offsetX: -11, offsetY: 17, tier: 'standard', layer: 3,
    })
  })

  it('detaches at the pointer position and dissolves the survivor exactly', () => {
    const input = createOrAppendStack(layout(), 'clock', { kind: 'widget', id: 'weather' }, 'stack-day')
    const next = detachStackMember(input, 'stack-day', 'clock', { xPct: 22, yPct: 78 })

    expect(next.stacks).toBeUndefined()
    expect(next.widgets.weather).toEqual({
      kind: 'free', anchor: 'top-right', offsetX: -7, offsetY: 13, tier: 'standard', layer: 2,
    })
    expect(next.widgets.clock).toEqual({
      kind: 'free', anchor: 'bottom-left', offsetX: 22, offsetY: -22, tier: 'standard', layer: 3,
    })
  })

  it('hides the whole stack by dissolving every member to normal hidden placements', () => {
    const next = hideStack(stacked(), 'stack-day')
    expect(next.stacks).toBeUndefined()
    expect(next.widgets.weather).toEqual({ kind: 'hidden' })
    expect(next.widgets.clock).toEqual({ kind: 'hidden' })
    expect(next.widgets.quote).toEqual({ kind: 'hidden' })
    expect(next.widgets.monthCal).toEqual(layout().widgets.monthCal)
  })
})
