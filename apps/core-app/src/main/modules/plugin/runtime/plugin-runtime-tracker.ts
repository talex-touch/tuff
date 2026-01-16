import type { Worker } from 'node:worker_threads'

type PluginName = string

export class PluginRuntimeTracker {
  private readonly workerThreadIds = new Map<PluginName, Set<number>>()

  registerWorker(pluginName: string, worker: Worker): void {
    if (!pluginName)
      return

    const threadId = worker.threadId
    if (!this.workerThreadIds.has(pluginName)) {
      this.workerThreadIds.set(pluginName, new Set())
    }

    const threads = this.workerThreadIds.get(pluginName)!
    threads.add(threadId)

    worker.once('exit', () => {
      const set = this.workerThreadIds.get(pluginName)
      if (!set)
        return

      set.delete(threadId)
      if (set.size === 0)
        this.workerThreadIds.delete(pluginName)
    })
  }

  getWorkerCount(pluginName: string): number {
    return this.workerThreadIds.get(pluginName)?.size ?? 0
  }
}

export const pluginRuntimeTracker = new PluginRuntimeTracker()

