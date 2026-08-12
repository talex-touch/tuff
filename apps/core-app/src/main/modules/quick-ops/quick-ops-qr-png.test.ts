import { createPreviewSdk, QuickOpsDeveloperAbility } from '@talex-touch/utils/core-box/preview'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  calculateCrc32,
  extractQrSvg,
  extractQrSvgDarkModules,
  extractQrSvgSize,
  isQrSvgPayload,
  renderQrSvgToPng
} from './quick-ops-qr-png'

/**
 * The QuickOps QR encoder (#339).
 *
 * This is a hand-rolled grayscale PNG writer — CRC-32, chunk framing, IHDR, a zlib scanline
 * stream — and the only assertion it had was that the output starts with the eight-byte PNG
 * signature, which this code writes unconditionally before doing any of that work. A wrong CRC,
 * a truncated IHDR or a mis-framed IDAT all survive that check and produce a file no decoder
 * opens.
 *
 * So the tests below decode rather than inspect: every chunk's length and CRC are recomputed
 * from the bytes on disk, and the pixels come back through `inflateSync`. `decodePng` shares no
 * code with the encoder, which is the point — a matching bug in both would otherwise agree.
 */

interface DecodedPng {
  width: number
  height: number
  bitDepth: number
  colorType: number
  /** Row-major, one byte per pixel, filter bytes already stripped. */
  pixels: Buffer
  chunkTypes: string[]
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * A minimal PNG reader that refuses anything it cannot verify.
 *
 * It re-derives each chunk's CRC with the standard polynomial rather than calling the encoder's
 * `calculateCrc32`, so the two implementations have to agree independently.
 */
function decodePng(buffer: Buffer): DecodedPng {
  expect(buffer.subarray(0, 8)).toEqual(PNG_SIGNATURE)

  const chunkTypes: string[] = []
  let header: { width: number; height: number; bitDepth: number; colorType: number } | null = null
  const idatParts: Buffer[] = []
  let offset = 8

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    const declaredCrc = buffer.readUInt32BE(offset + 8 + length)

    expect(
      { type, crc: declaredCrc },
      `chunk ${type} carries a CRC the bytes do not produce`
    ).toEqual({ type, crc: referenceCrc32(buffer.subarray(offset + 4, offset + 8 + length)) })

    chunkTypes.push(type)
    if (type === 'IHDR') {
      expect(length, 'IHDR must be 13 bytes').toBe(13)
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8]!,
        colorType: data[9]!
      }
      // Anything other than 0/0/0 here is a stream this decoder — and most others — cannot read.
      expect(
        { compression: data[10], filter: data[11], interlace: data[12] },
        'IHDR compression/filter/interlace must all be 0'
      ).toEqual({ compression: 0, filter: 0, interlace: 0 })
    }
    if (type === 'IDAT') idatParts.push(Buffer.from(data))

    offset += 12 + length
  }

  expect(offset, 'trailing bytes after the last chunk').toBe(buffer.length)
  expect(chunkTypes.at(-1), 'the stream must end with IEND').toBe('IEND')
  expect(header, 'no IHDR chunk').not.toBeNull()

  const { width, height, bitDepth, colorType } = header!
  const raw = inflateSync(Buffer.concat(idatParts))
  expect(raw.length, 'inflated size does not match the declared dimensions').toBe(
    (width + 1) * height
  )

  const pixels = Buffer.alloc(width * height)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width + 1)
    // Only filter type 0 is emitted; any other value would make the pixel copy below wrong.
    expect(raw[rowStart], `scanline ${y} uses a filter this encoder does not emit`).toBe(0)
    raw.copy(pixels, y * width, rowStart + 1, rowStart + 1 + width)
  }

  return { width, height, bitDepth, colorType, pixels, chunkTypes }
}

/** The CRC-32 from the PNG specification, written independently of the encoder's copy. */
function referenceCrc32(input: Buffer): number {
  const table = Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    return value >>> 0
  })
  let crc = 0xffffffff
  for (const byte of input) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function svgWith(viewBox: number, rects: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" ` +
    `shape-rendering="crispEdges"><rect width="${viewBox}" height="${viewBox}" fill="#fff"/>` +
    `<g fill="#000">${rects}</g></svg>`
  )
}

function module(x: number, y: number): string {
  return `<rect x="${x}" y="${y}" width="1" height="1"/>`
}

describe('renderQrSvgToPng', () => {
  it('produces a stream a decoder can read end to end', () => {
    const png = renderQrSvgToPng(svgWith(8, module(1, 1) + module(6, 6)), 4)

    expect(png).not.toBeNull()
    const decoded = decodePng(png!)

    expect(decoded.chunkTypes).toEqual(['IHDR', 'IDAT', 'IEND'])
    expect({ width: decoded.width, height: decoded.height }).toEqual({ width: 32, height: 32 })
    // Grayscale, 8 bits per sample — the two IHDR fields the pixel reader above depends on.
    expect({ bitDepth: decoded.bitDepth, colorType: decoded.colorType }).toEqual({
      bitDepth: 8,
      colorType: 0
    })
  })

  it('places dark modules where the SVG put them', () => {
    const scale = 4
    const png = renderQrSvgToPng(svgWith(8, module(1, 1) + module(6, 6)), scale)
    const decoded = decodePng(png!)
    const at = (x: number, y: number): number => decoded.pixels[y * decoded.width + x]!

    // Each 1×1 module becomes a scale×scale block: opposite corners inside, and the pixel just
    // past each edge still white. An off-by-one in the fill loop moves or smears exactly here.
    for (const [mx, my] of [
      [1, 1],
      [6, 6]
    ] as const) {
      expect(at(mx * scale, my * scale)).toBe(0x00)
      expect(at(mx * scale + scale - 1, my * scale + scale - 1)).toBe(0x00)
      expect(at(mx * scale - 1, my * scale)).toBe(0xff)
      expect(at(mx * scale + scale, my * scale)).toBe(0xff)
    }

    expect(at(0, 0)).toBe(0xff)
    // Two modules, scale² pixels each — a count, so a fill that ran long shows up as a total.
    const dark = decoded.pixels.reduce((total, value) => total + (value === 0x00 ? 1 : 0), 0)
    expect(dark).toBe(2 * scale * scale)
  })

  /**
   * The save handler is a transport event, so the payload arrives from a plugin or the renderer
   * rather than from this repo's generator. An SVG whose rects these regexes cannot read used to
   * encode to a blank white square and be reported as `state: 'saved'` — a file that opens fine
   * and scans as nothing.
   */
  it('refuses an SVG whose modules it could not read instead of encoding a blank square', () => {
    const singleQuoted = svgWith(8, `<rect x='1' y='1' width='1' height='1'/>`)
    expect(extractQrSvgDarkModules(singleQuoted)).toEqual([])
    expect(renderQrSvgToPng(singleQuoted)).toBeNull()

    expect(renderQrSvgToPng(svgWith(8, ''))).toBeNull()
    expect(renderQrSvgToPng(svgWith(8, '<rect x="1" y="1" width="1" height="1" />'))).toBeNull()
  })

  it('refuses sizes and scales it cannot encode', () => {
    expect(renderQrSvgToPng(svgWith(8, module(1, 1)), 0)).toBeNull()
    expect(renderQrSvgToPng('<svg viewBox="0 0 8 9"></svg>')).toBeNull()
    expect(renderQrSvgToPng(svgWith(257, module(1, 1)))).toBeNull()
    expect(renderQrSvgToPng('not an svg')).toBeNull()
  })

  it('drops modules outside the viewBox rather than writing past the buffer', () => {
    const png = renderQrSvgToPng(svgWith(8, module(1, 1) + module(9, 9)), 4)
    const decoded = decodePng(png!)
    const dark = decoded.pixels.reduce((total, value) => total + (value === 0x00 ? 1 : 0), 0)

    expect(dark).toBe(16)
  })
})

describe('extractQrSvg', () => {
  it('reads the SVG out of the render metadata', () => {
    const svg = svgWith(8, module(1, 1))
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

    expect(extractQrSvg({ primaryValue: dataUrl } as never)).toBe(svg)
    expect(
      extractQrSvg({
        primaryValue: 'ignored',
        meta: { quickOps: { render: { kind: 'qr-code-svg', dataUrl } } }
      } as never)
    ).toBe(svg)
  })

  it('refuses payloads that are not an SVG data URL', () => {
    expect(extractQrSvg({ primaryValue: 'https://example.test' } as never)).toBeNull()
    expect(
      extractQrSvg({ primaryValue: 'data:image/svg+xml;charset=utf-8,%3Cscript%3E' } as never)
    ).toBeNull()
    expect(
      extractQrSvg({ primaryValue: 'data:image/svg+xml;charset=utf-8,%E0%A4%A' } as never)
    ).toBeNull()
  })

  it('recognises only the QR render kind', () => {
    expect(
      isQrSvgPayload({ meta: { quickOps: { render: { kind: 'qr-code-svg' } } } } as never)
    ).toBe(true)
    expect(
      isQrSvgPayload({ meta: { quickOps: { render: { kind: 'color-swatch' } } } } as never)
    ).toBe(false)
    expect(isQrSvgPayload({} as never)).toBe(false)
  })
})

/**
 * The regexes in this module parse a string built by `renderQrSvg` in
 * `packages/utils/core-box/preview/abilities/quickops-developer-ability.ts`. Nothing declares that
 * contract — no shared constant, no schema — so a whitespace change or an added attribute on the
 * generator side would leave this side matching nothing.
 *
 * With the guard above that is now a refusal rather than a blank PNG, but a refusal is still the
 * QR feature not working. This drives the real ability so the drift fails here first.
 */
describe('the SVG the preview ability actually emits', () => {
  async function generateQrSvg(text: string): Promise<string> {
    const sdk = createPreviewSdk({ abilities: [new QuickOpsDeveloperAbility()] })
    const card = await sdk.resolve({
      query: { text, inputs: [] },
      signal: new AbortController().signal
    } as never)

    expect(card?.payload, `the ability returned no card for "${text}"`).toBeTruthy()
    const svg = extractQrSvg(card!.payload as never)
    expect(svg, 'the emitted payload is not an SVG data URL this module can read').not.toBeNull()
    return svg!
  }

  it('parses into the module grid the generator drew', async () => {
    const svg = await generateQrSvg('qr code https://tuff.talex.app')

    // Version 2 at ECC level L is 25 modules; the generator adds a 4-module quiet zone per side.
    expect(extractQrSvgSize(svg)).toBe(33)

    const modules = extractQrSvgDarkModules(svg)
    expect(modules.length).toBeGreaterThan(0)
    expect(modules.length).toBe((svg.match(/<rect x=/g) ?? []).length)

    // The top-left finder pattern sits at the quiet-zone offset in every QR ever drawn, so this
    // pins the coordinate origin the two sides agree on rather than just "something matched".
    const dark = new Set(modules.map(({ x, y }) => `${x},${y}`))
    for (let offset = 0; offset < 7; offset += 1) {
      expect(dark.has(`${4 + offset},4`), `finder pattern missing at ${4 + offset},4`).toBe(true)
      expect(dark.has(`4,${4 + offset}`), `finder pattern missing at 4,${4 + offset}`).toBe(true)
    }
    expect(dark.has('9,9'), 'the finder pattern interior should be light').toBe(false)
  })

  it('encodes to a PNG whose dark pixels match its own module count', async () => {
    const svg = await generateQrSvg('qr code tuff')
    const scale = 2
    const decoded = decodePng(renderQrSvgToPng(svg, scale)!)
    const size = extractQrSvgSize(svg)!

    expect({ width: decoded.width, height: decoded.height }).toEqual({
      width: size * scale,
      height: size * scale
    })

    const dark = decoded.pixels.reduce((total, value) => total + (value === 0x00 ? 1 : 0), 0)
    expect(dark).toBe(extractQrSvgDarkModules(svg).length * scale * scale)
  })
})

describe('calculateCrc32', () => {
  // Published CRC-32 vectors: a bad table or a missing final inversion fails all three.
  it('matches the published vectors', () => {
    expect(calculateCrc32(Buffer.from('', 'ascii'))).toBe(0)
    expect(calculateCrc32(Buffer.from('123456789', 'ascii'))).toBe(0xcbf43926)
    expect(calculateCrc32(Buffer.from('IEND', 'ascii'))).toBe(0xae426082)
  })

  it('agrees with an independent implementation across byte patterns', () => {
    for (const size of [1, 7, 64, 255, 1024]) {
      const input = Buffer.from(Array.from({ length: size }, (_, index) => (index * 37) % 256))
      expect(calculateCrc32(input)).toBe(referenceCrc32(input))
    }
  })
})
