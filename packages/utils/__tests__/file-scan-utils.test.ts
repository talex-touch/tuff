import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createScanOptions, isIndexableFile, scanDirectory } from '../common/file-scan-utils'

// Disable the system/dev/cache/photos path heuristics so the test only exercises
// traversal + dir-blacklist + indexable-file logic. NOTE: temp dirs are rooted
// under the package cwd rather than os.tmpdir(), because on macOS tmpdir is
// /var/folders/... and the ungated path-segment blacklist in isIndexableFile
// rejects anything under a "var" segment regardless of these flags.
const scanOpts = createScanOptions({
  enableSystemPathFilter: false,
  enableDevPathFilter: false,
  enableCachePathFilter: false,
  enablePhotosLibraryFilter: false,
})

let root: string

beforeAll(async () => {
  root = await mkdtemp(path.join(process.cwd(), 'scan-utils-'))
  // root/a.txt
  // root/sub/b.txt
  // root/sub/deep/c.txt
  // root/excluded/d.txt
  // root/node_modules/ignored.txt   (dir is blacklisted -> skipped)
  await writeFile(path.join(root, 'a.txt'), 'a')
  await mkdir(path.join(root, 'sub', 'deep'), { recursive: true })
  await writeFile(path.join(root, 'sub', 'b.txt'), 'b')
  await writeFile(path.join(root, 'sub', 'deep', 'c.txt'), 'c')
  await mkdir(path.join(root, 'excluded'), { recursive: true })
  await writeFile(path.join(root, 'excluded', 'd.txt'), 'd')
  await mkdir(path.join(root, 'node_modules'), { recursive: true })
  await writeFile(path.join(root, 'node_modules', 'ignored.txt'), 'x')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('scanDirectory', () => {
  it('recursively collects indexable files and skips blacklisted dirs', async () => {
    const files = await scanDirectory(root, scanOpts)
    const names = files.map(f => f.name).sort()
    // a/b/c/d are found across nesting; node_modules/ignored.txt is skipped
    expect(names).toEqual(['a.txt', 'b.txt', 'c.txt', 'd.txt'])
  })

  it('honors excludePaths for subdirectories', async () => {
    const excludePaths = new Set([path.join(root, 'excluded')])
    const files = await scanDirectory(root, scanOpts, excludePaths)
    const names = files.map(f => f.name).sort()
    expect(names).toEqual(['a.txt', 'b.txt', 'c.txt'])
  })

  it('returns complete ScannedFileInfo metadata', async () => {
    const files = await scanDirectory(root, scanOpts)
    const a = files.find(f => f.name === 'a.txt')
    expect(a).toBeDefined()
    expect(a!.path).toBe(path.join(root, 'a.txt'))
    expect(a!.extension).toBe('.txt')
    expect(a!.size).toBe(1)
    expect(a!.ctime).toBeInstanceOf(Date)
    expect(a!.mtime).toBeInstanceOf(Date)
  })

  it('finds every file in a directory larger than the stat-concurrency limit', async () => {
    // Exercises the bounded-concurrency stat pool (limit is 32) to make sure no
    // entries are dropped or double-counted when stats run in parallel.
    const wideDir = await mkdtemp(path.join(process.cwd(), 'scan-utils-wide-'))
    try {
      const count = 100
      await Promise.all(
        Array.from({ length: count }, (_, i) =>
          writeFile(path.join(wideDir, `file-${i}.txt`), String(i))),
      )
      const files = await scanDirectory(wideDir, scanOpts)
      expect(files).toHaveLength(count)
      expect(new Set(files.map(f => f.name)).size).toBe(count)
    }
    finally {
      await rm(wideDir, { recursive: true, force: true })
    }
  })
})

describe('media-library bundle exclusion', () => {
  it('excludes files inside a .photoslibrary bundle, even with lowercase internal dirs', () => {
    const base = '/Users/x/Pictures/Photos Library.photoslibrary'
    // lowercase resources/derivatives/masters is exactly the shape that the old
    // case-sensitive, default-allow Photos filter let through.
    expect(isIndexableFile(`${base}/resources/derivatives/masters/UUID_4_5005_c.jpeg`, '.jpeg', 'UUID_4_5005_c.jpeg', scanOpts)).toBe(false)
    expect(isIndexableFile(`${base}/resources/caches/compute/UUID_5_5_c_14.jpeg`, '.jpeg', 'UUID_5_5_c_14.jpeg', scanOpts)).toBe(false)
  })

  it('excludes other macOS media-library bundles', () => {
    expect(isIndexableFile('/Users/x/Movies/Foo.tvlibrary/clip.mov', '.mov', 'clip.mov', scanOpts)).toBe(false)
    expect(isIndexableFile('/Users/x/Music/Bar.musiclibrary/track.m4a', '.m4a', 'track.m4a', scanOpts)).toBe(false)
  })

  it('does not over-match a normal file whose name merely contains the suffix', () => {
    expect(isIndexableFile('/Users/x/Documents/photoslibrary-notes.txt', '.txt', 'photoslibrary-notes.txt', scanOpts)).toBe(true)
  })

  it('scanDirectory skips a .photoslibrary subtree entirely', async () => {
    const dir = await mkdtemp(path.join(process.cwd(), 'scan-utils-bundle-'))
    try {
      await writeFile(path.join(dir, 'real.txt'), 'r')
      await mkdir(path.join(dir, 'My Photos.photoslibrary', 'resources', 'derivatives'), { recursive: true })
      await writeFile(path.join(dir, 'My Photos.photoslibrary', 'resources', 'derivatives', 'UUID.jpeg'), 'x')
      const files = await scanDirectory(dir, scanOpts)
      expect(files.map(f => f.name).sort()).toEqual(['real.txt'])
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
