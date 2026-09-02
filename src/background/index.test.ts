import { describe, expect, it, vi } from 'vitest'
import { createBillingReturnListener, createChromeBillingReturnBrowser } from './index'

describe('billing return external listener', () => {
  it('discovers only Tab Two extension contexts without reading protected tab URLs', async () => {
    const api = {
      extensionUrl: vi.fn(() => 'chrome-extension://tab-two/src/newtab/index.html'),
      extensionContexts: vi.fn(async () => [
        { tabId: 12, windowId: 5, documentUrl: 'chrome-extension://tab-two/src/newtab/index.html' },
        { tabId: 18, windowId: 7, documentUrl: 'chrome-extension://tab-two/src/newtab/index.html' },
      ]),
      tabActivity: vi.fn(async (tabId: number) => ({
        id: tabId, windowId: tabId === 12 ? 5 : 7, lastAccessed: tabId === 12 ? 100 : 300,
      })),
      focusWindow: vi.fn(async () => {}),
      activateTab: vi.fn(async () => {}),
    }

    const browser = createChromeBillingReturnBrowser(api)

    await expect(browser.findTabTwoTabs()).resolves.toEqual([
      { id: 12, windowId: 5, lastAccessed: 100 },
      { id: 18, windowId: 7, lastAccessed: 300 },
    ])
    expect(api.extensionContexts).toHaveBeenCalledWith(
      'chrome-extension://tab-two/src/newtab/index.html',
    )
    expect(api.tabActivity).toHaveBeenCalledTimes(2)
  })

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
