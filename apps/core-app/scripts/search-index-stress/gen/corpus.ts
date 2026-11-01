import type { CorpusFile, CorpusManifest, PayloadSpec } from '../types'
import { SIZE_BYTES } from './dimensions'
import { COPY_SOURCE_DIR, CROWDED_DIRECTORIES, joinPath } from './placement'
import type { PathClaims, PrefixIndex } from './registry'
import { materializePayload } from './payload'

const CLUTTER_PER_CROWDED_DIR = 120
const CLUTTER_WORDS = [
  'notes',
  'draft',
  'scan',
  'photo',
  'meeting',
  'budget',
  'plan',
  'sketch',
  'menu',
  'travel',
  'poster',
  'cover',
  'agenda',
  'summary',
  'backup',
  'snapshot',
  'layout',
  'review',
  'thumb',
  'sample'
]
const CLUTTER_KINDS: ReadonlyArray<
  readonly [ext: string, kind: PayloadSpec['kind'], bytes: number]
> = [
  ['png', 'png', 700],
  ['txt', 'text', 600],
  ['md', 'text', 900],
  ['json', 'text', 500],
  ['png', 'png', 1100]
]

export const COPY_SOURCE_FORMATS = [
  'png',
  'jpg',
  'gif',
  'bmp',
  'webp',
  'tiff',
  'heic',
  'svg',
  'fake-image'
] as const
export const COPY_SOURCE_SIZES = ['tiny', 'small', 'medium', 'large'] as const
/** The 1 MiB copy sources are the only big seeded files, so they exist for the two common formats only. */
export const COPY_LARGE_FORMATS: ReadonlySet<string> = new Set(['png', 'jpg'])
export const COPY_SOURCE_EXT: Record<string, string> = {
  png: 'png',
  jpg: 'jpg',
  gif: 'gif',
  bmp: 'bmp',
  webp: 'webp',
  tiff: 'tiff',
  heic: 'heic',
  svg: 'svg',
  'fake-image': 'png'
}

export function copySourcePath(format: string, size: string): string {
  return `${COPY_SOURCE_DIR}/src-${format}-${size}.${COPY_SOURCE_EXT[format]}`
}

/** Collects the files and directories the app starts with; every file name is claimed and indexed for prefix tiering. */
export class CorpusBuilder {
  private readonly directories = new Set<string>()
  private readonly files: CorpusFile[] = []
  private bytes = 0

  constructor(
    private readonly claims: PathClaims,
    private readonly prefixes: PrefixIndex
  ) {}

  get fileCount(): number {
    return this.files.length
  }

  get totalBytes(): number {
    return this.bytes
  }

  addDirectory(path: string): void {
    const parts = path.split('/')
    for (let index = 1; index <= parts.length; index += 1) {
      const dir = parts.slice(0, index).join('/')
      if (!this.directories.has(dir)) {
        this.directories.add(dir)
        this.claims.claim(dir)
      }
    }
  }

  /** `claimed`: the caller already reserved the path and registered the name while choosing it. */
  addFile(file: CorpusFile, claimed = false): void {
    const slash = file.path.lastIndexOf('/')
    if (!claimed) {
      if (!this.claims.claim(file.path))
        throw new Error(`corpus path already claimed: ${file.path}`)
      this.prefixes.add(file.path.slice(slash + 1))
    }
    if (slash > 0) this.addDirectory(file.path.slice(0, slash))
    this.bytes += file.payload.bytes
    const text = file.text ?? (file.payload.kind === 'text' ? textExcerpt(file.payload) : undefined)
    this.files.push(text === undefined ? file : { ...file, text })
  }

  addCopySources(seed: number): void {
    COPY_SOURCE_FORMATS.forEach((format, formatIndex) => {
      COPY_SOURCE_SIZES.forEach((size, sizeIndex) => {
        if (size === 'large' && !COPY_LARGE_FORMATS.has(format)) return
        this.addFile({
          path: copySourcePath(format, size),
          payload: {
            kind: format,
            bytes: SIZE_BYTES[size] as number,
            seed: seed + formatIndex * 16 + sizeIndex
          }
        })
      })
    })
    this.addFile({
      path: `${COPY_SOURCE_DIR}/src-zero-byte.png`,
      payload: { kind: 'fake-image', bytes: 0, seed }
    })
  }

  addClutter(seed: number): void {
    CROWDED_DIRECTORIES.forEach((dir, dirIndex) => {
      this.addDirectory(dir)
      for (let index = 1; index <= CLUTTER_PER_CROWDED_DIR; index += 1) {
        const [ext, kind, bytes] = CLUTTER_KINDS[
          (index + dirIndex) % CLUTTER_KINDS.length
        ] as (typeof CLUTTER_KINDS)[number]
        const word = CLUTTER_WORDS[(index * 7 + dirIndex * 3) % CLUTTER_WORDS.length]
        const name = `${word}-${String(index).padStart(3, '0')}.${ext}`
        this.addFile({
          path: joinPath(dir, name),
          payload: { kind, bytes, seed: seed + dirIndex * 1000 + index, ext }
        })
      }
    })
  }

  build(): CorpusManifest {
    const dirs = [...this.directories].sort(
      (a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1)
    )
    return { directories: dirs, files: this.files }
  }
}

/** First line or so of a text payload, so content indexing has something to read. */
export function textExcerpt(payload: PayloadSpec): string {
  const bytes = materializePayload({ ...payload, bytes: Math.min(payload.bytes, 4096) })
  const text = bytes.subarray(0, 160).toString('latin1')
  const cut = text.lastIndexOf('\n')
  return (cut > 20 ? text.slice(0, cut) : text).trim()
}
