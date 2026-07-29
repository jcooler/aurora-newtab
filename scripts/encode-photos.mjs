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
// targeting visual transparency without oversized files. Gradient-heavy
// content (aurora curtains, night skies) is the banding risk at this
// quality — 4:4:4 chroma (full color resolution, no subsampling) matters
// more than the quality number here, since banding in these images is
// mostly a chroma-plane artifact. The 7 highest-risk frames in the set (the
// smoothest/largest aurora curtains, the Milky Way frame, and the ISS
// Earth-limb shot) were each checked at a 100%-crop, full native-tier PNG
// export after encoding at the default — none showed visible banding, so no
// per-id overrides were needed this round. Left in place (empty) for the
// next photo-set revision, if a future candidate needs one.
const DEFAULT_QUALITY = 60
const QUALITY_OVERRIDES = {
  // id: quality
}

function slug(candidate) {
  return `${String(candidate.num).padStart(2, '0')}-${candidate.id}`
}

async function encodeTier(candidate, tierName, tierSize, quality) {
  const srcPath = `${CANDIDATES_DIR}/${candidate.file}`
  const outFile = `${slug(candidate)}-${tierName}.avif`
  await sharp(srcPath)
    .resize(tierSize.width, tierSize.height, { fit: 'cover', position: 'attention' })
    .avif({ quality, effort: 5, chromaSubsampling: '4:4:4' })
    .toFile(`${OUT_DIR}/${outFile}`)
  return outFile
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
    for (const [tierName, tierSize] of Object.entries(TIERS)) {
      tiers[tierName] = await encodeTier(c, tierName, tierSize, quality)
    }
    manifest.push({
      id: c.id,
      tiers,
      label: `Photo by ${c.photographer}`,
      photographer: c.photographer,
      license: c.license,
      source: c.source,
    })
    console.log(`encoded ${c.id} (q${quality}): ${Object.values(tiers).join(', ')}`)
  }

  await writeFile('src/services/photos/photos.json', JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\nwrote src/services/photos/photos.json with ${manifest.length} photos`)
}

main()
