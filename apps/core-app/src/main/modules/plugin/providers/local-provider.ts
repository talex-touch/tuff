import fse from 'fs-extra'
import path from 'path'
import type { FSWatcher } from 'chokidar'
import { fileWatchService } from '../../../service/file-watch.service'
import { providersLog } from './logger'

export interface LocalWatcherHandlers {
  onFileChange(filePath: string): Promise<void> | void
  onDirectoryAdd(dirPath: string): Promise<void> | void
  onDirectoryRemove(dirPath: string): Promise<void> | void
  onReady?(): Promise<void> | void
  onError?(error: Error): void
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
      if (entry.startsWith('.')) continue
      const entryPath = path.resolve(this.pluginRoot, entry)
      const stats = await fse.stat(entryPath).catch(() => undefined)
      if (!stats?.isDirectory()) continue
      result.push(entry)
    }

    return result
  }

  startWatching(handlers: LocalWatcherHandlers): void {
    if (this.watcher) {
      this.log.warn('重复启动本地插件目录监听')
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

    this.log.info('已开始监听本地插件目录', {
      meta: { root: this.pluginRoot }
    })
  }

  async stopWatching(): Promise<void> {
    if (!this.watcher) return
    await fileWatchService.close(this.watcher)
    this.watcher = null
    this.log.info('已停止监听本地插件目录', {
      meta: { root: this.pluginRoot }
    })
  }

  trackFile(filePath: string): void {
    this.watcher?.add(filePath)
    this.log.debug('新增文件监听', {
      meta: { filePath }
    })
  }

  untrackFile(filePath: string): void {
    this.watcher?.unwatch(filePath)
    this.log.debug('取消文件监听', {
      meta: { filePath }
    })
  }

  getWatcher(): FSWatcher | null {
    return this.watcher
  }
}
