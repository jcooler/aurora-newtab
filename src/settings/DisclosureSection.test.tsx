// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import DisclosureSection from './DisclosureSection'

describe('DisclosureSection', () => {
  it('starts closed with a named native button and no mounted editor body', () => {
    render(<DisclosureSection title="World clocks"><label>Time zone<input /></label></DisclosureSection>)

    const button = screen.getByRole('button', { name: 'World clocks' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'World clocks' })).toBeNull()
    expect(screen.queryByLabelText('Time zone')).toBeNull()
  })

  it('uses a native button and mounts its associated region when activated', () => {
    render(<DisclosureSection title="Countdowns"><label>Name<input /></label></DisclosureSection>)
    const button = screen.getByRole('button', { name: 'Countdowns' })

    expect(button.tagName).toBe('BUTTON')
    fireEvent.click(button)
    const region = screen.getByRole('region', { name: 'Countdowns' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(region.id).toBe(button.getAttribute('aria-controls'))
    expect(region.getAttribute('aria-labelledby')).toBe(button.id)
    expect(screen.getByLabelText('Name')).toBeTruthy()

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: 'Countdowns' })).toBeNull()
  })
})
