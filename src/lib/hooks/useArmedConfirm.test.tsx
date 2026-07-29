// @vitest-environment jsdom
import { useEffect } from 'react'
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

// Exposes `disarm` too, driven by an external `active` prop that a caller
// can flip to simulate "this control just became invisible/inactive"
// (arrange-mode exit, drawer close) — the exact shape both real call sites
// use.
function DisarmableHarness({
  onConfirm,
  armMs,
  active,
}: {
  onConfirm: () => void
  armMs?: number
  active: boolean
}) {
  const { armed, trigger, disarm } = useArmedConfirm(onConfirm, armMs)
  useEffect(() => {
    if (!active) disarm()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only `active` transitions should re-run this; `disarm` changes identity every render but is otherwise safe to omit
  }, [active])
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

  it('disarm() clears an in-progress arm immediately, without calling onConfirm', () => {
    const onConfirm = vi.fn()
    const { rerender } = render(<DisarmableHarness onConfirm={onConfirm} active={true} />)
    const button = screen.getByRole('button', { name: 'Go' })

    fireEvent.click(button) // arm
    expect(screen.getByRole('button', { name: 'Confirm?' })).toBeTruthy()

    rerender(<DisarmableHarness onConfirm={onConfirm} active={false} />) // simulates exit/close

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy()
  })

  it('a control that goes inactive then active again (arrange exit+re-entry, or drawer close+reopen) never shows pre-armed, even within the auto-expire window', () => {
    const onConfirm = vi.fn()
    const { rerender } = render(
      <DisarmableHarness onConfirm={onConfirm} armMs={4000} active={true} />,
    )
    const button = screen.getByRole('button', { name: 'Go' })

    fireEvent.click(button) // arm
    expect(screen.getByRole('button', { name: 'Confirm?' })).toBeTruthy()

    rerender(<DisarmableHarness onConfirm={onConfirm} armMs={4000} active={false} />) // exit/close
    rerender(<DisarmableHarness onConfirm={onConfirm} armMs={4000} active={true} />) // re-enter/reopen, still well within 4000ms

    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm?' })).toBeNull()

    // A fresh click now genuinely only arms again — it does not confirm.
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disarm() is a harmless no-op when nothing is armed', () => {
    const onConfirm = vi.fn()
    render(<DisarmableHarness onConfirm={onConfirm} active={false} />)

    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
