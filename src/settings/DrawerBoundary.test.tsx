// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import DrawerBoundary from './DrawerBoundary'

function Bomb(): never {
  throw new Error('boom')
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
      <DrawerBoundary>
        <p>settings content</p>
      </DrawerBoundary>,
    )
    expect(screen.getByText('settings content')).toBeTruthy()
  })

  it('a throwing child renders the fallback instead of propagating the error', () => {
    render(
      <div>
        <p>sibling outside the boundary</p>
        <DrawerBoundary>
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
})
