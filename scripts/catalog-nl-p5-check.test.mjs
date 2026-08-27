import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..')
const SCRIPT = path.join(SCRIPT_DIR, 'catalog-nl-p5.mjs')
const ACCEPTED = path.join(REPO_ROOT, 'docs', 'superpowers', 'catalog', 'batch-1')

async function snapshot(root) {
  const result = []
  async function visit(current, relative = '') {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name)
      const name = path.posix.join(relative, entry.name)
      const metadata = await stat(child, { bigint: true })
      if (entry.isDirectory()) {
        result.push([`${name}/`, metadata.mtimeNs.toString(), 'directory'])
        await visit(child, name)
      } else {
        const bytes = await readFile(child)
        result.push([name, metadata.mtimeNs.toString(), createHash('sha256').update(bytes).digest('hex')])
      }
    }
  }
  await visit(root)
  return result.sort(([left], [right]) => left.localeCompare(right))
}

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aurora-catalog-check-'))
  const catalog = path.join(root, 'catalog')
  await cp(ACCEPTED, catalog, { recursive: true, errorOnExist: true })
  for (const trap of ['.preview-nl-p5-dist', '.playwright-profile-nl-p5']) {
    await mkdir(path.join(root, trap))
    await writeFile(path.join(root, trap, 'sentinel.txt'), 'must remain', 'utf8')
  }
  try {
    await run({ root, catalog })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function runCheck(root, catalog) {
  return spawnSync(process.execPath, [SCRIPT, '--check', '--batch=1', `--out-dir=${catalog}`], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  })
}

test('check mode validates committed artifacts without any mutation or browser setup', async () => {
  await fixture(async ({ root, catalog }) => {
    const beforeFixture = await snapshot(root)
    const beforeAccepted = await snapshot(ACCEPTED)
    const result = runCheck(root, catalog)
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.deepEqual(await snapshot(root), beforeFixture)
    assert.deepEqual(await snapshot(ACCEPTED), beforeAccepted)
  })
})

test('check mode reports a missing declared PNG and still performs no writes', async () => {
  await fixture(async ({ root, catalog }) => {
    await unlink(path.join(catalog, 'clock-compact.png'))
    const beforeFixture = await snapshot(root)
    const beforeAccepted = await snapshot(ACCEPTED)
    const result = runCheck(root, catalog)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /clock-compact\.png.*missing|missing.*clock-compact\.png/i)
    assert.deepEqual(await snapshot(root), beforeFixture)
    assert.deepEqual(await snapshot(ACCEPTED), beforeAccepted)
  })
})
