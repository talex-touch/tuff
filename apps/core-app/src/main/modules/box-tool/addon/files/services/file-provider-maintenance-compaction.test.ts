import { beforeEach, describe, expect, it, vi } from 'vitest'

const writerMock = vi.hoisted(() => ({ compact: vi.fn() }))
vi.mock('../../../search-engine/search-index-writer', () => ({ searchIndexWriter: writerMock }))

import { FileProviderMaintenanceService } from './file-provider-maintenance-service'

function createService(splitEnabled: boolean) {
  const logs: Array<{ level: string; message: string; meta?: unknown }> = []
  const onIndexSpaceFreed = vi.fn()
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
    onIndexSpaceFreed,
    emitCleanupProgress: () => undefined,
    logInfo: (message, meta) => logs.push({ level: 'info', message, meta }),
    logDebug: (message, meta) => logs.push({ level: 'debug', message, meta }),
    logWarn: (message, error, meta) => logs.push({ level: 'warn', message, meta: { error, meta } })
  })
  return { service, logs, onIndexSpaceFreed }
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
    const { service, logs, onIndexSpaceFreed } = createService(true)

    await service.compactSearchIndex('content-cleanup-startup')

    expect(writerMock.compact).toHaveBeenCalledWith('content-cleanup-startup')
    expect(onIndexSpaceFreed).toHaveBeenCalledTimes(1)
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: 'info',
        message: 'Search index compacted',
        meta: expect.objectContaining({ fileBytesAfter: 1_500 })
      })
    )
  })

  it('repeats incremental steps until the freelist is small, and logs the whole reclaim once', async () => {
    vi.useFakeTimers()
    const step = (freelistBytesBefore: number, freelistBytesAfter: number) => ({
      ran: true,
      reason: 'boot-check',
      mode: 'incremental' as const,
      fileBytesBefore: 1_000_000_000 + freelistBytesBefore,
      fileBytesAfter: 1_000_000_000 + freelistBytesAfter,
      freelistBytesBefore,
      freelistBytesAfter,
      durationMs: 40
    })
    const MiB = 1024 * 1024
    writerMock.compact
      .mockResolvedValueOnce(step(150 * MiB, 86 * MiB))
      .mockResolvedValueOnce(step(86 * MiB, 22 * MiB))
    const { service, logs } = createService(true)

    const done = service.compactSearchIndex('boot-check')
    await vi.runAllTimersAsync()
    await done
    vi.useRealTimers()

    // 22 MiB is under the incremental floor, so the second step is the last.
    expect(writerMock.compact).toHaveBeenCalledTimes(2)
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: 'info',
        message: 'Search index compacted',
        meta: expect.objectContaining({
          mode: 'incremental',
          freelistBytesBefore: 150 * MiB,
          freelistBytesAfter: 22 * MiB,
          durationMs: 80
        })
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
    const { service, logs, onIndexSpaceFreed } = createService(true)

    await expect(service.compactSearchIndex('x')).resolves.toBeUndefined()
    expect(logs[0]).toMatchObject({ level: 'warn', message: 'Search index compaction failed' })
    expect(onIndexSpaceFreed).not.toHaveBeenCalled()
  })

  it('does not signal freed space when compaction was skipped', async () => {
    writerMock.compact.mockResolvedValue({
      ran: false,
      reason: 'boot-check',
      fileBytesBefore: 5_000,
      fileBytesAfter: 5_000,
      freelistBytesBefore: 0,
      durationMs: 2
    })
    const { service, onIndexSpaceFreed } = createService(true)

    await service.compactSearchIndex('boot-check')
    expect(onIndexSpaceFreed).not.toHaveBeenCalled()
  })
})
