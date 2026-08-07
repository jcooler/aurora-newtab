// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { THUMB_WIDTH, makeThumb, thumbSize } from './thumbs'

describe('thumbSize', () => {
  it('scales a landscape photo down to the placeholder width', () => {
    expect(thumbSize(4000, 2500)).toEqual({ width: 32, height: 20 })
  })

  it('keeps the aspect ratio of a portrait photo instead of forcing 16:10', () => {
    expect(thumbSize(2000, 4000)).toEqual({ width: 32, height: 64 })
  })

  it('never scales a photo smaller than the placeholder up', () => {
    expect(thumbSize(16, 10)).toEqual({ width: 16, height: 10 })
  })

  it('never rounds a dimension down to zero', () => {
    expect(thumbSize(1000, 4)).toEqual({ width: 32, height: 1 })
  })
})

describe('makeThumb', () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap
  const originalOffscreenCanvas = globalThis.OffscreenCanvas

  afterEach(() => {
    globalThis.createImageBitmap = originalCreateImageBitmap
    globalThis.OffscreenCanvas = originalOffscreenCanvas
  })

  it('returns null instead of throwing when the platform has no createImageBitmap', async () => {
    // jsdom implements neither API; an upload must still succeed without a
    // placeholder rather than failing outright.
    expect(await makeThumb(new Blob(['x'], { type: 'image/png' }))).toBeNull()
  })

  it('returns null when the blob cannot be decoded', async () => {
    globalThis.createImageBitmap = vi.fn(() =>
      Promise.reject(new Error('not an image')),
    ) as unknown as typeof createImageBitmap
    expect(await makeThumb(new Blob(['x'], { type: 'image/png' }))).toBeNull()
  })

  it('draws the decoded photo into a placeholder-sized canvas and encodes it as webp', async () => {
    const drawImage = vi.fn()
    const close = vi.fn()
    const out = new Blob(['thumb'], { type: 'image/webp' })
    let canvasSize: { width: number; height: number } | null = null
    let convertOptions: { type?: string; quality?: number } | undefined

    globalThis.createImageBitmap = vi.fn(() =>
      Promise.resolve({ width: 4000, height: 2500, close } as unknown as ImageBitmap),
    ) as unknown as typeof createImageBitmap
    globalThis.OffscreenCanvas = class {
      width: number
      height: number
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
        canvasSize = { width, height }
      }
      getContext() {
        return { drawImage }
      }
      convertToBlob(options?: { type?: string; quality?: number }) {
        convertOptions = options
        return Promise.resolve(out)
      }
    } as unknown as typeof OffscreenCanvas

    const thumb = await makeThumb(new Blob(['x'], { type: 'image/png' }))

    expect(thumb).toBe(out)
    expect(canvasSize).toEqual({ width: THUMB_WIDTH, height: 20 })
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, THUMB_WIDTH, 20)
    expect(convertOptions?.type).toBe('image/webp')
    // The bitmap holds decoded pixels; leaking one per upload is a real cost.
    expect(close).toHaveBeenCalled()
  })
})
