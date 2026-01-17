import type { Worker as NodeWorker, WorkerOptions } from 'node:worker_threads'
import { pluginRuntimeTracker } from './plugin-runtime-tracker'

const WORKER_THREAD_MODULE_IDS = new Set(['worker_threads', 'node:worker_threads'])

const instrumentedWorkerThreadsModuleCache = new Map<string, typeof import('node:worker_threads')>()

function getInstrumentedWorkerThreadsModule(
  pluginName: string
): typeof import('node:worker_threads') {
  const cached = instrumentedWorkerThreadsModuleCache.get(pluginName)
  if (cached) return cached

  const workerThreads = require('node:worker_threads') as typeof import('node:worker_threads')

  class InstrumentedWorker extends workerThreads.Worker {
    constructor(filename: string | URL, options?: WorkerOptions) {
      super(filename as any, options as any)
      pluginRuntimeTracker.registerWorker(pluginName, this as unknown as NodeWorker)
    }
  }

  const module = {
    ...workerThreads,
    Worker: InstrumentedWorker as unknown as typeof workerThreads.Worker
  }

  instrumentedWorkerThreadsModuleCache.set(pluginName, module)
  return module
}

export function createPluginRequire(pluginName: string): NodeRequire {
  const baseRequire = require as NodeRequire

  const pluginRequire = ((id: string) => {
    if (WORKER_THREAD_MODULE_IDS.has(id)) {
      return getInstrumentedWorkerThreadsModule(pluginName)
    }
    return baseRequire(id)
  }) as unknown as NodeRequire

  pluginRequire.resolve = baseRequire.resolve
  pluginRequire.cache = baseRequire.cache
  pluginRequire.extensions = baseRequire.extensions
  pluginRequire.main = baseRequire.main

  return pluginRequire
}
