import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const BILLING_RETURN_ORIGIN = 'https://tab-two-billing-return.pages.dev'

export const BILLING_RETURN_ROUTES = Object.freeze({
  '/': Object.freeze({ result: 'neutral', title: 'Return to Tab Two', heading: 'Return to your second screen.' }),
  '/success/': Object.freeze({ result: 'success', title: 'Payment received | Tab Two', heading: 'Your first year is ready.' }),
  '/cancel/': Object.freeze({ result: 'cancel', title: 'Checkout closed | Tab Two', heading: 'Nothing changed.' }),
  '/billing/': Object.freeze({ result: 'billing', title: 'Billing updated | Tab Two', heading: 'Back to your second screen.' }),
})

const requiredCsp = Object.freeze([
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
])

export async function inspectBillingReturnResponse(route, response) {
  const expected = BILLING_RETURN_ROUTES[route]
  assert.ok(expected, `unexpected route ${route}`)
  assert.equal(response.status, 200, `${route} must return 200 directly`)
  assert.match(response.headers.get('content-type') ?? '', /^text\/html;\s*charset=utf-8$/iu)
  const csp = response.headers.get('content-security-policy') ?? ''
  for (const directive of requiredCsp) assert.ok(csp.includes(directive), `${route} missing CSP ${directive}`)
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  assert.match(response.headers.get('cache-control') ?? '', /(?:^|,\s*)no-store(?:,|$)/u)
  assert.equal(response.headers.get('set-cookie'), null)

  const body = await response.text()
  assert.ok(body.includes(`<title>${expected.title}</title>`), `${route} title mismatch`)
  assert.ok(body.includes(`data-result="${expected.result}"`), `${route} result mismatch`)
  assert.ok(body.includes(`<h1>${expected.heading}</h1>`), `${route} heading mismatch`)
  assert.doesNotMatch(body, /(?:https?:)?\/\//iu)
  return Object.freeze({ route, status: response.status, cookies: false, bytes: Buffer.byteLength(body) })
}

export async function probeBillingReturnSite(fetchImpl = fetch) {
  const evidence = []
  for (const route of Object.keys(BILLING_RETURN_ROUTES)) {
    const response = await fetchImpl(`${BILLING_RETURN_ORIGIN}${route}`, {
      redirect: 'error',
      cache: 'no-store',
      headers: { accept: 'text/html' },
    })
    evidence.push(await inspectBillingReturnResponse(route, response))
  }
  return Object.freeze(evidence)
}

export async function probeBillingReturnVisuals({
  origin = BILLING_RETURN_ORIGIN,
  outputDirectory = join(tmpdir(), 'tab-two-billing-return-qa'),
} = {}) {
  const { chromium } = await import('playwright')
  mkdirSync(outputDirectory, { recursive: true })
  const scenarios = Object.freeze([
    { name: 'neutral-desktop', route: '/', width: 1440, height: 900 },
    { name: 'success-desktop', route: '/success/', width: 1440, height: 900 },
    { name: 'cancel-desktop', route: '/cancel/', width: 1440, height: 900 },
    { name: 'billing-desktop', route: '/billing/', width: 1440, height: 900 },
    { name: 'success-mobile', route: '/success/', width: 390, height: 844 },
    { name: 'success-minimum', route: '/success/', width: 320, height: 700 },
    { name: 'success-zoom-200', route: '/success/', width: 720, height: 450, deviceScaleFactor: 2 },
    { name: 'success-reduced-motion', route: '/success/', width: 390, height: 844, reducedMotion: 'reduce' },
  ])
  const browser = await chromium.launch({ headless: true })
  const evidence = []
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        deviceScaleFactor: scenario.deviceScaleFactor ?? 1,
        reducedMotion: scenario.reducedMotion ?? 'no-preference',
      })
      const page = await context.newPage()
      const failures = []
      const origins = new Set()
      page.on('console', (message) => { if (message.type() === 'error') failures.push(`console:${message.text()}`) })
      page.on('pageerror', (error) => failures.push(`page:${error.message}`))
      page.on('requestfailed', (request) => failures.push(`request:${new URL(request.url()).hostname}`))
      page.on('request', (request) => origins.add(new URL(request.url()).origin))
      const response = await page.goto(`${origin}${scenario.route}`, { waitUntil: 'networkidle' })
      assert.equal(response?.status(), 200, `${scenario.name} response`)
      await page.keyboard.press('Tab')
      const metrics = await page.evaluate(() => {
        const button = document.querySelector('[data-return-action]')
        const buttonRect = button?.getBoundingClientRect()
        const nestedScrollOwners = [...document.querySelectorAll('body *')].filter((element) => {
          const style = getComputedStyle(element)
          return /(auto|scroll)/u.test(style.overflowY) && element.scrollHeight > element.clientHeight
        }).length
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          buttonHeight: buttonRect?.height ?? 0,
          buttonFocused: document.activeElement === button,
          focusOutline: button ? getComputedStyle(button).outlineStyle : 'none',
          nestedScrollOwners,
          reducedAnimation: getComputedStyle(document.querySelector('.state-heading')).animationName,
        }
      })
      assert.ok(metrics.documentWidth <= metrics.viewportWidth, `${scenario.name} horizontal overflow`)
      assert.ok(metrics.buttonHeight >= 44, `${scenario.name} action height`)
      assert.equal(metrics.buttonFocused, true, `${scenario.name} keyboard focus`)
      assert.notEqual(metrics.focusOutline, 'none', `${scenario.name} visible focus`)
      assert.equal(metrics.nestedScrollOwners, 0, `${scenario.name} nested scroll owner`)
      if (scenario.reducedMotion === 'reduce') assert.equal(metrics.reducedAnimation, 'none')
      assert.deepEqual([...origins], [origin], `${scenario.name} external request`)
      assert.deepEqual(failures, [], `${scenario.name} browser failures`)

      await page.getByRole('button', { name: 'Return to Tab Two' }).click()
      await page.getByText('Open a new tab, then open Settings > Account & Sync.').waitFor()
      const screenshot = join(outputDirectory, `${scenario.name}.png`)
      await page.screenshot({ path: screenshot, fullPage: true })
      evidence.push(Object.freeze({
        name: scenario.name,
        route: scenario.route,
        viewport: `${scenario.width}x${scenario.height}`,
        pixels: scenario.deviceScaleFactor ?? 1,
        screenshot,
      }))
      await context.close()
    }
  } finally {
    await browser.close()
  }
  return Object.freeze(evidence)
}

export async function probeInstalledExtensionReturn({
  extensionDirectory = resolve('dist'),
  origin = BILLING_RETURN_ORIGIN,
} = {}) {
  const { chromium } = await import('playwright')
  const manifest = JSON.parse(readFileSync(resolve(extensionDirectory, 'manifest.json'), 'utf8'))
  assert.equal(manifest.key.length > 0, true, 'production extension key')
  assert.deepEqual(manifest.externally_connectable?.matches, [`${origin}/*`])
  const profile = mkdtempSync(join(tmpdir(), 'tab-two-billing-return-extension-'))
  const evidence = []
  let context
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1440, height: 900 },
      screen: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
      args: [
        `--disable-extensions-except=${extensionDirectory}`,
        `--load-extension=${extensionDirectory}`,
      ],
    })
    const extensionPage = context.pages()[0] ?? await context.newPage()
    extensionPage.setDefaultTimeout(20_000)
    await extensionPage.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await extensionPage.locator('[data-canvas-surface]').waitFor()
    assert.equal(new URL(extensionPage.url()).host, 'akjalbmacojpmebkgohhcaaiacicpgkh')

    for (const route of Object.keys(BILLING_RETURN_ROUTES)) {
      const returnUrl = `${origin}${route}`
      await extensionPage.evaluate((url) => {
        document.querySelector('[data-qa-open-return]')?.remove()
        const button = document.createElement('button')
        button.dataset.qaOpenReturn = ''
        button.textContent = 'Open return QA'
        button.addEventListener('click', () => globalThis.open(url, '_blank', 'noopener'))
        document.body.append(button)
      }, returnUrl)
      const returnPagePromise = context.waitForEvent('page')
      await extensionPage.locator('[data-qa-open-return]').click()
      const returnPage = await returnPagePromise
      const failures = []
      returnPage.on('console', (message) => { if (message.type() === 'error') failures.push(`console:${message.text()}`) })
      returnPage.on('pageerror', (error) => failures.push(`page:${error.message}`))
      await returnPage.waitForLoadState('networkidle')
      const diagnostic = await returnPage.evaluate(({ extensionId, result }) => new Promise((resolvePromise) => {
        const runtime = globalThis.chrome?.runtime
        if (!runtime?.sendMessage) {
          resolvePromise({ response: null, error: 'runtime unavailable' })
          return
        }
        runtime.sendMessage(extensionId, { type: 'tab-two.billing-return.v1', result }, (response) => {
          resolvePromise({ response: response ?? null, error: runtime.lastError?.message ?? null })
        })
      }), {
        extensionId: 'akjalbmacojpmebkgohhcaaiacicpgkh',
        result: BILLING_RETURN_ROUTES[route].result,
      })
      assert.deepEqual(diagnostic, { response: { status: 'focused' }, error: null }, `${route} external response`)
      const closePromise = returnPage.waitForEvent('close').then(() => true)
      try {
        await returnPage.getByRole('button', { name: 'Return to Tab Two' }).click()
      } catch (error) {
        if (!returnPage.isClosed()) throw error
      }
      await extensionPage.waitForFunction(() => document.hasFocus())
      const closed = await Promise.race([
        closePromise,
        new Promise((resolvePromise) => setTimeout(() => resolvePromise(false), 1_000)),
      ])
      if (!closed) {
        assert.equal(await returnPage.locator('[data-return-fallback]').isHidden(), true, `${route} fallback`)
        await returnPage.close()
      }
      assert.equal(closed, true, `${route} return tab should close after focus`)
      assert.deepEqual(failures, [], `${route} return-page failures`)
      evidence.push(Object.freeze({ route, focused: true, returnClosed: closed }))
    }
  } finally {
    await context?.close()
    rmSync(profile, { recursive: true, force: true })
  }
  return Object.freeze(evidence)
}

export async function main() {
  const evidence = await probeBillingReturnSite()
  for (const entry of evidence) {
    process.stdout.write(`PASS ${entry.route} ${entry.status} no-cookie ${entry.bytes}B\n`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
  if (process.argv.includes('--visual')) {
    const evidence = await probeBillingReturnVisuals()
    for (const entry of evidence) process.stdout.write(`PASS ${entry.name} ${entry.viewport}\n`)
  }
  if (process.argv.includes('--extension')) {
    const evidence = await probeInstalledExtensionReturn()
    for (const entry of evidence) process.stdout.write(`PASS ${entry.route} extension-focused close=${entry.returnClosed}\n`)
  }
}
