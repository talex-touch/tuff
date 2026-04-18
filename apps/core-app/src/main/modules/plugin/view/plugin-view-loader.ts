import type { TuffQuery } from '@talex-touch/utils'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { TouchPlugin } from '../plugin'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import { createLogger } from '../../../utils/logger'
import { coreBoxManager } from '../../box-tool/core-box/manager'

const viewLog = createLogger('PluginViewLoader')
const REMOTE_PROTOCOLS = new Set(['http:', 'https:'])
const HTML_LIKE_FILE_EXT_RE = /\.(html|htm|php|asp|aspx)$/i

function pushViewIssue(
  plugin: TouchPlugin,
  feature: IPluginFeature,
  code: string,
  message: string,
  suggestion?: string
): void {
  plugin.issues.push({
    type: 'error',
    code,
    message,
    suggestion,
    source: `feature:${feature.id}`,
    timestamp: Date.now()
  })
}

function hasParentTraversal(rawPath: string): boolean {
  return rawPath
    .split(/[\\/]/)
    .map((segment) => segment.trim())
    .some((segment) => segment === '..')
}

function resolveLocalFileViewUrl(pluginRoot: string, interactionPath: string): string | null {
  const normalized = interactionPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized) {
    return null
  }

  const resolved = path.resolve(pluginRoot, normalized)
  const relative = path.relative(pluginRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }

  return pathToFileURL(resolved).href
}

function normalizeHashRoute(interactionPath: string): string | null {
  let routePath = interactionPath.trim()
  if (!routePath) {
    return null
  }

  if (routePath.startsWith('#')) {
    routePath = routePath.slice(1)
  }

  if (!routePath) {
    return '/'
  }

  if (routePath.startsWith('//')) {
    return null
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(routePath)) {
    return null
  }

  return routePath.startsWith('/') ? routePath : `/${routePath}`
}

function normalizeRemoteRoute(interactionPath: string): string | null {
  const routePath = interactionPath.trim()
  if (!routePath) return null
  if (routePath.startsWith('#')) {
    return normalizeHashRoute(routePath)
  }
  if (routePath.startsWith('//')) {
    return null
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(routePath)) {
    return null
  }
  return routePath.startsWith('/') ? routePath : `/${routePath}`
}

export class PluginViewLoader {
  public static async loadPluginView(
    plugin: TouchPlugin,
    feature: IPluginFeature,
    query?: TuffQuery
  ): Promise<void | null> {
    const interactionPath =
      typeof feature.interaction?.path === 'string' ? feature.interaction.path.trim() : ''

    if (!interactionPath) {
      viewLog.error(`Feature ${feature.id} has interaction but no path`)
      pushViewIssue(
        plugin,
        feature,
        'INVALID_VIEW_PATH',
        'Interaction path is empty.',
        'Provide a valid interaction.path in manifest.json.'
      )
      return null
    }

    let viewUrl: string

    if (plugin.dev.enable && plugin.dev.source && plugin.dev.address) {
      let devAddress: URL
      try {
        devAddress = new URL(plugin.dev.address)
      } catch {
        viewLog.error(`Security Alert: invalid dev address for plugin ${plugin.name}`)
        pushViewIssue(
          plugin,
          feature,
          'DEV_ADDRESS_INVALID',
          `Invalid dev.address: "${plugin.dev.address}".`,
          'Use a valid absolute URL for dev.address.'
        )
        return null
      }

      if (app.isPackaged && REMOTE_PROTOCOLS.has(devAddress.protocol)) {
        viewLog.error(`Security: remote protocol blocked in production for plugin ${plugin.name}`)
        pushViewIssue(
          plugin,
          feature,
          'PROTOCOL_NOT_ALLOWED',
          'HTTP(S) protocol is not allowed in production environment.',
          'Disable dev.source in manifest.json for production builds.'
        )
        return null
      }

      const remotePath = normalizeRemoteRoute(interactionPath)
      if (!remotePath) {
        pushViewIssue(
          plugin,
          feature,
          'INVALID_VIEW_PATH',
          `Invalid interaction path for remote view: "${interactionPath}".`
        )
        return null
      }

      // Dev mode: load from remote dev server
      viewUrl = new URL(remotePath, devAddress).toString()
    } else {
      // Production mode: load from local file system
      if (hasParentTraversal(interactionPath)) {
        viewLog.error(`Security Alert: Aborted loading view with invalid path: ${interactionPath}`)
        pushViewIssue(plugin, feature, 'INVALID_VIEW_PATH', `Interaction path cannot contain '..'.`)
        return null
      }

      const pathWithoutHashAndQuery = interactionPath.split(/[?#]/)[0] || ''
      const hasFileExtension = HTML_LIKE_FILE_EXT_RE.test(pathWithoutHashAndQuery)

      if (hasFileExtension) {
        const resolvedFileUrl = resolveLocalFileViewUrl(plugin.pluginPath, interactionPath)
        if (!resolvedFileUrl) {
          pushViewIssue(
            plugin,
            feature,
            'INVALID_VIEW_PATH',
            `Interaction file path is invalid: "${interactionPath}".`
          )
          return null
        }
        viewUrl = resolvedFileUrl
      } else {
        // Route path: use hash routing with index.html
        const indexPath = path.resolve(plugin.pluginPath, 'index.html')
        const hashPath = normalizeHashRoute(interactionPath)
        if (!hashPath) {
          pushViewIssue(
            plugin,
            feature,
            'INVALID_VIEW_PATH',
            `Interaction route is invalid: "${interactionPath}".`
          )
          return null
        }
        viewUrl = `${pathToFileURL(indexPath).href}#${hashPath}`
      }
      viewLog.debug(`Loading view: ${viewUrl}`)
    }

    coreBoxManager.enterUIMode(viewUrl, plugin, feature, query)
  }
}
