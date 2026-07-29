// Dev-time only. Phase B of the photo pipeline: reads
// scripts/photo-candidates.json, drops anything marked "excluded" (a
// controller cull or a full-res people recheck failure — see the field's
// value for the specific reason), and encodes every surviving candidate into
// two AVIF tiers for public/photos/: 2560x1600 and 3840x2400 (both a 16:10
// cover-crop via sharp's attention-based cropping, so the subject stays
// framed rather than an arbitrary corner). Reads its native-res source files
// from .photo-work/candidates/ (populated by build-candidates.mjs) rather
// than re-downloading — run that script first:
//   node scripts/build-candidates.mjs
//   node scripts/encode-photos.mjs
// Writes public/photos/*.avif (committed — these ship in the package) and
// src/services/photos/photos.json (the runtime manifest Background.tsx
// reads via src/services/photos/index.ts). Re-running is idempotent and
// will never resurrect an excluded candidate, because the exclusion lives
// in photo-candidates.json itself, not in this script.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import sharp from 'sharp'

const CANDIDATES_DIR = '.photo-work/candidates'
const OUT_DIR = 'public/photos'

const TIERS = {
  '2560x1600': { width: 2560, height: 1600 },
  '3840x2400': { width: 3840, height: 2400 },
}

// Default AVIF quality (sharp's 1-100 scale, higher = better/larger),
// targeting per-image visual transparency: for every kept candidate, a
// 1200x800 center crop of the 3840x2400-tier encode was checked against the
// same crop of a lossless PNG export of the same resize/crop pipeline (i.e.
// "the native original at 100%" for that tier — native source resolution
// varies per photo, so the lossless full-tier export is the only true
// like-for-like reference). q80 with 4:4:4 chroma (full color resolution,
// no subsampling — this matters more than the quality number for gradient
// banding) was visually transparent for 20 of the 23 photos: aurora
// curtains, starfields, dune ripples, water and foliage texture all held up
// with no detectable softening or banding. Three photos showed faint
// softening of fine, high-entropy grain/dust texture at q80 under a 2x
// zoomed crop comparison (ref vs q80/q85/q90) and were raised to q90 where
// they became indistinguishable from the reference:
//   - 1uwLmA5LFfg: fine noise/grain texture across the teal night sky
//   - -wEFdRCG4IU: Milky Way dust-cloud texture and faint star density
//   - 2Hzmz15wGik: heavy film-grain texture over the fog/canopy
// Re-run scripts/... comparisons (see .photo-work/compare*.mjs, gitignored
// scratch tooling) against any future candidate before assuming q80 holds.
const DEFAULT_QUALITY = 80
const QUALITY_OVERRIDES = {
  '1uwLmA5LFfg': 90, // teal night-sky grain softened at q80
  '-wEFdRCG4IU': 90, // Milky Way dust/star texture softened at q80
  '2Hzmz15wGik': 90, // heavy fog/canopy film grain softened at q80
}

function slug(candidate) {
  return `${String(candidate.num).padStart(2, '0')}-${candidate.id}`
}

async function encodeTier(candidate, tierName, tierSize, quality) {
  const srcPath = `${CANDIDATES_DIR}/${candidate.file}`
  const outFile = `${slug(candidate)}-${tierName}.avif`
  const info = await sharp(srcPath)
    .resize(tierSize.width, tierSize.height, { fit: 'cover', position: 'attention' })
    .avif({ quality, effort: 5, chromaSubsampling: '4:4:4' })
    .toFile(`${OUT_DIR}/${outFile}`)
  return { outFile, bytes: info.size }
}

async function main() {
  const all = JSON.parse(await readFile('scripts/photo-candidates.json', 'utf8'))
  const kept = all.filter((c) => !c.excluded)

  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })

  const manifest = []
  for (const c of kept) {
    const quality = QUALITY_OVERRIDES[c.id] ?? DEFAULT_QUALITY
    const tiers = {}
    const bytes = {}
    for (const [tierName, tierSize] of Object.entries(TIERS)) {
      const { outFile, bytes: size } = await encodeTier(c, tierName, tierSize, quality)
      tiers[tierName] = outFile
      bytes[tierName] = size
    }
    manifest.push({
      id: c.id,
      tiers,
      q: quality,
      bytes,
      label: `Photo by ${c.photographer}`,
      photographer: c.photographer,
      license: c.license,
      source: c.source,
    })
    console.log(`encoded ${c.id} (q${quality}): ${Object.values(tiers).join(', ')} [${Object.values(bytes).map((b) => (b / 1024).toFixed(0) + 'KB').join(', ')}]`)
  }

  await writeFile('src/services/photos/photos.json', JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\nwrote src/services/photos/photos.json with ${manifest.length} photos`)
}

main()
