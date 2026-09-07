// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import WidgetRowActions from './WidgetRowActions'

it('opens actions outside the clipped row and returns keyboard focus on Escape', async () => {
  const action = vi.fn()
  const { container } = render(<div style={{ overflow: 'hidden', height: 30 }}><WidgetRowActions label="Saved article"><button onClick={action}>Mark read</button></WidgetRowActions></div>)
  const trigger = screen.getByRole('button', { name: 'Actions for Saved article' })
  expect(screen.queryByRole('button', { name: 'Mark read' })).toBeNull()
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Actions for Saved article' })
  expect(container.contains(dialog)).toBe(false)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mark read' }))
  fireEvent.click(screen.getByRole('button', { name: 'Mark read' }))
  expect(action).toHaveBeenCalledOnce()
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(trigger)
})

it('dismisses on an outside pointer without running an action', () => {
  const action = vi.fn()
  render(<WidgetRowActions label="Saved article"><button onClick={action}>Remove</button></WidgetRowActions>)
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Saved article' }))
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(action).not.toHaveBeenCalled()
})
