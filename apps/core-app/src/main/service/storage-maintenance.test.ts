import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appRebuildMock,
  deleteMock,
  fileRebuildMock,
  getDbMock,
  runMock,
  selectFromMock,
  selectMock
} = vi.hoisted(() => ({
  appRebuildMock: vi.fn(),
  deleteMock: vi.fn(),
  fileRebuildMock: vi.fn(),
  getDbMock: vi.fn(),
  runMock: vi.fn(),
  selectFromMock: vi.fn(),
  selectMock: vi.fn()
}))

vi.mock('../modules/database', () => ({
  databaseModule: {
    getDb: getDbMock,
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
    selectFromMock.mockReset().mockResolvedValue([{ count: 1 }])
    selectMock.mockReset().mockReturnValue({ from: selectFromMock })
    deleteMock.mockReset().mockResolvedValue(undefined)
    runMock.mockReset().mockResolvedValue(undefined)
    getDbMock.mockReset().mockResolvedValue({
      select: selectMock,
      delete: deleteMock,
      run: runMock
    })
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

  it('returns rebuild error while still attempting file index rebuild', async () => {
    appRebuildMock.mockResolvedValueOnce({ success: false, error: 'app rebuild failed' })

    const result = await cleanupFileIndex({ clearSearchIndex: true, rebuild: true })

    expect(fileRebuildMock).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('app rebuild failed')
  })
})
