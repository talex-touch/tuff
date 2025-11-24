import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import { makeWidgetId } from '@talex-touch/utils/plugin/widget'
import crypto from 'node:crypto'
import path from 'node:path'
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

export class WidgetLoader {
  private readonly cache = new Map<string, WidgetSource>()

  async loadWidget(plugin: ITouchPlugin, feature: IPluginFeature): Promise<WidgetSource | null> {
    const interactionPath = feature.interaction?.path
    if (!interactionPath) {
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_PATH_MISSING',
        'widget interaction path is missing.',
      )
      return null
    }

    const widgetFile = this.resolveWidgetFile(plugin.pluginPath, interactionPath)
    if (!widgetFile) {
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_PATH_INVALID',
        `widget path "${interactionPath}" is invalid or outside widgets directory.`,
      )
      return null
    }

    if (!await fse.pathExists(widgetFile)) {
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_NOT_FOUND',
        `widget source "${interactionPath}" does not exist.`,
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
        loadedAt: Date.now(),
      }

      this.cache.set(widgetId, result)
      return result
    }
    catch (error) {
      plugin.logger.error(`[WidgetLoader] 从 ${widgetFile} 读取 widget 失败：`, error as Error)
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_READ_FAILED',
        `failed to read widget source: ${(error as Error).message}`,
      )
      return null
    }
  }

  getCachedWidget(widgetId: string): WidgetSource | undefined {
    return this.cache.get(widgetId)
  }

  private resolveWidgetFile(pluginPath: string, rawPath: string): string | null {
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

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  private pushIssue(
    plugin: ITouchPlugin,
    feature: IPluginFeature,
    code: string,
    message: string,
  ): void {
    plugin.issues.push({
      type: 'error',
      code,
      message,
      source: `feature:${feature.id}`,
      timestamp: Date.now(),
    })
  }
}

export const pluginWidgetLoader = new WidgetLoader()
