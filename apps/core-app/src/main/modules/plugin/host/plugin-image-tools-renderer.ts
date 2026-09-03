import type {
  PluginImageToolsImageMetadata,
  PluginImageToolsRenderedImage,
  PluginImageToolsRenderer,
  PluginImageToolsRenderRequest
} from './plugin-image-tools-capabilities'

const MAX_INPUT_BYTES = 32 * 1024 * 1024
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024
const MAX_DIMENSION = 8192
const MAX_PIXELS = 64_000_000
const DEFAULT_QUALITY = 82
const ICO_SIZES = Object.freeze([16, 32, 48, 64, 128, 256])
const SAFE_RASTER_FORMATS = new Set(['avif', 'gif', 'heif', 'jpeg', 'jpg', 'png', 'tiff', 'webp'])

function fail(code: string): never {
  throw Object.assign(new Error(code), { code })
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) fail('PLUGIN_HOST_CAPABILITY_CANCELLED')
}

function assertBoundedDimensions(width: number | undefined, height: number | undefined): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    Number(width) < 1 ||
    Number(height) < 1 ||
    Number(width) > MAX_DIMENSION ||
    Number(height) > MAX_DIMENSION ||
    Number(width) * Number(height) > MAX_PIXELS
  ) {
    fail('PLUGIN_IMAGE_TOOLS_INVALID_DIMENSIONS')
  }
}

function assertRenderedImage(data: Buffer, width: number, height: number): void {
  assertBoundedDimensions(width, height)
  if (data.byteLength < 1 || data.byteLength > MAX_OUTPUT_BYTES) {
    fail('PLUGIN_IMAGE_TOOLS_OUTPUT_TOO_LARGE')
  }
}

function isForbiddenDocumentInput(source: Buffer): boolean {
  const prefix = source.subarray(0, 1024).toString('utf8').trimStart().toLowerCase()
  return (
    prefix.startsWith('%pdf-') ||
    prefix.startsWith('<svg') ||
    (prefix.startsWith('<?xml') && prefix.includes('<svg'))
  )
}

function buildIco(images: readonly Readonly<{ size: number; data: Buffer }>[]): Buffer {
  const directoryBytes = 6 + images.length * 16
  const outputBytes = images.reduce((total, image) => total + image.data.byteLength, directoryBytes)
  if (outputBytes > MAX_OUTPUT_BYTES) fail('PLUGIN_IMAGE_TOOLS_OUTPUT_TOO_LARGE')

  const output = Buffer.allocUnsafe(outputBytes)
  output.writeUInt16LE(0, 0)
  output.writeUInt16LE(1, 2)
  output.writeUInt16LE(images.length, 4)
  let offset = directoryBytes
  images.forEach((image, index) => {
    const entryOffset = 6 + index * 16
    output.writeUInt8(image.size === 256 ? 0 : image.size, entryOffset)
    output.writeUInt8(image.size === 256 ? 0 : image.size, entryOffset + 1)
    output.writeUInt8(0, entryOffset + 2)
    output.writeUInt8(0, entryOffset + 3)
    output.writeUInt16LE(1, entryOffset + 4)
    output.writeUInt16LE(32, entryOffset + 6)
    output.writeUInt32LE(image.data.byteLength, entryOffset + 8)
    output.writeUInt32LE(offset, entryOffset + 12)
    image.data.copy(output, offset)
    offset += image.data.byteLength
  })
  return output
}

async function renderIco(
  source: Buffer,
  request: PluginImageToolsRenderRequest,
  signal: AbortSignal
): Promise<PluginImageToolsRenderedImage> {
  const requestedWidth = request.width
  const requestedHeight = request.height
  if (
    requestedWidth !== undefined &&
    requestedHeight !== undefined &&
    requestedWidth !== requestedHeight
  ) {
    fail('PLUGIN_IMAGE_TOOLS_ICO_SQUARE_REQUIRED')
  }
  const requestedSize = requestedWidth ?? requestedHeight
  if (requestedSize !== undefined) assertBoundedDimensions(requestedSize, requestedSize)
  if (requestedSize !== undefined && requestedSize > 256) {
    fail('PLUGIN_IMAGE_TOOLS_INVALID_DIMENSIONS')
  }
  const sizes = requestedSize === undefined ? ICO_SIZES : [requestedSize]
  const { default: sharp } = await import('sharp')
  const images: Array<Readonly<{ size: number; data: Buffer }>> = []

  for (const size of sizes) {
    assertActive(signal)
    const { data, info } = await sharp(source, {
      animated: false,
      failOn: 'error',
      limitInputPixels: MAX_PIXELS,
      pages: 1
    })
      .rotate()
      .resize({
        width: size,
        height: size,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .timeout({ seconds: 30 })
      .toBuffer({ resolveWithObject: true })
    assertActive(signal)
    assertRenderedImage(data, info.width, info.height)
    images.push(Object.freeze({ size, data }))
  }

  const data = buildIco(images)
  const size = requestedSize ?? ICO_SIZES[ICO_SIZES.length - 1]!
  assertRenderedImage(data, size, size)
  return Object.freeze({ data, width: size, height: size })
}

async function renderRaster(
  source: Buffer,
  request: PluginImageToolsRenderRequest,
  signal: AbortSignal
): Promise<PluginImageToolsRenderedImage> {
  assertActive(signal)
  const { default: sharp } = await import('sharp')
  const background =
    request.format === 'jpeg'
      ? { r: 255, g: 255, b: 255, alpha: 1 }
      : { r: 0, g: 0, b: 0, alpha: 0 }
  let pipeline = sharp(source, {
    animated: false,
    failOn: 'error',
    limitInputPixels: MAX_PIXELS,
    pages: 1
  }).rotate()

  if (request.width !== undefined || request.height !== undefined) {
    pipeline = pipeline.resize({
      width: request.width,
      height: request.height,
      ...(request.width !== undefined && request.height !== undefined
        ? { fit: 'contain' as const, background }
        : {})
    })
  }

  if (request.format === 'jpeg') {
    pipeline = pipeline.flatten({ background }).jpeg({
      quality: request.quality ?? DEFAULT_QUALITY,
      mozjpeg: true
    })
  } else if (request.format === 'webp') {
    pipeline = pipeline.webp({ quality: request.quality ?? DEFAULT_QUALITY, effort: 6 })
  } else {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
  }

  const { data, info } = await pipeline
    .timeout({ seconds: 30 })
    .toBuffer({ resolveWithObject: true })
  assertActive(signal)
  assertRenderedImage(data, info.width, info.height)
  return Object.freeze({ data, width: info.width, height: info.height })
}

export function createSharpPluginImageToolsRenderer(): PluginImageToolsRenderer {
  return Object.freeze({
    async inspect(source: Buffer, signal: AbortSignal): Promise<PluginImageToolsImageMetadata> {
      assertActive(signal)
      if (
        !Buffer.isBuffer(source) ||
        source.byteLength < 1 ||
        source.byteLength > MAX_INPUT_BYTES
      ) {
        fail('PLUGIN_IMAGE_TOOLS_INPUT_TOO_LARGE')
      }
      if (isForbiddenDocumentInput(source)) {
        fail('PLUGIN_IMAGE_TOOLS_UNSUPPORTED_FORMAT')
      }
      const { default: sharp } = await import('sharp')
      const metadata = await sharp(source, {
        animated: true,
        failOn: 'error',
        limitInputPixels: MAX_PIXELS
      })
        .timeout({ seconds: 30 })
        .metadata()
      assertActive(signal)
      const format = metadata.format?.toLowerCase()
      if (!format || !SAFE_RASTER_FORMATS.has(format)) {
        fail('PLUGIN_IMAGE_TOOLS_UNSUPPORTED_FORMAT')
      }
      const pages = metadata.pages ?? 1
      if (pages !== 1) fail('PLUGIN_IMAGE_TOOLS_ANIMATED_INPUT')
      assertBoundedDimensions(metadata.width, metadata.height)
      return Object.freeze({
        format,
        width: metadata.width!,
        height: metadata.height!,
        pages,
        animated: false
      })
    },

    async render(
      source: Buffer,
      request: PluginImageToolsRenderRequest,
      signal: AbortSignal
    ): Promise<PluginImageToolsRenderedImage> {
      assertActive(signal)
      if ((request.width === undefined) !== (request.height === undefined)) {
        fail('PLUGIN_IMAGE_TOOLS_INVALID_DIMENSIONS')
      }
      if (
        request.width !== undefined &&
        request.height !== undefined &&
        request.width * request.height > MAX_PIXELS
      ) {
        fail('PLUGIN_IMAGE_TOOLS_INVALID_DIMENSIONS')
      }
      if (
        !Buffer.isBuffer(source) ||
        source.byteLength < 1 ||
        source.byteLength > MAX_INPUT_BYTES
      ) {
        fail('PLUGIN_IMAGE_TOOLS_INPUT_TOO_LARGE')
      }
      return request.format === 'ico'
        ? renderIco(source, request, signal)
        : renderRaster(source, request, signal)
    }
  })
}
