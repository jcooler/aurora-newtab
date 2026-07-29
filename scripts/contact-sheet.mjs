// Dev-time only. Builds numbered contact sheets from the downloaded
// candidates in .photo-work/candidates/ (per scripts/photo-candidates.json)
// for visual controller review/cull, plus one full-resolution quality-sample
// crop demonstrating native-res detail vs. the current picsum-proxied
// pipeline. Nothing here ships in the extension. Run after build-candidates.mjs:
// `node scripts/contact-sheet.mjs`
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const CANDIDATES_DIR = '.photo-work/candidates'
const OUT_DIR = '.photo-work'
const PER_SHEET = 12
const COLS = 4
const CELL_W = 400
const CELL_IMG_H = 267 // 3:2-ish crop box for uniform grid cells
const LABEL_H = 44
const GUTTER = 16
const MARGIN = 24

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function buildCell(candidate) {
  const thumb = await sharp(`${CANDIDATES_DIR}/${candidate.file}`)
    .resize(CELL_W, CELL_IMG_H, { fit: 'cover', position: 'attention' })
    .toBuffer()

  const label = `#${candidate.num}  ${candidate.id}`
  const sub = `${candidate.category} — ${candidate.width}x${candidate.height}`
  const labelSvg = Buffer.from(`
    <svg width="${CELL_W}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#111318"/>
      <text x="8" y="18" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" fill="#ffffff">${escapeXml(label)}</text>
      <text x="8" y="35" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="#9aa0ab">${escapeXml(sub)}</text>
    </svg>
  `)

  return sharp({
    create: {
      width: CELL_W,
      height: CELL_IMG_H + LABEL_H,
      channels: 4,
      background: { r: 17, g: 19, b: 24, alpha: 1 },
    },
  })
    .composite([
      { input: thumb, left: 0, top: 0 },
      { input: labelSvg, left: 0, top: CELL_IMG_H },
    ])
    .png()
    .toBuffer()
}

async function buildSheet(candidates, sheetIndex) {
  const rows = Math.ceil(candidates.length / COLS)
  const cellTotalW = CELL_W + GUTTER
  const cellTotalH = CELL_IMG_H + LABEL_H + GUTTER
  const width = MARGIN * 2 + COLS * cellTotalW - GUTTER
  const height = MARGIN * 2 + rows * cellTotalH - GUTTER

  const cells = await Promise.all(candidates.map(buildCell))
  const composites = cells.map((buf, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    return {
      input: buf,
      left: MARGIN + col * cellTotalW,
      top: MARGIN + row * cellTotalH,
    }
  })

  const sheet = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 8, g: 9, b: 12, alpha: 1 },
    },
  }).composite(composites)

  const outPath = `${OUT_DIR}/contact-sheet-${sheetIndex}.png`
  await sheet.png().toFile(outPath)
  console.log(`wrote ${outPath} (${candidates.length} thumbnails, ${width}x${height})`)
}

async function buildQualitySample() {
  // Pick a high-detail, texture-rich native-res candidate for the demo crop
  // (a mountainside with foliage/rock reads the resolution gap far better
  // than a mostly-smooth aurora sky would).
  const manifest = JSON.parse(await readFile('scripts/photo-candidates.json', 'utf8'))
  const nativeCandidate = manifest.find((c) => c.id === 'YKN_G9L9nMA') ?? manifest[0]

  const CROP_W = 1200
  const CROP_H = 800

  const nativeImg = sharp(`${CANDIDATES_DIR}/${nativeCandidate.file}`)
  const nativeMeta = await nativeImg.metadata()
  const nLeft = Math.max(0, Math.round((nativeMeta.width - CROP_W) / 2))
  const nTop = Math.max(0, Math.round((nativeMeta.height - CROP_H) / 2))
  const nativeCrop = await sharp(`${CANDIDATES_DIR}/${nativeCandidate.file}`)
    .extract({ left: nLeft, top: nTop, width: CROP_W, height: CROP_H })
    .toBuffer()

  // Current pipeline representative: public/photos/p01.webp, capped at
  // 1920x1200 by the picsum proxy. To show what the current pipeline yields
  // for the *same relative crop*, take the equivalent proportional region
  // (same fraction of frame) and scale it up to the same 1200x800 display
  // size — this exposes the softness/blur the 1920x1200 cap forces on any
  // tight crop or high-DPI render, which is the actual defect being fixed.
  const currentPath = 'public/photos/p01.webp'
  const currentMeta = await sharp(currentPath).metadata()
  const fracW = CROP_W / nativeMeta.width
  const fracH = CROP_H / nativeMeta.height
  const cCropW = Math.max(1, Math.round(currentMeta.width * fracW))
  const cCropH = Math.max(1, Math.round(currentMeta.height * fracH))
  const cLeft = Math.max(0, Math.round((currentMeta.width - cCropW) / 2))
  const cTop = Math.max(0, Math.round((currentMeta.height - cCropH) / 2))
  const currentCrop = await sharp(currentPath)
    .extract({ left: cLeft, top: cTop, width: cCropW, height: cCropH })
    .resize(CROP_W, CROP_H, { kernel: 'cubic' }) // upscaled, same as a browser would do
    .toBuffer()

  const LABEL_H2 = 56
  const GAP = 24
  const width = CROP_W * 2 + GAP + MARGIN * 2
  const height = CROP_H + LABEL_H2 + MARGIN * 2

  const labelLeft = Buffer.from(`
    <svg width="${CROP_W}" height="${LABEL_H2}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#111318"/>
      <text x="8" y="22" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700" fill="#ffffff">Native-res candidate — #${nativeCandidate.num} ${nativeCandidate.id} (${nativeMeta.width}x${nativeMeta.height} source)</text>
      <text x="8" y="42" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#9aa0ab">1200x800 center crop, no upscaling</text>
    </svg>
  `)
  const labelRight = Buffer.from(`
    <svg width="${CROP_W}" height="${LABEL_H2}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#111318"/>
      <text x="8" y="22" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700" fill="#ffffff">Current pipeline — public/photos/p01.webp (${currentMeta.width}x${currentMeta.height} source)</text>
      <text x="8" y="42" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#9aa0ab">Same proportional crop region, upscaled to match — shows the 1920x1200 cap's softness</text>
    </svg>
  `)

  const canvas = sharp({
    create: { width, height, channels: 4, background: { r: 8, g: 9, b: 12, alpha: 1 } },
  }).composite([
    { input: labelLeft, left: MARGIN, top: MARGIN },
    { input: nativeCrop, left: MARGIN, top: MARGIN + LABEL_H2 },
    { input: labelRight, left: MARGIN + CROP_W + GAP, top: MARGIN },
    { input: currentCrop, left: MARGIN + CROP_W + GAP, top: MARGIN + LABEL_H2 },
  ])

  const outPath = `${OUT_DIR}/quality-sample.png`
  await canvas.png().toFile(outPath)
  console.log(`wrote ${outPath} (${width}x${height})`)
}

async function main() {
  const manifest = JSON.parse(await readFile('scripts/photo-candidates.json', 'utf8'))
  for (let i = 0; i < manifest.length; i += PER_SHEET) {
    const chunk = manifest.slice(i, i + PER_SHEET)
    await buildSheet(chunk, Math.floor(i / PER_SHEET) + 1)
  }
  await buildQualitySample()
}

main()
