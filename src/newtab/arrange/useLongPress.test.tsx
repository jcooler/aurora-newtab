// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { useLongPress } from './useLongPress'

vi.mock('../../lib/premium', () => ({ isPremium: vi.fn(() => true) }))
import { isPremium } from '../../lib/premium'

// `surface` is a non-interactive descendant of the block — matches the real
// widgets that have one (Clock's bare `<time>`, Greeting's `<p>`, …): the
// thing a long-press is actually supposed to arm on. `Widget button` sits
// alongside it so the interactive-exclusion tests below can press an
// element that's ALSO inside the block but must never arm the timer — see
// useLongPress.ts's doc comment for why (Jon's focus-timer spinner repro).
function Harness({ onEngage }: { onEngage: (id: string, e: PointerEvent) => void }) {
  useLongPress(onEngage as never)
  return (
    <div>
      <div data-block-id="clock">
        <span data-testid="surface">Non-interactive surface</span>
        <button type="button">Widget button</button>
      </div>
      <button type="button">Outside block</button>
    </div>
  )
}

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(isPremium).mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('fires onEngage with the block id after a 500ms hold on a non-interactive [data-block-id] descendant', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const surface = screen.getByTestId('surface')

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    expect(onEngage).not.toHaveBeenCalled()

    vi.advanceTimersByTime(499)
    expect(onEngage).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onEngage).toHaveBeenCalledOnce()
    expect(onEngage.mock.calls[0]![0]).toBe('clock')
  })

  it('cancels the hold when the pointer moves more than the 8px tolerance', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const surface = screen.getByTestId('surface')

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 109, clientY: 100 }) // 9px

    vi.advanceTimersByTime(500)
    expect(onEngage).not.toHaveBeenCalled()
  })

  it('does not cancel the hold for a move within the 8px tolerance', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const surface = screen.getByTestId('surface')

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 108, clientY: 100 }) // 8px, at the boundary

    vi.advanceTimersByTime(500)
    expect(onEngage).toHaveBeenCalledOnce()
  })

  it('cancels the hold on an early pointerup', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const surface = screen.getByTestId('surface')

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(200)
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 100, clientY: 100 })

    vi.advanceTimersByTime(500)
    expect(onEngage).not.toHaveBeenCalled()
  })

  it('cancels the hold on pointercancel', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const surface = screen.getByTestId('surface')

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(200)
    fireEvent.pointerCancel(document, { pointerId: 1 })

    vi.advanceTimersByTime(500)
    expect(onEngage).not.toHaveBeenCalled()
  })

  it('suppresses the click that follows an engaged press — a listener on the target never sees it', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const surface = screen.getByTestId('surface')
    const clickSpy = vi.fn()
    surface.addEventListener('click', clickSpy)

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(500)
    expect(onEngage).toHaveBeenCalledOnce()

    fireEvent.click(surface)
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('does not suppress a later, unrelated click once the one-shot suppressor has already fired', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const surface = screen.getByTestId('surface')
    const clickSpy = vi.fn()
    surface.addEventListener('click', clickSpy)

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(500)
    fireEvent.click(surface) // consumes the one-shot suppressor
    fireEvent.click(surface) // a normal, unrelated click afterward

    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('does nothing for a press outside any [data-block-id] element', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const outside = screen.getByText('Outside block')

    fireEvent.pointerDown(outside, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(500)
    expect(onEngage).not.toHaveBeenCalled()
  })

  it('ignores a second concurrent pointer (multi-touch) while a press is already tracked', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const surface = screen.getByTestId('surface')

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerDown(surface, { pointerId: 2, clientX: 100, clientY: 100 })
    // The second pointer moving far away must not cancel the FIRST pointer's hold.
    fireEvent.pointerMove(document, { pointerId: 2, clientX: 500, clientY: 500 })

    vi.advanceTimersByTime(500)
    expect(onEngage).toHaveBeenCalledOnce()
    expect(onEngage.mock.calls[0]![0]).toBe('clock')
  })

  it('never engages when isPremium() is false', () => {
    vi.mocked(isPremium).mockReturnValue(false)
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const surface = screen.getByTestId('surface')

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(500)
    expect(onEngage).not.toHaveBeenCalled()
  })

  it('honors custom holdMs/tolerancePx options', () => {
    const onEngage = vi.fn()
    function CustomHarness() {
      useLongPress(onEngage as never, { holdMs: 200, tolerancePx: 2 })
      return (
        <div data-block-id="clock">
          <span data-testid="surface">Non-interactive surface</span>
        </div>
      )
    }
    render(<CustomHarness />)
    const surface = screen.getByTestId('surface')

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 3, clientY: 0 }) // > 2px tolerance
    vi.advanceTimersByTime(200)
    expect(onEngage).not.toHaveBeenCalled()
  })

  // Interactive-exclusion (Jon's bug report): holding ANY interactive
  // element inside a block — a button, but equally a link/input/etc. — must
  // never arm the timer, even though it's a perfectly good
  // `[data-block-id]` descendant. Before this fix, holding the focus-timer
  // panel's `<input type="number">` spin buttons to run the minutes up/down
  // fast ALSO started this timer; 500ms later it fired mid-hold, silently
  // dragging the whole Timer widget into arrange mode.
  describe('interactive elements never arm the timer', () => {
    it('allows the marked direct launcher button to enter Arrange while suppressing its click', () => {
      const onEngage = vi.fn()
      const clickSpy = vi.fn()
      function LauncherHarness() {
        useLongPress(onEngage as never)
        return (
          <div data-block-id="timer" data-arrange-long-press-controls="true">
            <button type="button" onClick={clickSpy}>Open Timer</button>
          </div>
        )
      }
      render(<LauncherHarness />)
      const launcher = screen.getByRole('button', { name: 'Open Timer' })

      fireEvent.pointerDown(launcher, { pointerId: 1, clientX: 100, clientY: 100 })
      vi.advanceTimersByTime(500)
      expect(onEngage).toHaveBeenCalledOnce()
      expect(onEngage.mock.calls[0]![0]).toBe('timer')

      fireEvent.pointerUp(launcher, { pointerId: 1 })
      fireEvent.click(launcher)
      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('does NOT engage after a 500ms hold on a <button>, and the button behaves exactly as if long-press did not exist', () => {
      const onEngage = vi.fn()
      render(<Harness onEngage={onEngage} />)
      const button = screen.getByText('Widget button')
      const clickSpy = vi.fn()
      button.addEventListener('click', clickSpy)

      fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 })
      vi.advanceTimersByTime(500)
      expect(onEngage).not.toHaveBeenCalled()

      // No suppressor was ever armed — the button's own click (its
      // click/repeat semantics) fires through completely untouched.
      fireEvent.pointerUp(button, { pointerId: 1 })
      fireEvent.click(button)
      expect(clickSpy).toHaveBeenCalledOnce()
    })

    it('does NOT engage after a 500ms hold on an <input> — Jon\'s repro (a number input\'s native spin buttons)', () => {
      const onEngage = vi.fn()
      function InputHarness() {
        useLongPress(onEngage as never)
        return (
          <div data-block-id="timer">
            <input type="number" aria-label="Work minutes" defaultValue={25} />
          </div>
        )
      }
      render(<InputHarness />)
      const input = screen.getByLabelText('Work minutes')

      fireEvent.pointerDown(input, { pointerId: 1, clientX: 100, clientY: 100 })
      vi.advanceTimersByTime(500)
      expect(onEngage).not.toHaveBeenCalled()
    })

    it('a press on the non-interactive surface of the SAME block still arms normally', () => {
      const onEngage = vi.fn()
      render(<Harness onEngage={onEngage} />)
      const surface = screen.getByTestId('surface')

      fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 })
      vi.advanceTimersByTime(500)
      expect(onEngage).toHaveBeenCalledOnce()
      expect(onEngage.mock.calls[0]![0]).toBe('clock')
    })
  })
})
