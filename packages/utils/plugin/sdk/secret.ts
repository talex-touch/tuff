import { createPluginTuffTransport } from '../../transport'
import { PluginEvents } from '../../transport/events'
import { ensureRendererChannel } from './channel'
import { usePluginName } from './plugin-info'

/**
 * Access secure per-plugin values.
 */
export function usePluginSecret() {
  const pluginName = usePluginName('[Plugin Secret] Cannot determine plugin name. Make sure this is called in a plugin context.')
  const channel = ensureRendererChannel('[Plugin Secret] Channel not available. Make sure this is called in a plugin context.')
  const transport = createPluginTuffTransport(channel as any)

  return {
    get: async (key: string): Promise<string | null> => {
      return transport.send(PluginEvents.storage.getSecret, { pluginName, key })
    },

    set: async (key: string, value: string | null): Promise<{ success: boolean, error?: string }> => {
      return transport.send(PluginEvents.storage.setSecret, { pluginName, key, value })
    },

    delete: async (key: string): Promise<{ success: boolean, error?: string }> => {
      return transport.send(PluginEvents.storage.deleteSecret, { pluginName, key })
    },
  }
}
