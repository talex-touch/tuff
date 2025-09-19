import { IPluginFeature } from '@talex-touch/utils/plugin'
import path from 'path'
import { coreBoxManager } from '../box-tool/core-box/manager'
import { TouchPlugin } from '../../plugins'

export class PluginViewLoader {
  public static async loadPluginView(
    plugin: TouchPlugin,
    feature: IPluginFeature
  ): Promise<void | null> {
    const interactionPath = feature.interaction?.path

    if (!interactionPath) {
      console.error(`[PluginViewLoader] Feature ${feature.id} has interaction but no path.`)
      // Consider adding to plugin.issues if appropriate
      return null
    }

    let viewUrl: string

    if (plugin.dev.enable && plugin.dev.source && plugin.dev.address) {
      // Dev source mode: load from remote dev server (Behavior 1)
      viewUrl = new URL(interactionPath, plugin.dev.address).toString()
    } else {
      // Production or local dev mode: load from local file system (Behavior 1)
      if (interactionPath.includes('..')) {
        console.error(
          `[PluginViewLoader] Security Alert: Aborted loading view with invalid path: ${interactionPath}`
        )
        plugin.issues.push({
          type: 'error',
          code: 'INVALID_VIEW_PATH',
          message: `Interaction path cannot contain '..'.`,
          source: `feature:${feature.id}`,
          timestamp: Date.now()
        })
        return null
      }
      const viewPath = path.join(plugin.pluginPath, interactionPath)
      viewUrl = 'file://' + viewPath
    }

    coreBoxManager.enterUIMode(viewUrl, plugin, feature)
    return
  }
}
