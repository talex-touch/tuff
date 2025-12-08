import type { TuffQuery } from '@talex-touch/utils'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { TouchPlugin } from '../plugin'
import path from 'node:path'
import { coreBoxManager } from '../../box-tool/core-box/manager'

export class PluginViewLoader {
  public static async loadPluginView(
    plugin: TouchPlugin,
    feature: IPluginFeature,
    query?: TuffQuery | string,
  ): Promise<void | null> {
    const interactionPath = feature.interaction?.path

    if (!interactionPath) {
      console.error(`[PluginViewLoader] Feature ${feature.id} has interaction but no path.`)
      return null
    }

    let viewUrl: string

    if (plugin.dev.enable && plugin.dev.source && plugin.dev.address) {
      // Dev mode: load from remote dev server
      viewUrl = new URL(interactionPath, plugin.dev.address).toString()
    }
    else {
      // Production mode: load from local file system
      if (interactionPath.includes('..')) {
        console.error(
          `[PluginViewLoader] Security Alert: Aborted loading view with invalid path: ${interactionPath}`,
        )
        plugin.issues.push({
          type: 'error',
          code: 'INVALID_VIEW_PATH',
          message: `Interaction path cannot contain '..'.`,
          source: `feature:${feature.id}`,
          timestamp: Date.now(),
        })
        return null
      }

      const hasFileExtension = /\.(html|htm|php|asp|aspx)$/i.test(interactionPath)

      if (hasFileExtension) {
        const viewPath = path.join(plugin.pluginPath, interactionPath)
        viewUrl = `file://${viewPath}`
      }
      else {
        // Route path: use hash routing with index.html
        const indexPath = path.join(plugin.pluginPath, 'index.html')
        const hashPath = interactionPath.startsWith('/') ? interactionPath : `/${interactionPath}`
        viewUrl = `file://${indexPath}#${hashPath}`
      }
      console.log(`[PluginViewLoader] Loading view: ${viewUrl}`)
    }

    coreBoxManager.enterUIMode(viewUrl, plugin, feature, query)
  }
}
