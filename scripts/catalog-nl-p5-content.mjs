import { createHash } from 'node:crypto'
import path from 'node:path'

import { CATALOG_BATCHES, CATALOG_CONTRACTS } from './widget-catalog-manifest.mjs'
import { resolveSafeExpansionOutput } from './expansion/output-safety.mjs'

const HEADER_1 = [
  '# NL-P5 Tier Catalog — Batch 1',
  '',
  'Owner review per the named-layouts spec §2.3: each widget, each supported',
  'tier, judged as a designed composition under the no-whitespace law. Docked',
  'lines are one dense text-first row (middle dots separate facts). Captures',
  'were taken from the production preview build at 1600x900 with seeded data.',
  '',
  'Batch-1 notes for the review:',
  '- Timer/Tasks/Notes Docked lines are their existing dense launcher chips, declared rather than rebuilt.',
  '- Bookmarks Docked is the full readable bar (spec exemption).',
  '- Focus Docked is its existing single-line form rendered in the strip.',
  '- greeting, search, and quote declare NO Docked tier in batch 1 (no honest one-line dock form); overrule here if wanted.',
  '- The docked Weather line omits the free chip\'s staleness/offline feedback text (a one-dense-line tradeoff); a stale cache reads like a fresh one in the strip. Owner call: accept, or add a muted staleness marker.',
  '',
]

const HEADER_2 = [
  '# NL-P5 Tier Catalog — Batch 2',
  '',
  'Owner review per the named-layouts spec §2.3: the nine connector widgets',
  'plus the remaining small widgets, each at every supported tier. Docked',
  'lines are one dense text-first row (middle dots separate facts), built',
  'from the SAME snapshot each widget already renders — no second fetch.',
  'Captures were taken from the production preview build at 1600x900 with',
  'the authoritative nine-connector fixture data.',
  '',
  'Batch-2 notes for the review:',
  '- Connector dock lines are non-interactive readouts: their free forms offer no panel or expansion, so a readout IS click parity (spec 2.4). Overrule here if a docked connector should open something.',
  '- worldClocks and countdown declare Docked with their existing compact single-line compositions (declared, not rebuilt); judge them in the strip captures.',
  '- sun and moon now render bare dense DockLines at the shared strip density (no panel), per the batch-2 owner review.',
  '- monthCal and links declare NO Docked tier (a month grid and a launcher grid have no honest one-line form); overrule here if wanted.',
  '- The batch-2 owner review removed the compact Month tier ("takes up way too much space, just remove it") — the complete month is Month\'s only tier.',
  '- The GitHub line follows the spec\'s own example shape (PRs · issues · unread). Quiet states read "All clear".',
  '- Bookmarks are a batch-1 widget: reviewed and approved in the batch-1 catalog (full readable bar, single-letter compact marks).',
  '',
]

const APPROVED = 'Approved (owner review 2026-08-18)'
const VERDICTS = Object.freeze({
  '1': Object.freeze({
    'weather-compact': 'Approved with refinement (2026-08-18): the F/C scale letter was a smidge too large — pinned to the 12px metadata floor. Applied.',
    'bookmarks-compact': 'Approved with refinement (2026-08-18): single-letter folder marks (N for News, D for Docs, M for Music). Applied.',
  }),
  '2': Object.freeze({
    'github-full': 'Approved with refinement (2026-08-18): full looked exactly like standard — now a wider card (25rem) with a larger graph (18px cells). Applied.',
    'gitlab-full': 'Approved with refinement (2026-08-18): full looked exactly like standard — now a wider card (25rem) with a larger graph (18px cells). Applied.',
    'github-compact': 'Approved with refinement (2026-08-18): match GitLab compact — graph with streak and contributions. Applied.',
    'status-compact': 'Approved with refinement (2026-08-18): dots without names were not intuitive — compact stays dots-only with hover titles naming each service. Applied.',
    'status-standard': 'Approved with refinement (2026-08-18): dots without names were not intuitive — service names now shown beside each dot. Applied.',
    'sun-docked': 'Approved with refinement (2026-08-18): docked previously rendered the padded card and out-sized compact — now a bare dense line at the shared strip density, no panel. Applied.',
    'moon-docked': 'Approved with refinement (2026-08-18): docked previously rendered the padded card and out-sized compact — now a bare dense line at the shared strip density, no panel. Applied.',
  }),
})

export function parseCatalogArgs(args, cwd = process.cwd()) {
  const options = { batch: '1', headed: false, check: false, outDir: undefined, outDirExplicit: false }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--headed') {
      options.headed = true
      continue
    }
    if (argument === '--check') {
      options.check = true
      continue
    }
    const [flag, inline] = argument.split('=', 2)
    if (flag === '--batch') {
      const value = inline ?? args[++index]
      if (value !== '1' && value !== '2') throw new Error('--batch must be 1 or 2')
      options.batch = value
      continue
    }
    if (flag === '--out-dir') {
      const value = inline ?? args[++index]
      if (!value) throw new Error('--out-dir requires a path')
      options.outDir = path.resolve(cwd, value)
      options.outDirExplicit = true
      continue
    }
    throw new Error(`unknown argument: ${argument}`)
  }
  options.outDir ??= path.resolve(cwd, `docs/superpowers/catalog/batch-${options.batch}`)
  return options
}

export async function prepareCatalogScratchPaths({ repoRoot, protectedRoot, requested, batch }) {
  if (batch !== '1' && batch !== '2') throw new Error('batch must be 1 or 2')
  const catalogChild = `batch-${batch}`
  const evidenceChild = `evidence-batch-${batch}.json`
  const root = await resolveSafeExpansionOutput({
    repoRoot,
    protectedRoot,
    requested,
    requiredPrefix: '.qa-expansion-platform-',
    plannedChildren: ['preview-dist', 'playwright-profile', catalogChild, evidenceChild],
  })
  return {
    root,
    catalogDir: path.join(root, catalogChild),
    dist: path.join(root, 'preview-dist'),
    profileDir: path.join(root, 'playwright-profile'),
    evidencePath: path.join(root, evidenceChild),
  }
}

export function catalogRequestFailure({ url, status, allowedUrls }) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null
  if (allowedUrls.has(url)) return null
  return `unexpected external response ${status ?? 'unknown'}: ${url}`
}

function elementIsHidden(element) {
  for (let cursor = element; cursor; cursor = cursor.parentElement) {
    if (cursor.hidden || cursor.getAttribute('aria-hidden') === 'true') return true
    const view = cursor.ownerDocument?.defaultView
    const style = view?.getComputedStyle?.(cursor)
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return true
  }
  return false
}

export function catalogWidgetUsefulness(rootOrProbe) {
  if (!rootOrProbe || typeof rootOrProbe !== 'object') {
    return { width: 0, height: 0, hasUsefulContent: false }
  }
  if (typeof rootOrProbe.getBoundingClientRect !== 'function') {
    const width = Number(rootOrProbe.width) || 0
    const height = Number(rootOrProbe.height) || 0
    return {
      width,
      height,
      hasUsefulContent: Boolean(rootOrProbe.hasVisibleText || rootOrProbe.hasSemanticImage || rootOrProbe.hasEnabledControl),
    }
  }

  const root = rootOrProbe
  const rect = root.getBoundingClientRect()
  const view = root.ownerDocument?.defaultView
  const NodeFilterCtor = view?.NodeFilter
  let hasVisibleText = false
  if (NodeFilterCtor) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilterCtor.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement
      if (node.textContent?.trim() && parent && !elementIsHidden(parent)) {
        hasVisibleText = true
        break
      }
    }
  }

  const semanticImages = root.querySelectorAll?.('img[alt], [role="img"][aria-label], svg[aria-label], svg title') ?? []
  const hasSemanticImage = [...semanticImages].some((element) => {
    if (elementIsHidden(element)) return false
    if (element.matches?.('img[alt]')) return Boolean(element.getAttribute('alt')?.trim())
    if (element.matches?.('svg title')) return Boolean(element.textContent?.trim())
    return Boolean(element.getAttribute?.('aria-label')?.trim())
  })
  const controls = root.querySelectorAll?.('button, input, select, textarea, a[href], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="slider"], [role="listbox"]') ?? []
  const hasEnabledControl = [...controls].some((element) => (
    !elementIsHidden(element)
    && !element.hasAttribute('disabled')
    && element.getAttribute('aria-disabled') !== 'true'
    && element.getAttribute('type') !== 'hidden'
  ))

  return {
    width: rect.width,
    height: rect.height,
    hasUsefulContent: hasVisibleText || hasSemanticImage || hasEnabledControl,
  }
}

export function renderCatalogMarkdown({ batch, captureHash }) {
  const entries = CATALOG_BATCHES[batch]
  const contracts = CATALOG_CONTRACTS[batch]
  if (!entries || !contracts) throw new Error(`unknown catalog batch: ${batch}`)
  const lines = batch === '2' ? [...HEADER_2] : [...HEADER_1]
  const verdicts = VERDICTS[batch]

  for (const { id, label, tiers } of entries) {
    lines.push(`## ${label}`, '')
    lines.push('| Tier | Content contract | Capture | Owner verdict |')
    lines.push('| --- | --- | --- | --- |')
    for (const tier of tiers) {
      const own = captureHash(`${id}-${tier}`)
      let twin = null
      if (own) {
        for (const other of tiers) {
          if (other === tier) break
          if (captureHash(`${id}-${other}`) === own) {
            twin = other
            break
          }
        }
      }
      const disclosure = twin
        ? `<br>_Currently renders identically to ${twin}${id === 'bookmarks' ? ' (spec exemption: the full readable bar at every tier)' : ' — tier differentiation pending owner direction'}_`
        : ''
      const verdict = verdicts[`${id}-${tier}`] ?? APPROVED
      lines.push(`| ${tier} | ${contracts[id][tier]}${disclosure} | ![${id} ${tier}](${id}-${tier}.png) | ${verdict} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export async function checkCatalogArtifacts({ batch, outDir, readFile }) {
  const entries = CATALOG_BATCHES[batch]
  if (!entries) return { ok: false, errors: [`unknown catalog batch: ${batch}`] }
  const errors = []
  const hashes = new Map()
  for (const { id, tiers } of entries) {
    for (const tier of tiers) {
      const filename = `${id}-${tier}.png`
      try {
        const bytes = await readFile(path.join(outDir, filename))
        hashes.set(`${id}-${tier}`, createHash('md5').update(bytes).digest('hex'))
      } catch {
        errors.push(`${filename} is missing or unreadable`)
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors }

  const expected = renderCatalogMarkdown({ batch, captureHash: (name) => hashes.get(name) ?? null })
  try {
    const actual = await readFile(path.join(outDir, 'CATALOG.md'), 'utf8')
    if (actual !== expected) errors.push('CATALOG.md is stale or references a capture outside the declared manifest')
  } catch {
    errors.push('CATALOG.md is missing or unreadable')
  }
  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors }
}
