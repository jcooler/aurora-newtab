// Dev-time only. Phase A of the photo pipeline upgrade: downloads ~30 curated
// native-resolution candidates (Unsplash direct downloads + NASA/Wikimedia
// Commons CC0/PD supplements) into the gitignored .photo-work/candidates/
// scratch dir, probes real pixel dimensions with sharp, and writes
// scripts/photo-candidates.json — the manifest the controller reviews via
// contact sheet before culling to the final ~24 for Phase B (dual-tier AVIF
// encode). Every candidate below was visually vetted on unsplash.com before
// being listed here: no people, no man-made focal subject, landscape/sky
// only. Re-run with `node scripts/build-candidates.mjs`.
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const OUT_DIR = '.photo-work/candidates'

// --- Unsplash candidates -----------------------------------------------
// id: Unsplash photo id. slug: full page-path fragment for credit URLs.
// Native res + license verified per-candidate at download time (the
// unsplash.com/photos/{id}/download endpoint 404s/HTML-redirects for
// Unsplash+ content instead of streaming a real original — any candidate
// that fails that check is dropped and logged, not silently included).
const UNSPLASH = [
  // --- aurora / night sky (8) ---
  { id: 'Ovn1hyBge38', slug: 'aurora-borealis-Ovn1hyBge38', photographer: 'v2osk', handle: 'v2osk', category: 'aurora', desc: 'Aurora borealis, vivid green curtain over a dark ridge' },
  { id: 'LtnPejWDSAY', slug: 'northern-lights-over-snow-capped-mountian-LtnPejWDSAY', photographer: 'Lightscape', handle: 'lightscape', category: 'aurora', desc: 'Northern lights over a snow-capped mountain' },
  { id: 'vUePu7hAYAQ', slug: 'aurora-borealis-vUePu7hAYAQ', photographer: 'Serey Kim', handle: 'shuttergenic', category: 'aurora', desc: 'Aurora borealis over a dark tree line' },
  { id: '1uwLmA5LFfg', slug: 'a-mountain-covered-in-snow-under-a-green-and-purple-sky-1uwLmA5LFfg', photographer: 'Jussi Hellsten', handle: 'jussihellsten', category: 'aurora', desc: 'Snow mountain under a green and purple aurora sky' },
  { id: 'DmA484UHAzw', slug: 'green-aurora-lights-over-lake-DmA484UHAzw', photographer: 'Jon Anders Dalan', handle: 'jonandersdalan', category: 'aurora', desc: 'Green aurora lights reflected over a still lake' },
  { id: '-wEFdRCG4IU', slug: 'silhouette-of-mountains-under-milky-way-galaxy--wEFdRCG4IU', photographer: 'Robson Hatsukami Morgan', handle: 'robsonhmorgan', category: 'aurora', desc: 'Milky Way galaxy over silhouetted mountains' },
  { id: 'znnQWe0JN_k', slug: 'a-mountain-range-with-stars-in-the-sky-znnQWe0JN_k', photographer: 'Tasha Marie', handle: 'teapalm', category: 'aurora', desc: 'Mountain range under a dense star field' },
  { id: 'oMcTmNHclZI', slug: 'blue-and-black-sky-with-stars-oMcTmNHclZI', photographer: 'Condor Wei', handle: 'cwcanchn', category: 'aurora', desc: 'Deep blue and black starry night sky' },
  { id: 'UZOpP-YHe9Q', slug: 'aurora-borealis-UZOpP-YHe9Q', photographer: 'Sami Matias Breilin', handle: 'samimatias', category: 'aurora', desc: 'Aurora borealis overhead' },
  // oIuDXlOJSiE ("scenery of aurora") rejected on visual review: the alt
  // text is misleading — it's actually a dog-sled team crossing snow under
  // the aurora, animals/activity as the near-frame subject, not a pure
  // landscape. Replaced with another aurora pick.
  { id: 'JWHSIG1kM2c', slug: 'green-aurora-lights-during-night-time-JWHSIG1kM2c', photographer: 'Federico Di Dio photography', handle: 'didiofederico_photographer', category: 'aurora', desc: 'Green aurora lights streaking across the night sky' },

  // --- mountains (5+backups) ---
  { id: '-g7axSVst6Y', slug: 'landscape-photography-of-mountain-ranges-under-purple-and-pink-skies--g7axSVst6Y', photographer: 'Štefan Štefančík', handle: 'cikstefan', category: 'mountain', desc: 'Mountain ranges under purple and pink sunset skies' },
  { id: 'YVDZINbyNd4', slug: 'a-very-tall-mountain-covered-in-snow-under-a-cloudy-sky-YVDZINbyNd4', photographer: 'Sylwia Bartyzel', handle: 'sylwiabartyzel', category: 'mountain', desc: 'Tall snow-covered peak under a moody cloudy sky' },
  { id: '7VotVatHM7Q', slug: 'a-lake-surrounded-by-trees-with-mountains-in-the-background-7VotVatHM7Q', photographer: 'Davey Gravy', handle: 'davey_gravy', category: 'mountain', desc: 'Lake ringed by trees with mountains behind' },
  { id: 'x-XwnC7FgFM', slug: 'silhouette-of-mountains-during-daytime-x-XwnC7FgFM', photographer: 'Pinal Jain', handle: 'pinaljain1993', category: 'mountain', desc: 'Layered mountain silhouettes in haze' },
  { id: 'evJh_sTH0b8', slug: 'snow-covered-mountain-under-blue-sky-during-night-time-evJh_sTH0b8', photographer: 'Renato Muolo', handle: 'muolor', category: 'mountain', desc: 'Snow-covered mountain under a deep blue night sky' },
  { id: 'I_n_b44cqhk', slug: 'green-mountains-under-blue-sky-during-daytime-I_n_b44cqhk', photographer: 'Simon Lohmann', handle: 'slohmann', category: 'mountain', desc: 'Green mountain ridges under a clear blue sky' },
  { id: 'YKN_G9L9nMA', slug: 'green-and-brown-mountains-under-white-clouds-and-blue-sky-during-daytime-YKN_G9L9nMA', photographer: 'Toan Chu', handle: 'toanchu', category: 'mountain', desc: 'Green and brown mountains under scattered clouds' },
  { id: 'pOWBHdgy1Lo', slug: 'island-surrounded-by-water-and-mountains-at-daytime-pOWBHdgy1Lo', photographer: 'Neven Krcmarek', handle: 'nevenkrcmarek', category: 'mountain', desc: 'Island surrounded by water and mountains' },
  { id: '925gaS7GSsQ', slug: 'a-view-of-a-mountain-range-from-the-top-of-a-mountain-925gaS7GSsQ', photographer: 'Andrew Spencer', handle: 'iam_aspencer', category: 'mountain', desc: 'Mountain range seen from a high summit' },

  // --- forest (4+backups) ---
  { id: 'iOvuSPwZLFY', slug: 'a-forest-covered-in-fog-and-low-lying-clouds-iOvuSPwZLFY', photographer: 'Siru Zhou', handle: 'syrhu', category: 'forest', desc: 'Forest ridgelines wrapped in fog and low cloud' },
  { id: '2Hzmz15wGik', slug: 'aerial-shot-of-forest-2Hzmz15wGik', photographer: 'pine watt', handle: 'pinewatt', category: 'forest', desc: 'Aerial view over a dense green forest canopy' },
  { id: 'a38486QPWfY', slug: 'lake-in-forest-near-mountain-a38486QPWfY', photographer: 'Nitish Meena', handle: 'nitishm', category: 'forest', desc: 'Still lake in a forest below a mountain' },
  { id: '2ShvY8Lf6l0', slug: 'low-light-photo-of-forest-2ShvY8Lf6l0', photographer: 'Lukasz Szmigiel', handle: 'szmigieldesign', category: 'forest', desc: 'Moody low-light forest interior' },
  { id: 'ljDlHHMqHRg', slug: 'green-trees-on-brown-field-during-daytime-ljDlHHMqHRg', photographer: 'Nadjib Bouarar', handle: 'nadjib_23', category: 'forest', desc: 'Tree line across a warm-lit open field' },
  { id: 'sp-p7uuT0tw', slug: 'trees-on-forest-with-sun-rays-sp-p7uuT0tw', photographer: 'Sebastian Unrau', handle: 'sebastian_unrau', category: 'forest', desc: 'Sun rays breaking through a forest canopy' },
  { id: 'ESkw2ayO2As', slug: 'body-of-water-surrounded-by-pine-trees-during-daytime-ESkw2ayO2As', photographer: 'Luca Bravo', handle: 'lucabravo', category: 'forest', desc: 'Still water surrounded by pine trees' },

  // --- coast (4+backups) ---
  { id: 'FXu9VUQFVSY', slug: 'the-cliffs-of-the-coast-line-the-ocean-FXu9VUQFVSY', photographer: 'KaLisa Veer', handle: 'kalisaveer', category: 'coast', desc: 'Sea cliffs lining a rugged coastline' },
  { id: 'VH6J28dk2Z8', slug: 'a-scenic-view-of-the-ocean-and-mountains-VH6J28dk2Z8', photographer: 'Carles Rabada', handle: 'carlesrgm', category: 'coast', desc: 'Ocean meeting mountains at the shoreline' },
  { id: 'sL8ddFZ05Bw', slug: 'a-rocky-cliff-next-to-the-ocean-sL8ddFZ05Bw', photographer: 'Roman Kirienko', handle: 'wandrmagazine', category: 'coast', desc: 'Rocky cliff dropping to the open ocean' },
  { id: 'meFvVI-mz0k', slug: 'a-large-body-of-water-surrounded-by-mountains-meFvVI-mz0k', photographer: 'Oleksii Piekhov', handle: 'opiekhov', category: 'coast', desc: 'Fjord-like water surrounded by steep mountains' },
  { id: '9O3_uhHIPtI', slug: 'an-aerial-view-of-the-coastline-of-a-large-body-of-water-9O3_uhHIPtI', photographer: 'Djordje Vukojicic', handle: 'djordjevukojicic', category: 'coast', desc: 'Aerial view of a coastline meeting open water' },
  { id: 'xcC5ozHk_N8', slug: 'landscape-photo-of-green-and-brown-cliffs-xcC5ozHk_N8', photographer: 'Joseph Barrientos', handle: 'jbcreate_', category: 'coast', desc: 'Green and brown sea cliffs' },

  // --- desert (3+backups) ---
  { id: 'oSjG83k3IFw', slug: 'the-sun-is-setting-over-the-sand-dunes-oSjG83k3IFw', photographer: 'Ahmed', handle: 'mutecevvil', category: 'desert', desc: 'Sun setting over warm-lit sand dunes' },
  { id: 'HBP8g_ZPQAs', slug: 'a-desert-landscape-with-sand-dunes-and-a-mountain-in-the-distance-HBP8g_ZPQAs', photographer: 'Daniel J. Schwarz', handle: 'danieljschwarz', category: 'desert', desc: 'Sand dunes with a distant mountain backdrop' },
  { id: '23tpftFIAD0', slug: 'a-large-sand-dune-in-the-middle-of-a-desert-23tpftFIAD0', photographer: 'Reed Naliboff', handle: 'reednaliboff', category: 'desert', desc: 'Single large dune rising from the desert floor' },
  { id: '0s9oD70F-l4', slug: 'a-group-of-sand-dunes-with-a-blue-sky-in-the-background-0s9oD70F-l4', photographer: 'Andrew Svk', handle: 'andrew_svk', category: 'desert', desc: 'Sand dunes under an open blue sky' },
  { id: 'GeReAnOMiZ8', slug: 'brown-sand-dunes-under-white-sky-during-daytime-GeReAnOMiZ8', photographer: 'Ze Paulo Galveias', handle: 'euzepaulo', category: 'desert', desc: 'Rolling sand dunes under a pale sky' },
  { id: 'RPkXbErNJow', slug: 'a-large-group-of-sand-dunes-under-a-blue-sky-RPkXbErNJow', photographer: 'Haris khan', handle: 'hariskhan488', category: 'desert', desc: 'Large group of dunes under a clear sky' },
]

// --- CC0 / Public Domain supplements ------------------------------------
const SUPPLEMENTS = [
  {
    id: 'nasa-iss072e159172',
    category: 'aurora',
    desc: 'Aurora borealis blankets the Earth, seen from the ISS over Manitoba',
    photographer: 'NASA / Expedition 72 crew',
    sourcePage: 'https://images.nasa.gov/details/iss072e159172',
    downloadUrl: 'https://images-assets.nasa.gov/image/iss072e159172/iss072e159172~orig.jpg',
    license: 'Public Domain (NASA, U.S. government work)',
  },
  {
    id: 'nasa-iss072e451060',
    category: 'aurora',
    desc: "Red and green aurora borealis above Canada's Gulf of St. Lawrence, from the ISS",
    photographer: 'NASA / Expedition 72 crew',
    sourcePage: 'https://images.nasa.gov/details/iss072e451060',
    downloadUrl: 'https://images-assets.nasa.gov/image/iss072e451060/iss072e451060~orig.jpg',
    license: 'Public Domain (NASA, U.S. government work)',
    flag: 'ISS station hardware (solar panel/truss) visible in-frame — dominant subject is still the aurora, but flagged for controller judgment call',
  },
  {
    id: 'nasa-iss072e820937',
    category: 'aurora',
    desc: 'Clouds swirl over the Gulf of Alaska beneath the aurora borealis, from the ISS',
    photographer: 'NASA / Expedition 72 crew',
    sourcePage: 'https://images.nasa.gov/details/iss072e820937',
    downloadUrl: 'https://images-assets.nasa.gov/image/iss072e820937/iss072e820937~orig.jpg',
    license: 'Public Domain (NASA, U.S. government work)',
    flag: 'ISS station hardware visible in bottom-left corner — dominant subject is still the aurora/Earth limb, but flagged for controller judgment call',
  },
  {
    id: 'commons-denali-faint-aurora',
    category: 'aurora',
    desc: 'Faint aurora and starlight over Denali National Park',
    photographer: 'Mary Lewandowski / NPS',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Faint_Aurora_and_Starlight_(03d71e4f-7a3b-488e-bed4-308debd52455).jpg',
    downloadUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Faint_Aurora_and_Starlight_%2803d71e4f-7a3b-488e-bed4-308debd52455%29.jpg',
    license: 'Public Domain (National Park Service)',
  },
  {
    id: 'commons-denali-aurora',
    category: 'aurora',
    desc: 'Aurora over the Denali National Park landscape',
    photographer: 'Mary Lewandowski / NPS',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Aurora_in_Denali_(7c1dff32-ca2f-41f1-bbc1-65cf123bc3cf).jpg',
    downloadUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Aurora_in_Denali_%287c1dff32-ca2f-41f1-bbc1-65cf123bc3cf%29.jpg',
    license: 'Public Domain (National Park Service)',
  },
]

async function fetchBuffer(url, referer) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = res.headers.get('content-type') || ''
  if (!ct.startsWith('image/')) throw new Error(`non-image content-type: ${ct}`)
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const manifest = []
  let n = 0
  const skipped = []

  for (const c of UNSPLASH) {
    n++
    const seq = String(n).padStart(2, '0')
    const file = `${seq}-${c.id}.jpg`
    try {
      const buf = await fetchBuffer(
        `https://unsplash.com/photos/${c.id}/download?force=true`,
        `https://unsplash.com/photos/${c.slug}`,
      )
      const meta = await sharp(buf).metadata()
      if (!meta.width || meta.width < 3840) {
        skipped.push({ id: c.id, reason: `native width ${meta.width} < 3840` })
        n--
        continue
      }
      await writeFile(`${OUT_DIR}/${file}`, buf)
      manifest.push({
        num: n,
        file,
        id: c.id,
        category: c.category,
        description: c.desc,
        photographer: c.photographer,
        source: `https://unsplash.com/photos/${c.slug}`,
        profile: `https://unsplash.com/@${c.handle}`,
        license: 'Unsplash License',
        width: meta.width,
        height: meta.height,
      })
      console.log(`[ok] ${file} — ${meta.width}x${meta.height} — ${c.photographer}`)
    } catch (err) {
      skipped.push({ id: c.id, reason: err.message })
      console.warn(`[skip] ${c.id}: ${err.message}`)
      n--
    }
  }

  for (const s of SUPPLEMENTS) {
    n++
    const seq = String(n).padStart(2, '0')
    const file = `${seq}-${s.id}.jpg`
    try {
      const buf = await fetchBuffer(s.downloadUrl)
      const meta = await sharp(buf).metadata()
      if (!meta.width || meta.width < 3840) {
        skipped.push({ id: s.id, reason: `native width ${meta.width} < 3840` })
        n--
        continue
      }
      await writeFile(`${OUT_DIR}/${file}`, buf)
      manifest.push({
        num: n,
        file,
        id: s.id,
        category: s.category,
        description: s.desc,
        photographer: s.photographer,
        source: s.sourcePage,
        profile: null,
        license: s.license,
        width: meta.width,
        height: meta.height,
        ...(s.flag ? { flag: s.flag } : {}),
      })
      console.log(`[ok] ${file} — ${meta.width}x${meta.height} — ${s.photographer}`)
    } catch (err) {
      skipped.push({ id: s.id, reason: err.message })
      console.warn(`[skip] ${s.id}: ${err.message}`)
      n--
    }
  }

  await writeFile('scripts/photo-candidates.json', JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\nwrote scripts/photo-candidates.json with ${manifest.length} candidates`)
  if (skipped.length) {
    console.log(`skipped ${skipped.length}:`)
    for (const s of skipped) console.log(`  - ${s.id}: ${s.reason}`)
  }
}

main()
