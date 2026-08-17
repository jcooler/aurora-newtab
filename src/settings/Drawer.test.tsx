// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Drawer from './Drawer'

describe('Drawer narrow reflow', () => {
  it('keeps one vertical scroll owner, preserves ordinary padding, and reduces only narrow padding', () => {
    render(<Drawer open onClose={() => {}} title="Settings"><p>Content</p></Drawer>)

    const classes = screen.getByRole('dialog', { name: 'Settings' }).className.split(/\s+/)
    expect(classes).toContain('overflow-y-auto')
    expect(classes).not.toContain('overflow-x-auto')
    expect(classes).toContain('p-6')
    expect(classes).toContain('max-[420px]:p-3')
    expect(classes).toContain('w-full')
    expect(classes).toContain('max-w-none')
    expect(classes).toContain('min-[900px]:max-w-5xl')
    expect(classes).toContain('min-[900px]:w-[calc(100vw-2rem)]')
    expect(classes).toContain('min-[900px]:rounded-2xl')
  })

  it('gives the close control the shared 36px target floor without changing padding', () => {
    const onClose = vi.fn()
    render(<Drawer open onClose={onClose} title="Settings"><p>Content</p></Drawer>)

    const classes = screen.getByRole('button', { name: 'Close settings' }).className.split(/\s+/)
    expect(classes).toContain('p-1')
    expect(classes).toContain('min-h-9')
    expect(classes).toContain('min-w-9')
  })

  it('paints and hits nothing when closed, including beyond the roomy inset', () => {
    render(<Drawer open={false} onClose={() => {}} title="Settings"><button>Focusable content</button></Drawer>)

    const drawer = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Settings"]')!
    const classes = drawer.className.split(/\s+/)
    expect(drawer.getAttribute('aria-hidden')).toBe('true')
    expect(drawer.hasAttribute('inert')).toBe(true)
    expect(classes).toContain('invisible')
    expect(classes).toContain('pointer-events-none')
    expect(classes).toContain('translate-x-[calc(100%+1rem)]')
    expect(screen.queryByRole('button', { name: 'Focusable content' })).toBeNull()
    expect(document.querySelector('.fixed.inset-0.z-40')).toBeNull()
  })
})
