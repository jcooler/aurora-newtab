// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ConnectorDetailDialog from './ConnectorDetailDialog'
import type { ConnectorExperience } from './connectorExperience'

const experience: ConnectorExperience = {
  mark: '31',
  outcome: 'Know what is next and join on time without opening another calendar tab.',
  benefits: ['Upcoming events and countdowns', 'Calendar colors on your agenda', 'One-click meeting links when available'],
  privacySummary: 'Calendar feed addresses stay in this Chrome profile and are excluded from backup exports.',
  categoryLabel: 'Calendar & tasks',
  entitlement: 'included',
}

describe('ConnectorDetailDialog', () => {
  it('explains value and privacy around the existing connector editor', () => {
    render(
      <ConnectorDetailDialog open label="Calendar" mode="edit" experience={experience} onClose={() => {}}>
        <label>Calendar name<input /></label>
      </ConnectorDetailDialog>,
    )

    expect(screen.getByRole('dialog', { name: 'Calendar settings' })).toBeTruthy()
    expect(screen.getByText(experience.outcome)).toBeTruthy()
    for (const benefit of experience.benefits) expect(screen.getByText(benefit)).toBeTruthy()
    expect(screen.getByText(experience.privacySummary)).toBeTruthy()
    expect(screen.getByText('Included today')).toBeTruthy()
    expect(screen.getByLabelText('Calendar name')).toBeTruthy()
  })

  it('closes through its named control and the shared Escape stack', () => {
    const onClose = vi.fn()
    render(
      <ConnectorDetailDialog open label="Calendar" mode="edit" experience={experience} onClose={onClose}>
        <button type="button">Save calendar</button>
      </ConnectorDetailDialog>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close Calendar settings' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders nothing while closed', () => {
    render(
      <ConnectorDetailDialog open={false} label="Calendar" mode="edit" experience={experience} onClose={() => {}}>
        <button type="button">Save calendar</button>
      </ConnectorDetailDialog>,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('labels premium connector details without promising inclusion', () => {
    render(
      <ConnectorDetailDialog
        open
        label="Google Calendar"
        mode="setup"
        experience={{ ...experience, entitlement: 'premium' }}
        onClose={() => {}}
      >
        <button type="button">See premium plans</button>
      </ConnectorDetailDialog>,
    )

    expect(screen.getByText('Premium')).toBeTruthy()
    expect(screen.queryByText('Included today')).toBeNull()
  })
})
