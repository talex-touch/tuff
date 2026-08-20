import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appRebuildMock,
  deleteMock,
  fileRebuildMock,
  getDbMock,
  getSearchDbMock,
  runMock,
  selectFromMock,
  selectMock,
  deleteWhereMock,
  selectWhereMock
} = vi.hoisted(() => ({
  appRebuildMock: vi.fn(),
  deleteMock: vi.fn(),
  fileRebuildMock: vi.fn(),
  getDbMock: vi.fn(),
  getSearchDbMock: vi.fn(),
  runMock: vi.fn(),
  selectFromMock: vi.fn(),
  selectMock: vi.fn(),
  deleteWhereMock: vi.fn(),
  selectWhereMock: vi.fn()
}))

vi.mock('../modules/database', () => ({
  databaseModule: {
    getDb: getDbMock,
    getSearchDb: getSearchDbMock,
    getAuxDb: vi.fn()
  }
}))

vi.mock('../modules/clipboard', () => ({
  clipboardModule: {
    cleanupHistory: vi.fn()
  }
}))

vi.mock('./temp-file.service', () => ({
  tempFileService: {
    cleanup: vi.fn(),
    getBaseDir: vi.fn(() => '/tmp')
  }
}))

vi.mock('../modules/box-tool/addon/apps/app-provider', () => ({
  appProvider: {
    rebuildIndex: appRebuildMock
  }
}))

vi.mock('../modules/box-tool/addon/files/file-provider', () => ({
  fileProvider: {
    rebuildIndex: fileRebuildMock
  }
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp')
  }
}))

import { cleanupFileIndex } from './storage-maintenance'

describe('cleanupFileIndex', () => {
  beforeEach(() => {
    // `.from()` is awaited directly for unscoped counts and chained with `.where()` for scoped
    // ones, so it has to be thenable *and* carry a `where`.
    selectWhereMock.mockReset().mockResolvedValue([{ count: 1 }])
    selectFromMock.mockReset().mockImplementation(() => {
      const rows = [{ count: 1 }]
      return Object.assign(Promise.resolve(rows), { where: selectWhereMock })
    })
    selectMock.mockReset().mockReturnValue({ from: selectFromMock })
    deleteWhereMock.mockReset().mockResolvedValue(undefined)
    deleteMock
      .mockReset()
      .mockImplementation(() =>
        Object.assign(Promise.resolve(undefined), { where: deleteWhereMock })
      )
    runMock.mockReset().mockResolvedValue(undefined)
    const connection = {
      select: selectMock,
      delete: deleteMock,
      run: runMock
    }
    getDbMock.mockReset().mockResolvedValue(connection)
    getSearchDbMock.mockReset().mockReturnValue(connection)
    appRebuildMock.mockReset().mockResolvedValue({ success: true })
    fileRebuildMock.mockReset().mockResolvedValue({ success: true })
  })

  it('rebuilds app index before file index after cleanup', async () => {
    const result = await cleanupFileIndex({ clearSearchIndex: true, rebuild: true })

    expect(result.success).toBe(true)
    expect(result.removedCount).toBe(4)
    expect(appRebuildMock).toHaveBeenCalledTimes(1)
    expect(fileRebuildMock).toHaveBeenCalledWith({ force: true })
    expect(appRebuildMock.mock.invocationCallOrder[0]).toBeLessThan(
      fileRebuildMock.mock.invocationCallOrder[0]
    )
  })

  /**
   * #1770. File rows live in `search-index.db` under the default-on split; `getDb()` is the primary
   * connection, which holds only the app catalog. Cleaning up through it counted and deleted from
   * the wrong file.
   */
  it('cleans the search connection, not the primary', async () => {
    await cleanupFileIndex({})

    expect(getSearchDbMock).toHaveBeenCalled()
    expect(getDbMock).not.toHaveBeenCalled()
  })

  /**
   * The other half of #1770, which predates the split: `files` also holds the app catalog,
   * including user-authored entries added via `addAppByPath` that exist nowhere else and that
   * `rebuildIndex()` cannot rediscover outside the watch paths. An unscoped delete removed them.
   */
  it('scopes the files and file_extensions deletes so the app catalog survives', async () => {
    await cleanupFileIndex({})

    // Four tables are cleared: fileIndexProgress and scanProgress are file-only and stay
    // unscoped, while files and file_extensions must each go through `.where(...)`. Asserting the
    // delete counts rather than the select counts keeps this independent of how the
    // file_extensions subquery happens to be built.
    expect(deleteMock).toHaveBeenCalledTimes(4)
    expect(deleteWhereMock).toHaveBeenCalledTimes(2)
  })

  it('returns rebuild error while still attempting file index rebuild', async () => {
    appRebuildMock.mockResolvedValueOnce({ success: false, error: 'app rebuild failed' })

    const result = await cleanupFileIndex({ clearSearchIndex: true, rebuild: true })

    expect(fileRebuildMock).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('app rebuild failed')
  })
})
