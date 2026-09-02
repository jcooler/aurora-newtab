import {
  handleBillingReturnMessage,
  validateBillingReturnMessage,
  type BillingReturnBrowser,
  type BillingReturnResponse,
} from '../account/billingReturnBridge'

interface RuntimeSender {
  readonly origin?: string
  readonly url?: string
  readonly tab?: { readonly id?: number }
}

type SendResponse = (response: BillingReturnResponse) => void

export function createBillingReturnListener(browser: BillingReturnBrowser) {
  return (message: unknown, sender: RuntimeSender, sendResponse: SendResponse): boolean => {
    const intent = validateBillingReturnMessage(message, sender)
    if (!intent) return false
    void handleBillingReturnMessage(intent, browser).then(sendResponse)
    return true
  }
}

function chromeBillingReturnBrowser(): BillingReturnBrowser {
  return {
    async findTabTwoTabs() {
      const extensionPage = `${chrome.runtime.getURL('src/newtab/index.html')}*`
      const tabs = await chrome.tabs.query({ url: extensionPage })
      return tabs.flatMap((tab) => (
        Number.isSafeInteger(tab.id) && Number.isSafeInteger(tab.windowId)
          ? [{ id: tab.id!, windowId: tab.windowId, lastAccessed: tab.lastAccessed }]
          : []
      ))
    },
    async focusWindow(windowId) {
      await chrome.windows.update(windowId, { focused: true })
    },
    async activateTab(tabId) {
      await chrome.tabs.update(tabId, { active: true })
    },
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener(createBillingReturnListener(chromeBillingReturnBrowser()))
}
