// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import type { CalendarLayoutPreference, NamedLayout } from '../../lib/layout/namedLayouts'
import CalendarConsolidationSettings from './CalendarConsolidationSettings'

function layout(name = 'Work'): NamedLayout {
  return {
    id: 'work',
    name,
    widgets: {
      ics: { kind: 'free', anchor: 'left', offsetX: 1, offsetY: 2, tier: 'compact', layer: 1 },
      monthCal: { kind: 'free', anchor: 'right', offsetX: 3, offsetY: 4, tier: 'standard', layer: 2 },
    },
  }
}

async function storageFor(source: NamedLayout, preference: CalendarLayoutPreference) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.setMany({
    layouts: { version: 1, activeLayoutId: source.id, layouts: [source] },
    calendarPreferences: { [source.id]: preference },
  })
  return storage
}

describe('CalendarConsolidationSettings review authority', () => {
  it('starts from the existing layout preference instead of overwriting it with defaults', async () => {
    const source = layout()
    const preference = { defaultView: 'month', includePublicHolidays: false } as const
    const storage = await storageFor(source, preference)
    render(<CalendarConsolidationSettings layout={source} preference={preference} storage={storage} />)

    expect((screen.getByLabelText('Default view') as HTMLSelectElement).value).toBe('month')
    expect((screen.getByRole('checkbox', { name: 'Include public holidays' }) as HTMLInputElement).checked).toBe(false)
  })

  it('clears a reviewed location when the same layout changes in another tab', async () => {
    const source = layout()
    const preference = { defaultView: 'agenda', includePublicHolidays: true } as const
    const storage = await storageFor(source, preference)
    const view = render(
      <CalendarConsolidationSettings layout={source} preference={preference} storage={storage} />,
    )
    const locations = screen.getByRole('group', { name: 'Card location to keep' })
    fireEvent.click(within(locations).getByRole('radio', { name: 'Month' }))
    expect((screen.getByRole('button', { name: 'Combine into Calendar' }) as HTMLButtonElement).disabled).toBe(false)

    view.rerender(
      <CalendarConsolidationSettings
        layout={layout('Changed elsewhere')}
        preference={preference}
        storage={storage}
      />,
    )
    expect(within(locations).getAllByRole<HTMLInputElement>('radio').every((radio) => !radio.checked)).toBe(true)
    expect((screen.getByRole('button', { name: 'Combine into Calendar' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
