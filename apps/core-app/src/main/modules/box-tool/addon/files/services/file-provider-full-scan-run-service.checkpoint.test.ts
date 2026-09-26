import type { ScannedFileInfo } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { FileProviderFullScanCheckpointService } from './file-provider-full-scan-checkpoint-service'
import { FileProviderFullScanRunService } from './file-provider-full-scan-run-service'

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

interface Harness {
  service: FileProviderFullScanRunService<{ signal?: AbortSignal }>
  scanDirectory: ReturnType<typeof vi.fn>
  recordCompleted: ReturnType<typeof vi.fn>
  clearCompleted: ReturnType<typeof vi.fn>
  emitProgress: ReturnType<typeof vi.fn>
}

function createHarness(input: {
  children: Record<string, string[]>
  completed?: string[]
  /** Throws once the walk reaches this directory: a restart in the middle of a root. */
  abortAt?: string
}): Harness {
  const recordCompleted = vi.fn(async () => undefined)
  const clearCompleted = vi.fn(async () => undefined)
  const emitProgress = vi.fn()
  const checkpoints = new FileProviderFullScanCheckpointService({
    listChildDirectories: async (rootPath) => input.children[rootPath] ?? [],
    getCompletedPaths: async (paths) =>
      new Set(paths.filter((path) => (input.completed ?? []).includes(path))),
    recordCompleted,
    clearCompleted
  })
  const scanDirectory = vi.fn(async function* (scanPath: string) {
    if (input.abortAt === scanPath) throw new Error('scan aborted')
    yield [scannedFile(`${scanPath}/one.txt`)]
  })
  const service = new FileProviderFullScanRunService<{ signal?: AbortSignal }>({
    enterPerfContext: vi.fn(() => vi.fn()),
    scanDirectory,
    insertRecords: vi.fn(async (_rootPath, records) => ({ insertedCount: records.length })),
    emitProgress,
    yieldAfterScan: vi.fn(async () => {}),
    now: () => 0,
    formatDuration: (durationMs) => `${durationMs}ms`,
    logDebug: vi.fn(),
    checkpoints
  })
  return { service, scanDirectory, recordCompleted, clearCompleted, emitProgress }
}

/**
 * A root used to be one unit of work: no record until the whole tree was walked, so every restart
 * started the home directory over. With checkpoints each top-level child is a unit, the root's
 * own files come last, and the child records are handed back to be cleared once the root's own
 * record exists.
 */
describe('FileProviderFullScanRunService with checkpoints', () => {
  it('skips children a previous run completed and walks the rest, then the root alone', async () => {
    const harness = createHarness({
      children: { '/h': ['/h/a', '/h/b', '/h/c'] },
      completed: ['/h/b']
    })
    const excludePathsSet = new Set(['/h/db.sqlite'])
    const result = await harness.service.execute(['/h'], {}, { excludePathsSet })

    const scanned = harness.scanDirectory.mock.calls.map((call) => call[0])
    expect(scanned).toEqual(['/h/a', '/h/c', '/h'])
    // The root-only walk excludes every child, so the walker descends into none of them.
    const rootOnlyExcludes = harness.scanDirectory.mock.calls[2]![1] as Set<string>
    expect([...rootOnlyExcludes].sort()).toEqual(['/h/a', '/h/b', '/h/c', '/h/db.sqlite'])
    expect(excludePathsSet.size).toBe(1)

    expect(harness.recordCompleted.mock.calls.map((call) => call[0])).toEqual(['/h/a', '/h/c'])
    expect(result.completedPaths).toEqual(['/h'])
    expect(result.checkpointsToClear.get('/h')).toEqual(['/h/a', '/h/b', '/h/c'])
    expect(result.added).toBe(3)
  })

  it('writes a child checkpoint only after that child is inserted, and keeps them on abort', async () => {
    const harness = createHarness({
      children: { '/h': ['/h/a', '/h/b', '/h/c'] },
      abortAt: '/h/b'
    })
    await expect(harness.service.execute(['/h'], {})).rejects.toThrow('scan aborted')
    expect(harness.recordCompleted.mock.calls.map((call) => call[0])).toEqual(['/h/a'])
    expect(harness.clearCompleted).not.toHaveBeenCalled()
  })

  it('reports progress per child so a resumed root does not start from zero', async () => {
    const harness = createHarness({
      children: { '/h': ['/h/a', '/h/b'] },
      completed: ['/h/a']
    })
    await harness.service.execute(['/h'], {})
    // 3 units: two children plus the root itself; one child was already done.
    expect(harness.emitProgress.mock.calls).toContainEqual([1, 3])
    expect(harness.emitProgress.mock.calls).toContainEqual([2, 3])
  })

  it('walks a root whole when it has no children to checkpoint', async () => {
    const harness = createHarness({ children: {} })
    const result = await harness.service.execute(['/flat'], {})
    expect(harness.scanDirectory.mock.calls.map((call) => call[0])).toEqual(['/flat'])
    expect(harness.recordCompleted).not.toHaveBeenCalled()
    expect(result.checkpointsToClear.size).toBe(0)
    expect(result.completedPaths).toEqual(['/flat'])
  })
})
