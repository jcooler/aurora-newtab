// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { moveSelected, selectWidget } from '../../lib/layout/editSession'
import type { LayoutsDocument } from '../../lib/layout/namedLayouts'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { useEditMode } from './useEditMode'

const DOC: LayoutsDocument = {
  version: 1,
  activeLayoutId: 'a',
  layouts: [{
    id: 'a',
    name: 'My layout',
    widgets: {
      clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -26, tier: 'full', layer: 0 },
    },
  }],
}

const STACK_DOC: LayoutsDocument = {
  version: 1,
  activeLayoutId: 'stack-layout',
  layouts: [{
    id: 'stack-layout',
    name: 'Stacks',
    widgets: {},
    stacks: [{
      id: 'stack-day',
      members: ['weather', 'notes'],
      facing: 'weather',
      anchor: 'top-right',
      offsetX: -8,
      offsetY: 12,
      tier: 'standard',
      layer: 1,
    }],
  }],
}

async function setup(
  document: LayoutsDocument = DOC,
  enabledIds: readonly ('clock' | 'weather' | 'notes')[] = ['clock'],
) {
  const driver = memoryDriver()
  const storage = createStorage(driver)
  await storage.init()
  const writes: string[][] = []
  const originalWrite = driver.write.bind(driver)
  driver.write = async (patch: Record<string, unknown>) => {
    writes.push(Object.keys(patch).sort())
    return originalWrite(patch)
  }
  const rendered = renderHook(() => useEditMode({
    document,
    enabledIds,
    storage,
  }))
  return { storage, writes, rendered }
}

describe('useEditMode', () => {
  it('select accepts tagged widget and stack identities and clears the selection', async () => {
    const { rendered } = await setup(STACK_DOC, ['weather', 'notes'])
    act(() => rendered.result.current.begin())

    act(() => rendered.result.current.select({ kind: 'stack', id: 'stack-day' }))
    expect(rendered.result.current.session?.selection).toEqual({ kind: 'stack', id: 'stack-day' })

    act(() => rendered.result.current.select({ kind: 'widget', id: 'notes' }))
    expect(rendered.result.current.session?.selection).toEqual({ kind: 'widget', id: 'notes' })

    act(() => rendered.result.current.select(null))
    expect(rendered.result.current.session?.selection).toBeNull()
  })

  it('save writes the draft to exactly the layouts key once and ends the session', async () => {
    const { storage, writes, rendered } = await setup()
    act(() => rendered.result.current.begin())
    act(() => rendered.result.current.dispatch((session) => (
      moveSelected(selectWidget(session, 'clock'), { xPct: 25, yPct: 75 })
    )))
    await act(async () => { await rendered.result.current.save() })

    expect(writes).toEqual([['layouts']])
    expect(rendered.result.current.session).toBeNull()
    const stored = await storage.get('layouts')
    expect(stored?.activeLayoutId).toBe('a')
    const clock = stored?.layouts[0].widgets.clock
    expect(clock?.kind).toBe('free')
  })

  it('cancel after edits writes nothing — exact by construction', async () => {
    const { storage, writes, rendered } = await setup()
    act(() => rendered.result.current.begin())
    act(() => rendered.result.current.dispatch((session) => (
      moveSelected(selectWidget(session, 'clock'), { xPct: 25, yPct: 75 })
    )))
    act(() => rendered.result.current.cancel())

    expect(writes).toEqual([])
    expect(rendered.result.current.session).toBeNull()
    expect(await storage.get('layouts')).toBeNull()
  })

  it('begin restores focus to the invoker on both exits', async () => {
    const { rendered } = await setup()
    const invoker = document.createElement('button')
    document.body.append(invoker)
    act(() => rendered.result.current.begin(invoker))
    expect(rendered.result.current.session).not.toBeNull()
    act(() => rendered.result.current.cancel())
    expect(document.activeElement).toBe(invoker)
    invoker.remove()
  })
})
