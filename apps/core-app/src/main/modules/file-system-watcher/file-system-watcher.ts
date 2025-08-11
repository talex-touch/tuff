import type { TalexTouch } from '@talex-touch/utils'
import * as chokidar from 'chokidar'
import fs from 'fs/promises'
import { dialog } from 'electron'
import {
  touchEventBus,
  TalexEvents,
  FileAddedEvent,
  FileChangedEvent,
  FileUnlinkedEvent,
  DirectoryAddedEvent,
  DirectoryUnlinkedEvent
} from '../../core/eventbus/touch-event'

const isMac = process.platform === 'darwin'

/**
 * A module that watches the file system for application installations,
 * updates, and uninstalls, and emits events on the touchEventBus.
 * It manages multiple chokidar instances to handle different watch depths.
 */
class FileSystemWatcher implements TalexTouch.IModule {
  private static _instance: FileSystemWatcher

  name: symbol = Symbol('FileSystemWatcher')
  private watchers: Map<number, chokidar.FSWatcher> = new Map()
  private watchedPaths: Set<string> = new Set()

  constructor() {
    if (FileSystemWatcher._instance) {
      throw new Error('[FileSystemWatcher] Singleton class cannot be instantiated more than once.')
    }
    FileSystemWatcher._instance = this
  }

  static getInstance(): FileSystemWatcher {
    if (!this._instance) {
      this._instance = new FileSystemWatcher()
    }
    return this._instance
  }

  private async hasAccess(p: string): Promise<boolean> {
    try {
      await fs.access(p, fs.constants.R_OK)
      return true
    } catch {
      return false
    }
  }

  private async requestAccess(p: string): Promise<boolean> {
    console.log(`[FileSystemWatcher] Requesting access to ${p}`)
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Permission Request',
      message: 'TalexTouch needs access to your Applications folder to watch for new apps.',
      detail: `Please grant access to the following folder to continue: ${p}`,
      buttons: ['Open Folder Picker', 'Cancel']
    })

    if (response === 1) {
      console.warn(`[FileSystemWatcher] User cancelled access request for ${p}`)
      return false
    }

    const { filePaths } = await dialog.showOpenDialog({
      title: `Grant Access to ${p}`,
      properties: ['openDirectory'],
      defaultPath: p
    })

    if (filePaths && filePaths.length > 0) {
      console.log(`[FileSystemWatcher] Access granted to ${filePaths[0]}`)
      return true
    }

    console.warn(`[FileSystemWatcher] User did not select a directory for ${p}`)
    return false
  }

  private getOrCreateWatcher(depth: number): chokidar.FSWatcher {
    if (this.watchers.has(depth)) {
      return this.watchers.get(depth)!
    }

    const newWatcher = chokidar.watch([], {
      persistent: true,
      ignoreInitial: true,
      depth: depth,
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
      .on('error', (error) => {
        console.error(`[FileSystemWatcher] Watcher error with depth ${depth}:`, error)
      })

    this.watchers.set(depth, newWatcher)
    return newWatcher
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

    if (isMac && !(await this.hasAccess(p))) {
      if (!(await this.requestAccess(p))) {
        console.warn(`[FileSystemWatcher] No access to ${p}, cannot watch.`)
        return
      }
    }

    const watcher = this.getOrCreateWatcher(depth)
    watcher.add(p)
    this.watchedPaths.add(p)
    console.log(`[FileSystemWatcher] Now watching path: ${p} with depth: ${depth}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async init(app: TalexTouch.TouchApp, manager: TalexTouch.IModuleManager): Promise<void> {
    console.debug(
      '[FileSystemWatcher] Initializing... Watch paths will be added by consumer modules.'
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  destroy(app: TalexTouch.TouchApp, manager: TalexTouch.IModuleManager): void {
    console.log('[FileSystemWatcher] Destroying...')
    this.watchers.forEach((watcher, depth) => {
      watcher.close()
      console.log(`[FileSystemWatcher] Watcher with depth ${depth} stopped.`)
    })
    this.watchers.clear()
    this.watchedPaths.clear()
  }
}

export default FileSystemWatcher.getInstance()
