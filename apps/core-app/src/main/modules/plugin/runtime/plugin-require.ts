import type { Worker as NodeWorker, WorkerOptions } from 'node:worker_threads'
import { pluginRuntimeTracker } from './plugin-runtime-tracker'

const WORKER_THREAD_MODULE_IDS = new Set(['worker_threads', 'node:worker_threads'])
export const PLUGIN_RUNTIME_DENIED_MODULE = 'PLUGIN_RUNTIME_DENIED_MODULE'

const DENIED_MODULE_EXACT_IDS = new Set([
  'electron',
  'node:electron',
  '@libsql/client',
  '@crosscopy/clipboard',
  'extract-file-icon'
])
const DENIED_MODULE_PREFIXES = [
  'electron/',
  'node:electron/',
  '@libsql/',
  '@crosscopy/clipboard/',
  'extract-file-icon/'
]

const instrumentedWorkerThreadsModuleCache = new Map<string, typeof import('node:worker_threads')>()

export class PluginRuntimeDeniedModuleError extends Error {
  readonly code = PLUGIN_RUNTIME_DENIED_MODULE
  readonly pluginName: string
  readonly moduleId: string

  constructor(pluginName: string, moduleId: string) {
    super(`Plugin runtime denied module "${moduleId}" for plugin "${pluginName}"`)
    this.name = 'PluginRuntimeDeniedModuleError'
    this.pluginName = pluginName
    this.moduleId = moduleId
  }
}

function normalizeModuleId(moduleId: string): string {
  return moduleId.trim().replace(/\\/g, '/')
}

function stripQueryAndHash(moduleId: string): string {
  return normalizeModuleId(moduleId).split(/[?#]/, 1)[0].toLowerCase()
}

function isNativeAddonRequest(moduleId: string): boolean {
  const normalized = stripQueryAndHash(moduleId)
  return normalized.endsWith('.node') || normalized.includes('.node/')
}

function isDeniedModuleId(moduleId: string): boolean {
  const normalized = normalizeModuleId(moduleId)
  if (DENIED_MODULE_EXACT_IDS.has(normalized)) {
    return true
  }
  if (DENIED_MODULE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true
  }
  return isNativeAddonRequest(normalized)
}

function assertAllowedPluginModule(pluginName: string, moduleId: string): void {
  if (isDeniedModuleId(moduleId)) {
    throw new PluginRuntimeDeniedModuleError(pluginName, moduleId)
  }
}

function getInstrumentedWorkerThreadsModule(
  pluginName: string
): typeof import('node:worker_threads') {
  const cached = instrumentedWorkerThreadsModuleCache.get(pluginName)
  if (cached) return cached

  const workerThreads = require('node:worker_threads') as typeof import('node:worker_threads')

  class InstrumentedWorker extends workerThreads.Worker {
    constructor(filename: string | URL, options?: WorkerOptions) {
      super(filename, options)
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
    assertAllowedPluginModule(pluginName, id)
    return baseRequire(id)
  }) as unknown as NodeRequire

  const resolve = ((id: string, options?: { paths?: string[] }) => {
    assertAllowedPluginModule(pluginName, id)
    const resolved = baseRequire.resolve(id, options)
    assertAllowedPluginModule(pluginName, resolved)
    return resolved
  }) as NodeRequire['resolve']
  resolve.paths = baseRequire.resolve.paths

  pluginRequire.resolve = resolve
  pluginRequire.cache = baseRequire.cache
  pluginRequire.extensions = baseRequire.extensions
  pluginRequire.main = baseRequire.main

  return pluginRequire
}
