// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DockLine from './DockLine'

describe('DockLine', () => {
  it('renders surviving facts with middle-dot separators and one accessible name', () => {
    render(<DockLine label="GitHub" facts={['7 commits', null, '2 PRs']} tone="attention" />)
    const line = screen.getByLabelText('GitHub: 7 commits, 2 PRs')
    expect(line.textContent).toBe('7 commits·2 PRs')
    expect(line.querySelectorAll('[aria-hidden]')).toHaveLength(1)
    expect(line.getAttribute('data-dock-line')).toBe('')
  })

  it('renders nothing when no fact survives (no-whitespace law)', () => {
    const { container } = render(<DockLine label="GitHub" facts={[null, undefined, false, '']} />)
    expect(container.firstChild).toBeNull()
  })
})
