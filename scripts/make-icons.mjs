// Dev-time icon generator: renders an inline SVG (aurora gradient rounded
// square + a thin horizon-glow arc) via Playwright and captures it at the
// three sizes Chrome expects for manifest icons. Never ships in the
// extension — run once (or whenever the mark changes) and commit the
// resulting PNGs in public/icons/.
//
// Usage: node scripts/make-icons.mjs
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const outDir = resolve('public/icons')
mkdirSync(outDir, { recursive: true })

const VIEWBOX = 128
const SIZES = [128, 48, 16]

// Rounded square with a diagonal aurora gradient (deep night -> indigo ->
// sky cyan) and a thin crescent arc near the base suggesting a horizon glow.
const svg = `
<svg id="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" width="${VIEWBOX}" height="${VIEWBOX}">
  <defs>
    <linearGradient id="aurora" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="55%" stop-color="#312e81" />
      <stop offset="100%" stop-color="#7dd3fc" />
    </linearGradient>
    <clipPath id="rounded">
      <rect x="0" y="0" width="${VIEWBOX}" height="${VIEWBOX}" rx="28" ry="28" />
    </clipPath>
  </defs>
  <g clip-path="url(#rounded)">
    <rect x="0" y="0" width="${VIEWBOX}" height="${VIEWBOX}" fill="url(#aurora)" />
    <path
      d="M -12 92 Q 64 66 140 92"
      fill="none"
      stroke="#e0f2fe"
      stroke-width="6"
      stroke-linecap="round"
      opacity="0.55"
    />
  </g>
</svg>
`

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
    </style>
  </head>
  <body>${svg}</body>
</html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: VIEWBOX, height: VIEWBOX } })
await page.setContent(html)
const icon = await page.$('#icon')
if (!icon) throw new Error('icon svg element not found')

for (const size of SIZES) {
  await page.evaluate((s) => {
    const el = document.getElementById('icon')
    el.setAttribute('width', String(s))
    el.setAttribute('height', String(s))
  }, size)
  const path = `${outDir}/icon${size}.png`
  await icon.screenshot({ path, omitBackground: true })
  console.log(`captured ${path}`)
}

await browser.close()
