// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { memoryDriver } from '../../../lib/storage/driver'
import { createStorage } from '../../../lib/storage/index'
import { layoutRevision } from '../../../lib/layout/calendarConsolidation'
import type { NamedLayout } from '../../../lib/layout/namedLayouts'
import CalendarConsolidationPrompt from './CalendarConsolidationPrompt'

const layout: NamedLayout = {
  id: 'work',
  name: 'Work',
  widgets: {
    ics: { kind: 'free', anchor: 'top-left', offsetX: 1, offsetY: 2, tier: 'compact', layer: 1 },
    monthCal: { kind: 'free', anchor: 'top-right', offsetX: 3, offsetY: 4, tier: 'standard', layer: 2 },
    publicHolidays: { kind: 'docked', dock: 'bottom', order: 0 },
  },
}

async function setup() {
  const driver = memoryDriver()
  const storage = createStorage(driver)
  await storage.init()
  await storage.set('layouts', { version: 1, activeLayoutId: 'work', layouts: [layout] })
  const write = vi.spyOn(driver, 'write')
  write.mockClear()
  return { storage, write }
}

describe('CalendarConsolidationPrompt', () => {
  it('Later dismisses with zero writes', async () => {
    const { storage, write } = await setup()
    const onLater = vi.fn()
    render(<CalendarConsolidationPrompt layout={layout} storage={storage} onLater={onLater} onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(onLater).toHaveBeenCalledOnce()
    expect(write).not.toHaveBeenCalled()
  })

  it('requires an explicit placement choice and saves layout plus preference atomically', async () => {
    const { storage, write } = await setup()
    const onSaved = vi.fn()
    render(<CalendarConsolidationPrompt layout={layout} storage={storage} onLater={vi.fn()} onSaved={onSaved} />)
    const save = screen.getByRole('button', { name: 'Save unified Calendar' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Month/ }))
    fireEvent.click(save)
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce()
      expect(save.textContent).toBe('Save unified Calendar')
    })
    expect(write).toHaveBeenCalledTimes(1)
    expect(Object.keys(write.mock.calls[0]?.[0] ?? {}).sort()).toEqual(['calendarPreferences', 'layouts'])
    expect((await storage.get('layouts'))?.layouts[0]?.widgets.ics).toMatchObject(layout.widgets.monthCal!)
  })

  it('shows a stale-layout rejection instead of overwriting', async () => {
    const { storage, write } = await setup()
    render(<CalendarConsolidationPrompt layout={{ ...layout, name: 'Stale prompt' }} storage={storage} onLater={vi.fn()} onSaved={vi.fn()} />)
    expect(layoutRevision(layout)).not.toBe(layoutRevision({ ...layout, name: 'Stale prompt' }))
    fireEvent.click(screen.getByRole('radio', { name: /Calendar feed/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save unified Calendar' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toMatch(/changed in another tab/i)
    expect(write).not.toHaveBeenCalled()
  })
})
