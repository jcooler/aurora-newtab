// @vitest-environment jsdom
// jsdom implements no IndexedDB at all, so these cover the parts of idb.ts
// that don't need one: the record<->Upload translation (which is where the
// backward-compatibility risk lives — galleries filled before placeholders
// existed hold a bare Blob where new writes hold a {blob, thumb} record) and
// the thumbnail backfill that heals those old records.
import { describe, expect, it, vi } from 'vitest'
import { backfillThumbs, toStoredUpload, toUpload } from './idb'
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

describe('backfillThumbs', () => {
  it('generates and writes a thumb only for uploads that lack one', async () => {
    const made = new Blob(['tiny'], { type: 'image/webp' })
    vi.spyOn(thumbs, 'makeThumb').mockResolvedValue(made)
    const legacy = new Blob(['legacy'], { type: 'image/png' })
    const already = new Blob(['already'], { type: 'image/png' })
    const put = vi.fn().mockResolvedValue(undefined)

    await backfillThumbs(
      [
        { key: 'photo:1', blob: legacy, thumb: undefined },
        { key: 'photo:2', blob: already, thumb: new Blob(['t'], { type: 'image/webp' }) },
      ],
      put,
    )

    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith('photo:1', { blob: legacy, thumb: made })
    vi.restoreAllMocks()
  })

  it('writes nothing when the thumbnail cannot be generated', async () => {
    vi.spyOn(thumbs, 'makeThumb').mockResolvedValue(null)
    const put = vi.fn().mockResolvedValue(undefined)

    await backfillThumbs(
      [{ key: 'photo:1', blob: new Blob(['legacy']), thumb: undefined }],
      put,
    )

    expect(put).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('keeps going when one upload fails to backfill', async () => {
    vi.spyOn(thumbs, 'makeThumb').mockResolvedValue(new Blob(['tiny']))
    const put = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined)

    await expect(
      backfillThumbs(
        [
          { key: 'photo:1', blob: new Blob(['a']), thumb: undefined },
          { key: 'photo:2', blob: new Blob(['b']), thumb: undefined },
        ],
        put,
      ),
    ).resolves.toBeUndefined()

    expect(put).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
  })
})
