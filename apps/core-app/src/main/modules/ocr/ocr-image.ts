import type { Buffer } from 'node:buffer'
import sharp from 'sharp'

const MAX_OCR_IMAGE_EDGE = 2000

// Imported only by the one-shot OCR child: resizing must not fan out across all CPU cores.
sharp.concurrency(1)

export async function prepareOcrImage(
  image: Buffer
): Promise<{ image: Buffer; scaleX: number; scaleY: number }> {
  const metadata = await sharp(image).metadata()
  const { width, height, orientation } = metadata
  if (!width || !height) {
    throw new Error('OCR image dimensions are unavailable')
  }

  // Orientations 5–8 transpose width and height once EXIF rotation is applied.
  const swapsAxes = typeof orientation === 'number' && orientation >= 5 && orientation <= 8
  const orientedWidth = swapsAxes ? height : width
  const orientedHeight = swapsAxes ? width : height
  const needsRotation = typeof orientation === 'number' && orientation > 1
  const needsResize = orientedWidth > MAX_OCR_IMAGE_EDGE || orientedHeight > MAX_OCR_IMAGE_EDGE

  if (!needsRotation && !needsResize) {
    return { image, scaleX: 1, scaleY: 1 }
  }

  let pipeline = sharp(image).rotate()
  if (needsResize) {
    pipeline = pipeline.resize({
      width: MAX_OCR_IMAGE_EDGE,
      height: MAX_OCR_IMAGE_EDGE,
      fit: 'inside',
      withoutEnlargement: true
    })
  }

  const { data, info } = await pipeline.png({ compressionLevel: 1 }).toBuffer({
    resolveWithObject: true
  })
  return {
    image: data,
    scaleX: orientedWidth / info.width,
    scaleY: orientedHeight / info.height
  }
}
