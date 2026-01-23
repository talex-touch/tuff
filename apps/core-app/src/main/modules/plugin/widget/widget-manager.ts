import type { ITouchChannel } from '@talex-touch/utils/channel'
import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { WidgetRegistrationPayload } from '@talex-touch/utils/plugin/widget'
import type { FSWatcher } from 'chokidar'
import type { WidgetCompilationContext } from './widget-processor'
import { makeWidgetId } from '@talex-touch/utils/plugin/widget'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import chokidar from 'chokidar'
import { genTouchApp } from '../../../core'
import { compileWidgetSource } from './widget-compiler'
import { pluginWidgetLoader } from './widget-loader'

type WidgetEvent = 'plugin:widget:register' | 'plugin:widget:update'
const pluginWidgetRegisterEvent = defineRawEvent<WidgetRegistrationPayload, void>(
  'plugin:widget:register'
)
const pluginWidgetUpdateEvent = defineRawEvent<WidgetRegistrationPayload, void>(
  'plugin:widget:update'
)
const pluginWidgetUnregisterEvent = defineRawEvent<{ widgetId: string }, void>(
  'plugin:widget:unregister'
)

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
    const source = await pluginWidgetLoader.loadWidget(plugin, feature)
    if (!source) return null

    const cached = this.cache.get(source.widgetId)
    if (cached && cached.hash === source.hash) {
      if (options?.emitAsUpdate) {
        await this.emitPayload('plugin:widget:update', cached)
      }
      return cached
    }

    // Prepare compilation context
    const context: WidgetCompilationContext = {
      plugin,
      feature
    }

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
      await this.emitPayload(
        options?.emitAsUpdate ? 'plugin:widget:update' : 'plugin:widget:register',
        payload
      )
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
    return payload
  }

  async unregisterWidget(widgetId: string): Promise<void> {
    await this.transport.sendToWindow(this.mainWindowId, pluginWidgetUnregisterEvent, { widgetId })
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
    const eventHandler =
      event === 'plugin:widget:update' ? pluginWidgetUpdateEvent : pluginWidgetRegisterEvent
    await this.transport.sendToWindow(this.mainWindowId, eventHandler, payload)
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
