import process from 'node:process'
import path from 'node:path'
import type { ITouchEvent } from '@talex-touch/utils'
import type {
  IndexingWatchDeltaAction,
  IndexingWatchDeltaBasePayload
} from '@talex-touch/utils/search'
import {
  IndexedSourceReconcileReasons,
  isIndexedSourcePathInsideRoot
} from '@talex-touch/utils/search/indexing-source'
import { getLogger } from '@talex-touch/utils/common/logger'
import { TalexEvents, touchEventBus } from '../../../core/eventbus/touch-event'
import { APP_INDEXED_SOURCE_ID } from './app-indexed-source'
import { FILE_INDEXED_SOURCE_ID } from './file-indexed-source'
import { FILE_WATCH_SUBTREE_RECONCILE_REASON } from '../addon/files/services/file-watch-subtree-service'
import { IndexingWatchDeltaQueueService } from './indexing-watch-delta-queue-service'
import type { IndexingRuntime } from './indexing-runtime'

const log = getLogger('search-engine')

/**
 * Trailing-edge windows that collapse one filesystem change into one resolution pass. A single app
 * install emits ~16 watcher events and each one used to run the full ~1.5s resolve/upsert chain
 * behind the per-source mutation gate; coalescing trades a fixed delay for dropping that serial
 * tail. The app window is the wider of the two because a bundle copy spreads over more events than
 * a plain file write, while the watcher stability window remains bounded for prompt file updates.
 */
export const APP_WATCH_COALESCE_WINDOW_MS = 400
export const FILE_WATCH_COALESCE_WINDOW_MS = 300

const MACOS_BUNDLE_SUFFIX = '.app'
const MAX_PENDING_INVALIDATION_SCOPES = 128

interface PendingSubtreeInvalidation {
  rootPath: string
  scopes: Set<string>
  reasons: Map<string, MacOSInvalidationReason>
}

type MacOSInvalidationReason = 'directory-change' | 'event-loss' | 'overflow' | 'symlink-change'

type RuntimeAccessor = () => IndexingRuntime | null

type WatchDeltaPayload = IndexingWatchDeltaBasePayload<IndexingWatchDeltaAction>

export interface IndexedSourceEventRouterOptions {
  /**
   * The app source's own watch roots (`/Applications` and `~/Applications` on darwin). Only paths
   * under one of them enter the app queue.
   *
   * Every watcher event used to be queued for the app source too, and each one bought a health
   * read — a full count of the FTS table on the single read worker — before the runtime found the
   * path was not under `/Applications`. A tuffex build releases ~2,700 `dist/` paths, which kept that
   * serial queue saturated for ~14 minutes while CoreBox queries waited behind it on the same
   * worker. The roots are read on every event rather than cached: the lookup is a constant array,
   * and only root ownership is decided here — health and permission stay with the runtime.
   *
   * Omitted, the queue accepts everything, which is the behaviour before this gate existed.
   */
  getAppWatchRoots?: () => readonly string[]
}

/** Routes filesystem watcher events to indexed sources without coupling to the search facade. */
export class IndexedSourceEventRouter {
  private subscribed = false
  private appRootsFailureLogged = false
  private readonly appQueue: IndexingWatchDeltaQueueService<WatchDeltaPayload>
  private readonly fileQueue: IndexingWatchDeltaQueueService<WatchDeltaPayload>
  private readonly subtreeInvalidations = new Map<string, PendingSubtreeInvalidation>()
  private subtreeInvalidationTimer: ReturnType<typeof setTimeout> | null = null
  private subtreeInvalidationChain: Promise<void> = Promise.resolve()

  constructor(
    private readonly getRuntime: RuntimeAccessor,
    private readonly options: IndexedSourceEventRouterOptions = {}
  ) {
    this.appQueue = this.createQueue(
      APP_INDEXED_SOURCE_ID,
      APP_WATCH_COALESCE_WINDOW_MS,
      (rawPath) => this.normalizeAppKey(rawPath),
      (rawPath) => this.isWithinAppWatchRoots(rawPath)
    )
    this.fileQueue = this.createQueue(
      FILE_INDEXED_SOURCE_ID,
      FILE_WATCH_COALESCE_WINDOW_MS,
      (rawPath) => rawPath,
      () => true
    )
  }

  private createQueue(
    sourceId: string,
    debounceMs: number,
    normalizeKey: (rawPath: string) => string,
    shouldAccept: (rawPath: string) => boolean
  ): IndexingWatchDeltaQueueService<WatchDeltaPayload> {
    return new IndexingWatchDeltaQueueService<WatchDeltaPayload>({
      normalizeKey,
      shouldAccept,
      // The source itself decides what is in scope; a missing runtime means the same drop as
      // before this queue existed, so nothing accumulates while the engine is not up.
      prepareFlush: async () => {
        const runtime = this.getRuntime()
        if (!runtime || runtime.isShuttingDown?.()) return false
        return true
      },
      processEntries: async (entries) => {
        for (const [, payload] of entries) {
          await this.route(sourceId, payload.rawPath, payload.action)
        }
      },
      logError: (message, error) => {
        log.warn(message, { error, sourceId })
      },
      // A closed window states what the filesystem looks like now, so the last event wins rather
      // than letting a delete stick: an in-place app replacement (unlink then add inside the same
      // window) has to resolve to the add or the entry would be dropped from the index.
      coalesce: ({ next }) => next,
      debounceMs
    })
  }

  /**
   * Groups every event inside a macOS bundle onto the bundle itself, which is the unit the app
   * source resolves. Other platforms watch the launchable file directly.
   */
  private normalizeAppKey(rawPath: string): string {
    if (process.platform !== 'darwin') return rawPath
    const bundleIndex = rawPath.indexOf(`${MACOS_BUNDLE_SUFFIX}/`)
    if (bundleIndex < 0) return rawPath
    return rawPath.slice(0, bundleIndex + MACOS_BUNDLE_SUFFIX.length)
  }

  /**
   * Same containment rule the runtime applies to the source's roots, so the queue cannot admit a
   * path the runtime would route, nor drop one it would accept.
   */
  private isWithinAppWatchRoots(rawPath: string): boolean {
    const getRoots = this.options.getAppWatchRoots
    if (!getRoots) return true

    let roots: readonly string[]
    try {
      roots = getRoots()
    } catch (error) {
      // Unknown roots fall back to routing: the runtime re-checks root ownership before it reads
      // health, so an open gate costs a cheap check per event, where a closed one would lose app
      // installs until the next reconcile.
      if (!this.appRootsFailureLogged) {
        this.appRootsFailureLogged = true
        log.warn('App watch roots unavailable; routing app events unfiltered', { error })
      }
      return true
    }

    return roots.some(
      (root) =>
        typeof root === 'string' &&
        root.length > 0 &&
        isIndexedSourcePathInsideRoot(rawPath, root, { platform: process.platform })
    )
  }

  subscribe(): void {
    if (this.subscribed) return
    touchEventBus.on(TalexEvents.FILE_ADDED, this.handleFileAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_CHANGED, this.handleFileAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_UNLINKED, this.handleFileUnlinked)
    touchEventBus.on(TalexEvents.FILE_WATCH_ROOT_RECOVERED, this.handleFileWatchRootRecovered)
    touchEventBus.on(
      TalexEvents.FILE_WATCH_SUBTREE_INVALIDATED,
      this.handleFileWatchSubtreeInvalidated
    )
    touchEventBus.on(TalexEvents.FILE_CHANGED, this.handleAppAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_ADDED, this.handleAppAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_UNLINKED, this.handleAppUnlinked)
    if (process.platform === 'darwin') {
      touchEventBus.on(TalexEvents.DIRECTORY_ADDED, this.handleAppAddedOrChanged)
      touchEventBus.on(TalexEvents.DIRECTORY_UNLINKED, this.handleAppUnlinked)
    }
    this.subscribed = true
  }

  async unsubscribe(): Promise<void> {
    if (!this.subscribed) return
    touchEventBus.off(TalexEvents.FILE_ADDED, this.handleFileAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_CHANGED, this.handleFileAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_UNLINKED, this.handleFileUnlinked)
    touchEventBus.off(TalexEvents.FILE_WATCH_ROOT_RECOVERED, this.handleFileWatchRootRecovered)
    touchEventBus.off(
      TalexEvents.FILE_WATCH_SUBTREE_INVALIDATED,
      this.handleFileWatchSubtreeInvalidated
    )
    touchEventBus.off(TalexEvents.FILE_CHANGED, this.handleAppAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_ADDED, this.handleAppAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_UNLINKED, this.handleAppUnlinked)
    touchEventBus.off(TalexEvents.DIRECTORY_ADDED, this.handleAppAddedOrChanged)
    touchEventBus.off(TalexEvents.DIRECTORY_UNLINKED, this.handleAppUnlinked)
    // Drained before disposing. dispose() only drops the coalescing window and
    // leaves pending entries "for the next flush" — but the handlers are detached
    // above, so no next enqueue can ever come. An app dropped into /Applications
    // within the 400ms coalescing window was discarded outright, with no reconcile
    // marker, leaving the index stale until the next full scan (#676).
    this.subscribed = false
    await Promise.all([
      this.appQueue.drain(),
      this.fileQueue.drain(),
      this.drainSubtreeInvalidations()
    ])
    this.appQueue.dispose()
    this.fileQueue.dispose()
    this.subtreeInvalidations.clear()
  }

  private readonly handleFileAddedOrChanged = (event: ITouchEvent): void => {
    const path = this.resolvePath(event)
    if (path) this.fileQueue.enqueue(path, event.name === TalexEvents.FILE_ADDED ? 'add' : 'change')
  }

  private readonly handleFileUnlinked = (event: ITouchEvent): void => {
    const path = this.resolvePath(event)
    if (path) this.fileQueue.enqueue(path, 'delete')
  }

  private readonly handleFileWatchRootRecovered = (event: ITouchEvent): void => {
    const path = this.resolvePath(event)
    if (path) void this.reconcileRecoveredRoot(path)
  }

  private readonly handleFileWatchSubtreeInvalidated = (event: ITouchEvent): void => {
    if (!this.subscribed) return
    if (!('rootPath' in event) || !('reason' in event)) return
    const subtreePath = this.resolvePath(event)
    const rootPath = typeof event.rootPath === 'string' ? event.rootPath : null
    const reason = event.reason
    if (!subtreePath || !rootPath || !this.isSubtreeInsideRoot(subtreePath, rootPath)) return
    if (
      reason !== 'directory-change' &&
      reason !== 'event-loss' &&
      reason !== 'overflow' &&
      reason !== 'symlink-change'
    )
      return

    const normalizedRoot = path.resolve(rootPath)
    const normalizedSubtree = path.resolve(subtreePath)
    let pending = this.subtreeInvalidations.get(normalizedRoot)
    if (!pending) {
      pending = { rootPath: normalizedRoot, scopes: new Set(), reasons: new Map() }
      this.subtreeInvalidations.set(normalizedRoot, pending)
    }
    if (pending.scopes.has(normalizedRoot)) return
    for (const existing of pending.scopes) {
      if (this.isSubtreeInsideRoot(normalizedSubtree, existing)) return
    }
    for (const existing of pending.scopes) {
      if (this.isSubtreeInsideRoot(existing, normalizedSubtree)) {
        pending.scopes.delete(existing)
        pending.reasons.delete(existing)
      }
    }
    pending.scopes.add(normalizedSubtree)
    pending.reasons.set(normalizedSubtree, reason)
    if (pending.scopes.size > MAX_PENDING_INVALIDATION_SCOPES) {
      pending.scopes.clear()
      pending.reasons.clear()
      pending.scopes.add(normalizedRoot)
      pending.reasons.set(normalizedRoot, 'overflow')
    }
    this.scheduleSubtreeInvalidations()
  }

  private isSubtreeInsideRoot(candidate: string, root: string): boolean {
    const relative = path.relative(path.resolve(root), path.resolve(candidate))
    return (
      relative === '' ||
      (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    )
  }

  private scheduleSubtreeInvalidations(): void {
    if (this.subtreeInvalidationTimer || this.subtreeInvalidations.size === 0) return
    this.subtreeInvalidationTimer = setTimeout(() => {
      this.subtreeInvalidationTimer = null
      this.flushSubtreeInvalidations()
    }, FILE_WATCH_COALESCE_WINDOW_MS)
  }

  private flushSubtreeInvalidations(): void {
    if (this.subtreeInvalidations.size === 0) return
    const pending = Array.from(this.subtreeInvalidations.values())
    this.subtreeInvalidations.clear()
    this.subtreeInvalidationChain = this.subtreeInvalidationChain
      .then(async () => {
        for (const entry of pending) {
          for (const subtreePath of entry.scopes) {
            try {
              await this.reconcileInvalidatedSubtree(subtreePath, entry.rootPath)
            } catch (error) {
              log.warn('Invalidated file watch subtree reconcile failed', {
                error,
                rootPath: entry.rootPath,
                subtreePath
              })
            }
          }
        }
      })
      .catch((error) => {
        log.warn('Invalidated file watch subtree reconcile failed', { error })
      })
  }

  private async drainSubtreeInvalidations(): Promise<void> {
    if (this.subtreeInvalidationTimer) {
      clearTimeout(this.subtreeInvalidationTimer)
      this.subtreeInvalidationTimer = null
    }
    this.flushSubtreeInvalidations()
    await this.subtreeInvalidationChain
  }

  private async reconcileInvalidatedSubtree(subtreePath: string, rootPath: string): Promise<void> {
    const runtime = this.getRuntime()
    if (!runtime || runtime.isShuttingDown?.()) return
    const event = {
      sourceId: FILE_INDEXED_SOURCE_ID,
      action: 'change' as const,
      path: subtreePath,
      rootPath,
      occurredAt: Date.now()
    }
    if (runtime.getSource(FILE_INDEXED_SOURCE_ID)?.shouldHandleWatchEvent?.(event) === false) return
    await runtime.reconcileSource(FILE_INDEXED_SOURCE_ID, {
      reason: FILE_WATCH_SUBTREE_RECONCILE_REASON,
      roots: [
        {
          sourceId: FILE_INDEXED_SOURCE_ID,
          path: subtreePath,
          permissionState: 'granted',
          reason: FILE_WATCH_SUBTREE_RECONCILE_REASON
        }
      ]
    })
  }

  private readonly handleAppAddedOrChanged = (event: ITouchEvent): void => {
    const path = this.resolvePath(event)
    if (!path) return
    const action =
      event.name === TalexEvents.FILE_ADDED || event.name === TalexEvents.DIRECTORY_ADDED
        ? 'add'
        : 'change'
    this.appQueue.enqueue(path, action)
  }

  private readonly handleAppUnlinked = (event: ITouchEvent): void => {
    const path = this.resolvePath(event)
    if (path) this.appQueue.enqueue(path, 'delete')
  }

  private resolvePath(event: ITouchEvent): string | null {
    if (!('filePath' in event)) return null
    return typeof event.filePath === 'string' && event.filePath.length > 0 ? event.filePath : null
  }

  private async route(
    sourceId: string,
    path: string,
    action: 'add' | 'change' | 'delete'
  ): Promise<void> {
    const runtime = this.getRuntime()
    if (!runtime || runtime.isShuttingDown?.()) return
    try {
      await runtime.routeWatchEventWithResult({ sourceId, action, path, occurredAt: Date.now() })
    } catch (error) {
      if (error instanceof Error && error.message === 'INDEXING_RUNTIME_SHUTTING_DOWN') {
        return
      }
      log.warn('Indexed source fs event route failed', { error, sourceId, path, action })
    }
  }

  private async reconcileRecoveredRoot(path: string): Promise<void> {
    const runtime = this.getRuntime()
    if (!runtime) return
    const event = {
      sourceId: FILE_INDEXED_SOURCE_ID,
      action: 'change' as const,
      path,
      rootPath: path,
      occurredAt: Date.now()
    }
    if (runtime.getSource(FILE_INDEXED_SOURCE_ID)?.shouldHandleWatchEvent?.(event) === false) return
    try {
      await runtime.reconcileSource(FILE_INDEXED_SOURCE_ID, {
        reason: IndexedSourceReconcileReasons.WatchRootRecovered,
        roots: [
          {
            sourceId: FILE_INDEXED_SOURCE_ID,
            path,
            permissionState: 'granted',
            reason: IndexedSourceReconcileReasons.WatchRootRecovered
          }
        ]
      })
    } catch (error) {
      log.warn('Recovered file watch root reconcile failed', { error, path })
    }
  }
}
