import fse from 'fs-extra'
import path from 'path'
import type { FSWatcher } from 'chokidar'
import { fileWatchService } from '../../../service/file-watch.service'

export interface LocalWatcherHandlers {
  onFileChange(filePath: string): Promise<void> | void
  onDirectoryAdd(dirPath: string): Promise<void> | void
  onDirectoryRemove(dirPath: string): Promise<void> | void
  onReady?(): Promise<void> | void
  onError?(error: Error): void
}

export class LocalPluginProvider {
  private watcher: FSWatcher | null = null

  constructor(private readonly pluginRoot: string) {}

  async scan(): Promise<string[]> {
    if (!(await fse.pathExists(this.pluginRoot))) {
      return []
    }

    const entries = await fse.readdir(this.pluginRoot)
    const result: string[] = []

    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const entryPath = path.resolve(this.pluginRoot, entry)
      const stats = await fse.stat(entryPath).catch(() => undefined)
      if (!stats?.isDirectory()) continue
      result.push(entry)
    }

    return result
  }

  startWatching(handlers: LocalWatcherHandlers): void {
    if (this.watcher) return

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
  }

  async stopWatching(): Promise<void> {
    if (!this.watcher) return
    await fileWatchService.close(this.watcher)
    this.watcher = null
  }

  trackFile(filePath: string): void {
    this.watcher?.add(filePath)
  }

  untrackFile(filePath: string): void {
    this.watcher?.unwatch(filePath)
  }

  getWatcher(): FSWatcher | null {
    return this.watcher
  }
}
