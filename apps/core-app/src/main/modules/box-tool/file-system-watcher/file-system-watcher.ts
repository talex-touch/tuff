import type { ModuleKey } from '@talex-touch/utils'
import fs from 'node:fs/promises'
import process from 'node:process'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import * as chokidar from 'chokidar'
import {
  DirectoryAddedEvent,
  DirectoryUnlinkedEvent,
  FileAddedEvent,
  FileChangedEvent,
  FileUnlinkedEvent,
  TalexEvents,
  touchEventBus
} from '../../../core/eventbus/touch-event'
import { BaseModule } from '../../abstract-base-module'

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

interface PendingPath {
  path: string
  depth: number
}

/**
 * A module that watches the file system for application installations,
 * updates, and uninstalls, and emits events on the touchEventBus.
 * It manages multiple chokidar instances to handle different watch depths.
 */
export class FileSystemWatcherModule extends BaseModule {
  static key: symbol = Symbol.for('FileSystemWatcher')
  name: ModuleKey = FileSystemWatcherModule.key
  private watchers: Map<number, chokidar.FSWatcher> = new Map()
  private watchedPaths: Set<string> = new Set()
  private pendingPaths: Map<string, PendingPath> = new Map()

  constructor() {
    super(FileSystemWatcherModule.key, {
      create: false
    })
  }

  private async hasAccess(p: string): Promise<boolean> {
    try {
      await fs.access(p, fs.constants.R_OK)
      // On Windows, also try to read directory to ensure full access
      if (isWindows) {
        try {
          await fs.readdir(p)
        } catch {
          return false
        }
      }
      return true
    } catch {
      return false
    }
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

  private getOrCreateWatcher(depth: number): chokidar.FSWatcher {
    if (this.watchers.has(depth)) {
      return this.watchers.get(depth)!
    }

    const newWatcher = chokidar.watch([], {
      persistent: true,
      ignoreInitial: true,
      depth,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    })

    newWatcher
      .on('add', (filePath: string) => {
        console.debug(`[FileSystemWatcher] Raw 'add' event from chokidar for path: ${filePath}`)
        touchEventBus.emit(TalexEvents.FILE_ADDED, new FileAddedEvent(filePath))
      })
      .on('addDir', (dirPath: string) => {
        console.debug(`[FileSystemWatcher] Raw 'addDir' event from chokidar for path: ${dirPath}`)
        touchEventBus.emit(TalexEvents.DIRECTORY_ADDED, new DirectoryAddedEvent(dirPath))
      })
      .on('change', (filePath: string) => {
        console.debug(`[FileSystemWatcher] Raw 'change' event from chokidar for path: ${filePath}`)
        touchEventBus.emit(TalexEvents.FILE_CHANGED, new FileChangedEvent(filePath))
      })
      .on('unlink', (filePath: string) => {
        console.debug(`[FileSystemWatcher] Raw 'unlink' event from chokidar for path: ${filePath}`)
        touchEventBus.emit(TalexEvents.FILE_UNLINKED, new FileUnlinkedEvent(filePath))
      })
      .on('unlinkDir', (dirPath: string) => {
        console.debug(
          `[FileSystemWatcher] Raw 'unlinkDir' event from chokidar for path: ${dirPath}`
        )
        touchEventBus.emit(TalexEvents.DIRECTORY_UNLINKED, new DirectoryUnlinkedEvent(dirPath))
      })
      .on('ready', () => {
        console.debug(`[FileSystemWatcher] Watcher with depth ${depth} is ready.`)
      })
      .on('error', (error: unknown) => {
        console.error(`[FileSystemWatcher] Watcher error with depth ${depth}:`, error)
        // If error is permission-related, try to handle it
        const errorCode = (error as { code?: string }).code
        if (errorCode === 'EPERM' || errorCode === 'EACCES') {
          console.warn(
            `[FileSystemWatcher] Permission error for watcher ${depth}, will retry pending paths`
          )
        }
      })

    this.watchers.set(depth, newWatcher)
    return newWatcher
  }

  /**
   * Try to add pending paths when permission becomes available.
   * Returns the list of paths that were successfully added.
   */
  public async tryPendingPaths(): Promise<string[]> {
    if (this.pendingPaths.size === 0) {
      return []
    }

    const recovered: string[] = []
    const pathsToRetry: string[] = []

    for (const [path, pending] of this.pendingPaths.entries()) {
      if (await this.hasAccess(path)) {
        try {
          await this.addPathInternal(path, pending.depth)
          this.pendingPaths.delete(path)
          recovered.push(path)
          console.log(`[FileSystemWatcher] Successfully added pending path: ${path}`)
        } catch (error) {
          console.warn(`[FileSystemWatcher] Failed to add pending path ${path}:`, error)
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
    const watcher = this.getOrCreateWatcher(depth)
    watcher.add(p)
    this.watchedPaths.add(p)
    console.log(`[FileSystemWatcher] Now watching path: ${p} with depth: ${depth}`)
  }

  public async addPath(p: string, depth: number = isMac ? 1 : 4): Promise<void> {
    if (this.watchedPaths.has(p)) {
      console.log(`[FileSystemWatcher] Path already being watched: ${p}`)
      return
    }

    try {
      const stats = await fs.stat(p)
      if (!stats.isDirectory()) {
        console.warn(`[FileSystemWatcher] Path is not a directory, skipping: ${p}`)
        return
      }
    } catch {
      // Path likely doesn't exist, ignore for now.
      return
    }

    // Check access permissions silently -- never show system dialogs on startup
    if (!(await this.hasAccess(p))) {
      this.pendingPaths.set(p, { path: p, depth })
      console.log(`[FileSystemWatcher] No access to ${p}, silently queued for later`)
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
        this.pendingPaths.set(p, { path: p, depth })
        console.warn(
          `[FileSystemWatcher] Permission denied for ${p}, added to pending queue:`,
          errorMessage
        )
      } else {
        throw error
      }
    }
  }

  async onInit(): Promise<void> {
    console.debug(
      '[FileSystemWatcher] Initializing... Watch paths will be added by consumer modules.'
    )

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

  onDestroy(): void {
    console.log('[FileSystemWatcher] Destroying...')

    // Unregister polling task
    pollingService.unregister('filesystem-watcher-permission-check')

    // Clear pending paths
    this.pendingPaths.clear()

    // Close all watchers
    this.watchers.forEach((watcher, depth) => {
      watcher.close()
      console.log(`[FileSystemWatcher] Watcher with depth ${depth} stopped.`)
    })
    this.watchers.clear()
    this.watchedPaths.clear()
  }
}

const fileSystemWatcherModule = new FileSystemWatcherModule()

export { fileSystemWatcherModule }
