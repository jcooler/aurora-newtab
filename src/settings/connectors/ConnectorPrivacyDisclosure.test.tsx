// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LOCAL_SECRET_STORAGE_NOTICE } from '../../privacy/dataFlows'
import ConnectorPrivacyDisclosure from './ConnectorPrivacyDisclosure'

describe('ConnectorPrivacyDisclosure', () => {
  it('keeps the concise handling statement visible and complete guidance behind one disclosure', () => {
    render(<ConnectorPrivacyDisclosure />)

    expect(
      screen.getByText('Connector details stay in this Chrome profile and are sent only to the services you choose.'),
    ).toBeTruthy()
    const button = screen.getByRole('button', { name: 'How connector data is handled' })
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: 'How connector data is handled' })).toBeNull()

    fireEvent.click(button)
    const region = screen.getByRole('region', { name: 'How connector data is handled' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-controls')).toBe(region.id)
    expect(region.textContent).toContain(LOCAL_SECRET_STORAGE_NOTICE)
    expect(region.textContent).toContain('capability URLs')
    expect(region.textContent).toContain('Disconnecting')
    expect(region.textContent).toContain('clear Tab Two extension data')
  })

  it('renders policy copy only and never logs or receives connector values', () => {
    const token = 'never-render-token-9031'
    const capability = 'https://calendar.example.test/private-9031.ics'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { container } = render(<ConnectorPrivacyDisclosure />)
    fireEvent.click(screen.getByRole('button', { name: 'How connector data is handled' }))

    expect(container.textContent).not.toContain(token)
    expect(container.textContent).not.toContain(capability)
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})
