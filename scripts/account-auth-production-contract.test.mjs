import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const manifestSource = readFileSync(new URL('../src/manifest.ts', import.meta.url), 'utf8')
const clientFactorySource = readFileSync(new URL('../src/account/createAccountClient.ts', import.meta.url), 'utf8')
const descriptorUrl = new URL('../src/account/productionAccountServiceConfig.ts', import.meta.url)

test('pins a production account QA command', () => {
  assert.equal(
    packageJson.scripts?.['qa:account-auth-production'],
    'node scripts/qa-account-auth-production.mjs',
  )
})

test('commits only the public production account descriptor', () => {
  assert.equal(existsSync(descriptorUrl), true, 'production descriptor must exist')
  const descriptor = readFileSync(descriptorUrl, 'utf8')

  assert.match(descriptor, /https:\/\/[a-z0-9]{20}\.supabase\.co/u)
  assert.match(descriptor, /sb_publishable_[A-Za-z0-9_-]{10,256}/u)
  assert.match(descriptor, /production-2026-09-01/u)
  assert.doesNotMatch(descriptor, /sb_secret_|service_role|BEGIN PRIVATE KEY|PRIVATE KEY-----/iu)
})

test('gives production identity and one exact Supabase origin only', () => {
  assert.match(manifestSource, /PRODUCTION_SUPABASE_HOST_PERMISSION/u)
  assert.match(manifestSource, /identity/u)
  assert.doesNotMatch(manifestSource, /https:\/\/\*\.supabase\.co/u)
  assert.doesNotMatch(manifestSource, /\{ host_permissions: \['https:\/\/\*\/\*'\] \}/u)
})

test('pins the existing Store identity for production OAuth callbacks', () => {
  const key = manifestSource.match(/const PRODUCTION_CHROME_PUBLIC_KEY =\s*'([^']+)'/u)?.[1]
  assert(key, 'production Chrome public key is missing')
  const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest().subarray(0, 16)
  const extensionId = Array.from(
    digest,
    (byte) => String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 15)),
  ).join('')
  assert.equal(extensionId, 'akjalbmacojpmebkgohhcaaiacicpgkh')
  assert.match(manifestSource, /env\.mode === PRODUCTION\s*\? \{ key: PRODUCTION_CHROME_PUBLIC_KEY \}/u)
})

test('loads the production descriptor through the authenticated adapter', () => {
  assert.match(clientFactorySource, /productionAccountServiceConfig/u)
  assert.match(clientFactorySource, /createConfiguredSupabaseAccountClient/u)
  assert.match(clientFactorySource, /MODE === 'production'/u)
})
