import type { PayloadSpec } from '../../types'
import { asciiFiller, u32le } from './bytes'
import { fitToBytes } from './fit'
import { blockColor } from './pattern'

const CHUNK_HEADER = 8

function chunk(fourcc: string, data: Uint8Array): Buffer {
  const odd = data.length % 2 === 1
  return Buffer.concat([
    Buffer.from(fourcc, 'latin1'),
    u32le(data.length),
    data,
    odd ? Buffer.alloc(1) : Buffer.alloc(0)
  ])
}

class LsbBits {
  private readonly bytes: number[] = []
  private acc = 0
  private count = 0

  write(value: number, width: number): void {
    for (let bit = 0; bit < width; bit += 1) {
      this.acc |= ((value >>> bit) & 1) << this.count
      this.count += 1
      if (this.count === 8) {
        this.bytes.push(this.acc)
        this.acc = 0
        this.count = 0
      }
    }
  }

  finish(): Buffer {
    if (this.count > 0) this.bytes.push(this.acc)
    return Buffer.from(this.bytes)
  }
}

/** A prefix code with a single symbol takes zero bits per pixel, so a flat image needs no pixel data. */
function writeSingleSymbolCode(bits: LsbBits, symbol: number, eightBit: boolean): void {
  bits.write(1, 1)
  bits.write(0, 1)
  bits.write(eightBit ? 1 : 0, 1)
  bits.write(symbol, eightBit ? 8 : 1)
}

function losslessChunk(width: number, height: number, seed: number): Buffer {
  const [red, green, blue] = blockColor(0, 0, 1, 1, seed)
  const bits = new LsbBits()
  bits.write(0, 1)
  bits.write(0, 1)
  bits.write(0, 1)
  writeSingleSymbolCode(bits, green, true)
  writeSingleSymbolCode(bits, red, true)
  writeSingleSymbolCode(bits, blue, true)
  writeSingleSymbolCode(bits, 255, true)
  writeSingleSymbolCode(bits, 0, false)
  const header = Buffer.alloc(4)
  header.writeUInt32LE((width - 1) | ((height - 1) << 14))
  return chunk('VP8L', Buffer.concat([Buffer.from([0x2f]), header, bits.finish()]))
}

function encodeRaster(width: number, height: number, seed: number): Buffer {
  const extended = Buffer.alloc(10)
  extended.writeUIntLE(width - 1, 4, 3)
  extended.writeUIntLE(height - 1, 7, 3)
  const body = Buffer.concat([
    Buffer.from('WEBP', 'latin1'),
    chunk('VP8X', extended),
    losslessChunk(width, height, seed)
  ])
  return Buffer.concat([Buffer.from('RIFF', 'latin1'), u32le(body.length), body])
}

/** Unknown trailing chunks are skipped by readers; RIFF chunks are even-sized, so odd targets overshoot by one. */
function padWebp(body: Buffer, target: number, seed: number): Buffer {
  const payload = Math.max(0, target - body.length - CHUNK_HEADER)
  const out = Buffer.concat([body, chunk('JUNK', asciiFiller(payload, seed))])
  out.writeUInt32LE(out.length - CHUNK_HEADER, 4)
  return out
}

export function encodeWebp(spec: PayloadSpec): Buffer {
  return fitToBytes(spec, {
    bytesPerPixel: 0.05,
    maxPixels: 1_900_000,
    padRoom: CHUNK_HEADER,
    encode: (width, height) => encodeRaster(width, height, spec.seed),
    pad: (body, target) => padWebp(body, target, spec.seed)
  })
}
