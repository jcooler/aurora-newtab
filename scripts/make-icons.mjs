// Dev-time icon generator: renders the canonical Tab Two vector mark via
// Playwright and captures it at every size declared by the manifest. Never ships in the
// extension — run once (or whenever the mark changes) and commit the
// resulting PNGs in public/icons/.
//
// Usage: node scripts/make-icons.mjs
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const outDir = resolve('public/icons')
mkdirSync(outDir, { recursive: true })

const VIEWBOX = 128
const SIZES = [128, 48, 32, 16]
const svg = readFileSync(resolve('public/icons/tab-two-mark.svg'), 'utf8').replace('<svg ', '<svg id="icon" ')

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
