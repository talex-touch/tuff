import type { ITouchChannel } from '@talex-touch/utils/channel'
import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { WidgetRegistrationPayload } from '@talex-touch/utils/plugin/widget'
import type { FSWatcher } from 'chokidar'
import type { WidgetCompilationContext } from './widget-processor'
import { makeWidgetId } from '@talex-touch/utils/plugin/widget'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import chokidar from 'chokidar'
import fse from 'fs-extra'
import { genTouchApp } from '../../../core'
import { compileWidgetSource } from './widget-compiler'
import { pluginWidgetLoader, resolveWidgetFilePath } from './widget-loader'

type WidgetEvent = 'register' | 'update'

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

const resolveKeyManager = (channel: { keyManager?: unknown }): unknown =>
  channel.keyManager ?? channel

export class WidgetManager {
  private readonly cache = new Map<string, WidgetRegistrationPayload>()
  private readonly watchers = new Map<string, FSWatcher>()

  private get transport() {
    const app = genTouchApp()
    const channel: ITouchChannel = app.channel
    const keyManager = resolveKeyManager(channel as { keyManager?: unknown })
    return getTuffTransportMain(channel, keyManager)
  }

  private get mainWindowId(): number {
    return genTouchApp().window.window.id
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

    if (interactionPath) {
      const sourceHint: WidgetSourceHint = { widgetId }
      if (!isDev) {
        const resolvedFilePath = resolveWidgetFilePath(plugin.pluginPath, interactionPath)
        if (resolvedFilePath) {
          sourceHint.filePath = resolvedFilePath
        }
      }

      const canUseCompiled = isDev || Boolean(sourceHint.filePath)
      if (canUseCompiled) {
        const compiledCache = await loadCompiledWidgetCache(plugin, sourceHint, Boolean(isDev))
        if (compiledCache) {
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
            plugin.logger.error('[WidgetManager] 发送 widget 注册事件失败：', error as Error)
            this.pushIssue(
              plugin,
              feature,
              'WIDGET_REGISTER_FAILED',
              `${(error as Error).message ?? 'send failed'}`
            )
            return null
          }

          this.cache.set(widgetId, payload)
          this.watchWidgetFile(plugin, feature, payload.filePath)
          if (isDev) {
            plugin.logger.info(
              `[WidgetManager] Widget ${options?.emitAsUpdate ? 'update' : 'register'} sent from compiled cache: ${widgetId}`
            )
          }
          return payload
        }
      }
    }

    const source = await pluginWidgetLoader.loadWidget(plugin, feature)
    if (!source) {
      if (isDev) {
        plugin.logger.warn(`[WidgetManager] Widget source missing for feature \"${feature.id}\"`)
      }
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
        plugin.logger.error('[WidgetManager] 发送 widget 注册事件失败：', error as Error)
        this.pushIssue(
          plugin,
          feature,
          'WIDGET_REGISTER_FAILED',
          `${(error as Error).message ?? 'send failed'}`
        )
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
      plugin.logger.error('[WidgetManager] 编译 widget 失败：', error as Error)
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_COMPILE_FAILED',
        `${(error as Error).message ?? 'unknown error'}`
      )
      return null
    }

    // Check if compilation returned null (validation failed)
    if (!compiled) {
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
      plugin.logger.error('[WidgetManager] 发送 widget 注册事件失败：', error as Error)
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_REGISTER_FAILED',
        `${(error as Error).message ?? 'send failed'}`
      )
      return null
    }

    this.cache.set(source.widgetId, payload)
    this.watchWidgetFile(plugin, feature, source.filePath)
    if (isDev) {
      plugin.logger.info(
        `[WidgetManager] Widget ${options?.emitAsUpdate ? 'update' : 'register'} sent: ${source.widgetId}`
      )
    }
    return payload
  }

  async unregisterWidget(widgetId: string): Promise<void> {
    this.transport.broadcastToWindow(this.mainWindowId, pluginWidgetUnregisterEvent, { widgetId })
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

    await Promise.all(
      widgetIds.map(async (widgetId) => {
        this.cache.delete(widgetId)
        await this.unregisterWidget(widgetId)
      })
    )
  }

  private async emitPayload(event: WidgetEvent, payload: WidgetRegistrationPayload): Promise<void> {
    const eventHandler = event === 'update' ? pluginWidgetUpdateEvent : pluginWidgetRegisterEvent
    this.transport.broadcastToWindow(this.mainWindowId, eventHandler, payload)
  }

  private pushIssue(
    plugin: ITouchPlugin,
    feature: IPluginFeature,
    code: string,
    message: string
  ): void {
    plugin.issues.push({
      type: 'error',
      code,
      message,
      source: `feature:${feature.id}`,
      timestamp: Date.now()
    })
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
