import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { PayloadKind, PayloadSpec } from '../types'
import { PIXEL_SIZES, SIZE_BYTES } from './dimensions'
import { MAX_PAYLOAD_BYTES, MAX_PIXEL_SIDE, materializePayload } from './payload'
import { HAS_SIPS, scratchDir } from './test-fixtures'
import {
  READERS,
  boxesOf,
  decodeHeic,
  decodePng,
  decodeSvg,
  wellFormedMarkup,
  type Decoded
} from './test-decoders'

const RASTER = ['png', 'jpg', 'gif', 'bmp', 'webp', 'tiff'] as const
/** GIF and WebP pad in whole units and may overshoot by a few bytes; every other kind is exact. */
const overshoot = (kind: string): number =>
  kind === 'gif' || kind === 'webp' || kind === 'heic' ? 8 : 0
const readerOf = (kind: string): ((buf: Buffer) => Decoded) =>
  READERS[kind] as (buf: Buffer) => Decoded
const make = (
  kind: PayloadKind,
  bytes: number,
  seed = 1,
  extra: Partial<PayloadSpec> = {}
): Buffer => materializePayload({ kind, bytes, seed, ...extra })

describe('raster payloads decode with independent readers', () => {
  const sizes = [2048, 24 * 1024, 200 * 1024]
  for (const kind of RASTER) {
    it(`${kind}: valid structure, honoured size, requested dimensions`, () => {
      for (const bytes of sizes) {
        for (const seed of [1, 2, 3]) {
          const buf = make(kind, bytes, seed)
          const decoded = readerOf(kind)(buf)
          expect(decoded.width).toBeGreaterThan(0)
          expect(decoded.height).toBeGreaterThan(0)
          expect(buf.length - bytes).toBeGreaterThanOrEqual(0)
          expect(buf.length - bytes).toBeLessThanOrEqual(overshoot(kind))
        }
      }
    })

    it(`${kind}: an explicit pixel size wins and the file still reaches its size`, () => {
      const buf = make(kind, 40_000, 9, { width: 300, height: 40 })
      expect(readerOf(kind)(buf)).toMatchObject({ width: 300, height: 40 })
      expect(buf.length).toBeGreaterThanOrEqual(40_000)
      expect(buf.length - 40_000).toBeLessThanOrEqual(overshoot(kind))
    })
  }

  it('large, xlarge and wide payloads keep their size and decode', () => {
    for (const kind of RASTER) {
      for (const size of ['large', 'xlarge'] as const) {
        const buf = make(kind, SIZE_BYTES[size] as number, 5)
        expect(readerOf(kind)(buf).width).toBeGreaterThan(0)
        expect(buf.length - (SIZE_BYTES[size] as number)).toBeLessThanOrEqual(overshoot(kind))
      }
    }
  })

  it('wide strips are 12,288 x 64 pixels at exactly the declared size', () => {
    const { width, height } = PIXEL_SIZES.wide as { width: number; height: number }
    expect(width).toBeGreaterThanOrEqual(10_000)
    for (const kind of RASTER) {
      const buf = make(kind, SIZE_BYTES.wide as number, 7, { width, height })
      expect(buf.length).toBe(SIZE_BYTES.wide)
      expect(readerOf(kind)(buf)).toMatchObject({ width, height })
    }
  })

  it('png chunks carry valid CRCs and an inflatable raster', () => {
    const buf = make('png', 24 * 1024, 4)
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(decodePng(buf).format).toBe('png')
    const damaged = Buffer.from(buf)
    damaged[40] = (damaged[40] as number) ^ 0xff
    expect(() => decodePng(damaged)).toThrow()
  })

  it('the readers reject damaged files, so a pass means something', () => {
    for (const kind of RASTER) {
      const buf = make(kind, 24 * 1024, 4)
      expect(() => readerOf(kind)(buf.subarray(0, 20)), `${kind} cut inside the header`).toThrow()
      const flipped = Buffer.from(buf)
      flipped[0] = (flipped[0] as number) ^ 0xff
      expect(() => readerOf(kind)(flipped), `${kind} first byte`).toThrow()
    }
    const jpeg = make('jpg', 24 * 1024, 4)
    expect(() => readerOf('jpg')(jpeg.subarray(0, jpeg.length - 2))).toThrow()
  })
})

describe('heic and svg', () => {
  it('heic is an ISO box file whose top-level boxes cover it exactly', () => {
    for (const bytes of [2048, 24 * 1024, 200 * 1024]) {
      const buf = make('heic', bytes, 3)
      const info = decodeHeic(buf)
      expect(info.boxes[0]).toBe('ftyp')
      expect(buf.length - bytes).toBeGreaterThanOrEqual(0)
      expect(buf.length - bytes).toBeLessThanOrEqual(8)
      expect(info.boxes).toContain('free')
      expect(boxesOf(buf).reduce((sum, box) => sum + box.size, 0)).toBe(buf.length)
    }
  })

  it('svg is well-formed XML of exact size with a pixel size', () => {
    for (const bytes of [2048, 24 * 1024, 200 * 1024]) {
      const buf = make('svg', bytes, 6)
      expect(buf.length).toBe(bytes)
      expect(decodeSvg(buf)).toMatchObject({ width: 640, height: 480 })
    }
    expect(decodeSvg(make('svg', 4096, 6, { width: 321, height: 123 }))).toMatchObject({
      width: 321,
      height: 123
    })
  })
})

describe('fake-image is not an image', () => {
  it('every variant has the requested length and no reader accepts it', () => {
    for (const seed of [3, 4, 5, 6, 7, 8, 100, 101, 102]) {
      for (const bytes of [64, 2048, 24 * 1024]) {
        const buf = make('fake-image', bytes, seed)
        expect(buf.length).toBe(bytes)
        for (const [kind, reader] of Object.entries(READERS))
          expect(() => reader(buf), `seed ${seed} read as ${kind}`).toThrow()
        expect(() => decodeHeic(buf)).toThrow()
      }
    }
  })

  it('the three variants are noise, text, and a PNG signature over noise', () => {
    expect(make('fake-image', 512, 3).toString('latin1', 0, 14)).not.toBe('not an image: ')
    expect(make('fake-image', 512, 4).toString('latin1', 0, 14)).toBe('not an image: ')
    expect(make('fake-image', 512, 5).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(make('fake-image', 0, 5).length).toBe(0)
  })
})

describe('text payloads', () => {
  const extensions = [
    'txt',
    'md',
    'log',
    'csv',
    'json',
    'xml',
    'html',
    'rtf',
    'yaml',
    'toml',
    'ini',
    'conf',
    'tex',
    'rst',
    'org',
    'sql',
    'js',
    'ts',
    'tsx',
    'jsx',
    'py',
    'go',
    'rs',
    'java',
    'swift',
    'sh',
    'c',
    'cpp',
    'rb',
    'php'
  ]
  const COMMENTS: Record<string, string> = {
    py: '# ',
    sh: '# ',
    rb: '# ',
    yaml: '# ',
    toml: '# ',
    conf: '# ',
    org: '# ',
    ini: '; ',
    sql: '-- ',
    tex: '% ',
    rst: '.. ',
    js: '// ',
    ts: '// ',
    jsx: '// ',
    tsx: '// ',
    java: '// ',
    swift: '// ',
    go: '// ',
    rs: '// ',
    c: '// ',
    cpp: '// ',
    php: '// '
  }

  it('is ASCII with exactly the requested length from 98 bytes up', () => {
    for (const ext of extensions) {
      for (const bytes of [98, 99, 128, 255, 600, 1000, 4096, 8192]) {
        for (const seed of [1, 2, 3]) {
          const buf = make('text', bytes, seed, { ext })
          expect(buf.length, `${ext} ${bytes}`).toBe(bytes)
          expect(buf.every((byte) => byte < 0x80)).toBe(true)
        }
      }
    }
  })

  it('never throws, whatever the size (xml and html once crashed below their frame size)', () => {
    for (const ext of ['xml', 'html', 'rtf', 'json', 'csv', 'py', 'txt']) {
      for (let bytes = 0; bytes <= 300; bytes += 1)
        expect(() => make('text', bytes, bytes + 1, { ext })).not.toThrow()
    }
  })

  it('carries content a parser for its extension accepts', () => {
    for (const bytes of [128, 700, 5000]) {
      const text = (ext: string): string => make('text', bytes, 11, { ext }).toString('latin1')
      expect(JSON.parse(text('json')).seed).toBe(11)
      expect(wellFormedMarkup(text('xml'))).toBe('root')
      expect(wellFormedMarkup(text('html'), new Set(['meta']))).toBe('html')
      expect(text('rtf').startsWith('{\\rtf1')).toBe(true)
      const rtf = text('rtf')
      expect(rtf.split('{').length).toBe(rtf.split('}').length)
      for (const line of text('csv')
        .split('\n')
        .filter((row) => row !== ''))
        expect(line.split(',').length).toBe(3)
      for (const [ext, marker] of Object.entries(COMMENTS)) {
        for (const line of text(ext)
          .split('\n')
          .filter((row) => row !== ''))
          expect(line.startsWith(marker), `${ext}: ${line.slice(0, 20)}`).toBe(true)
      }
    }
  })
})

describe('binary payloads', () => {
  it('pdf has an exact cross-reference table', () => {
    for (const bytes of [1024, 2048, 8192]) {
      const text = make('binary', bytes, 5, { ext: 'pdf' }).toString('latin1')
      expect(text.length).toBe(bytes)
      expect(text.startsWith('%PDF-1.4\n')).toBe(true)
      expect(text.endsWith('%%EOF\n')).toBe(true)
      const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)?.[1])
      expect(text.slice(start, start + 5)).toBe('xref\n')
      const entries = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) =>
        Number(match[1])
      )
      expect(entries).toHaveLength(3)
      entries.forEach((offset, index) =>
        expect(text.slice(offset, offset + 7)).toBe(`${index + 1} 0 obj`)
      )
    }
  })

  it('zip-based documents are an empty archive whose comment carries the padding', () => {
    for (const ext of ['docx', 'xlsx', 'pptx', 'odt', 'epub', 'zip']) {
      for (const bytes of [22, 23, 1024, 24_576]) {
        const buf = make('binary', bytes, 2, { ext })
        expect(buf.length).toBe(bytes)
        expect(buf.readUInt32LE(0)).toBe(0x06054b50)
        expect(buf.readUInt16LE(20)).toBe(bytes - 22)
      }
    }
  })

  it('every other extension is noise of exactly the requested length', () => {
    for (const ext of ['mp3', 'mp4', '7z', 'psd', 'sketch'])
      expect(make('binary', 5000, 2, { ext }).length).toBe(5000)
  })
})

describe('determinism and limits', () => {
  const kinds: PayloadKind[] = [
    'png',
    'jpg',
    'gif',
    'bmp',
    'webp',
    'tiff',
    'heic',
    'svg',
    'fake-image',
    'text',
    'binary'
  ]

  it('equal specs give identical bytes, different seeds do not', () => {
    for (const kind of kinds) {
      const spec: PayloadSpec = { kind, bytes: 24 * 1024, seed: 6 }
      expect(materializePayload(spec).equals(materializePayload({ ...spec }))).toBe(true)
      expect(materializePayload(spec).equals(materializePayload({ ...spec, seed: 12 }))).toBe(false)
    }
  })

  it('the extension changes text and binary content', () => {
    expect(make('text', 600, 1, { ext: 'json' }).equals(make('text', 600, 1, { ext: 'txt' }))).toBe(
      false
    )
    expect(
      make('binary', 600, 1, { ext: 'pdf' }).equals(make('binary', 600, 1, { ext: 'mp3' }))
    ).toBe(false)
  })

  it('rejects specs outside the documented ranges', () => {
    expect(() => make('png', -1)).toThrow(RangeError)
    expect(() => make('png', 1.5)).toThrow(RangeError)
    expect(() => make('png', Number.NaN)).toThrow(RangeError)
    expect(() => make('png', MAX_PAYLOAD_BYTES + 1)).toThrow(RangeError)
    expect(() => make('png', 1000, 1.5)).toThrow(RangeError)
    expect(() => make('png', 1000, 1, { width: 0, height: 10 })).toThrow(RangeError)
    expect(() => make('png', 1000, 1, { width: MAX_PIXEL_SIDE + 1, height: 10 })).toThrow(
      RangeError
    )
  })

  it('empty payloads are empty files', () => {
    for (const kind of kinds)
      if (kind === 'fake-image' || kind === 'text' || kind === 'binary')
        expect(make(kind, 0).length).toBe(0)
  })
})

describe.skipIf(!HAS_SIPS)(
  'macOS sips agrees (an extra check; the readers above are the primary ones)',
  () => {
    const dir = HAS_SIPS ? scratchDir('gen-sips-') : ''
    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true })
    })
    const pixels = (file: string): { width: string; height: string } => {
      const out = execFileSync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], {
        encoding: 'utf8'
      })
      return {
        width: /pixelWidth: (\S+)/.exec(out)?.[1] ?? '',
        height: /pixelHeight: (\S+)/.exec(out)?.[1] ?? ''
      }
    }

    it('reports the pixel size the readers found', () => {
      for (const kind of [...RASTER, 'heic'] as const) {
        const buf = make(kind, 24 * 1024, 8)
        const file = join(dir, `real.${kind}`)
        writeFileSync(file, buf)
        const mine = kind === 'heic' ? { width: 16, height: 16 } : readerOf(kind)(buf)
        expect(pixels(file), kind).toEqual({
          width: String(mine.width),
          height: String(mine.height)
        })
      }
    })

    it('cannot decode fake images', () => {
      for (const seed of [3, 4, 5]) {
        const file = join(dir, `fake-${seed}.png`)
        writeFileSync(file, make('fake-image', 2048, seed))
        expect(pixels(file)).toEqual({ width: '<nil>', height: '<nil>' })
      }
    })

    it('reads a 12,288-pixel strip', () => {
      const file = join(dir, 'wide.jpg')
      writeFileSync(
        file,
        make(
          'jpg',
          SIZE_BYTES.wide as number,
          2,
          PIXEL_SIZES.wide as { width: number; height: number }
        )
      )
      expect(pixels(file)).toEqual({ width: '12288', height: '64' })
    })
  }
)
