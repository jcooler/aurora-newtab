// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDialogEscape } from './dialogStack'

function escape(opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, ...opts })
  document.dispatchEvent(event)
  return event
}

describe('useDialogEscape (shared newest-first dialog stack)', () => {
  it('registers A then B: Escape closes only B (the most recently registered)', () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    renderHook(() => useDialogEscape(closeA))
    renderHook(() => useDialogEscape(closeB))

    act(() => {
      escape()
    })

    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeA).not.toHaveBeenCalled()
  })

  it('after B unregisters (unmount), Escape closes A', () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    renderHook(() => useDialogEscape(closeA))
    const b = renderHook(() => useDialogEscape(closeB))

    b.unmount()

    act(() => {
      escape()
    })

    expect(closeA).toHaveBeenCalledTimes(1)
    expect(closeB).not.toHaveBeenCalled()
  })

  it('ignores an already-defaultPrevented Escape', () => {
    const closeA = vi.fn()
    renderHook(() => useDialogEscape(closeA))

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
      event.preventDefault()
      document.dispatchEvent(event)
    })

    expect(closeA).not.toHaveBeenCalled()
  })

  it('detaches the document listener once the stack is empty (no throw, no calls after all unregister)', () => {
    const closeA = vi.fn()
    const a = renderHook(() => useDialogEscape(closeA))

    a.unmount()

    expect(() => {
      act(() => {
        escape()
      })
    }).not.toThrow()
    expect(closeA).not.toHaveBeenCalled()
  })

  it('active=false does not register; flipping to true registers', () => {
    const close = vi.fn()
    const { rerender } = renderHook(({ active }) => useDialogEscape(close, active), {
      initialProps: { active: false },
    })

    act(() => {
      escape()
    })
    expect(close).not.toHaveBeenCalled()

    rerender({ active: true })

    act(() => {
      escape()
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('calls preventDefault on the event it consumes', () => {
    const close = vi.fn()
    renderHook(() => useDialogEscape(close))

    let event: KeyboardEvent
    act(() => {
      event = escape()
    })

    expect(event!.defaultPrevented).toBe(true)
  })
})
