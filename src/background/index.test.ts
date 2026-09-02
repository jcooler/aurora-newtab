import { describe, expect, it, vi } from 'vitest'
import { createBillingReturnListener } from './index'

describe('billing return external listener', () => {
  it('responds once after a valid hosted message focuses Tab Two', async () => {
    const sendResponse = vi.fn()
    const listener = createBillingReturnListener({
      findTabTwoTabs: vi.fn(async () => [{ id: 12, windowId: 5, lastAccessed: 100 }]),
      focusWindow: vi.fn(async () => {}),
      activateTab: vi.fn(async () => {}),
    })

    expect(listener(
      { type: 'tab-two.billing-return.v1', result: 'success' },
      {
        origin: 'https://tab-two-billing-return.pages.dev',
        url: 'https://tab-two-billing-return.pages.dev/success/',
        tab: { id: 19 },
      },
      sendResponse,
    )).toBe(true)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce())
    expect(sendResponse).toHaveBeenCalledWith({ status: 'focused' })
  })

  it('rejects an untrusted sender synchronously without touching tabs', () => {
    const browser = {
      findTabTwoTabs: vi.fn(async () => []),
      focusWindow: vi.fn(async () => {}),
      activateTab: vi.fn(async () => {}),
    }
    const sendResponse = vi.fn()

    expect(createBillingReturnListener(browser)(
      { type: 'tab-two.billing-return.v1', result: 'success' },
      { origin: 'https://attacker.example', url: 'https://attacker.example/success/', tab: { id: 19 } },
      sendResponse,
    )).toBe(false)
    expect(sendResponse).not.toHaveBeenCalled()
    expect(browser.findTabTwoTabs).not.toHaveBeenCalled()
  })
})
