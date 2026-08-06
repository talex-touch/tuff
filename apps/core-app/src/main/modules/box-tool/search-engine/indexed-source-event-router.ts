import process from 'node:process'
import type { ITouchEvent } from '@talex-touch/utils'
import type {
  IndexingWatchDeltaAction,
  IndexingWatchDeltaBasePayload
} from '@talex-touch/utils/search'
import { IndexedSourceReconcileReasons } from '@talex-touch/utils/search/indexing-source'
import { getLogger } from '@talex-touch/utils/common/logger'
import { TalexEvents, touchEventBus } from '../../../core/eventbus/touch-event'
import { APP_INDEXED_SOURCE_ID } from './app-indexed-source'
import { FILE_INDEXED_SOURCE_ID } from './file-indexed-source'
import { IndexingWatchDeltaQueueService } from './indexing-watch-delta-queue-service'
import type { IndexingRuntime } from './indexing-runtime'

const log = getLogger('search-engine')

/**
 * Trailing-edge windows that collapse one filesystem change into one resolution pass. A single app
 * install emits ~16 watcher events and each one used to run the full ~1.5s resolve/upsert chain
 * behind the per-source mutation gate; coalescing trades a fixed delay for dropping that serial
 * tail. The app window is the wider of the two because a bundle copy spreads over more events than
 * a plain file write, which chokidar's 2000ms awaitWriteFinish has already absorbed.
 */
export const APP_WATCH_COALESCE_WINDOW_MS = 400
export const FILE_WATCH_COALESCE_WINDOW_MS = 300

const MACOS_BUNDLE_SUFFIX = '.app'

type RuntimeAccessor = () => IndexingRuntime | null

type WatchDeltaPayload = IndexingWatchDeltaBasePayload<IndexingWatchDeltaAction>

/** Routes filesystem watcher events to indexed sources without coupling to the search facade. */
export class IndexedSourceEventRouter {
  private subscribed = false
  private readonly appQueue: IndexingWatchDeltaQueueService<WatchDeltaPayload>
  private readonly fileQueue: IndexingWatchDeltaQueueService<WatchDeltaPayload>

  constructor(private readonly getRuntime: RuntimeAccessor) {
    this.appQueue = this.createQueue(
      APP_INDEXED_SOURCE_ID,
      APP_WATCH_COALESCE_WINDOW_MS,
      (rawPath) => this.normalizeAppKey(rawPath)
    )
    this.fileQueue = this.createQueue(
      FILE_INDEXED_SOURCE_ID,
      FILE_WATCH_COALESCE_WINDOW_MS,
      (rawPath) => rawPath
    )
  }

  private createQueue(
    sourceId: string,
    debounceMs: number,
    normalizeKey: (rawPath: string) => string
  ): IndexingWatchDeltaQueueService<WatchDeltaPayload> {
    return new IndexingWatchDeltaQueueService<WatchDeltaPayload>({
      normalizeKey,
      shouldAccept: () => true,
      // The source itself decides what is in scope; a missing runtime means the same drop as
      // before this queue existed, so nothing accumulates while the engine is not up.
      prepareFlush: async () => true,
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

  subscribe(): void {
    if (this.subscribed) return
    touchEventBus.on(TalexEvents.FILE_ADDED, this.handleFileAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_CHANGED, this.handleFileAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_UNLINKED, this.handleFileUnlinked)
    touchEventBus.on(TalexEvents.FILE_WATCH_ROOT_RECOVERED, this.handleFileWatchRootRecovered)
    touchEventBus.on(TalexEvents.FILE_CHANGED, this.handleAppAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_ADDED, this.handleAppAddedOrChanged)
    touchEventBus.on(TalexEvents.FILE_UNLINKED, this.handleAppUnlinked)
    if (process.platform === 'darwin') {
      touchEventBus.on(TalexEvents.DIRECTORY_ADDED, this.handleAppAddedOrChanged)
      touchEventBus.on(TalexEvents.DIRECTORY_UNLINKED, this.handleAppUnlinked)
    }
    this.subscribed = true
  }

  unsubscribe(): void {
    if (!this.subscribed) return
    touchEventBus.off(TalexEvents.FILE_ADDED, this.handleFileAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_CHANGED, this.handleFileAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_UNLINKED, this.handleFileUnlinked)
    touchEventBus.off(TalexEvents.FILE_WATCH_ROOT_RECOVERED, this.handleFileWatchRootRecovered)
    touchEventBus.off(TalexEvents.FILE_CHANGED, this.handleAppAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_ADDED, this.handleAppAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_UNLINKED, this.handleAppUnlinked)
    touchEventBus.off(TalexEvents.DIRECTORY_ADDED, this.handleAppAddedOrChanged)
    touchEventBus.off(TalexEvents.DIRECTORY_UNLINKED, this.handleAppUnlinked)
    this.appQueue.dispose()
    this.fileQueue.dispose()
    this.subscribed = false
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
    if (!runtime) return
    try {
      await runtime.routeWatchEventWithResult({ sourceId, action, path, occurredAt: Date.now() })
    } catch (error) {
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
