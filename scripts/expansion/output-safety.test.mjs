import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { resolveSafeExpansionOutput } from './output-safety.mjs'

async function fixture(run) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'aurora-expansion-output-'))
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

async function rejectsWithoutWriting({ repoRoot, protectedRoot }, requested, pattern) {
  const before = await import('node:fs/promises').then(({ readdir }) => readdir(repoRoot))
  await assert.rejects(
    resolveSafeExpansionOutput({ repoRoot, protectedRoot, requested }),
    pattern,
  )
  const after = await import('node:fs/promises').then(({ readdir }) => readdir(repoRoot))
  assert.deepEqual(after, before)
}

test('accepts a new direct scratch child inside the active repository without creating it', async () => {
  await fixture(async ({ repoRoot, protectedRoot }) => {
    const requested = '.aurora-expansion-readingList'
    const resolved = await resolveSafeExpansionOutput({ repoRoot, protectedRoot, requested })
    assert.equal(resolved, path.join(repoRoot, requested))
    await assert.rejects(import('node:fs/promises').then(({ lstat }) => lstat(resolved)), /ENOENT/)
  })
})

test('rejects repository, protected, source, document, script, build, traversal, and wrong-prefix targets before writing', async () => {
  await fixture(async (roots) => {
    for (const requested of [
      roots.repoRoot,
      roots.protectedRoot,
      path.join(roots.repoRoot, 'src'),
      path.join(roots.repoRoot, 'docs'),
      path.join(roots.repoRoot, 'scripts'),
      path.join(roots.repoRoot, 'dist'),
      path.join(roots.repoRoot, '..', '.aurora-expansion-escape'),
      '.qa-expansion-platform-wrong-family',
      'aurora-expansion-missing-dot',
      '.aurora-expansion-',
      path.join('.aurora-expansion-parent', 'nested'),
    ]) {
      await rejectsWithoutWriting(roots, requested, /safe direct child|protected|prefix/i)
    }
  })
})

test('rejects an active root nested anywhere inside the protected checkout', async () => {
  await fixture(async ({ protectedRoot }) => {
    const nestedActive = path.join(protectedRoot, 'nested-active')
    await mkdir(nestedActive)
    await assert.rejects(
      resolveSafeExpansionOutput({
        repoRoot: nestedActive,
        protectedRoot,
        requested: '.aurora-expansion-forbidden',
      }),
      /protected/i,
    )
    await assert.rejects(
      import('node:fs/promises').then(({ lstat }) => lstat(path.join(nestedActive, '.aurora-expansion-forbidden'))),
      /ENOENT/,
    )
  })
})

test('rejects a non-empty output and an output-file collision without changing either', async () => {
  await fixture(async (roots) => {
    const nonEmpty = path.join(roots.repoRoot, '.aurora-expansion-nonempty')
    await mkdir(nonEmpty)
    await writeFile(path.join(nonEmpty, 'keep.txt'), 'keep', 'utf8')
    await assert.rejects(
      resolveSafeExpansionOutput({ ...roots, requested: nonEmpty }),
      /empty/i,
    )
    assert.equal(await import('node:fs/promises').then(({ readFile }) => readFile(path.join(nonEmpty, 'keep.txt'), 'utf8')), 'keep')

    const collision = path.join(roots.repoRoot, '.aurora-expansion-file')
    await writeFile(collision, 'keep', 'utf8')
    await assert.rejects(
      resolveSafeExpansionOutput({ ...roots, requested: collision }),
      /directory/i,
    )
    assert.equal(await import('node:fs/promises').then(({ readFile }) => readFile(collision, 'utf8')), 'keep')
  })
})

test('rejects symlink and junction output roots without following them', async () => {
  await fixture(async (roots) => {
    const target = path.join(roots.sandbox, 'target')
    await mkdir(target)
    let created = 0
    for (const [name, type] of [['symlink', 'dir'], ['junction', 'junction']]) {
      const linked = path.join(roots.repoRoot, `.aurora-expansion-${name}`)
      try {
        await symlink(target, linked, type)
      } catch (error) {
        if (error?.code === 'EPERM') continue
        throw error
      }
      created += 1
      await assert.rejects(
        resolveSafeExpansionOutput({ ...roots, requested: linked }),
        /link|junction/i,
      )
    }
    assert.ok(created > 0, 'the platform must permit at least a junction or directory symlink fixture')
  })
})

test('rejects planned children that escape, collide, or traverse a link before writing', async () => {
  await fixture(async (roots) => {
    const requested = path.join(roots.repoRoot, '.aurora-expansion-children')
    await mkdir(requested)
    await symlink(roots.protectedRoot, path.join(requested, 'linked'), 'junction')

    await assert.rejects(
      resolveSafeExpansionOutput({ ...roots, requested, plannedChildren: ['../escape.ts'] }),
      /planned child/i,
    )
    await assert.rejects(
      resolveSafeExpansionOutput({ ...roots, requested, plannedChildren: ['linked/payload.ts'] }),
      /link|junction/i,
    )
    await writeFile(path.join(requested, 'collision.ts'), 'keep', 'utf8')
    await assert.rejects(
      resolveSafeExpansionOutput({ ...roots, requested, plannedChildren: ['collision.ts'] }),
      /collision/i,
    )
  })
})
