import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { WidgetRuntime } from '@talex-touch/utils/plugin/widget'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { makeWidgetId, resolveWidgetRuntime } from '@talex-touch/utils/plugin/widget'
import { app } from 'electron'
import fse from 'fs-extra'
import { getNetworkService } from '../../network'
import { pushWidgetFeatureIssue } from './widget-issue'

export interface WidgetSource {
  widgetId: string
  pluginName: string
  featureId: string
  runtime: WidgetRuntime
  source: string
  filePath: string
  hash: string
  loadedAt: number
}

const WIDGET_ROOT = 'widgets'
const ARROW_WIDGET_SOURCE_PATTERN = /\.arrow\.(ts|js)$/i

export function isLoopbackWidgetDevOrigin(devAddress: string): boolean {
  try {
    const parsed = new URL(devAddress)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

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

export function resolveWidgetRuntimeFromFeature(feature: IPluginFeature): WidgetRuntime {
  const declared = resolveWidgetRuntime(feature.interaction?.runtime)
  if (declared !== 'vue') {
    return declared
  }
  return ARROW_WIDGET_SOURCE_PATTERN.test(feature.interaction?.path ?? '') ? 'arrow' : 'vue'
}

export class WidgetLoader {
  private readonly cache = new Map<string, WidgetSource>()

  async loadWidget(plugin: ITouchPlugin, feature: IPluginFeature): Promise<WidgetSource | null> {
    const interactionPath = feature.interaction?.path
    if (!interactionPath) {
      this.pushIssue(plugin, feature, 'WIDGET_PATH_MISSING', 'widget interaction path is missing.')
      return null
    }

    const wantsDevSource = Boolean(plugin.dev?.enable && plugin.dev?.source)
    if (wantsDevSource && app?.isPackaged) {
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_DEV_SOURCE_BLOCKED_IN_PACKAGED',
        'Remote widget dev.source is disabled in packaged builds.'
      )
    } else if (wantsDevSource) {
      if (!plugin.dev?.address) {
        this.pushIssue(
          plugin,
          feature,
          'WIDGET_DEV_ADDRESS_MISSING',
          'dev.source is enabled but dev.address is missing.'
        )
        return null
      }
      if (!isLoopbackWidgetDevOrigin(plugin.dev.address)) {
        this.pushIssue(
          plugin,
          feature,
          'WIDGET_DEV_ADDRESS_INVALID',
          'dev.address must use an exact loopback HTTP(S) origin.'
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
      const widgetsRootReal = await fs.realpath(path.resolve(plugin.pluginPath, WIDGET_ROOT))
      const widgetFileReal = await fs.realpath(widgetFile)
      const rel = path.relative(widgetsRootReal, widgetFileReal)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        this.pushIssue(
          plugin,
          feature,
          'WIDGET_PATH_INVALID',
          `widget path "${interactionPath}" resolves outside widgets directory.`
        )
        return null
      }
    } catch {
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_PATH_INVALID',
        `widget path "${interactionPath}" could not be canonicalized.`
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
        runtime: resolveWidgetRuntimeFromFeature(feature),
        source,
        filePath: widgetFile,
        hash,
        loadedAt: Date.now()
      }

      this.cache.set(widgetId, result)
      return result
    } catch (error) {
      plugin.logger.debug(
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
    if (app?.isPackaged || !isLoopbackWidgetDevOrigin(devAddress)) {
      this.pushIssue(
        plugin,
        feature,
        'WIDGET_DEV_ADDRESS_INVALID',
        'Remote widget dev.source requires an unpackaged build and a loopback origin.'
      )
      return null
    }

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
      if (fetchUrl.origin !== new URL(devAddress).origin) {
        this.pushIssue(
          plugin,
          feature,
          'WIDGET_REMOTE_PATH_INVALID',
          'Resolved widget dev URL origin does not match dev.address.'
        )
        return null
      }
      fetchUrl.searchParams.set('raw', '1')
      const response = await getNetworkService().requestNoRedirect<string>({
        method: 'GET',
        url: fetchUrl.toString(),
        timeoutMs: 2000,
        responseType: 'text',
        retryPolicy: { maxRetries: 0 },
        cooldownPolicy: {
          key: `plugin-widget:${plugin.name}:${feature.id}:${fetchUrl.toString()}`,
          failureThreshold: 1,
          cooldownMs: 3000,
          autoResetOnSuccess: true
        }
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
        runtime: resolveWidgetRuntimeFromFeature(feature),
        source,
        filePath: widgetUrl,
        hash,
        loadedAt: Date.now()
      }

      this.cache.set(widgetId, result)
      return result
    } catch (error) {
      plugin.logger.debug(
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

  invalidateWidget(widgetId: string): void {
    this.cache.delete(widgetId)
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
    pushWidgetFeatureIssue(plugin, feature, {
      code,
      message
    })
  }
}

export const pluginWidgetLoader = new WidgetLoader()
