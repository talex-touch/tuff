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
