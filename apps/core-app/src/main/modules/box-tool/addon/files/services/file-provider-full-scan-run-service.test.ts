import { describe, expect, it, vi } from 'vitest'
import { FileProviderFullScanRunService } from './file-provider-full-scan-run-service'
import type { ScannedFileInfo } from '../types'

function scannedFile(path: string): ScannedFileInfo {
  return {
    path,
    name: path.split('/').pop() ?? path,
    extension: '.txt',
    size: 1,
    ctime: new Date(1000),
    mtime: new Date(2000)
  }
}

describe('file-provider-full-scan-run-service', () => {
  it('scans paths, inserts mapped records, reports progress, and returns completed paths', async () => {
    const finishPerfContext = vi.fn()
    const scanDirectory = vi.fn(async function* (rootPath: string) {
      yield rootPath === '/a' ? [scannedFile('/a/one.txt')] : [scannedFile('/b/two.txt')]
    })
    const insertRecords = vi.fn(async (_rootPath, records) => ({
      insertedCount: records.length
    }))
    const emitProgress = vi.fn()
    const yieldAfterScan = vi.fn(async () => {})
    let now = 100
    const service = new FileProviderFullScanRunService({
      enterPerfContext: vi.fn(() => finishPerfContext),
      scanDirectory,
      insertRecords,
      emitProgress,
      yieldAfterScan,
      now: () => {
        now += 20
        return now
      },
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn()
    })

    const context = { runId: 'scan' }
    const result = await service.execute(['/a', '/b'], context)

    expect(scanDirectory).toHaveBeenNthCalledWith(1, '/a', undefined, context)
    expect(insertRecords).toHaveBeenNthCalledWith(
      1,
      '/a',
      [
        expect.objectContaining({
          path: '/a/one.txt',
          mtime: new Date(2000),
          ctime: new Date(1000),
          lastIndexedAt: expect.any(Date),
          isDir: false,
          type: 'file'
        })
      ],
      context
    )
    expect(emitProgress).toHaveBeenNthCalledWith(1, 0, 2)
    expect(emitProgress).toHaveBeenLastCalledWith(2, 2)
    expect(yieldAfterScan).toHaveBeenCalledTimes(2)
    expect(finishPerfContext).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      added: 2,
      completedPaths: ['/a', '/b']
    })
  })

  it('returns empty result without starting perf context when no paths are provided', async () => {
    const enterPerfContext = vi.fn()
    const service = new FileProviderFullScanRunService({
      enterPerfContext,
      scanDirectory: vi.fn(),
      insertRecords: vi.fn(),
      emitProgress: vi.fn(),
      yieldAfterScan: vi.fn(),
      now: () => 0,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn()
    })

    await expect(service.execute([], {})).resolves.toEqual({
      added: 0,
      completedPaths: []
    })
    expect(enterPerfContext).not.toHaveBeenCalled()
  })

  it('passes exclude paths to the scanner', async () => {
    const excludePathsSet = new Set(['/tmp/db.sqlite'])
    const scanDirectory = vi.fn(async function* () {})
    const service = new FileProviderFullScanRunService({
      enterPerfContext: vi.fn(() => vi.fn()),
      scanDirectory,
      insertRecords: vi.fn(),
      emitProgress: vi.fn(),
      yieldAfterScan: vi.fn(),
      now: () => 0,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn()
    })

    await service.execute(['/a'], {}, { excludePathsSet })

    expect(scanDirectory).toHaveBeenCalledWith('/a', excludePathsSet, {})
  })
})
