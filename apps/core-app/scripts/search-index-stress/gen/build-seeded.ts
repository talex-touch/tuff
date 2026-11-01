import type { PayloadSpec } from '../types'
import { PRESENT_DEADLINE_MS } from './checks'
import { isGuaranteedFormat, type Draft, type GenContext } from './context'
import type { NameParts } from './names'

const LOOK_ALIKE_EXTENSIONS: ReadonlyArray<
  readonly [ext: string, kind: PayloadSpec['kind'], bytes: number]
> = [
  ['txt', 'text', 600],
  ['md', 'text', 800],
  ['png', 'png', 900],
  ['pdf', 'binary', 1500],
  ['json', 'text', 500]
]
const LOOK_ALIKE_WORDS = ['notes', 'copy', 'draft', 'old', 'scan', 'export', 'final']

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'log',
  'csv',
  'json',
  'xml',
  'yaml',
  'toml',
  'ini',
  'conf',
  'tex',
  'rst',
  'org',
  'sql',
  'rtf',
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
])
const TEXT_BYTES = [512, 1024, 2048, 4096, 8192]
const BINARY_BYTES = [1024, 2048, 4096, 8192]

/** A file that shares the first five characters of the token but is not the target. */
export function addLookAlike(ctx: GenContext, parts: NameParts, dir: string): void {
  if (parts.script !== 'latin' || !ctx.rng.chance(0.2)) return
  const [ext, kind, bytes] = LOOK_ALIKE_EXTENSIONS[
    parts.serial % LOOK_ALIKE_EXTENSIONS.length
  ] as (typeof LOOK_ALIKE_EXTENSIONS)[number]
  const word = LOOK_ALIKE_WORDS[parts.serial % LOOK_ALIKE_WORDS.length]
  const name = `${parts.token.slice(0, 5)}xx-${word}-${parts.serial}.${ext}`
  const path = ctx.reserve(dir, name)
  ctx.corpus.addFile({ path, payload: { kind, bytes, seed: ctx.payloadSeed(), ext } }, true)
}

export function buildSearchImage(ctx: GenContext): Draft | null {
  const dims = ctx.picker.pick('search-image')
  if (!dims) return null
  const parts = ctx.takeParts(dims)
  const placement = ctx.pool.resolve(dims.placement as string, parts.token)
  for (const dir of placement.create) ctx.corpus.addDirectory(dir)
  const path = ctx.reserve(placement.dir, parts.name)
  ctx.corpus.addFile(
    { path, payload: ctx.imagePayload(dims.format as string, dims.size as string) },
    true
  )
  addLookAlike(ctx, parts, placement.dir)
  const guaranteed = isGuaranteedFormat(dims.format as string)
  return {
    cls: 'search-image',
    dims,
    steps: [],
    checks: () => [
      ctx.present(parts, dims.query as string, path, guaranteed, PRESENT_DEADLINE_MS.seeded)
    ]
  }
}

function filePayload(ctx: GenContext, ext: string, serial: number): PayloadSpec {
  if (TEXT_EXTENSIONS.has(ext))
    return {
      kind: 'text',
      bytes: TEXT_BYTES[serial % TEXT_BYTES.length] as number,
      seed: ctx.payloadSeed(),
      ext
    }
  return {
    kind: 'binary',
    bytes: BINARY_BYTES[serial % BINARY_BYTES.length] as number,
    seed: ctx.payloadSeed(),
    ext
  }
}

export function buildSearchFile(ctx: GenContext): Draft | null {
  const dims = ctx.picker.pick('search-file')
  if (!dims) return null
  const parts = ctx.takeParts(dims)
  const placement = ctx.pool.resolve(dims.placement as string, parts.token)
  for (const dir of placement.create) ctx.corpus.addDirectory(dir)
  const path = ctx.reserve(placement.dir, parts.name)
  ctx.corpus.addFile({ path, payload: filePayload(ctx, parts.baseExt, parts.serial) }, true)
  addLookAlike(ctx, parts, placement.dir)
  return {
    cls: 'search-file',
    dims,
    steps: [],
    checks: () => [ctx.present(parts, dims.query as string, path, true, PRESENT_DEADLINE_MS.seeded)]
  }
}
