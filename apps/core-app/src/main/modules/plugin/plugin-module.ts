import type { MaybePromise, ModuleInitContext, ModuleKey, TalexTouch } from '@talex-touch/utils'
import type { Client, InValue } from '@libsql/client'
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
  PluginInstallSourceResponse,
  PluginPerformanceGetPathsResponse
} from '@talex-touch/utils/transport/events/types'
import type { FSWatcher } from 'chokidar'
import type { PluginWithSource } from '../../service/store-api.service'
import { createHash } from 'node:crypto'
import path from 'node:path'
import * as util from 'node:util'
import { createClient } from '@libsql/client'
import { sleep } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { generatePermissionIssue, parseManifestPermissions } from '@talex-touch/utils/permission'
import { PluginStatus, SdkApi } from '@talex-touch/utils/plugin'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import {
  CoreBoxEvents,
  StoreEvents,
  PermissionEvents,
  PluginEvents
} from '@talex-touch/utils/transport/events'
import { app, shell } from 'electron'
import fse from 'fs-extra'
import {
  PluginInstallCompletedEvent,
  TalexEvents,
  touchEventBus
} from '../../core/eventbus/touch-event'
import { registerMainRuntime, resolveMainRuntime } from '../../core/runtime-accessor'
import { TouchWindow } from '../../core/touch-window'
import { createDbUtils } from '../../db/utils'
import { useAliveTarget, useAliveWebContents } from '../../hooks/use-electron-guard'
import { fileWatchService } from '../../service/file-watch.service'
import {
  reportPluginUninstall,
  startUpdateScheduler,
  stopUpdateScheduler,
  triggerUpdateCheck
} from '../../service/store-api.service'
import { performStoreHttpRequest } from '../../service/store-http.service'
import { getOfficialPlugins } from '../../service/official-plugin.service'
import { debounce } from '../../utils/common-util'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { viewCacheManager } from '../box-tool/core-box/view-cache'
import { databaseModule } from '../database'
import { getPermissionModule } from '../permission'
import { DevServerHealthMonitor } from './dev-server-monitor'
import { PluginInstallQueue } from './install-queue'
import { TouchPlugin } from './plugin'
import { PluginInstaller } from './plugin-installer'
import { isWidgetFeatureEnabled } from './widget/widget-issue'
import { widgetManager } from './widget/widget-manager'

import { createPluginLoadShell, createPluginLoader } from './plugin-loaders'
import { mergePackagedManifestMetadata } from './plugin-runtime-integrity'
import { LocalPluginProvider } from './providers/local-provider'
import { usePluginInjections } from './runtime/plugin-injections'
import { pluginRuntimeTracker } from './runtime/plugin-runtime-tracker'
import { resolvePluginModuleIoRuntime } from './services/plugin-io-service'
import { buildPluginManagerRuntime } from './services/plugin-manager-orchestrator'

const pluginLog = getLogger('plugin-system')
const pluginModuleLog = createLogger('PluginSystem')
const pluginIpcLog = pluginModuleLog.child('IPC')
const devWatcherLog = pluginLog.child('DevWatcher')
const WIDGET_ROOT_DIR = 'widgets'
const WIDGET_ALLOWED_EXTENSIONS = new Set(['.vue', '.tsx', '.jsx', '.ts', '.js'])
const PERMISSION_MISSING_ISSUE_CODE = 'PERMISSION_MISSING'
const ISSUE_FULL_RESYNC_INTERVAL_MS = 45 * 60 * 1000
type PluginLifecycleChannel = {
  broadcastPlugin: (pluginName: string, eventName: string, arg?: unknown) => void
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error'

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
        plugin.issues.push({
          type: 'warning',
          message: `Widget compile skipped for feature "${feature.id}" (${feature.interaction?.path ?? 'unknown'})`,
          source: `feature:${feature.id}`,
          code: 'WIDGET_COMPILE_SKIPPED',
          suggestion: 'Check widget interaction.path and widget source file.',
          timestamp: Date.now()
        })
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

type WindowNewPayload = TalexTouch.TouchWindowConstructorOptions & {
  file?: string
  url?: string
}

interface WindowVisiblePayload {
  id: number
  visible?: boolean
}

interface WindowPropertyPayload {
  id: number
  property: {
    window?: Record<string, unknown>
    webContents?: Record<string, unknown>
  }
}

interface IndexCommunicatePayload {
  key?: string
  info?: unknown
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

function syncPermissionMissingIssue(plugin: ITouchPlugin): boolean {
  if (!plugin.declaredPermissions) return false

  const permissionModule = getPermissionModule()
  if (!permissionModule) return false

  const declared = {
    required: [...(plugin.declaredPermissions.required || [])],
    optional: [...(plugin.declaredPermissions.optional || [])]
  }
  const status = permissionModule
    .getStore()
    .getPluginPermissionStatus(plugin.name, plugin.sdkapi, declared)
  const computedIssue = generatePermissionIssue(status)
  const nextPermissionIssue =
    computedIssue?.code === PERMISSION_MISSING_ISSUE_CODE
      ? {
          type: computedIssue.type,
          message: computedIssue.message,
          source: 'manifest.json',
          code: computedIssue.code,
          suggestion: computedIssue.suggestion,
          meta: {
            required: declared.required,
            optional: declared.optional,
            enforcePermissions: status.enforcePermissions
          },
          timestamp: Date.now()
        }
      : null

  const previousIssue = plugin.issues.find((issue) => issue.code === PERMISSION_MISSING_ISSUE_CODE)
  const shouldUpdateIssue =
    Boolean(previousIssue) !== Boolean(nextPermissionIssue) ||
    (previousIssue?.message ?? '') !== (nextPermissionIssue?.message ?? '') ||
    (previousIssue?.suggestion ?? '') !== (nextPermissionIssue?.suggestion ?? '')

  if (!shouldUpdateIssue) return false

  const retainedIssues = plugin.issues.filter(
    (issue) => issue.code !== PERMISSION_MISSING_ISSUE_CODE
  )
  plugin.issues = nextPermissionIssue ? [...retainedIssues, nextPermissionIssue] : retainedIssues
  return true
}

/**
 * Watches development plugins for file changes and triggers hot reload
 */
class DevPluginWatcher {
  private readonly manager: IPluginManager
  private readonly devPlugins: Map<string, ITouchPlugin> = new Map()
  private readonly watchedPathsByPlugin = new Map<string, Set<string>>()
  private readonly watchedFileNames = [
    'manifest.json',
    'index.js',
    'preload.js',
    'index.html',
    'README.md'
  ]
  private watcherDisabled = false
  private watcherDisabledReason: string | null = null
  private watcherFatalLogged = false
  private watcher: FSWatcher | null = null

  constructor(manager: IPluginManager) {
    this.manager = manager
  }

  private normalizeFilePath(filePath: string): string {
    return path.resolve(filePath)
  }

  private buildWatchTargets(plugin: ITouchPlugin): Set<string> {
    const targets = new Set<string>()
    for (const fileName of this.watchedFileNames) {
      targets.add(this.normalizeFilePath(path.join(plugin.pluginPath, fileName)))
    }
    return targets
  }

  private watchPluginTargets(plugin: ITouchPlugin): void {
    if (!this.watcher) return
    const targets = this.buildWatchTargets(plugin)
    this.watchedPathsByPlugin.set(plugin.name, targets)
    this.watcher.add(Array.from(targets))
    devWatcherLog.debug('Watching controlled dev plugin files', {
      meta: {
        plugin: plugin.name,
        files: Array.from(targets)
      }
    })
  }

  private unwatchPluginTargets(pluginName: string): void {
    const targets = this.watchedPathsByPlugin.get(pluginName)
    if (!targets) return
    if (this.watcher) {
      this.watcher.unwatch(Array.from(targets))
    }
    this.watchedPathsByPlugin.delete(pluginName)
  }

  private resolvePluginNameByWatchedPath(filePath: string): string | undefined {
    for (const [pluginName, targets] of this.watchedPathsByPlugin.entries()) {
      if (targets.has(filePath)) return pluginName
    }
    return undefined
  }

  private maybeDisableWatcherForFatalError(error: unknown): boolean {
    const code =
      typeof (error as NodeJS.ErrnoException | undefined)?.code === 'string'
        ? (error as NodeJS.ErrnoException).code
        : ''
    if (code !== 'EMFILE' && code !== 'ENOSPC' && code !== 'ENAMETOOLONG') {
      return false
    }

    if (!this.watcherFatalLogged) {
      devWatcherLog.error(
        'Dev plugin watcher fatal error, disabling watcher to prevent crash storm',
        {
          error: error as Error,
          meta: { code }
        }
      )
      this.watcherFatalLogged = true
    }

    this.watcherDisabled = true
    this.watcherDisabledReason = code
    this.stop()
    return true
  }

  /**
   * Add a plugin to be watched for changes
   * @param plugin - Plugin to watch
   */
  addPlugin(plugin: ITouchPlugin): void {
    if (plugin.dev.enable && !plugin.dev.source) {
      this.devPlugins.set(plugin.name, plugin)
      if (this.watcherDisabled) {
        devWatcherLog.warn('Dev watcher disabled; plugin hot reload watch skipped', {
          meta: {
            plugin: plugin.name,
            reason: this.watcherDisabledReason || 'unknown'
          }
        })
        return
      }
      if (this.watcher) {
        this.watchPluginTargets(plugin)
      }
    }
  }

  /**
   * Remove a plugin from being watched
   * @param pluginName - Name of the plugin to stop watching
   */
  removePlugin(pluginName: string): void {
    const plugin = this.devPlugins.get(pluginName)
    if (plugin && !plugin.dev.source) {
      if (this.watcher) {
        this.unwatchPluginTargets(pluginName)
      }
      this.devPlugins.delete(pluginName)
      devWatcherLog.debug('Stopped watching dev plugin source', {
        meta: { path: plugin.pluginPath, plugin: plugin.name }
      })
    }
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.watcher) {
      devWatcherLog.warn('Watcher already started')
      return
    }
    if (this.watcherDisabled) {
      devWatcherLog.warn('Watcher disabled due to previous fatal error, skipping startup', {
        meta: { reason: this.watcherDisabledReason || 'unknown' }
      })
      return
    }

    this.watcher = fileWatchService.watch([], {
      ignored: (filePath: string) => {
        const normalizedPath = filePath.replace(/\\/g, '/')
        if (/[/\\]node_modules(?:[/\\]|$)/.test(filePath)) return true
        if (/[/\\]\.git(?:[/\\]|$)/.test(filePath)) return true
        if (/[/\\]\.vite(?:[/\\]|$)/.test(filePath)) return true
        if (/[/\\]dist(?:[/\\]|$)/.test(filePath)) return true
        if (/[/\\]logs(?:[/\\]|$)/.test(filePath)) return true
        return /(^|[/\\])\./.test(normalizedPath)
      },
      followSymlinks: false,
      depth: 1,
      ignorePermissionErrors: true,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    })

    this.watcher.on(
      'change',
      debounce(async (filePath) => {
        try {
          if (typeof filePath !== 'string') {
            return
          }
          const normalizedPath = this.normalizeFilePath(filePath)
          const pluginName = this.resolvePluginNameByWatchedPath(normalizedPath)
          if (!pluginName) return
          const fileName = path.basename(normalizedPath)
          devWatcherLog.debug('Dev plugin source changed, reloading', {
            meta: { plugin: pluginName, file: normalizedPath, fileName }
          })

          if (fileName === 'manifest.json') {
            devWatcherLog.debug('Manifest.json changed, reloading plugin with new configuration', {
              meta: { plugin: pluginName }
            })
          }

          await this.manager.reloadPlugin(pluginName)
        } catch (error) {
          devWatcherLog.error('Failed to process dev plugin file change', {
            error: error as Error,
            meta: { filePath }
          })
        }
      }, 300)
    )
    this.watcher.on('error', (error) => {
      if (this.maybeDisableWatcherForFatalError(error)) {
        return
      }
      devWatcherLog.error('Dev plugin watcher error', { error: error as Error })
    })

    for (const plugin of this.devPlugins.values()) {
      if (!plugin.dev.enable || plugin.dev.source) continue
      this.watchPluginTargets(plugin)
    }

    devWatcherLog.debug('Started watching for dev plugin changes', {
      meta: { plugins: this.devPlugins.size }
    })
  }

  /**
   * Stop watching for file changes
   */
  stop(): void {
    if (!this.watcher) return
    this.watchedPathsByPlugin.clear()
    void fileWatchService.close(this.watcher)
    this.watcher = null
    devWatcherLog.debug('Stopped watching for dev plugin changes')
  }
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
  channel: PluginLifecycleChannel,
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
          reasons: declared.reasons
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

        channel.broadcastPlugin(
          active,
          PluginEvents.lifecycleSignal.inactive.toEventName(),
          undefined
        )

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

      channel.broadcastPlugin(
        pluginName,
        PluginEvents.lifecycleSignal.active.toEventName(),
        undefined
      )
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

    // Check permissions on first enable (if plugin declares permissions)
    if (!skipPermissionCheck && plugin.declaredPermissions) {
      const permModule = getPermissionModule()
      if (permModule) {
        const declared = {
          required: plugin.declaredPermissions.required || [],
          optional: plugin.declaredPermissions.optional || []
        }

        // Check if permission confirmation is needed
        if (permModule.needsPermissionConfirmation(pluginName, plugin.sdkapi, declared)) {
          const missing = permModule.getMissingPermissions(pluginName, plugin.sdkapi, declared)

          // Send permission request to renderer
          pluginLog.info(
            `Plugin ${pluginName} needs permission confirmation: ${missing.required.length} required, ${missing.optional.length} optional`
          )

          void transport
            .sendToWindow(mainWindowId, PermissionEvents.push.startupRequest, {
              pluginId: pluginName,
              pluginName: plugin.name,
              sdkapi: plugin.sdkapi,
              required: missing.required,
              optional: missing.optional,
              reasons: plugin.declaredPermissions.reasons || {}
            })
            .catch(() => {
              pluginLog.warn(`Main window not available for permission request: ${pluginName}`)
            })

          // Store for retry after permission grant
          pendingPermissionPlugins.set(pluginName, {
            pluginName: plugin.name,
            autoRetry: !skipPermissionCheck
          })

          // Block enabling until required permissions are granted
          pluginLog.info(
            `Plugin enable blocked: missing required permissions [${missing.required.join(', ')}]`,
            {
              meta: { plugin: pluginName }
            }
          )
          return false
        }
      }
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
      const manifestPath = path.resolve(currentPluginPath, 'manifest.json')
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

      if (!fse.existsSync(currentPluginPath) || !fse.existsSync(manifestPath)) {
        loadingShell.issues.push({
          type: 'error',
          message: 'Plugin directory or manifest.json is missing.',
          source: 'filesystem',
          code: 'MISSING_MANIFEST',
          suggestion: 'Ensure the plugin folder and its manifest.json exist.',
          timestamp: Date.now()
        })
        loadingShell.setLoadState('load_failed', {
          code: 'MISSING_MANIFEST',
          message: 'Plugin directory or manifest.json is missing.'
        })
        loadingShell.status = PluginStatus.LOAD_FAILED
        loadingShell.logger.error('[Lifecycle] load failed: manifest.json missing')
        syncPluginDeclaredPermissions(loadingShell)
        rememberIssueSnapshot(loadingShell)
        transport.broadcast(PluginEvents.push.stateChanged, {
          type: 'updated',
          name: pluginName,
          changes: loadingShell.toJSONObject()
        })
        logWarn('Plugin failed to load: missing manifest.json', pluginTag(pluginName))
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

        // After all loading attempts, set final status
        if (touchPlugin.issues.some((issue) => issue.type === 'error')) {
          const firstError = touchPlugin.issues.find((issue) => issue.type === 'error')
          touchPlugin.setLoadState('load_failed', {
            code: firstError?.code || 'PLUGIN_LOAD_FAILED',
            message: firstError?.message || 'Plugin metadata validation failed.'
          })
          touchPlugin.status = PluginStatus.LOAD_FAILED
        } else {
          touchPlugin.setLoadState('ready')
          touchPlugin.status = PluginStatus.DISABLED
        }
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

        transport.broadcast(PluginEvents.push.stateChanged, {
          type: 'updated',
          name: pluginName,
          changes: touchPlugin.toJSONObject()
        })
      } catch (error: unknown) {
        logError('Unhandled error while loading plugin', pluginTag(pluginName), error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        const stack = error instanceof Error ? error.stack : undefined
        loadingShell.issues.push({
          type: 'error',
          message: `A fatal error occurred while creating the plugin loader: ${message}`,
          source: 'plugin-loader',
          code: 'LOADER_FATAL',
          meta: { error: stack },
          timestamp: Date.now()
        })
        loadingShell.setLoadState('load_failed', {
          code: 'LOADER_FATAL',
          message
        })
        loadingShell.status = PluginStatus.LOAD_FAILED
        loadingShell.logger.error('[Lifecycle] load failed', error as Error)
        syncPluginDeclaredPermissions(loadingShell)
        rememberIssueSnapshot(loadingShell)
        transport.broadcast(PluginEvents.push.stateChanged, {
          type: 'updated',
          name: pluginName,
          changes: loadingShell.toJSONObject()
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
  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private pluginSqliteClients = new Map<string, Client>()

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

    // Listen for permission granted events to retry enabling plugins
    touchEventBus.on(TalexEvents.PERMISSION_GRANTED, (event) => {
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

      // Check if this plugin is pending permission
      const pendingPlugins = (manager as IPluginManagerWithInternals).pendingPermissionPlugins
      const pending = pendingPlugins?.get(pluginId)

      if (!pending?.autoRetry) return

      pluginLog.info(`Permission granted for ${pluginId}, retrying enable...`)

      // Remove from pending
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
    })
  }

  onDestroy(): MaybePromise<void> {
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
      transport.on(
        defineRawEvent<WindowNewPayload, { id?: number; error?: string }>('window:new'),
        async (data, context) => {
          const pluginName = context.plugin?.name
          const touchPlugin = pluginName
            ? (manager.plugins.get(pluginName) as TouchPlugin)
            : undefined
          if (!touchPlugin) {
            return { error: 'Plugin not found!' }
          }

          const { file, url, ...windowOptions } = data
          const win = new TouchWindow(windowOptions)
          let webContents: Electron.WebContents
          if (typeof file === 'string' && file.length > 0) {
            webContents = await win.loadFile(file)
          } else if (typeof url === 'string' && url.length > 0) {
            webContents = await win.loadURL(url)
          } else {
            return { error: 'No file or url provided!' }
          }

          const obj = usePluginInjections(touchPlugin, 'plugin-module:window:new')
          if (!obj) {
            return { error: 'Failed to build plugin injections' }
          }
          await webContents.insertCSS(obj.styles)
          await webContents.executeJavaScript(obj.js)

          webContents.send('@loaded', {
            id: webContents.id,
            plugin: pluginName,
            type: 'intend'
          })

          touchPlugin._windows.set(webContents.id, win)
          win.window.on('closed', () => {
            win.window.removeAllListeners()
            touchPlugin._windows.delete(webContents.id)
          })

          return { id: webContents.id }
        }
      ),

      transport.on(
        defineRawEvent<WindowVisiblePayload, { visible?: boolean; error?: string }>(
          'window:visible'
        ),
        async (payload, context) => {
          const pluginName = context.plugin?.name
          const touchPlugin = pluginName
            ? (manager.plugins.get(pluginName) as TouchPlugin)
            : undefined
          if (!touchPlugin) {
            return { error: 'Plugin not found!' }
          }

          const id = payload?.id
          if (typeof id !== 'number') {
            return { error: 'Window id is required' }
          }

          const win = touchPlugin._windows.get(id)
          const browserWindow = useAliveTarget(win?.window)
          if (!win || !browserWindow) {
            return { error: 'Window not found' }
          }

          if (payload?.visible === undefined) {
            if (browserWindow.isVisible()) {
              browserWindow.hide()
            } else {
              browserWindow.show()
            }
          } else if (payload.visible) {
            browserWindow.show()
          } else {
            browserWindow.hide()
          }

          return { visible: browserWindow.isVisible() }
        }
      ),

      transport.on(
        defineRawEvent<WindowPropertyPayload, { success?: boolean; error?: string }>(
          'window:property'
        ),
        async (payload, context) => {
          const pluginName = context.plugin?.name
          const touchPlugin = pluginName
            ? (manager.plugins.get(pluginName) as TouchPlugin)
            : undefined
          if (!touchPlugin) {
            return { error: 'Plugin not found!' }
          }

          const id = payload?.id
          const property = payload?.property
          if (typeof id !== 'number') {
            return { error: 'Window id is required' }
          }
          if (!property) {
            return { error: 'Property is required' }
          }

          const win = touchPlugin._windows.get(id)
          const browserWindow = useAliveTarget(win?.window)
          if (!win || !browserWindow) {
            return { error: 'Window not found' }
          }

          const applyProps = (target: Record<string, unknown>, props?: Record<string, unknown>) => {
            if (!props) return { success: true }
            for (const [key, value] of Object.entries(props)) {
              if (value === undefined) continue
              try {
                const current = target[key]
                if (typeof current === 'function') {
                  if (Array.isArray(value)) {
                    current(...value)
                  } else {
                    current(value)
                  }
                } else {
                  target[key] = value
                }
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                return { success: false, error: `Failed to set ${key}: ${message}` }
              }
            }
            return { success: true }
          }

          const windowResult = applyProps(
            browserWindow as unknown as Record<string, unknown>,
            property.window
          )
          if (!windowResult.success) {
            return windowResult
          }

          const webContentsResult = applyProps(
            browserWindow.webContents as unknown as Record<string, unknown>,
            property.webContents
          )
          if (!webContentsResult.success) {
            return webContentsResult
          }

          return { success: true }
        }
      ),

      transport.on(
        defineRawEvent<IndexCommunicatePayload, { status?: string; error?: string }>(
          'index:communicate'
        ),
        async (data, context) => {
          try {
            const pluginName = context.plugin?.name
            const key = typeof data?.key === 'string' ? data.key : ''
            const info = data?.info

            if (!pluginName || !key) {
              return { error: 'Plugin name and key are required' }
            }

            const plugin = manager.getPluginByName(pluginName) as TouchPlugin
            if (!plugin) {
              return { error: `Plugin ${pluginName} not found` }
            }

            const lifecycle = plugin.getFeatureLifeCycle?.()
            if (!lifecycle || !lifecycle.onMessage) {
              return { error: `Plugin ${pluginName} does not have onMessage handler` }
            }

            lifecycle.onMessage(key, info)
            return { status: 'message_sent' }
          } catch (error) {
            logIpcHandlerError('index:communicate', error)
            return { error: toErrorMessage(error) }
          }
        }
      )
    )

    const resolveTouchPlugin = (
      payload: unknown,
      context: unknown
    ): { pluginName: string; plugin: TouchPlugin } | { error: string } => {
      const pluginNameFromContext =
        isRecord(context) && isRecord(context.plugin) && typeof context.plugin.name === 'string'
          ? context.plugin.name
          : undefined
      const pluginNameFromPayload =
        isRecord(payload) && typeof payload.pluginName === 'string' ? payload.pluginName : undefined
      const pluginName = pluginNameFromContext ?? pluginNameFromPayload
      if (!pluginName) {
        return { error: 'Plugin name is required' }
      }
      const plugin = manager.getPluginByName(pluginName) as TouchPlugin
      if (!plugin) {
        return { error: `Plugin ${pluginName} not found` }
      }
      return { pluginName, plugin }
    }

    const resolveWidgetTarget = (
      pluginPath: string,
      widgetPath: string
    ): { absolutePath: string; relativePath: string } | { error: string } => {
      const trimmed = widgetPath.trim()
      if (!trimmed) {
        return { error: 'Widget path is required' }
      }

      const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '')
      const withoutRoot = normalized.replace(/^widgets\//, '')
      if (!withoutRoot || withoutRoot.split('/').some((segment) => segment === '..')) {
        return { error: 'Widget path is invalid' }
      }

      const widgetsDir = path.resolve(pluginPath, WIDGET_ROOT_DIR)
      const candidate = path.resolve(widgetsDir, withoutRoot)
      const relative = path.relative(widgetsDir, candidate)
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return { error: 'Widget path is outside widgets directory' }
      }

      const finalPath = path.extname(candidate) ? candidate : `${candidate}.vue`
      const ext = path.extname(finalPath)
      if (!WIDGET_ALLOWED_EXTENSIONS.has(ext)) {
        return { error: `Unsupported widget file type: ${ext}` }
      }

      return {
        absolutePath: finalPath,
        relativePath: path.relative(widgetsDir, finalPath).split(path.sep).join('/')
      }
    }

    const PLUGIN_SYNC_QUALIFIED_PREFIX = 'plugin::'

    const parsePluginSyncQualifiedName = (
      qualifiedName: string
    ): { pluginName: string; fileName?: string } | null => {
      const trimmed = qualifiedName.trim()
      if (!trimmed.startsWith(PLUGIN_SYNC_QUALIFIED_PREFIX)) {
        return null
      }

      const body = trimmed.slice(PLUGIN_SYNC_QUALIFIED_PREFIX.length)
      const separatorIndex = body.indexOf('::')
      if (separatorIndex < 0) {
        return null
      }

      const pluginName = body.slice(0, separatorIndex).trim()
      const fileName = body.slice(separatorIndex + 2).trim()
      if (!pluginName) {
        return null
      }

      return {
        pluginName,
        fileName: fileName || undefined
      }
    }

    const normalizeSqlParams = (params: unknown): InValue[] => {
      if (!Array.isArray(params)) {
        return []
      }
      return params.map((value) => {
        if (value === undefined) {
          return null
        }
        if (value instanceof Date) {
          return value.toISOString()
        }
        if (typeof value === 'bigint') {
          return Number(value)
        }
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value)
        }
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === null ||
          value instanceof ArrayBuffer ||
          value instanceof Uint8Array
        ) {
          return value
        }
        return String(value)
      })
    }

    const normalizeSqlValue = (value: unknown): unknown => {
      if (typeof value === 'bigint') {
        return Number(value)
      }
      if (value instanceof Uint8Array) {
        return Array.from(value)
      }
      return value
    }

    const normalizeLastInsertRowId = (value: unknown): number | null => {
      if (typeof value === 'bigint') {
        return Number(value)
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value)
      }
      return null
    }

    const getPluginSqliteClient = (plugin: TouchPlugin): Client => {
      const existing = this.pluginSqliteClients.get(plugin.name)
      if (existing) {
        return existing
      }

      const sqlitePath = path.join(plugin.getDataPath(), 'plugin-sdk.sqlite')
      fse.ensureDirSync(path.dirname(sqlitePath))
      const client = createClient({ url: `file:${sqlitePath}` })
      this.pluginSqliteClients.set(plugin.name, client)
      return client
    }

    const resolveSqliteVersionError = (plugin: TouchPlugin): string | null => {
      const sdkapi = typeof plugin.sdkapi === 'number' ? plugin.sdkapi : 0
      if (sdkapi >= SdkApi.V260215) {
        return null
      }
      return `plugin sqlite sdk requires sdkapi >= ${SdkApi.V260215}`
    }

    const resolveSqlitePermissionError = (plugin: TouchPlugin): string | null => {
      const permissionModule = getPermissionModule()
      if (!permissionModule) {
        return null
      }

      const result = permissionModule.checkPermission(
        plugin.name,
        'storage:sqlite:query',
        plugin.sdkapi
      )
      if (result.allowed) {
        return null
      }

      return result.reason ?? `Permission '${result.permissionId}' not granted`
    }

    // Plugin Storage Channel Handlers
    this.transportDisposers.push(
      transport.on(PluginEvents.storage.getFile, async (payload, context) => {
        try {
          const fileName = payload?.fileName
          if (!fileName) {
            return { error: 'fileName is required' }
          }
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { error: resolved.error }
          }
          return resolved.plugin.getPluginFile(fileName)
        } catch (error) {
          logIpcHandlerError('plugin:storage:get-file', error)
          return { error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.setFile, async (payload, context) => {
        try {
          const fileName = payload?.fileName
          if (!fileName) {
            return { success: false, error: 'fileName is required' }
          }
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { success: false, error: resolved.error }
          }
          return resolved.plugin.savePluginFile(fileName, payload?.content)
        } catch (error) {
          logIpcHandlerError('plugin:storage:set-file', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.deleteFile, async (payload, context) => {
        try {
          const fileName = payload?.fileName
          if (!fileName) {
            return { success: false, error: 'fileName is required' }
          }
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { success: false, error: resolved.error }
          }
          return resolved.plugin.deletePluginFile(fileName)
        } catch (error) {
          logIpcHandlerError('plugin:storage:delete-file', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.listFiles, async (payload, context) => {
        try {
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return []
          }
          return resolved.plugin.listPluginFiles()
        } catch (error) {
          logIpcHandlerError('plugin:storage:list-files', error)
          return []
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.listSyncItems, async (payload) => {
        try {
          const requestedQualifiedNames = Array.isArray(payload?.qualifiedNames)
            ? payload.qualifiedNames
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
            : []

          const requestedPluginName =
            typeof payload?.pluginName === 'string' ? payload.pluginName.trim() : ''

          const requestedByPlugin = new Map<string, Set<string> | null>()
          for (const qualifiedName of requestedQualifiedNames) {
            const parsed = parsePluginSyncQualifiedName(qualifiedName)
            if (!parsed) {
              continue
            }
            if (!requestedByPlugin.has(parsed.pluginName)) {
              requestedByPlugin.set(parsed.pluginName, new Set())
            }
            const targetFiles = requestedByPlugin.get(parsed.pluginName)
            if (!targetFiles) {
              continue
            }
            if (parsed.fileName) {
              targetFiles.add(parsed.fileName)
            } else {
              requestedByPlugin.set(parsed.pluginName, null)
            }
          }

          if (requestedPluginName && !requestedByPlugin.has(requestedPluginName)) {
            requestedByPlugin.set(requestedPluginName, null)
          }

          const shouldReadAllPlugins = !requestedByPlugin.size
          const targetPluginNames = shouldReadAllPlugins
            ? Array.from(manager.plugins.keys())
            : Array.from(requestedByPlugin.keys())

          const items: Array<{
            pluginName: string
            fileName: string
            qualifiedName: string
            content: unknown
          }> = []

          for (const pluginName of targetPluginNames) {
            const plugin = manager.getPluginByName(pluginName) as TouchPlugin | undefined
            if (!plugin) {
              continue
            }
            const allowedFiles = requestedByPlugin.get(pluginName) ?? null
            const fileNames = plugin.listPluginFiles()
            for (const fileName of fileNames) {
              if (allowedFiles && !allowedFiles.has(fileName)) {
                continue
              }
              items.push({
                pluginName,
                fileName,
                qualifiedName: `${PLUGIN_SYNC_QUALIFIED_PREFIX}${pluginName}::${fileName}`,
                content: plugin.getPluginFile(fileName)
              })
            }
          }

          return items
        } catch (error) {
          logIpcHandlerError('plugin:storage:list-sync-items', error)
          return []
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.applySyncItem, async (payload, context) => {
        try {
          const fileName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : ''
          if (!fileName) {
            return { success: false, error: 'fileName is required' }
          }

          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { success: false, error: resolved.error }
          }

          return resolved.plugin.savePluginFile(fileName, payload?.content, { broadcast: false })
        } catch (error) {
          logIpcHandlerError('plugin:storage:apply-sync-item', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.deleteSyncItem, async (payload, context) => {
        try {
          const fileName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : ''
          if (!fileName) {
            return { success: false, error: 'fileName is required' }
          }

          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { success: false, error: resolved.error }
          }

          const result = resolved.plugin.deletePluginFile(fileName, { broadcast: false })
          if (!result.success && result.error === 'File not found') {
            return { success: true }
          }
          return result
        } catch (error) {
          logIpcHandlerError('plugin:storage:delete-sync-item', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.getStats, async (payload, context) => {
        try {
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { error: resolved.error }
          }
          return resolved.plugin.getStorageStats()
        } catch (error) {
          logIpcHandlerError('plugin:storage:get-stats', error)
          return { error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.performance.getMetrics, async (_payload, context) => {
        try {
          const resolved = resolveTouchPlugin({}, context)
          if ('error' in resolved) {
            return { error: resolved.error }
          }
          return resolved.plugin.getPerformanceMetrics()
        } catch (error) {
          logIpcHandlerError('plugin:performance:get-metrics', error)
          return { error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.performance.getPaths, async (_payload, context) => {
        try {
          const resolved = resolveTouchPlugin({}, context)
          if ('error' in resolved) {
            throw new Error(resolved.error)
          }

          return {
            pluginPath: resolved.plugin.pluginPath,
            dataPath: resolved.plugin.getDataPath(),
            configPath: resolved.plugin.getConfigPath(),
            logsPath: resolved.plugin.getLogsPath(),
            tempPath: resolved.plugin.getTempPath()
          } satisfies PluginPerformanceGetPathsResponse
        } catch (error) {
          logIpcHandlerError('plugin:performance:get-paths', error)
          throw error instanceof Error ? error : new Error('Unknown error')
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.getTree, async (payload, context) => {
        try {
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { error: resolved.error }
          }
          return resolved.plugin.getStorageTree()
        } catch (error) {
          logIpcHandlerError('plugin:storage:get-tree', error)
          return { error: toErrorMessage(error) }
        }
      })
    )

    // Plugin Storage: get-file-details (support both MAIN and PLUGIN channels)
    this.transportDisposers.push(
      transport.on(PluginEvents.storage.getFileDetails, async (payload, context) => {
        try {
          const fileName = payload?.fileName
          if (!fileName) {
            return { error: 'fileName is required' }
          }
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { error: resolved.error }
          }
          return resolved.plugin.getFileDetails(fileName)
        } catch (error) {
          logIpcHandlerError('plugin:storage:get-file-details', error)
          return { error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.clear, async (payload, context) => {
        try {
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { success: false, error: resolved.error }
          }
          return resolved.plugin.clearStorage()
        } catch (error) {
          logIpcHandlerError('plugin:storage:clear', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.openFolder, async (payload, context) => {
        try {
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return
          }
          const configPath = resolved.plugin.getConfigPath()
          await shell.openPath(configPath)
        } catch (error) {
          logIpcHandlerError('plugin:storage:open-folder', error)
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.openInEditor, async (payload) => {
        try {
          const pluginName = payload?.pluginName
          if (!pluginName) {
            return { success: false, error: 'Plugin name is required' }
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return { success: false, error: `Plugin ${pluginName} not found` }
          }

          const configPath = plugin.getConfigPath()

          try {
            await execFileSafe('code', [configPath])
          } catch {
            await shell.openPath(configPath)
          }

          return { success: true }
        } catch (error) {
          logIpcHandlerError('plugin:storage:open-in-editor', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.sqlite.execute, async (payload, context) => {
        try {
          const sql = typeof payload?.sql === 'string' ? payload.sql.trim() : ''
          if (!sql) {
            return { success: false, error: 'sql is required' }
          }

          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { success: false, error: resolved.error }
          }
          const sqliteVersionError = resolveSqliteVersionError(resolved.plugin)
          if (sqliteVersionError) {
            return { success: false, error: sqliteVersionError }
          }
          const sqlitePermissionError = resolveSqlitePermissionError(resolved.plugin)
          if (sqlitePermissionError) {
            return { success: false, error: sqlitePermissionError }
          }

          const client = getPluginSqliteClient(resolved.plugin)
          const result = await client.execute({
            sql,
            args: normalizeSqlParams(payload?.params)
          })

          return {
            success: true,
            rowsAffected: Number(result.rowsAffected ?? 0),
            lastInsertRowId: normalizeLastInsertRowId(result.lastInsertRowid)
          }
        } catch (error) {
          logIpcHandlerError('plugin:sqlite:execute', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.sqlite.query, async (payload, context) => {
        try {
          const sql = typeof payload?.sql === 'string' ? payload.sql.trim() : ''
          if (!sql) {
            return {
              success: false,
              error: 'sql is required',
              rows: [] as Array<Record<string, unknown>>
            }
          }

          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return {
              success: false,
              error: resolved.error,
              rows: [] as Array<Record<string, unknown>>
            }
          }
          const sqliteVersionError = resolveSqliteVersionError(resolved.plugin)
          if (sqliteVersionError) {
            return {
              success: false,
              error: sqliteVersionError,
              rows: [] as Array<Record<string, unknown>>
            }
          }
          const sqlitePermissionError = resolveSqlitePermissionError(resolved.plugin)
          if (sqlitePermissionError) {
            return {
              success: false,
              error: sqlitePermissionError,
              rows: [] as Array<Record<string, unknown>>
            }
          }

          const client = getPluginSqliteClient(resolved.plugin)
          const result = await client.execute({
            sql,
            args: normalizeSqlParams(payload?.params)
          })

          const rows = (result.rows ?? []).map((row) => {
            const normalized: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
              normalized[key] = normalizeSqlValue(value)
            }
            return normalized
          })

          return {
            success: true,
            rows,
            columns: Array.isArray(result.columns) ? result.columns : []
          }
        } catch (error) {
          logIpcHandlerError('plugin:sqlite:query', error)
          return {
            success: false,
            error: toErrorMessage(error),
            rows: [] as Array<Record<string, unknown>>
          }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.sqlite.transaction, async (payload, context) => {
        try {
          const statements = Array.isArray(payload?.statements) ? payload.statements : []
          if (!statements.length) {
            return {
              success: false,
              error: 'statements are required',
              results: [] as Array<{ rowsAffected: number; lastInsertRowId: number | null }>
            }
          }

          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return {
              success: false,
              error: resolved.error,
              results: [] as Array<{ rowsAffected: number; lastInsertRowId: number | null }>
            }
          }
          const sqliteVersionError = resolveSqliteVersionError(resolved.plugin)
          if (sqliteVersionError) {
            return {
              success: false,
              error: sqliteVersionError,
              results: [] as Array<{ rowsAffected: number; lastInsertRowId: number | null }>
            }
          }
          const sqlitePermissionError = resolveSqlitePermissionError(resolved.plugin)
          if (sqlitePermissionError) {
            return {
              success: false,
              error: sqlitePermissionError,
              results: [] as Array<{ rowsAffected: number; lastInsertRowId: number | null }>
            }
          }

          const client = getPluginSqliteClient(resolved.plugin)
          const results: Array<{ rowsAffected: number; lastInsertRowId: number | null }> = []

          await client.execute('BEGIN IMMEDIATE')
          try {
            for (const statement of statements) {
              const sql = typeof statement?.sql === 'string' ? statement.sql.trim() : ''
              if (!sql) {
                throw new Error('sql is required in transaction statement')
              }
              const result = await client.execute({
                sql,
                args: normalizeSqlParams(statement?.params)
              })
              results.push({
                rowsAffected: Number(result.rowsAffected ?? 0),
                lastInsertRowId: normalizeLastInsertRowId(result.lastInsertRowid)
              })
            }
            await client.execute('COMMIT')
          } catch (error) {
            await client.execute('ROLLBACK')
            throw error
          }

          return { success: true, results }
        } catch (error) {
          logIpcHandlerError('plugin:sqlite:transaction', error)
          return {
            success: false,
            error: toErrorMessage(error),
            results: [] as Array<{ rowsAffected: number; lastInsertRowId: number | null }>
          }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.devServer.reconnect, async (payload) => {
        try {
          const pluginName = payload?.pluginName
          if (!pluginName) {
            return { success: false, error: 'Plugin name is required' }
          }
          const success = (await this.healthMonitor?.reconnectDevServer(pluginName)) || false
          return { success }
        } catch (error) {
          logIpcHandlerError('plugin:reconnect-dev-server', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.devServer.status, async (payload) => {
        try {
          const pluginName = payload?.pluginName
          if (!pluginName) {
            return { monitoring: false, connected: false, error: 'Plugin name is required' }
          }

          return (
            this.healthMonitor?.getStatus(pluginName) || {
              monitoring: false,
              connected: false
            }
          )
        } catch (error) {
          logIpcHandlerError('plugin:dev-server-status', error)
          return {
            monitoring: false,
            connected: false,
            error: toErrorMessage(error)
          }
        }
      })
    )

    manager.plugins.forEach((plugin) => {
      if (plugin.status === PluginStatus.ENABLED && plugin.dev.enable && plugin.dev.source) {
        this.healthMonitor?.startMonitoring(plugin)
      }
    })

    const readInstallSource = async (pluginName: string): Promise<unknown | null> => {
      try {
        const sourceData = await manager.dbUtils.getPluginData(pluginName, 'install_source')
        const raw = sourceData?.value
        if (typeof raw !== 'string' || raw.trim().length === 0) {
          return null
        }
        return JSON.parse(raw)
      } catch {
        return null
      }
    }

    const serializePluginWithInstallSource = async (
      plugin: TouchPlugin
    ): Promise<ITouchPlugin & { installSource?: unknown | null }> => {
      const base = plugin.toJSONObject() as ITouchPlugin & { installSource?: unknown | null }
      base.installSource = await readInstallSource(plugin.name)
      return base
    }

    this.transportDisposers.push(
      transport.on(PluginEvents.api.list, async (payload) => {
        try {
          const filters = payload?.filters || {}
          let plugins = Array.from(manager.plugins.values()) as TouchPlugin[]

          if (filters.status !== undefined) {
            plugins = plugins.filter((p) => p.status === filters.status)
          }
          if (filters.enabled !== undefined) {
            const enabledNames = manager.enabledPlugins
            plugins = plugins.filter((p) => enabledNames.has(p.name) === filters.enabled)
          }
          if (filters.dev !== undefined) {
            plugins = plugins.filter((p) => p.dev?.enable === filters.dev)
          }

          return await Promise.all(
            plugins.map((plugin) => serializePluginWithInstallSource(plugin))
          )
        } catch (error) {
          logIpcHandlerError('plugin:api:list', error)
          return []
        }
      }),

      transport.on(PluginEvents.api.get, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return null
          }

          const plugin = manager.plugins.get(name) as TouchPlugin | undefined
          if (!plugin) {
            return null
          }

          return await serializePluginWithInstallSource(plugin)
        } catch (error) {
          logIpcHandlerError('plugin:api:get', error)
          return null
        }
      }),

      transport.on(PluginEvents.api.getStatus, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return -1
          }

          const plugin = manager.plugins.get(name)
          return plugin ? plugin.status : -1
        } catch (error) {
          logIpcHandlerError('plugin:api:get-status', error)
          return -1
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.api.enable, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }

          const success = await manager.enablePlugin(name)
          if (success) {
            const plugin = manager.plugins.get(name)
            if (plugin) {
              transport.broadcast(PluginEvents.push.stateChanged, {
                type: 'status-changed',
                name,
                status: plugin.status
              })
            }
          }
          return { success }
        } catch (error) {
          logIpcHandlerError('plugin:api:enable', error)
          return { success: false, error: toErrorMessage(error) }
        }
      }),

      transport.on(PluginEvents.api.disable, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }

          const success = await manager.disablePlugin(name)
          if (success) {
            const plugin = manager.plugins.get(name)
            if (plugin) {
              transport.broadcast(PluginEvents.push.stateChanged, {
                type: 'status-changed',
                name,
                status: plugin.status
              })
            }
          }
          return { success }
        } catch (error) {
          logIpcHandlerError('plugin:api:disable', error)
          return { success: false, error: toErrorMessage(error) }
        }
      }),

      transport.on(PluginEvents.api.reload, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }

          if (!manager.plugins.has(name)) {
            return { success: false, error: `Plugin ${name} not found` }
          }

          await manager.reloadPlugin(name)
          return { success: true }
        } catch (error) {
          logIpcHandlerError('plugin:api:reload', error)
          return { success: false, error: toErrorMessage(error) }
        }
      }),

      transport.on(PluginEvents.api.install, async (request) => {
        const installQueue = this.installQueue
        if (!installQueue) {
          return { success: false, error: 'Install queue is not ready' }
        }

        if (!request || typeof request.source !== 'string' || request.source.trim().length === 0) {
          return { success: false, error: 'Invalid install request' }
        }

        const result = await installQueue.enqueue(request)
        if (result?.status === 'success') {
          return { success: true }
        }
        return { success: false, error: result?.message ?? 'INSTALL_FAILED' }
      }),

      transport.on(PluginEvents.api.uninstall, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }

          const success = await manager.uninstallPlugin(name)
          if (!success) {
            return { success: false, error: `Plugin ${name} not found` }
          }
          return { success: true }
        } catch (error) {
          logIpcHandlerError('plugin:api:uninstall', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.api.triggerFeature, async (payload) => {
        try {
          const pluginName = payload?.plugin
          const featureId = payload?.feature
          const query = payload?.query
          if (!pluginName || !featureId) {
            return { error: 'Plugin name and feature ID are required' }
          }

          const pluginIns = manager.plugins.get(pluginName)
          if (!pluginIns) {
            return { error: `Plugin ${pluginName} not found` }
          }

          const feature = pluginIns.getFeature(featureId)
          if (!feature) {
            return { error: `Feature ${featureId} not found in plugin ${pluginName}` }
          }

          return pluginIns.triggerFeature(feature, query)
        } catch (error) {
          logIpcHandlerError('plugin:api:trigger-feature', error)
          return { error: toErrorMessage(error) }
        }
      }),

      transport.on(PluginEvents.api.registerWidget, async (payload) => {
        try {
          const pluginName = payload?.plugin
          const featureId = payload?.feature
          if (!pluginName || !featureId) {
            return { success: false, error: 'Plugin name and feature ID are required' }
          }

          const pluginIns = manager.plugins.get(pluginName)
          if (!pluginIns) {
            return { success: false, error: `Plugin ${pluginName} not found` }
          }

          const feature = pluginIns.getFeature(featureId)
          if (!feature) {
            return {
              success: false,
              error: `Feature ${featureId} not found in plugin ${pluginName}`
            }
          }

          if (feature.interaction?.type !== 'widget' || !feature.interaction?.path) {
            return { success: false, error: 'Feature does not have a widget interaction' }
          }

          const registration = await widgetManager.registerWidget(pluginIns, feature, {
            emitAsUpdate: payload?.emitAsUpdate
          })
          if (!registration) {
            return { success: false, error: 'WIDGET_REGISTER_FAILED' }
          }
          return { success: true }
        } catch (error) {
          logIpcHandlerError('plugin:api:register-widget', error)
          return { success: false, error: toErrorMessage(error) }
        }
      }),

      transport.on(PluginEvents.api.featureInputChanged, async (payload) => {
        try {
          const pluginName = payload?.plugin
          const featureId = payload?.feature
          const query = payload?.query
          if (!pluginName || !featureId) {
            return
          }

          const pluginIns = manager.plugins.get(pluginName)
          if (!pluginIns) {
            return
          }

          const feature = pluginIns.getFeature(featureId)
          if (!feature) {
            return
          }

          pluginIns.triggerInputChanged(feature, query)
        } catch (error) {
          logIpcHandlerError('plugin:api:feature-input-changed', error)
        }
      }),

      transport.on(PluginEvents.api.openFolder, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return
          }

          const plugin = manager.getPluginByName(name) as TouchPlugin
          if (!plugin) {
            return
          }

          await shell.openPath(plugin.pluginPath)
        } catch (error) {
          logIpcHandlerError('plugin:api:open-folder', error)
        }
      }),

      transport.on(PluginEvents.api.getOfficialList, async (payload) => {
        try {
          return await getOfficialPlugins({ force: Boolean(payload?.force) })
        } catch (error: unknown) {
          logIpcHandlerError('plugin:api:get-official-list', error)
          return { plugins: [] }
        }
      })
    )

    // ============================================
    // Plugin Details APIs (for PluginInfo page)
    // ============================================

    /**
     * Get plugin manifest.json content
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.getManifest, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return null
          }

          const plugin = manager.getPluginByName(name) as TouchPlugin
          if (!plugin) {
            return null
          }

          const manifestPath = path.resolve(plugin.pluginPath, 'manifest.json')
          if (!fse.existsSync(manifestPath)) {
            return null
          }

          return fse.readJSONSync(manifestPath)
        } catch (error) {
          logIpcHandlerError('plugin:api:get-manifest', error)
          return null
        }
      })
    )

    /**
     * Save plugin manifest.json and optionally reload
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.saveManifest, async (payload) => {
        try {
          const name = payload?.name
          const manifest = payload?.manifest
          const shouldReload = payload?.reload !== false

          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }
          if (!manifest) {
            return { success: false, error: 'Manifest content is required' }
          }

          const plugin = manager.getPluginByName(name) as TouchPlugin
          if (!plugin) {
            return { success: false, error: `Plugin ${name} not found` }
          }

          const manifestPath = path.resolve(plugin.pluginPath, 'manifest.json')
          const currentManifest = fse.existsSync(manifestPath)
            ? fse.readJSONSync(manifestPath)
            : null
          const nextManifest = mergePackagedManifestMetadata(currentManifest, manifest)
          fse.writeJSONSync(manifestPath, nextManifest, { spaces: 2 })

          if (shouldReload) {
            await manager.reloadPlugin(name)
          }

          return { success: true }
        } catch (error) {
          logIpcHandlerError('plugin:api:save-manifest', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.api.saveWidgetFile, async (payload) => {
        try {
          const name = payload?.name
          const widgetPath = payload?.widgetPath
          const source = payload?.source
          const overwrite = payload?.overwrite !== false

          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }
          if (typeof widgetPath !== 'string') {
            return { success: false, error: 'Widget path is required' }
          }
          if (typeof source !== 'string') {
            return { success: false, error: 'Widget source is required' }
          }

          const plugin = manager.getPluginByName(name) as TouchPlugin
          if (!plugin) {
            return { success: false, error: `Plugin ${name} not found` }
          }

          if (!plugin.dev?.enable) {
            return { success: false, error: 'Widget editing is only available in dev mode' }
          }

          const resolved = resolveWidgetTarget(plugin.pluginPath, widgetPath)
          if ('error' in resolved) {
            return { success: false, error: resolved.error }
          }

          if (!overwrite && fse.existsSync(resolved.absolutePath)) {
            return { success: false, error: 'Widget file already exists' }
          }

          fse.ensureDirSync(path.dirname(resolved.absolutePath))
          fse.writeFileSync(resolved.absolutePath, source, 'utf-8')

          if (plugin.dev?.enable && !plugin.dev?.source) {
            await manager.reloadPlugin(plugin.name)
          }

          return { success: true, relativePath: resolved.relativePath }
        } catch (error) {
          logIpcHandlerError('plugin:api:save-widget-file', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    /**
     * Get plugin paths (pluginPath, dataPath, configPath, logsPath)
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.getPaths, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            throw new Error('Plugin name is required')
          }

          const plugin = manager.getPluginByName(name) as TouchPlugin
          if (!plugin) {
            throw new Error(`Plugin ${name} not found`)
          }

          return {
            pluginPath: plugin.pluginPath,
            dataPath: plugin.getDataPath(),
            configPath: plugin.getConfigPath(),
            logsPath: plugin.getLogsPath(),
            tempPath: plugin.getTempPath()
          }
        } catch (error) {
          logIpcHandlerError('plugin:api:get-paths', error)
          throw error
        }
      })
    )

    /**
     * Open a specific plugin path in file explorer
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.openPath, async (payload) => {
        try {
          const name = payload?.name
          const pathType = payload?.pathType
          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }
          if (!pathType) {
            return { success: false, error: 'Path type is required' }
          }

          const plugin = manager.getPluginByName(name) as TouchPlugin
          if (!plugin) {
            return { success: false, error: `Plugin ${name} not found` }
          }

          let targetPath: string
          switch (pathType) {
            case 'plugin':
              targetPath = plugin.pluginPath
              break
            case 'data':
              targetPath = plugin.getDataPath()
              break
            case 'config':
              targetPath = plugin.getConfigPath()
              break
            case 'logs':
              targetPath = plugin.getLogsPath()
              break
            case 'temp':
              targetPath = plugin.getTempPath()
              break
            default:
              return { success: false, error: `Invalid path type: ${pathType}` }
          }

          fse.ensureDirSync(targetPath)
          await shell.openPath(targetPath)

          return { success: true, path: targetPath }
        } catch (error) {
          logIpcHandlerError('plugin:api:open-path', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    /**
     * Reveal a specific plugin file in file explorer
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.revealPath, async (payload) => {
        try {
          const name = payload?.name
          const targetPath = payload?.path
          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }
          if (!targetPath) {
            return { success: false, error: 'Path is required' }
          }

          const plugin = manager.getPluginByName(name) as TouchPlugin
          if (!plugin) {
            return { success: false, error: `Plugin ${name} not found` }
          }

          const resolvedTarget = path.resolve(targetPath)
          const allowedRoots = [
            plugin.pluginPath,
            plugin.getDataPath(),
            plugin.getConfigPath(),
            plugin.getLogsPath(),
            plugin.getTempPath()
          ].map((root) => path.resolve(root))

          const isAllowed = allowedRoots.some(
            (root) => resolvedTarget === root || resolvedTarget.startsWith(`${root}${path.sep}`)
          )

          if (!isAllowed) {
            return { success: false, error: 'Path is not allowed' }
          }

          if (!(await fse.pathExists(resolvedTarget))) {
            return { success: false, error: 'Path does not exist' }
          }

          shell.showItemInFolder(resolvedTarget)
          return { success: true, path: resolvedTarget }
        } catch (error) {
          logIpcHandlerError('plugin:api:reveal-path', error)
          return { success: false, error: toErrorMessage(error) }
        }
      })
    )

    /**
     * Get plugin performance metrics
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.getPerformance, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { error: 'Plugin name is required' }
          }

          const plugin = manager.plugins.get(name) as TouchPlugin
          if (!plugin) {
            return { error: `Plugin ${name} not found` }
          }

          const storageStats = plugin.getStorageStats()
          const performanceMetrics = plugin.getPerformanceMetrics?.() || {
            loadTime: 0,
            memoryUsage: 0,
            cpuUsage: 0,
            lastActiveTime: 0
          }

          return {
            storage: storageStats,
            performance: performanceMetrics
          }
        } catch (error) {
          logIpcHandlerError('plugin:api:get-performance', error)
          return { error: toErrorMessage(error) }
        }
      })
    )

    /**
     * Get plugin runtime stats (workers/memory/uptime)
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.getRuntimeStats, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { error: 'Plugin name is required' }
          }

          const plugin = manager.plugins.get(name) as TouchPlugin
          if (!plugin) {
            return { error: `Plugin ${name} not found` }
          }

          const now = Date.now()
          const startedAt = plugin._runtimeStats?.startedAt ?? 0
          const lastActiveAt =
            plugin._runtimeStats?.lastActiveAt ?? plugin._performanceMetrics?.lastActiveTime ?? 0

          const cachedViews = viewCacheManager.getCachedViewsByPlugin(name)
          const webContentsList: Electron.WebContents[] = []

          const getViewWebContents = (view: unknown): Electron.WebContents | null => {
            if (!isRecord(view)) return null
            return useAliveWebContents(view as { webContents?: Electron.WebContents | null })
          }

          for (const win of plugin._windows.values()) {
            const webContents = useAliveWebContents(win.window)
            if (!webContents) continue
            webContentsList.push(webContents)
          }

          for (const view of cachedViews) {
            const webContents = getViewWebContents(view)
            if (!webContents) continue
            webContentsList.push(webContents)
          }

          let divisionBoxViewCount = 0
          try {
            const { DivisionBoxManager } = await import('../division-box/manager')
            const divisionBoxManager = DivisionBoxManager.getInstance()
            const sessions = divisionBoxManager.getActiveSessions()
            for (const session of sessions) {
              const attached = session.getAttachedPlugin()
              if (attached?.name !== name) continue
              const view = session.getUIView()
              const webContents = getViewWebContents(view)
              if (!webContents) continue
              divisionBoxViewCount += 1
              webContentsList.push(webContents)
            }
          } catch {
            // ignore: DivisionBox is optional for plugins
          }

          const webContentsMap = new Map<number, Electron.WebContents>()
          for (const webContents of webContentsList) {
            if (!useAliveTarget(webContents)) continue
            webContentsMap.set(webContents.id, webContents)
          }

          const webContents = Array.from(webContentsMap.values())

          const appMetrics = app.getAppMetrics()
          const metricByPid = new Map<number, Electron.ProcessMetric>()
          appMetrics.forEach((metric) => {
            metricByPid.set(metric.pid, metric as Electron.ProcessMetric)
          })

          let memoryBytes = 0
          let cpuPercent = 0
          for (const wc of webContents) {
            const getOSProcessId = (wc as unknown as { getOSProcessId?: unknown }).getOSProcessId
            const pid =
              typeof getOSProcessId === 'function' ? (getOSProcessId as () => number).call(wc) : 0
            if (!pid) continue
            const metric = metricByPid.get(pid)
            if (!metric) continue

            const workingSetSizeKb = (
              metric as unknown as { memory?: { workingSetSize?: unknown } }
            ).memory?.workingSetSize
            if (typeof workingSetSizeKb === 'number') {
              memoryBytes += workingSetSizeKb * 1024
            }

            const percentCpu = (metric as unknown as { cpu?: { percentCPUUsage?: unknown } }).cpu
              ?.percentCPUUsage
            if (typeof percentCpu === 'number') {
              cpuPercent += percentCpu
            }
          }

          return {
            startedAt,
            uptimeMs: startedAt > 0 ? now - startedAt : 0,
            requestCount: plugin._runtimeStats?.requestCount ?? 0,
            lastActiveAt,
            workers: {
              threadCount: pluginRuntimeTracker.getWorkerCount(name),
              uiProcessCount: webContents.length,
              windowCount: plugin._windows.size,
              cachedViewCount: cachedViews.length,
              divisionBoxViewCount
            },
            usage: {
              memoryBytes,
              cpuPercent
            }
          }
        } catch (error) {
          logIpcHandlerError('plugin:api:get-runtime-stats', error)
          return { error: toErrorMessage(error) }
        }
      })
    )

    /**
     * Search plugins in the store (NPM + TPEX)
     */
    this.transportDisposers.push(
      transport.on(StoreEvents.api.search, async (payload) => {
        try {
          const { searchPlugins } = await import('../../service/plugin-store.service')
          const source =
            payload?.source === 'tpex' || payload?.source === 'npm' || payload?.source === 'all'
              ? payload.source
              : undefined
          return await searchPlugins({
            keyword: payload?.keyword,
            source,
            category: payload?.category,
            limit: payload?.limit,
            offset: payload?.offset
          })
        } catch (error: unknown) {
          logIpcHandlerError('plugin:store:search', error)
          return { error: error instanceof Error ? error.message : 'STORE_SEARCH_FAILED' }
        }
      })
    )

    /**
     * Get plugin details from store
     */
    this.transportDisposers.push(
      transport.on(StoreEvents.api.getPlugin, async (payload) => {
        try {
          const { getPluginDetails } = await import('../../service/plugin-store.service')
          const identifier = payload?.identifier
          if (!identifier) return null
          const source =
            payload?.source === 'tpex' || payload?.source === 'npm' ? payload.source : undefined
          const plugin = await getPluginDetails(identifier, source)
          return plugin ?? null
        } catch (error: unknown) {
          logIpcHandlerError('plugin:store:get-plugin', error)
          return null
        }
      })
    )

    /**
     * Get featured plugins from store
     */
    this.transportDisposers.push(
      transport.on(StoreEvents.api.featured, async (payload) => {
        try {
          const { getFeaturedPlugins } = await import('../../service/plugin-store.service')
          const limit =
            isRecord(payload) && typeof payload.limit === 'number' ? payload.limit : undefined
          const plugins = await getFeaturedPlugins(limit)
          return { plugins }
        } catch (error: unknown) {
          logIpcHandlerError('plugin:store:featured', error)
          return { plugins: [] }
        }
      })
    )

    /**
     * List plugins from NPM
     */
    this.transportDisposers.push(
      transport.on(StoreEvents.api.npmList, async () => {
        try {
          const { listNpmPlugins } = await import('../../service/plugin-store.service')
          const plugins = await listNpmPlugins()
          return { plugins }
        } catch (error: unknown) {
          logIpcHandlerError('plugin:store:npm-list', error)
          return { plugins: [] }
        }
      })
    )
  }
}

const pluginModule = new PluginModule()

export { pluginModule }
