import { useChannel } from './channel'
import { usePluginName } from './plugin-info'

function ensurePluginContext(): { channel: ReturnType<typeof useChannel>, pluginName: string } {
  const pluginName = usePluginName('[TouchSDK] Unable to resolve plugin name inside renderer context.')
  const channel = useChannel('[TouchSDK] Channel bridge is not available for the current plugin renderer.')

  return { channel, pluginName }
}

/**
 * Clears all CoreBox items associated with the current plugin.
 */
export async function clearCoreBoxItems(): Promise<void> {
  const { channel, pluginName } = ensurePluginContext()
  await channel.send('core-box:clear-items', { pluginName })
}
