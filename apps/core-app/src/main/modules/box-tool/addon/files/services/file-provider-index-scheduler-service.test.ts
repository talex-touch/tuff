import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileProviderIndexSchedulerService } from './file-provider-index-scheduler-service'

function createService(
  options: {
    dbPath?: string | null
    watchPaths?: string[]
    depthDelayMs?: number
    normalizePath?: (rawPath: string) => string
  } = {}
) {
  const indexFiles = vi.fn(async () => ({ processed: 0, failed: 0 }))
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
      backgroundDelayMs: 20,
      depthDelayMs: options.depthDelayMs ?? 20,
      chunkSize: 2
    }
  })

  return {
    indexFiles,
    logWarn,
    service
  }
}

describe('file-provider-index-scheduler-service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips scheduling when database path is unavailable', () => {
    const { indexFiles, service } = createService({ dbPath: null })

    service.schedule(
      [
        {
          id: 1,
          path: '/tmp/a.txt',
          name: 'a.txt',
          size: 1,
          mtime: new Date(1000),
          ctime: new Date(1000)
        }
      ],
      'test'
    )

    expect(indexFiles).not.toHaveBeenCalled()
  })

  it('maps files and chunks immediate worker payloads', () => {
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
        {
          id: 2,
          path: '/tmp/b.txt',
          name: 'b.txt',
          size: 2,
          mtime: 3000,
          ctime: 4000
        },
        {
          id: 3,
          path: '/tmp/c.txt',
          name: 'c.txt',
          size: 3,
          mtime: 5000,
          ctime: 6000
        }
      ],
      'immediate'
    )

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

  it('falls back to current time for invalid worker timestamps', () => {
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

    expect(indexFiles).toHaveBeenCalledWith('/tmp/index.db', 'file-provider', 'file', [
      expect.objectContaining({
        id: 1,
        mtime: Date.parse('2026-06-01T00:00:00.000Z'),
        ctime: Date.parse('2026-06-01T00:00:00.000Z')
      })
    ])
  })

  it('defers large file content indexing with background reason suffix', async () => {
    const { indexFiles, service } = createService()

    service.schedule(
      [
        {
          id: 1,
          path: '/tmp/large.bin',
          name: 'large.bin',
          size: 10,
          mtime: 1000,
          ctime: 1000
        }
      ],
      'scan'
    )

    expect(indexFiles).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20)

    expect(indexFiles).toHaveBeenCalledWith('/tmp/index.db', 'file-provider', 'file', [
      expect.objectContaining({ id: 1, path: '/tmp/large.bin' })
    ])
  })

  it('prioritizes shallower watch-root files before deeper files', async () => {
    const { indexFiles, service } = createService({
      watchPaths: ['/tmp/root'],
      depthDelayMs: 20
    })

    service.schedule(
      [
        {
          id: 1,
          path: '/tmp/root/a.txt',
          name: 'a.txt',
          size: 1,
          mtime: 1000,
          ctime: 1000
        },
        {
          id: 2,
          path: '/tmp/root/one/two/three/deep.txt',
          name: 'deep.txt',
          size: 1,
          mtime: 1000,
          ctime: 1000
        }
      ],
      'watch'
    )

    expect(indexFiles).toHaveBeenCalledTimes(1)
    expect(indexFiles).toHaveBeenCalledWith('/tmp/index.db', 'file-provider', 'file', [
      expect.objectContaining({ id: 1, path: '/tmp/root/a.txt' })
    ])

    await vi.advanceTimersByTimeAsync(40)
    expect(indexFiles).toHaveBeenCalledTimes(2)
    expect(indexFiles).toHaveBeenLastCalledWith('/tmp/index.db', 'file-provider', 'file', [
      expect.objectContaining({ id: 2, path: '/tmp/root/one/two/three/deep.txt' })
    ])
  })

  it('ignores watch roots rejected by the normalizer when calculating depth', async () => {
    const { indexFiles, service } = createService({
      watchPaths: ['/tmp/rejected', '/tmp/root'],
      depthDelayMs: 20,
      normalizePath: (rawPath) => (rawPath === '/tmp/rejected' ? '' : rawPath.toLowerCase())
    })

    service.schedule(
      [
        {
          id: 1,
          path: '/tmp/rejected/one/two/deep.txt',
          name: 'deep.txt',
          size: 1,
          mtime: 1000,
          ctime: 1000
        },
        {
          id: 2,
          path: '/tmp/root/one/two/deep.txt',
          name: 'root-deep.txt',
          size: 1,
          mtime: 1000,
          ctime: 1000
        }
      ],
      'watch'
    )

    expect(indexFiles).toHaveBeenCalledTimes(1)
    expect(indexFiles).toHaveBeenCalledWith('/tmp/index.db', 'file-provider', 'file', [
      expect.objectContaining({ id: 1, path: '/tmp/rejected/one/two/deep.txt' })
    ])

    await vi.advanceTimersByTimeAsync(20)
    expect(indexFiles).toHaveBeenCalledTimes(2)
    expect(indexFiles).toHaveBeenLastCalledWith('/tmp/index.db', 'file-provider', 'file', [
      expect.objectContaining({ id: 2, path: '/tmp/root/one/two/deep.txt' })
    ])
  })

  it('logs worker failures without throwing', async () => {
    const error = new Error('worker failed')
    const { indexFiles, logWarn, service } = createService()
    indexFiles.mockRejectedValueOnce(error)

    service.schedule(
      [
        {
          id: 1,
          path: '/tmp/a.txt',
          name: 'a.txt',
          size: 1,
          mtime: 1000,
          ctime: 1000
        }
      ],
      'test'
    )
    await Promise.resolve()

    expect(logWarn).toHaveBeenCalledWith('File index worker failed', error, {
      reason: 'test',
      size: 1
    })
  })
})
