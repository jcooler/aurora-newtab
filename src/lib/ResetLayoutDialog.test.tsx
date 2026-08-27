// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ResetLayoutDialog from './ResetLayoutDialog'

afterEach(() => {
  cleanup()
})

describe('ResetLayoutDialog', () => {
  it('renders nothing when closed', () => {
    render(<ResetLayoutDialog open={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders a modal dialog with a plain-language warning when open', () => {
    render(<ResetLayoutDialog open={true} onCancel={vi.fn()} onConfirm={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'Reset layout?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Reset layout?')).toBeTruthy()
    expect(
      screen.getByText("Every widget returns to its default position. This can't be undone."),
    ).toBeTruthy()
  })

  it('focuses Cancel by default — the safe option', () => {
    render(<ResetLayoutDialog open={true} onCancel={vi.fn()} onConfirm={vi.fn()} />)

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('clicking Cancel calls onCancel, not onConfirm', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<ResetLayoutDialog open={true} onCancel={onCancel} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('clicking "Reset layout" calls onConfirm, not onCancel', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<ResetLayoutDialog open={true} onCancel={onCancel} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('clicking the backdrop calls onCancel', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <ResetLayoutDialog open={true} onCancel={onCancel} onConfirm={vi.fn()} />,
    )
    const backdrop = container.ownerDocument.querySelector('[aria-hidden]') as HTMLElement
    fireEvent.click(backdrop)

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('Escape calls onCancel via the shared dialog stack', () => {
    const onCancel = vi.fn()
    render(<ResetLayoutDialog open={true} onCancel={onCancel} onConfirm={vi.fn()} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('does not register on the Escape stack while closed', () => {
    const onCancel = vi.fn()
    render(<ResetLayoutDialog open={false} onCancel={onCancel} onConfirm={vi.fn()} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('Cancel renders before "Reset layout" in DOM order', () => {
    render(<ResetLayoutDialog open={true} onCancel={vi.fn()} onConfirm={vi.fn()} />)

    const buttons = screen.getAllByRole('button')
    const labels = buttons.map((b) => b.textContent)
    expect(labels.indexOf('Cancel')).toBeLessThan(labels.indexOf('Reset layout'))
  })

  it('fits the short viewport with one owned scrollport and 36px actions', () => {
    render(<ResetLayoutDialog open={true} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'Reset layout?' })
    expect(dialog.classList.contains('max-h-[calc(100dvh-1rem)]')).toBe(true)
    expect(dialog.classList.contains('overflow-y-auto')).toBe(true)
    expect(dialog.querySelectorAll('.overflow-y-auto')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Cancel' }).classList.contains('min-h-9')).toBe(true)
    expect(screen.getByRole('button', { name: 'Reset layout' }).classList.contains('min-h-9')).toBe(true)
  })
})
