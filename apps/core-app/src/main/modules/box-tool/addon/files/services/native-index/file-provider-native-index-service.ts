import fs from 'node:fs/promises'
import path from 'node:path'
import type { TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import {
  createNativeFileArena,
  getFileIndexSupport,
  getFseventsVolumeCheckpoint,
  type NativeArenaIndexStats,
  type NativeFileArenaHandle,
  type NativeScanFilterOptions
} from '@talex-touch/tuff-native/file-index'
import type { files as filesSchema } from '../../../../../../db/schema'
import type { FileTypeTag } from '../../constants'
import type { FileProviderSearchFilters } from '../file-provider-search-result-service'
import { NativeIndexFsEventsController } from './native-index-fsevents'
import { executeNativeArenaSearch } from './native-index-search'
import {
  buildWatchRootsKey,
  NativeIndexStore,
  type NativeFsCheckpointState
} from './native-index-store'
import { NativeScanPolicy, buildNativeScanFilterOptions } from './native-scan-policy'

type FileRecord = typeof filesSchema.$inferSelect

const NATIVE_SNAPSHOT_SAVE_DEBOUNCE_MS = 30_000

type NativeArenaWithHasPath = NativeFileArenaHandle & {
  hasPath?: (fullPath: string) => boolean
}

export interface FileProviderNativeIndexServiceDeps {
  providerId: string
  providerName: string
  getWatchPaths: () => string[]
  getStorageDir: () => string | null
  isContentIndexingEnabled: () => boolean
  isPathAdmitted: (filePath: string) => boolean
  normalizePath: (rawPath: string) => string
  buildItem: (file: FileRecord, extensions: Record<string, string>) => TuffItem
  extractFilters: (rawText: string) => FileProviderSearchFilters
  resolveExtensionsForTypeFilters: (typeFilters: Set<FileTypeTag>) => string[]
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

async function resolveExistingRoots(
  rawPaths: string[],
  normalizePath: (rawPath: string) => string
): Promise<string[]> {
  const resolved = await Promise.all(
    rawPaths.map(async (raw) => {
      const normalized = normalizePath(raw)
      if (!normalized) return null
      try {
        const stat = await fs.lstat(normalized)
        return stat.isDirectory() && !stat.isSymbolicLink() ? normalized : null
      } catch {
        return null
      }
    })
  )
  return Array.from(new Set(resolved.filter((p): p is string => Boolean(p))))
}

/**
 * In-memory native non-content file index backed by `@talex-touch/tuff-native/file-index`.
 * Coordinates scan policy, atomic snapshot/checkpoint recovery, FSEvents delta updates, and
 * bounded lazy-`lstat` search execution.
 */
export class FileProviderNativeIndexService {
  private arena: NativeFileArenaHandle | null = null
  private startPromise: Promise<boolean> | null = null
  private stopping = false
  private ready = false
  private activeRoots: string[] = []
  private cachedFilterOptions: NativeScanFilterOptions | null = null
  private checkpoint: NativeFsCheckpointState | null = null
  private snapshotSaveTimer: NodeJS.Timeout | null = null
  private snapshotDirty = false
  private refreshInFlight: Promise<void> | null = null

  private readonly scanPolicy = new NativeScanPolicy()
  private readonly store: NativeIndexStore
  private readonly fsEvents: NativeIndexFsEventsController

  constructor(private readonly deps: FileProviderNativeIndexServiceDeps) {
    this.store = new NativeIndexStore({
      getStorageDir: deps.getStorageDir,
      logInfo: deps.logInfo,
      logDebug: deps.logDebug,
      logWarn: deps.logWarn
    })
    this.fsEvents = new NativeIndexFsEventsController({
      getArena: () => this.arena,
      getActiveRoots: () => this.activeRoots,
      getFilterOptions: () => this.getFilterOptions(),
      getCheckpoint: () => this.checkpoint,
      setCheckpoint: (next) => {
        this.checkpoint = next
      },
      isPathAdmitted: deps.isPathAdmitted,
      normalizePath: deps.normalizePath,
      scanPolicy: this.scanPolicy,
      onDeltaApplied: () => this.markSnapshotDirty(),
      onReplayUnavailable: () => this.scheduleCatchupScan(),
      logDebug: deps.logDebug,
      logWarn: deps.logWarn
    })
  }

  public isSupported(): boolean {
    const support = getFileIndexSupport()
    return Boolean(support.supported && support.hasBulkScanner)
  }

  public isReady(): boolean {
    return this.ready && !this.stopping && this.arena !== null
  }

  public getStats(): NativeArenaIndexStats | null {
    return this.arena?.getStats() ?? null
  }

  public async checkIndexedFile(candidatePath: string): Promise<boolean> {
    if (!this.isReady() || !this.arena) return false
    const normalized = this.deps.normalizePath(candidatePath)
    if (!normalized) return false

    const arenaWithHasPath = this.arena as NativeArenaWithHasPath
    if (typeof arenaWithHasPath.hasPath === 'function') {
      return arenaWithHasPath.hasPath(normalized)
    }

    const name = path.basename(normalized)
    if (!name) return false
    const parentTail = path.basename(path.dirname(normalized))
    const query =
      parentTail && parentTail !== '/' && parentTail.length + 1 + name.length <= 200
        ? `${parentTail}/${name}`
        : name
    const outcome = await this.arena.search(query, { limit: 200, typeFilter: 'file' })
    return outcome.items.some(
      (item) => !item.isDir && this.deps.normalizePath(item.path) === normalized
    )
  }

  public start(): Promise<boolean> {
    if (this.stopping || this.deps.isContentIndexingEnabled() || !this.isSupported()) {
      return Promise.resolve(false)
    }
    if (this.ready && this.arena) {
      return Promise.resolve(true)
    }
    if (this.startPromise) {
      return this.startPromise
    }

    const run = this.initializeInternal()
      .catch((error) => {
        this.deps.logWarn(
          'Native file index startup failed; legacy SQLite path remains active',
          error
        )
        return false
      })
      .finally(() => {
        if (this.startPromise === run) this.startPromise = null
      })

    this.startPromise = run
    return run
  }

  public async rebuild(): Promise<boolean> {
    if (this.stopping || !this.isSupported()) return false
    if (!this.arena) {
      return await this.start()
    }
    const roots = await resolveExistingRoots(this.deps.getWatchPaths(), this.deps.normalizePath)
    if (roots.length === 0 || this.stopping) return false
    this.setActiveRoots(roots)
    this.scanPolicy.clear()
    await this.performFullScan(roots)
    this.fsEvents.start(roots)
    return true
  }

  public async stop(): Promise<void> {
    this.stopping = true
    if (this.snapshotSaveTimer) {
      clearTimeout(this.snapshotSaveTimer)
      this.snapshotSaveTimer = null
    }

    await this.fsEvents.stop()
    await this.startPromise?.catch(() => undefined)
    await this.refreshInFlight?.catch(() => undefined)

    if (this.snapshotDirty && this.arena) {
      const saved = await this.store.persist(this.arena, this.checkpoint)
      if (saved) this.snapshotDirty = false
    }

    this.scanPolicy.clear()
    this.cachedFilterOptions = null
    this.ready = false
    this.arena = null
    this.stopping = false
    this.fsEvents.resetStoppingState()
  }

  public async search(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult | null> {
    if (signal.aborted || !this.isReady() || !this.arena || this.deps.isContentIndexingEnabled()) {
      return null
    }

    const arena = this.arena
    return await executeNativeArenaSearch(query, signal, {
      arena,
      watchRoots: this.activeRoots,
      scanPolicy: this.scanPolicy,
      isPathAdmitted: this.deps.isPathAdmitted,
      buildItem: this.deps.buildItem,
      extractFilters: this.deps.extractFilters,
      resolveExtensionsForTypeFilters: this.deps.resolveExtensionsForTypeFilters,
      logDebug: this.deps.logDebug,
      onStalePathsDetected: (stalePaths) => {
        try {
          arena.applyDelta([], stalePaths, [])
          this.markSnapshotDirty()
        } catch {
          // Non-fatal eviction error; search results remain clean.
        }
      }
    })
  }

  private setActiveRoots(roots: string[]): void {
    this.activeRoots = roots
    this.cachedFilterOptions = buildNativeScanFilterOptions(roots)
  }

  private getFilterOptions(): NativeScanFilterOptions {
    if (!this.cachedFilterOptions) {
      this.cachedFilterOptions = buildNativeScanFilterOptions(this.activeRoots)
    }
    return this.cachedFilterOptions
  }

  private async initializeInternal(): Promise<boolean> {
    const arena = createNativeFileArena()
    if (!arena || this.stopping) return false

    const roots = await resolveExistingRoots(this.deps.getWatchPaths(), this.deps.normalizePath)
    if (roots.length === 0 || this.stopping) {
      return false
    }

    this.arena = arena
    this.setActiveRoots(roots)

    const restoreResult = await this.store.restore(arena, roots)
    if (restoreResult.restored) {
      this.checkpoint = restoreResult.checkpoint
    }

    if (this.stopping) return false

    if (!restoreResult.restored) {
      await this.performFullScan(roots)
    }

    if (this.stopping) return false

    this.ready = true
    this.fsEvents.start(roots)
    return true
  }

  private async performFullScan(roots: string[]): Promise<void> {
    if (!this.arena || this.stopping) return
    const rootsKey = buildWatchRootsKey(roots)
    const preScanCheckpoint = getFseventsVolumeCheckpoint(roots[0]!)
    const stats = await this.arena.indexRoots(roots, this.getFilterOptions())

    if (this.stopping) return

    this.checkpoint = {
      version: 1,
      watchRootsKey: rootsKey,
      volumeUuid: preScanCheckpoint.volumeUuid ?? null,
      lastEventId: preScanCheckpoint.currentEventId ?? null,
      updatedAt: Date.now()
    }
    this.snapshotDirty = true
    const saved = await this.store.persist(this.arena, this.checkpoint)
    if (saved) this.snapshotDirty = false
    this.deps.logInfo('Completed native getattrlistbulk index scan', {
      files: stats.fileCount,
      dirs: stats.dirCount,
      durationMs: Math.round(stats.lastScanMs),
      backend: stats.backend
    })
  }

  private scheduleCatchupScan(): void {
    if (this.stopping || this.refreshInFlight || !this.arena) return
    const run = this.performFullScan(this.activeRoots)
      .catch((error) => {
        this.deps.logWarn('Native file arena catch-up scan failed', error)
      })
      .finally(() => {
        if (this.refreshInFlight === run) this.refreshInFlight = null
      })
    this.refreshInFlight = run
  }

  private markSnapshotDirty(): void {
    this.snapshotDirty = true
    if (this.snapshotSaveTimer || this.stopping) return
    this.snapshotSaveTimer = setTimeout(() => {
      this.snapshotSaveTimer = null
      if (!this.arena || this.stopping) return
      void this.store.persist(this.arena, this.checkpoint).then((saved) => {
        if (saved) this.snapshotDirty = false
      })
    }, NATIVE_SNAPSHOT_SAVE_DEBOUNCE_MS)
    this.snapshotSaveTimer.unref?.()
  }
}
