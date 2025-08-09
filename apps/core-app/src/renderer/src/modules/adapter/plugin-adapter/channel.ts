import { touchChannel } from '~/modules/channel/channel-core'
import { usePluginStore } from './store'

export function setupPluginChannel() {
  const pluginStore = usePluginStore()

  const logouts = [
    touchChannel.regChannel('plugin-status-updated', ({ data, reply }: any) => {
      pluginStore.updatePluginStatus(data.plugin, data.status)
      reply(1)
    }),
    touchChannel.regChannel('plugin:reload-readme', ({ data, reply }: any) => {
      pluginStore.updatePluginReadme(data.plugin, data.readme)
      reply(1)
    }),
    touchChannel.regChannel('plugin:reload', ({ data, reply }: any) => {
      pluginStore.reloadPlugin(data.plugin)
      reply(1)
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
  Object.values(plugins).forEach((value) => pluginStore.setPlugin(value))

  return () => {
    logouts.forEach((logout) => logout())
  }
}
