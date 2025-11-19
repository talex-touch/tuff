import type { ModuleKey } from '@talex-touch/utils'
import fs from 'node:fs/promises'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import * as chokidar from 'chokidar'
import { dialog } from 'electron'
import {
  DirectoryAddedEvent,
  DirectoryUnlinkedEvent,
  FileAddedEvent,
  FileChangedEvent,
  FileUnlinkedEvent,
  TalexEvents,
  touchEventBus,
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
      create: false,
    })
  }

  private async hasAccess(p: string): Promise<boolean> {
    try {
      await fs.access(p, fs.constants.R_OK)
      // On Windows, also try to read directory to ensure full access
      if (isWindows) {
        try {
          await fs.readdir(p)
        }
        catch {
          return false
        }
      }
      return true
    }
    catch {
      return false
    }
  }

  private async requestAccess(p: string): Promise<boolean> {
    if (isMac) {
      // macOS: Use folder picker dialog
      console.log(`[FileSystemWatcher] Requesting access to ${p}`)
      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'Permission Request',
        message: 'TalexTouch needs access to your Applications folder to watch for new apps.',
        detail: `Please grant access to the following folder to continue: ${p}`,
        buttons: ['Open Folder Picker', 'Cancel'],
      })

      if (response === 1) {
        console.warn(`[FileSystemWatcher] User cancelled access request for ${p}`)
        return false
      }

      const { filePaths } = await dialog.showOpenDialog({
        title: `Grant Access to ${p}`,
        properties: ['openDirectory'],
        defaultPath: p,
      })

      if (filePaths && filePaths.length > 0) {
        console.log(`[FileSystemWatcher] Access granted to ${filePaths[0]}`)
        return true
      }

      console.warn(`[FileSystemWatcher] User did not select a directory for ${p}`)
      return false
    }
    else if (isWindows) {
      // Windows: Show dialog to request folder access
      console.log(`[FileSystemWatcher] Requesting access to ${p}`)
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'Folder Access Required',
        message: 'TalexTouch needs access to this folder to watch for file changes.',
        detail: `Path: ${p}\n\nPlease grant access to this folder or run TalexTouch as administrator.`,
        buttons: ['Open Folder', 'Cancel'],
        defaultId: 0,
      })

      if (response === 0) {
        // Open folder to allow user to grant access
        const { filePaths } = await dialog.showOpenDialog({
          title: `Grant Access to ${p}`,
          properties: ['openDirectory'],
          defaultPath: p,
        })

        if (filePaths && filePaths.length > 0) {
          // Check if access is now available
          if (await this.hasAccess(p)) {
            console.log(`[FileSystemWatcher] Access granted to ${p}`)
            return true
          }
        }
      }

      console.warn(`[FileSystemWatcher] No access to ${p}, will retry later`)
      return false
    }

    return false
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
        pollInterval: 100,
      },
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
          `[FileSystemWatcher] Raw 'unlinkDir' event from chokidar for path: ${dirPath}`,
        )
        touchEventBus.emit(TalexEvents.DIRECTORY_UNLINKED, new DirectoryUnlinkedEvent(dirPath))
      })
      .on('ready', () => {
        console.debug(`[FileSystemWatcher] Watcher with depth ${depth} is ready.`)
      })
      .on('error', (error: any) => {
        console.error(`[FileSystemWatcher] Watcher error with depth ${depth}:`, error)
        // If error is permission-related, try to handle it
        if (error.code === 'EPERM' || error.code === 'EACCES') {
          console.warn(`[FileSystemWatcher] Permission error for watcher ${depth}, will retry pending paths`)
        }
      })

    this.watchers.set(depth, newWatcher)
    return newWatcher
  }

  /**
   * Try to add pending paths when permission becomes available
   */
  private async tryPendingPaths(): Promise<void> {
    if (this.pendingPaths.size === 0) {
      return
    }

    const pathsToRetry: string[] = []

    for (const [path, pending] of this.pendingPaths.entries()) {
      if (await this.hasAccess(path)) {
        // Permission granted, try to add to watcher
        try {
          await this.addPathInternal(path, pending.depth)
          this.pendingPaths.delete(path)
          console.log(`[FileSystemWatcher] Successfully added pending path: ${path}`)
        }
        catch (error) {
          console.warn(`[FileSystemWatcher] Failed to add pending path ${path}:`, error)
          pathsToRetry.push(path)
        }
      }
      else {
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
    }
    catch {
      // Path likely doesn't exist, ignore for now.
      return
    }

    // Check access permissions on all platforms
    if (!(await this.hasAccess(p))) {
      // Request access (may show dialog)
      const granted = await this.requestAccess(p)
      if (!granted) {
        // No permission yet, store in pending queue
        this.pendingPaths.set(p, { path: p, depth })
        console.log(`[FileSystemWatcher] Path ${p} added to pending queue, waiting for permission`)
        return
      }
    }

    // Permission granted or available, add to watcher
    try {
      await this.addPathInternal(p, depth)
    }
    catch (error: any) {
      // If still fails (e.g., operation not permitted), add to pending
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        this.pendingPaths.set(p, { path: p, depth })
        console.warn(`[FileSystemWatcher] Permission denied for ${p}, added to pending queue:`, error.message)
      }
      else {
        throw error
      }
    }
  }

  async onInit(): Promise<void> {
    console.debug(
      '[FileSystemWatcher] Initializing... Watch paths will be added by consumer modules.',
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
        runImmediately: false,
      },
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
