// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Switch from './Switch'

// No jest-dom matchers are registered in this project (see vitest.config.ts),
// so attribute checks go through getAttribute() — the same idiom
// SettingsPanel.test.tsx's own attr() helper documents.
function attr(el: Element, name: string) {
  return el.getAttribute(name)
}

describe('Switch (the control kit — Task 61)', () => {
  it('is a native role=switch button whose aria-checked reflects state', () => {
    const { rerender } = render(<Switch id="s" checked={false} onChange={() => {}} label="Wifi" />)
    const el = screen.getByRole('switch', { name: 'Wifi' })
    // A NATIVE <button> is what gives Space/Enter activation, focus and label
    // association for free — the whole reason this isn't a styled div.
    expect(el.tagName).toBe('BUTTON')
    expect(attr(el, 'type')).toBe('button')
    expect(attr(el, 'aria-checked')).toBe('false')

    rerender(<Switch id="s" checked={true} onChange={() => {}} label="Wifi" />)
    expect(attr(screen.getByRole('switch', { name: 'Wifi' }), 'aria-checked')).toBe('true')
  })

  it('clicking an off switch calls onChange(true); clicking an on switch calls onChange(false)', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Switch id="s" checked={false} onChange={onChange} label="Wifi" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenLastCalledWith(true)

    rerender(<Switch id="s" checked={true} onChange={onChange} label="Wifi" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('honours the native-button keyboard contract: Space/Enter activate it (no hand-rolled key handler)', () => {
    // The whole reason this is a <button role="switch"> and not a styled div:
    // Space and Enter activation come from the PLATFORM's default action, which
    // dispatches a click. The component deliberately owns NO onKeyDown of its
    // own — so a bare keyDown must do nothing on its own, and it's the click
    // that default action raises that flips the switch. jsdom does not simulate
    // that default action (verified: keyDown alone never reaches onClick), so
    // here each key press is modelled as the user's keyDown PLUS the click the
    // browser raises in response — documenting the contract Space/Enter rely on.
    const onChange = vi.fn()
    render(<Switch id="s" checked={false} onChange={onChange} label="Wifi" />)
    const el = screen.getByRole('switch')
    el.focus()
    expect(document.activeElement).toBe(el)

    fireEvent.keyDown(el, { key: ' ', code: 'Space' })
    fireEvent.keyDown(el, { key: 'Enter', code: 'Enter' })
    expect(onChange).not.toHaveBeenCalled() // no rogue key handler intercepts

    fireEvent.click(el) // the default action Space/Enter raise on a native button
    expect(onChange).toHaveBeenLastCalledWith(true)
  })

  it('associates with an EXTERNAL <label htmlFor> (button is labelable), so the row label finds and toggles it', () => {
    const onChange = vi.fn()
    render(
      <>
        <label htmlFor="s">Wifi</label>
        <Switch id="s" checked={false} onChange={onChange} />
      </>,
    )
    // getByLabelText resolves the external label to the button via htmlFor —
    // this is exactly what keeps SettingsPanel.test.tsx's getByLabelText(...)
    // toggle queries working after the checkbox→switch swap.
    const el = screen.getByLabelText('Wifi')
    expect(attr(el, 'role')).toBe('switch')
    fireEvent.click(el)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('forwards describedBy to aria-describedby (the bookmarks permission alert relies on it)', () => {
    render(<Switch id="s" checked={false} onChange={() => {}} label="Wifi" describedBy="err-id" />)
    expect(attr(screen.getByRole('switch'), 'aria-describedby')).toBe('err-id')
  })

  it('disabled is inert: aria-disabled + disabled set, and a click does nothing', () => {
    const onChange = vi.fn()
    render(<Switch id="s" checked={false} onChange={onChange} label="Wifi" disabled />)
    const el = screen.getByRole('switch') as HTMLButtonElement
    expect(attr(el, 'aria-disabled')).toBe('true')
    expect(el.disabled).toBe(true)
    fireEvent.click(el)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('carries the signature affordances: cursor-pointer + focus-visible ring on the track, a sliding thumb with a reduced-motion opt-out', () => {
    render(<Switch id="s" checked={false} onChange={() => {}} label="Wifi" />)
    const el = screen.getByRole('switch')
    const track = el.querySelector('[data-switch-track]')
    const thumb = el.querySelector('[data-switch-thumb]')
    expect(el.className).toContain('cursor-pointer')
    expect(el.className).not.toContain('focus-visible:ring')
    expect(track!.className).toContain('group-focus-visible:outline')
    expect(thumb).not.toBeNull()
    // The thumb owns the translate slide AND the prefers-reduced-motion opt-out.
    expect(thumb!.className).toContain('transition-transform')
    expect(thumb!.className).toContain('motion-reduce:transition-none')
  })

  it('the track styling differs on vs off (accent fill on, fg-derived neutral off)', () => {
    const { rerender } = render(<Switch id="s" checked={false} onChange={() => {}} label="Wifi" />)
    const off = screen.getByRole('switch').querySelector('[data-switch-track]')!.className
    rerender(<Switch id="s" checked={true} onChange={() => {}} label="Wifi" />)
    const on = screen.getByRole('switch').querySelector('[data-switch-track]')!.className
    expect(off).not.toBe(on)
    expect(on).toContain('bg-accent')
  })

  it('keeps a fixed 36x20 visual track inside a 36px routine target at every width', () => {
    render(<Switch id="s" checked={false} onChange={() => {}} label="Wifi" />)
    const el = screen.getByRole('switch')
    expect(el.className).toContain('min-h-9')
    expect(el.className).toContain('w-9')
    const track = el.querySelector('[data-switch-track]')
    expect(track).not.toBeNull()
    expect(track!.className).toContain('h-5')
  })
})
