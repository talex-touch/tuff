import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { ITouchChannel } from '@talex-touch/utils/channel'
import type { FSWatcher } from 'chokidar'
import { ChannelType } from '@talex-touch/utils/channel'
import { genTouchChannel } from '../../../core/channel-core'
import chokidar from 'chokidar'
import { WidgetRegistrationPayload, makeWidgetId } from '@talex-touch/utils/plugin/widget'
import { pluginWidgetLoader } from './widget-loader'
import { compileWidgetSource } from './widget-compiler'

type WidgetEvent = 'plugin:widget:register' | 'plugin:widget:update'

export class WidgetManager {
  private readonly cache = new Map<string, WidgetRegistrationPayload>()
  private readonly watchers = new Map<string, FSWatcher>()

  private get channel(): ITouchChannel {
    return genTouchChannel()
  }

  async registerWidget(
    plugin: ITouchPlugin,
    feature: IPluginFeature,
    options?: { emitAsUpdate?: boolean },
  ): Promise<WidgetRegistrationPayload | null> {
    const source = await pluginWidgetLoader.loadWidget(plugin, feature)
    if (!source)
      return null

    const cached = this.cache.get(source.widgetId)
    if (cached && cached.hash === source.hash) {
      if (options?.emitAsUpdate) {
        await this.emitPayload('plugin:widget:update', cached)
      }
      return cached
    }

    let compiled
    try {
      compiled = await compileWidgetSource(source)
    }
    catch (error) {
      plugin.logger.error('[WidgetManager] 编译 widget 失败：', error as Error)
      this.pushIssue(plugin, feature, 'WIDGET_COMPILE_FAILED', `${(error as Error).message ?? 'unknown error'}`)
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
    }

    try {
      await this.emitPayload(
        options?.emitAsUpdate ? 'plugin:widget:update' : 'plugin:widget:register',
        payload,
      )
    }
    catch (error) {
      plugin.logger.error('[WidgetManager] 发送 widget 注册事件失败：', error as Error)
      this.pushIssue(plugin, feature, 'WIDGET_REGISTER_FAILED', `${(error as Error).message ?? 'send failed'}`)
      return null
    }

    this.cache.set(source.widgetId, payload)
    this.watchWidgetFile(plugin, feature, source.filePath)
    return payload
  }

  async unregisterWidget(widgetId: string): Promise<void> {
    await this.channel.send(ChannelType.MAIN, 'plugin:widget:unregister', { widgetId })
  }

  async releasePlugin(pluginName: string): Promise<void> {
    const watcherKeys = Array.from(this.watchers.keys())
    for (const key of watcherKeys) {
      if (!key.startsWith(`${pluginName}::`))
        continue
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

    await Promise.all(widgetIds.map(async (widgetId) => {
      this.cache.delete(widgetId)
      await this.unregisterWidget(widgetId)
    }))
  }

  private async emitPayload(event: WidgetEvent, payload: WidgetRegistrationPayload): Promise<void> {
    await this.channel.send(ChannelType.MAIN, event, payload)
  }

  private pushIssue(plugin: ITouchPlugin, feature: IPluginFeature, code: string, message: string): void {
    plugin.issues.push({
      type: 'error',
      code,
      message,
      source: `feature:${feature.id}`,
      timestamp: Date.now(),
    })
  }

  private watchWidgetFile(plugin: ITouchPlugin, feature: IPluginFeature, filePath: string): void {
    const watcherKey = `${plugin.name}::${feature.id}`
    if (this.watchers.has(watcherKey)) {
      this.watchers.get(watcherKey)?.add(filePath)
      return
    }

    const watcher = chokidar.watch(filePath, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    })

    watcher.on('change', () => {
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

  private async handleWidgetFileChange(plugin: ITouchPlugin, feature: IPluginFeature): Promise<void> {
    await this.registerWidget(plugin, feature, { emitAsUpdate: true })
  }

  private async handleWidgetFileRemoved(plugin: ITouchPlugin, feature: IPluginFeature): Promise<void> {
    const widgetId = makeWidgetId(plugin.name, feature.id)
    this.cache.delete(widgetId)
    await this.unregisterWidget(widgetId)
  }
}

export const widgetManager = new WidgetManager()
