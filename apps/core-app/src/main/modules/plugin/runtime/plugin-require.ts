import type { Worker as NodeWorker, WorkerOptions } from 'node:worker_threads'
import { pluginRuntimeTracker } from './plugin-runtime-tracker'
import * as utilsSafeShell from '@talex-touch/utils/common/utils/safe-shell'
import * as utilsTransportEvents from '@talex-touch/utils/transport/events'
import * as utilsPluginWidget from '@talex-touch/utils/plugin/widget'

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

// Node built-ins the Prelude must not require directly — LIMITED to modules no
// official plugin legitimately needs (verified across plugins/*).
//
// IMPORTANT: official plugins DO use child_process / fs / os / process, so those
// are intentionally NOT denied — blacklisting them would break the plugin
// ecosystem. Their RCE/FS risk is exactly why process isolation (C1-B) exists:
// the root fix runs the Prelude in a utilityProcess, not a require blacklist.
// `worker_threads` is handled separately via its instrumented wrapper.
const DENIED_NODE_BUILTINS = new Set([
  'net',
  'dgram',
  'tls',
  'http',
  'https',
  'http2',
  'vm',
  'cluster',
  'module',
  'inspector',
  'repl',
  'v8'
])

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

function isDeniedNodeBuiltin(moduleId: string): boolean {
  const bare = stripQueryAndHash(moduleId).replace(/^node:/, '')
  return DENIED_NODE_BUILTINS.has(bare)
}

function isDeniedModuleId(moduleId: string): boolean {
  const normalized = normalizeModuleId(moduleId)
  if (DENIED_MODULE_EXACT_IDS.has(normalized)) {
    return true
  }
  if (DENIED_MODULE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true
  }
  if (isDeniedNodeBuiltin(normalized)) {
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

// ---------------------------------------------------------------------------
// Host-provided @talex-touch/utils subpaths
//
// The utils package ships as TypeScript SOURCE only (main: index.ts, no compiled
// .js and no "exports" map). It resolves fine inside the electron-vite bundle at
// BUILD time, but a Prelude's runtime `require('@talex-touch/utils/<subpath>')`
// goes through Node's native resolver, which cannot load a .ts file → the require
// throws MODULE_NOT_FOUND and the plugin silently degrades (e.g. safe-shell becomes
// null and every shell action returns "unsupported"). We map the specifiers that
// plugins actually require to the copies statically bundled into the main process,
// so Preludes get the real, working modules instead of a broken require.
const PROVIDED_UTILS_MODULES = new Map<string, unknown>([
  ['@talex-touch/utils/common/utils/safe-shell', utilsSafeShell],
  ['@talex-touch/utils/transport/events', utilsTransportEvents],
  ['@talex-touch/utils/plugin/widget', utilsPluginWidget]
])

function resolveProvidedUtilsModule(moduleId: string): unknown | undefined {
  const normalized = normalizeModuleId(moduleId).replace(/\.(?:c|m)?[jt]s$/i, '')
  return PROVIDED_UTILS_MODULES.get(normalized)
}

export function createPluginRequire(pluginName: string): NodeRequire {
  const baseRequire = require as NodeRequire

  const pluginRequire = ((id: string) => {
    if (WORKER_THREAD_MODULE_IDS.has(id)) {
      return getInstrumentedWorkerThreadsModule(pluginName)
    }
    const provided = resolveProvidedUtilsModule(id)
    if (provided !== undefined) {
      return provided
    }
    assertAllowedPluginModule(pluginName, id)
    return baseRequire(id)
  }) as unknown as NodeRequire

  const resolve = ((id: string, options?: { paths?: string[] }) => {
    if (resolveProvidedUtilsModule(id) !== undefined) {
      return normalizeModuleId(id)
    }
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
