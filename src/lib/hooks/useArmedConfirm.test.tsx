// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useArmedConfirm } from './useArmedConfirm'

function Harness({ onConfirm, armMs }: { onConfirm: () => void; armMs?: number }) {
  const { armed, trigger } = useArmedConfirm(onConfirm, armMs)
  return (
    <button type="button" onClick={trigger}>
      {armed ? 'Confirm?' : 'Go'}
    </button>
  )
}

describe('useArmedConfirm', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('the first click only arms (label flips, onConfirm not called)', () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm?' })).toBeTruthy()
  })

  it('a second click while armed calls onConfirm and disarms', () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    const button = screen.getByRole('button', { name: 'Go' })

    fireEvent.click(button) // arm
    fireEvent.click(button) // confirm

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy() // back to the idle label
  })

  it('the arm auto-expires after armMs, so a click after that only re-arms instead of confirming', () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} armMs={1000} />)
    const button = screen.getByRole('button', { name: 'Go' })

    fireEvent.click(button) // arm
    act(() => {
      vi.advanceTimersByTime(1001)
    })
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy() // auto-disarmed

    fireEvent.click(button) // this is a FRESH arm, not a confirm
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm?' })).toBeTruthy()
  })

  it('always calls the latest onConfirm closure, even if the caller re-renders with a new one between arm and confirm', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Harness onConfirm={first} />)
    const button = screen.getByRole('button', { name: 'Go' })

    fireEvent.click(button) // arm, captured against `first`
    rerender(<Harness onConfirm={second} />)
    fireEvent.click(button) // confirm — should call the CURRENT closure, `second`

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})
