// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import UtilityTray from './UtilityTray'

afterEach(() => cleanup())

function Harness({ modal }: { modal: boolean }) {
  const [open, setOpen] = useState(false)
  const invokerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <div data-dashboard="" inert={open && modal}>
        <button ref={invokerRef} type="button" onClick={() => setOpen(true)}>Open utility tray</button>
        <button type="button">Dashboard action</button>
      </div>
      <UtilityTray open={open} modal={modal} onClose={() => setOpen(false)} invokerRef={invokerRef}>
        <button type="button">Tray action</button>
      </UtilityTray>
    </>
  )
}

describe('UtilityTray', () => {
  it('is anchored and modeless on desktop, with outside dismissal and invoker restoration', () => {
    render(<Harness modal={false} />)
    const invoker = screen.getByRole('button', { name: 'Open utility tray' })
    fireEvent.click(invoker)

    const tray = screen.getByRole('dialog', { name: 'Utility Tray' })
    expect(tray.getAttribute('aria-modal')).toBeNull()
    expect(tray.getAttribute('data-utility-tray-mode')).toBe('modeless')
    expect(document.querySelector('[data-utility-tray-backdrop]')).toBeNull()
    expect(document.querySelector('[data-dashboard]')?.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close utility tray' }))

    const dashboardAction = screen.getByRole('button', { name: 'Dashboard action' })
    dashboardAction.focus()
    expect(document.activeElement).toBe(dashboardAction)
    fireEvent.click(dashboardAction)

    expect(screen.queryByRole('dialog', { name: 'Utility Tray' })).toBeNull()
    expect(document.activeElement).toBe(invoker)
  })

  it('is a modal bottom sheet only at narrow layout, with inert background, trap, Escape, and restoration', () => {
    render(<Harness modal={true} />)
    const invoker = screen.getByRole('button', { name: 'Open utility tray' })
    fireEvent.click(invoker)

    const tray = screen.getByRole('dialog', { name: 'Utility Tray' })
    const close = screen.getByRole('button', { name: 'Close utility tray' })
    const action = screen.getByRole('button', { name: 'Tray action' })
    expect(tray.getAttribute('aria-modal')).toBe('true')
    expect(tray.getAttribute('data-utility-tray-mode')).toBe('modal')
    expect(document.querySelector('[data-dashboard]')?.hasAttribute('inert')).toBe(true)
    expect(document.querySelector('[data-utility-tray-backdrop]')).toBeTruthy()
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(action)
    fireEvent.keyDown(action, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Utility Tray' })).toBeNull()
    expect(document.activeElement).toBe(invoker)
  })

  it('does not register Escape while closed', () => {
    const onClose = vi.fn()
    const invokerRef = { current: null }
    render(<UtilityTray open={false} modal={false} onClose={onClose} invokerRef={invokerRef} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
