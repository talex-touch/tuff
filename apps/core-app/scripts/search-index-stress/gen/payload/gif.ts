import type { PayloadSpec } from '../../types'
import { asciiFiller, u16le, xorshift } from './bytes'
import { fitToBytes } from './fit'

const CLEAR = 256
const END_OF_INFORMATION = 257
// Clearing after 254 literals keeps the code width at 9 bits, so every pixel costs one plain code.
const LITERALS_PER_CLEAR = 254
const COMMENT_MIN = 3

function palette(seed: number): Buffer {
  const out = Buffer.alloc(768)
  const phase = seed & 0xff
  for (let index = 0; index < 256; index += 1) {
    out[index * 3] = (index * 5 + phase) & 0xff
    out[index * 3 + 1] = (index * 3 + phase * 2) & 0xff
    out[index * 3 + 2] = 255 - index
  }
  return out
}

function lzwStream(indices: Uint8Array): Buffer {
  const bytes: number[] = []
  let acc = 0
  let bits = 0
  const emit = (code: number): void => {
    acc |= code << bits
    bits += 9
    while (bits >= 8) {
      bytes.push(acc & 0xff)
      acc >>>= 8
      bits -= 8
    }
  }
  for (let offset = 0; offset < indices.length; offset += LITERALS_PER_CLEAR) {
    emit(CLEAR)
    const end = Math.min(indices.length, offset + LITERALS_PER_CLEAR)
    for (let index = offset; index < end; index += 1) emit(indices[index] as number)
  }
  emit(END_OF_INFORMATION)
  if (bits > 0) bytes.push(acc & 0xff)
  return Buffer.from(bytes)
}

function subBlocks(data: Buffer): Buffer {
  const parts: Buffer[] = []
  for (let offset = 0; offset < data.length; offset += 255) {
    const chunk = data.subarray(offset, offset + 255)
    parts.push(Buffer.from([chunk.length]), chunk)
  }
  parts.push(Buffer.from([0]))
  return Buffer.concat(parts)
}

function encodeRaster(width: number, height: number, seed: number): Buffer {
  const next = xorshift(seed ^ 0x9e3779b9)
  const indices = new Uint8Array(width * height)
  const phase = seed & 0xff
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      indices[y * width + x] = (x + y * 3 + phase + (next() & 7)) & 0xff
    }
  }
  return Buffer.concat([
    Buffer.from('GIF89a', 'latin1'),
    u16le(width),
    u16le(height),
    Buffer.from([0xf7, 0, 0]),
    palette(seed),
    Buffer.from([0x2c, 0, 0, 0, 0]),
    u16le(width),
    u16le(height),
    Buffer.from([0, 8]),
    subBlocks(lzwStream(indices)),
    Buffer.from([0x3b])
  ])
}

/** One comment extension of `total` bytes (total is 3 or 5 and up; sub-blocks carry 1..255 bytes). */
function commentExtension(total: number, seed: number): Buffer {
  const parts: Buffer[] = [Buffer.from([0x21, 0xfe])]
  let rest = total - COMMENT_MIN
  for (let index = 0; rest > 0; index += 1) {
    let term = Math.min(rest, 256)
    if (rest - term === 1) term -= 1
    parts.push(Buffer.from([term - 1]), asciiFiller(term - 1, seed + index))
    rest -= term
  }
  parts.push(Buffer.from([0]))
  return Buffer.concat(parts)
}

function padGif(body: Buffer, target: number, seed: number): Buffer {
  const gap = target - body.length
  const total = gap === 4 ? 5 : Math.max(COMMENT_MIN, gap)
  const insertAt = 6 + 7 + 768
  return Buffer.concat([
    body.subarray(0, insertAt),
    commentExtension(total, seed),
    body.subarray(insertAt)
  ])
}

export function encodeGif(spec: PayloadSpec): Buffer {
  return fitToBytes(spec, {
    bytesPerPixel: 1.2,
    padRoom: COMMENT_MIN,
    encode: (width, height) => encodeRaster(width, height, spec.seed),
    pad: (body, target) => padGif(body, target, spec.seed)
  })
}
