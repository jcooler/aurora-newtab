// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttentionSignal } from '../../lib/attention'
import AttentionContextPanel from './AttentionContextPanel'

const SIGNALS: AttentionSignal[] = [
  { key: 'assignment:github:42', kind: 'assignment', source: 'GitHub', title: 'Review authentication fix', detail: 'acme/aurora · First seen by Tab Two 2h ago', timestamp: 1, url: 'https://github.com/acme/aurora/pull/42' },
  { key: 'deployment:aurora', kind: 'deployment', source: 'Vercel', title: 'aurora-newtab', detail: 'Failed 18m ago', timestamp: 2 },
]

const CALENDAR_SIGNAL = {
  key: 'calendar:1:first-game',
  kind: 'calendar',
  source: 'Calendar',
  title: 'Kennedy’s first game in 21h',
  panelTitle: 'Kennedy’s first game',
  status: 'In 21h',
  detail: 'Starts tomorrow at 7:00 AM',
  timestamp: 1,
} as AttentionSignal

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('AttentionContextPanel', () => {
  it('opens on hover and stays open while the pointer moves from trigger to panel', () => {
    render(<AttentionContextPanel summary="2 items need attention" signals={SIGNALS} />)
    const trigger = screen.getByRole('button', { name: '2 items need attention' })
    fireEvent.mouseEnter(trigger)
    const panel = screen.getByRole('region', { name: 'Attention details' })
    expect(screen.getByText(/First seen by Tab Two 2h ago/)).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id)
    fireEvent.mouseLeave(trigger)
    fireEvent.mouseEnter(panel)
    act(() => vi.advanceTimersByTime(250))
    expect(screen.getByRole('region', { name: 'Attention details' })).toBeTruthy()
  })

  it('renders Calendar context as a source, timing status, wrapping title, and useful detail without a false link', () => {
    render(<AttentionContextPanel summary="Kennedy’s first game in 21h" signals={[CALENDAR_SIGNAL]} />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Kennedy’s first game in 21h' }))
    const row = screen.getByRole('listitem')

    expect(row.getAttribute('data-attention-kind')).toBe('calendar')
    expect(screen.getByText('Calendar')).toBeTruthy()
    expect(screen.getByText('In 21h')).toBeTruthy()
    expect(screen.getByText('Kennedy’s first game', { selector: '.aurora-attention-panel__title' })).toBeTruthy()
    expect(screen.getByText('Starts tomorrow at 7:00 AM')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('pins a hover-open panel on click and unpins it on the next click', () => {
    render(<AttentionContextPanel summary="2 items need attention" signals={SIGNALS} />)
    const trigger = screen.getByRole('button', { name: '2 items need attention' })
    fireEvent.mouseEnter(trigger)
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-pressed')).toBe('true')

    fireEvent.mouseLeave(trigger)
    act(() => vi.advanceTimersByTime(250))
    expect(screen.getByRole('region', { name: 'Attention details' })).toBeTruthy()

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('region', { name: 'Attention details' })).toBeNull()
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

  it('reopens when keyboard focus returns after Escape closed an already-focused trigger', () => {
    render(<><AttentionContextPanel summary="2 items need attention" signals={SIGNALS} /><button type="button">Outside</button></>)
    const trigger = screen.getByRole('button', { name: '2 items need attention' })
    const outside = screen.getByRole('button', { name: 'Outside' })
    act(() => trigger.focus())
    expect(screen.getByRole('region', { name: 'Attention details' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Attention details' })).toBeNull()
    act(() => outside.focus())
    act(() => trigger.focus())
    expect(screen.getByRole('region', { name: 'Attention details' })).toBeTruthy()
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
    expect(link.querySelector('[data-attention-link-cue]')).toBeTruthy()
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
