// src/lib/thumbs.ts — tiny blurred-placeholder (LQIP) generation for
// user-uploaded background photos.
//
// The bundled photos get their placeholders at build time (a 32x20 WebP data
// URI per entry in the manifest — see scripts/encode-photos.mjs). Uploads
// can't: they only exist on the user's machine, so the equivalent thumbnail
// is produced once, here, when the file is added to the gallery, and stored
// alongside it in IndexedDB (src/lib/idb.ts). Background.tsx then paints it
// under the full photo for the same reason the bundled ones exist — to have
// something photo-shaped on screen during a decode gap instead of the
// gradient.
//
// Nothing here is allowed to make an upload fail. A placeholder is a nicety;
// a photo the user chose is not. Every failure path returns null and the
// upload proceeds without one (Background falls back to the gradient behind
// that photo, exactly as before this existed).

/** Placeholder width in pixels; height follows the photo's aspect ratio. */
export const THUMB_WIDTH = 32

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
 * A ~32px-wide WebP thumbnail of `blob`, or null if this platform or this
 * file won't produce one. Uses createImageBitmap + OffscreenCanvas rather
 * than an <img> + document canvas so it works with no DOM attached and
 * without waiting on a load event.
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
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.6 })
  } catch {
    return null
  } finally {
    // Decoded full-resolution pixels — releasing them promptly matters when
    // a user drops half a dozen photos in at once.
    bitmap?.close()
  }
}
