// Dev-time only. Downloads the bundled background set from picsum.photos
// (Unsplash-sourced) into public/photos/ and writes credits to
// src/services/photos/photos.json. Never ships in or runs from the extension.
import { mkdir, writeFile } from 'node:fs/promises'

// Candidate Picsum image ids. Rule: pure landscapes/scenery ONLY — no people,
// no animals, no close-ups. Every download gets reviewed visually before the
// list is finalized; ids that fail review are removed and the script re-run.
// Final reviewed set (2026-07-26): every image visually confirmed to be a
// pure landscape — no people, no animals, no buildings-as-subject, no
// close-ups. Rejected during review: 1015 (crowd on Pulpit Rock), 1036 (tent
// camp), 110 (grazing cows), 33 (grass close-up), 49 (Santorini), 76 (shed),
// 78 (doorway), 164 (Bruges canal, people on dock), 1044 (person on rock).
const PICKS = [
  1016, 1018, 1039, 1043, 1053, 1064, 10, 11, 12, 13, 15, 28, 29, 37, 83, 93,
  120, 184, 190, 218, 235,
]

await mkdir('public/photos', { recursive: true })
const manifest = []
for (const id of PICKS) {
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
