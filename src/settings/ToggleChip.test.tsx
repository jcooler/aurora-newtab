// @vitest-environment jsdom
// ToggleChip.test.tsx — the house "on/off pill" control (Task 69), lifted
// from the GithubCards board (variant C, the settings closeup Jon picked).
// Same attr() idiom as Switch.test.tsx: no jest-dom matchers are registered
// in this project (see vitest.config.ts), so attribute checks go through
// getAttribute() rather than toHaveAttribute().
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ToggleChip from './ToggleChip'

function attr(el: Element, name: string) {
  return el.getAttribute(name)
}

describe('ToggleChip (the control kit — Task 69)', () => {
  it('renders a button whose aria-pressed mirrors `on`', () => {
    const { rerender } = render(<ToggleChip label="Commit graph" on={false} onClick={() => {}} />)
    const el = screen.getByRole('button', { name: /Commit graph/ })
    expect(el.tagName).toBe('BUTTON')
    expect(attr(el, 'type')).toBe('button')
    expect(attr(el, 'aria-pressed')).toBe('false')

    rerender(<ToggleChip label="Commit graph" on={true} onClick={() => {}} />)
    expect(attr(screen.getByRole('button', { name: /Commit graph/ }), 'aria-pressed')).toBe('true')
  })

  it('the ON state carries the accent tint classes and the checkmark glyph', () => {
    render(<ToggleChip label="Pull requests" on={true} onClick={() => {}} />)
    const el = screen.getByRole('button', { name: /Pull requests/ })
    expect(el.className).toContain('border-accent/40')
    expect(el.className).toContain('bg-[rgba(125,211,252,0.14)]')
    expect(el.className).toContain('text-fg')
    expect(el.textContent).toContain('✓')
  })

  it('the OFF state carries the neutral control classes and the plus glyph', () => {
    render(<ToggleChip label="Issues" on={false} onClick={() => {}} />)
    const el = screen.getByRole('button', { name: /Issues/ })
    expect(el.className).toContain('border-control-border')
    expect(el.className).toContain('bg-control-bg')
    expect(el.className).toContain('text-fg-muted')
    expect(el.textContent).toContain('+')
  })

  it('clicking the chip fires onClick', () => {
    const onClick = vi.fn()
    render(<ToggleChip label="Notifications" on={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('the glyph span is aria-hidden — aria-pressed is the accessible signal, the glyph is decoration', () => {
    render(<ToggleChip label="Commit graph" on={true} onClick={() => {}} />)
    const el = screen.getByRole('button', { name: /Commit graph/ })
    const glyph = el.querySelector('span')
    expect(glyph).not.toBeNull()
    expect(attr(glyph!, 'aria-hidden')).toBe('true')
  })

  it('keeps the 36px routine target floor at every Settings width', () => {
    render(<ToggleChip label="Commit graph" on={true} onClick={() => {}} />)
    const el = screen.getByRole('button', { name: /Commit graph/ })
    const classes = el.className.split(/\s+/)
    expect(classes).toContain('min-h-9')
    expect(classes).toContain('min-w-9')
  })
})
