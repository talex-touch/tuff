import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type {
  NativeArenaIndexStats,
  NativeBulkScanResult,
  NativeFileArenaHandle,
  NativeFsEventItem
} from '@talex-touch/tuff-native/file-index'
import { NativeIndexFsEventsController, collapseSubtreePaths } from './native-index-fsevents'
import { NativeScanPolicy, buildNativeScanFilterOptions } from './native-scan-policy'

function createEvent(
  eventPath: string,
  overrides: Partial<NativeFsEventItem> = {}
): NativeFsEventItem {
  return {
    eventId: '100',
    path: eventPath,
    kind: 'file',
    action: 'modified',
    flags: 0,
    isHistoryDone: false,
    ...overrides
  }
}

function createStats(): NativeArenaIndexStats {
  return {
    fileCount: 0,
    dirCount: 0,
    activeCount: 0,
    tombstoneCount: 0,
    arenaBytes: 0,
    lastScanMs: 0,
    backend: 'delta'
  }
}

describe('native-index-fsevents', () => {
  it('collapses nested must-scan subtrees accurately', () => {
    expect(
      collapseSubtreePaths([
        '/watch/src/nested/deep',
        '/watch/src',
        '/watch/src/nested',
        '/watch/docs',
        '/watch/docs-extra/sub'
      ])
    ).toEqual(['/watch/src', '/watch/docs', '/watch/docs-extra/sub'])
  })

  it('batches lstat concurrently instead of awaiting sequentially', async () => {
    const applyDelta = vi.fn<NativeFileArenaHandle['applyDelta']>(() => createStats())
    let activeLstats = 0
    let maxConcurrentLstats = 0

    const controller = new NativeIndexFsEventsController({
      getArena: () => ({ applyDelta }) as unknown as NativeFileArenaHandle,
      getActiveRoots: () => ['/watch'],
      getFilterOptions: () => buildNativeScanFilterOptions(['/watch']),
      getCheckpoint: () => null,
      setCheckpoint: vi.fn(),
      isPathAdmitted: (p) => p.startsWith('/watch'),
      normalizePath: (p) => p,
      scanPolicy: new NativeScanPolicy({
        readdir: async () => [],
        readFile: async () => {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        }
      }),
      onDeltaApplied: vi.fn(),
      onReplayUnavailable: vi.fn(),
      logDebug: vi.fn(),
      logWarn: vi.fn(),
      lstatConcurrency: 8,
      lstat: async () => {
        activeLstats += 1
        maxConcurrentLstats = Math.max(maxConcurrentLstats, activeLstats)
        await new Promise((resolve) => setTimeout(resolve, 15))
        activeLstats -= 1
        return {
          isSymbolicLink: () => false,
          isDirectory: () => false,
          mtimeMs: 1_700_000_000_000
        }
      }
    })

    const events = Array.from({ length: 16 }, (_, idx) =>
      createEvent(`/watch/docs/file-${idx}.md`, { action: 'created' })
    )
    controller.handleFsEvents(events)
    await controller.flushPendingEvents()

    expect(maxConcurrentLstats).toBeGreaterThan(1)
    expect(maxConcurrentLstats).toBeLessThanOrEqual(8)
    expect(applyDelta).toHaveBeenCalledTimes(1)
    expect(applyDelta.mock.calls[0]?.[0]).toHaveLength(16)
  })

  it('dedupes nested must-scan subtrees, preserves must-scan on coalescing, and skips covered item lstats', async () => {
    const applyDelta = vi.fn<NativeFileArenaHandle['applyDelta']>(() => createStats())
    const lstat = vi.fn(async (_filePath: string) => ({
      isSymbolicLink: () => false,
      isDirectory: () => true,
      mtimeMs: 1_700_000_000_000
    }))
    const scanBulk = vi.fn(
      async (roots: string[]): Promise<NativeBulkScanResult> => ({
        entries: roots.map((dir) => ({
          dir,
          name: 'scanned.md',
          isDir: false,
          mtimeSec: 123
        })),
        fileCount: 1,
        dirCount: 0,
        skippedCount: 0,
        errorCount: 0,
        durationMs: 1,
        backend: 'test'
      })
    )

    const controller = new NativeIndexFsEventsController({
      getArena: () => ({ applyDelta }) as unknown as NativeFileArenaHandle,
      getActiveRoots: () => ['/watch'],
      getFilterOptions: () => buildNativeScanFilterOptions(['/watch']),
      getCheckpoint: () => null,
      setCheckpoint: vi.fn(),
      isPathAdmitted: (p) => p.startsWith('/watch'),
      normalizePath: (p) => p,
      scanPolicy: new NativeScanPolicy({
        readdir: async () => [],
        readFile: async () => {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        }
      }),
      onDeltaApplied: vi.fn(),
      onReplayUnavailable: vi.fn(),
      logDebug: vi.fn(),
      logWarn: vi.fn(),
      scanBulk,
      lstat
    })

    controller.handleFsEvents([
      createEvent('/watch/src', { kind: 'dir', action: 'must-scan' }),
      // A later 'modified' on the same dir must NOT overwrite 'must-scan'
      createEvent('/watch/src', { kind: 'dir', action: 'modified' }),
      createEvent('/watch/src/nested', { kind: 'dir', action: 'must-scan' }),
      createEvent('/watch/src/nested/child.ts', { kind: 'file', action: 'created' }),
      createEvent('/watch/other.md', { kind: 'file', action: 'created' })
    ])
    await controller.flushPendingEvents()

    expect(scanBulk).toHaveBeenCalledTimes(1)
    expect(scanBulk.mock.calls[0]?.[0]).toEqual(['/watch/src'])
    // Only '/watch/other.md' and the non-root must-scan dir '/watch/src' itself are lstat'ed;
    // '/watch/src/nested/child.ts' is covered by '/watch/src' must-scan and skipped.
    const lstatPaths = lstat.mock.calls.map((call) => call[0])
    expect(lstatPaths).not.toContain('/watch/src/nested/child.ts')
    expect(lstatPaths).toContain('/watch/other.md')
  })

  it('bounds event storms into collapsed must-scan subtrees instead of unbounded map growth', async () => {
    const applyDelta = vi.fn<NativeFileArenaHandle['applyDelta']>(() => createStats())
    const scanBulk = vi.fn(
      async (_roots: string[]): Promise<NativeBulkScanResult> => ({
        entries: [],
        fileCount: 0,
        dirCount: 0,
        skippedCount: 0,
        errorCount: 0,
        durationMs: 1,
        backend: 'test'
      })
    )
    const lstat = vi.fn(async (_filePath: string) => ({
      isSymbolicLink: () => false,
      isDirectory: () => true,
      mtimeMs: 1_700_000_000_000
    }))

    const controller = new NativeIndexFsEventsController({
      getArena: () => ({ applyDelta }) as unknown as NativeFileArenaHandle,
      getActiveRoots: () => ['/watch'],
      getFilterOptions: () => buildNativeScanFilterOptions(['/watch']),
      getCheckpoint: () => null,
      setCheckpoint: vi.fn(),
      isPathAdmitted: (p) => p.startsWith('/watch'),
      normalizePath: (p) => p,
      scanPolicy: new NativeScanPolicy({
        readdir: async () => [],
        readFile: async () => {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        }
      }),
      onDeltaApplied: vi.fn(),
      onReplayUnavailable: vi.fn(),
      logDebug: vi.fn(),
      logWarn: vi.fn(),
      maxPendingEvents: 16,
      scanBulk,
      lstat
    })

    const stormEvents = Array.from({ length: 120 }, (_, i) =>
      createEvent(path.join('/watch', `dir-${i % 40}`, `file-${i}.txt`), { action: 'created' })
    )
    controller.handleFsEvents(stormEvents)

    expect(controller.getPendingCount()).toBeLessThanOrEqual(16)
    await controller.flushPendingEvents()

    expect(scanBulk).toHaveBeenCalledTimes(1)
    // Collapsed into watch root '/watch' when distinct subtrees exceed 32.
    expect(scanBulk.mock.calls[0]?.[0]).toEqual(['/watch'])
  })
})
