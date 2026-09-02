import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const root = path.resolve('billing-return-site')
const routes = Object.freeze({
  neutral: Object.freeze({ file: 'index.html', eyebrow: 'Tab Two billing', heading: 'Return to your second screen.' }),
  success: Object.freeze({ file: 'success/index.html', eyebrow: 'Payment received', heading: 'Your first year is ready.' }),
  cancel: Object.freeze({ file: 'cancel/index.html', eyebrow: 'Checkout closed', heading: 'Nothing changed.' }),
  billing: Object.freeze({ file: 'billing/index.html', eyebrow: 'Billing updated', heading: 'Back to your second screen.' }),
})

async function text(relative) {
  return readFile(path.join(root, relative), 'utf8')
}

for (const [result, route] of Object.entries(routes)) {
  test(`${result} return route gives one trustworthy next action without customer data`, async () => {
    const html = await text(route.file)
    assert.match(html, new RegExp(`<body[^>]+data-result="${result}"`, 'u'))
    assert.match(html, new RegExp(`<p[^>]+class="eyebrow"[^>]*>${route.eyebrow}</p>`, 'u'))
    assert.match(html, new RegExp(`<h1[^>]*>${route.heading}</h1>`, 'u'))
    assert.equal((html.match(/<main\b/gu) ?? []).length, 1)
    assert.equal((html.match(/data-return-action/gu) ?? []).length, 1)
    assert.match(html, /Return to Tab Two/u)
    assert.match(html, /name="robots" content="noindex,nofollow"/u)
    assert.match(html, /href="(?:\.\.\/)*assets\/return\.css"/u)
    assert.match(html, /src="(?:\.\.\/)*assets\/return\.js"/u)
    assert.doesNotMatch(html, /(?:cs_test_|cus_|sub_|price_|sk_test_|whsec_|@example\.|checkout\.stripe\.com)/u)
    assert.doesNotMatch(html, /https?:\/\//u)
  })
}

test('static host headers deny ambient browser authority', async () => {
  const headers = await text('_headers')
  assert.match(headers, /Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'/u)
  assert.match(headers, /Referrer-Policy: no-referrer/u)
  assert.match(headers, /X-Content-Type-Options: nosniff/u)
  assert.match(headers, /X-Frame-Options: DENY/u)
  assert.match(headers, /Cross-Origin-Opener-Policy: same-origin/u)
  assert.match(headers, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)/u)
  assert.match(headers, /Cache-Control: no-cache, no-store, must-revalidate/u)
})

test('return script sends only the frozen result and degrades to plain guidance', async () => {
  const source = await text('assets/return.js')
  for (const forbidden of [
    'fetch(', 'XMLHttpRequest', 'sendBeacon', 'document.cookie', 'localStorage', 'sessionStorage',
    'serviceWorker', 'analytics', 'stripe.com', 'supabase.co', 'http://', 'https://',
  ]) assert.equal(source.includes(forbidden), false, `forbidden browser authority: ${forbidden}`)

  const listeners = new Map()
  const button = {
    disabled: false,
    textContent: 'Return to Tab Two',
    addEventListener(name, listener) { listeners.set(name, listener) },
  }
  const fallback = { hidden: true }
  const sent = []
  const context = {
    document: {
      body: { dataset: { result: 'success' } },
      querySelector(selector) { return selector === '[data-return-action]' ? button : fallback },
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(extensionId, message, callback) {
          sent.push({ extensionId, message })
          callback({ status: 'not_found' })
        },
      },
    },
    window: { close() { throw new Error('not called without focus') } },
    setTimeout,
    clearTimeout,
  }
  vm.runInNewContext(source, context)
  await listeners.get('click')()

  assert.equal(JSON.stringify(sent), JSON.stringify([{
    extensionId: 'akjalbmacojpmebkgohhcaaiacicpgkh',
    message: { type: 'tab-two.billing-return.v1', result: 'success' },
  }]))
  assert.equal(fallback.hidden, false)
  assert.equal(button.disabled, false)
  assert.equal(button.textContent, 'Return to Tab Two')
})

test('robots exclude the complete static surface', async () => {
  assert.equal(await text('robots.txt'), 'User-agent: *\nDisallow: /\n')
})
