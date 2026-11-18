import { afterEach, describe, expect, it, vi } from 'vitest'

const { mapFileToTuffItemMock, normalizeTuffItemLocalAssetsMock } = vi.hoisted(() => ({
  mapFileToTuffItemMock: vi.fn(),
  normalizeTuffItemLocalAssetsMock: vi.fn()
}))

vi.mock('../../addon/files/utils', () => ({
  mapFileToTuffItem: mapFileToTuffItemMock
}))

vi.mock('../../../../utils/local-renderable-assets', () => ({
  normalizeTuffItemLocalAssets: normalizeTuffItemLocalAssetsMock
}))

import { registerFileAssetBridge } from '../../addon/files/file-asset-bridge'
import { registerFileRecommendationBridge } from '../../addon/files/file-recommendation-bridge'
import { createFileRecommendationSource } from './file-recommendation-source'

const fileRow = (path: string, isDir = false): Record<string, unknown> => ({
  id: 1,
  path,
  name: path.split('/').pop(),
  isDir
})

function makeDb(
  rows: Array<Record<string, unknown>>,
  extensions: Array<{ fileId: number; key: string; value: string | null }> = []
): {
  getFilesByPaths: ReturnType<typeof vi.fn>
  getFileExtensionsByFileIds: ReturnType<typeof vi.fn>
} {
  return {
    getFilesByPaths: vi.fn(async () => rows),
    getFileExtensionsByFileIds: vi.fn(async () => extensions)
  }
}

describe('file recommendation source', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('claims every id the per-platform file providers record under', () => {
    const source = createFileRecommendationSource(makeDb([]) as never)

    expect(source.sourceId).toBe('file-provider')
    expect(source.aliases).toEqual([
      'file',
      'files',
      'everything-provider',
      'macos-spotlight-provider',
      'linux-native-file-provider'
    ])
  })

  it('returns [] without touching the db for an empty id list', async () => {
    const db = makeDb([])
    await expect(createFileRecommendationSource(db as never).rebuild([])).resolves.toEqual([])
    expect(db.getFilesByPaths).not.toHaveBeenCalled()
  })

  it('looks the whole batch up in one query', async () => {
    const db = makeDb([])

    await createFileRecommendationSource(db as never).rebuild(['/a.txt', '/b.txt', '/c.txt'])

    expect(db.getFilesByPaths).toHaveBeenCalledTimes(1)
    expect(db.getFilesByPaths).toHaveBeenCalledWith(['/a.txt', '/b.txt', '/c.txt'])
  })

  it('drops a file whose asset no longer resolves on disk', async () => {
    // dropMissingFile is what keeps a deleted file from rendering as a broken card.
    const db = makeDb([fileRow('/gone.txt'), fileRow('/kept.txt')])
    mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
    normalizeTuffItemLocalAssetsMock.mockImplementation((item: { id: string }) =>
      item.id === '/gone.txt' ? { item: null } : { item }
    )

    const result = await createFileRecommendationSource(db as never).rebuild([
      '/gone.txt',
      '/kept.txt'
    ])

    expect(result.map((item) => (item as { id: string }).id)).toEqual(['/kept.txt'])
  })

  it('passes the folder fallback kind through for directories', async () => {
    const db = makeDb([fileRow('/some/dir', true)])
    mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
    normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))

    await createFileRecommendationSource(db as never).rebuild(['/some/dir'])

    expect(normalizeTuffItemLocalAssetsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dropMissingFile: true, fallbackKind: 'folder' })
    )
  })

  it('labels the rebuilt items with the canonical source id, not the alias used to reach it', async () => {
    const db = makeDb([fileRow('/a.txt')])
    mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
    normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))

    await createFileRecommendationSource(db as never).rebuild(['/a.txt'])

    expect(mapFileToTuffItemMock).toHaveBeenCalledWith(
      expect.anything(),
      {},
      'file-provider',
      'File Provider'
    )
  })

  describe('thumbnails', () => {
    it('passes each file its own extension rows to the mapper', async () => {
      // Without these the mapper gets `{}` and an image renders as a generic glyph: `tfile` only
      // serves allowlisted roots, so a picture under ~/Pictures can only ever show through the
      // generated thumbnail recorded here.
      const db = makeDb(
        [
          { ...fileRow('/Users/x/Pictures/a.png'), id: 1 },
          { ...fileRow('/Users/x/Pictures/b.png'), id: 2 }
        ],
        [
          { fileId: 1, key: 'thumbnail', value: '/cache/thumbs/a.png' },
          { fileId: 2, key: 'thumbnail', value: '/cache/thumbs/b.png' }
        ]
      )
      mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
      normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))

      await createFileRecommendationSource(db as never).rebuild([
        '/Users/x/Pictures/a.png',
        '/Users/x/Pictures/b.png'
      ])

      expect(db.getFileExtensionsByFileIds).toHaveBeenCalledTimes(1)
      const passed = mapFileToTuffItemMock.mock.calls.map((call) => call[1])
      expect(passed).toEqual([
        { thumbnail: '/cache/thumbs/a.png' },
        { thumbnail: '/cache/thumbs/b.png' }
      ])
    })

    it('gives a file with no extension rows an empty map rather than a sibling’s', async () => {
      const db = makeDb(
        [
          { ...fileRow('/Users/x/Pictures/a.png'), id: 1 },
          { ...fileRow('/Users/x/docs/b.txt'), id: 2 }
        ],
        [{ fileId: 1, key: 'thumbnail', value: '/cache/thumbs/a.png' }]
      )
      mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
      normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))

      await createFileRecommendationSource(db as never).rebuild([
        '/Users/x/Pictures/a.png',
        '/Users/x/docs/b.txt'
      ])

      expect(mapFileToTuffItemMock.mock.calls[1][1]).toEqual({})
    })

    it('still returns the cards when the extension lookup fails', async () => {
      // A missing thumbnail costs an icon, not the card.
      const db = {
        getFilesByPaths: vi.fn(async () => [{ ...fileRow('/Users/x/Pictures/a.png'), id: 1 }]),
        getFileExtensionsByFileIds: vi.fn(async () => {
          throw new Error('db unavailable')
        })
      }
      mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
      normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))

      await expect(
        createFileRecommendationSource(db as never).rebuild(['/Users/x/Pictures/a.png'])
      ).resolves.toHaveLength(1)
      expect(mapFileToTuffItemMock.mock.calls[0][1]).toEqual({})
    })
  })

  it('degrades to [] when the lookup throws', async () => {
    const db = {
      getFilesByPaths: vi.fn(async () => {
        throw new Error('db unavailable')
      })
    }

    await expect(createFileRecommendationSource(db as never).rebuild(['/a.txt'])).resolves.toEqual(
      []
    )
  })
})

/**
 * Search results get their thumbnails lazily through the mapper's callback; recommendations never
 * did, and the deferred sweep only runs after a full index pass. A screenshot taken a minute ago
 * therefore sat in "recent picks" as a grey OS icon until it happened to come up in a search.
 */
describe('file recommendation source thumbnail warm-up', () => {
  let disposeWarmer: (() => void) | null = null

  afterEach(() => {
    disposeWarmer?.()
    disposeWarmer = null
    vi.clearAllMocks()
  })

  const imageRow = (path: string, id: number): Record<string, unknown> => ({
    ...fileRow(path),
    id,
    extension: '.png',
    size: 1024,
    mtime: new Date(0)
  })

  function makeMutableDb(rows: Array<Record<string, unknown>>) {
    const extensions: Array<{ fileId: number; key: string; value: string | null }> = []
    return {
      extensions,
      getFilesByPaths: vi.fn(async () => rows),
      getFileExtensionsByFileIds: vi.fn(async () => [...extensions])
    }
  }

  it('ships the real thumbnail when the worker lands it within the wait', async () => {
    const db = makeMutableDb([imageRow('/Users/x/Pictures/shot.png', 7)])
    const warm = vi.fn(async (file: { id: number }) => {
      db.extensions.push({ fileId: file.id, key: 'thumbnail', value: '/cache/thumbs/shot.jpg' })
    })
    disposeWarmer = registerFileAssetBridge({
      lookupIndexedFiles: async () => new Map(),
      ensureThumbnail: warm as never
    })
    mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
    normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))

    await createFileRecommendationSource(db as never).rebuild(['/Users/x/Pictures/shot.png'])

    expect(warm).toHaveBeenCalledTimes(1)
    expect(warm.mock.calls[0][0]).toMatchObject({ id: 7, path: '/Users/x/Pictures/shot.png' })
    // Re-read after the warm-up so the mapper sees what landed.
    expect(db.getFileExtensionsByFileIds).toHaveBeenCalledTimes(2)
    expect(mapFileToTuffItemMock.mock.calls[0][1]).toEqual({
      thumbnail: '/cache/thumbs/shot.jpg'
    })
  })

  it('does not wait past the budget, then asks for a rebuild once the thumbnail lands', async () => {
    const db = makeMutableDb([imageRow('/Users/x/Pictures/slow.png', 8)])
    let finish!: () => void
    const warm = vi.fn(
      (file: { id: number }) =>
        new Promise<void>((resolve) => {
          finish = () => {
            db.extensions.push({
              fileId: file.id,
              key: 'thumbnail',
              value: '/cache/thumbs/slow.jpg'
            })
            resolve()
          }
        })
    )
    disposeWarmer = registerFileAssetBridge({
      lookupIndexedFiles: async () => new Map(),
      ensureThumbnail: warm as never
    })
    mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
    normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))
    const onThumbnailLanded = vi.fn()

    await createFileRecommendationSource(db as never, {
      thumbnailWaitMs: 5,
      onThumbnailLanded
    }).rebuild(['/Users/x/Pictures/slow.png'])

    // The card shipped without the thumbnail rather than holding the empty query.
    expect(mapFileToTuffItemMock.mock.calls[0][1]).toEqual({})
    expect(onThumbnailLanded).not.toHaveBeenCalled()

    finish()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onThumbnailLanded).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when a late generation produced nothing', async () => {
    // Unsupported or failed files persist a status row, not a thumbnail: no rebuild is owed.
    const db = makeMutableDb([imageRow('/Users/x/Pictures/broken.png', 9)])
    let finish!: () => void
    const warm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    disposeWarmer = registerFileAssetBridge({
      lookupIndexedFiles: async () => new Map(),
      ensureThumbnail: warm as never
    })
    mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
    normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))
    const onThumbnailLanded = vi.fn()

    await createFileRecommendationSource(db as never, {
      thumbnailWaitMs: 5,
      onThumbnailLanded
    }).rebuild(['/Users/x/Pictures/broken.png'])
    finish()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onThumbnailLanded).not.toHaveBeenCalled()
  })

  it('leaves files that already have a thumbnail, or cannot have one, alone', async () => {
    const db = makeMutableDb([
      imageRow('/Users/x/Pictures/done.png', 10),
      { ...fileRow('/Users/x/notes.txt'), id: 11, extension: '.txt' }
    ])
    db.extensions.push({ fileId: 10, key: 'thumbnail', value: '/cache/thumbs/done.jpg' })
    const warm = vi.fn(async () => undefined)
    disposeWarmer = registerFileAssetBridge({
      lookupIndexedFiles: async () => new Map(),
      ensureThumbnail: warm as never
    })
    mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
    normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))

    await createFileRecommendationSource(db as never).rebuild([
      '/Users/x/Pictures/done.png',
      '/Users/x/notes.txt'
    ])

    expect(warm).not.toHaveBeenCalled()
    expect(db.getFileExtensionsByFileIds).toHaveBeenCalledTimes(1)
  })

  it('builds the cards as before when no provider has registered a warmer', async () => {
    const db = makeMutableDb([imageRow('/Users/x/Pictures/shot.png', 12)])
    mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
    normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))

    const items = await createFileRecommendationSource(db as never).rebuild([
      '/Users/x/Pictures/shot.png'
    ])

    expect(items).toEqual([{ id: '/Users/x/Pictures/shot.png' }])
    expect(db.getFileExtensionsByFileIds).toHaveBeenCalledTimes(1)
  })
})

describe('file recommendation source NativeFileArena bridge fallback', () => {
  let disposeBridge: (() => void) | null = null

  afterEach(() => {
    disposeBridge?.()
    disposeBridge = null
    vi.clearAllMocks()
  })

  it('rebuilds NativeFileArena-only files cleanly when SQLite misses them', async () => {
    const mtime = new Date('2026-10-18T10:00:00.000Z')
    const ctime = new Date('2026-10-18T09:00:00.000Z')
    const db = makeDb([{ ...fileRow('/Users/x/Documents/indexed.md'), id: 42 }])
    const lookupFilesByPaths = vi.fn(async (paths: readonly string[]) => {
      const map = new Map()
      if (paths.includes('/Users/x/Downloads/arena-only.pdf')) {
        map.set('/Users/x/Downloads/arena-only.pdf', {
          path: '/Users/x/Downloads/arena-only.pdf',
          name: 'arena-only.pdf',
          extension: '.pdf',
          size: 4096,
          mtime,
          ctime,
          isDir: false
        })
      }
      return map
    })
    disposeBridge = registerFileRecommendationBridge({
      lookupFilesByPaths,
      listRecentFiles: async () => [],
      recallSemanticFiles: async () => []
    })

    mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
    normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))

    const result = await createFileRecommendationSource(db as never).rebuild([
      '/Users/x/Documents/indexed.md',
      '/Users/x/Downloads/arena-only.pdf'
    ])

    expect(lookupFilesByPaths).toHaveBeenCalledTimes(1)
    expect(lookupFilesByPaths).toHaveBeenCalledWith(['/Users/x/Downloads/arena-only.pdf'])
    expect(db.getFileExtensionsByFileIds).toHaveBeenCalledWith([42])
    expect(mapFileToTuffItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: -1,
        path: '/Users/x/Downloads/arena-only.pdf',
        name: 'arena-only.pdf',
        extension: '.pdf',
        size: 4096,
        mtime,
        ctime,
        lastIndexedAt: mtime,
        isDir: false,
        type: 'file',
        content: null,
        embeddingStatus: 'none'
      }),
      {},
      'file-provider',
      'File Provider'
    )
    expect(result.map((item) => (item as { id: string }).id)).toEqual([
      '/Users/x/Documents/indexed.md',
      '/Users/x/Downloads/arena-only.pdf'
    ])
  })

  it('drops NativeFileArena files that vanished from disk or fail local asset normalization', async () => {
    const now = new Date('2026-10-18T10:00:00.000Z')
    const db = makeDb([])
    disposeBridge = registerFileRecommendationBridge({
      lookupFilesByPaths: async () =>
        new Map([
          [
            '/Users/x/Downloads/deleted-after-stat.pdf',
            {
              path: '/Users/x/Downloads/deleted-after-stat.pdf',
              name: 'deleted-after-stat.pdf',
              extension: '.pdf',
              size: 128,
              mtime: now,
              ctime: now,
              isDir: false
            }
          ],
          [
            '/Users/x/Downloads/alive.pdf',
            {
              path: '/Users/x/Downloads/alive.pdf',
              name: 'alive.pdf',
              extension: '.pdf',
              size: 512,
              mtime: now,
              ctime: now,
              isDir: false
            }
          ]
        ]),
      listRecentFiles: async () => [],
      recallSemanticFiles: async () => []
    })

    mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
    normalizeTuffItemLocalAssetsMock.mockImplementation((item: { id: string }) =>
      item.id === '/Users/x/Downloads/deleted-after-stat.pdf' ? { item: null } : { item }
    )

    const result = await createFileRecommendationSource(db as never).rebuild([
      '/Users/x/Downloads/never-in-arena.pdf',
      '/Users/x/Downloads/deleted-after-stat.pdf',
      '/Users/x/Downloads/alive.pdf'
    ])

    expect(db.getFileExtensionsByFileIds).not.toHaveBeenCalled()
    expect(normalizeTuffItemLocalAssetsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dropMissingFile: true, fallbackKind: 'file' })
    )
    expect(result.map((item) => (item as { id: string }).id)).toEqual([
      '/Users/x/Downloads/alive.pdf'
    ])
  })

  it('keeps SQLite-backed files when the NativeFileArena bridge throws', async () => {
    const db = makeDb([{ ...fileRow('/Users/x/Documents/sqlite-safe.txt'), id: 5 }])
    disposeBridge = registerFileRecommendationBridge({
      lookupFilesByPaths: async () => {
        throw new Error('bridge unavailable')
      },
      listRecentFiles: async () => [],
      recallSemanticFiles: async () => []
    })

    mapFileToTuffItemMock.mockImplementation((file: { path: string }) => ({ id: file.path }))
    normalizeTuffItemLocalAssetsMock.mockImplementation((item: unknown) => ({ item }))

    const result = await createFileRecommendationSource(db as never).rebuild([
      '/Users/x/Documents/sqlite-safe.txt',
      '/Users/x/Downloads/arena-missing.txt'
    ])

    expect(result.map((item) => (item as { id: string }).id)).toEqual([
      '/Users/x/Documents/sqlite-safe.txt'
    ])
  })
})
