// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LayoutsDocument } from '../../lib/layout/namedLayouts'
import LayoutBadge from './LayoutBadge'

const DOC: LayoutsDocument = {
  version: 1,
  activeLayoutId: 'a',
  layouts: [
    { id: 'a', name: 'My layout', widgets: {} },
    { id: 'b', name: 'Laptop', widgets: {} },
  ],
}

describe('LayoutBadge', () => {
  afterEach(cleanup)

  it('shows the active name and switches through the menu with focus restoration', () => {
    const onSwitch = vi.fn()
    render(<LayoutBadge document={DOC} onSwitch={onSwitch} onEdit={vi.fn()} onNew={vi.fn()} />)

    const badge = screen.getByRole('button', { name: 'Layout: My layout' })
    fireEvent.click(badge)
    const menu = screen.getByRole('menu', { name: 'Layouts' })
    expect(within(menu).getByRole('menuitemradio', { name: /My layout/ }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Laptop' }))
    expect(onSwitch).toHaveBeenCalledWith('b')
    expect(screen.queryByRole('menu', { name: 'Layouts' })).toBeNull()
    expect(document.activeElement).toBe(badge)
  })

  it('re-selecting the active layout closes without switching; Edit and New fire their actions', () => {
    const onSwitch = vi.fn()
    const onEdit = vi.fn()
    const onNew = vi.fn()
    render(<LayoutBadge document={DOC} onSwitch={onSwitch} onEdit={onEdit} onNew={onNew} />)

    fireEvent.click(screen.getByRole('button', { name: 'Layout: My layout' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /My layout/ }))
    expect(onSwitch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Layout: My layout' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit layout' }))
    expect(onEdit).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Layout: My layout' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New layout' }))
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('Escape closes the menu and restores focus', () => {
    render(<LayoutBadge document={DOC} onSwitch={vi.fn()} onEdit={vi.fn()} onNew={vi.fn()} />)
    const badge = screen.getByRole('button', { name: 'Layout: My layout' })
    fireEvent.click(badge)
    expect(screen.getByRole('menu', { name: 'Layouts' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Layouts' })).toBeNull()
    expect(document.activeElement).toBe(badge)
  })
})
