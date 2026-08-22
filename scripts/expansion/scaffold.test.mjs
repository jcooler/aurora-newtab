import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstat, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { scaffoldAddition } from './scaffold.mjs'

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scaffold.mjs')

const CASES = [
  {
    id: 'readingList', label: 'Reading List', kind: 'builtin',
    files: [
      'INTEGRATION-CHECKLIST.md',
      'candidate.json',
      'src/newtab/widgets/readingList/ReadingListWidget.test.tsx',
      'src/newtab/widgets/readingList/ReadingListWidget.tsx',
    ],
  },
  {
    id: 'linear', label: 'Linear', kind: 'connector',
    files: [
      'INTEGRATION-CHECKLIST.md',
      'candidate.json',
      'src/newtab/widgets/linear/LinearWidget.test.tsx',
      'src/newtab/widgets/linear/LinearWidget.tsx',
      'src/services/connectors/linear.test.ts',
      'src/services/connectors/linear.ts',
      'src/settings/LinearConnectorSettings.tsx',
    ],
  },
  {
    id: 'onThisDay', label: 'On This Day', kind: 'provider',
    files: [
      'INTEGRATION-CHECKLIST.md',
      'candidate.json',
      'src/newtab/widgets/onThisDay/OnThisDayWidget.test.tsx',
      'src/newtab/widgets/onThisDay/OnThisDayWidget.tsx',
      'src/services/providers/onThisDay.test.ts',
      'src/services/providers/onThisDay.ts',
    ],
  },
]

async function fixture(run) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'aurora-expansion-scaffold-'))
  const repoRoot = path.join(sandbox, 'active')
  const protectedRoot = path.join(sandbox, 'protected')
  await mkdir(repoRoot)
  await mkdir(protectedRoot)
  try {
    await run({ repoRoot, protectedRoot })
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

test('generates deterministic, inert, independently hashed starter payloads for every kind', async () => {
  await fixture(async ({ repoRoot, protectedRoot }) => {
    for (const expected of CASES) {
      const outDir = `.aurora-expansion-${expected.id}`
      const result = await scaffoldAddition({ ...expected, outDir, repoRoot, protectedRoot })
      assert.equal(result.root, path.join(repoRoot, outDir))
      assert.deepEqual(result.files.map(({ path: file }) => file), expected.files)

      for (const file of expected.files) {
        const bytes = await readFile(path.join(result.root, file))
        assert.equal(result.files.find((entry) => entry.path === file)?.sha256, hash(bytes), file)
      }

      const manifest = JSON.parse(await readFile(path.join(result.root, 'manifest.json'), 'utf8'))
      assert.equal(manifest.scaffoldVersion, 1)
      assert.equal(manifest.candidateId, expected.id)
      assert.equal(manifest.kind, expected.kind)
      assert.deepEqual(manifest.files, result.files)
      assert.equal(manifest.files.some(({ path: file }) => file === 'manifest.json'), false)

      const productionStubs = expected.files.filter((file) => /\.(?:ts|tsx)$/.test(file) && !/\.test\./.test(file))
      for (const file of productionStubs) {
        const source = await readFile(path.join(result.root, file), 'utf8')
        assert.doesNotMatch(source, /fetch\s*\(/, file)
        assert.doesNotMatch(source, /chrome\.(?:storage|permissions)/, file)
        assert.doesNotMatch(source, /(?:Bearer\s+|sk-|ghp_|api[_-]?key\s*[:=])\S+/i, file)
        assert.doesNotMatch(source, /https:\/\/\S+[?&](?:token|key|sig)=/i, file)
        assert.doesNotMatch(source, /TODO|FIXME|research-required|Write the first behavior test/i, file)
      }

      const starterTests = expected.files.filter((file) => /\.test\.(?:ts|tsx)$/.test(file))
      for (const file of starterTests) {
        const source = await readFile(path.join(result.root, file), 'utf8')
        assert.match(source, /throw new Error\('Write the first behavior test'\)/)
        assert.equal(source.match(/Write the first behavior test/g)?.length, 1)
      }

      const candidate = await readFile(path.join(result.root, 'candidate.json'), 'utf8')
      assert.equal(candidate.match(/research-required/g)?.length, 1)
      assert.equal(JSON.parse(candidate).status, 'research-required')
      const checklist = await readFile(path.join(result.root, 'INTEGRATION-CHECKLIST.md'), 'utf8')
      assert.equal(checklist.match(/research-required/g)?.length, 1)
      assert.match(checklist, /replace.*before integration/i)
    }
  })
})

test('rejects invalid identity, label, kind, candidate, and kind mapping before output exists', async () => {
  await fixture(async ({ repoRoot, protectedRoot }) => {
    const invalid = [
      { id: '../escape', label: 'Escape', kind: 'builtin', error: /lower camel/i },
      { id: 'readingList', label: '   ', kind: 'builtin', error: /label/i },
      { id: 'readingList', label: 'Reading List', kind: 'unknown', error: /kind/i },
      { id: 'notInCatalog', label: 'Missing', kind: 'builtin', error: /catalog/i },
      { id: 'linear', label: 'Linear', kind: 'builtin', error: /requires connector/i },
      { id: 'readingList', label: 'Reading List', kind: 'connector', error: /requires builtin/i },
      { id: 'onThisDay', label: 'On This Day', kind: 'connector', error: /requires provider/i },
    ]
    for (const [index, item] of invalid.entries()) {
      const outDir = `.aurora-expansion-invalid-${index}`
      await assert.rejects(
        scaffoldAddition({ ...item, outDir, repoRoot, protectedRoot }),
        item.error,
      )
      await assert.rejects(lstat(path.join(repoRoot, outDir)), /ENOENT/)
    }
  })
})

test('CLI trust roots are fixed and cannot be swapped onto the protected checkout', async () => {
  await fixture(async ({ repoRoot, protectedRoot }) => {
    const outDir = '.aurora-expansion-protected-bypass'
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--id=readingList',
      '--label=Reading List',
      '--kind=builtin',
      `--out-dir=${outDir}`,
      `--repo-root=${protectedRoot}`,
      `--protected-root=${repoRoot}`,
    ], { cwd: repoRoot, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /unknown argument.*repo-root/i)
    await assert.rejects(lstat(path.join(protectedRoot, outDir)), /ENOENT/)
  })
})
