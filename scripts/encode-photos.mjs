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
//
// DECODE-TIMING RECORD (measured 2026-07-29, headless Chromium via
// HTMLImageElement.decode(), 5 runs each, post-q80/q90 re-encode):
//   2560-tier median file (657KB):  ~36ms   — under the ~50ms comfort bar
//   3840-tier median file (1.51MB): ~68ms   — over the bar, judged acceptable:
//   3840-tier largest file (5.09MB, the one q90 override): ~136-165ms
// Ruling (controller): the bg-fallback gradient paints instantly and the
// 700ms opacity fade-in makes decode latency read as an entrance, not a
// stall, so no quality was traded away. If snappier photo-in is ever
// wanted, the right fix is a blur-up swap (paint the 2560 tier immediately,
// swap to 3840 when decoded) — not lowering q.
//
// LQIP (2026-08-07): that decode cost is also what makes a purged background
// tab flash. Chrome drops the decoded/rasterized image memory of background
// tabs under pressure; on re-display the tier above has to re-decode, and
// for those 36-165ms whatever sits BEHIND the <img> is what's on screen —
// which used to be the bg-fallback gradient, i.e. a photo→gradient→photo
// flash. So every photo also gets a 32x20 WebP placeholder, emitted as an
// inline base64 data URI in the manifest rather than a file under
// public/photos/. Inline is the whole point: at the instant the decode gap
// opens, a placeholder that still needs a load (even an extension-local one,
// and even more so right after memory pressure evicted caches) is a
// placeholder that isn't there yet. In the manifest it is already parsed,
// already resident, and re-decodes in well under a frame. The 23 of them
// together cost ~8KB.
//
// USAGE
//   node scripts/encode-photos.mjs             full run (re-encodes both tiers)
//   node scripts/encode-photos.mjs --lqip-only refresh just the `lqip` fields
// The --lqip-only mode exists because the two AVIF tiers are committed
// binaries totalling ~58MB: re-encoding all 46 of them to change one string
// field per entry would churn the repo for no reason. Both modes derive the
// LQIP from the SAME source — the already-written 2560x1600 tier file — so
// they produce identical bytes, and the placeholder is guaranteed to be the
// exact crop that ships (the 2560 tier is 16:10 and so is 32x20, making the
// downscale a pure resize with no second attention-crop decision that could
// frame it differently from the photo it sits under).
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import sharp from 'sharp'

const CANDIDATES_DIR = '.photo-work/candidates'
const OUT_DIR = 'public/photos'

const TIERS = {
  '2560x1600': { width: 2560, height: 1600 },
  '3840x2400': { width: 3840, height: 2400 },
}

// The tier the LQIP is downscaled from — 16:10, same as LQIP_SIZE, so no crop.
const LQIP_SOURCE_TIER = '2560x1600'
// 32px wide is the standard blur-up size: enough to carry the photo's colour
// composition and gross shapes through a heavy CSS blur, small enough that
// the encode is a couple of hundred bytes. WebP beats AVIF and JPEG at this
// size by a wide margin — measured on four of the bundled photos, WebP q60
// lands at 186-256B where AVIF q50 is 384-452B (its container overhead
// dominates at this resolution) and mozjpeg q50 is 435-481B. Quality is
// almost irrelevant here since the layer is rendered under `blur(40px)`.
const LQIP_SIZE = { width: 32, height: 20 }
const LQIP_QUALITY = 60

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

/** Inline base64 data URI of a 32x20 WebP downscale of the given tier file. */
async function encodeLqip(tierFile) {
  const buf = await sharp(`${OUT_DIR}/${tierFile}`)
    .resize(LQIP_SIZE.width, LQIP_SIZE.height, { fit: 'cover' })
    .webp({ quality: LQIP_QUALITY, effort: 6 })
    .toBuffer()
  return `data:image/webp;base64,${buf.toString('base64')}`
}

async function main() {
  const lqipOnly = process.argv.includes('--lqip-only')
  const all = JSON.parse(await readFile('scripts/photo-candidates.json', 'utf8'))
  const kept = all.filter((c) => !c.excluded)

  // --lqip-only reuses the manifest and the committed tier files as-is and
  // rewrites nothing but each entry's `lqip`; see the header comment.
  if (lqipOnly) {
    const manifest = JSON.parse(await readFile('src/services/photos/photos.json', 'utf8'))
    let total = 0
    for (const photo of manifest) {
      photo.lqip = await encodeLqip(photo.tiers[LQIP_SOURCE_TIER])
      total += photo.lqip.length
      console.log(`lqip ${photo.id}: ${photo.lqip.length} B (data URI)`)
    }
    await writeFile('src/services/photos/photos.json', JSON.stringify(manifest, null, 2) + '\n')
    console.log(`\nwrote ${manifest.length} LQIP data URIs, ${(total / 1024).toFixed(1)}KB total`)
    return
  }

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
      lqip: await encodeLqip(tiers[LQIP_SOURCE_TIER]),
    })
    console.log(`encoded ${c.id} (q${quality}): ${Object.values(tiers).join(', ')} [${Object.values(bytes).map((b) => (b / 1024).toFixed(0) + 'KB').join(', ')}]`)
  }

  await writeFile('src/services/photos/photos.json', JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\nwrote src/services/photos/photos.json with ${manifest.length} photos`)
}

main()
