export const BILLING_RETURN_ORIGIN = 'https://tab-two-billing-return.pages.dev' as const

export type BillingReturnResult = 'success' | 'cancel' | 'billing' | 'neutral'

export interface BillingReturnIntent {
  readonly result: BillingReturnResult
  readonly senderTabId: number
}

export interface BillingReturnResponse {
  readonly status: 'focused' | 'not_found' | 'unavailable'
}

export interface BillingReturnBrowser {
  findTabTwoTabs(): Promise<readonly {
    readonly id: number
    readonly windowId: number
    readonly lastAccessed?: number
  }[]>
  focusWindow(windowId: number): Promise<void>
  activateTab(tabId: number): Promise<void>
}

interface ExternalSender {
  readonly origin?: string
  readonly url?: string
  readonly tab?: { readonly id?: number }
}

const resultForPath = Object.freeze<Record<string, BillingReturnResult>>({
  '/': 'neutral',
  '/success/': 'success',
  '/cancel/': 'cancel',
  '/billing/': 'billing',
})

export function validateBillingReturnMessage(
  message: unknown,
  sender: ExternalSender,
): BillingReturnIntent | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null
  if (Object.getPrototypeOf(message) !== Object.prototype) return null
  const value = message as Record<string, unknown>
  const keys = Object.keys(value)
  if (keys.length !== 2 || !keys.includes('type') || !keys.includes('result')) return null
  if (value.type !== 'tab-two.billing-return.v1') return null
  if (typeof value.result !== 'string') return null
  if (sender.origin !== BILLING_RETURN_ORIGIN || typeof sender.url !== 'string') return null
  if (!Number.isSafeInteger(sender.tab?.id) || (sender.tab?.id ?? -1) < 0) return null

  let url: URL
  try {
    url = new URL(sender.url)
  } catch {
    return null
  }
  if (
    url.origin !== BILLING_RETURN_ORIGIN
    || url.protocol !== 'https:'
    || url.username
    || url.password
    || url.port
    || url.search
    || url.hash
  ) return null

  const pathResult = resultForPath[url.pathname]
  if (!pathResult || value.result !== pathResult) return null
  return Object.freeze({ result: pathResult, senderTabId: sender.tab!.id! })
}

export async function handleBillingReturnMessage(
  _intent: BillingReturnIntent,
  browser: BillingReturnBrowser,
): Promise<BillingReturnResponse> {
  try {
    const tabs = await browser.findTabTwoTabs()
    const target = [...tabs]
      .filter((tab) => Number.isSafeInteger(tab.id) && Number.isSafeInteger(tab.windowId))
      .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0]
    if (!target) return Object.freeze({ status: 'not_found' })
    await browser.focusWindow(target.windowId)
    await browser.activateTab(target.id)
    return Object.freeze({ status: 'focused' })
  } catch {
    return Object.freeze({ status: 'unavailable' })
  }
}
