// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttentionSignal } from '../../lib/attention'
import AttentionContextPanel from './AttentionContextPanel'

const SIGNALS: AttentionSignal[] = [
  { key: 'assignment:github:42', kind: 'assignment', source: 'GitHub', title: 'Review authentication fix', detail: 'acme/aurora · First seen by Aurora 2h ago', timestamp: 1, url: 'https://github.com/acme/aurora/pull/42' },
  { key: 'deployment:aurora', kind: 'deployment', source: 'Vercel', title: 'aurora-newtab', detail: 'Failed 18m ago', timestamp: 2 },
]

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('AttentionContextPanel', () => {
  it('opens on hover and stays open while the pointer moves from trigger to panel', () => {
    render(<AttentionContextPanel summary="2 items need attention" signals={SIGNALS} />)
    const trigger = screen.getByRole('button', { name: '2 items need attention' })
    fireEvent.mouseEnter(trigger)
    const panel = screen.getByRole('region', { name: 'Attention details' })
    expect(screen.getByText(/First seen by Aurora 2h ago/)).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id)
    fireEvent.mouseLeave(trigger)
    fireEvent.mouseEnter(panel)
    act(() => vi.advanceTimersByTime(250))
    expect(screen.getByRole('region', { name: 'Attention details' })).toBeTruthy()
  })

  it('opens on focus, preserves focus transfer, and Escape closes and returns focus', () => {
    render(<AttentionContextPanel summary="2 items need attention" signals={SIGNALS} />)
    const trigger = screen.getByRole('button', { name: '2 items need attention' })
    fireEvent.focus(trigger)
    const link = screen.getByRole('link', { name: /Review authentication fix/ })
    fireEvent.keyDown(trigger, { key: 'Tab' })
    act(() => vi.advanceTimersByTime(250))
    expect(screen.getByRole('region', { name: 'Attention details' })).toBeTruthy()
    expect(document.activeElement).toBe(link)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Attention details' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('toggles on tap or button activation and closes on an outside pointer', () => {
    render(<><AttentionContextPanel summary="2 items need attention" signals={SIGNALS} /><button type="button">Outside</button></>)
    const trigger = screen.getByRole('button', { name: '2 items need attention' })
    fireEvent.click(trigger)
    expect(screen.getByRole('region', { name: 'Attention details' })).toBeTruthy()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('region', { name: 'Attention details' })).toBeNull()
    fireEvent.click(trigger)
    expect(screen.getByRole('region', { name: 'Attention details' })).toBeTruthy()
    fireEvent.click(trigger)
    expect(screen.queryByRole('region', { name: 'Attention details' })).toBeNull()
  })

  it('renders a non-modal safe-link region without a backdrop or focus trap', () => {
    const { container } = render(<AttentionContextPanel summary="2 items need attention" signals={SIGNALS} />)
    fireEvent.click(screen.getByRole('button', { name: '2 items need attention' }))
    const panel = screen.getByRole('region', { name: 'Attention details' })
    const link = screen.getByRole('link', { name: /Review authentication fix/ })
    expect(panel.getAttribute('aria-modal')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('[data-attention-backdrop]')).toBeNull()
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noreferrer')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('clamps the fixed panel to an eight pixel viewport margin and clears pending timers on unmount', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if ((this as HTMLElement).classList.contains('aurora-attention-panel')) {
        return { x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200, toJSON: () => ({}) }
      }
      return { x: 760, y: 570, left: 760, top: 570, right: 795, bottom: 595, width: 35, height: 25, toJSON: () => ({}) }
    })
    const view = render(<AttentionContextPanel summary="2 items need attention" signals={SIGNALS} />)
    const trigger = screen.getByRole('button', { name: '2 items need attention' })
    fireEvent.click(trigger)
    const panel = screen.getByRole('region', { name: 'Attention details' })
    expect(panel.style.position).toBe('fixed')
    expect(Number.parseFloat(panel.style.left)).toBeGreaterThanOrEqual(8)
    expect(Number.parseFloat(panel.style.left) + 300).toBeLessThanOrEqual(792)
    expect(Number.parseFloat(panel.style.top)).toBeGreaterThanOrEqual(8)
    expect(Number.parseFloat(panel.style.top) + 200).toBeLessThanOrEqual(592)
    fireEvent.mouseLeave(trigger)
    view.unmount()
    expect(() => act(() => vi.runOnlyPendingTimers())).not.toThrow()
  })
})
