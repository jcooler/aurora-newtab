import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchWeb } from './search'

describe('searchWeb (chrome.search.query wrapper)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards the text and CURRENT_TAB disposition to chrome.search.query', async () => {
    const query = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('chrome', { search: { query } })

    await searchWeb('cats')

    expect(query).toHaveBeenCalledWith({ text: 'cats', disposition: 'CURRENT_TAB' })
  })

  it('propagates once chrome.search.query resolves', async () => {
    const query = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('chrome', { search: { query } })

    await expect(searchWeb('cats')).resolves.toBeUndefined()
  })

  it('fails quietly (resolves, does not throw) when chrome.search.query rejects', async () => {
    const query = vi.fn().mockRejectedValue(new Error('no default search provider'))
    vi.stubGlobal('chrome', { search: { query } })

    await expect(searchWeb('cats')).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledWith({ text: 'cats', disposition: 'CURRENT_TAB' })
  })
})
