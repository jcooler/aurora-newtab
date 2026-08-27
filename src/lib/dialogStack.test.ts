// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { closeAllDialogs, useDialogEscape } from './dialogStack'

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

describe('closeAllDialogs', () => {
  it('awaits the newest close before invoking the older entry', async () => {
    const order: string[] = []
    let releaseNewest = () => {}
    renderHook(() => useDialogEscape(() => { order.push('older') }))
    renderHook(() => useDialogEscape(async () => {
      order.push('newest:start')
      await new Promise<void>((resolve) => { releaseNewest = resolve })
      order.push('newest:end')
      return true
    }))

    let result!: Promise<boolean>
    act(() => { result = closeAllDialogs() })
    expect(order).toEqual(['newest:start'])
    await act(async () => { releaseNewest(); await result })
    expect(await result).toBe(true)
    expect(order).toEqual(['newest:start', 'newest:end', 'older'])
  })

  it.each(['false', 'reject'] as const)('%s from the newest close stops and retains it on top', async (mode) => {
    const older = vi.fn()
    const newest = vi.fn(() => mode === 'false' ? false : Promise.reject(new Error('blocked')))
    renderHook(() => useDialogEscape(older))
    renderHook(() => useDialogEscape(newest))

    await expect(closeAllDialogs()).resolves.toBe(false)
    expect(older).not.toHaveBeenCalled()
    act(() => { escape() })
    expect(newest).toHaveBeenCalledTimes(2)
  })

  it('dedupes concurrent close-all requests', async () => {
    let release = () => {}
    const close = vi.fn(async () => {
      await new Promise<void>((resolve) => { release = resolve })
      return true
    })
    renderHook(() => useDialogEscape(close))

    const first = closeAllDialogs()
    const second = closeAllDialogs()
    expect(second).toBe(first)
    expect(close).toHaveBeenCalledOnce()
    await act(async () => { release(); await first })
    await expect(second).resolves.toBe(true)
    expect(close).toHaveBeenCalledOnce()
  })

  it('invokes every registered active onClose exactly once, newest-first (same order Escape would pop them in)', async () => {
    const order: string[] = []
    const closeA = vi.fn(() => { order.push('A') })
    const closeB = vi.fn(() => { order.push('B') })
    const closeC = vi.fn(() => { order.push('C') })
    renderHook(() => useDialogEscape(closeA))
    renderHook(() => useDialogEscape(closeB))
    renderHook(() => useDialogEscape(closeC))

    await act(async () => { await closeAllDialogs() })

    expect(closeA).toHaveBeenCalledTimes(1)
    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeC).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['C', 'B', 'A'])
  })

  it('skips an entry that already unregistered itself (closed by other means) before the call', async () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    renderHook(() => useDialogEscape(closeA))
    const b = renderHook(() => useDialogEscape(closeB))

    b.unmount() // B is no longer active/registered

    await act(async () => { await closeAllDialogs() })

    expect(closeA).toHaveBeenCalledTimes(1)
    expect(closeB).not.toHaveBeenCalled()
  })

  it('empties the stack: a subsequent Escape finds nothing left to close', async () => {
    const close = vi.fn()
    renderHook(() => useDialogEscape(close))

    await act(async () => { await closeAllDialogs() })
    expect(close).toHaveBeenCalledTimes(1)

    act(() => {
      escape()
    })
    expect(close).toHaveBeenCalledTimes(1) // unchanged — nothing was there to pop
  })

  it('a dialog registered after the call becomes the new top on its own', async () => {
    const closeA = vi.fn()
    renderHook(() => useDialogEscape(closeA))

    await act(async () => { await closeAllDialogs() })

    const closeB = vi.fn()
    renderHook(() => useDialogEscape(closeB))

    act(() => {
      escape()
    })

    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeA).toHaveBeenCalledTimes(1) // only from the closeAllDialogs call above, not this Escape
  })

  it('is a no-op on an empty stack (no throw)', async () => {
    await expect(closeAllDialogs()).resolves.toBe(true)
  })
})
