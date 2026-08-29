// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ProgressRing from './ProgressRing'

describe('ProgressRing', () => {
  it('exposes the exact current value and target independently of its color fill', () => {
    render(<ProgressRing value={5} target={8} unit="glasses" />)

    const ring = screen.getByRole('progressbar', { name: '5 of 8 glasses complete' })
    expect(ring.getAttribute('aria-valuemin')).toBe('0')
    expect(ring.getAttribute('aria-valuenow')).toBe('5')
    expect(ring.getAttribute('aria-valuemax')).toBe('8')
    expect(ring.getAttribute('style')).toContain('conic-gradient')
    expect(ring.className).toContain('motion-reduce:transition-none')
  })
})
