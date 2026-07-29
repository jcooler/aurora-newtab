// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { useLongPress } from './useLongPress'

vi.mock('../../lib/premium', () => ({ isPremium: vi.fn(() => true) }))
import { isPremium } from '../../lib/premium'

function Harness({ onEngage }: { onEngage: (id: string, e: PointerEvent) => void }) {
  useLongPress(onEngage as never)
  return (
    <div>
      <div data-block-id="clock">
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

  it('fires onEngage with the block id after a 500ms hold on a [data-block-id] descendant', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const button = document.querySelector('button') as HTMLElement

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 })
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
    const button = document.querySelector('button') as HTMLElement

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 109, clientY: 100 }) // 9px

    vi.advanceTimersByTime(500)
    expect(onEngage).not.toHaveBeenCalled()
  })

  it('does not cancel the hold for a move within the 8px tolerance', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const button = document.querySelector('button') as HTMLElement

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 108, clientY: 100 }) // 8px, at the boundary

    vi.advanceTimersByTime(500)
    expect(onEngage).toHaveBeenCalledOnce()
  })

  it('cancels the hold on an early pointerup', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const button = document.querySelector('button') as HTMLElement

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(200)
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 100, clientY: 100 })

    vi.advanceTimersByTime(500)
    expect(onEngage).not.toHaveBeenCalled()
  })

  it('cancels the hold on pointercancel', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const button = document.querySelector('button') as HTMLElement

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(200)
    fireEvent.pointerCancel(document, { pointerId: 1 })

    vi.advanceTimersByTime(500)
    expect(onEngage).not.toHaveBeenCalled()
  })

  it('suppresses the click that follows an engaged press — a listener on the target never sees it', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const button = document.querySelector('button') as HTMLElement
    const clickSpy = vi.fn()
    button.addEventListener('click', clickSpy)

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(500)
    expect(onEngage).toHaveBeenCalledOnce()

    fireEvent.click(button)
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('does not suppress a later, unrelated click once the one-shot suppressor has already fired', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const button = document.querySelector('button') as HTMLElement
    const clickSpy = vi.fn()
    button.addEventListener('click', clickSpy)

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(500)
    fireEvent.click(button) // consumes the one-shot suppressor
    fireEvent.click(button) // a normal, unrelated click afterward

    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('does nothing for a press outside any [data-block-id] element', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const outside = document.querySelectorAll('button')[1] as HTMLElement

    fireEvent.pointerDown(outside, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(500)
    expect(onEngage).not.toHaveBeenCalled()
  })

  it('ignores a second concurrent pointer (multi-touch) while a press is already tracked', () => {
    const onEngage = vi.fn()
    render(<Harness onEngage={onEngage} />)
    const button = document.querySelector('button') as HTMLElement

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerDown(button, { pointerId: 2, clientX: 100, clientY: 100 })
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
    const button = document.querySelector('button') as HTMLElement

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 })
    vi.advanceTimersByTime(500)
    expect(onEngage).not.toHaveBeenCalled()
  })

  it('honors custom holdMs/tolerancePx options', () => {
    const onEngage = vi.fn()
    function CustomHarness() {
      useLongPress(onEngage as never, { holdMs: 200, tolerancePx: 2 })
      return (
        <div data-block-id="clock">
          <button type="button">Widget button</button>
        </div>
      )
    }
    render(<CustomHarness />)
    const button = document.querySelector('button') as HTMLElement

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 3, clientY: 0 }) // > 2px tolerance
    vi.advanceTimersByTime(200)
    expect(onEngage).not.toHaveBeenCalled()
  })
})
