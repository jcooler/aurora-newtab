// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PremiumPrompt from './PremiumPrompt'

afterEach(cleanup)

function handlers() {
  return {
    onSignIn: vi.fn(),
    onViewPlans: vi.fn(),
    onContinueFree: vi.fn(),
  }
}

describe('PremiumPrompt', () => {
  it('is an inline signed-out choice with benefit copy and no automatic action', () => {
    const callbacks = handlers()
    render(
      <PremiumPrompt
        title="Sync this layout"
        benefit="Keep this layout available on each signed-in installation."
        signedIn={false}
        {...callbacks}
      />,
    )

    const prompt = screen.getByRole('region', { name: 'Sync this layout' })
    expect(prompt.textContent).toContain('Keep this layout available on each signed-in installation.')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View plans' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue free' })).toBeTruthy()
    expect(callbacks.onSignIn).not.toHaveBeenCalled()
    expect(callbacks.onViewPlans).not.toHaveBeenCalled()
    expect(callbacks.onContinueFree).not.toHaveBeenCalled()
  })

  it('uses native keyboard actions, retains focus, and omits sign-in when already signed in', () => {
    const callbacks = handlers()
    const { rerender } = render(
      <PremiumPrompt
        title="Metrics history"
        benefit="See longer trends."
        signedIn={false}
        {...callbacks}
      />,
    )

    const signIn = screen.getByRole('button', { name: 'Sign in' })
    signIn.focus()
    fireEvent.keyDown(signIn, { key: 'Enter' })
    fireEvent.click(signIn)
    expect(callbacks.onSignIn).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(signIn)

    const plans = screen.getByRole('button', { name: 'View plans' })
    plans.focus()
    fireEvent.keyDown(plans, { key: ' ' })
    fireEvent.click(plans)
    expect(callbacks.onViewPlans).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(plans)

    const continueFree = screen.getByRole('button', { name: 'Continue free' })
    fireEvent.click(continueFree)
    expect(callbacks.onContinueFree).toHaveBeenCalledOnce()

    rerender(
      <PremiumPrompt
        title="Metrics history"
        benefit="See longer trends."
        signedIn
        {...callbacks}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
  })
})
