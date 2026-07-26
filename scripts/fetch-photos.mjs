// Dev-time only. Downloads the bundled background set from picsum.photos
// (Unsplash-sourced) into public/photos/ and writes credits to
// src/services/photos/photos.json. Never ships in or runs from the extension.
import { mkdir, writeFile } from 'node:fs/promises'

// Candidate Picsum image ids (calm landscapes). Review the downloads visually;
// replace any id that isn't a calm landscape, keep 10.
const PICKS = [1015, 1016, 1018, 1036, 1039, 1043, 1044, 1053, 1064, 1080]

await mkdir('public/photos', { recursive: true })
const manifest = []
for (const id of PICKS.slice(0, 12)) {
  const res = await fetch(`https://picsum.photos/id/${id}/1920/1200.webp`)
  if (!res.ok) {
    console.warn(`skip id ${id}: HTTP ${res.status}`)
    continue
  }
  const file = `p${String(manifest.length + 1).padStart(2, '0')}.webp`
  await writeFile(`public/photos/${file}`, Buffer.from(await res.arrayBuffer()))
  const info = await (await fetch(`https://picsum.photos/id/${id}/info`)).json()
  manifest.push({ file, label: `Photo by ${info.author}`, author: info.author, source: info.url })
  console.log(`saved ${file} (picsum id ${id}, by ${info.author})`)
}
await writeFile('src/services/photos/photos.json', JSON.stringify(manifest, null, 2))
console.log(`wrote manifest with ${manifest.length} photos`)
