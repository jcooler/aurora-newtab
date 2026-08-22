// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkDockDetail, WorkWidgetShell } from './WorkWidgetShell'
import type { WorkPresentationState } from './workPresentation'

const CASES: Array<[WorkPresentationState, string]> = [
  ['setup', 'Connect Linear in Settings.'],
  ['loading', 'Loading Linear…'],
  ['empty', 'No assigned issues.'],
  ['hard-error', 'Linear is unavailable.'],
  ['retained-error', 'Linear is unavailable.'],
  ['stale', 'Showing saved data while Linear refreshes.'],
  ['ready', 'ISS-42'],
]

describe('WorkWidgetShell', () => {
  it.each<WorkPresentationState>(['setup', 'loading', 'empty', 'hard-error'])(
    'shrinks the %s no-row state to its useful content',
    (presentation) => {
      render(
        <WorkWidgetShell
          title="Linear"
          canvasSize="full"
          presentation={presentation}
          emptyLabel="No assigned issues."
          errorMessage="Linear is unavailable."
        >
          <p>ISS-42</p>
        </WorkWidgetShell>,
      )
      expect(screen.getByRole('region', { name: 'Linear' }).className).toContain('w-max')
    },
  )

  it('keeps data-bearing states on their requested tier width', () => {
    render(
      <WorkWidgetShell
        title="Linear"
        canvasSize="full"
        presentation="ready"
        emptyLabel="No assigned issues."
      >
        <p>ISS-42</p>
      </WorkWidgetShell>,
    )
    const shell = screen.getByRole('region', { name: 'Linear' })
    expect(shell.className).toContain('w-[min(30rem,calc(100vw_-_2rem))]')
    expect(shell.className).not.toContain('w-max')
  })

  it.each(CASES)('renders %s without a blank shell', (presentation, expected) => {
    render(
      <WorkWidgetShell
        title="Linear"
        canvasSize="standard"
        presentation={presentation}
        emptyLabel="No assigned issues."
        errorMessage="Linear is unavailable."
      >
        <p>ISS-42</p>
      </WorkWidgetShell>,
    )
    expect(screen.getByText(expected)).toBeTruthy()
  })

  it('keeps retained data visible with retry and bounds Full results to a local scrollport', () => {
    const refresh = vi.fn()
    render(
      <WorkWidgetShell
        title="Linear"
        canvasSize="full"
        presentation="retained-error"
        emptyLabel="No assigned issues."
        errorMessage="Latest update failed. Showing saved data."
        onRefresh={refresh}
      >
        <p>ISS-42</p>
      </WorkWidgetShell>,
    )
    expect(screen.getByText('ISS-42')).toBeTruthy()
    const scrollport = document.querySelector('[data-work-widget-scroll]')
    expect(scrollport?.className).toContain('overflow-y-auto')
    expect(scrollport?.className).toContain('max-h-')
    screen.getByRole('button', { name: 'Refresh Linear' }).click()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('opens the same truthful dock detail by keyboard, closes on Escape, and restores focus', async () => {
    const refresh = vi.fn()
    render(
      <WorkDockDetail
        label="Linear"
        facts={['3 assigned', '1 due']}
        presentation="retained-error"
        emptyLabel="No assigned issues."
        errorMessage="Latest update failed. Showing saved data."
        onRefresh={refresh}
      >
        <p>ISS-42</p>
      </WorkDockDetail>,
    )

    const trigger = screen.getByRole('button', { name: 'Linear: 3 assigned, 1 due' })
    trigger.focus()
    await act(async () => { trigger.click() })
    expect(screen.getByRole('dialog', { name: 'Linear details' })).toBeTruthy()
    expect(screen.getByText('ISS-42')).toBeTruthy()
    expect(screen.getByText('Latest update failed. Showing saved data.')).toBeTruthy()
    screen.getByRole('button', { name: 'Refresh Linear' }).click()
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('renders nothing for an empty dock fact set', () => {
    const { container } = render(
      <WorkDockDetail
        label="Linear"
        facts={['', null, false]}
        presentation="empty"
        emptyLabel="No assigned issues."
      >
        <p>rows</p>
      </WorkDockDetail>,
    )
    expect(container.innerHTML).toBe('')
  })
})
