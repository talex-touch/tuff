import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { prepareOcrImage } from './ocr-image'

describe('prepareOcrImage', () => {
  it.each([
    { name: 'small JPEG', width: 37, height: 23 },
    { name: 'landscape at the limit', width: 2000, height: 1199 },
    { name: 'portrait at the limit', width: 1199, height: 2000 }
  ])('returns the original bytes without re-encoding a $name', async ({ width, height }) => {
    const image = await sharp({
      create: { width, height, channels: 3, background: '#996633' }
    })
      .jpeg()
      .toBuffer()
    const original = Buffer.from(image)

    const prepared = await prepareOcrImage(image)

    expect(prepared.image).toBe(image)
    expect(prepared.image).toEqual(original)
    expect(prepared.scaleX).toBe(1)
    expect(prepared.scaleY).toBe(1)
    expect((await sharp(prepared.image).metadata()).format).toBe('jpeg')
  })

  it.each([
    { name: 'rounded landscape', width: 4001, height: 1333, outputWidth: 2000, outputHeight: 666 },
    { name: 'rounded portrait', width: 1333, height: 4001, outputWidth: 666, outputHeight: 2000 },
    {
      name: 'one pixel over the limit',
      width: 2001,
      height: 2001,
      outputWidth: 2000,
      outputHeight: 2000
    }
  ])(
    'bounds a $name and reports the actual per-axis coordinate scale',
    async ({ width, height, outputWidth, outputHeight }) => {
      const image = await sharp({
        create: { width, height, channels: 3, background: '#996633' }
      })
        .png()
        .toBuffer()
      const original = Buffer.from(image)

      const prepared = await prepareOcrImage(image)
      const metadata = await sharp(prepared.image).metadata()

      expect(metadata).toMatchObject({ width: outputWidth, height: outputHeight, format: 'png' })
      expect(prepared.scaleX).toBe(width / outputWidth)
      expect(prepared.scaleY).toBe(height / outputHeight)
      // Recognition must not mutate the clipboard's original image while reducing its own input.
      expect(image).toEqual(original)
      expect(await sharp(image).metadata()).toMatchObject({ width, height })
    }
  )

  it('applies EXIF orientation rotation before resizing and computes oriented scales', async () => {
    // Raw 4000x2000 JPEG with EXIF Orientation=6 (90deg CW) -> oriented 2000x4000 -> resized 1000x2000
    const rotatedLarge = await sharp({
      create: { width: 4000, height: 2000, channels: 3, background: '#336699' }
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer()

    const preparedLarge = await prepareOcrImage(rotatedLarge)
    const metaLarge = await sharp(preparedLarge.image).metadata()
    expect(metaLarge.width).toBe(1000)
    expect(metaLarge.height).toBe(2000)
    expect(preparedLarge.scaleX).toBe(2)
    expect(preparedLarge.scaleY).toBe(2)

    // Small EXIF-rotated image (raw 600x400, orientation 6 -> oriented 400x600) must also be rotated
    const rotatedSmall = await sharp({
      create: { width: 600, height: 400, channels: 3, background: '#336699' }
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer()

    const preparedSmall = await prepareOcrImage(rotatedSmall)
    const metaSmall = await sharp(preparedSmall.image).metadata()
    expect(metaSmall.width).toBe(400)
    expect(metaSmall.height).toBe(600)
    expect(preparedSmall.scaleX).toBe(1)
    expect(preparedSmall.scaleY).toBe(1)
  })
})
