/** Independent readers for the generated payloads: they share no code with the encoders and throw on the first violation. */
import { crc32, inflateSync } from 'node:zlib'

export interface Decoded {
  format: string
  width: number
  height: number
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
function fail(format: string, message: string): never {
  throw new Error(`${format}: ${message}`)
}

export function decodePng(buf: Buffer): Decoded {
  if (buf.length < 57 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) fail('png', 'bad signature')
  let at = 8
  let width = 0
  let height = 0
  let ended = false
  let first = true
  const data: Buffer[] = []
  while (at < buf.length) {
    if (ended) fail('png', 'bytes after IEND')
    if (at + 12 > buf.length) fail('png', 'truncated chunk header')
    const length = buf.readUInt32BE(at)
    const type = buf.toString('latin1', at + 4, at + 8)
    if (at + 12 + length > buf.length) fail('png', `chunk ${type} overruns the file`)
    if (crc32(buf.subarray(at + 4, at + 8 + length)) !== buf.readUInt32BE(at + 8 + length))
      fail('png', `bad CRC in ${type}`)
    const body = buf.subarray(at + 8, at + 8 + length)
    if (first && type !== 'IHDR') fail('png', 'first chunk is not IHDR')
    first = false
    if (type === 'IHDR') {
      if (length !== 13) fail('png', 'IHDR length')
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      if (
        width < 1 ||
        height < 1 ||
        body[8] !== 8 ||
        body[9] !== 2 ||
        body[10] !== 0 ||
        body[11] !== 0 ||
        body[12] !== 0
      )
        fail('png', 'unsupported IHDR')
    } else if (type === 'IDAT') data.push(body)
    else if (type === 'IEND') ended = true
    else if (type.charCodeAt(0) < 0x61) fail('png', `unknown critical chunk ${type}`)
    at += 12 + length
  }
  if (!ended) fail('png', 'no IEND')
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * 3 + 1
  if (raw.length !== stride * height)
    fail('png', `inflated ${raw.length} bytes, expected ${stride * height}`)
  for (let y = 0; y < height; y += 1)
    if ((raw[y * stride] as number) > 4) fail('png', 'bad filter type')
  return { format: 'png', width, height }
}

interface HuffmanTable {
  codes: Map<string, number>
}

function huffmanFrom(counts: Buffer, symbols: Buffer): HuffmanTable {
  const codes = new Map<string, number>()
  let code = 0
  let next = 0
  for (let length = 1; length <= 16; length += 1) {
    for (let index = 0; index < (counts[length - 1] as number); index += 1) {
      codes.set(`${length}:${code}`, symbols[next] as number)
      code += 1
      next += 1
    }
    code <<= 1
  }
  return { codes }
}

class ScanBits {
  private at = 0
  private left = 0
  private acc = 0
  constructor(private readonly data: Buffer) {}
  bit(): number {
    if (this.left === 0) {
      if (this.at >= this.data.length) fail('jpg', 'entropy data ran out')
      this.acc = this.data[this.at] as number
      this.at += 1
      this.left = 8
    }
    this.left -= 1
    return (this.acc >> this.left) & 1
  }
  bits(count: number): number {
    let value = 0
    for (let index = 0; index < count; index += 1) value = (value << 1) | this.bit()
    return value
  }
  symbol(table: HuffmanTable): number {
    let code = 0
    for (let length = 1; length <= 16; length += 1) {
      code = (code << 1) | this.bit()
      const found = table.codes.get(`${length}:${code}`)
      if (found !== undefined) return found
    }
    return fail('jpg', 'no Huffman code matches')
  }
  /** Bits left in the last byte must all be 1, and no whole byte may remain. */
  assertPadded(): void {
    while (this.left > 0) if (this.bit() !== 1) fail('jpg', 'scan padding is not 1-bits')
    if (this.at !== this.data.length)
      fail('jpg', `${this.data.length - this.at} unread entropy bytes`)
  }
}

/** Marker walk to EOI plus a full Huffman decode of a baseline 4:4:4 scan (DC difference and EOB per block). */
export function decodeJpeg(buf: Buffer): Decoded {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) fail('jpg', 'no SOI')
  let at = 2
  let width = 0
  let height = 0
  const tables = new Map<number, HuffmanTable>()
  let sawQuant = false
  let components: Array<{ dc: number; ac: number }> = []
  for (;;) {
    if (at + 4 > buf.length || buf[at] !== 0xff) fail('jpg', `expected a marker at ${at}`)
    const marker = buf[at + 1] as number
    const length = buf.readUInt16BE(at + 2)
    if (length < 2 || at + 2 + length > buf.length)
      fail('jpg', `segment ${marker.toString(16)} overruns the file`)
    const body = buf.subarray(at + 4, at + 2 + length)
    if (marker === 0xdb) sawQuant = true
    else if (marker === 0xc0) {
      if (body[0] !== 8 || body[5] !== 3) fail('jpg', 'not 8-bit three-component baseline')
      height = body.readUInt16BE(1)
      width = body.readUInt16BE(3)
      for (let index = 0; index < 3; index += 1)
        if (body[7 + index * 3] !== 0x11) fail('jpg', 'only 1x1 sampling is read')
    } else if (marker === 0xc4) {
      let offset = 0
      while (offset < body.length) {
        const id = body[offset] as number
        const counts = body.subarray(offset + 1, offset + 17)
        const total = counts.reduce((sum, count) => sum + count, 0)
        tables.set(id, huffmanFrom(counts, body.subarray(offset + 17, offset + 17 + total)))
        offset += 17 + total
      }
    } else if (marker === 0xda) {
      components = [0, 1, 2].map((index) => ({
        dc: (body[2 + index * 2] as number) >> 4,
        ac: (body[2 + index * 2] as number) & 15
      }))
      at += 2 + length
      break
    }
    at += 2 + length
  }
  if (!sawQuant || width < 1 || height < 1) fail('jpg', 'missing DQT or SOF0')
  const end = buf.length - 2
  if (buf[end] !== 0xff || buf[end + 1] !== 0xd9) fail('jpg', 'does not end with EOI')
  const raw = buf.subarray(at, end)
  const scan: number[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index] as number
    if (value === 0xff) {
      if (raw[index + 1] !== 0) fail('jpg', 'unstuffed 0xFF inside the scan')
      index += 1
    }
    scan.push(value)
  }
  const bits = new ScanBits(Buffer.from(scan))
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8)
  for (let block = 0; block < blocks; block += 1) {
    for (const component of components) {
      const dc = tables.get(component.dc) ?? fail('jpg', 'missing DC table')
      const ac = tables.get(0x10 | component.ac) ?? fail('jpg', 'missing AC table')
      const category = bits.symbol(dc)
      if (category > 11) fail('jpg', `DC category ${category}`)
      bits.bits(category)
      for (let k = 1; k < 64; ) {
        const symbol = bits.symbol(ac)
        if (symbol === 0) break
        k += symbol === 0xf0 ? 16 : (symbol >> 4) + 1
        bits.bits(symbol & 15)
      }
    }
  }
  bits.assertPadded()
  return { format: 'jpg', width, height }
}

function lzwPixels(minCode: number, data: Buffer): number[] {
  const clear = 1 << minCode
  const end = clear + 1
  const out: number[] = []
  let dictionary: number[][] = []
  let size = minCode + 1
  let previous: number[] | null = null
  let acc = 0
  let held = 0
  let at = 0
  const reset = (): void => {
    dictionary = Array.from({ length: clear }, (_, index) => [index])
    dictionary.push([], [])
    size = minCode + 1
    previous = null
  }
  reset()
  for (;;) {
    while (held < size) {
      if (at >= data.length) return fail('gif', 'LZW data ended before EOI')
      acc |= (data[at] as number) << held
      at += 1
      held += 8
    }
    const code = acc & ((1 << size) - 1)
    acc >>>= size
    held -= size
    if (code === clear) {
      reset()
      continue
    }
    if (code === end) return out
    let entry: number[]
    if (code < dictionary.length) entry = dictionary[code] as number[]
    else if (code === dictionary.length && previous)
      entry = [...(previous as number[]), (previous as number[])[0] as number]
    else return fail('gif', `bad LZW code ${code}`)
    for (const value of entry) out.push(value)
    if (previous && dictionary.length < 4096) {
      dictionary.push([...(previous as number[]), entry[0] as number])
      if (dictionary.length === 1 << size && size < 12) size += 1
    }
    previous = entry
  }
}

/** `deep` runs the LZW decoder and checks the pixel count; without it only the block structure is walked. */
export function decodeGif(buf: Buffer, deep = true): Decoded {
  if (buf.length < 20 || !/^GIF8[79]a$/.test(buf.toString('latin1', 0, 6)))
    fail('gif', 'bad header')
  if (buf[buf.length - 1] !== 0x3b) fail('gif', 'no trailer')
  const width = buf.readUInt16LE(6)
  const height = buf.readUInt16LE(8)
  const flags = buf[10] as number
  let at = 13 + (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0)
  const colours = flags & 0x80 ? 1 << ((flags & 7) + 1) : 0
  const blocks = (): Buffer => {
    const parts: Buffer[] = []
    for (;;) {
      const size = buf[at] as number
      if (at + 1 + size >= buf.length) fail('gif', 'sub-block overruns the file')
      at += 1
      if (size === 0) return Buffer.concat(parts)
      parts.push(buf.subarray(at, at + size))
      at += size
    }
  }
  let images = 0
  for (;;) {
    const introducer = buf[at] as number
    if (introducer === 0x3b) {
      if (at !== buf.length - 1) fail('gif', 'bytes after the trailer')
      break
    }
    if (introducer === 0x21) {
      at += 2
      blocks()
    } else if (introducer === 0x2c) {
      const w = buf.readUInt16LE(at + 5)
      const h = buf.readUInt16LE(at + 7)
      if (w !== width || h !== height) fail('gif', 'frame differs from the logical screen')
      if ((buf[at + 9] as number) & 0x80) fail('gif', 'local colour tables are not read')
      const minCode = buf[at + 10] as number
      at += 11
      const data = blocks()
      images += 1
      if (deep) {
        const pixels = lzwPixels(minCode, data)
        if (pixels.length !== w * h)
          fail('gif', `${pixels.length} pixels decoded, expected ${w * h}`)
        if (pixels.some((value) => value >= colours)) fail('gif', 'pixel index outside the palette')
      }
    } else fail('gif', `unknown block ${introducer.toString(16)}`)
  }
  if (images !== 1) fail('gif', `${images} frames`)
  return { format: 'gif', width, height }
}

export function decodeBmp(buf: Buffer): Decoded {
  if (buf.length < 54 || buf.toString('latin1', 0, 2) !== 'BM') fail('bmp', 'bad header')
  if (buf.readUInt32LE(2) !== buf.length)
    fail('bmp', `bfSize ${buf.readUInt32LE(2)} is not the file size ${buf.length}`)
  const offset = buf.readUInt32LE(10)
  const width = buf.readInt32LE(18)
  const height = buf.readInt32LE(22)
  const stride = Math.ceil((width * 24) / 32) * 4
  if (
    buf.readUInt32LE(14) !== 40 ||
    buf.readUInt16LE(26) !== 1 ||
    buf.readUInt16LE(28) !== 24 ||
    buf.readUInt32LE(30) !== 0
  )
    fail('bmp', 'unsupported DIB header')
  if (width < 1 || height < 1) fail('bmp', 'non-positive size')
  if (buf.readUInt32LE(34) !== stride * height) fail('bmp', 'biSizeImage')
  if (offset !== 54 || offset + stride * height > buf.length)
    fail('bmp', 'pixel array outside the file')
  return { format: 'bmp', width, height }
}

export function decodeWebp(buf: Buffer): Decoded {
  if (
    buf.length < 30 ||
    buf.toString('latin1', 0, 4) !== 'RIFF' ||
    buf.toString('latin1', 8, 12) !== 'WEBP'
  )
    fail('webp', 'bad RIFF header')
  if (buf.readUInt32LE(4) !== buf.length - 8)
    fail('webp', `RIFF size ${buf.readUInt32LE(4)} is not ${buf.length - 8}`)
  if (buf.length % 2 !== 0) fail('webp', 'odd RIFF length')
  let at = 12
  let canvas: [number, number] | null = null
  let lossless: [number, number] | null = null
  while (at < buf.length) {
    const type = buf.toString('latin1', at, at + 4)
    const size = buf.readUInt32LE(at + 4)
    const next = at + 8 + size + (size % 2)
    if (next > buf.length) fail('webp', `chunk ${type} overruns the file`)
    if (type === 'VP8X') {
      if (size !== 10) fail('webp', 'VP8X size')
      canvas = [buf.readUIntLE(at + 12, 3) + 1, buf.readUIntLE(at + 15, 3) + 1]
    } else if (type === 'VP8L') {
      if (buf[at + 8] !== 0x2f) fail('webp', 'VP8L signature')
      const bits = buf.readUInt32LE(at + 9)
      if (bits >>> 29 !== 0) fail('webp', 'VP8L version')
      lossless = [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]
    }
    at = next
  }
  if (at !== buf.length) fail('webp', 'chunks do not end at the RIFF end')
  if (!canvas || !lossless || canvas[0] !== lossless[0] || canvas[1] !== lossless[1])
    fail('webp', 'VP8X canvas and VP8L size differ')
  return { format: 'webp', width: lossless[0], height: lossless[1] }
}

export function decodeTiff(buf: Buffer): Decoded {
  if (buf.length < 26 || buf.toString('latin1', 0, 2) !== 'II' || buf.readUInt16LE(2) !== 42)
    fail('tiff', 'bad header')
  const ifd = buf.readUInt32LE(4)
  if (ifd < 8 || ifd + 2 > buf.length) fail('tiff', 'IFD offset outside the file')
  const count = buf.readUInt16LE(ifd)
  if (ifd + 2 + count * 12 + 4 > buf.length) fail('tiff', 'IFD overruns the file')
  const tags = new Map<number, { type: number; count: number; value: number }>()
  let last = 0
  for (let index = 0; index < count; index += 1) {
    const at = ifd + 2 + index * 12
    const tag = buf.readUInt16LE(at)
    if (tag <= last) fail('tiff', 'IFD tags are not ascending')
    last = tag
    const type = buf.readUInt16LE(at + 2)
    tags.set(tag, {
      type,
      count: buf.readUInt32LE(at + 4),
      value:
        type === 3 && buf.readUInt32LE(at + 4) === 1
          ? buf.readUInt16LE(at + 8)
          : buf.readUInt32LE(at + 8)
    })
  }
  const value = (tag: number): number => tags.get(tag)?.value ?? fail('tiff', `missing tag ${tag}`)
  const width = value(256)
  const height = value(257)
  const bits = tags.get(258)
  if (
    !bits ||
    bits.count !== 3 ||
    [0, 2, 4].some((step) => buf.readUInt16LE(bits.value + step) !== 8)
  )
    fail('tiff', 'BitsPerSample is not 8,8,8')
  if (value(259) !== 1 || value(262) !== 2 || value(277) !== 3 || value(284) !== 1)
    fail('tiff', 'not uncompressed chunky RGB')
  if (value(278) !== height || value(279) !== width * height * 3) fail('tiff', 'strip layout')
  if (value(273) + value(279) > ifd) fail('tiff', 'strip overlaps the IFD')
  return { format: 'tiff', width, height }
}

export interface Box {
  type: string
  start: number
  size: number
}

export function boxesOf(buf: Buffer): Box[] {
  const boxes: Box[] = []
  let at = 0
  while (at < buf.length) {
    if (at + 8 > buf.length) fail('heic', 'truncated box header')
    const declared = buf.readUInt32BE(at)
    if (declared === 1 && at + 16 > buf.length) fail('heic', 'truncated 64-bit box size')
    const size =
      declared === 1
        ? Number(buf.readBigUInt64BE(at + 8))
        : declared === 0
          ? buf.length - at
          : declared
    if (size < 8 || at + size > buf.length) fail('heic', `box at ${at} has size ${size}`)
    boxes.push({ type: buf.toString('latin1', at + 4, at + 8), start: at, size })
    at += size
  }
  return boxes
}

export function decodeHeic(buf: Buffer): { format: string; brand: string; boxes: string[] } {
  const boxes = boxesOf(buf)
  if (boxes[0]?.type !== 'ftyp') fail('heic', 'first box is not ftyp')
  const brand = buf.toString('latin1', 8, 12)
  if (brand !== 'heic') fail('heic', `major brand ${brand}`)
  for (const needed of ['meta', 'mdat'])
    if (!boxes.some((box) => box.type === needed)) fail('heic', `no ${needed} box`)
  return { format: 'heic', brand, boxes: boxes.map((box) => box.type) }
}

const TAG = /^[A-Za-z_][\w:.-]*(\s+[\w:.-]+\s*=\s*("[^"]*"|'[^']*'))*\s*\/?$/

/** Tag-balance check for XML (`voids` empty) or lenient HTML; throws on the first mistake and returns the root element. */
export function wellFormedMarkup(text: string, voids: ReadonlySet<string> = new Set()): string {
  let at = text.startsWith('<?xml') ? text.indexOf('?>') + 2 : 0
  if (at === 1) fail('xml', 'unterminated declaration')
  const stack: string[] = []
  let root = ''
  while (at < text.length) {
    const open = text.indexOf('<', at)
    if (open < 0) {
      if (text.slice(at).trim() !== '') fail('xml', 'text after the root element')
      break
    }
    if (stack.length === 0 && text.slice(at, open).trim() !== '')
      fail('xml', 'text outside the root element')
    if (text.startsWith('<!--', open)) {
      const close = text.indexOf('-->', open + 4)
      if (close < 0 || text.slice(open + 4, close).includes('--')) fail('xml', 'bad comment')
      at = close + 3
      continue
    }
    if (text.startsWith('<!', open)) {
      at = text.indexOf('>', open) + 1
      continue
    }
    let end = open + 1
    let quote = ''
    for (; end < text.length; end += 1) {
      const char = text.charAt(end)
      if (quote) {
        if (char === quote) quote = ''
      } else if (char === '"' || char === "'") quote = char
      else if (char === '>') break
    }
    if (end >= text.length) fail('xml', 'unterminated tag')
    const tag = text.slice(open + 1, end)
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim()
      if (stack.pop() !== name) fail('xml', `mismatched </${name}>`)
    } else {
      if (!TAG.test(tag)) fail('xml', `bad tag <${tag.slice(0, 40)}>`)
      const name = (/^[A-Za-z_][\w:.-]*/.exec(tag) as RegExpExecArray)[0]
      if (stack.length === 0 && root === '') root = name
      if (!tag.endsWith('/') && !voids.has(name)) stack.push(name)
    }
    at = end + 1
  }
  if (stack.length > 0) fail('xml', `unclosed <${stack[stack.length - 1]}>`)
  return root
}

export function decodeSvg(buf: Buffer): Decoded {
  const text = buf.toString('utf8')
  if (!text.startsWith('<?xml')) fail('svg', 'no XML declaration')
  if (wellFormedMarkup(text) !== 'svg' || !text.includes('xmlns="http://www.w3.org/2000/svg"'))
    fail('svg', 'root is not an svg element')
  const width = /<svg[^>]*\swidth="(\d+)"/.exec(text)?.[1]
  const height = /<svg[^>]*\sheight="(\d+)"/.exec(text)?.[1]
  if (!width || !height) fail('svg', 'no pixel size')
  return { format: 'svg', width: Number(width), height: Number(height) }
}

export type Reader = (buf: Buffer) => Decoded

export const READERS: Record<string, Reader> = {
  png: decodePng,
  jpg: decodeJpeg,
  gif: (buf) => decodeGif(buf, buf.length < 400_000),
  bmp: decodeBmp,
  webp: decodeWebp,
  tiff: decodeTiff,
  svg: decodeSvg
}

/** Reads any raster or vector kind with the matching independent reader. */
export function decodeImage(kind: string, buf: Buffer): Decoded {
  const reader = READERS[kind]
  if (!reader) throw new Error(`no reader for ${kind}`)
  return reader(buf)
}
