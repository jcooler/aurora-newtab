// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditSession } from '../../lib/layout/editSession'
import EditToolbar from './EditToolbar'

const document = {
  version: 1 as const,
  activeLayoutId: 'layout',
  layouts: [{ id: 'layout', name: 'Layout', widgets: {} }],
}

function session(): EditSession {
  return { baseline: document, draft: document, selection: null, past: [], dirty: false }
}

describe('EditToolbar', () => {
  afterEach(cleanup)

  it('collapses hidden-widget recovery into one disclosure instead of widening the toolbar', () => {
    const onRestoreHidden = vi.fn()
    render(
      <EditToolbar
        session={session()}
        hiddenWidgets={[
          { id: 'weather', label: 'Weather' },
          { id: 'clock', label: 'Clock' },
          { id: 'github', label: 'GitHub' },
        ]}
        onRestoreHidden={onRestoreHidden}
        onSwitchLayout={vi.fn()}
        onBulkTier={vi.fn()}
        onUndo={vi.fn()}
        onReset={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    const summary = screen.getByText('Hidden 3')
    const disclosure = summary.closest('details') as HTMLDetailsElement | null
    expect(disclosure).toBeTruthy()
    expect(disclosure?.open).toBe(false)
    expect(disclosure?.querySelectorAll('button')).toHaveLength(3)

    fireEvent.click(summary)
    expect(disclosure?.open).toBe(true)
    fireEvent.click(disclosure!.querySelector<HTMLButtonElement>('[aria-label="Show Weather"]')!)
    expect(onRestoreHidden).toHaveBeenCalledWith('weather')
  })
})
