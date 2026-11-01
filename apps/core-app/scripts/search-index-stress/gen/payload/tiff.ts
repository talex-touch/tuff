import type { PayloadSpec } from '../../types'
import { noiseBytes, u16le, u32le } from './bytes'
import { fitToBytes } from './fit'
import { renderRgb } from './pattern'

const SHORT = 3
const LONG = 4
const BITS_PER_SAMPLE_AT = 8
const STRIP_AT = 14

function entry(tag: number, type: number, count: number, value: number): Buffer {
  return Buffer.concat([
    u16le(tag),
    u16le(type),
    u32le(count),
    type === SHORT ? Buffer.concat([u16le(value), u16le(0)]) : u32le(value)
  ])
}

/** Little-endian, one uncompressed RGB strip, IFD after the pixels; bytes after the IFD are unreferenced. */
function encodeRaster(width: number, height: number, seed: number): Buffer {
  const pixels = Buffer.from(renderRgb(width, height, seed, 0.3))
  const evenPixels = pixels.length % 2 === 0 ? pixels : Buffer.concat([pixels, Buffer.alloc(1)])
  const ifdAt = STRIP_AT + evenPixels.length
  const entries = [
    entry(256, LONG, 1, width),
    entry(257, LONG, 1, height),
    entry(258, SHORT, 3, BITS_PER_SAMPLE_AT),
    entry(259, SHORT, 1, 1),
    entry(262, SHORT, 1, 2),
    entry(273, LONG, 1, STRIP_AT),
    entry(277, SHORT, 1, 3),
    entry(278, LONG, 1, height),
    entry(279, LONG, 1, pixels.length),
    entry(284, SHORT, 1, 1)
  ]
  return Buffer.concat([
    Buffer.from('II', 'latin1'),
    u16le(42),
    u32le(ifdAt),
    u16le(8),
    u16le(8),
    u16le(8),
    evenPixels,
    u16le(entries.length),
    ...entries,
    u32le(0)
  ])
}

export function encodeTiff(spec: PayloadSpec): Buffer {
  return fitToBytes(spec, {
    bytesPerPixel: 3,
    padRoom: 1,
    encode: (width, height) => encodeRaster(width, height, spec.seed),
    pad: (body, target) => Buffer.concat([body, noiseBytes(target - body.length, spec.seed)])
  })
}
