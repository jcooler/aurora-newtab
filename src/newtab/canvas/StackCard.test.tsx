// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StackCard, { type StackCardMember } from './StackCard'
import indexCss from '../index.css?raw'

const MEMBERS: readonly StackCardMember[] = [
  { id: 'weather', label: 'Weather', content: <button type="button">Open weather</button> },
  { id: 'clock', label: 'Clock', content: <button type="button">Open clock</button> },
  { id: 'notes', label: 'Notes', content: <button type="button">Open notes</button> },
]

function setup(input: { facing?: 'weather' | 'clock' | 'notes'; editing?: boolean } = {}) {
  const onStep = vi.fn()
  const onFace = vi.fn()
  render(
    <StackCard
      id="stack-day"
      members={MEMBERS}
      facing={input.facing ?? 'weather'}
      editing={input.editing ?? false}
      onStep={onStep}
      onFace={onFace}
    />,
  )
  return { card: screen.getByRole('group'), onStep, onFace }
}

describe('StackCard', () => {
  afterEach(cleanup)

  it('mounts every member once in one grid while only the stored face is interactive', () => {
    const { card } = setup({ facing: 'clock' })
    expect(card.getAttribute('aria-roledescription')).toBe('widget stack')
    expect(card.getAttribute('aria-label')).toBe('Clock, 2 of 3')
    expect(card.querySelectorAll('[data-stack-member]')).toHaveLength(3)
    expect(card.querySelector('[data-stack-members]')?.className).toContain('stack-card__members')
    expect((within(card).getByText('Open clock').closest('[data-stack-member]') as HTMLElement | null)?.dataset.stackActive).toBe('true')
    expect(within(card).getByText('Open weather').closest('[data-stack-member]')?.hasAttribute('inert')).toBe(true)
    expect(within(card).getByText('Open notes').closest('[data-stack-member]')?.hasAttribute('inert')).toBe(true)
  })

  it('exposes wrapped previous and next commands plus direct face dots', () => {
    const { card, onStep, onFace } = setup({ facing: 'notes' })
    fireEvent.click(within(card).getByRole('button', { name: 'Previous widget' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Next widget' }))
    expect(onStep.mock.calls.map(([direction]) => direction)).toEqual([-1, 1])
    fireEvent.click(within(card).getByRole('button', { name: 'Show Weather' }))
    expect(onFace).toHaveBeenCalledWith('weather')
  })

  it('pages on a 40px swipe and suppresses the release click', () => {
    const openWeather = vi.fn()
    const members: readonly StackCardMember[] = [
      { id: 'weather', label: 'Weather', content: <button type="button" onClick={openWeather}>Open weather</button> },
      ...MEMBERS.slice(1),
    ]
    const onStep = vi.fn()
    render(
      <StackCard id="stack-day" members={members} facing="weather" editing={false} onStep={onStep} onFace={vi.fn()} />,
    )
    const card = screen.getByRole('group')
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100 })
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 60 })
    fireEvent.click(screen.getByRole('button', { name: 'Open weather' }))
    expect(onStep).toHaveBeenCalledWith(1)
    expect(openWeather).not.toHaveBeenCalled()
  })

  it('preserves plain click parity below the swipe threshold', () => {
    const openWeather = vi.fn()
    const onStep = vi.fn()
    render(
      <StackCard
        id="stack-day"
        members={[{ ...MEMBERS[0], content: <button type="button" onClick={openWeather}>Open weather</button> }, ...MEMBERS.slice(1)]}
        facing="weather"
        editing={false}
        onStep={onStep}
        onFace={vi.fn()}
      />,
    )
    const card = screen.getByRole('group')
    const capture = vi.fn()
    Object.defineProperty(card, 'setPointerCapture', { configurable: true, value: capture })
    const trigger = within(card).getByRole('button', { name: 'Open weather' })
    fireEvent.pointerDown(trigger, { pointerId: 2, clientX: 100 })
    fireEvent.pointerUp(trigger, { pointerId: 2, clientX: 61 })
    fireEvent.click(trigger)
    expect(onStep).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
    expect(openWeather).toHaveBeenCalledOnce()
  })

  it('uses Left and Right only when the stack card itself holds focus', () => {
    const { card, onStep } = setup()
    card.focus()
    fireEvent.keyDown(card, { key: 'ArrowLeft' })
    fireEvent.keyDown(card, { key: 'ArrowRight' })
    expect(onStep.mock.calls.map(([direction]) => direction)).toEqual([-1, 1])

    const child = within(card).getByRole('button', { name: 'Open weather' })
    child.focus()
    fireEvent.keyDown(child, { key: 'ArrowRight' })
    expect(onStep).toHaveBeenCalledTimes(2)
  })

  it('removes arrow and swipe paging in edit mode while keeping direct dots visible', () => {
    const { card, onStep, onFace } = setup({ editing: true })
    expect(within(card).queryByRole('button', { name: 'Previous widget' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Next widget' })).toBeNull()
    expect(card.querySelector('[data-stack-dots]')?.className).toContain('stack-card__dots--editing')
    expect(card.querySelector('[data-stack-member="weather"]')?.hasAttribute('inert')).toBe(true)
    expect(card.querySelector('[data-stack-dots]')?.hasAttribute('inert')).toBe(false)
    fireEvent.pointerDown(card, { pointerId: 3, clientX: 100 })
    fireEvent.pointerUp(card, { pointerId: 3, clientX: 40 })
    expect(onStep).not.toHaveBeenCalled()
    fireEvent.click(within(card).getByRole('button', { name: 'Show Notes' }))
    expect(onFace).toHaveBeenCalledWith('notes')
  })

  it('pins the constant-footprint grid and quiet overlay controls without an outer panel', () => {
    expect(indexCss).toMatch(/\.stack-card__members\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;/)
    expect(indexCss).toMatch(/\.stack-card__member\s*\{[^}]*grid-area:\s*1\s*\/\s*1;/)
    expect(indexCss).toMatch(/\.stack-card__member\[data-stack-active="false"\]\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/)
    expect(indexCss).toMatch(/\.stack-card__arrow\s*\{[^}]*position:\s*absolute;/)
    expect(indexCss).toMatch(/\.stack-card__dots\s*\{[^}]*opacity:\s*0\.45;/)
    expect(indexCss).toMatch(/\.stack-card__dots--editing\s*\{[^}]*opacity:\s*1;/)
    expect(indexCss).toMatch(/\.stack-card:focus-visible\s*\{[^}]*outline:/)
    const outer = indexCss.match(/\.stack-card\s*\{[^}]*\}/)?.[0] ?? ''
    expect(outer).not.toContain('background:')
    expect(outer).not.toContain('border:')
    expect(indexCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.stack-card/s)
  })

  it('keeps paging arrows hidden and non-interactive until the stack is hovered or focused', () => {
    expect(indexCss).toMatch(/\.stack-card__arrow\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s)
    expect(indexCss).toMatch(/\.stack-card:hover \.stack-card__arrow,\s*\.stack-card:focus-within \.stack-card__arrow\s*\{[^}]*opacity:\s*0\.9;[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;/s)
  })

  it('prevents a horizontal stack swipe from starting native text selection', () => {
    expect(indexCss).toMatch(/\.stack-card\s*\{[^}]*user-select:\s*none;/s)
  })
})
