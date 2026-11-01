import type { PayloadSpec } from '../../types'
import { asciiFiller, u16be } from './bytes'
import { fitToBytes } from './fit'
import { blockColor } from './pattern'

const COM_MAX_PAYLOAD = 65533
const COM_OVERHEAD = 4

/** Baseline JPEG storing one DC value per 8x8 block, so big pixel sizes cost almost no bytes. */
class BitWriter {
  private readonly bytes: number[] = []
  private acc = 0
  private count = 0

  write(value: number, width: number): void {
    for (let bit = width - 1; bit >= 0; bit -= 1) {
      this.acc = (this.acc << 1) | ((value >>> bit) & 1)
      this.count += 1
      if (this.count === 8) {
        this.bytes.push(this.acc)
        if (this.acc === 0xff) this.bytes.push(0)
        this.acc = 0
        this.count = 0
      }
    }
  }

  finish(): Buffer {
    while (this.count !== 0) this.write(1, 1)
    return Buffer.from(this.bytes)
  }
}

function segment(marker: number, body: Uint8Array): Buffer {
  return Buffer.concat([Buffer.from([0xff, marker]), u16be(body.length + 2), body])
}

function huffmanTable(id: number, counts: Record<number, number>, symbols: number[]): Buffer {
  const bits = Buffer.alloc(16)
  for (const [length, count] of Object.entries(counts)) bits[Number(length) - 1] = count
  return segment(0xc4, Buffer.concat([Buffer.from([id]), bits, Buffer.from(symbols)]))
}

const DC_SYMBOLS = Array.from({ length: 12 }, (_, index) => index)
// EOB gets the only 2-bit code (00); the other 161 symbols share 8-bit codes.
const AC_SYMBOLS = (() => {
  const symbols = [0x00, 0xf0]
  for (let run = 0; run < 16; run += 1) {
    for (let size = 1; size <= 10; size += 1) symbols.push((run << 4) | size)
  }
  return symbols
})()

const clampByte = (value: number): number => Math.min(255, Math.max(0, Math.round(value)))

function levelShifted([r, g, b]: [number, number, number]): [number, number, number] {
  return [
    clampByte(0.299 * r + 0.587 * g + 0.114 * b) - 128,
    clampByte(-0.168736 * r - 0.331264 * g + 0.5 * b + 128) - 128,
    clampByte(0.5 * r - 0.418688 * g - 0.081312 * b + 128) - 128
  ]
}

function writeDcDifference(writer: BitWriter, difference: number): void {
  const magnitude = Math.abs(difference)
  const category = magnitude === 0 ? 0 : 32 - Math.clz32(magnitude)
  writer.write(category, 4)
  if (category > 0) {
    writer.write(difference > 0 ? difference : difference + (1 << category) - 1, category)
  }
}

function entropyData(width: number, height: number, seed: number): Buffer {
  const blocksX = Math.ceil(width / 8)
  const blocksY = Math.ceil(height / 8)
  const writer = new BitWriter()
  const previous = [0, 0, 0]
  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const levels = levelShifted(blockColor(bx, by, blocksX, blocksY, seed))
      for (let component = 0; component < 3; component += 1) {
        writeDcDifference(writer, (levels[component] as number) - (previous[component] as number))
        previous[component] = levels[component] as number
        writer.write(0, 2)
      }
    }
  }
  return writer.finish()
}

function encodeRaster(width: number, height: number, seed: number): Buffer {
  const jfif = Buffer.concat([
    Buffer.from('JFIF\0', 'latin1'),
    Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0])
  ])
  const frame = Buffer.from([
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    3,
    1,
    0x11,
    0,
    2,
    0x11,
    0,
    3,
    0x11,
    0
  ])
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, jfif),
    segment(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 8)])),
    segment(0xc0, frame),
    huffmanTable(0x00, { 4: 12 }, DC_SYMBOLS),
    huffmanTable(0x10, { 2: 1, 8: 161 }, AC_SYMBOLS),
    segment(0xda, Buffer.from([3, 1, 0x00, 2, 0x00, 3, 0x00, 0, 63, 0])),
    entropyData(width, height, seed),
    Buffer.from([0xff, 0xd9])
  ])
}

/** COM segments sit right after SOI; every decoder skips them. */
function padJpeg(body: Buffer, target: number, seed: number): Buffer {
  const parts: Buffer[] = [body.subarray(0, 2)]
  let rest = Math.max(COM_OVERHEAD, target - body.length)
  for (let index = 0; rest > 0; index += 1) {
    let size = Math.min(rest, COM_MAX_PAYLOAD + COM_OVERHEAD)
    if (rest - size > 0 && rest - size < COM_OVERHEAD) size = rest - COM_OVERHEAD
    parts.push(segment(0xfe, asciiFiller(size - COM_OVERHEAD, seed + index)))
    rest -= size
  }
  parts.push(body.subarray(2))
  return Buffer.concat(parts)
}

export function encodeJpeg(spec: PayloadSpec): Buffer {
  return fitToBytes(spec, {
    bytesPerPixel: 0.08,
    maxPixels: 1_900_000,
    padRoom: COM_OVERHEAD,
    encode: (width, height) => encodeRaster(width, height, spec.seed),
    pad: (body, target) => padJpeg(body, target, spec.seed)
  })
}
