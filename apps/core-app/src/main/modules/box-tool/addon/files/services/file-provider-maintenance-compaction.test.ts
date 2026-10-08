import { beforeEach, describe, expect, it, vi } from 'vitest'

const writerMock = vi.hoisted(() => ({ compact: vi.fn() }))
vi.mock('../../../search-engine/search-index-writer', () => ({ searchIndexWriter: writerMock }))

import { FileProviderMaintenanceService } from './file-provider-maintenance-service'

function createService(splitEnabled: boolean) {
  const logs: Array<{ level: string; message: string; meta?: unknown }> = []
  const unsupported = (): never => {
    throw new Error('unsupported in this test')
  }
  const service = new FileProviderMaintenanceService({
    sourceId: 'file-provider',
    getDbUtils: () => null,
    getSearchIndex: () => null,
    getFilePersistencePort: unsupported,
    getRuntimeMutationDelegate: unsupported,
    isSplitEnabled: () => splitEnabled,
    isShuttingDown: () => false,
    isInitializing: () => false,
    isWithinWatchRoots: () => true,
    normalizePath: (value) => value,
    mapRecord: unsupported,
    onBaseCommitReady: () => undefined,
    emitCleanupProgress: () => undefined,
    logInfo: (message, meta) => logs.push({ level: 'info', message, meta }),
    logDebug: (message, meta) => logs.push({ level: 'debug', message, meta }),
    logWarn: (message, error, meta) => logs.push({ level: 'warn', message, meta: { error, meta } })
  })
  return { service, logs }
}

describe('FileProviderMaintenanceService.compactSearchIndex', () => {
  beforeEach(() => {
    writerMock.compact.mockReset()
  })

  it('asks the worker-backed writer to compact under the split and logs the outcome', async () => {
    writerMock.compact.mockResolvedValue({
      ran: true,
      reason: 'content-cleanup-startup',
      fileBytesBefore: 5_000,
      fileBytesAfter: 1_500,
      freelistBytesBefore: 3_000,
      durationMs: 38_000
    })
    const { service, logs } = createService(true)

    await service.compactSearchIndex('content-cleanup-startup')

    expect(writerMock.compact).toHaveBeenCalledWith('content-cleanup-startup')
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: 'info',
        message: 'Search index compacted',
        meta: expect.objectContaining({ fileBytesAfter: 1_500 })
      })
    )
  })

  it('never compacts on the shared-file topology', async () => {
    const { service, logs } = createService(false)

    await service.compactSearchIndex('content-indexing-disabled')

    expect(writerMock.compact).not.toHaveBeenCalled()
    expect(logs[0]).toMatchObject({ level: 'debug' })
  })

  it('turns a writer failure into a warning instead of a rejection', async () => {
    writerMock.compact.mockRejectedValue(new Error('worker gone'))
    const { service, logs } = createService(true)

    await expect(service.compactSearchIndex('x')).resolves.toBeUndefined()
    expect(logs[0]).toMatchObject({ level: 'warn', message: 'Search index compaction failed' })
  })
})
