import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  CONTEXT_DEPENDENT_BLACKLISTED_DIRS,
  PLATFORM
} from '@talex-touch/utils/common/file-scan-constants'
import {
  NativeScanPolicy,
  buildNativeScanFilterOptions,
  hasExcludedPathSegment,
  isSearchableNativeEntry,
  resolveRelativeSearchPath,
  resolveWatchRootBase
} from './native-scan-policy'

describe('native-scan-policy', () => {
  it('never leaks CONTEXT_DEPENDENT_BLACKLISTED_DIRS or macOS system names into excludeNames', () => {
    const home = os.homedir()
    const options = buildNativeScanFilterOptions([home])
    const excludeSet = new Set(options.excludeNames?.map((name) => name.toLowerCase()))

    for (const ctxDir of CONTEXT_DEPENDENT_BLACKLISTED_DIRS) {
      expect(excludeSet.has(ctxDir.toLowerCase())).toBe(false)
    }

    expect(excludeSet.has('library')).toBe(false)
    expect(excludeSet.has('dev')).toBe(false)
    expect(excludeSet.has('opt')).toBe(false)
    expect(excludeSet.has('var')).toBe(false)
    expect(excludeSet.has('etc')).toBe(false)
    expect(excludeSet.has('node_modules')).toBe(true)
    expect(excludeSet.has('.git')).toBe(true)
    expect(options.contextDependentNames).toEqual(
      expect.arrayContaining(Array.from(CONTEXT_DEPENDENT_BLACKLISTED_DIRS))
    )
    expect(options.projectMarkers).toEqual(
      expect.arrayContaining(['package.json', 'Cargo.toml', 'Makefile'])
    )
    expect(options.excludeDirSuffixes).toContain('.photoslibrary')
    expect(options.excludeHidden).toBe(true)
  })

  it('handles ~/Library and iCloud Drive allowPathPrefixes and keeps /var test roots scanable', () => {
    if (!PLATFORM.IS_MACOS) return
    const home = os.homedir()
    const icloud = path.join(home, 'Library', 'Mobile Documents')
    const homeOnly = buildNativeScanFilterOptions([home])
    expect(homeOnly.excludePathPrefixes).toContain(path.join(home, 'Library'))
    expect(homeOnly.excludePathPrefixes).toContain(path.join(home, 'go', 'pkg'))
    expect(homeOnly.excludePathPrefixes).toContain(path.join(home, 'OrbStack'))
    expect(homeOnly.allowPathPrefixes).toEqual([])

    const withICloud = buildNativeScanFilterOptions([home, icloud])
    expect(withICloud.allowPathPrefixes).toContain(icloud)

    const tmpWatch = buildNativeScanFilterOptions(['/var/folders/demo/watch'])
    expect(tmpWatch.excludePathPrefixes).not.toContain('/var')
  })

  it('resolves deepest matching watch root and relative search paths cleanly', () => {
    const roots = ['/Users/demo', '/Users/demo/Library/Mobile Documents']
    expect(resolveWatchRootBase('/Users/demo/Library/Mobile Documents/Notes/plan.md', roots)).toBe(
      '/Users/demo/Library/Mobile Documents'
    )
    expect(
      resolveRelativeSearchPath('/Users/demo/Library/Mobile Documents/Notes/plan.md', roots)
    ).toBe('/Notes/plan.md')
    expect(resolveRelativeSearchPath('/Users/demo/Documents/notes.md', roots)).toBe(
      '/Documents/notes.md'
    )
  })

  it('filters bundles, hidden dirs, and dev trees case-insensitively while keeping user dev/Library folders', () => {
    const roots = ['/Users/demo']
    expect(hasExcludedPathSegment('/Users/demo/NODE_MODULES/pkg/a.js', roots)).toBe(true)
    expect(hasExcludedPathSegment('/Users/demo/Pics.photoslibrary/uuid.jpg', roots)).toBe(true)
    expect(hasExcludedPathSegment('/Users/demo/.cache/font.bin', roots)).toBe(true)

    expect(
      isSearchableNativeEntry('/Users/demo/Projects/foo/dev/index.ts', 'index.ts', false, roots)
    ).toBe(true)
    expect(
      isSearchableNativeEntry('/Users/demo/Documents/Library/notes.md', 'notes.md', false, roots)
    ).toBe(true)
    expect(
      isSearchableNativeEntry('/Users/demo/Documents/build/roadmap.md', 'roadmap.md', false, roots)
    ).toBe(true)
    expect(
      isSearchableNativeEntry('/Users/demo/Documents/.DS_Store', '.DS_Store', false, roots)
    ).toBe(false)
    expect(
      isSearchableNativeEntry(
        '/Users/demo/Documents/cache.sqlite-wal',
        'cache.sqlite-wal',
        false,
        roots
      )
    ).toBe(false)
  })

  it('caches ancestor project-marker verdicts within TTL, expires after TTL, and invalidates on marker changes', async () => {
    let clock = 1_000
    const tree: Record<string, string[]> = {
      '/watch': ['Documents', 'project'],
      '/watch/Documents': ['build', 'notes.md'],
      '/watch/Documents/build': ['a.md', 'b.md'],
      '/watch/project': ['package.json', 'dist', 'src'],
      '/watch/project/dist': ['bundle.js']
    }
    const readdir = vi.fn(async (dirPath: string) => {
      const entries = tree[dirPath]
      if (!entries) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return entries
    })
    const gitFiles: Record<string, string> = {
      '/watch/worktree-clone/.git': 'gitdir: /tmp/repo/.git/worktrees/feature\n'
    }
    const readFile = vi.fn(async (filePath: string) => {
      const content = gitFiles[filePath]
      if (content === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return content
    })

    const policy = new NativeScanPolicy({
      ttlMs: 10_000,
      maxEntries: 64,
      readdir,
      readFile,
      now: () => clock
    })
    const roots = ['/watch']

    // First lookup evaluates project marker once and caches both parent + dist.
    await expect(
      policy.hasExcludedAncestorDirectory('/watch/project/dist/a.js', roots)
    ).resolves.toBe(true)
    await expect(
      policy.hasExcludedAncestorDirectory('/watch/project/dist/b.js', roots)
    ).resolves.toBe(true)
    await expect(
      policy.hasExcludedAncestorDirectory('/watch/project/dist/nested/c.js', roots)
    ).resolves.toBe(true)

    expect(readdir).toHaveBeenCalledTimes(1)
    expect(readdir).toHaveBeenCalledWith('/watch/project')

    // Personal build folder (no marker) is allowed and also cached.
    await expect(
      policy.hasExcludedAncestorDirectory('/watch/Documents/build/a.md', roots)
    ).resolves.toBe(false)
    const readdirBeforeRepeat = readdir.mock.calls.length
    await expect(
      policy.hasExcludedAncestorDirectory('/watch/Documents/build/b.md', roots)
    ).resolves.toBe(false)
    expect(readdir).toHaveBeenCalledTimes(readdirBeforeRepeat)

    // Linked worktree below root is excluded.
    await expect(
      policy.hasExcludedAncestorDirectory('/watch/worktree-clone/wt-file.ts', roots)
    ).resolves.toBe(true)

    // Adding a marker invalidates cached verdicts immediately when notified.
    tree['/watch/Documents'] = ['package.json', 'build', 'notes.md']
    policy.invalidatePaths(['/watch/Documents/package.json'])
    await expect(
      policy.hasExcludedAncestorDirectory('/watch/Documents/build/a.md', roots)
    ).resolves.toBe(true)

    // Advancing past TTL triggers fresh evaluation on next lookup.
    tree['/watch/Documents'] = ['build', 'notes.md']
    clock += 11_000
    await expect(
      policy.hasExcludedAncestorDirectory('/watch/Documents/build/a.md', roots)
    ).resolves.toBe(false)
  })
})
