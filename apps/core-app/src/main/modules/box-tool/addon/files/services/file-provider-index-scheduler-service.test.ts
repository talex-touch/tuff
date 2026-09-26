import type { Mock } from 'vitest'
import type { IndexWorkerBatchResult, IndexWorkerFile } from '../workers/file-index-worker-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileProviderIndexSchedulerService } from './file-provider-index-scheduler-service'

interface SchedulerFile {
  id: number
  path: string
  name: string
  size: number
  mtime: number
  ctime: number
}

function file(id: number, name: string, size = 1): SchedulerFile {
  return { id, path: `/tmp/${name}`, name, size, mtime: 1_000, ctime: 1_000 }
}

function createService(
  options: {
    dbPath?: string | null
    watchPaths?: string[]
    normalizePath?: (rawPath: string) => string
    config?: { backgroundContentMinBytes?: number; chunkSize?: number }
  } = {}
) {
  const indexFiles = vi.fn<
    (
      dbPath: string,
      providerId: string,
      providerType: string,
      files: IndexWorkerFile[]
    ) => Promise<IndexWorkerBatchResult>
  >(async () => ({ processed: 0, failed: 0 }))
  const logWarn = vi.fn()
  const dbPath = Object.prototype.hasOwnProperty.call(options, 'dbPath')
    ? options.dbPath
    : '/tmp/index.db'
  const service = new FileProviderIndexSchedulerService({
    getDatabaseFilePath: () => dbPath ?? null,
    getProviderId: () => 'file-provider',
    getProviderType: () => 'file',
    getWatchPaths: () => options.watchPaths ?? ['/tmp'],
    normalizePath: options.normalizePath ?? ((rawPath) => rawPath.toLowerCase()),
    indexFiles,
    logWarn,
    config: {
      backgroundContentMinBytes: 10,
      chunkSize: 2,
      ...options.config
    }
  })

  return {
    indexFiles,
    logWarn,
    service
  }
}

function dispatchedIds(indexFiles: Mock): number[] {
  return indexFiles.mock.calls.map((call) => {
    const files = call[3] as Array<{ id: number }>
    return files[0]!.id
  })
}

describe('file-provider-index-scheduler-service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('skips scheduling when database path is unavailable', () => {
    const { indexFiles, service } = createService({ dbPath: null })

    service.schedule([file(1, 'a.txt')], 'test')

    expect(indexFiles).not.toHaveBeenCalled()
    expect(service.hasPendingWork()).toBe(false)
  })

  it('maps files and chunks immediate worker payloads', async () => {
    const { indexFiles, service } = createService()

    service.schedule(
      [
        {
          id: 1,
          path: '/tmp/a.txt',
          name: 'a.txt',
          displayName: 'A',
          extension: '.txt',
          size: 1,
          mtime: new Date(1000),
          ctime: '1970-01-01T00:00:02.000Z'
        },
        { id: 2, path: '/tmp/b.txt', name: 'b.txt', size: 2, mtime: 3000, ctime: 4000 },
        { id: 3, path: '/tmp/c.txt', name: 'c.txt', size: 3, mtime: 5000, ctime: 6000 }
      ],
      'immediate'
    )
    await service.drain()

    expect(indexFiles).toHaveBeenCalledTimes(2)
    expect(indexFiles).toHaveBeenNthCalledWith(1, '/tmp/index.db', 'file-provider', 'file', [
      expect.objectContaining({
        id: 1,
        path: '/tmp/a.txt',
        displayName: 'A',
        mtime: 1000,
        ctime: 2000
      }),
      expect.objectContaining({
        id: 2,
        path: '/tmp/b.txt',
        mtime: 3000,
        ctime: 4000
      })
    ])
    expect(indexFiles).toHaveBeenNthCalledWith(2, '/tmp/index.db', 'file-provider', 'file', [
      expect.objectContaining({ id: 3 })
    ])
  })

  it('falls back to current time for invalid worker timestamps', async () => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
    const { indexFiles, service } = createService()

    service.schedule(
      [
        {
          id: 1,
          path: '/tmp/invalid.txt',
          name: 'invalid.txt',
          size: 1,
          mtime: Number.NaN,
          ctime: 'invalid'
        }
      ],
      'invalid-timestamp'
    )
    await service.drain()

    expect(indexFiles).toHaveBeenCalledWith('/tmp/index.db', 'file-provider', 'file', [
      expect.objectContaining({
        id: 1,
        mtime: Date.parse('2026-06-01T00:00:00.000Z'),
        ctime: Date.parse('2026-06-01T00:00:00.000Z')
      })
    ])
  })

  it('orders shallower watch-root files ahead of deeper files regardless of input order', async () => {
    const { indexFiles, service } = createService({
      watchPaths: ['/tmp/root'],
      config: { chunkSize: 1 }
    })

    service.schedule(
      [
        {
          id: 2,
          path: '/tmp/root/one/two/three/deep.txt',
          name: 'deep.txt',
          size: 1,
          mtime: 1_000,
          ctime: 1_000
        },
        {
          id: 1,
          path: '/tmp/root/a.txt',
          name: 'a.txt',
          size: 1,
          mtime: 1_000,
          ctime: 1_000
        }
      ],
      'watch'
    )
    await service.drain()

    expect(dispatchedIds(indexFiles)).toEqual([1, 2])
  })

  it('returns large files as deferred rather than admitting them before small ones', async () => {
    const { indexFiles, service } = createService({
      watchPaths: ['/tmp'],
      config: { chunkSize: 1, backgroundContentMinBytes: 10 }
    })

    const result = service.schedule(
      [
        file(1, 'small-1.txt', 1),
        file(2, 'small-2.txt', 1),
        file(3, 'small-3.txt', 1),
        file(4, 'large-1.bin', 100),
        file(5, 'large-2.bin', 100)
      ],
      'scan'
    )

    // The shared scheduler retains one active plus one queued batch; the overflow is returned to
    // the caller (which persists it durably) instead of being queued in memory.
    expect(result).toEqual({ accepted: 2, deferred: 3 })

    await service.drain()
    expect(dispatchedIds(indexFiles)).toEqual([1, 2])
  })

  it('ignores watch roots rejected by the normalizer when ordering by depth', async () => {
    const { indexFiles, service } = createService({
      watchPaths: ['/tmp/rejected', '/tmp/root'],
      normalizePath: (rawPath) => (rawPath === '/tmp/rejected' ? '' : rawPath.toLowerCase()),
      config: { chunkSize: 1 }
    })

    service.schedule(
      [
        {
          id: 1,
          path: '/tmp/root/one/two/deep.txt',
          name: 'deep.txt',
          size: 1,
          mtime: 1_000,
          ctime: 1_000
        },
        {
          id: 2,
          path: '/tmp/rejected/one/two/deep.txt',
          name: 'rejected-deep.txt',
          size: 1,
          mtime: 1_000,
          ctime: 1_000
        }
      ],
      'watch'
    )
    await service.drain()

    // The rejected root contributes no depth, so its file is treated as surface-level and ordered
    // ahead of the genuinely deep file under the valid root.
    expect(dispatchedIds(indexFiles)).toEqual([2, 1])
  })

  it('logs worker failures through scheduler drain', async () => {
    const error = new Error('worker failed')
    const { indexFiles, logWarn, service } = createService()
    indexFiles.mockRejectedValueOnce(error)

    service.schedule([file(1, 'a.txt')], 'test')
    await expect(service.drain()).rejects.toMatchObject({ errors: [error] })

    expect(logWarn).toHaveBeenCalledWith('File index worker failed', error, {
      reason: 'test',
      size: 1
    })
  })

  it('surfaces reported per-file worker failures through drain', async () => {
    const { indexFiles, logWarn, service } = createService()
    indexFiles.mockResolvedValueOnce({ processed: 2, failed: 1 })

    service.schedule([file(1, 'a.txt'), file(2, 'b.txt')], 'per-file-failure')

    await expect(service.drain()).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: 'FILE_INDEX_WORKER_BATCH_FAILED:1/2' })]
    })
    expect(logWarn).toHaveBeenCalledWith(
      'File index worker failed',
      expect.objectContaining({ message: 'FILE_INDEX_WORKER_BATCH_FAILED:1/2' }),
      { reason: 'per-file-failure', size: 2 }
    )
  })

  it("adds the worker's lastError samples to the failed-batch warning", async () => {
    const { indexFiles, logWarn, service } = createService()
    const failureSamples = [
      "EISDIR: illegal operation on a directory, read '/tmp/a.txt'",
      'result-too-large'
    ]
    indexFiles.mockResolvedValueOnce({ processed: 2, failed: 2, failureSamples })

    service.schedule([file(1, 'a.txt'), file(2, 'b.txt')], 'sampled-failure')

    await expect(service.drain()).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: 'FILE_INDEX_WORKER_BATCH_FAILED:2/2' })]
    })
    expect(logWarn).toHaveBeenCalledWith(
      'File index worker failed',
      expect.objectContaining({ message: 'FILE_INDEX_WORKER_BATCH_FAILED:2/2' }),
      { reason: 'sampled-failure', size: 2, lastErrorSamples: failureSamples }
    )
  })

  it('does not launch retained queued work once closed', async () => {
    const gate = Promise.withResolvers<void>()
    const { indexFiles, service } = createService({ config: { chunkSize: 1 } })
    indexFiles.mockImplementation(async () => {
      await gate.promise
      return { processed: 1, failed: 0 }
    })

    service.schedule([file(1, 'a.txt'), file(2, 'b.txt')], 'watch', 'lease-1')
    await settleMicrotasks()
    expect(indexFiles).toHaveBeenCalledTimes(1)

    service.close()
    gate.resolve()
    await settleMicrotasks()

    expect(indexFiles).toHaveBeenCalledTimes(1)
    expect(service.hasPendingWork()).toBe(false)
  })
})

async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 16; index += 1) {
    await Promise.resolve()
  }
}
