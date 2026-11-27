export interface BmpEncodeOptions {
  /** Emit 32-bit BGRA instead of 24-bit BGR. @default false */
  alpha?: boolean
}

/**
 * Pure TypeScript Windows BMP encoder (BITMAPFILEHEADER + BITMAPINFOHEADER).
 * Uses bottom-up scanlines for maximum compatibility across browsers and OS viewers.
 */
export function encodeBmp(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: BmpEncodeOptions = {},
): Blob {
  const safeW = Math.max(1, Math.floor(width))
  const safeH = Math.max(1, Math.floor(height))
  const useAlpha = options.alpha === true
  const bytesPerPixel = useAlpha ? 4 : 3
  const rowStride = Math.ceil((safeW * bytesPerPixel) / 4) * 4
  const pixelArraySize = rowStride * safeH
  const fileHeaderSize = 14
  const infoHeaderSize = 40
  const pixelOffset = fileHeaderSize + infoHeaderSize
  const fileSize = pixelOffset + pixelArraySize

  const buffer = new ArrayBuffer(fileSize)
  const view = new DataView(buffer)
  const out = new Uint8Array(buffer)

  // BITMAPFILEHEADER ('BM')
  view.setUint8(0, 0x42)
  view.setUint8(1, 0x4D)
  view.setUint32(2, fileSize, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, 0, true)
  view.setUint32(10, pixelOffset, true)

  // BITMAPINFOHEADER
  view.setUint32(14, infoHeaderSize, true)
  view.setInt32(18, safeW, true)
  view.setInt32(22, safeH, true) // positive = bottom-up
  view.setUint16(26, 1, true) // color planes
  view.setUint16(28, bytesPerPixel * 8, true) // bits per pixel
  view.setUint32(30, 0, true) // BI_RGB (uncompressed)
  view.setUint32(34, pixelArraySize, true)
  view.setInt32(38, 2835, true) // 72 DPI
  view.setInt32(42, 2835, true)
  view.setUint32(46, 0, true)
  view.setUint32(50, 0, true)

  for (let y = 0; y < safeH; y++) {
    const srcRow = (safeH - 1 - y) * safeW * 4
    const dstRow = pixelOffset + y * rowStride
    for (let x = 0; x < safeW; x++) {
      const s = srcRow + x * 4
      const d = dstRow + x * bytesPerPixel
      out[d + 0] = rgba[s + 2] ?? 0 // B
      out[d + 1] = rgba[s + 1] ?? 0 // G
      out[d + 2] = rgba[s + 0] ?? 0 // R
      if (useAlpha)
        out[d + 3] = rgba[s + 3] ?? 255 // A
    }
  }

  return new Blob([buffer], { type: 'image/bmp' })
}
