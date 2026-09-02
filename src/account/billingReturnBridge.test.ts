import { describe, expect, it, vi } from 'vitest'
import {
  handleBillingReturnMessage,
  validateBillingReturnMessage,
  type BillingReturnBrowser,
} from './billingReturnBridge'

const validSender = Object.freeze({
  origin: 'https://tab-two-billing-return.pages.dev',
  url: 'https://tab-two-billing-return.pages.dev/success/',
  tab: Object.freeze({ id: 91 }),
})

describe('validateBillingReturnMessage', () => {
  it('accepts the exact hosted success return without treating it as billing authority', () => {
    expect(validateBillingReturnMessage({
      type: 'tab-two.billing-return.v1',
      result: 'success',
    }, validSender)).toEqual({ result: 'success', senderTabId: 91 })
  })

  it.each([
    ['wrong origin', validSender, { ...validSender, origin: 'https://attacker.example' }],
    ['wrong host', validSender, { ...validSender, url: 'https://tab-two-billing-return.pages.dev.attacker.example/success/' }],
    ['user info', validSender, { ...validSender, url: 'https://user@tab-two-billing-return.pages.dev/success/' }],
    ['non-default port', validSender, { ...validSender, url: 'https://tab-two-billing-return.pages.dev:444/success/' }],
    ['query-selected state', validSender, { ...validSender, url: 'https://tab-two-billing-return.pages.dev/success/?result=cancel' }],
    ['fragment-selected state', validSender, { ...validSender, url: 'https://tab-two-billing-return.pages.dev/success/#cancel' }],
    ['missing sender tab', validSender, { ...validSender, tab: undefined }],
  ])('rejects %s', (_name, _baseline, sender) => {
    expect(validateBillingReturnMessage({ type: 'tab-two.billing-return.v1', result: 'success' }, sender)).toBeNull()
  })

  it.each([
    [{ type: 'tab-two.billing-return.v1', result: 'billing' }, validSender],
    [{ type: 'tab-two.billing-return.v1', result: 'success', accountId: 'attacker' }, validSender],
    [{ type: 'tab-two.billing-return.v2', result: 'success' }, validSender],
    [{ type: 'tab-two.billing-return.v1', result: 'paid' }, validSender],
    [Object.create({ type: 'tab-two.billing-return.v1', result: 'success' }), validSender],
  ])('rejects a mismatched or non-exact payload', (message, sender) => {
    expect(validateBillingReturnMessage(message, sender)).toBeNull()
  })

  it.each([
    ['/', 'neutral'],
    ['/success/', 'success'],
    ['/cancel/', 'cancel'],
    ['/billing/', 'billing'],
  ] as const)('binds %s to %s', (pathname, result) => {
    expect(validateBillingReturnMessage(
      { type: 'tab-two.billing-return.v1', result },
      { ...validSender, url: `https://tab-two-billing-return.pages.dev${pathname}` },
    )).toEqual({ result, senderTabId: 91 })
  })
})

describe('handleBillingReturnMessage', () => {
  function browser(tabs: Awaited<ReturnType<BillingReturnBrowser['findTabTwoTabs']>>): BillingReturnBrowser {
    return {
      findTabTwoTabs: vi.fn(async () => tabs),
      focusWindow: vi.fn(async () => {}),
      activateTab: vi.fn(async () => {}),
    }
  }

  it('focuses the most recently used Tab Two tab and leaves account state untouched', async () => {
    const api = browser([
      { id: 7, windowId: 2, lastAccessed: 40 },
      { id: 8, windowId: 3, lastAccessed: 90 },
    ])

    await expect(handleBillingReturnMessage({ result: 'success', senderTabId: 91 }, api)).resolves.toEqual({ status: 'focused' })
    expect(api.focusWindow).toHaveBeenCalledWith(3)
    expect(api.activateTab).toHaveBeenCalledWith(8)
  })

  it('reports no existing Tab Two tab without creating or closing anything', async () => {
    const api = browser([])
    await expect(handleBillingReturnMessage({ result: 'neutral', senderTabId: 91 }, api)).resolves.toEqual({ status: 'not_found' })
    expect(api.focusWindow).not.toHaveBeenCalled()
    expect(api.activateTab).not.toHaveBeenCalled()
  })

  it('fails closed when browser focus is unavailable', async () => {
    const api = browser([{ id: 8, windowId: 3, lastAccessed: 90 }])
    vi.mocked(api.focusWindow).mockRejectedValue(new Error('browser unavailable'))
    await expect(handleBillingReturnMessage({ result: 'billing', senderTabId: 91 }, api)).resolves.toEqual({ status: 'unavailable' })
    expect(api.activateTab).not.toHaveBeenCalled()
  })
})
