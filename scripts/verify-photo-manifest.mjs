// Dev-time only. Script-level check (no test runner needed) that the built
// photo manifest and its on-disk AVIF assets are consistent: every kept
// candidate in photo-candidates.json (i.e. everything without an
// `excluded` reason) has exactly one runtime manifest entry, each with both
// an untouched original or both legacy resolution tiers present as real files under public/photos/. Run after
// encode-photos.mjs, or any time as a standalone sanity check:
//   node scripts/verify-photo-manifest.mjs
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const TIER_NAMES = ['2560x1600', '3840x2400']

let failed = false
function check(condition, message) {
  console.log(condition ? `PASS: ${message}` : `FAIL: ${message}`)
  if (!condition) failed = true
}

const candidates = JSON.parse(await readFile('scripts/photo-candidates.json', 'utf8'))
const kept = candidates.filter((c) => !c.excluded)
const manifest = JSON.parse(await readFile('src/services/photos/photos.json', 'utf8'))

check(
  manifest.length === kept.length,
  `manifest has one entry per kept candidate (${manifest.length} manifest entries, ${kept.length} kept candidates)`,
)

const keptIds = new Set(kept.map((c) => c.id))
const manifestIds = new Set(manifest.map((p) => p.id))
check(
  kept.every((c) => manifestIds.has(c.id)) && manifest.every((p) => keptIds.has(p.id)),
  'manifest ids exactly match the kept (non-excluded) candidate ids',
)

check(
  manifest.every((p) => !candidates.find((c) => c.id === p.id)?.excluded),
  'no excluded candidate id appears in the manifest',
)

let allSourcesOk = true
let allFilesExist = true
let assetCount = 0
for (const photo of manifest) {
  const tierNames = Object.keys(photo.tiers ?? {})
  const hasOriginal = typeof photo.original === 'string' && photo.original.length > 0
  const hasLegacyTiers = tierNames.length === 2 && TIER_NAMES.every((t) => tierNames.includes(t))
  if (hasOriginal === hasLegacyTiers) {
    allSourcesOk = false
    console.log(`  - ${photo.id}: expected exactly one original or the legacy tier pair`)
  }
  const files = hasOriginal ? [photo.original] : TIER_NAMES.map((tier) => photo.tiers?.[tier])
  files.push(photo.preview)
  assetCount += files.length
  for (const file of files) {
    if (!file || !existsSync(`public/photos/${file}`)) {
      allFilesExist = false
      console.log(`  - ${photo.id}: file missing on disk: ${file ?? '<no entry>'}`)
    }
  }
}
check(allSourcesOk, 'every manifest entry has exactly one original or the legacy tier pair')
check(allFilesExist, 'every manifest photo file exists under public/photos/')

check(
  manifest.every((p) => typeof p.photographer === 'string' && p.photographer.length > 0),
  'every manifest entry has a non-empty photographer credit',
)
check(
  manifest.every((p) => typeof p.license === 'string' && p.license.length > 0),
  'every manifest entry has a non-empty license',
)
check(
  manifest.every((p) => typeof p.source === 'string' && /^https?:\/\//.test(p.source)),
  'every manifest entry has a source URL',
)

// LQIP (2026-08-07). Background.tsx paints these under the photo to cover
// its decode gap, so a missing one silently reverts that photo to the old
// photo→gradient→photo flash — invisible in every screenshot, which is
// exactly why it's checked here. Regenerate with:
//   node scripts/encode-photos.mjs --lqip-only
const missingLqip = manifest.filter((p) => typeof p.lqip !== 'string' || p.lqip.length === 0)
check(
  missingLqip.length === 0,
  `every manifest entry has an lqip placeholder${missingLqip.length ? ` (missing: ${missingLqip.map((p) => p.id).join(', ')})` : ''}`,
)
// Inline, not a path: a placeholder for a decode gap must not need a load
// of its own to appear.
const notInline = manifest.filter((p) => !String(p.lqip).startsWith('data:image/'))
check(
  notInline.length === 0,
  `every lqip is an inline data URI${notInline.length ? ` (not inline: ${notInline.map((p) => p.id).join(', ')})` : ''}`,
)
// Budget: these ride in the JS bundle, parsed on every new tab.
const LQIP_BUDGET = 200 * 1024
const lqipBytes = manifest.reduce((sum, p) => sum + String(p.lqip ?? '').length, 0)
check(
  lqipBytes < LQIP_BUDGET,
  `the whole lqip set fits the bundle budget (${(lqipBytes / 1024).toFixed(1)}KB of ${LQIP_BUDGET / 1024}KB)`,
)

console.log(failed ? '\nFAIL: photo manifest verification failed' : `\nPASS: photo manifest verification passed (${manifest.length} photos, ${assetCount} files)`)
process.exit(failed ? 1 : 0)
