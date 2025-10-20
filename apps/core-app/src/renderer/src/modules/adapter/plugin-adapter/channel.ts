import { touchChannel } from '~/modules/channel/channel-core'
import { usePluginStore } from './store'

export function setupPluginChannel() {
  const pluginStore = usePluginStore()

  const logouts = [
    touchChannel.regChannel('plugin-status-updated', ({ data, reply }: any) => {
      try {
        console.log('[PluginAdapter] Received plugin status update:', data)
        pluginStore.updatePluginStatus(data.plugin, data.status)
        reply(1)
      } catch (error) {
        console.error('[PluginAdapter] Error handling plugin status update:', error)
        reply(0)
      }
    }),
    touchChannel.regChannel('plugin:reload-readme', ({ data, reply }: any) => {
      pluginStore.updatePluginReadme(data.plugin, data.readme)
      reply(1)
    }),
    touchChannel.regChannel('plugin:reload', ({ data, reply }: any) => {
      try {
        console.log('[PluginAdapter] Received plugin reload event:', data)
        pluginStore.reloadPlugin(data.plugin)
        reply(1)
      } catch (error) {
        console.error('[PluginAdapter] Error handling plugin reload:', error)
        reply(0)
      }
    }),
    touchChannel.regChannel('plugin:add', ({ data }: any) => {
      const { plugin } = data
      if (pluginStore.getPlugin(plugin.name)) {
        console.warn('[PluginAdapter] Duplicate plugin set, ignored!', plugin)
        return
      }
      pluginStore.setPlugin(plugin)
    }),
    touchChannel.regChannel('plugin:del', ({ data }: any) => {
      const { plugin } = data
      pluginStore.deletePlugin(plugin)
    })
  ]

  const plugins: object = touchChannel.sendSync('plugin-list')
  if (plugins && typeof plugins === 'object') {
    Object.values(plugins).forEach((value) => pluginStore.setPlugin(value))
  } else {
    console.warn('[PluginAdapter] Failed to load plugin list, received:', plugins)
  }

  return () => {
    logouts.forEach((logout) => logout())
  }
}
