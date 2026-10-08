import { describe, expect, it } from 'vitest'
import { FileProviderFullScanRunService } from './file-provider-full-scan-run-service'
import type { FileProviderFullScanRunDeps } from './file-provider-full-scan-run-service'
import type { ScannedFileInfo } from '../types'

function scannedFile(path: string): ScannedFileInfo {
  return {
    path,
    name: path.split('/').at(-1)!,
    extension: '.txt',
    size: 1,
    ctime: new Date(1000),
    mtime: new Date(2000)
  }
}

describe('fullscan completion evidence', () => {
  it.each([
    {
      name: 'a clean completed scan',
      stats: { entryCount: 2, errorCount: 0 },
      completed: ['/root']
    },
    {
      name: 'a scan with unreadable entries',
      stats: { entryCount: 2, errorCount: 1 },
      completed: []
    },
    { name: 'an unknown scan outcome', stats: null, completed: [] }
  ])(
    'counts actual committed rows and reports root completion only for $name',
    async ({ stats, completed }) => {
      const persisted: Array<{ path: string; mtime: number; ctime: number }> = []
      const deps: FileProviderFullScanRunDeps<undefined> = {
        enterPerfContext: () => () => undefined,
        scanDirectory: async function* (_root, _excluded, _context, onStats) {
          yield [scannedFile('/root/admitted.txt'), scannedFile('/root/skipped.txt')]
          if (stats) onStats(stats)
        },
        insertRecords: async (_root, records) => {
          const admitted = records.filter((record) => record.path !== '/root/skipped.txt')
          for (const record of admitted) {
            persisted.push({
              path: record.path,
              mtime: (record.mtime as Date).getTime(),
              ctime: (record.ctime as Date).getTime()
            })
          }
          return { insertedCount: admitted.length }
        },
        emitProgress: () => undefined,
        yieldAfterScan: async () => undefined,
        now: () => 0,
        formatDuration: (duration) => `${duration}ms`,
        logDebug: () => undefined
      }
      const result = await new FileProviderFullScanRunService(deps).execute(['/root'], undefined)
      expect(result.added).toBe(1)
      expect(result.completedPaths).toEqual(completed)
      expect(persisted).toEqual([{ path: '/root/admitted.txt', mtime: 2000, ctime: 1000 }])
    }
  )
})
