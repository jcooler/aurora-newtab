// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Tabs from './Tabs'

// No jest-dom matchers are registered in this project (see vitest.config.ts),
// so attribute checks go through getAttribute() + toBe(), the same idiom
// SettingsPanel.test.tsx's own attr() helper documents.
function attr(el: Element, name: string) {
  return el.getAttribute(name)
}

type Id = 'general' | 'widgets' | 'data'

const TABS: readonly { id: Id; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'widgets', label: 'Widgets' },
  { id: 'data', label: 'Data' },
]

/** Controlled host, mirroring how SettingsPanel uses this component: the
 *  selection lives OUTSIDE Tabs, and only the active tab's content is passed
 *  as children (inactive panels are unmounted, not hidden — the deliberate
 *  choice here, so a section's hooks don't run while it isn't shown). Every
 *  keyboard/click behavior below is only real when the new id is actually fed
 *  back in, which a stateless render would never prove. */
function Host({ onChange }: { onChange?: (id: Id) => void } = {}) {
  const [active, setActive] = useState<Id>('general')
  return (
    <Tabs
      tabs={TABS}
      active={active}
      onChange={(id) => {
        setActive(id)
        onChange?.(id)
      }}
    >
      <p>{active} content</p>
    </Tabs>
  )
}

function tab(name: string) {
  return screen.getByRole('tab', { name })
}

function tablist() {
  return screen.getByRole('tablist')
}

describe('Tabs (ARIA tabs pattern)', () => {
  it('reflows both free three-tab and premium four-tab sets as a bounded narrow grid with 36px targets', () => {
    const { rerender } = render(<Host />)
    const assertNarrowGrid = (expected: number) => {
      expect(tablist().className).toContain('max-[420px]:grid')
      expect(tablist().className).toContain('max-[420px]:grid-cols-2')
      expect(screen.getAllByRole('tab')).toHaveLength(expected)
      for (const item of screen.getAllByRole('tab')) {
        expect(item.className).toContain('max-[420px]:min-h-9')
        expect(item.className).toContain('max-[420px]:min-w-9')
        expect(item.className).toContain('max-[420px]:w-full')
      }
    }

    assertNarrowGrid(3)
    rerender(
      <Tabs
        tabs={[...TABS, { id: 'connectors' as Id, label: 'Connectors' }]}
        active="general"
        onChange={() => {}}
      >
        <p>general content</p>
      </Tabs>,
    )
    assertNarrowGrid(4)
  })

  it('renders one tab per entry; only the active one is selected and a tab stop', () => {
    render(<Host />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['General', 'Widgets', 'Data'])

    expect(attr(tab('General'), 'aria-selected')).toBe('true')
    expect(attr(tab('General'), 'tabindex')).toBe('0')
    for (const name of ['Widgets', 'Data']) {
      expect(attr(tab(name), 'aria-selected')).toBe('false')
      expect(attr(tab(name), 'tabindex')).toBe('-1')
    }
  })

  it('wires the single rendered tabpanel to the active tab by id/aria-controls/aria-labelledby', () => {
    render(<Host />)

    const panels = screen.getAllByRole('tabpanel')
    expect(panels).toHaveLength(1) // inactive panels are unmounted, not hidden
    const panel = panels[0]!

    expect(attr(tab('General'), 'aria-controls')).toBe(panel.id)
    expect(attr(panel, 'aria-labelledby')).toBe(tab('General').id)
    // An unselected tab controls nothing, because its panel is not in the
    // document at all — a dangling aria-controls IDREF would be an invalid
    // reference, not a wiring.
    expect(attr(tab('Widgets'), 'aria-controls')).toBeNull()
  })

  it('clicking a tab selects it and swaps the panel; the previous panel is gone from the DOM', () => {
    const onChange = vi.fn()
    render(<Host onChange={onChange} />)
    expect(screen.getByText('general content')).toBeTruthy()

    fireEvent.click(tab('Data'))

    expect(onChange).toHaveBeenCalledWith('data')
    expect(attr(tab('Data'), 'aria-selected')).toBe('true')
    expect(attr(tab('General'), 'aria-selected')).toBe('false')
    expect(screen.getByText('data content')).toBeTruthy()
    expect(screen.queryByText('general content')).toBeNull()
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  })

  it('ArrowRight moves selection AND applies it, wrapping past the last tab, and moves focus', () => {
    render(<Host />)

    fireEvent.keyDown(tablist(), { key: 'ArrowRight' })
    expect(attr(tab('Widgets'), 'aria-selected')).toBe('true')
    expect(attr(tab('Widgets'), 'tabindex')).toBe('0')
    expect(document.activeElement).toBe(tab('Widgets'))
    expect(screen.getByText('widgets content')).toBeTruthy()

    fireEvent.keyDown(tablist(), { key: 'ArrowRight' })
    fireEvent.keyDown(tablist(), { key: 'ArrowRight' }) // past the last tab
    expect(attr(tab('General'), 'aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('General'))
  })

  it('ArrowLeft wraps from the first tab to the last', () => {
    render(<Host />)

    fireEvent.keyDown(tablist(), { key: 'ArrowLeft' })

    expect(attr(tab('Data'), 'aria-selected')).toBe('true')
    expect(attr(tab('Data'), 'tabindex')).toBe('0')
    expect(document.activeElement).toBe(tab('Data'))
    expect(screen.getByText('data content')).toBeTruthy()
  })

  it('End selects the last tab, Home returns to the first', () => {
    render(<Host />)

    fireEvent.keyDown(tablist(), { key: 'End' })
    expect(attr(tab('Data'), 'aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Data'))

    fireEvent.keyDown(tablist(), { key: 'Home' })
    expect(attr(tab('General'), 'aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('General'))
  })

  it('leaves ArrowDown/ArrowUp alone — this tablist is horizontal', () => {
    // Deliberately NOT the theme radiogroup's behavior (General.tsx aliases
    // Down/Up onto Right/Left): APG reserves the vertical arrows for a
    // vertical tablist, and swallowing them here would take Down/Up away
    // from the scrollable drawer they're really meant for.
    render(<Host />)

    fireEvent.keyDown(tablist(), { key: 'ArrowDown' })
    expect(attr(tab('General'), 'aria-selected')).toBe('true')

    fireEvent.keyDown(tablist(), { key: 'ArrowUp' })
    expect(attr(tab('General'), 'aria-selected')).toBe('true')
  })
})
