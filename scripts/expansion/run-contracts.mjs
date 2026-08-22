import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')

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

export function expansionContractCommands() {
  return [
    { command: 'node', args: ['scripts/expansion/render-catalog.mjs', '--check'] },
    { command: 'node', args: ['scripts/catalog-nl-p5.mjs', '--batch=1', '--check'] },
    { command: 'node', args: ['scripts/catalog-nl-p5.mjs', '--batch=2', '--check'] },
    { command: 'node', args: ['--test', ...NODE_TESTS] },
    { command: 'node', args: ['node_modules/vitest/vitest.mjs', 'run', ...VITEST_TESTS] },
  ]
}

function spawnChild(command, args, options) {
  const result = spawnSync(command, args, options)
  return result.status ?? 1
}

export function runExpansionContracts({ cwd = REPO_ROOT, spawn = spawnChild } = {}) {
  for (const { command, args } of expansionContractCommands()) {
    const code = spawn(command, args, { cwd, stdio: 'inherit', shell: false })
    if (code !== 0) return code
  }
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runExpansionContracts()
}
