import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/tmp/tuff-native-search-test-${name}`)
  }
}))
import type {
  NativeArenaSearchMatchItem,
  NativeFileArenaHandle
} from '@talex-touch/tuff-native/file-index'
import { mapFileToTuffItem } from '../../utils'
import { resolveExtensionsForTypeFilters } from '../file-provider-search-service'
import {
  NATIVE_SEARCH_RESULT_LIMIT,
  executeNativeArenaSearch,
  verifyCandidatesWithLazyLstat
} from './native-index-search'
import { NativeScanPolicy } from './native-scan-policy'

function makeCandidate(
  index: number,
  overrides: Partial<NativeArenaSearchMatchItem> = {}
): NativeArenaSearchMatchItem {
  return {
    path: `/watch/docs/file-${index}.md`,
    name: `file-${index}.md`,
    extension: 'md',
    isDir: false,
    mtimeSec: 1_700_000_000,
    mtimeMs: 1_700_000_000_000,
    score: 0.9 - index * 0.001,
    matchKind: 'prefix',
    matchedRanges: [[0, 4]],
    ...overrides
  }
}

describe('native-index-search', () => {
  it('bounds lazy lstat to 50 candidates when top 50 are live and avoids wave-stalls', async () => {
    const candidates = Array.from({ length: 120 }, (_, i) => makeCandidate(i))
    let active = 0
    let maxActive = 0
    const lstat = vi.fn(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return {
        size: 100,
        mtime: new Date(1_700_000_000_000),
        ctime: new Date(1_700_000_000_000),
        mtimeMs: 1_700_000_000_000,
        isDirectory: () => false,
        isSymbolicLink: () => false
      }
    })

    const { liveItems, stalePaths } = await verifyCandidatesWithLazyLstat(
      candidates,
      'file',
      { text: 'file', typeFilters: new Set(), extensionFilters: [] },
      new AbortController().signal,
      {
        watchRoots: ['/watch'],
        scanPolicy: new NativeScanPolicy({
          readdir: async () => [],
          readFile: async () => {
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
          }
        }),
        buildItem: (file, exts) => mapFileToTuffItem(file, exts, 'file-provider', 'File Provider'),
        lstat
      }
    )

    expect(liveItems).toHaveLength(NATIVE_SEARCH_RESULT_LIMIT)
    expect(stalePaths).toEqual([])
    expect(lstat).toHaveBeenCalledTimes(NATIVE_SEARCH_RESULT_LIMIT)
    expect(maxActive).toBeGreaterThan(1)
  })

  it('backfills past 50 on ENOENT/symlinks and only evicts missing/symlink paths (never EACCES)', async () => {
    const candidates = Array.from({ length: 70 }, (_, i) => makeCandidate(i))
    const lstat = vi.fn(async (target: string) => {
      if (target.endsWith('file-1.md') || target.endsWith('file-2.md')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      if (target.endsWith('file-3.md')) {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
      }
      if (target.endsWith('file-4.md')) {
        return {
          size: 10,
          mtime: new Date(1_700_000_000_000),
          ctime: new Date(1_700_000_000_000),
          mtimeMs: 1_700_000_000_000,
          isDirectory: () => false,
          isSymbolicLink: () => true
        }
      }
      return {
        size: 100,
        mtime: new Date(1_700_000_000_000),
        ctime: new Date(1_700_000_000_000),
        mtimeMs: 1_700_000_000_000,
        isDirectory: () => false,
        isSymbolicLink: () => false
      }
    })

    const { liveItems, stalePaths } = await verifyCandidatesWithLazyLstat(
      candidates,
      'file',
      { text: 'file', typeFilters: new Set(), extensionFilters: [] },
      new AbortController().signal,
      {
        watchRoots: ['/watch'],
        scanPolicy: new NativeScanPolicy({
          readdir: async () => [],
          readFile: async () => {
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
          }
        }),
        buildItem: (file, exts) => mapFileToTuffItem(file, exts, 'file-provider', 'File Provider'),
        lstat
      }
    )

    expect(liveItems).toHaveLength(NATIVE_SEARCH_RESULT_LIMIT)
    expect(stalePaths).toEqual([
      '/watch/docs/file-1.md',
      '/watch/docs/file-2.md',
      '/watch/docs/file-4.md'
    ])
    expect(stalePaths).not.toContain('/watch/docs/file-3.md')
  })

  it('supports combined folder + document filters without dropping folders or dotless extensions', async () => {
    const arenaSearch = vi.fn(async () => ({
      items: [
        makeCandidate(0, { path: '/watch/Projects', name: 'Projects', extension: '', isDir: true }),
        makeCandidate(1, {
          path: '/watch/notes.md',
          name: 'notes.md',
          extension: 'md',
          isDir: false
        }),
        makeCandidate(2, {
          path: '/watch/photo.png',
          name: 'photo.png',
          extension: 'png',
          isDir: false
        })
      ],
      totalIndexed: 3,
      bitmapRejected: 0,
      evaluatedCandidates: 3,
      durationMs: 0.4
    }))

    const result = await executeNativeArenaSearch(
      { text: 'type:folder type:document' },
      new AbortController().signal,
      {
        arena: { search: arenaSearch } as unknown as NativeFileArenaHandle,
        watchRoots: ['/watch'],
        scanPolicy: new NativeScanPolicy({
          readdir: async () => [],
          readFile: async () => {
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
          }
        }),
        isPathAdmitted: (p) => p.startsWith('/watch'),
        buildItem: (file, exts) => mapFileToTuffItem(file, exts, 'file-provider', 'File Provider'),
        extractFilters: () => ({
          text: '',
          typeFilters: new Set(['folder', 'document']),
          extensionFilters: []
        }),
        resolveExtensionsForTypeFilters,
        onStalePathsDetected: vi.fn(),
        logDebug: vi.fn(),
        lstat: async (target) => ({
          size: 50,
          mtime: new Date(1_700_000_000_000),
          ctime: new Date(1_700_000_000_000),
          mtimeMs: 1_700_000_000_000,
          isDirectory: () => target === '/watch/Projects',
          isSymbolicLink: () => false
        })
      }
    )

    expect(arenaSearch).toHaveBeenCalledWith('', {
      limit: 120,
      extensions: undefined,
      typeFilter: undefined
    })
    expect(result.items.map((item) => item.render.basic?.title)).toEqual(['Projects', 'notes.md'])
  })
})
