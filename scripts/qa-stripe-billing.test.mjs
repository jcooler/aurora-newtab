import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STRIPE_API_VERSION,
  STRIPE_SERVER_IMPORT,
  assertStripeBillingSourceContracts,
  loadStripeBillingSources,
} from './qa-stripe-billing.mjs'

test('pins the reviewed server-only Stripe SDK and API version', () => {
  assert.equal(STRIPE_SERVER_IMPORT, 'npm:stripe@22.6.0')
  assert.equal(STRIPE_API_VERSION, '2026-08-26.dahlia')
})

test('keeps billing authority behind the reviewed local source contracts', () => {
  assert.doesNotThrow(() => assertStripeBillingSourceContracts(loadStripeBillingSources()))
})

test('rejects a perpetual introductory recurring price implementation', () => {
  const files = loadStripeBillingSources()
  assert.throws(() => assertStripeBillingSourceContracts({
    ...files,
    catalog: files.catalog.replace('priceId: entries.annual.priceId', "priceId: 'price_intro_999_forever'"),
  }))
})

test('rejects a Stripe host permission in the extension manifest', () => {
  const files = loadStripeBillingSources()
  assert.throws(() => assertStripeBillingSourceContracts({
    ...files,
    manifest: `${files.manifest}\nhttps://checkout.stripe.com/*`,
  }))
})
