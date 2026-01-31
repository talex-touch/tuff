import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import axios from 'axios'
import crypto from 'node:crypto'
import path from 'node:path'
import { makeWidgetId } from '@talex-touch/utils/plugin/widget'
import fse from 'fs-extra'

export interface WidgetSource {
  widgetId: string
  pluginName: string
  featureId: string
  source: string
  filePath: string
  hash: string
  loadedAt: number
}

const WIDGET_ROOT = 'widgets'

export function resolveWidgetFilePath(pluginPath: string, rawPath: string): string | null {
  const widgetsDir = path.resolve(pluginPath, WIDGET_ROOT)
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized) {
    return null
  }

  const candidate = path.resolve(widgetsDir, normalized)
  const relative = path.relative(widgetsDir, candidate)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }

  return path.extname(candidate) ? candidate : `${candidate}.vue`
}

export class WidgetLoader {
  private readonly cache = new Map<string, WidgetSource>()

  async loadWidget(plugin: ITouchPlugin, feature: IPluginFeature): Promise<WidgetSource | null> {
    const interactionPath = feature.interaction?.path
    if (!interactionPath) {
      this.pushIssue(plugin, feature, 'WIDGET_PATH_MISSING', 'widget interaction path is missing.')
      return null
    }

    const isDevSource = Boolean(plugin.dev?.enable && plugin.dev?.source)
    if (isDevSource) {
      if (!plugin.dev?.address) {
        this.pushIssue(
          plugin,
          feature,
          'WIDGET_DEV_ADDRESS_MISSING',
          'dev.source is enabled but dev.address is missing.'
        )
        return null
      }
      return this.loadRemoteWidget(plugin, feature, interactionPath, plugin.dev.address)
    }

    const widgetFile = this.resolveWidgetFile(plugin.pluginPath, interactionPath)
    if (!widgetFile) {
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_PATH_INVALID',
        `widget path "${interactionPath}" is invalid or outside widgets directory.`
      )
      return null
    }

    if (!(await fse.pathExists(widgetFile))) {
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_NOT_FOUND',
        `widget source "${interactionPath}" does not exist.`
      )
      return null
    }

    try {
      const source = await fse.readFile(widgetFile, 'utf-8')
      const hash = this.hashContent(source)
      const widgetId = makeWidgetId(plugin.name, feature.id)
      const cached = this.cache.get(widgetId)

      if (cached && cached.hash === hash && cached.filePath === widgetFile) {
        return cached
      }

      const result: WidgetSource = {
        widgetId,
        pluginName: plugin.name,
        featureId: feature.id,
        source,
        filePath: widgetFile,
        hash,
        loadedAt: Date.now()
      }

      this.cache.set(widgetId, result)
      return result
    } catch (error) {
      plugin.logger.error(
        `[WidgetLoader] Failed to read widget from ${widgetFile}:`,
        error as Error
      )
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_READ_FAILED',
        `failed to read widget source: ${(error as Error).message}`
      )
      return null
    }
  }

  private async loadRemoteWidget(
    plugin: ITouchPlugin,
    feature: IPluginFeature,
    interactionPath: string,
    devAddress: string
  ): Promise<WidgetSource | null> {
    const widgetUrl = this.resolveRemoteWidgetUrl(devAddress, interactionPath)
    if (!widgetUrl) {
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_REMOTE_PATH_INVALID',
        `widget path "${interactionPath}" is invalid for dev source mode.`
      )
      return null
    }

    try {
      const fetchUrl = new URL(widgetUrl)
      fetchUrl.searchParams.set('raw', '1')
      const response = await axios.get(fetchUrl.toString(), {
        timeout: 2000,
        proxy: false,
        responseType: 'text'
      })
      const source = typeof response.data === 'string' ? response.data : String(response.data ?? '')
      const hash = this.hashContent(source)
      const widgetId = makeWidgetId(plugin.name, feature.id)
      const cached = this.cache.get(widgetId)

      if (cached && cached.hash === hash && cached.filePath === widgetUrl) {
        return cached
      }

      const result: WidgetSource = {
        widgetId,
        pluginName: plugin.name,
        featureId: feature.id,
        source,
        filePath: widgetUrl,
        hash,
        loadedAt: Date.now()
      }

      this.cache.set(widgetId, result)
      return result
    } catch (error) {
      plugin.logger.error(
        `[WidgetLoader] Failed to fetch widget from ${widgetUrl}:`,
        error as Error
      )
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_REMOTE_FETCH_FAILED',
        `failed to fetch widget source: ${(error as Error).message}`
      )
      return null
    }
  }

  getCachedWidget(widgetId: string): WidgetSource | undefined {
    return this.cache.get(widgetId)
  }

  private resolveRemoteWidgetUrl(devAddress: string, rawPath: string): string | null {
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '')
    if (!normalized) {
      return null
    }

    const candidate = path.posix.normalize(path.posix.join(WIDGET_ROOT, normalized))
    const relative = path.posix.relative(WIDGET_ROOT, candidate)
    if (relative.startsWith('..') || path.posix.isAbsolute(relative)) {
      return null
    }

    const resolvedPath = path.posix.extname(candidate) ? candidate : `${candidate}.vue`
    return new URL(resolvedPath, devAddress).toString()
  }

  private resolveWidgetFile(pluginPath: string, rawPath: string): string | null {
    return resolveWidgetFilePath(pluginPath, rawPath)
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex')
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
}

export const pluginWidgetLoader = new WidgetLoader()
