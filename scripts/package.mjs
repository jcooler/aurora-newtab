// Chrome Web Store packaging: verifies a production `dist/` build is actually
// safe to submit, then zips its CONTENTS (not the `dist/` folder itself —
// CWS requires manifest.json etc. to sit at the zip root) into
// `release/aurora-<version>.zip`.
//
// Usage: npm run package (chains `npm run build` first — see package.json).
// Running this script directly assumes `dist/` is already an up-to-date
// PRODUCTION build (`npm run build`, not `build:preview` — a preview build
// would trip the bookmarks-permission-leak check below on purpose).
//
// No zip library is used: adding one would touch package.json/package-lock
// beyond the version bump this release is scoped to, so this hand-rolls a
// minimal (but spec-correct) ZIP writer on top of node:zlib's deflateRawSync
// and crc32 (both built in since Node 20.12).
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { deflateRawSync, crc32 } from 'node:zlib'

const root = process.cwd()
const distDir = join(root, 'dist')
const releaseDir = join(root, 'release')

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. Verify
// ---------------------------------------------------------------------------

if (!existsSync(distDir)) fail('dist/ does not exist — run `npm run build` first.')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const manifestPath = join(distDir, 'manifest.json')
if (!existsSync(manifestPath)) fail('dist/manifest.json is missing.')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

if (manifest.version !== pkg.version) {
  fail(
    `manifest version (${manifest.version}) does not match package.json version (${pkg.version}). ` +
      'Bump both src/manifest.ts and package.json together.',
  )
}
console.log(`OK: manifest version matches package.json (${pkg.version})`)

// Preview-mode leak guard: `bookmarks` must NEVER be an install-time
// permission in a build that ships — it's supposed to live only in
// `optional_permissions`, requested at runtime (see src/manifest.ts's long
// comment on the preview/production split). If it shows up here, `dist/`
// was built with `--mode preview` (or some other mistake) and must not be
// packaged.
const installTimePermissions = manifest.permissions ?? []
if (installTimePermissions.includes('bookmarks')) {
  fail(
    'dist/manifest.json holds `bookmarks` as an INSTALL-TIME permission — this is a preview build ' +
      '(`npm run build:preview`), not a production one. Run `npm run build` and try again.',
  )
}
console.log('OK: bookmarks is not an install-time permission (production manifest)')

// No sourcemaps.
const allFiles = []
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else allFiles.push(full)
  }
}
walk(distDir)

const mapFiles = allFiles.filter((f) => f.endsWith('.map'))
if (mapFiles.length > 0) {
  fail(`sourcemap file(s) present in dist/: ${mapFiles.map((f) => relative(distDir, f)).join(', ')}`)
}
console.log('OK: no sourcemap (.map) files in dist/')

// Icons.
const requiredIcons = ['icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png']
for (const rel of requiredIcons) {
  if (!existsSync(join(distDir, rel))) fail(`missing required icon: dist/${rel}`)
}
console.log('OK: all three icon sizes present')

// Photos: cross-check dist/photos against every tier file the bundled photo
// manifest (src/services/photos/photos.json) expects, not just "the folder
// exists" — a partial encode (e.g. a crashed encode-photos.mjs run) would
// otherwise ship a dashboard where some daily-rotation days 404.
const photosManifestPath = join(root, 'src', 'services', 'photos', 'photos.json')
if (!existsSync(photosManifestPath)) fail('src/services/photos/photos.json is missing.')
const photosManifest = JSON.parse(readFileSync(photosManifestPath, 'utf8'))
const expectedPhotoFiles = photosManifest.flatMap((p) => Object.values(p.tiers))
if (expectedPhotoFiles.length === 0) fail('photo manifest lists zero photos.')

const distPhotosDir = join(distDir, 'photos')
if (!existsSync(distPhotosDir)) fail('dist/photos/ is missing.')
const missingPhotos = expectedPhotoFiles.filter((f) => !existsSync(join(distPhotosDir, f)))
if (missingPhotos.length > 0) {
  fail(`dist/photos/ is missing ${missingPhotos.length} file(s) the photo manifest expects: ${missingPhotos.slice(0, 5).join(', ')}${missingPhotos.length > 5 ? ', …' : ''}`)
}
console.log(`OK: all ${expectedPhotoFiles.length} bundled photo tiers present in dist/photos/`)

// ---------------------------------------------------------------------------
// 2. Zip (contents at zip root — CWS uploads must not nest a dist/ folder)
// ---------------------------------------------------------------------------

function toDosTime(date) {
  const dosTime =
    (date.getSeconds() >> 1) | (date.getMinutes() << 5) | (date.getHours() << 11)
  const dosDate =
    date.getDate() | ((date.getMonth() + 1) << 5) | ((date.getFullYear() - 1980) << 9)
  return { dosTime, dosDate }
}

class ZipWriter {
  constructor() {
    this.chunks = []
    this.offset = 0
    this.central = []
  }

  addFile(name, data, mtime = new Date()) {
    const zipName = name.split(sep).join('/') // zip spec wants forward slashes
    const nameBuf = Buffer.from(zipName, 'utf8')
    const crc = crc32(data)
    const compressed = deflateRawSync(data)
    const useDeflate = compressed.length < data.length
    const payload = useDeflate ? compressed : data
    const method = useDeflate ? 8 : 0
    const { dosTime, dosDate } = toDosTime(mtime)
    const GPBIT_UTF8 = 0x0800

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4) // version needed
    localHeader.writeUInt16LE(GPBIT_UTF8, 6)
    localHeader.writeUInt16LE(method, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(payload.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(nameBuf.length, 26)
    localHeader.writeUInt16LE(0, 28)

    const localOffset = this.offset
    this.chunks.push(localHeader, nameBuf, payload)
    this.offset += localHeader.length + nameBuf.length + payload.length

    this.central.push({ nameBuf, crc, compressedSize: payload.length, size: data.length, method, dosTime, dosDate, localOffset })
  }

  finalize() {
    const centralChunks = []
    let centralSize = 0
    for (const e of this.central) {
      const header = Buffer.alloc(46)
      header.writeUInt32LE(0x02014b50, 0)
      header.writeUInt16LE(20, 4) // version made by
      header.writeUInt16LE(20, 6) // version needed
      header.writeUInt16LE(0x0800, 8) // general purpose bit flag (UTF-8 name)
      header.writeUInt16LE(e.method, 10)
      header.writeUInt16LE(e.dosTime, 12)
      header.writeUInt16LE(e.dosDate, 14)
      header.writeUInt32LE(e.crc, 16)
      header.writeUInt32LE(e.compressedSize, 20)
      header.writeUInt32LE(e.size, 24)
      header.writeUInt16LE(e.nameBuf.length, 28)
      header.writeUInt16LE(0, 30) // extra length
      header.writeUInt16LE(0, 32) // comment length
      header.writeUInt16LE(0, 34) // disk number start
      header.writeUInt16LE(0, 36) // internal attributes
      header.writeUInt32LE(0, 38) // external attributes
      header.writeUInt32LE(e.localOffset, 42)
      centralChunks.push(header, e.nameBuf)
      centralSize += header.length + e.nameBuf.length
    }
    const centralOffset = this.offset

    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(0, 4)
    eocd.writeUInt16LE(0, 6)
    eocd.writeUInt16LE(this.central.length, 8)
    eocd.writeUInt16LE(this.central.length, 10)
    eocd.writeUInt32LE(centralSize, 12)
    eocd.writeUInt32LE(centralOffset, 16)
    eocd.writeUInt16LE(0, 20)

    return Buffer.concat([...this.chunks, ...centralChunks, eocd])
  }
}

const zip = new ZipWriter()
const summary = new Map() // top-level dist/ entry -> { files, bytes }

for (const file of allFiles) {
  const rel = relative(distDir, file)
  const data = readFileSync(file)
  zip.addFile(rel, data, statSync(file).mtime)

  const top = rel.split(sep)[0]
  const s = summary.get(top) ?? { files: 0, bytes: 0 }
  s.files += 1
  s.bytes += data.length
  summary.set(top, s)
}

const zipBuffer = zip.finalize()

mkdirSync(releaseDir, { recursive: true })
const zipPath = join(releaseDir, `aurora-${pkg.version}.zip`)
writeFileSync(zipPath, zipBuffer)

// ---------------------------------------------------------------------------
// 3. Report
// ---------------------------------------------------------------------------

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

console.log('')
console.log(`Wrote ${relative(root, zipPath)} — ${humanSize(zipBuffer.length)} (${allFiles.length} files)`)
console.log('Contents:')
for (const [top, s] of [...summary.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(`  ${top.padEnd(20)} ${String(s.files).padStart(3)} file(s)  ${humanSize(s.bytes)}`)
}
