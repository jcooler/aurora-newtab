import assert from 'node:assert/strict'
import test from 'node:test'

import { expansionContractCommands, runExpansionContracts } from './run-contracts.mjs'

const NODE_TESTS = [
  'scripts/expansion/catalog-schema.test.mjs',
  'scripts/expansion/catalog-research.test.mjs',
  'scripts/expansion/render-catalog.test.mjs',
  'scripts/expansion/output-safety.test.mjs',
  'scripts/expansion/scaffold.test.mjs',
  'scripts/widget-catalog-manifest.test.mjs',
  'scripts/catalog-nl-p5-check.test.mjs',
  'scripts/catalog-output-safety.test.mjs',
]

const VITEST_TESTS = [
  'src/newtab/expansionWidgetContracts.test.ts',
  'src/lib/storage/widgetToggleVersions.test.ts',
  'src/lib/storage/migrations.test.ts',
  'src/services/connectors/expansionConnectorContracts.test.ts',
  'src/settings/sections/Connectors.test.tsx',
]

const EXPECTED = [
  ['node', ['scripts/expansion/render-catalog.mjs', '--check']],
  ['node', ['scripts/catalog-nl-p5.mjs', '--batch=1', '--check']],
  ['node', ['scripts/catalog-nl-p5.mjs', '--batch=2', '--check']],
  ['node', ['--test', ...NODE_TESTS]],
  ['node', ['node_modules/vitest/vitest.mjs', 'run', ...VITEST_TESTS]],
]

test('declares exact deterministic expansion contract commands', () => {
  expectCommands(expansionContractCommands())
})

function expectCommands(commands) {
  assert.deepEqual(commands.map(({ command, args }) => [command, args]), EXPECTED)
}

test('streams every successful child in order without a command shell', () => {
  const calls = []
  const cwd = 'D:\\contract-fixture'
  const code = runExpansionContracts({
    cwd,
    spawn(command, args, options) {
      calls.push({ command, args, options })
      return 0
    },
  })
  assert.equal(code, 0)
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), EXPECTED)
  calls.forEach(({ options }) => assert.deepEqual(options, { cwd, stdio: 'inherit', shell: false }))
})

test('stops immediately and returns the first nonzero child exit', () => {
  const calls = []
  const code = runExpansionContracts({
    cwd: 'D:\\contract-fixture',
    spawn(command, args) {
      calls.push([command, args])
      return calls.length === 3 ? 17 : 0
    },
  })
  assert.equal(code, 17)
  assert.deepEqual(calls, EXPECTED.slice(0, 3))
})
