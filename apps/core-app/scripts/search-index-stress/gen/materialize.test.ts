import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { join, sep } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { CorpusManifest, PayloadSpec } from '../types'
import { materializeCorpus, resolveInsideRoot } from './materialize'
import { materializePayload } from './payload'
import { scratchDir, smokePlan } from './test-fixtures'

const PNG: PayloadSpec = { kind: 'png', bytes: 2048, seed: 3 }
const made: string[] = []
const OLD = new Date(1_000_000_000_000)

/** A fresh scratch directory with an empty `root` inside it; the parent shows whether anything escaped. */
function fresh(): { parent: string; root: string } {
  const parent = scratchDir('gen-materialize-')
  made.push(parent)
  return { parent, root: join(parent, 'root') }
}

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

function walk(root: string): { directories: string[]; files: string[] } {
  const directories: string[] = []
  const files: string[] = []
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    const full = join(entry.parentPath, entry.name)
    const relative = full
      .slice(root.length + 1)
      .split(sep)
      .join('/')
    if (entry.isDirectory()) directories.push(relative)
    else files.push(relative)
  }
  return { directories: directories.sort(), files: files.sort() }
}

function trySymlink(target: string, path: string): boolean {
  try {
    symlinkSync(target, path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return false
    throw error
  }
}

describe('materializeCorpus', () => {
  const corpus = smokePlan().corpus

  it('creates exactly the listed directories and files, with the bytes materializePayload gives', async () => {
    const { parent, root } = fresh()
    const result = await materializeCorpus(root, corpus)
    expect(result.files).toBe(corpus.files.length)
    expect(result.bytes).toBe(corpus.files.reduce((sum, file) => sum + file.payload.bytes, 0))
    const found = walk(root)
    expect(found.directories).toEqual([...corpus.directories].sort())
    expect(found.files).toEqual(corpus.files.map((file) => file.path).sort())
    for (const file of corpus.files) {
      expect(
        Buffer.compare(readFileSync(join(root, file.path)), materializePayload(file.payload)),
        file.path
      ).toBe(0)
    }
    expect(readdirSync(parent)).toEqual(['root'])
  })

  it('a second run leaves matching files untouched and repairs damaged, truncated and missing ones', async () => {
    const { root } = fresh()
    await materializeCorpus(root, corpus)
    for (const file of corpus.files) utimesSync(join(root, file.path), OLD, OLD)
    const victims = corpus.files.filter((file) => file.payload.bytes > 600).slice(0, 3)
    const [flipped, truncated, deleted] = victims as [
      (typeof victims)[number],
      (typeof victims)[number],
      (typeof victims)[number]
    ]
    const bytes = readFileSync(join(root, flipped.path))
    bytes[10] = (bytes[10] as number) ^ 0xff
    writeFileSync(join(root, flipped.path), bytes)
    writeFileSync(join(root, truncated.path), Buffer.alloc(5))
    rmSync(join(root, deleted.path))

    const again = await materializeCorpus(root, corpus)
    expect(again.files).toBe(corpus.files.length)
    for (const file of victims)
      expect(
        Buffer.compare(readFileSync(join(root, file.path)), materializePayload(file.payload)),
        file.path
      ).toBe(0)
    const rewritten = corpus.files
      .filter((file) => statSync(join(root, file.path)).mtimeMs !== OLD.getTime())
      .map((file) => file.path)
    expect(rewritten.sort()).toEqual(victims.map((file) => file.path).sort())
  })

  it('works when the root does not exist yet and when it already holds unrelated files', async () => {
    const { root } = fresh()
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'unrelated.txt'), 'keep me')
    await materializeCorpus(root, {
      directories: ['a', 'a/b'],
      files: [{ path: 'a/b/x.png', payload: PNG }]
    })
    expect(readFileSync(join(root, 'unrelated.txt'), 'utf8')).toBe('keep me')
    expect(existsSync(join(root, 'a', 'b', 'x.png'))).toBe(true)
  })

  it('keeps names that only differ in normalisation or case as the manifest gives them', async () => {
    const { root } = fresh()
    const name = 'Caf\u00e9 \u5c71\u6c34.png'
    await materializeCorpus(root, {
      directories: ['d\u00e9j\u00e0 vu'],
      files: [{ path: `d\u00e9j\u00e0 vu/${name}`, payload: PNG }]
    })
    const [entry] = readdirSync(join(root, 'd\u00e9j\u00e0 vu'))
    expect((entry as string).normalize('NFC')).toBe(name)
  })
})

describe('materializeCorpus refuses to leave the root', () => {
  const rejects = async (manifest: CorpusManifest): Promise<{ parent: string; root: string }> => {
    const place = fresh()
    await expect(materializeCorpus(place.root, manifest)).rejects.toThrow(/refusing corpus path/)
    return place
  }

  it.each([
    ['dot-dot file', { directories: [], files: [{ path: '../escape.png', payload: PNG }] }],
    [
      'nested dot-dot file',
      { directories: ['a'], files: [{ path: 'a/../../escape.png', payload: PNG }] }
    ],
    [
      'absolute file',
      { directories: [], files: [{ path: '/tmp/gen-materialize-absolute.png', payload: PNG }] }
    ],
    ['NUL in file', { directories: [], files: [{ path: 'a\0b.png', payload: PNG }] }],
    ['dot-dot directory', { directories: ['../outside'], files: [] }],
    ['absolute directory', { directories: ['/tmp/gen-materialize-absolute-dir'], files: [] }],
    ['backslash', { directories: [], files: [{ path: '..\\escape.png', payload: PNG }] }]
  ] as Array<[string, CorpusManifest]>)('%s', async (_name, manifest) => {
    const { parent, root } = await rejects(manifest)
    expect(readdirSync(parent)).toEqual([])
    expect(existsSync(root)).toBe(false)
    expect(existsSync('/tmp/gen-materialize-absolute.png')).toBe(false)
    expect(existsSync('/tmp/gen-materialize-absolute-dir')).toBe(false)
  })

  it('validates every path before it creates anything', async () => {
    const { root } = fresh()
    await expect(
      materializeCorpus(root, {
        directories: ['fine'],
        files: [
          { path: 'fine/ok.png', payload: PNG },
          { path: '../bad.png', payload: PNG }
        ]
      })
    ).rejects.toThrow()
    expect(existsSync(join(root, 'fine'))).toBe(false)
  })

  it('refuses a planted symlink on the way to a file or a directory, and writes nothing through it', async ({
    skip
  }) => {
    const { parent, root } = fresh()
    const outside = join(parent, 'outside')
    mkdirSync(root, { recursive: true })
    mkdirSync(outside)
    if (!trySymlink(outside, join(root, 'linkdir'))) skip()
    await expect(
      materializeCorpus(root, {
        directories: [],
        files: [{ path: 'linkdir/pwn.png', payload: PNG }]
      })
    ).rejects.toThrow(/symlink/)
    await expect(
      materializeCorpus(root, { directories: ['linkdir/sub'], files: [] })
    ).rejects.toThrow(/symlink/)
    expect(readdirSync(outside)).toEqual([])
  })

  it('refuses to write through a symlinked file and leaves its target alone', async ({ skip }) => {
    const { parent, root } = fresh()
    const outside = join(parent, 'outside.png')
    mkdirSync(root, { recursive: true })
    writeFileSync(outside, 'precious')
    if (!trySymlink(outside, join(root, 'leaf.png'))) skip()
    await expect(
      materializeCorpus(root, { directories: [], files: [{ path: 'leaf.png', payload: PNG }] })
    ).rejects.toThrow(/symlink/)
    expect(readFileSync(outside, 'utf8')).toBe('precious')
    expect(lstatSync(join(root, 'leaf.png')).isSymbolicLink()).toBe(true)
  })

  it('follows a symlinked root itself (the caller chose it) but not links inside it', async ({
    skip
  }) => {
    const { parent } = fresh()
    const real = join(parent, 'real-root')
    const alias = join(parent, 'alias-root')
    mkdirSync(real)
    if (!trySymlink(real, alias)) skip()
    await materializeCorpus(alias, {
      directories: ['d'],
      files: [{ path: 'd/x.png', payload: PNG }]
    })
    expect(existsSync(join(real, 'd', 'x.png'))).toBe(true)
  })
})

describe('resolveInsideRoot', () => {
  const root = '/Users/Shared/tuff-stress'

  it('joins corpus paths below the root, whatever the characters in them', () => {
    expect(resolveInsideRoot(root, 'a.png')).toBe(`${root}/a.png`)
    expect(resolveInsideRoot(root, 'My Photos/Summer Trip/IMG 1.png')).toBe(
      `${root}/My Photos/Summer Trip/IMG 1.png`
    )
    expect(resolveInsideRoot(root, '\u76f8\u518c/\u98ce\u666f\u7167/\u5c71.png')).toBe(
      `${root}/\u76f8\u518c/\u98ce\u666f\u7167/\u5c71.png`
    )
    expect(resolveInsideRoot(`${root}/`, 'a/b.png')).toBe(`${root}/a/b.png`)
    expect(resolveInsideRoot('/', 'a/b.png')).toBe('/a/b.png')
  })

  it.each([
    '..',
    '../x.png',
    'a/../../x.png',
    'a/..',
    '/etc/passwd',
    'C:/x.png',
    'a\0b',
    'a//b.png',
    '',
    'a\\b.png',
    './a.png'
  ])('refuses %j', (path) => {
    expect(() => resolveInsideRoot(root, path)).toThrow(/refusing corpus path/)
  })

  it('refuses a name that makes the whole path too long for the filesystem', () => {
    expect(() => resolveInsideRoot(root, `${'a'.repeat(256)}.png`)).toThrow(/255 bytes/)
  })
})
