import chokidar, { type FSWatcher, type WatchOptions } from 'chokidar'
import { touchEventBus, TalexEvents } from '../core/eventbus/touch-event'

export class FileWatchService {
  private readonly watchers: Set<FSWatcher> = new Set()

  constructor() {
    touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
      void this.closeAll()
    })
  }

  watch(
    paths: string | readonly string[] | undefined,
    options?: WatchOptions
  ): FSWatcher {
    const watcher = chokidar.watch(paths ?? [], {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      },
      ...options
    })

    this.watchers.add(watcher)
    watcher.on('close', () => this.watchers.delete(watcher))
    return watcher
  }

  async close(watcher: FSWatcher | null | undefined): Promise<void> {
    if (!watcher) return
    this.watchers.delete(watcher)
    await watcher.close().catch((error) => {
      console.warn('[FileWatchService] Failed to close watcher:', error)
    })
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.watchers).map(async (watcher) => {
        await watcher.close()
      })
    )
    this.watchers.clear()
  }
}

export const fileWatchService = new FileWatchService()
