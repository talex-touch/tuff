import type { ITouchEvent } from '@talex-touch/utils'
import { IndexedSourceReconcileReasons } from '@talex-touch/utils/search/indexing-source'
import { getLogger } from '@talex-touch/utils/common/logger'
import { TalexEvents, touchEventBus } from '../../../core/eventbus/touch-event'
import { APP_INDEXED_SOURCE_ID } from './app-indexed-source'
import { FILE_INDEXED_SOURCE_ID } from './file-indexed-source'
import type { IndexingRuntime } from './indexing-runtime'

const log = getLogger('search-engine')

type RuntimeAccessor = () => IndexingRuntime | null

/** Routes filesystem watcher events to indexed sources without coupling to the search facade. */
export class IndexedSourceEventRouter {
  private subscribed = false

  constructor(private readonly getRuntime: RuntimeAccessor) {}

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
    this.subscribed = false
  }

  private readonly handleFileAddedOrChanged = (event: ITouchEvent): void => {
    const path = this.resolvePath(event)
    if (path)
      void this.route(
        FILE_INDEXED_SOURCE_ID,
        path,
        event.name === TalexEvents.FILE_ADDED ? 'add' : 'change'
      )
  }

  private readonly handleFileUnlinked = (event: ITouchEvent): void => {
    const path = this.resolvePath(event)
    if (path) void this.route(FILE_INDEXED_SOURCE_ID, path, 'delete')
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
    void this.route(APP_INDEXED_SOURCE_ID, path, action)
  }

  private readonly handleAppUnlinked = (event: ITouchEvent): void => {
    const path = this.resolvePath(event)
    if (path) void this.route(APP_INDEXED_SOURCE_ID, path, 'delete')
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
