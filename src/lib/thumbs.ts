// src/lib/thumbs.ts — thumbnail generation for user-uploaded background
// photos. ONE stored thumb, TWO consumers:
//
//   · the LQIP underlay (src/newtab/components/Background.tsx) paints it
//     full-bleed behind the real photo, blurred (`blur-2xl`) and scaled up
//     110-125% — it exists to be photo-SHAPED during a decode gap, and a
//     blur hides low resolution by design, so it never needed much.
//   · the Settings -> General -> Background gallery grid
//     (src/settings/sections/Background.tsx) paints it UNBLURRED, 1:1, as
//     the tile image itself, at `size-14` (56px CSS).
//
// Both consumers read the SAME stored Blob (src/lib/idb.ts's `thumb` field)
// — there's only one to read. THUMB_WIDTH has to satisfy the pickier of the
// two, which is the gallery: review found the original 32px/q0.6 spec (sized
// only for the blurred underlay) rendered as a textureless colour blob in
// the sharp, unblurred gallery tile. It does NOT need to satisfy the
// bundled-photos' build-time placeholders (scripts/encode-photos.mjs) — those
// are a separate 32x20 asset with a separate consumer (the LQIP underlay
// only, never a gallery grid) and are untouched by this.
//
// Nothing here is allowed to make an upload fail. A placeholder is a nicety;
// a photo the user chose is not. Every failure path returns null and the
// upload proceeds without one (Background falls back to the gradient behind
// that photo, exactly as before this existed).

/**
 * Placeholder width in pixels; height follows the photo's aspect ratio.
 *
 * 160, not 32. The gallery tile is `size-14` (56px CSS) — 160/56 β‰ˆ 2.9x,
 * past a 2x-DPR display's 112 device px with a full extra x of headroom
 * toward 3x's 168, so the tile still reads as a photo rather than a mush of
 * average colour on a MacBook-class screen. (The LQIP underlay, the other
 * consumer, doesn't care either way — it blurs and overscales whatever it's
 * given; see the file header.) A few extra KB per stored thumb (measured:
 * ~2-6KB for a typical photo at the bumped quality below, vs a fraction of a
 * KB at the old 32px/0.6 spec) is a trivial IndexedDB cost next to the
 * multi-MB full photo sitting in the same record.
 */
export const THUMB_WIDTH = 160

/**
 * Placeholder dimensions for a photo of the given natural size: scaled down
 * so the width is at most THUMB_WIDTH, never scaled UP (a photo already
 * smaller than the placeholder is its own placeholder), and never rounded
 * to a zero-height canvas — OffscreenCanvas throws on a zero dimension, and
 * extreme panoramas are exactly the input that would produce one.
 */
export function thumbSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, THUMB_WIDTH / width)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * A ~160px-wide WebP thumbnail of `blob`, or null if this platform or this
 * file won't produce one. Uses createImageBitmap + OffscreenCanvas rather
 * than an <img> + document canvas so it works with no DOM attached and
 * without waiting on a load event.
 *
 * Quality 0.8, up from the original 0.6: at the old 32px size the two were
 * indistinguishable (32px of any WebP quality reads as a blur once painted
 * under the LQIP's own `blur-2xl`), but at 160px shown unblurred in the
 * gallery, 0.6 was visibly blocky on photos with fine texture (foliage,
 * water) — the same review finding that raised THUMB_WIDTH.
 */
export async function makeThumb(blob: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return null
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(blob)
    const { width, height } = thumbSize(bitmap.width, bitmap.height)
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })
  } catch {
    return null
  } finally {
    // Decoded full-resolution pixels — releasing them promptly matters when
    // a user drops half a dozen photos in at once.
    bitmap?.close()
  }
}

/**
 * The natural (intrinsic) width of an already-encoded thumb blob, or null if
 * it can't be decoded — same platform/failure tolerance as `makeThumb`,
 * since this runs unattended in the same background heal path (idb.ts's
 * `backfillThumbs`) and must never throw there.
 *
 * What this is FOR: telling a THUMB_WIDTH-spec thumb apart from a smaller
 * one left over from before THUMB_WIDTH was bumped 32px -> 160px, so the
 * heal path can upgrade it — without adding a width field to the stored
 * record (src/lib/idb.ts's `StoredUpload`). Decoding a blob this small
 * (<=160px on its longest-scaled side either way) is cheap enough to do once
 * per upload per page-load backfill pass; growing the record shape to cache
 * a number would save that decode at the cost of a permanent schema field
 * and a migration story for records written before it existed — a worse
 * trade for a value this cheap to just re-derive.
 */
export async function thumbIntrinsicWidth(blob: Blob): Promise<number | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(blob)
    const width = bitmap.width
    bitmap.close()
    return width
  } catch {
    return null
  }
}
