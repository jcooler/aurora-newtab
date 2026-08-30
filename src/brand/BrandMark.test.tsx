// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BrandMark from './BrandMark'
import { PRODUCT_NAME, PRODUCT_SLOGAN } from './identity'

describe('Tab Two identity', () => {
  it('keeps the approved product name and slogan behind one shared contract', () => {
    expect(PRODUCT_NAME).toBe('Tab Two')
    expect(PRODUCT_SLOGAN).toBe('The best tab for your second screen.')
  })

  it('renders the shared deterministic mark without duplicating the product name for assistive technology', () => {
    render(<BrandMark label="Tab Two" />)

    const mark = screen.getByRole('img', { name: 'Tab Two' })
    expect(mark.getAttribute('src')).toBe('/icons/tab-two-mark.svg')
    expect(mark.getAttribute('data-tab-two-mark')).toBe('')
  })
})
