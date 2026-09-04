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

function makeDb(rows: Array<Record<string, unknown>>): {
  getFilesByPaths: ReturnType<typeof vi.fn>
} {
  return { getFilesByPaths: vi.fn(async () => rows) }
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
