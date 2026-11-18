import fs from 'node:fs/promises'
import path from 'node:path'
import {
  createNativeFsEventsWatcher,
  getFileIndexSupport,
  scanDirectoryBulk,
  type NativeArenaIndexStats,
  type NativeBulkScanResult,
  type NativeDeltaEntry,
  type NativeFileArenaHandle,
  type NativeFsEventItem,
  type NativeFsEventsWatcherHandle,
  type NativeScanFilterOptions
} from '@talex-touch/tuff-native/file-index'
import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import { buildWatchRootsKey, type NativeFsCheckpointState } from './native-index-store'
import {
  NativeScanPolicy,
  hasExcludedPathSegmentNormalized,
  isSearchableNativeEntry
} from './native-scan-policy'

export const NATIVE_DELTA_DEBOUNCE_MS = 160
export const NATIVE_FSEVENTS_LSTAT_CONCURRENCY = 16
export const NATIVE_FSEVENTS_MAX_PENDING_EVENTS = 2_048
export const NATIVE_FSEVENTS_MAX_STORM_SUBTREES = 32

export interface NativeIndexFsEventsDeps {
  getArena: () => NativeFileArenaHandle | null
  getActiveRoots: () => readonly string[]
  getFilterOptions: () => NativeScanFilterOptions
  getCheckpoint: () => NativeFsCheckpointState | null
  setCheckpoint: (next: NativeFsCheckpointState) => void
  isPathAdmitted: (filePath: string) => boolean
  normalizePath: (rawPath: string) => string
  scanPolicy: NativeScanPolicy
  onDeltaApplied: () => void
  onReplayUnavailable: () => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  createWatcher?: () => NativeFsEventsWatcherHandle | null
  scanBulk?: (roots: string[], options?: NativeScanFilterOptions) => Promise<NativeBulkScanResult>
  lstat?: (filePath: string) => Promise<{
    isSymbolicLink: () => boolean
    isDirectory: () => boolean
    mtimeMs: number
  }>
  maxPendingEvents?: number
  debounceMs?: number
  lstatConcurrency?: number
}

function isMissingFileError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export function isPathEqualOrDescendant(candidatePath: string, ancestorPath: string): boolean {
  if (candidatePath === ancestorPath) return true
  if (ancestorPath === '/' || ancestorPath === '\\') {
    return candidatePath.startsWith(ancestorPath)
  }
  return candidatePath.startsWith(`${ancestorPath}${path.sep}`)
}

/**
 * Deduplicates and collapses nested `must-scan` directory paths so scanning an ancestor
 * covers all descendants without redundant bulk scans.
 */
export function collapseSubtreePaths(rawPaths: readonly string[]): string[] {
  if (rawPaths.length === 0) return []
  const unique = Array.from(new Set(rawPaths.filter(Boolean))).sort((a, b) => a.length - b.length)
  const kept: string[] = []
  for (const candidate of unique) {
    if (!kept.some((ancestor) => isPathEqualOrDescendant(candidate, ancestor))) {
      kept.push(candidate)
    }
  }
  return kept
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  isCancelled: () => boolean,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0 || isCancelled()) return
  const poolSize = Math.min(Math.max(1, concurrency), items.length)
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: poolSize }, async () => {
      while (!isCancelled()) {
        const index = nextIndex
        nextIndex += 1
        if (index >= items.length) break
        await worker(items[index]!)
      }
    })
  )
}

/**
 * Manages the native macOS FSEvents stream, storm-bounded coalescing batcher, `must-scan` subtree
 * deduplication, and concurrent `lstat` inspection before applying deltas to `NativeFileArena`.
 */
export class NativeIndexFsEventsController {
  private watcher: NativeFsEventsWatcherHandle | null = null
  private pendingEvents = new Map<string, NativeFsEventItem>()
  private deltaTimer: NodeJS.Timeout | null = null
  private deltaFlushInFlight: Promise<void> | null = null
  private stopping = false
  private overflowCollapseCount = 0

  private readonly maxPendingEvents: number
  private readonly debounceMs: number
  private readonly lstatConcurrency: number
  private readonly createWatcherFn: () => NativeFsEventsWatcherHandle | null
  private readonly scanBulkFn: (
    roots: string[],
    options?: NativeScanFilterOptions
  ) => Promise<NativeBulkScanResult>
  private readonly lstatFn: (filePath: string) => Promise<{
    isSymbolicLink: () => boolean
    isDirectory: () => boolean
    mtimeMs: number
  }>

  constructor(private readonly deps: NativeIndexFsEventsDeps) {
    this.maxPendingEvents = Math.max(
      16,
      deps.maxPendingEvents ?? NATIVE_FSEVENTS_MAX_PENDING_EVENTS
    )
    this.debounceMs = Math.max(0, deps.debounceMs ?? NATIVE_DELTA_DEBOUNCE_MS)
    this.lstatConcurrency = Math.max(1, deps.lstatConcurrency ?? NATIVE_FSEVENTS_LSTAT_CONCURRENCY)
    this.createWatcherFn = deps.createWatcher ?? createNativeFsEventsWatcher
    this.scanBulkFn = deps.scanBulk ?? scanDirectoryBulk
    this.lstatFn = deps.lstat ?? ((target) => fs.lstat(target))
  }

  public start(roots: string[], hasNativeFsevents = getFileIndexSupport().hasNativeFsevents): void {
    this.stopping = false
    if (!hasNativeFsevents || roots.length === 0) return
    this.stopWatcherOnly()

    const watcher = this.createWatcherFn()
    if (!watcher) return

    const checkpoint = this.deps.getCheckpoint()
    try {
      const startResult = watcher.start(
        {
          roots,
          sinceEventId: checkpoint?.lastEventId ?? undefined,
          volumeUuid: checkpoint?.volumeUuid ?? undefined,
          latencyMs: 350
        },
        (events) => this.handleFsEvents(events)
      )
      this.watcher = watcher

      if (!startResult.replayingSinceWhen && checkpoint?.lastEventId) {
        this.deps.onReplayUnavailable()
      } else if (startResult.checkpoint.volumeUuid && startResult.checkpoint.currentEventId) {
        this.deps.setCheckpoint({
          version: 1,
          watchRootsKey: buildWatchRootsKey(roots),
          volumeUuid: startResult.checkpoint.volumeUuid,
          lastEventId: checkpoint?.lastEventId ?? startResult.checkpoint.currentEventId,
          updatedAt: Date.now()
        })
      }
    } catch (error) {
      this.deps.logWarn('Failed to start native FSEvents watcher for file arena', error)
    }
  }

  public async stop(): Promise<void> {
    this.stopping = true
    if (this.deltaTimer) {
      clearTimeout(this.deltaTimer)
      this.deltaTimer = null
    }
    this.pendingEvents.clear()
    this.stopWatcherOnly()
    await this.deltaFlushInFlight?.catch(() => undefined)
  }

  public resetStoppingState(): void {
    this.stopping = false
  }

  public getPendingCount(): number {
    return this.pendingEvents.size
  }

  /** Accepts a batch of raw FSEvents, coalesces paths, bounds storms, and schedules debounced flush. */
  public handleFsEvents(events: NativeFsEventItem[]): void {
    if (this.stopping || events.length === 0) return

    const activeRoots = this.deps.getActiveRoots()
    let newestEventId: string | null = null

    for (const event of events) {
      if (event.eventId && event.eventId !== '0') {
        newestEventId = event.eventId
      }
      if (event.isHistoryDone || event.action === 'history-done') {
        continue
      }
      const normalized = this.deps.normalizePath(event.path)
      if (!normalized) continue

      const normalizedFs = normalizeFsPath(normalized)
      // Drop high-volume excluded non-removal churn (node_modules/.git/~/Library) before queueing.
      if (
        event.action !== 'removed' &&
        event.action !== 'renamed' &&
        (!this.deps.isPathAdmitted(normalized) ||
          hasExcludedPathSegmentNormalized(normalizedFs, activeRoots, event.kind === 'dir'))
      ) {
        continue
      }

      const existing = this.pendingEvents.get(normalized)
      if (existing?.action === 'must-scan' && event.action !== 'must-scan') {
        // Never downgrade a subtree invalidation into a single-item modification/creation.
        continue
      }

      const nextItem = normalized === event.path ? event : { ...event, path: normalized }

      if (!existing && this.pendingEvents.size >= this.maxPendingEvents) {
        this.collapsePendingStorm(normalized, nextItem, activeRoots)
        continue
      }

      this.pendingEvents.set(normalized, nextItem)
    }

    const checkpoint = this.deps.getCheckpoint()
    if (newestEventId && checkpoint) {
      this.deps.setCheckpoint({
        ...checkpoint,
        lastEventId: newestEventId,
        updatedAt: Date.now()
      })
    }

    this.scheduleFlushIfNeeded()
  }

  public async flushPendingEvents(): Promise<void> {
    if (this.stopping || !this.deps.getArena() || this.pendingEvents.size === 0) return
    if (this.deltaFlushInFlight) {
      await this.deltaFlushInFlight.catch(() => undefined)
      if (this.stopping || this.pendingEvents.size === 0) return
    }

    const batch = Array.from(this.pendingEvents.values())
    this.pendingEvents.clear()
    const stormCollapses = this.overflowCollapseCount
    this.overflowCollapseCount = 0

    const run = this.processBatch(batch, stormCollapses).finally(() => {
      if (this.deltaFlushInFlight === run) {
        this.deltaFlushInFlight = null
      }
      if (!this.stopping && this.pendingEvents.size > 0) {
        this.scheduleFlushIfNeeded()
      }
    })

    this.deltaFlushInFlight = run
    await run
  }

  private scheduleFlushIfNeeded(): void {
    if (this.stopping || this.pendingEvents.size === 0 || this.deltaTimer) return
    this.deltaTimer = setTimeout(() => {
      this.deltaTimer = null
      void this.flushPendingEvents()
    }, this.debounceMs)
    this.deltaTimer.unref?.()
  }

  private stopWatcherOnly(): void {
    if (!this.watcher) return
    try {
      this.watcher.stop()
    } catch (error) {
      this.deps.logWarn('Failed to stop native FSEvents watcher', error)
    }
    this.watcher = null
  }

  private collapsePendingStorm(
    incomingPath: string,
    incomingItem: NativeFsEventItem,
    activeRoots: readonly string[]
  ): void {
    this.overflowCollapseCount += 1
    const parentDirs: string[] = []
    for (const [eventPath, existing] of this.pendingEvents) {
      if (existing.action === 'must-scan') {
        parentDirs.push(eventPath)
      } else if (existing.kind === 'dir') {
        parentDirs.push(eventPath)
      } else {
        parentDirs.push(path.dirname(eventPath))
      }
    }
    parentDirs.push(
      incomingItem.action === 'must-scan' || incomingItem.kind === 'dir'
        ? incomingPath
        : path.dirname(incomingPath)
    )

    let collapsed = collapseSubtreePaths(parentDirs)
    if (collapsed.length > NATIVE_FSEVENTS_MAX_STORM_SUBTREES) {
      collapsed = collapseSubtreePaths(
        activeRoots.map((root) => this.deps.normalizePath(root)).filter(Boolean)
      )
    }

    this.pendingEvents.clear()
    for (const dirPath of collapsed) {
      this.pendingEvents.set(dirPath, {
        eventId: incomingItem.eventId,
        path: dirPath,
        kind: 'dir',
        action: 'must-scan',
        flags: incomingItem.flags,
        isHistoryDone: false
      })
    }
  }

  private async processBatch(
    batch: readonly NativeFsEventItem[],
    stormCollapses: number
  ): Promise<void> {
    const arena = this.deps.getArena()
    if (!arena || this.stopping) return

    const activeRoots = this.deps.getActiveRoots()
    this.deps.scanPolicy.invalidatePaths(batch.map((event) => event.path))

    const rawMustScanDirs: string[] = []
    const itemEvents: NativeFsEventItem[] = []
    for (const event of batch) {
      if (event.action === 'must-scan') {
        rawMustScanDirs.push(event.path)
      } else {
        itemEvents.push(event)
      }
    }

    const dedupedMustScanDirs = collapseSubtreePaths(rawMustScanDirs)
    const upserts: NativeDeltaEntry[] = []
    const removedPaths: string[] = []
    const removedPrefixes: string[] = []
    const validMustScanDirs: string[] = []

    await runWithConcurrency(
      dedupedMustScanDirs,
      this.lstatConcurrency,
      () => this.stopping,
      async (dirPath) => {
        const normalized = normalizeFsPath(dirPath)
        if (
          !this.deps.isPathAdmitted(dirPath) ||
          hasExcludedPathSegmentNormalized(normalized, activeRoots, true) ||
          (await this.deps.scanPolicy.hasExcludedAncestorDirectory(dirPath, activeRoots, true))
        ) {
          removedPrefixes.push(dirPath)
          return
        }
        validMustScanDirs.push(dirPath)
      }
    )

    const activeMustScans = collapseSubtreePaths(validMustScanDirs)
    const filteredEvents =
      activeMustScans.length > 0
        ? itemEvents.filter(
            (event) => !activeMustScans.some((dir) => isPathEqualOrDescendant(event.path, dir))
          )
        : itemEvents

    const renamedDirsToScan: string[] = []

    await runWithConcurrency(
      filteredEvents,
      this.lstatConcurrency,
      () => this.stopping,
      async (event) => {
        const normalized = normalizeFsPath(event.path)
        if (
          hasExcludedPathSegmentNormalized(normalized, activeRoots, event.kind === 'dir') ||
          !this.deps.isPathAdmitted(event.path)
        ) {
          if (event.kind === 'dir') removedPrefixes.push(event.path)
          else removedPaths.push(event.path)
          return
        }

        try {
          const stat = await this.lstatFn(event.path)
          if (stat.isSymbolicLink()) {
            if (event.kind === 'dir') removedPrefixes.push(event.path)
            else removedPaths.push(event.path)
            return
          }
          const isDir = stat.isDirectory()
          const name = path.basename(event.path)
          const excludedAncestor = await this.deps.scanPolicy.hasExcludedAncestorDirectory(
            event.path,
            activeRoots,
            isDir
          )
          if (excludedAncestor || !isSearchableNativeEntry(event.path, name, isDir, activeRoots)) {
            if (isDir) removedPrefixes.push(event.path)
            else removedPaths.push(event.path)
            return
          }
          upserts.push({
            dir: path.dirname(event.path),
            name,
            isDir,
            mtimeSec: Math.max(0, Math.floor(stat.mtimeMs / 1000))
          })
          if (isDir && event.action === 'renamed') {
            renamedDirsToScan.push(event.path)
          }
        } catch (error) {
          if (isMissingFileError(error) || event.action === 'removed') {
            if (event.kind === 'dir') removedPrefixes.push(event.path)
            else removedPaths.push(event.path)
          }
        }
      }
    )

    const dirsToScan = collapseSubtreePaths([...activeMustScans, ...renamedDirsToScan])
    if (dirsToScan.length > 0 && !this.stopping) {
      const scanned = await this.scanBulkFn(dirsToScan, this.deps.getFilterOptions()).catch(
        () => null
      )
      if (scanned) {
        const activeRootSet = new Set(activeRoots.map((root) => normalizeFsPath(root)))
        for (const dir of dirsToScan) {
          removedPrefixes.push(dir)
          const normalizedDir = normalizeFsPath(dir)
          if (!activeRootSet.has(normalizedDir)) {
            try {
              const dirStat = await this.lstatFn(dir)
              const dirName = path.basename(dir)
              if (
                !dirStat.isSymbolicLink() &&
                dirStat.isDirectory() &&
                isSearchableNativeEntry(dir, dirName, true, activeRoots)
              ) {
                upserts.push({
                  dir: path.dirname(dir),
                  name: dirName,
                  isDir: true,
                  mtimeSec: Math.max(0, Math.floor(dirStat.mtimeMs / 1000))
                })
              }
            } catch {
              // Directory disappeared between event and scan; removedPrefixes already covers it.
            }
          }
        }
        for (const entry of scanned.entries) {
          upserts.push({
            dir: entry.dir,
            name: entry.name,
            isDir: entry.isDir,
            mtimeSec: entry.mtimeSec
          })
        }
      }
    }

    if (stormCollapses > 0) {
      this.deps.logDebug('Collapsed FSEvents burst into bounded subtree scans', {
        collapses: stormCollapses,
        scannedSubtrees: dirsToScan.length
      })
    }

    if ((upserts.length > 0 || removedPaths.length > 0 || removedPrefixes.length > 0) && arena) {
      const stats: NativeArenaIndexStats = arena.applyDelta(upserts, removedPaths, removedPrefixes)
      this.deps.logDebug('Applied native FSEvents delta', {
        upserts: upserts.length,
        removedPaths: removedPaths.length,
        removedPrefixes: removedPrefixes.length,
        activeCount: stats.activeCount
      })
      this.deps.onDeltaApplied()
    }
  }
}
