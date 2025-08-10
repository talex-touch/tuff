import type { TalexTouch } from '@talex-touch/utils'
import * as chokidar from 'chokidar'
import path from 'path'
import fs from 'fs'
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
export class FileSystemWatcher implements TalexTouch.IModule {
  name: symbol = Symbol('FileSystemWatcher')
  private watcher: chokidar.FSWatcher | null = null

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(app: TalexTouch.TouchApp, manager: TalexTouch.IModuleManager): void {
    console.log('[FileSystemWatcher] Initializing...')

    // Filter out paths that don't exist
    const existingPaths = WATCH_PATHS.filter((p) => fs.existsSync(p))
    console.log(`[FileSystemWatcher] Watching paths: ${existingPaths.join(', ')}`)

    this.watcher = chokidar.watch(existingPaths, {
      // We only care about .app directories on mac
      // and .exe files on windows/linux.
      ignored: isMac ? /(^|[/\\])\../ : /^(?!.*\.exe$).*/,
      persistent: true,
      // The initial scan is handled by AppProvider, so we ignore initial events.
      ignoreInitial: true,
      // Limit recursion depth to improve performance, especially on macOS.
      // /Applications/AppName.app/Contents/MacOS/AppName is depth 3.
      depth: isMac ? 4 : undefined,
      // Aguardar a gravação do arquivo terminar para evitar eventos prematuros
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    })

    this.watcher
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

    console.log('[FileSystemWatcher] Initialized and watching for changes.')
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
