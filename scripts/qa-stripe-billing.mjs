import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = resolve(import.meta.dirname, '..')

export const STRIPE_SERVER_IMPORT = "npm:stripe@22.6.0"
export const STRIPE_API_VERSION = '2026-08-26.dahlia'

function source(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

export function assertStripeBillingSourceContracts(files) {
  assert.match(files.gateway, /npm:stripe@22\.6\.0/u)
  assert.match(files.gateway, /2026-08-26\.dahlia/u)
  assert.match(files.gateway, /discounts: \[\{ coupon: input\.couponId \}\]/u)
  assert.match(files.gateway, /expires_at/u)
  assert.match(files.catalog, /amountOff !== 1_000/u)
  assert.match(files.catalog, /duration !== 'once'/u)
  assert.match(files.catalog, /priceId: entries\.annual\.priceId/u)
  assert.match(files.migration, /create table private\.billing_checkout_sessions/u)
  assert.match(files.migration, /returns text[\s\S]*introductory_claim_rejected/u)
  assert.match(files.migration, /authoritative_event_priority/u)
  assert.match(files.migration, /if is_transition then[\s\S]*insert into private\.billing_audit_events/u)
  assert.match(files.config, /\[functions\.stripe-webhook\]\s+verify_jwt = false/u)
  assert.match(files.config, /\[functions\.billing-return\]\s+verify_jwt = false/u)
  assert.match(files.config, /\[functions\.billing-checkout-session\]\s+verify_jwt = true/u)
  assert.match(files.config, /\[functions\.billing-portal-session\]\s+verify_jwt = true/u)
  assert.doesNotMatch(files.manifest, /stripe\.com/u)
  assert.doesNotMatch(files.clientTree, /npm:stripe|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|sk_(?:test|live)_|whsec_/u)
}

export function loadStripeBillingSources() {
  return {
    gateway: source('supabase/functions/_shared/stripeGateway.ts'),
    catalog: source('supabase/functions/_shared/stripeCatalog.ts'),
    migration: source('supabase/migrations/20260901000300_stripe_billing_foundation.sql'),
    config: source('supabase/config.toml'),
    manifest: source('src/manifest.ts'),
    clientTree: [
      source('src/account/billing.ts'),
      source('src/account/supabaseAccountClient.ts'),
      source('src/settings/sections/AccountSync.tsx'),
    ].join('\n'),
  }
}

export function main() {
  assertStripeBillingSourceContracts(loadStripeBillingSources())
  process.stdout.write(`Stripe billing local source contract PASS (${STRIPE_SERVER_IMPORT}, ${STRIPE_API_VERSION})\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
