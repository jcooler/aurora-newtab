import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BILLING_RETURN_ORIGIN,
  BILLING_RETURN_ROUTES,
  inspectBillingReturnResponse,
  probeBillingReturnSite,
} from './qa-billing-return-site.mjs'

function responseFor(route, overrides = {}) {
  const details = BILLING_RETURN_ROUTES[route]
  return new Response(`<!doctype html><html><head><title>${details.title}</title></head><body data-result="${details.result}"><main><h1>${details.heading}</h1></main></body></html>`, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'cache-control': 'no-store, must-revalidate, no-cache',
      ...overrides.headers,
    },
    ...overrides,
  })
}

test('pins the one approved free static origin and four literal routes', () => {
  assert.equal(BILLING_RETURN_ORIGIN, 'https://tab-two-billing-return.pages.dev')
  assert.deepEqual(Object.keys(BILLING_RETURN_ROUTES), ['/', '/success/', '/cancel/', '/billing/'])
})

test('accepts the exact hosted privacy, security, cache, and route contract', async () => {
  for (const route of Object.keys(BILLING_RETURN_ROUTES)) {
    await assert.doesNotReject(inspectBillingReturnResponse(route, responseFor(route)))
  }
})

for (const [name, override] of [
  ['redirect', { status: 302 }],
  ['cookie', { headers: { 'set-cookie': 'session=forbidden' } }],
  ['network permission', { headers: { 'content-security-policy': "default-src 'self'; connect-src https://analytics.example" } }],
  ['cacheable HTML', { headers: { 'cache-control': 'public, max-age=3600' } }],
]) {
  test(`rejects a hosted ${name} regression`, async () => {
    await assert.rejects(inspectBillingReturnResponse('/success/', responseFor('/success/', override)))
  })
}

test('probes only the exact approved origin and returns bounded evidence', async () => {
  const requested = []
  const evidence = await probeBillingReturnSite(async (url, options) => {
    requested.push({ url, options })
    return responseFor(new URL(url).pathname)
  })

  assert.deepEqual(requested.map(({ url }) => url), Object.keys(BILLING_RETURN_ROUTES).map(
    (route) => `${BILLING_RETURN_ORIGIN}${route}`,
  ))
  assert.ok(requested.every(({ options }) => options.redirect === 'error'))
  assert.deepEqual(evidence.map(({ route, status, cookies }) => ({ route, status, cookies })), [
    { route: '/', status: 200, cookies: false },
    { route: '/success/', status: 200, cookies: false },
    { route: '/cancel/', status: 200, cookies: false },
    { route: '/billing/', status: 200, cookies: false },
  ])
  assert.ok(evidence.every((entry) => Object.keys(entry).sort().join(',') === 'bytes,cookies,route,status'))
})
