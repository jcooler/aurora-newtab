// Focused real-extension proof for W1-P4's post-restore refresh boundary.
// Requires `npm run build:preview`. It holds the pre-restore RSS request,
// atomically disables RSS + resets derived caches, waits until the app has
// observed that state, then releases the old response and proves the stale
// completion cannot repopulate connectorSnapshots.rss.
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-w1-p4-refresh-fence')
const oldRssUrl = 'https://api.nasa.gov/w1-p4/old-rss.xml'
const apodUrl = 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY'
rmSync(profileDir, { recursive: true, force: true })

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1200, height: 700 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})

const deferred = () => {
  let resolvePromise
  const promise = new Promise((resolve) => { resolvePromise = resolve })
  return { promise, resolve: resolvePromise }
}

const rssHeld = deferred()
const apodHeld = deferred()
let heldRssRoute = null
const heldApodRoutes = []
const page = await context.newPage()

await page.route(oldRssUrl, (route) => {
  heldRssRoute = route
  rssHeld.resolve()
})
await page.route(apodUrl, (route) => {
  heldApodRoutes.push(route)
  apodHeld.resolve()
})

const deadline = (label) => new Promise((_, reject) => {
  setTimeout(() => reject(new Error(`W1-P4 focused probe timed out waiting for ${label}`)), 10_000)
})

try {
  await page.goto('chrome://newtab/')
  await page.waitForSelector('main[data-adaptive-stage]')
  const today = await page.evaluate(() => {
    const value = new Date()
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  })

  await page.evaluate(async ({ oldRssUrl }) => {
    const current = await chrome.storage.local.get(['settings', 'connectors'])
    await chrome.storage.local.set({
      settings: current.settings,
      connectors: {
        ...current.connectors,
        rss: { enabled: true, feeds: [oldRssUrl], shownCount: 5 },
      },
      connectorSnapshots: {
        rss: { fetchedAt: 1, data: [] },
      },
      photoPrefs: { mode: 'apod', index: 0, lastRotated: '2026-08-13' },
      apodCache: {
        date: '2026-08-13',
        photo: { url: 'https://apod.nasa.gov/apod/image/stale.jpg', title: 'Stale' },
      },
    })
  }, { oldRssUrl })

  await Promise.all([
    Promise.race([rssHeld.promise, deadline('the old RSS owner')]),
    Promise.race([apodHeld.promise, deadline('the active APOD owner')]),
  ])

  await page.evaluate(async ({ today }) => {
    const current = await chrome.storage.local.get(['connectors'])
    await chrome.storage.local.set({
      connectors: {
        ...current.connectors,
        rss: { enabled: false, feeds: [], shownCount: 5 },
      },
      connectorSnapshots: {},
      photoPrefs: { mode: 'apod', index: 0, lastRotated: today },
      apodCache: null,
    })
  }, { today })

  const exactAtCommit = await page.evaluate(async () => {
    const value = await chrome.storage.local.get(['connectors', 'connectorSnapshots', 'apodCache'])
    return value.connectors?.rss?.enabled === false &&
      Object.keys(value.connectorSnapshots ?? {}).length === 0 && value.apodCache === null
  })
  await page.waitForFunction(() => chrome.storage.local.get(['connectors']).then(({ connectors }) =>
    connectors?.rss?.enabled === false && !document.querySelector('[data-block-id="rss"]')))

  const responsePromise = page.waitForResponse((response) => response.url() === oldRssUrl)
  await heldRssRoute.fulfill({
    status: 200,
    contentType: 'application/rss+xml',
    headers: { 'access-control-allow-origin': '*' },
    body: '<?xml version="1.0"?><rss version="2.0"><channel><title>Old owner</title><item><title>Must stay stale</title><link>https://example.test/stale-after-restore</link></item></channel></rss>',
  })
  heldRssRoute = null
  await (await responsePromise).finished()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

  const afterOldCompletion = await page.evaluate(async () => {
    const value = await chrome.storage.local.get(['connectors', 'connectorSnapshots', 'apodCache'])
    return {
      rssEnabled: value.connectors?.rss?.enabled,
      snapshotIds: Object.keys(value.connectorSnapshots ?? {}),
      rssSnapshot: value.connectorSnapshots?.rss ?? null,
      apodCache: value.apodCache,
    }
  })
  const staleOldRssRejected = afterOldCompletion.rssEnabled === false &&
    afterOldCompletion.rssSnapshot === null && afterOldCompletion.apodCache === null
  if (!exactAtCommit || !staleOldRssRejected) {
    throw new Error(`W1-P4 focused refresh fence failed: ${JSON.stringify({ exactAtCommit, afterOldCompletion })}`)
  }
  console.log(`W1_P4_RESTORE_REFRESH_FENCE=${JSON.stringify({
    exactAtCommit,
    oldRssObservedDisabled: true,
    staleOldRssRejected,
    oldRssUrl,
    heldActiveApodRequests: heldApodRoutes.length,
    afterOldCompletion,
  })}`)
} finally {
  if (heldRssRoute) await heldRssRoute.abort().catch(() => undefined)
  await Promise.allSettled(heldApodRoutes.map((route) => route.abort()))
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
}
