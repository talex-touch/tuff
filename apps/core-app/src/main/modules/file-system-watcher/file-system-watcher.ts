import type { TalexTouch } from '@talex-touch/utils'
import * as chokidar from 'chokidar'
import path from 'path'
import fs from 'fs/promises'
import { dialog } from 'electron'
import {
  touchEventBus,
  TalexEvents,
  FileAddedEvent,
  FileChangedEvent,
  FileUnlinkedEvent
} from '../../core/eventbus/touch-event'

const isMac = process.platform === 'darwin'

// Paths to watch for application changes
const WATCH_PATHS = isMac
  ? ['/Applications', path.join(process.env.HOME || '', 'Applications')]
  : [
      // For Windows, common installation directories.
      // Note: This is not exhaustive and might need user configuration in the future.
      path.join(process.env.PROGRAMFILES || '', '.'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', '.'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs')
    ]

/**
 * A module that watches the file system for application installations,
 * updates, and uninstalls, and emits events on the touchEventBus.
 */

class FileSystemWatcher implements TalexTouch.IModule {
  private static _instance: FileSystemWatcher

  name: symbol = Symbol('FileSystemWatcher')
  private watcher: chokidar.FSWatcher | null = null
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

    // response is the index of the button clicked. 0 is 'Open Folder Picker', 1 is 'Cancel'.
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
      // For sandboxed apps, this grants persistent access. We don't need to
      // verify the path, as the user granting *any* path is the point.
      // For non-sandboxed, this is just a formality.
      return true
    }

    console.warn(`[FileSystemWatcher] User did not select a directory for ${p}`)
    return false
  }

  public async addPath(p: string): Promise<void> {
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
    } catch (error) {
      console.warn(`[FileSystemWatcher] Path does not exist, skipping: ${p}`, error)
      return
    }

    if (isMac && !(await this.hasAccess(p))) {
      if (!(await this.requestAccess(p))) {
        console.warn(`[FileSystemWatcher] No access to ${p}, cannot watch.`)
        return
      }
    }

    this.watcher?.add(p)
    this.watchedPaths.add(p)
    console.log(`[FileSystemWatcher] Now watching path: ${p}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async init(app: TalexTouch.TouchApp, manager: TalexTouch.IModuleManager): Promise<void> {
    console.log('[FileSystemWatcher] Initializing...')

    FileSystemWatcher._instance.watcher = chokidar.watch([], {
      // Start with no paths
      ignored: isMac ? /(^|[/\\])\../ : /^(?!.*\.exe$).*/,
      persistent: true,
      ignoreInitial: true,
      depth: isMac ? 4 : undefined,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    })

    FileSystemWatcher._instance.watcher
      .on('add', (filePath: string) => {
        console.log(`[FileSystemWatcher] File added: ${filePath}`)
        touchEventBus.emit(TalexEvents.FILE_ADDED, new FileAddedEvent(filePath))
      })
      .on('change', (filePath: string) => {
        console.log(`[FileSystemWatcher] File changed: ${filePath}`)
        touchEventBus.emit(TalexEvents.FILE_CHANGED, new FileChangedEvent(filePath))
      })
      .on('unlink', (filePath: string) => {
        console.log(`[FileSystemWatcher] File unlinked: ${filePath}`)
        touchEventBus.emit(TalexEvents.FILE_UNLINKED, new FileUnlinkedEvent(filePath))
      })
      .on('ready', () => {
        console.log('[FileSystemWatcher] Initialized and ready to watch for changes.')
      })

    // Asynchronously add initial paths
    for (const p of WATCH_PATHS) {
      FileSystemWatcher._instance.addPath(p) // Intentionally not awaited
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  destroy(app: TalexTouch.TouchApp, manager: TalexTouch.IModuleManager): void {
    console.log('[FileSystemWatcher] Destroying...')
    if (this.watcher) {
      this.watcher.close()
      console.log('[FileSystemWatcher] Watcher stopped.')
    }
  }
}

export default FileSystemWatcher.getInstance()
