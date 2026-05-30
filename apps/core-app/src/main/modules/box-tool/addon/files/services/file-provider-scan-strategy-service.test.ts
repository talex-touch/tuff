import { describe, expect, it, vi } from 'vitest'
import { FileProviderScanStrategyService } from './file-provider-scan-strategy-service'

describe('file-provider-scan-strategy-service', () => {
  it('splits watch paths into new full-scan paths and reconciliation paths', async () => {
    const yieldAfterRead = vi.fn(async () => {})
    const logDebug = vi.fn()
    const logInfo = vi.fn()
    let now = 100
    const service = new FileProviderScanStrategyService({
      getCompletedPaths: async () => new Set(['/Users/me/Documents']),
      yieldAfterRead,
      now: () => {
        now += 25
        return now
      },
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug,
      logInfo
    })

    const result = await service.resolve(['/Users/me/Documents', '/Users/me/Downloads'])

    expect(result).toEqual({
      completedScanPaths: new Set(['/Users/me/Documents']),
      newPathsToScan: ['/Users/me/Downloads'],
      reconciliationPaths: ['/Users/me/Documents']
    })
    expect(yieldAfterRead).toHaveBeenCalledTimes(1)
    expect(logDebug).toHaveBeenCalledWith(
      'File indexing scan strategy',
      expect.objectContaining({
        totalWatchPaths: 2,
        completedScansCount: 1,
        newPathsCount: 1,
        reconciliationCount: 1
      })
    )
    expect(logInfo).toHaveBeenCalledWith('Scan strategy prepared', {
      newPaths: 1,
      reconciliationPaths: 1,
      duration: '25ms'
    })
  })

  it('treats all watch paths as new when no path has completed scan progress', async () => {
    const service = new FileProviderScanStrategyService({
      getCompletedPaths: async () => new Set(),
      yieldAfterRead: async () => {},
      now: () => 100,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn(),
      logInfo: vi.fn()
    })

    await expect(service.resolve(['/a', '/b'])).resolves.toEqual({
      completedScanPaths: new Set(),
      newPathsToScan: ['/a', '/b'],
      reconciliationPaths: []
    })
  })
})
