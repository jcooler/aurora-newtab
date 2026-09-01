import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('pins the supported Supabase client and local CLI behind an account-local build', () => {
  assert.equal(packageJson.dependencies?.['@supabase/supabase-js'], '2.112.4')
  assert.equal(packageJson.devDependencies?.supabase, '2.116.0')
  assert.equal(
    packageJson.scripts?.['build:account-local'],
    'node scripts/build.mjs --mode=account-local',
  )
  assert.equal(packageJson.scripts?.['test:supabase-local'], 'supabase test db')
  assert.equal(
    packageJson.scripts?.['qa:account-auth-local'],
    'node scripts/qa-account-auth-local.mjs',
  )
})

test('git ignores local account credentials and Supabase runtime state', () => {
  const result = spawnSync(
    'git',
    ['check-ignore', '--stdin'],
    {
      cwd: root,
      encoding: 'utf8',
      input: '.env\n.env.account-local\nlease-signing.key\nlease-signing.pem\nsupabase/.temp/runtime\nsupabase/.branches/local\n',
    },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(
    result.stdout.trim().split(/\r?\n/),
    [
      '.env',
      '.env.account-local',
      'lease-signing.key',
      'lease-signing.pem',
      'supabase/.temp/runtime',
      'supabase/.branches/local',
    ],
  )
})

test('keeps the committed Supabase project local and Google-disabled', () => {
  const configPath = new URL('../supabase/config.toml', import.meta.url)
  assert.equal(existsSync(configPath), true, 'supabase/config.toml must exist')
  const config = readFileSync(configPath, 'utf8')

  assert.match(config, /^project_id = "tab-two-local"$/m)
  assert.match(config, /^port = 54321$/m)
  assert.match(config, /^port = 54322$/m)
  assert.match(config, /^major_version = 17$/m)
  assert.match(config, /^site_url = "https:\/\/tab-two\.invalid"$/m)
  assert.match(config, /^additional_redirect_urls = \[\]$/m)
  assert.match(config, /^enable_signup = false$/m)
  assert.match(config, /^\[auth\.external\.google\]$/m)
  assert.match(config, /^enabled = false$/m)
  assert.match(config, /^client_id = ""$/m)
  assert.match(config, /^secret = ""$/m)
  assert.doesNotMatch(config, /project_ref|supabase\.co|sb_secret_|service_role/i)
})
