import type { PreviewCardPayload } from '@talex-touch/utils/core-box/preview'
import { deflateSync } from 'node:zlib'

/**
 * Turns the QuickOps QR preview payload into a PNG.
 *
 * This lived inside `index.ts` next to sixty unrelated response builders, which mattered because
 * of what it is: a hand-rolled grayscale PNG encoder — CRC-32, chunk framing, IHDR — reached from
 * a transport handler that any plugin can call with a payload it composed itself. The only test it
 * had asserted the eight-byte PNG signature, a constant this file writes unconditionally, so a
 * wrong CRC or a malformed IHDR would have produced a file no decoder accepts and still passed.
 *
 * The SVG it parses is produced in a different package — `renderQrSvg` in
 * `packages/utils/core-box/preview/abilities/quickops-developer-ability.ts` — and the two are
 * coupled by nothing but the regexes below matching that function's exact output. Extracted for
 * #339 so both of those can be tested directly.
 */

export function isQrSvgPayload(payload: PreviewCardPayload): boolean {
  return payload.meta?.quickOps?.render?.kind === 'qr-code-svg'
}

export function extractQrSvg(payload: PreviewCardPayload): string | null {
  const render = payload.meta?.quickOps?.render
  const dataUrl = typeof render?.dataUrl === 'string' ? render.dataUrl : payload.primaryValue
  const prefix = 'data:image/svg+xml;charset=utf-8,'
  if (!dataUrl.startsWith(prefix)) return null

  try {
    const svg = decodeURIComponent(dataUrl.slice(prefix.length))
    return svg.startsWith('<svg ') ? svg : null
  } catch {
    return null
  }
}

export function renderQrSvgToPng(svg: string, scale = 8): Buffer | null {
  const size = extractQrSvgSize(svg)
  if (!size || scale < 1) return null

  // No dark modules means the rect pattern below did not match anything the caller sent. A real QR
  // always has three finder patterns, so the two cases this distinguishes are an SVG written in a
  // shape these regexes do not read and a deliberately empty one — and both would otherwise encode
  // to a blank white square that `saveQuickOpsDeveloperPreview` reports as `state: 'saved'`.
  const darkModules = extractQrSvgDarkModules(svg)
  if (darkModules.length === 0) return null

  const outputSize = size * scale
  const pixels = Buffer.alloc(outputSize * outputSize, 0xff)
  for (const module of darkModules) {
    if (module.x < 0 || module.y < 0 || module.x >= size || module.y >= size) continue

    const startX = module.x * scale
    const startY = module.y * scale
    const width = Math.max(1, module.width) * scale
    const height = Math.max(1, module.height) * scale
    for (let y = startY; y < Math.min(outputSize, startY + height); y += 1) {
      for (let x = startX; x < Math.min(outputSize, startX + width); x += 1) {
        pixels[y * outputSize + x] = 0x00
      }
    }
  }

  return encodeGrayscalePng(outputSize, outputSize, pixels)
}

export function extractQrSvgSize(svg: string): number | null {
  const match = /\bviewBox="0 0 (?<width>\d+) (?<height>\d+)"/.exec(svg)
  const width = Number(match?.groups?.width)
  const height = Number(match?.groups?.height)
  if (!Number.isInteger(width) || width <= 0 || width !== height || width > 256) return null
  return width
}

export function extractQrSvgDarkModules(svg: string): Array<{
  x: number
  y: number
  width: number
  height: number
}> {
  const groupMatch = /<g fill="#000">(?<body>.*?)<\/g>/.exec(svg)
  const body = groupMatch?.groups?.body
  if (!body) return []

  const rects: Array<{ x: number; y: number; width: number; height: number }> = []
  const rectPattern =
    /<rect x="(?<x>\d+)" y="(?<y>\d+)" width="(?<width>\d+)" height="(?<height>\d+)"\/>/g
  for (const match of body.matchAll(rectPattern)) {
    const x = Number(match.groups?.x)
    const y = Number(match.groups?.y)
    const width = Number(match.groups?.width)
    const height = Number(match.groups?.height)
    if (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      Number.isInteger(width) &&
      Number.isInteger(height)
    ) {
      rects.push({ x, y, width, height })
    }
  }
  return rects
}

export function encodeGrayscalePng(width: number, height: number, pixels: Buffer): Buffer {
  const scanlines = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width + 1)
    scanlines[rowStart] = 0
    pixels.copy(scanlines, rowStart + 1, y * width, (y + 1) * width)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 0
  header[10] = 0
  header[11] = 0
  header[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createPngChunk('IHDR', header),
    createPngChunk('IDAT', deflateSync(scanlines)),
    createPngChunk('IEND', Buffer.alloc(0))
  ])
}

export function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(calculateCrc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

export function calculateCrc32(input: Buffer): number {
  let crc = 0xffffffff
  for (const byte of input) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
