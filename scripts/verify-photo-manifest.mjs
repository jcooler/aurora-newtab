// Dev-time only. Script-level check (no test runner needed) that the built
// photo manifest and its on-disk AVIF assets are consistent: every kept
// candidate in photo-candidates.json (i.e. everything without an
// `excluded` reason) has exactly one runtime manifest entry, each with both
// resolution tiers present as real files under public/photos/. Run after
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

let allTiersOk = true
let allFilesExist = true
for (const photo of manifest) {
  const tierNames = Object.keys(photo.tiers ?? {})
  if (tierNames.length !== 2 || !TIER_NAMES.every((t) => tierNames.includes(t))) {
    allTiersOk = false
    console.log(`  - ${photo.id}: expected tiers [${TIER_NAMES.join(', ')}], got [${tierNames.join(', ')}]`)
  }
  for (const tier of TIER_NAMES) {
    const file = photo.tiers?.[tier]
    if (!file || !existsSync(`public/photos/${file}`)) {
      allFilesExist = false
      console.log(`  - ${photo.id} (${tier}): file missing on disk — ${file ?? '<no entry>'}`)
    }
  }
}
check(allTiersOk, 'every manifest entry has exactly the 2560x1600 and 3840x2400 tiers')
check(allFilesExist, 'every tier file exists under public/photos/')

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

console.log(failed ? '\nFAIL: photo manifest verification failed' : `\nPASS: photo manifest verification passed (${manifest.length} photos, ${manifest.length * 2} tier files)`)
process.exit(failed ? 1 : 0)
