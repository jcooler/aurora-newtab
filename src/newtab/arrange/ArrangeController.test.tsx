// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import type { LayoutV2 } from '../../lib/layout/types'
import { WIDGET_REGISTRY } from '../widgetRegistry'
import type { ArrangePreview } from './arrangePreview'
import ArrangeController from './ArrangeController'

const ENTRIES = WIDGET_REGISTRY.filter((entry) => ['weather', 'ics', 'monthCal', 'clock', 'habits'].includes(entry.id))

function rect(left: number, top: number): DOMRect {
  return { left, top, width: 180, height: 90, right: left + 180, bottom: top + 90, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

function Fixture({
  layout,
  onPreviewChange,
}: {
  layout: LayoutV2
  onPreviewChange: (preview: ArrangePreview | null) => void
}) {
  const [signal, setSignal] = useState(0)
  return (
    <>
      <button type="button" onClick={() => setSignal((value) => value + 1)}>Open editor</button>
      {ENTRIES.map((entry, index) => <div key={entry.id} data-block-id={entry.id} data-test-index={index}>{entry.label}</div>)}
      <ArrangeController
        profile="standard"
        layout={layout}
        entries={ENTRIES}
        onPreviewChange={onPreviewChange}
        openSignal={signal}
      />
    </>
  )
}

async function setup(seed: LayoutV2 = { version: 2, profiles: {} }) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = Number(this.getAttribute('data-test-index') ?? -1)
    return index >= 0 ? rect(24 + index * 190, 40 + (index % 2) * 110) : rect(0, 0)
  })
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('layout', seed)
  const onPreviewChange = vi.fn<(preview: ArrangePreview | null) => void>()
  render(
    <StorageProvider storage={storage}>
      <Fixture layout={seed} onPreviewChange={onPreviewChange} />
    </StorageProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open editor' }))
  await screen.findByRole('dialog', { name: 'Arrange Standard profile' })
  return { storage, onPreviewChange }
}

function latestPreview(spy: ReturnType<typeof vi.fn>): ArrangePreview | null {
  return spy.mock.calls.at(-1)?.[0] as ArrangePreview | null
}

describe('semantic ArrangeController', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('opens a preview-only active-profile session with logical focus and visible edit targets', async () => {
    const seed: LayoutV2 = { version: 2, profiles: { compact: {
      weather: { zone: 'day', order: 3, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' },
    } } }
    const { storage, onPreviewChange } = await setup(seed)
    const update = vi.spyOn(storage, 'update')

    const weather = await screen.findByRole('button', { name: 'Edit Weather' })
    expect(weather).toBe(document.activeElement)
    expect(latestPreview(onPreviewChange)).toEqual({ profile: 'standard', overrides: {} })
    expect(screen.getByRole('button', { name: 'Move to Day' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Wider' })).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('previews zone, variant, priority, span, lock, keyboard reorder, and Undo without writing', async () => {
    const { storage, onPreviewChange } = await setup()
    const update = vi.spyOn(storage, 'update')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Habits' }))
    const region = screen.getByRole('region', { name: 'Habits placement' })

    fireEvent.click(within(region).getByRole('button', { name: 'Move to Day' }))
    fireEvent.click(within(region).getByRole('button', { name: 'Compact' }))
    fireEvent.click(within(region).getByRole('button', { name: 'Pinned' }))
    fireEvent.click(within(region).getByRole('button', { name: 'Wider' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Habits' }), { key: 'ArrowUp' })
    fireEvent.click(within(region).getByRole('button', { name: 'Lock placement' }))

    expect(latestPreview(onPreviewChange)?.overrides.habits).toMatchObject({
      zone: 'day', variant: 'compact', priority: 'pinned', colSpan: 2, locked: true,
    })
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latestPreview(onPreviewChange)?.overrides.habits?.locked).not.toBe(true)
  })

  it('copies another profile, resets the draft, and restores the latest edit with Undo', async () => {
    const seed: LayoutV2 = { version: 2, profiles: { compact: {
      weather: { zone: 'day', order: 9, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' },
    } } }
    const { onPreviewChange } = await setup(seed)
    fireEvent.click(screen.getByRole('button', { name: 'Copy profile' }))
    expect(latestPreview(onPreviewChange)?.overrides.weather).toEqual(seed.profiles.compact?.weather)
    fireEvent.click(screen.getByRole('button', { name: 'Reset profile' }))
    expect(latestPreview(onPreviewChange)?.overrides).toEqual({})
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latestPreview(onPreviewChange)?.overrides.weather).toEqual(seed.profiles.compact?.weather)
  })

  it('Cancel performs no write and clears the preview exactly', async () => {
    const seed: LayoutV2 = { version: 2, profiles: { standard: {
      weather: { zone: 'day', order: 4, colSpan: 2, rowSpan: 2, variant: 'standard', priority: 'automatic' },
    } }, legacy: { weather: { x: 12, y: 34 } } }
    const { storage, onPreviewChange } = await setup(seed)
    const update = vi.spyOn(storage, 'update')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Weather' }))
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(update).not.toHaveBeenCalled()
    expect(await storage.get('layout')).toEqual(seed)
    expect(latestPreview(onPreviewChange)).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Arrange Standard profile' })).toBeNull()
  })

  it('Save commits only the edited profile and preserves other profiles plus legacy', async () => {
    const seed: LayoutV2 = { version: 2, profiles: {
      compact: { clock: { zone: 'now', order: 0, colSpan: 2, rowSpan: 2, variant: 'compact', priority: 'pinned' } },
      standard: {},
      display: { weather: { zone: 'day', order: 7, colSpan: 3, rowSpan: 2, variant: 'expanded', priority: 'automatic' } },
    }, legacy: { weather: { x: 10, y: 20 } } }
    const { storage, onPreviewChange } = await setup(seed)
    const update = vi.spyOn(storage, 'update')
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(async () => {})

    const saved = await storage.get('layout')
    expect(update).toHaveBeenCalledTimes(1)
    expect(saved.profiles.standard?.weather).toMatchObject({ variant: 'compact', colSpan: 1, rowSpan: 1 })
    expect(saved.profiles.compact).toEqual(seed.profiles.compact)
    expect(saved.profiles.display).toEqual(seed.profiles.display)
    expect(saved.legacy).toEqual(seed.legacy)
    expect(latestPreview(onPreviewChange)).toBeNull()
  })

  it('keeps a rejected Save editable and never exposes the thrown value', async () => {
    const { storage } = await setup()
    vi.spyOn(storage, 'update').mockRejectedValueOnce(new Error('secret-token capability://private'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByRole('alert')

    expect(alert.textContent).toBe('Layout could not be saved. Review your changes and try again.')
    expect(document.body.textContent).not.toContain('secret-token')
    expect(screen.getByRole('dialog', { name: 'Arrange Standard profile' })).toBeTruthy()
  })

  it('does not let Escape turn an in-flight Save into an apparent Cancel', async () => {
    const { storage } = await setup()
    let release!: (value: LayoutV2) => void
    const pending = new Promise<LayoutV2>((resolve) => { release = resolve })
    vi.spyOn(storage, 'update').mockImplementationOnce(() => pending)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled')).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Arrange Standard profile' })).toBeTruthy()
    release({ version: 2, profiles: {} })
    await act(async () => {})
    expect(screen.queryByRole('dialog', { name: 'Arrange Standard profile' })).toBeNull()
  })

  it('Escape cancels the preview without persistence', async () => {
    const { storage, onPreviewChange } = await setup()
    const update = vi.spyOn(storage, 'update')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(update).not.toHaveBeenCalled()
    expect(latestPreview(onPreviewChange)).toBeNull()
  })
})
