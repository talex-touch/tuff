import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type {
  WidgetPrecompiledManifestEntry,
  WidgetPrecompiledMeta,
  WidgetFailurePayload,
  WidgetRegistrationPayload
} from '@talex-touch/utils/plugin/widget'
import type { FSWatcher } from 'chokidar'
import type { WidgetCompilationContext } from './widget-processor'
import { WIDGET_RUNTIME_COMPILE_ENV, makeWidgetId } from '@talex-touch/utils/plugin/widget'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import crypto from 'node:crypto'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import chokidar from 'chokidar'
import fse from 'fs-extra'
import { getRegisteredMainRuntime } from '../../../core/runtime-accessor'
import { getCoreBoxWindow } from '../../box-tool/core-box/window'
import { compileWidgetSource } from './widget-compiler'
import { pushWidgetFeatureIssue } from './widget-issue'
import { pluginWidgetLoader, resolveWidgetFilePath } from './widget-loader'
import { classifyWidgetCompileError, resolveWidgetCompileCauseCode } from './widget-transform'

type WidgetEvent = 'register' | 'update'

const WIDGET_FAILURE_CACHE_TTL_MS = 30_000

type WidgetCompiledMeta = {
  hash: string
  styles: string
  dependencies?: string[]
  filePath?: string
  compiledAt?: number
  sourceMtimeMs?: number
}

type WidgetSourceHint = {
  widgetId: string
  filePath?: string
  hash?: string
}

type WidgetCompiledCache = {
  code: string
  styles: string
  dependencies: string[]
  filePath: string
  hash: string
}

type WidgetPrecompiledCache = WidgetCompiledCache & {
  sourcePath?: string
}

type WidgetPrecompiledLoadFailure = {
  code: string
  message: string
  fromManifestEntry: boolean
  filePath?: string | null
  hash?: string
  cause?: string
}

type WidgetCompileFailureCache = {
  expiresAt: number
  payload: WidgetFailurePayload
}

function resolveWidgetCompiledOutputPath(plugin: ITouchPlugin, widgetId: string): string | null {
  const pluginWithTemp = plugin as { getTempPath?: () => string }
  const getTempPath = pluginWithTemp.getTempPath
  if (typeof getTempPath !== 'function') return null
  let tempPath = ''
  try {
    tempPath = getTempPath.call(plugin)
  } catch {
    return null
  }
  if (!tempPath) return null
  const safeId = widgetId.replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(tempPath, 'widgets', `${safeId}.cjs`)
}

function resolveWidgetCompiledMetaPath(plugin: ITouchPlugin, widgetId: string): string | null {
  const outputPath = resolveWidgetCompiledOutputPath(plugin, widgetId)
  if (!outputPath) return null
  const base = path.basename(outputPath, '.cjs')
  return path.join(path.dirname(outputPath), `${base}.meta.json`)
}

function resolvePackagedWidgetPackagePath(
  plugin: ITouchPlugin,
  packagedPath: string
): string | null {
  const normalized = packagedPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized) return null

  const candidate = path.resolve(plugin.pluginPath, normalized)
  const relative = path.relative(plugin.pluginPath, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }
  return candidate
}

function isRuntimeCompileExplicitlyEnabled(): boolean {
  const value = process.env[WIDGET_RUNTIME_COMPILE_ENV]?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

function canRuntimeCompileWidget(plugin: ITouchPlugin): boolean {
  return Boolean(plugin.dev?.enable && plugin.dev?.source) || isRuntimeCompileExplicitlyEnabled()
}

function findPrecompiledWidgetEntry(
  plugin: ITouchPlugin,
  feature: IPluginFeature,
  widgetId: string
): WidgetPrecompiledManifestEntry | null {
  const entries = plugin.build?.widgets
  if (!Array.isArray(entries)) return null
  return (
    entries.find((entry) => entry.featureId === feature.id || entry.widgetId === widgetId) ?? null
  )
}

async function loadPrecompiledWidget(
  plugin: ITouchPlugin,
  feature: IPluginFeature,
  widgetId: string
): Promise<{
  cache: WidgetPrecompiledCache | null
  failure?: WidgetPrecompiledLoadFailure
}> {
  const entry = findPrecompiledWidgetEntry(plugin, feature, widgetId)
  if (!entry) {
    return {
      cache: null,
      failure: {
        code: 'WIDGET_PRECOMPILED_MISSING',
        message: `Precompiled widget is missing for feature "${feature.id}". Rebuild the plugin with the latest tuff builder.`,
        fromManifestEntry: false
      }
    }
  }

  const compiledPath = resolvePackagedWidgetPackagePath(plugin, entry.compiledPath)
  if (!compiledPath) {
    return {
      cache: null,
      failure: {
        code: 'WIDGET_PRECOMPILED_MISSING',
        message: `Precompiled widget path is invalid or outside plugin package: ${entry.compiledPath}`,
        fromManifestEntry: true,
        filePath: entry.compiledPath,
        hash: entry.hash
      }
    }
  }

  if (!(await fse.pathExists(compiledPath))) {
    return {
      cache: null,
      failure: {
        code: 'WIDGET_PRECOMPILED_MISSING',
        message: `Precompiled widget output does not exist: ${entry.compiledPath}`,
        fromManifestEntry: true,
        filePath: compiledPath,
        hash: entry.hash
      }
    }
  }

  const sourcePath = resolveWidgetFilePath(plugin.pluginPath, feature.interaction?.path ?? '')
  if (sourcePath && (await fse.pathExists(sourcePath))) {
    try {
      const source = await fse.readFile(sourcePath, 'utf-8')
      const sourceHash = crypto.createHash('sha256').update(source).digest('hex')
      if (sourceHash !== entry.hash) {
        return {
          cache: null,
          failure: {
            code: 'WIDGET_PRECOMPILED_STALE',
            message: `Precompiled widget is stale for feature "${feature.id}". Rebuild the plugin package.`,
            fromManifestEntry: true,
            filePath: compiledPath,
            hash: entry.hash,
            cause: sourceHash
          }
        }
      }
    } catch (error) {
      plugin.logger.warn(
        `[WidgetManager] Failed to verify widget source hash: ${sourcePath}`,
        error as Error
      )
    }
  } else {
    pushWidgetFeatureIssue(plugin, feature, {
      code: 'WIDGET_SOURCE_MISSING',
      message: `Widget source is missing for feature "${feature.id}", using bundled precompiled output.`,
      meta: { widgetId, filePath: sourcePath, compiledPath }
    })
  }

  let meta: WidgetPrecompiledMeta | null = null
  if (entry.metaPath) {
    const metaPath = resolvePackagedWidgetPackagePath(plugin, entry.metaPath)
    if (!metaPath) {
      return {
        cache: null,
        failure: {
          code: 'WIDGET_PRECOMPILED_MISSING',
          message: `Precompiled widget meta path is invalid or outside plugin package: ${entry.metaPath}`,
          fromManifestEntry: true,
          filePath: entry.metaPath,
          hash: entry.hash
        }
      }
    }
    if (await fse.pathExists(metaPath)) {
      try {
        meta = await fse.readJson(metaPath)
      } catch (error) {
        plugin.logger.warn(
          `[WidgetManager] Failed to read precompiled widget meta: ${metaPath}`,
          error as Error
        )
      }
    }
  }

  const code = await fse.readFile(compiledPath, 'utf-8')
  return {
    cache: {
      code,
      styles: typeof meta?.styles === 'string' ? meta.styles : entry.styles,
      dependencies: Array.isArray(meta?.dependencies)
        ? meta.dependencies
        : Array.isArray(entry.dependencies)
          ? entry.dependencies
          : [],
      filePath: compiledPath,
      hash: entry.hash,
      sourcePath: sourcePath ?? undefined
    }
  }
}

function isRemotePath(filePath?: string): boolean {
  return /^https?:\/\//i.test(filePath ?? '')
}

async function resolveSourceMtimeMs(filePath: string): Promise<number | undefined> {
  if (!filePath || isRemotePath(filePath)) return undefined
  try {
    const stat = await fse.stat(filePath)
    return stat.mtimeMs
  } catch {
    return undefined
  }
}

async function loadCompiledWidgetCache(
  plugin: ITouchPlugin,
  sourceHint: WidgetSourceHint,
  isDev: boolean
): Promise<WidgetCompiledCache | null> {
  const compiledOutputPath = resolveWidgetCompiledOutputPath(plugin, sourceHint.widgetId)
  const compiledMetaPath = resolveWidgetCompiledMetaPath(plugin, sourceHint.widgetId)
  if (!compiledOutputPath || !compiledMetaPath) return null

  const outputExists = await fse.pathExists(compiledOutputPath)
  const metaExists = await fse.pathExists(compiledMetaPath)
  if (!outputExists || !metaExists) return null

  let meta: WidgetCompiledMeta | null = null
  try {
    meta = await fse.readJson(compiledMetaPath)
  } catch (error) {
    if (isDev) {
      plugin.logger.warn(
        `[WidgetManager] Failed to read compiled widget meta: ${compiledMetaPath}`,
        error as Error
      )
    }
    return null
  }

  if (!meta || typeof meta.hash !== 'string') {
    return null
  }

  if (!meta.filePath || typeof meta.filePath !== 'string') {
    return null
  }

  if (sourceHint.hash && meta.hash !== sourceHint.hash) {
    return null
  }

  if (sourceHint.filePath && meta.filePath !== sourceHint.filePath) {
    return null
  }

  if (meta.sourceMtimeMs && !isRemotePath(meta.filePath)) {
    try {
      const stat = await fse.stat(meta.filePath)
      if (stat.mtimeMs > meta.sourceMtimeMs + 1) {
        return null
      }
    } catch (error) {
      if (isDev) {
        plugin.logger.warn(
          `[WidgetManager] Failed to stat widget source: ${meta.filePath}`,
          error as Error
        )
      }
      return null
    }
  }

  try {
    const code = await fse.readFile(compiledOutputPath, 'utf-8')
    const dependencies = Array.isArray(meta.dependencies) ? meta.dependencies : []
    const styles = typeof meta.styles === 'string' ? meta.styles : ''
    return {
      code,
      styles,
      dependencies,
      filePath: meta.filePath,
      hash: meta.hash
    }
  } catch (error) {
    if (isDev) {
      plugin.logger.warn(
        `[WidgetManager] Failed to read compiled widget output: ${compiledOutputPath}`,
        error as Error
      )
    }
    return null
  }
}
const pluginWidgetRegisterEvent = PluginEvents.widget.register
const pluginWidgetUpdateEvent = PluginEvents.widget.update
const pluginWidgetUnregisterEvent = PluginEvents.widget.unregister
const pluginWidgetFailedEvent = PluginEvents.widget.failed

const resolveKeyManager = (channel: { keyManager?: unknown }): unknown =>
  channel.keyManager ?? channel

export class WidgetManager {
  private readonly cache = new Map<string, WidgetRegistrationPayload>()
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly compileFailures = new Map<string, WidgetCompileFailureCache>()

  private get transport() {
    const channel = getRegisteredMainRuntime('plugin-module').channel
    const keyManager = resolveKeyManager(channel as { keyManager?: unknown })
    return getTuffTransportMain(channel, keyManager)
  }

  private getWidgetWindowIds(): number[] {
    const ids = new Set<number>()
    const mainWindow = getRegisteredMainRuntime('plugin-module').app.window.window
    if (mainWindow && !mainWindow.isDestroyed()) {
      ids.add(mainWindow.id)
    }
    const coreBoxWindow = getCoreBoxWindow()?.window
    if (coreBoxWindow && !coreBoxWindow.isDestroyed()) {
      ids.add(coreBoxWindow.id)
    }
    return Array.from(ids)
  }

  private async emitCompiledCache(
    plugin: ITouchPlugin,
    feature: IPluginFeature,
    widgetId: string,
    compiledCache: WidgetCompiledCache | WidgetPrecompiledCache,
    options?: { emitAsUpdate?: boolean }
  ): Promise<WidgetRegistrationPayload | null> {
    const payload: WidgetRegistrationPayload = {
      widgetId,
      pluginName: plugin.name,
      featureId: feature.id,
      filePath: compiledCache.filePath,
      hash: compiledCache.hash,
      code: compiledCache.code,
      styles: compiledCache.styles,
      dependencies: compiledCache.dependencies
    }

    try {
      await this.emitPayload(options?.emitAsUpdate ? 'update' : 'register', payload)
    } catch (error) {
      plugin.logger.error(
        '[WidgetManager] Failed to send widget registration event',
        error as Error
      )
      const failure = this.buildFailurePayload(plugin, feature, {
        widgetId,
        code: 'WIDGET_REGISTER_FAILED',
        message: `${(error as Error).message ?? 'send failed'}`,
        filePath: compiledCache.filePath,
        hash: compiledCache.hash
      })
      this.pushFailureIssue(plugin, feature, failure)
      await this.emitFailure(failure)
      return null
    }

    this.cache.set(widgetId, payload)
    const sourcePath =
      'sourcePath' in compiledCache && compiledCache.sourcePath
        ? compiledCache.sourcePath
        : compiledCache.filePath
    this.watchWidgetFile(plugin, feature, sourcePath)
    return payload
  }

  async registerWidget(
    plugin: ITouchPlugin,
    feature: IPluginFeature,
    options?: { emitAsUpdate?: boolean }
  ): Promise<WidgetRegistrationPayload | null> {
    const isDev = plugin.dev?.enable && plugin.dev?.source
    const interactionPath = feature.interaction?.path
    const widgetId = makeWidgetId(plugin.name, feature.id)
    if (isDev) {
      plugin.logger.info(
        `[WidgetManager] Try load widget for feature \"${feature.id}\" (${interactionPath || 'unknown'})`
      )
    }

    let preloadedSource: Awaited<ReturnType<typeof pluginWidgetLoader.loadWidget>> | undefined
    let precompiledFailure: WidgetPrecompiledLoadFailure | undefined

    if (interactionPath) {
      const sourceHint: WidgetSourceHint = { widgetId }
      if (!isDev) {
        const precompiled = await loadPrecompiledWidget(plugin, feature, widgetId)
        if (precompiled.cache) {
          const payload = await this.emitCompiledCache(
            plugin,
            feature,
            widgetId,
            precompiled.cache,
            options
          )
          if (payload) {
            plugin.logger.info(
              `[WidgetManager] Widget ${options?.emitAsUpdate ? 'update' : 'register'} sent from precompiled package: ${widgetId}`
            )
          }
          return payload
        }
        precompiledFailure = precompiled.failure

        if (canRuntimeCompileWidget(plugin)) {
          preloadedSource = await pluginWidgetLoader.loadWidget(plugin, feature)
          if (preloadedSource) {
            sourceHint.filePath = preloadedSource.filePath
            sourceHint.hash = preloadedSource.hash
          }
        }
      }

      const canUseTempCompiledCache = !precompiledFailure?.fromManifestEntry
      const compiledCache = canUseTempCompiledCache
        ? await loadCompiledWidgetCache(plugin, sourceHint, Boolean(isDev))
        : null
      if (compiledCache) {
        const payload = await this.emitCompiledCache(
          plugin,
          feature,
          widgetId,
          compiledCache,
          options
        )
        if (payload && isDev) {
          plugin.logger.info(
            `[WidgetManager] Widget ${options?.emitAsUpdate ? 'update' : 'register'} sent from compiled cache: ${widgetId}`
          )
        }
        return payload
      } else if (precompiledFailure && !canRuntimeCompileWidget(plugin)) {
        const failure = this.buildAndPushFailure(plugin, feature, {
          widgetId,
          code: precompiledFailure.code,
          message: precompiledFailure.message,
          filePath: precompiledFailure.filePath,
          hash: precompiledFailure.hash,
          cause: precompiledFailure.cause
        })
        await this.emitFailure(failure)
        return null
      }
    }

    const source =
      preloadedSource !== undefined
        ? preloadedSource
        : await pluginWidgetLoader.loadWidget(plugin, feature)
    if (!source) {
      if (isDev) {
        plugin.logger.warn(`[WidgetManager] Widget source missing for feature \"${feature.id}\"`)
      }
      await this.emitFailure(
        this.buildAndPushFailure(plugin, feature, {
          widgetId,
          code: 'WIDGET_SOURCE_MISSING',
          message: `Widget source missing for feature "${feature.id}".`,
          filePath: interactionPath
            ? resolveWidgetFilePath(plugin.pluginPath, interactionPath)
            : undefined
        })
      )
      return null
    }

    const cached = this.cache.get(source.widgetId)
    if (cached && cached.hash === source.hash) {
      if (options?.emitAsUpdate) {
        await this.emitPayload('update', cached)
      }
      if (isDev) {
        plugin.logger.debug(
          `[WidgetManager] Widget cache hit for \"${source.widgetId}\" (emitUpdate=${Boolean(
            options?.emitAsUpdate
          )})`
        )
      }
      return cached
    }

    const compiledCache = await loadCompiledWidgetCache(plugin, source, Boolean(isDev))
    if (compiledCache) {
      const payload: WidgetRegistrationPayload = {
        widgetId: source.widgetId,
        pluginName: source.pluginName,
        featureId: source.featureId,
        filePath: compiledCache.filePath,
        hash: compiledCache.hash,
        code: compiledCache.code,
        styles: compiledCache.styles,
        dependencies: compiledCache.dependencies
      }

      try {
        await this.emitPayload(options?.emitAsUpdate ? 'update' : 'register', payload)
      } catch (error) {
        plugin.logger.error(
          '[WidgetManager] Failed to send widget registration event',
          error as Error
        )
        const failure = this.buildFailurePayload(plugin, feature, {
          widgetId: source.widgetId,
          code: 'WIDGET_REGISTER_FAILED',
          message: `${(error as Error).message ?? 'send failed'}`,
          filePath: compiledCache.filePath,
          hash: compiledCache.hash
        })
        this.pushFailureIssue(plugin, feature, failure)
        await this.emitFailure(failure)
        return null
      }

      this.cache.set(source.widgetId, payload)
      this.watchWidgetFile(plugin, feature, payload.filePath)
      if (isDev) {
        plugin.logger.info(
          `[WidgetManager] Widget ${options?.emitAsUpdate ? 'update' : 'register'} sent from compiled cache: ${source.widgetId}`
        )
      }
      return payload
    }

    const failureCacheKey = this.getFailureCacheKey(source.widgetId, source.hash)
    const cachedFailure = this.getCachedFailure(failureCacheKey)
    if (cachedFailure) {
      await this.emitFailure(cachedFailure)
      if (isDev) {
        plugin.logger.debug(
          `[WidgetManager] Widget compile failure cache hit for "${source.widgetId}" (${cachedFailure.code})`
        )
      }
      return null
    }

    if (!canRuntimeCompileWidget(plugin)) {
      const failure = this.buildAndPushFailure(plugin, feature, {
        widgetId: source.widgetId,
        code: 'WIDGET_RUNTIME_COMPILE_DISABLED',
        message: `Runtime widget compilation is disabled for feature "${feature.id}". Rebuild the plugin with precompiled widgets.`,
        filePath: source.filePath,
        hash: source.hash
      })
      this.cacheFailure(failureCacheKey, failure)
      await this.emitFailure(failure)
      return null
    }

    // Prepare compilation context
    const context: WidgetCompilationContext = {
      plugin,
      feature
    }

    const compileStart = performance.now()
    let compiled
    try {
      compiled = await compileWidgetSource(source, context)
    } catch (error) {
      if (isDev && classifyWidgetCompileError(error) === 'WIDGET_COMPILER_SERVICE_UNAVAILABLE') {
        plugin.logger.warn(
          '[WidgetManager] Widget compiler service stopped, retrying once in dev mode'
        )
        try {
          compiled = await compileWidgetSource(source, context)
        } catch (retryError) {
          plugin.logger.debug('[WidgetManager] Widget compile retry failed', retryError as Error)
          const failure = this.buildFailurePayload(plugin, feature, {
            widgetId: source.widgetId,
            code: classifyWidgetCompileError(retryError),
            message: `${(retryError as Error).message ?? 'unknown error'}`,
            filePath: source.filePath,
            hash: source.hash,
            cause: resolveWidgetCompileCauseCode(retryError)
          })
          this.pushFailureIssue(plugin, feature, failure)
          this.cacheFailure(failureCacheKey, failure)
          await this.emitFailure(failure)
          return null
        }
      } else {
        plugin.logger.debug('[WidgetManager] Widget compile failed', error as Error)
        const failure = this.buildFailurePayload(plugin, feature, {
          widgetId: source.widgetId,
          code: classifyWidgetCompileError(error),
          message: `${(error as Error).message ?? 'unknown error'}`,
          filePath: source.filePath,
          hash: source.hash,
          cause: resolveWidgetCompileCauseCode(error)
        })
        this.pushFailureIssue(plugin, feature, failure)
        this.cacheFailure(failureCacheKey, failure)
        await this.emitFailure(failure)
        return null
      }
    }

    if (!compiled) {
      const failure = this.buildFailurePayloadFromLatestIssue(plugin, feature, {
        widgetId: source.widgetId,
        filePath: source.filePath,
        hash: source.hash
      })
      this.cacheFailure(failureCacheKey, failure)
      await this.emitFailure(failure)
      return null
    }

    const compiledOutputPath = resolveWidgetCompiledOutputPath(plugin, source.widgetId)
    const compileDuration = Math.round(performance.now() - compileStart)
    const compiledOutputDisplay = compiledOutputPath ?? '[memory]'
    plugin.logger.info(
      `[WidgetManager] Compiled widget \"${source.widgetId}\" from ${source.filePath} to ${compiledOutputDisplay} in ${compileDuration}ms`
    )
    if (compiledOutputPath) {
      const compiledMetaPath = resolveWidgetCompiledMetaPath(plugin, source.widgetId)
      try {
        await fse.ensureDir(path.dirname(compiledOutputPath))
        await fse.writeFile(compiledOutputPath, compiled.code, 'utf-8')
      } catch (error) {
        plugin.logger.warn(
          `[WidgetManager] Failed to persist compiled widget output: ${compiledOutputPath}`,
          error as Error
        )
      }
      if (compiledMetaPath) {
        try {
          const sourceMtimeMs = await resolveSourceMtimeMs(source.filePath)
          const meta: WidgetCompiledMeta = {
            hash: source.hash,
            styles: compiled.styles,
            dependencies: compiled.dependencies || [],
            filePath: source.filePath,
            compiledAt: Date.now(),
            sourceMtimeMs
          }
          await fse.writeJson(compiledMetaPath, meta, { spaces: 2 })
        } catch (error) {
          plugin.logger.warn(
            `[WidgetManager] Failed to persist compiled widget meta: ${compiledMetaPath}`,
            error as Error
          )
        }
      }
    }

    const payload: WidgetRegistrationPayload = {
      widgetId: source.widgetId,
      pluginName: source.pluginName,
      featureId: source.featureId,
      filePath: source.filePath,
      hash: source.hash,
      code: compiled.code,
      styles: compiled.styles,
      dependencies: compiled.dependencies || []
    }

    try {
      await this.emitPayload(options?.emitAsUpdate ? 'update' : 'register', payload)
    } catch (error) {
      plugin.logger.error(
        '[WidgetManager] Failed to send widget registration event',
        error as Error
      )
      const failure = this.buildFailurePayload(plugin, feature, {
        widgetId: source.widgetId,
        code: 'WIDGET_REGISTER_FAILED',
        message: `${(error as Error).message ?? 'send failed'}`,
        filePath: source.filePath,
        hash: source.hash
      })
      this.pushFailureIssue(plugin, feature, failure)
      await this.emitFailure(failure)
      return null
    }

    this.cache.set(source.widgetId, payload)
    this.compileFailures.delete(failureCacheKey)
    this.watchWidgetFile(plugin, feature, source.filePath)
    if (isDev) {
      plugin.logger.info(
        `[WidgetManager] Widget ${options?.emitAsUpdate ? 'update' : 'register'} sent: ${source.widgetId}`
      )
    }
    return payload
  }

  async unregisterWidget(widgetId: string): Promise<void> {
    const targets = this.getWidgetWindowIds()
    targets.forEach((windowId) => {
      this.transport.broadcastToWindow(windowId, pluginWidgetUnregisterEvent, { widgetId })
    })
  }

  async releasePlugin(pluginName: string): Promise<void> {
    const watcherKeys = Array.from(this.watchers.keys())
    for (const key of watcherKeys) {
      if (!key.startsWith(`${pluginName}::`)) continue
      const watcher = this.watchers.get(key)
      if (watcher) {
        await watcher.close()
      }
      this.watchers.delete(key)
    }

    const widgetIds = Array.from(this.cache.keys()).filter((id) => {
      const payload = this.cache.get(id)
      return payload?.pluginName === pluginName
    })
    Array.from(this.compileFailures.entries()).forEach(([key, failure]) => {
      if (failure.payload.pluginName === pluginName) {
        this.compileFailures.delete(key)
      }
    })

    await Promise.all(
      widgetIds.map(async (widgetId) => {
        this.cache.delete(widgetId)
        await this.unregisterWidget(widgetId)
      })
    )
  }

  private async emitPayload(event: WidgetEvent, payload: WidgetRegistrationPayload): Promise<void> {
    const eventHandler = event === 'update' ? pluginWidgetUpdateEvent : pluginWidgetRegisterEvent
    const targets = this.getWidgetWindowIds()
    targets.forEach((windowId) => {
      this.transport.broadcastToWindow(windowId, eventHandler, payload)
    })
  }

  private async emitFailure(payload: WidgetFailurePayload): Promise<void> {
    const targets = this.getWidgetWindowIds()
    targets.forEach((windowId) => {
      this.transport.broadcastToWindow(windowId, pluginWidgetFailedEvent, payload)
    })
  }

  private getFailureCacheKey(widgetId: string, hash: string): string {
    return `${widgetId}:${hash}`
  }

  private getCachedFailure(cacheKey: string): WidgetFailurePayload | null {
    const cached = this.compileFailures.get(cacheKey)
    if (!cached) return null
    if (cached.expiresAt <= Date.now()) {
      this.compileFailures.delete(cacheKey)
      return null
    }
    return cached.payload
  }

  private cacheFailure(cacheKey: string, payload: WidgetFailurePayload): void {
    this.compileFailures.set(cacheKey, {
      expiresAt: Date.now() + WIDGET_FAILURE_CACHE_TTL_MS,
      payload
    })
  }

  private buildFailurePayload(
    plugin: ITouchPlugin,
    feature: IPluginFeature,
    failure: {
      widgetId: string
      code: string
      message: string
      filePath?: string | null
      hash?: string
      cause?: string
    }
  ): WidgetFailurePayload {
    return {
      widgetId: failure.widgetId,
      pluginName: plugin.name,
      featureId: feature.id,
      code: failure.code,
      message: failure.message,
      filePath: failure.filePath ?? undefined,
      hash: failure.hash,
      cause: failure.cause
    }
  }

  private buildFailurePayloadFromLatestIssue(
    plugin: ITouchPlugin,
    feature: IPluginFeature,
    context: {
      widgetId: string
      filePath?: string
      hash?: string
    }
  ): WidgetFailurePayload {
    const source = `feature:${feature.id}`
    const issue = [...plugin.issues]
      .reverse()
      .find((item) => item.source === source && item.code?.startsWith('WIDGET_'))

    return this.buildFailurePayload(plugin, feature, {
      ...context,
      code: issue?.code ?? 'WIDGET_COMPILE_FAILED',
      message: issue?.message ?? `Widget compile failed for feature "${feature.id}".`,
      cause: typeof issue?.meta?.causeCode === 'string' ? issue.meta.causeCode : undefined
    })
  }

  private pushFailureIssue(
    plugin: ITouchPlugin,
    feature: IPluginFeature,
    failure: WidgetFailurePayload
  ): void {
    pushWidgetFeatureIssue(plugin, feature, {
      code: failure.code,
      message: failure.message,
      meta: {
        pluginName: failure.pluginName,
        featureId: failure.featureId,
        widgetId: failure.widgetId,
        filePath: failure.filePath,
        hash: failure.hash,
        causeCode: failure.cause
      }
    })
  }

  private buildAndPushFailure(
    plugin: ITouchPlugin,
    feature: IPluginFeature,
    failure: {
      widgetId: string
      code: string
      message: string
      filePath?: string | null
      hash?: string
      cause?: string
    }
  ): WidgetFailurePayload {
    const payload = this.buildFailurePayload(plugin, feature, failure)
    this.pushFailureIssue(plugin, feature, payload)
    return payload
  }

  private watchWidgetFile(plugin: ITouchPlugin, feature: IPluginFeature, filePath: string): void {
    if (/^https?:\/\//i.test(filePath)) {
      plugin.logger.debug(
        `[WidgetManager] Skip watching remote widget "${feature.id}" at ${filePath}`
      )
      return
    }

    const watcherKey = `${plugin.name}::${feature.id}`
    if (this.watchers.has(watcherKey)) {
      this.watchers.get(watcherKey)?.add(filePath)
      return
    }

    // Optimize for dev mode: faster polling and stability threshold
    const isDev = plugin.dev?.enable && plugin.dev?.source
    const pollInterval = isDev ? 100 : 300
    const stabilityThreshold = isDev ? 50 : 200

    const watcher = chokidar.watch(filePath, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold,
        pollInterval
      }
    })

    // Log dev mode watching
    if (isDev) {
      plugin.logger.info(
        `[WidgetManager] 🔥 Dev mode: watching widget "${feature.id}" at ${filePath}`
      )
    }

    watcher.on('change', () => {
      if (isDev) {
        plugin.logger.info(`[WidgetManager] ♻️  Widget "${feature.id}" changed, recompiling...`)
      }
      void this.handleWidgetFileChange(plugin, feature)
    })
    watcher.on('add', () => {
      void this.handleWidgetFileChange(plugin, feature)
    })
    watcher.on('unlink', () => {
      void this.handleWidgetFileRemoved(plugin, feature)
    })

    this.watchers.set(watcherKey, watcher)
  }

  private async handleWidgetFileChange(
    plugin: ITouchPlugin,
    feature: IPluginFeature
  ): Promise<void> {
    await this.registerWidget(plugin, feature, { emitAsUpdate: true })
  }

  private async handleWidgetFileRemoved(
    plugin: ITouchPlugin,
    feature: IPluginFeature
  ): Promise<void> {
    const widgetId = makeWidgetId(plugin.name, feature.id)
    this.cache.delete(widgetId)
    await this.unregisterWidget(widgetId)
  }
}

export const widgetManager = new WidgetManager()
