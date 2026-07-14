import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { Client } from '@libsql/client'
import type {
  IManifest,
  IPluginManager,
  ITouchPlugin,
  PluginIssue,
  PluginInstallConfirmResponse
} from '@talex-touch/utils/plugin'
import type {
  PluginInstallRequest,
  PluginInstallSummary
} from '@talex-touch/utils/plugin/providers'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type {
  PluginApiGetFileTreeResponse,
  PluginInstallSourceResponse
} from '@talex-touch/utils/transport/events/types'
import type { PluginWithSource } from '../../service/store-api.service'
import { createHash } from 'node:crypto'
import path from 'node:path'
import * as util from 'node:util'
import fse from 'fs-extra'
import { sleep } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { isLocalizedText, normalizeLocale, resolveLocalizedText } from '@talex-touch/utils/i18n'
import { parseManifestPermissions } from '@talex-touch/utils/permission'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { CoreBoxEvents, StoreEvents, PluginEvents } from '@talex-touch/utils/transport/events'
import {
  PluginInstallCompletedEvent,
  TalexEvents,
  touchEventBus
} from '../../core/eventbus/touch-event'

import { createDbUtils } from '../../db/utils'
import { registerMainRuntime, resolveMainRuntime } from '../../core/runtime-accessor'
import {
  reportPluginUninstall,
  startUpdateScheduler,
  stopUpdateScheduler,
  triggerUpdateCheck
} from '../../service/store-api.service'
import { performStoreHttpRequest } from '../../service/store-http.service'
import { createLogger } from '../../utils/logger'
import { getLocale } from '../../utils/i18n-helper'
import { BaseModule } from '../abstract-base-module'
import { getNetworkService } from '../network'
import { databaseModule } from '../database'
import { getPermissionModule } from '../permission'
import {
  clearPluginLocalizationEntries,
  registerPluginLocalizationChannels
} from './plugin-localization-channels'
import { DevServerHealthMonitor } from './dev-server-monitor'
import { PluginInstallQueue } from './install-queue'
import { TouchPlugin } from './plugin'
import { PluginInstaller } from './plugin-installer'
import { isWidgetFeatureEnabled } from './widget/widget-issue'
import { widgetManager } from './widget/widget-manager'

import { createPluginLoadShell, createPluginLoader } from './plugin-loaders'
import {
  applyPluginPreflightFailure,
  applyLoadedPluginPreflightState,
  broadcastPluginPreflightState,
  buildLoaderFatalPreflightFailure,
  buildRuntimeDriftPreflightFailure
} from './plugin-preflight-helper'
import { LocalPluginProvider } from './providers/local-provider'

import { inspectPluginRuntimeDrift } from './runtime/plugin-runtime-repair'
import { getPluginSdkHardCutGate } from './sdkapi-hard-cut-gate'
import { resolvePluginModuleIoRuntime } from './services/plugin-io-service'
import { DevPluginWatcher } from './services/dev-plugin-watcher'
import {
  requestPluginPermissionConfirmation,
  syncPermissionMissingIssue
} from './services/plugin-permission-gate'
import { registerPluginApiTransportHandlers } from './services/plugin-api-transport-service'
import { registerPluginStoreTransportHandlers } from './services/plugin-store-transport-service'
import { registerPluginStorageTransportHandlers } from './services/plugin-storage-transport-service'
import { registerPluginWindowTransportHandlers } from './services/plugin-window-transport-service'
import { buildPluginManagerRuntime } from './services/plugin-manager-orchestrator'

const pluginLog = getLogger('plugin-system')
const pluginModuleLog = createLogger('PluginSystem')
const pluginIpcLog = pluginModuleLog.child('IPC')
const WIDGET_ROOT_DIR = 'widgets'
const WIDGET_ALLOWED_EXTENSIONS = new Set(['.vue', '.tsx', '.jsx', '.ts', '.js'])
const PLUGIN_FILE_TREE_MAX_DEPTH = 5
const PLUGIN_FILE_TREE_MAX_ENTRIES = 500
const PLUGIN_FILE_TREE_IGNORED_DIRS = new Set(['.git', '.vite', 'dist', 'logs', 'node_modules'])
const ISSUE_FULL_RESYNC_INTERVAL_MS = 45 * 60 * 1000
type PluginLifecycleChannel = {
  broadcastPlugin: (pluginName: string, eventName: string, arg?: unknown) => void
}

function resolveInstallPermissionReasons(
  reasons: Record<string, unknown> | undefined
): Record<string, string> {
  const locale = normalizeLocale(getLocale()) ?? 'en-US'
  const resolved: Record<string, string> = {}
  for (const [permissionId, reason] of Object.entries(reasons ?? {})) {
    resolved[permissionId] = isLocalizedText(reason)
      ? resolveLocalizedText(reason, locale)
      : typeof reason === 'string'
        ? reason
        : ''
  }
  return resolved
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error'

function getPluginRuntimeLogsPath(plugin: TouchPlugin): string {
  return path.join(plugin.pluginPath, 'logs')
}

async function buildPluginFileTree(rootPath: string): Promise<PluginApiGetFileTreeResponse> {
  let entryCount = 0

  async function readDirectory(
    currentPath: string,
    depth: number
  ): Promise<PluginApiGetFileTreeResponse> {
    if (depth > PLUGIN_FILE_TREE_MAX_DEPTH || entryCount >= PLUGIN_FILE_TREE_MAX_ENTRIES) {
      return []
    }

    const dirents = await fse.readdir(currentPath, { withFileTypes: true })
    const nodes: PluginApiGetFileTreeResponse = []

    for (const dirent of dirents) {
      if (entryCount >= PLUGIN_FILE_TREE_MAX_ENTRIES) break
      if (dirent.name.startsWith('.') && dirent.name !== '.env.example') continue
      if (dirent.isDirectory() && PLUGIN_FILE_TREE_IGNORED_DIRS.has(dirent.name)) continue

      const absolutePath = path.join(currentPath, dirent.name)
      const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, '/')
      const stats = await fse.lstat(absolutePath)
      entryCount += 1

      if (dirent.isDirectory()) {
        nodes.push({
          name: dirent.name,
          path: relativePath,
          type: 'directory',
          size: 0,
          modified: stats.mtimeMs,
          children: await readDirectory(absolutePath, depth + 1)
        })
        continue
      }

      if (dirent.isFile()) {
        nodes.push({
          name: dirent.name,
          path: relativePath,
          type: 'file',
          size: stats.size,
          modified: stats.mtimeMs
        })
      }
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  return readDirectory(rootPath, 1)
}

const logIpcHandlerError = (handler: string, error: unknown): void => {
  pluginIpcLog.error('Plugin IPC handler failed', {
    meta: { handler },
    error
  })
}

function resolveWidgetFeaturePath(plugin: TouchPlugin, widgetPath: string): string | null {
  const trimmed = widgetPath.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '')
  const withoutRoot = normalized.replace(/^widgets\//, '')
  if (!withoutRoot || withoutRoot.split('/').some((segment) => segment === '..')) return null

  const widgetsDir = path.resolve(plugin.pluginPath, WIDGET_ROOT_DIR)
  const candidate = path.resolve(widgetsDir, withoutRoot)
  const relative = path.relative(widgetsDir, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null

  const finalPath = path.extname(candidate) ? candidate : `${candidate}.vue`
  const ext = path.extname(finalPath).toLowerCase()
  if (!WIDGET_ALLOWED_EXTENSIONS.has(ext)) return null
  return finalPath
}

async function collectWidgetFiles(rootDir: string): Promise<string[]> {
  const entries = await fse.readdir(rootDir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.resolve(rootDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectWidgetFiles(fullPath)))
      continue
    }
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (WIDGET_ALLOWED_EXTENSIONS.has(ext)) {
      files.push(fullPath)
    }
  }

  return files
}

async function precompilePluginWidgets(plugin: TouchPlugin): Promise<void> {
  const widgetFeatures = plugin.features.filter(
    (feature) =>
      isWidgetFeatureEnabled(plugin, feature) &&
      feature.interaction?.type === 'widget' &&
      typeof feature.interaction?.path === 'string' &&
      feature.interaction.path.trim().length > 0
  )

  if (!widgetFeatures.length) return
  plugin.logger.info(`[Widget] Precompiling ${widgetFeatures.length} widget(s)`)

  for (const feature of widgetFeatures) {
    try {
      const result = await widgetManager.registerWidget(plugin, feature)
      if (!result) {
        const hasWidgetIssue = plugin.issues.some(
          (issue) => issue.source === `feature:${feature.id}` && issue.code?.startsWith('WIDGET_')
        )
        if (!hasWidgetIssue) {
          plugin.issues.push({
            type: 'warning',
            message: `Widget compile skipped for feature "${feature.id}" (${feature.interaction?.path ?? 'unknown'})`,
            source: `feature:${feature.id}`,
            code: 'WIDGET_COMPILE_SKIPPED',
            suggestion: 'Check widget interaction.path and widget source file.',
            timestamp: Date.now()
          })
        }
        plugin.logger.debug(
          `[Widget] Compile skipped for feature "${feature.id}" (${feature.interaction?.path})`
        )
      }
    } catch (error) {
      plugin.issues.push({
        type: 'warning',
        message: `Widget compile failed for feature "${feature.id}": ${(error as Error).message}`,
        source: `feature:${feature.id}`,
        code: 'WIDGET_COMPILE_FAILED',
        suggestion: 'Check widget source syntax and dependencies.',
        timestamp: Date.now()
      })
      plugin.logger.debug(
        `[Widget] Compile failed for feature "${feature.id}" (${(error as Error).message})`
      )
    }
  }
}

async function warnUnusedWidgets(plugin: TouchPlugin): Promise<void> {
  const widgetsDir = path.resolve(plugin.pluginPath, WIDGET_ROOT_DIR)
  try {
    if (!(await fse.pathExists(widgetsDir))) return
    const widgetFiles = await collectWidgetFiles(widgetsDir)
    if (!widgetFiles.length) return

    const usedWidgetFiles = new Set<string>()
    plugin.features.forEach((feature) => {
      if (!isWidgetFeatureEnabled(plugin, feature)) return
      if (feature.interaction?.type !== 'widget') return
      if (typeof feature.interaction?.path !== 'string') return
      const resolved = resolveWidgetFeaturePath(plugin, feature.interaction.path)
      if (resolved) {
        usedWidgetFiles.add(resolved)
      }
    })

    const unused = widgetFiles.filter((filePath) => !usedWidgetFiles.has(filePath))
    if (!unused.length) return

    const displayPaths = unused.map((filePath) =>
      path.relative(widgetsDir, filePath).split(path.sep).join('/')
    )
    plugin.issues.push({
      type: 'warning',
      message: `Unused widget files: ${displayPaths.join(', ')}`,
      source: 'widgets',
      code: 'WIDGET_UNUSED_FILES',
      suggestion: 'Remove unused files or reference them in manifest feature interaction.path.',
      timestamp: Date.now()
    })
    plugin.logger.debug(`[Widget] Unused widget files tracked as issue: ${displayPaths.join(', ')}`)
  } catch (error) {
    plugin.issues.push({
      type: 'warning',
      message: `Failed to scan widgets directory: ${(error as Error).message}`,
      source: 'widgets',
      code: 'WIDGET_SCAN_FAILED',
      timestamp: Date.now()
    })
    plugin.logger.debug(`[Widget] Failed to scan widgets directory: ${(error as Error).message}`)
  }
}

type IPluginManagerWithInternals = IPluginManager & {
  __installQueue?: PluginInstallQueue
  pendingPermissionPlugins?: Map<string, { pluginName: string; autoRetry: boolean }>
  emitIssueDelta?: (plugin: ITouchPlugin) => boolean
  emitIssueReset?: (plugin: ITouchPlugin) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function buildIssueId(issue: PluginIssue): string {
  const rawId = typeof issue.id === 'string' ? issue.id.trim() : ''
  if (rawId) return rawId

  const code = typeof issue.code === 'string' ? issue.code.trim() : ''
  const source = typeof issue.source === 'string' ? issue.source.trim() : ''
  if (code || source) {
    return `${code || 'NO_CODE'}::${source || 'NO_SOURCE'}`
  }

  const hashSeed = `${issue.type}|${issue.message}|${source}|${code}`
  const hash = createHash('sha1').update(hashSeed).digest('hex').slice(0, 12)
  return `ISSUE::${hash}`
}

function normalizeIssue(issue: PluginIssue): PluginIssue {
  const id = buildIssueId(issue)
  if (issue.id === id) return issue
  return { ...issue, id }
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return String(value)
  }
}

function getIssueFingerprint(issue: PluginIssue): string {
  return [
    issue.type,
    issue.code || '',
    issue.source || '',
    issue.message || '',
    issue.suggestion || '',
    String(issue.timestamp || 0),
    stableStringify(issue.meta ?? null)
  ].join('|')
}

function normalizePluginIssues(plugin: ITouchPlugin): boolean {
  const sourceIssues = Array.isArray(plugin.issues) ? plugin.issues : []
  const nextIssuesById = new Map<string, PluginIssue>()
  let changed = false

  sourceIssues.forEach((issue) => {
    const normalized = normalizeIssue(issue)
    if (normalized.id !== issue.id) changed = true

    const id = normalized.id as string
    const existing = nextIssuesById.get(id)
    if (!existing) {
      nextIssuesById.set(id, normalized)
      return
    }

    const nextTs = normalized.timestamp || 0
    const currentTs = existing.timestamp || 0
    if (nextTs >= currentTs) {
      nextIssuesById.set(id, normalized)
    }
    changed = true
  })

  const nextIssues = Array.from(nextIssuesById.values())
  if (!changed && nextIssues.length === sourceIssues.length) return false
  plugin.issues = nextIssues
  return true
}

/**
 * Create plugin manager instance
 * @param pluginPath - Base directory for plugins
 * @returns Plugin manager instance
 */
const INTERNAL_PLUGIN_NAMES = new Set<string>()

function createPluginModuleInternal(
  pluginPath: string,
  transport: ITuffTransportMain,
  _channel: PluginLifecycleChannel,
  mainWindowId: number
): IPluginManager {
  const plugins: Map<string, ITouchPlugin> = new Map()
  let active: string = ''
  const enabledPlugins = new Set<string>()
  const loadingPlugins = new Set<string>()
  const reloadingPlugins = new Set<string>()
  const pendingPermissionPlugins = new Map<string, { pluginName: string; autoRetry: boolean }>()
  const pluginNameIndex: Map<string, string> = new Map()
  const issueSnapshots = new Map<string, Map<string, string>>()
  let issueFullResyncTimer: NodeJS.Timeout | null = null
  const dbUtils = createDbUtils(databaseModule.getDb())
  const initialLoadPromises: Promise<boolean>[] = []

  /**
   * Format log arguments for plugin logging
   * @param args - Arguments to format
   * @returns Formatted string
   */
  const formatLogArgs = (args: unknown[]): string => {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg
        if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') {
          return String(arg)
        }
        if (arg instanceof Error) {
          return arg.stack || arg.message
        }
        if (arg === null) return 'null'
        if (typeof arg === 'undefined') return 'undefined'
        if (typeof arg === 'symbol') return arg.toString()
        return util.inspect(arg, { depth: 3, colors: false })
      })
      .join(' ')
      .trim()
  }
  const extractError = (args: unknown[]): Error | undefined => {
    return args.find((arg) => arg instanceof Error) as Error | undefined
  }
  const logWarn = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    pluginLog.warn(message)
  }
  const logError = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    const error = extractError(args)
    pluginLog.error(message, error ? { error } : undefined)
  }
  const logDebug = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    pluginLog.debug(message)
  }
  const logModuleInfo = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    pluginModuleLog.info(message)
  }
  const pluginTag = (name: string): string => `[${name}]`
  const syncPluginDeclaredPermissions = (plugin: ITouchPlugin): void => {
    const permissionModule = getPermissionModule()
    if (!permissionModule) return

    permissionModule.syncDeclaredPermissions(plugin.name, {
      required: plugin.declaredPermissions?.required || [],
      optional: plugin.declaredPermissions?.optional || []
    })
  }
  const clearPluginDeclaredPermissions = (pluginId: string): void => {
    const permissionModule = getPermissionModule()
    if (!permissionModule) return
    permissionModule.clearDeclaredPermissions(pluginId)
  }

  const createIssueSnapshot = (plugin: ITouchPlugin): Map<string, string> => {
    normalizePluginIssues(plugin)
    const snapshot = new Map<string, string>()
    plugin.issues.forEach((issue) => {
      const normalized = normalizeIssue(issue)
      snapshot.set(normalized.id as string, getIssueFingerprint(normalized))
    })
    return snapshot
  }

  const rememberIssueSnapshot = (plugin: ITouchPlugin): void => {
    issueSnapshots.set(plugin.name, createIssueSnapshot(plugin))
  }

  const clearIssueSnapshot = (pluginName: string): void => {
    issueSnapshots.delete(pluginName)
  }

  const emitIssueDelta = (plugin: ITouchPlugin): boolean => {
    const previous = issueSnapshots.get(plugin.name) ?? new Map<string, string>()
    const next = createIssueSnapshot(plugin)
    issueSnapshots.set(plugin.name, next)

    let hasChanges = false

    plugin.issues.forEach((issue) => {
      const normalized = normalizeIssue(issue)
      const id = normalized.id as string
      const fingerprint = next.get(id)
      const previousFingerprint = previous.get(id)

      if (!previousFingerprint) {
        hasChanges = true
        transport.broadcast(PluginEvents.push.stateChanged, {
          type: 'issue-created',
          name: plugin.name,
          issue: normalized
        })
        return
      }

      if (previousFingerprint !== fingerprint) {
        hasChanges = true
        transport.broadcast(PluginEvents.push.stateChanged, {
          type: 'issue-updated',
          name: plugin.name,
          issue: normalized
        })
      }
    })

    previous.forEach((_fingerprint, issueId) => {
      if (!next.has(issueId)) {
        hasChanges = true
        transport.broadcast(PluginEvents.push.stateChanged, {
          type: 'issue-deleted',
          name: plugin.name,
          issueId
        })
      }
    })

    return hasChanges
  }

  const emitIssueReset = (plugin: ITouchPlugin): void => {
    const snapshot = createIssueSnapshot(plugin)
    issueSnapshots.set(plugin.name, snapshot)
    transport.broadcast(PluginEvents.push.stateChanged, {
      type: 'issues-reset',
      name: plugin.name,
      issues: plugin.issues.map((issue) => normalizeIssue(issue))
    })
  }

  const installer = new PluginInstaller()

  const persistInstallSourceMetadata = async ({
    request,
    manifest,
    providerResult
  }: {
    request: PluginInstallRequest
    manifest?: IManifest
    providerResult: PluginInstallSummary['providerResult']
  }): Promise<void> => {
    const pluginName = manifest?.name
    if (!pluginName) {
      logWarn('Failed to persist install metadata: missing plugin name')
      return
    }
    try {
      await dbUtils.setPluginData(pluginName, 'install_source', {
        source: request.source,
        hintType: request.hintType ?? null,
        official: Boolean(providerResult.official),
        provider: providerResult.provider,
        installedAt: Date.now(),
        metadata: request.metadata ?? null,
        clientMetadata: request.clientMetadata ?? null
      })
    } catch (error) {
      logWarn('Failed to save plugin source metadata', pluginTag(pluginName), error as Error)
    }
  }

  const installQueue = new PluginInstallQueue(installer, transport, mainWindowId, {
    onInstallCompleted: async ({ request, manifest, providerResult }) => {
      await persistInstallSourceMetadata({ request, manifest, providerResult })
      const pluginName = manifest?.name
      if (pluginName) {
        touchEventBus.emit(
          TalexEvents.PLUGIN_INSTALL_COMPLETED,
          new PluginInstallCompletedEvent(pluginName, request.source, Date.now())
        )
      }
    },
    resolvePermissionConfirmation: async ({ request, manifest, clientMetadata }) => {
      if (!manifest?.name) return null
      const sdkGate = getPluginSdkHardCutGate(manifest.name, manifest.sdkapi)
      if (sdkGate.blocked) {
        throw new Error(sdkGate.message)
      }
      const permissionModule = getPermissionModule()
      if (!permissionModule) return null
      const declared = parseManifestPermissions({
        permissions: manifest.permissions,
        permissionReasons: manifest.permissionReasons
      })
      if (declared.required.length === 0) return null
      if (
        !permissionModule.needsPermissionConfirmation(manifest.name, manifest.sdkapi, {
          required: declared.required,
          optional: declared.optional
        })
      ) {
        return null
      }

      const missing = permissionModule.getMissingPermissions(manifest.name, manifest.sdkapi, {
        required: declared.required,
        optional: declared.optional
      })
      if (missing.required.length === 0) return null

      const clientPluginName =
        typeof clientMetadata?.pluginName === 'string' &&
        clientMetadata.pluginName.trim().length > 0
          ? clientMetadata.pluginName.trim()
          : ''

      return {
        taskId: '',
        kind: 'permissions',
        pluginId: manifest.name,
        pluginName: clientPluginName || manifest.name,
        source: request.source,
        permissions: {
          required: missing.required,
          optional: missing.optional,
          reasons: resolveInstallPermissionReasons(declared.reasons)
        }
      }
    },
    onPermissionConfirmed: async ({ request, response }) => {
      if (response.decision !== 'accept') return
      const permissionModule = getPermissionModule()
      if (!permissionModule) return
      const pluginId = request.pluginId
      const requiredPermissions = request.permissions?.required || []
      if (!pluginId || requiredPermissions.length === 0) return

      if (response.grantMode === 'session') {
        await permissionModule.grantSession(pluginId, requiredPermissions)
        return
      }
      await permissionModule.grantAll(pluginId, requiredPermissions, 'user')
    }
  })
  const localProvider = new LocalPluginProvider(pluginPath)

  const getPluginList = (): Array<object> => {
    logDebug('getPluginList called.')
    const list = new Array<object>()

    try {
      for (const plugin of plugins.values()) {
        if (!plugin) {
          logWarn('Skipping null/undefined plugin')
          continue
        }

        logDebug(
          'Processing plugin entry',
          pluginTag(plugin.name),
          'status:',
          PluginStatus[(plugin as TouchPlugin).status]
        )
        list.push((plugin as TouchPlugin).toJSONObject())
      }

      logDebug(`Returning plugin list with ${list.length} item(s).`)
      return list
    } catch (error) {
      logError('Error in getPluginList:', error)
      return []
    }
  }

  const setActivePlugin = (pluginName: string): boolean => {
    // Handle deactivation of currently active plugin
    if (active && active !== pluginName) {
      const previousPlugin = plugins.get(active)

      if (previousPlugin) {
        logDebug(
          `Deactivating plugin ${pluginTag(active)}: ${PluginStatus[previousPlugin.status]} → ENABLED`
        )

        transport.broadcastPlugin(active, PluginEvents.lifecycleSignal.inactive, undefined)

        if (previousPlugin.status === PluginStatus.ACTIVE) {
          previousPlugin.status = PluginStatus.ENABLED
        }
      }
    }

    // Handle activation of new plugin
    if (pluginName) {
      const plugin = plugins.get(pluginName)

      if (!plugin) {
        logWarn(`Cannot activate plugin ${pluginTag(pluginName)}: plugin not found`)
        return false
      }

      // Allow activation if plugin is ENABLED or already ACTIVE (idempotent)
      const validStates = [PluginStatus.ENABLED, PluginStatus.ACTIVE]
      if (!validStates.includes(plugin.status)) {
        logWarn(
          `Cannot activate plugin ${pluginTag(pluginName)}: invalid status ${PluginStatus[plugin.status]} (expected ENABLED or ACTIVE)`
        )
        return false
      }

      // Avoid redundant activation
      if (active === pluginName && plugin.status === PluginStatus.ACTIVE) {
        logDebug(`Plugin ${pluginTag(pluginName)} is already active, skipping`)
        return true
      }

      logDebug(
        `Activating plugin ${pluginTag(pluginName)}: ${PluginStatus[plugin.status]} → ACTIVE`
      )

      plugin.status = PluginStatus.ACTIVE
      active = pluginName

      transport.broadcastPlugin(pluginName, PluginEvents.lifecycleSignal.active, undefined)
    } else {
      // Clear active plugin if no name provided
      active = ''
    }

    return true
  }

  const getPluginByName = (name: string): ITouchPlugin | undefined => {
    const folderKey = pluginNameIndex.get(name) ?? name
    const pluginByFolder = plugins.get(folderKey)
    if (pluginByFolder && pluginByFolder.name === name) {
      return pluginByFolder
    }

    if (plugins.has(name)) {
      return plugins.get(name)
    }

    for (const plugin of plugins.values()) {
      if (plugin.name === name) {
        return plugin
      }
    }

    return undefined
  }

  const hasPlugin = (name: string): boolean => {
    return plugins.has(name) || !!getPluginByName(name)
  }

  const startHealthMonitoringIfNeeded = (plugin: ITouchPlugin): void => {
    if (plugin.dev.enable && plugin.dev.source && managerInstance.healthMonitor) {
      managerInstance.healthMonitor.startMonitoring(plugin)
    }
  }

  const stopHealthMonitoring = (pluginName: string): void => {
    if (managerInstance.healthMonitor) {
      managerInstance.healthMonitor.stopMonitoring(pluginName)
    }
  }

  const enablePlugin = async (
    pluginName: string,
    skipPermissionCheck = false
  ): Promise<boolean> => {
    let plugin = plugins.get(pluginName)
    if (!plugin) return false

    if (plugin.status === PluginStatus.LOAD_FAILED) {
      pluginLog.info('Attempting to enable failed plugin, reloading first', {
        meta: { plugin: pluginName }
      })

      await reloadPlugin(pluginName)

      plugin = plugins.get(pluginName)
      if (!plugin || plugin.status !== PluginStatus.DISABLED) {
        return false
      }
    }

    if (plugin.loadError?.code === 'SDKAPI_BLOCKED') {
      pluginLog.warn('Plugin enable blocked by sdkapi hard-cut', {
        meta: { plugin: pluginName, code: plugin.loadError.code }
      })
      return false
    }

    if (
      !skipPermissionCheck &&
      requestPluginPermissionConfirmation({
        pluginName,
        plugin,
        transport,
        mainWindowId,
        pendingPermissionPlugins,
        log: pluginLog
      })
    ) {
      return false
    }

    const success = await plugin.enable()
    emitIssueDelta(plugin)
    if (success) {
      enabledPlugins.add(pluginName)
      await persistEnabledPlugins()
      startHealthMonitoringIfNeeded(plugin)
    }
    return success
  }

  const disablePlugin = async (pluginName: string): Promise<boolean> => {
    const plugin = plugins.get(pluginName)
    if (!plugin) return false

    stopHealthMonitoring(pluginName)

    const success = await plugin.disable()
    if (success) {
      clearPluginLocalizationEntries(plugin.name)
      enabledPlugins.delete(pluginName)
      await persistEnabledPlugins()
    }
    return success
  }

  const reloadPlugin = async (pluginName: string): Promise<void> => {
    if (reloadingPlugins.has(pluginName)) {
      logDebug('Skip reload because plugin already reloading:', pluginTag(pluginName))
      return
    }

    const plugin = plugins.get(pluginName)
    if (!plugin) {
      logError('Cannot reload plugin - not found:', pluginTag(pluginName))
      return
    }

    reloadingPlugins.add(pluginName)

    try {
      logModuleInfo('Reloading plugin', pluginTag(pluginName))

      stopHealthMonitoring(pluginName)

      const _enabled =
        plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE

      if (plugin.status !== PluginStatus.LOAD_FAILED) {
        await plugin.disable()
      }

      await unloadPlugin(pluginName)

      logDebug('Waiting 0.200s before reloading plugin...', pluginTag(pluginName))
      await sleep(200)

      await loadPlugin(pluginName)

      const newPlugin = plugins.get(pluginName) as TouchPlugin
      if (newPlugin) {
        if (_enabled) {
          await newPlugin.enable()
          emitIssueDelta(newPlugin)
          enabledPlugins.add(pluginName)
          await persistEnabledPlugins()
          startHealthMonitoringIfNeeded(newPlugin)
        }
        logModuleInfo('Plugin reloaded successfully', pluginTag(pluginName))
      } else {
        logError('Plugin failed to reload, it could not be loaded again.', pluginTag(pluginName))
      }
    } catch (error) {
      logError('Error while reloading plugin', pluginTag(pluginName), error)
    } finally {
      reloadingPlugins.delete(pluginName)
    }
  }

  const persistEnabledPlugins = async (): Promise<void> => {
    try {
      await dbUtils.setPluginData(
        'internal:plugin-module',
        'enabled_plugins',
        Array.from(enabledPlugins)
      )
      logDebug('Persisted enabled plugins state.')
    } catch (error) {
      logError('Failed to persist enabled plugins state:', error)
    }
  }

  const listPlugins = async (): Promise<Array<string>> => {
    return localProvider.scan()
  }

  const loadPlugin = async (pluginName: string): Promise<boolean> => {
    if (INTERNAL_PLUGIN_NAMES.has(pluginName)) {
      logDebug('Skipping disk load for internal plugin', pluginTag(pluginName))
      return true
    }
    if (loadingPlugins.has(pluginName)) {
      logDebug('Skip load because plugin is already loading.', pluginTag(pluginName))
      return false
    }

    loadingPlugins.add(pluginName)
    try {
      const currentPluginPath = path.resolve(pluginPath, pluginName)

      const loadingShell = createPluginLoadShell(pluginName, currentPluginPath, {
        skipDataInit: true
      })
      loadingShell.setRuntime({
        rootPath: path.dirname(pluginPath),
        mainWindowId
      })
      loadingShell.status = PluginStatus.LOADING
      plugins.set(pluginName, loadingShell)
      syncPluginDeclaredPermissions(loadingShell)
      rememberIssueSnapshot(loadingShell)
      transport.broadcast(PluginEvents.push.stateChanged, {
        type: 'added',
        plugin: loadingShell.toJSONObject()
      })

      logDebug('Ready to load plugin from disk', pluginTag(pluginName), 'path:', currentPluginPath)

      const runtimeDrift = await inspectPluginRuntimeDrift({ pluginDir: currentPluginPath })
      if (runtimeDrift.status === 'drifted') {
        applyPluginPreflightFailure(loadingShell, buildRuntimeDriftPreflightFailure(runtimeDrift), {
          transport,
          sync: {
            syncDeclaredPermissions: syncPluginDeclaredPermissions,
            rememberIssueSnapshot
          },
          broadcastName: pluginName
        })
        logWarn('Plugin failed to load: runtime drift detected', pluginTag(pluginName), {
          reasons: runtimeDrift.driftReasons
        })
        return true
      }

      try {
        const loadStartTime = Date.now()
        const loader = createPluginLoader(pluginName, currentPluginPath)
        const touchPlugin = await loader.load()
        touchPlugin.setRuntime({
          rootPath: path.dirname(pluginPath),
          mainWindowId
        })
        touchPlugin.markLoadStart()
        touchPlugin._performanceMetrics.loadStartTime = loadStartTime // Set actual start time
        touchPlugin.markLoadEnd()

        const manifestName = touchPlugin.name || pluginName
        const normalizedName = manifestName.trim()
        const existingFolderForName = pluginNameIndex.get(normalizedName)

        if (existingFolderForName && existingFolderForName !== pluginName) {
          logError(
            'Duplicate plugin name detected, loading blocked.',
            pluginTag(pluginName),
            '| manifestName:',
            normalizedName,
            '| existingFolder:',
            existingFolderForName
          )
          touchPlugin.issues.push({
            type: 'error',
            message: `Duplicate plugin '${normalizedName}' detected, already loaded in directory '${existingFolderForName}'. Please remove the duplicate plugin or modify the name and try again.`,
            source: 'manifest.json',
            code: 'DUPLICATE_PLUGIN_NAME',
            suggestion: `Ensure plugin names are unique across all plugins. Directory '${existingFolderForName}' currently uses this name.`,
            timestamp: Date.now()
          })
          touchPlugin.status = PluginStatus.LOAD_FAILED
        } else {
          pluginNameIndex.set(normalizedName, pluginName)
        }

        applyLoadedPluginPreflightState(touchPlugin)
        if (touchPlugin.status === PluginStatus.LOAD_FAILED) {
          touchPlugin.logger.error('[Lifecycle] load failed')
          touchPlugin.issues
            .filter((issue) => issue.type === 'error')
            .forEach((issue) => {
              touchPlugin.logger.error(`[Issue] ${issue.code ?? 'ERROR'}: ${issue.message}`, issue)
            })
        } else {
          touchPlugin.logger.info(`[Lifecycle] loaded (${touchPlugin.features.length} features)`)
          await precompilePluginWidgets(touchPlugin)
          await warnUnusedWidgets(touchPlugin)
        }

        localProvider.trackFile(path.resolve(currentPluginPath, 'README.md'))
        plugins.set(pluginName, touchPlugin)
        syncPluginDeclaredPermissions(touchPlugin)
        syncPermissionMissingIssue(touchPlugin)
        rememberIssueSnapshot(touchPlugin)
        devWatcherInstance.addPlugin(touchPlugin)

        logDebug(
          'Plugin metadata loaded',
          pluginTag(pluginName),
          '| version:',
          touchPlugin.version,
          '| features:',
          touchPlugin.features.length,
          '| issues:',
          touchPlugin.issues.length
        )

        broadcastPluginPreflightState(transport, touchPlugin, pluginName)
      } catch (error: unknown) {
        logError('Unhandled error while loading plugin', pluginTag(pluginName), error)
        applyPluginPreflightFailure(loadingShell, buildLoaderFatalPreflightFailure(error), {
          transport,
          sync: {
            syncDeclaredPermissions: syncPluginDeclaredPermissions,
            rememberIssueSnapshot
          },
          broadcastName: pluginName,
          loggerError: error as Error
        })
      }

      return true
    } finally {
      loadingPlugins.delete(pluginName)
    }
  }

  const unloadPlugin = (pluginName: string): Promise<boolean> => {
    const plugin = plugins.get(pluginName)
    if (!plugin) return Promise.resolve(false)

    const currentPluginPath = path.resolve(pluginPath, pluginName)
    localProvider.untrackFile(path.resolve(currentPluginPath, 'README.md'))

    devWatcherInstance.removePlugin(pluginName)
    stopHealthMonitoring(pluginName)

    if (pluginNameIndex.get(plugin.name) === pluginName) {
      pluginNameIndex.delete(plugin.name)
    }

    try {
      if (plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE) {
        plugin.disable().catch((error) => {
          logWarn('Error disabling plugin during unload:', pluginTag(pluginName), error)
        })
      }
    } catch (error) {
      logWarn('Error during plugin disable in unload:', pluginTag(pluginName), error)
    }

    try {
      plugin.logger.getManager().destroy()
    } catch (error) {
      logWarn('Error destroying plugin logger:', pluginTag(pluginName), error)
    }

    clearPluginDeclaredPermissions(plugin.name)
    clearIssueSnapshot(plugin.name)
    clearPluginLocalizationEntries(plugin.name)
    plugins.delete(pluginName)
    enabledPlugins.delete(pluginName)

    logWarn('Plugin unloaded', pluginTag(pluginName))

    transport.broadcast(PluginEvents.push.stateChanged, {
      type: 'removed',
      name: pluginName
    })

    return Promise.resolve(true)
  }

  const installFromSource = async (
    request: PluginInstallRequest
  ): Promise<PluginInstallSummary> => {
    const summary = await installer.install(request)
    return summary
  }

  const resolvePluginFolderName = (identifier: string): string | undefined => {
    if (plugins.has(identifier)) return identifier
    return pluginNameIndex.get(identifier)
  }

  const uninstallPlugin = async (identifier: string): Promise<boolean> => {
    const folderName = resolvePluginFolderName(identifier)

    if (!folderName) {
      logWarn('Cannot uninstall plugin, not found:', pluginTag(identifier))
      return false
    }

    const pluginInstance = plugins.get(folderName) as TouchPlugin | undefined
    const dataDir =
      pluginInstance instanceof TouchPlugin ? path.dirname(pluginInstance.getConfigPath()) : null
    const manifestName = pluginInstance?.name ?? identifier
    const pluginDir = path.resolve(pluginPath, folderName)

    // Report uninstall to store (fire and forget, use folder name as slug)
    reportPluginUninstall(folderName).catch(() => {})

    await unloadPlugin(folderName)

    if (await fse.pathExists(pluginDir)) {
      await fse.remove(pluginDir).catch((error) => {
        logWarn('Failed to remove plugin directory', pluginTag(folderName), error)
      })
    }

    if (dataDir && (await fse.pathExists(dataDir))) {
      await fse.remove(dataDir).catch((error) => {
        logWarn('Failed to remove plugin data directory', pluginTag(folderName), error)
      })
    }

    await dbUtils.deletePluginData(manifestName).catch((error) => {
      logWarn('Failed to delete plugin data records', pluginTag(folderName), error)
    })

    await persistEnabledPlugins()

    logModuleInfo('Plugin uninstalled successfully', pluginTag(folderName))
    return true
  }

  /**
   * Register an internal plugin instance that is created in code (no manifest / scanning).
   * It is added to the plugins map but is treated as hidden in user-facing lists.
   */
  const registerInternalPlugin = (pluginInstance: ITouchPlugin): void => {
    const pluginName = pluginInstance.name
    if (!pluginName) {
      logWarn('Cannot register internal plugin without name')
      return
    }

    if (plugins.has(pluginName)) {
      logWarn('Internal plugin already registered, skipping:', pluginTag(pluginName))
      return
    }

    pluginInstance.meta = { ...(pluginInstance.meta ?? {}), internal: true }

    plugins.set(pluginName, pluginInstance)
    syncPluginDeclaredPermissions(pluginInstance)
    INTERNAL_PLUGIN_NAMES.add(pluginName)

    logDebug('Internal plugin registered', pluginTag(pluginName))
  }

  const managerInstance: IPluginManager = {
    plugins,
    active,
    reloadingPlugins,
    enabledPlugins,
    dbUtils,
    initialLoadPromises,
    pluginPath,
    watcher: null,
    devWatcher: null!,
    healthMonitor: null,
    getPluginList,
    setActivePlugin,
    hasPlugin,
    getPluginByName,
    enablePlugin,
    disablePlugin,
    reloadPlugin,
    persistEnabledPlugins,
    listPlugins,
    loadPlugin,
    unloadPlugin,
    installFromSource,
    uninstallPlugin,
    registerInternalPlugin
  }

  ;(managerInstance as IPluginManagerWithInternals).__installQueue = installQueue
  ;(managerInstance as IPluginManagerWithInternals).pendingPermissionPlugins =
    pendingPermissionPlugins
  ;(managerInstance as IPluginManagerWithInternals).emitIssueDelta = emitIssueDelta
  ;(managerInstance as IPluginManagerWithInternals).emitIssueReset = emitIssueReset

  const devWatcherInstance: DevPluginWatcher = new DevPluginWatcher(managerInstance)
  managerInstance.devWatcher = devWatcherInstance

  const __initDevWatcher = (): void => {
    devWatcherInstance.start()
  }

  const loadPersistedState = async (): Promise<void> => {
    logModuleInfo('Attempting to load persisted plugin states...')
    try {
      const data = await dbUtils.getPluginData('internal:plugin-module', 'enabled_plugins')
      if (data && data.value) {
        const enabled = JSON.parse(data.value) as string[]
        enabledPlugins.clear()
        enabled.forEach((p) => enabledPlugins.add(p))
        logModuleInfo(
          `Loaded ${enabled.length} enabled plugin(s) from database:`,
          enabled.map(pluginTag).join(' ')
        )

        for (const pluginName of enabledPlugins) {
          const plugin = plugins.get(pluginName)
          logDebug(
            'Checking auto-enable for',
            pluginTag(pluginName),
            '| found:',
            !!plugin,
            '| status:',
            plugin ? PluginStatus[plugin.status] : 'N/A'
          )
          if (plugin && plugin.status === PluginStatus.DISABLED) {
            try {
              logDebug('Auto-enabling plugin', pluginTag(pluginName))

              // Go through manager-level enable flow to enforce permission gating.
              await enablePlugin(pluginName)

              logDebug('Auto-enable complete', pluginTag(pluginName))
            } catch (e) {
              logError('Failed to auto-enable plugin', pluginTag(pluginName), e)
            }
          }
        }
      } else {
        logDebug('No persisted plugin state found in database.')
      }
    } catch (error) {
      logError('Failed to load persisted plugin state:', error)
    }
  }

  let readyFired = false

  const __init__ = (): void => {
    void (async () => {
      const exists = await fse.pathExists(pluginPath)
      if (!exists) {
        logWarn('Plugin directory does not exist, skip initialization.', pluginPath)
        return
      }

      logModuleInfo('Initializing plugin module with root:', pluginPath)

      __initDevWatcher()

      if (!issueFullResyncTimer) {
        issueFullResyncTimer = setInterval(() => {
          if (loadingPlugins.size > 0 || reloadingPlugins.size > 0) return

          for (const plugin of plugins.values()) {
            if (plugin.meta?.internal) continue
            emitIssueReset(plugin)
          }
        }, ISSUE_FULL_RESYNC_INTERVAL_MS)
        issueFullResyncTimer.unref?.()
      }

      touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
        void localProvider.stopWatching()
        devWatcherInstance.stop()
        if (issueFullResyncTimer) {
          clearInterval(issueFullResyncTimer)
          issueFullResyncTimer = null
        }
        logModuleInfo('Watchers closed.')
      })

      const initialPlugins = await localProvider.scan()
      if (initialPlugins.length === 0) {
        logWarn('No plugins found in directory yet.')
      } else {
        logModuleInfo(
          `Discovered ${initialPlugins.length} plugin(s) on startup:`,
          initialPlugins.map(pluginTag).join(' ')
        )
        for (const pluginName of initialPlugins) {
          initialLoadPromises.push(loadPlugin(pluginName))
        }
      }

      localProvider.startWatching({
        onFileChange: async (_path) => {
          const baseName = path.basename(_path)
          if (baseName.indexOf('.') === 0) return

          const pluginName = path.basename(path.dirname(_path))

          if (loadingPlugins.has(pluginName)) {
            logDebug(
              'File change received while plugin is still loading, ignoring.',
              pluginTag(pluginName),
              'file:',
              baseName
            )
            return
          }

          if (reloadingPlugins.has(pluginName)) {
            logDebug(
              'File change received while plugin is reloading, ignoring.',
              pluginTag(pluginName),
              'file:',
              baseName
            )
            return
          }

          if (!hasPlugin(pluginName)) {
            logDebug('File changed for unknown plugin, triggering load.', pluginTag(pluginName))
            await loadPlugin(pluginName)
            return
          }
          let plugin = plugins.get(pluginName) as TouchPlugin

          if (plugin.status === PluginStatus.LOAD_FAILED) {
            logWarn(
              'File change detected but plugin previously failed to load; skipping auto reload.',
              pluginTag(pluginName)
            )
            return
          }

          if (plugin.dev.enable) {
            logDebug(
              'Ignore disk change because plugin is running in dev mode.',
              pluginTag(pluginName)
            )
            return
          }

          logDebug(
            'Detected file change, reloading plugin',
            pluginTag(pluginName),
            'file:',
            baseName
          )

          if (
            baseName === 'manifest.json' ||
            baseName === 'preload.js' ||
            baseName === 'index.html' ||
            baseName === 'index.js'
          ) {
            const _enabled =
              plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE

            await plugin.disable()
            await unloadPlugin(pluginName)

            await loadPlugin(pluginName)

            plugin = plugins.get(pluginName) as TouchPlugin

            transport.broadcast(PluginEvents.push.reload, {
              source: 'disk',
              plugin: (plugin as TouchPlugin).toJSONObject()
            })

            logDebug('plugin reload event sent', pluginTag(pluginName), 'wasEnabled:', _enabled)

            if (_enabled) {
              await plugin.enable()
            }
          } else if (baseName === 'README.md') {
            plugin.readme = fse.readFileSync(_path, 'utf-8')

            transport.broadcast(PluginEvents.push.reloadReadme, {
              source: 'disk',
              plugin: pluginName,
              readme: plugin.readme
            })
            transport.broadcast(PluginEvents.push.stateChanged, {
              type: 'readme-updated',
              name: pluginName,
              readme: plugin.readme
            })
          } else {
            logWarn(
              'File change detected but ignored (not a tracked file):',
              pluginTag(pluginName),
              baseName
            )
          }
        },
        onDirectoryAdd: async (_path) => {
          if (!fse.existsSync(`${_path}/manifest.json`)) return
          const pluginName = path.basename(_path)

          if (pluginName.includes('.') || pluginName.includes('\\') || pluginName.includes('/')) {
            logWarn('Detected new directory with invalid plugin name, ignoring.', pluginName)
            return
          }

          logModuleInfo('Plugin directory added', pluginTag(pluginName))

          if (hasPlugin(pluginName)) {
            logDebug('Reload existing plugin after directory add', pluginTag(pluginName))
            transport.broadcast(PluginEvents.push.reload, {
              source: 'disk',
              plugin: pluginName
            })
            return
          }

          initialLoadPromises.push(loadPlugin(pluginName))
        },
        onDirectoryRemove: async (_path) => {
          const pluginName = path.basename(_path)
          logWarn('Plugin directory removed', pluginTag(pluginName))

          if (!hasPlugin(pluginName)) return
          await unloadPlugin(pluginName)
        },
        onReady: async () => {
          if (readyFired) {
            logDebug('File watcher ready event already processed, skipping duplicate')
            return
          }
          readyFired = true
          logModuleInfo('File watcher ready for changes.', pluginPath)
          logDebug(`Waiting for ${initialLoadPromises.length} initial plugin load operation(s)...`)
          await Promise.allSettled(initialLoadPromises)
          logModuleInfo('All initial plugins loaded.')
          await loadPersistedState()
        },
        onError: (error) => {
          logError('Watcher error occurred:', error)
        }
      })
    })().catch((err) => {
      pluginLog.error('Failed to initialize plugin module watchers', { error: err })
    })
  }

  __init__()

  return managerInstance
}

export class PluginModule extends BaseModule {
  pluginManager?: IPluginManager
  installQueue?: PluginInstallQueue
  healthMonitor?: DevServerHealthMonitor
  private permissionGrantedDisposer: (() => void) | null = null
  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private networkStatusCleanup: (() => void) | null = null
  private pluginSqliteClients = new Map<string, Client>()
  private secureStoreRootPath = ''

  static key: symbol = Symbol.for('PluginModule')
  name: ModuleKey = PluginModule.key

  constructor() {
    super(PluginModule.key, {
      create: true,
      dirName: 'plugins'
    })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const { file } = ctx
    registerMainRuntime('plugin-module', resolveMainRuntime(ctx, 'PluginModule.onInit'))
    const ioRuntime = resolvePluginModuleIoRuntime(ctx)
    this.transport = ioRuntime.transport
    this.secureStoreRootPath = ctx.app.rootPath
    TouchPlugin.setTransport(ioRuntime.transport)

    const pluginRuntime = buildPluginManagerRuntime({
      pluginRootDir: file.dirPath!,
      transport: ioRuntime.transport,
      channel: ioRuntime.channel,
      mainWindowId: ioRuntime.mainWindowId,
      createManager: createPluginModuleInternal,
      createHealthMonitor: (manager) => new DevServerHealthMonitor(manager)
    })

    this.pluginManager = pluginRuntime.pluginManager
    this.installQueue = pluginRuntime.installQueue
    this.healthMonitor = pluginRuntime.healthMonitor

    if (!this.networkStatusCleanup) {
      this.networkStatusCleanup = getNetworkService().onStatusChange((status) => {
        if (!status.online) {
          return
        }
        void this.refreshRemoteWidgetsAfterNetworkRecovery()
      })
    }

    if (!this.permissionGrantedDisposer) {
      const onPermissionGranted = (event: unknown): void => {
        if (!isRecord(event) || typeof event.pluginId !== 'string' || event.pluginId.length === 0) {
          return
        }

        const pluginId = event.pluginId
        const manager = this.pluginManager
        if (!manager) return

        const plugin = manager.getPluginByName(pluginId)
        if (plugin && plugin instanceof TouchPlugin && syncPermissionMissingIssue(plugin)) {
          const internals = manager as IPluginManagerWithInternals
          internals.emitIssueDelta?.(plugin)
        }

        const pendingPlugins = (manager as IPluginManagerWithInternals).pendingPermissionPlugins
        const pending = pendingPlugins?.get(pluginId)
        if (!pending?.autoRetry) return

        pluginLog.info(`Permission granted for ${pluginId}, retrying enable...`)
        pendingPlugins?.delete(pluginId)

        void (async () => {
          try {
            const success = await manager.enablePlugin(pluginId)
            if (success) {
              pluginLog.info(`Successfully enabled ${pluginId} after permission grant`)
            } else {
              pluginLog.warn(`Failed to enable ${pluginId} after permission grant`)
            }
          } catch (error) {
            pluginLog.error(`Error enabling ${pluginId} after permission grant`, { error })
          }
        })()
      }

      touchEventBus.on(TalexEvents.PERMISSION_GRANTED, onPermissionGranted)
      this.permissionGrantedDisposer = () => {
        touchEventBus.off(TalexEvents.PERMISSION_GRANTED, onPermissionGranted)
      }
    }
  }

  onDestroy(): MaybePromise<void> {
    this.permissionGrantedDisposer?.()
    this.permissionGrantedDisposer = null
    this.networkStatusCleanup?.()
    this.networkStatusCleanup = null
    for (const disposer of this.transportDisposers) {
      try {
        disposer()
      } catch {
        // ignore
      }
    }
    this.transportDisposers = []
    for (const client of this.pluginSqliteClients.values()) {
      try {
        client.close()
      } catch {
        // ignore sqlite close errors during shutdown
      }
    }
    this.pluginSqliteClients.clear()
    this.pluginManager?.plugins.forEach((plugin) => plugin.disable())
    this.healthMonitor?.destroy()
    stopUpdateScheduler()
  }

  private async refreshRemoteWidgetsAfterNetworkRecovery(): Promise<void> {
    const manager = this.pluginManager
    if (!manager) {
      return
    }

    const runnableStatuses = new Set<PluginStatus>([
      PluginStatus.ENABLED,
      PluginStatus.ACTIVE,
      PluginStatus.LOADED
    ])

    for (const plugin of manager.plugins.values()) {
      if (!plugin.dev?.enable || !plugin.dev?.source || !runnableStatuses.has(plugin.status)) {
        continue
      }

      for (const feature of plugin.features) {
        if (!isWidgetFeatureEnabled(plugin, feature)) {
          continue
        }
        if (feature.interaction?.type !== 'widget' || !feature.interaction.path) {
          continue
        }
        try {
          await widgetManager.refreshRemoteWidget(plugin, feature)
        } catch (error) {
          plugin.logger.warn(
            `[Widget] Remote widget refresh failed after network recovery: ${feature.id}`,
            error as Error
          )
        }
      }
    }
  }

  /**
   * Get all plugins with their install source metadata
   */
  private async getPluginsWithSource(): Promise<PluginWithSource[]> {
    const manager = this.pluginManager
    if (!manager) return []

    const result: PluginWithSource[] = []

    for (const [name, plugin] of manager.plugins) {
      if (plugin.meta?.internal) continue

      try {
        const sourceData = await manager.dbUtils.getPluginData(name, 'install_source')
        result.push({
          name,
          version: plugin.version,
          installSource: sourceData?.value ? JSON.parse(sourceData.value) : null
        })
      } catch {
        result.push({ name, version: plugin.version, installSource: null })
      }
    }

    return result
  }

  start(): MaybePromise<void> {
    const manager = this.pluginManager!
    const transport = this.transport
    if (!transport) {
      throw new Error('[PluginModule] Transport is not initialized')
    }

    // Initialize update scheduler
    startUpdateScheduler({
      checkIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
      getPluginsWithSource: () => this.getPluginsWithSource(),
      onUpdatesFound: (updates) => {
        transport.broadcast(StoreEvents.push.updatesAvailable, { updates })
      }
    })
    const installQueue = this.installQueue

    this.transportDisposers.push(
      ...registerPluginLocalizationChannels(transport, {
        resolvePlugin: (pluginId) => manager.getPluginByName(pluginId) as TouchPlugin | undefined
      })
    )

    this.transportDisposers.push(
      transport.on(StoreEvents.api.httpRequest, async (request) =>
        performStoreHttpRequest(request)
      ),
      transport.on(StoreEvents.api.checkUpdates, async () => {
        const updates = await triggerUpdateCheck()
        return { updates, checkedAt: new Date().toISOString() }
      }),
      transport.on(
        PluginEvents.install.source,
        async (data): Promise<PluginInstallSourceResponse> => {
          if (!installQueue) {
            return { status: 'error', error: 'Install queue is not ready' }
          }
          if (!isRecord(data) || typeof data.source !== 'string') {
            return { status: 'error', error: 'Invalid install request' }
          }
          const request: PluginInstallRequest = {
            source: data.source,
            hintType: data.hintType as PluginInstallRequest['hintType'],
            metadata: isRecord(data.metadata) ? data.metadata : undefined,
            clientMetadata: isRecord(data.clientMetadata) ? data.clientMetadata : undefined
          }
          return await installQueue.enqueue(request)
        }
      ),
      transport.on(PluginEvents.install.confirmResponse, async (response) => {
        if (!installQueue) {
          return
        }
        installQueue.handleConfirmResponse(response as PluginInstallConfirmResponse)
      }),
      transport.on(CoreBoxEvents.item.clear, async (_payload, context) => {
        const pluginName = context.plugin?.name
        if (!pluginName) {
          return
        }
        const pluginIns = manager.plugins.get(pluginName)
        if (pluginIns instanceof TouchPlugin) {
          pluginIns.clearCoreBoxItems()
        }
      })
    )
    this.transportDisposers.push(
      ...registerPluginWindowTransportHandlers({
        manager,
        transport,
        ipcLog: pluginIpcLog,
        logHandlerError: logIpcHandlerError,
        toErrorMessage
      }),
      ...registerPluginStorageTransportHandlers({
        manager,
        transport,
        secureStoreRootPath: this.secureStoreRootPath,
        pluginSqliteClients: this.pluginSqliteClients,
        isRecord,
        ipcLog: pluginIpcLog,
        logHandlerError: logIpcHandlerError,
        toErrorMessage
      }),
      ...registerPluginApiTransportHandlers({
        manager,
        transport,
        installQueue,
        healthMonitor: this.healthMonitor,
        getPluginRuntimeLogsPath,
        buildPluginFileTree,
        isRecord,
        logHandlerError: logIpcHandlerError,
        toErrorMessage
      }),
      ...registerPluginStoreTransportHandlers({
        transport,
        isRecord,
        logHandlerError: logIpcHandlerError
      })
    )
  }
}

const pluginModule = new PluginModule()

export { pluginModule }
