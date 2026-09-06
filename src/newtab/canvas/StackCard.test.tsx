// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TierFrame from '../widgets/shared/TierFrame'
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
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

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

  it('groups arrows around the face dots in one stack navigation shelf', () => {
    const { card } = setup({ facing: 'clock' })
    const shelf = within(card).getByRole('toolbar', { name: 'Stack navigation' })
    const controls = within(shelf).getAllByRole('button')

    expect(controls.map((control) => control.getAttribute('aria-label'))).toEqual([
      'Previous widget',
      'Show Weather',
      'Show Clock',
      'Show Notes',
      'Next widget',
    ])
  })

  it('moves the navigation shelf above a stack when it would leave the viewport below', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const { card } = setup()
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ bottom: 780 } as DOMRect)

    fireEvent.pointerEnter(card)

    expect(within(card).getByRole('toolbar', { name: 'Stack navigation' }).dataset.stackShelfPlacement).toBe('above')
  })

  it('moves the shelf above when another canvas widget occupies the space below', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)
    const { card } = setup()
    const shelf = within(card).getByRole('toolbar', { name: 'Stack navigation' })
    const owner = card.parentElement as HTMLElement
    owner.className = 'canvas-item'
    owner.dataset.canvasObjectId = 'stack:stack-day'
    const neighbor = document.createElement('div')
    neighbor.className = 'canvas-item'
    neighbor.dataset.canvasObjectId = 'focus'
    owner.append(neighbor)
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ left: 640, right: 960, top: 300, bottom: 500, width: 320, height: 200 } as DOMRect)
    vi.spyOn(shelf, 'getBoundingClientRect').mockReturnValue({ width: 152, height: 38 } as DOMRect)
    vi.spyOn(neighbor, 'getBoundingClientRect').mockReturnValue({ left: 724, right: 876, top: 506, bottom: 550, width: 152, height: 44 } as DOMRect)

    fireEvent.pointerEnter(card)

    expect(shelf.dataset.stackShelfPlacement).toBe('above')
  })

  it('shifts a wider navigation shelf inside the viewport at a canvas edge', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320)
    const { card } = setup()
    const shelf = within(card).getByRole('toolbar', { name: 'Stack navigation' })
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ left: 8, width: 216, bottom: 200 } as DOMRect)
    vi.spyOn(shelf, 'getBoundingClientRect').mockReturnValue({ width: 296 } as DOMRect)

    fireEvent.pointerEnter(card)

    expect(shelf.style.getPropertyValue('--stack-shelf-shift')).toBe('40px')
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

  it('never arms stack paging from an editable descendant', () => {
    const onStep = vi.fn()
    render(
      <StackCard
        id="stack-day"
        members={[
          {
            id: 'weather',
            label: 'Weather',
            content: (
              <div>
                <input aria-label="Stack text input" />
                <textarea aria-label="Stack textarea" />
                <select aria-label="Stack select"><option>One</option></select>
                <div role="textbox" aria-label="Stack content editor" contentEditable />
              </div>
            ),
          },
          ...MEMBERS.slice(1),
        ]}
        facing="weather"
        editing={false}
        onStep={onStep}
        onFace={vi.fn()}
      />,
    )

    const controls = [
      screen.getByRole('textbox', { name: 'Stack text input' }),
      screen.getByRole('textbox', { name: 'Stack textarea' }),
      screen.getByRole('combobox', { name: 'Stack select' }),
      screen.getByRole('textbox', { name: 'Stack content editor' }),
    ]
    controls.forEach((control, index) => {
      fireEvent.pointerDown(control, { pointerId: index + 10, clientX: 100 })
      fireEvent.pointerUp(control, { pointerId: index + 10, clientX: 40 })
    })
    expect(onStep).not.toHaveBeenCalled()
  })

  it('uses Left and Right only when the stack card itself holds focus', () => {
    const { card, onStep } = setup()
    fireEvent.focus(card)
    fireEvent.keyDown(card, { key: 'ArrowLeft' })
    fireEvent.keyDown(card, { key: 'ArrowRight' })
    expect(onStep.mock.calls.map(([direction]) => direction)).toEqual([-1, 1])

    const child = within(card).getByRole('button', { name: 'Open weather' })
    fireEvent.focus(child)
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

  it('keeps a shared Standard reference pair as two exact frames without a stack-owned panel or scroll surface', () => {
    const openWeather = vi.fn()
    const onStep = vi.fn()
    const onFace = vi.fn()
    const referenceMembers: readonly StackCardMember[] = [
      {
        id: 'weather',
        label: 'Weather',
        content: (
          <TierFrame label="Weather" tier="standard" state="ready">
            <button type="button" onClick={openWeather}>Open weather</button>
          </TierFrame>
        ),
      },
      {
        id: 'onThisDay',
        label: 'On This Day',
        content: (
          <TierFrame label="On This Day" tier="standard" state="ready">
            <a href="https://en.wikipedia.org/wiki/August_22">Open On This Day</a>
          </TierFrame>
        ),
      },
    ]

    render(
      <StackCard
        id="stack-reference"
        members={referenceMembers}
        facing="weather"
        editing={false}
        onStep={onStep}
        onFace={onFace}
      />,
    )

    const card = screen.getByRole('group')
    expect(card.querySelectorAll('[data-tier-frame="standard"]')).toHaveLength(2)
    expect(card.querySelector('[data-tier-frame="compact"], [data-tier-frame="full"]')).toBeNull()
    expect(card.className).toBe('stack-card')
    expect(card.querySelector('.rounded-panel')).toBeNull()
    expect(card.querySelector('.overflow-y-auto, .overflow-y-scroll')).toBeNull()
    expect(card.querySelector('[data-stack-member="weather"]')?.hasAttribute('inert')).toBe(false)
    expect(card.querySelector('[data-stack-member="onThisDay"]')?.hasAttribute('inert')).toBe(true)

    fireEvent.click(within(card).getByRole('button', { name: 'Open weather' }))
    expect(openWeather).toHaveBeenCalledOnce()
    fireEvent.click(within(card).getByRole('button', { name: 'Next widget' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Show On This Day' }))
    expect(onStep).toHaveBeenCalledWith(1)
    expect(onFace).toHaveBeenCalledWith('onThisDay')
  })

  it('pins the constant-footprint grid and quiet overlay controls without an outer panel', () => {
    expect(indexCss).toMatch(/\.stack-card__members\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;/)
    expect(indexCss).toMatch(/\.stack-card__member\s*\{[^}]*grid-area:\s*1\s*\/\s*1;/)
    expect(indexCss).toMatch(/\.stack-card__member\[data-stack-active="false"\]\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/)
    expect(indexCss).toMatch(/\.stack-card__shelf\s*\{[^}]*position:\s*absolute;[^}]*opacity:\s*1;[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;/s)
    expect(indexCss).toMatch(/\.stack-card__shelf--editing\s*\{[^}]*opacity:\s*0\.96;[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;/s)
    expect(indexCss).toMatch(/\.stack-card:focus-visible\s*\{[^}]*outline:/)
    const outer = indexCss.match(/\.stack-card\s*\{[^}]*\}/)?.[0] ?? ''
    expect(outer).not.toContain('background:')
    expect(outer).not.toContain('border:')
    expect(indexCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.stack-card/s)
  })

  it('keeps quiet page dots available while revealing arrows on hover or focus', () => {
    expect(indexCss).toMatch(/\.stack-card__arrow\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s)
    expect(indexCss).toMatch(/\.stack-card:hover \.stack-card__shelf,\s*\.stack-card:focus-within \.stack-card__shelf,[\s\S]*?opacity:\s*0\.96;[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;/s)
  })

  it('gives arrows and dots 36px targets while keeping their visible marks quiet', () => {
    expect(indexCss).toMatch(/\.stack-card__arrow\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/s)
    expect(indexCss).toMatch(/\.stack-card__dot\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/s)
    expect(indexCss).toMatch(/\.stack-card:hover \.stack-card__shelf,[\s\S]*?pointer-events:\s*auto;/)
    expect(indexCss).toMatch(/\.stack-card__dot::before\s*\{[^}]*width:\s*4px;[^}]*height:\s*4px;/s)
  })

  it('prevents a horizontal stack swipe from starting native text selection', () => {
    expect(indexCss).toMatch(/\.stack-card\s*\{[^}]*user-select:\s*none;/s)
  })
})
