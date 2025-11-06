import { IPluginFeature } from '@talex-touch/utils/plugin'
import path from 'path'
import { coreBoxManager } from '../../box-tool/core-box/manager'
import { TouchPlugin } from '../plugin'

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

      // 检查 interactionPath 是否已经是文件路径（包含文件扩展名）
      const hasFileExtension = /\.(html|htm|php|asp|aspx)$/i.test(interactionPath)

      if (hasFileExtension) {
        // 如果已经是文件路径，直接使用
        const viewPath = path.join(plugin.pluginPath, interactionPath)
        viewUrl = 'file://' + viewPath
        console.log(`[PluginViewLoader] Loading file path: ${viewUrl}`)
      } else {
        // 如果是路由路径，拼接 index.html#<path>
        const indexPath = path.join(plugin.pluginPath, 'index.html')
        // 确保 interactionPath 以 / 开头作为 hash 路由
        const hashPath = interactionPath.startsWith('/') ? interactionPath : '/' + interactionPath
        viewUrl = 'file://' + indexPath + '#' + hashPath
        console.log(`[PluginViewLoader] Loading route path: ${viewUrl} (hash: ${hashPath})`)
      }
    }

    coreBoxManager.enterUIMode(viewUrl, plugin, feature)
    return
  }
}
