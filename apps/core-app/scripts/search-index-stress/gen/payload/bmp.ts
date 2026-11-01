import type { PayloadSpec } from '../../types'
import { noiseBytes } from './bytes'
import { fitToBytes } from './fit'
import { renderRgb } from './pattern'

const HEADERS = 54

/** 24-bit bottom-up BMP; trailing bytes after the pixel rows are ignored by readers, bfSize covers them. */
function encodeRaster(width: number, height: number, seed: number): Buffer {
  const rowBytes = Math.ceil((width * 3) / 4) * 4
  const out = Buffer.alloc(HEADERS + rowBytes * height)
  out.write('BM', 0, 'latin1')
  out.writeUInt32LE(out.length, 2)
  out.writeUInt32LE(HEADERS, 10)
  out.writeUInt32LE(40, 14)
  out.writeInt32LE(width, 18)
  out.writeInt32LE(height, 22)
  out.writeUInt16LE(1, 26)
  out.writeUInt16LE(24, 28)
  out.writeUInt32LE(rowBytes * height, 34)
  out.writeInt32LE(2835, 38)
  out.writeInt32LE(2835, 42)
  const rgb = renderRgb(width, height, seed, 0.3)
  for (let y = 0; y < height; y += 1) {
    let target = HEADERS + (height - 1 - y) * rowBytes
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 3
      out[target] = rgb[source + 2] as number
      out[target + 1] = rgb[source + 1] as number
      out[target + 2] = rgb[source] as number
      target += 3
    }
  }
  return out
}

function padBmp(body: Buffer, target: number, seed: number): Buffer {
  const out = Buffer.concat([body, noiseBytes(target - body.length, seed)])
  out.writeUInt32LE(out.length, 2)
  return out
}

export function encodeBmp(spec: PayloadSpec): Buffer {
  return fitToBytes(spec, {
    bytesPerPixel: 3,
    padRoom: 1,
    encode: (width, height) => encodeRaster(width, height, spec.seed),
    pad: (body, target) => padBmp(body, target, spec.seed)
  })
}
