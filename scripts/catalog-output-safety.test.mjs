import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { JSDOM } from 'jsdom'

import {
  catalogRequestFailure,
  catalogWidgetUsefulness,
  parseCatalogArgs,
  prepareCatalogScratchPaths,
} from './catalog-nl-p5-content.mjs'

async function fixture(run) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'aurora-catalog-output-'))
  const repoRoot = path.join(sandbox, 'active')
  const protectedRoot = path.join(sandbox, 'protected')
  await mkdir(repoRoot)
  await mkdir(protectedRoot)
  const accepted = path.join(repoRoot, 'docs', 'superpowers', 'catalog', 'batch-1', 'CATALOG.md')
  await mkdir(path.dirname(accepted), { recursive: true })
  await writeFile(accepted, 'accepted evidence', 'utf8')
  try {
    await run({ sandbox, repoRoot, protectedRoot, accepted })
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}

test('parses and preflights one isolated scratch root without touching canonical evidence', async () => {
  await fixture(async ({ repoRoot, protectedRoot, accepted }) => {
    const before = await readFile(accepted)
    const options = parseCatalogArgs([
      '--batch=2',
      '--out-dir=.qa-expansion-platform-contract',
    ], repoRoot)
    assert.equal(options.outDirExplicit, true)
    const paths = await prepareCatalogScratchPaths({
      repoRoot,
      protectedRoot,
      requested: options.outDir,
      batch: options.batch,
    })
    assert.equal(paths.root, path.join(repoRoot, '.qa-expansion-platform-contract'))
    assert.equal(paths.catalogDir, path.join(paths.root, 'batch-2'))
    assert.equal(paths.dist, path.join(paths.root, 'preview-dist'))
    assert.equal(paths.profileDir, path.join(paths.root, 'playwright-profile'))
    assert.equal(paths.evidencePath, path.join(paths.root, 'evidence-batch-2.json'))
    await assert.rejects(readFile(path.join(paths.root, 'evidence-batch-2.json')), /ENOENT/)
    assert.deepEqual(await readFile(accepted), before)
  })
})

test('rejects protected, production, non-empty, wrong-prefix, traversal, and linked roots before creating children', async () => {
  await fixture(async (roots) => {
    const nonEmpty = path.join(roots.repoRoot, '.qa-expansion-platform-nonempty')
    await mkdir(nonEmpty)
    await writeFile(path.join(nonEmpty, 'keep.txt'), 'keep', 'utf8')

    const targets = [
      roots.protectedRoot,
      roots.repoRoot,
      path.join(roots.repoRoot, 'src'),
      path.join(roots.repoRoot, 'docs'),
      path.join(roots.repoRoot, 'scripts'),
      path.join(roots.repoRoot, 'dist'),
      path.join(roots.repoRoot, '..', '.qa-expansion-platform-traversal'),
      '.aurora-expansion-wrong-family',
      nonEmpty,
    ]
    for (const requested of targets) {
      await assert.rejects(
        prepareCatalogScratchPaths({ ...roots, requested, batch: '1' }),
        /safe direct child|protected|prefix|empty/i,
      )
      assert.equal(await readFile(roots.accepted, 'utf8'), 'accepted evidence')
    }

    const linkTarget = path.join(roots.sandbox, 'link-target')
    await mkdir(linkTarget)
    let linked = 0
    for (const [name, type] of [['symlink', 'dir'], ['junction', 'junction']]) {
      const requested = path.join(roots.repoRoot, `.qa-expansion-platform-${name}`)
      try {
        await symlink(linkTarget, requested, type)
      } catch (error) {
        if (error?.code === 'EPERM') continue
        throw error
      }
      linked += 1
      await assert.rejects(
        prepareCatalogScratchPaths({ ...roots, requested, batch: '1' }),
        /link|junction/i,
      )
    }
    assert.ok(linked > 0)
    for (const child of ['preview-dist', 'playwright-profile', 'batch-1']) {
      await assert.rejects(readFile(path.join(roots.repoRoot, child)), /ENOENT|EISDIR/)
    }
  })
})

test('flags an unexpected successful HTTPS response even when routing succeeds', () => {
  const allowedUrls = new Set(['https://api.example.invalid/allowed'])
  assert.equal(catalogRequestFailure({
    url: 'https://api.example.invalid/allowed',
    status: 200,
    allowedUrls,
  }), null)
  assert.match(catalogRequestFailure({
    url: 'https://unexpected.example.invalid/data',
    status: 200,
    allowedUrls,
  }), /unexpected.*200.*unexpected\.example\.invalid/i)
  assert.equal(catalogRequestFailure({
    url: 'chrome-extension://contract/newtab.html',
    status: 200,
    allowedUrls,
  }), null)
})

test('rejects a nondegenerate wrapper with no visible text, semantic image, or enabled control', () => {
  const dom = new JSDOM('<div id="widget"><span aria-hidden="true">decorative</span></div>')
  const widget = dom.window.document.getElementById('widget')
  widget.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 40, bottom: 24, width: 40, height: 24, toJSON() {} })
  assert.deepEqual(catalogWidgetUsefulness(widget), {
    width: 40,
    height: 24,
    hasUsefulContent: false,
  })

  widget.insertAdjacentHTML('beforeend', '<button type="button">Open details</button>')
  assert.equal(catalogWidgetUsefulness(widget).hasUsefulContent, true)
})
