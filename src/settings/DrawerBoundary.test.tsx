// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import DrawerBoundary from './DrawerBoundary'

function Bomb(): never {
  throw new Error('boom')
}

function ConditionalBomb({ broken, onRender }: { broken: boolean; onRender?: () => void }) {
  onRender?.()
  if (broken) throw new Error('credential=https://private.example/token payload=secret backup=private')
  return <p>repaired settings</p>
}

function OpeningEdgeBomb({ open, onRender }: { open: boolean; onRender: () => void }) {
  onRender()
  if (open) throw new Error('opening edge failed')
  return <p>closed settings content</p>
}

describe('DrawerBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // React logs caught errors to console.error (twice, in dev), and
    // componentDidCatch logs its own line too — both expected here, so
    // silence them to keep test output pristine rather than let real
    // failures get lost in expected noise.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('renders children normally when nothing throws', () => {
    render(
      <DrawerBoundary open>
        <p>settings content</p>
      </DrawerBoundary>,
    )
    expect(screen.getByText('settings content')).toBeTruthy()
  })

  it('a throwing child renders the fallback instead of propagating the error', () => {
    render(
      <div>
        <p>sibling outside the boundary</p>
        <DrawerBoundary open>
          <Bomb />
        </DrawerBoundary>
      </div>,
    )
    // The fallback is shown and is announced (a quiet failure should still
    // be discoverable, same spirit as the zone-add error's role="alert").
    const fallback = screen.getByRole('alert')
    expect(fallback).toBeTruthy()
    // The rest of the tree (everything outside the boundary — standing in
    // for "the rest of the new tab") is unaffected: the React root did not
    // unmount.
    expect(screen.getByText('sibling outside the boundary')).toBeTruthy()
  })

  it('retries only once on a genuine closed-to-open transition', () => {
    const onRender = vi.fn()
    const view = render(
      <DrawerBoundary open>
        <ConditionalBomb broken onRender={onRender} />
      </DrawerBoundary>,
    )
    const renderCountAfterFailure = onRender.mock.calls.length

    view.rerender(
      <DrawerBoundary open>
        <ConditionalBomb broken={false} onRender={onRender} />
      </DrawerBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(onRender).toHaveBeenCalledTimes(renderCountAfterFailure)

    view.rerender(
      <DrawerBoundary open={false}>
        <ConditionalBomb broken={false} onRender={onRender} />
      </DrawerBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(onRender).toHaveBeenCalledTimes(renderCountAfterFailure)

    view.rerender(
      <DrawerBoundary open>
        <ConditionalBomb broken={false} onRender={onRender} />
      </DrawerBoundary>,
    )
    expect(screen.getByText('repaired settings')).toBeTruthy()
    expect(onRender.mock.calls.length).toBeGreaterThan(renderCountAfterFailure)
  })

  it('a still-failing child returns to one fallback without a retry loop', () => {
    const onRender = vi.fn()
    const view = render(
      <DrawerBoundary open>
        <ConditionalBomb broken onRender={onRender} />
      </DrawerBoundary>,
    )
    const firstFailureRenders = onRender.mock.calls.length

    view.rerender(
      <DrawerBoundary open={false}>
        <ConditionalBomb broken onRender={onRender} />
      </DrawerBoundary>,
    )
    view.rerender(
      <DrawerBoundary open>
        <ConditionalBomb broken onRender={onRender} />
      </DrawerBoundary>,
    )
    const reopenedFailureRenders = onRender.mock.calls.length
    expect(reopenedFailureRenders).toBeGreaterThan(firstFailureRenders)
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    view.rerender(
      <DrawerBoundary open>
        <ConditionalBomb broken onRender={onRender} />
      </DrawerBoundary>,
    )
    expect(onRender).toHaveBeenCalledTimes(reopenedFailureRenders)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('does not immediately retry a child that first fails on the current opening edge', () => {
    const onRender = vi.fn()
    const view = render(
      <DrawerBoundary open={false}>
        <OpeningEdgeBomb open={false} onRender={onRender} />
      </DrawerBoundary>,
    )
    expect(screen.getByText('closed settings content')).toBeTruthy()
    const closedRenderCount = onRender.mock.calls.length

    view.rerender(
      <DrawerBoundary open>
        <OpeningEdgeBomb open onRender={onRender} />
      </DrawerBoundary>,
    )

    const renderCountAfterOpeningFailure = onRender.mock.calls.length
    expect(renderCountAfterOpeningFailure).toBe(closedRenderCount + 2)
    expect(consoleErrorSpy.mock.calls.filter(
      (call) => call[0] === '[aurora] settings drawer crashed',
    )).toHaveLength(1)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    view.rerender(
      <DrawerBoundary open>
        <OpeningEdgeBomb open onRender={onRender} />
      </DrawerBoundary>,
    )
    expect(onRender).toHaveBeenCalledTimes(renderCountAfterOpeningFailure)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('preserves healthy child state across close and reopen', () => {
    function StatefulChild() {
      const [count, setCount] = useState(0)
      return <button type="button" onClick={() => setCount((value) => value + 1)}>Count {count}</button>
    }

    const view = render(
      <DrawerBoundary open>
        <StatefulChild />
      </DrawerBoundary>,
    )
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Count 0' }))
    })
    expect(screen.getByRole('button', { name: 'Count 1' })).toBeTruthy()
    view.rerender(
      <DrawerBoundary open={false}>
        <StatefulChild />
      </DrawerBoundary>,
    )
    view.rerender(
      <DrawerBoundary open>
        <StatefulChild />
      </DrawerBoundary>,
    )
    expect(screen.getByRole('button', { name: 'Count 1' })).toBeTruthy()
  })

  it('emits only the fixed bounded diagnostic from componentDidCatch', () => {
    render(
      <DrawerBoundary open>
        <ConditionalBomb broken />
      </DrawerBoundary>,
    )

    const boundaryCalls = consoleErrorSpy.mock.calls.filter(
      (call) => call[0] === '[aurora] settings drawer crashed',
    )
    expect(boundaryCalls).toEqual([['[aurora] settings drawer crashed']])
  })
})
