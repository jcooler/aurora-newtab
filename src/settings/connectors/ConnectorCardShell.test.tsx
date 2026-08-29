// @vitest-environment jsdom
import { useEffect, useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ConnectorCardMode, ConnectorCardPresentation } from './connectorCardState'
import ConnectorCardShell from './ConnectorCardShell'
import type { ConnectorExperience } from './connectorExperience'

const experience: ConnectorExperience = {
  mark: 'GH',
  outcome: 'Keep contributions, reviews, issues, and notifications visible while you work.',
  benefits: ['See your contribution activity', 'Watch review and issue workload', 'Choose the GitHub views that matter'],
  privacySummary: 'Your GitHub token stays in this Chrome profile and is removed from backup exports.',
  categoryLabel: 'Development',
  entitlement: 'included',
}

const unconfigured: ConnectorCardPresentation = {
  configured: false,
  visible: false,
  state: 'unconfigured',
  stateLabel: 'Not set up',
  identityLabel: null,
  primaryAction: 'setup',
  primaryActionLabel: 'Set up',
  mode: 'setup',
  showVisibilityControl: false,
  group: 'available',
  openImmediately: false,
}

const configured: ConnectorCardPresentation = {
  configured: true,
  visible: true,
  state: 'configured-visible',
  stateLabel: 'On canvas',
  identityLabel: 'Connected as octocat',
  primaryAction: 'edit',
  primaryActionLabel: 'Edit',
  mode: 'edit',
  showVisibilityControl: true,
  group: 'on-canvas',
  openImmediately: false,
}

function Harness({ presentation = unconfigured }: { presentation?: ConnectorCardPresentation }) {
  const [mode, setMode] = useState<ConnectorCardMode | null>(null)
  const restore = useRef<HTMLElement | null>(null)
  const pendingRestore = useRef(false)

  useEffect(() => {
    if (!mode && pendingRestore.current) {
      pendingRestore.current = false
      restore.current?.focus()
    }
  }, [mode])

  return (
    <ConnectorCardShell
      id="github"
      label="GitHub"
      blurb="Pull requests and issues"
      experience={experience}
      presentation={presentation}
      activeMode={mode}
      onOpen={(next, invoker) => {
        restore.current = invoker
        setMode(next)
      }}
      onClose={(invoker) => {
        restore.current = invoker
        pendingRestore.current = true
        setMode(null)
      }}
      onVisibilityChange={() => {}}
    >
      <label>Token<input /></label>
    </ConnectorCardShell>
  )
}

describe('ConnectorCardShell', () => {
  it('shows truthful compact setup state without an unconfigured visibility switch', () => {
    render(<Harness />)

    expect(screen.getByRole('heading', { name: 'GitHub' })).toBeTruthy()
    expect(screen.getByText('GH')).toBeTruthy()
    expect(screen.getByText('Development')).toBeTruthy()
    expect(screen.getByText(experience.outcome)).toBeTruthy()
    expect(screen.queryByText('Pull requests and issues')).toBeNull()
    expect(screen.getByText('Not set up')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Set up GitHub' })).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Show GitHub on Canvas' })).toBeNull()
    expect(screen.queryByLabelText('Token')).toBeNull()

    const card = screen.getByRole('heading', { name: 'GitHub' }).closest('article')
    expect(card?.className).toContain('min-h-')
  })

  it('shows configured identity, Show on Canvas, and Edit without painting the body', () => {
    render(<Harness presentation={configured} />)

    expect(screen.getByText('On canvas')).toBeTruthy()
    expect(screen.getByText('Connected as octocat')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Show GitHub on Canvas' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit GitHub' })).toBeTruthy()
    expect(screen.queryByLabelText('Token')).toBeNull()
  })

  it('opens one labelled body and Close editor restores focus to the exact action', () => {
    render(<Harness presentation={configured} />)
    const edit = screen.getByRole('button', { name: 'Edit GitHub' })

    fireEvent.click(edit)
    const dialog = screen.getByRole('dialog', { name: 'GitHub settings' })
    expect(dialog).toBeTruthy()
    expect(within(dialog).getByText(experience.outcome)).toBeTruthy()
    expect(screen.getByLabelText('Token')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close GitHub settings' }))
    expect(screen.queryByRole('dialog', { name: 'GitHub settings' })).toBeNull()
    expect(document.activeElement).toBe(edit)
  })

  it('maps the visibility switch without changing configuration itself', () => {
    const change = vi.fn()
    render(
      <ConnectorCardShell
        id="github"
        label="GitHub"
        blurb="Pull requests and issues"
        experience={experience}
        presentation={configured}
        activeMode={null}
        onOpen={() => {}}
        onClose={() => {}}
        onVisibilityChange={change}
      />,
    )

    fireEvent.click(screen.getByRole('switch', { name: 'Show GitHub on Canvas' }))
    expect(change).toHaveBeenCalledWith(false)
  })

  it('keeps reconnect content immediate and labels it as recovery', () => {
    render(
      <ConnectorCardShell
        id="github"
        label="GitHub"
        blurb="Pull requests and issues"
        experience={experience}
        presentation={{
          ...unconfigured,
          state: 'reconnect-required',
          stateLabel: 'Reconnect required',
          identityLabel: 'Connected as octocat',
          primaryAction: 'reconnect',
          primaryActionLabel: 'Reconnect',
          mode: 'reconnect',
          openImmediately: true,
        }}
        activeMode="reconnect"
        onOpen={() => {}}
        onClose={() => {}}
        onVisibilityChange={() => {}}
      >
        <label>Token<input /></label>
      </ConnectorCardShell>,
    )

    expect(screen.getByText('Reconnect required')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Show GitHub on Canvas' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'GitHub reconnect' })).toBeTruthy()
    expect(screen.getByLabelText('Token')).toBeTruthy()
  })
})
