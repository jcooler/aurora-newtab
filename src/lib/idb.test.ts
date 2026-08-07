// @vitest-environment jsdom
// jsdom implements no IndexedDB at all, so these cover the parts of idb.ts
// that don't need one: the record<->Upload translation (which is where the
// backward-compatibility risk lives — galleries filled before placeholders
// existed hold a bare Blob where new writes hold a {blob, thumb} record) and
// the thumbnail backfill that heals those old records.
import { describe, expect, it, vi } from 'vitest'
import { backfillThumbs, healedRecord, toStoredUpload, toStoredUploads, toUpload } from './idb'
import * as thumbs from './thumbs'

describe('toUpload', () => {
  it('reads a pre-placeholder record, stored as a bare Blob, as a thumbless upload', () => {
    const blob = new Blob(['legacy'], { type: 'image/png' })
    expect(toUpload('photo:1', blob)).toEqual({ key: 'photo:1', blob, thumb: undefined })
  })

  it('reads a placeholder-era record as an upload carrying its thumb', () => {
    const blob = new Blob(['full'], { type: 'image/png' })
    const thumb = new Blob(['tiny'], { type: 'image/webp' })
    expect(toUpload('photo:2', { blob, thumb })).toEqual({ key: 'photo:2', blob, thumb })
  })

  it('reads a record whose thumb generation failed as a thumbless upload', () => {
    const blob = new Blob(['full'], { type: 'image/png' })
    expect(toUpload('photo:3', { blob, thumb: undefined })).toEqual({
      key: 'photo:3',
      blob,
      thumb: undefined,
    })
  })
})

describe('toStoredUpload', () => {
  it('stores the file together with a generated thumbnail', async () => {
    const thumb = new Blob(['tiny'], { type: 'image/webp' })
    vi.spyOn(thumbs, 'makeThumb').mockResolvedValue(thumb)
    const file = new File(['full'], 'a.png', { type: 'image/png' })

    const record = await toStoredUpload(file)

    expect(record).toEqual({ blob: file, thumb })
    // Round-trip: what goes into the store must come back out unchanged.
    expect(toUpload('photo:x', record)).toEqual({ key: 'photo:x', blob: file, thumb })
    vi.restoreAllMocks()
  })

  it('still stores the file when no thumbnail could be made', async () => {
    vi.spyOn(thumbs, 'makeThumb').mockResolvedValue(null)
    const file = new File(['full'], 'a.png', { type: 'image/png' })

    expect(await toStoredUpload(file)).toEqual({ blob: file, thumb: undefined })
    vi.restoreAllMocks()
  })
})

describe('toStoredUploads', () => {
  it('decodes selected files one at a time rather than all at once', async () => {
    // A multi-file pick is the realistic case (8 phone photos at 24MP is
    // ~750MB of simultaneous full-res bitmaps), and holding them all decoded
    // at once is exactly what thumbs.ts's prompt-release design exists to
    // avoid.
    let inFlight = 0
    let peak = 0
    vi.spyOn(thumbs, 'makeThumb').mockImplementation(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 0))
      inFlight -= 1
      return new Blob(['tiny'], { type: 'image/webp' })
    })
    const files = Array.from({ length: 6 }, (_, i) => new File([`${i}`], `${i}.png`))

    const records = await toStoredUploads(files)

    expect(records).toHaveLength(6)
    expect(records.map((r) => r.blob)).toEqual(files)
    expect(peak).toBe(1)
    vi.restoreAllMocks()
  })
})

describe('healedRecord', () => {
  const thumb = new Blob(['tiny'], { type: 'image/webp' })

  it('refuses to write anything for a key that no longer exists', () => {
    // The deletion case: the user removed this photo while the backfill was
    // still running. Writing here would resurrect it.
    expect(healedRecord(undefined, thumb)).toBeNull()
  })

  it('heals a pre-placeholder bare-Blob record using the blob currently stored', () => {
    const stored = new Blob(['legacy'], { type: 'image/png' })
    expect(healedRecord(stored, thumb)).toEqual({ blob: stored, thumb })
  })

  it('heals a thumbless record using the blob currently stored', () => {
    const stored = new Blob(['full'], { type: 'image/png' })
    expect(healedRecord({ blob: stored }, thumb)).toEqual({ blob: stored, thumb })
  })

  it('overwrites a record that already has a thumb — the caller (backfillThumbs) is the one that decided this key needs healing, e.g. an under-spec thumb being upgraded', () => {
    const stored = new Blob(['full'], { type: 'image/png' })
    const existing = new Blob(['old-32px-thumb'], { type: 'image/webp' })
    expect(healedRecord({ blob: stored, thumb: existing }, thumb)).toEqual({ blob: stored, thumb })
  })
})

describe('backfillThumbs', () => {
  it('generates and heals uploads that lack a thumb entirely', async () => {
    const made = new Blob(['tiny'], { type: 'image/webp' })
    vi.spyOn(thumbs, 'makeThumb').mockResolvedValue(made)
    // Already at spec — thumbIntrinsicWidth is mocked per-blob (same
    // distinct-return idiom the other suites in this repo use for
    // per-blob object URLs) so this test doesn't depend on jsdom's
    // (absent) createImageBitmap to prove the "leave it alone" half.
    const alreadyThumb = new Blob(['t'], { type: 'image/webp' })
    vi.spyOn(thumbs, 'thumbIntrinsicWidth').mockImplementation(async (b) =>
      b === alreadyThumb ? thumbs.THUMB_WIDTH : null,
    )
    const legacy = new Blob(['legacy'], { type: 'image/png' })
    const already = new Blob(['already'], { type: 'image/png' })
    const heal = vi.fn().mockResolvedValue(undefined)

    await backfillThumbs(
      [
        { key: 'photo:1', blob: legacy, thumb: undefined },
        { key: 'photo:2', blob: already, thumb: alreadyThumb },
      ],
      heal,
    )

    // The thumb only — never the snapshot's blob, which the store may have
    // moved on from by now.
    expect(heal).toHaveBeenCalledTimes(1)
    expect(heal).toHaveBeenCalledWith('photo:1', made)
    vi.restoreAllMocks()
  })

  it('regenerates an upload whose thumb is narrower than the current THUMB_WIDTH spec (upgrade path)', async () => {
    // The scenario the review finding was about: a gallery whose photos were
    // all added back when THUMB_WIDTH was 32 has a thumb for every upload,
    // so the OLD "lacks one" check would leave them mushy forever.
    const upgraded = new Blob(['sharper'], { type: 'image/webp' })
    vi.spyOn(thumbs, 'makeThumb').mockResolvedValue(upgraded)
    const undersizedThumb = new Blob(['old-32px'], { type: 'image/webp' })
    vi.spyOn(thumbs, 'thumbIntrinsicWidth').mockResolvedValue(32)
    const full = new Blob(['full'], { type: 'image/png' })
    const heal = vi.fn().mockResolvedValue(undefined)

    await backfillThumbs([{ key: 'photo:1', blob: full, thumb: undersizedThumb }], heal)

    expect(heal).toHaveBeenCalledWith('photo:1', upgraded)
    vi.restoreAllMocks()
  })

  it('leaves an upload whose thumb already meets the spec alone', async () => {
    const makeThumbSpy = vi.spyOn(thumbs, 'makeThumb')
    vi.spyOn(thumbs, 'thumbIntrinsicWidth').mockResolvedValue(thumbs.THUMB_WIDTH)
    const heal = vi.fn().mockResolvedValue(undefined)

    await backfillThumbs(
      [{ key: 'photo:1', blob: new Blob(['full']), thumb: new Blob(['spec'], { type: 'image/webp' }) }],
      heal,
    )

    expect(heal).not.toHaveBeenCalled()
    expect(makeThumbSpy).not.toHaveBeenCalled() // no wasted re-encode either
    vi.restoreAllMocks()
  })

  it('treats an undecodable existing thumb as needing an upgrade rather than skipping it silently', async () => {
    // thumbIntrinsicWidth returns null on a decode failure (or no
    // createImageBitmap) — same as jsdom's real behaviour, not mocked away
    // here. Given no way to tell "under spec" from "fine", attempting a
    // fresh thumb from the still-good full-res blob is the more useful
    // failure than leaving a possibly-corrupt one in place forever.
    const upgraded = new Blob(['fresh'], { type: 'image/webp' })
    vi.spyOn(thumbs, 'makeThumb').mockResolvedValue(upgraded)
    const heal = vi.fn().mockResolvedValue(undefined)

    await backfillThumbs(
      [{ key: 'photo:1', blob: new Blob(['full']), thumb: new Blob(['undecodable']) }],
      heal,
    )

    expect(heal).toHaveBeenCalledWith('photo:1', upgraded)
    vi.restoreAllMocks()
  })

  it('heals nothing when the thumbnail cannot be generated', async () => {
    vi.spyOn(thumbs, 'makeThumb').mockResolvedValue(null)
    const heal = vi.fn().mockResolvedValue(undefined)

    await backfillThumbs([{ key: 'photo:1', blob: new Blob(['legacy']), thumb: undefined }], heal)

    expect(heal).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('keeps going when one upload fails to backfill', async () => {
    vi.spyOn(thumbs, 'makeThumb').mockResolvedValue(new Blob(['tiny']))
    const heal = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined)

    await expect(
      backfillThumbs(
        [
          { key: 'photo:1', blob: new Blob(['a']), thumb: undefined },
          { key: 'photo:2', blob: new Blob(['b']), thumb: undefined },
        ],
        heal,
      ),
    ).resolves.toBeUndefined()

    expect(heal).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
  })

  it('does not resurrect an upload the user deleted while the backfill was running', async () => {
    // The backfill works off a SNAPSHOT taken by listUploads(). A legacy
    // gallery keeps it running for seconds, another tab can be deleting the
    // whole time, and the per-page `backfillStarted` guard doesn't help
    // across tabs. So the heal has to re-check the store, not trust the
    // snapshot. Modelled here with a map standing in for the object store,
    // healed through the same healedRecord() the real transaction uses.
    const blobA = new Blob(['a'], { type: 'image/png' })
    const blobB = new Blob(['b'], { type: 'image/png' })
    const store = new Map<string, unknown>([
      ['photo:1', blobA],
      ['photo:2', blobB],
    ])
    vi.spyOn(thumbs, 'makeThumb').mockImplementation(async (blob) => {
      // The user deletes photo:1 while its thumbnail is being generated.
      if (blob === blobA) store.delete('photo:1')
      return new Blob(['tiny'], { type: 'image/webp' })
    })
    const heal = async (key: string, thumb: Blob) => {
      const record = healedRecord(store.get(key), thumb)
      if (record) store.set(key, record)
    }

    await backfillThumbs(
      [
        { key: 'photo:1', blob: blobA, thumb: undefined },
        { key: 'photo:2', blob: blobB, thumb: undefined },
      ],
      heal,
    )

    expect(store.has('photo:1')).toBe(false)
    // ...and the surviving photo is still healed.
    expect(store.get('photo:2')).toEqual({ blob: blobB, thumb: expect.any(Blob) })
    vi.restoreAllMocks()
  })
})
