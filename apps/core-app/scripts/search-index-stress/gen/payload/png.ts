import { deflateSync } from 'node:zlib'
import type { PayloadSpec } from '../../types'
import { asciiFiller, crc32, u32be } from './bytes'
import { fitToBytes } from './fit'
import { renderRgb } from './pattern'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CHUNK_OVERHEAD = 12

export function pngChunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  return Buffer.concat([u32be(data.length), body, u32be(crc32(body))])
}

/** Stored (level 0) deflate keeps the size a function of the pixel count, so files hit their size. */
function encodeRaster(width: number, height: number, seed: number): Buffer {
  const rgb = renderRgb(width, height, seed, 0.3)
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 0 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

/** `prVt` is a private ancillary chunk (lowercase first and second letter): decoders skip it. */
function padPng(body: Buffer, target: number, seed: number): Buffer {
  const end = body.length - CHUNK_OVERHEAD
  const payload = Math.max(0, target - body.length - CHUNK_OVERHEAD)
  return Buffer.concat([
    body.subarray(0, end),
    pngChunk('prVt', asciiFiller(payload, seed)),
    body.subarray(end)
  ])
}

export function encodePng(spec: PayloadSpec): Buffer {
  return fitToBytes(spec, {
    bytesPerPixel: 3,
    padRoom: CHUNK_OVERHEAD,
    encode: (width, height) => encodeRaster(width, height, spec.seed),
    pad: (body, target) => padPng(body, target, spec.seed)
  })
}
