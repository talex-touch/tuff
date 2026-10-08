import type { ScannedFileInfo } from '../types'
import { describe, expect, it } from 'vitest'
import { FileProviderFullScanCheckpointService } from './file-provider-full-scan-checkpoint-service'
import { FileProviderFullScanRunService } from './file-provider-full-scan-run-service'
import type { FileProviderFullScanRunDeps } from './file-provider-full-scan-run-service'

function checkpointHarness(input: {
  completed: Set<string>
  quality?: Record<string, 'error' | 'unknown'>
  abortAt?: string
  entered?: { resolve: () => void }
  publication?: Promise<void>
}) {
  const persisted: string[] = []
  const disk = ['/h/a/one.txt', '/h/b/one.txt', '/h/c/one.txt', '/h/root.txt', '/h/db.sqlite']
  const checkpoints = new FileProviderFullScanCheckpointService({
    listChildDirectories: async () => ['/h/a', '/h/b', '/h/c'],
    getCompletedPaths: async (paths) => new Set(paths.filter((path) => input.completed.has(path))),
    recordCompleted: async (path) => {
      input.completed.add(path)
    },
    clearCompleted: async (paths) => {
      for (const path of paths) input.completed.delete(path)
    }
  })
  const deps: FileProviderFullScanRunDeps<undefined> = {
    enterPerfContext: () => () => undefined,
    checkpoints,
    scanDirectory: async function* (scope, excluded, _context, onStats) {
      if (input.abortAt === scope) throw new Error('scan aborted')
      const paths = disk.filter(
        (path) =>
          path.startsWith(`${scope}/`) &&
          ![...(excluded ?? [])].some(
            (excludedPath) => path === excludedPath || path.startsWith(`${excludedPath}/`)
          )
      )
      const files: ScannedFileInfo[] = paths.map((path) => ({
        path,
        name: path.split('/').at(-1)!,
        extension: '.txt',
        size: 1,
        ctime: new Date(1000),
        mtime: new Date(2000)
      }))
      yield files
      if (input.quality?.[scope] !== 'unknown') {
        onStats({
          entryCount: files.length,
          errorCount: input.quality?.[scope] === 'error' ? 1 : 0
        })
      }
    },
    insertRecords: async (_root, records) => {
      persisted.push(...records.map((record) => record.path))
      if (records.some((record) => record.path === '/h/a/one.txt') && input.publication) {
        input.entered?.resolve()
        await input.publication
      }
      return { insertedCount: records.length }
    },
    emitProgress: () => undefined,
    yieldAfterScan: async () => undefined,
    now: () => 0,
    formatDuration: (duration) => `${duration}ms`,
    logDebug: () => undefined
  }
  return { service: new FileProviderFullScanRunService(deps), persisted, checkpoints }
}

describe('fullscan resumable checkpoint state', () => {
  it('skips previously completed children and root-only traversal does not reinsert their descendants', async () => {
    const completed = new Set(['/h/b'])
    const harness = checkpointHarness({ completed })
    const excluded = new Set(['/h/db.sqlite'])
    const result = await harness.service.execute(['/h'], undefined, { excludePathsSet: excluded })
    expect(harness.persisted).toEqual(['/h/a/one.txt', '/h/c/one.txt', '/h/root.txt'])
    expect([...completed].sort()).toEqual(['/h/a', '/h/b', '/h/c'])
    expect(result.added).toBe(3)
    expect(result.completedPaths).toEqual(['/h'])
    expect(result.checkpointsToClear.get('/h')).toEqual(['/h/a', '/h/b', '/h/c'])
    expect([...excluded]).toEqual(['/h/db.sqlite'])
  })

  it.each(['error', 'unknown'] as const)(
    'does not checkpoint a child or finish its root after %s scan quality',
    async (quality) => {
      const completed = new Set<string>()
      const harness = checkpointHarness({ completed, quality: { '/h/b': quality } })
      const result = await harness.service.execute(['/h'], undefined, {
        excludePathsSet: new Set(['/h/db.sqlite'])
      })
      expect([...completed].sort()).toEqual(['/h/a', '/h/c'])
      expect(result.completedPaths).toEqual([])
      expect(harness.persisted).toEqual([
        '/h/a/one.txt',
        '/h/b/one.txt',
        '/h/c/one.txt',
        '/h/root.txt'
      ])
      expect(result.added).toBe(4)
    }
  )

  it('keeps earlier committed child checkpoints when a later scanner aborts', async () => {
    const completed = new Set<string>()
    const harness = checkpointHarness({ completed, abortAt: '/h/b' })
    await expect(harness.service.execute(['/h'], undefined)).rejects.toThrow('scan aborted')
    expect([...completed]).toEqual(['/h/a'])
    expect(harness.persisted).toEqual(['/h/a/one.txt'])
  })

  it('does not checkpoint an inserted child until its commit publication finishes', async () => {
    const completed = new Set<string>()
    const entered = Promise.withResolvers<void>()
    const publication = Promise.withResolvers<void>()
    const harness = checkpointHarness({ completed, entered, publication: publication.promise })
    const operation = harness.service.execute(['/h'], undefined, {
      excludePathsSet: new Set(['/h/db.sqlite'])
    })
    try {
      await entered.promise
      expect([...completed]).toEqual([])
      expect(harness.persisted).toEqual(['/h/a/one.txt'])
      publication.resolve()
      expect((await operation).completedPaths).toEqual(['/h'])
      expect([...completed].sort()).toEqual(['/h/a', '/h/b', '/h/c'])
    } finally {
      publication.resolve()
      await operation
    }
  })
})
