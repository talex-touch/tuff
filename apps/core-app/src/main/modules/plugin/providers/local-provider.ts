import type { FSWatcher } from 'chokidar'
import path from 'node:path'
import fse from 'fs-extra'
import { fileWatchService } from '../../../service/file-watch.service'
import { providersLog } from './logger'

export interface LocalWatcherHandlers {
  onFileChange: (filePath: string) => Promise<void> | void
  onDirectoryAdd: (dirPath: string) => Promise<void> | void
  onDirectoryRemove: (dirPath: string) => Promise<void> | void
  onReady?: () => Promise<void> | void
  onError?: (error: Error) => void
}

export class LocalPluginProvider {
  private watcher: FSWatcher | null = null
  private readonly log = providersLog.child('LocalWatcher')

  constructor(private readonly pluginRoot: string) {}

  async scan(): Promise<string[]> {
    if (!(await fse.pathExists(this.pluginRoot))) {
      return []
    }

    const entries = await fse.readdir(this.pluginRoot)
    const result: string[] = []

    for (const entry of entries) {
      // Skip hidden directories and internal plugin folders
      if (entry.startsWith('.')) continue
      if (entry.startsWith('__internal_')) continue
      const entryPath = path.resolve(this.pluginRoot, entry)
      const stats = await fse.stat(entryPath).catch(() => undefined)
      if (!stats?.isDirectory()) continue
      result.push(entry)
    }

    return result
  }

  startWatching(handlers: LocalWatcherHandlers): void {
    if (this.watcher) {
      this.log.warn('Duplicate local plugin directory watcher startup')
      return
    }

    this.watcher = fileWatchService.watch(this.pluginRoot, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: false,
      depth: 1,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 500
      }
    })

    this.watcher
      .on('change', (filePath) => {
        void handlers.onFileChange(filePath)
      })
      .on('addDir', (dirPath) => {
        void handlers.onDirectoryAdd(dirPath)
      })
      .on('unlinkDir', (dirPath) => {
        void handlers.onDirectoryRemove(dirPath)
      })
      .on('error', (error) => handlers.onError?.(error as Error))
      .on('ready', () => void handlers.onReady?.())

    this.log.debug('Started watching local plugin directory', {
      meta: { root: this.pluginRoot }
    })
  }

  async stopWatching(): Promise<void> {
    if (!this.watcher) return
    await fileWatchService.close(this.watcher)
    this.watcher = null
    this.log.debug('Stopped watching local plugin directory', {
      meta: { root: this.pluginRoot }
    })
  }

  trackFile(filePath: string): void {
    this.watcher?.add(filePath)
    this.log.debug('Added file watch', {
      meta: { filePath }
    })
  }

  untrackFile(filePath: string): void {
    this.watcher?.unwatch(filePath)
    this.log.debug('Removed file watch', {
      meta: { filePath }
    })
  }

  getWatcher(): FSWatcher | null {
    return this.watcher
  }
}
