import type { ModuleKey } from '@talex-touch/utils'
import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'node:path'
import { getLogger } from '@talex-touch/utils/common/logger'
import { FILE_SCAN_MAX_DEPTH } from '@talex-touch/utils/common/file-scan-constants'
import { fileFilterService } from '@talex-touch/utils/common/file-filter-service'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import * as chokidar from 'chokidar'
import * as chokidarFsevents from 'chokidar-fsevents'
import {
  DirectoryAddedEvent,
  DirectoryUnlinkedEvent,
  FileAddedEvent,
  FileChangedEvent,
  FileWatchRootRecoveredEvent,
  FileWatchSubtreeInvalidatedEvent,
  FileUnlinkedEvent,
  TalexEvents,
  touchEventBus
} from '../../../core/eventbus/touch-event'
import { BaseModule } from '../../abstract-base-module'
import {
  PermissionStatus,
  platformPermissionService
} from '../../system/platform-permission-service'
import { MacOSFileWatcher } from './macos-file-watcher'

const isMac = process.platform === 'darwin'
const MAC_PHOTOS_LIBRARY_MARKER = 'Photos Library.photoslibrary'
export const FILE_WATCH_STABILITY_THRESHOLD_MS = 500
export const FILE_WATCH_POLL_INTERVAL_MS = 100
const fileSystemWatcherLog = getLogger('file-system-watcher')

interface PendingPath {
  path: string
  depth: number
}

function isExcludedFileWatchPath(watchPath: string): boolean {
  let candidate = path.resolve(watchPath)
  while (true) {
    // An event backend may ask only about the leaf even when an excluded ancestor was never
    // surfaced to the callback. Walk upward so node_modules/.git/Library remain closed subtrees.
    if (
      fileFilterService.getTraversalExclusionReason(candidate, undefined, {
        siblingNames: []
      }) !== null
    ) {
      return true
    }
    const parent = path.dirname(candidate)
    if (parent === candidate) return false
    candidate = parent
  }
}

/**
 * A module that watches the file system for application installations,
 * updates, and uninstalls, and emits events on the touchEventBus.
 * It manages multiple chokidar instances to handle different watch depths.
 */
export class FileSystemWatcherModule extends BaseModule {
  static key: symbol = Symbol.for('FileSystemWatcher')
  name: ModuleKey = FileSystemWatcherModule.key
  private watchers: Map<number, chokidar.FSWatcher | MacOSFileWatcher> = new Map()
  private watchedPaths: Set<string> = new Set()
  private pendingPaths: Map<string, PendingPath> = new Map()
  private pendingAdditions: Set<string> = new Set()
  private destroyed = false
  private closeWatchersPromise: Promise<void> | null = null

  // Bound so the same reference is used for both on() and off().
  private readonly handlePermissionsRefreshed = (): Promise<string[]> => this.tryPendingPaths()
  private readonly handleBeforeQuitStopWatchers = (): Promise<void> => this.closeWatchers()

  constructor() {
    super(FileSystemWatcherModule.key, {
      create: false
    })
  }

  private async hasAccess(p: string): Promise<boolean> {
    // Honest, TCC-aware probe. On macOS, POSIX access(R_OK) returns success for
    // user-owned-but-TCC-blocked folders (Documents/Downloads/Desktop), which
    // previously caused blocked roots to be registered as dead watches that never
    // recovered. probeFileAccessStatus enumerates the directory (what TCC gates),
    // so a blocked root honestly reports non-GRANTED and gets queued as pending
    // for the recovery poller. It also suppresses startup consent dialogs until
    // the user has made an explicit file-access determination.
    return platformPermissionService.probeFileAccessStatus(p) === PermissionStatus.GRANTED
  }

  /**
   * Get the list of paths that are pending permission.
   */
  public getPendingPaths(): string[] {
    return Array.from(this.pendingPaths.keys())
  }

  /**
   * Check whether there are paths waiting for permission.
   */
  public hasPendingPaths(): boolean {
    return this.pendingPaths.size > 0
  }

  private getOrCreateWatcher(depth: number): chokidar.FSWatcher | MacOSFileWatcher {
    if (this.watchers.has(depth)) {
      return this.watchers.get(depth)!
    }

    const options = {
      persistent: true,
      ignoreInitial: true,
      depth,
      ignored: (watchPath: string) => {
        if (isMac && watchPath.includes(MAC_PHOTOS_LIBRARY_MARKER)) return true
        if (!isMac || depth !== FILE_SCAN_MAX_DEPTH) return false
        // A whole-home FSEvents root must not forward private/cache/dependency churn. Supplying an
        // empty sibling list applies only unconditional traversal exclusions; project-dependent
        // names such as a personal `build` folder remain observable and are decided downstream.
        return isExcludedFileWatchPath(watchPath)
      },
      // File updates should become searchable promptly. The queue and parser still provide
      // downstream coalescing; this window only waits for an editor to finish its current write.
      awaitWriteFinish: {
        stabilityThreshold: FILE_WATCH_STABILITY_THRESHOLD_MS,
        pollInterval: FILE_WATCH_POLL_INTERVAL_MS
      }
    }
    const newWatcher =
      isMac && depth === FILE_SCAN_MAX_DEPTH
        ? new MacOSFileWatcher({
            depth,
            ignored: options.ignored,
            stabilityThresholdMs: FILE_WATCH_STABILITY_THRESHOLD_MS,
            pollIntervalMs: FILE_WATCH_POLL_INTERVAL_MS
          })
        : ((isMac
            ? chokidarFsevents.watch([], options)
            : chokidar.watch([], options)) as unknown as chokidar.FSWatcher)

    const eventSource = newWatcher as unknown as {
      on: (event: string, handler: (...args: never[]) => void) => void
    }
    eventSource.on(
      'invalidate',
      (event: {
        path: string
        rootPath: string
        reason: 'directory-change' | 'event-loss' | 'overflow' | 'symlink-change'
      }) => {
        if (this.destroyed) return
        touchEventBus.emit(
          TalexEvents.FILE_WATCH_SUBTREE_INVALIDATED,
          new FileWatchSubtreeInvalidatedEvent(event.path, event.rootPath, event.reason)
        )
      }
    )

    eventSource.on('add', (filePath: string) => {
      if (this.destroyed) return
      fileSystemWatcherLog.debug(`Raw 'add' event from chokidar for path: ${filePath}`)
      touchEventBus.emit(TalexEvents.FILE_ADDED, new FileAddedEvent(filePath))
    })
    eventSource.on('addDir', (dirPath: string) => {
      if (this.destroyed) return
      fileSystemWatcherLog.debug(`Raw 'addDir' event from chokidar for path: ${dirPath}`)
      touchEventBus.emit(TalexEvents.DIRECTORY_ADDED, new DirectoryAddedEvent(dirPath))
    })
    eventSource.on('change', (filePath: string) => {
      if (this.destroyed) return
      fileSystemWatcherLog.debug(`Raw 'change' event from chokidar for path: ${filePath}`)
      touchEventBus.emit(TalexEvents.FILE_CHANGED, new FileChangedEvent(filePath))
    })
    eventSource.on('unlink', (filePath: string) => {
      if (this.destroyed) return
      fileSystemWatcherLog.debug(`Raw 'unlink' event from chokidar for path: ${filePath}`)
      touchEventBus.emit(TalexEvents.FILE_UNLINKED, new FileUnlinkedEvent(filePath))
    })
    eventSource.on('unlinkDir', (dirPath: string) => {
      if (this.destroyed) return
      fileSystemWatcherLog.debug(`Raw 'unlinkDir' event from chokidar for path: ${dirPath}`)
      touchEventBus.emit(TalexEvents.DIRECTORY_UNLINKED, new DirectoryUnlinkedEvent(dirPath))
    })
    eventSource.on('ready', () => {
      fileSystemWatcherLog.debug(`Watcher with depth ${depth} is ready.`)
    })
    eventSource.on('error', (error: unknown) => {
      const errorCode = (error as { code?: string }).code
      if (errorCode === 'EPERM' || errorCode === 'EACCES') {
        fileSystemWatcherLog.info(
          `Permission-limited watcher ${depth}, path will be retried when available`
        )
        return
      }
      fileSystemWatcherLog.error(`Watcher error with depth ${depth}`, { error })
    })

    this.watchers.set(depth, newWatcher)
    return newWatcher
  }

  /**
   * Try to add pending paths when permission becomes available.
   * Returns the list of paths that were successfully added.
   */
  public async tryPendingPaths(): Promise<string[]> {
    if (this.destroyed || this.pendingPaths.size === 0) {
      return []
    }

    const recovered: string[] = []
    const pathsToRetry: string[] = []

    for (const [path, pending] of this.pendingPaths.entries()) {
      if (await this.hasAccess(path)) {
        try {
          await this.addPathInternal(path, pending.depth)
          if (this.destroyed) return recovered
          this.pendingPaths.delete(path)
          recovered.push(path)
          touchEventBus.emit(
            TalexEvents.FILE_WATCH_ROOT_RECOVERED,
            new FileWatchRootRecoveredEvent(path)
          )
          fileSystemWatcherLog.info(`Successfully added pending path: ${path}`)
        } catch {
          fileSystemWatcherLog.info(`Pending path still unavailable: ${path}`)
          pathsToRetry.push(path)
        }
      } else {
        pathsToRetry.push(path)
      }
    }

    // Update pending paths with ones that still need permission
    if (pathsToRetry.length < this.pendingPaths.size) {
      const stillPending = new Map<string, PendingPath>()
      for (const path of pathsToRetry) {
        const pending = this.pendingPaths.get(path)
        if (pending) {
          stillPending.set(path, pending)
        }
      }
      this.pendingPaths = stillPending
    }

    return recovered
  }

  /**
   * Internal method to add path to watcher (assumes permission check passed)
   */
  private async addPathInternal(p: string, depth: number): Promise<void> {
    if (this.destroyed) return
    const watcher = this.getOrCreateWatcher(depth)
    await watcher.add(p)
    if (this.destroyed) return
    this.watchedPaths.add(p)
    fileSystemWatcherLog.info(`Now watching path: ${p} with depth: ${depth}`)
  }

  public async addPath(p: string, depth: number = isMac ? 1 : 4): Promise<void> {
    if (this.destroyed || this.watchedPaths.has(p) || this.pendingAdditions.has(p)) {
      fileSystemWatcherLog.debug(`Path already being watched: ${p}`)
      return
    }
    this.pendingAdditions.add(p)

    try {
      await this.registerPath(p, depth)
    } finally {
      this.pendingAdditions.delete(p)
    }
  }

  private async registerPath(p: string, depth: number): Promise<void> {
    try {
      if (isMac && p.includes(MAC_PHOTOS_LIBRARY_MARKER)) {
        fileSystemWatcherLog.info(`Skip restricted photos library path: ${p}`)
        return
      }

      const stats = await fs.stat(p)
      if (!stats.isDirectory()) {
        fileSystemWatcherLog.info(`Path is not a directory, skipping: ${p}`)
        return
      }
    } catch {
      // Path likely doesn't exist, ignore for now.
      return
    }

    // Check access permissions silently -- never show system dialogs on startup
    if (!(await this.hasAccess(p))) {
      if (!this.destroyed) this.pendingPaths.set(p, { path: p, depth })
      fileSystemWatcherLog.info(`No access to ${p}, silently queued for later`)
      return
    }

    // Permission granted or available, add to watcher
    try {
      await this.addPathInternal(p, depth)
    } catch (error: unknown) {
      // If still fails (e.g., operation not permitted), add to pending
      const errorCode = (error as { code?: string }).code
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorCode === 'EPERM' || errorCode === 'EACCES') {
        if (!this.destroyed) this.pendingPaths.set(p, { path: p, depth })
        fileSystemWatcherLog.info(
          `Permission denied for ${p}, added to pending queue: ${errorMessage}`
        )
      } else {
        throw error
      }
    }
  }

  async onInit(): Promise<void> {
    fileSystemWatcherLog.debug('Initializing... Watch paths will be added by consumer modules.')

    // Reconcile pending (permission-blocked) roots as soon as permissions are
    // re-checked — e.g. the user granted access in System Settings and the
    // permission page refreshed — instead of waiting for the periodic poll.
    touchEventBus.on(TalexEvents.PERMISSIONS_REFRESHED, this.handlePermissionsRefreshed)

    // The quit flow stops native streams before renderer quiesce and module unload; this module
    // is a deferred one, so by the time unloadAll reached it the before-quit budget or the dev
    // force-exit had usually already won, and the still-running FSEvents streams aborted the
    // process during environment teardown.
    touchEventBus.on(TalexEvents.BEFORE_QUIT_STOP_WATCHERS, this.handleBeforeQuitStopWatchers)

    // Start periodic permission checking for pending paths
    // Check every 30 seconds for permission changes
    pollingService.register(
      'filesystem-watcher-permission-check',
      async () => {
        await this.tryPendingPaths()
      },
      {
        interval: 30,
        unit: 'seconds',
        runImmediately: false
      }
    )
  }

  async onDestroy(): Promise<void> {
    this.destroyed = true
    fileSystemWatcherLog.info('Destroying...')

    touchEventBus.off(TalexEvents.PERMISSIONS_REFRESHED, this.handlePermissionsRefreshed)
    touchEventBus.off(TalexEvents.BEFORE_QUIT_STOP_WATCHERS, this.handleBeforeQuitStopWatchers)

    // Unregister polling task
    pollingService.unregister('filesystem-watcher-permission-check')

    await this.closeWatchers()
  }

  /**
   * Stops intake, then closes every native stream and awaits it. Shared by onDestroy and the
   * quit flow's BEFORE_QUIT_STOP_WATCHERS step; a second call joins the first instead of
   * closing twice.
   */
  private closeWatchers(): Promise<void> {
    if (this.closeWatchersPromise) return this.closeWatchersPromise
    this.destroyed = true
    this.pendingPaths.clear()
    const watchers = Array.from(this.watchers.values())
    this.watchers.clear()
    this.closeWatchersPromise = (async () => {
      await Promise.all(watchers.map((watcher) => watcher.close()))
      this.watchedPaths.clear()
      this.pendingAdditions.clear()
      fileSystemWatcherLog.info(`Closed ${watchers.length} native watcher(s)`)
    })()
    return this.closeWatchersPromise
  }
}

const fileSystemWatcherModule = new FileSystemWatcherModule()

export { fileSystemWatcherModule }
