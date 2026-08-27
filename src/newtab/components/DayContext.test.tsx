// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DayContext from './DayContext'

describe('DayContext', () => {
  afterEach(() => vi.useRealTimers())

  it('publishes compact and long local-date labels from one semantic time element', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 16, 11, 33))
    render(<DayContext />)

    const time = screen.getByLabelText('Today, Sunday, August 16')
    expect(time.tagName).toBe('TIME')
    expect(time.getAttribute('dateTime')).toBe('2026-08-16')
    expect(time.querySelector('[data-day-context-compact]')?.textContent).toBe('Sun, Aug 16')
    expect(time.querySelector('[data-day-context-long]')?.textContent).toBe('Sunday, August 16')
  })
})
