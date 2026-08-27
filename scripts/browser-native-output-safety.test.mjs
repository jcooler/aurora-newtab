import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { resolveBrowserNativeOutput } from './browser-native-output-safety.mjs'

async function fixture(run) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'aurora-browser-native-output-'))
  const repoRoot = path.join(sandbox, 'active')
  const protectedRoot = path.join(sandbox, 'protected')
  await mkdir(repoRoot)
  await mkdir(protectedRoot)
  try {
    await run({ sandbox, repoRoot, protectedRoot })
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}

test('accepts only an explicit empty .qa-browser-native-* direct child', async () => {
  await fixture(async ({ repoRoot, protectedRoot }) => {
    const requested = '.qa-browser-native-run'
    assert.equal(
      await resolveBrowserNativeOutput({ repoRoot, protectedRoot, requested }),
      path.join(repoRoot, requested),
    )
    await assert.rejects(
      resolveBrowserNativeOutput({ repoRoot, protectedRoot, requested: '' }),
      /required|nonblank/i,
    )
    for (const unsafe of ['src', 'docs', 'dist', '../escape', '.qa-browser-native-run/nested', '.qa-browser-native-']) {
      await assert.rejects(
        resolveBrowserNativeOutput({ repoRoot, protectedRoot, requested: unsafe }),
        /direct child|prefix|protected/i,
      )
    }
  })
})

test('rejects non-empty, file, symlink, junction, and protected targets without changing them', async () => {
  await fixture(async ({ sandbox, repoRoot, protectedRoot }) => {
    const nonEmpty = path.join(repoRoot, '.qa-browser-native-nonempty')
    await mkdir(nonEmpty)
    await writeFile(path.join(nonEmpty, 'keep.txt'), 'keep', 'utf8')
    await assert.rejects(resolveBrowserNativeOutput({ repoRoot, protectedRoot, requested: nonEmpty }), /empty/i)

    const file = path.join(repoRoot, '.qa-browser-native-file')
    await writeFile(file, 'keep', 'utf8')
    await assert.rejects(resolveBrowserNativeOutput({ repoRoot, protectedRoot, requested: file }), /directory/i)

    const redirectTarget = path.join(sandbox, 'redirect')
    await mkdir(redirectTarget)
    const linked = path.join(repoRoot, '.qa-browser-native-linked')
    await symlink(redirectTarget, linked, 'junction')
    await assert.rejects(resolveBrowserNativeOutput({ repoRoot, protectedRoot, requested: linked }), /link|junction/i)

    const protectedChild = path.join(protectedRoot, '.qa-browser-native-forbidden')
    await assert.rejects(
      resolveBrowserNativeOutput({ repoRoot: protectedRoot, protectedRoot, requested: protectedChild }),
      /protected/i,
    )
    assert.equal(await import('node:fs/promises').then(({ readFile }) => readFile(path.join(nonEmpty, 'keep.txt'), 'utf8')), 'keep')
    assert.equal(await import('node:fs/promises').then(({ readFile }) => readFile(file, 'utf8')), 'keep')
  })
})
