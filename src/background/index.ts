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

interface ChromeBillingReturnApi {
  extensionUrl(path: string): string
  extensionContexts(documentUrl: string): Promise<readonly {
    readonly tabId: number
    readonly windowId: number
    readonly documentUrl?: string
  }[]>
  tabActivity(tabId: number): Promise<{
    readonly id?: number
    readonly windowId: number
    readonly lastAccessed?: number
  }>
  focusWindow(windowId: number): Promise<void>
  activateTab(tabId: number): Promise<void>
}

export function createBillingReturnListener(browser: BillingReturnBrowser) {
  return (message: unknown, sender: RuntimeSender, sendResponse: SendResponse): boolean => {
    const intent = validateBillingReturnMessage(message, sender)
    if (!intent) return false
    void handleBillingReturnMessage(intent, browser).then(sendResponse)
    return true
  }
}

export function createChromeBillingReturnBrowser(api: ChromeBillingReturnApi): BillingReturnBrowser {
  return {
    async findTabTwoTabs() {
      const extensionPage = api.extensionUrl('src/newtab/index.html')
      const contexts = await api.extensionContexts(extensionPage)
      const uniqueContexts = [...new Map(contexts
        .filter((context) => context.documentUrl === extensionPage
          && Number.isSafeInteger(context.tabId) && context.tabId >= 0
          && Number.isSafeInteger(context.windowId) && context.windowId >= 0)
        .map((context) => [context.tabId, context])).values()]
      const activities = await Promise.all(uniqueContexts.map(async (context) => ({
        context,
        tab: await api.tabActivity(context.tabId),
      })))
      return activities.flatMap(({ context, tab }) => (
        tab.id === context.tabId && tab.windowId === context.windowId
          ? [{ id: context.tabId, windowId: context.windowId, lastAccessed: tab.lastAccessed }]
          : []
      ))
    },
    async focusWindow(windowId) {
      await api.focusWindow(windowId)
    },
    async activateTab(tabId) {
      await api.activateTab(tabId)
    },
  }
}

function chromeBillingReturnBrowser(): BillingReturnBrowser {
  return createChromeBillingReturnBrowser({
    extensionUrl: (path) => chrome.runtime.getURL(path),
    async extensionContexts(documentUrl) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['TAB'],
        documentUrls: [documentUrl],
      })
      return contexts.map((context) => ({
        tabId: context.tabId,
        windowId: context.windowId,
        documentUrl: context.documentUrl,
      }))
    },
    async tabActivity(tabId) {
      const tab = await chrome.tabs.get(tabId)
      return { id: tab.id, windowId: tab.windowId, lastAccessed: tab.lastAccessed }
    },
    async focusWindow(windowId) {
      await chrome.windows.update(windowId, { focused: true })
    },
    async activateTab(tabId) {
      await chrome.tabs.update(tabId, { active: true })
    },
  })
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener(createBillingReturnListener(chromeBillingReturnBrowser()))
}
